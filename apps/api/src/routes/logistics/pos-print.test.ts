import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from "vitest";
import { SignJWT, createLocalJWKSet, exportJWK, generateKeyPair, type JWK, type KeyLike } from "jose";
import { http, passthrough } from "msw";
import { PDFParse } from "pdf-parse";
import app from "../../index";
import { _setJwksForTesting } from "../../middleware/auth";
import { server } from "../../test/server";

// Mirror orders-print-do.test.ts: route reads po/lines/skus via the
// user-scoped supabase client, so we mock userClient and feed the same
// table-dispatcher pattern.
vi.mock("../../lib/supabase", () => ({
  userClient: vi.fn(),
}));

import { userClient } from "../../lib/supabase";

const SUPABASE_URL = "https://test.supabase.co";
const KID = "test-kid-1";
const PO_ID = "PO-9801";

const env = {
  SUPABASE_URL,
  SUPABASE_ANON_KEY: "test-anon",
  SUPABASE_SERVICE_ROLE_KEY: "test-service",
  SUPABASE_JWT_SECRET: "unused",
};

let signKey: KeyLike;
let publicJwk: JWK;

async function makeJwt(role: string) {
  return new SignJWT({
    email: `${role}@carres.com`,
    app_metadata: { role },
  })
    .setProtectedHeader({ alg: "ES256", kid: KID, typ: "JWT" })
    .setSubject("11111111-1111-1111-1111-000000000999")
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(signKey);
}

beforeAll(async () => {
  const kp = await generateKeyPair("ES256", { extractable: true });
  signKey = kp.privateKey;
  publicJwk = await exportJWK(kp.publicKey);
  publicJwk.kid = KID;
  publicJwk.alg = "ES256";
  publicJwk.use = "sig";
});

beforeEach(() => {
  _setJwksForTesting(createLocalJWKSet({ keys: [publicJwk] }));
  vi.mocked(userClient).mockReset();
  // @react-pdf/renderer fetches Noto Sans SC TTFs from jsdelivr at first
  // render. setup.ts uses onUnhandledRequest:"error", so passthrough is
  // required — same as render.test.ts and orders-print-do.test.ts.
  server.use(
    http.get("https://cdn.jsdelivr.net/fontsource/fonts/noto-sans-sc@latest/*", () => passthrough()),
  );
});

afterAll(() => _setJwksForTesting(null));

// Build a happy-path purchase_orders row matching the route's select
// projection (with embedded supplier + warehouse).
function makePoRow(overrides: Record<string, unknown> = {}) {
  return {
    id: PO_ID,
    status: "open",
    sup_status: "pending",
    dl: 4001,
    dl_refs: null,
    eta_date: "2026-06-01",
    placed_at: "2026-05-04T08:00:00Z",
    supplier_id: "00000000-0000-0000-0000-000000000s01",
    warehouse_id: "00000000-0000-0000-0000-000000000w01",
    suppliers: { name: "Acme Furniture Sdn Bhd", contact: "+60 3-1234 5678" },
    warehouses: { name: "KL HQ", address: "1 Persiaran Test, KL" },
    ...overrides,
  };
}

// Mock the route's three sequential queries: purchase_orders.maybeSingle(),
// purchase_order_lines.eq(), product_skus.in(). Returns the dispatcher so
// tests can override individual call shapes.
function mockPrintPoQueries(opts: {
  po?: ReturnType<typeof makePoRow> | null;
  lines?: Array<{ sku: string; qty: number; received_qty: number }>;
  skus?: Array<{ sku: string; variant: string; price: number }>;
  poError?: { code?: string; message?: string };
}) {
  const fromImpl = vi.fn((table: string) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const chain: any = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      in: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockReturnThis(),
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ok = (data: any) => Promise.resolve({ data, error: null });
    switch (table) {
      case "purchase_orders":
        if (opts.poError) {
          chain.maybeSingle = vi.fn(() => Promise.resolve({ data: null, error: opts.poError }));
        } else {
          chain.maybeSingle = vi.fn(() => ok(opts.po === undefined ? makePoRow() : opts.po));
        }
        break;
      case "purchase_order_lines":
        chain.eq = vi.fn(() => ok(opts.lines ?? []));
        break;
      case "product_skus":
        chain.in = vi.fn(() => ok(opts.skus ?? []));
        break;
    }
    return chain;
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  vi.mocked(userClient).mockReturnValue({ from: fromImpl } as any);
  return fromImpl;
}

async function pdfText(bytes: Uint8Array): Promise<string> {
  const parser = new PDFParse({ data: bytes });
  const result = await parser.getText();
  await parser.destroy();
  return result.text;
}

describe("GET /api/logistics/pos/:id/print", () => {
  it(
    "200 — returns application/pdf with attachment filename and pdf-parse extracts PO# / supplier / lines / total",
    async () => {
      mockPrintPoQueries({
        lines: [
          { sku: "MAT-K-001", qty: 5, received_qty: 0 },
          { sku: "BED-K-002", qty: 3, received_qty: 0 },
          { sku: "SOFA-3S-001", qty: 1, received_qty: 0 },
        ],
        skus: [
          { sku: "MAT-K-001", variant: "King Mattress 200x200", price: 1500 },
          { sku: "BED-K-002", variant: "Oak Bedframe King", price: 800 },
          { sku: "SOFA-3S-001", variant: "Linen Sofa Warm Beige", price: 4500 },
        ],
      });
      const jwt = await makeJwt("logistics");
      const res = await app.fetch(
        new Request(`http://t/api/logistics/pos/${PO_ID}/print`, {
          headers: { Authorization: `Bearer ${jwt}` },
        }),
        env,
      );
      expect(res.status).toBe(200);
      expect(res.headers.get("Content-Type")).toBe("application/pdf");
      // Filename de-dupes the PO- prefix when po.id already starts with "PO-"
      // (which it always should — auto-generated 'PO-NNNN' format).
      expect(res.headers.get("Content-Disposition")).toBe('attachment; filename="PO-9801.pdf"');
      const buf = new Uint8Array(await res.arrayBuffer());
      expect(buf.byteLength).toBeGreaterThan(1024);
      // Magic header check.
      expect(buf[0]).toBe(0x25); // %
      expect(buf[1]).toBe(0x50); // P
      expect(buf[2]).toBe(0x44); // D
      expect(buf[3]).toBe(0x46); // F

      const text = await pdfText(buf);
      // PO #, supplier, buyer (warehouse), and SKU descriptions all rendered.
      expect(text).toContain("PO-9801");
      expect(text).toContain("Acme Furniture Sdn Bhd");
      expect(text).toContain("KL HQ");
      expect(text).toContain("MAT-K-001");
      expect(text).toContain("King Mattress 200x200");
      expect(text).toContain("Oak Bedframe King");
      expect(text).toContain("Linen Sofa Warm Beige");
      // grand_total = 5*1500 + 3*800 + 1*4500 = 7500 + 2400 + 4500 = 14400.
      expect(text).toContain("14400.00");
    },
    60_000,
  );

  it(
    "200 — CJK supplier name renders correctly (Noto Sans SC, not tofu)",
    async () => {
      mockPrintPoQueries({
        po: makePoRow({
          suppliers: { name: "海尔集团", contact: "+86 10 8888 8888" },
        }),
        lines: [{ sku: "MAT-K-001", qty: 1, received_qty: 0 }],
        skus: [{ sku: "MAT-K-001", variant: "King Mattress 200x200", price: 1500 }],
      });
      const jwt = await makeJwt("logistics");
      const res = await app.fetch(
        new Request(`http://t/api/logistics/pos/${PO_ID}/print`, {
          headers: { Authorization: `Bearer ${jwt}` },
        }),
        env,
      );
      expect(res.status).toBe(200);
      const buf = new Uint8Array(await res.arrayBuffer());
      const text = await pdfText(buf);
      // CRITICAL: pdf-parse must extract the actual CJK characters, not "□□□"
      // tofu. This proves runtime jsdelivr font fetch + Noto Sans SC subset is
      // wired correctly for the PO route too (regression guard for M4.4/M4.5).
      expect(text).toContain("海尔集团");
    },
    60_000,
  );

  it("422 — cancelled PO is not printable", async () => {
    mockPrintPoQueries({
      po: makePoRow({ status: "cancelled" }),
    });
    const jwt = await makeJwt("logistics");
    const res = await app.fetch(
      new Request(`http://t/api/logistics/pos/${PO_ID}/print`, {
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    expect(res.status).toBe(422);
    const body = (await res.json()) as { error: string; code: string; message: string };
    expect(body.code).toBe("po_not_printable");
    expect(body.error).toBe("rule_violation");
  });

  it(
    "200 — received PO is still printable (procurement record)",
    async () => {
      mockPrintPoQueries({
        po: makePoRow({ status: "received", sup_status: "delivered" }),
        lines: [{ sku: "MAT-K-001", qty: 2, received_qty: 2 }],
        skus: [{ sku: "MAT-K-001", variant: "King Mattress 200x200", price: 1500 }],
      });
      const jwt = await makeJwt("logistics");
      const res = await app.fetch(
        new Request(`http://t/api/logistics/pos/${PO_ID}/print`, {
          headers: { Authorization: `Bearer ${jwt}` },
        }),
        env,
      );
      expect(res.status).toBe(200);
      expect(res.headers.get("Content-Type")).toBe("application/pdf");
    },
    60_000,
  );

  it("404 — PO does not exist", async () => {
    mockPrintPoQueries({ po: null });
    const jwt = await makeJwt("logistics");
    const res = await app.fetch(
      new Request(`http://t/api/logistics/pos/${PO_ID}/print`, {
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("not_found");
  });

  it("403 — dealer role rejected (guard fires before any Supabase call)", async () => {
    const from = vi.fn();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue({ from } as any);
    const jwt = await makeJwt("dealer");
    const res = await app.fetch(
      new Request(`http://t/api/logistics/pos/${PO_ID}/print`, {
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    expect(res.status).toBe(403);
    expect(from).not.toHaveBeenCalled();
  });

  it("401 — missing Authorization header", async () => {
    const res = await app.fetch(new Request(`http://t/api/logistics/pos/${PO_ID}/print`), env);
    expect(res.status).toBe(401);
  });
});

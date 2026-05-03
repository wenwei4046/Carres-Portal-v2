import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from "vitest";
import { SignJWT, createLocalJWKSet, exportJWK, generateKeyPair, type JWK, type KeyLike } from "jose";
import { http, passthrough } from "msw";
import { PDFParse } from "pdf-parse";
import app from "../../index";
import { _setJwksForTesting } from "../../middleware/auth";
import { server } from "../../test/server";

// userClient is mocked the same way as the rest of the orders test suite —
// route fetches order/lines/skus via the user-scoped supabase client.
vi.mock("../../lib/supabase", () => ({
  userClient: vi.fn(),
}));

import { userClient } from "../../lib/supabase";

const SUPABASE_URL = "https://test.supabase.co";
const KID = "test-kid-1";
const ORDER_ID = "00000000-0000-0000-0000-000000000a01";

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
  // @react-pdf/renderer fetches Noto Sans SC TTFs from jsdelivr at first render.
  // The global setup.ts uses onUnhandledRequest:"error", so passthrough is
  // required for the route to render the PDF in tests. Mirrors render.test.ts.
  server.use(
    http.get("https://cdn.jsdelivr.net/fontsource/fonts/noto-sans-sc@latest/*", () => passthrough()),
  );
});

afterAll(() => _setJwksForTesting(null));

// Build a happy-path order row with embedded resources matching the route's
// `select(...)` projection. Override fields by passing partial overrides.
function makeOrderRow(overrides: Record<string, unknown> = {}) {
  return {
    id: ORDER_ID,
    dl: 4001,
    status: "delivered",
    do_number: "DO-9801",
    do_note: "Customer signed at lobby",
    customer_name: "Tan Ah Kow",
    customer_phone: "+60 12-345 6789",
    customer_address: "12, Jalan Test 3/4, 47800 Petaling Jaya, Selangor",
    dealer_id: "00000000-0000-0000-0000-000000000d01",
    warehouse_id: "00000000-0000-0000-0000-000000000w01",
    delivery_partner_id: "00000000-0000-0000-0000-000000000b01",
    placed_at: "2026-05-03T10:00:00Z",
    delivered_at: "2026-05-04T15:00:00Z",
    dealers: { name: "BedHouse KL", contact: "Sarah Tan / +60 13-111 2222" },
    warehouses: { name: "KL HQ", address: "1 Persiaran Test, KL" },
    delivery_partners: { name: "GD Express" },
    ...overrides,
  };
}

// Mock the route's three sequential queries: orders.maybeSingle(),
// order_lines.eq(), product_skus.in(). Returns the table dispatcher so tests
// can inject a missing-row case via `order: null`.
function mockPrintDoQueries(opts: {
  order?: ReturnType<typeof makeOrderRow> | null;
  lines?: Array<{ sku: string; qty: number; unit_price: number }>;
  skus?: Array<{ sku: string; variant: string }>;
  ordersError?: { code?: string; message?: string };
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
      case "orders":
        if (opts.ordersError) {
          chain.maybeSingle = vi.fn(() => Promise.resolve({ data: null, error: opts.ordersError }));
        } else {
          chain.maybeSingle = vi.fn(() => ok(opts.order === undefined ? makeOrderRow() : opts.order));
        }
        break;
      case "order_lines":
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

describe("GET /api/logistics/orders/:id/print-do", () => {
  it(
    "200 — returns application/pdf with attachment filename and pdf-parse extracts DO# / customer / dealer / line items",
    async () => {
      mockPrintDoQueries({
        lines: [
          { sku: "MAT-K-001", qty: 2, unit_price: 1500 },
          { sku: "BED-K-002", qty: 1, unit_price: 800 },
        ],
        skus: [
          { sku: "MAT-K-001", variant: "King Mattress 200x200" },
          { sku: "BED-K-002", variant: "Oak Bedframe King" },
        ],
      });
      const jwt = await makeJwt("logistics");
      const res = await app.fetch(
        new Request(`http://t/api/logistics/orders/${ORDER_ID}/print-do`, {
          headers: { Authorization: `Bearer ${jwt}` },
        }),
        env,
      );
      expect(res.status).toBe(200);
      expect(res.headers.get("Content-Type")).toBe("application/pdf");
      // Filename de-dupes the DO- prefix when do_number already starts with "DO-"
      // (the auto-suggest format ships do_number as "DO-9801" not "9801").
      expect(res.headers.get("Content-Disposition")).toBe('attachment; filename="DO-9801.pdf"');
      const buf = new Uint8Array(await res.arrayBuffer());
      expect(buf.byteLength).toBeGreaterThan(1024);
      // Magic header check.
      expect(buf[0]).toBe(0x25); // %
      expect(buf[1]).toBe(0x50); // P
      expect(buf[2]).toBe(0x44); // D
      expect(buf[3]).toBe(0x46); // F

      const text = await pdfText(buf);
      // DO number, customer, dealer, partner, line item descriptions extracted from the PDF.
      expect(text).toContain("DO-9801");
      expect(text).toContain("Tan Ah Kow");
      expect(text).toContain("BedHouse KL");
      expect(text).toContain("GD Express");
      expect(text).toContain("MAT-K-001");
      expect(text).toContain("King Mattress 200x200");
      expect(text).toContain("Oak Bedframe King");
      // Order code derived from dl.
      expect(text).toContain("DL-4001");
    },
    60_000,
  );

  it(
    "200 — CJK customer name renders correctly (Noto Sans SC, not tofu)",
    async () => {
      mockPrintDoQueries({
        order: makeOrderRow({
          customer_name: "王小明",
          customer_address: "北京市朝阳区建国路88号",
        }),
        lines: [{ sku: "SOFA-001", qty: 1, unit_price: 4500 }],
        skus: [{ sku: "SOFA-001", variant: "Linen Sofa Warm Beige" }],
      });
      const jwt = await makeJwt("logistics");
      const res = await app.fetch(
        new Request(`http://t/api/logistics/orders/${ORDER_ID}/print-do`, {
          headers: { Authorization: `Bearer ${jwt}` },
        }),
        env,
      );
      expect(res.status).toBe(200);
      const buf = new Uint8Array(await res.arrayBuffer());
      const text = await pdfText(buf);
      // CRITICAL: pdf-parse must extract the actual CJK characters, not "□□□" tofu.
      // This proves runtime jsdelivr font fetch + Noto Sans SC subset is wired correctly.
      expect(text).toContain("王小明");
      expect(text).toContain("北京市朝阳区建国路88号");
    },
    60_000,
  );

  it(
    "200 — order with no delivery partner still renders (partner=null in template)",
    async () => {
      mockPrintDoQueries({
        order: makeOrderRow({ delivery_partner_id: null, delivery_partners: null }),
        lines: [{ sku: "SOFA-001", qty: 1, unit_price: 4500 }],
        skus: [{ sku: "SOFA-001", variant: "Linen Sofa Warm Beige" }],
      });
      const jwt = await makeJwt("logistics");
      const res = await app.fetch(
        new Request(`http://t/api/logistics/orders/${ORDER_ID}/print-do`, {
          headers: { Authorization: `Bearer ${jwt}` },
        }),
        env,
      );
      expect(res.status).toBe(200);
      const buf = new Uint8Array(await res.arrayBuffer());
      const text = await pdfText(buf);
      expect(text).toContain("DO-9801");
      expect(text).not.toContain("GD Express");
    },
    60_000,
  );

  it("422 — order is not delivered yet (status='proceed_order')", async () => {
    mockPrintDoQueries({
      order: makeOrderRow({ status: "proceed_order", do_number: null, delivered_at: null }),
    });
    const jwt = await makeJwt("logistics");
    const res = await app.fetch(
      new Request(`http://t/api/logistics/orders/${ORDER_ID}/print-do`, {
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    expect(res.status).toBe(422);
    const body = (await res.json()) as { error: string; code: string; message: string };
    expect(body.code).toBe("order_not_delivered");
    expect(body.error).toBe("rule_violation");
  });

  it("404 — order does not exist", async () => {
    mockPrintDoQueries({ order: null });
    const jwt = await makeJwt("logistics");
    const res = await app.fetch(
      new Request(`http://t/api/logistics/orders/${ORDER_ID}/print-do`, {
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
      new Request(`http://t/api/logistics/orders/${ORDER_ID}/print-do`, {
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    expect(res.status).toBe(403);
    expect(from).not.toHaveBeenCalled();
  });

  it("401 — missing Authorization header", async () => {
    const res = await app.fetch(
      new Request(`http://t/api/logistics/orders/${ORDER_ID}/print-do`),
      env,
    );
    expect(res.status).toBe(401);
  });
});

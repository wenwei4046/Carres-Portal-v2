import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from "vitest";
import { SignJWT, createLocalJWKSet, exportJWK, generateKeyPair, type JWK, type KeyLike } from "jose";
import app from "../../index";
import { _setJwksForTesting } from "../../middleware/auth";

/**
 * Q3 · `GET /api/operation/pos/report` — the Report tab's only read.
 *
 * Two things this route must never do, and both are asserted rather than
 * trusted: put a money field on the wire (Loo, 2026-08-04), and decide for
 * itself which purchase orders count. A cancelled PO leaves here WITH its
 * flag — the exclusion is the shared module's business rule, so a test can
 * remove it and see the figures move.
 */

vi.mock("../../lib/supabase", () => ({
  userClient: vi.fn(),
}));

import { userClient } from "../../lib/supabase";

const SUPABASE_URL = "https://test.supabase.co";
const KID = "test-kid-report";

const env = {
  SUPABASE_URL,
  SUPABASE_ANON_KEY: "test-anon",
  SUPABASE_SERVICE_ROLE_KEY: "test-service",
  SUPABASE_JWT_SECRET: "unused",
};

let signKey: KeyLike;
let publicJwk: JWK;

async function makeJwt(role: string) {
  return new SignJWT({ email: `${role}@carres.com`, app_metadata: { role } })
    .setProtectedHeader({ alg: "ES256", kid: KID, typ: "JWT" })
    .setSubject("11111111-1111-1111-1111-000000000998")
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
});

afterAll(() => _setJwksForTesting(null));

/** A purchase order carrying two lines, priced in the DB and never on the wire. */
function poRows() {
  return [
    {
      id: "PO-2051",
      supplier_id: "sup-ohana",
      status: "open",
      // 2026-07-31 23:10 MYT — the case the month rule exists for.
      placed_at: "2026-07-31T15:10:00.000Z",
      suppliers: { name: "Ohana" },
      purchase_order_lines: [
        { sku: "SOFA-A", qty: 2, received_qty: 0 },
        { sku: "BF-A", qty: 1, received_qty: 1 },
      ],
    },
    {
      id: "PO-2050",
      supplier_id: "sup-nice",
      status: "cancelled",
      placed_at: "2026-08-03T02:00:00.000Z",
      suppliers: { name: "Nice Future" },
      purchase_order_lines: [{ sku: "MAT-A", qty: 5, received_qty: 0 }],
    },
  ];
}

function mockDb(opts: { pos?: unknown[]; skus?: unknown[]; posError?: unknown } = {}) {
  const from = vi.fn((table: string) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const chain: any = {
      select: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      in: vi.fn(() =>
        Promise.resolve({
          data:
            opts.skus ?? [
              { sku: "SOFA-A", product_models: { category: "sofa" } },
              { sku: "BF-A", product_models: { category: "bedframe" } },
              { sku: "MAT-A", product_models: { category: "mattress" } },
            ],
          error: null,
        }),
      ),
      limit: vi.fn(() =>
        Promise.resolve(
          opts.posError
            ? { data: null, error: opts.posError }
            : { data: opts.pos ?? poRows(), error: null },
        ),
      ),
    };
    void table;
    return chain;
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  vi.mocked(userClient).mockReturnValue({ from } as any);
  return { from };
}

async function get() {
  const jwt = await makeJwt("operation");
  return app.fetch(
    new Request("http://t/api/operation/pos/report", {
      headers: { Authorization: `Bearer ${jwt}` },
    }),
    env,
  );
}

describe("GET /api/operation/pos/report", () => {
  it("200 — one row per purchase-order LINE, with its category resolved", async () => {
    mockDb();
    const res = await get();
    expect(res.status).toBe(200);
    const body = (await res.json()) as { lines: Record<string, unknown>[] };
    expect(body.lines).toHaveLength(3);
    expect(body.lines[0]).toMatchObject({
      poId: "PO-2051",
      supplierName: "Ohana",
      category: "sofa",
      cancelled: false,
      ordered: 2,
      received: 0,
    });
    expect(body.lines[1]).toMatchObject({ category: "bedframe", ordered: 1, received: 1 });
  });

  it("200 — the month is MYT, not UTC", async () => {
    mockDb();
    const res = await get();
    const body = (await res.json()) as { lines: { poId: string; month: string }[] };
    // 2026-07-31 15:10 UTC is 2026-07-31 23:10 in MYT — still July. Read in
    // UTC it is July too; read a day later it would not be, which is why the
    // conversion is here and not left to the browser.
    expect(body.lines.find((l) => l.poId === "PO-2051")!.month).toBe("2026-07");
    expect(body.lines.find((l) => l.poId === "PO-2050")!.month).toBe("2026-08");
  });

  it("200 — a cancelled purchase order rides the wire WITH its flag", async () => {
    mockDb();
    const res = await get();
    const body = (await res.json()) as { lines: { poId: string; cancelled: boolean }[] };
    const cancelled = body.lines.find((l) => l.poId === "PO-2050")!;
    expect(cancelled.cancelled).toBe(true);
  });

  it("200 — NO MONEY on the wire: no cost, no price, no RM, anywhere", async () => {
    mockDb();
    const res = await get();
    const raw = await res.text();
    expect(raw).not.toMatch(/cost|price|total|currency|amount|"RM|MYR/i);
  });

  it("200 — a SKU the catalog cannot place keeps its line, with a null category", async () => {
    mockDb({ skus: [{ sku: "SOFA-A", product_models: { category: "sofa" } }] });
    const res = await get();
    const body = (await res.json()) as { lines: { category: string | null }[] };
    expect(body.lines).toHaveLength(3);
    expect(body.lines.filter((l) => l.category === null)).toHaveLength(2);
  });

  it("401 — no token", async () => {
    mockDb();
    const res = await app.fetch(new Request("http://t/api/operation/pos/report"), env);
    expect(res.status).toBe(401);
  });

  it("403 — a dealer may not read purchasing figures", async () => {
    mockDb();
    const jwt = await makeJwt("dealer");
    const res = await app.fetch(
      new Request("http://t/api/operation/pos/report", {
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    expect(res.status).toBe(403);
  });

  it("the static path wins over /:id — the report is never read as a PO id", async () => {
    const { from } = mockDb();
    const res = await get();
    expect(res.status).toBe(200);
    expect(from).toHaveBeenCalledWith("purchase_orders");
  });
});

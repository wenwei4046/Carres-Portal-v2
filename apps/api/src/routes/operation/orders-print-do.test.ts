import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from "vitest";
import { SignJWT, createLocalJWKSet, exportJWK, generateKeyPair, type JWK, type KeyLike } from "jose";
import app from "../../index";
import { _setJwksForTesting } from "../../middleware/auth";

// 2026-05-12 (Loo): route renamed `/print-do` → `/print-do-data` and now
// returns JSON instead of an application/pdf body. The PDF render happens
// client-side per apps/web/src/lib/pdf/render.ts. Tests check the JSON
// contract; pdf-parse + msw passthrough are no longer needed.

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

describe("GET /api/operation/orders/:id/print-do-data", () => {
  it("200 — returns JSON template data with DO#, customer, dealer, partner, lines", async () => {
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
    const jwt = await makeJwt("operation");
    const res = await app.fetch(
      new Request(`http://t/api/operation/orders/${ORDER_ID}/print-do-data`, {
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toMatch(/application\/json/);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const body = (await res.json()) as any;
    expect(body.do_number).toBe("DO-9801");
    expect(body.order_code).toBe("SO-4001");
    expect(body.customer.name).toBe("Tan Ah Kow");
    expect(body.dealer.name).toBe("BedHouse KL");
    expect(body.partner?.name).toBe("GD Express");
    expect(body.lines).toHaveLength(2);
    expect(body.lines[0].sku).toBe("MAT-K-001");
    expect(body.lines[0].description).toBe("King Mattress 200x200");
    expect(body.lines[1].description).toBe("Oak Bedframe King");
  });

  it("200 — CJK customer name passes through the JSON unchanged", async () => {
    mockPrintDoQueries({
      order: makeOrderRow({
        customer_name: "王小明",
        customer_address: "北京市朝阳区建国路88号",
      }),
      lines: [{ sku: "SOFA-001", qty: 1, unit_price: 4500 }],
      skus: [{ sku: "SOFA-001", variant: "Linen Sofa Warm Beige" }],
    });
    const jwt = await makeJwt("operation");
    const res = await app.fetch(
      new Request(`http://t/api/operation/orders/${ORDER_ID}/print-do-data`, {
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    expect(res.status).toBe(200);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const body = (await res.json()) as any;
    expect(body.customer.name).toBe("王小明");
    expect(body.customer.address).toBe("北京市朝阳区建国路88号");
  });

  it("200 — order with no delivery partner returns partner=null", async () => {
    mockPrintDoQueries({
      order: makeOrderRow({ delivery_partner_id: null, delivery_partners: null }),
      lines: [{ sku: "SOFA-001", qty: 1, unit_price: 4500 }],
      skus: [{ sku: "SOFA-001", variant: "Linen Sofa Warm Beige" }],
    });
    const jwt = await makeJwt("operation");
    const res = await app.fetch(
      new Request(`http://t/api/operation/orders/${ORDER_ID}/print-do-data`, {
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    expect(res.status).toBe(200);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const body = (await res.json()) as any;
    expect(body.do_number).toBe("DO-9801");
    expect(body.partner).toBeNull();
  });

  it("422 — DO is not yet assigned (pre-dispatch, do_number=null)", async () => {
    // 2026-05-13 (Loo): gate changed from `status !== 'delivered'` to
    // `!do_number`. After 0098 the trigger auto-assigns do_number on
    // operation_stage→'dispatched', so DO is printable at dispatched +
    // delivered. Pre-dispatch the field is null → 422 do_missing.
    mockPrintDoQueries({
      order: makeOrderRow({ status: "proceed_order", do_number: null, delivered_at: null }),
    });
    const jwt = await makeJwt("operation");
    const res = await app.fetch(
      new Request(`http://t/api/operation/orders/${ORDER_ID}/print-do-data`, {
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    expect(res.status).toBe(422);
    const body = (await res.json()) as { error: string; code: string; message: string };
    expect(body.code).toBe("do_missing");
    expect(body.error).toBe("rule_violation");
  });

  it("404 — order does not exist", async () => {
    mockPrintDoQueries({ order: null });
    const jwt = await makeJwt("operation");
    const res = await app.fetch(
      new Request(`http://t/api/operation/orders/${ORDER_ID}/print-do-data`, {
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
      new Request(`http://t/api/operation/orders/${ORDER_ID}/print-do-data`, {
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    expect(res.status).toBe(403);
    expect(from).not.toHaveBeenCalled();
  });

  it("401 — missing Authorization header", async () => {
    const res = await app.fetch(
      new Request(`http://t/api/operation/orders/${ORDER_ID}/print-do-data`),
      env,
    );
    expect(res.status).toBe(401);
  });
});

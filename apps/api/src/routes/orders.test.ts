import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from "vitest";
import { SignJWT, createLocalJWKSet, exportJWK, generateKeyPair, type JWK, type KeyLike } from "jose";
import app from "../index";
import { _setJwksForTesting } from "../middleware/auth";

vi.mock("../lib/supabase", () => ({
  userClient: vi.fn(),
  adminClient: vi.fn(),
}));

import { userClient } from "../lib/supabase";

const SUPABASE_URL = "https://test.supabase.co";
const KID = "test-kid-2";

const env = {
  SUPABASE_URL,
  SUPABASE_ANON_KEY: "test-anon",
  SUPABASE_SERVICE_ROLE_KEY: "test-service",
  SUPABASE_JWT_SECRET: "unused",
};

let signKey: KeyLike;
let publicJwk: JWK;

async function makeJwt(role: string, dealerId: string | null) {
  return new SignJWT({
    email: "test@carres.com",
    app_metadata: { role, ...(dealerId ? { dealer_id: dealerId } : {}) },
  })
    .setProtectedHeader({ alg: "ES256", kid: KID, typ: "JWT" })
    .setSubject("11111111-1111-1111-1111-000000000999")
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(signKey);
}

const DEALER_A = "00000000-0000-0000-0000-000000000d01";
const DEALER_B = "00000000-0000-0000-0000-000000000d02";

function makeOrderRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "11111111-1111-1111-1111-111111111111",
    dl: 1001,
    status: "place",
    channel: "dealer",
    dealer_id: DEALER_A,
    outlet_id: null,
    salesperson_id: null,
    customer_name: "Customer X",
    customer_phone: null,
    customer_address: null,
    customer_address_unknown: false,
    customer_billing: null,
    customer_billing_same: true,
    customer_emergency: null,
    delivery_date: null,
    delivery_date_tbd: false,
    delivery_floor: 1,
    delivery_has_lift: false,
    paid: "0",
    signature_url: null,
    terms_accepted: true,
    logistics_stage: null,
    warehouse_id: null,
    delivery_partner_id: null,
    partner_stage: null,
    partner_picked_at: null,
    partner_eta: null,
    do_number: null,
    do_note: null,
    invoice_no: null,
    invoiced_at: null,
    placed_at: "2026-05-02T00:00:00Z",
    line_count: [{ count: 0 }],
    ...overrides,
  };
}

function buildSb(rowsFor: { list?: unknown[]; one?: unknown }) {
  // Simulates a Supabase PostgREST chain that records .eq() filters and
  // returns rows on .order() (list) or .maybeSingle() (single row).
  const eqs: Array<[string, unknown]> = [];
  const chain = {
    eq(col: string, val: unknown) {
      eqs.push([col, val]);
      return chain;
    },
    order: async () => ({ data: rowsFor.list ?? [], error: null }),
    maybeSingle: async () => ({ data: rowsFor.one ?? null, error: null }),
  };
  return Object.assign(
    {
      from: () => ({ select: () => chain }),
      _eqs: eqs,
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ) as any;
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

describe("GET /api/orders", () => {
  it("401 without Authorization", async () => {
    const res = await app.fetch(new Request("http://t/api/orders"), env);
    expect(res.status).toBe(401);
  });

  it("returns RLS-scoped list for dealer (own dealerId only — Supabase enforces, route doesn't add WHERE)", async () => {
    const sb = buildSb({ list: [makeOrderRow({ dealer_id: DEALER_A })] });
    vi.mocked(userClient).mockReturnValue(sb);
    const jwt = await makeJwt("dealer", DEALER_A);
    const res = await app.fetch(
      new Request("http://t/api/orders", { headers: { Authorization: `Bearer ${jwt}` } }),
      env,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { total: number; orders: Array<{ dealerId: string }> };
    expect(body.total).toBe(1);
    expect(body.orders[0]?.dealerId).toBe(DEALER_A);
  });

  it("status filter is applied at the SQL level", async () => {
    const sb = buildSb({ list: [makeOrderRow({ status: "delivered" })] });
    vi.mocked(userClient).mockReturnValue(sb);
    const jwt = await makeJwt("dealer", DEALER_A);
    await app.fetch(
      new Request("http://t/api/orders?status=delivered", { headers: { Authorization: `Bearer ${jwt}` } }),
      env,
    );
    expect(sb._eqs).toContainEqual(["status", "delivered"]);
  });

  it("outletId filter is applied", async () => {
    const sb = buildSb({ list: [] });
    vi.mocked(userClient).mockReturnValue(sb);
    const outlet = "22222222-2222-2222-2222-222222222222";
    const jwt = await makeJwt("dealer", DEALER_A);
    await app.fetch(
      new Request(`http://t/api/orders?outletId=${outlet}`, { headers: { Authorization: `Bearer ${jwt}` } }),
      env,
    );
    expect(sb._eqs).toContainEqual(["outlet_id", outlet]);
  });

  it("dealerId param IGNORED for dealer role (RLS handles scoping)", async () => {
    const sb = buildSb({ list: [] });
    vi.mocked(userClient).mockReturnValue(sb);
    const jwt = await makeJwt("dealer", DEALER_A);
    await app.fetch(
      new Request(`http://t/api/orders?dealerId=${DEALER_B}`, { headers: { Authorization: `Bearer ${jwt}` } }),
      env,
    );
    expect(sb._eqs).not.toContainEqual(["dealer_id", DEALER_B]);
  });

  it("dealerId param HONORED for principal role (cross-dealer filter)", async () => {
    const sb = buildSb({ list: [] });
    vi.mocked(userClient).mockReturnValue(sb);
    const jwt = await makeJwt("principal", null);
    await app.fetch(
      new Request(`http://t/api/orders?dealerId=${DEALER_B}`, { headers: { Authorization: `Bearer ${jwt}` } }),
      env,
    );
    expect(sb._eqs).toContainEqual(["dealer_id", DEALER_B]);
  });

  it("returns 400 for invalid status enum", async () => {
    vi.mocked(userClient).mockReturnValue(buildSb({ list: [] }));
    const jwt = await makeJwt("dealer", DEALER_A);
    const res = await app.fetch(
      new Request("http://t/api/orders?status=bogus", { headers: { Authorization: `Bearer ${jwt}` } }),
      env,
    );
    expect(res.status).toBe(400);
  });
});

describe("GET /api/orders/:id", () => {
  it("returns order with rels populated via PostgREST nested fetch", async () => {
    const oneRow = {
      ...makeOrderRow(),
      order_lines: [
        { id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa", order_id: "11111111-1111-1111-1111-111111111111", sku: "SKU-1", qty: 1, attrs: null, unit_price: "100" },
      ],
      order_addons: [],
      order_history: [],
    };
    const sb = buildSb({ one: oneRow });
    vi.mocked(userClient).mockReturnValue(sb);
    const jwt = await makeJwt("dealer", DEALER_A);
    const res = await app.fetch(
      new Request("http://t/api/orders/11111111-1111-1111-1111-111111111111", { headers: { Authorization: `Bearer ${jwt}` } }),
      env,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { id: string; lines: Array<{ unitPrice: number }> };
    expect(body.id).toBe("11111111-1111-1111-1111-111111111111");
    expect(body.lines).toHaveLength(1);
    expect(body.lines[0]?.unitPrice).toBe(100);
  });

  it("returns 404 when row not found / RLS-hidden (same message — no info leak)", async () => {
    const sb = buildSb({ one: null });
    vi.mocked(userClient).mockReturnValue(sb);
    const jwt = await makeJwt("dealer", DEALER_A);
    const res = await app.fetch(
      new Request("http://t/api/orders/11111111-1111-1111-1111-111111111199", { headers: { Authorization: `Bearer ${jwt}` } }),
      env,
    );
    expect(res.status).toBe(404);
  });

  it("returns 404 for malformed UUID (no SQL run)", async () => {
    vi.mocked(userClient).mockReturnValue(buildSb({ one: null }));
    const jwt = await makeJwt("dealer", DEALER_A);
    const res = await app.fetch(
      new Request("http://t/api/orders/not-a-uuid", { headers: { Authorization: `Bearer ${jwt}` } }),
      env,
    );
    expect(res.status).toBe(404);
  });
});

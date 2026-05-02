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

/**
 * Like buildSb but also stubs `.rpc('create_order', { payload })` so POST tests
 * can assert on what was sent and on rpc-returned errors. Use for POST flow.
 */
function buildSbForCreate(opts: {
  rpcResult?: { id: string; dl: number; placed_at: string };
  rpcError?: { code?: string; message?: string };
  fetchedRow?: unknown;
}) {
  const rpcCalls: Array<{ name: string; payload: unknown }> = [];
  const eqs: Array<[string, unknown]> = [];
  const chain = {
    eq(col: string, val: unknown) {
      eqs.push([col, val]);
      return chain;
    },
    order: async () => ({ data: [], error: null }),
    maybeSingle: async () => ({ data: opts.fetchedRow ?? null, error: null }),
  };
  return Object.assign(
    {
      from: () => ({ select: () => chain }),
      rpc: async (name: string, args: { payload: unknown }) => {
        rpcCalls.push({ name, payload: args.payload });
        if (opts.rpcError) {
          return { data: null, error: opts.rpcError };
        }
        return { data: opts.rpcResult ?? null, error: null };
      },
      _eqs: eqs,
      _rpcCalls: rpcCalls,
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ) as any;
}

function validCreateBody(over: Record<string, unknown> = {}) {
  return {
    outletId: "00000000-0000-0000-0000-00000000ee01",
    salespersonId: "00000000-0000-0000-0000-00000000ff01",
    customer: {
      name: "Tan Mei Ling",
      phone: "012-3456789",
      address: "123 Jalan Sample, 50000 KL",
      addressUnknown: false,
      billing: null,
      billingSame: true,
      emergency: "Tan Junior · 012-9988776 · Spouse",
    },
    delivery: { date: "2026-06-01", dateTbd: false, floor: 1, hasLift: false },
    lines: [
      {
        sku: "mattress:carres-classic:queen",
        qty: 1,
        attrs: null,
        unitPrice: 1500,
      },
    ],
    addons: [],
    paid: 750,
    // Path prefix MUST match the caller's dealerId — the POST handler validates
    // this. Tests using a different caller (e.g. cross-dealer) need to override.
    signaturePath: `orders-attachments/${DEALER_A}/wiz/signature.png`,
    paymentSlipPath: null,
    termsAccepted: true,
    depositPct: 50,
    ...over,
  };
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

describe("POST /api/orders", () => {
  const NEW_ORDER_ID = "11111111-1111-1111-1111-111111111111";

  it("happy path → calls RPC, then refetches order with rels, returns 201 + full order", async () => {
    const sb = buildSbForCreate({
      rpcResult: { id: NEW_ORDER_ID, dl: 1251, placed_at: "2026-05-02T10:00:00Z" },
      fetchedRow: {
        ...makeOrderRow({
          id: NEW_ORDER_ID,
          dl: 1251,
          dealer_id: DEALER_A,
          customer_name: "Tan Mei Ling",
          paid: "750",
        }),
        order_lines: [
          {
            id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
            order_id: NEW_ORDER_ID,
            sku: "mattress:carres-classic:queen",
            qty: 1,
            attrs: null,
            unit_price: "1500",
          },
        ],
        order_addons: [],
        order_history: [
          {
            id: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
            order_id: NEW_ORDER_ID,
            text: "Order created · 50% deposit",
            by_role: "dealer",
            occurred_at: "2026-05-02T10:00:00Z",
          },
        ],
      },
    });
    vi.mocked(userClient).mockReturnValue(sb);

    const jwt = await makeJwt("dealer", DEALER_A);
    const res = await app.fetch(
      new Request("http://t/api/orders", {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify(validCreateBody()),
      }),
      env,
    );
    expect(res.status).toBe(201);
    const body = (await res.json()) as { id: string; dl: number; lines: unknown[]; history: unknown[] };
    expect(body.id).toBe(NEW_ORDER_ID);
    expect(body.dl).toBe(1251);
    expect(body.lines).toHaveLength(1);
    expect(body.history).toHaveLength(1);

    // RPC was called with the snake_case payload + dealer_id from JWT
    expect(sb._rpcCalls).toHaveLength(1);
    const sentPayload = sb._rpcCalls[0]!.payload as Record<string, unknown>;
    expect(sentPayload.dealer_id).toBe(DEALER_A);
    expect(sentPayload.customer_name).toBe("Tan Mei Ling");
    expect(sentPayload.deposit_pct).toBe(50);
    expect((sentPayload.lines as unknown[])).toHaveLength(1);

    // Then re-fetched the order by id
    expect(sb._eqs).toContainEqual(["id", NEW_ORDER_ID]);
  });

  it("returns 400 on invalid payload (missing required field)", async () => {
    vi.mocked(userClient).mockReturnValue(buildSbForCreate({}));
    const jwt = await makeJwt("dealer", DEALER_A);
    const body = validCreateBody();
    delete (body as Record<string, unknown>).signaturePath; // signature is required
    const res = await app.fetch(
      new Request("http://t/api/orders", {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
      env,
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 on empty lines array (zod min(1))", async () => {
    vi.mocked(userClient).mockReturnValue(buildSbForCreate({}));
    const jwt = await makeJwt("dealer", DEALER_A);
    const res = await app.fetch(
      new Request("http://t/api/orders", {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify(validCreateBody({ lines: [] })),
      }),
      env,
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 when termsAccepted is false (literal(true) gate)", async () => {
    vi.mocked(userClient).mockReturnValue(buildSbForCreate({}));
    const jwt = await makeJwt("dealer", DEALER_A);
    const res = await app.fetch(
      new Request("http://t/api/orders", {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify(validCreateBody({ termsAccepted: false })),
      }),
      env,
    );
    expect(res.status).toBe(400);
  });

  it("maps RPC 42501 (cross-dealer block) to HTTP 403", async () => {
    const sb = buildSbForCreate({
      rpcError: { code: "42501", message: "forbidden: cross-dealer insert" },
    });
    vi.mocked(userClient).mockReturnValue(sb);
    const jwt = await makeJwt("dealer", DEALER_A);
    const res = await app.fetch(
      new Request("http://t/api/orders", {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify(validCreateBody()),
      }),
      env,
    );
    expect(res.status).toBe(403);
    // RPC was attempted; no follow-up fetch happened
    expect(sb._rpcCalls).toHaveLength(1);
    expect(sb._eqs).toEqual([]);
  });

  it("maps RPC 22023 (validation in PL/pgSQL) to HTTP 400", async () => {
    const sb = buildSbForCreate({
      rpcError: { code: "22023", message: "order must have at least one line" },
    });
    vi.mocked(userClient).mockReturnValue(sb);
    const jwt = await makeJwt("dealer", DEALER_A);
    const res = await app.fetch(
      new Request("http://t/api/orders", {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify(validCreateBody()),
      }),
      env,
    );
    expect(res.status).toBe(400);
  });

  it("returns 403 when dealer role JWT has no dealerId", async () => {
    vi.mocked(userClient).mockReturnValue(buildSbForCreate({}));
    const jwt = await makeJwt("dealer", null);
    const res = await app.fetch(
      new Request("http://t/api/orders", {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify(validCreateBody()),
      }),
      env,
    );
    expect(res.status).toBe(403);
  });

  it("returns 403 for principal role in Phase 2B (cross-dealer create deferred)", async () => {
    vi.mocked(userClient).mockReturnValue(buildSbForCreate({}));
    const jwt = await makeJwt("principal", null);
    const res = await app.fetch(
      new Request("http://t/api/orders", {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify(validCreateBody()),
      }),
      env,
    );
    expect(res.status).toBe(403);
  });

  it("rejects signaturePath pointing to another dealer's folder (no RPC call)", async () => {
    const sb = buildSbForCreate({});
    vi.mocked(userClient).mockReturnValue(sb);
    const jwt = await makeJwt("dealer", DEALER_A);
    const body = validCreateBody({
      // Path scoped to DEALER_B but caller is DEALER_A — must 400
      signaturePath: `orders-attachments/${DEALER_B}/wiz/signature.png`,
    });
    const res = await app.fetch(
      new Request("http://t/api/orders", {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
      env,
    );
    expect(res.status).toBe(400);
    // Critically: RPC was NOT called — guard fires before DB write
    expect(sb._rpcCalls).toHaveLength(0);
  });

  it("rejects paymentSlipPath pointing to another dealer's folder", async () => {
    const sb = buildSbForCreate({});
    vi.mocked(userClient).mockReturnValue(sb);
    const jwt = await makeJwt("dealer", DEALER_A);
    const body = validCreateBody({
      paymentSlipPath: `orders-attachments/${DEALER_B}/wiz/payment-slip.jpg`,
    });
    const res = await app.fetch(
      new Request("http://t/api/orders", {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
      env,
    );
    expect(res.status).toBe(400);
    expect(sb._rpcCalls).toHaveLength(0);
  });

  it("returns 401 without Authorization header", async () => {
    const res = await app.fetch(
      new Request("http://t/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(validCreateBody()),
      }),
      env,
    );
    expect(res.status).toBe(401);
  });

  it("returns 400 on malformed JSON body", async () => {
    vi.mocked(userClient).mockReturnValue(buildSbForCreate({}));
    const jwt = await makeJwt("dealer", DEALER_A);
    const res = await app.fetch(
      new Request("http://t/api/orders", {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: "{not-json",
      }),
      env,
    );
    expect(res.status).toBe(400);
  });
});

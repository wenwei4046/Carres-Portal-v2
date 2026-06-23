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
    so: 1001,
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
    payment_slip_url: null,
    terms_accepted: true,
    payment_method: null,
    approval_code: null,
    installment_months: null,
    operation_stage: null,
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

/**
 * Records every Supabase Storage createSignedUrl call. Returns a deterministic
 * fake signed URL (`https://signed.test/<path>?token=...`) so tests can assert
 * on whether the route invoked signing AND on what path it asked for. Returns
 * `{ data: null, error }` when the test set `signError: true`.
 */
function buildStorageMock(opts: { signError?: boolean } = {}) {
  const signCalls: Array<{ bucket: string; path: string; ttl: number }> = [];
  return {
    storage: {
      from(bucket: string) {
        return {
          async createSignedUrl(path: string, ttl: number) {
            signCalls.push({ bucket, path, ttl });
            if (opts.signError) {
              return { data: null, error: { message: "sign failed" } };
            }
            return {
              data: { signedUrl: `https://signed.test/${bucket}/${path}?token=fake` },
              error: null,
            };
          },
        };
      },
    },
    _signCalls: signCalls,
  };
}

function buildSb(
  rowsFor: { list?: unknown[]; one?: unknown },
  storageOpts: { signError?: boolean } = {},
) {
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
  const storage = buildStorageMock(storageOpts);
  return Object.assign(
    {
      from: () => ({ select: () => chain }),
      _eqs: eqs,
    },
    storage,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ) as any;
}

/**
 * Like buildSb but also stubs `.rpc('create_order', { payload })` so POST tests
 * can assert on what was sent and on rpc-returned errors. Use for POST flow.
 */
function buildSbForCreate(opts: {
  rpcResult?: { id: string; so: number; placed_at: string };
  rpcError?: { code?: string; message?: string; details?: string };
  fetchedRow?: unknown;
  /** Category rows returned by the product_skus.in() lookup used by the
   *  server-side lead-time validator. Defaults to empty (fail-open). Pass
   *  e.g. `[{ product_models: { category: "mattress" } }]` to make the
   *  validator reject any date < today + 14d. */
  productSkuCategoryRows?: Array<{ product_models: { category: string } | null }>;
}) {
  const rpcCalls: Array<{ name: string; payload: unknown }> = [];
  const eqs: Array<[string, unknown]> = [];
  const chain = {
    eq(col: string, val: unknown) {
      eqs.push([col, val]);
      return chain;
    },
    in: async () => ({ data: opts.productSkuCategoryRows ?? [], error: null }),
    order: async () => ({ data: [], error: null }),
    maybeSingle: async () => ({ data: opts.fetchedRow ?? null, error: null }),
  };
  const storage = buildStorageMock();
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
    storage,
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
    delivery: { date: "2026-06-01", proceedDate: "2026-05-15", dateTbd: false, floor: 1, hasLift: false },
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
    paymentMethod: "online",
    approvalCode: null,
    installmentMonths: null,
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

  it("rewrites signature_url + payment_slip_url Storage paths to 1h signed URLs", async () => {
    const sigPath = `orders-attachments/${DEALER_A}/wiz-1/signature.png`;
    const slipPath = `orders-attachments/${DEALER_A}/wiz-1/payment-slip.jpg`;
    const oneRow = {
      ...makeOrderRow({ signature_url: sigPath, payment_slip_url: slipPath }),
      order_lines: [],
      order_addons: [],
      order_history: [],
    };
    const sb = buildSb({ one: oneRow });
    vi.mocked(userClient).mockReturnValue(sb);
    const jwt = await makeJwt("dealer", DEALER_A);
    const res = await app.fetch(
      new Request("http://t/api/orders/11111111-1111-1111-1111-111111111111", {
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { signatureUrl: string; paymentSlipUrl: string };
    expect(body.signatureUrl).toMatch(/^https:\/\/signed\.test\/orders-attachments\/.+\/signature\.png\?token=/);
    expect(body.paymentSlipUrl).toMatch(/^https:\/\/signed\.test\/orders-attachments\/.+\/payment-slip\.jpg\?token=/);
    // Both signs were attempted in parallel — exactly one call per path
    expect(sb._signCalls).toHaveLength(2);
    expect(sb._signCalls.map((c: { path: string }) => c.path).sort()).toEqual(
      [`${DEALER_A}/wiz-1/payment-slip.jpg`, `${DEALER_A}/wiz-1/signature.png`].sort(),
    );
    expect(sb._signCalls[0]!.ttl).toBe(60 * 60);
  });

  it("leaves null url fields as null without invoking Storage signing", async () => {
    const oneRow = {
      ...makeOrderRow({ signature_url: null, payment_slip_url: null }),
      order_lines: [],
      order_addons: [],
      order_history: [],
    };
    const sb = buildSb({ one: oneRow });
    vi.mocked(userClient).mockReturnValue(sb);
    const jwt = await makeJwt("dealer", DEALER_A);
    const res = await app.fetch(
      new Request("http://t/api/orders/11111111-1111-1111-1111-111111111111", {
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { signatureUrl: string | null; paymentSlipUrl: string | null };
    expect(body.signatureUrl).toBeNull();
    expect(body.paymentSlipUrl).toBeNull();
    expect(sb._signCalls).toHaveLength(0);
  });

  it("returns null url field when Storage sign fails (defensive — no leak of internal error)", async () => {
    const sigPath = `orders-attachments/${DEALER_A}/wiz-1/signature.png`;
    const oneRow = {
      ...makeOrderRow({ signature_url: sigPath, payment_slip_url: null }),
      order_lines: [],
      order_addons: [],
      order_history: [],
    };
    const sb = buildSb({ one: oneRow }, { signError: true });
    vi.mocked(userClient).mockReturnValue(sb);
    const jwt = await makeJwt("dealer", DEALER_A);
    const res = await app.fetch(
      new Request("http://t/api/orders/11111111-1111-1111-1111-111111111111", {
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { signatureUrl: string | null };
    expect(body.signatureUrl).toBeNull();
    expect(sb._signCalls).toHaveLength(1); // attempted, then swallowed
  });
});

// 2026-05-12 (Loo) — Sales Order data for client-side render.
describe("GET /api/orders/:id/sales-order-data", () => {
  const ORDER_ID = "11111111-1111-1111-1111-111111111111";

  function makeJoinedRow(over: Partial<Record<string, unknown>> = {}) {
    return {
      ...makeOrderRow({
        customer_name: "Tan Mei Ling",
        customer_phone: "012-3456789",
        customer_address: "123 Jalan Sample, 50000 KL",
        delivery_date: "2026-06-01",
        delivery_floor: 3,
        delivery_has_lift: true,
        paid: "750",
        placed_at: "2026-05-12T10:00:00Z",
        ...over,
      }),
      order_lines: [
        {
          sku: "sofa:atrium:part:L-piece",
          qty: 1,
          unit_price: "1149.50",
          attrs: { mode: "custom", fabric_name: "Linen", fabric_surcharge: 0 },
        },
      ],
      order_addons: [{ addon_key: "stair_carry", qty: 1, unit_price: "60" }],
      dealers: { name: "Mattress King", contact: "012-1111111" },
      outlets: null,
      salespersons: null,
    };
  }

  it("returns JSON payload for dealer role (browser does the render)", async () => {
    const sb = buildSb({ one: makeJoinedRow() });
    vi.mocked(userClient).mockReturnValue(sb);
    const jwt = await makeJwt("dealer", DEALER_A);
    const res = await app.fetch(
      new Request(`http://t/api/orders/${ORDER_ID}/sales-order-data`, {
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toMatch(/application\/json/);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const body = (await res.json()) as any;
    expect(body.so_number).toBe("SO-001001");
    expect(body.order_code).toBe("SO-1001");
    expect(body.customer.name).toBe("Tan Mei Ling");
    expect(body.lines).toHaveLength(1);
    expect(body.addons).toHaveLength(1);
  });

  it("admits operation (revised 2026-05-12 — they need it on handover)", async () => {
    vi.mocked(userClient).mockReturnValue(buildSb({ one: makeJoinedRow() }));
    const jwt = await makeJwt("operation", null);
    const res = await app.fetch(
      new Request(`http://t/api/orders/${ORDER_ID}/sales-order-data`, {
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toMatch(/application\/json/);
  });

  it("returns 403 for partner role", async () => {
    vi.mocked(userClient).mockReturnValue(buildSb({ one: makeJoinedRow() }));
    const jwt = await makeJwt("partner", null);
    const res = await app.fetch(
      new Request(`http://t/api/orders/${ORDER_ID}/sales-order-data`, {
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    expect(res.status).toBe(403);
  });

  it("returns 403 for supplier role", async () => {
    vi.mocked(userClient).mockReturnValue(buildSb({ one: makeJoinedRow() }));
    const jwt = await makeJwt("supplier", null);
    const res = await app.fetch(
      new Request(`http://t/api/orders/${ORDER_ID}/sales-order-data`, {
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    expect(res.status).toBe(403);
  });

  it("admits finance + principal too (customer-facing doc, internal roles)", async () => {
    for (const role of ["finance", "principal"] as const) {
      vi.mocked(userClient).mockReturnValue(buildSb({ one: makeJoinedRow() }));
      const jwt = await makeJwt(role, null);
      const res = await app.fetch(
        new Request(`http://t/api/orders/${ORDER_ID}/sales-order-data`, {
          headers: { Authorization: `Bearer ${jwt}` },
        }),
        env,
      );
      expect(res.status).toBe(200);
    }
  });

  it("returns 404 for missing order (RLS-hidden or genuinely absent)", async () => {
    vi.mocked(userClient).mockReturnValue(buildSb({ one: null }));
    const jwt = await makeJwt("dealer", DEALER_A);
    const res = await app.fetch(
      new Request(`http://t/api/orders/${ORDER_ID}/sales-order-data`, {
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    expect(res.status).toBe(404);
  });

  it("returns 404 for malformed UUID (no DB call)", async () => {
    vi.mocked(userClient).mockReturnValue(buildSb({ one: null }));
    const jwt = await makeJwt("dealer", DEALER_A);
    const res = await app.fetch(
      new Request(`http://t/api/orders/not-a-uuid/sales-order-data`, {
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    expect(res.status).toBe(404);
  });
});

describe("POST /api/orders", () => {
  const NEW_ORDER_ID = "11111111-1111-1111-1111-111111111111";

  it("happy path → calls RPC, then refetches order with rels, returns 201 + full order", async () => {
    const sb = buildSbForCreate({
      rpcResult: { id: NEW_ORDER_ID, so: 1251, placed_at: "2026-05-02T10:00:00Z" },
      fetchedRow: {
        ...makeOrderRow({
          id: NEW_ORDER_ID,
          so: 1251,
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
    const body = (await res.json()) as { id: string; so: number; lines: unknown[]; history: unknown[] };
    expect(body.id).toBe(NEW_ORDER_ID);
    expect(body.so).toBe(1251);
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

  // Migration 0089 (Loo 2026-05-11) — sofa cannot mix with mattress / bedframe.
  // The RPC raises 22023 with DETAIL='mixed_category_lines'; the route maps
  // this specific detail to 422 + code so the UI can surface a friendly toast.
  it("maps RPC 22023 mixed_category_lines → 422 with typed code", async () => {
    const sb = buildSbForCreate({
      rpcError: {
        code: "22023",
        message: "sofa cannot mix with mattress or bedframe in the same order",
        details: "mixed_category_lines",
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
    expect(res.status).toBe(422);
    const body = (await res.json()) as { code?: string; message?: string };
    expect(body.code).toBe("mixed_category_lines");
    expect(body.message).toMatch(/sofa/i);
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

  // 2026-05-22 (Loo) — server-side lead-time floor for delivery.date.
  // Mattress + bedframe = 14 days, sofa = 21 days (see shared
  // DELIVERY_LEAD_DAYS). The wizard gates this client-side; these tests
  // verify the curl/devtools bypass is shut.
  describe("lead-time validation", () => {
    it("rejects 422 lead_time_violation when mattress order has delivery.date < today + 14d", async () => {
      const today = new Date();
      const tooSoon = new Date(today);
      tooSoon.setDate(tooSoon.getDate() + 5);
      const tooSoonIso = tooSoon.toISOString().slice(0, 10);

      const sb = buildSbForCreate({
        productSkuCategoryRows: [{ product_models: { category: "mattress" } }],
      });
      vi.mocked(userClient).mockReturnValue(sb);
      const jwt = await makeJwt("dealer", DEALER_A);
      const res = await app.fetch(
        new Request("http://t/api/orders", {
          method: "POST",
          headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
          body: JSON.stringify(
            validCreateBody({ delivery: { date: tooSoonIso, proceedDate: tooSoonIso, dateTbd: false, floor: 1, hasLift: false } }),
          ),
        }),
        env,
      );
      expect(res.status).toBe(422);
      const body = (await res.json()) as { code?: string; leadDays?: number };
      expect(body.code).toBe("lead_time_violation");
      expect(body.leadDays).toBe(14);
      // Critically: RPC was NOT called — server bailed before DB write
      expect(sb._rpcCalls).toHaveLength(0);
    });

    it("rejects 422 with leadDays=21 when sofa order has delivery.date < today + 21d", async () => {
      const today = new Date();
      const tooSoon = new Date(today);
      tooSoon.setDate(tooSoon.getDate() + 15);
      const tooSoonIso = tooSoon.toISOString().slice(0, 10);

      const sb = buildSbForCreate({
        productSkuCategoryRows: [{ product_models: { category: "sofa" } }],
      });
      vi.mocked(userClient).mockReturnValue(sb);
      const jwt = await makeJwt("dealer", DEALER_A);
      const res = await app.fetch(
        new Request("http://t/api/orders", {
          method: "POST",
          headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
          body: JSON.stringify(
            validCreateBody({ delivery: { date: tooSoonIso, proceedDate: tooSoonIso, dateTbd: false, floor: 1, hasLift: false } }),
          ),
        }),
        env,
      );
      expect(res.status).toBe(422);
      const body = (await res.json()) as { code?: string; leadDays?: number };
      expect(body.code).toBe("lead_time_violation");
      expect(body.leadDays).toBe(21);
    });

    it("accepts 201 when mattress order's delivery.date >= today + 14d", async () => {
      const today = new Date();
      const okDate = new Date(today);
      okDate.setDate(okDate.getDate() + 30);
      const okIso = okDate.toISOString().slice(0, 10);

      const sb = buildSbForCreate({
        rpcResult: { id: NEW_ORDER_ID, so: 1042, placed_at: "2026-05-22T00:00:00Z" },
        fetchedRow: makeOrderRow({
          id: NEW_ORDER_ID,
          delivery_date: okIso,
          signature_url: `orders-attachments/${DEALER_A}/wiz/signature.png`,
          terms_accepted: true,
        }),
        productSkuCategoryRows: [{ product_models: { category: "mattress" } }],
      });
      vi.mocked(userClient).mockReturnValue(sb);
      const jwt = await makeJwt("dealer", DEALER_A);
      const res = await app.fetch(
        new Request("http://t/api/orders", {
          method: "POST",
          headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
          body: JSON.stringify(
            validCreateBody({ delivery: { date: okIso, proceedDate: okIso, dateTbd: false, floor: 1, hasLift: false } }),
          ),
        }),
        env,
      );
      expect(res.status).toBe(201);
      // RPC fired exactly once (lead-time gate passed)
      expect(sb._rpcCalls.filter((c: { name: string }) => c.name === "create_order")).toHaveLength(1);
    });

    it("skips lead-time check when delivery.date is null (TBD path)", async () => {
      const sb = buildSbForCreate({
        rpcResult: { id: NEW_ORDER_ID, so: 1043, placed_at: "2026-05-22T00:00:00Z" },
        fetchedRow: makeOrderRow({
          id: NEW_ORDER_ID,
          delivery_date: null,
          delivery_date_tbd: true,
          signature_url: `orders-attachments/${DEALER_A}/wiz/signature.png`,
          terms_accepted: true,
        }),
        // Even if catalog says mattress, TBD bypasses — gate runs again at
        // POST /:id/date when dealer confirms a real date.
        productSkuCategoryRows: [{ product_models: { category: "mattress" } }],
      });
      vi.mocked(userClient).mockReturnValue(sb);
      const jwt = await makeJwt("dealer", DEALER_A);
      const res = await app.fetch(
        new Request("http://t/api/orders", {
          method: "POST",
          headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
          body: JSON.stringify(
            validCreateBody({ delivery: { date: null, proceedDate: null, dateTbd: true, floor: 1, hasLift: false } }),
          ),
        }),
        env,
      );
      expect(res.status).toBe(201);
    });
  });
});

// =============================================================================
// POST /api/orders/:id/proceed — Place→Proceed transition
// =============================================================================

/** Mocks `.rpc('proceed_order', { p_order_id })` + the post-success re-fetch
 *  chain. Set `rpcError` to simulate RPC validation failures (P0001 with a
 *  blocker code in DETAIL, 42501 cross-dealer, 42P01 not found, 22023 wrong
 *  status). Set `fetchedRow` to control what the re-fetch returns on success. */
function buildSbForProceed(opts: {
  rpcError?: { code?: string; message?: string; details?: string };
  fetchedRow?: unknown;
  /** Used by the server-side lead-time validator (POST /:id/date and
   *  PATCH /:id with delivery.date). The validator first fetches the
   *  order's lines, then joins product_skus → product_models.category. */
  productSkuCategoryRows?: Array<{ product_models: { category: string } | null }>;
  /** Optional SKU list returned by the order_lines fetch in
   *  `getOrderSkus`. Empty array (default) means the lead-time validator
   *  short-circuits at the "no SKUs" branch (fail-open). */
  orderLineSkus?: string[];
}) {
  const rpcCalls: Array<{ name: string; args: unknown }> = [];
  const eqs: Array<[string, unknown]> = [];
  let currentTable: string | null = null;
  const chain = {
    eq(col: string, val: unknown) {
      eqs.push([col, val]);
      // `.eq()` is the terminal builder call for `getOrderSkus`
      // (sb.from("order_lines").select("sku").eq("order_id", id)). Awaiting
      // the resulting builder is awaiting this object — return a thenable
      // result for the order_lines path; for every other table the test
      // still composes via .order/.maybeSingle so we keep returning chain.
      if (currentTable === "order_lines") {
        return Promise.resolve({
          data: (opts.orderLineSkus ?? []).map((sku) => ({ sku })),
          error: null,
        });
      }
      return chain;
    },
    in: async () => ({ data: opts.productSkuCategoryRows ?? [], error: null }),
    order: async () => ({ data: [], error: null }),
    maybeSingle: async () => ({ data: opts.fetchedRow ?? null, error: null }),
  };
  const storage = buildStorageMock();
  return Object.assign(
    {
      from: (table: string) => {
        currentTable = table;
        return { select: () => chain };
      },
      rpc: async (name: string, args: unknown) => {
        rpcCalls.push({ name, args });
        if (opts.rpcError) {
          return { data: null, error: opts.rpcError };
        }
        return {
          data: { id: "11111111-1111-1111-1111-111111111111", so: 1001, status: "proceed_order" },
          error: null,
        };
      },
      _rpcCalls: rpcCalls,
      _eqs: eqs,
    },
    storage,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ) as any;
}

const PROCEED_ID = "11111111-1111-1111-1111-111111111111";
const proceedUrl = `http://t/api/orders/${PROCEED_ID}/proceed`;

describe("POST /api/orders/:id/proceed", () => {
  it("200 — calls proceed_order RPC and returns the re-fetched order with proceed_order status", async () => {
    const sb = buildSbForProceed({
      fetchedRow: makeOrderRow({
        status: "proceed_order",
        signature_url: `orders-attachments/${DEALER_A}/wiz/signature.png`,
        terms_accepted: true,
      }),
    });
    vi.mocked(userClient).mockReturnValue(sb);
    const jwt = await makeJwt("dealer", DEALER_A);
    const res = await app.fetch(
      new Request(proceedUrl, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { status?: string; code?: string | null; message?: string; error?: string };
    expect(body.status).toBe("proceed_order");
    expect(sb._rpcCalls).toHaveLength(1);
    expect(sb._rpcCalls[0].name).toBe("proceed_order");
    expect(sb._rpcCalls[0].args).toEqual({ p_order_id: PROCEED_ID });
  });

  it("422 with code='signature_required' when RPC raises P0001 with blocker DETAIL", async () => {
    const sb = buildSbForProceed({
      rpcError: {
        code: "P0001",
        message: "Customer signature is required",
        details: "signature_required",
      },
    });
    vi.mocked(userClient).mockReturnValue(sb);
    const jwt = await makeJwt("dealer", DEALER_A);
    const res = await app.fetch(
      new Request(proceedUrl, { method: "POST", headers: { Authorization: `Bearer ${jwt}` } }),
      env,
    );
    expect(res.status).toBe(422);
    const body = (await res.json()) as { status?: string; code?: string | null; message?: string; error?: string };
    expect(body.code).toBe("signature_required");
    expect(body.error).toBe("proceed_order_blocked");
  });

  it("422 with code='payment_below_50' when RPC raises P0001", async () => {
    const sb = buildSbForProceed({
      rpcError: {
        code: "P0001",
        message: "Payment must be at least 50 percent of total",
        details: "payment_below_50",
      },
    });
    vi.mocked(userClient).mockReturnValue(sb);
    const jwt = await makeJwt("dealer", DEALER_A);
    const res = await app.fetch(
      new Request(proceedUrl, { method: "POST", headers: { Authorization: `Bearer ${jwt}` } }),
      env,
    );
    expect(res.status).toBe(422);
    const body = (await res.json()) as { status?: string; code?: string | null; message?: string; error?: string };
    expect(body.code).toBe("payment_below_50");
  });

  it("422 with code='wrong_status' when RPC raises 22023", async () => {
    const sb = buildSbForProceed({
      rpcError: { code: "22023", message: "Order is not in Place status", details: "wrong_status" },
    });
    vi.mocked(userClient).mockReturnValue(sb);
    const jwt = await makeJwt("dealer", DEALER_A);
    const res = await app.fetch(
      new Request(proceedUrl, { method: "POST", headers: { Authorization: `Bearer ${jwt}` } }),
      env,
    );
    expect(res.status).toBe(422);
    const body = (await res.json()) as { status?: string; code?: string | null; message?: string; error?: string };
    expect(body.code).toBe("wrong_status");
  });

  it("403 when RPC raises 42501 (cross-dealer)", async () => {
    const sb = buildSbForProceed({
      rpcError: { code: "42501", message: "forbidden: cross-dealer proceed", details: "forbidden" },
    });
    vi.mocked(userClient).mockReturnValue(sb);
    const jwt = await makeJwt("dealer", DEALER_A);
    const res = await app.fetch(
      new Request(proceedUrl, { method: "POST", headers: { Authorization: `Bearer ${jwt}` } }),
      env,
    );
    expect(res.status).toBe(403);
  });

  it("404 when RPC raises 42P01 (order not found)", async () => {
    const sb = buildSbForProceed({
      rpcError: { code: "42P01", message: "Order not found", details: "order_not_found" },
    });
    vi.mocked(userClient).mockReturnValue(sb);
    const jwt = await makeJwt("dealer", DEALER_A);
    const res = await app.fetch(
      new Request(proceedUrl, { method: "POST", headers: { Authorization: `Bearer ${jwt}` } }),
      env,
    );
    expect(res.status).toBe(404);
  });

  it("404 on non-uuid path param (no RPC called)", async () => {
    const sb = buildSbForProceed({});
    vi.mocked(userClient).mockReturnValue(sb);
    const jwt = await makeJwt("dealer", DEALER_A);
    const res = await app.fetch(
      new Request("http://t/api/orders/not-a-uuid/proceed", {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    expect(res.status).toBe(404);
    expect(sb._rpcCalls).toHaveLength(0);
  });

  it("401 without Authorization header", async () => {
    const res = await app.fetch(new Request(proceedUrl, { method: "POST" }), env);
    expect(res.status).toBe(401);
  });

  it("422 body still has code=null when DETAIL is unrecognized (defensive)", async () => {
    // If the RPC ever raises with a DETAIL value outside our enum (older code,
    // typo, etc.), the API route still returns 422 but with code=null so the
    // client falls back to the generic message instead of trying to look up a
    // bogus code in PROCEED_BLOCKER_LABEL.
    const sb = buildSbForProceed({
      rpcError: { code: "P0001", message: "Some unknown failure", details: "not_a_known_code" },
    });
    vi.mocked(userClient).mockReturnValue(sb);
    const jwt = await makeJwt("dealer", DEALER_A);
    const res = await app.fetch(
      new Request(proceedUrl, { method: "POST", headers: { Authorization: `Bearer ${jwt}` } }),
      env,
    );
    expect(res.status).toBe(422);
    const body = (await res.json()) as { status?: string; code?: string | null; message?: string; error?: string };
    expect(body.code).toBeNull();
    expect(body.message).toBe("Some unknown failure");
  });
});

// =============================================================================
// POST /api/orders/:id/top-up — partial payment toward order total
// POST /api/orders/:id/address — fill in deferred delivery address
// POST /api/orders/:id/date — confirm TBD delivery date
// All three share the same dispatchOrderMutation helper, so we test the
// happy path + RPC error mapping for each plus body validation.
// =============================================================================

const topUpUrl = `http://t/api/orders/${PROCEED_ID}/top-up`;
const addressUrl = `http://t/api/orders/${PROCEED_ID}/address`;
const dateUrl = `http://t/api/orders/${PROCEED_ID}/date`;

function validTopUpBody(over: Record<string, unknown> = {}) {
  return {
    amount: 500,
    method: "bank",
    methodLabel: "Bank transfer",
    reference: "MB-12345",
    note: null,
    date: "2026-05-03",
    photoPaths: [`orders-attachments/${DEALER_A}/topup-1/receipt.jpg`],
    ...over,
  };
}

describe("POST /api/orders/:id/top-up", () => {
  it("200 — calls top_up_order RPC, validates dealer-owned photo paths, returns shaped order", async () => {
    const sb = buildSbForProceed({
      fetchedRow: makeOrderRow({
        signature_url: `orders-attachments/${DEALER_A}/wiz/signature.png`,
        terms_accepted: true,
      }),
    });
    vi.mocked(userClient).mockReturnValue(sb);
    const jwt = await makeJwt("dealer", DEALER_A);
    const res = await app.fetch(
      new Request(topUpUrl, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify(validTopUpBody()),
      }),
      env,
    );
    expect(res.status).toBe(200);
    expect(sb._rpcCalls[0].name).toBe("top_up_order");
    expect((sb._rpcCalls[0].args as Record<string, unknown>).p_amount).toBe(500);
    expect((sb._rpcCalls[0].args as Record<string, unknown>).p_method).toBe("bank");
  });

  it("400 when a photoPath is outside the caller's dealer folder", async () => {
    const sb = buildSbForProceed({});
    vi.mocked(userClient).mockReturnValue(sb);
    const jwt = await makeJwt("dealer", DEALER_A);
    const res = await app.fetch(
      new Request(topUpUrl, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify(
          validTopUpBody({
            photoPaths: [`orders-attachments/${DEALER_B}/topup-1/receipt.jpg`],
          }),
        ),
      }),
      env,
    );
    expect(res.status).toBe(400);
    expect(sb._rpcCalls).toHaveLength(0);
  });

  it("422 when RPC raises P0001 with already_paid DETAIL", async () => {
    const sb = buildSbForProceed({
      rpcError: { code: "22023", message: "Order is already fully paid", details: "already_paid" },
    });
    vi.mocked(userClient).mockReturnValue(sb);
    const jwt = await makeJwt("dealer", DEALER_A);
    const res = await app.fetch(
      new Request(topUpUrl, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify(validTopUpBody()),
      }),
      env,
    );
    expect(res.status).toBe(422);
    const body = (await res.json()) as { code?: string | null; error?: string };
    expect(body.code).toBe("already_paid");
    expect(body.error).toBe("top_up_blocked");
  });

  it("400 on invalid body shape", async () => {
    const sb = buildSbForProceed({});
    vi.mocked(userClient).mockReturnValue(sb);
    const jwt = await makeJwt("dealer", DEALER_A);
    const res = await app.fetch(
      new Request(topUpUrl, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ amount: -50 }),
      }),
      env,
    );
    expect(res.status).toBe(400);
    expect(sb._rpcCalls).toHaveLength(0);
  });

  it("401 without Authorization header", async () => {
    const res = await app.fetch(
      new Request(topUpUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(validTopUpBody()),
      }),
      env,
    );
    expect(res.status).toBe(401);
  });
});

describe("POST /api/orders/:id/address", () => {
  it("200 — calls set_order_address RPC", async () => {
    const sb = buildSbForProceed({
      fetchedRow: makeOrderRow({
        customer_address: "123 Jalan Updated, 50000 KL",
        customer_address_unknown: false,
        signature_url: `orders-attachments/${DEALER_A}/wiz/signature.png`,
        terms_accepted: true,
      }),
    });
    vi.mocked(userClient).mockReturnValue(sb);
    const jwt = await makeJwt("dealer", DEALER_A);
    const res = await app.fetch(
      new Request(addressUrl, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          address: "123 Jalan Updated, 50000 KL",
          billing: null,
          billingSame: true,
        }),
      }),
      env,
    );
    expect(res.status).toBe(200);
    expect(sb._rpcCalls[0].name).toBe("set_order_address");
    expect((sb._rpcCalls[0].args as Record<string, unknown>).p_address).toBe("123 Jalan Updated, 50000 KL");
  });

  it("400 when address is too short", async () => {
    const sb = buildSbForProceed({});
    vi.mocked(userClient).mockReturnValue(sb);
    const jwt = await makeJwt("dealer", DEALER_A);
    const res = await app.fetch(
      new Request(addressUrl, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ address: "abc", billing: null, billingSame: true }),
      }),
      env,
    );
    expect(res.status).toBe(400);
  });

  it("422 when RPC says wrong status", async () => {
    const sb = buildSbForProceed({
      rpcError: { code: "22023", message: "Not in Place", details: "wrong_status" },
    });
    vi.mocked(userClient).mockReturnValue(sb);
    const jwt = await makeJwt("dealer", DEALER_A);
    const res = await app.fetch(
      new Request(addressUrl, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          address: "123 Jalan Long Enough Address, 50000 KL",
          billing: null,
          billingSame: true,
        }),
      }),
      env,
    );
    expect(res.status).toBe(422);
    const body = (await res.json()) as { code?: string | null };
    expect(body.code).toBe("wrong_status");
  });
});

describe("POST /api/orders/:id/date", () => {
  it("200 — calls set_order_date RPC", async () => {
    const sb = buildSbForProceed({
      fetchedRow: makeOrderRow({
        delivery_date: "2026-06-15",
        delivery_date_tbd: false,
        signature_url: `orders-attachments/${DEALER_A}/wiz/signature.png`,
        terms_accepted: true,
      }),
    });
    vi.mocked(userClient).mockReturnValue(sb);
    const jwt = await makeJwt("dealer", DEALER_A);
    const res = await app.fetch(
      new Request(dateUrl, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ date: "2026-06-15", proceedDate: "2026-06-01" }),
      }),
      env,
    );
    expect(res.status).toBe(200);
    expect(sb._rpcCalls[0].name).toBe("set_order_date");
    expect((sb._rpcCalls[0].args as Record<string, unknown>).p_date).toBe("2026-06-15");
    expect((sb._rpcCalls[0].args as Record<string, unknown>).p_proceed_date).toBe("2026-06-01");
  });

  it("400 when date string is malformed", async () => {
    const sb = buildSbForProceed({});
    vi.mocked(userClient).mockReturnValue(sb);
    const jwt = await makeJwt("dealer", DEALER_A);
    const res = await app.fetch(
      new Request(dateUrl, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ date: "not-a-date", proceedDate: "2026-06-01" }),
      }),
      env,
    );
    expect(res.status).toBe(400);
  });

  it("422 lead_time_violation when confirmed date is < today + 14d for a mattress order", async () => {
    const today = new Date();
    const tooSoon = new Date(today);
    tooSoon.setDate(tooSoon.getDate() + 5);
    const tooSoonIso = tooSoon.toISOString().slice(0, 10);

    const sb = buildSbForProceed({
      orderLineSkus: ["mattress-1"],
      productSkuCategoryRows: [{ product_models: { category: "mattress" } }],
    });
    vi.mocked(userClient).mockReturnValue(sb);
    const jwt = await makeJwt("dealer", DEALER_A);
    const res = await app.fetch(
      new Request(dateUrl, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ date: tooSoonIso, proceedDate: tooSoonIso }),
      }),
      env,
    );
    expect(res.status).toBe(422);
    const body = (await res.json()) as { code?: string; leadDays?: number };
    expect(body.code).toBe("lead_time_violation");
    expect(body.leadDays).toBe(14);
    // Critically: set_order_date RPC was NOT called — server bailed first
    expect(sb._rpcCalls.some((c: { name: string }) => c.name === "set_order_date")).toBe(false);
  });
});

// =============================================================================
// PATCH /api/orders/:id — Phase 2C.2 full edit
// =============================================================================

const editUrl = `http://t/api/orders/${PROCEED_ID}`;

describe("PATCH /api/orders/:id", () => {
  it("200 — flattens camelCase to snake_case payload, calls update_order RPC", async () => {
    const sb = buildSbForProceed({
      fetchedRow: makeOrderRow({
        customer_name: "Updated Name",
        signature_url: `orders-attachments/${DEALER_A}/wiz/signature.png`,
        terms_accepted: true,
      }),
    });
    vi.mocked(userClient).mockReturnValue(sb);
    const jwt = await makeJwt("dealer", DEALER_A);
    const res = await app.fetch(
      new Request(editUrl, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          customer: { name: "Updated Name", phone: "012-9988776" },
          // 2026-05-22 (Loo) — floor capped at MAX_DELIVERY_FLOOR (3) since
          // Carres doesn't stair-carry above floor 3. The original test used
          // floor: 5 to assert the flattening path; floor: 3 exercises the
          // same path and now also satisfies the new max constraint.
          delivery: { floor: 3, hasLift: true },
        }),
      }),
      env,
    );
    expect(res.status).toBe(200);
    expect(sb._rpcCalls[0].name).toBe("update_order");
    const args = sb._rpcCalls[0].args as { p_payload: Record<string, unknown> };
    expect(args.p_payload.customer_name).toBe("Updated Name");
    expect(args.p_payload.customer_phone).toBe("012-9988776");
    expect(args.p_payload.delivery_floor).toBe(3);
    expect(args.p_payload.delivery_has_lift).toBe(true);
  });

  it("422 with code='wrong_status' when RPC says order isn't in Place", async () => {
    const sb = buildSbForProceed({
      rpcError: {
        code: "22023",
        message: "Order is no longer editable",
        details: "wrong_status",
      },
    });
    vi.mocked(userClient).mockReturnValue(sb);
    const jwt = await makeJwt("dealer", DEALER_A);
    const res = await app.fetch(
      new Request(editUrl, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ customer: { name: "Updated Name" } }),
      }),
      env,
    );
    expect(res.status).toBe(422);
    const body = (await res.json()) as { code?: string | null; error?: string };
    expect(body.code).toBe("wrong_status");
    expect(body.error).toBe("update_order_blocked");
  });

  it("400 when neither customer nor delivery is provided", async () => {
    const sb = buildSbForProceed({});
    vi.mocked(userClient).mockReturnValue(sb);
    const jwt = await makeJwt("dealer", DEALER_A);
    const res = await app.fetch(
      new Request(editUrl, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({}),
      }),
      env,
    );
    expect(res.status).toBe(400);
    expect(sb._rpcCalls).toHaveLength(0);
  });

  it("403 when RPC returns 42501 (cross-dealer)", async () => {
    const sb = buildSbForProceed({
      rpcError: { code: "42501", message: "forbidden", details: "forbidden" },
    });
    vi.mocked(userClient).mockReturnValue(sb);
    const jwt = await makeJwt("dealer", DEALER_A);
    const res = await app.fetch(
      new Request(editUrl, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ customer: { name: "Cross-dealer attempt" } }),
      }),
      env,
    );
    expect(res.status).toBe(403);
  });

  // 2026-05-22 (Loo) — lead-time floor also enforced on edit. The wizard
  // bakes the gate into Step 3, but a curl PATCH would otherwise bypass it
  // because dealers can edit Place orders freely.
  it("422 lead_time_violation when patching delivery.date to < today + 14d on a mattress order", async () => {
    const today = new Date();
    const tooSoon = new Date(today);
    tooSoon.setDate(tooSoon.getDate() + 3);
    const tooSoonIso = tooSoon.toISOString().slice(0, 10);

    const sb = buildSbForProceed({
      orderLineSkus: ["mattress-1"],
      productSkuCategoryRows: [{ product_models: { category: "mattress" } }],
    });
    vi.mocked(userClient).mockReturnValue(sb);
    const jwt = await makeJwt("dealer", DEALER_A);
    const res = await app.fetch(
      new Request(editUrl, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ delivery: { date: tooSoonIso } }),
      }),
      env,
    );
    expect(res.status).toBe(422);
    const body = (await res.json()) as { code?: string; leadDays?: number };
    expect(body.code).toBe("lead_time_violation");
    expect(body.leadDays).toBe(14);
    expect(sb._rpcCalls.some((c: { name: string }) => c.name === "update_order")).toBe(false);
  });

  it("200 when patching delivery.date to a date >= today + 14d on a mattress order", async () => {
    const today = new Date();
    const okDate = new Date(today);
    okDate.setDate(okDate.getDate() + 30);
    const okIso = okDate.toISOString().slice(0, 10);

    const sb = buildSbForProceed({
      fetchedRow: makeOrderRow({
        delivery_date: okIso,
        signature_url: `orders-attachments/${DEALER_A}/wiz/signature.png`,
        terms_accepted: true,
      }),
      orderLineSkus: ["mattress-1"],
      productSkuCategoryRows: [{ product_models: { category: "mattress" } }],
    });
    vi.mocked(userClient).mockReturnValue(sb);
    const jwt = await makeJwt("dealer", DEALER_A);
    const res = await app.fetch(
      new Request(editUrl, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ delivery: { date: okIso } }),
      }),
      env,
    );
    expect(res.status).toBe(200);
    expect(sb._rpcCalls.some((c: { name: string }) => c.name === "update_order")).toBe(true);
  });
});

// =============================================================================
// POST /api/orders/:id/cancel — Phase 2C.3 dealer cancel
// =============================================================================

const cancelUrl = `http://t/api/orders/${PROCEED_ID}/cancel`;

describe("POST /api/orders/:id/cancel", () => {
  it("200 — calls cancel_order RPC with reason", async () => {
    const sb = buildSbForProceed({
      fetchedRow: makeOrderRow({
        status: "cancelled",
        signature_url: `orders-attachments/${DEALER_A}/wiz/signature.png`,
        terms_accepted: true,
      }),
    });
    vi.mocked(userClient).mockReturnValue(sb);
    const jwt = await makeJwt("dealer", DEALER_A);
    const res = await app.fetch(
      new Request(cancelUrl, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ reason: "Customer changed mind" }),
      }),
      env,
    );
    expect(res.status).toBe(200);
    expect(sb._rpcCalls[0].name).toBe("cancel_order");
    expect((sb._rpcCalls[0].args as Record<string, unknown>).p_reason).toBe("Customer changed mind");
  });

  it("200 — accepts null reason", async () => {
    const sb = buildSbForProceed({
      fetchedRow: makeOrderRow({
        status: "cancelled",
        signature_url: `orders-attachments/${DEALER_A}/wiz/signature.png`,
        terms_accepted: true,
      }),
    });
    vi.mocked(userClient).mockReturnValue(sb);
    const jwt = await makeJwt("dealer", DEALER_A);
    const res = await app.fetch(
      new Request(cancelUrl, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ reason: null }),
      }),
      env,
    );
    expect(res.status).toBe(200);
    expect((sb._rpcCalls[0].args as Record<string, unknown>).p_reason).toBeNull();
  });

  it("422 when RPC says wrong_status (already proceeded / cancelled)", async () => {
    const sb = buildSbForProceed({
      rpcError: {
        code: "22023",
        message: "Only Place orders can be cancelled by the dealer",
        details: "wrong_status",
      },
    });
    vi.mocked(userClient).mockReturnValue(sb);
    const jwt = await makeJwt("dealer", DEALER_A);
    const res = await app.fetch(
      new Request(cancelUrl, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ reason: "Late" }),
      }),
      env,
    );
    expect(res.status).toBe(422);
    const body = (await res.json()) as { code?: string | null; error?: string };
    expect(body.code).toBe("wrong_status");
    expect(body.error).toBe("cancel_order_blocked");
  });
});

// ---------------------------------------------------------------------------
// Phase 4 (sofa engine) — server recompute + 0.5% drift-reject on a sofa BUILD
// line (one carrying attrs.sofa_build). Needs a per-table Supabase mock because
// the recompute fans out to product_skus (model resolve) + the 5 catalog tables
// that make up the SofaPricingSnapshot, then create_order + the order re-fetch.
// ---------------------------------------------------------------------------

interface SofaTableData {
  list?: unknown[];
  one?: unknown;
  error?: { message: string } | null;
}

/** Supabase mock that routes .from(table) to per-table data + records rpc +
 *  from() calls. The chain is thenable (resolves to the table list) so a query
 *  terminated by .select()/.eq()/.is() awaits to {data:list}, while
 *  .maybeSingle() awaits to {data:one}. */
function buildSbForSofa(opts: {
  tables: Record<string, SofaTableData>;
  rpcResult?: { id: string; so: number; placed_at: string };
  rpcError?: { code?: string; message?: string; details?: string };
}) {
  const rpcCalls: Array<{ name: string; payload: unknown }> = [];
  const fromCalls: string[] = [];
  function makeChain(table: string) {
    const listRes = () => ({
      data: opts.tables[table]?.list ?? [],
      error: opts.tables[table]?.error ?? null,
    });
    const oneRes = () => ({
      data: opts.tables[table]?.one ?? null,
      error: opts.tables[table]?.error ?? null,
    });
    const chain: Record<string, unknown> = {
      select: () => chain,
      eq: () => chain,
      is: () => chain,
      in: async () => listRes(),
      order: async () => listRes(),
      maybeSingle: async () => oneRes(),
      then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
        Promise.resolve(listRes()).then(resolve, reject),
    };
    return chain;
  }
  return Object.assign(
    {
      from: (table: string) => {
        fromCalls.push(table);
        return makeChain(table);
      },
      rpc: async (name: string, args: { payload: unknown }) => {
        rpcCalls.push({ name, payload: args.payload });
        if (opts.rpcError) return { data: null, error: opts.rpcError };
        return { data: opts.rpcResult ?? null, error: null };
      },
      _rpcCalls: rpcCalls,
      _fromCalls: fromCalls,
    },
    buildStorageMock(),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ) as any;
}

const SOFA_MODEL_ID = "00000000-0000-0000-0000-0000000m0del";
const SOFA_REP_SKU = "SOFA-OHANA-REP";

/** Pool: 2A = RM1000, 1A = RM600. No per-model overrides, no combos → a build
 *  of [2A, 1A] at PRICE_1 prices à-la-carte to RM1600. */
function sofaTables(over: Partial<Record<string, SofaTableData>> = {}): Record<string, SofaTableData> {
  return {
    product_skus: { one: { model_id: SOFA_MODEL_ID } },
    sofa_compartments: {
      list: [
        { id: "comp-2a", code: "2A", description: null, seat_count: 2, arm_config: null, icon_url: null, default_price: "1000", sort_order: 0, active: true },
        { id: "comp-1a", code: "1A", description: null, seat_count: 1, arm_config: null, icon_url: null, default_price: "600", sort_order: 1, active: true },
      ],
    },
    model_sofa_compartments: { list: [] },
    sofa_combo_pricing: { list: [] },
    fabric_tier_addon_config: { one: null },
    model_fabric_tier_overrides: { one: null },
    orders: {
      one: {
        ...makeOrderRow({ id: "11111111-1111-1111-1111-111111111111", dealer_id: DEALER_A }),
        order_lines: [],
        order_addons: [],
        order_history: [],
      },
    },
    ...over,
  };
}

/** A create body whose single line is a sofa build (cells 2A + 1A, PRICE_1).
 *  Delivery is TBD so the lead-time validator (which also hits product_skus) is
 *  skipped — keeps the mock focused on the recompute path. */
function buildOrderBody(unitPrice: number, sofaBuildOver: Record<string, unknown> = {}) {
  return validCreateBody({
    delivery: { date: null, proceedDate: null, dateTbd: true, floor: 1, hasLift: false },
    lines: [
      {
        sku: SOFA_REP_SKU,
        qty: 1,
        unitPrice,
        attrs: {
          mode: "build",
          fabric_id: null,
          fabric_name: null,
          fabric_surcharge: 0,
          fabric_tier: "PRICE_1",
          sofa_build: {
            cells: [
              { moduleCode: "2A", x: 0, y: 0, rot: 0 },
              { moduleCode: "1A", x: 200, y: 0, rot: 0 },
            ],
            height: "28",
          },
          sofa_build_key: "sc_test_1",
          ...sofaBuildOver,
        },
      },
    ],
  });
}

describe("POST /api/orders — sofa build recompute (Phase 4)", () => {
  const NEW_ID = "11111111-1111-1111-1111-111111111111";
  const rpcOk = { id: NEW_ID, so: 1301, placed_at: "2026-06-23T00:00:00Z" };

  it("accepts an honest client price (within 0.5%) and overwrites it with the server number", async () => {
    // Client claims RM1605; server computes RM1600 (drift 0.31% < 0.5%).
    const sb = buildSbForSofa({ tables: sofaTables(), rpcResult: rpcOk });
    vi.mocked(userClient).mockReturnValue(sb);
    const jwt = await makeJwt("dealer", DEALER_A);
    const res = await app.fetch(
      new Request("http://t/api/orders", {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify(buildOrderBody(1605)),
      }),
      env,
    );
    expect(res.status).toBe(201);
    // create_order was called with the SERVER price (1600), not the client 1605.
    expect(sb._rpcCalls).toHaveLength(1);
    const payload = sb._rpcCalls[0]!.payload as { lines: Array<{ unit_price: number }> };
    expect(payload.lines[0]!.unit_price).toBe(1600);
  });

  it("rejects a tampered client price (> 0.5% drift) with 422 sofa_price_drift and does NOT create", async () => {
    const sb = buildSbForSofa({ tables: sofaTables(), rpcResult: rpcOk });
    vi.mocked(userClient).mockReturnValue(sb);
    const jwt = await makeJwt("dealer", DEALER_A);
    const res = await app.fetch(
      new Request("http://t/api/orders", {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify(buildOrderBody(9999)),
      }),
      env,
    );
    expect(res.status).toBe(422);
    const body = (await res.json()) as { error: string; code: string; serverTotal: number };
    expect(body.error).toBe("rule_violation");
    expect(body.code).toBe("sofa_price_drift");
    expect(body.serverTotal).toBe(1600);
    // No order created.
    expect(sb._rpcCalls).toHaveLength(0);
  });

  it("server price 0 + client 0 → accepted (genuine free build)", async () => {
    // Pool has none of the built codes → every cell prices to 0 → server 0.
    const sb = buildSbForSofa({
      tables: sofaTables({ sofa_compartments: { list: [] } }),
      rpcResult: rpcOk,
    });
    vi.mocked(userClient).mockReturnValue(sb);
    const jwt = await makeJwt("dealer", DEALER_A);
    const res = await app.fetch(
      new Request("http://t/api/orders", {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify(buildOrderBody(0)),
      }),
      env,
    );
    expect(res.status).toBe(201);
    expect(sb._rpcCalls).toHaveLength(1);
  });

  it("server price 0 + client > 0 → rejected (model can't justify any price)", async () => {
    const sb = buildSbForSofa({
      tables: sofaTables({ sofa_compartments: { list: [] } }),
      rpcResult: rpcOk,
    });
    vi.mocked(userClient).mockReturnValue(sb);
    const jwt = await makeJwt("dealer", DEALER_A);
    const res = await app.fetch(
      new Request("http://t/api/orders", {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify(buildOrderBody(1500)),
      }),
      env,
    );
    expect(res.status).toBe(422);
    expect(sb._rpcCalls).toHaveLength(0);
  });

  it("malformed sofa_build (empty cells) → 400 and no create", async () => {
    const sb = buildSbForSofa({ tables: sofaTables(), rpcResult: rpcOk });
    vi.mocked(userClient).mockReturnValue(sb);
    const jwt = await makeJwt("dealer", DEALER_A);
    const res = await app.fetch(
      new Request("http://t/api/orders", {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify(buildOrderBody(1600, { sofa_build: { cells: [], height: "28" } })),
      }),
      env,
    );
    expect(res.status).toBe(400);
    expect(sb._rpcCalls).toHaveLength(0);
  });

  it("unknown representative sku → 400 and no create", async () => {
    const sb = buildSbForSofa({
      tables: sofaTables({ product_skus: { one: null } }),
      rpcResult: rpcOk,
    });
    vi.mocked(userClient).mockReturnValue(sb);
    const jwt = await makeJwt("dealer", DEALER_A);
    const res = await app.fetch(
      new Request("http://t/api/orders", {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify(buildOrderBody(1600)),
      }),
      env,
    );
    expect(res.status).toBe(400);
    expect(sb._rpcCalls).toHaveLength(0);
  });

  it("a catalog read error fails CLOSED with 500 (never silently accepts)", async () => {
    const sb = buildSbForSofa({
      tables: sofaTables({ sofa_compartments: { error: { message: "boom" } } }),
      rpcResult: rpcOk,
    });
    vi.mocked(userClient).mockReturnValue(sb);
    const jwt = await makeJwt("dealer", DEALER_A);
    const res = await app.fetch(
      new Request("http://t/api/orders", {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify(buildOrderBody(1600)),
      }),
      env,
    );
    expect(res.status).toBe(500);
    expect(sb._rpcCalls).toHaveLength(0);
  });

  it("a non-build order skips the recompute entirely (no catalog fan-out)", async () => {
    const sb = buildSbForSofa({ tables: sofaTables(), rpcResult: rpcOk });
    vi.mocked(userClient).mockReturnValue(sb);
    const jwt = await makeJwt("dealer", DEALER_A);
    const res = await app.fetch(
      new Request("http://t/api/orders", {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        // validCreateBody = a normal mattress line (attrs: null), TBD delivery.
        body: JSON.stringify(
          validCreateBody({ delivery: { date: null, proceedDate: null, dateTbd: true, floor: 1, hasLift: false } }),
        ),
      }),
      env,
    );
    expect(res.status).toBe(201);
    expect(sb._rpcCalls).toHaveLength(1);
    // The recompute never ran → no sofa-catalog tables were touched.
    expect(sb._fromCalls).not.toContain("sofa_compartments");
  });

  it("two build lines on the same model fetch the snapshot only once (memoized)", async () => {
    const sb = buildSbForSofa({ tables: sofaTables(), rpcResult: rpcOk });
    vi.mocked(userClient).mockReturnValue(sb);
    const jwt = await makeJwt("dealer", DEALER_A);
    const body = buildOrderBody(1600);
    // Append a second identical build line (same model).
    (body.lines as unknown[]).push({
      sku: SOFA_REP_SKU,
      qty: 1,
      unitPrice: 1600,
      attrs: {
        mode: "build",
        fabric_tier: "PRICE_1",
        sofa_build: {
          cells: [
            { moduleCode: "2A", x: 0, y: 0, rot: 0 },
            { moduleCode: "1A", x: 200, y: 0, rot: 0 },
          ],
          height: "28",
        },
        sofa_build_key: "sc_test_2",
      },
    });
    const res = await app.fetch(
      new Request("http://t/api/orders", {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
      env,
    );
    expect(res.status).toBe(201);
    // Snapshot pool fetched exactly once despite two build lines.
    expect(sb._fromCalls.filter((t: string) => t === "sofa_compartments")).toHaveLength(1);
  });
});

import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from "vitest";
import { SignJWT, createLocalJWKSet, exportJWK, generateKeyPair, type JWK, type KeyLike } from "jose";
import app from "../index";
import { _setJwksForTesting } from "../middleware/auth";
import { mintStaffToken } from "../lib/staff-token";

vi.mock("../lib/supabase", () => ({
  userClient: vi.fn(),
  adminClient: vi.fn(),
}));

import { userClient, adminClient } from "../lib/supabase";

const SUPABASE_URL = "https://test.supabase.co";
const KID = "test-kid-ostaff";
const STAFF_SESSION_SECRET = "test-staff-secret-orders-0232";

const env = {
  SUPABASE_URL,
  SUPABASE_ANON_KEY: "test-anon",
  SUPABASE_SERVICE_ROLE_KEY: "test-service",
  SUPABASE_JWT_SECRET: "unused",
  STAFF_SESSION_SECRET,
};

const DEALER_A = "00000000-0000-0000-0000-000000000d01";
const DEALER_B = "00000000-0000-0000-0000-000000000d02";
const OUTLET_1 = "00000000-0000-0000-0000-00000000ee01";
const OUTLET_2 = "00000000-0000-0000-0000-00000000ee02";
const SP1 = "00000000-0000-0000-0000-00000000ff01";
const SP_OTHER = "00000000-0000-0000-0000-00000000ff09";
const ORDER_ID = "11111111-1111-1111-1111-111111111111";

let signKey: KeyLike;
let publicJwk: JWK;

async function makeJwt(role: string, dealerId: string | null) {
  return new SignJWT({
    email: "store@carres.com",
    app_metadata: { role, ...(dealerId ? { dealer_id: dealerId } : {}) },
  })
    .setProtectedHeader({ alg: "ES256", kid: KID, typ: "JWT" })
    .setSubject("11111111-1111-1111-1111-000000000999")
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(signKey);
}

function staffToken(tier: "principal" | "manager" | "salesperson", oid: string | null, sid: string | null, did = DEALER_A) {
  return mintStaffToken(env, { sid, did, oid, tier });
}

function buildStorage() {
  return {
    storage: {
      from: () => ({
        createSignedUrl: async (path: string, ttl: number) => ({
          data: { signedUrl: `https://signed.test/${path}?t=${ttl}` },
          error: null,
        }),
      }),
    },
  };
}

/** Records .eq()/.or() then resolves rows at .order() — GET list. */
function mockList(rows: unknown[]) {
  const eqs: Array<[string, unknown]> = [];
  const ors: string[] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const chain: any = {
    eq(col: string, val: unknown) {
      eqs.push([col, val]);
      return chain;
    },
    or(expr: string) {
      ors.push(expr);
      return chain;
    },
    order: async () => ({ data: rows, error: null }),
  };
  return Object.assign(
    { from: () => ({ select: () => chain }), _eqs: eqs, _ors: ors },
    buildStorage(),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ) as any;
}

/** Resolves one order row at .maybeSingle() — GET /:id. */
function mockDetail(row: unknown) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const chain: any = {
    eq() {
      return chain;
    },
    maybeSingle: async () => ({ data: row, error: null }),
  };
  return Object.assign(
    { from: () => ({ select: () => chain }) },
    buildStorage(),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ) as any;
}

/** activated = a non-empty pins EXISTS probe (adminClient .limit()). */
function mockAdminActivated(activated: boolean) {
  return {
    from: () => ({
      select: () => ({
        eq: () => ({
          limit: async () => ({ data: activated ? [{ salesperson_id: SP1 }] : [], error: null }),
        }),
      }),
    }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

function fullOrderRow(over: Record<string, unknown> = {}) {
  return {
    id: ORDER_ID,
    so: 1001,
    status: "place",
    channel: "dealer",
    dealer_id: DEALER_A,
    outlet_id: OUTLET_1,
    salesperson_id: SP1,
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
    order_lines: [],
    order_addons: [],
    order_history: [],
    ...over,
  };
}

/** POST create mock — table-aware (salespersons validation + orders re-fetch)
 *  + create_order rpc capture. Every recompute table is dormant/empty. */
function mockCreate(opts: { salespersonRow?: unknown | null; fetchedRow?: unknown }) {
  const rpcCalls: Array<{ name: string; args: { payload?: Record<string, unknown> } }> = [];
  function chain(table: string) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ch: any = {
      eq: () => ch,
      in: () => ch,
      is: () => ch,
      or: () => ch,
      order: async () => ({ data: [], error: null }),
      maybeSingle: async () => {
        if (table === "salespersons") return { data: opts.salespersonRow ?? null, error: null };
        if (table === "orders") return { data: opts.fetchedRow ?? fullOrderRow(), error: null };
        return { data: null, error: null }; // order_entry_config etc → code defaults
      },
      select: () => ch,
      then: (resolve: (v: unknown) => unknown) => resolve({ data: [], error: null }),
    };
    return ch;
  }
  return Object.assign(
    {
      from: (table: string) => ({
        select: () => chain(table),
        insert: async () => ({ error: null }),
      }),
      rpc: async (name: string, args: { payload?: Record<string, unknown> }) => {
        rpcCalls.push({ name, args });
        if (name === "create_order") return { data: { id: ORDER_ID }, error: null };
        return { data: null, error: null };
      },
      _rpcCalls: rpcCalls,
    },
    buildStorage(),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ) as any;
}

function createBody(over: Record<string, unknown> = {}) {
  return {
    outletId: OUTLET_2,
    salespersonId: SP_OTHER,
    customer: {
      name: "Tan Mei Ling",
      phone: "012-3456789",
      address: "123 Jalan Sample, 50000 KL",
      addressUnknown: false,
      billing: null,
      billingSame: true,
      emergency: "Tan Junior · 012-9988776 · Spouse",
    },
    // TBD date — skips the server lead-time floor entirely.
    delivery: { date: null, proceedDate: null, dateTbd: true, floor: 1, hasLift: false },
    lines: [{ sku: "mattress:carres-classic:queen", qty: 1, attrs: null, unitPrice: 1500 }],
    addons: [],
    paid: 750,
    signaturePath: `orders-attachments/${DEALER_A}/wiz/signature.png`,
    paymentSlipPath: null,
    termsAccepted: true,
    depositPct: 50,
    paymentMethod: "online",
    approvalCode: "FT2026TEST01",
    installmentMonths: null,
    ...over,
  };
}

function postOrder(jwt: string, token: string | null, body: unknown) {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${jwt}`,
    "Content-Type": "application/json",
  };
  if (token) headers["X-Staff-Token"] = token;
  return app.fetch(
    new Request("http://t/api/orders", { method: "POST", headers, body: JSON.stringify(body) }),
    env,
  );
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
  vi.mocked(adminClient).mockReset();
});

afterAll(() => _setJwksForTesting(null));

// ---------------------------------------------------------------------------
// GET /api/orders — list scoping
// ---------------------------------------------------------------------------
describe("GET /api/orders — staff scoping", () => {
  it("dormant store (no PIN set) → passthrough, no staff filter", async () => {
    const sb = mockList([]);
    vi.mocked(userClient).mockReturnValue(sb);
    vi.mocked(adminClient).mockReturnValue(mockAdminActivated(false));
    const jwt = await makeJwt("dealer", DEALER_A);
    const res = await app.fetch(
      new Request("http://t/api/orders", { headers: { Authorization: `Bearer ${jwt}` } }),
      env,
    );
    expect(res.status).toBe(200);
    expect(sb._eqs).not.toContainEqual(["salesperson_id", SP1]);
    expect(sb._ors.length).toBe(0);
  });

  it("activated store + no token → 403 staff_session_required", async () => {
    vi.mocked(userClient).mockReturnValue(mockList([]));
    vi.mocked(adminClient).mockReturnValue(mockAdminActivated(true));
    const jwt = await makeJwt("dealer", DEALER_A);
    const res = await app.fetch(
      new Request("http://t/api/orders", { headers: { Authorization: `Bearer ${jwt}` } }),
      env,
    );
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "staff_session_required" });
  });

  it("salesperson tier → forced .eq(salesperson_id, sid)", async () => {
    const sb = mockList([]);
    vi.mocked(userClient).mockReturnValue(sb);
    const jwt = await makeJwt("dealer", DEALER_A);
    const token = await staffToken("salesperson", OUTLET_1, SP1);
    await app.fetch(
      new Request("http://t/api/orders", {
        headers: { Authorization: `Bearer ${jwt}`, "X-Staff-Token": token },
      }),
      env,
    );
    expect(sb._eqs).toContainEqual(["salesperson_id", SP1]);
  });

  it("manager tier → forced .or(own outlet OR null outlet)", async () => {
    const sb = mockList([]);
    vi.mocked(userClient).mockReturnValue(sb);
    const jwt = await makeJwt("dealer", DEALER_A);
    const token = await staffToken("manager", OUTLET_1, SP1);
    await app.fetch(
      new Request("http://t/api/orders", {
        headers: { Authorization: `Bearer ${jwt}`, "X-Staff-Token": token },
      }),
      env,
    );
    expect(sb._ors).toContainEqual(`outlet_id.eq.${OUTLET_1},outlet_id.is.null`);
    expect(sb._eqs).not.toContainEqual(["salesperson_id", SP1]);
  });

  it("principal tier → no narrowing", async () => {
    const sb = mockList([]);
    vi.mocked(userClient).mockReturnValue(sb);
    const jwt = await makeJwt("dealer", DEALER_A);
    const token = await staffToken("principal", null, SP1);
    await app.fetch(
      new Request("http://t/api/orders", {
        headers: { Authorization: `Bearer ${jwt}`, "X-Staff-Token": token },
      }),
      env,
    );
    expect(sb._ors.length).toBe(0);
    expect(sb._eqs).not.toContainEqual(["salesperson_id", SP1]);
  });

  it("internal role (principal JWT) is EXEMPT even on an activated store", async () => {
    const sb = mockList([]);
    vi.mocked(userClient).mockReturnValue(sb);
    vi.mocked(adminClient).mockReturnValue(mockAdminActivated(true));
    const jwt = await makeJwt("principal", null); // no dealer scope → internal
    const res = await app.fetch(
      new Request("http://t/api/orders", { headers: { Authorization: `Bearer ${jwt}` } }),
      env,
    );
    expect(res.status).toBe(200);
    expect(sb._ors.length).toBe(0);
  });

  it("wrong-dealer token is treated as absent → 403 on an activated store", async () => {
    vi.mocked(userClient).mockReturnValue(mockList([]));
    vi.mocked(adminClient).mockReturnValue(mockAdminActivated(true));
    const jwt = await makeJwt("dealer", DEALER_A);
    const token = await staffToken("principal", null, SP1, DEALER_B); // did=DEALER_B ≠ JWT dealer
    const res = await app.fetch(
      new Request("http://t/api/orders", {
        headers: { Authorization: `Bearer ${jwt}`, "X-Staff-Token": token },
      }),
      env,
    );
    expect(res.status).toBe(403);
  });

  it("garbage token is treated as absent → 403 on an activated store", async () => {
    vi.mocked(userClient).mockReturnValue(mockList([]));
    vi.mocked(adminClient).mockReturnValue(mockAdminActivated(true));
    const jwt = await makeJwt("dealer", DEALER_A);
    const res = await app.fetch(
      new Request("http://t/api/orders", {
        headers: { Authorization: `Bearer ${jwt}`, "X-Staff-Token": "not.a.jwt" },
      }),
      env,
    );
    expect(res.status).toBe(403);
  });
});

// ---------------------------------------------------------------------------
// GET /api/orders/:id — detail scoping
// ---------------------------------------------------------------------------
describe("GET /api/orders/:id — staff scoping", () => {
  it("salesperson opening their OWN order → 200", async () => {
    vi.mocked(userClient).mockReturnValue(mockDetail(fullOrderRow({ salesperson_id: SP1 })));
    const jwt = await makeJwt("dealer", DEALER_A);
    const token = await staffToken("salesperson", OUTLET_1, SP1);
    const res = await app.fetch(
      new Request(`http://t/api/orders/${ORDER_ID}`, {
        headers: { Authorization: `Bearer ${jwt}`, "X-Staff-Token": token },
      }),
      env,
    );
    expect(res.status).toBe(200);
  });

  it("salesperson opening a FOREIGN order → 404", async () => {
    vi.mocked(userClient).mockReturnValue(mockDetail(fullOrderRow({ salesperson_id: SP_OTHER })));
    const jwt = await makeJwt("dealer", DEALER_A);
    const token = await staffToken("salesperson", OUTLET_1, SP1);
    const res = await app.fetch(
      new Request(`http://t/api/orders/${ORDER_ID}`, {
        headers: { Authorization: `Bearer ${jwt}`, "X-Staff-Token": token },
      }),
      env,
    );
    expect(res.status).toBe(404);
  });

  it("manager opening a null-outlet (AutoCount) order → 200", async () => {
    vi.mocked(userClient).mockReturnValue(mockDetail(fullOrderRow({ outlet_id: null })));
    const jwt = await makeJwt("dealer", DEALER_A);
    const token = await staffToken("manager", OUTLET_1, SP1);
    const res = await app.fetch(
      new Request(`http://t/api/orders/${ORDER_ID}`, {
        headers: { Authorization: `Bearer ${jwt}`, "X-Staff-Token": token },
      }),
      env,
    );
    expect(res.status).toBe(200);
  });

  it("manager opening ANOTHER outlet's order → 404", async () => {
    vi.mocked(userClient).mockReturnValue(mockDetail(fullOrderRow({ outlet_id: OUTLET_2 })));
    const jwt = await makeJwt("dealer", DEALER_A);
    const token = await staffToken("manager", OUTLET_1, SP1);
    const res = await app.fetch(
      new Request(`http://t/api/orders/${ORDER_ID}`, {
        headers: { Authorization: `Bearer ${jwt}`, "X-Staff-Token": token },
      }),
      env,
    );
    expect(res.status).toBe(404);
  });

  it("activated store + no token → 403", async () => {
    vi.mocked(userClient).mockReturnValue(mockDetail(fullOrderRow()));
    vi.mocked(adminClient).mockReturnValue(mockAdminActivated(true));
    const jwt = await makeJwt("dealer", DEALER_A);
    const res = await app.fetch(
      new Request(`http://t/api/orders/${ORDER_ID}`, { headers: { Authorization: `Bearer ${jwt}` } }),
      env,
    );
    expect(res.status).toBe(403);
  });
});

// ---------------------------------------------------------------------------
// POST /api/orders — attribution scoping
// ---------------------------------------------------------------------------
describe("POST /api/orders — staff scoping", () => {
  function payloadOf(sb: ReturnType<typeof mockCreate>) {
    const call = sb._rpcCalls.find((r: { name: string }) => r.name === "create_order");
    return call?.args?.payload as Record<string, unknown> | undefined;
  }

  it("dormant store → client-sent salesperson_id + outlet_id stand (byte-identical)", async () => {
    const sb = mockCreate({});
    vi.mocked(userClient).mockReturnValue(sb);
    vi.mocked(adminClient).mockReturnValue(mockAdminActivated(false));
    const jwt = await makeJwt("dealer", DEALER_A);
    const res = await postOrder(jwt, null, createBody());
    expect(res.status).toBe(201);
    const p = payloadOf(sb);
    expect(p?.salesperson_id).toBe(SP_OTHER);
    expect(p?.outlet_id).toBe(OUTLET_2);
  });

  it("activated store + no token → 403", async () => {
    const sb = mockCreate({});
    vi.mocked(userClient).mockReturnValue(sb);
    vi.mocked(adminClient).mockReturnValue(mockAdminActivated(true));
    const jwt = await makeJwt("dealer", DEALER_A);
    const res = await postOrder(jwt, null, createBody());
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "staff_session_required" });
  });

  it("salesperson tier → salesperson_id + outlet_id OVERWRITTEN to the token", async () => {
    const sb = mockCreate({});
    vi.mocked(userClient).mockReturnValue(sb);
    const jwt = await makeJwt("dealer", DEALER_A);
    const token = await staffToken("salesperson", OUTLET_1, SP1);
    const res = await postOrder(jwt, token, createBody());
    expect(res.status).toBe(201);
    const p = payloadOf(sb);
    expect(p?.salesperson_id).toBe(SP1); // not the body's SP_OTHER
    expect(p?.outlet_id).toBe(OUTLET_1); // not the body's OUTLET_2
  });

  it("manager tier → outlet forced to token, body salesperson validated + kept", async () => {
    const sb = mockCreate({
      // isWritableStaff: SP_OTHER is an active salesperson in the manager's outlet.
      salespersonRow: { dealer_id: DEALER_A, outlet_id: OUTLET_1, active: true },
    });
    vi.mocked(userClient).mockReturnValue(sb);
    const jwt = await makeJwt("dealer", DEALER_A);
    const token = await staffToken("manager", OUTLET_1, SP1);
    const res = await postOrder(jwt, token, createBody());
    expect(res.status).toBe(201);
    const p = payloadOf(sb);
    expect(p?.salesperson_id).toBe(SP_OTHER);
    expect(p?.outlet_id).toBe(OUTLET_1); // forced to the manager's outlet
  });

  it("manager tier → 403 when body salesperson is in a DIFFERENT outlet", async () => {
    const sb = mockCreate({
      salespersonRow: { dealer_id: DEALER_A, outlet_id: OUTLET_2, active: true },
    });
    vi.mocked(userClient).mockReturnValue(sb);
    const jwt = await makeJwt("dealer", DEALER_A);
    const token = await staffToken("manager", OUTLET_1, SP1);
    const res = await postOrder(jwt, token, createBody());
    expect(res.status).toBe(403);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe("staff_scope_violation");
  });

  it("principal tier → body salesperson validated (∈ dealer), outlet NOT narrowed", async () => {
    const sb = mockCreate({
      salespersonRow: { dealer_id: DEALER_A, outlet_id: OUTLET_2, active: true },
    });
    vi.mocked(userClient).mockReturnValue(sb);
    const jwt = await makeJwt("dealer", DEALER_A);
    const token = await staffToken("principal", null, SP1);
    const res = await postOrder(jwt, token, createBody());
    expect(res.status).toBe(201);
    const p = payloadOf(sb);
    expect(p?.salesperson_id).toBe(SP_OTHER);
    expect(p?.outlet_id).toBe(OUTLET_2); // principal doesn't force outlet
  });

  it("principal tier → 403 when body salesperson is NOT in the dealer", async () => {
    const sb = mockCreate({ salespersonRow: null }); // RLS-hidden / cross-dealer
    vi.mocked(userClient).mockReturnValue(sb);
    const jwt = await makeJwt("dealer", DEALER_A);
    const token = await staffToken("principal", null, SP1);
    const res = await postOrder(jwt, token, createBody());
    expect(res.status).toBe(403);
  });

  it("internal role (operation on-behalf) is EXEMPT — no staff narrowing", async () => {
    const sb = mockCreate({});
    vi.mocked(userClient).mockReturnValue(sb);
    vi.mocked(adminClient).mockReturnValue(mockAdminActivated(true));
    const jwt = await makeJwt("operation", null);
    const res = await postOrder(jwt, null, createBody({ dealerId: DEALER_A }));
    expect(res.status).toBe(201);
    const p = payloadOf(sb);
    expect(p?.salesperson_id).toBe(SP_OTHER); // client value stands for internal
  });
});

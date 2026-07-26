import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from "vitest";
import {
  SignJWT,
  createLocalJWKSet,
  exportJWK,
  generateKeyPair,
  type JWK,
  type KeyLike,
} from "jose";
import app from "../index";
import { _setJwksForTesting } from "../middleware/auth";

/**
 * 0268 — the Approver gate (the T&C's credit-assessment clause).
 *
 * What is under test is the DOOR, not the arithmetic: the RPCs own the money
 * (proved against live prod in a rolled-back transaction before 0268 was
 * applied), so here we assert the things only the API layer can get wrong —
 * WHO may open the queue, WHICH rpc a decision calls with WHICH argument name,
 * how each `detail` code maps to a status, and that the sell + checkout routes
 * behave sanely now that an agreement is born `pending_approval`.
 *
 * Harness copied from rental-sell.test.ts (full app, mocked supabase).
 */

function request(path: string, init: RequestInit | undefined, e: unknown): Promise<Response> {
  return (app as unknown as { fetch: (r: Request, env: unknown) => Promise<Response> }).fetch(
    new Request(`http://localhost${path}`, init),
    e,
  );
}

vi.mock("../lib/supabase", () => ({ userClient: vi.fn(), adminClient: vi.fn() }));
import { adminClient, userClient } from "../lib/supabase";

vi.mock("../lib/stripe", () => ({
  stripeConfigured: (env: { STRIPE_SECRET_KEY?: string }) => !!env.STRIPE_SECRET_KEY,
  stripeClient: vi.fn(),
  webCryptoProvider: {},
  describePaymentMethod: () => null,
  receiptUrlOf: () => null,
}));

vi.mock("../lib/rental-stripe", () => ({
  CARRES_SOURCE: "carres-portal",
  ensureFixedTermSchedule: vi.fn(),
  ensureRentalPlanStripeObjects: vi.fn(),
}));

const env = {
  SUPABASE_URL: "https://t.x",
  SUPABASE_ANON_KEY: "a",
  SUPABASE_SERVICE_ROLE_KEY: "s",
  SUPABASE_JWT_SECRET: "",
  STRIPE_SECRET_KEY: "sk_test_x",
  STRIPE_WEBHOOK_SECRET: "whsec_x",
  PUBLIC_WEB_URL: "https://pos.test",
};

const KID = "k1";
let signKey: KeyLike;
let publicJwk: JWK;

async function makeJwt(role: string, dealerId: string | null = null) {
  return new SignJWT({
    email: `${role}@x`,
    app_metadata: { role, ...(dealerId ? { dealer_id: dealerId } : {}) },
  })
    .setProtectedHeader({ alg: "ES256", kid: KID, typ: "JWT" })
    .setSubject("11111111-1111-1111-1111-000000000999")
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(signKey);
}

function makeSb(rpc?: { data: unknown; error: unknown }, single?: { data: unknown; error: unknown }) {
  const calls = { rpc: [] as { name: string; args: unknown }[] };
  const from = vi.fn(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const builder: any = {
      select: vi.fn(() => builder),
      eq: vi.fn(() => builder),
      limit: vi.fn(() => builder),
      order: vi.fn(() => builder),
      single: vi.fn(() => Promise.resolve(single ?? { data: null, error: null })),
      maybeSingle: vi.fn(() => Promise.resolve(single ?? { data: null, error: null })),
      then: (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) =>
        Promise.resolve({ data: [], error: null }).then(res, rej),
    };
    return builder;
  });
  const rpcFn = vi.fn((name: string, args: unknown) => {
    calls.rpc.push({ name, args });
    return Promise.resolve(rpc ?? { data: null, error: null });
  });
  return { from, rpc: rpcFn, calls };
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

const AG_ID = "00000000-0000-0000-0000-0000000d0001";
const CUST_ID = "00000000-0000-0000-0000-0000000c0001";
const PLAN_ID = "00000000-0000-0000-0000-0000000b0001";

const PENDING_ROW = {
  id: AG_ID,
  agreement_no: "RA-1001",
  customer_id: CUST_ID,
  dealer_id: null,
  salesperson_id: null,
  order_id: null,
  plan_id: PLAN_ID,
  sku: "M-CLOUD-K",
  term_months: 84,
  monthly_fee: 59,
  supplier_rate_pct: 49,
  commission_base_pct: 20,
  start_date: "2026-07-26",
  status: "pending_approval",
  buyout_at: null,
  buyout_amount: null,
  ownership_transfer_at: null,
  ownership_doc_url: null,
  stripe_customer_id: null,
  stripe_subscription_id: null,
  offer_id: null,
  selected_options: {},
  gifts: [],
  one_off_total: 0,
  notes: null,
  included_package_id: null,
  decided_by: null,
  decided_at: null,
  rejection_reason: null,
  credit_checked_at: null,
  credit_reference: null,
  created_at: "2026-07-26T00:00:00Z",
  updated_at: "2026-07-26T00:00:00Z",
  created_by: null,
};

const QUEUE_ROW = {
  id: AG_ID,
  agreementNo: "RA-1001",
  status: "pending_approval",
  sku: "M-CLOUD-K",
  termMonths: 84,
  monthlyFee: 59,
  termTotal: 4956,
  signedAt: null,
  customer: { id: CUST_ID, name: "Tan Mei Ling", phone: "0123456789", email: null, address: null },
  dealer: null,
  salesperson: null,
  createdAt: "2026-07-26T00:00:00Z",
};

async function get(path: string, role: string) {
  return request(path, { headers: { authorization: `Bearer ${await makeJwt(role)}` } }, env);
}

async function post(path: string, role: string, body: unknown, dealerId: string | null = null) {
  return request(
    path,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${await makeJwt(role, dealerId)}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
    },
    env,
  );
}

describe("GET /api/rental/approvals — who may see the credit queue", () => {
  it("lets finance in and returns the RPC's worklist", async () => {
    const sb = makeSb({ data: [QUEUE_ROW], error: null });
    vi.mocked(userClient).mockReturnValue(sb as never);
    const res = await get("/api/rental/approvals", "finance");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { approvals: { agreementNo: string; termTotal: number }[] };
    expect(body.approvals).toHaveLength(1);
    expect(body.approvals[0].agreementNo).toBe("RA-1001");
    // the number that makes the decision real: total credit extended
    expect(body.approvals[0].termTotal).toBe(4956);
    expect(sb.calls.rpc[0].name).toBe("rental_pending_approvals");
  });

  it("lets the principal in", async () => {
    vi.mocked(userClient).mockReturnValue(makeSb({ data: [], error: null }) as never);
    expect((await get("/api/rental/approvals", "principal")).status).toBe(200);
  });

  it("returns an empty list, not null, when nothing is pending", async () => {
    vi.mocked(userClient).mockReturnValue(makeSb({ data: null, error: null }) as never);
    const res = await get("/api/rental/approvals", "finance");
    expect(res.status).toBe(200);
    expect(((await res.json()) as { approvals: unknown[] }).approvals).toEqual([]);
  });

  // The whole point of the narrower gate: `bd` and `operation` are internal and
  // pass internalOnly(), but must NOT decide credit — a BD sells these.
  it.each(["bd", "operation", "dealer", "showroom", "salesperson", "supplier", "partner"])(
    "refuses %s",
    async (role) => {
      vi.mocked(userClient).mockReturnValue(makeSb() as never);
      expect((await get("/api/rental/approvals", role)).status).toBe(403);
    },
  );

  it("refuses an unauthenticated caller", async () => {
    expect((await request("/api/rental/approvals", undefined, env)).status).toBe(401);
  });
});

describe("POST /api/rental/agreements/:id/decide", () => {
  it("approve calls rental_approve_agreement with the note", async () => {
    const sb = makeSb({
      data: { agreement: { ...PENDING_ROW, status: "active" }, unit: null, entitlementId: null, visitsTotal: 0 },
      error: null,
    });
    vi.mocked(userClient).mockReturnValue(sb as never);
    const res = await post(`/api/rental/agreements/${AG_ID}/decide`, "finance", {
      approve: true,
      note: "CBM clear",
    });
    expect(res.status).toBe(200);
    expect(sb.calls.rpc[0].name).toBe("rental_approve_agreement");
    expect(sb.calls.rpc[0].args).toEqual({ p_agreement_id: AG_ID, p_note: "CBM clear" });
    expect(((await res.json()) as { agreement: { status: string } }).agreement.status).toBe("active");
  });

  it("approve without a note is fine (p_note null)", async () => {
    const sb = makeSb({ data: { agreement: { ...PENDING_ROW, status: "active" } }, error: null });
    vi.mocked(userClient).mockReturnValue(sb as never);
    const res = await post(`/api/rental/agreements/${AG_ID}/decide`, "finance", { approve: true });
    expect(res.status).toBe(200);
    expect(sb.calls.rpc[0].args).toEqual({ p_agreement_id: AG_ID, p_note: null });
  });

  it("approve maps the unit + entitlement the RPC materialised", async () => {
    const sb = makeSb({
      data: {
        agreement: { ...PENDING_ROW, status: "active" },
        unit: {
          id: "u1",
          unit_code: "RU-1001",
          sku: "M-CLOUD-K",
          agreement_id: AG_ID,
          customer_id: CUST_ID,
          status: "allocated",
          created_at: "2026-07-26T00:00:00Z",
          updated_at: "2026-07-26T00:00:00Z",
          updated_by: null,
        },
        entitlementId: "e1",
        visitsTotal: 21,
      },
      error: null,
    });
    vi.mocked(userClient).mockReturnValue(sb as never);
    const res = await post(`/api/rental/agreements/${AG_ID}/decide`, "finance", { approve: true });
    const body = (await res.json()) as { unit: { unitCode: string } | null; visitsTotal: number };
    expect(body.unit?.unitCode).toBe("RU-1001");
    expect(body.visitsTotal).toBe(21);
  });

  it("reject calls rental_reject_agreement with the reason", async () => {
    const sb = makeSb({
      data: { agreement: { ...PENDING_ROW, status: "rejected", rejection_reason: "adverse record" } },
      error: null,
    });
    vi.mocked(userClient).mockReturnValue(sb as never);
    const res = await post(`/api/rental/agreements/${AG_ID}/decide`, "finance", {
      approve: false,
      note: "adverse record",
    });
    expect(res.status).toBe(200);
    expect(sb.calls.rpc[0].name).toBe("rental_reject_agreement");
    expect(sb.calls.rpc[0].args).toEqual({ p_agreement_id: AG_ID, p_reason: "adverse record" });
    const body = (await res.json()) as { agreement: { rejectionReason: string } };
    expect(body.agreement.rejectionReason).toBe("adverse record");
  });

  // 422 is the house validation status (parseJsonBody), not 400. What matters
  // in both of these is the second assertion: a reasonless rejection never
  // reaches the database at all.
  it("refuses a reject with no reason before it ever reaches the DB", async () => {
    const sb = makeSb();
    vi.mocked(userClient).mockReturnValue(sb as never);
    const res = await post(`/api/rental/agreements/${AG_ID}/decide`, "finance", { approve: false });
    expect(res.status).toBe(422);
    expect(sb.calls.rpc).toHaveLength(0);
  });

  it("refuses a reject whose reason is only whitespace", async () => {
    const sb = makeSb();
    vi.mocked(userClient).mockReturnValue(sb as never);
    const res = await post(`/api/rental/agreements/${AG_ID}/decide`, "finance", {
      approve: false,
      note: "   ",
    });
    expect(res.status).toBe(422);
    expect(sb.calls.rpc).toHaveLength(0);
  });

  it.each(["bd", "operation", "dealer", "showroom"])("refuses %s deciding", async (role) => {
    const sb = makeSb();
    vi.mocked(userClient).mockReturnValue(sb as never);
    const res = await post(`/api/rental/agreements/${AG_ID}/decide`, role, { approve: true });
    expect(res.status).toBe(403);
    expect(sb.calls.rpc).toHaveLength(0);
  });

  it("maps not_pending → 422 (a second approver lost the race)", async () => {
    vi.mocked(userClient).mockReturnValue(
      makeSb({
        data: null,
        error: { message: "Agreement is not awaiting approval", details: "not_pending" },
      }) as never,
    );
    const res = await post(`/api/rental/agreements/${AG_ID}/decide`, "finance", { approve: true });
    expect(res.status).toBe(422);
    expect(((await res.json()) as { code: string }).code).toBe("not_pending");
  });

  it("maps agreement_not_found → 404", async () => {
    vi.mocked(userClient).mockReturnValue(
      makeSb({ data: null, error: { message: "nope", details: "agreement_not_found" } }) as never,
    );
    const res = await post(`/api/rental/agreements/${AG_ID}/decide`, "finance", { approve: true });
    expect(res.status).toBe(404);
  });

  it("maps the RPC's own forbidden → 403 (the DB gate is the real boundary)", async () => {
    vi.mocked(userClient).mockReturnValue(
      makeSb({ data: null, error: { message: "nope", details: "forbidden" } }) as never,
    );
    const res = await post(`/api/rental/agreements/${AG_ID}/decide`, "finance", { approve: true });
    expect(res.status).toBe(403);
  });

  it("500s rather than pretending, when the RPC returns no agreement", async () => {
    vi.mocked(userClient).mockReturnValue(makeSb({ data: null, error: null }) as never);
    const res = await post(`/api/rental/agreements/${AG_ID}/decide`, "finance", { approve: true });
    expect(res.status).toBe(500);
  });
});

describe("the sell + checkout lanes under the new gate", () => {
  it("POST /agreements returns pendingApproval with no unit — and does not crash on the null", async () => {
    const sb = makeSb({
      data: {
        agreement: PENDING_ROW,
        customer: {
          id: CUST_ID,
          name: "Tan Mei Ling",
          phone: "0123456789",
          phone_key: "60123456789",
          email: null,
          address: null,
          created_at: "2026-07-26T00:00:00Z",
          updated_at: "2026-07-26T00:00:00Z",
          created_by: null,
        },
        unit: null,
        entitlementId: null,
        visitsTotal: 0,
        pendingApproval: true,
      },
      error: null,
    });
    vi.mocked(userClient).mockReturnValue(sb as never);
    const res = await post("/api/rental/agreements", "showroom", {
      planId: PLAN_ID,
      customerName: "Tan Mei Ling",
      customerPhone: "0123456789",
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as {
      unit: unknown;
      pendingApproval: boolean;
      agreement: { status: string };
    };
    expect(body.unit).toBeNull();
    expect(body.pendingApproval).toBe(true);
    expect(body.agreement.status).toBe("pending_approval");
  });

  it("checkout on a pending application is refused with a code the store can read", async () => {
    // fetchAgreementForCheckout reads through the ADMIN client then enforces
    // ownership in Hono — internal roles pass, so finance is the simplest caller.
    vi.mocked(adminClient).mockReturnValue(
      makeSb(undefined, { data: { ...PENDING_ROW, customers: { id: CUST_ID } }, error: null }) as never,
    );
    vi.mocked(userClient).mockReturnValue(makeSb() as never);
    const res = await post(`/api/rental/agreements/${AG_ID}/stripe/checkout`, "finance", {});
    expect(res.status).toBe(422);
    const body = (await res.json()) as { code: string; message: string };
    expect(body.code).toBe("pending_approval");
    expect(body.message).toMatch(/approve/i);
  });

  it("checkout on a rejected application says so", async () => {
    vi.mocked(adminClient).mockReturnValue(
      makeSb(undefined, {
        data: { ...PENDING_ROW, status: "rejected", customers: { id: CUST_ID } },
        error: null,
      }) as never,
    );
    vi.mocked(userClient).mockReturnValue(makeSb() as never);
    const res = await post(`/api/rental/agreements/${AG_ID}/stripe/checkout`, "finance", {});
    expect(res.status).toBe(422);
    const body = (await res.json()) as { code: string; message: string };
    expect(body.code).toBe("wrong_status");
    expect(body.message).toMatch(/rejected/i);
  });
});

describe("0275 — a rental mints a Sales Order", () => {
  it("passes the delivery date through, so the order can reach operations", async () => {
    const sb = makeSb({
      data: {
        agreement: PENDING_ROW,
        customer: { id: CUST_ID, name: "T", phone: "0111", phone_key: "111",
          email: null, address: null, created_at: "x", updated_at: "x", created_by: null },
        unit: null, entitlementId: null, visitsTotal: 0, pendingApproval: true,
        orderId: "ord-1", so: 1301,
      },
      error: null,
    });
    vi.mocked(userClient).mockReturnValue(sb as never);
    const res = await post("/api/rental/agreements", "showroom", {
      planId: PLAN_ID, customerName: "T", customerPhone: "0123456789",
      deliveryDate: "2026-08-15",
    });
    expect(res.status).toBe(201);
    expect((sb.calls.rpc[0].args as { p_delivery_date: string }).p_delivery_date)
      .toBe("2026-08-15");
    const body = (await res.json()) as { orderId: string; so: number };
    // the store must be able to SEE the SO it just created
    expect(body.orderId).toBe("ord-1");
    expect(body.so).toBe(1301);
  });

  it("sends null rather than omitting the date when the wizard has none", async () => {
    const sb = makeSb({
      data: { agreement: PENDING_ROW, customer: {}, unit: null, visitsTotal: 0 },
      error: null,
    });
    vi.mocked(userClient).mockReturnValue(sb as never);
    await post("/api/rental/agreements", "showroom", {
      planId: PLAN_ID, customerName: "T", customerPhone: "0123456789",
    });
    expect((sb.calls.rpc[0].args as { p_delivery_date: unknown }).p_delivery_date).toBeNull();
  });

  it.each([
    ["dealer_required", "a rental with no store"],
    ["plan_has_no_sku", "a combo plan with nothing to deliver"],
  ])("maps %s to a readable 422 (%s)", async (detail) => {
    vi.mocked(userClient).mockReturnValue(
      makeSb({ data: null, error: { message: "nope", details: detail } }) as never,
    );
    const res = await post("/api/rental/agreements", "showroom", {
      planId: PLAN_ID, customerName: "T", customerPhone: "0123456789",
    });
    expect(res.status).toBe(422);
    expect(((await res.json()) as { code: string }).code).toBe(detail);
  });

  it("a decision reports what happened to the order, not just the agreement", async () => {
    const sb = makeSb({
      data: {
        agreement: { ...PENDING_ROW, status: "active" },
        unit: null, entitlementId: null, visitsTotal: 0,
        orderProceeded: true, orderBlockedBy: null,
      },
      error: null,
    });
    vi.mocked(userClient).mockReturnValue(sb as never);
    const res = await post(`/api/rental/agreements/${AG_ID}/decide`, "finance", { approve: true });
    const body = (await res.json()) as { orderProceeded: boolean };
    expect(body.orderProceeded).toBe(true);
  });

  it("says WHY the order is still stuck when approve could not proceed it", async () => {
    const sb = makeSb({
      data: {
        agreement: { ...PENDING_ROW, status: "active" },
        orderProceeded: false, orderBlockedBy: "Delivery date is required",
      },
      error: null,
    });
    vi.mocked(userClient).mockReturnValue(sb as never);
    const res = await post(`/api/rental/agreements/${AG_ID}/decide`, "finance", { approve: true });
    const body = (await res.json()) as { orderProceeded: boolean; orderBlockedBy: string };
    // the credit decision stands; the desk is told what is still missing
    expect(body.orderProceeded).toBe(false);
    expect(body.orderBlockedBy).toMatch(/Delivery date/i);
  });

  it("reject reports the order was cancelled", async () => {
    const sb = makeSb({
      data: {
        agreement: { ...PENDING_ROW, status: "rejected", rejection_reason: "x" },
        orderCancelled: true,
      },
      error: null,
    });
    vi.mocked(userClient).mockReturnValue(sb as never);
    const res = await post(`/api/rental/agreements/${AG_ID}/decide`, "finance", {
      approve: false, note: "x",
    });
    expect(((await res.json()) as { orderCancelled: boolean }).orderCancelled).toBe(true);
  });
});

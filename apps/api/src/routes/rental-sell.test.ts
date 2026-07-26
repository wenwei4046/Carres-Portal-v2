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

/** The index default export is the Workers module ({fetch, scheduled}) — hit
 *  it exactly the way Cloudflare does (stripe.test.ts idiom). */
function request(path: string, init: RequestInit | undefined, e: unknown): Promise<Response> {
  return (app as unknown as { fetch: (r: Request, env: unknown) => Promise<Response> }).fetch(
    new Request(`http://localhost${path}`, init),
    e,
  );
}

/**
 * 0255 — the POS rental sell lane: /pos-plans, POST /agreements (RPC),
 * the Stripe subscription checkout pair, the webhook's subscription branch
 * and the plan → Stripe sync wiring. Harness = stripe.test.ts (full app,
 * mocked supabase + stripe factories); the fixed-term schedule wrap and the
 * product/price ensure live in ../lib/rental-stripe and are mocked here —
 * their Stripe conversations are not under test, their CALL CONTRACT is.
 */

vi.mock("../lib/supabase", () => ({ userClient: vi.fn(), adminClient: vi.fn() }));
import { adminClient, userClient } from "../lib/supabase";

vi.mock("../lib/stripe", () => ({
  stripeConfigured: (env: { STRIPE_SECRET_KEY?: string }) => !!env.STRIPE_SECRET_KEY,
  stripeClient: vi.fn(),
  webCryptoProvider: {},
  describePaymentMethod: () => null,
  receiptUrlOf: () => null,
}));
import { stripeClient } from "../lib/stripe";

vi.mock("../lib/rental-stripe", () => ({
  CARRES_SOURCE: "carres-portal",
  ensureFixedTermSchedule: vi.fn(),
  ensureRentalPlanStripeObjects: vi.fn(),
}));
import { ensureFixedTermSchedule, ensureRentalPlanStripeObjects } from "../lib/rental-stripe";

const baseEnv = {
  SUPABASE_URL: "https://t.x",
  SUPABASE_ANON_KEY: "a",
  SUPABASE_SERVICE_ROLE_KEY: "s",
  SUPABASE_JWT_SECRET: "",
};
const env = {
  ...baseEnv,
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

interface TableCfg {
  list?: { data: unknown; error: unknown };
  single?: { data: unknown; error: unknown };
  /** Static answer, or a QUEUE consumed call-by-call (insert → sibling → update). */
  maybeSingle?: { data: unknown; error: unknown } | Array<{ data: unknown; error: unknown }>;
}

function makeSb(byTable: Record<string, TableCfg>, rpc?: { data: unknown; error: unknown }) {
  const calls = {
    inserts: [] as Array<{ table: string; payload: unknown }>,
    updates: [] as Array<{ table: string; payload: unknown }>,
    rpc: [] as { name: string; args: unknown }[],
  };
  const from = vi.fn((table: string) => {
    const cfg = byTable[table] ?? {};
    const nextMaybe = () => {
      if (Array.isArray(cfg.maybeSingle)) {
        return cfg.maybeSingle.shift() ?? { data: null, error: null };
      }
      return cfg.maybeSingle ?? { data: null, error: null };
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const builder: any = {
      select: vi.fn(() => builder),
      insert: vi.fn((payload: unknown) => {
        calls.inserts.push({ table, payload });
        return builder;
      }),
      update: vi.fn((payload: unknown) => {
        calls.updates.push({ table, payload });
        return builder;
      }),
      eq: vi.fn(() => builder),
      is: vi.fn(() => builder),
      not: vi.fn(() => builder),
      neq: vi.fn(() => builder),
      limit: vi.fn(() => builder),
      order: vi.fn(() => builder),
      single: vi.fn(() => Promise.resolve(cfg.single ?? { data: null, error: null })),
      maybeSingle: vi.fn(() => Promise.resolve(nextMaybe())),
      then: (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
        Promise.resolve(cfg.list ?? { data: [], error: null }).then(resolve, reject),
    };
    return builder;
  });
  const rpcFn = vi.fn((name: string, args: unknown) => {
    calls.rpc.push({ name, args });
    return Promise.resolve(rpc ?? { data: null, error: null });
  });
  return { from, rpc: rpcFn, calls };
}

/**
 * 0278 — the signature goes to the private `rental-agreements` bucket with the
 * SERVICE client, because that bucket's INSERT policy is `is_internal()` and a
 * store JWT fails it. This stands in for that storage conversation and RECORDS
 * it, so the tests can assert what was written and what was cleaned up.
 */
function makeAdminStorage(uploadResult: { error: unknown } = { error: null }) {
  const calls = {
    uploads: [] as Array<{ bucket: string; key: string; opts: Record<string, unknown> }>,
    removes: [] as Array<{ bucket: string; keys: string[] }>,
  };
  const from = vi.fn((bucket: string) => ({
    upload: vi.fn((key: string, _body: unknown, opts: Record<string, unknown>) => {
      calls.uploads.push({ bucket, key, opts });
      return Promise.resolve(uploadResult);
    }),
    remove: vi.fn((keys: string[]) => {
      calls.removes.push({ bucket, keys });
      return Promise.resolve({ error: null });
    }),
  }));
  return { storage: { from }, calls };
}

/** Scriptable stand-in for the Stripe SDK client. */
function makeStripe(overrides: Record<string, unknown> = {}) {
  return {
    webhooks: { constructEventAsync: vi.fn() },
    customers: { create: vi.fn().mockResolvedValue({ id: "cus_test_1" }) },
    checkout: {
      sessions: {
        create: vi.fn().mockResolvedValue({
          id: "cs_test_ra",
          url: "https://checkout.stripe.com/c/cs_test_ra",
        }),
        retrieve: vi.fn(),
        expire: vi.fn().mockResolvedValue({}),
      },
    },
    ...overrides,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
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
  vi.mocked(stripeClient).mockReset();
  vi.mocked(ensureFixedTermSchedule).mockReset();
  vi.mocked(ensureRentalPlanStripeObjects).mockReset();
});

afterAll(() => _setJwksForTesting(null));

const DEALER_ID = "00000000-0000-0000-0000-0000000000dd";
const OTHER_DEALER = "00000000-0000-0000-0000-0000000000ee";
const PLAN_ID = "00000000-0000-0000-0000-0000000b0001";
const AG_ID = "00000000-0000-0000-0000-0000000d0001";
const CUST_ID = "00000000-0000-0000-0000-0000000c0001";

const AGREEMENT = {
  id: AG_ID,
  agreement_no: "RA-1001",
  customer_id: CUST_ID,
  dealer_id: DEALER_ID,
  salesperson_id: null,
  order_id: null,
  plan_id: PLAN_ID,
  sku: "M-CLOUD-K",
  term_months: 84,
  monthly_fee: 59,
  supplier_rate_pct: 49,
  commission_base_pct: 20,
  start_date: "2026-07-25",
  status: "active",
  buyout_at: null,
  buyout_amount: null,
  ownership_transfer_at: null,
  ownership_doc_url: null,
  stripe_customer_id: null,
  stripe_subscription_id: null,
  notes: null,
  created_at: "2026-07-25T00:00:00Z",
  updated_at: "2026-07-25T00:00:00Z",
  created_by: null,
  customers: {
    id: CUST_ID,
    name: "Tan Mei Ling",
    phone: "0123456789",
    email: null,
    stripe_customer_id: null,
  },
};

const RENTAL_SESSION = {
  id: "row-ra-1",
  agreement_id: AG_ID,
  session_id: "cs_test_ra",
  amount: 59,
  purpose: "rental_subscription",
  url: "https://checkout.stripe.com/c/cs_test_ra",
  status: "open",
  payment_method_detail: null,
  receipt_url: null,
  created_at: "2026-07-25T00:00:00Z",
  expires_at: "2026-07-26T00:00:00Z",
  paid_at: null,
};

describe("GET /api/rental/pos-plans (0255 stripped store projection)", () => {
  it("rejects a supplier (403) — not a seller role", async () => {
    const res = await request(
      "/api/rental/pos-plans",
      { headers: { Authorization: `Bearer ${await makeJwt("supplier")}` } },
      env,
    );
    expect(res.status).toBe(403);
  });

  it("maps the view rows for a dealer — no split fields anywhere", async () => {
    const sb = makeSb({
      rental_plans_pos: {
        list: {
          data: [
            {
              id: PLAN_ID,
              sku: "M-CLOUD-K",
              term_months: 84,
              monthly_fee: "59.00",
              included_package_id: null,
              package_name: null,
              package_service_type: null,
              package_visits_per_year: null,
              stripe_ready: true,
            },
          ],
          error: null,
        },
      },
    });
    vi.mocked(userClient).mockReturnValue(sb as never);
    const res = await request(
      "/api/rental/pos-plans",
      { headers: { Authorization: `Bearer ${await makeJwt("dealer", DEALER_ID)}` } },
      env,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { plans: Array<Record<string, unknown>> };
    expect(body.plans).toHaveLength(1);
    expect(body.plans[0]).toMatchObject({
      sku: "M-CLOUD-K",
      termMonths: 84,
      monthlyFee: 59,
      stripeReady: true,
    });
    expect("supplierRatePct" in body.plans[0]!).toBe(false);
    expect("commissionBasePct" in body.plans[0]!).toBe(false);
  });
});

describe("POST /api/rental/agreements (0255 signup RPC)", () => {
  // 0278 — a signup without a signature is not a signup.
  const SIG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==";
  const payload = {
    planId: PLAN_ID,
    customerName: "Tan Mei Ling",
    customerPhone: "0123456789",
    signatureDataUrl: SIG,
    signedName: "Tan Mei Ling",
  };

  it("rejects a partner (403) and a phoneless payload (422) before the RPC", async () => {
    const asPartner = await request(
      "/api/rental/agreements",
      {
        method: "POST",
        headers: { Authorization: `Bearer ${await makeJwt("partner")}`, "content-type": "application/json" },
        body: JSON.stringify(payload),
      },
      env,
    );
    expect(asPartner.status).toBe(403);

    const sb = makeSb({});
    vi.mocked(userClient).mockReturnValue(sb as never);
    const noPhone = await request(
      "/api/rental/agreements",
      {
        method: "POST",
        headers: { Authorization: `Bearer ${await makeJwt("dealer", DEALER_ID)}`, "content-type": "application/json" },
        body: JSON.stringify({ planId: PLAN_ID, customerName: "Tan" }),
      },
      env,
    );
    expect(noPhone.status).toBe(422);
    expect(sb.calls.rpc).toHaveLength(0);
  });

  it("calls create_rental_agreement with the zod payload and adapts the jsonb result", async () => {
    const { customers: _c, ...agreementRow } = AGREEMENT;
    const sb = makeSb(
      {},
      {
        data: {
          agreement: agreementRow,
          customer: {
            id: CUST_ID,
            name: "Tan Mei Ling",
            phone: "0123456789",
            phone_key: "123456789",
            email: null,
            address: null,
            notes: null,
            stripe_customer_id: null,
            created_at: "2026-07-25T00:00:00Z",
            updated_at: "2026-07-25T00:00:00Z",
            created_by: null,
          },
          unit: {
            id: "00000000-0000-0000-0000-0000000e0001",
            unit_code: "RU-1001",
            sku: "M-CLOUD-K",
            agreement_id: AG_ID,
            customer_id: CUST_ID,
            status: "allocated",
            deployed_at: null,
            returned_at: null,
            warranty_until: null,
            notes: null,
            created_at: "2026-07-25T00:00:00Z",
            updated_at: "2026-07-25T00:00:00Z",
            updated_by: null,
          },
          entitlementId: null,
          visitsTotal: 0,
        },
        error: null,
      },
    );
    vi.mocked(userClient).mockReturnValue(sb as never);
    const admin = makeAdminStorage();
    vi.mocked(adminClient).mockReturnValue(admin as never);
    const res = await request(
      "/api/rental/agreements",
      {
        method: "POST",
        headers: { Authorization: `Bearer ${await makeJwt("showroom", DEALER_ID)}`, "content-type": "application/json" },
        body: JSON.stringify({ ...payload, startDate: "2026-07-25", signedNric: "900101-14-5555" }),
      },
      env,
    );
    expect(res.status).toBe(201);
    // 0278 — the signature is stored BEFORE the RPC, because the DB needs a
    // path to stamp and the agreement id does not exist until the RPC returns.
    expect(admin.calls.uploads).toHaveLength(1);
    expect(admin.calls.uploads[0]?.bucket).toBe("rental-agreements");
    // The key is entirely server-generated: no client string reaches the path.
    expect(admin.calls.uploads[0]?.key).toMatch(/^signatures\/\d{4}\/[0-9a-f-]{36}\.png$/);
    expect(admin.calls.uploads[0]?.opts).toMatchObject({ contentType: "image/png", upsert: false });
    expect(admin.calls.removes).toHaveLength(0);
    expect(sb.calls.rpc[0]?.name).toBe("create_rental_agreement");
    expect(sb.calls.rpc[0]?.args).toMatchObject({
      p_plan_id: PLAN_ID,
      p_customer_name: "Tan Mei Ling",
      p_customer_phone: "0123456789",
      p_start_date: "2026-07-25",
      p_signed_name: "Tan Mei Ling",
      p_signed_nric: "900101-14-5555",
    });
    // the path handed to the DB is bucket-prefixed, which is what the RPC's own
    // `rental-agreements/%` guard checks for
    expect(
      (sb.calls.rpc[0]?.args as Record<string, string>).p_signature_path,
    ).toBe(`rental-agreements/${admin.calls.uploads[0]?.key}`);
    // and the raw base64 never travels to the database
    expect(JSON.stringify(sb.calls.rpc[0]?.args)).not.toContain("base64");
    const body = (await res.json()) as Record<string, Record<string, unknown>>;
    expect(body.agreement).toMatchObject({ agreementNo: "RA-1001", termMonths: 84, monthlyFee: 59 });
    expect(body.customer).toMatchObject({ phoneKey: "123456789" });
    expect(body.unit).toMatchObject({ unitCode: "RU-1001", status: "allocated" });
  });

  // ── 0278 — the signature stops being thrown away ─────────────────────────

  it("refuses a signup carrying no signature, and stores nothing", async () => {
    const sb = makeSb({});
    const admin = makeAdminStorage();
    vi.mocked(userClient).mockReturnValue(sb as never);
    vi.mocked(adminClient).mockReturnValue(admin as never);
    const { signatureDataUrl: _omit, ...unsigned } = payload;
    const res = await request(
      "/api/rental/agreements",
      {
        method: "POST",
        headers: { Authorization: `Bearer ${await makeJwt("dealer", DEALER_ID)}`, "content-type": "application/json" },
        body: JSON.stringify(unsigned),
      },
      env,
    );
    expect(res.status).toBe(422);
    // nothing written, nothing called — the refusal is at the door
    expect(admin.calls.uploads).toHaveLength(0);
    expect(sb.calls.rpc).toHaveLength(0);
  });

  it("deletes the stored signature when the RPC refuses, so a failed signup leaves no orphan", async () => {
    const sb = makeSb({}, {
      data: null,
      error: {
        message: "No rental agreement wording is published",
        details: "no_agreement_template",
      },
    });
    const admin = makeAdminStorage();
    vi.mocked(userClient).mockReturnValue(sb as never);
    vi.mocked(adminClient).mockReturnValue(admin as never);
    const res = await request(
      "/api/rental/agreements",
      {
        method: "POST",
        headers: { Authorization: `Bearer ${await makeJwt("showroom", DEALER_ID)}`, "content-type": "application/json" },
        body: JSON.stringify(payload),
      },
      env,
    );
    // the one refusal a store can actually trigger: Loo has not published the
    // wording. It must arrive NAMED so the POS can say which screen to go to.
    expect(res.status).toBe(422);
    expect(((await res.json()) as { code: string }).code).toBe("no_agreement_template");
    expect(admin.calls.uploads).toHaveLength(1);
    expect(admin.calls.removes).toHaveLength(1);
    expect(admin.calls.removes[0]?.keys).toEqual([admin.calls.uploads[0]?.key]);
  });

  it("surfaces a storage failure instead of creating an unsigned agreement", async () => {
    const sb = makeSb({});
    const admin = makeAdminStorage({ error: { message: "bucket unavailable" } });
    vi.mocked(userClient).mockReturnValue(sb as never);
    vi.mocked(adminClient).mockReturnValue(admin as never);
    const res = await request(
      "/api/rental/agreements",
      {
        method: "POST",
        headers: { Authorization: `Bearer ${await makeJwt("dealer", DEALER_ID)}`, "content-type": "application/json" },
        body: JSON.stringify(payload),
      },
      env,
    );
    expect(res.status).toBe(500);
    // the critical half: the RPC was never reached, so no contract exists
    // claiming a signature that was never stored.
    expect(sb.calls.rpc).toHaveLength(0);
  });

  it("maps the other 0278 guards to named 422s", async () => {
    for (const detail of ["signature_required", "invalid_signature_path", "signed_name_required"]) {
      const sb = makeSb({}, { data: null, error: { message: detail, details: detail } });
      vi.mocked(userClient).mockReturnValue(sb as never);
      vi.mocked(adminClient).mockReturnValue(makeAdminStorage() as never);
      const res = await request(
        "/api/rental/agreements",
        {
          method: "POST",
          headers: { Authorization: `Bearer ${await makeJwt("dealer", DEALER_ID)}`, "content-type": "application/json" },
          body: JSON.stringify(payload),
        },
        env,
      );
      expect(res.status).toBe(422);
      expect(((await res.json()) as { code: string }).code).toBe(detail);
    }
  });

  it("maps RPC business raises to friendly codes (plan_inactive → 422, forbidden → 403)", async () => {
    vi.mocked(adminClient).mockReturnValue(makeAdminStorage() as never);
    const inactive = makeSb({}, {
      data: null,
      error: { message: "Rental plan is not active", details: "plan_inactive" },
    });
    vi.mocked(userClient).mockReturnValue(inactive as never);
    const res1 = await request(
      "/api/rental/agreements",
      {
        method: "POST",
        headers: { Authorization: `Bearer ${await makeJwt("dealer", DEALER_ID)}`, "content-type": "application/json" },
        body: JSON.stringify(payload),
      },
      env,
    );
    expect(res1.status).toBe(422);
    expect(((await res1.json()) as { code: string }).code).toBe("plan_inactive");

    const forbidden = makeSb({}, {
      data: null,
      error: { message: "Role cannot sell rental plans", details: "forbidden" },
    });
    vi.mocked(userClient).mockReturnValue(forbidden as never);
    const res2 = await request(
      "/api/rental/agreements",
      {
        method: "POST",
        headers: { Authorization: `Bearer ${await makeJwt("finance")}`, "content-type": "application/json" },
        body: JSON.stringify(payload),
      },
      env,
    );
    expect(res2.status).toBe(403);
  });
});

describe("GET /api/rental/agreement-template (0278 — the paper the store shows)", () => {
  const TEMPLATE_ROW = {
    id: "00000000-0000-0000-0000-0000000e0009",
    doc_key: "rent_to_own",
    name: "Rental Agreement — T&C (v5)",
    binds_to: ["mattress", "bedframe", "sofa"],
    version: 2,
    body: [{ kind: "h2", text: "Terms and Conditions" }],
    fields: ["customer.name"],
    effective_from: "2026-07-06",
    active: true,
    created_at: "2026-07-26T00:00:00Z",
    updated_at: "2026-07-26T00:00:00Z",
    updated_by: null,
  };

  it("lets a STORE read the wording it is asking a customer to sign", async () => {
    // The table itself is RLS internal-only (0267), so without the definer
    // function a store could not display the contract at all.
    const sb = makeSb({}, { data: TEMPLATE_ROW, error: null });
    vi.mocked(userClient).mockReturnValue(sb as never);
    const res = await request(
      "/api/rental/agreement-template",
      { headers: { Authorization: `Bearer ${await makeJwt("showroom", DEALER_ID)}` } },
      env,
    );
    expect(res.status).toBe(200);
    expect(sb.calls.rpc[0]?.name).toBe("rental_current_agreement_template");
    expect(sb.calls.rpc[0]?.args).toMatchObject({ p_doc_key: "rent_to_own" });
    const body = (await res.json()) as { template: Record<string, unknown> };
    expect(body.template).toMatchObject({ version: 2, docKey: "rent_to_own" });
  });

  it("returns template:null — a real answer — when nothing is published yet", async () => {
    // This is live truth today: rental_agreement_templates holds ZERO rows.
    const sb = makeSb({}, { data: null, error: null });
    vi.mocked(userClient).mockReturnValue(sb as never);
    const res = await request(
      "/api/rental/agreement-template",
      { headers: { Authorization: `Bearer ${await makeJwt("dealer", DEALER_ID)}` } },
      env,
    );
    expect(res.status).toBe(200);
    expect((await res.json()) as { template: unknown }).toEqual({ template: null });
  });

  it("refuses a non-selling role and an unauthenticated caller", async () => {
    vi.mocked(userClient).mockReturnValue(makeSb({}) as never);
    const asPartner = await request(
      "/api/rental/agreement-template",
      { headers: { Authorization: `Bearer ${await makeJwt("partner")}` } },
      env,
    );
    expect(asPartner.status).toBe(403);
    const anon = await request("/api/rental/agreement-template", {}, env);
    expect(anon.status).toBe(401);
  });
});

describe("POST /api/rental/agreements/:id/stripe/checkout (0255 subscription link)", () => {
  it("503s when Stripe is not configured", async () => {
    const res = await request(
      `/api/rental/agreements/${AG_ID}/stripe/checkout`,
      { method: "POST", headers: { Authorization: `Bearer ${await makeJwt("dealer", DEALER_ID)}` } },
      baseEnv,
    );
    expect(res.status).toBe(503);
  });

  it("404s a store JWT on another dealer's agreement (existence not leaked)", async () => {
    const admin = makeSb({
      rental_agreements: { maybeSingle: { data: { ...AGREEMENT, dealer_id: OTHER_DEALER }, error: null } },
    });
    vi.mocked(adminClient).mockReturnValue(admin as never);
    const res = await request(
      `/api/rental/agreements/${AG_ID}/stripe/checkout`,
      { method: "POST", headers: { Authorization: `Bearer ${await makeJwt("dealer", DEALER_ID)}` } },
      env,
    );
    expect(res.status).toBe(404);
  });

  it("409s an agreement that already has a subscription", async () => {
    const admin = makeSb({
      rental_agreements: {
        maybeSingle: { data: { ...AGREEMENT, stripe_subscription_id: "sub_live" }, error: null },
      },
    });
    vi.mocked(adminClient).mockReturnValue(admin as never);
    const res = await request(
      `/api/rental/agreements/${AG_ID}/stripe/checkout`,
      { method: "POST", headers: { Authorization: `Bearer ${await makeJwt("dealer", DEALER_ID)}` } },
      env,
    );
    expect(res.status).toBe(409);
    expect(((await res.json()) as { code: string }).code).toBe("already_subscribed");
  });

  it("422s when the plan has no synced Stripe price", async () => {
    const admin = makeSb({
      rental_agreements: { maybeSingle: { data: AGREEMENT, error: null } },
      rental_plans: { maybeSingle: { data: { stripe_price_id: null, monthly_fee: 59 }, error: null } },
    });
    vi.mocked(adminClient).mockReturnValue(admin as never);
    const res = await request(
      `/api/rental/agreements/${AG_ID}/stripe/checkout`,
      { method: "POST", headers: { Authorization: `Bearer ${await makeJwt("dealer", DEALER_ID)}` } },
      env,
    );
    expect(res.status).toBe(422);
    expect(((await res.json()) as { code: string }).code).toBe("plan_not_synced");
  });

  it("422s when the plan was re-priced after signup (no silent money)", async () => {
    const admin = makeSb({
      rental_agreements: { maybeSingle: { data: AGREEMENT, error: null } },
      rental_plans: { maybeSingle: { data: { stripe_price_id: "price_X", monthly_fee: 69 }, error: null } },
    });
    vi.mocked(adminClient).mockReturnValue(admin as never);
    const res = await request(
      `/api/rental/agreements/${AG_ID}/stripe/checkout`,
      { method: "POST", headers: { Authorization: `Bearer ${await makeJwt("dealer", DEALER_ID)}` } },
      env,
    );
    expect(res.status).toBe(422);
    expect(((await res.json()) as { code: string }).code).toBe("plan_repriced");
  });

  it("mints the subscription session: Stripe Customer created + reused, tracker row written", async () => {
    const admin = makeSb({
      rental_agreements: { maybeSingle: { data: AGREEMENT, error: null } },
      rental_plans: { maybeSingle: { data: { stripe_price_id: "price_X", monthly_fee: 59 }, error: null } },
      stripe_checkout_sessions: { single: { data: RENTAL_SESSION, error: null } },
    });
    vi.mocked(adminClient).mockReturnValue(admin as never);
    const stripe = makeStripe();
    vi.mocked(stripeClient).mockReturnValue(stripe);

    const res = await request(
      `/api/rental/agreements/${AG_ID}/stripe/checkout`,
      { method: "POST", headers: { Authorization: `Bearer ${await makeJwt("dealer", DEALER_ID)}` } },
      env,
    );
    expect(res.status).toBe(201);

    // Customer minted with our namespace + written back onto customers.
    expect(stripe.customers.create).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({ carres_source: "carres-portal", carres_customer_id: CUST_ID }),
      }),
    );
    expect(admin.calls.updates.some((u) => u.table === "customers")).toBe(true);

    const createArgs = stripe.checkout.sessions.create.mock.calls[0]![0] as Record<string, unknown>;
    expect(createArgs.mode).toBe("subscription");
    expect(createArgs.customer).toBe("cus_test_1");
    expect(createArgs.line_items).toEqual([{ price: "price_X", quantity: 1 }]);
    expect((createArgs.success_url as string).startsWith("https://pos.test/pay/success?ra=RA-1001")).toBe(true);

    const insert = admin.calls.inserts.find((i) => i.table === "stripe_checkout_sessions");
    expect(insert?.payload).toMatchObject({
      agreement_id: AG_ID,
      purpose: "rental_subscription",
      amount: 59,
      status: "open",
    });

    const body = (await res.json()) as { session: Record<string, unknown> };
    expect(body.session).toMatchObject({ sessionId: "cs_test_ra", amount: 59, status: "open" });
  });

  it("expires the Stripe session when the tracker insert fails (money safety)", async () => {
    const admin = makeSb({
      rental_agreements: { maybeSingle: { data: AGREEMENT, error: null } },
      rental_plans: { maybeSingle: { data: { stripe_price_id: "price_X", monthly_fee: 59 }, error: null } },
      stripe_checkout_sessions: { single: { data: null, error: { code: "23505", message: "dup" } } },
    });
    vi.mocked(adminClient).mockReturnValue(admin as never);
    const stripe = makeStripe();
    vi.mocked(stripeClient).mockReturnValue(stripe);

    const res = await request(
      `/api/rental/agreements/${AG_ID}/stripe/checkout`,
      { method: "POST", headers: { Authorization: `Bearer ${await makeJwt("dealer", DEALER_ID)}` } },
      env,
    );
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(stripe.checkout.sessions.expire).toHaveBeenCalledWith("cs_test_ra");
  });
});

describe("GET /api/rental/agreements/:id/stripe/checkout/:sid (poll + live reconcile)", () => {
  it("on a completed subscription session: wraps the fixed term, links via RPC, returns paid", async () => {
    const paidRow = { ...RENTAL_SESSION, status: "paid", paid_at: "2026-07-25T01:00:00Z" };
    const admin = makeSb({
      rental_agreements: { maybeSingle: { data: AGREEMENT, error: null } },
      stripe_checkout_sessions: {
        // 1st maybeSingle = the tracker row (open); 2nd = the refetch (paid).
        maybeSingle: [
          { data: RENTAL_SESSION, error: null },
          { data: paidRow, error: null },
        ],
      },
    });
    vi.mocked(adminClient).mockReturnValue(admin as never);
    const stripe = makeStripe();
    stripe.checkout.sessions.retrieve.mockResolvedValue({
      id: "cs_test_ra",
      status: "complete",
      subscription: "sub_test_1",
      customer: "cus_test_1",
    });
    vi.mocked(stripeClient).mockReturnValue(stripe);

    const res = await request(
      `/api/rental/agreements/${AG_ID}/stripe/checkout/cs_test_ra`,
      { headers: { Authorization: `Bearer ${await makeJwt("dealer", DEALER_ID)}` } },
      env,
    );
    expect(res.status).toBe(200);
    expect(ensureFixedTermSchedule).toHaveBeenCalledWith(stripe, "sub_test_1", 84);
    expect(admin.calls.rpc[0]).toMatchObject({
      name: "link_rental_subscription",
      args: {
        p_session_id: "cs_test_ra",
        p_stripe_subscription_id: "sub_test_1",
        p_stripe_customer_id: "cus_test_1",
      },
    });
    const body = (await res.json()) as { session: { status: string } };
    expect(body.session.status).toBe("paid");
  });
});

describe("POST /stripe/webhook — subscription-mode branch (0255)", () => {
  async function fireWebhook(sessionObj: Record<string, unknown>) {
    const stripe = makeStripe();
    stripe.webhooks.constructEventAsync.mockResolvedValue({
      type: "checkout.session.completed",
      data: { object: sessionObj },
    });
    vi.mocked(stripeClient).mockReturnValue(stripe);
    const res = await request(
      "/stripe/webhook",
      { method: "POST", headers: { "stripe-signature": "t=1,v1=x" }, body: "{}" },
      env,
    );
    return { res, stripe };
  }

  it("wraps the schedule then links the ids for a tracked rental session", async () => {
    const admin = makeSb(
      {
        stripe_checkout_sessions: { maybeSingle: { data: { agreement_id: AG_ID }, error: null } },
        rental_agreements: { maybeSingle: { data: { term_months: 84 }, error: null } },
      },
      { data: { already: false }, error: null },
    );
    vi.mocked(adminClient).mockReturnValue(admin as never);

    const { res } = await fireWebhook({
      id: "cs_test_ra",
      mode: "subscription",
      payment_status: "paid",
      subscription: "sub_test_1",
      customer: "cus_test_1",
    });
    expect(res.status).toBe(200);
    expect(ensureFixedTermSchedule).toHaveBeenCalledWith(expect.anything(), "sub_test_1", 84);
    expect(admin.calls.rpc[0]).toMatchObject({
      name: "link_rental_subscription",
      args: { p_session_id: "cs_test_ra", p_stripe_subscription_id: "sub_test_1" },
    });
  });

  it("acknowledges (not 500) a subscription session we never minted", async () => {
    const admin = makeSb({
      stripe_checkout_sessions: { maybeSingle: { data: null, error: null } },
    });
    vi.mocked(adminClient).mockReturnValue(admin as never);

    const { res } = await fireWebhook({
      id: "cs_foreign",
      mode: "subscription",
      payment_status: "paid",
      subscription: "sub_foreign",
    });
    expect(res.status).toBe(200);
    expect((await res.json()) as Record<string, unknown>).toMatchObject({ ignored: "unknown_session" });
    expect(ensureFixedTermSchedule).not.toHaveBeenCalled();
    expect(admin.calls.rpc).toHaveLength(0);
  });

  it("500s (so Stripe retries) when the schedule wrap fails — never open-ended silently", async () => {
    const admin = makeSb(
      {
        stripe_checkout_sessions: { maybeSingle: { data: { agreement_id: AG_ID }, error: null } },
        rental_agreements: { maybeSingle: { data: { term_months: 84 }, error: null } },
      },
      { data: { already: false }, error: null },
    );
    vi.mocked(adminClient).mockReturnValue(admin as never);
    vi.mocked(ensureFixedTermSchedule).mockRejectedValue(new Error("stripe down"));

    const { res } = await fireWebhook({
      id: "cs_test_ra",
      mode: "subscription",
      payment_status: "paid",
      subscription: "sub_test_1",
    });
    expect(res.status).toBe(500);
    expect(admin.calls.rpc).toHaveLength(0); // link never ran — retry re-attempts both
  });
});

describe("plan authoring → Stripe sync (0255)", () => {
  it("POST /plans stores the ensured product/price ids and reports stripeSync", async () => {
    const inserted = {
      id: PLAN_ID,
      sku: "M-CLOUD-K",
      term_months: 84,
      monthly_fee: 59,
      supplier_rate_pct: 49,
      commission_base_pct: 20,
      included_package_id: null,
      active: false,
      stripe_product_id: null,
      stripe_price_id: null,
      created_at: "2026-07-25T00:00:00Z",
      updated_at: "2026-07-25T00:00:00Z",
      updated_by: null,
    };
    const updated = { ...inserted, stripe_product_id: "prod_X", stripe_price_id: "price_X" };
    const sb = makeSb({
      rental_plans: {
        // insert → sibling lookup (none) → id write-back
        maybeSingle: [
          { data: inserted, error: null },
          { data: null, error: null },
          { data: updated, error: null },
        ],
      },
    });
    vi.mocked(userClient).mockReturnValue(sb as never);
    vi.mocked(ensureRentalPlanStripeObjects).mockResolvedValue({
      productId: "prod_X",
      priceId: "price_X",
      archivedPriceId: null,
    });

    const res = await request(
      "/api/rental/plans",
      {
        method: "POST",
        headers: { Authorization: `Bearer ${await makeJwt("principal")}`, "content-type": "application/json" },
        body: JSON.stringify({ sku: "M-CLOUD-K", termMonths: 84, monthlyFee: 59, supplierRatePct: 49, commissionBasePct: 20 }),
      },
      env,
    );
    expect(res.status).toBe(201);
    const body = (await res.json()) as { plan: Record<string, unknown>; stripeSync: { status: string } };
    expect(body.stripeSync.status).toBe("synced");
    expect(body.plan).toMatchObject({ stripeProductId: "prod_X", stripePriceId: "price_X" });
    expect(sb.calls.updates.some((u) =>
      u.table === "rental_plans" &&
      (u.payload as Record<string, unknown>).stripe_price_id === "price_X",
    )).toBe(true);
  });

  it("a Stripe failure NEVER fails the save — plan persists, stripeSync=error", async () => {
    const inserted = {
      id: PLAN_ID,
      sku: "M-CLOUD-K",
      term_months: 60,
      monthly_fee: 79,
      supplier_rate_pct: 0,
      commission_base_pct: 0,
      included_package_id: null,
      active: false,
      stripe_product_id: null,
      stripe_price_id: null,
      created_at: "2026-07-25T00:00:00Z",
      updated_at: "2026-07-25T00:00:00Z",
      updated_by: null,
    };
    const sb = makeSb({
      rental_plans: {
        maybeSingle: [
          { data: inserted, error: null },
          { data: null, error: null },
        ],
      },
    });
    vi.mocked(userClient).mockReturnValue(sb as never);
    vi.mocked(ensureRentalPlanStripeObjects).mockRejectedValue(new Error("stripe down"));

    const res = await request(
      "/api/rental/plans",
      {
        method: "POST",
        headers: { Authorization: `Bearer ${await makeJwt("principal")}`, "content-type": "application/json" },
        body: JSON.stringify({ sku: "M-CLOUD-K", termMonths: 60, monthlyFee: 79 }),
      },
      env,
    );
    expect(res.status).toBe(201);
    const body = (await res.json()) as { stripeSync: { status: string; message?: string } };
    expect(body.stripeSync.status).toBe("error");
    expect(body.stripeSync.message).toMatch(/stripe down/);
  });
});

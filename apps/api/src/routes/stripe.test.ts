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

vi.mock("../lib/supabase", () => ({ userClient: vi.fn(), adminClient: vi.fn() }));
import { adminClient, userClient } from "../lib/supabase";

// The Stripe SDK itself is not under test — the client factory is mocked so
// each test scripts what "Stripe" answers (create / retrieve / signature).
vi.mock("../lib/stripe", () => ({
  stripeConfigured: (env: { STRIPE_SECRET_KEY?: string }) => !!env.STRIPE_SECRET_KEY,
  stripeClient: vi.fn(),
  webCryptoProvider: {},
  describePaymentMethod: () => "fpx (maybank2u)",
  receiptUrlOf: () => "https://pay.stripe.com/receipts/test",
}));
import { stripeClient } from "../lib/stripe";

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
  PUBLIC_WEB_URL: "https://web.test",
};

const KID = "k1";
let signKey: KeyLike;
let publicJwk: JWK;

async function makeJwt(role: string) {
  return new SignJWT({ email: `${role}@x`, app_metadata: { role } })
    .setProtectedHeader({ alg: "ES256", kid: KID, typ: "JWT" })
    .setSubject("u1")
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(signKey);
}

interface TableCfg {
  list?: { data: unknown; error: unknown };
  single?: { data: unknown; error: unknown };
  maybeSingle?: { data: unknown; error: unknown };
}

function makeSb(byTable: Record<string, TableCfg>, rpc?: { data: unknown; error: unknown }) {
  const calls = { inserts: [] as unknown[], updates: [] as unknown[], rpc: [] as { name: string; args: unknown }[] };
  const from = vi.fn((table: string) => {
    const cfg = byTable[table] ?? {};
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const builder: any = {
      select: vi.fn(() => builder),
      insert: vi.fn((payload: unknown) => {
        calls.inserts.push(payload);
        return builder;
      }),
      update: vi.fn((payload: unknown) => {
        calls.updates.push(payload);
        return builder;
      }),
      eq: vi.fn(() => builder),
      single: vi.fn(() => Promise.resolve(cfg.single ?? { data: null, error: null })),
      maybeSingle: vi.fn(() => Promise.resolve(cfg.maybeSingle ?? { data: null, error: null })),
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

/** Scriptable stand-in for the Stripe SDK client. */
function makeStripe(overrides: Record<string, unknown> = {}) {
  return {
    webhooks: { constructEventAsync: vi.fn() },
    paymentIntents: { retrieve: vi.fn().mockResolvedValue({ id: "pi_1", latest_charge: null }) },
    // 0295 — the decline-reason lookup. Default: an invoice with no expanded
    // payment, i.e. "we could not find out why", which must still record.
    invoices: { retrieve: vi.fn().mockResolvedValue({ id: "in_1", payments: undefined }) },
    checkout: {
      sessions: {
        create: vi.fn().mockResolvedValue({ id: "cs_test_abc", url: "https://checkout.stripe.com/c/cs_test_abc" }),
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
});

afterAll(() => _setJwksForTesting(null));

const ORDER_ID = "00000000-0000-0000-0000-00000000010a";
const ORDER = {
  id: ORDER_ID,
  so: 1174,
  dl: 42,
  dealer_id: "00000000-0000-0000-0000-0000000000dd",
  status: "place",
  paid: 500,
  customer_name: "Tan",
  customer_email: "tan@x.my",
  order_lines: [{ unit_price: 1000, qty: 2 }],
  order_addons: [{ unit_price: 100, qty: 1 }],
}; // total 2100, outstanding 1600

const SESSION_ROW = {
  id: "row-1",
  order_id: ORDER_ID,
  session_id: "cs_test_abc",
  payment_intent_id: null,
  amount: 1600,
  purpose: "order_balance",
  url: "https://checkout.stripe.com/c/cs_test_abc",
  status: "open",
  payment_method_detail: null,
  created_at: "2026-07-14T00:00:00Z",
  expires_at: "2026-07-15T00:00:00Z",
  paid_at: null,
};

// =====================================================================
// POST /api/orders/:id/stripe/checkout
// =====================================================================
describe("POST /:id/stripe/checkout", () => {
  it("401 without Authorization", async () => {
    const res = await app.fetch(
      new Request(`http://t/api/orders/${ORDER_ID}/stripe/checkout`, {
        method: "POST",
        body: JSON.stringify({ amount: 100 }),
      }),
      env,
    );
    expect(res.status).toBe(401);
  });

  it("503 when Stripe keys are not configured", async () => {
    const jwt = await makeJwt("dealer");
    const res = await app.fetch(
      new Request(`http://t/api/orders/${ORDER_ID}/stripe/checkout`, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ amount: 100 }),
      }),
      baseEnv,
    );
    expect(res.status).toBe(503);
  });

  it("403 for a partner role", async () => {
    const jwt = await makeJwt("partner");
    const res = await app.fetch(
      new Request(`http://t/api/orders/${ORDER_ID}/stripe/checkout`, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ amount: 100 }),
      }),
      env,
    );
    expect(res.status).toBe(403);
  });

  it("422 amount_exceeds_outstanding, with maxAmount in the body", async () => {
    const user = makeSb({ orders: { maybeSingle: { data: ORDER, error: null } } });
    vi.mocked(userClient).mockReturnValue(user as never);
    const jwt = await makeJwt("dealer");
    const res = await app.fetch(
      new Request(`http://t/api/orders/${ORDER_ID}/stripe/checkout`, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ amount: 1600.5 }),
      }),
      env,
    );
    expect(res.status).toBe(422);
    const body = (await res.json()) as { code: string; maxAmount: number };
    expect(body.code).toBe("amount_exceeds_outstanding");
    expect(body.maxAmount).toBe(1600);
  });

  it("201 mints a session (sen amount, dashboard-controlled methods) and tracks it", async () => {
    const user = makeSb({ orders: { maybeSingle: { data: ORDER, error: null } } });
    const admin = makeSb({
      stripe_checkout_sessions: { single: { data: SESSION_ROW, error: null } },
    });
    vi.mocked(userClient).mockReturnValue(user as never);
    vi.mocked(adminClient).mockReturnValue(admin as never);
    const stripe = makeStripe();
    vi.mocked(stripeClient).mockReturnValue(stripe);

    const jwt = await makeJwt("dealer");
    const res = await app.fetch(
      new Request(`http://t/api/orders/${ORDER_ID}/stripe/checkout`, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ amount: 1600 }),
      }),
      env,
    );
    expect(res.status).toBe(201);
    const body = (await res.json()) as { session: { sessionId: string; url: string; amount: number } };
    expect(body.session.sessionId).toBe("cs_test_abc");
    expect(body.session.url).toContain("checkout.stripe.com");
    expect(body.session.amount).toBe(1600);

    const createArgs = stripe.checkout.sessions.create.mock.calls[0][0];
    expect(createArgs.line_items[0].price_data.unit_amount).toBe(160000); // RM → sen
    expect(createArgs.payment_method_types).toBeUndefined(); // dashboard controls methods
    expect(createArgs.success_url).toContain("https://web.test/pay/success");
    expect(createArgs.metadata.order_id).toBe(ORDER_ID);
    expect(admin.calls.inserts).toHaveLength(1);
  });

  it("expires the Stripe session when the tracker insert fails (no untracked payable link)", async () => {
    const user = makeSb({ orders: { maybeSingle: { data: ORDER, error: null } } });
    const admin = makeSb({
      stripe_checkout_sessions: { single: { data: null, error: { code: "XX000", message: "boom" } } },
    });
    vi.mocked(userClient).mockReturnValue(user as never);
    vi.mocked(adminClient).mockReturnValue(admin as never);
    const stripe = makeStripe();
    vi.mocked(stripeClient).mockReturnValue(stripe);

    const jwt = await makeJwt("dealer");
    const res = await app.fetch(
      new Request(`http://t/api/orders/${ORDER_ID}/stripe/checkout`, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ amount: 100 }),
      }),
      env,
    );
    expect(res.status).toBeGreaterThanOrEqual(500);
    expect(stripe.checkout.sessions.expire).toHaveBeenCalledWith("cs_test_abc");
  });
});

// =====================================================================
// GET /api/orders/:id/stripe/checkout/:sid — poll + live reconcile
// =====================================================================
describe("GET /:id/stripe/checkout/:sid", () => {
  it("records via the RPC when Stripe says paid while the row is still open", async () => {
    const user = makeSb({ orders: { maybeSingle: { data: ORDER, error: null } } });
    const admin = makeSb({
      stripe_checkout_sessions: {
        maybeSingle: { data: { ...SESSION_ROW }, error: null },
      },
    });
    vi.mocked(userClient).mockReturnValue(user as never);
    vi.mocked(adminClient).mockReturnValue(admin as never);
    const stripe = makeStripe();
    stripe.checkout.sessions.retrieve.mockResolvedValue({
      id: "cs_test_abc",
      status: "complete",
      payment_status: "paid",
      payment_intent: { id: "pi_1", latest_charge: null },
    });
    vi.mocked(stripeClient).mockReturnValue(stripe);

    const jwt = await makeJwt("dealer");
    const res = await app.fetch(
      new Request(`http://t/api/orders/${ORDER_ID}/stripe/checkout/cs_test_abc`, {
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    expect(res.status).toBe(200);
    expect(admin.calls.rpc).toHaveLength(1);
    expect(admin.calls.rpc[0].name).toBe("record_stripe_checkout_payment");
    expect((admin.calls.rpc[0].args as { p_session_id: string }).p_session_id).toBe("cs_test_abc");
  });

  it("404 for a session id that is not ours", async () => {
    const user = makeSb({ orders: { maybeSingle: { data: ORDER, error: null } } });
    const admin = makeSb({ stripe_checkout_sessions: { maybeSingle: { data: null, error: null } } });
    vi.mocked(userClient).mockReturnValue(user as never);
    vi.mocked(adminClient).mockReturnValue(admin as never);
    const jwt = await makeJwt("dealer");
    const res = await app.fetch(
      new Request(`http://t/api/orders/${ORDER_ID}/stripe/checkout/cs_test_nope`, {
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    expect(res.status).toBe(404);
  });
});

// =====================================================================
// POST /stripe/webhook — signature is the trust boundary
// =====================================================================
describe("POST /stripe/webhook", () => {
  function hook(body: unknown, sig?: string) {
    return new Request("http://t/stripe/webhook", {
      method: "POST",
      headers: sig ? { "stripe-signature": sig } : {},
      body: JSON.stringify(body),
    });
  }

  it("503 when not configured", async () => {
    const res = await app.fetch(hook({}, "sig"), baseEnv);
    expect(res.status).toBe(503);
  });

  it("400 without a signature header", async () => {
    const res = await app.fetch(hook({}), env);
    expect(res.status).toBe(400);
  });

  it("400 on an invalid signature", async () => {
    const stripe = makeStripe();
    stripe.webhooks.constructEventAsync.mockRejectedValue(new Error("bad sig"));
    vi.mocked(stripeClient).mockReturnValue(stripe);
    const res = await app.fetch(hook({}, "bad"), env);
    expect(res.status).toBe(400);
  });

  it("records a paid checkout.session.completed via the RPC", async () => {
    const admin = makeSb({}, { data: { already: false }, error: null });
    vi.mocked(adminClient).mockReturnValue(admin as never);
    const stripe = makeStripe();
    stripe.webhooks.constructEventAsync.mockResolvedValue({
      type: "checkout.session.completed",
      data: { object: { id: "cs_test_abc", payment_status: "paid", payment_intent: "pi_1" } },
    });
    vi.mocked(stripeClient).mockReturnValue(stripe);

    const res = await app.fetch(hook({}, "good"), env);
    expect(res.status).toBe(200);
    expect(admin.calls.rpc).toHaveLength(1);
    expect(admin.calls.rpc[0].name).toBe("record_stripe_checkout_payment");
  });

  it("does NOT record while an async payment is still pending", async () => {
    const admin = makeSb({});
    vi.mocked(adminClient).mockReturnValue(admin as never);
    const stripe = makeStripe();
    stripe.webhooks.constructEventAsync.mockResolvedValue({
      type: "checkout.session.completed",
      data: { object: { id: "cs_test_abc", payment_status: "unpaid", payment_intent: "pi_1" } },
    });
    vi.mocked(stripeClient).mockReturnValue(stripe);

    const res = await app.fetch(hook({}, "good"), env);
    expect(res.status).toBe(200);
    expect(admin.calls.rpc).toHaveLength(0);
  });

  it("acknowledges (200) an unknown session so Stripe stops retrying it", async () => {
    const admin = makeSb({}, { data: null, error: { message: "Unknown checkout session", details: "session_not_found" } });
    vi.mocked(adminClient).mockReturnValue(admin as never);
    const stripe = makeStripe();
    stripe.webhooks.constructEventAsync.mockResolvedValue({
      type: "checkout.session.completed",
      data: { object: { id: "cs_live_foreign", payment_status: "paid", payment_intent: null } },
    });
    vi.mocked(stripeClient).mockReturnValue(stripe);

    const res = await app.fetch(hook({}, "good"), env);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ignored?: string };
    expect(body.ignored).toBe("unknown_session");
  });

  it("500s on a real recording failure so Stripe retries", async () => {
    const admin = makeSb({}, { data: null, error: { message: "db down", details: null } });
    vi.mocked(adminClient).mockReturnValue(admin as never);
    const stripe = makeStripe();
    stripe.webhooks.constructEventAsync.mockResolvedValue({
      type: "checkout.session.completed",
      data: { object: { id: "cs_test_abc", payment_status: "paid", payment_intent: null } },
    });
    vi.mocked(stripeClient).mockReturnValue(stripe);

    const res = await app.fetch(hook({}, "good"), env);
    expect(res.status).toBe(500);
  });

  it("marks the tracker row expired on checkout.session.expired", async () => {
    const admin = makeSb({ stripe_checkout_sessions: { list: { data: null, error: null } } });
    vi.mocked(adminClient).mockReturnValue(admin as never);
    const stripe = makeStripe();
    stripe.webhooks.constructEventAsync.mockResolvedValue({
      type: "checkout.session.expired",
      data: { object: { id: "cs_test_abc" } },
    });
    vi.mocked(stripeClient).mockReturnValue(stripe);

    const res = await app.fetch(hook({}, "good"), env);
    expect(res.status).toBe(200);
    expect(admin.calls.updates).toHaveLength(1);
    expect(admin.calls.updates[0]).toEqual({ status: "expired" });
  });

  // ── 0295: a bounced card stops being invisible ─────────────────────────────
  describe("invoice.payment_failed", () => {
    const AG = "aaaaaaaa-0000-0000-0000-000000000001";

    /** A failed subscription invoice as Stripe delivers it (v22 shape). */
    function failedInvoice(over: Record<string, unknown> = {}) {
      return {
        id: "in_failed_1",
        number: "CARRES-0007",
        amount_due: 6900,
        amount_paid: 0,
        created: 1_800_000_000,
        parent: { subscription_details: { subscription: "sub_1" } },
        ...over,
      };
    }
    function declineEvent(over: Record<string, unknown> = {}) {
      return {
        id: "evt_fail_1",
        type: "invoice.payment_failed",
        data: { object: failedInvoice(over) },
      };
    }
    function withAgreement(rpc?: { data: unknown; error: unknown }) {
      return makeSb(
        { rental_agreements: { maybeSingle: { data: { id: AG }, error: null } } },
        rpc ?? { data: { already: false, seq: 3 }, error: null },
      );
    }

    it("records the decline through the RPC, keyed on the EVENT id", async () => {
      const admin = withAgreement();
      vi.mocked(adminClient).mockReturnValue(admin as never);
      const stripe = makeStripe();
      stripe.webhooks.constructEventAsync.mockResolvedValue(declineEvent());
      vi.mocked(stripeClient).mockReturnValue(stripe);

      const res = await app.fetch(hook({}, "good"), env);
      expect(res.status).toBe(200);
      expect(admin.calls.rpc).toHaveLength(1);
      expect(admin.calls.rpc[0].name).toBe("rental_record_payment_failure");
      const args = admin.calls.rpc[0].args as Record<string, unknown>;
      // The event id, NOT the invoice id: Smart Retries fire again on the same
      // invoice and each attempt is a real, separate refusal.
      expect(args.p_stripe_event_id).toBe("evt_fail_1");
      expect(args.p_agreement_id).toBe(AG);
      // amount_DUE — nothing was paid, and what we failed to collect is the
      // figure finance cares about.
      expect(args.p_amount).toBe(69);
      expect(args.p_reference).toBe("CARRES-0007");
    });

    it("passes the bank's reason, read off the PaymentIntent", async () => {
      const admin = withAgreement();
      vi.mocked(adminClient).mockReturnValue(admin as never);
      const stripe = makeStripe({
        invoices: {
          retrieve: vi.fn().mockResolvedValue({
            id: "in_failed_1",
            payments: {
              data: [
                {
                  payment: {
                    payment_intent: {
                      id: "pi_9",
                      last_payment_error: {
                        code: "card_declined",
                        decline_code: "insufficient_funds",
                        message: "Your card has insufficient funds.",
                      },
                    },
                  },
                },
              ],
            },
          }),
        },
      });
      stripe.webhooks.constructEventAsync.mockResolvedValue(declineEvent());
      vi.mocked(stripeClient).mockReturnValue(stripe);

      const res = await app.fetch(hook({}, "good"), env);
      expect(res.status).toBe(200);
      const args = admin.calls.rpc[0].args as Record<string, unknown>;
      // The plain sentence beats the raw code: it is what finance reads before
      // deciding between "send a new card" and "top up and we retry".
      expect(args.p_reason).toBe("Your card has insufficient funds.");
    });

    it("still records when the reason lookup fails — sugar never blocks the fact", async () => {
      const admin = withAgreement();
      vi.mocked(adminClient).mockReturnValue(admin as never);
      const stripe = makeStripe({
        invoices: { retrieve: vi.fn().mockRejectedValue(new Error("stripe down")) },
      });
      stripe.webhooks.constructEventAsync.mockResolvedValue(declineEvent());
      vi.mocked(stripeClient).mockReturnValue(stripe);

      const res = await app.fetch(hook({}, "good"), env);
      expect(res.status).toBe(200);
      expect(admin.calls.rpc).toHaveLength(1);
      expect((admin.calls.rpc[0].args as Record<string, unknown>).p_reason).toBeNull();
    });

    it("sends null rather than 0 when Stripe reports no amount due", async () => {
      const admin = withAgreement();
      vi.mocked(adminClient).mockReturnValue(admin as never);
      const stripe = makeStripe();
      stripe.webhooks.constructEventAsync.mockResolvedValue(declineEvent({ amount_due: 0 }));
      vi.mocked(stripeClient).mockReturnValue(stripe);

      await app.fetch(hook({}, "good"), env);
      // RM0 would be a lie about a real charge attempt; null lets the RPC use
      // the instalment's own amount.
      expect((admin.calls.rpc[0].args as Record<string, unknown>).p_amount).toBeNull();
    });

    it("ignores an invoice that belongs to no subscription", async () => {
      const admin = withAgreement();
      vi.mocked(adminClient).mockReturnValue(admin as never);
      const stripe = makeStripe();
      stripe.webhooks.constructEventAsync.mockResolvedValue(declineEvent({ parent: null }));
      vi.mocked(stripeClient).mockReturnValue(stripe);

      const res = await app.fetch(hook({}, "good"), env);
      expect(res.status).toBe(200);
      expect((await res.json()) as { ignored?: string }).toEqual({
        received: true,
        ignored: "not_a_subscription_invoice",
      });
      expect(admin.calls.rpc).toHaveLength(0);
    });

    it("acknowledges a subscription that is not ours, so Stripe stops retrying", async () => {
      const admin = makeSb({ rental_agreements: { maybeSingle: { data: null, error: null } } });
      vi.mocked(adminClient).mockReturnValue(admin as never);
      const stripe = makeStripe();
      stripe.webhooks.constructEventAsync.mockResolvedValue(declineEvent());
      vi.mocked(stripeClient).mockReturnValue(stripe);

      const res = await app.fetch(hook({}, "good"), env);
      expect(res.status).toBe(200);
      expect((await res.json()) as { ignored?: string }).toEqual({
        received: true,
        ignored: "unknown_subscription",
      });
      expect(admin.calls.rpc).toHaveLength(0);
    });

    it("500s on a real recording failure so Stripe retries the delivery", async () => {
      const admin = withAgreement({ data: null, error: { message: "db down", details: null } });
      vi.mocked(adminClient).mockReturnValue(admin as never);
      const stripe = makeStripe();
      stripe.webhooks.constructEventAsync.mockResolvedValue(declineEvent());
      vi.mocked(stripeClient).mockReturnValue(stripe);

      const res = await app.fetch(hook({}, "good"), env);
      expect(res.status).toBe(500);
    });

    it("reports a re-delivered event as already recorded, not as a new one", async () => {
      const admin = withAgreement({ data: { already: true, seq: 3 }, error: null });
      vi.mocked(adminClient).mockReturnValue(admin as never);
      const stripe = makeStripe();
      stripe.webhooks.constructEventAsync.mockResolvedValue(declineEvent());
      vi.mocked(stripeClient).mockReturnValue(stripe);

      const res = await app.fetch(hook({}, "good"), env);
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ received: true, seq: 3, already: true });
    });
  });

  /**
   * Both invoice shapes.
   *
   * The live endpoint is pinned to API version 2025-02-24.acacia while the SDK
   * is v22 (Basil-era), and Stripe shapes the payload to the ENDPOINT's version.
   * Basil is where `invoice.subscription` became
   * `parent.subscription_details.subscription`, so code reading only the new
   * field dropped every real invoice on the floor. 0281 shipped its branch with
   * no webhook test at all, which is exactly why nobody noticed.
   */
  describe("invoice shape — acacia (legacy) and basil (parent)", () => {
    const AG2 = "aaaaaaaa-0000-0000-0000-000000000002";
    function sb(rpc: { data: unknown; error: unknown }) {
      return makeSb({ rental_agreements: { maybeSingle: { data: { id: AG2 }, error: null } } }, rpc);
    }
    /** What an acacia-pinned endpoint actually delivers: no `parent` at all. */
    const legacyInvoice = {
      id: "in_legacy_1",
      number: "CARRES-0009",
      amount_due: 5900,
      amount_paid: 5900,
      created: 1_800_000_000,
      status_transitions: { paid_at: 1_800_000_100 },
      subscription: "sub_legacy",
    };
    /** What a basil-pinned endpoint delivers. */
    const parentInvoice = {
      id: "in_basil_1",
      number: "CARRES-0010",
      amount_due: 5900,
      amount_paid: 5900,
      created: 1_800_000_000,
      status_transitions: { paid_at: 1_800_000_100 },
      parent: { subscription_details: { subscription: "sub_basil" } },
    };

    function run(type: string, object: unknown, rpc: { data: unknown; error: unknown }) {
      const admin = sb(rpc);
      vi.mocked(adminClient).mockReturnValue(admin as never);
      const stripe = makeStripe();
      stripe.webhooks.constructEventAsync.mockResolvedValue({ id: "evt_shape", type, data: { object } });
      vi.mocked(stripeClient).mockReturnValue(stripe);
      return { admin, res: app.fetch(hook({}, "good"), env) };
    }

    it("invoice.paid records on the LEGACY shape (this was the live no-op)", async () => {
      const { admin, res } = run("invoice.paid", legacyInvoice, { data: { seq: 2 }, error: null });
      expect((await res).status).toBe(200);
      expect(admin.calls.rpc).toHaveLength(1);
      expect(admin.calls.rpc[0].name).toBe("rental_record_payment");
      expect((admin.calls.rpc[0].args as Record<string, unknown>).p_agreement_id).toBe(AG2);
    });

    it("invoice.paid still records on the new parent shape", async () => {
      const { admin, res } = run("invoice.paid", parentInvoice, { data: { seq: 2 }, error: null });
      expect((await res).status).toBe(200);
      expect(admin.calls.rpc).toHaveLength(1);
      expect(admin.calls.rpc[0].name).toBe("rental_record_payment");
    });

    it("invoice.payment_failed records on the LEGACY shape too", async () => {
      const { admin, res } = run("invoice.payment_failed", legacyInvoice, {
        data: { already: false, seq: 2 },
        error: null,
      });
      expect((await res).status).toBe(200);
      expect(admin.calls.rpc).toHaveLength(1);
      expect(admin.calls.rpc[0].name).toBe("rental_record_payment_failure");
    });

    it("an invoice with NEITHER shape is still ignored, not guessed at", async () => {
      const { admin, res } = run(
        "invoice.paid",
        { id: "in_oneoff", amount_paid: 100, created: 1_800_000_000 },
        { data: null, error: null },
      );
      const r = await res;
      expect(r.status).toBe(200);
      expect(await r.json()).toEqual({ received: true, ignored: "not_a_subscription_invoice" });
      expect(admin.calls.rpc).toHaveLength(0);
    });

    it("accepts an EXPANDED subscription object, not just an id string", async () => {
      const { admin, res } = run(
        "invoice.paid",
        { ...legacyInvoice, subscription: { id: "sub_expanded" } },
        { data: { seq: 2 }, error: null },
      );
      expect((await res).status).toBe(200);
      expect(admin.calls.rpc).toHaveLength(1);
    });
  });
});

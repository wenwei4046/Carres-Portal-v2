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

vi.mock("../lib/supabase", () => ({
  userClient: vi.fn(),
  adminClient: vi.fn(),
}));

import { userClient } from "../lib/supabase";

const KID = "test-kid-raw";
const env = {
  SUPABASE_URL: "https://test.supabase.co",
  SUPABASE_ANON_KEY: "test-anon",
  SUPABASE_SERVICE_ROLE_KEY: "test-service",
  SUPABASE_JWT_SECRET: "unused",
};

const DEALER_A = "00000000-0000-0000-0000-0000000000d1";

let signKey: KeyLike;
let publicJwk: JWK;

async function makeJwt(role: string, dealerId?: string) {
  return new SignJWT({
    email: "who@carres.com",
    app_metadata: { role, ...(dealerId ? { dealer_id: dealerId } : {}) },
  })
    .setProtectedHeader({ alg: "ES256", kid: KID, typ: "JWT" })
    .setSubject("11111111-1111-1111-1111-000000000888")
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(signKey);
}

/** Full orders row the post-create refetch returns (same shape as GET /:id). */
function makeOrderRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "11111111-1111-1111-1111-111111111111",
    so: 1301,
    status: "place",
    channel: "dealer",
    dealer_id: DEALER_A,
    outlet_id: null,
    salesperson_id: null,
    customer_name: "Raw Customer",
    customer_phone: null,
    customer_address: null,
    customer_address_unknown: true,
    customer_billing: null,
    customer_billing_same: true,
    customer_emergency: null,
    delivery_date: null,
    delivery_date_tbd: true,
    delivery_floor: 1,
    delivery_has_lift: false,
    paid: "0",
    signature_url: null,
    payment_slip_url: null,
    terms_accepted: false,
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
    placed_at: "2026-07-03T00:00:00Z",
    order_lines: [],
    order_addons: [],
    order_history: [],
    ...overrides,
  };
}

type RpcError = { code?: string; message?: string; details?: string };

/** Minimal sb mock for the /raw path: rpc(create_order) + orders refetch. */
function buildSb(opts: { rpcError?: RpcError; fetchedRow?: unknown } = {}) {
  const rpcCalls: Array<{ name: string; payload: Record<string, unknown> }> = [];
  const sb = {
    rpc: async (name: string, args: { payload: Record<string, unknown> }) => {
      rpcCalls.push({ name, payload: args.payload });
      if (opts.rpcError) return { data: null, error: opts.rpcError };
      return {
        data: { id: "11111111-1111-1111-1111-111111111111", so: 1301, placed_at: "2026-07-03T00:00:00Z" },
        error: null,
      };
    },
    from: (_table: string) => ({
      select: (_cols?: string) => {
        const chain = {
          eq: () => chain,
          maybeSingle: async () => ({ data: opts.fetchedRow ?? makeOrderRow(), error: null }),
        };
        return chain;
      },
    }),
    _rpcCalls: rpcCalls,
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return sb as any;
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

async function post(jwt: string, body: unknown) {
  return app.fetch(
    new Request("http://x/api/orders/raw", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${jwt}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    }),
    env,
  );
}

const validBody = {
  dealerId: DEALER_A,
  customer: { name: "Raw Customer" },
  lines: [
    { sku: "CLOUD-QUEEN", qty: 1, unitPrice: 2890 },
    { sku: "CUSTOM DELIVERY SURCHARGE", qty: 1, unitPrice: 150.5 },
  ],
};

describe("POST /api/orders/raw — internal raw creation (POS-parity)", () => {
  it("403 for dealer-side roles (raw creation is internal-only)", async () => {
    const sb = buildSb();
    vi.mocked(userClient).mockReturnValue(sb);
    const res = await post(await makeJwt("dealer", DEALER_A), validBody);
    expect(res.status).toBe(403);
    expect(sb._rpcCalls.length).toBe(0);
  });

  it("400 when lines are missing/empty", async () => {
    const sb = buildSb();
    vi.mocked(userClient).mockReturnValue(sb);
    const res = await post(await makeJwt("principal"), { ...validBody, lines: [] });
    expect(res.status).toBe(400);
    expect(sb._rpcCalls.length).toBe(0);
  });

  it("201 happy path: free-form skus + prices pass through verbatim, no POS gates", async () => {
    const sb = buildSb();
    vi.mocked(userClient).mockReturnValue(sb);
    const res = await post(await makeJwt("principal"), validBody);
    expect(res.status).toBe(201);

    const call = sb._rpcCalls[0];
    expect(call.name).toBe("create_order");
    const p = call.payload;
    expect(p.dealer_id).toBe(DEALER_A);
    // No POS gates: no signature, no terms, no payment method, date TBD.
    expect(p.signature_url).toBeNull();
    expect(p.terms_accepted).toBe(false);
    expect(p.payment_method).toBeNull();
    expect(p.delivery_date).toBeNull();
    expect(p.delivery_date_tbd).toBe(true);
    // Lines persist EXACTLY as entered — custom text sku + operator price, attrs null.
    expect(p.lines).toEqual([
      { sku: "CLOUD-QUEEN", qty: 1, attrs: null, unit_price: 2890 },
      { sku: "CUSTOM DELIVERY SURCHARGE", qty: 1, attrs: null, unit_price: 150.5 },
    ]);

    const json = (await res.json()) as { so: number; customer: { name: string } };
    expect(json.so).toBe(1301);
    expect(json.customer.name).toBe("Raw Customer");
  });

  it("optional delivery date is forwarded with TBD off (no lead-time floor on this path)", async () => {
    const sb = buildSb();
    vi.mocked(userClient).mockReturnValue(sb);
    // Tomorrow-adjacent short date would FAIL the POS lead-time floor — the
    // raw path must accept it untouched.
    const res = await post(await makeJwt("operation"), {
      ...validBody,
      deliveryDate: "2026-07-04",
    });
    expect(res.status).toBe(201);
    const p = sb._rpcCalls[0].payload;
    expect(p.delivery_date).toBe("2026-07-04");
    expect(p.delivery_date_tbd).toBe(false);
  });

  it("minimal body still maps to the historical nulls (backward-compatible wire shape)", async () => {
    const sb = buildSb();
    vi.mocked(userClient).mockReturnValue(sb);
    const res = await post(await makeJwt("principal"), validBody);
    expect(res.status).toBe(201);
    const p = sb._rpcCalls[0].payload;
    expect(p.customer_billing).toBeNull();
    expect(p.customer_billing_same).toBe(true);
    expect(p.customer_emergency).toBeNull();
    expect(p.customer_email).toBeNull();
    expect(p.proceed_date).toBeNull();
    expect(p.delivery_floor).toBe(1);
    expect(p.delivery_has_lift).toBe(false);
    expect(p.installment_months).toBeNull();
    expect(p.addons).toEqual([]);
    // entry_data key must be ABSENT (jsonb 'null' would trip the RPC guard).
    expect("entry_data" in p).toBe(false);
  });

  it("POS-parity extras pass through: customer block, delivery extras, payment, addons, entry_data", async () => {
    const sb = buildSb();
    vi.mocked(userClient).mockReturnValue(sb);
    const res = await post(await makeJwt("principal"), {
      ...validBody,
      customer: {
        name: "Raw Customer",
        phone: "0123456789",
        address: "12 Jalan A, KL",
        addressUnknown: false,
        billing: "Suite 8, Menara B",
        billingSame: false,
        emergency: "Alice · 012-9988776 · Spouse",
        email: "cust@example.com",
        race: "Chinese",
        gender: "Female",
        birthday: "1990-04-01",
      },
      deliveryDate: "2026-08-01",
      proceedDate: "2026-07-20",
      deliveryFloor: 3,
      deliveryHasLift: true,
      deliveryStairItems: 2,
      addons: [
        { addonKey: "dispose-mattress", qty: 1, unitPrice: 50, attrs: { size: "Queen" } },
      ],
      paymentMethod: "installment",
      approvalCode: "8821-INST",
      installmentMonths: 12,
      signaturePath: "orders-attachments/d1/w1/signature.png",
      paymentSlipPath: "orders-attachments/d1/w1/payment-slip.jpg",
      termsAccepted: true,
      entryData: { payment: { bank: "Maybank" }, fields: { referral: "Fair 2026" } },
    });
    expect(res.status).toBe(201);
    const p = sb._rpcCalls[0].payload;
    expect(p.customer_address).toBe("12 Jalan A, KL");
    expect(p.customer_billing).toBe("Suite 8, Menara B");
    expect(p.customer_billing_same).toBe(false);
    expect(p.customer_emergency).toBe("Alice · 012-9988776 · Spouse");
    expect(p.customer_email).toBe("cust@example.com");
    expect(p.customer_race).toBe("Chinese");
    expect(p.customer_gender).toBe("Female");
    expect(p.customer_birthday).toBe("1990-04-01");
    expect(p.delivery_date).toBe("2026-08-01");
    expect(p.proceed_date).toBe("2026-07-20");
    expect(p.delivery_floor).toBe(3);
    expect(p.delivery_has_lift).toBe(true);
    expect(p.delivery_stair_items).toBe(2);
    expect(p.payment_method).toBe("installment");
    expect(p.approval_code).toBe("8821-INST");
    expect(p.installment_months).toBe(12);
    expect(p.signature_url).toBe("orders-attachments/d1/w1/signature.png");
    expect(p.payment_slip_url).toBe("orders-attachments/d1/w1/payment-slip.jpg");
    expect(p.terms_accepted).toBe(true);
    expect(p.entry_data).toEqual({ payment: { bank: "Maybank" }, fields: { referral: "Fair 2026" } });
    expect(p.addons).toEqual([
      { addon_key: "dispose-mattress", qty: 1, unit_price: 50, attrs: { size: "Queen" } },
    ]);
  });

  it("line spec attrs pass through but engine-marker keys (pwp/free_gift/free_item) are stripped", async () => {
    const sb = buildSb();
    vi.mocked(userClient).mockReturnValue(sb);
    const res = await post(await makeJwt("principal"), {
      ...validBody,
      lines: [
        {
          sku: "KAYU-QUEEN",
          qty: 1,
          unitPrice: 3200,
          attrs: {
            gap: "KIV",
            options: [{ kind: "bedframe_leg_height", value: "15cm" }],
            pwp: { ruleId: "r1", code: "X" },
            free_gift: true,
          },
        },
        // Attrs that are ONLY marker keys collapse to null.
        { sku: "CLOUD-QUEEN", qty: 1, unitPrice: 2890, attrs: { free_item: true } },
      ],
    });
    expect(res.status).toBe(201);
    const p = sb._rpcCalls[0].payload;
    expect(p.lines).toEqual([
      {
        sku: "KAYU-QUEEN",
        qty: 1,
        attrs: { gap: "KIV", options: [{ kind: "bedframe_leg_height", value: "15cm" }] },
        unit_price: 3200,
      },
      { sku: "CLOUD-QUEEN", qty: 1, attrs: null, unit_price: 2890 },
    ]);
  });

  it("client delivery addons are dropped (server-exclusive keys) and proceed date needs a delivery date", async () => {
    const sb = buildSb();
    vi.mocked(userClient).mockReturnValue(sb);
    const res = await post(await makeJwt("principal"), {
      ...validBody,
      proceedDate: "2026-07-20", // no deliveryDate → must not persist
      paymentMethod: "cash",
      installmentMonths: 6, // non-installment method → months must not persist
      addons: [
        { addonKey: "DELIVERY", qty: 1, unitPrice: 100 },
        { addonKey: "dispose-bedframe", qty: 1, unitPrice: 80, attrs: { size: "King" } },
      ],
    });
    expect(res.status).toBe(201);
    const p = sb._rpcCalls[0].payload;
    expect(p.proceed_date).toBeNull();
    expect(p.installment_months).toBeNull();
    expect(p.addons).toEqual([
      { addon_key: "dispose-bedframe", qty: 1, unit_price: 80, attrs: { size: "King" } },
    ]);
  });

  it("422 rule_violation when the RPC rejects a sofa + mattress/bed-frame mix", async () => {
    const sb = buildSb({
      rpcError: {
        code: "22023",
        message: "sofa cannot mix with mattress or bedframe in the same order",
        details: "mixed_category_lines",
      },
    });
    vi.mocked(userClient).mockReturnValue(sb);
    const res = await post(await makeJwt("principal"), validBody);
    expect(res.status).toBe(422);
    const json = (await res.json()) as { code: string };
    expect(json.code).toBe("mixed_category_lines");
  });
});

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

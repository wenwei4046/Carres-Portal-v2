import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from "vitest";
import { SignJWT, createLocalJWKSet, exportJWK, generateKeyPair, type JWK, type KeyLike } from "jose";
import app from "../../index";
import { _setJwksForTesting } from "../../middleware/auth";

vi.mock("../../lib/supabase", () => ({ userClient: vi.fn() }));
import { userClient } from "../../lib/supabase";

const env = {
  SUPABASE_URL: "https://t.x",
  SUPABASE_ANON_KEY: "a",
  SUPABASE_SERVICE_ROLE_KEY: "s",
  SUPABASE_JWT_SECRET: "",
};
const KID = "k1";
let signKey: KeyLike;
let publicJwk: JWK;

async function makeJwt(role: string) {
  return new SignJWT({ email: `${role}@x`, app_metadata: { role } })
    .setProtectedHeader({ alg: "ES256", kid: KID, typ: "JWT" })
    .setSubject("11111111-1111-1111-1111-000000000001")
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

describe("GET /api/finance/reports/dashboard-summary", () => {
  it("calls finance_dashboard_summary RPC and returns payload", async () => {
    const payload = {
      ar:           { outstanding: 21325, count: 6, overdueAmt: 0, overdueCount: 0 },
      ap:           { dueAmt: 8400, count: 2 },
      cashflow12w:  { inflow: 92000, outflow: 41000, net: 51000 },
      agingBuckets: {
        "0-30":  { amount: 21325, count: 6 },
        "31-60": { amount: 0,     count: 0 },
        "61-90": { amount: 0,     count: 0 },
        "90+":   { amount: 0,     count: 0 },
      },
    };
    const sb = { rpc: vi.fn().mockResolvedValue({ data: payload, error: null }) };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(sb as any);

    const jwt = await makeJwt("finance");
    const res = await app.fetch(
      new Request("http://t/api/finance/reports/dashboard-summary", {
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    expect(res.status).toBe(200);
    expect(sb.rpc).toHaveBeenCalledWith("finance_dashboard_summary");
    expect(await res.json()).toEqual(payload);
  });

  it("admits principal role", async () => {
    const sb = { rpc: vi.fn().mockResolvedValue({ data: {}, error: null }) };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(sb as any);

    const jwt = await makeJwt("principal");
    const res = await app.fetch(
      new Request("http://t/api/finance/reports/dashboard-summary", {
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    expect(res.status).toBe(200);
  });

  it("rejects dealer with 403", async () => {
    const jwt = await makeJwt("dealer");
    const res = await app.fetch(
      new Request("http://t/api/finance/reports/dashboard-summary", {
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    expect(res.status).toBe(403);
  });
});

describe("GET /api/finance/reports/ar-aging", () => {
  it("calls finance_ar_aging RPC and returns rows + buckets", async () => {
    const payload = {
      rows: [
        {
          order_id: "o1", dl: 1240, customer_name: "Tan",
          dealer_id: "d1", dealer_name: "Showroom KL",
          placed_at: "2026-04-30T00:00:00Z", days: 8, aging: "0-30",
          total: 5970, paid: 0, outstanding: 5970,
          invoice_no: "INV-2026-1240", status: "delivered",
        },
      ],
      buckets: {
        "0-30":  { amount: 5970, count: 1 },
        "31-60": { amount: 0,    count: 0 },
        "61-90": { amount: 0,    count: 0 },
        "90+":   { amount: 0,    count: 0 },
      },
    };
    const sb = { rpc: vi.fn().mockResolvedValue({ data: payload, error: null }) };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(sb as any);

    const jwt = await makeJwt("finance");
    const res = await app.fetch(
      new Request("http://t/api/finance/reports/ar-aging", {
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    expect(res.status).toBe(200);
    expect(sb.rpc).toHaveBeenCalledWith("finance_ar_aging");
    expect(await res.json()).toEqual(payload);
  });

  it("rejects logistics with 403", async () => {
    const jwt = await makeJwt("logistics");
    const res = await app.fetch(
      new Request("http://t/api/finance/reports/ar-aging", {
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    expect(res.status).toBe(403);
  });
});

describe("GET /api/finance/reports/ap-aging", () => {
  it("calls finance_ap_aging RPC and returns rows + byPayStatus", async () => {
    const payload = {
      rows: [
        {
          po_id: "PO-2046", supplier_id: "s1", supplier_name: "Acme",
          placed_at: "2026-04-29T00:00:00Z", eta_date: "2026-05-15",
          status: "open", sup_status: "in_production", pay_status: "unpaid",
          pay_status_ui: "in_production", qty: 10, total: 12500,
          do_number: null, has_do: false, due_in: 7,
          lines: [{ sku: "SKU-A", sku_name: "Bed Frame · Queen", qty: 10, unit_cost: 1250, line_total: 12500 }],
          history: [],
        },
      ],
      byPayStatus: {
        matched:       { amount: 0,     count: 0 },
        scheduled:     { amount: 0,     count: 0 },
        paid:          { amount: 0,     count: 0 },
        in_transit:    { amount: 0,     count: 0 },
        in_production: { amount: 12500, count: 1 },
      },
    };
    const sb = { rpc: vi.fn().mockResolvedValue({ data: payload, error: null }) };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(sb as any);

    const jwt = await makeJwt("finance");
    const res = await app.fetch(
      new Request("http://t/api/finance/reports/ap-aging", {
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    expect(res.status).toBe(200);
    expect(sb.rpc).toHaveBeenCalledWith("finance_ap_aging");
    expect(await res.json()).toEqual(payload);
  });

  it("admits principal role", async () => {
    const sb = { rpc: vi.fn().mockResolvedValue({ data: {}, error: null }) };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(sb as any);

    const jwt = await makeJwt("principal");
    const res = await app.fetch(
      new Request("http://t/api/finance/reports/ap-aging", {
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    expect(res.status).toBe(200);
  });

  it("rejects dealer with 403", async () => {
    const jwt = await makeJwt("dealer");
    const res = await app.fetch(
      new Request("http://t/api/finance/reports/ap-aging", {
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    expect(res.status).toBe(403);
  });
});

describe("GET /api/finance/reports/cashflow", () => {
  it("calls finance_cashflow_series with default 12 weeks", async () => {
    const sb = {
      rpc: vi.fn().mockResolvedValue({
        data: { labels: [], inflow: [], outflow: [] },
        error: null,
      }),
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(sb as any);

    const jwt = await makeJwt("finance");
    const res = await app.fetch(
      new Request("http://t/api/finance/reports/cashflow", {
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    expect(res.status).toBe(200);
    expect(sb.rpc).toHaveBeenCalledWith("finance_cashflow_series", { p_weeks: 12 });
  });

  it("passes weeks param when provided", async () => {
    const sb = { rpc: vi.fn().mockResolvedValue({ data: {}, error: null }) };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(sb as any);

    const jwt = await makeJwt("finance");
    await app.fetch(
      new Request("http://t/api/finance/reports/cashflow?weeks=24", {
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    expect(sb.rpc).toHaveBeenCalledWith("finance_cashflow_series", { p_weeks: 24 });
  });

  it("rejects out-of-range weeks with 422", async () => {
    const jwt = await makeJwt("finance");
    const res = await app.fetch(
      new Request("http://t/api/finance/reports/cashflow?weeks=999", {
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    expect(res.status).toBe(422);
  });
});

describe("GET /api/finance/reports/monthly-pl", () => {
  it("calls finance_monthly_pl with default 6 months", async () => {
    const sb = {
      rpc: vi.fn().mockResolvedValue({ data: { rows: [] }, error: null }),
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(sb as any);

    const jwt = await makeJwt("finance");
    const res = await app.fetch(
      new Request("http://t/api/finance/reports/monthly-pl", {
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    expect(res.status).toBe(200);
    expect(sb.rpc).toHaveBeenCalledWith("finance_monthly_pl", { p_months: 6 });
  });

  it("admits principal", async () => {
    const sb = { rpc: vi.fn().mockResolvedValue({ data: {}, error: null }) };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(sb as any);

    const jwt = await makeJwt("principal");
    const res = await app.fetch(
      new Request("http://t/api/finance/reports/monthly-pl?months=12", {
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    expect(res.status).toBe(200);
    expect(sb.rpc).toHaveBeenCalledWith("finance_monthly_pl", { p_months: 12 });
  });

  it("rejects partner with 403", async () => {
    const jwt = await makeJwt("partner");
    const res = await app.fetch(
      new Request("http://t/api/finance/reports/monthly-pl", {
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    expect(res.status).toBe(403);
  });
});

describe("GET /api/finance/reports/top-skus", () => {
  it("calls finance_top_skus with default 8", async () => {
    const sb = {
      rpc: vi.fn().mockResolvedValue({ data: { rows: [] }, error: null }),
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(sb as any);

    const jwt = await makeJwt("finance");
    const res = await app.fetch(
      new Request("http://t/api/finance/reports/top-skus", {
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    expect(res.status).toBe(200);
    expect(sb.rpc).toHaveBeenCalledWith("finance_top_skus", { p_limit: 8 });
  });

  it("passes limit param when provided", async () => {
    const sb = { rpc: vi.fn().mockResolvedValue({ data: {}, error: null }) };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(sb as any);

    const jwt = await makeJwt("finance");
    await app.fetch(
      new Request("http://t/api/finance/reports/top-skus?limit=20", {
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    expect(sb.rpc).toHaveBeenCalledWith("finance_top_skus", { p_limit: 20 });
  });

  it("rejects dealer with 403", async () => {
    const jwt = await makeJwt("dealer");
    const res = await app.fetch(
      new Request("http://t/api/finance/reports/top-skus", {
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    expect(res.status).toBe(403);
  });
});

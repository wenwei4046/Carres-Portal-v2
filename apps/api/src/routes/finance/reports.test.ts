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

import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from "vitest";
import { SignJWT, createLocalJWKSet, exportJWK, generateKeyPair, type JWK, type KeyLike } from "jose";
import app from "../../index";
import { _setJwksForTesting } from "../../middleware/auth";

vi.mock("../../lib/supabase", () => ({
  userClient: vi.fn(),
  adminClient: vi.fn(),
}));

import { userClient } from "../../lib/supabase";

const SUPABASE_URL = "https://test.supabase.co";
const KID = "test-kid-1";

const env = {
  SUPABASE_URL,
  SUPABASE_ANON_KEY: "test-anon",
  SUPABASE_SERVICE_ROLE_KEY: "test-service",
  SUPABASE_JWT_SECRET: "unused",
};

let signKey: KeyLike;
let publicJwk: JWK;

async function makeJwt(role: string, dealerId: string | null = null) {
  return new SignJWT({
    email: `${role}@carres.com`,
    app_metadata: { role, ...(dealerId ? { dealer_id: dealerId } : {}) },
  })
    .setProtectedHeader({ alg: "ES256", kid: KID, typ: "JWT" })
    .setSubject("11111111-1111-1111-1111-000000000999")
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(signKey);
}

const SUMMARY_PAYLOAD = {
  kpis: {
    total_gmv: 1000000,
    active_orders: 5,
    active_dealers: 4,
    total_dealers: 5,
    pending_approvals: 3,
    low_stock_skus: 0,
  },
  leaderboard: [
    { id: "00000000-0000-0000-0000-000000000d01", name: "BedHouse KL", region: "KL", status: "active", order_count: 5, gmv: 50000 },
  ],
  pending_approvals: [
    { id: "a1", kind: "refund", title: "Refund · RM 100", actor: "F", refers_to: "SO-1", amount: 100, dealer_id: null, created_at: "2026-05-03T00:00:00Z" },
  ],
  audit_recent: [
    { id: "e1", role: "principal", actor_text: "Sara", action: "Approved", dealer_id: null, ref: null, occurred_at: "2026-05-03T00:00:00Z" },
  ],
  alerts: { suspended_dealers: 0, low_stock: [] },
};

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

describe("GET /api/principal/dashboard", () => {
  it("returns 200 + summary JSON for principal", async () => {
    vi.mocked(userClient).mockReturnValue({
      rpc: async () => ({ data: SUMMARY_PAYLOAD, error: null }),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    const jwt = await makeJwt("principal");
    const res = await app.fetch(
      new Request("http://t/api/principal/dashboard", {
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as typeof SUMMARY_PAYLOAD;
    expect(body.kpis.total_gmv).toBe(1000000);
    expect(body.leaderboard).toHaveLength(1);
    expect(body.pending_approvals[0]?.kind).toBe("refund");
    expect(body.audit_recent).toHaveLength(1);
    expect(body.alerts.suspended_dealers).toBe(0);
  });

  it("returns 403 for dealer role (no Supabase round-trip)", async () => {
    const rpc = vi.fn();
    vi.mocked(userClient).mockReturnValue({
      rpc,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    const jwt = await makeJwt("dealer", "00000000-0000-0000-0000-000000000d01");
    const res = await app.fetch(
      new Request("http://t/api/principal/dashboard", {
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    expect(res.status).toBe(403);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("returns 401 without Authorization header", async () => {
    const res = await app.fetch(new Request("http://t/api/principal/dashboard"), env);
    expect(res.status).toBe(401);
  });
});

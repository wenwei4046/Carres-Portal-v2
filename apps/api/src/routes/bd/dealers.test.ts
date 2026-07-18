import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from "vitest";
import { SignJWT, createLocalJWKSet, exportJWK, generateKeyPair, type JWK, type KeyLike } from "jose";
import app from "../../index";
import { _setJwksForTesting } from "../../middleware/auth";

vi.mock("../../lib/supabase", () => ({
  userClient: vi.fn(),
  adminClient: vi.fn(),
}));

import { userClient } from "../../lib/supabase";

const env = {
  SUPABASE_URL: "https://test.supabase.co",
  SUPABASE_ANON_KEY: "test-anon",
  SUPABASE_SERVICE_ROLE_KEY: "test-service",
  SUPABASE_JWT_SECRET: "unused",
  STAFF_SESSION_SECRET: "test-staff-secret",
};

const KID = "test-kid-bd";
let signKey: KeyLike;
let publicJwk: JWK;

async function makeJwt(role: string) {
  return new SignJWT({ email: "bd@test.com", app_metadata: { role } })
    .setProtectedHeader({ alg: "ES256", kid: KID, typ: "JWT" })
    .setSubject("11111111-1111-1111-1111-000000000bd1")
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(signKey);
}

const AUDIT_ROW = {
  id: "a1",
  role: "dealer",
  actor_text: "someone",
  action: "order.place",
  dealer_id: "3c592174-ca17-424e-af06-4c5331c3e34a",
  ref: "SO-1001",
  occurred_at: "2026-07-18T00:00:00Z",
};

/** audit_log list chain + dealers name lookup — the /activity data path. */
function mockUser() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const chain: any = {
    select: () => chain,
    not: () => chain,
    order: () => chain,
    limit: async () => ({ data: [AUDIT_ROW], error: null }),
    in: async () => ({ data: [{ id: AUDIT_ROW.dealer_id, name: "AutoCount Archive (旧账)" }], error: null }),
  };
  return {
    from: () => chain,
    rpc: async () => ({ data: null, error: null }),
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
});

afterAll(() => _setJwksForTesting(null));

describe("GET /api/bd/dealers/activity", () => {
  // Regression (2026-07-18): /activity was registered AFTER /:id, so Hono
  // matched the param route and "activity" hit a uuid cast → 500 from the day
  // the BD app shipped. The literal route must win.
  it("is NOT swallowed by /:id — returns 200 rows", async () => {
    vi.mocked(userClient).mockReturnValue(mockUser());
    const jwt = await makeJwt("bd");
    const res = await app.fetch(
      new Request("http://t/api/bd/dealers/activity", {
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { rows: Array<{ dealerName: string | null }> };
    expect(body.rows).toHaveLength(1);
    expect(body.rows[0].dealerName).toBe("AutoCount Archive (旧账)");
  });
});

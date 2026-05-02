import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from "vitest";
import { SignJWT, createLocalJWKSet, exportJWK, generateKeyPair, type JWK, type KeyLike } from "jose";
import app from "../index";
import { _setJwksForTesting } from "../middleware/auth";

// Mock the supabase client factory so tests don't hit real Supabase.
vi.mock("../lib/supabase", () => ({
  userClient: vi.fn(),
  adminClient: vi.fn(),
}));

import { userClient } from "../lib/supabase";

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

async function makeJwt(role: string, dealerId: string | null) {
  return new SignJWT({
    email: "test@carres.com",
    app_metadata: { role, ...(dealerId ? { dealer_id: dealerId } : {}) },
  })
    .setProtectedHeader({ alg: "ES256", kid: KID, typ: "JWT" })
    .setSubject("11111111-1111-1111-1111-000000000999")
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(signKey);
}

function mockSupabaseDealer(dealer: Record<string, unknown> | null) {
  vi.mocked(userClient).mockReturnValue({
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: dealer, error: null }),
        }),
      }),
    }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any);
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

describe("GET /api/dealers/me", () => {
  const seedRow = {
    id: "00000000-0000-0000-0000-000000000d01",
    name: "BedHouse KL",
    region: "KL",
    contact: null,
    joined_date: "2024-01-01",
    status: "active" as const,
    credit_limit: "50000",
    payment_terms: "Net30",
    deposit_balance: "12000",
    channel: "dealer",
  };

  it("returns dealer for dealer role", async () => {
    mockSupabaseDealer(seedRow);
    const jwt = await makeJwt("dealer", "00000000-0000-0000-0000-000000000d01");
    const res = await app.fetch(
      new Request("http://t/api/dealers/me", { headers: { Authorization: `Bearer ${jwt}` } }),
      env,
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({
      id: "00000000-0000-0000-0000-000000000d01",
      name: "BedHouse KL",
      creditLimit: 50000,
      depositBalance: 12000,
    });
  });

  it("returns dealer for salesperson role (uses their dealerId)", async () => {
    mockSupabaseDealer(seedRow);
    const jwt = await makeJwt("salesperson", "00000000-0000-0000-0000-000000000d01");
    const res = await app.fetch(
      new Request("http://t/api/dealers/me", { headers: { Authorization: `Bearer ${jwt}` } }),
      env,
    );
    expect(res.status).toBe(200);
  });

  it("returns 403 for principal role (no dealer scope)", async () => {
    const jwt = await makeJwt("principal", null);
    const res = await app.fetch(
      new Request("http://t/api/dealers/me", { headers: { Authorization: `Bearer ${jwt}` } }),
      env,
    );
    expect(res.status).toBe(403);
  });

  it("returns 404 if JWT dealer_id row is missing", async () => {
    mockSupabaseDealer(null);
    const jwt = await makeJwt("dealer", "00000000-0000-0000-0000-00000000ffff");
    const res = await app.fetch(
      new Request("http://t/api/dealers/me", { headers: { Authorization: `Bearer ${jwt}` } }),
      env,
    );
    expect(res.status).toBe(404);
  });
});

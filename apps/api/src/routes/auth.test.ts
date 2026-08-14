import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import { SignJWT, createLocalJWKSet, exportJWK, generateKeyPair, type JWK, type KeyLike } from "jose";
import app from "../index";
import { _setJwksForTesting } from "../middleware/auth";

const SUPABASE_URL = "https://test.supabase.co";
const KID = "test-kid-1";

const env = {
  SUPABASE_URL,
  SUPABASE_ANON_KEY: "test-anon",
  SUPABASE_SERVICE_ROLE_KEY: "test-service",
  SUPABASE_JWT_SECRET: "unused-but-typed",
};

let signKey: KeyLike;
let publicJwk: JWK;

async function makeJwt(payload: Record<string, unknown>) {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "ES256", kid: KID, typ: "JWT" })
    .setIssuedAt()
    .setExpirationTime("5m")
    .setSubject(String(payload.sub ?? "11111111-1111-1111-1111-000000000002"))
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

// jose's Node runtime uses node:https.request directly which msw can't catch,
// so we inject a local JWKS via the middleware's test escape hatch.
beforeEach(() => {
  _setJwksForTesting(createLocalJWKSet({ keys: [publicJwk] }));
});

afterAll(() => _setJwksForTesting(null));

describe("GET /health", () => {
  it("returns 200 {ok:true} without auth", async () => {
    const res = await app.fetch(new Request("http://t/health"), env);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, commit: "local" });
  });
});


describe("GET /api/auth/me", () => {
  it("401 with no Authorization header", async () => {
    const res = await app.fetch(new Request("http://t/api/auth/me"), env);
    expect(res.status).toBe(401);
  });

  it("401 with malformed bearer", async () => {
    const res = await app.fetch(
      new Request("http://t/api/auth/me", { headers: { Authorization: "Bearer not.a.jwt" } }),
      env,
    );
    expect(res.status).toBe(401);
  });

  it("200 with valid JWT — echoes role + entity ids from app_metadata", async () => {
    const jwt = await makeJwt({
      sub: "11111111-1111-1111-1111-000000000002",
      email: "dealer@carres.com",
      app_metadata: {
        role: "dealer",
        dealer_id: "00000000-0000-0000-0000-000000000d01",
      },
    });
    const res = await app.fetch(
      new Request("http://t/api/auth/me", { headers: { Authorization: `Bearer ${jwt}` } }),
      env,
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      id: "11111111-1111-1111-1111-000000000002",
      email: "dealer@carres.com",
      role: "dealer",
      dealerId: "00000000-0000-0000-0000-000000000d01",
      supplierId: null,
      partnerId: null,
      outletId: null,
    });
  });

  it("401 when JWT has invalid role in app_metadata", async () => {
    const jwt = await makeJwt({
      sub: "11111111-1111-1111-1111-000000000099",
      email: "ghost@carres.com",
      app_metadata: { role: "ceo" },
    });
    const res = await app.fetch(
      new Request("http://t/api/auth/me", { headers: { Authorization: `Bearer ${jwt}` } }),
      env,
    );
    expect(res.status).toBe(401);
  });
});

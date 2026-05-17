import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from "vitest";
import {
  SignJWT,
  createLocalJWKSet,
  exportJWK,
  generateKeyPair,
  type JWK,
  type KeyLike,
} from "jose";
import app from "../../index";
import { _setJwksForTesting } from "../../middleware/auth";

vi.mock("../../lib/supabase", () => ({
  userClient: vi.fn(),
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

async function makeJwt(role: string) {
  return new SignJWT({
    email: `${role}@carres.com`,
    app_metadata: { role },
  })
    .setProtectedHeader({ alg: "ES256", kid: KID, typ: "JWT" })
    .setSubject("11111111-1111-1111-1111-000000000999")
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

describe("GET /api/operation/suppliers", () => {
  it("returns 200 with supplier rows for operation", async () => {
    const suppliers = [
      {
        id: "00000000-0000-0000-0000-000000000c01",
        name: "Carres Manufacturing",
        kind: "own_logistics",
        cat_covered: ["mattress", "bedframe"],
        lead_time: "5–7 days",
        contact: "+60 3-1111 1111",
      },
      {
        id: "00000000-0000-0000-0000-000000000c02",
        name: "Sofa Factory Co",
        kind: "factory_pickup",
        cat_covered: ["sofa"],
        lead_time: "10–14 days",
        contact: "+60 3-2222 2222",
      },
    ];
    vi.mocked(userClient).mockReturnValue({
      from: () => ({
        select: () => ({
          order: async () => ({ data: suppliers, error: null }),
        }),
      }),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    const jwt = await makeJwt("operation");
    const res = await app.fetch(
      new Request("http://t/api/operation/suppliers", {
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { suppliers: typeof suppliers };
    expect(body.suppliers).toHaveLength(2);
    expect(body.suppliers[0].name).toBe("Carres Manufacturing");
    expect(body.suppliers[0].kind).toBe("own_logistics");
    expect(body.suppliers[1].kind).toBe("factory_pickup");
    expect(body.suppliers[1].cat_covered).toEqual(["sofa"]);
  });

  it("returns 403 for non-operation role", async () => {
    const jwt = await makeJwt("dealer");
    const res = await app.fetch(
      new Request("http://t/api/operation/suppliers", {
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    expect(res.status).toBe(403);
  });

  it("returns 401 when JWT is missing", async () => {
    const res = await app.fetch(
      new Request("http://t/api/operation/suppliers"),
      env,
    );
    expect(res.status).toBe(401);
  });
});

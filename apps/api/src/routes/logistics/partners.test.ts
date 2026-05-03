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

describe("GET /api/logistics/partners", () => {
  it("returns 200 with partner rows for logistics", async () => {
    const partners = [
      {
        id: "00000000-0000-0000-0000-000000000b01",
        name: "GD Express",
        contact: "+60 3-1111 1111",
        zones: "Klang Valley",
      },
      {
        id: "00000000-0000-0000-0000-000000000b02",
        name: "Pos Logistic",
        contact: "+60 3-2222 2222",
        zones: "Penang",
      },
    ];
    vi.mocked(userClient).mockReturnValue({
      from: () => ({
        select: () => ({
          order: async () => ({ data: partners, error: null }),
        }),
      }),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    const jwt = await makeJwt("logistics");
    const res = await app.fetch(
      new Request("http://t/api/logistics/partners", {
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { partners: typeof partners };
    expect(body.partners).toHaveLength(2);
    expect(body.partners[0].name).toBe("GD Express");
  });

  it("returns 403 for non-logistics role", async () => {
    const jwt = await makeJwt("dealer");
    const res = await app.fetch(
      new Request("http://t/api/logistics/partners", {
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    expect(res.status).toBe(403);
  });

  it("returns 401 when JWT is missing", async () => {
    const res = await app.fetch(
      new Request("http://t/api/logistics/partners"),
      env,
    );
    expect(res.status).toBe(401);
  });
});

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

const SUPPLIER_ID = "55555555-5555-5555-5555-000000000001";

async function makeJwt(role: string, opts?: { supplierId?: string }) {
  const meta: Record<string, unknown> = { role };
  if (opts?.supplierId !== undefined) meta.supplier_id = opts.supplierId;
  return new SignJWT({ email: `${role}@x`, app_metadata: meta })
    .setProtectedHeader({ alg: "ES256", kid: KID, typ: "JWT" })
    .setSubject("11111111-1111-1111-1111-000000000006")
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

describe("GET /api/supplier/me", () => {
  it("returns supplier row keyed by JWT supplier_id", async () => {
    const sb = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({
              data: {
                id: SUPPLIER_ID,
                name: "Cloud Mattress Sdn Bhd",
                kind: "own_logistics",
                cat_covered: ["mattress"],
                lead_time: "10–14 days",
                contact: "+60 12 345 6789",
                contact_email: "ops@cloudmattress.my",
                slug: "cloud-mattress",
                portal_enabled: true,
              },
              error: null,
            }),
          }),
        }),
      }),
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(sb as any);

    const jwt = await makeJwt("supplier", { supplierId: SUPPLIER_ID });
    const res = await app.fetch(
      new Request("http://t/api/supplier/me", {
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    expect(res.status).toBe(200);
    expect(sb.from).toHaveBeenCalledWith("suppliers");
    const row = (await res.json()) as { id: string; kind: string };
    expect(row).toMatchObject({ id: SUPPLIER_ID, kind: "own_logistics" });
  });

  it("returns 422 when JWT has no supplier_id", async () => {
    const jwt = await makeJwt("supplier"); // no supplier_id
    const res = await app.fetch(
      new Request("http://t/api/supplier/me", {
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    expect(res.status).toBe(422);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe("missing_supplier_id");
  });

  it("returns 404 when supplier row hidden by RLS or deleted", async () => {
    const sb = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
          }),
        }),
      }),
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(sb as any);

    const jwt = await makeJwt("supplier", { supplierId: SUPPLIER_ID });
    const res = await app.fetch(
      new Request("http://t/api/supplier/me", {
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    expect(res.status).toBe(404);
  });

  it("rejects non-supplier roles with 403", async () => {
    const jwt = await makeJwt("logistics", { supplierId: SUPPLIER_ID });
    const res = await app.fetch(
      new Request("http://t/api/supplier/me", {
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    expect(res.status).toBe(403);
  });
});

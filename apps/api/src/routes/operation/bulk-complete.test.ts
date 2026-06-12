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

/**
 * POST /api/operation/orders/bulk-complete (migration 0166) — mirrors the
 * sibling order-control.test.ts harness: real JWT verify via a local JWKS,
 * userClient mocked to a chainless `.rpc` stub.
 */

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
    .setSubject("u1")
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(signKey);
}

/** The route's only DB touch is one `.rpc()` call. */
function makeSb(result: { data: unknown; error: unknown }) {
  return { rpc: vi.fn().mockResolvedValue(result) };
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

const ID_A = "00000000-0000-0000-0000-00000000020a";
const ID_B = "00000000-0000-0000-0000-00000000020b";

function post(jwt: string | null, body: BodyInit) {
  return app.fetch(
    new Request("http://t/api/operation/orders/bulk-complete", {
      method: "POST",
      headers: {
        ...(jwt ? { Authorization: `Bearer ${jwt}` } : {}),
        "Content-Type": "application/json",
      },
      body,
    }),
    env,
  );
}

describe("POST /api/operation/orders/bulk-complete", () => {
  it("401 without Authorization", async () => {
    const res = await post(null, JSON.stringify({ orderIds: [ID_A] }));
    expect(res.status).toBe(401);
  });

  it("403 for dealer role", async () => {
    const jwt = await makeJwt("dealer");
    const res = await post(jwt, JSON.stringify({ orderIds: [ID_A] }));
    expect(res.status).toBe(403);
  });

  it("400 when body is not valid JSON", async () => {
    const jwt = await makeJwt("operation");
    const res = await post(jwt, "{not json");
    expect(res.status).toBe(400);
  });

  it("422 when orderIds is empty", async () => {
    const jwt = await makeJwt("operation");
    const res = await post(jwt, JSON.stringify({ orderIds: [] }));
    expect(res.status).toBe(422);
  });

  it("422 when an id isn't a uuid", async () => {
    const jwt = await makeJwt("operation");
    const res = await post(jwt, JSON.stringify({ orderIds: ["SO-1001"] }));
    expect(res.status).toBe(422);
  });

  it("422 when orderIds exceeds the 500 cap", async () => {
    const jwt = await makeJwt("operation");
    const res = await post(
      jwt,
      JSON.stringify({ orderIds: Array.from({ length: 501 }, () => ID_A) }),
    );
    expect(res.status).toBe(422);
  });

  it("200 — calls ops_bulk_complete_orders with p_order_ids and returns the counts", async () => {
    const sb = makeSb({ data: { completed: 2, skipped: 1 }, error: null });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(sb as any);
    const jwt = await makeJwt("operation");
    const res = await post(jwt, JSON.stringify({ orderIds: [ID_A, ID_B] }));
    expect(res.status).toBe(200);
    expect(sb.rpc).toHaveBeenCalledWith("ops_bulk_complete_orders", {
      p_order_ids: [ID_A, ID_B],
    });
    const body = (await res.json()) as { completed: number; skipped: number };
    expect(body).toEqual({ completed: 2, skipped: 1 });
  });

  it("200 for principal role too", async () => {
    const sb = makeSb({ data: { completed: 1, skipped: 0 }, error: null });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(sb as any);
    const jwt = await makeJwt("principal");
    const res = await post(jwt, JSON.stringify({ orderIds: [ID_A] }));
    expect(res.status).toBe(200);
  });

  it("falls back to zero counts when the RPC returns null", async () => {
    const sb = makeSb({ data: null, error: null });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(sb as any);
    const jwt = await makeJwt("operation");
    const res = await post(jwt, JSON.stringify({ orderIds: [ID_A] }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ completed: 0, skipped: 0 });
  });

  it("maps a PG RLS denial (42501) → 403", async () => {
    const sb = makeSb({
      data: null,
      error: { code: "42501", message: "permission denied" },
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(sb as any);
    const jwt = await makeJwt("operation");
    const res = await post(jwt, JSON.stringify({ orderIds: [ID_A] }));
    expect(res.status).toBe(403);
  });
});

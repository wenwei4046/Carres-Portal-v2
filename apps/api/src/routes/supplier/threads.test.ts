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

const THREAD_ID = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";

async function makeJwt(role: string) {
  return new SignJWT({ email: `${role}@x`, app_metadata: { role } })
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

describe("POST /api/supplier/threads/:threadId/ready", () => {
  it("rejects non-supplier roles with 403", async () => {
    const jwt = await makeJwt("dealer");
    const res = await app.fetch(
      new Request(`http://t/api/supplier/threads/${THREAD_ID}/ready`, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    expect(res.status).toBe(403);
  });

  it("returns 422 when threadId is not a uuid", async () => {
    const jwt = await makeJwt("supplier");
    const res = await app.fetch(
      new Request(`http://t/api/supplier/threads/not-a-uuid/ready`, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    expect(res.status).toBe(422);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe("invalid_param");
  });

  it("calls supplier_mark_thread_ready RPC with p_thread_id and returns the row", async () => {
    const sb = {
      rpc: vi.fn().mockResolvedValue({
        data: {
          id: THREAD_ID,
          ready_for_pickup_at: "2026-05-15T01:00:00Z",
          supplier_status: "ready_for_pickup",
        },
        error: null,
      }),
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(sb as any);

    const jwt = await makeJwt("supplier");
    const res = await app.fetch(
      new Request(`http://t/api/supplier/threads/${THREAD_ID}/ready`, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    expect(res.status).toBe(200);
    expect(sb.rpc).toHaveBeenCalledWith("supplier_mark_thread_ready", {
      p_thread_id: THREAD_ID,
    });
    const json = (await res.json()) as { id: string };
    expect(json).toMatchObject({ id: THREAD_ID });
  });

  it("maps PG 42501 (cross-tenant) to 403", async () => {
    const sb = {
      rpc: vi.fn().mockResolvedValue({
        data: null,
        error: { code: "42501", message: "forbidden" },
      }),
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(sb as any);

    const jwt = await makeJwt("supplier");
    const res = await app.fetch(
      new Request(`http://t/api/supplier/threads/${THREAD_ID}/ready`, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    expect(res.status).toBe(403);
  });

  it("maps PG 22023 (wrong state) to 422", async () => {
    const sb = {
      rpc: vi.fn().mockResolvedValue({
        data: null,
        error: { code: "22023", message: "thread not in eligible state" },
      }),
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(sb as any);

    const jwt = await makeJwt("supplier");
    const res = await app.fetch(
      new Request(`http://t/api/supplier/threads/${THREAD_ID}/ready`, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    expect(res.status).toBe(422);
  });
});

describe("DELETE /api/supplier/threads/:threadId/ready", () => {
  it("rejects non-supplier roles with 403", async () => {
    const jwt = await makeJwt("logistics");
    const res = await app.fetch(
      new Request(`http://t/api/supplier/threads/${THREAD_ID}/ready`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    expect(res.status).toBe(403);
  });

  it("returns 422 when threadId is not a uuid", async () => {
    const jwt = await makeJwt("supplier");
    const res = await app.fetch(
      new Request(`http://t/api/supplier/threads/not-a-uuid/ready`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    expect(res.status).toBe(422);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe("invalid_param");
  });

  it("calls supplier_unmark_thread_ready RPC with p_thread_id and returns the row", async () => {
    const sb = {
      rpc: vi.fn().mockResolvedValue({
        data: {
          id: THREAD_ID,
          ready_for_pickup_at: null,
          supplier_status: "in_production",
        },
        error: null,
      }),
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(sb as any);

    const jwt = await makeJwt("supplier");
    const res = await app.fetch(
      new Request(`http://t/api/supplier/threads/${THREAD_ID}/ready`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    expect(res.status).toBe(200);
    expect(sb.rpc).toHaveBeenCalledWith("supplier_unmark_thread_ready", {
      p_thread_id: THREAD_ID,
    });
    const json = (await res.json()) as { id: string };
    expect(json).toMatchObject({ id: THREAD_ID });
  });

  it("maps PG 42501 (cross-tenant) to 403", async () => {
    const sb = {
      rpc: vi.fn().mockResolvedValue({
        data: null,
        error: { code: "42501", message: "forbidden" },
      }),
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(sb as any);

    const jwt = await makeJwt("supplier");
    const res = await app.fetch(
      new Request(`http://t/api/supplier/threads/${THREAD_ID}/ready`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    expect(res.status).toBe(403);
  });
});

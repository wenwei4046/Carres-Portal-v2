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

const PARTNER_ID = "11111111-cccc-cccc-cccc-000000000003";
const THREAD_ID = "99999999-8888-8888-8888-000000008888";

async function makeJwt(role: string, opts?: { partnerId?: string }) {
  const meta: Record<string, unknown> = { role };
  if (opts?.partnerId !== undefined) meta.partner_id = opts.partnerId;
  return new SignJWT({ email: `${role}@x`, app_metadata: meta })
    .setProtectedHeader({ alg: "ES256", kid: KID, typ: "JWT" })
    .setSubject("11111111-1111-1111-1111-000000000007")
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

describe("POST /api/partner/pod/sign-upload", () => {
  it("returns signed upload URL for valid request", async () => {
    const sb = {
      storage: {
        from: vi.fn().mockReturnValue({
          createSignedUploadUrl: vi.fn().mockResolvedValue({
            data: { token: "fake-token", path: `${THREAD_ID}/abc-pod.jpg` },
            error: null,
          }),
        }),
      },
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(sb as any);

    const jwt = await makeJwt("partner", { partnerId: PARTNER_ID });
    const res = await app.fetch(
      new Request("http://t/api/partner/pod/sign-upload", {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          threadId: THREAD_ID,
          mimeType: "image/jpeg",
          sizeBytes: 1024,
        }),
      }),
      env,
    );
    expect(res.status).toBe(200);
    expect(sb.storage.from).toHaveBeenCalledWith("proof-of-delivery");
    const body = (await res.json()) as { token: string; path: string };
    expect(body.token).toBe("fake-token");
  });

  it("rejects non-partner roles with 403", async () => {
    const jwt = await makeJwt("logistics", { partnerId: PARTNER_ID });
    const res = await app.fetch(
      new Request("http://t/api/partner/pod/sign-upload", {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          threadId: THREAD_ID,
          mimeType: "image/jpeg",
          sizeBytes: 1024,
        }),
      }),
      env,
    );
    expect(res.status).toBe(403);
  });

  it("rejects oversize file with 422", async () => {
    const jwt = await makeJwt("partner", { partnerId: PARTNER_ID });
    const res = await app.fetch(
      new Request("http://t/api/partner/pod/sign-upload", {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          threadId: THREAD_ID,
          mimeType: "image/jpeg",
          sizeBytes: 100 * 1024 * 1024, // 100 MiB > 10 MiB limit
        }),
      }),
      env,
    );
    expect(res.status).toBe(422);
  });

  it("rejects bad mime with 422", async () => {
    const jwt = await makeJwt("partner", { partnerId: PARTNER_ID });
    const res = await app.fetch(
      new Request("http://t/api/partner/pod/sign-upload", {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          threadId: THREAD_ID,
          mimeType: "application/x-evil",
          sizeBytes: 1024,
        }),
      }),
      env,
    );
    expect(res.status).toBe(422);
  });
});

describe("POST /api/partner/pod/:threadId/attach", () => {
  it("calls partner_attach_pod RPC and returns 200", async () => {
    const sb = {
      rpc: vi.fn().mockResolvedValue({
        data: { thread_id: THREAD_ID, logistics_stage: "delivered", pod_url: "path/to/pod.jpg" },
        error: null,
      }),
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(sb as any);

    const jwt = await makeJwt("partner", { partnerId: PARTNER_ID });
    const res = await app.fetch(
      new Request(`http://t/api/partner/pod/${THREAD_ID}/attach`, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ podPath: `${THREAD_ID}/abc-pod.jpg` }),
      }),
      env,
    );
    expect(res.status).toBe(200);
    expect(sb.rpc).toHaveBeenCalledWith("partner_attach_pod", {
      p_thread_id: THREAD_ID,
      p_pod_path:  `${THREAD_ID}/abc-pod.jpg`,
    });
  });

  it("rejects non-uuid threadId with 422", async () => {
    const jwt = await makeJwt("partner", { partnerId: PARTNER_ID });
    const res = await app.fetch(
      new Request(`http://t/api/partner/pod/not-a-uuid/attach`, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ podPath: "x/abc.jpg" }),
      }),
      env,
    );
    expect(res.status).toBe(422);
  });

  it("forwards 422 wrong_stage from RPC", async () => {
    const sb = {
      rpc: vi.fn().mockResolvedValue({
        data: null,
        error: { code: "22023", message: "thread is not in dispatched state", details: "wrong_stage" },
      }),
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(sb as any);

    const jwt = await makeJwt("partner", { partnerId: PARTNER_ID });
    const res = await app.fetch(
      new Request(`http://t/api/partner/pod/${THREAD_ID}/attach`, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ podPath: `${THREAD_ID}/abc-pod.jpg` }),
      }),
      env,
    );
    expect(res.status).toBe(422);
  });

  it("rejects logistics with 403", async () => {
    const jwt = await makeJwt("logistics");
    const res = await app.fetch(
      new Request(`http://t/api/partner/pod/${THREAD_ID}/attach`, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ podPath: "x/abc.jpg" }),
      }),
      env,
    );
    expect(res.status).toBe(403);
  });
});

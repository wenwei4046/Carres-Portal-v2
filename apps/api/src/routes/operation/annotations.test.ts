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

const SUPABASE_URL = "https://test.supabase.co";
const env = {
  SUPABASE_URL,
  SUPABASE_ANON_KEY: "test-anon",
  SUPABASE_SERVICE_ROLE_KEY: "test-service",
  SUPABASE_JWT_SECRET: "unused",
};
const KID = "test-kid-annotations";
const ORDER_ID = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";

let signKey: KeyLike;
let publicJwk: JWK;

async function makeJwt(role: string) {
  return new SignJWT({ email: `${role}@carres.com`, app_metadata: { role } })
    .setProtectedHeader({ alg: "ES256", kid: KID, typ: "JWT" })
    .setSubject("11111111-1111-1111-1111-000000000001")
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

function mockRpc(returnData: unknown, error: unknown = null) {
  const rpcFn = vi.fn(() => Promise.resolve({ data: returnData, error }));
  vi.mocked(userClient).mockReturnValue({ rpc: rpcFn } as unknown as ReturnType<typeof userClient>);
  return rpcFn;
}

// ─────────────────────────────────────────────────────────────────────────────
describe("POST /api/operation/orders/:id/annotations", () => {
  it("operation role — plain note returns 201", async () => {
    const rpc = mockRpc({ id: "row-1", order_id: ORDER_ID, content: "测试备注", tag: null });
    const jwt = await makeJwt("operation");
    const res = await app.fetch(
      new Request(`http://x/api/operation/orders/${ORDER_ID}/annotations`, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ content: "测试备注" }),
      }),
      env,
    );
    expect(res.status).toBe(201);
    expect(rpc).toHaveBeenCalledWith("operation_add_annotation", {
      p_order_id: ORDER_ID,
      p_content: "测试备注",
      p_tag: null,
    });
  });

  it("operation role — note with tag 'escalate' passes tag to RPC", async () => {
    const rpc = mockRpc({ id: "row-2", tag: "escalate" });
    const jwt = await makeJwt("operation");
    const res = await app.fetch(
      new Request(`http://x/api/operation/orders/${ORDER_ID}/annotations`, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ content: "需要升级处理", tag: "escalate" }),
      }),
      env,
    );
    expect(res.status).toBe(201);
    expect(rpc).toHaveBeenCalledWith("operation_add_annotation", {
      p_order_id: ORDER_ID,
      p_content: "需要升级处理",
      p_tag: "escalate",
    });
  });

  it("rejects empty content with 422", async () => {
    const jwt = await makeJwt("operation");
    const res = await app.fetch(
      new Request(`http://x/api/operation/orders/${ORDER_ID}/annotations`, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ content: "" }),
      }),
      env,
    );
    expect(res.status).toBe(422);
  });

  it("rejects invalid tag with 422", async () => {
    const jwt = await makeJwt("operation");
    const res = await app.fetch(
      new Request(`http://x/api/operation/orders/${ORDER_ID}/annotations`, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ content: "note", tag: "invalid_tag" }),
      }),
      env,
    );
    expect(res.status).toBe(422);
  });

  it("dealer role is rejected with 403", async () => {
    const jwt = await makeJwt("dealer");
    const res = await app.fetch(
      new Request(`http://x/api/operation/orders/${ORDER_ID}/annotations`, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ content: "note" }),
      }),
      env,
    );
    expect(res.status).toBe(403);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("GET /api/operation/orders/:id/timeline", () => {
  it("returns merged timeline array", async () => {
    const timeline = [
      { id: "t1", kind: "annotation", content: "备注1", tag: null, actor_name: "Jess", occurred_at: "2026-05-20T10:00:00Z" },
      { id: "t2", kind: "activity", action: "inbox_assign", detail: { logistic: "NETS" }, actor_name: "Shasha", occurred_at: "2026-05-20T09:00:00Z" },
    ];
    const rpc = mockRpc(timeline);
    const jwt = await makeJwt("operation");
    const res = await app.fetch(
      new Request(`http://x/api/operation/orders/${ORDER_ID}/timeline`, {
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
    expect(body).toHaveLength(2);
    expect(rpc).toHaveBeenCalledWith("operation_get_timeline", { p_order_id: ORDER_ID });
  });

  it("returns empty array when no entries", async () => {
    mockRpc(null);
    const jwt = await makeJwt("operation");
    const res = await app.fetch(
      new Request(`http://x/api/operation/orders/${ORDER_ID}/timeline`, {
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
  });

  it("dealer role is rejected with 403", async () => {
    const jwt = await makeJwt("dealer");
    const res = await app.fetch(
      new Request(`http://x/api/operation/orders/${ORDER_ID}/timeline`, {
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    expect(res.status).toBe(403);
  });
});

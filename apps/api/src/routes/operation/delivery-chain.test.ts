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

async function makeJwt(role: string) {
  return new SignJWT({ email: `${role}@x`, app_metadata: { role } })
    .setProtectedHeader({ alg: "ES256", kid: KID, typ: "JWT" })
    .setSubject("u1")
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

const ORDER_ID = "00000000-0000-0000-0000-00000000010a";
const NETS_ID  = "00000000-0000-0000-0000-000000000001";
const TEOW_ID  = "00000000-0000-0000-0000-000000000002";
const EU_ID    = "00000000-0000-0000-0000-000000000003";

// Pre-built valid stops so each test focuses on its own variation rather than
// the boilerplate of 13 jsonb keys.
function stop(over: Record<string, unknown> = {}) {
  return {
    leg: 1,
    partner_id: NETS_ID,
    partner_name: "NETS",
    from_loc: "Klang WH",
    to_loc: "Customer @ KL",
    status: "pending",
    ...over,
  };
}

// =====================================================================
// PUT /api/operation/orders/:id/delivery-chain
// =====================================================================
describe("PUT /api/operation/orders/:id/delivery-chain", () => {
  it("401 without Authorization", async () => {
    const res = await app.fetch(
      new Request(`http://t/api/operation/orders/${ORDER_ID}/delivery-chain`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stops: [stop()] }),
      }),
      env,
    );
    expect(res.status).toBe(401);
  });

  it("403 for dealer role", async () => {
    const jwt = await makeJwt("dealer");
    const res = await app.fetch(
      new Request(`http://t/api/operation/orders/${ORDER_ID}/delivery-chain`, {
        method: "PUT",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ stops: [stop()] }),
      }),
      env,
    );
    expect(res.status).toBe(403);
  });

  it("404 when order id isn't a uuid", async () => {
    const jwt = await makeJwt("operation");
    const res = await app.fetch(
      new Request(`http://t/api/operation/orders/not-a-uuid/delivery-chain`, {
        method: "PUT",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ stops: [stop()] }),
      }),
      env,
    );
    expect(res.status).toBe(404);
  });

  it("400 when body is not valid JSON", async () => {
    const jwt = await makeJwt("operation");
    const res = await app.fetch(
      new Request(`http://t/api/operation/orders/${ORDER_ID}/delivery-chain`, {
        method: "PUT",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: "{not json",
      }),
      env,
    );
    expect(res.status).toBe(400);
  });

  it("422 with path-in-message when a stop is missing required keys", async () => {
    const jwt = await makeJwt("operation");
    const res = await app.fetch(
      new Request(`http://t/api/operation/orders/${ORDER_ID}/delivery-chain`, {
        method: "PUT",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        // missing partner_id on leg 1
        body: JSON.stringify({
          stops: [{ leg: 1, partner_name: "NETS", from_loc: "A", to_loc: "B", status: "pending" }],
        }),
      }),
      env,
    );
    expect(res.status).toBe(422);
    const body = (await res.json()) as { message: string };
    expect(body.message).toContain("stops.0.partner_id");
  });

  it("200 — operation can replace a 2-leg chain (one RPC call)", async () => {
    const sb = { rpc: vi.fn().mockResolvedValue({ data: null, error: null }) };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(sb as any);
    const jwt = await makeJwt("operation");
    const stops = [
      stop({ leg: 1, partner_id: NETS_ID, partner_name: "NETS", to_loc: "JB transit" }),
      stop({ leg: 2, partner_id: TEOW_ID, partner_name: "TEOW", from_loc: "JB transit", to_loc: "Customer @ JB" }),
    ];
    const res = await app.fetch(
      new Request(`http://t/api/operation/orders/${ORDER_ID}/delivery-chain`, {
        method: "PUT",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ stops }),
      }),
      env,
    );
    expect(res.status).toBe(200);
    expect(sb.rpc).toHaveBeenCalledOnce();
    expect(sb.rpc).toHaveBeenCalledWith("set_delivery_chain", {
      p_order_id: ORDER_ID,
      p_stops: stops,
    });
    const body = (await res.json()) as { stops: typeof stops };
    expect(body.stops).toHaveLength(2);
  });

  it("empty stops array is accepted (clears the chain back to single-leg)", async () => {
    const sb = { rpc: vi.fn().mockResolvedValue({ data: null, error: null }) };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(sb as any);
    const jwt = await makeJwt("principal");
    const res = await app.fetch(
      new Request(`http://t/api/operation/orders/${ORDER_ID}/delivery-chain`, {
        method: "PUT",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ stops: [] }),
      }),
      env,
    );
    expect(res.status).toBe(200);
    expect(sb.rpc).toHaveBeenCalledWith("set_delivery_chain", {
      p_order_id: ORDER_ID,
      p_stops: [],
    });
  });

  it("maps PG 42501 (forbidden inside RPC) → 403", async () => {
    const sb = {
      rpc: vi.fn().mockResolvedValue({
        data: null,
        error: { code: "42501", message: "forbidden: only operation/principal" },
      }),
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(sb as any);
    const jwt = await makeJwt("operation");
    const res = await app.fetch(
      new Request(`http://t/api/operation/orders/${ORDER_ID}/delivery-chain`, {
        method: "PUT",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ stops: [stop()] }),
      }),
      env,
    );
    expect(res.status).toBe(403);
  });

  it("maps PG 22023 (RPC validation — bad leg numbering / unknown partner) → 422", async () => {
    const sb = {
      rpc: vi.fn().mockResolvedValue({
        data: null,
        error: { code: "22023", message: "leg numbering must be contiguous 1..N" },
      }),
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(sb as any);
    const jwt = await makeJwt("operation");
    const res = await app.fetch(
      new Request(`http://t/api/operation/orders/${ORDER_ID}/delivery-chain`, {
        method: "PUT",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          stops: [
            stop({ leg: 1, partner_id: NETS_ID, partner_name: "NETS" }),
            stop({ leg: 3, partner_id: TEOW_ID, partner_name: "TEOW" }),
          ],
        }),
      }),
      env,
    );
    expect(res.status).toBe(422);
  });
});

// =====================================================================
// PATCH /api/operation/orders/:id/delivery-stops/:leg
// =====================================================================
describe("PATCH /api/operation/orders/:id/delivery-stops/:leg", () => {
  it("403 for dealer role", async () => {
    const jwt = await makeJwt("dealer");
    const res = await app.fetch(
      new Request(`http://t/api/operation/orders/${ORDER_ID}/delivery-stops/1`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ status: "picked_up" }),
      }),
      env,
    );
    expect(res.status).toBe(403);
  });

  it("422 when :leg is not a positive integer", async () => {
    const jwt = await makeJwt("operation");
    const res = await app.fetch(
      new Request(`http://t/api/operation/orders/${ORDER_ID}/delivery-stops/0`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ status: "picked_up" }),
      }),
      env,
    );
    expect(res.status).toBe(422);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe("invalid_param");
  });

  it("422 when patch contains an unknown key (strict)", async () => {
    const jwt = await makeJwt("operation");
    const res = await app.fetch(
      new Request(`http://t/api/operation/orders/${ORDER_ID}/delivery-stops/1`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ random_typo: "yes" }),
      }),
      env,
    );
    expect(res.status).toBe(422);
  });

  it("422 when patch object is empty", async () => {
    const jwt = await makeJwt("operation");
    const res = await app.fetch(
      new Request(`http://t/api/operation/orders/${ORDER_ID}/delivery-stops/1`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({}),
      }),
      env,
    );
    expect(res.status).toBe(422);
    const body = (await res.json()) as { message: string };
    expect(body.message).toContain("at least one field");
  });

  it("200 — mark leg picked_up + add POD url + notes", async () => {
    const merged = {
      leg: 1,
      partner_id: NETS_ID,
      partner_name: "NETS",
      from_loc: "Klang WH",
      to_loc: "JB transit",
      status: "picked_up",
      picked_up_at: "2026-06-05T10:00:00.000Z",
      pod_url: "delivery-orders/orders/abc/legs/1/pod.jpg",
      notes: "Loaded clean",
    };
    const sb = { rpc: vi.fn().mockResolvedValue({ data: merged, error: null }) };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(sb as any);
    const jwt = await makeJwt("operation");
    const res = await app.fetch(
      new Request(`http://t/api/operation/orders/${ORDER_ID}/delivery-stops/1`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          status: "picked_up",
          pod_url: "delivery-orders/orders/abc/legs/1/pod.jpg",
          notes: "Loaded clean",
        }),
      }),
      env,
    );
    expect(res.status).toBe(200);
    expect(sb.rpc).toHaveBeenCalledWith("patch_delivery_stop", {
      p_order_id: ORDER_ID,
      p_leg: 1,
      p_patch: {
        status: "picked_up",
        pod_url: "delivery-orders/orders/abc/legs/1/pod.jpg",
        notes: "Loaded clean",
      },
    });
    const body = (await res.json()) as { stop: typeof merged };
    expect(body.stop.status).toBe("picked_up");
    expect(body.stop.picked_up_at).toBeTruthy();
  });

  it("200 — patch can change the partner mid-flight (re-route)", async () => {
    const sb = { rpc: vi.fn().mockResolvedValue({ data: {}, error: null }) };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(sb as any);
    const jwt = await makeJwt("operation");
    const res = await app.fetch(
      new Request(`http://t/api/operation/orders/${ORDER_ID}/delivery-stops/2`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ partner_id: EU_ID, partner_name: "EU" }),
      }),
      env,
    );
    expect(res.status).toBe(200);
    expect(sb.rpc).toHaveBeenCalledWith("patch_delivery_stop", {
      p_order_id: ORDER_ID,
      p_leg: 2,
      p_patch: { partner_id: EU_ID, partner_name: "EU" },
    });
  });

  it("maps PG 22023 (RPC: leg doesn't exist) → 422", async () => {
    const sb = {
      rpc: vi.fn().mockResolvedValue({
        data: null,
        error: { code: "22023", message: "leg 5 does not exist on order" },
      }),
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(sb as any);
    const jwt = await makeJwt("operation");
    const res = await app.fetch(
      new Request(`http://t/api/operation/orders/${ORDER_ID}/delivery-stops/5`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ status: "delivered" }),
      }),
      env,
    );
    expect(res.status).toBe(422);
  });
});

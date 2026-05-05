import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from "vitest";
import { SignJWT, createLocalJWKSet, exportJWK, generateKeyPair, type JWK, type KeyLike } from "jose";
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

async function makeJwt(role: string, partnerId?: string) {
  return new SignJWT({ email: `${role}@x`, app_metadata: { role, partner_id: partnerId } })
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

describe("GET /api/partner/pickups", () => {
  it("returns LP's POs", async () => {
    const sb = {
      from: vi.fn(() => ({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            order: vi.fn().mockResolvedValue({
              data: [
                { id: "po1", dl: 1, sup_status: "pickup_assigned" },
                { id: "po2", dl: 2, sup_status: "delivered" },
              ],
              error: null,
            }),
          }),
        }),
      })),
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(sb as any);

    const jwt = await makeJwt("partner", "11111111-1111-1111-1111-aaaaaaaaaaaa");
    const res = await app.fetch(
      new Request("http://t/api/partner/pickups", { headers: { Authorization: `Bearer ${jwt}` } }),
      env,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as unknown[];
    expect(body).toHaveLength(2);
  });

  it("rejects non-partner with 403", async () => {
    const jwt = await makeJwt("dealer");
    const res = await app.fetch(
      new Request("http://t/api/partner/pickups", { headers: { Authorization: `Bearer ${jwt}` } }),
      env,
    );
    expect(res.status).toBe(403);
  });
});

const THREAD_ID = "00000000-0000-0000-0000-00000000beef";

describe("POST /api/partner/pickups/accept-rfd", () => {
  it("calls logistics_partner_accept_rfd RPC with p_thread_id", async () => {
    const sb = {
      rpc: vi.fn().mockResolvedValue({
        data: { thread_id: THREAD_ID, partner_accepted_at: "2026-05-15T00:00:00Z", logistics_stage: "dispatched" },
        error: null,
      }),
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(sb as any);

    const jwt = await makeJwt("partner", "p1");
    const res = await app.fetch(
      new Request("http://t/api/partner/pickups/accept-rfd", {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ threadId: THREAD_ID }),
      }),
      env,
    );
    expect(res.status).toBe(200);
    expect(sb.rpc).toHaveBeenCalledWith("logistics_partner_accept_rfd", {
      p_thread_id: THREAD_ID,
    });
  });

  it("maps SQLSTATE 22023 to 422", async () => {
    const sb = { rpc: vi.fn().mockResolvedValue({ data: null, error: { code: "22023", message: "RFD not pending" } }) };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(sb as any);
    const jwt = await makeJwt("partner", "p1");
    const res = await app.fetch(
      new Request("http://t/api/partner/pickups/accept-rfd", {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ threadId: THREAD_ID }),
      }),
      env,
    );
    expect(res.status).toBe(422);
  });

  it("rejects non-uuid threadId with 422", async () => {
    const sb = { rpc: vi.fn() };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(sb as any);
    const jwt = await makeJwt("partner", "p1");
    const res = await app.fetch(
      new Request("http://t/api/partner/pickups/accept-rfd", {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ threadId: "PO-001" }),
      }),
      env,
    );
    expect(res.status).toBe(422);
    expect(sb.rpc).not.toHaveBeenCalled();
  });

  it("rejects missing threadId with 422", async () => {
    const sb = { rpc: vi.fn() };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(sb as any);
    const jwt = await makeJwt("partner", "p1");
    const res = await app.fetch(
      new Request("http://t/api/partner/pickups/accept-rfd", {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({}),
      }),
      env,
    );
    expect(res.status).toBe(422);
    expect(sb.rpc).not.toHaveBeenCalled();
  });
});

describe("POST /api/partner/pickups/reject-rfd", () => {
  it("calls logistics_partner_reject_rfd RPC with p_thread_id + p_reason", async () => {
    const sb = {
      rpc: vi.fn().mockResolvedValue({
        data: { thread_id: THREAD_ID, rfd_cleared: true, lp_kept_assigned: true },
        error: null,
      }),
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(sb as any);
    const jwt = await makeJwt("partner", "p1");
    const res = await app.fetch(
      new Request("http://t/api/partner/pickups/reject-rfd", {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ threadId: THREAD_ID, reason: "capacity full" }),
      }),
      env,
    );
    expect(res.status).toBe(200);
    expect(sb.rpc).toHaveBeenCalledWith("logistics_partner_reject_rfd", {
      p_thread_id: THREAD_ID,
      p_reason: "capacity full",
    });
  });

  it("defaults p_reason to empty string when omitted", async () => {
    const sb = {
      rpc: vi.fn().mockResolvedValue({
        data: { thread_id: THREAD_ID, rfd_cleared: true, lp_kept_assigned: true },
        error: null,
      }),
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(sb as any);
    const jwt = await makeJwt("partner", "p1");
    const res = await app.fetch(
      new Request("http://t/api/partner/pickups/reject-rfd", {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ threadId: THREAD_ID }),
      }),
      env,
    );
    expect(res.status).toBe(200);
    expect(sb.rpc).toHaveBeenCalledWith("logistics_partner_reject_rfd", {
      p_thread_id: THREAD_ID,
      p_reason: "",
    });
  });

  it("rejects non-uuid threadId with 422", async () => {
    const sb = { rpc: vi.fn() };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(sb as any);
    const jwt = await makeJwt("partner", "p1");
    const res = await app.fetch(
      new Request("http://t/api/partner/pickups/reject-rfd", {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ threadId: "PO-001", reason: "x" }),
      }),
      env,
    );
    expect(res.status).toBe(422);
    expect(sb.rpc).not.toHaveBeenCalled();
  });
});

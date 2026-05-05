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

describe("POST /api/partner/pickups/:id/accept-rfd", () => {
  it("calls partner_accept_dispatch RPC", async () => {
    const sb = {
      rpc: vi.fn().mockResolvedValue({ data: { po_id: "PO-001", threads_advanced: 1 }, error: null }),
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(sb as any);

    const jwt = await makeJwt("partner", "p1");
    const res = await app.fetch(
      new Request("http://t/api/partner/pickups/PO-001/accept-rfd", {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ confirm_delivery_date: "2026-05-15" }),
      }),
      env,
    );
    expect(res.status).toBe(200);
    expect(sb.rpc).toHaveBeenCalledWith("partner_accept_dispatch", {
      p_po_id: "PO-001",
      p_confirm_delivery_date: "2026-05-15",
    });
  });

  it("maps SQLSTATE 22023 to 422", async () => {
    const sb = { rpc: vi.fn().mockResolvedValue({ data: null, error: { code: "22023", message: "RFD not pending" } }) };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(sb as any);
    const jwt = await makeJwt("partner", "p1");
    const res = await app.fetch(
      new Request("http://t/api/partner/pickups/PO-001/accept-rfd", {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({}),
      }),
      env,
    );
    expect(res.status).toBe(422);
  });
});

describe("POST /api/partner/pickups/:id/reject-rfd", () => {
  it("calls partner_reject_dispatch RPC", async () => {
    const sb = { rpc: vi.fn().mockResolvedValue({ data: { po_id: "PO-001", rfd_cleared: true }, error: null }) };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(sb as any);
    const jwt = await makeJwt("partner", "p1");
    const res = await app.fetch(
      new Request("http://t/api/partner/pickups/PO-001/reject-rfd", {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ reason: "capacity full" }),
      }),
      env,
    );
    expect(res.status).toBe(200);
    expect(sb.rpc).toHaveBeenCalledWith("partner_reject_dispatch", { p_po_id: "PO-001", p_reason: "capacity full" });
  });
});

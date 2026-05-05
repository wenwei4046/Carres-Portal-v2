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

const LP_ID = "00000000-0000-0000-0000-0000000001f1";

describe("POST /api/logistics/pos/:id/dispatch-customer-leg", () => {
  it("Force=true → calls RPC with p_force_dispatch=true", async () => {
    const sb = { rpc: vi.fn().mockResolvedValue({ data: { mode: "force" }, error: null }) };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(sb as any);
    const jwt = await makeJwt("logistics");
    const res = await app.fetch(
      new Request("http://t/api/logistics/pos/PO-200/dispatch-customer-leg", {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          partner_id: LP_ID,
          confirm_delivery_date: "2026-05-20",
          force_dispatch: true,
        }),
      }),
      env,
    );
    expect(res.status).toBe(200);
    expect(sb.rpc).toHaveBeenCalledWith("logistics_dispatch_customer_leg", {
      p_po_id: "PO-200",
      p_partner_id: LP_ID,
      p_confirm_delivery_date: "2026-05-20",
      p_force_dispatch: true,
    });
  });

  it("RFD path: force_dispatch defaults to false", async () => {
    const sb = { rpc: vi.fn().mockResolvedValue({ data: { mode: "rfd" }, error: null }) };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(sb as any);
    const jwt = await makeJwt("logistics");
    const res = await app.fetch(
      new Request("http://t/api/logistics/pos/PO-200/dispatch-customer-leg", {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ partner_id: LP_ID, confirm_delivery_date: "2026-05-20" }),
      }),
      env,
    );
    expect(res.status).toBe(200);
    expect(sb.rpc).toHaveBeenCalledWith("logistics_dispatch_customer_leg", {
      p_po_id: "PO-200",
      p_partner_id: LP_ID,
      p_confirm_delivery_date: "2026-05-20",
      p_force_dispatch: false,
    });
  });

  it("rejects dealer with 403", async () => {
    const jwt = await makeJwt("dealer");
    const res = await app.fetch(
      new Request("http://t/api/logistics/pos/PO-200/dispatch-customer-leg", {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ partner_id: LP_ID, confirm_delivery_date: "2026-05-20" }),
      }),
      env,
    );
    expect(res.status).toBe(403);
  });
});

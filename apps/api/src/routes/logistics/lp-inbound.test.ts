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

describe("POST /api/logistics/pos/:id/lp-accept-inbound", () => {
  it("calls lp_accept_inbound_delivery RPC for logistics caller (代按)", async () => {
    const sb = {
      rpc: vi.fn().mockResolvedValue({
        data: { po_id: "PO-100", sup_status: "partner_confirmed", partner_confirmed_at: "2026-05-05T10:00:00Z" },
        error: null,
      }),
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(sb as any);

    const jwt = await makeJwt("logistics");
    const res = await app.fetch(
      new Request("http://t/api/logistics/pos/PO-100/lp-accept-inbound", {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({}),
      }),
      env,
    );
    expect(res.status).toBe(200);
    expect(sb.rpc).toHaveBeenCalledWith("lp_accept_inbound_delivery", { p_po_id: "PO-100" });
  });

  it("rejects dealer with 403", async () => {
    const jwt = await makeJwt("dealer");
    const res = await app.fetch(
      new Request("http://t/api/logistics/pos/PO-100/lp-accept-inbound", {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({}),
      }),
      env,
    );
    expect(res.status).toBe(403);
  });

  it("admits principal role (carry-forward route-mount-middleware-leak fix)", async () => {
    // Pre-fix this returned 403 because logisticsPosRouter's blanket
    // `use("*", ...)` middleware leaked across siblings. Inline allowlist
    // here is ["logistics","principal","partner"]; the post-fix per-route
    // requireLogistics guard on logisticsPosRouter no longer leaks.
    const sb = { rpc: vi.fn().mockResolvedValue({ data: { po_id: "PO-100" }, error: null }) };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(sb as any);
    const jwt = await makeJwt("principal");
    const res = await app.fetch(
      new Request("http://t/api/logistics/pos/PO-100/lp-accept-inbound", {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({}),
      }),
      env,
    );
    expect(res.status).toBe(200);
    expect(sb.rpc).toHaveBeenCalledWith("lp_accept_inbound_delivery", { p_po_id: "PO-100" });
  });

  it("admits partner role (carry-forward route-mount-middleware-leak fix)", async () => {
    // Same fix as above. Partner self-accept of inbound delivery is the
    // primary use case the inline allowlist was written for; until the leak
    // was fixed, partners could not actually reach this route.
    const sb = { rpc: vi.fn().mockResolvedValue({ data: { po_id: "PO-100" }, error: null }) };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(sb as any);
    const jwt = await makeJwt("partner", "11111111-1111-1111-1111-aaaaaaaaaaaa");
    const res = await app.fetch(
      new Request("http://t/api/logistics/pos/PO-100/lp-accept-inbound", {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({}),
      }),
      env,
    );
    expect(res.status).toBe(200);
    expect(sb.rpc).toHaveBeenCalledWith("lp_accept_inbound_delivery", { p_po_id: "PO-100" });
  });
});

describe("POST /api/logistics/pos/:id/lp-reject-inbound", () => {
  it("calls partner_reject_customer with empty p_reason default", async () => {
    const sb = { rpc: vi.fn().mockResolvedValue({ data: { po_id: "PO-100" }, error: null }) };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(sb as any);
    const jwt = await makeJwt("logistics");
    const res = await app.fetch(
      new Request("http://t/api/logistics/pos/PO-100/lp-reject-inbound", {
        method: "POST", headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({}),
      }), env,
    );
    expect(res.status).toBe(200);
    expect(sb.rpc).toHaveBeenCalledWith("partner_reject_customer", { p_po_id: "PO-100", p_reason: "" });
  });
});

describe("POST /api/logistics/pos/:id/relocate-inbound", () => {
  it("calls logistics_relocate_warehouse RPC", async () => {
    const sb = { rpc: vi.fn().mockResolvedValue({ data: { po_id: "PO-100", new_warehouse_id: "00000000-0000-0000-0000-0000000000a2" }, error: null }) };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(sb as any);
    const jwt = await makeJwt("logistics");
    const res = await app.fetch(
      new Request("http://t/api/logistics/pos/PO-100/relocate-inbound", {
        method: "POST", headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ new_warehouse_id: "00000000-0000-0000-0000-0000000000a2" }),
      }), env,
    );
    expect(res.status).toBe(200);
    expect(sb.rpc).toHaveBeenCalledWith("logistics_relocate_warehouse", {
      p_po_id: "PO-100",
      p_new_warehouse_id: "00000000-0000-0000-0000-0000000000a2",
    });
  });
});

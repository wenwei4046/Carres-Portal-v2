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

describe("GET /api/finance/payment-settings", () => {
  function tables(fail = false) {
    const table = (rows: unknown[]) => {
      const chain = { select: vi.fn(), order: vi.fn() };
      chain.select.mockReturnValue(chain);
      // Two chained .order calls resolve on await — a thenable chain.
      const result = fail
        ? { data: null, error: { message: "down" } }
        : { data: rows, error: null };
      const thenable = Object.assign(chain, {
        then: (resolve: (v: unknown) => void) => resolve(result),
      });
      chain.order.mockReturnValue(thenable);
      return thenable;
    };
    const sb = { from: vi.fn().mockImplementation((name: string) =>
      table(name === "payment_manual_methods"
        ? [{ method: "bank", active: true, sort: 1 }]
        : [])) };
    vi.mocked(userClient).mockReturnValue(sb as never);
    return sb;
  }
  async function request(role: string) {
    return app.fetch(new Request("http://t/api/finance/payment-settings", {
      headers: { Authorization: `Bearer ${await makeJwt(role)}` },
    }), env);
  }
  it.each(["operation", "finance", "principal"])("reads the settings for %s", async (role) => {
    tables();
    const res = await request(role);
    expect(res.status).toBe(200);
    const body = await res.json() as { manual_methods: unknown[] };
    expect(body.manual_methods).toEqual([{ method: "bank", active: true, sort: 1 }]);
  });
  it.each(["dealer", "warehouse", "partner"])("refuses %s", async (role) => {
    expect((await request(role)).status).toBe(403);
    expect(userClient).not.toHaveBeenCalled();
  });
  it("a failed source read is an error, never empty settings", async () => {
    tables(true);
    expect((await request("finance")).status).toBe(500);
  });
});

describe("POST /api/finance/payment-settings/*", () => {
  async function post(path: string, role: string, body: unknown) {
    return app.fetch(new Request(`http://t/api/finance/payment-settings/${path}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${await makeJwt(role)}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }), env);
  }
  it("bank-account maps to the manager-gated SQL door", async () => {
    const sb = { rpc: vi.fn().mockResolvedValue({ data: { route_source: "dealer" }, error: null }) };
    vi.mocked(userClient).mockReturnValue(sb as never);
    const res = await post("bank-account", "principal", {
      routeSource: "dealer", bankName: "RHB", accountName: "Carres Sdn Bhd", accountNo: "212345678",
    });
    expect(res.status).toBe(200);
    expect(sb.rpc).toHaveBeenCalledWith("payment_set_bank_account", {
      p_route_source: "dealer", p_bank_name: "RHB",
      p_account_name: "Carres Sdn Bhd", p_account_no: "212345678",
    });
  });
  it("the SQL manager refusal maps to 403", async () => {
    const sb = { rpc: vi.fn().mockResolvedValue({ data: null, error: { code: "42501", message: "forbidden" } }) };
    vi.mocked(userClient).mockReturnValue(sb as never);
    const res = await post("method", "operation", { method: "cash", active: false });
    expect(res.status).toBe(403);
  });
  it("an unknown routing source is refused before SQL", async () => {
    const sb = { rpc: vi.fn() };
    vi.mocked(userClient).mockReturnValue(sb as never);
    const res = await post("bank-account", "principal", { routeSource: "walk_in", bankName: "X" });
    expect(res.status).toBe(422);
    expect(sb.rpc).not.toHaveBeenCalled();
  });
  it("a storage rule change reaches the append-only SQL door", async () => {
    const sb = { rpc: vi.fn().mockResolvedValue({ data: { id: "r1" }, error: null }) };
    vi.mocked(userClient).mockReturnValue(sb as never);
    const res = await post("storage-rule", "principal", {
      productGroup: "sofa", freeDays: 14, chargeAmount: 200, cycleDays: 14,
      extraFreeAllowed: false, inspectionDays: 30, effectiveFrom: "2026-10-01",
    });
    expect(res.status).toBe(200);
    expect(sb.rpc).toHaveBeenCalledWith("payment_set_storage_rule", expect.objectContaining({
      p_product_group: "sofa", p_charge_amount: 200, p_extra_free_allowed: false,
    }));
  });
});

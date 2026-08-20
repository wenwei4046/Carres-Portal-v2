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

/**
 * Tests for POST /api/operation/warehouses/:warehouseId/skus/:sku/threshold
 *
 * 0366 — the route is now ONE governed door: `ops_stock_set_thresholds`. The
 * old UPDATE-first / INSERT-on-miss / 23505-retry dance (and the six tests that
 * drove each branch of it) existed only because the route wrote
 * `stock_balances` directly and therefore had to invent `qty=0, reserved=0` for
 * a new row and take care never to clobber counts it did not own. The unit
 * register owns those totals now and the table carries no write policy at all,
 * so the race those branches guarded against cannot arise.
 *
 * What still matters is asserted here: the door is called with exactly the two
 * Settings values, nothing else is written, validation and the role gate fire
 * before any DB call, and a database refusal reaches the caller.
 */
function makeRpcMock(opts: { error?: { code?: string; message?: string } | null } = {}) {
  const rpcArgs: Record<string, unknown>[] = [];
  const rpc = vi.fn((_name: string, args: Record<string, unknown>) => {
    rpcArgs.push(args);
    return Promise.resolve({ data: null, error: opts.error ?? null });
  });
  const from = vi.fn((table: string) => {
    throw new Error(`0366: the threshold route must not touch ${table} directly`);
  });
  return { rpc, from, rpcArgs };
}

const WH = "11111111-1111-1111-1111-111111111111";
const SKU = "MAT-CLOUD-Q";
const URL = `http://t/api/operation/warehouses/${WH}/skus/${SKU}/threshold`;

async function post(m: ReturnType<typeof makeRpcMock>, role: string, payload: unknown) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  vi.mocked(userClient).mockReturnValue({ rpc: m.rpc, from: m.from } as any);
  const jwt = await makeJwt(role);
  return app.fetch(
    new Request(URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }),
    env,
  );
}

describe("POST /api/operation/warehouses/:warehouseId/skus/:sku/threshold", () => {
  it("set low only (high null) → 200 + the door called with low=10, high=null", async () => {
    const m = makeRpcMock();
    const res = await post(m, "operation", { low: 10, high: null });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; low: number | null; high: number | null };
    expect(body).toMatchObject({ ok: true, low: 10, high: null });
    expect(m.rpc).toHaveBeenCalledTimes(1);
    expect(m.rpc).toHaveBeenCalledWith("ops_stock_set_thresholds", {
      p_sku: SKU,
      p_warehouse_id: WH,
      p_low: 10,
      p_high: null,
    });
  });

  it("set both → 200 + the door called with both thresholds", async () => {
    const m = makeRpcMock();
    const res = await post(m, "operation", { low: 10, high: 50 });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; low: number | null; high: number | null };
    expect(body).toMatchObject({ ok: true, low: 10, high: 50 });
    expect(m.rpc).toHaveBeenCalledWith("ops_stock_set_thresholds", {
      p_sku: SKU,
      p_warehouse_id: WH,
      p_low: 10,
      p_high: 50,
    });
  });

  it("clear both (low null + high null) → 200 + the door called with both null", async () => {
    const m = makeRpcMock();
    const res = await post(m, "operation", { low: null, high: null });
    expect(res.status).toBe(200);
    expect(m.rpc).toHaveBeenCalledWith("ops_stock_set_thresholds", {
      p_sku: SKU,
      p_warehouse_id: WH,
      p_low: null,
      p_high: null,
    });
  });

  it("never writes a stock TOTAL — the register owns those (0366)", async () => {
    const m = makeRpcMock();
    const res = await post(m, "operation", { low: 5, high: 20 });
    expect(res.status).toBe(200);
    // The direct-table mock throws on any use, so reaching here proves the
    // route touched `stock_balances` through nothing but the door.
    expect(m.from).not.toHaveBeenCalled();
    const args = m.rpcArgs[0] ?? {};
    expect(Object.keys(args).sort()).toEqual(
      ["p_high", "p_low", "p_sku", "p_warehouse_id"],
    );
  });

  it("a database refusal reaches the caller instead of a silent 200", async () => {
    const m = makeRpcMock({ error: { code: "42501", message: "forbidden" } });
    const res = await post(m, "operation", { low: 5, high: 20 });
    expect(res.status).toBe(403);
  });

  it("validation error (high < low) → 422 + the door is never called", async () => {
    const m = makeRpcMock();
    const res = await post(m, "operation", { low: 50, high: 10 });
    expect(res.status).toBe(422);
    expect(m.rpc).not.toHaveBeenCalled();
  });

  it("rejects dealer with 403 (role gate fires before any DB call)", async () => {
    const m = makeRpcMock();
    const res = await post(m, "dealer", { low: 1, high: 2 });
    expect(res.status).toBe(403);
    expect(m.rpc).not.toHaveBeenCalled();
  });

  it("invalid uuid in :warehouseId path → 422 + no DB call", async () => {
    const m = makeRpcMock();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue({ rpc: m.rpc, from: m.from } as any);
    const jwt = await makeJwt("operation");
    const res = await app.fetch(
      new Request(`http://t/api/operation/warehouses/not-a-uuid/skus/${SKU}/threshold`, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ low: 1, high: 2 }),
      }),
      env,
    );
    expect(res.status).toBe(422);
    expect(m.rpc).not.toHaveBeenCalled();
  });

  it("negative integer → 422 + no DB call", async () => {
    const m = makeRpcMock();
    const res = await post(m, "operation", { low: -1, high: null });
    expect(res.status).toBe(422);
    expect(m.rpc).not.toHaveBeenCalled();
  });
});

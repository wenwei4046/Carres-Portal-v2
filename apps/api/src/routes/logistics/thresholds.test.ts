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
 * Tests for POST /api/logistics/warehouses/:warehouseId/skus/:sku/threshold
 *
 * The route does UPDATE-first then INSERT-on-miss. The mock returns a builder
 * whose terminal `.select()` resolves to `{ data: rowsHit, error: null }` so
 * we can assert "row existed" (UPDATE path) vs "didn't exist" (INSERT path).
 *
 * Helpers:
 *   - makeUpdateBuilder({ rowsHit }) — chain for `.from(...).update(payload).eq.eq.select`
 *   - makeInsertBuilder() — chain for `.from(...).insert(payload)` resolving to {error: null}
 *
 * The mock client's `.from()` returns different builders by call sequence
 * because the route calls `.from("stock_balances")` twice on INSERT path
 * (once for UPDATE, once for INSERT).
 */
type SbBuilder = {
  update: ReturnType<typeof vi.fn>;
  insert: ReturnType<typeof vi.fn>;
};

function makeBuilder(opts: { rowsHit: number; insertError?: { code?: string; message?: string } | null }) {
  const updatePayloads: unknown[] = [];
  const insertPayloads: unknown[] = [];

  const updateChain = {
    eq: vi.fn().mockReturnThis(),
    select: vi.fn().mockResolvedValue({
      data: opts.rowsHit > 0 ? Array(opts.rowsHit).fill({ sku: "x" }) : [],
      error: null,
    }),
  };
  const update = vi.fn((payload: unknown) => {
    updatePayloads.push(payload);
    return updateChain;
  });
  const insert = vi.fn((payload: unknown) => {
    insertPayloads.push(payload);
    return Promise.resolve({ data: null, error: opts.insertError ?? null });
  });

  const from = vi.fn((_table: string) => ({ update, insert } satisfies SbBuilder));
  return { from, update, insert, updatePayloads, insertPayloads, updateChain };
}

const WH = "11111111-1111-1111-1111-111111111111";
const SKU = "MAT-CLOUD-Q";
const URL = `http://t/api/logistics/warehouses/${WH}/skus/${SKU}/threshold`;

describe("POST /api/logistics/warehouses/:warehouseId/skus/:sku/threshold", () => {
  it("set low only (high null) → 200 + UPDATE called with low_threshold=10, high_threshold=null", async () => {
    const m = makeBuilder({ rowsHit: 1 });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue({ from: m.from } as any);
    const jwt = await makeJwt("logistics");
    const res = await app.fetch(
      new Request(URL, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ low: 10, high: null }),
      }),
      env,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; low: number | null; high: number | null };
    expect(body).toMatchObject({ ok: true, low: 10, high: null });
    expect(m.from).toHaveBeenCalledWith("stock_balances");
    expect(m.update).toHaveBeenCalledTimes(1);
    expect(m.updatePayloads[0]).toEqual({ low_threshold: 10, high_threshold: null });
    // INSERT path NOT taken (rowsHit=1).
    expect(m.insert).not.toHaveBeenCalled();
  });

  it("set both → 200 + UPDATE called with both thresholds", async () => {
    const m = makeBuilder({ rowsHit: 1 });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue({ from: m.from } as any);
    const jwt = await makeJwt("logistics");
    const res = await app.fetch(
      new Request(URL, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ low: 10, high: 50 }),
      }),
      env,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; low: number | null; high: number | null };
    expect(body).toMatchObject({ ok: true, low: 10, high: 50 });
    expect(m.update).toHaveBeenCalledTimes(1);
    expect(m.updatePayloads[0]).toEqual({ low_threshold: 10, high_threshold: 50 });
    expect(m.insert).not.toHaveBeenCalled();
  });

  it("clear both (low null + high null) → 200 + UPDATE called with both null", async () => {
    const m = makeBuilder({ rowsHit: 1 });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue({ from: m.from } as any);
    const jwt = await makeJwt("logistics");
    const res = await app.fetch(
      new Request(URL, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ low: null, high: null }),
      }),
      env,
    );
    expect(res.status).toBe(200);
    expect(m.update).toHaveBeenCalledTimes(1);
    expect(m.updatePayloads[0]).toEqual({ low_threshold: null, high_threshold: null });
    expect(m.insert).not.toHaveBeenCalled();
  });

  it("validation error (high < low) → 422 + neither UPDATE nor INSERT called", async () => {
    const m = makeBuilder({ rowsHit: 1 });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue({ from: m.from } as any);
    const jwt = await makeJwt("logistics");
    const res = await app.fetch(
      new Request(URL, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ low: 50, high: 10 }),
      }),
      env,
    );
    expect(res.status).toBe(422);
    expect(m.update).not.toHaveBeenCalled();
    expect(m.insert).not.toHaveBeenCalled();
  });

  it("UPDATE miss → INSERT path with qty=0, reserved=0 + thresholds, returns 200", async () => {
    const m = makeBuilder({ rowsHit: 0 });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue({ from: m.from } as any);
    const jwt = await makeJwt("logistics");
    const res = await app.fetch(
      new Request(URL, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ low: 5, high: 20 }),
      }),
      env,
    );
    expect(res.status).toBe(200);
    expect(m.update).toHaveBeenCalledTimes(1);
    expect(m.insert).toHaveBeenCalledTimes(1);
    expect(m.insertPayloads[0]).toEqual({
      sku: SKU,
      warehouse_id: WH,
      qty: 0,
      reserved: 0,
      low_threshold: 5,
      high_threshold: 20,
    });
  });

  it("rejects dealer with 403 (role gate fires before any DB call)", async () => {
    const m = makeBuilder({ rowsHit: 1 });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue({ from: m.from } as any);
    const jwt = await makeJwt("dealer");
    const res = await app.fetch(
      new Request(URL, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ low: 10, high: null }),
      }),
      env,
    );
    expect(res.status).toBe(403);
    expect(m.update).not.toHaveBeenCalled();
    expect(m.insert).not.toHaveBeenCalled();
  });

  it("invalid uuid in :warehouseId path → 422 + no DB call", async () => {
    const m = makeBuilder({ rowsHit: 1 });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue({ from: m.from } as any);
    const jwt = await makeJwt("logistics");
    const res = await app.fetch(
      new Request(`http://t/api/logistics/warehouses/not-a-uuid/skus/${SKU}/threshold`, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ low: 10, high: null }),
      }),
      env,
    );
    expect(res.status).toBe(422);
    expect(m.update).not.toHaveBeenCalled();
    expect(m.insert).not.toHaveBeenCalled();
  });

  it("negative integer → 422 + no DB call", async () => {
    const m = makeBuilder({ rowsHit: 1 });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue({ from: m.from } as any);
    const jwt = await makeJwt("logistics");
    const res = await app.fetch(
      new Request(URL, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ low: -5, high: null }),
      }),
      env,
    );
    expect(res.status).toBe(422);
    expect(m.update).not.toHaveBeenCalled();
    expect(m.insert).not.toHaveBeenCalled();
  });
});

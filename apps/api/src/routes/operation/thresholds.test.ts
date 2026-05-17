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

function makeBuilder(opts: {
  rowsHit: number;
  insertError?: { code?: string; message?: string } | null;
  // T42-C7 — when set, the SECOND update call (the race-retry) resolves to
  // this error. The first update keeps using `rowsHit` semantics.
  retryUpdateError?: { code?: string; message?: string } | null;
}) {
  const updatePayloads: unknown[] = [];
  const insertPayloads: unknown[] = [];

  // The first UPDATE goes through `.update().eq().eq().select()` — `.select`
  // is the awaited terminal carrying `rowsHit` semantics. The retry UPDATE
  // (T42-C7) goes through `.update().eq().eq()` — no `.select()`, awaited
  // directly. The retry path doesn't need `.select` data, only the resolved
  // `{ error }` shape — so the chained `.eq` returns a thenable that
  // resolves to `{ data: null, error: retryUpdateError ?? null }`.
  let updateCallIndex = 0;
  const update = vi.fn((payload: unknown) => {
    updatePayloads.push(payload);
    const isRetry = updateCallIndex > 0;
    updateCallIndex += 1;

    if (isRetry) {
      // Retry path — chain returns a thenable so `await sb.from().update().eq().eq()`
      // resolves with `{ data, error }` shape.
      const retryResult = {
        data: null,
        error: opts.retryUpdateError ?? null,
      };
      const retryChain: {
        eq: ReturnType<typeof vi.fn>;
        then: <T>(onFulfilled: (v: typeof retryResult) => T) => Promise<T>;
      } = {
        eq: vi.fn().mockReturnThis(),
        then: (onFulfilled) => Promise.resolve(retryResult).then(onFulfilled),
      };
      return retryChain;
    }

    // First-call path — terminal is `.select()`.
    const updateChain = {
      eq: vi.fn().mockReturnThis(),
      select: vi.fn().mockResolvedValue({
        data: opts.rowsHit > 0 ? Array(opts.rowsHit).fill({ sku: "x" }) : [],
        error: null,
      }),
    };
    return updateChain;
  });
  const insert = vi.fn((payload: unknown) => {
    insertPayloads.push(payload);
    return Promise.resolve({ data: null, error: opts.insertError ?? null });
  });

  const from = vi.fn((_table: string) => ({ update, insert } satisfies SbBuilder));
  return { from, update, insert, updatePayloads, insertPayloads };
}

const WH = "11111111-1111-1111-1111-111111111111";
const SKU = "MAT-CLOUD-Q";
const URL = `http://t/api/operation/warehouses/${WH}/skus/${SKU}/threshold`;

describe("POST /api/operation/warehouses/:warehouseId/skus/:sku/threshold", () => {
  it("set low only (high null) → 200 + UPDATE called with low_threshold=10, high_threshold=null", async () => {
    const m = makeBuilder({ rowsHit: 1 });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue({ from: m.from } as any);
    const jwt = await makeJwt("operation");
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
    const jwt = await makeJwt("operation");
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
    const jwt = await makeJwt("operation");
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
    const jwt = await makeJwt("operation");
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
    const jwt = await makeJwt("operation");
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
    const jwt = await makeJwt("operation");
    const res = await app.fetch(
      new Request(`http://t/api/operation/warehouses/not-a-uuid/skus/${SKU}/threshold`, {
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
    const jwt = await makeJwt("operation");
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

  // T42-C7 — race retry: concurrent writers both miss UPDATE then both
  // attempt INSERT. The loser hits 23505 (unique_violation on the
  // composite PK `(sku, warehouse_id)`); the route catches it and retries
  // the UPDATE on the now-existing row.
  it("23505 race on INSERT → retry UPDATE succeeds → 200 (no 500 surfaces)", async () => {
    const m = makeBuilder({
      rowsHit: 0,
      insertError: { code: "23505", message: 'duplicate key value violates unique constraint "stock_balances_pkey"' },
      retryUpdateError: null,
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue({ from: m.from } as any);
    const jwt = await makeJwt("operation");
    const res = await app.fetch(
      new Request(URL, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ low: 5, high: 20 }),
      }),
      env,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; low: number | null; high: number | null };
    expect(body).toMatchObject({ ok: true, low: 5, high: 20 });
    // Sequence: update (miss) → insert (23505) → update (retry, success).
    expect(m.update).toHaveBeenCalledTimes(2);
    expect(m.insert).toHaveBeenCalledTimes(1);
    // Both updates carry the same threshold payload — first writes were
    // wasted by the conflicting INSERT, retry re-applies them.
    expect(m.updatePayloads[0]).toEqual({ low_threshold: 5, high_threshold: 20 });
    expect(m.updatePayloads[1]).toEqual({ low_threshold: 5, high_threshold: 20 });
  });

  // Defensive: if the race-retry UPDATE itself fails for some other reason
  // (e.g. RLS revocation mid-request), surface that error rather than
  // looping. Falls through to mapPgError → 500 (generic) by default.
  it("23505 race + retry UPDATE fails → maps the retry error", async () => {
    const m = makeBuilder({
      rowsHit: 0,
      insertError: { code: "23505", message: "duplicate key" },
      retryUpdateError: { code: "42501", message: "rls denied on retry" },
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue({ from: m.from } as any);
    const jwt = await makeJwt("operation");
    const res = await app.fetch(
      new Request(URL, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ low: 5, high: 20 }),
      }),
      env,
    );
    expect(res.status).toBe(403);
    expect(m.update).toHaveBeenCalledTimes(2);
    expect(m.insert).toHaveBeenCalledTimes(1);
  });

  // Non-23505 INSERT error path — still routed through mapPgError without
  // retry. Confirms the retry branch is gated specifically on 23505.
  it("non-23505 INSERT error → maps directly without retry (no second UPDATE)", async () => {
    const m = makeBuilder({
      rowsHit: 0,
      insertError: { code: "23514", message: "check constraint violation" },
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue({ from: m.from } as any);
    const jwt = await makeJwt("operation");
    const res = await app.fetch(
      new Request(URL, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ low: 5, high: 20 }),
      }),
      env,
    );
    expect(res.status).toBe(500);
    expect(m.update).toHaveBeenCalledTimes(1);
    expect(m.insert).toHaveBeenCalledTimes(1);
  });
});

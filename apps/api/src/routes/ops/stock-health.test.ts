import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from "vitest";
import {
  SignJWT,
  createLocalJWKSet,
  exportJWK,
  generateKeyPair,
  type JWK,
  type KeyLike,
} from "jose";
import { Hono } from "hono";
import { authMiddleware, _setJwksForTesting } from "../../middleware/auth";
import stockRouter from "./stock";
import type { AppEnv } from "../../types";

/**
 * Stock health + proposal accuracy — Ready Stock K5 (no migration).
 *
 * What only a route test can prove:
 *  1. The archive filter is spelled the way LIVE DATA needs it. Every native
 *     order carries `source_system = NULL` and only the AutoCount import fills
 *     it, so the "when did our records start" probe must be
 *     `is.null OR neq.autocount` — a plain `not.eq.autocount` returns NOTHING
 *     and the whole screen silently reports zero history.
 *  2. The sales WINDOW is never mistaken for the sales HISTORY. The route
 *     fetches 200 days of lines; the engine is told where that window ends, so
 *     a company seven days old cannot be told its stock has been dead for 90.
 *  3. The window stretches back to cover an approved plan month, because a
 *     month can only be scored against sales that were actually fetched.
 *  4. It is a READ. No RPC, no write, no duty gate — K5 sets no number.
 */

vi.mock("../../lib/supabase", () => ({ userClient: vi.fn(), adminClient: vi.fn() }));
import { userClient } from "../../lib/supabase";

const SUPABASE_URL = "https://test.supabase.co";
const KID = "test-kid-1";
const env = {
  SUPABASE_URL,
  SUPABASE_ANON_KEY: "test-anon",
  SUPABASE_SERVICE_ROLE_KEY: "test-service",
  SUPABASE_JWT_SECRET: "unused",
};

function buildApp() {
  const app = new Hono<AppEnv>();
  app.onError((err, c) => {
    const status = (err as { status?: number }).status ?? 500;
    const message = err instanceof Error ? err.message : "Internal server error";
    return c.json(
      { error: "server_error", message },
      status as 400 | 401 | 403 | 404 | 409 | 500,
    );
  });
  const api = new Hono<AppEnv>();
  api.use("*", authMiddleware);
  api.route("/ops/stock", stockRouter);
  app.route("/api", api);
  return app;
}
const app = buildApp();

let signKey: KeyLike;
let publicJwk: JWK;

async function makeJwt(role: string, email = "khoryee@carres.com") {
  return new SignJWT({ email, app_metadata: { role } })
    .setProtectedHeader({ alg: "ES256", kid: KID, typ: "JWT" })
    .setSubject("11111111-1111-1111-1111-000000000999")
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
  // The whole card dates off "today", so it is pinned rather than left to the
  // clock — a test that changes meaning tomorrow proves nothing (T7's lesson).
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-07-27T04:00:00Z"));
});

afterAll(() => {
  vi.useRealTimers();
  _setJwksForTesting(null);
});

/** The live prod pool, free-text Klg-sheet SKUs and all. */
const PILLOW = "Essential Memory Pillow(L)";
const MP_K = "Microfiber Waterproof Mattress Protector-K";

interface SbOpts {
  stock?: unknown[];
  points?: unknown[];
  levels?: unknown[];
  lines?: unknown[];
  firstOrder?: unknown[];
  plans?: unknown[];
  planLines?: unknown[];
  proposals?: unknown[];
}

function buildSb(opts: SbOpts = {}) {
  const calls: Array<{ table: string; method: string; args: unknown[] }> = [];
  const rpcCalls: string[] = [];

  function chainFor(table: string, rows: unknown[]) {
    const chain: Record<string, unknown> = {
      then: (res: (v: { data: unknown[]; error: null }) => unknown) =>
        Promise.resolve({ data: rows, error: null }).then(res),
    };
    for (const m of ["select", "eq", "in", "is", "or", "order", "limit", "gte", "lt"]) {
      chain[m] = (...args: unknown[]) => {
        calls.push({ table, method: m, args });
        return chain;
      };
    }
    return chain;
  }

  const sb = {
    from: vi.fn((table: string) => {
      if (table === "ops_reorder_points") return chainFor(table, opts.points ?? []);
      if (table === "ops_stock_reserve_levels") return chainFor(table, opts.levels ?? []);
      if (table === "order_lines") return chainFor(table, opts.lines ?? []);
      if (table === "orders") return chainFor(table, opts.firstOrder ?? []);
      if (table === "ops_stock_plans") return chainFor(table, opts.plans ?? []);
      if (table === "ops_stock_plan_lines") return chainFor(table, opts.planLines ?? []);
      if (table === "ops_stock_plan_proposals")
        return chainFor(table, opts.proposals ?? []);
      return chainFor(table, opts.stock ?? []);
    }),
    rpc: vi.fn(async (name: string) => {
      rpcCalls.push(name);
      return { data: [], error: null };
    }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
  return { sb, calls, rpcCalls };
}

async function get(path: string, sb: unknown, role = "operation") {
  vi.mocked(userClient).mockReturnValue(sb as never);
  return app.request(
    `/api${path}`,
    { headers: { Authorization: `Bearer ${await makeJwt(role)}` } },
    env,
  );
}

interface HealthBody {
  headline: string;
  counts: Record<string, number>;
  rows: { sku: string; state: string; cover: number }[];
  slowMovers: { sku: string; quietDays: number; window: number }[];
  slowWindows: { days: number; ready: boolean; count: number }[];
  slowWithheldReason: string | null;
  accuracy: {
    period: string;
    reported: boolean;
    withheld: string | null;
    orderedQty: number;
    soldQty: number;
    movedPct: number | null;
  }[];
}

const line = (sku: string, placedAt: string, qty = 1, source: string | null = null) => ({
  sku,
  qty,
  orders: { placed_at: placedAt, status: "placed", source_system: source },
});

describe("GET /api/ops/stock/health", () => {
  /**
   * The live shape on 2026-07-27: 49 SKUs, no configured number anywhere, and
   * every sales line that matches a warehouse SKU coming from the AutoCount
   * archive. The honest answer is "nothing is watched yet" — NOT 49 green
   * ticks, and NOT 49 items flagged as dead stock.
   */
  it("reports today's live shape honestly — nothing watched, nothing called dead", async () => {
    const { sb } = buildSb({
      stock: [
        { sku: PILLOW, status: "free", qty: 555 },
        { sku: MP_K, status: "free", qty: 15 },
      ],
      points: [],
      levels: [],
      firstOrder: [{ placed_at: "2026-07-21T02:00:00Z" }],
      lines: [line(PILLOW, "2026-07-23T02:00:00Z", 36, "autocount")],
    });
    const res = await get("/ops/stock/health", sb);
    expect(res.status).toBe(200);
    const body = (await res.json()) as HealthBody;

    expect(body.counts).toMatchObject({ unrated: 2, healthy: 0, critical: 0 });
    expect(body.headline).toBe(
      "Nothing is watched yet — 2 items still need a number.",
    );
    expect(body.slowMovers).toEqual([]);
    expect(body.slowWindows.every((w) => !w.ready)).toBe(true);
    expect(body.slowWithheldReason).toContain("go back 7 days");
    expect(body.accuracy).toEqual([]);
  });

  /**
   * THE FILTER THAT HAD TO BE SPELLED RIGHT. Every native order on prod has
   * `source_system = NULL`; `not.eq.autocount` drops NULLs in PostgREST, so the
   * obvious spelling would return no rows and the route would report a company
   * with no sales records at all.
   */
  it("finds the first REAL order even though every one has a null source_system", async () => {
    const { sb, calls } = buildSb({ firstOrder: [{ placed_at: "2026-07-21" }] });
    await get("/ops/stock/health", sb);
    const or = calls.find((c) => c.table === "orders" && c.method === "or");
    expect(or?.args[0]).toBe("source_system.is.null,source_system.neq.autocount");
    expect(
      calls.some((c) => c.table === "orders" && c.method === "not"),
    ).toBe(false);
  });

  it("does not let its own 200-day window pass for 200 days of history", async () => {
    const { sb, calls } = buildSb({
      stock: [{ sku: PILLOW, status: "free", qty: 555 }],
      firstOrder: [{ placed_at: "2026-07-21" }],
      // A line sitting at the far edge of the window. Without the
      // `salesKnownFrom` answer this would make coverage read 200 days and
      // switch both slow-moving alerts on for a company one week old.
      lines: [line("Roma 3 Seater-Grey", "2026-01-08T02:00:00Z")],
    });
    const res = await get("/ops/stock/health", sb);
    const body = (await res.json()) as HealthBody;
    expect(body.slowWindows.every((w) => !w.ready)).toBe(true);
    expect(body.slowMovers).toEqual([]);
    // And the window it asked for is a real 200 days back from today, MYT.
    const gte = calls.find((c) => c.table === "order_lines" && c.method === "gte");
    expect(gte?.args[1]).toBe("2026-01-08");
  });

  it("stretches the sales window back to cover an approved plan month", async () => {
    const { sb, calls } = buildSb({
      plans: [{ id: "plan-1", period: "2025-11-01", status: "approved" }],
      firstOrder: [{ placed_at: "2025-01-01" }],
    });
    await get("/ops/stock/health", sb);
    const gte = calls.find((c) => c.table === "order_lines" && c.method === "gte");
    // 200 days back would be 2026-01-08 and would miss November entirely — a
    // month scored against sales nobody fetched reads as a plan that failed.
    expect(gte?.args[1]).toBe("2025-11-01");
  });

  it("scores a finished month against the approved quantity", async () => {
    const { sb } = buildSb({
      plans: [{ id: "plan-1", period: "2026-06-01", status: "approved" }],
      planLines: [
        { plan_id: "plan-1", sku: PILLOW, consolidated_qty: 250, approved_qty: 200 },
      ],
      proposals: [
        { plan_id: "plan-1", sku: PILLOW, qty: 300, proposed_by: "u-1" },
      ],
      stock: [{ sku: PILLOW, status: "free", qty: 60 }],
      firstOrder: [{ placed_at: "2026-01-05" }],
      lines: [line(PILLOW, "2026-06-15T02:00:00Z", 140)],
    });
    const res = await get("/ops/stock/health", sb);
    const body = (await res.json()) as HealthBody;
    expect(body.accuracy[0]).toMatchObject({
      period: "2026-06",
      reported: true,
      orderedQty: 200,
      soldQty: 140,
      movedPct: 70,
    });
  });

  it("withholds the month that is still running", async () => {
    const { sb } = buildSb({
      plans: [{ id: "plan-1", period: "2026-07-01", status: "approved" }],
      planLines: [
        { plan_id: "plan-1", sku: PILLOW, consolidated_qty: 200, approved_qty: 200 },
      ],
      proposals: [{ plan_id: "plan-1", sku: PILLOW, qty: 200, proposed_by: "u-1" }],
      firstOrder: [{ placed_at: "2026-01-05" }],
      lines: [line(PILLOW, "2026-07-15T02:00:00Z", 10)],
    });
    const res = await get("/ops/stock/health", sb);
    const body = (await res.json()) as HealthBody;
    expect(body.accuracy[0]).toMatchObject({
      reported: false,
      withheld: "month_not_over",
      movedPct: null,
    });
  });

  it("only asks for APPROVED cycles — an unapproved plan ordered nothing", async () => {
    const { sb, calls } = buildSb();
    await get("/ops/stock/health", sb);
    const eq = calls.find((c) => c.table === "ops_stock_plans" && c.method === "eq");
    expect(eq?.args).toEqual(["status", "approved"]);
  });

  it("ranks the ladder off the two numbers K1 and K4 already collect", async () => {
    const { sb } = buildSb({
      stock: [
        { sku: MP_K, status: "free", qty: 4 },
        { sku: PILLOW, status: "free", qty: 900 },
      ],
      points: [
        { sku: MP_K, reorder_point: 200 },
        { sku: PILLOW, reorder_point: 200 },
      ],
      levels: [{ sku: MP_K, reserve_level: 5 }],
      firstOrder: [{ placed_at: "2026-07-21" }],
    });
    const res = await get("/ops/stock/health", sb);
    const body = (await res.json()) as HealthBody;
    expect(body.rows.map((r) => [r.sku, r.state])).toEqual([
      [MP_K, "critical"],
      [PILLOW, "over"],
    ]);
    expect(body.headline).toBe("1 item is below the keep level.");
  });

  /** K5 sets nothing. A write path here would be a fourth number to keep in step. */
  it("is a read — it calls no RPC at all", async () => {
    const { sb, rpcCalls } = buildSb();
    const res = await get("/ops/stock/health", sb);
    expect(res.status).toBe(200);
    expect(rpcCalls).toEqual([]);
  });

  it("refuses a caller who is not operation or principal", async () => {
    const { sb } = buildSb();
    const res = await get("/ops/stock/health", sb, "dealer");
    expect(res.status).toBe(403);
  });
});

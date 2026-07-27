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
import stockPlanRouter from "./stock-plan";
import type { AppEnv } from "../../types";

/**
 * Ready stock plan routes — card K2 (migration 0287).
 *
 * What a UI click could never reveal, and these tests can:
 *  1. The AutoCount archive must not become demand. Live, 100% of the sales
 *     history for stock SKUs is archive rows stamped to ONE import day — if
 *     the route forgets to flag them, the screen prints a confident 30-day
 *     trend that is really one afternoon.
 *  2. The PO list must read the APPROVED number and appear only for an
 *     approved plan. A list that falls back to the manager's cut would hand
 *     Operations quantities nobody signed.
 *  3. `canConsolidate` / `canApprove` must come from DUTIES, not from being
 *     logged in.
 *  4. A database refusal (42501) must surface as 403, not 500 — a permission
 *     answer that reads as an outage sends people to the wrong fix.
 */

vi.mock("../../lib/supabase", () => ({ userClient: vi.fn(), adminClient: vi.fn() }));
import { userClient } from "../../lib/supabase";

const SUPABASE_URL = "https://test.supabase.co";
const KID = "test-kid-plan";
const env = {
  SUPABASE_URL,
  SUPABASE_ANON_KEY: "test-anon",
  SUPABASE_SERVICE_ROLE_KEY: "test-service",
  SUPABASE_JWT_SECRET: "unused",
};

const ME = "11111111-1111-1111-1111-000000000999";
const PLAN_ID = "22222222-2222-2222-2222-222222222222";
const PILLOW = "Essential Memory Pillow(L)";

function buildApp() {
  const app = new Hono<AppEnv>();
  app.onError((err, c) => {
    const status = (err as { status?: number }).status ?? 500;
    const message = err instanceof Error ? err.message : "Internal server error";
    return c.json(
      { error: "server_error", message },
      status as 400 | 401 | 403 | 404 | 500,
    );
  });
  const api = new Hono<AppEnv>();
  api.use("*", authMiddleware);
  api.route("/ops/stock-plan", stockPlanRouter);
  app.route("/api", api);
  return app;
}
const app = buildApp();

let signKey: KeyLike;
let publicJwk: JWK;

async function makeJwt(role: string, email = "khoryee@carres.com") {
  return new SignJWT({ email, app_metadata: { role } })
    .setProtectedHeader({ alg: "ES256", kid: KID, typ: "JWT" })
    .setSubject(ME)
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

// ---------------------------------------------------------------------------
// Supabase double
// ---------------------------------------------------------------------------

const THIS_MONTH = new Date(Date.now() + 8 * 3_600_000).toISOString().slice(0, 7);

function planRow(status: string, period = THIS_MONTH) {
  return {
    id: PLAN_ID,
    period: `${period}-01`,
    title: "August ready stock",
    status,
    opened_by: ME,
    opened_at: "2026-07-27T01:00:00Z",
    consolidated_by: status === "collecting" ? null : ME,
    consolidated_at: status === "collecting" ? null : "2026-07-27T02:00:00Z",
    decided_by: status === "approved" || status === "rejected" ? ME : null,
    decided_at: status === "approved" || status === "rejected" ? "2026-07-27T03:00:00Z" : null,
    decision_remark: status === "rejected" ? "Too much pillow" : null,
  };
}

interface SbOpts {
  plans?: unknown[];
  proposals?: unknown[];
  lines?: unknown[];
  stock?: unknown[];
  sales?: unknown[];
  duties?: string[] | null;
  rpcError?: { code?: string; message?: string } | null;
  rpcData?: unknown;
}

function buildSb(opts: SbOpts = {}) {
  const rpcCalls: Array<[string, unknown]> = [];
  const tables: string[] = [];

  function chainFor(rows: unknown[]) {
    const chain: Record<string, unknown> = {
      then: (res: (v: { data: unknown[]; error: null }) => unknown) =>
        Promise.resolve({ data: rows, error: null }).then(res),
    };
    for (const m of ["select", "eq", "in", "is", "or", "order", "limit", "gte"]) {
      chain[m] = () => chain;
    }
    return chain;
  }

  const sb = {
    from: vi.fn((table: string) => {
      tables.push(table);
      if (table === "ops_stock_plans") return chainFor(opts.plans ?? []);
      if (table === "ops_stock_plan_proposals") return chainFor(opts.proposals ?? []);
      if (table === "ops_stock_plan_lines") return chainFor(opts.lines ?? []);
      if (table === "ops_stock_items") return chainFor(opts.stock ?? []);
      if (table === "order_lines") return chainFor(opts.sales ?? []);
      if (table === "app_users")
        return chainFor([{ id: ME, name: "Khor Yee" }]);
      return chainFor([]);
    }),
    rpc: vi.fn(async (name: string, args: unknown) => {
      rpcCalls.push([name, args]);
      if (name === "my_org_duties") return { data: opts.duties ?? [], error: null };
      if (opts.rpcError) return { data: null, error: opts.rpcError };
      return { data: opts.rpcData ?? null, error: null };
    }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
  return { sb, rpcCalls, tables };
}

async function req(
  path: string,
  sb: unknown,
  init: RequestInit = {},
  role = "operation",
  email = "khoryee@carres.com",
) {
  vi.mocked(userClient).mockReturnValue(sb as never);
  return app.request(
    `/api${path}`,
    {
      ...init,
      headers: {
        ...(init.headers ?? {}),
        Authorization: `Bearer ${await makeJwt(role, email)}`,
      },
    },
    env,
  );
}

/** `Response.json()` is `unknown`; the assertions below read named fields, so
 *  one loose cast here keeps every test free of per-line casts. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const bodyOf = async (res: Response): Promise<any> => res.json();

const json = (body: unknown): RequestInit => ({
  method: "POST",
  body: JSON.stringify(body),
  headers: { "Content-Type": "application/json" },
});

// ---------------------------------------------------------------------------
// GET
// ---------------------------------------------------------------------------

describe("GET /ops/stock-plan", () => {
  it("requires a session", async () => {
    const res = await app.request("/api/ops/stock-plan", {}, env);
    expect(res.status).toBe(401);
  });

  it("refuses a dealer", async () => {
    const { sb } = buildSb();
    const res = await req("/ops/stock-plan", sb, {}, "dealer", "ltit@gmail.com");
    expect(res.status).toBe(403);
  });

  it("answers with no plan for a period nobody opened", async () => {
    const { sb } = buildSb();
    const res = await req("/ops/stock-plan", sb);
    expect(res.status).toBe(200);
    const body = await bodyOf(res);
    expect(body.plan).toBeNull();
    expect(body.rows).toEqual([]);
    expect(body.poList).toEqual([]);
    expect(body.canPropose).toBe(false);
  });

  it("does not turn the AutoCount archive into recent demand", async () => {
    // The live shape: every matching line is archive, stamped to one day.
    const { sb } = buildSb({
      plans: [planRow("collecting")],
      proposals: [{ sku: PILLOW, qty: 100, proposed_by: ME, note: null }],
      stock: [{ sku: PILLOW, status: "free", qty: 555 }],
      sales: [
        {
          sku: PILLOW,
          qty: 36,
          orders: { placed_at: "2026-07-23", status: "place", source_system: "autocount" },
        },
      ],
    });
    const res = await req("/ops/stock-plan", sb);
    const body = await bodyOf(res);
    expect(body.rows[0].sold30).toBe(0);
    expect(body.rows[0].sold90).toBe(0);
    expect(body.coverage.archiveLinesExcluded).toBe(1);
    expect(body.coverage.canSuggest).toBe(false);
    expect(body.rows[0].suggestedQty).toBeNull();
  });

  it("measures the pool in units, not rows (the 0218 bulk register)", async () => {
    const { sb } = buildSb({
      plans: [planRow("collecting")],
      proposals: [{ sku: PILLOW, qty: 10, proposed_by: ME, note: null }],
      stock: [{ sku: PILLOW, status: "free", qty: 555 }],
    });
    const body = await bodyOf(await req("/ops/stock-plan", sb));
    expect(body.rows[0].onHand).toBe(555);
  });

  it("totals every proposer's ask and names them", async () => {
    const { sb } = buildSb({
      plans: [planRow("collecting")],
      proposals: [
        { sku: PILLOW, qty: 10, proposed_by: ME, note: "weekend" },
        { sku: PILLOW, qty: 15, proposed_by: "other-uuid", note: null },
      ],
    });
    const body = await bodyOf(await req("/ops/stock-plan", sb));
    expect(body.rows[0].proposedQty).toBe(25);
    expect(body.rows[0].proposerCount).toBe(2);
    expect(body.rows[0].proposals.some((p: { proposedByName: string }) => p.proposedByName === "Khor Yee")).toBe(true);
  });

  it("opens proposals only while the cycle is collecting", async () => {
    for (const [status, expected] of [
      ["collecting", true],
      ["review", false],
      ["approved", false],
      ["rejected", false],
    ] as const) {
      const { sb } = buildSb({ plans: [planRow(status)] });
      const body = await bodyOf(await req("/ops/stock-plan", sb));
      expect(body.canPropose).toBe(expected);
    }
  });

  it("gates consolidate + approve on duties, not on being logged in", async () => {
    const { sb } = buildSb({ plans: [planRow("review")], duties: [] });
    const body = await bodyOf(await req("/ops/stock-plan", sb));
    expect(body.canConsolidate).toBe(false);
    expect(body.canApprove).toBe(false);

    const withDuties = buildSb({
      plans: [planRow("review")],
      duties: ["ops_manager", "stock_planner"],
    });
    const b2 = await bodyOf(await req("/ops/stock-plan", withDuties.sb));
    expect(b2.canConsolidate).toBe(true);
    expect(b2.canApprove).toBe(true);
  });

  it("lets principal through both gates without a duty row", async () => {
    const { sb } = buildSb({ plans: [planRow("review")], duties: [] });
    const body = await bodyOf(
      await req("/ops/stock-plan", sb, {}, "principal", "principal@carres.com"),
    );
    expect(body.canConsolidate).toBe(true);
    expect(body.canApprove).toBe(true);
  });

  it("hands over the PO list only once the plan is approved", async () => {
    const lines = [
      { sku: PILLOW, consolidated_qty: 20, approved_qty: 12 },
      { sku: "MP-K", consolidated_qty: 30, approved_qty: 0 },
    ];
    const proposals = [
      { sku: PILLOW, qty: 20, proposed_by: ME, note: null },
      { sku: "MP-K", qty: 30, proposed_by: ME, note: null },
    ];

    const review = buildSb({ plans: [planRow("review")], proposals, lines });
    expect((await bodyOf(await req("/ops/stock-plan", review.sb))).poList).toEqual([]);

    const approved = buildSb({ plans: [planRow("approved")], proposals, lines });
    const body = await bodyOf(await req("/ops/stock-plan", approved.sb));
    // Reads approvedQty, drops the line cut to 0, never falls back to 20/30.
    expect(body.poList).toEqual([{ sku: PILLOW, qty: 12 }]);
  });

  it("lists every period that has a plan, for the cycle switcher", async () => {
    const { sb } = buildSb({
      plans: [planRow("collecting", "2026-08"), planRow("approved", "2026-07")],
    });
    const body = await bodyOf(await req("/ops/stock-plan?period=2026-07", sb));
    expect(body.periods).toEqual(["2026-08", "2026-07"]);
    expect(body.plan.period).toBe("2026-07");
  });

  it("ignores a malformed period rather than 500ing", async () => {
    const { sb } = buildSb({ plans: [planRow("collecting")] });
    const res = await req("/ops/stock-plan?period=not-a-month", sb);
    expect(res.status).toBe(200);
  });
});

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

describe("plan writes", () => {
  it("opens a cycle at the month anchor", async () => {
    const { sb, rpcCalls } = buildSb({ rpcData: PLAN_ID });
    const res = await req("/ops/stock-plan", sb, json({ period: "2026-08" }));
    expect(res.status).toBe(201);
    const call = rpcCalls.find(([n]) => n === "ops_stock_plan_open");
    expect(call?.[1]).toMatchObject({ p_period: "2026-08-01" });
  });

  it("rejects a period that is not YYYY-MM", async () => {
    const { sb } = buildSb();
    const res = await req("/ops/stock-plan", sb, json({ period: "2026-13" }));
    expect(res.status).toBe(400);
  });

  it("passes a proposal straight to the RPC", async () => {
    const { sb, rpcCalls } = buildSb();
    const res = await req(
      `/ops/stock-plan/${PLAN_ID}/propose`,
      sb,
      json({ sku: PILLOW, qty: 40, note: "weekend demand" }),
    );
    expect(res.status).toBe(200);
    expect(rpcCalls.find(([n]) => n === "ops_stock_plan_propose")?.[1]).toMatchObject({
      p_plan: PLAN_ID,
      p_sku: PILLOW,
      p_qty: 40,
    });
  });

  it("allows qty 0 on propose — that is how an ask is withdrawn", async () => {
    const { sb } = buildSb();
    const res = await req(
      `/ops/stock-plan/${PLAN_ID}/propose`,
      sb,
      json({ sku: PILLOW, qty: 0 }),
    );
    expect(res.status).toBe(200);
  });

  it("refuses a negative quantity", async () => {
    const { sb } = buildSb();
    const res = await req(
      `/ops/stock-plan/${PLAN_ID}/propose`,
      sb,
      json({ sku: PILLOW, qty: -5 }),
    );
    expect(res.status).toBe(400);
  });

  it("routes consolidate / final / decide to their own RPCs", async () => {
    const cases: Array<[string, unknown, string]> = [
      ["consolidate", { sku: PILLOW, qty: 25 }, "ops_stock_plan_consolidate"],
      ["final", { sku: PILLOW, qty: 20 }, "ops_stock_plan_set_final"],
      ["decide", { decision: "approve" }, "ops_stock_plan_decide"],
    ];
    for (const [path, body, rpc] of cases) {
      const { sb, rpcCalls } = buildSb();
      const res = await req(`/ops/stock-plan/${PLAN_ID}/${path}`, sb, json(body));
      expect(res.status).toBe(200);
      expect(rpcCalls.some(([n]) => n === rpc)).toBe(true);
    }
  });

  it("rejects a decision word the RPC does not know", async () => {
    const { sb } = buildSb();
    const res = await req(
      `/ops/stock-plan/${PLAN_ID}/decide`,
      sb,
      json({ decision: "maybe" }),
    );
    expect(res.status).toBe(400);
  });

  it("surfaces a database refusal as 403, not as an outage", async () => {
    const { sb } = buildSb({ rpcError: { code: "42501", message: "forbidden" } });
    const res = await req(
      `/ops/stock-plan/${PLAN_ID}/decide`,
      sb,
      json({ decision: "approve" }),
    );
    expect(res.status).toBe(403);
  });

  it("surfaces a business rule (22023) as 400", async () => {
    const { sb } = buildSb({
      rpcError: { code: "22023", message: "plan_closed_for_proposals" },
    });
    const res = await req(
      `/ops/stock-plan/${PLAN_ID}/propose`,
      sb,
      json({ sku: PILLOW, qty: 5 }),
    );
    expect(res.status).toBe(400);
    expect((await bodyOf(res)).message).toContain("plan_closed_for_proposals");
  });

  it("refuses every write for a dealer", async () => {
    const { sb } = buildSb();
    for (const path of ["propose", "consolidate", "final", "decide"]) {
      const res = await req(
        `/ops/stock-plan/${PLAN_ID}/${path}`,
        sb,
        json({ sku: PILLOW, qty: 1, decision: "approve" }),
        "dealer",
        "ltit@gmail.com",
      );
      expect(res.status).toBe(403);
    }
  });

  it("rejects a body that is not JSON", async () => {
    const { sb } = buildSb();
    const res = await req(`/ops/stock-plan/${PLAN_ID}/propose`, sb, {
      method: "POST",
      body: "not json",
      headers: { "Content-Type": "application/json" },
    });
    expect(res.status).toBe(400);
  });
});

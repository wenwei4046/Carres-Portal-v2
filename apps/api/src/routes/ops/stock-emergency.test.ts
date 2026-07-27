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
import stockEmergencyRouter from "./stock-emergency";
import type { AppEnv } from "../../types";

/**
 * Urgent restock routes — card K3 (migration 0290).
 *
 * What a UI click could never reveal, and these tests can:
 *  1. The route must NOT read the monthly plan tables. The card's "never mixes
 *     into the monthly plan's numbers" is only structural if nothing joins.
 *  2. The urgent PO list must read the APPROVED number and drop what has
 *     already been ordered — otherwise the worklist grows forever and stops
 *     being read.
 *  3. `canDecide` / `canMarkOrdered` must come from DUTIES, not from being
 *     logged in; `canRaise` deliberately does not.
 *  4. A database refusal (42501) must surface as 403, not 500 — a permission
 *     answer that reads as an outage sends people to the wrong fix.
 */

vi.mock("../../lib/supabase", () => ({ userClient: vi.fn(), adminClient: vi.fn() }));
import { userClient } from "../../lib/supabase";

const SUPABASE_URL = "https://test.supabase.co";
const KID = "test-kid-urgent";
const env = {
  SUPABASE_URL,
  SUPABASE_ANON_KEY: "test-anon",
  SUPABASE_SERVICE_ROLE_KEY: "test-service",
  SUPABASE_JWT_SECRET: "unused",
};

const ME = "11111111-1111-1111-1111-000000000999";
const REQ_ID = "33333333-3333-3333-3333-333333333333";
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
  api.route("/ops/stock-emergency", stockEmergencyRouter);
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

const NOW = new Date().toISOString();

function requestRow(over: Record<string, unknown> = {}) {
  return {
    id: REQ_ID,
    sku: PILLOW,
    qty: 40,
    reason: "weekend_low",
    note: null,
    requested_by: ME,
    requested_at: NOW,
    status: "pending",
    approved_qty: null,
    decided_by: null,
    decided_at: null,
    decision_remark: null,
    ordered_by: null,
    ordered_at: null,
    ...over,
  };
}

interface SbOpts {
  requests?: unknown[];
  stock?: unknown[];
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
      if (table === "ops_stock_emergency_requests")
        return chainFor(opts.requests ?? []);
      if (table === "ops_stock_items") return chainFor(opts.stock ?? []);
      if (table === "app_users") return chainFor([{ id: ME, name: "Khor Yee" }]);
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

describe("GET /ops/stock-emergency", () => {
  it("requires a session", async () => {
    const res = await app.request("/api/ops/stock-emergency", {}, env);
    expect(res.status).toBe(401);
  });

  it("refuses a dealer", async () => {
    const { sb } = buildSb();
    const res = await req("/ops/stock-emergency", sb, {}, "dealer", "ltit@gmail.com");
    expect(res.status).toBe(403);
  });

  it("answers an empty lane without inventing anything", async () => {
    const { sb } = buildSb();
    const body = await bodyOf(await req("/ops/stock-emergency", sb));
    expect(body.rows).toEqual([]);
    expect(body.pendingCount).toBe(0);
    expect(body.poList).toEqual([]);
  });

  it("NEVER reads the monthly plan tables — the card's own line", async () => {
    const { sb, tables } = buildSb({ requests: [requestRow()] });
    await req("/ops/stock-emergency", sb);
    expect(tables).not.toContain("ops_stock_plans");
    expect(tables).not.toContain("ops_stock_plan_proposals");
    expect(tables).not.toContain("ops_stock_plan_lines");
  });

  it("shows the warehouse in units, not rows (the 0218 bulk register)", async () => {
    const { sb } = buildSb({
      requests: [requestRow({ qty: 40 })],
      stock: [
        { sku: PILLOW, status: "free", qty: 555 },
        { sku: PILLOW, status: "incoming", qty: 100 },
      ],
    });
    const body = await bodyOf(await req("/ops/stock-emergency", sb));
    expect(body.rows[0].onHand).toBe(555);
    expect(body.rows[0].incoming).toBe(100);
    // Warns that the ask is already covered — and leaves it decidable.
    expect(body.rows[0].coveredByFreeStock).toBe(true);
    expect(body.pendingCount).toBe(1);
  });

  it("names the person who asked, and speaks a plain-word reason", async () => {
    const { sb } = buildSb({ requests: [requestRow({ reason: "oos_risk" })] });
    const body = await bodyOf(await req("/ops/stock-emergency", sb));
    expect(body.rows[0].requestedByName).toBe("Khor Yee");
    expect(body.rows[0].reasonLabel).toBe("About to run out");
  });

  it("de-duplicates the open + recent reads into one row", async () => {
    // The route asks twice on purpose (everything live, however old, plus the
    // recent history) — the same row must not appear twice.
    const { sb } = buildSb({ requests: [requestRow()] });
    const body = await bodyOf(await req("/ops/stock-emergency", sb));
    expect(body.rows).toHaveLength(1);
  });

  it("hands over the approved number, and drops what is already ordered", async () => {
    const approved = buildSb({
      requests: [requestRow({ qty: 100, status: "approved", approved_qty: 25 })],
    });
    expect((await bodyOf(await req("/ops/stock-emergency", approved.sb))).poList).toEqual(
      [{ sku: PILLOW, qty: 25, requestCount: 1 }],
    );

    const ordered = buildSb({
      requests: [requestRow({ qty: 100, status: "ordered", approved_qty: 25 })],
    });
    expect((await bodyOf(await req("/ops/stock-emergency", ordered.sb))).poList).toEqual(
      [],
    );
  });

  it("gates decide + mark-ordered on duties, but never gates raising", async () => {
    const none = buildSb({ requests: [requestRow()], duties: [] });
    const b1 = await bodyOf(await req("/ops/stock-emergency", none.sb));
    expect(b1.canDecide).toBe(false);
    expect(b1.canMarkOrdered).toBe(false);
    // The person on the floor is the one who sees the shelf empty.
    expect(b1.canRaise).toBe(true);

    const held = buildSb({
      requests: [requestRow()],
      duties: ["stock_planner", "po_duty_editor"],
    });
    const b2 = await bodyOf(await req("/ops/stock-emergency", held.sb));
    expect(b2.canDecide).toBe(true);
    expect(b2.canMarkOrdered).toBe(true);
  });

  it("lets principal through both gates without a duty row", async () => {
    const { sb } = buildSb({ requests: [requestRow()], duties: [] });
    const body = await bodyOf(
      await req("/ops/stock-emergency", sb, {}, "principal", "principal@carres.com"),
    );
    expect(body.canDecide).toBe(true);
    expect(body.canMarkOrdered).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

describe("urgent restock writes", () => {
  it("passes a raise straight to the RPC", async () => {
    const { sb, rpcCalls } = buildSb({ rpcData: REQ_ID });
    const res = await req(
      "/ops/stock-emergency",
      sb,
      json({ sku: PILLOW, qty: 40, reason: "weekend_low", note: "TikTok" }),
    );
    expect(res.status).toBe(201);
    expect(rpcCalls.find(([n]) => n === "ops_stock_emergency_raise")?.[1]).toMatchObject(
      { p_sku: PILLOW, p_qty: 40, p_reason: "weekend_low" },
    );
  });

  it("refuses a reason nobody locked", async () => {
    const { sb } = buildSb();
    const res = await req(
      "/ops/stock-emergency",
      sb,
      json({ sku: PILLOW, qty: 5, reason: "because_i_said_so" }),
    );
    expect(res.status).toBe(400);
  });

  it("refuses Other with no words, and accepts it with them", async () => {
    const { sb } = buildSb({ rpcData: REQ_ID });
    const bare = await req(
      "/ops/stock-emergency",
      sb,
      json({ sku: PILLOW, qty: 5, reason: "other" }),
    );
    expect(bare.status).toBe(400);

    const said = await req(
      "/ops/stock-emergency",
      sb,
      json({ sku: PILLOW, qty: 5, reason: "other", note: "influencer post" }),
    );
    expect(said.status).toBe(201);
  });

  it("refuses a zero or negative quantity — an urgent ask for none is not one", async () => {
    const { sb } = buildSb();
    for (const qty of [0, -5]) {
      const res = await req(
        "/ops/stock-emergency",
        sb,
        json({ sku: PILLOW, qty, reason: "promotion" }),
      );
      expect(res.status).toBe(400);
    }
  });

  it("approves as asked when no quantity is sent — the RPC resolves it", async () => {
    const { sb, rpcCalls } = buildSb();
    const res = await req(
      `/ops/stock-emergency/${REQ_ID}/decide`,
      sb,
      json({ decision: "approve" }),
    );
    expect(res.status).toBe(200);
    expect(
      rpcCalls.find(([n]) => n === "ops_stock_emergency_decide")?.[1],
    ).toMatchObject({ p_id: REQ_ID, p_decision: "approve", p_qty: null });
  });

  it("carries the COO's smaller number through", async () => {
    const { sb, rpcCalls } = buildSb();
    await req(
      `/ops/stock-emergency/${REQ_ID}/decide`,
      sb,
      json({ decision: "approve", qty: 25 }),
    );
    expect(
      rpcCalls.find(([n]) => n === "ops_stock_emergency_decide")?.[1],
    ).toMatchObject({ p_qty: 25 });
  });

  it("refuses to turn an ask down with no reason", async () => {
    const { sb } = buildSb();
    for (const body of [{ decision: "reject" }, { decision: "reject", remark: "  " }]) {
      const res = await req(`/ops/stock-emergency/${REQ_ID}/decide`, sb, json(body));
      expect(res.status).toBe(400);
    }
    const ok = await req(
      `/ops/stock-emergency/${REQ_ID}/decide`,
      sb,
      json({ decision: "reject", remark: "we have 300 already" }),
    );
    expect(ok.status).toBe(200);
  });

  it("rejects a decision word the RPC does not know", async () => {
    const { sb } = buildSb();
    const res = await req(
      `/ops/stock-emergency/${REQ_ID}/decide`,
      sb,
      json({ decision: "maybe" }),
    );
    expect(res.status).toBe(400);
  });

  it("routes the ordered tick to its own RPC", async () => {
    const { sb, rpcCalls } = buildSb();
    const res = await req(`/ops/stock-emergency/${REQ_ID}/ordered`, sb, {
      method: "POST",
    });
    expect(res.status).toBe(200);
    expect(
      rpcCalls.find(([n]) => n === "ops_stock_emergency_mark_ordered")?.[1],
    ).toMatchObject({ p_id: REQ_ID });
  });

  it("surfaces a database refusal as 403, not as an outage", async () => {
    const { sb } = buildSb({ rpcError: { code: "42501", message: "forbidden" } });
    const res = await req(
      `/ops/stock-emergency/${REQ_ID}/decide`,
      sb,
      json({ decision: "approve" }),
    );
    expect(res.status).toBe(403);
  });

  it("surfaces a business rule (22023) as 400", async () => {
    const { sb } = buildSb({
      rpcError: { code: "22023", message: "request_already_answered" },
    });
    const res = await req(
      `/ops/stock-emergency/${REQ_ID}/decide`,
      sb,
      json({ decision: "approve" }),
    );
    expect(res.status).toBe(400);
    expect((await bodyOf(res)).message).toContain("request_already_answered");
  });

  it("refuses every write for a dealer", async () => {
    const { sb } = buildSb();
    const paths: Array<[string, RequestInit]> = [
      ["/ops/stock-emergency", json({ sku: PILLOW, qty: 1, reason: "promotion" })],
      [`/ops/stock-emergency/${REQ_ID}/decide`, json({ decision: "approve" })],
      [`/ops/stock-emergency/${REQ_ID}/ordered`, { method: "POST" }],
    ];
    for (const [path, init] of paths) {
      const res = await req(path, sb, init, "dealer", "ltit@gmail.com");
      expect(res.status).toBe(403);
    }
  });

  it("rejects a body that is not JSON", async () => {
    const { sb } = buildSb();
    const res = await req("/ops/stock-emergency", sb, {
      method: "POST",
      body: "not json",
      headers: { "Content-Type": "application/json" },
    });
    expect(res.status).toBe(400);
  });
});

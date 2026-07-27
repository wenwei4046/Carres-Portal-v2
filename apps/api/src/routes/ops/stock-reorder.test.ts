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
 * Reorder alert routes — Ready Stock K1 (migration 0286).
 *
 * What a UI bug could never reveal, and these tests can:
 *  1. The GET must MEASURE the pool, not report it. A bulk accessory row on
 *     prod carries qty 555 in ONE record — counting records instead of units
 *     would say "1 pillow left" and fire a false alarm forever.
 *  2. `canEdit` must come from the caller's DUTY, not from being logged in.
 *     Jess's locked line is "only the COO edits reorder points".
 *  3. A PUT that the database refuses (42501) must surface as 403, not 500 —
 *     otherwise a permission answer reads as an outage.
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
    return c.json({ error: "server_error", message }, status as 400 | 401 | 403 | 404 | 500);
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
});

afterAll(() => _setJwksForTesting(null));

/** The live prod pool 2026-07-27, free-text Klg-sheet SKUs and all. */
const PILLOW = "Essential Memory Pillow(L)";
const MP_K = "Microfiber Waterproof Mattress Protector-K";

const STOCK_ROWS = [
  { sku: PILLOW, status: "free", qty: 555 },
  { sku: MP_K, status: "free", qty: 15 },
  { sku: "Breeze FirmCare-B1201F-K", status: "free", qty: 1 },
];

interface SbOpts {
  stock?: unknown[];
  points?: unknown[];
  duties?: string[] | null;
  rpcError?: { code?: string; message?: string } | null;
}

function buildSb(opts: SbOpts = {}) {
  const rpcCalls: Array<[string, unknown]> = [];
  const tables: string[] = [];

  function chainFor(rows: unknown[]) {
    const chain: Record<string, unknown> = {
      then: (res: (v: { data: unknown[]; error: null }) => unknown) =>
        Promise.resolve({ data: rows, error: null }).then(res),
    };
    for (const m of ["select", "eq", "in", "is", "or", "order", "limit"]) {
      chain[m] = () => chain;
    }
    return chain;
  }

  const sb = {
    from: vi.fn((table: string) => {
      tables.push(table);
      if (table === "ops_reorder_points") return chainFor(opts.points ?? []);
      return chainFor(opts.stock ?? STOCK_ROWS);
    }),
    rpc: vi.fn(async (name: string, args: unknown) => {
      rpcCalls.push([name, args]);
      if (name === "my_org_duties") return { data: opts.duties ?? [], error: null };
      if (opts.rpcError) return { data: null, error: opts.rpcError };
      return { data: null, error: null };
    }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
  return { sb, rpcCalls, tables };
}

async function req(path: string, sb: unknown, init: RequestInit = {}, role = "operation", email = "khoryee@carres.com") {
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

describe("GET /api/ops/stock/reorder", () => {
  it("measures the pool in UNITS, so a 555-unit bulk row is not '1 left'", async () => {
    const { sb } = buildSb({
      points: [{ sku: PILLOW, reorder_point: 200, lead_days: 60, note: null }],
    });
    const res = await req("/ops/stock/reorder", sb);
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      rows: { sku: string; onHand: number; state: string }[];
      alertCount: number;
    };
    const pillow = body.rows.find((r) => r.sku === PILLOW)!;
    expect(pillow.onHand).toBe(555);
    expect(pillow.state).toBe("ok");
    expect(body.alertCount).toBe(0);
  });

  it("raises the <200 case while there is still stock on the floor", async () => {
    const { sb } = buildSb({
      points: [
        { sku: PILLOW, reorder_point: 200, lead_days: 60, note: null },
        { sku: MP_K, reorder_point: 200, lead_days: 60, note: null },
      ],
    });
    const res = await req("/ops/stock/reorder", sb);
    const body = (await res.json()) as {
      rows: { sku: string; onHand: number; state: string; shortfall: number }[];
      alertCount: number;
    };
    expect(body.alertCount).toBe(1);
    // Worst first — the row needing a PO leads the list.
    expect(body.rows[0].sku).toBe(MP_K);
    expect(body.rows[0].shortfall).toBe(185);
    expect(body.rows[0].onHand).toBeGreaterThan(0);
  });

  it("reads BOTH the stock register and the points table", async () => {
    const { sb, tables } = buildSb();
    await req("/ops/stock/reorder", sb);
    expect(tables).toContain("ops_stock_items");
    expect(tables).toContain("ops_reorder_points");
  });

  it("says an unconfigured accessory is `unset`, never a silent `ok`", async () => {
    const { sb } = buildSb({ points: [] });
    const res = await req("/ops/stock/reorder", sb);
    const body = (await res.json()) as {
      rows: { sku: string; state: string }[];
      unsetCount: number;
      alertCount: number;
    };
    expect(body.unsetCount).toBe(2);
    expect(body.alertCount).toBe(0);
    // The ordinary mattress is not an import accessory and stays off the list.
    expect(body.rows.map((r) => r.sku)).not.toContain("Breeze FirmCare-B1201F-K");
  });

  it("withholds the pencil from an operation user with no duty", async () => {
    const { sb } = buildSb({ duties: [] });
    const res = await req("/ops/stock/reorder", sb);
    expect(((await res.json()) as { canEdit: boolean }).canEdit).toBe(false);
  });

  it("gives the pencil to the seat that holds stock_planner", async () => {
    const { sb } = buildSb({ duties: ["stock_planner"] });
    const res = await req("/ops/stock/reorder", sb);
    expect(((await res.json()) as { canEdit: boolean }).canEdit).toBe(true);
  });

  it("gives the pencil to principal without needing a duty", async () => {
    const { sb } = buildSb({ duties: [] });
    const res = await req("/ops/stock/reorder", sb, {}, "principal", "principal@carres.com");
    expect(((await res.json()) as { canEdit: boolean }).canEdit).toBe(true);
  });

  it("is closed to a role outside operation/principal", async () => {
    const { sb } = buildSb();
    const res = await req("/ops/stock/reorder", sb, {}, "dealer", "ltit@gmail.com");
    expect(res.status).toBe(403);
  });
});

describe("PUT /api/ops/stock/reorder", () => {
  async function put(sb: unknown, body: unknown, role = "operation") {
    return req(
      "/ops/stock/reorder",
      sb,
      {
        method: "PUT",
        body: JSON.stringify(body),
        headers: { "Content-Type": "application/json" },
      },
      role,
    );
  }

  it("hands the number to the audited RPC, not to a direct table write", async () => {
    const { sb, rpcCalls, tables } = buildSb();
    const res = await put(sb, { sku: MP_K, reorderPoint: 200, leadDays: 60 });
    expect(res.status).toBe(200);
    expect(rpcCalls).toContainEqual([
      "ops_set_reorder_point",
      { p_sku: MP_K, p_point: 200, p_lead_days: 60, p_note: null },
    ]);
    expect(tables).not.toContain("ops_reorder_points");
  });

  it("accepts 0 — the documented OFF switch", async () => {
    const { sb, rpcCalls } = buildSb();
    const res = await put(sb, { sku: MP_K, reorderPoint: 0 });
    expect(res.status).toBe(200);
    expect((rpcCalls[0][1] as { p_point: number }).p_point).toBe(0);
  });

  it("refuses a negative point before it reaches the database", async () => {
    const { sb, rpcCalls } = buildSb();
    const res = await put(sb, { sku: MP_K, reorderPoint: -1 });
    expect(res.status).toBe(400);
    expect(rpcCalls.some(([n]) => n === "ops_set_reorder_point")).toBe(false);
  });

  it("refuses a blank SKU", async () => {
    const { sb } = buildSb();
    expect((await put(sb, { sku: "   ", reorderPoint: 200 })).status).toBe(400);
  });

  it("surfaces the database's refusal as 403, not as an outage", async () => {
    const { sb } = buildSb({
      rpcError: { code: "42501", message: "reorder points are set by the COO" },
    });
    const res = await put(sb, { sku: MP_K, reorderPoint: 200 });
    expect(res.status).toBe(403);
  });

  it("is closed to a role outside operation/principal", async () => {
    const { sb } = buildSb();
    const res = await put(sb, { sku: MP_K, reorderPoint: 200 }, "supplier");
    expect(res.status).toBe(403);
  });
});

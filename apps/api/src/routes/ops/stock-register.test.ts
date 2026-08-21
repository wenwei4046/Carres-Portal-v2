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
 * GET /api/ops/stock/register — the Stock Register's read surface.
 * CARD-2026-08-20-stock-register §6.
 *
 * What these tests exist to hold:
 *
 *  1. It reads `stock_unit_register_v` — the governed view — and NEVER
 *     `ops_stock_items` (0366 left that table with no write policy and the
 *     register has no business reading around the view) and never
 *     `stock_balances` (a non-authoritative cache since 0366 that may not
 *     answer whether goods can be offered).
 *  2. It does not RE-DERIVE availability. Whatever the view says arrives on the
 *     wire unchanged — that is Law D, and it is the whole point of Card 1.
 *  3. A Unit is addressed by its PERMANENT Carres Unit ID, not a row uuid.
 *  4. An ended Unit still resolves on the detail route: Card §1 keeps ended
 *     Units out of the default LIST, not out of history.
 *  5. The lineage comes back ordered by `seq`, never `event_at` (0372: two
 *     events in one statement can share a clock reading to the microsecond).
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

/** A row exactly as `stock_unit_register_v` returns it (shape taken from the
 *  live view on 2026-08-21). */
function viewRow(over: Record<string, unknown> = {}) {
  return {
    id: "u-1",
    unit_code: "id-aaa111111",
    sku: "BF03-Jager-K",
    category: "bedframe",
    warehouse_id: "wh-klang",
    site_name: "Carres Klang Warehouse",
    holder_party_id: null,
    holder_name: null,
    ownership: "carres_owned",
    supplier: "Ohana",
    po_no: "PO/2508-116",
    status: "free",
    condition: "new",
    needs_repair: false,
    hold_reason: null,
    reserved_ref: null,
    sold_order_id: null,
    qty: 1,
    date_in: "2026-08-01",
    last_verified_at: null,
    availability: "available",
    lifecycle_outcome: "active",
    last_event_at: null,
    last_event: null,
    ...over,
  };
}

interface SbOpts {
  rows?: unknown[];
  single?: unknown | null;
  events?: unknown[];
}

function buildSb(opts: SbOpts = {}) {
  const tables: string[] = [];
  const orders: { col: string; asc: boolean }[] = [];
  const eqs: { col: string; val: unknown }[] = [];

  function chain(rows: unknown[], single?: unknown | null) {
    const c: Record<string, unknown> = {};
    c.select = () => c;
    c.eq = (col: string, val: unknown) => {
      eqs.push({ col, val });
      return c;
    };
    c.order = (col: string, o?: { ascending?: boolean }) => {
      orders.push({ col, asc: o?.ascending !== false });
      return c;
    };
    c.limit = () => c;
    c.maybeSingle = () => Promise.resolve({ data: single ?? null, error: null });
    c.then = (res: (v: unknown) => unknown) => res({ data: rows, error: null });
    return c;
  }

  const sb = {
    from(table: string) {
      tables.push(table);
      if (table === "stock_unit_events") return chain(opts.events ?? []);
      return chain(opts.rows ?? [], opts.single);
    },
  };
  return { sb, tables, orders, eqs };
}

describe("GET /register — the one current listing", () => {
  it("reads the governed view, and nothing else", async () => {
    const { sb, tables } = buildSb({ rows: [viewRow()] });
    vi.mocked(userClient).mockReturnValue(sb as never);

    const res = await app.request(
      "/api/ops/stock/register",
      { headers: { Authorization: `Bearer ${await makeJwt("operation")}` } },
      env,
    );
    expect(res.status).toBe(200);

    expect(tables).toContain("stock_unit_register_v");
    // The two tables a Register must never reach around the view to read.
    expect(tables).not.toContain("ops_stock_items");
    expect(tables).not.toContain("stock_balances");
  });

  it("passes availability and lifecycle through WITHOUT re-deriving them (Law D)", async () => {
    // A deliberately contradictory row: the status says free, the view says
    // not_available. The route must repeat the VIEW, because the view is the
    // one arithmetic and the route has no opinion.
    const { sb } = buildSb({
      rows: [viewRow({ status: "free", needs_repair: false, availability: "not_available" })],
    });
    vi.mocked(userClient).mockReturnValue(sb as never);

    const res = await app.request(
      "/api/ops/stock/register",
      { headers: { Authorization: `Bearer ${await makeJwt("operation")}` } },
      env,
    );
    const body = (await res.json()) as { units: { availability: string }[] };
    expect(body.units[0].availability).toBe("not_available");
  });

  it("camel-cases the row and keeps an absent fact absent", async () => {
    const { sb } = buildSb({ rows: [viewRow({ holder_name: null, last_event_at: null })] });
    vi.mocked(userClient).mockReturnValue(sb as never);

    const res = await app.request(
      "/api/ops/stock/register",
      { headers: { Authorization: `Bearer ${await makeJwt("operation")}` } },
      env,
    );
    const body = (await res.json()) as { units: Record<string, unknown>[]; total: number };
    expect(body.total).toBe(1);
    expect(body.units[0].unitCode).toBe("id-aaa111111");
    expect(body.units[0].siteName).toBe("Carres Klang Warehouse");
    // Not recorded stays null — never a plausible-looking default.
    expect(body.units[0].holderName).toBeNull();
    expect(body.units[0].lastEventAt).toBeNull();
  });

  it("refuses a caller who is not operations", async () => {
    const { sb } = buildSb({ rows: [viewRow()] });
    vi.mocked(userClient).mockReturnValue(sb as never);
    const res = await app.request(
      "/api/ops/stock/register",
      { headers: { Authorization: `Bearer ${await makeJwt("dealer")}` } },
      env,
    );
    expect(res.status).toBe(403);
  });
});

describe("GET /register/:unitCode — one exact Unit", () => {
  it("looks the Unit up by its PERMANENT id, not a row uuid", async () => {
    const { sb, eqs } = buildSb({ single: viewRow() });
    vi.mocked(userClient).mockReturnValue(sb as never);

    const res = await app.request(
      "/api/ops/stock/register/id-aaa111111",
      { headers: { Authorization: `Bearer ${await makeJwt("operation")}` } },
      env,
    );
    expect(res.status).toBe(200);
    expect(eqs.some((e) => e.col === "unit_code" && e.val === "id-aaa111111")).toBe(true);
    expect(eqs.some((e) => e.col === "id")).toBe(false);
  });

  it("still resolves a Unit whose life has ENDED — history is not deleted", async () => {
    const { sb } = buildSb({
      single: viewRow({ availability: "ended", status: "sold", lifecycle_outcome: "delivered" }),
    });
    vi.mocked(userClient).mockReturnValue(sb as never);

    const res = await app.request(
      "/api/ops/stock/register/id-aaa111111",
      { headers: { Authorization: `Bearer ${await makeJwt("operation")}` } },
      env,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { unit: { lifecycleOutcome: string } };
    expect(body.unit.lifecycleOutcome).toBe("delivered");
  });

  it("orders the lineage by seq, never by event_at (0372)", async () => {
    const { sb, orders } = buildSb({ single: viewRow(), events: [] });
    vi.mocked(userClient).mockReturnValue(sb as never);

    await app.request(
      "/api/ops/stock/register/id-aaa111111",
      { headers: { Authorization: `Bearer ${await makeJwt("operation")}` } },
      env,
    );
    const seq = orders.find((o) => o.col === "seq");
    expect(seq, "the lineage must be ordered by seq").toBeTruthy();
    expect(seq?.asc).toBe(false);
    expect(orders.some((o) => o.col === "event_at")).toBe(false);
  });

  it("says plainly that no Unit carries the id", async () => {
    const { sb } = buildSb({ single: null });
    vi.mocked(userClient).mockReturnValue(sb as never);

    const res = await app.request(
      "/api/ops/stock/register/id-nope000000",
      { headers: { Authorization: `Bearer ${await makeJwt("operation")}` } },
      env,
    );
    expect(res.status).toBe(404);
  });
});

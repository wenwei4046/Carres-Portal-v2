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
import { migration, stockRegisterDatabase, verifyInventorySql } from "../../test/stock-register-database";

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

async function makeJwt(role: string, email = "inventory-test@example.test") {
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

/** Mapping fixture only. The SQL-backed contract regression below verifies
 *  which columns the committed view actually supplies. */
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
  sourceError?: { code: string; message: string };
}

function buildSb(opts: SbOpts = {}) {
  const tables: string[] = [];
  const orders: { col: string; asc: boolean }[] = [];
  const eqs: { col: string; val: unknown }[] = [];

  function chain(rows: unknown[], single?: unknown | null, error: unknown = null) {
    const c: Record<string, unknown> = {};
    c.select = () => c;
    c.in = () => c;
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
    c.then = (res: (v: unknown) => unknown) => res({ data: rows, error });
    return c;
  }

  const sb = {
    from(table: string) {
      tables.push(table);
      if (table === "stock_unit_events") return chain(opts.events ?? []);
      if (["product_skus", "purchase_orders", "orders"].includes(table)) return chain([], null, opts.sourceError);
      return chain(opts.rows ?? [], opts.single);
    },
  };
  return { sb, tables, orders, eqs };
}

describe("GET /register — the one current listing", () => {
  it("does not report missing source facts when their lookup failed", async () => {
    const { sb } = buildSb({ rows: [viewRow()], sourceError: { code: "42703", message: "Source contract unavailable" } });
    vi.mocked(userClient).mockReturnValue(sb as never);
    const res = await app.request("/api/ops/stock/register", {
      headers: { Authorization: `Bearer ${await makeJwt("operation")}` },
    }, env);
    expect(res.status).toBe(500);
    expect(await res.json()).not.toHaveProperty("units");
  });
  it("executes both real route projections against the committed SQL and catches the missing migration", async () => {
    const db = await stockRegisterDatabase();
    const tables: string[] = [];
    const sb = {
      from(table: string) {
        tables.push(table);
        let projection = "*";
        let filter: { column: string; value: unknown } | undefined;
        let order = "";
        let values: unknown[] = [];
        let inColumn = "";
        const execute = async (single = false) => {
          try {
            const columns = table === "product_skus"
              ? "sku, variant, (select json_build_object('name',name) from product_models where id=product_skus.model_id) as product_models"
              : projection;
            if (table === "product_skus") expect(projection).toBe("sku, variant, product_models(name)");
            const where = filter ? ` where ${filter.column} = $1` : values.length ? ` where ${inColumn} = any($1)` : "";
            const result = await db.query(`select ${columns} from public.${table}${where}${order}`, filter ? [filter.value] : values.length ? [values] : []);
            return { data: single ? result.rows[0] ?? null : result.rows, error: null };
          } catch (error) {
            return { data: null, error };
          }
        };
        const chain = {
          select(columns: string) { projection = columns; return chain; },
          in(column: string, list: unknown[]) { expect(["sku", "id"]).toContain(column); inColumn = column; values = list; return chain; },
          eq(column: string, value: unknown) { filter = { column, value }; return chain; },
          order(column: string, options?: { ascending?: boolean }) { order = ` order by ${column} ${options?.ascending === false ? "desc" : "asc"}`; return chain; },
          limit() { return chain; },
          maybeSingle() { return execute(true); },
          then(resolve: (value: unknown) => unknown) { return execute().then(resolve); },
        };
        return chain;
      },
    };
    vi.mocked(userClient).mockReturnValue(sb as never);
    const headers = { Authorization: `Bearer ${await makeJwt("operation")}` };
    try {
      // Negative control is the actual production shape (0373), not a
      // fabricated Supabase error: PostgreSQL must reject the route's SELECT.
      for (const path of ["/api/ops/stock/register", "/api/ops/stock/register/id-contract1"]) {
        const broken = await app.request(path, { headers }, env);
        expect(broken.status).toBe(500);
        expect(await broken.json()).toMatchObject({ message: expect.stringContaining('site_name') });
      }
      await db.exec(migration("0417_the_register_names_the_site_and_the_holder"));
      await db.exec(verifyInventorySql);
      const response = await app.request("/api/ops/stock/register", { headers }, env);
      expect(response.status).toBe(200);
      const body = await response.json() as { total: number; units: Record<string, unknown>[] };
      expect(body.total).toBe(2);
      expect(body.units[0]).toMatchObject({ siteName: "Fixture site", holderName: "Fixture holder", availability: "not_available", lastEvent: "latest" });
      expect(body.units[0]).toMatchObject({ productName: "Fixture sofa · Three seater", expectedArrival: expect.stringContaining("2026-09-09"), purchasePurpose: "service_case" });
      expect(String(body.units[0].poDate)).toContain("2026-08-01");
      expect(String(body.units[0].soDate)).toContain("2026-08-02");
      expect(body.units[1]).toMatchObject({ siteName: null, holderName: null, lifecycleOutcome: "delivered" });
      const detail = await app.request("/api/ops/stock/register/id-contract2", { headers }, env);
      expect(detail.status).toBe(200);
      expect(await detail.json()).toMatchObject({ unit: { unitCode: "id-contract2", lifecycleOutcome: "delivered" } });
      expect(new Set(tables)).toEqual(new Set(["stock_unit_register_v", "stock_unit_events", "product_skus", "purchase_orders", "orders"]));
      const grants = await db.query("select grantee, privilege_type from information_schema.role_table_grants where table_name='stock_unit_register_v' and grantee in ('authenticated','anon')");
      expect(grants.rows).toEqual([{ grantee: "authenticated", privilege_type: "SELECT" }]);
    } finally {
      await db.close();
    }
  }, 30_000);

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

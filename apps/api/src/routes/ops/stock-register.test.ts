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
import { readFileSync, readdirSync } from "node:fs";
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

describe("stock_unit_register_v — governed display names", () => {
  it("projects Site and holder names from their governed rows", () => {
    const migrationsUrl = new URL("../../../../../supabase/migrations/", import.meta.url);
    const definingMigration = readdirSync(migrationsUrl)
      .filter((name) => name.endsWith(".sql"))
      .sort()
      .reverse()
      .find((name) =>
        readFileSync(new URL(name, migrationsUrl), "utf8").includes(
          "create or replace view public.stock_unit_register_v",
        ),
      );

    expect(definingMigration, "a migration must define the Stock Register view").toBeTruthy();
    const sql = readFileSync(new URL(definingMigration!, migrationsUrl), "utf8");

    expect(sql).toMatch(/left join public\.warehouses\s+w\s+on\s+w\.id\s*=\s*v\.warehouse_id/i);
    expect(sql).toMatch(/w\.name\s+as\s+site_name/i);
    expect(sql).toMatch(
      /left join public\.stock_operating_parties\s+p\s+on\s+p\.id\s*=\s*v\.holder_party_id/i,
    );
    expect(sql).toMatch(/p\.name\s+as\s+holder_name/i);
    expect(sql).toMatch(/with\s*\(security_invoker\s*=\s*true\)/i);
    expect(sql).toMatch(/revoke all on public\.stock_unit_register_v from authenticated, anon/i);
    expect(sql).toMatch(/grant select on public\.stock_unit_register_v to authenticated/i);
  });

  it("projects next movement from official PO and Delivery reads only", () => {
    const migrationsUrl = new URL("../../../../../supabase/migrations/", import.meta.url);
    const definingMigration = readdirSync(migrationsUrl)
      .filter((name) => name.endsWith(".sql"))
      .sort()
      .reverse()
      .find((name) =>
        readFileSync(new URL(name, migrationsUrl), "utf8").includes(
          "create or replace view public.stock_unit_register_v",
        ),
      );
    expect(definingMigration).toBeTruthy();
    const sql = readFileSync(new URL(definingMigration!, migrationsUrl), "utf8");

    expect(sql).toMatch(/left join public\.purchase_orders\s+po\s+on\s+po\.id\s*=\s*v\.po_no/i);
    expect(sql).toMatch(/from public\.ops_delivery_orders\s+d/i);
    expect(sql).toMatch(/d\.voided_at\s+is\s+null/i);
    expect(sql).toMatch(/when v\.status = 'transferred' then null/i);
    expect(sql).not.toMatch(/insert\s+into\s+public\.(?:purchase_orders|ops_delivery_orders|ops_stock_items)/i);
  });
});

describe("warehouse_schedule_v — read-only owner projection", () => {
  it("projects PO promise, Receiving and exact DO collection evidence without a writer", () => {
    const migrationsUrl = new URL("../../../../../supabase/migrations/", import.meta.url);
    const definingMigration = readdirSync(migrationsUrl)
      .filter((name) => name.endsWith(".sql"))
      .sort()
      .reverse()
      .find((name) => readFileSync(new URL(name, migrationsUrl), "utf8").includes(
        "create or replace view public.warehouse_schedule_v",
      ));

    expect(definingMigration).toBeTruthy();
    const sql = readFileSync(new URL(definingMigration!, migrationsUrl), "utf8");
    expect(sql).toMatch(/from public\.po_supplier_promises/i);
    expect(sql).toMatch(/from public\.warehouse_receipts/i);
    expect(sql).toMatch(/from public\.ops_delivery_orders/i);
    expect(sql).toMatch(/from public\.delivery_handover_events/i);
    expect(sql).toContain("Customer delivery pickup");
    expect(sql).toContain("Customer handover");
    expect(sql).toContain("No collection evidence yet");
    expect(sql).toMatch(/revoke all on public\.warehouse_schedule_v from authenticated, anon/i);
    expect(sql).toMatch(/grant select on public\.warehouse_schedule_v to authenticated/i);
    expect(sql).not.toMatch(/insert\s+into|update\s+public\.|delete\s+from/i);
  });
});

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
    next_movement_kind: "none",
    next_movement_location: null,
    next_movement_ref: null,
    move_date: null,
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
  const ranges: { kind: "gte" | "lte"; col: string; val: unknown }[] = [];

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
    c.gte = (col: string, val: unknown) => {
      ranges.push({ kind: "gte", col, val });
      return c;
    };
    c.lte = (col: string, val: unknown) => {
      ranges.push({ kind: "lte", col, val });
      return c;
    };
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
  return { sb, tables, orders, eqs, ranges };
}

describe("GET /schedule — Warehouse's read-only landing Register", () => {
  it("reads the governed projection and derives Office readiness without querying an owner table", async () => {
    const { sb, tables, ranges } = buildSb({
      rows: [{
        id: "delivery-pickup:do-1",
        event_date: "2026-09-05",
        event_label: "Customer delivery pickup",
        unit_codes: ["U1-000-001"],
        units_count: 1,
        from_location: "Carres Klang Warehouse",
        to_location: "To customer",
        company: "NETS Logistics",
        source_ref: "DO-050926-0001",
        source_path: "/operation/delivery-orders/DO-050926-0001",
        timing_label: "Expected · 9:00 AM",
        evidence_label: "No collection evidence yet",
      }],
    });
    vi.mocked(userClient).mockReturnValue(sb as never);

    const res = await app.request(
      "/api/ops/stock/schedule?from=2026-08-31&to=2026-09-05",
      { headers: { Authorization: `Bearer ${await makeJwt("operation")}` } },
      env,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { rows: Array<Record<string, unknown>> };
    expect(body.rows[0]).toMatchObject({
      date: "2026-09-05",
      event: "Customer delivery pickup",
      operationsReadyBy: "2026-09-04",
      source: "DO-050926-0001",
    });
    expect(tables).toEqual(["warehouse_schedule_v"]);
    expect(ranges).toEqual([
      { kind: "gte", col: "event_date", val: "2026-08-31" },
      { kind: "lte", col: "event_date", val: "2026-09-05" },
    ]);
  });

  it("refuses a malformed calendar range before reading any facts", async () => {
    const { sb, tables } = buildSb();
    vi.mocked(userClient).mockReturnValue(sb as never);
    const res = await app.request(
      "/api/ops/stock/schedule?from=bad&to=2026-09-05",
      { headers: { Authorization: `Bearer ${await makeJwt("operation")}` } },
      env,
    );
    expect(res.status).toBe(400);
    expect(tables).toEqual([]);
  });
});

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

  it("passes official next-movement facts through without querying their owners", async () => {
    const { sb, tables } = buildSb({
      rows: [viewRow({
        next_movement_kind: "supplier_arrival",
        next_movement_location: "Carres Klang Warehouse",
        next_movement_ref: "PO/26-1",
        move_date: "2026-09-04",
      })],
    });
    vi.mocked(userClient).mockReturnValue(sb as never);

    const res = await app.request(
      "/api/ops/stock/register",
      { headers: { Authorization: `Bearer ${await makeJwt("operation")}` } },
      env,
    );
    const body = (await res.json()) as { units: Record<string, unknown>[] };
    expect(body.units[0]).toMatchObject({
      nextMovementKind: "supplier_arrival",
      nextMovementLocation: "Carres Klang Warehouse",
      nextMovementRef: "PO/26-1",
      moveDate: "2026-09-04",
    });
    expect(tables).toEqual(["stock_unit_register_v"]);
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

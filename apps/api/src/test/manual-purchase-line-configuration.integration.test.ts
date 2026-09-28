import { describe, it, expect, beforeAll, afterAll } from "vitest";
import pg from "pg";

/**
 * 0591 ON A REAL POSTGRESQL RUNNING THE WHOLE MIGRATION CHAIN (Purchasing
 * MASTER §9.2, owner correction 2026-09-26 — "no free text"):
 *
 *   create      each line's `attrs` (the Sales portal configuration) is kept
 *               on its demand; a line without one stays NULL
 *   resubmit    a changed configuration is written and recorded as
 *               `line_configured` in the round's change ledger; a new line's
 *               configuration is kept
 *   shape       a non-object or empty `attrs` is ignored, never stored
 *
 * Fixtures are written with triggers off inside ONE transaction that is
 * rolled back; the doors are then called with triggers ON, as a signed-in
 * Operation person.
 *
 *   LC_ALL=en_US.UTF-8 node scripts/dry-run-migrations.mjs --baseline scripts/migration-replay-baseline.json --keep
 *   CARRES_TEST_DATABASE_URL=postgres://postgres@localhost:<port>/<db> pnpm --filter @carres/api test -- manual-purchase-line-configuration
 *
 * Without the URL every case is SKIPPED — reported as skipped, never as passed.
 */
const URL = process.env.CARRES_TEST_DATABASE_URL ?? "";
const LOCAL = /^postgres(ql)?:\/\/[^@/]*@?(localhost|127\.0\.0\.1|\[::1\])(:\d+)?\//.test(URL);
const RUN = Date.now() % 100000;
const HEX = RUN.toString(16).padStart(5, "0");
const uid = (tail: string) => `fffffff1-0000-4000-8000-${HEX}${tail.padStart(7, "0")}`;

const OP = uid("2");
const SUPPLIER = uid("51");
const DEST = uid("71");
const MODEL = uid("91");
const SKU = `IT-CFG-${HEX}`;
const CONFIG = { color: "Sand", fabric_name: "Fabric CG-012", options: [{ kind: "leg", value: "Walnut" }] };

describe.skipIf(!URL)("a Manual Purchase line is configured like a Sales line (real PostgreSQL, 0591)", () => {
  let db: pg.Client;
  const q = (sql: string, params: unknown[] = []) => db.query(sql, params);
  async function attempt(sql: string, params: unknown[] = []): Promise<{ ok: true; row: Record<string, unknown> } | { ok: false; why: string }> {
    await q("savepoint s");
    try {
      const r = await q(sql, params);
      await q("release savepoint s");
      return { ok: true, row: (r.rows[0] ?? {}) as Record<string, unknown> };
    } catch (e) {
      await q("rollback to savepoint s");
      const err = e as { detail?: string; code?: string; message: string };
      return { ok: false, why: err.detail && !err.detail.includes(" ") ? err.detail : err.code ?? err.message };
    }
  }
  const as = async (who: string) => {
    await q("reset role");
    await q("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: who, role: "authenticated" })]);
    await q("set local role authenticated");
  };
  const create = (lines: unknown[]) =>
    attempt(
      "select public.purchasing_create_request_with_lines('ready_stock', $1::uuid, null, '2026-10-20'::date, null, null, null, $2::jsonb, 'additional_stock', null) as r",
      [DEST, JSON.stringify(lines)],
    );
  const demands = async (requestId: string) =>
    (await q("select id, sku, qty, attrs from public.purchase_demands where request_id = $1 and cancelled_at is null order by created_at, id", [requestId])).rows as Array<{ id: string; sku: string; qty: number; attrs: unknown }>;

  beforeAll(async () => {
    if (!LOCAL) throw new Error("CARRES_TEST_DATABASE_URL must point at localhost");
    db = new pg.Client({ connectionString: URL });
    await db.connect();
    await q("begin");
    await q("set local session_replication_role = replica");
    const email = `it-0591-operation-${RUN}@carres.test`;
    await q("insert into auth.users (id, email) values ($1, $2)", [OP, email]);
    await q("insert into app_users (id, email, name, role, status, is_person) values ($1, $2, $3, 'operation', 'active', true)", [OP, email, `IT op ${HEX}`]);
    /* Inside one transaction a failed statement aborts everything after it,
       so every fixture fallback runs under its own savepoint. */
    const tryq = async (sql: string, params: unknown[]) => {
      await q("savepoint f");
      try { await q(sql, params); await q("release savepoint f"); return true; }
      catch { await q("rollback to savepoint f"); return false; }
    };
    if (!(await tryq("insert into suppliers (id, name, kind, slug) values ($1, $2, (select enum_range(null::supplier_kind))[1], $3)", [SUPPLIER, `IT supplier ${HEX}`, `it-sup-${HEX}`]))) {
      await q("insert into suppliers (id, name, kind, slug) select $1, $2, kind, $3 from suppliers limit 1", [SUPPLIER, `IT supplier ${HEX}`, `it-sup-${HEX}`]);
    }
    await q("insert into purchasing_destinations (id, name) values ($1, $2)", [DEST, `IT Klang ${HEX}`]);
    const cat = (await q("select udt_name from information_schema.columns where table_name = 'product_models' and column_name = 'category'")).rows[0].udt_name as string;
    if (!(await tryq(`insert into product_models (id, category, model_key, name, supplier_id) values ($1, (enum_range(null::${cat}))[1], $2, $3, $4)`, [MODEL, `it-cfg-${HEX}`, `IT Sofa ${HEX}`, SUPPLIER]))) {
      await q(`insert into product_models (id, category, model_key, name) values ($1, (enum_range(null::${cat}))[1], $2, $3)`, [MODEL, `it-cfg-${HEX}`, `IT Sofa ${HEX}`]);
    }
    const vk = (await q("select udt_name, data_type from information_schema.columns where table_name = 'product_skus' and column_name = 'variant_kind'")).rows[0] as { udt_name: string; data_type: string };
    const variantKind = vk.data_type === "USER-DEFINED" ? `(enum_range(null::${vk.udt_name}))[1]` : "'size'";
    await q(`insert into product_skus (model_id, sku, variant, variant_kind, price, supplier_id) values ($1, $2, 'Left', ${variantKind}, 1000, $3)`, [MODEL, SKU, SUPPLIER]);
    await q("set local session_replication_role = origin");
  });
  afterAll(async () => {
    await q("reset role").catch(() => {});
    await q("rollback").catch(() => {});
    await db.end();
  });

  it("keeps each line's configuration on its demand; a line without one stays NULL", async () => {
    await as(OP);
    const r = await create([
      { sku: SKU, qty: 2, attrs: CONFIG },
      { sku: SKU, qty: 1 },
    ]);
    expect(r.ok, r.ok ? "" : r.why).toBe(true);
    const id = (r as unknown as { row: { r: { id: string } } }).row.r.id;
    const rows = await demands(id);
    expect(rows).toHaveLength(2);
    expect(rows[0]!.attrs).toEqual(CONFIG);
    expect(rows[1]!.attrs).toBeNull();
  });

  it("ignores a configuration that is not an object, and an empty one", async () => {
    await as(OP);
    const r = await create([
      { sku: SKU, qty: 1, attrs: "grey, not beige" },
      { sku: SKU, qty: 1, attrs: {} },
    ]);
    expect(r.ok, r.ok ? "" : r.why).toBe(true);
    const rows = await demands((r as unknown as { row: { r: { id: string } } }).row.r.id);
    expect(rows.map((x) => x.attrs)).toEqual([null, null]);
  });

  it("a returned request sends its configuration again; a change is written and recorded as line_configured", async () => {
    await as(OP);
    const r = await create([{ sku: SKU, qty: 2, attrs: CONFIG }]);
    expect(r.ok, r.ok ? "" : r.why).toBe(true);
    const id = (r as unknown as { row: { r: { id: string } } }).row.r.id;
    const [line] = await demands(id);
    await q("reset role");
    await q("update public.purchase_requests set sent_back_at = now(), sent_back_by = $2, sent_back_reason = 'IT' where id = $1", [id, OP]);
    await as(OP);
    const changed = { ...CONFIG, color: "Ash" };
    const rs = await attempt(
      "select public.purchasing_resubmit_request($1::uuid, $2::uuid, '2026-10-21'::date, null, null, null, null, $3::jsonb, null) as r",
      [id, DEST, JSON.stringify([{ id: line!.id, sku: SKU, qty: 2, attrs: changed }, { sku: SKU, qty: 3, attrs: { color: "Moss" } }])],
    );
    expect(rs.ok, rs.ok ? "" : rs.why).toBe(true);
    const rows = await demands(id);
    expect(rows.find((x) => x.id === line!.id)!.attrs).toEqual(changed);
    expect(rows.find((x) => x.id !== line!.id)!.attrs).toEqual({ color: "Moss" });
    await q("reset role");
    const ev = (await q("select changes from public.purchase_request_events where request_id = $1 and kind = 'resubmitted' order by round desc limit 1", [id])).rows[0] as { changes: Array<{ field: string; sku?: string }> };
    expect(ev.changes.some((c) => c.field === "line_configured" && c.sku === SKU)).toBe(true);
  });
});

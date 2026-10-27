import { describe, it, expect, beforeAll, afterAll } from "vitest";
import pg from "pg";

/**
 * 0718 ON A REAL POSTGRESQL RUNNING THE WHOLE MIGRATION CHAIN.
 *
 *   §1  a Unit that changes Site (any door: Transfer, its Cancel, a correction)
 *       leaves its old Bin, and the lineage says `bin_changed` "moved Site"
 *   §2  the external `warehouse` role cannot put a Unit in a Bin
 *
 * Everything runs inside ONE transaction that is rolled back at the end.
 *
 *   CARRES_TEST_DATABASE_URL=postgres://postgres@localhost:<port>/<db> pnpm --filter @carres/api test -- warehouse-bins-0718
 *
 * Without the URL every case is SKIPPED — reported as skipped, never as passed.
 */
const URL = process.env.CARRES_TEST_DATABASE_URL ?? "";
const LOCAL = /^postgres(ql)?:\/\/[^@/]*@?(localhost|127\.0\.0\.1|\[::1\])(:\d+)?\//.test(URL);
const RUN = Date.now() % 100000;
const HEX = RUN.toString(16).padStart(5, "0");
const uid = (tail: string) => `eeeeeeee-0718-4000-8000-${HEX}${tail.padStart(7, "0")}`;

const U = { operation: uid("1"), warehouse: uid("2") };
const SITE_A = uid("a1");
const SITE_B = uid("b1");
let UNIT = "";

describe.skipIf(!URL)("0718 — Racks and Bins (real PostgreSQL)", () => {
  let db: pg.Client;
  let binId = "";
  const q = (sql: string, params: unknown[] = []) => db.query(sql, params);
  async function attempt(sql: string, params: unknown[] = []): Promise<string> {
    await q("savepoint s");
    try {
      await q(sql, params);
      await q("release savepoint s");
      return "ok";
    } catch (e) {
      await q("rollback to savepoint s");
      return (e as { code?: string; message: string }).code ?? (e as Error).message;
    }
  }
  const as = async (who: string) => {
    await q("reset role");
    await q("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: who, role: "authenticated" })]);
    await q("set local role authenticated");
  };

  beforeAll(async () => {
    if (!LOCAL) throw new Error("CARRES_TEST_DATABASE_URL must point at localhost");
    db = new pg.Client({ connectionString: URL });
    await db.connect();
    await q("begin");
    await q("insert into warehouses (id, name) values ($1, $2), ($3, $4)", [SITE_A, `IT A ${HEX}`, SITE_B, `IT B ${HEX}`]);
    for (const [id, role] of [[U.operation, "operation"], [U.warehouse, "warehouse"]] as const) {
      const email = `it-0718-${role}-${id.slice(-7)}@carres.test`;
      await q("insert into auth.users (id, email) values ($1, $2)", [id, email]);
      await q(
        "insert into app_users (id, email, name, role, status, warehouse_id) values ($1, $2, $3, $4, 'active', $5)",
        [id, email, `IT ${role}`, role, role === "warehouse" ? SITE_A : null],
      );
    }
    UNIT = (await q(
      "insert into ops_stock_items (unit_code, sku, warehouse_id, status) values (public.allocate_unit_id(), 'IT-SKU-0718', $1, 'free') returning unit_code",
      [SITE_A],
    )).rows[0].unit_code;
    await q("insert into warehouse_bins (warehouse_id, rack, bin) values ($1, 'R1', 'B1')", [SITE_A]);
    binId = (await q("select id from warehouse_bins where warehouse_id = $1", [SITE_A])).rows[0].id;
  }, 60_000);

  afterAll(async () => {
    if (db) {
      await q("rollback").catch(() => undefined);
      await db.end();
    }
  });

  it("§2 the warehouse role is refused", async () => {
    await as(U.warehouse);
    expect(await attempt("select public.stock_unit_set_bin($1, $2)", [UNIT, binId])).toBe("42501");
    await q("reset role");
  });

  it("§1 a Site change clears the Bin and writes a 'moved Site' event", async () => {
    await as(U.operation);
    expect(await attempt("select public.stock_unit_set_bin($1, $2)", [UNIT, binId])).toBe("ok");
    await q("reset role");
    expect((await q("select bin_id from ops_stock_items where unit_code = $1", [UNIT])).rows[0].bin_id).toBe(binId);

    await q("update ops_stock_items set warehouse_id = $1 where unit_code = $2", [SITE_B, UNIT]);

    expect((await q("select bin_id from ops_stock_items where unit_code = $1", [UNIT])).rows[0].bin_id).toBeNull();
    const ev = await q(
      "select from_value, to_value, note from stock_unit_events where unit_code = $1 and event = 'bin_changed' order by seq desc limit 1",
      [UNIT],
    );
    expect(ev.rows[0]).toEqual({ from_value: "R1 · B1", to_value: null, note: "moved Site" });
  });
});

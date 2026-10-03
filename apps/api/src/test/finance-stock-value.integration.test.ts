import { describe, it, expect, beforeAll, afterAll } from "vitest";
import pg from "pg";
import { stockValueReport, type StockValueAnswer } from "@carres/shared/stock-value";

/**
 * 0643 ON A REAL POSTGRESQL RUNNING THE WHOLE MIGRATION CHAIN: Finance's
 * PROVISIONAL month-end stock value (Chew 2026-10-03, docs/finance/MASTER.md
 * §3.5). Units are put in every place a Unit can be — a Carres Site, a
 * showroom, a transit point, with a logistics company, on a repair pickup, on
 * a transfer — and the database's groups and costs are read back, today and
 * at an earlier day.
 *
 * One transaction, rolled back at the end. Names are invented.
 *
 *   PG_BIN=<postgres bin> node scripts/dry-run-migrations.mjs --baseline scripts/migration-replay-baseline.json --keep
 *   CARRES_TEST_DATABASE_URL=postgres://postgres@localhost:<port>/<db> pnpm --filter @carres/api test -- finance-stock-value
 *
 * Without the URL every case is SKIPPED — reported as skipped, never as passed.
 */
const URL = process.env.CARRES_TEST_DATABASE_URL ?? "";
const LOCAL = /^postgres(ql)?:\/\/[^@/]*@?(localhost|127\.0\.0\.1|\[::1\])(:\d+)?\//.test(URL);
const RUN = Date.now() % 100000;
const HEX = RUN.toString(16).padStart(5, "0");
const uid = (tail: string) => `eeeeeeee-0000-4000-8000-${HEX}${tail.padStart(7, "0")}`;
const U = { finance: uid("1"), operation: uid("2") };
const code = (n: number) => `U${RUN}-${String(n).padStart(3, "0")}-001`;

describe.skipIf(!URL)("provisional stock value (real PostgreSQL, 0643)", () => {
  let db: pg.Client;
  let today = "";
  let klang = "";
  let showroom = "";
  const AL = "00000000-0000-0000-0000-000000000c04"; // AL Sungai Buloh, a transit point (0509)
  let nets = "";
  let caseId = "";
  const unitIds: Record<number, string> = {};
  const q = (sql: string, params: unknown[] = []) => db.query(sql, params);
  const actAs = (id: string | null) =>
    q("select set_config('request.jwt.claims', $1, false)", [id ? JSON.stringify({ sub: id, role: "authenticated" }) : ""]);
  const valueOn = async (day: string) => {
    await actAs(U.finance);
    return (await q("select public.fin_stock_value($1::date) as v", [day])).rows[0].v as StockValueAnswer;
  };
  const mine = (a: StockValueAnswer) => a.units.filter((u) => u.unit_code.startsWith(`U${RUN}-`));
  const unit = async (n: number, cols: Record<string, unknown>) => {
    const keys = ["unit_code", "sku", "condition", "identity_scope", "qty", ...Object.keys(cols)];
    const vals = [code(n), `IT-SKU-${RUN}`, "new", "unit", 1, ...Object.values(cols)];
    const r = await q(`insert into ops_stock_items (${keys.join(", ")}) values (${keys.map((_, i) => `$${i + 1}`).join(", ")}) returning id`, vals);
    unitIds[n] = r.rows[0].id as string;
    return unitIds[n]!;
  };
  const moved = async (n: number, kind: string, collectedDaysAgo: number) => {
    const sourceId = (await q("select gen_random_uuid() as id")).rows[0].id as string;
    await q(`insert into arrival_sources (id, source_no, kind, case_id, from_site_id, to_site_id, party_id, expected_date, reason, created_by)
             values ($1, $2, $3, $4, $5, $6, $7, current_date + 7, 'IT movement', $8)`,
      [sourceId, `IT-SRC-${RUN}-${n}`, kind, kind === "repair-return" ? caseId : null, klang, kind === "transfer" ? showroom : klang, nets, U.operation]);
    await q("insert into arrival_source_units (source_id, stock_item_id, status_before) values ($1, $2, 'free')", [sourceId, unitIds[n]]);
    await q(`insert into arrival_source_events (source_id, kind, unit_ids, occurred_at, actor_id)
             values ($1, 'collected', array[$2::uuid], now() - make_interval(days => $3), $4)`,
      [sourceId, unitIds[n], collectedDaysAgo, U.operation]);
  };

  beforeAll(async () => {
    if (!LOCAL) throw new Error("CARRES_TEST_DATABASE_URL must point at localhost");
    db = new pg.Client({ connectionString: URL });
    await db.connect();
    await q("begin");
    today = (await q("select timezone('Asia/Kuala_Lumpur', now())::date::text as d")).rows[0].d;
    for (const [id, role] of [[U.finance, "finance"], [U.operation, "operation"]] as const) {
      const email = `it-stock-${role}-${RUN}@carres.test`;
      await q("insert into auth.users (id, email) values ($1, $2)", [id, email]);
      await q("insert into app_users (id, email, name, role, status, is_person) values ($1, $2, $3, $4, 'active', true)", [id, email, `IT ${role}`, role]);
    }
    klang = (await q("insert into warehouses (name, kind) values ($1, 'own') returning id", [`IT Klang ${RUN}`])).rows[0].id;
    showroom = (await q("insert into warehouses (name, kind) values ($1, 'own') returning id", [`IT Showroom ${RUN}`])).rows[0].id;
    nets = (await q("select id from stock_operating_parties where code = 'nets_delivery'")).rows[0].id;
    caseId = (await q("select id from service_cases limit 1")).rows[0].id;

    // A PO line with a price, and one free of charge. The PO doors' own
    // triggers are not the subject here, so the rows are written plainly.
    const supplier = (await q("insert into suppliers (name, kind, slug) values ($1, 'factory_pickup', $2) returning id",
      [`IT stock supplier ${RUN}`, `it-stock-${RUN}`])).rows[0].id;
    await q("set local session_replication_role = replica");
    await q("insert into purchase_orders (id, supplier_id, warehouse_id) values ($1, $2, $3)", [`IT-PO-${RUN}`, supplier, klang]);
    const priced = (await q(`insert into purchase_order_lines (po_id, sku, qty, cost) values ($1, $2, 1, 520.00) returning id`,
      [`IT-PO-${RUN}`, `IT-SKU-${RUN}`])).rows[0].id;
    const free = (await q(`insert into purchase_order_lines (po_id, sku, qty, cost, commercial_treatment, commercial_reason)
                           values ($1, $2, 1, 0, 'free_of_charge', 'IT sample') returning id`,
      [`IT-PO-${RUN}`, `IT-SKU2-${RUN}`])).rows[0].id;
    await q("set local session_replication_role = origin");

    await unit(1, { warehouse_id: klang, status: "free", ownership: "carres_owned", po_line_id: priced, po_no: `IT-PO-${RUN}` });
    await unit(2, { warehouse_id: showroom, status: "free", ownership: "carres_owned" });
    await unit(3, { warehouse_id: AL, status: "reserved", ownership: "carres_owned", po_line_id: free });
    await unit(4, { warehouse_id: klang, status: "reserved", ownership: "carres_owned", holder_party_id: nets });
    await unit(5, { warehouse_id: klang, status: "transferred", ownership: "carres_owned" });
    await moved(5, "repair-return", 1);
    await unit(6, { warehouse_id: klang, status: "transferred", ownership: "carres_owned" });
    await moved(6, "transfer", 1);
    await unit(7, { warehouse_id: klang, status: "free", ownership: "supplier_consignment", supplier: "IT consignor" });
    await unit(8, { warehouse_id: klang, status: "incoming", ownership: "carres_owned" });
    // Changes recorded after the end of today: read back to how they stood.
    await unit(9, { warehouse_id: klang, status: "sold", ownership: "carres_owned" });
    await unit(10, { warehouse_id: showroom, status: "free", ownership: "carres_owned" });
    const later = "(($1::date + 1)::timestamp at time zone 'Asia/Kuala_Lumpur') + interval '1 hour'";
    await q(`insert into stock_unit_events (unit_id, unit_code, event, from_value, to_value, event_at)
             values ($2, $3, 'status_changed', 'reserved', 'sold', ${later})`, [today, unitIds[9], code(9)]);
    await q(`insert into stock_unit_events (unit_id, unit_code, event, from_value, to_value, event_at)
             values ($2, $3, 'site_changed', $4, $5, ${later})`, [today, unitIds[10], code(10), klang, showroom]);
  }, 30000);

  afterAll(async () => {
    if (!db) return;
    await q("rollback").catch(() => undefined);
    await db.end();
  });

  it("is Finance's only", async () => {
    await actAs(U.operation);
    await q("savepoint s");
    await expect(q("select public.fin_stock_value(current_date)")).rejects.toMatchObject({ code: "42501" });
    await q("rollback to savepoint s");
  });

  it("puts each Unit Carres held today in its group, and costs it from its PO line", async () => {
    const a = await valueOn(today);
    expect(a.provisional).toBe(true);
    const by = Object.fromEntries(mine(a).map((u) => [u.unit_code, [u.bucket, u.status, u.unit_cost === null ? null : Number(u.unit_cost)]]));
    expect(by).toEqual({
      [code(1)]: ["warehouse", "free", 520],
      [code(2)]: ["showroom", "free", null],       // no PO line: no cost recorded
      [code(3)]: ["transit", "reserved", 0],       // a transit point; free of charge costs nothing
      [code(4)]: ["transit", "reserved", null],    // held by a logistics company
      [code(5)]: ["repair", "transferred", null],  // collected for repair
      [code(6)]: ["transit", "transferred", null], // collected on a transfer
      [code(9)]: ["warehouse", "reserved", null],  // sold only after the day ended
      [code(10)]: ["warehouse", "free", null],     // moved to the showroom only after the day ended
    });
    // Consignment is counted, never valued; incoming is not yet Carres's stock.
    expect(mine(a).some((u) => u.unit_code === code(7) || u.unit_code === code(8))).toBe(false);
    expect(a.left_out.consignment_units).toBeGreaterThanOrEqual(1);
  });

  it("adds up through the shared arithmetic, and a Unit with no cost is counted apart", async () => {
    const a = await valueOn(today);
    const r = stockValueReport({ ...a, units: mine(a) });
    expect(r.total).toMatchObject({ units: 8, qty: 8, value: 52000 });
    expect(r.total.noCost).toBe(6);
    expect(r.buckets.find((b) => b.bucket === "repair")).toMatchObject({ units: 1, noCost: 1 });
  });

  it("a Unit that did not exist yet at the end of an earlier day is not there", async () => {
    const yesterday = (await q("select ($1::date - 1)::text as d", [today])).rows[0].d as string;
    expect(mine(await valueOn(yesterday))).toEqual([]);
  });
});

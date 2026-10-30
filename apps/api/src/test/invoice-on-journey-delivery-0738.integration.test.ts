import { describe, it, expect, beforeAll, afterAll } from "vitest";
import pg from "pg";

/**
 * 0738 ON A REAL POSTGRESQL — a Journey delivery raises the Sales Invoice.
 *
 * SO-1375 (production, 2026-10-30) was delivered through the Journey handover
 * (`received_by_logistics`), went straight to 'delivered', and never passed the
 * 'dispatched' stage the invoice trigger waited for: no Sales Invoice, so AR
 * never saw it. This file fails on a replay stopped before 0738 and passes after.
 *
 *   CARRES_TEST_DATABASE_URL=postgres://postgres@localhost:<port>/<db> pnpm --filter @carres/api test -- invoice-on-journey-delivery-0738
 *
 * Without the URL every case is SKIPPED — reported as skipped, never as passed.
 */
const URL = process.env.CARRES_TEST_DATABASE_URL ?? "";
const LOCAL = /^postgres(ql)?:\/\/[^@/]*@?(localhost|127\.0\.0\.1|\[::1\])(:\d+)?\//.test(URL);
const RUN = Date.now() % 100000;
const HEX = RUN.toString(16).padStart(5, "0");
const uid = (tail: string) => `fffffff8-0738-4000-8000-${HEX}${tail.padStart(7, "0")}`;

const OP = uid("2");
const DEALER = uid("4");
const KLANG = uid("61");
const ORDER = uid("a1");
const DO_ID = uid("d1");
const DO_NO = `DOIT${HEX}S`.toUpperCase();
const UNIT = uid("b1");

describe.skipIf(!URL)("A Journey delivery raises one Sales Invoice (real PostgreSQL, 0738)", () => {
  let db: pg.Client;
  const q = (sql: string, params: unknown[] = []) => db.query(sql, params);
  const as = async (who: string) => {
    await q("reset role");
    await q("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: who, role: "authenticated" })]);
    await q("set local role authenticated");
  };
  const invoices = async () => {
    await q("reset role");
    return (await q("select invoice_no, amount::text, status from invoices where order_id = $1 and kind = 'sales'", [ORDER])).rows;
  };

  beforeAll(async () => {
    if (!LOCAL) throw new Error("CARRES_TEST_DATABASE_URL must point at localhost");
    db = new pg.Client({ connectionString: URL });
    await db.connect();
    await q("begin");
    await q("set local session_replication_role = replica");
    const email = `it-0738-${RUN}@carres.test`;
    await q("insert into auth.users (id, email) values ($1, $2)", [OP, email]);
    await q("insert into app_users (id, email, name, role, status, is_person) values ($1, $2, 'IT operation', 'operation', 'active', true)", [OP, email]);
    await q("insert into dealers (id, name) values ($1, $2)", [DEALER, `IT dealer ${HEX}`]);
    await q("insert into warehouses (id, name, kind) values ($1, $2, 'own')", [KLANG, `IT Klang ${HEX}`]);
    await q(
      "insert into orders (id, status, operation_stage, dealer_id, customer_name, customer_phone, warehouse_id, salesperson_id, so) values ($1, 'proceed_order', 'ready_to_dispatch', $2, 'IT customer', '0100000000', $3, (select id from salespersons order by id limit 1), (select coalesce(max(so), 0) + 1 from orders))",
      [ORDER, DEALER, KLANG],
    );
    // 2 x 900 + one add-on 224 = 2024.00, SO-1375's total.
    await q("insert into order_lines (id, order_id, sku, qty, unit_price) values ($1, $2, 'IT-SI', 2, 900)", [uid("e1"), ORDER]);
    await q("insert into order_addons (order_id, addon_key, qty, unit_price) values ($1, (select key from addons order by key limit 1), 1, 224)", [ORDER]);
    await q("insert into ops_delivery_orders (id, order_id, do_number) values ($1, $2, $3)", [DO_ID, ORDER, DO_NO]);
    const so = (await q("select so from orders where id = $1", [ORDER])).rows[0].so;
    await q(
      "insert into ops_stock_items (id, unit_code, sku, warehouse_id, status, reserved_ref, qty) values ($1, $2, 'IT-SI', $3, 'reserved', $4, 1)",
      [UNIT, `U8${RUN}-738-001`, KLANG, `SO-${so}`],
    );
    await q("insert into delivery_order_units (delivery_order_id, item_id) values ($1, $2)", [DO_ID, UNIT]);
    // The Journey handover: Logistics received the goods. The order never passes 'dispatched'.
    await q("insert into delivery_handover_events (delivery_order_id, kind, duty, recorded_by) values ($1, 'received_by_logistics', 'logistics', $2)", [DO_ID, OP]);
    await q("set local session_replication_role = origin");
  });

  afterAll(async () => {
    if (!db) return;
    await q("rollback");
    await db.end();
  });

  it("delivering raises exactly one Sales Invoice for the order total, and the order wears it", async () => {
    await as(OP);
    await q("select public.delivery_load_scan($1)", [DO_NO]);
    const inv = await invoices();
    expect(inv).toHaveLength(1);
    expect(inv[0]).toMatchObject({ amount: "2024.00", status: "issued" });
    expect(inv[0].invoice_no).toMatch(/^INV-\d{6}-\d{4}$/);
    const o = (await q("select operation_stage, invoice_no, do_number from orders where id = $1", [ORDER])).rows[0];
    expect(o).toMatchObject({ operation_stage: "delivered", invoice_no: inv[0].invoice_no, do_number: DO_NO });
    const h = (await q("select text from order_history where order_id = $1", [ORDER])).rows.map((x) => x.text as string);
    expect(h.some((t) => t.includes("auto-issued on delivery") && t.includes(inv[0].invoice_no))).toBe(true);
    // The delivery door stamped its own DO number: no "assigned on dispatch" line.
    expect(h.some((t) => t.includes("DO number assigned on dispatch"))).toBe(false);
    // Revenue is posted in the same transaction, like every invoice door (0476).
    const gl = (await q("select count(*)::int n from gl_entries where source_type = 'SALES_INVOICE' and source_doc_no = $1 and posted", [inv[0].invoice_no])).rows[0].n;
    expect(gl).toBe(1);
  });

  it("a later update raises no second invoice", async () => {
    const before = await invoices();
    await q("update orders set do_note = 'later edit', updated_at = now() where id = $1", [ORDER]);
    await as(OP);
    await q("select public.delivery_load_scan($1)", [DO_NO]);
    expect(await invoices()).toEqual(before);
  });
});

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import pg from "pg";

/**
 * 0719 ON A REAL POSTGRESQL — Weisiang's decision (Mr Lim, WhatsApp
 * 2026-10-22): office staff send goods to customers on consignment and take
 * unsold goods back, the Houzs way. Jess was not part of this decision.
 *
 *   order   Customer Consignment Order records the customer and Units; the
 *           Units stay in stock until the Note goes out
 *   note    Consignment Note (from the order, or blank) sends the Units to the
 *           customer: reserved to the Note number, still Carres-owned
 *   sold    a Unit sold at the customer turns `sold` against a Sales Order,
 *           where the payment is recorded
 *   return  Customer Consignment Return brings unsold Units back into stock
 *
 *   CARRES_TEST_DATABASE_URL=postgres://postgres@localhost:<port>/<db> pnpm --filter @carres/api test -- customer-consignment-0719
 *
 * Without the URL every case is SKIPPED — reported as skipped, never as passed.
 */
const URL = process.env.CARRES_TEST_DATABASE_URL ?? "";
const LOCAL = /^postgres(ql)?:\/\/[^@/]*@?(localhost|127\.0\.0\.1|\[::1\])(:\d+)?\//.test(URL);
const RUN = Date.now() % 100000;
const HEX = RUN.toString(16).padStart(5, "0");
const uid = (tail: string) => `fffffff9-0000-4000-8000-${HEX}${tail.padStart(7, "0")}`;

const OP = uid("2");
const DEALER_USER = uid("4");
const DEALER = uid("5");
const ORDER = uid("6");
const KLANG = uid("61");
const PJ = uid("62");
const U = { a: uid("b1"), b: uid("b2"), c: uid("b3"), reserved: uid("b4"), supplier: uid("b5") };
const code = (key: keyof typeof U) => `U8${RUN}-${String(Object.keys(U).indexOf(key) + 100)}-001`;
const SKU = `IT-CS-${HEX}`;
const SO = 900000 + (RUN % 90000);

type Result = { ok: true; r: Record<string, unknown> } | { ok: false; why: string; detail: string };

describe.skipIf(!URL)("Customer consignment out and back on Units (real PostgreSQL, 0719)", () => {
  let db: pg.Client;
  const q = (sql: string, params: unknown[] = []) => db.query(sql, params);
  async function attempt(sql: string, params: unknown[] = []): Promise<Result> {
    await q("savepoint s");
    try {
      const res = await q(sql, params);
      await q("release savepoint s");
      return { ok: true, r: (res.rows[0]?.r ?? {}) as Record<string, unknown> };
    } catch (e) {
      await q("rollback to savepoint s");
      const err = e as { message: string; detail?: string };
      return { ok: false, why: err.message, detail: err.detail ?? "" };
    }
  }
  const as = async (who: string) => {
    await q("reset role");
    await q("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: who, role: "authenticated" })]);
    await q("set local role authenticated");
  };
  const unit = async (key: keyof typeof U) => {
    await q("reset role");
    return (await q("select status, reserved_ref, warehouse_id, sold_order_id from ops_stock_items where id = $1", [U[key]])).rows[0];
  };

  beforeAll(async () => {
    if (!LOCAL) throw new Error("CARRES_TEST_DATABASE_URL must point at localhost");
    db = new pg.Client({ connectionString: URL });
    await db.connect();
    await q("begin");
    await q("set local session_replication_role = replica");
    for (const [id, role] of [[OP, "operation"], [DEALER_USER, "dealer"]] as const) {
      const email = `it-0719-${id.slice(-7)}-${RUN}@carres.test`;
      await q("insert into auth.users (id, email) values ($1, $2)", [id, email]);
      await q("insert into app_users (id, email, name, role, status, is_person) values ($1, $2, $3, $4, 'active', true)", [id, email, `IT ${role}`, role]);
    }
    await q("insert into dealers (id, name) values ($1, $2)", [DEALER, `IT Dealer ${HEX}`]);
    await q("insert into orders (id, so, dealer_id, customer_name, customer_phone, source_system) values ($1, $2, $3, 'IT buyer', '0100000000', 'autocount')", [ORDER, SO, DEALER]);
    await q("insert into warehouses (id, name, kind) values ($1, $2, 'own'), ($3, $4, 'own')", [KLANG, `IT Klang ${HEX}`, PJ, `IT PJ ${HEX}`]);
    for (const key of Object.keys(U) as (keyof typeof U)[]) {
      await q(
        "insert into ops_stock_items (id, unit_code, sku, warehouse_id, status, reserved_ref, qty, ownership, supplier) values ($1, $2, $3, $4, $5, $6, 1, $7, $8)",
        [U[key], code(key), SKU, KLANG, key === "reserved" ? "reserved" : "free", key === "reserved" ? "SO2610-0001" : null,
         key === "supplier" ? "supplier_consignment" : "carres_owned", key === "supplier" ? "IT Supplier" : null],
      );
    }
    await q("set local session_replication_role = origin");
  });

  afterAll(async () => {
    if (!db) return;
    await q("rollback");
    await db.end();
  });

  it("refuses anyone but office staff", async () => {
    await as(DEALER_USER);
    const r = await attempt("select public.consignment_note_create(null, $1, '{}'::jsonb, $2) as r", [DEALER, [U.a]]);
    expect(r).toMatchObject({ ok: false, detail: "forbidden" });
  });

  it("Customer Consignment Order records the dealer and Units; the Units stay in stock", async () => {
    await as(OP);
    const r = await attempt("select public.customer_consignment_order_create($1, '{}'::jsonb, $2, null) as r", [DEALER, [U.a, U.b]]);
    expect(r.ok).toBe(true);
    const o = (r as unknown as { r: { orderNo: string } }).r;
    expect(o.orderNo).toMatch(/^CCO-\d{8}-\d{4}$/);
    expect((await q("select customer_name from customer_consignment_orders where order_no = $1", [o.orderNo])).rows[0].customer_name).toBe(`IT Dealer ${HEX}`);
    expect((await unit("a")).status).toBe("free");
  });

  it("refuses a reserved Unit and a supplier's Unit by name", async () => {
    await as(OP);
    const reserved = await attempt("select public.customer_consignment_order_create(null, $1::jsonb, $2) as r", [JSON.stringify({ name: "Tan" }), [U.reserved]]);
    expect(reserved).toMatchObject({ ok: false, detail: "unit_not_sendable" });
    expect((reserved as { why: string }).why).toContain("reserved for SO2610-0001");
    await as(OP);
    const supplier = await attempt("select public.consignment_note_create(null, null, $1::jsonb, $2) as r", [JSON.stringify({ name: "Tan" }), [U.supplier]]);
    expect((supplier as { why: string }).why).toContain("belongs to its supplier");
    await as(OP);
    const nobody = await attempt("select public.consignment_note_create(null, null, '{}'::jsonb, $1) as r", [[U.a]]);
    expect(nobody).toMatchObject({ ok: false, detail: "customer_required" });
  });

  it("Consignment Note from the order sends its Units out; a Unit not on the order is refused", async () => {
    await as(OP);
    const orderId = (await q("select o.id from customer_consignment_orders o join customer_consignment_order_units u on u.order_id = o.id where u.unit_id = $1", [U.a])).rows[0].id;
    await as(OP);
    const stray = await attempt("select public.consignment_note_create($1, null, null, $2) as r", [orderId, [U.c]]);
    expect(stray).toMatchObject({ ok: false, detail: "unit_not_on_order" });
    await as(OP);
    const r = await attempt("select public.consignment_note_create($1, null, null, $2) as r", [orderId, [U.a, U.b]]);
    expect(r.ok).toBe(true);
    const n = (r as unknown as { r: { noteNo: string } }).r;
    expect(n.noteNo).toMatch(/^CSN-\d{8}-\d{4}$/);
    expect(await unit("a")).toMatchObject({ status: "reserved", reserved_ref: n.noteNo });
    // Sent once; a second Note for the same Unit is refused.
    await as(OP);
    const again = await attempt("select public.consignment_note_create($1, null, null, $2) as r", [orderId, [U.a]]);
    expect(again).toMatchObject({ ok: false, detail: "unit_not_sendable" });
  });

  it("a blank Consignment Note sends free Units to a typed customer", async () => {
    await as(OP);
    const r = await attempt("select public.consignment_note_create(null, null, $1::jsonb, $2) as r", [JSON.stringify({ name: "Puan Aini", phone: "012" }), [U.c]]);
    expect(r.ok).toBe(true);
    expect((await unit("c")).status).toBe("reserved");
  });

  it("a Unit sold at the customer turns sold against the Sales Order that takes the payment", async () => {
    await as(OP);
    const notOut = await attempt("select public.consignment_note_mark_sold($1, $2) as r", [[U.reserved], SO]);
    expect(notOut).toMatchObject({ ok: false, detail: "unit_not_on_consignment" });
    await as(OP);
    const noSo = await attempt("select public.consignment_note_mark_sold($1, $2) as r", [[U.a], 1]);
    expect(noSo).toMatchObject({ ok: false, detail: "order_not_found" });
    // A cancelled Sales Order cannot take the payment, so it cannot take the Unit.
    await q("reset role");
    await q("set local session_replication_role = replica");
    const was = (await q("select status from orders where id = $1", [ORDER])).rows[0].status;
    await q("update orders set status = 'cancelled' where id = $1", [ORDER]);
    await as(OP);
    const cancelled = await attempt("select public.consignment_note_mark_sold($1, $2) as r", [[U.a], SO]);
    expect(cancelled).toMatchObject({ ok: false, detail: "order_cancelled" });
    await q("reset role");
    await q("update orders set status = $2 where id = $1", [ORDER, was]);
    await q("set local session_replication_role = origin");
    await as(OP);
    const r = await attempt("select public.consignment_note_mark_sold($1, $2) as r", [[U.a], SO]);
    expect(r.ok).toBe(true);
    expect(await unit("a")).toMatchObject({ status: "sold", sold_order_id: ORDER, reserved_ref: `SO-${SO}` });
  });

  it("Customer Consignment Return brings unsold Units back to the chosen Site, with no money posted", async () => {
    await as(OP);
    const sold = await attempt("select public.customer_consignment_return_create($1, $2) as r", [PJ, [U.a]]);
    expect(sold).toMatchObject({ ok: false, detail: "unit_not_on_consignment" });
    await as(OP);
    const r = await attempt("select public.customer_consignment_return_create($1, $2, 'Not sold') as r", [PJ, [U.b, U.c]]);
    expect(r.ok).toBe(true);
    const ret = (r as unknown as { r: { returnNo: string } }).r;
    expect(ret.returnNo).toMatch(/^CCR-\d{8}-\d{4}$/);
    expect(await unit("b")).toMatchObject({ status: "free", reserved_ref: null, warehouse_id: PJ });
    expect((await q("select count(*)::int as n from order_payments where order_id = $1", [ORDER])).rows[0].n).toBe(0);
    // 0366's lineage records the trip out and back.
    const ev = (await q("select to_value from stock_unit_events where unit_id = $1 and event = 'status_changed' order by seq", [U.b])).rows;
    expect(ev.map((e) => e.to_value)).toEqual(["reserved", "free"]);
  });
});

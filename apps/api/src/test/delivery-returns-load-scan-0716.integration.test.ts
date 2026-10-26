import { describe, it, expect, beforeAll, afterAll } from "vitest";
import pg from "pg";

/**
 * 0716 ON A REAL POSTGRESQL — Weisiang's decision (Mr Lim, WhatsApp
 * 2026-10-22): office staff record Delivery Returns and mark DOs Delivered by
 * load scan, the Houzs way. Jess was not part of this decision.
 *
 *   load scan   a DO No or a Unit ID marks the DO Delivered with no signed DO
 *               and no photo; a repeat scan writes nothing; goods still with
 *               the warehouse are refused
 *   return      picked Units of a delivered DO go back to stock (`free`) at the
 *               chosen Site; Refund status is a status only
 *   claim       a returned Unit may be required by another order's DO
 *
 *   CARRES_TEST_DATABASE_URL=postgres://postgres@localhost:<port>/<db> pnpm --filter @carres/api test -- delivery-returns-load-scan-0716
 *
 * Without the URL every case is SKIPPED — reported as skipped, never as passed.
 */
const URL = process.env.CARRES_TEST_DATABASE_URL ?? "";
const LOCAL = /^postgres(ql)?:\/\/[^@/]*@?(localhost|127\.0\.0\.1|\[::1\])(:\d+)?\//.test(URL);
const RUN = Date.now() % 100000;
const HEX = RUN.toString(16).padStart(5, "0");
const uid = (tail: string) => `fffffff8-0000-4000-8000-${HEX}${tail.padStart(7, "0")}`;

const OP = uid("2");
const DEALER_USER = uid("3");
const DEALER = uid("4");
const KLANG = uid("61");
const PJ = uid("62");
const ORDER_A = uid("a1");
const ORDER_B = uid("a2");
const DO_A = uid("d1");
const DO_B = uid("d2");
const DO_A2 = uid("d3");
// Old DOs (before 0424): C has no Unit list at all, D has only its attempt Units (0344).
const ORDER_C = uid("a3");
const ORDER_D = uid("a4");
const DO_C = uid("d4");
const DO_D = uid("d5");
const LINE_C = uid("e1");
const ATTEMPT_D = uid("f1");
const DO_A_NO = `DOIT${HEX}A`.toUpperCase();
const DO_B_NO = `DOIT${HEX}B`.toUpperCase();
const DO_A2_NO = `DOIT${HEX}C`.toUpperCase();
const DO_C_NO = `DOIT${HEX}D`.toUpperCase();
const DO_D_NO = `DOIT${HEX}E`.toUpperCase();
const U = { a1: uid("b1"), a2: uid("b2"), b1: uid("b3"), a3: uid("b4"), c1: uid("b5"), c2: uid("b6"), d1: uid("b7") };
const code = (k: keyof typeof U) => `U8${RUN}-${100 + Object.keys(U).indexOf(k)}-001`;

type Result = { ok: true; r: Record<string, unknown> } | { ok: false; why: string; detail: string };

describe.skipIf(!URL)("Delivery Returns and Load scan (real PostgreSQL, 0716)", () => {
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
  const unit = async (k: keyof typeof U) => {
    await q("reset role");
    return (await q("select status, warehouse_id, holder_party_id from ops_stock_items where id = $1", [U[k]])).rows[0];
  };

  beforeAll(async () => {
    if (!LOCAL) throw new Error("CARRES_TEST_DATABASE_URL must point at localhost");
    db = new pg.Client({ connectionString: URL });
    await db.connect();
    await q("begin");
    await q("set local session_replication_role = replica");
    for (const [id, role] of [[OP, "operation"], [DEALER_USER, "dealer"]] as const) {
      const email = `it-0716-${id.slice(-7)}-${RUN}@carres.test`;
      await q("insert into auth.users (id, email) values ($1, $2)", [id, email]);
      await q("insert into app_users (id, email, name, role, status, is_person) values ($1, $2, $3, $4, 'active', true)", [id, email, `IT ${role}`, role]);
    }
    await q("insert into dealers (id, name) values ($1, $2)", [DEALER, `IT dealer ${HEX}`]);
    await q("insert into warehouses (id, name, kind) values ($1, $2, 'own'), ($3, $4, 'own')", [KLANG, `IT Klang ${HEX}`, PJ, `IT PJ ${HEX}`]);
    for (const [order, doId, doNo] of [[ORDER_A, DO_A, DO_A_NO], [ORDER_B, DO_B, DO_B_NO]] as const) {
      await q(
        "insert into orders (id, status, dealer_id, customer_name, customer_phone, warehouse_id, source_system) values ($1, 'proceed_order', $2, 'IT customer', '0100000000', $3, 'autocount')",
        [order, DEALER, KLANG],
      );
      await q("insert into ops_delivery_orders (id, order_id, do_number) values ($1, $2, $3)", [doId, order, doNo]);
    }
    const so = async (order: string) => `SO-${(await q("select so from orders where id = $1", [order])).rows[0].so}`;
    // A split delivery (0542): the second trip has its own live DO.
    await q("insert into ops_delivery_orders (id, order_id, do_number, trip) values ($1, $2, $3, 2)", [DO_A2, ORDER_A, DO_A2_NO]);
    const soA = await so(ORDER_A);
    const soB = await so(ORDER_B);
    for (const [k, doId, ref] of [["a1", DO_A, soA], ["a2", DO_A, soA], ["b1", DO_B, soB], ["a3", DO_A2, soA]] as const) {
      await q(
        "insert into ops_stock_items (id, unit_code, sku, warehouse_id, status, reserved_ref, qty) values ($1, $2, 'IT-DR', $3, 'reserved', $4, 1)",
        [U[k], code(k), KLANG, ref],
      );
      await q("insert into delivery_order_units (delivery_order_id, item_id) values ($1, $2)", [doId, U[k]]);
    }
    // DO A's goods are out with Logistics; DO B's are still at the warehouse.
    await q("insert into delivery_handover_events (delivery_order_id, kind, duty, recorded_by) values ($1, 'received_by_logistics', 'logistics', $2)", [DO_A, OP]);
    // Order A's second DO is out too (YH 2026-10-26: the scan checks the DO, not the order).
    await q("insert into delivery_handover_events (delivery_order_id, kind, duty, recorded_by) values ($1, 'received_by_logistics', 'logistics', $2)", [DO_A2, OP]);
    await q("update ops_stock_items set holder_party_id = (select id from stock_operating_parties where kind = 'delivery_operator' limit 1) where id = $1", [U.a1]);
    for (const [order, doId, doNo] of [[ORDER_C, DO_C, DO_C_NO], [ORDER_D, DO_D, DO_D_NO]] as const) {
      await q(
        "insert into orders (id, status, dealer_id, customer_name, customer_phone, warehouse_id, source_system) values ($1, 'delivered', $2, 'IT customer', '0100000000', $3, 'autocount')",
        [order, DEALER, KLANG],
      );
      await q("insert into ops_delivery_orders (id, order_id, do_number) values ($1, $2, $3)", [doId, order, doNo]);
    }
    await q("insert into order_lines (id, order_id, sku, qty, unit_price) values ($1, $2, 'IT-DL', 2, 150)", [LINE_C, ORDER_C]);
    await q("insert into order_lines (id, order_id, sku, qty, unit_price) values ($1, $2, 'IT-DR', 3, 99.5)", [uid("e2"), ORDER_A]);
    await q("update ops_stock_items set reserved_order_line_id = $1 where id = $2", [uid("e2"), U.a1]);
    for (const [k, order] of [["c1", ORDER_C], ["c2", ORDER_C], ["d1", ORDER_D]] as const) {
      await q(
        "insert into ops_stock_items (id, unit_code, sku, warehouse_id, status, sold_order_id, sold_at, qty) values ($1, $2, 'IT-DL', $3, 'sold', $4, now(), 1)",
        [U[k], code(k), KLANG, order],
      );
    }
    await q("insert into delivery_attempts (id, order_id, attempt_no, result, do_number, leg) values ($1, $2, 1, 'delivered', $3, 0)", [ATTEMPT_D, ORDER_D, DO_D_NO]);
    await q("insert into delivery_attempt_units (attempt_id, item_id, outcome) values ($1, $2, 'delivered')", [ATTEMPT_D, U.d1]);
    await q("set local session_replication_role = origin");
  });

  afterAll(async () => {
    if (!db) return;
    await q("rollback");
    await db.end();
  });

  it("refuses anyone but office staff", async () => {
    await as(DEALER_USER);
    expect(await attempt("select public.delivery_load_scan($1) as r", [DO_A_NO])).toMatchObject({ ok: false, detail: "forbidden" });
  });

  it("the signed-DO door still asks for the signature", async () => {
    await as(OP);
    const r = await attempt("select public.operation_attach_do_and_deliver($1, $2, null, false, 'x.pdf') as r", [ORDER_A, DO_A_NO]);
    expect(r).toMatchObject({ ok: false, detail: "do_required" });
  });

  it("an unknown code and goods still at the warehouse are refused", async () => {
    await as(OP);
    expect(await attempt("select public.delivery_load_scan('NOPE-0000') as r")).toMatchObject({ ok: false, detail: "scan_not_found" });
    const b = await attempt("select public.delivery_load_scan($1) as r", [DO_B_NO]);
    expect(b).toMatchObject({ ok: false });
    expect((b as { why: string }).why).toMatch(/not out with logistics/);
  });

  it("scanning a Unit ID marks its DO Delivered with no signature or photo", async () => {
    await as(OP);
    const r = await attempt("select public.delivery_load_scan($1) as r", [code("a1").toLowerCase()]);
    expect(r).toMatchObject({ ok: true, r: { status: "delivered", units_sold: 2, already: false, do_file_path: null } });
    await q("reset role");
    const o = (await q("select status, do_file_path, pod_signed_at from orders where id = $1", [ORDER_A])).rows[0];
    expect(o).toMatchObject({ status: "delivered", do_file_path: null, pod_signed_at: null });
    expect(await unit("a1")).toMatchObject({ status: "sold" });
    const h = (await q("select text from order_history where order_id = $1", [ORDER_A])).rows.map((x) => x.text);
    expect(h.some((t: string) => t.includes("by load scan") && t.includes("no signature or photo"))).toBe(true);
  });

  it("a repeat scan writes nothing", async () => {
    await as(OP);
    const r = await attempt("select public.delivery_load_scan($1) as r", [DO_A_NO]);
    expect(r).toMatchObject({ ok: true, r: { already: true, do_number: DO_A_NO } });
    await q("reset role");
    expect((await q("select count(*)::int n from delivery_attempts where order_id = $1", [ORDER_A])).rows[0].n).toBe(1);
  });

  it("a second DO of a Delivered order still sells its own Units, once", async () => {
    await as(OP);
    expect(await unit("a3")).toMatchObject({ status: "reserved" });
    await as(OP);
    const r = await attempt("select public.delivery_load_scan($1) as r", [DO_A2_NO]);
    expect(r).toMatchObject({ ok: true, r: { already: false, units_sold: 1, do_number: DO_A2_NO } });
    expect(await unit("a3")).toMatchObject({ status: "sold" });
    await as(OP);
    expect(await attempt("select public.delivery_load_scan($1) as r", [DO_A2_NO])).toMatchObject({ ok: true, r: { already: true } });
    await q("reset role");
    expect((await q("select count(*)::int n from delivery_attempts where order_id = $1", [ORDER_A])).rows[0].n).toBe(2);
  });

  it("a Delivery Return puts the picked Unit back in stock at the chosen Site, Refund status Pending", async () => {
    await as(OP);
    expect(await attempt("select public.delivery_return_record($1, $2, $3, ' ') as r", [DO_A, [U.a1], PJ])).toMatchObject({ ok: false, detail: "reason_required" });
    expect(await attempt("select public.delivery_return_record($1, $2, $3, 'x') as r", [DO_A, [U.b1], PJ])).toMatchObject({ ok: false, detail: "unit_not_on_do" });
    const r = await attempt("select public.delivery_return_record($1, $2, $3, 'Customer changed mind', $4::jsonb) as r",
      [DO_A, [U.a1], PJ, JSON.stringify({ [U.a1]: "DAMAGED" })]);
    expect(r.ok).toBe(true);
    const out = (r as unknown as { r: { returnNo: string; units: number; id: string } }).r;
    expect(out.returnNo).toMatch(/^DR-\d{8}-\d{4}$/);
    expect(out.units).toBe(1);
    expect(await unit("a1")).toMatchObject({ status: "free", warehouse_id: PJ, holder_party_id: null });
    expect(await unit("a2")).toMatchObject({ status: "sold" });
    expect((await q("select refund_status from delivery_returns where id = $1", [out.id])).rows[0].refund_status).toBe("pending");
    // Houzs line fields (Houzs delivery-returns.ts:733-760, 950-957): the order line's
    // unit price, refund = price, the picked condition, received when recorded.
    expect((await q("select unit_price::text, refund::text, condition from delivery_return_units where return_id = $1", [out.id])).rows[0])
      .toEqual({ unit_price: "99.50", refund: "99.50", condition: "DAMAGED" });
    expect((await q("select received_at is not null as ok from delivery_returns where id = $1", [out.id])).rows[0].ok).toBe(true);
    await as(OP);
    expect(await attempt("select public.delivery_return_record($1, $2, $3, 'again') as r", [DO_A, [U.a1], PJ])).toMatchObject({ ok: false, detail: "unit_not_delivered" });
    expect(await attempt("select public.delivery_return_set_refund_status($1, 'refunded') as r", [out.id])).toMatchObject({ ok: true, r: { refundStatus: "refunded" } });
    expect(await attempt("select public.delivery_return_set_refund_status($1, 'paid') as r", [out.id])).toMatchObject({ ok: false, detail: "bad_refund_status" });
  });

  // YH (2026-10-26): a DO with no Unit list returns by DO line and qty, the Houzs way
  // (Houzs DeliveryReturnFromDo.tsx:8-17), capped at delivered minus already returned.
  it("an old DO with no Unit list returns by line and qty, capped at what is left", async () => {
    const lines = (qty: number) => JSON.stringify([{ orderLineId: LINE_C, qty }]);
    const rec = (doId: string, qty: number) =>
      attempt("select public.delivery_return_record_lines($1, $2::jsonb, $3, 'Customer changed mind') as r", [doId, lines(qty), PJ]);
    await as(OP);
    expect(await rec(DO_C, 3)).toMatchObject({ ok: false, detail: "qty_over_remaining" });
    await as(OP);
    expect(await rec(DO_C, 1)).toMatchObject({ ok: true, r: { units: 1 } });
    await q("reset role");
    // No condition picked = NEW (Houzs delivery-returns.ts:1407); refund = qty x unit price.
    expect((await q("select unit_price::text, refund::text, condition from delivery_return_lines where order_line_id = $1", [LINE_C])).rows)
      .toEqual([{ unit_price: "150.00", refund: "150.00", condition: "NEW" }]);
    const free = (await q("select count(*)::int n from ops_stock_items where id = any($1) and status = 'free' and warehouse_id = $2", [[U.c1, U.c2], PJ])).rows[0].n;
    expect(free).toBe(1);
    await as(OP);
    expect(await rec(DO_C, 2)).toMatchObject({ ok: false, detail: "qty_over_remaining" });
    await as(OP);
    expect(await rec(DO_C, 1)).toMatchObject({ ok: true });
    await as(OP);
    expect(await rec(DO_C, 1)).toMatchObject({ ok: false, detail: "qty_over_remaining" });
  });

  it("a split-trip or second Unit-less DO cannot return by line (0356 trip_groups)", async () => {
    await q("reset role");
    await q("update ops_delivery_orders set trip_groups = '{g1}' where id = $1", [DO_C]);
    await as(OP);
    const lines = JSON.stringify([{ orderLineId: LINE_C, qty: 1 }]);
    expect(await attempt("select public.delivery_return_record_lines($1, $2::jsonb, $3, 'x') as r", [DO_C, lines, PJ])).toMatchObject({ ok: false, detail: "do_not_whole_order" });
    await q("reset role");
    await q("update ops_delivery_orders set trip_groups = null where id = $1", [DO_C]);
    await q("set local session_replication_role = replica");
    await q("insert into ops_delivery_orders (id, order_id, do_number, trip) values ($1, $2, $3, 1)", [uid("d6"), ORDER_C, `DOIT${HEX}F`.toUpperCase()]);
    await as(OP);
    expect(await attempt("select public.delivery_return_record_lines($1, $2::jsonb, $3, 'x') as r", [DO_C, lines, PJ])).toMatchObject({ ok: false, detail: "do_not_whole_order" });
    await q("reset role");
    await q("update ops_delivery_orders set voided_at = now(), void_reason = 'rescheduled' where id = $1", [uid("d6")]);
    await q("set local session_replication_role = origin");
  });

  it("a DO with exact Units refuses the line path; attempt Units (0344) return by Unit", async () => {
    await as(OP);
    const lines = JSON.stringify([{ orderLineId: LINE_C, qty: 1 }]);
    expect(await attempt("select public.delivery_return_record_lines($1, $2::jsonb, $3, 'x') as r", [DO_A, lines, PJ])).toMatchObject({ ok: false, detail: "do_has_units" });
    await as(OP);
    expect(await attempt("select public.delivery_return_record_lines($1, $2::jsonb, $3, 'x') as r", [DO_D, lines, PJ])).toMatchObject({ ok: false, detail: "do_has_units" });
    await as(OP);
    expect(await attempt("select public.delivery_return_record($1, $2, $3, 'Wrong colour') as r", [DO_D, [U.d1], PJ])).toMatchObject({ ok: true, r: { units: 1 } });
    expect(await unit("d1")).toMatchObject({ status: "free", warehouse_id: PJ });
    // d1 names no order line (0471): no price, no guessed line.
    expect((await q("select unit_price, refund from delivery_return_units where unit_id = $1", [U.d1])).rows[0]).toEqual({ unit_price: null, refund: null });
  });

  it("a returned Unit can be required by another order's DO", async () => {
    await q("reset role");
    const r = await attempt("insert into delivery_order_units (delivery_order_id, item_id) values ($1, $2) returning 1 as r", [DO_B, U.a1]);
    expect(r.ok).toBe(true);
  });
});

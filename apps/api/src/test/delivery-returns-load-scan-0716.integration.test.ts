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
const DO_A_NO = `DOIT${HEX}A`.toUpperCase();
const DO_B_NO = `DOIT${HEX}B`.toUpperCase();
const U = { a1: uid("b1"), a2: uid("b2"), b1: uid("b3") };
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
    return (await q("select status, warehouse_id from ops_stock_items where id = $1", [U[k]])).rows[0];
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
    const soA = await so(ORDER_A);
    const soB = await so(ORDER_B);
    for (const [k, doId, ref] of [["a1", DO_A, soA], ["a2", DO_A, soA], ["b1", DO_B, soB]] as const) {
      await q(
        "insert into ops_stock_items (id, unit_code, sku, warehouse_id, status, reserved_ref, qty) values ($1, $2, 'IT-DR', $3, 'reserved', $4, 1)",
        [U[k], code(k), KLANG, ref],
      );
      await q("insert into delivery_order_units (delivery_order_id, item_id) values ($1, $2)", [doId, U[k]]);
    }
    // DO A's goods are out with Logistics; DO B's are still at the warehouse.
    await q("insert into delivery_handover_events (delivery_order_id, kind, duty, recorded_by) values ($1, 'received_by_logistics', 'logistics', $2)", [DO_A, OP]);
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

  it("a Delivery Return puts the picked Unit back in stock at the chosen Site, Refund status Pending", async () => {
    await as(OP);
    expect(await attempt("select public.delivery_return_record($1, $2, $3, ' ') as r", [DO_A, [U.a1], PJ])).toMatchObject({ ok: false, detail: "reason_required" });
    expect(await attempt("select public.delivery_return_record($1, $2, $3, 'x') as r", [DO_A, [U.b1], PJ])).toMatchObject({ ok: false, detail: "unit_not_on_do" });
    const r = await attempt("select public.delivery_return_record($1, $2, $3, 'Customer changed mind') as r", [DO_A, [U.a1], PJ]);
    expect(r.ok).toBe(true);
    const out = (r as unknown as { r: { returnNo: string; units: number; id: string } }).r;
    expect(out.returnNo).toMatch(/^DR-\d{8}-\d{4}$/);
    expect(out.units).toBe(1);
    expect(await unit("a1")).toMatchObject({ status: "free", warehouse_id: PJ });
    expect(await unit("a2")).toMatchObject({ status: "sold" });
    expect((await q("select refund_status from delivery_returns where id = $1", [out.id])).rows[0].refund_status).toBe("pending");
    await as(OP);
    expect(await attempt("select public.delivery_return_record($1, $2, $3, 'again') as r", [DO_A, [U.a1], PJ])).toMatchObject({ ok: false, detail: "unit_not_delivered" });
    expect(await attempt("select public.delivery_return_set_refund_status($1, 'refunded') as r", [out.id])).toMatchObject({ ok: true, r: { refundStatus: "refunded" } });
    expect(await attempt("select public.delivery_return_set_refund_status($1, 'paid') as r", [out.id])).toMatchObject({ ok: false, detail: "bad_refund_status" });
  });

  it("a returned Unit can be required by another order's DO", async () => {
    await q("reset role");
    const r = await attempt("insert into delivery_order_units (delivery_order_id, item_id) values ($1, $2) returning 1 as r", [DO_B, U.a1]);
    expect(r.ok).toBe(true);
  });
});

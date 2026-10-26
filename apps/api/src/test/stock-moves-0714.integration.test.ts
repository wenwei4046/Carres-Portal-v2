import { describe, it, expect, beforeAll, afterAll } from "vitest";
import pg from "pg";

/**
 * 0714 ON A REAL POSTGRESQL — Weisiang's decision (Mr Lim, WhatsApp
 * 2026-10-22): office staff adjust, transfer and count stock the Houzs way,
 * on top of Carres Units. Jess was not part of this decision.
 *
 *   adjust    minus writes picked Units off with the reason; plus births new
 *             Units with their own Unit IDs; a reserved Unit is refused
 *   transfer  picked Units change Site at once; Cancel moves them back, and is
 *             refused once a Unit has moved on
 *   take      snapshot; Post writes off what was not found and births the
 *             extras through the same Stock Adjustment door
 *
 *   CARRES_TEST_DATABASE_URL=postgres://postgres@localhost:<port>/<db> pnpm --filter @carres/api test -- stock-moves-0714
 *
 * Without the URL every case is SKIPPED — reported as skipped, never as passed.
 */
const URL = process.env.CARRES_TEST_DATABASE_URL ?? "";
const LOCAL = /^postgres(ql)?:\/\/[^@/]*@?(localhost|127\.0\.0\.1|\[::1\])(:\d+)?\//.test(URL);
const RUN = Date.now() % 100000;
const HEX = RUN.toString(16).padStart(5, "0");
const uid = (tail: string) => `fffffff7-0000-4000-8000-${HEX}${tail.padStart(7, "0")}`;

const OP = uid("2");
const DEALER = uid("4");
const KLANG = uid("61");
const PJ = uid("62");
const U = {
  a: uid("b1"),
  b: uid("b2"),
  c: uid("b3"),
  reserved: uid("b4"),
  d: uid("b5"),
  e: uid("b6"),
};
const code = (key: keyof typeof U) => `U9${RUN}-${String(Object.keys(U).indexOf(key) + 100)}-001`;
const SKU = `IT-MV-${HEX}`;
const QSKU = `IT-MVQ-${HEX}`; // a counted-goods SKU (stock_identity_mode = 'quantity')
const QROW = uid("c1");

type Result = { ok: true; r: Record<string, unknown> } | { ok: false; why: string; detail: string };

describe.skipIf(!URL)("Stock Adjustment, Transfer and Take on Units (real PostgreSQL, 0714)", () => {
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
    return (await q("select status, warehouse_id, hold_release_note from ops_stock_items where id = $1", [U[key]])).rows[0];
  };

  beforeAll(async () => {
    if (!LOCAL) throw new Error("CARRES_TEST_DATABASE_URL must point at localhost");
    db = new pg.Client({ connectionString: URL });
    await db.connect();
    await q("begin");
    await q("set local session_replication_role = replica");
    for (const [id, role] of [[OP, "operation"], [DEALER, "dealer"]] as const) {
      const email = `it-0714-${id.slice(-7)}-${RUN}@carres.test`;
      await q("insert into auth.users (id, email) values ($1, $2)", [id, email]);
      await q("insert into app_users (id, email, name, role, status, is_person) values ($1, $2, $3, $4, 'active', true)", [id, email, `IT ${role}`, role]);
    }
    await q("insert into warehouses (id, name, kind) values ($1, $2, 'own'), ($3, $4, 'own')", [KLANG, `IT Klang ${HEX}`, PJ, `IT PJ ${HEX}`]);
    for (const key of Object.keys(U) as (keyof typeof U)[]) {
      const reserved = key === "reserved";
      await q(
        "insert into ops_stock_items (id, unit_code, sku, warehouse_id, status, reserved_ref, qty) values ($1, $2, $3, $4, $5, $6, 1)",
        [U[key], code(key), SKU, KLANG, reserved ? "reserved" : "free", reserved ? "SO2610-0001" : null],
      );
    }
    await q(
      `insert into product_skus (model_id, sku, variant, variant_kind, price, stock_identity_mode)
       values (gen_random_uuid(), $1, 'IT', 'size', 0, 'exact_unit'), (gen_random_uuid(), $2, 'IT', 'size', 0, 'quantity')`,
      [SKU, QSKU],
    );
    await q(
      "insert into ops_stock_items (id, unit_code, identity_scope, sku, warehouse_id, status, qty) values ($1, $2, 'quantity', $3, $4, 'free', 40)",
      [QROW, `QTY-${String(RUN).padStart(9, "0")}`, QSKU, KLANG],
    );
    await q("set local session_replication_role = origin");
  });

  afterAll(async () => {
    if (!db) return;
    await q("rollback");
    await db.end();
  });

  it("refuses anyone but office staff", async () => {
    await as(DEALER);
    const r = await attempt("select public.stock_adjust_units($1, 'x', $2, '[]') as r", [KLANG, [U.a]]);
    expect(r).toMatchObject({ ok: false, detail: "forbidden" });
  });

  it("Stock Adjustment: minus writes the picked Unit off with the reason; plus births new Units", async () => {
    await as(OP);
    const r = await attempt("select public.stock_adjust_units($1, 'Water damage', $2, $3::jsonb) as r", [
      KLANG, [U.a], JSON.stringify([{ sku: SKU, qty: 2 }]),
    ]);
    expect(r.ok).toBe(true);
    const out = (r as unknown as { r: { adjustmentNo: string; minus: number; plus: number } }).r;
    expect(out.adjustmentNo).toMatch(/^ADJ-\d{8}-\d{4}$/);
    expect(out).toMatchObject({ minus: 1, plus: 2 });
    expect(await unit("a")).toMatchObject({ status: "written_off", hold_release_note: `${out.adjustmentNo}: Water damage` });
    const born = (await q("select unit_code, status, warehouse_id from ops_stock_items where source_ref = $1", [out.adjustmentNo])).rows;
    expect(born).toHaveLength(2);
    for (const b of born) expect(b).toMatchObject({ status: "free", warehouse_id: KLANG });
    expect(born[0].unit_code).not.toBe(born[1].unit_code);
    // 0366's lineage still records the write-off.
    const ev = (await q("select to_value from stock_unit_events where unit_id = $1 and event = 'status_changed'", [U.a])).rows;
    expect(ev.map((e) => e.to_value)).toContain("written_off");
  });

  it("Stock Adjustment refuses a reserved Unit and an empty reason", async () => {
    await as(OP);
    const reserved = await attempt("select public.stock_adjust_units($1, 'x', $2, '[]') as r", [KLANG, [U.reserved]]);
    expect(reserved).toMatchObject({ ok: false, detail: "unit_not_adjustable" });
    expect((reserved as { why: string }).why).toContain("reserved for SO2610-0001");
    const noReason = await attempt("select public.stock_adjust_units($1, ' ', $2, '[]') as r", [KLANG, [U.b]]);
    expect(noReason).toMatchObject({ ok: false, detail: "reason_required" });
  });

  it("Stock Take leaves counted-goods rows out of the snapshot", async () => {
    await as(OP);
    const o = await attempt("select public.stock_count_open($1, false, null) as r", [KLANG]);
    expect(o.ok).toBe(true);
    const cnt = (o as unknown as { r: { id: string } }).r;
    await q("reset role");
    const rows = (await q("select unit_id from stock_count_units where count_id = $1", [cnt.id])).rows;
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.map((x) => x.unit_id)).not.toContain(QROW);
    await q("delete from stock_count_units where count_id = $1", [cnt.id]);
    await q("delete from stock_counts where id = $1", [cnt.id]);
  });

  it("Stock Adjustment refuses a counted-goods row in minus and a SKU not traced by Unit ID in plus", async () => {
    await as(OP);
    const qtyRow = await attempt("select public.stock_adjust_units($1, 'x', $2, '[]') as r", [KLANG, [QROW]]);
    expect(qtyRow).toMatchObject({ ok: false, detail: "unit_not_adjustable" });
    await as(OP);
    const qtySku = await attempt("select public.stock_adjust_units($1, 'x', '{}', $2::jsonb) as r", [
      KLANG, JSON.stringify([{ sku: QSKU, qty: 1 }]),
    ]);
    expect(qtySku).toMatchObject({ ok: false, detail: "plus_sku_not_exact_unit" });
    await as(OP);
    const typo = await attempt("select public.stock_adjust_units($1, 'x', '{}', $2::jsonb) as r", [
      KLANG, JSON.stringify([{ sku: `NO-SUCH-${HEX}`, qty: 1 }]),
    ]);
    expect(typo).toMatchObject({ ok: false, detail: "plus_sku_not_exact_unit" });
    await q("reset role");
    const row = (await q("select status, qty from ops_stock_items where id = $1", [QROW])).rows[0];
    expect(row).toMatchObject({ status: "free", qty: 40 });
  });

  it("Stock Transfer moves the Units at once and Cancel moves them back", async () => {
    await as(OP);
    const r = await attempt("select public.stock_transfer_units($1, $2, $3, 'Showroom display') as r", [KLANG, PJ, [U.b, U.reserved]]);
    expect(r.ok).toBe(true);
    const t = (r as unknown as { r: { id: string; transferNo: string } }).r;
    expect(t.transferNo).toMatch(/^TR-\d{8}-\d{4}$/);
    expect((await unit("b")).warehouse_id).toBe(PJ);
    expect((await unit("reserved")).warehouse_id).toBe(PJ);
    await as(OP);
    const c = await attempt("select public.stock_transfer_cancel($1, 'Wrong Site') as r", [t.id]);
    expect(c.ok).toBe(true);
    expect((await unit("b")).warehouse_id).toBe(KLANG);
    expect((await unit("reserved")).warehouse_id).toBe(KLANG);
    await as(OP);
    const again = await attempt("select public.stock_transfer_cancel($1, 'again') as r", [t.id]);
    expect(again).toMatchObject({ ok: false, detail: "already_cancelled" });
  });

  it("Stock Transfer Cancel is refused once a Unit has moved on", async () => {
    await as(OP);
    const r = await attempt("select public.stock_transfer_units($1, $2, $3) as r", [KLANG, PJ, [U.c]]);
    const t = (r as unknown as { r: { id: string } }).r;
    await as(OP);
    await attempt("select public.stock_adjust_units($1, 'Lost', $2, '[]') as r", [PJ, [U.c]]);
    await as(OP);
    const c = await attempt("select public.stock_transfer_cancel($1, 'undo') as r", [t.id]);
    expect(c).toMatchObject({ ok: false, detail: "unit_moved_on" });
  });

  it("Stock Take: Post writes off what was not found and adds the extras through Stock Adjustment", async () => {
    await as(OP);
    const o = await attempt("select public.stock_count_open($1, true, null) as r", [KLANG]);
    expect(o.ok).toBe(true);
    const cnt = (o as unknown as { r: { id: string; countNo: string } }).r;
    expect(cnt.countNo).toMatch(/^STK-\d{8}-\d{4}$/);
    // A code that is not in this count is refused by name.
    await as(OP);
    const bad = await attempt("select public.stock_count_record($1, $2, '[]', false) as r", [cnt.id, ["U0-000-000"]]);
    expect(bad).toMatchObject({ ok: false, detail: "unit_not_in_count" });
    // Not finding a reserved Unit blocks the post.
    await as(OP);
    const blocked = await attempt("select public.stock_count_record($1, $2, '[]', true) as r", [cnt.id, [code("b"), code("d")]]);
    expect(blocked).toMatchObject({ ok: false, detail: "missing_unit_reserved" });
    // Found b, d and the reserved one; e is missing; one extra piece on the shelf.
    await as(OP);
    const p = await attempt("select public.stock_count_record($1, $2, $3::jsonb, true) as r", [
      cnt.id, [code("b"), code("d"), code("reserved")], JSON.stringify([{ sku: SKU, qty: 1 }]),
    ]);
    expect(p.ok).toBe(true);
    const posted = (p as unknown as { r: { status: string; adjustmentNo: string } }).r;
    expect(posted.status).toBe("posted");
    expect(posted.adjustmentNo).toMatch(/^ADJ-/);
    expect((await unit("e")).status).toBe("written_off");
    expect((await unit("d")).status).toBe("free");
    const adj = (await q("select count_id from stock_adjustments where adjustment_no = $1", [posted.adjustmentNo])).rows[0];
    expect(adj.count_id).toBe(cnt.id);
    await as(OP);
    const twice = await attempt("select public.stock_count_record($1, '{}', '[]', true) as r", [cnt.id]);
    expect(twice).toMatchObject({ ok: false, detail: "count_posted" });
  });
});

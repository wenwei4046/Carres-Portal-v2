import { describe, it, expect, beforeAll, afterAll } from "vitest";
import pg from "pg";

/**
 * 0600 ON A REAL POSTGRESQL RUNNING THE WHOLE MIGRATION CHAIN (Purchasing
 * MASTER §9.1, owner ruling 2026-09-28 — RESERVE GOODS ALREADY ON A PO):
 *
 *   bind      `Use this PO` binds an incoming Unit of an open PO to a Sales
 *             Order line; the Unit stays `incoming`, the line is covered and
 *             the PO's free balance no longer counts it
 *   refuse    a second bind over the line's requirement is refused; goods the
 *             PO holds for another customer's lineage are never offered
 *   release   the one save (`Change selection`) gives the Unit back to its PO
 *   receipt   a bound Unit arrives `reserved` for its line; an unbound one
 *             arrives `free`; one damaged on arrival gives its line back
 *
 * Fixtures are written with triggers off inside ONE transaction that is
 * rolled back; the doors are then called with triggers ON, as a signed-in
 * Operation person. Receipt is the status flip every receiving door performs
 * (`incoming` → `free` / `on_hold`), issued as the database owner.
 *
 *   LC_ALL=en_US.UTF-8 node scripts/dry-run-migrations.mjs --baseline scripts/migration-replay-baseline.json --keep
 *   CARRES_TEST_DATABASE_URL=postgres://postgres@localhost:<port>/<db> pnpm --filter @carres/api test -- use-this-po
 *
 * Without the URL every case is SKIPPED — reported as skipped, never as passed.
 */
const URL = process.env.CARRES_TEST_DATABASE_URL ?? "";
const LOCAL = /^postgres(ql)?:\/\/[^@/]*@?(localhost|127\.0\.0\.1|\[::1\])(:\d+)?\//.test(URL);
const RUN = Date.now() % 100000;
const HEX = RUN.toString(16).padStart(5, "0");
const uid = (tail: string) => `fffffff6-0000-4000-8000-${HEX}${tail.padStart(7, "0")}`;

const OP = uid("2");
const SUPPLIER = uid("51");
const WH = uid("61");
const ORDER = uid("81");
const OTHER_ORDER = uid("82");
const L1 = uid("91");
const L2 = uid("92");
const L3 = uid("93");
const OTHER_LINE = uid("99");
const PO = `PO-IT-${HEX}`;
const PO_LINE = uid("a1");
const UNITS = [uid("b1"), uid("b2"), uid("b3")];
const SO = 900000 + RUN;
const REF = `SO-${SO}`;
const SKU = `IT-USEPO-${HEX}`;

describe.skipIf(!URL)("a Unit on a purchase order can be reserved for a Sales Order (real PostgreSQL, 0600)", () => {
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
      return { ok: false, why: (e as Error).message };
    }
  }
  const as = async (who: string) => {
    await q("reset role");
    await q("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: who, role: "authenticated" })]);
    await q("set local role authenticated");
  };
  const owner = () => q("reset role");
  const usePo = (line: string) =>
    attempt(
      "select public.so_batch_use_po_units($1, 'used_instead_of_ordering', 'SO Batch Purchase', $2::uuid, $3::uuid, $4) as r",
      [REF, ORDER, line, PO],
    );
  const unit = async (id: string) =>
    (await q("select status, reserved_order_line_id, reserved_ref from public.ops_stock_items where id = $1", [id])).rows[0] as {
      status: string; reserved_order_line_id: string | null; reserved_ref: string | null;
    };
  const scalar = async (sql: string, params: unknown[] = []) => Number(Object.values((await q(sql, params)).rows[0]!)[0]);
  const free = () => scalar("select public.purchasing_po_line_free_units($1::uuid)", [PO_LINE]);
  const remaining = (line: string) => scalar("select public.so_line_remaining_requirement($1::uuid)", [line]);
  const boundTo = async (line: string) =>
    (await q("select id from public.ops_stock_items where reserved_order_line_id = $1 order by id", [line])).rows.map((r) => r.id as string);

  beforeAll(async () => {
    if (!LOCAL) throw new Error("CARRES_TEST_DATABASE_URL must point at localhost");
    db = new pg.Client({ connectionString: URL });
    await db.connect();
    await q("begin");
    await q("set local session_replication_role = replica");
    const email = `it-0600-operation-${RUN}@carres.test`;
    await q("insert into auth.users (id, email) values ($1, $2)", [OP, email]);
    await q("insert into app_users (id, email, name, role, status, is_person) values ($1, $2, $3, 'operation', 'active', true)", [OP, email, `IT op ${HEX}`]);
    await q("insert into suppliers (id, name, kind, slug) values ($1, $2, (select enum_range(null::supplier_kind))[1], $3)", [SUPPLIER, `IT supplier ${HEX}`, `it-sup-${HEX}`]);
    await q("insert into warehouses (id, name) values ($1, $2)", [WH, `IT Klang ${HEX}`]);
    for (const [id, so, name] of [[ORDER, SO, "IT customer"], [OTHER_ORDER, SO + 1, "IT other customer"]] as const) {
      await q("insert into orders (id, so, dealer_id, customer_name, customer_phone, status, source_system) values ($1, $2, $3, $4, '0120000000', 'proceed_order', 'autocount')", [id, so, uid("f1"), name]);
    }
    for (const [id, order] of [[L1, ORDER], [L2, ORDER], [L3, ORDER], [OTHER_LINE, OTHER_ORDER]] as const) {
      await q("insert into order_lines (id, order_id, sku, qty, unit_price) values ($1, $2, $3, 1, 1000)", [id, order, SKU]);
    }
    await q("insert into purchase_orders (id, supplier_id, warehouse_id, status) values ($1, $2, $3, 'open')", [PO, SUPPLIER, WH]);
    await q("insert into purchase_order_lines (id, po_id, sku, qty, received_qty) values ($1, $2, $3, 3, 0)", [PO_LINE, PO, SKU]);
    /* One of the three pieces was raised for ANOTHER customer's line: it is
       held by lineage and may never be offered here. */
    await q("insert into po_line_sources (po_id, po_line_id, sku, order_id, so, order_line_id, qty) values ($1, $2, $3, $4, $5, $6, 1)", [PO, PO_LINE, SKU, OTHER_ORDER, SO + 1, OTHER_LINE]);
    for (const [i, id] of UNITS.entries()) {
      await q(
        "insert into ops_stock_items (id, unit_code, sku, warehouse_id, status, po_no, po_line_id, identity_scope, source_ref) values ($1, $2, $3, $4, 'incoming', $5, $6, 'unit', 'po_mint')",
        [id, `U9${RUN}-${i}00-001`, SKU, WH, PO, PO_LINE],
      );
    }
    await q("set local session_replication_role = origin");
  });
  afterAll(async () => {
    await q("reset role").catch(() => {});
    await q("rollback").catch(() => {});
    await db.end();
  });

  it("offers only what no order holds: three incoming, one held by another customer's lineage", async () => {
    await as(OP);
    expect(await free()).toBe(2);
    const listed = (await q("select po_id, free_units from public.purchasing_po_free_units() where po_line_id = $1", [PO_LINE])).rows;
    expect(listed).toEqual([{ po_id: PO, free_units: 2 }]);
  });

  it("binds an incoming Unit to the line: status stays incoming, the line is covered, the PO stops counting it", async () => {
    await as(OP);
    const r = await usePo(L1);
    expect(r.ok, r.ok ? "" : r.why).toBe(true);
    const bound = await boundTo(L1);
    expect(bound).toHaveLength(1);
    const u = await unit(bound[0]!);
    expect(u.status).toBe("incoming");
    expect(u.reserved_order_line_id).toBe(L1);
    expect(u.reserved_ref).toBe(REF);
    expect(await remaining(L1)).toBe(0);
    expect(await free()).toBe(1);
  });

  it("refuses a second bind over the line's requirement, through either door", async () => {
    await as(OP);
    const again = await usePo(L1);
    expect(again.ok).toBe(false);
    expect((again as { why: string }).why).toMatch(/line_already_covered/);
    const spare = (await q("select id from public.ops_stock_items where po_line_id = $1 and reserved_order_line_id is null order by id limit 1", [PO_LINE])).rows[0]!.id as string;
    const direct = await attempt(
      "select public.ops_stock_pool_draw($1, 'used_instead_of_ordering', null, $2::uuid, null, null, null, $3::uuid) as r",
      [REF, spare, L1],
    );
    expect(direct.ok).toBe(false);
    expect((direct as { why: string }).why).toMatch(/line_already_covered/);
    expect(await boundTo(L1)).toHaveLength(1);
  });

  it("never spends goods held for another customer's lineage", async () => {
    await as(OP);
    const second = await usePo(L2);
    expect(second.ok, second.ok ? "" : second.why).toBe(true);
    expect(await free()).toBe(0);
    const third = await usePo(L3);
    expect(third.ok).toBe(false);
    expect((third as { why: string }).why).toMatch(/po_has_no_free_units/);
    expect(await remaining(L3)).toBe(1);
  });

  it("releases through the one save: the Unit returns to the PO's free balance and the line needs it again", async () => {
    await as(OP);
    const held = await boundTo(L2);
    expect(held).toHaveLength(1);
    const r = await attempt(
      "select public.so_batch_save_ready_units($1, 'used_instead_of_ordering', 'SO Batch Purchase', $2::uuid, $3::uuid, '[]'::jsonb) as r",
      [REF, ORDER, L2],
    );
    expect(r.ok, r.ok ? "" : r.why).toBe(true);
    expect((r as unknown as { row: { r: { released: number } } }).row.r.released).toBe(1);
    const u = await unit(held[0]!);
    expect(u.status).toBe("incoming");
    expect(u.reserved_order_line_id).toBeNull();
    expect(await free()).toBe(1);
    expect(await remaining(L2)).toBe(1);
  });

  it("a bound Unit arrives reserved for its line; an unbound Unit arrives free", async () => {
    await owner();
    const [boundUnit] = await boundTo(L1);
    await q("update public.ops_stock_items set status = 'free', warehouse_id = $2 where id = $1", [boundUnit, WH]);
    await q("update public.purchase_order_lines set received_qty = 1 where id = $1", [PO_LINE]);
    const arrived = await unit(boundUnit!);
    expect(arrived.status).toBe("reserved");
    expect(arrived.reserved_order_line_id).toBe(L1);
    expect(await remaining(L1)).toBe(0);

    const unbound = (await q("select id from public.ops_stock_items where po_line_id = $1 and status = 'incoming' and reserved_order_line_id is null order by id limit 1", [PO_LINE])).rows[0]!.id as string;
    await q("update public.ops_stock_items set status = 'free' where id = $1", [unbound]);
    await q("update public.purchase_order_lines set received_qty = 2 where id = $1", [PO_LINE]);
    const plain = await unit(unbound);
    expect(plain.status).toBe("free");
    expect(plain.reserved_order_line_id).toBeNull();
  });

  it("a bound Unit damaged on arrival gives its line back", async () => {
    await as(OP);
    const r = await usePo(L2);
    expect(r.ok, r.ok ? "" : r.why).toBe(true);
    const [held] = await boundTo(L2);
    expect(await remaining(L2)).toBe(0);
    await owner();
    await q("update public.ops_stock_items set status = 'on_hold', hold_reason = 'damaged', held_at = now() where id = $1", [held]);
    const u = await unit(held!);
    expect(u.status).toBe("on_hold");
    expect(u.reserved_order_line_id).toBeNull();
    expect(await remaining(L2)).toBe(1);
  });
});

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import pg from "pg";
/**
 * A GOODS RECEIPT WITH NO PO (0728), on a real PostgreSQL. YH 2026-10-27:
 * follow Houzs grns.ts:1408 — a delivery with no PO is received and stock goes
 * up. A hidden receipt_only PO carries it through the one stock engine.
 *
 *   CARRES_TEST_DATABASE_URL=postgres://postgres@localhost:<port>/<db> pnpm --filter @carres/api test -- office-receive-without-po
 *
 * Without the URL every case is SKIPPED.
 */
const URL = process.env.CARRES_TEST_DATABASE_URL ?? "";
const LOCAL = /^postgres(ql)?:\/\/[^@/]*@?(localhost|127\.0\.0\.1|\[::1\])(:\d+)?\//.test(URL);
const RUN = Date.now() % 100000;
const HEX = RUN.toString(16).padStart(5, "0");
const uid = (tail: string) => `fffffff8-0000-4000-8000-${HEX}${tail.padStart(7, "0")}`;

const OP = uid("2");
const SUPPLIER = uid("51");
const WH = uid("61");
const DEST = uid("71");
const PARTY = uid("72");
const MODEL = uid("91");
const SKU_UNIT = `IT-NOPO-U-${HEX}`;
const SKU_QTY = `IT-NOPO-Q-${HEX}`;

describe.skipIf(!URL)("a Goods Receipt with no PO (0728, real PostgreSQL, YH 2026-10-27)", () => {
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
      const err = e as { detail?: string; message: string };
      return { ok: false, why: `${err.message} [${err.detail ?? ""}]` };
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
    await q("set local session_replication_role = replica");
    const email = `it-nopo-${HEX}@carres.test`;
    await q("insert into auth.users (id, email) values ($1, $2)", [OP, email]);
    await q("insert into app_users (id, email, name, role, status, is_person) values ($1, $2, $3, 'operation', 'active', true)", [OP, email, `IT office ${HEX}`]);
    await q("insert into suppliers (id, name, kind, slug) values ($1, $2, 'own_logistics', $3)", [SUPPLIER, `IT supplier ${HEX}`, `it-nopo-${HEX}`]);
    await q("insert into warehouses (id, name, address) values ($1, $2, 'Lot 1, Jalan IT, Klang')", [WH, `IT Klang ${HEX}`]);
    await q("insert into purchasing_destinations (id, name, warehouse_id, active) values ($1, $2, $3, true)", [DEST, `IT Klang ${HEX}`, WH]);
    await q("insert into stock_operating_parties (id, code, name, kind) values ($1, $2, $3, 'warehouse_operator')", [PARTY, `it_nopo_${HEX}`, `IT party ${HEX}`]);
    await q("insert into warehouse_site_profiles (site_id, operating_party_id) values ($1, $2)", [WH, PARTY]);
    const cat = (await q("select udt_name from information_schema.columns where table_name = 'product_models' and column_name = 'category'")).rows[0].udt_name as string;
    await q(`insert into product_models (id, category, model_key, name) values ($1, (enum_range(null::${cat}))[1], $2, $3)`, [MODEL, `it-nopo-${HEX}`, `IT Sofa ${HEX}`]);
    const vk = (await q("select udt_name, data_type from information_schema.columns where table_name = 'product_skus' and column_name = 'variant_kind'")).rows[0] as { udt_name: string; data_type: string };
    const variantKind = vk.data_type === "USER-DEFINED" ? `(enum_range(null::${vk.udt_name}))[1]` : "'size'";
    await q(`insert into product_skus (model_id, sku, variant, variant_kind, price, supplier_id, cost, stock_identity_mode) values ($1, $2, 'Left', ${variantKind}, 1000, $3, 500, 'exact_unit'), ($1, $4, 'Right', ${variantKind}, 100, $3, null, 'quantity')`, [MODEL, SKU_UNIT, SUPPLIER, SKU_QTY]);
    await q("set local session_replication_role = origin");
  });
  afterAll(async () => {
    await q("reset role").catch(() => {});
    await q("rollback").catch(() => {});
    await db.end();
  });

  const post = (key: string, date: string | null = null) => attempt(
    "select public.office_receive_without_po($1, $2, $3::jsonb, $4, $5, 'IT no PO', $6::date, $7::uuid, $8::uuid) as r",
    [SUPPLIER, DEST, JSON.stringify([{ sku: SKU_UNIT, qty: 2, cost: 500 }, { sku: SKU_QTY, qty: 3 }]),
      `DO-${HEX}-${key}`, `nopo/${key}.jpg`, date, WH, uid(key)]);

  it("an Operation staff member posts a receipt with no PO; stock goes up; the PO behind it is hidden", async () => {
    await as(OP);
    const r = await post("e1");
    expect(r.ok, r.ok ? "" : r.why).toBe(true);
    const out = (r as unknown as { row: { r: Record<string, unknown> } }).row.r;
    expect(out.po_hidden).toBe(true);
    expect(out.po_id).toBeUndefined();
    await q("reset role");
    const rc = (await q("select po_id, status from public.warehouse_receipts where save_key = $1", [uid("e1")])).rows[0];
    expect(rc.status).toBe("posted");
    const po = (await q("select receipt_only, so_refs from public.purchase_orders where id = $1", [rc.po_id])).rows[0];
    expect(po).toMatchObject({ receipt_only: true, so_refs: null });
    const recv = (await q("select sku, received_qty from public.purchase_order_lines where po_id = $1 order by sku", [rc.po_id])).rows;
    expect(recv.map((x) => x.received_qty)).toEqual([3, 2]);
    const left = (await q("select count(*)::int n from public.ops_stock_items where po_no = $1 and status = 'incoming'", [rc.po_id])).rows[0].n;
    expect(left).toBe(0);
  });

  it("the same save key returns the same receipt and issues no second PO", async () => {
    await q("reset role");
    const before = (await q("select count(*)::int n from public.purchase_orders where receipt_only")).rows[0].n;
    await as(OP);
    const r = await post("e1");
    expect(r.ok, r.ok ? "" : r.why).toBe(true);
    expect((r as unknown as { row: { r: Record<string, unknown> } }).row.r.already_saved).toBe(true);
    await q("reset role");
    expect((await q("select count(*)::int n from public.purchase_orders where receipt_only")).rows[0].n).toBe(before);
  });

  it("a delivery from last week can be backdated", async () => {
    await as(OP);
    const d = new Date(Date.now() - 7 * 864e5).toISOString().slice(0, 10);
    const r = await post("e2", d);
    expect(r.ok, r.ok ? "" : r.why).toBe(true);
  });

  it("refuses: no supplier, no lines, and a caller who is not Operation staff", async () => {
    await as(OP);
    expect(await attempt("select public.office_receive_without_po(null, $1, '[{\"sku\":\"x\",\"qty\":1}]'::jsonb, 'D', 'f.jpg')", [DEST])).toMatchObject({ ok: false });
    const none = await attempt("select public.office_receive_without_po($1, $2, '[]'::jsonb, 'D', 'f.jpg')", [SUPPLIER, DEST]);
    expect(none.ok ? "" : none.why).toContain("items_required");
    await as(uid("999"));
    const out = await attempt("select public.office_receive_without_po($1, $2, '[{\"sku\":\"x\",\"qty\":1}]'::jsonb, 'D', 'f.jpg')", [SUPPLIER, DEST]);
    expect(out.ok ? "" : out.why).toContain("not_operation_staff");
  });
});

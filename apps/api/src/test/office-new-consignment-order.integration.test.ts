import { describe, it, expect, beforeAll, afterAll } from "vitest";
import pg from "pg";

/**
 * A CONSIGNMENT ORDER WITH NO SOURCE, ON A REAL POSTGRESQL RUNNING THE WHOLE
 * MIGRATION CHAIN. Weisiang's decision (Mr Lim, WhatsApp 2026-10-22): office
 * staff open a Consignment Order the Houzs way — a blank form with prices —
 * overturning Jess's "no blank order that bypasses its source"
 * (docs/purchasing/MASTER.md §9.9); Jess was not part of the decision.
 *
 * 0720's door `purchasing_issue_consignment_order` calls the one creation
 * authority and marks the order consignment; Receiving then keeps the goods
 * supplier-owned, one Unit per piece.
 *
 *   CARRES_TEST_DATABASE_URL=postgres://postgres@localhost:<port>/<db> pnpm --filter @carres/api test -- office-new-consignment-order
 *
 * Without the URL every case is SKIPPED — reported as skipped, never as passed.
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
const SKU_UNIT = `IT-NCO-U-${HEX}`;
const SKU_QTY = `IT-NCO-Q-${HEX}`;

describe.skipIf(!URL)("a Consignment Order with no source keeps the goods supplier-owned (real PostgreSQL, Weisiang 2026-10-22)", () => {
  let db: pg.Client;
  let poId = "";
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
  const lines = async () =>
    (await q("select id, sku, qty, received_qty, identity_mode, demand_id from public.purchase_order_lines where po_id = $1 order by sku", [poId])).rows as Array<{ id: string; sku: string; qty: number; received_qty: number; identity_mode: string; demand_id: string | null }>;

  beforeAll(async () => {
    if (!LOCAL) throw new Error("CARRES_TEST_DATABASE_URL must point at localhost");
    db = new pg.Client({ connectionString: URL });
    await db.connect();
    await q("begin");
    await q("set local session_replication_role = replica");
    const email = `it-nco-${HEX}@carres.test`;
    await q("insert into auth.users (id, email) values ($1, $2)", [OP, email]);
    await q("insert into app_users (id, email, name, role, status, is_person) values ($1, $2, $3, 'operation', 'active', true)", [OP, email, `IT office ${HEX}`]);
    await q("insert into suppliers (id, name, kind, slug) values ($1, $2, 'own_logistics', $3)", [SUPPLIER, `IT supplier ${HEX}`, `it-nco-${HEX}`]);
    await q("insert into warehouses (id, name, address) values ($1, $2, 'Lot 1, Jalan IT, Klang')", [WH, `IT Klang ${HEX}`]);
    await q("insert into purchasing_destinations (id, name, warehouse_id, active) values ($1, $2, $3, true)", [DEST, `IT Klang ${HEX}`, WH]);
    await q("insert into stock_operating_parties (id, code, name, kind) values ($1, $2, $3, 'warehouse_operator')", [PARTY, `it_nco_${HEX}`, `IT party ${HEX}`]);
    await q("insert into warehouse_site_profiles (site_id, operating_party_id) values ($1, $2)", [WH, PARTY]);
    const cat = (await q("select udt_name from information_schema.columns where table_name = 'product_models' and column_name = 'category'")).rows[0].udt_name as string;
    await q(`insert into product_models (id, category, model_key, name) values ($1, (enum_range(null::${cat}))[1], $2, $3)`, [MODEL, `it-nco-${HEX}`, `IT Sofa ${HEX}`]);
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

  it("an ordinary Operation staff member issues it through 0720's door; it is a consignment order with prices and no source", async () => {
    await as(OP);
    const pos = [{
      supplier_id: SUPPLIER, warehouse_id: WH, destination_id: DEST, eta_date: null, procurement_partner_id: null,
      so_refs: null, purpose: null, note: "IT consignment",
      lines: [
        { sku: SKU_UNIT, qty: 2, cost: 500, cost_source: "catalog", commercial_treatment: "normal", commercial_reason: null, expected_catalog_cost: 500 },
        { sku: SKU_QTY, qty: 3, cost: null, cost_source: null, commercial_treatment: null, commercial_reason: null, expected_catalog_cost: null },
      ],
    }];
    const r = await attempt("select public.purchasing_issue_consignment_order($1::jsonb) as r", [JSON.stringify(pos)]);
    expect(r.ok, r.ok ? "" : r.why).toBe(true);
    poId = ((r as unknown as { row: { r: { po_ids: string[] } } }).row.r.po_ids)[0]!;
    await q("reset role");
    const po = (await q("select is_consignment, so_refs from public.purchase_orders where id = $1", [poId])).rows[0];
    expect(po).toMatchObject({ is_consignment: true, so_refs: null });
    const costs = (await q("select sku, cost from public.purchase_order_lines where po_id = $1 order by sku", [poId])).rows.map((x) => [x.sku, x.cost == null ? null : Number(x.cost)]);
    expect(costs).toEqual([[SKU_QTY, null], [SKU_UNIT, 500]]);
    expect(Number((await q("select count(*) from public.po_line_sources where po_id = $1", [poId])).rows[0].count)).toBe(0);
  });

  it("receive: Receiving takes it in, one Unit per piece, and the Units stay supplier-owned", async () => {
    await q("reset role");
    const [qtyLine, unitLine] = await lines();
    const codes = (await q("select unit_code from public.ops_stock_items where po_line_id = $1 order by unit_code", [unitLine!.id])).rows.map((x) => x.unit_code as string);
    expect(codes).toHaveLength(2);
    await as(OP);
    const r = await attempt(
      "select public.office_receive_post($1, $2, $3, null, $4::jsonb, null, $5::uuid, '[]'::jsonb, '[]'::jsonb, $6::uuid, $7::timestamptz) as r",
      [poId, `DO-${HEX}`, `${poId}/do.jpg`, JSON.stringify([
        { id: unitLine!.id, received_now: 0, units: codes.map((unit_code) => ({ unit_code, outcome: "received", issue_kind: null, note: null })) },
        { id: qtyLine!.id, received_now: 3, units: [] },
      ]), WH, uid("e1"), new Date(Date.now() - 60 * 60 * 1000).toISOString()],
    );
    expect(r.ok, r.ok ? "" : r.why).toBe(true);
    await q("reset role");
    const owned = (await q("select status, ownership from public.ops_stock_items where po_line_id = $1", [unitLine!.id])).rows as Array<{ status: string; ownership: string }>;
    expect(owned).toHaveLength(2);
    expect(owned.every((u) => u.status !== "incoming" && u.ownership === "supplier_consignment")).toBe(true);
  });

  it("an ordinary Purchase Order through the old door stays Carres-owned", async () => {
    await as(OP);
    const r = await attempt("select public.purchasing_issue_pos_batch($1::jsonb) as r", [JSON.stringify([{
      supplier_id: SUPPLIER, warehouse_id: WH, destination_id: DEST, eta_date: null, procurement_partner_id: null,
      so_refs: null, purpose: null, note: null,
      lines: [{ sku: SKU_QTY, qty: 1, cost: null, cost_source: null, commercial_treatment: null, commercial_reason: null, expected_catalog_cost: null }],
    }])]);
    expect(r.ok, r.ok ? "" : r.why).toBe(true);
    const id = ((r as unknown as { row: { r: { po_ids: string[] } } }).row.r.po_ids)[0]!;
    await q("reset role");
    expect((await q("select is_consignment from public.purchase_orders where id = $1", [id])).rows[0].is_consignment).toBe(false);
  });
});

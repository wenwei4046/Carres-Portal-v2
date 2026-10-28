import { describe, it, expect, beforeAll, afterAll } from "vitest";
import pg from "pg";

/**
 * A PURCHASE ORDER WITH NO SOURCE, ON A REAL POSTGRESQL RUNNING THE WHOLE
 * MIGRATION CHAIN. Weisiang's decision (Mr Lim, WhatsApp 2026-10-22): office
 * staff open a PO the Houzs way — supplier, Deliver To, goods — with no
 * approved demand, no Sales Order and no request behind it. It overturns
 * Jess's "No blank independent PO" (docs/purchasing/MASTER.md); Jess was not
 * part of the decision.
 *
 * The one creation authority `purchasing_issue_pos_batch` is called exactly as
 * `POST /api/operation/pos/new` calls it, and the PO must then live a normal
 * life:
 *
 *   issue     an ordinary Operation staff member issues it; it has a number,
 *             its lines, and NO source rows of any kind
 *   stock     an exact-unit line is born with one incoming Unit ID per piece;
 *             a quantity line is born with none
 *   receive   the Office receipt posts against it and the Units arrive
 *   paper     the supplier document (`purchasing_po_document`) prints it
 *
 * Fixtures are written with triggers off inside ONE transaction that is
 * rolled back; the doors are then called with triggers ON, signed in.
 *
 *   CARRES_TEST_DATABASE_URL=postgres://postgres@localhost:<port>/<db> pnpm --filter @carres/api test -- office-new-purchase-order
 *
 * Without the URL every case is SKIPPED — reported as skipped, never as passed.
 */
const URL = process.env.CARRES_TEST_DATABASE_URL ?? "";
const LOCAL = /^postgres(ql)?:\/\/[^@/]*@?(localhost|127\.0\.0\.1|\[::1\])(:\d+)?\//.test(URL);
const RUN = Date.now() % 100000;
const HEX = RUN.toString(16).padStart(5, "0");
const uid = (tail: string) => `fffffff9-0000-4000-8000-${HEX}${tail.padStart(7, "0")}`;

const OP = uid("2");
const SUPPLIER = uid("51");
const WH = uid("61");
const DEST = uid("71");
const PARTY = uid("72");
const MODEL = uid("91");
const SKU_UNIT = `IT-NPO-U-${HEX}`;
const SKU_QTY = `IT-NPO-Q-${HEX}`;

describe.skipIf(!URL)("a Purchase Order with no source lives a normal life (real PostgreSQL, Weisiang 2026-10-22)", () => {
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
    const email = `it-npo-${HEX}@carres.test`;
    await q("insert into auth.users (id, email) values ($1, $2)", [OP, email]);
    await q("insert into app_users (id, email, name, role, status, is_person) values ($1, $2, $3, 'operation', 'active', true)", [OP, email, `IT office ${HEX}`]);
    await q("insert into suppliers (id, name, kind, slug) values ($1, $2, 'own_logistics', $3)", [SUPPLIER, `IT supplier ${HEX}`, `it-npo-${HEX}`]);
    await q("insert into warehouses (id, name, address) values ($1, $2, 'Lot 1, Jalan IT, Klang')", [WH, `IT Klang ${HEX}`]);
    await q("insert into purchasing_destinations (id, name, warehouse_id, active) values ($1, $2, $3, true)", [DEST, `IT Klang ${HEX}`, WH]);
    await q("insert into stock_operating_parties (id, code, name, kind) values ($1, $2, $3, 'warehouse_operator')", [PARTY, `it_npo_${HEX}`, `IT party ${HEX}`]);
    await q("insert into warehouse_site_profiles (site_id, operating_party_id) values ($1, $2)", [WH, PARTY]);
    const cat = (await q("select udt_name from information_schema.columns where table_name = 'product_models' and column_name = 'category'")).rows[0].udt_name as string;
    await q(`insert into product_models (id, category, model_key, name) values ($1, (enum_range(null::${cat}))[1], $2, $3)`, [MODEL, `it-npo-${HEX}`, `IT Sofa ${HEX}`]);
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

  it("an ordinary Operation staff member issues it through the one authority; it carries no source", async () => {
    await as(OP);
    const pos = [{
      supplier_id: SUPPLIER, warehouse_id: WH, destination_id: DEST, eta_date: null, procurement_partner_id: null,
      so_refs: null, purpose: null, note: "IT sourceless",
      lines: [
        { sku: SKU_UNIT, qty: 2, cost: 500, cost_source: "catalog", commercial_treatment: "normal", commercial_reason: null, expected_catalog_cost: 500 },
        { sku: SKU_QTY, qty: 3, cost: null, cost_source: null, commercial_treatment: null, commercial_reason: null, expected_catalog_cost: null },
      ],
    }];
    const r = await attempt("select public.purchasing_issue_pos_batch($1::jsonb) as r", [JSON.stringify(pos)]);
    expect(r.ok, r.ok ? "" : r.why).toBe(true);
    poId = ((r as unknown as { row: { r: { po_ids: string[] } } }).row.r.po_ids)[0]!;
    expect(poId).toMatch(/^PO/);
    await q("reset role");
    const po = (await q("select status, so_refs, purpose, destination_id from public.purchase_orders where id = $1", [poId])).rows[0];
    expect(po).toMatchObject({ status: "open", so_refs: null, purpose: null, destination_id: DEST });
    expect((await lines()).map((l) => l.demand_id)).toEqual([null, null]);
    expect(Number((await q("select count(*) from public.po_line_sources where po_id = $1", [poId])).rows[0].count)).toBe(0);
  });

  it("stock: the exact-unit line is born with one incoming Unit per piece; the quantity line with none", async () => {
    await q("reset role");
    const [qtyLine, unitLine] = await lines();
    const units = (await q("select po_line_id, status from public.ops_stock_items where po_no = $1", [poId])).rows as Array<{ po_line_id: string; status: string }>;
    expect(units.filter((u) => u.po_line_id === unitLine!.id).map((u) => u.status)).toEqual(["incoming", "incoming"]);
    expect(units.filter((u) => u.po_line_id === qtyLine!.id)).toHaveLength(0);
  });

  it("paper: the supplier document prints it", async () => {
    await as(OP);
    const r = await attempt("select public.purchasing_po_document($1) as r", [poId]);
    expect(r.ok, r.ok ? "" : r.why).toBe(true);
    const doc = (r as unknown as { row: { r: Record<string, unknown> } }).row.r;
    expect(JSON.stringify(doc)).toContain(SKU_UNIT);
    expect(JSON.stringify(doc)).toContain(SKU_QTY);
  });

  it("receive: the Office receipt posts against it and the goods arrive", async () => {
    await q("reset role");
    const [qtyLine, unitLine] = await lines();
    const codes = (await q("select unit_code from public.ops_stock_items where po_line_id = $1 order by unit_code", [unitLine!.id])).rows.map((x) => x.unit_code as string);
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
    const after = await lines();
    expect(after.map((l) => l.received_qty)).toEqual([3, 2]);
    const statuses = (await q("select status from public.ops_stock_items where po_line_id = $1", [unitLine!.id])).rows.map((x) => x.status as string);
    expect(statuses.every((s) => s !== "incoming")).toBe(true);
  });
});

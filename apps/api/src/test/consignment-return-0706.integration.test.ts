import { readFileSync } from "node:fs";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import pg from "pg";

/**
 * 0706 ON A REAL POSTGRESQL RUNNING THE WHOLE MIGRATION CHAIN: a Supplier
 * Claim whose Units are ALL supplier-owned is issued as a Consignment Return
 * (CRTN) through the same door that mints a Purchase Return (Purchasing MASTER
 * 9.10). Mixed ownership and another supplier's goods are refused.
 *
 *   LC_ALL=en_US.UTF-8 node scripts/dry-run-migrations.mjs --baseline scripts/migration-replay-baseline.json --keep
 *   CARRES_TEST_DATABASE_URL=postgres://postgres@localhost:<port>/<db> pnpm --filter @carres/api test -- consignment-return-0706
 *
 * The migration is applied INSIDE the test's transaction and rolled back, so
 * the database is left exactly as it was. Without the URL every case is
 * SKIPPED, never passed.
 */
const DB_URL = process.env.CARRES_TEST_DATABASE_URL ?? "";
const LOCAL = /^postgres(ql)?:\/\/[^@/]*@?(localhost|127\.0\.0\.1|\[::1\])(:\d+)?\//.test(DB_URL);
const RUN = Date.now() % 100000;
const HEX = RUN.toString(16).padStart(5, "0");
const uid = (tail: string) => `fffffff7-0000-4000-8000-${HEX}${tail.padStart(7, "0")}`;

const DUTY = uid("3");
const STRANGER = uid("9");
const SUPPLIER = uid("51");
const OTHER_SUPPLIER = uid("52");
const WH = uid("61");
const PO = `PO-IT7-${HEX}`;
const PO2 = `PO-IT7B-${HEX}`; // the OTHER supplier's order
const POL_P = uid("a1"); // PO line billed for the Carres-owned return
const POL_C = uid("a2"); // PO line billed for the consignment return
const GRN_P = uid("a3");
const GRN_C = uid("a4");
const BILL_P = uid("a5");
const BILL_C = uid("a6");
const C_ALL = uid("81");
const C_OWN = uid("82");
const C_MIXED = uid("83");
const C_STRANGE = uid("84");
const C_SAMENAME = uid("85");
const C_RENAMED = uid("86");
const C_BILL_P = uid("87");
const C_BILL_C = uid("88");
const code = (n: number) => `U7${RUN}-${n}-001`;

describe.skipIf(!DB_URL)("Consignment Return numbering (real PostgreSQL, 0706)", () => {
  let db: pg.Client;
  const q = (sql: string, params: unknown[] = []) => db.query(sql, params);
  type Result = { ok: true; id: string } | { ok: false; why: string; detail: string };
  const as = async (who: string) => {
    await q("reset role");
    await q("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: who, role: "authenticated" })]);
    await q("set local role authenticated");
  };
  async function issue(claim: string, units: string[]): Promise<Result> {
    await q("reset role");
    const seen = new Map(
      (await q("select id, updated_at::text as t from ops_stock_items where id = any($1::uuid[])", [units])).rows.map((r) => [r.id as string, r.t as string]),
    );
    await as(DUTY);
    await q("savepoint s");
    try {
      const body = JSON.stringify(units.map((id) => ({ stock_item_id: id, seen: seen.get(id) })));
      const r = await q("select public.purchasing_issue_purchase_return($1, $2::jsonb, null) as id", [claim, body]);
      await q("release savepoint s");
      return { ok: true, id: r.rows[0].id as string };
    } catch (e) {
      await q("rollback to savepoint s");
      const err = e as { message: string; detail?: string };
      return { ok: false, why: err.message, detail: err.detail ?? "" };
    }
  }
  const row = async (id: string) => {
    await q("reset role");
    return (await q("select pr_no, is_consignment from purchase_returns where id = $1", [id])).rows[0] as { pr_no: string; is_consignment: boolean };
  };

  beforeAll(async () => {
    if (!LOCAL) throw new Error("CARRES_TEST_DATABASE_URL must point at localhost");
    db = new pg.Client({ connectionString: DB_URL });
    await db.connect();
    await q("begin");
    const migration = readFileSync(new URL("../../../../supabase/migrations/0706_a_claim_on_supplier_owned_goods_is_returned_as_a_consignment_return.sql", import.meta.url), "utf8")
      .replace(/^begin;$/m, "").replace(/^commit;$/m, "");
    await q(migration);
    await q("set local session_replication_role = replica");
    const email = `it-0706-${RUN}@carres.test`;
    await q("insert into auth.users (id, email) values ($1, $2)", [DUTY, email]);
    await q("insert into app_users (id, email, name, role, status, is_person) values ($1, $2, 'IT operation', 'operation', 'active', true)", [DUTY, email]);
    for (const [id, name] of [[SUPPLIER, `IT Hooka ${HEX}`], [OTHER_SUPPLIER, `IT Other ${HEX}`]] as const) {
      await q("insert into suppliers (id, name, kind, slug, return_address) values ($1, $2, (select enum_range(null::supplier_kind))[1], $3, 'Lot 7, Muar')", [id, name, `it-crtn-${id.slice(-3)}-${HEX}`]);
    }
    await q("insert into warehouses (id, name, kind) values ($1, $2, 'own')", [WH, `IT Klang ${HEX}`]);
    await q("insert into purchase_orders (id, supplier_id, warehouse_id) values ($1, $2, $3), ($4, $5, $3)", [PO, SUPPLIER, WH, PO2, OTHER_SUPPLIER]);
    for (const [id, no] of [[C_ALL, "A"], [C_OWN, "B"], [C_MIXED, "C"], [C_STRANGE, "D"], [C_SAMENAME, "E"], [C_RENAMED, "F"], [C_BILL_P, "G"], [C_BILL_C, "H"]] as const) {
      await q(
        `insert into supplier_claims (id, claim_no, po_id, supplier_id, sku, product_category, claim_type, qty, photos, carres_execution, carres_execution_at)
         values ($1, $2, $3, $4, 'IT-SKU', 'other', 'damaged', 2, '[{"path":"claims/it.jpg"}]'::jsonb, 'return_to_supplier', now())`,
        [id, `SC-IT7${no}-${HEX}`, PO, SUPPLIER],
      );
    }
    const units: Array<[string, string, string | null, number, string?]> = [
      [uid("b1"), C_ALL, `IT Hooka ${HEX}`, 101], [uid("b2"), C_ALL, `IT Hooka ${HEX}`, 102],
      [uid("b3"), C_OWN, null, 103],
      [uid("b4"), C_MIXED, `IT Hooka ${HEX}`, 104], [uid("b5"), C_MIXED, null, 105],
      [uid("b6"), C_STRANGE, `IT Other ${HEX}`, 106, PO2],
      // the unit's free-text supplier NAME matches the claim's supplier, but its PO is the other supplier's
      [uid("b7"), C_SAMENAME, `IT Hooka ${HEX}`, 107, PO2],
      // the supplier was renamed since receiving: the text is stale, the PO still says who it came from
      [uid("b8"), C_RENAMED, "Old Trading Name", 108],
      // billed goods: bought as Carres stock (flipped to consignment later for the CRTN one)
      [uid("b9"), C_BILL_P, null, 109],
      [uid("ba"), C_BILL_C, null, 110],
    ];
    for (const [id, claim, supplier, n, po] of units) {
      await q(
        `insert into ops_stock_items (id, sku, warehouse_id, status, unit_code, hold_claim_id, hold_reason, held_at, identity_scope, qty, po_no, ownership, supplier)
         values ($1, 'IT-SKU', $2, 'on_hold', $3, $4, 'damaged', now(), 'unit', 1, $5, $6, $7)`,
        [id, WH, code(n), claim, po ?? PO, supplier ? "supplier_consignment" : "carres_owned", supplier],
      );
    }
    // Each billed Unit: received on a GRN, on a confirmed bill line for its PO line.
    for (const [pol, grn, bill, unit, n] of [[POL_P, GRN_P, BILL_P, uid("b9"), "P"], [POL_C, GRN_C, BILL_C, uid("ba"), "C"]] as const) {
      await q("insert into purchase_order_lines (id, po_id, sku, qty) values ($1, $2, 'IT-SKU-' || $3, 1)", [pol, PO, n]);
      await q("update ops_stock_items set po_line_id = $1 where id = $2", [pol, unit]);
      await q("insert into warehouse_receipts (id, po_id, warehouse_id, lines, status) values ($1, $2, $3, '[{\"sku\":\"IT-SKU\"}]'::jsonb, 'draft')", [grn, PO, WH]);
      await q("insert into receiving_unit_results (receipt_id, stock_item_id, unit_code, outcome) values ($1, $2, $3, 'received')", [grn, unit, code(n === "P" ? 109 : 110)]);
      await q(
        `insert into supplier_bills (id, bill_no, supplier_invoice_no, supplier_id, bill_date, po_id, ap_account_code, total_amount, status, confirmed_at, gl_entry_id)
         values ($1, $2, $2, $3, current_date, $4, '2100', 100, 'confirmed', now(), gen_random_uuid())`,
        [bill, `BILL-IT7${n}-${HEX}`, SUPPLIER, PO],
      );
      await q("insert into supplier_bill_lines (bill_id, line_no, account_code, qty, amount, unit_price, warehouse_receipt_id, po_line_id) values ($1, 1, '5000', 1, 100, 100, $2, $3)", [bill, grn, pol]);
    }
    await q("set local session_replication_role = origin");
  });

  afterAll(async () => {
    if (!db) return;
    await q("rollback").catch(() => undefined);
    await db.end();
  });

  it("Units that are all the supplier's mint a CRTN number and are marked consignment", async () => {
    const r = await issue(C_ALL, [uid("b1"), uid("b2")]);
    expect(r.ok).toBe(true);
    if (r.ok) {
      const d = await row(r.id);
      expect(d.is_consignment).toBe(true);
      expect(d.pr_no).toMatch(/^CRTN-\d{8}-\d{4}$/);
    }
  });

  it("Carres-owned Units still mint a PR number", async () => {
    const r = await issue(C_OWN, [uid("b3")]);
    expect(r.ok).toBe(true);
    if (r.ok) {
      const d = await row(r.id);
      expect(d.is_consignment).toBe(false);
      expect(d.pr_no).toMatch(/^PR-\d{8}-\d+$/);
    }
  });

  it("refuses a claim that mixes supplier-owned and Carres-owned Units, and issues nothing", async () => {
    const r = await issue(C_MIXED, [uid("b4"), uid("b5")]);
    expect(r.ok ? "" : r.detail).toBe("mixed_ownership");
    await q("reset role");
    expect((await q("select count(*)::int as n from purchase_returns where supplier_claim_id = $1", [C_MIXED])).rows[0].n).toBe(0);
  });

  it("refuses supplier-owned goods that belong to a different supplier than the claim's", async () => {
    const r = await issue(C_STRANGE, [uid("b6")]);
    expect(r.ok ? "" : r.detail).toBe("not_suppliers_goods");
  });

  it("refuses a caller with no role (NULL never passes)", async () => {
    await as(STRANGER);
    await q("savepoint s");
    await expect(q("select public.purchasing_issue_purchase_return($1, '[]'::jsonb, null)", [C_ALL])).rejects.toThrow("operation or principal only");
    await q("rollback to savepoint s");
  });

  it("the PO's supplier decides whose goods they are: a matching free-text name on another supplier's PO is refused", async () => {
    const r = await issue(C_SAMENAME, [uid("b7")]);
    expect(r.ok ? "" : r.detail).toBe("not_suppliers_goods");
  });

  it("a renamed supplier still passes: the stale text name on the Unit does not matter", async () => {
    const r = await issue(C_RENAMED, [uid("b8")]);
    expect(r.ok).toBe(true);
    if (r.ok) expect((await row(r.id)).pr_no).toMatch(/^CRTN-/);
  });

  it("a return of billed goods owes a credit, but the same goods returned as a Consignment Return owe none", async () => {
    // A Carres-owned Unit on a confirmed bill: the control. It proves the seed reaches the follow-up.
    const pr = await issue(C_BILL_P, [uid("b9")]);
    expect(pr.ok).toBe(true);
    // set_ownership (0366) can flip billed Carres stock to the supplier's; the return is then a CRTN.
    await q("reset role");
    await q("update ops_stock_items set ownership = 'supplier_consignment', supplier = $2 where id = $1", [uid("ba"), `IT Hooka ${HEX}`]);
    const cr = await issue(C_BILL_C, [uid("ba")]);
    expect(cr.ok).toBe(true);
    if (!pr.ok || !cr.ok) return;
    await q("reset role");
    await q("select public._supplier_note_followups_from_returns()");
    const n = async (id: string) => (await q("select count(*)::int as n from supplier_note_followups where purchase_return_id = $1", [id])).rows[0].n as number;
    expect(await n(pr.id)).toBe(1);
    expect(await n(cr.id)).toBe(0);
  });
});

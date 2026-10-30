import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";
import { migration } from "./stock-register-database";

/**
 * OPENING BALANCES (0705) ON REAL POSTGRESQL (PGlite), over the COMMITTED file.
 *
 * The fixture holds minimal upstream tables and production's own definitions
 * of the functions 0705 rewrites (read 2026-10-22), so the migration's rewrite
 * helper, its sanity blocks and its rolled-back walk all run here. RLS is not
 * exercised (PGlite runs as its superuser); the grants are, by the sanity block.
 *
 * Then, as Finance and as the principal: the draft, Post, the agings, the
 * payment voucher paying an opening bill, Unpaid by Supplier, the Self-check's
 * receivables, the stock value, and Reverse.
 */
const FIXTURE = readFileSync(new URL("./finance-opening-balances-0705.fixture.sql", import.meta.url), "utf8").replace(/\r\n/g, "\n");
const FIN = "aaaaaaaa-0000-4000-8000-000000000001";
const BOSS = "aaaaaaaa-0000-4000-8000-000000000002";
const PREPARER = "aaaaaaaa-0000-4000-8000-000000000003";

type Row = Record<string, unknown>;

describe("opening balances (0705, real PostgreSQL)", () => {
  let db: PGlite;
  const as = (id: string | null) => db.exec(`select set_config('request.jwt.claim.sub', '${id ?? ""}', false)`);
  const val = async <T = unknown>(sql: string, params: unknown[] = []): Promise<T> =>
    Object.values((await db.query<Row>(sql, params)).rows[0] ?? {})[0] as T;
  async function refused(sql: string, params: unknown[] = []): Promise<string | null> {
    try {
      await db.query(sql, params);
      return null;
    } catch (e) {
      const err = e as { detail?: string; code?: string; message: string };
      return err.detail || err.code || err.message;
    }
  }
  const ids: Record<string, string> = {};
  let was = "";

  beforeAll(async () => {
    db = new PGlite();
    await db.exec("set timezone = 'Asia/Kuala_Lumpur'");
    await db.exec(FIXTURE);
    // The migration, its sanity blocks and its walk (rolled back inside it).
    await db.exec(migration("0705_finance_enters_its_opening_balances"));
    await db.exec(`insert into app_users values ('${FIN}', 'Fin', 'finance'), ('${BOSS}', 'Boss', 'principal'),
      ('${PREPARER}', 'Prep', 'finance')`);
    ids.sup = await val("insert into suppliers (name) values ('Ohana') returning id");
    ids.cust = await val("insert into customers (name, phone, phone_key) values ('Lim', '0123456789', '0123456789') returning id");
    ids.o1401 = await val("insert into orders (so, customer_name, customer_phone) values (1401, 'Lim', '0123456789') returning id");
    ids.o1403 = await val("insert into orders (so, customer_name, customer_phone) values (1403, 'Lim', '0123456789') returning id");
    ids.unit = await val("insert into ops_stock_items (unit_code, sku, qty, status, ownership, created_at) values ('U-1', 'sku1', 2, 'free', 'carres_owned', '2026-09-01') returning id");
  }, 60_000);

  it("leaves the walk's rows behind: one draft, no entry", async () => {
    expect(await val("select status from fin_opening")).toBe("draft");
    expect(Number(await val("select count(*) from gl_entries"))).toBe(0);
    expect(Number(await val("select count(*) from finance_parties"))).toBe(0);
  });

  it("saves the draft and posts it once, the day before go-live, as the principal only", async () => {
    await as(FIN);
    was = (await val<{ updated_at: string }>("select fin_opening_read()")).updated_at;
    was = await val("select fin_opening_accounts_save($1::jsonb, $2::timestamptz)", [JSON.stringify([
      { account_code: "320-0000", debit: 1000 }, { account_code: "500-0000", credit: 600 },
      { account_code: "900-0001", debit: 100 }, { account_code: "150-0000", credit: 900 }]), was]);
    // Supplier 300: OH-1 200 and OH-2 150 do not tally (-50), and it still posts.
    was = (await val<{ updated_at: string }>("select fin_opening_party_save(null, 'SUPPLIER', $1::uuid, '400-0000', 300, $2::jsonb, $3::timestamptz)",
      [ids.sup, JSON.stringify([
        { doc_no: "OH-1", doc_date: "2026-07-01", due_date: "2026-08-01", amount: 200 },
        { doc_no: "OH-2", doc_date: "2026-08-15", due_date: "2026-09-15", amount: 150 }]), was])).updated_at;
    was = (await val<{ updated_at: string }>("select fin_opening_party_save(null, 'CUSTOMER', $1::uuid, '300-1000', 500, $2::jsonb, $3::timestamptz)",
      [ids.cust, JSON.stringify([{ doc_no: "INV-OLD-1", doc_date: "2026-06-01", due_date: "2026-07-01", amount: 500 }]), was])).updated_at;
    was = (await val<{ updated_at: string }>("select fin_opening_stock_save($1::jsonb, $2::timestamptz)",
      [JSON.stringify([{ unit_code: "U-1", unit_cost: 250 }]), was])).updated_at;
    was = (await val<{ updated_at: string }>("select fin_opening_deposits_save($1::jsonb, $2::timestamptz)",
      [JSON.stringify([{ order_ref: "SO-1401", amount: 300 }]), was])).updated_at;
    const read = await val<{ parties: Array<{ party_type: string; difference: string }>; totals: { debit: number; credit: number } }>("select fin_opening_read()");
    expect(Number(read.parties.find((p) => p.party_type === "SUPPLIER")!.difference)).toBe(-50);
    expect(Number(read.totals.debit)).toBe(2100);
    expect(Number(read.totals.credit)).toBe(2100);
    expect(await refused("select fin_opening_post($1::timestamptz)", [was])).toBe("opening_forbidden");
    await as(BOSS);
    const entry = await val<string>("select fin_opening_post($1::timestamptz)", [was]);
    expect(await val("select entry_date::text from gl_entries where id = $1", [entry])).toBe("2026-09-09");
    expect(await refused("select fin_opening_post($1::timestamptz)", [was])).toBe("opening_already_posted");
  });

  it("pays an opening bill by payment voucher: the bill takes it, and nothing is counted twice", async () => {
    await as(FIN);
    const items = await db.query<{ item_id: string; doc_no: string; unallocated: string }>(
      "select * from ap_opening_bill_outstanding($1::uuid)", [ids.sup]);
    ids.oh2 = items.rows.find((r) => r.doc_no === "OH-2")!.item_id;
    expect(items.rows.map((r) => [r.doc_no, Number(r.unallocated)])).toEqual([["OH-1", 200], ["OH-2", 150]]);
    const voucher = await val<string>(`select payment_voucher_save_draft(null, 'SUPPLIER_BILLS', $1::uuid, null, '2026-09-20', '320-0000',
      '[]'::jsonb, $2::jsonb)`, [ids.sup, JSON.stringify([{ opening_item_id: ids.oh2, amount: 120 }])]);
    // More than the opening bill: refused by its ceiling.
    expect(await refused(`select payment_voucher_save_draft(null, 'SUPPLIER_BILLS', $1::uuid, null, '2026-09-20', '320-0000',
      '[]'::jsonb, $2::jsonb)`, [ids.sup, JSON.stringify([{ opening_item_id: ids.oh2, amount: 40 }])])).toBe("opening_bill_over_allocated");
    // While a voucher holds it, the opening cannot be reversed.
    await as(BOSS);
    expect(await refused("select fin_opening_reverse('x')")).toBe("opening_paid_by_voucher");
    await db.query("update payment_vouchers set status = 'checked', prepared_by = $2, voucher_no = 'PV-1' where id = $1", [voucher, PREPARER]);
    await db.query("select payment_voucher_approve($1)", [voucher]);
    const line = (await db.query<Row>(`select l.account_code, l.party_id, l.debit, l.memo from gl_entry_lines l
      join gl_entries e on e.id = l.entry_id where e.source_type = 'PAYMENT_VOUCHER' and l.debit > 0`)).rows[0]!;
    expect(line).toMatchObject({ account_code: "400-0000", party_id: ids.sup, memo: "Pays opening bill OH-2" });
    expect(Number(line.debit)).toBe(120);

    await as(FIN);
    const ap = await val<{ suppliers: Array<{ supplier_id: string; balance: number; bills: Array<{ bill_no: string; open: number; kind: string }> }> }>(
      "select fin_ap_aging('2026-10-01')");
    const sup = ap.suppliers.find((s) => s.supplier_id === ids.sup)!;
    expect(Number(sup.balance)).toBe(180);
    expect(sup.bills.map((b) => [b.bill_no, Number(b.open), b.kind])).toEqual([["OH-1", 200, "opening"], ["OH-2", 30, "opening"]]);
    const owed = (await db.query<{ net_owing: string; balance_owing: string; open_bills: number }>(
      "select * from ap_outstanding($1::uuid)", [ids.sup])).rows[0]!;
    // Net owing is what the payables account holds: 300 less 120.
    expect(Number(owed.net_owing)).toBe(180);
    expect(Number(owed.balance_owing)).toBe(230);
    expect(owed.open_bills).toBe(2);
    const list = await db.query<{ doc_no: string; paid_total: string; unallocated: string }>("select * from ap_opening_bill_outstanding($1::uuid)", [ids.sup]);
    expect(list.rows.map((r) => [r.doc_no, Number(r.paid_total), Number(r.unallocated)])).toEqual([["OH-1", 0, 200], ["OH-2", 120, 30]]);
    // Money on account (no bill) is set against the oldest opening bill in AP Aging.
    await db.query(`select gl_post('IT', 'PV-IT-2', '2026-09-25', 'on account', $1::jsonb)`, [JSON.stringify([
      { account_code: "400-0000", debit: 50, party_type: "SUPPLIER", party_id: ids.sup }, { account_code: "320-0000", credit: 50 }])]);
    const ap2 = await val<{ suppliers: Array<{ supplier_id: string; bills: Array<{ bill_no: string; open: number }> }> }>("select fin_ap_aging('2026-10-01')");
    expect(ap2.suppliers.find((s) => s.supplier_id === ids.sup)!.bills.map((b) => [b.bill_no, Number(b.open)])).toEqual([["OH-1", 150], ["OH-2", 30]]);
  });

  it("AR: a deposit for an order not yet invoiced never settles an old invoice; an overpayment does", async () => {
    await as(FIN);
    const opening = async () => {
      const ar = await val<{ debtors: Array<{ party_id: string; invoices: Array<{ kind: string; open: number }> }> }>("select fin_ar_aging('2026-10-15')");
      return Number(ar.debtors.find((d) => d.party_id === ids.cust)!.invoices.find((i) => i.kind === "opening")!.open);
    };
    expect(await opening()).toBe(500);
    // A receipt of 200 on SO-1403, which has no invoice yet: the order's money.
    await db.query("insert into order_payments (order_id, amount, paid_on, receipt_no) values ($1, 200, '2026-09-20', 'RCP-1403')", [ids.o1403]);
    await db.query(`select gl_post('CUSTOMER_PAYMENT', 'RCP-1403', '2026-09-20', 'deposit', $1::jsonb)`, [JSON.stringify([
      { account_code: "320-0000", debit: 200 }, { account_code: "300-1000", credit: 200, party_type: "CUSTOMER", party_id: ids.cust }])]);
    expect(await opening()).toBe(500);
    // SO-1401 is invoiced 1,000: its opening deposit 300 fills it first; then 800 is paid, 100 more than owed.
    await db.query("insert into invoices (invoice_no, kind, order_id, issued_at, amount, tax_amount, status) values ('INV-1401', 'sales', $1, '2026-09-25', 1000, 0, 'issued')", [ids.o1401]);
    await db.query(`select gl_post('SALES_INVOICE', 'INV-1401', '2026-09-25', 'inv', $1::jsonb)`, [JSON.stringify([
      { account_code: "300-1000", debit: 1000, party_type: "CUSTOMER", party_id: ids.cust }, { account_code: "500-0000", credit: 1000 }])]);
    let ar = await val<{ debtors: Array<{ party_id: string; invoices: Array<{ invoice_no: string; open: number }> }> }>("select fin_ar_aging('2026-10-15')");
    expect(Number(ar.debtors.find((d) => d.party_id === ids.cust)!.invoices.find((i) => i.invoice_no === "INV-1401")!.open)).toBe(700);
    expect(await opening()).toBe(500);
    await db.query("insert into order_payments (order_id, amount, paid_on, receipt_no) values ($1, 800, '2026-10-01', 'RCP-1401')", [ids.o1401]);
    await db.query(`select gl_post('CUSTOMER_PAYMENT', 'RCP-1401', '2026-10-01', 'balance', $1::jsonb)`, [JSON.stringify([
      { account_code: "320-0000", debit: 800 }, { account_code: "300-1000", credit: 800, party_type: "CUSTOMER", party_id: ids.cust }])]);
    // The 100 paid beyond INV-1401 settles the old invoice; SO-1403's 200 still waits for its own invoice.
    expect(await opening()).toBe(400);
    // Once SO-1403 is invoiced for 200, its money is taken there, and the old invoice stays at 400.
    await db.query("insert into invoices (invoice_no, kind, order_id, issued_at, amount, tax_amount, status) values ('INV-1403', 'sales', $1, '2026-10-10', 200, 0, 'issued')", [ids.o1403]);
    await db.query(`select gl_post('SALES_INVOICE', 'INV-1403', '2026-10-10', 'inv', $1::jsonb)`, [JSON.stringify([
      { account_code: "300-1000", debit: 200, party_type: "CUSTOMER", party_id: ids.cust }, { account_code: "500-0000", credit: 200 }])]);
    expect(await opening()).toBe(400);
    ar = await val("select fin_ar_aging('2026-10-15')");
    const row = (ar as unknown as { debtors: Array<{ party_id: string; balance: number }> }).debtors.find((d) => d.party_id === ids.cust)!;
    // 500 - 300 + 1000 - 200 - 800 + 200: the balance is the old invoice alone.
    expect(Number(row.balance)).toBe(400);
  });

  it("the Self-check's receivables count the opening, so it is no difference", async () => {
    await as(FIN);
    const r = (await db.query<{ ledger_ar_balance: string; operational_ar_balance: string; difference: string }>(
      "select * from gl_receivables_reconcile()")).rows[0]!;
    expect(Number(r.ledger_ar_balance)).toBe(400);
    expect(Number(r.difference)).toBe(0);
  });

  it("Stock value reads the opening cost once posted", async () => {
    await as(FIN);
    const sv = await val<{ units: Array<{ unit_code: string; value: number }> }>("select fin_stock_value('2026-09-30')");
    expect(Number(sv.units.find((u) => u.unit_code === "U-1")!.value)).toBe(500);
  });

  it("reverses once the voucher is cancelled, and the opening no longer ages", async () => {
    await db.query("update payment_vouchers set status = 'cancelled'");
    await as(BOSS);
    await db.query("select fin_opening_reverse('wrong figures')");
    expect(await val("select status from fin_opening")).toBe("draft");
    await as(FIN);
    const ap = await val<{ suppliers: Array<{ supplier_id: string; bills: unknown[] }> }>("select fin_ap_aging('2026-10-01')");
    expect(ap.suppliers.find((s) => s.supplier_id === ids.sup)?.bills ?? []).toEqual([]);
    expect(Number(await val("select count(*) from gl_ledger_health() where status = 'FAIL'"))).toBe(0);
  });
});

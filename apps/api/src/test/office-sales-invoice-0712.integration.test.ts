import { describe, it, expect, beforeAll, afterAll } from "vitest";
import pg from "pg";

/**
 * 0712 ON A REAL POSTGRESQL RUNNING THE MIGRATION CHAIN — office staff open a
 * Sales Invoice by hand, part invoices included.
 *
 * Weisiang's decision (Mr Lim, WhatsApp 2026-10-22, relayed by YH 2026-10-23):
 * the Houzs way (SalesInvoiceFromDo.tsx). Overturns Jess's payment/MASTER.md
 * rules (no manual Generate invoice; one live Sales Invoice per order); Jess
 * was not part of this decision.
 *
 * One transaction, rolled back at the end. Names are invented.
 *
 *   CARRES_TEST_DATABASE_URL=postgres://postgres@localhost:<port>/<db> pnpm --filter @carres/api test -- office-sales-invoice
 *
 * Without the URL every case is SKIPPED — reported as skipped, never as passed.
 */
const URL = process.env.CARRES_TEST_DATABASE_URL ?? "";
const LOCAL = /^postgres(ql)?:\/\/[^@/]*@?(localhost|127\.0\.0\.1|\[::1\])(:\d+)?\//.test(URL);
const RUN = Date.now() % 100000;
const HEX = RUN.toString(16).padStart(5, "0");
const uid = (tail: string) => `dddddddd-0712-4000-8000-${HEX}${tail.padStart(7, "0")}`;
const U = { op: uid("1"), finance: uid("2"), principal: uid("3"), bd: uid("4") };
const SO = (n: number) => 970000 + (RUN % 1000) * 10 + n;

type Offer = {
  whole_invoice_no: string | null;
  addons_pending: boolean;
  lines: Array<{ order_line_id: string; sku: string; left: number; invoiced: number }>;
};

describe.skipIf(!URL)("office New Sales Invoice (real PostgreSQL, 0712)", () => {
  let db: pg.Client;
  let order = "";
  let other = "";
  let bed = "";
  let sofa = "";
  let first = "";
  let second = "";
  const q = (sql: string, params: unknown[] = []) => db.query(sql, params);
  const actAs = (id: string) =>
    q("select set_config('request.jwt.claims', $1, false)", [JSON.stringify({ sub: id, role: "authenticated" })]);
  async function attempt(sql: string, params: unknown[] = []) {
    await q("savepoint s");
    try {
      const r = await q(sql, params);
      await q("release savepoint s");
      return { ok: true as const, row: r.rows[0] as Record<string, unknown> };
    } catch (e) {
      await q("rollback to savepoint s");
      const err = e as { detail?: string; message: string };
      return { ok: false as const, detail: err.detail ?? err.message };
    }
  }
  const open = (orderId: string, lines: Array<[string, number]>) =>
    attempt("select public.sales_invoice_office_open($1, $2::jsonb) as r", [
      orderId, JSON.stringify(lines.map(([id, qty]) => ({ order_line_id: id, qty }))),
    ]);
  const offer = async (orderId: string) =>
    (await q("select public.sales_invoice_office_offer($1) as o", [orderId])).rows[0].o as Offer;
  const leftOf = (o: Offer, id: string) => o.lines.find((l) => l.order_line_id === id)!.left;
  const posting = async (invoiceNo: string) =>
    (await q(`select l.account_code, l.debit::numeric as debit, l.credit::numeric as credit
                from gl_entries e join gl_entry_lines l on l.entry_id = e.id
               where e.source_type = 'SALES_INVOICE' and e.source_doc_no = $1 and e.posted and not e.reversed
               order by l.debit desc, l.account_code`, [invoiceNo])).rows
      .map((r) => [r.account_code, Number(r.debit), Number(r.credit)]);

  beforeAll(async () => {
    if (!LOCAL) throw new Error("CARRES_TEST_DATABASE_URL must point at localhost");
    db = new pg.Client({ connectionString: URL });
    await db.connect();
    await q("begin");
    for (const [id, role] of [[U.op, "operation"], [U.finance, "finance"], [U.principal, "principal"], [U.bd, "bd"]] as const) {
      const email = `it-si-${role}-${RUN}@carres.test`;
      await q("insert into auth.users (id, email) values ($1, $2)", [id, email]);
      await q("insert into app_users (id, email, name, role, status, is_person) values ($1, $2, $3, $4, 'active', true)",
        [id, email, `IT ${role}`, role]);
    }
    await q("set local session_replication_role = replica");
    const dealer = (await q("insert into dealers (name, channel) values ($1, 'showroom') returning id", [`IT SI Showroom ${RUN}`])).rows[0].id;
    const sp = (await q("insert into salespersons (dealer_id, name) values ($1, $2) returning id", [dealer, `IT SI Aina ${RUN}`])).rows[0].id;
    const mk = async (n: number) =>
      (await q(`insert into orders (so, dealer_id, salesperson_id, customer_name, customer_phone, status, placed_at)
                values ($1, $2, $3, $4, '0129990712', 'proceed_order', now()) returning id`, [SO(n), dealer, sp, `IT SI CUSTOMER ${n}`])).rows[0].id as string;
    order = await mk(1);
    other = await mk(2);
    bed = (await q("insert into order_lines (order_id, sku, qty, unit_price) values ($1, 'IT-BED', 2, 1000) returning id", [order])).rows[0].id;
    sofa = (await q("insert into order_lines (order_id, sku, qty, unit_price) values ($1, 'IT-SOFA', 1, 500) returning id", [order])).rows[0].id;
    await q("insert into order_addons (order_id, addon_key, qty, unit_price) values ($1, 'DELIVERY', 1, 100)", [order]);
    await q("insert into order_lines (order_id, sku, qty, unit_price) values ($1, 'IT-BED', 1, 800)", [other]);
    await q("set local session_replication_role = origin");
  }, 30000);

  afterAll(async () => {
    if (!db) return;
    await q("rollback").catch(() => undefined);
    await db.end();
  });

  it("is for Operation, Finance and the principal only", async () => {
    await actAs(U.bd);
    expect(await open(order, [[bed, 1]])).toEqual({ ok: false, detail: "not_payment_staff" });
  });

  it("a part invoice bills only the picked goods, plus the order's add-ons the first time, and posts that much", async () => {
    await actAs(U.op);
    const r = await open(order, [[bed, 1]]);
    expect(r.ok).toBe(true);
    const inv = (r as unknown as { row: { r: { invoice: { invoice_no: string; amount: string } } } }).row.r.invoice;
    first = inv.invoice_no;
    expect(Number(inv.amount)).toBe(1100);
    // Dr receivables 1100 · Cr goods 1000 · Cr the delivery add-on 100 — not the whole order's 2600.
    const lines = await posting(first);
    expect(lines[0]![1]).toBe(1100);
    expect(lines.reduce((s, l) => s + (l[2] as number), 0)).toBe(1100);
    expect((await q("select invoice_no from orders where id = $1", [order])).rows[0].invoice_no).toBe(first);
  });

  it("a second part invoice is allowed on the same order, and nothing is billed twice", async () => {
    await actAs(U.op);
    const r = await open(order, [[bed, 1], [sofa, 1]]);
    expect(r.ok).toBe(true);
    second = (r as unknown as { row: { r: { invoice: { invoice_no: string; amount: string } } } }).row.r.invoice.invoice_no;
    expect(Number((r as unknown as { row: { r: { invoice: { amount: string } } } }).row.r.invoice.amount)).toBe(1500);
    expect((await posting(second))[0]![1]).toBe(1500);
    const o = await offer(order);
    expect([leftOf(o, bed), leftOf(o, sofa), o.addons_pending]).toEqual([0, 0, false]);
    expect(await open(order, [[bed, 1]])).toEqual({ ok: false, detail: "more_than_left" });
    const live = (await q("select count(*)::int as n from invoices where order_id = $1 and kind = 'sales' and status = 'issued'", [order])).rows[0].n;
    expect(live).toBe(2);
  });

  it("refuses a bad pick: no lines, a line of another order, a repeated line, qty 0", async () => {
    await actAs(U.op);
    const otherLine = (await q("select id from order_lines where order_id = $1", [other])).rows[0].id;
    expect(await open(other, [])).toEqual({ ok: false, detail: "nothing_picked" });
    expect(await open(other, [[bed, 1]])).toEqual({ ok: false, detail: "line_not_on_order" });
    expect(await open(other, [[otherLine, 1], [otherLine, 1]])).toEqual({ ok: false, detail: "invalid_line" });
    expect(await open(other, [[otherLine, 0]])).toEqual({ ok: false, detail: "invalid_line" });
  });

  it("the system's own doors stay shut once the office has invoiced", async () => {
    await actAs(U.op);
    const auto = await attempt("select public.issue_order_invoice($1) as r", [order]);
    expect((auto as unknown as { row: { r: { already_issued: boolean } } }).row.r.already_issued).toBe(true);
    const prep = await attempt("select public.payment_invoice_prepare($1, 2600) as r", [order]);
    expect((prep as unknown as { row: { r: { already_issued: boolean } } }).row.r.already_issued).toBe(true);
    const n = (await q("select count(*)::int as n from invoices where order_id = $1 and status <> 'voided'", [order])).rows[0].n;
    expect(n).toBe(2);
  });

  it("an order already on a whole-order invoice is not invoiced again by hand", async () => {
    await actAs(U.op);
    const whole = await attempt("select public.issue_order_invoice($1) as r", [other]);
    expect(whole.ok).toBe(true);
    // The system's whole-order invoice still recognises every line of its order.
    expect((await posting((whole as unknown as { row: { r: { invoice_no: string } } }).row.r.invoice_no))[0]![1]).toBe(800);
    const otherLine = (await q("select id from order_lines where order_id = $1", [other])).rows[0].id;
    expect(await open(other, [[otherLine, 1]])).toEqual({ ok: false, detail: "already_invoiced_whole" });
    expect((await offer(other)).whole_invoice_no).toMatch(/^INV-/);
  });

  it("the Collection report adds up both part invoices", async () => {
    await actAs(U.finance);
    const r = (await q("select public.fin_collection(current_date - 1, current_date + 1) as r")).rows[0].r as {
      orders: Array<{ id: string; billed: string; invoice_no: string }>;
    };
    const mine = r.orders.find((o) => o.id === order)!;
    expect(Number(mine.billed)).toBe(2600);
    expect(mine.invoice_no.split(", ").sort()).toEqual([first, second].sort());
  });

  it("voiding a part invoice drafts no whole-order replacement; its goods are free to invoice again", async () => {
    await actAs(U.principal);
    const v = await attempt("select public.payment_invoice_void_replace(id, 'IT wrong qty') as r from invoices where invoice_no = $1", [second]);
    expect(v.ok).toBe(true);
    expect((v as unknown as { row: { r: { replacement: unknown } } }).row.r.replacement).toBeNull();
    const drafts = (await q("select count(*)::int as n from invoices where order_id = $1 and status = 'draft'", [order])).rows[0].n;
    expect(drafts).toBe(0);
    // The order keeps wearing the other live invoice, so dispatch and Generate invoice stay shut.
    expect((await q("select invoice_no from orders where id = $1", [order])).rows[0].invoice_no).toBe(first);
    await actAs(U.op);
    const o = await offer(order);
    expect([leftOf(o, bed), leftOf(o, sofa)]).toEqual([1, 1]);
    expect(await posting(second)).toEqual([]);
  });

  it("voiding the invoice that carried the add-ons puts them on the next one", async () => {
    await actAs(U.op);
    const third = await open(order, [[sofa, 1]]);
    expect(Number((third as unknown as { row: { r: { invoice: { amount: string } } } }).row.r.invoice.amount)).toBe(500);
    await actAs(U.principal);
    expect((await attempt("select public.payment_invoice_void_replace(id, 'IT add-on move') as r from invoices where invoice_no = $1", [first])).ok).toBe(true);
    await actAs(U.op);
    expect((await offer(order)).addons_pending).toBe(true);
    const fourth = await open(order, [[bed, 1]]);
    expect(Number((fourth as unknown as { row: { r: { invoice: { amount: string } } } }).row.r.invoice.amount)).toBe(1100);
  });

  it("a snapshot sent straight to payment_invoice_issue cannot claim to be an office invoice", async () => {
    await actAs(U.op);
    const draft = (await q(`insert into invoices (order_id, amount, tax_amount, kind, status)
                            values ($1, 500, 0, 'sales', 'draft') returning id`, [order])).rows[0].id;
    const r = await attempt("select public.payment_invoice_issue($1, $2::jsonb) as r",
      [draft, JSON.stringify({ kind: "sales", issued_from: "office", lines: [] })]);
    expect(r).toEqual({ ok: false, detail: "office_snapshot_mismatch" });
  });
});

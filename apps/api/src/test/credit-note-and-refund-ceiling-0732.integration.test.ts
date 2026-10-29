import { describe, it, expect, beforeAll, afterAll } from "vitest";
import pg from "pg";

/**
 * 0730 + 0732 ON A REAL POSTGRESQL RUNNING THE MIGRATION CHAIN — a credit note
 * posts a balanced journal split over the income the invoice credited, is
 * capped at what the order still owes under the order's lock, is dated in KL,
 * and voids back to zero. A refund ask cannot add up to more than was paid.
 *
 * One transaction, rolled back at the end. Names are invented.
 *
 *   PG_BIN=<postgres bin> node scripts/dry-run-migrations.mjs --baseline scripts/migration-replay-baseline.json --keep
 *   CARRES_TEST_DATABASE_URL=postgres://postgres@localhost:<port>/<db> pnpm --filter @carres/api test -- credit-note-and-refund
 *
 * Without the URL every case is SKIPPED — reported as skipped, never as passed.
 */
const URL = process.env.CARRES_TEST_DATABASE_URL ?? "";
const LOCAL = /^postgres(ql)?:\/\/[^@/]*@?(localhost|127\.0\.0\.1|\[::1\])(:\d+)?\//.test(URL);
const RUN = Date.now() % 100000;
const HEX = RUN.toString(16).padStart(5, "0");
const uid = (tail: string) => `dddddddd-0732-4000-8000-${HEX}${tail.padStart(7, "0")}`;
const U = { op: uid("1"), finance: uid("2") };
const SO = 973200 + (RUN % 100);

describe.skipIf(!URL)("credit notes and the refund ceiling (real PostgreSQL, 0732)", () => {
  let db: pg.Client;
  let order = "";
  let invoiceId = "";
  let invoiceNo = "";
  let noteId = "";
  let noteNo = "";
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
  const asReplica = async (sql: string, params: unknown[] = []) => {
    await q("set local session_replication_role = replica");
    await q(sql, params);
    await q("set local session_replication_role = origin");
  };
  const credit = (amount: number) =>
    attempt("select * from public.issue_credit_note($1, $2, 'IT wrong colour')", [invoiceId, amount]);
  const lines = async (source: string, docNo: string) =>
    (await q(`select l.account_code, l.debit::float as debit, l.credit::float as credit
                from gl_entries e join gl_entry_lines l on l.entry_id = e.id
               where e.source_type = $1 and e.source_doc_no = $2 and e.posted
               order by l.account_code`, [source, docNo])).rows as Array<{ account_code: string; debit: number; credit: number }>;
  const credited = async () => Number((await q("select credited from orders where id = $1", [order])).rows[0].credited);

  beforeAll(async () => {
    if (!LOCAL) throw new Error("CARRES_TEST_DATABASE_URL must point at localhost");
    db = new pg.Client({ connectionString: URL });
    await db.connect();
    await q("begin");
    for (const [id, role] of [[U.op, "operation"], [U.finance, "finance"]] as const) {
      const email = `it-cn-${role}-${RUN}@carres.test`;
      await q("insert into auth.users (id, email) values ($1, $2)", [id, email]);
      await q("insert into app_users (id, email, name, role, status, is_person) values ($1, $2, $3, $4, 'active', true)",
        [id, email, `IT ${role}`, role]);
    }
    await q("set local session_replication_role = replica");
    const dealer = (await q("insert into dealers (name, channel) values ($1, 'showroom') returning id", [`IT CN Showroom ${RUN}`])).rows[0].id;
    const sp = (await q("insert into salespersons (dealer_id, name) values ($1, $2) returning id", [dealer, `IT CN Aina ${RUN}`])).rows[0].id;
    order = (await q(`insert into orders (so, dealer_id, salesperson_id, customer_name, customer_phone, status, placed_at)
                      values ($1, $2, $3, 'IT CN CUSTOMER', '0129990732', 'proceed_order', now()) returning id`, [SO, dealer, sp])).rows[0].id;
    await q("insert into order_lines (order_id, sku, qty, unit_price) values ($1, 'IT-BED', 1, 1000)", [order]);
    await q("insert into order_addons (order_id, addon_key, qty, unit_price) values ($1, 'DELIVERY', 1, 100)", [order]);
    // The invoice and its journal, as the issue door leaves them: Dr receivables
    // 1,100 · Cr 4100 Furniture sales 1,000 · Cr 4300 Delivery income 100.
    invoiceNo = `IT-SI-0732-${RUN}`;
    invoiceId = (await q(`insert into invoices (order_id, invoice_no, amount, kind, status, issued_at)
                          values ($1, $2, 1100, 'sales', 'issued', (timezone('Asia/Kuala_Lumpur', now()))::date) returning id`,
      [order, invoiceNo])).rows[0].id;
    await q("set local session_replication_role = origin");
    await q(`select public.gl_post('SALES_INVOICE', $1, (timezone('Asia/Kuala_Lumpur', now()))::date, 'IT invoice', jsonb_build_array(
               jsonb_build_object('account_code', public.gl_ar_control_account(), 'debit', 1100, 'credit', 0,
                                  'party_type', 'CUSTOMER', 'party_id', public.gl_customer_party_for_order($2)),
               jsonb_build_object('account_code', '4100', 'debit', 0, 'credit', 1000),
               jsonb_build_object('account_code', '4300', 'debit', 0, 'credit', 100)))`, [invoiceNo, order]);
  }, 30000);

  afterAll(async () => {
    if (!db) return;
    await q("rollback").catch(() => undefined);
    await db.end();
  });

  it("posts a balanced journal: Dr each income account in the invoice's proportion, Cr receivables", async () => {
    await actAs(U.finance);
    const r = await credit(110);
    expect(r).toEqual({ ok: true, row: expect.anything() });
    noteId = r.ok ? String(r.row.id) : "";
    noteNo = r.ok ? String(r.row.credit_note_no) : "";
    const inv = await lines("SALES_INVOICE", invoiceNo);
    const cn = await lines("CREDIT_NOTE", noteNo);
    const sum = (ls: typeof cn, k: "debit" | "credit") => Math.round(ls.reduce((s, l) => s + l[k], 0) * 100);
    expect(sum(cn, "debit")).toBe(11000);
    expect(sum(cn, "credit")).toBe(11000);
    // The invoice credited 4100 1,000 and 4300 100: the note debits the same accounts, 100 and 10.
    expect(inv.filter((l) => l.credit > 0).map((l) => [l.account_code, l.credit])).toEqual([["4100", 1000], ["4300", 100]]);
    expect(cn.filter((l) => l.debit > 0).map((l) => [l.account_code, l.debit])).toEqual([["4100", 100], ["4300", 10]]);
    expect(await credited()).toBe(110);
  });

  it("is dated today in Kuala Lumpur", async () => {
    const r = await q(`select note_date = (timezone('Asia/Kuala_Lumpur', now()))::date as kl from sales_credit_notes where id = $1`, [noteId]);
    expect(r.rows[0].kl).toBe(true);
  });

  it("refuses a credit above what the order still owes, inside the function", async () => {
    // RM 1,100 - 110 credited - 900 paid = RM 90 still owed.
    await asReplica("update orders set paid = 900 where id = $1", [order]);
    await actAs(U.finance);
    expect(await credit(90.01)).toEqual({ ok: false, detail: "credit_exceeds_owing" });
    expect(await credited()).toBe(110);
  });

  it("void gives the credit back and the ledger nets to zero", async () => {
    await actAs(U.finance);
    expect((await attempt("select (public.void_credit_note($1, 'IT issued by mistake')).status", [noteId])).ok).toBe(true);
    expect(await credited()).toBe(0);
    const net = await q(`select coalesce(sum(l.debit - l.credit), 0)::float as v, count(distinct e.id)::int as n
                           from gl_entries e join gl_entry_lines l on l.entry_id = e.id
                          where e.posted and e.id in (select x.id from gl_entries x where x.source_type = 'CREDIT_NOTE' and x.source_doc_no = $1
                                                      union select x.reversed_by from gl_entries x where x.source_type = 'CREDIT_NOTE' and x.source_doc_no = $1)
                            and l.account_code = public.gl_ar_control_account()`, [noteNo]);
    expect(net.rows[0].v).toBe(0);
    expect(net.rows[0].n).toBe(2);
  });

  it("a refund ask cannot add up to more than the customer paid", async () => {
    await actAs(U.op);
    const ask = (amount: number) => attempt("select public.refund_request($1, $2, 'IT changed mind') as r", [order, amount]);
    expect((await ask(500)).ok).toBe(true);
    expect(await ask(400.01)).toEqual({ ok: false, detail: "refund_exceeds_paid" });
    expect((await ask(400)).ok).toBe(true);
    expect(await ask(0.01)).toEqual({ ok: false, detail: "refund_exceeds_paid" });
  });
});

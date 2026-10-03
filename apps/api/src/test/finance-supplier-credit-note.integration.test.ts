import { describe, it, expect, beforeAll, afterAll } from "vitest";
import pg from "pg";

/**
 * 0642 ON A REAL POSTGRESQL RUNNING THE WHOLE MIGRATION CHAIN: supplier credit
 * notes (Chew 2026-10-03, docs/finance/MASTER.md §3.2). A bill and a credit
 * note go through the real doors: the note posts, is knocked off the bill,
 * keeps a voucher from paying what it took off, is taken off again and
 * cancelled. AP · Payables and the ledger agree at every step.
 *
 * One transaction, rolled back at the end.
 *
 *   PG_BIN=<postgres bin> node scripts/dry-run-migrations.mjs --baseline scripts/migration-replay-baseline.json --keep
 *   CARRES_TEST_DATABASE_URL=postgres://postgres@localhost:<port>/<db> pnpm --filter @carres/api test -- finance-supplier-credit-note
 *
 * Without the URL every case is SKIPPED — reported as skipped, never as passed.
 */
const URL = process.env.CARRES_TEST_DATABASE_URL ?? "";
const LOCAL = /^postgres(ql)?:\/\/[^@/]*@?(localhost|127\.0\.0\.1|\[::1\])(:\d+)?\//.test(URL);
const RUN = Date.now() % 100000;
const HEX = RUN.toString(16).padStart(5, "0");
const uid = (tail: string) => `dddddddd-0000-4000-8000-${HEX}${tail.padStart(7, "0")}`;
const U = { finance: uid("1"), principal: uid("2"), operation: uid("3") };

describe.skipIf(!URL)("supplier credit notes (real PostgreSQL, 0642)", () => {
  let db: pg.Client;
  let onDate = "";
  let supplierId = "";
  let billA = "";
  let noteId = "";
  let applicationId = "";
  let expense = "";
  let income = "";
  let bank = "";
  let trade = "";
  let advance = "";
  let heading = "";
  const q =(sql: string, params: unknown[] = []) => db.query(sql, params);
  const actAs = (id: string | null) =>
    q("select set_config('request.jwt.claims', $1, false)", [id ? JSON.stringify({ sub: id, role: "authenticated" }) : ""]);
  async function attempt(sql: string, params: unknown[] = []): Promise<{ ok: true; value: unknown } | { ok: false; detail: string }> {
    await q("savepoint s");
    try {
      const r = await q(sql, params);
      await q("release savepoint s");
      return { ok: true, value: r.rows[0] ? Object.values(r.rows[0])[0] : null };
    } catch (e) {
      await q("rollback to savepoint s");
      return { ok: false, detail: (e as { detail?: string }).detail ?? (e as Error).message };
    }
  }
  /** The refusal's own words, for a check on what the person reads. */
  async function refusalWords(sql: string, params: unknown[] = []): Promise<string> {
    await q("savepoint w");
    try {
      await q(sql, params);
      await q("release savepoint w");
      return "";
    } catch (e) {
      await q("rollback to savepoint w");
      return (e as Error).message;
    }
  }
  const sen =(n: number | string) => Math.round(Number(n) * 100);
  const lines = (...ls: Array<[string, string, number]>) =>
    JSON.stringify(ls.map(([account_code, description, amount]) => ({ account_code, description, amount, department_type: "OFFICE" })));
  const lineInc = (account_code: string, description: string, amount: number) =>
    ({ account_code, description, amount, department_type: "SUBSCRIPTION" });
  const saveNote = (paper: string, ls: string, id: string | null = null) =>
    attempt("select public.supplier_credit_note_save_draft($1, $2, $3, $4::date, $5::jsonb) as id", [id, supplierId, paper, onDate, ls]);
  /** What the supplier's payables accounts hold in the ledger: credit less debit. */
  const ledgerOwed = async () => sen((await q(`
      select coalesce(sum(l.credit - l.debit), 0) as v from gl_entry_lines l join gl_entries e on e.id = l.entry_id
       where e.posted and l.party_type = 'SUPPLIER' and l.party_id = $1
         and l.account_code in (select code from gl_accounts where is_control and control_for = 'SUPPLIER')`, [supplierId])).rows[0].v);
  const outstanding = async () => {
    await actAs(U.finance);
    return (await q("select * from public.ap_outstanding($1)", [supplierId])).rows[0] as Record<string, string>;
  };
  const paidOn = async (bill: string) => (await q("select paid::float as paid, held::float as held from public.ap_bill_paid($1)", [bill])).rows[0];

  beforeAll(async () => {
    if (!LOCAL) throw new Error("CARRES_TEST_DATABASE_URL must point at localhost");
    db = new pg.Client({ connectionString: URL });
    await db.connect();
    await q("begin");
    await q("update gl_config set go_live_on = coalesce(go_live_on, date '2026-01-01') where id");
    onDate = (await q("select greatest(timezone('Asia/Kuala_Lumpur', now())::date, (select go_live_on from gl_config where id) + 20)::text as d")).rows[0].d;
    for (const [id, role] of [[U.finance, "finance"], [U.principal, "principal"], [U.operation, "operation"]] as const) {
      const email = `it-scn-${role}-${RUN}@carres.test`;
      await q("insert into auth.users (id, email) values ($1, $2)", [id, email]);
      await q("insert into app_users (id, email, name, role, status, is_person) values ($1, $2, $3, $4, 'active', true)", [id, email, `IT ${role}`, role]);
    }
    supplierId = (await q("insert into suppliers (name, kind, slug) values ($1, 'factory_pickup', $2) returning id",
      [`IT credit note supplier ${RUN}`, `it-scn-supplier-${RUN}`])).rows[0].id as string;
    const acct = (await q(`
      select (select a.code from gl_accounts a where a.is_active and not a.is_control and a.kind = 'EXPENSE'
                and not public.ap_account_is_money(a.code)
                and not a.is_heading order by a.code limit 1) as expense,
             (select a.code from gl_accounts a where a.is_active and not a.is_control and a.kind = 'INCOME'
                and not a.is_heading order by a.code limit 1) as income,
             (select m.account_code from gl_money_accounts m where m.money_kind = 'BANK' and m.is_active order by m.account_code limit 1) as bank,
             public.gl_account_for('TRADE_PAYABLE') as trade,
             public.gl_account_for('SUPPLIER_ADVANCE') as advance,
             (select a.code from gl_accounts a where a.is_active and a.is_heading and a.kind = 'EXPENSE' order by a.code limit 1) as heading`)).rows[0];
    ({ expense, income, bank, trade, advance, heading } = acct);

    await actAs(U.finance);
    billA = (await q("select public.supplier_bill_save_draft(null, $1, $2, ($3::date - 10), $4::jsonb) as id",
      [supplierId, `IT-SCN-BILL-${RUN}`, onDate, lines([expense, "IT goods", 1000])])).rows[0].id as string;
    await q("select public.supplier_bill_confirm($1)", [billA]);
  }, 30000);

  afterAll(async () => {
    if (!db) return;
    await q("rollback").catch(() => undefined);
    await db.end();
  });

  it("only Finance enters a credit note, and its lines take back a cost or record a rebate", async () => {
    await actAs(U.operation);
    expect(await saveNote(`IT-CN-${RUN}`, lines([expense, "x", 10]))).toEqual({ ok: false, detail: "not_finance" });
    await actAs(U.finance);
    expect(await saveNote(`IT-CN-${RUN}`, lines([trade, "x", 10]))).toEqual({ ok: false, detail: "account_is_control" });
    // 0554: the advance account is found by its role; 0580: a heading by its stored flag.
    expect(await saveNote(`IT-CN-${RUN}`, lines([advance, "x", 10]))).toEqual({ ok: false, detail: "account_kept_by_own_documents" });
    expect(await saveNote(`IT-CN-${RUN}`, lines([heading, "x", 10]))).toEqual({ ok: false, detail: "account_is_heading" });
    // A heading with nothing under it yet is still a heading (0580 / 0608).
    const emptyHeading = (await q(`select public.gl_account_add(null,
        (select min(c)::text from generate_series(8900, 8999) c where not exists (select 1 from gl_accounts where code = c::text)),
        'IT empty heading', null, null, true, 'EXPENSE') as code`)).rows[0].code as string;
    expect(await saveNote(`IT-CN-${RUN}`, lines([emptyHeading, "x", 10]))).toEqual({ ok: false, detail: "account_is_heading" });
    const offered = (await q("select code from public.ap_account_choices() where for_credit_line")).rows.map((r) => r.code as string);
    expect(offered).toEqual(expect.arrayContaining([expense, income]));
    for (const never of [advance, heading, emptyHeading, trade, bank]) expect(offered).not.toContain(never);
    // 0560: a tab or a line break is not a word.
    expect(await saveNote("\t", lines([expense, "x", 10]))).toEqual({ ok: false, detail: "paper_no_missing" });
    expect(await saveNote(`IT-CN-${RUN}`, lines([expense, "\t\n", 10]))).toEqual({ ok: false, detail: "line_needs_description" });
    expect(await saveNote(`IT-CN-${RUN}`, lines([bank, "x", 10]))).toEqual({ ok: false, detail: "account_is_money" });
    expect(await saveNote(`IT-CN-${RUN}`, "[]")).toEqual({ ok: false, detail: "no_lines" });
  });

  it("confirming posts Dr the payables account for the supplier, Cr each line; the paper cannot be entered twice", async () => {
    await actAs(U.finance);
    const saved = await saveNote(`IT-CN-${RUN}`, JSON.stringify([
      { account_code: expense, description: "IT two chairs returned", amount: 300, department_type: "OFFICE" },
      lineInc(income, "IT rebate", 50),
    ]));
    expect(saved.ok, JSON.stringify(saved)).toBe(true);
    noteId = (saved as { value: string }).value;
    expect(await saveNote(`it-cn-${RUN}`, lines([expense, "again", 5]))).toEqual({ ok: false, detail: "paper_already_entered" });

    const before = await ledgerOwed();
    const confirmed = await attempt("select public.supplier_credit_note_confirm($1)", [noteId]);
    expect(confirmed.ok, JSON.stringify(confirmed)).toBe(true);
    const note = (await q("select note_no, status, total_amount::float as total from supplier_credit_notes where id = $1", [noteId])).rows[0];
    expect(note).toMatchObject({ status: "confirmed", total: 350 });
    expect(note.note_no).toMatch(/^SCN-\d{8}-\d{4}$/);
    const posted = (await q(`select l.account_code, l.debit::float as debit, l.credit::float as credit, l.party_id
                               from supplier_credit_notes n join gl_entry_lines l on l.entry_id = n.gl_entry_id
                              where n.id = $1 order by l.line_no`, [noteId])).rows;
    expect(posted[0]).toMatchObject({ account_code: trade, debit: 350, credit: 0, party_id: supplierId });
    expect(posted.slice(1).map((p) => [p.account_code, p.credit])).toEqual([[expense, 300], [income, 50]]);
    expect(before - (await ledgerOwed())).toBe(35000);
  });

  it("AP · Payables subtracts the credit not knocked off, so it still equals the ledger", async () => {
    const o = await outstanding();
    expect(sen(o.balance_owing)).toBe(100000);
    expect(sen(o.credit_open)).toBe(35000);
    expect(sen(o.net_owing)).toBe(await ledgerOwed());
  });

  it("a knock-off pays part of the bill, posts nothing, and keeps a voucher from paying it again", async () => {
    await actAs(U.finance);
    const ledgerBefore = await ledgerOwed();
    const applied = await attempt("select public.supplier_credit_note_apply($1, $2, 200)", [noteId, billA]);
    expect(applied.ok, JSON.stringify(applied)).toBe(true);
    applicationId = (applied as { value: string }).value;
    expect(await ledgerOwed()).toBe(ledgerBefore);
    expect(await paidOn(billA)).toEqual({ paid: 200, held: 200 });
    const o = await outstanding();
    expect([sen(o.balance_owing), sen(o.credit_open), sen(o.net_owing)]).toEqual([80000, 15000, await ledgerOwed()]);

    expect(await attempt("select public.supplier_credit_note_apply($1, $2, 200)", [noteId, billA]))
      .toEqual({ ok: false, detail: "already_applied" });
    // The bill has 800 left: a voucher may not take 900 of it.
    const tooMuch = await attempt(
      `select public.payment_voucher_save_draft(null, 'SUPPLIER_BILLS', $1, 'IT payee', $2::date, $3, '[]'::jsonb,
               jsonb_build_array(jsonb_build_object('bill_id', $4::text, 'amount', 900))) as id`,
      [supplierId, onDate, bank, billA]);
    expect(tooMuch.ok).toBe(false);

    // A bill with a credit note on it is not cancelled, and the refusal names the credit note.
    await actAs(U.principal);
    expect(await attempt("select public.supplier_bill_cancel($1, 'IT')", [billA])).toEqual({ ok: false, detail: "bill_allocated" });
    expect(await refusalWords("select public.supplier_bill_cancel($1, 'IT')", [billA])).toMatch(/credit note/);
  });

  it("the bill lists the knock-off among its payments", async () => {
    await actAs(U.finance);
    const doc = (await q("select public.supplier_bill_document($1) as d", [billA])).rows[0].d;
    expect(doc.payments).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: "credit_note", application_id: applicationId, voucher_id: noteId, status: "applied" }),
    ]));
  });

  it("a confirmed note with a knock-off is not cancelled; taken off, the approver may cancel it, and it is reversed", async () => {
    // 0560: a tab or a line break is not a reason.
    await actAs(U.principal);
    expect(await attempt("select public.supplier_credit_note_cancel($1, $2)", [noteId, "\t"])).toEqual({ ok: false, detail: "reason_missing" });
    await actAs(U.finance);
    expect(await attempt("select public.supplier_credit_note_application_cancel($1, $2)", [applicationId, "\n"]))
      .toEqual({ ok: false, detail: "reason_missing" });
    expect(await attempt("select public.supplier_credit_note_cancel($1, 'IT')", [noteId]))
      .toEqual({ ok: false, detail: "not_finance_approver" });
    await actAs(U.principal);
    expect(await attempt("select public.supplier_credit_note_cancel($1, 'IT')", [noteId]))
      .toEqual({ ok: false, detail: "note_knocked_off" });

    await actAs(U.finance);
    const takenOff = await attempt("select public.supplier_credit_note_application_cancel($1, 'IT wrong bill')", [applicationId]);
    expect(takenOff.ok, JSON.stringify(takenOff)).toBe(true);
    expect(await paidOn(billA)).toBeUndefined();

    await actAs(U.principal);
    const cancelled = await attempt("select public.supplier_credit_note_cancel($1, 'IT entered by mistake')", [noteId]);
    expect(cancelled.ok, JSON.stringify(cancelled)).toBe(true);
    expect(await ledgerOwed()).toBe(100000);
    const o = await outstanding();
    expect([sen(o.credit_open), sen(o.net_owing)]).toEqual([0, 100000]);
  });

  it("AP aging on the day ties to the books with credit notes in play", async () => {
    await actAs(U.finance);
    const a = (await q("select public.fin_ap_aging($1::date) as a", [onDate])).rows[0].a as {
      controls: Array<{ balance: number }>; suppliers: Array<{ balance: number }>;
    };
    expect(a.suppliers.reduce((t, s) => t + sen(s.balance), 0)).toBe(a.controls.reduce((t, c) => t + sen(c.balance), 0));
  });
});

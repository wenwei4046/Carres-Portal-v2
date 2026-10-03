import { describe, it, expect, beforeAll, afterAll } from "vitest";
import pg from "pg";

/**
 * 0637 ON A REAL POSTGRESQL RUNNING THE WHOLE MIGRATION CHAIN: Daily Bank
 * (Chew 2026-10-03, docs/finance/MASTER.md §3.4). For one day, every money
 * account: the day before, the day's money in and out with who it was, and
 * the checked vouchers waiting to pay out of it.
 *
 * Everything runs inside ONE transaction that is rolled back at the end, so
 * the suite writes nothing that survives it. The ledger may already hold
 * entries, so every figure is read as a CHANGE from a reading taken first.
 *
 *   PG_BIN=<postgres bin> node scripts/dry-run-migrations.mjs --baseline scripts/migration-replay-baseline.json --keep
 *   CARRES_TEST_DATABASE_URL=postgres://postgres@localhost:<port>/<db> pnpm --filter @carres/api test -- finance-daily-bank
 *
 * Without the URL every case is SKIPPED — reported as skipped, never as passed.
 */
const URL = process.env.CARRES_TEST_DATABASE_URL ?? "";
const LOCAL = /^postgres(ql)?:\/\/[^@/]*@?(localhost|127\.0\.0\.1|\[::1\])(:\d+)?\//.test(URL);
const RUN = Date.now() % 100000;
const HEX = RUN.toString(16).padStart(5, "0");
const uid = (tail: string) => `dddddddd-0000-4000-8000-${HEX}${tail.padStart(7, "0")}`;
const U = { preparer: uid("1"), checker: uid("2"), principal: uid("3"), operation: uid("4") };
const POS = uid("a1");

type Line = { entry_no: string; source_type: string; source_doc_no: string; description: string | null; party_name: string | null; received: number; paid: number };
type Account = {
  account_code: string; name: string; money_kind: string; is_active: boolean;
  brought_forward: number; received: number; paid: number; pending: number;
  pending_vouchers: Array<{ voucher_id: string; voucher_no: string | null; payee_name: string; voucher_date: string; amount: number }>;
  lines: Line[];
};
type Day = { day: string; go_live_on: string | null; accounts: Account[] };

describe.skipIf(!URL)("Daily Bank (real PostgreSQL, 0637)", () => {
  let db: pg.Client;
  let onDate = "";
  let nextDay = "";
  let bank = "";
  let holding = "";
  let payables = "";
  let expense = "";
  let supplierId = "";
  const supplierName = `IT daily bank supplier ${RUN}`;
  const q = (sql: string, params: unknown[] = []) => db.query(sql, params);
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
  /** One day, read as Finance. */
  async function daily(day: string): Promise<Day> {
    await actAs(U.preparer);
    const r = await attempt("select public.fin_daily_bank($1::date) as d", [day]);
    if (!r.ok) throw new Error(`fin_daily_bank refused: ${r.detail}`);
    return r.value as Day;
  }
  const acct = (d: Day, code: string): Account => {
    const a = d.accounts.find((x) => x.account_code === code);
    if (!a) throw new Error(`account ${code} is not on Daily Bank`);
    return a;
  };
  const sen = (n: number) => Math.round(Number(n) * 100);
  /** Posts straight through the ledger's one gate, as the documents do. */
  const post = (doc: string, narration: string, lines: unknown[]) =>
    q("select public.gl_post('IT_0637', $1, $2::date, $3, $4::jsonb) as id", [doc, onDate, narration, JSON.stringify(lines)]).then(
      (r) => r.rows[0].id as string,
    );

  beforeAll(async () => {
    if (!LOCAL) throw new Error("CARRES_TEST_DATABASE_URL must point at localhost");
    db = new pg.Client({ connectionString: URL });
    await db.connect();
    await q("begin");
    await q("update gl_config set go_live_on = coalesce(go_live_on, date '2026-01-01') where id");
    const days = (
      await q(`select d::text as on_date, (d + 1)::text as next_day
                 from (select greatest(timezone('Asia/Kuala_Lumpur', now())::date,
                                       (select go_live_on from gl_config where id)) as d) x`)
    ).rows[0];
    onDate = days.on_date;
    nextDay = days.next_day;

    const leaf = "not exists (select 1 from gl_accounts c where c.parent_code = a.code)";
    const pick = (
      await q(`
        select (select m.account_code from gl_money_accounts m join gl_accounts a on a.code = m.account_code
                 where m.money_kind = 'BANK' and m.is_active and a.is_active and ${leaf}
                 order by m.account_code limit 1) as bank,
               (select m.account_code from gl_money_accounts m join gl_accounts a on a.code = m.account_code
                 where m.money_kind = 'HOLDING' and m.is_active and a.is_active and ${leaf}
                 order by m.account_code limit 1) as holding,
               (select a.code from gl_accounts a
                 where a.is_active and a.is_control and a.control_for = 'SUPPLIER' and ${leaf}
                 order by a.code limit 1) as payables,
               (select a.code from gl_accounts a
                 where a.is_active and not a.is_control and a.kind = 'EXPENSE'
                   and not public.ap_account_is_money(a.code) and ${leaf}
                 order by a.code limit 1) as expense`)
    ).rows[0];
    ({ bank, holding, payables, expense } = pick);
    for (const [k, v] of Object.entries(pick)) if (!v) throw new Error(`the chain has no ${k} account to test with`);

    await q("insert into org_positions (id, name, band) values ($1, $2, 'executive')", [POS, `IT db ${RUN}`]);
    const people: Array<[string, string, string | null]> = [
      [U.preparer, "finance", POS],
      [U.checker, "finance", POS],
      [U.principal, "principal", null],
      [U.operation, "operation", POS],
    ];
    for (const [id, role, position] of people) {
      const email = `it-db-${role}-${id.slice(-4)}-${RUN}@carres.test`;
      await q("insert into auth.users (id, email) values ($1, $2)", [id, email]);
      await q("insert into app_users (id, email, name, role, status, position_id, is_person) values ($1, $2, $3, $4, 'active', $5, true)", [
        id, email, `IT ${role} ${id.slice(-4)}`, role, position,
      ]);
    }
    supplierId = (
      await q("insert into suppliers (name, kind, slug) values ($1, 'factory_pickup', $2) returning id", [supplierName, `it-db-supplier-${RUN}`])
    ).rows[0].id as string;
  }, 30000);

  afterAll(async () => {
    if (!db) return;
    await q("rollback").catch(() => undefined);
    await db.end();
  });

  it("only Finance or the principal may read it", async () => {
    await actAs(U.operation);
    expect(await attempt("select public.fin_daily_bank($1::date)", [onDate])).toEqual({ ok: false, detail: "not_internal" });
    await actAs(null);
    expect(await attempt("select public.fin_daily_bank($1::date)", [onDate])).toEqual({ ok: false, detail: "not_internal" });
    await actAs(U.principal);
    expect((await attempt("select public.fin_daily_bank($1::date)", [onDate])).ok).toBe(true);
  });

  it("asks for a day", async () => {
    await actAs(U.preparer);
    expect(await attempt("select public.fin_daily_bank(null)")).toEqual({ ok: false, detail: "day_missing" });
  });

  it("lists every money account that takes postings once, cash first, then bank, then holding", async () => {
    const d = await daily(onDate);
    expect(d.day).toBe(onDate);
    const listed = (
      await q(`select count(*)::int as n from gl_money_accounts m
                where not exists (select 1 from gl_accounts c where c.parent_code = m.account_code)`)
    ).rows[0].n as number;
    expect(d.accounts).toHaveLength(listed);
    expect(new Set(d.accounts.map((a) => a.account_code)).size).toBe(listed);
    const order = d.accounts.map((a) => ({ CASH: 1, BANK: 2, HOLDING: 3 })[a.money_kind]);
    expect(order).toEqual([...order].sort());
  });

  it("a money account that has become a heading leaves the board, as it does on the Dashboard", async () => {
    const heading = `IT${HEX}H`;
    await q(
      `insert into gl_accounts (code, name, kind, parent_code, is_control, is_active)
       select $1, 'IT heading', 'ASSET', parent_code, false, true from gl_accounts where code = $2`,
      [heading, bank],
    );
    await q("insert into gl_money_accounts (account_code, money_kind) values ($1, 'BANK')", [heading]);
    expect((await daily(onDate)).accounts.some((a) => a.account_code === heading)).toBe(true);
    await q("insert into gl_accounts (code, name, kind, parent_code, is_control, is_active) values ($1, 'IT under it', 'ASSET', $2, false, true)", [
      `IT${HEX}C`, heading,
    ]);
    expect((await daily(onDate)).accounts.some((a) => a.account_code === heading)).toBe(false);
  });

  it("the day's money in and out land on the day, name who it was, and carry into the next day", async () => {
    const before = await daily(onDate);
    const beforeNext = await daily(nextDay);

    await post(`IT-0637-IN-${RUN}`, "IT supplier refund", [
      { account_code: bank, debit: 250.5 },
      { account_code: payables, credit: 250.5, party_type: "SUPPLIER", party_id: supplierId },
    ]);
    await post(`IT-0637-OUT-${RUN}`, "IT bank charges", [
      { account_code: expense, debit: 100, department_type: "OFFICE" },
      { account_code: bank, credit: 100, memo: "IT service charge" },
    ]);

    const after = await daily(onDate);
    const was = acct(before, bank);
    const now = acct(after, bank);
    expect(sen(now.received) - sen(was.received)).toBe(25050);
    expect(sen(now.paid) - sen(was.paid)).toBe(10000);
    expect(sen(now.brought_forward)).toBe(sen(was.brought_forward));

    const money_in = now.lines.find((l) => l.source_doc_no === `IT-0637-IN-${RUN}`);
    expect(money_in).toMatchObject({ source_type: "IT_0637", party_type: "SUPPLIER", party_name: supplierName, description: "IT supplier refund" });
    expect(sen(money_in!.received)).toBe(25050);
    expect(sen(money_in!.paid)).toBe(0);
    const money_out = now.lines.find((l) => l.source_doc_no === `IT-0637-OUT-${RUN}`);
    // The line's own memo wins over the entry's narration; no party is named.
    expect(money_out).toMatchObject({ party_type: null, party_name: null, description: "IT service charge" });
    expect(sen(money_out!.paid)).toBe(10000);

    const afterNext = await daily(nextDay);
    expect(sen(acct(afterNext, bank).brought_forward) - sen(acct(beforeNext, bank).brought_forward)).toBe(15050);
    expect(sen(acct(afterNext, bank).received)).toBe(sen(acct(beforeNext, bank).received));
    expect(sen(acct(afterNext, bank).paid)).toBe(sen(acct(beforeNext, bank).paid));
  });

  it("a reversed entry and its contra both show, and net to nothing", async () => {
    const before = await daily(onDate);
    const id = await post(`IT-0637-REV-${RUN}`, "IT wrong deposit", [
      { account_code: bank, debit: 40 },
      { account_code: payables, credit: 40, party_type: "SUPPLIER", party_id: supplierId },
    ]);
    await q("select public.gl_reverse($1, 'IT posted by mistake')", [id]);

    const now = acct(await daily(onDate), bank);
    const was = acct(before, bank);
    expect(sen(now.received) - sen(was.received)).toBe(4000);
    expect(sen(now.paid) - sen(was.paid)).toBe(4000);
    expect(now.lines.filter((l) => l.source_doc_no.includes(`IT-0637-REV-${RUN}`)).length).toBeGreaterThanOrEqual(1);
    expect(now.lines.length - was.lines.length).toBe(2);
  });

  it("a checked voucher waits on the account it pays from, and leaves when it is approved", async () => {
    await actAs(U.preparer);
    const voucherId = (
      await q(
        `select public.payment_voucher_save_draft(null, 'DIRECT', null, $1, $2::date, $3,
                  jsonb_build_array(jsonb_build_object('account_code', $4::text, 'description', 'IT line', 'amount', 75.25,
                                                       'department_type', 'OFFICE'))) as id`,
        [`IT payee ${RUN}`, onDate, bank, expense],
      )
    ).rows[0].id as string;
    const start = acct(await daily(onDate), bank);

    await actAs(U.preparer);
    await q("select public.payment_voucher_prepare($1)", [voucherId]);
    expect(sen(acct(await daily(onDate), bank).pending)).toBe(sen(start.pending)); // prepared is not yet waiting

    await actAs(U.checker);
    await q("select public.payment_voucher_check($1)", [voucherId]);
    const checked = acct(await daily(onDate), bank);
    expect(sen(checked.pending) - sen(start.pending)).toBe(7525);
    expect(checked.pending_vouchers.find((v) => v.voucher_id === voucherId)).toMatchObject({
      payee_name: `IT payee ${RUN}`, voucher_date: onDate, purpose: expect.any(String),
    });

    // The day before it was checked, it was not waiting yet.
    const dayBefore = (
      await q("select (timezone('Asia/Kuala_Lumpur', checked_at)::date - 1)::text as d from payment_vouchers where id = $1", [voucherId])
    ).rows[0].d as string;
    expect(acct(await daily(dayBefore), bank).pending_vouchers.some((v) => v.voucher_id === voucherId)).toBe(false);

    await actAs(U.principal);
    expect((await attempt("select public.payment_voucher_approve($1)", [voucherId])).ok).toBe(true);
    const paid = acct(await daily(onDate), bank);
    expect(sen(paid.pending)).toBe(sen(start.pending));
    expect(paid.pending_vouchers.some((v) => v.voucher_id === voucherId)).toBe(false);
    expect(sen(paid.paid) - sen(checked.paid)).toBe(7525);
  });

  it("a holding account never carries a pending voucher", async () => {
    const d = await daily(onDate);
    for (const a of d.accounts.filter((x) => x.money_kind === "HOLDING")) {
      expect(sen(a.pending), a.account_code).toBe(0);
      expect(a.pending_vouchers, a.account_code).toEqual([]);
    }
    expect(acct(d, holding).money_kind).toBe("HOLDING");
  });
});

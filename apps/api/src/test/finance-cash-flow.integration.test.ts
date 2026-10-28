import { describe, it, expect, beforeAll, afterAll } from "vitest";
import pg from "pg";

/**
 * 0638 ON A REAL POSTGRESQL RUNNING THE WHOLE MIGRATION CHAIN: Cash Flow
 * (Chew 2026-10-03, docs/finance/MASTER.md §3.6). The cash and bank accounts
 * before and over a period, what the money was for, and the card money taken
 * and still waiting.
 *
 * One transaction, rolled back at the end. The ledger may already hold
 * entries, so every figure is read as a CHANGE from a reading taken first.
 *
 *   PG_BIN=<postgres bin> node scripts/dry-run-migrations.mjs --baseline scripts/migration-replay-baseline.json --keep
 *   CARRES_TEST_DATABASE_URL=postgres://postgres@localhost:<port>/<db> pnpm --filter @carres/api test -- finance-cash-flow
 *
 * Without the URL every case is SKIPPED — reported as skipped, never as passed.
 */
const URL = process.env.CARRES_TEST_DATABASE_URL ?? "";
const LOCAL = /^postgres(ql)?:\/\/[^@/]*@?(localhost|127\.0\.0\.1|\[::1\])(:\d+)?\//.test(URL);
const RUN = Date.now() % 100000;
const HEX = RUN.toString(16).padStart(5, "0");
const uid = (tail: string) => `dddddddd-0000-4000-8000-${HEX}${tail.padStart(7, "0")}`;
const U = { finance: uid("1"), operation: uid("2") };

type Account = { account_code: string; money_kind: string; opening: number; receipts: number; payments: number };
type Row = { side: "IN" | "OUT"; account_code: string; money_kind: string | null; amount: number };
type Flow = { accounts: Account[]; rows: Row[]; card: { taken: number; waiting: number } };
type BankDay = { accounts: Array<{ account_code: string; money_kind: string; brought_forward: number; received: number; paid: number }> };

describe.skipIf(!URL)("Cash Flow (real PostgreSQL, 0638)", () => {
  let db: pg.Client;
  let onDate = "";
  let bank = "";
  let bank2 = "";
  let holding = "";
  let payables = "";
  let expense = "";
  let income = "";
  let supplierId = "";
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
  async function flow(from: string, to: string): Promise<Flow> {
    await actAs(U.finance);
    const r = await attempt("select public.fin_cash_flow($1::date, $2::date) as f", [from, to]);
    if (!r.ok) throw new Error(`fin_cash_flow refused: ${r.detail}`);
    return r.value as Flow;
  }
  const sen = (n: number | string) => Math.round(Number(n) * 100);
  const row = (f: Flow, side: "IN" | "OUT", code: string) => sen(f.rows.find((r) => r.side === side && r.account_code === code)?.amount ?? 0);
  const acct = (f: Flow, code: string) => {
    const a = f.accounts.find((x) => x.account_code === code);
    if (!a) throw new Error(`account ${code} is not on Cash Flow`);
    return a;
  };
  const sumRows = (f: Flow, side: "IN" | "OUT") => f.rows.filter((r) => r.side === side).reduce((t, r) => t + sen(r.amount), 0);
  const post = (source: string, doc: string, lines: unknown[]) =>
    q("select public.gl_post($1, $2, $3::date, 'IT 0638', $4::jsonb) as id", [source, doc, onDate, JSON.stringify(lines)]);

  beforeAll(async () => {
    if (!LOCAL) throw new Error("CARRES_TEST_DATABASE_URL must point at localhost");
    db = new pg.Client({ connectionString: URL });
    await db.connect();
    await q("begin");
    await q("update gl_config set go_live_on = coalesce(go_live_on, date '2026-01-01') where id");
    onDate = (await q("select greatest(timezone('Asia/Kuala_Lumpur', now())::date, (select go_live_on from gl_config where id))::text as d")).rows[0].d;

    const leaf = "not exists (select 1 from gl_accounts c where c.parent_code = a.code)";
    const money = (kind: string, n: number) => `(select m.account_code from gl_money_accounts m join gl_accounts a on a.code = m.account_code
                     where m.money_kind = '${kind}' and m.is_active and a.is_active and ${leaf} order by m.account_code offset ${n} limit 1)`;
    const pick = (
      await q(`
        select ${money("BANK", 0)} as bank, ${money("BANK", 1)} as bank2, ${money("HOLDING", 0)} as holding,
               (select a.code from gl_accounts a where a.is_active and a.is_control and a.control_for = 'SUPPLIER' and ${leaf}
                 order by a.code limit 1) as payables,
               (select a.code from gl_accounts a where a.is_active and not a.is_control and a.kind = 'EXPENSE'
                   and not public.ap_account_is_money(a.code) and ${leaf} order by a.code limit 1) as expense,
               (select a.code from gl_accounts a where a.is_active and not a.is_control and a.kind = 'INCOME' and ${leaf}
                 order by a.code limit 1) as income`)
    ).rows[0];
    ({ bank, bank2, holding, payables, expense, income } = pick);
    for (const [k, v] of Object.entries(pick)) if (!v) throw new Error(`the chain has no ${k} account to test with`);

    const people: Array<[string, string]> = [[U.finance, "finance"], [U.operation, "operation"]];
    for (const [id, role] of people) {
      const email = `it-cf-${role}-${id.slice(-4)}-${RUN}@carres.test`;
      await q("insert into auth.users (id, email) values ($1, $2)", [id, email]);
      await q("insert into app_users (id, email, name, role, status, is_person) values ($1, $2, $3, $4, 'active', true)", [
        id, email, `IT ${role} ${id.slice(-4)}`, role,
      ]);
    }
    supplierId = (
      await q("insert into suppliers (name, kind, slug) values ($1, 'factory_pickup', $2) returning id", [`IT cf supplier ${RUN}`, `it-cf-supplier-${RUN}`])
    ).rows[0].id as string;
  }, 30000);

  afterAll(async () => {
    if (!db) return;
    await q("rollback").catch(() => undefined);
    await db.end();
  });

  it("only Finance or the principal may read it, and it asks for a period that runs forward", async () => {
    await actAs(U.operation);
    expect(await attempt("select public.fin_cash_flow($1::date, $1::date)", [onDate])).toEqual({ ok: false, detail: "not_internal" });
    await actAs(U.finance);
    expect(await attempt("select public.fin_cash_flow(null, $1::date)", [onDate])).toEqual({ ok: false, detail: "period_missing" });
    expect(await attempt("select public.fin_cash_flow($1::date, ($1::date - 1))", [onDate])).toEqual({ ok: false, detail: "period_backwards" });
  });

  it("the rows always add up to the accounts' money in and out, to the sen", async () => {
    // Three equal credits share a 10 sen receipt: 3.33… each, so one takes the odd sen.
    await post("IT_0638", `IT-0638-ODD-${RUN}`, [
      { account_code: bank, debit: 0.1 },
      { account_code: expense, debit: 0.05, department_type: "OFFICE" },
      { account_code: income, credit: 0.05 },
      { account_code: payables, credit: 0.05, party_type: "SUPPLIER", party_id: supplierId },
      { account_code: bank2, credit: 0.05 },
    ]);
    const f = await flow(onDate, onDate);
    expect(sumRows(f, "IN")).toBe(f.accounts.reduce((t, a) => t + sen(a.receipts), 0));
    expect(sumRows(f, "OUT")).toBe(f.accounts.reduce((t, a) => t + sen(a.payments), 0));
  });

  it("money in and out is filed under what it was for; a move between two banks is a transfer both ways", async () => {
    const before = await flow(onDate, onDate);
    await post("IT_0638", `IT-0638-IN-${RUN}`, [
      { account_code: bank, debit: 250.5 },
      { account_code: payables, credit: 250.5, party_type: "SUPPLIER", party_id: supplierId },
    ]);
    await post("IT_0638", `IT-0638-OUT-${RUN}`, [
      { account_code: expense, debit: 100, department_type: "OFFICE" },
      { account_code: bank, credit: 100 },
    ]);
    await post("IT_0638", `IT-0638-MOVE-${RUN}`, [
      { account_code: bank2, debit: 40 },
      { account_code: bank, credit: 40 },
    ]);
    const after = await flow(onDate, onDate);
    expect(row(after, "IN", payables) - row(before, "IN", payables)).toBe(25050);
    expect(row(after, "OUT", expense) - row(before, "OUT", expense)).toBe(10000);
    // The move: out of the first bank, into the second, named after each other.
    expect(row(after, "OUT", bank2) - row(before, "OUT", bank2)).toBe(4000);
    expect(row(after, "IN", bank) - row(before, "IN", bank)).toBe(4000);
    expect(after.rows.find((r) => r.account_code === bank2 && r.side === "OUT")?.money_kind).toBe("BANK");
  });

  it("card money counts as cash only when its payout reaches a bank, and shows as taken until then", async () => {
    const before = await flow(onDate, onDate);
    await post("IT_0638", `IT-0638-CARD-${RUN}`, [
      { account_code: holding, debit: 200 },
      { account_code: income, credit: 200 },
    ]);
    const swiped = await flow(onDate, onDate);
    expect(sen(swiped.card.taken) - sen(before.card.taken)).toBe(20000);
    expect(sen(swiped.card.waiting) - sen(before.card.waiting)).toBe(20000);
    expect(sumRows(swiped, "IN")).toBe(sumRows(before, "IN")); // no cash or bank money moved

    await post("CARD_PAYOUT", `IT-0638-PAYOUT-${RUN}`, [
      { account_code: bank, debit: 195 },
      { account_code: expense, debit: 5, department_type: "OFFICE" },
      { account_code: holding, credit: 200 },
    ]);
    const paidOut = await flow(onDate, onDate);
    expect(row(paidOut, "IN", holding) - row(swiped, "IN", holding)).toBe(19500);
    expect(paidOut.rows.find((r) => r.account_code === holding)?.money_kind).toBe("HOLDING");
    expect(sen(paidOut.card.taken)).toBe(sen(swiped.card.taken)); // a payout is not money taken
    expect(sen(paidOut.card.waiting) - sen(swiped.card.waiting)).toBe(-20000);
  });

  it("a reversed entry and its contra both count, so they net to nothing", async () => {
    const before = await flow(onDate, onDate);
    const id = (await post("IT_0638", `IT-0638-REV-${RUN}`, [
      { account_code: bank, debit: 70 },
      { account_code: income, credit: 70 },
    ])).rows[0].id as string;
    await q("select public.gl_reverse($1, 'IT posted by mistake')", [id]);
    const after = await flow(onDate, onDate);
    expect(sen(acct(after, bank).receipts) - sen(acct(before, bank).receipts)).toBe(7000);
    expect(sen(acct(after, bank).payments) - sen(acct(before, bank).payments)).toBe(7000);
    expect(row(after, "IN", income) - row(before, "IN", income)).toBe(7000);
    expect(row(after, "OUT", income) - row(before, "OUT", income)).toBe(7000);
  });

  it("for one day, every cash and bank account reads exactly as on Daily Bank", async () => {
    const f = await flow(onDate, onDate);
    await actAs(U.finance);
    const d = (await q("select public.fin_daily_bank($1::date) as d", [onDate])).rows[0].d as BankDay;
    for (const a of f.accounts) {
      const b = d.accounts.find((x) => x.account_code === a.account_code);
      expect(b, a.account_code).toBeDefined();
      expect([sen(a.opening), sen(a.receipts), sen(a.payments)], a.account_code)
        .toEqual([sen(b!.brought_forward), sen(b!.received), sen(b!.paid)]);
    }
    expect(f.accounts.length).toBe(d.accounts.filter((x) => x.money_kind !== "HOLDING").length);
    const waiting = d.accounts.filter((x) => x.money_kind === "HOLDING")
      .reduce((t, x) => t + sen(x.brought_forward) + sen(x.received) - sen(x.paid), 0);
    expect(sen(f.card.waiting)).toBe(waiting);
  });

  it("a longer period starts from the balance before its first day", async () => {
    const day = await flow(onDate, onDate);
    const longer = await flow("2026-01-01", onDate);
    const before = await flow("2025-12-31", "2025-12-31");
    for (const a of longer.accounts) {
      const end = acct(day, a.account_code);
      // The longer period ends where the day ends.
      expect(sen(a.opening) + sen(a.receipts) - sen(a.payments)).toBe(sen(end.opening) + sen(end.receipts) - sen(end.payments));
      const prior = acct(before, a.account_code);
      expect(sen(a.opening)).toBe(sen(prior.opening) + sen(prior.receipts) - sen(prior.payments));
    }
  });
});

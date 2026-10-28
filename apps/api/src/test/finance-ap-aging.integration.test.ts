import { describe, it, expect, beforeAll, afterAll } from "vitest";
import pg from "pg";

/**
 * 0640 ON A REAL POSTGRESQL RUNNING THE WHOLE MIGRATION CHAIN: AP aging and
 * the one arithmetic for how much of a bill is paid (Chew 2026-10-03,
 * docs/finance/MASTER.md §3.6). Bills, a voucher with an advance and a
 * knock-off go through the real doors; the aging is read on three days.
 *
 * One transaction, rolled back at the end.
 *
 *   PG_BIN=<postgres bin> node scripts/dry-run-migrations.mjs --baseline scripts/migration-replay-baseline.json --keep
 *   CARRES_TEST_DATABASE_URL=postgres://postgres@localhost:<port>/<db> pnpm --filter @carres/api test -- finance-ap-aging
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

type Aging = {
  as_at: string;
  controls: Array<{ account_code: string; balance: number }>;
  suppliers: Array<{ supplier_id: string; balance: number; bills: Array<{ bill_id: string; open: number; total: number }> }>;
};

describe.skipIf(!URL)("AP aging (real PostgreSQL, 0640)", () => {
  let db: pg.Client;
  let onDate = "";
  const day = (n: number) => q("select ($1::date + $2::int)::text as d", [onDate, n]).then((r) => r.rows[0].d as string);
  let supplierId = "";
  let billA = "";
  let billB = "";
  let voucherId = "";
  const q = (sql: string, params: unknown[] = []) => db.query(sql, params);
  const actAs = (id: string | null) =>
    q("select set_config('request.jwt.claims', $1, false)", [id ? JSON.stringify({ sub: id, role: "authenticated" }) : ""]);
  async function attempt(sql: string, params: unknown[] = []): Promise<{ ok: true; value: unknown } | { ok: false; code: string }> {
    await q("savepoint s");
    try {
      const r = await q(sql, params);
      await q("release savepoint s");
      return { ok: true, value: r.rows[0] ? Object.values(r.rows[0])[0] : null };
    } catch (e) {
      await q("rollback to savepoint s");
      return { ok: false, code: (e as { code?: string }).code ?? (e as Error).message };
    }
  }
  async function aging(asAt: string): Promise<Aging> {
    await actAs(U.preparer);
    const r = await attempt("select public.fin_ap_aging($1::date) as a", [asAt]);
    if (!r.ok) throw new Error(`fin_ap_aging refused: ${r.code}`);
    return r.value as Aging;
  }
  const sen = (n: number | string) => Math.round(Number(n) * 100);
  const ours = (a: Aging) => a.suppliers.find((s) => s.supplier_id === supplierId);
  const openOf = (a: Aging, bill: string) => ours(a)?.bills.find((b) => b.bill_id === bill)?.open;

  beforeAll(async () => {
    if (!LOCAL) throw new Error("CARRES_TEST_DATABASE_URL must point at localhost");
    db = new pg.Client({ connectionString: URL });
    await db.connect();
    await q("begin");
    await q("update gl_config set go_live_on = coalesce(go_live_on, date '2026-01-01') where id");
    // Twenty days of room after go-live, so every date below is a ledger day.
    onDate = (await q("select greatest(timezone('Asia/Kuala_Lumpur', now())::date, (select go_live_on from gl_config where id) + 20)::text as d")).rows[0].d;

    await q("insert into org_positions (id, name, band) values ($1, $2, 'executive')", [POS, `IT apa ${RUN}`]);
    const people: Array<[string, string, string | null]> = [
      [U.preparer, "finance", POS], [U.checker, "finance", POS], [U.principal, "principal", null], [U.operation, "operation", POS],
    ];
    for (const [id, role, position] of people) {
      const email = `it-apa-${role}-${id.slice(-4)}-${RUN}@carres.test`;
      await q("insert into auth.users (id, email) values ($1, $2)", [id, email]);
      await q("insert into app_users (id, email, name, role, status, position_id, is_person) values ($1, $2, $3, $4, 'active', $5, true)", [
        id, email, `IT ${role} ${id.slice(-4)}`, role, position,
      ]);
    }
    supplierId = (await q("insert into suppliers (name, kind, slug) values ($1, 'factory_pickup', $2) returning id",
      [`IT aging supplier ${RUN}`, `it-apa-supplier-${RUN}`])).rows[0].id as string;

    const acct = (await q(`
      select (select a.code from gl_accounts a where a.is_active and public.ap_account_is_money(a.code)
                and exists (select 1 from gl_money_accounts m where m.account_code = a.code and m.money_kind = 'BANK')
                and not exists (select 1 from gl_accounts c where c.parent_code = a.code) order by a.code limit 1) as bank,
             (select a.code from gl_accounts a where a.is_active and not a.is_control and a.kind = 'EXPENSE'
                and not public.ap_account_is_money(a.code)
                and not exists (select 1 from gl_accounts c where c.parent_code = a.code) order by a.code limit 1) as expense`)).rows[0];

    const line = (amount: number) => JSON.stringify([{ account_code: acct.expense, description: "IT charge", amount, department_type: "OFFICE" }]);
    await actAs(U.preparer);
    billA = (await q("select public.supplier_bill_save_draft(null, $1, $2, $3::date, $4::jsonb) as id",
      [supplierId, `IT-A-${RUN}`, await day(-15), line(1000)])).rows[0].id as string;
    billB = (await q("select public.supplier_bill_save_draft(null, $1, $2, $3::date, $4::jsonb) as id",
      [supplierId, `IT-B-${RUN}`, onDate, line(500)])).rows[0].id as string;
    await q("select public.supplier_bill_confirm($1)", [billA]);
    await q("select public.supplier_bill_confirm($1)", [billB]);

    // Five days ago: 400 of bill A, and 300 ahead of any bill.
    voucherId = (await q(
      `select public.payment_voucher_save_draft(null, 'SUPPLIER_BILLS', $1, 'IT payee', $2::date, $3, '[]'::jsonb,
               jsonb_build_array(jsonb_build_object('bill_id', $4::text, 'amount', 400)), 'BANK_TRANSFER', null, null, 300) as id`,
      [supplierId, await day(-5), acct.bank, billA])).rows[0].id as string;
    await q("select public.payment_voucher_prepare($1)", [voucherId]);
    await actAs(U.checker);
    await q("select public.payment_voucher_check($1)", [voucherId]);
    await actAs(U.principal);
    await q("select public.payment_voucher_approve($1)", [voucherId]);
    // Today: 200 of the advance knocked off bill B.
    await actAs(U.preparer);
    await q("select public.supplier_advance_apply($1, $2, 200)", [voucherId, billB]);
  }, 30000);

  afterAll(async () => {
    if (!db) return;
    await q("rollback").catch(() => undefined);
    await db.end();
  });

  it("is internal", async () => {
    await actAs(U.operation);
    expect(await attempt("select public.fin_ap_aging($1::date)", [onDate])).toEqual({ ok: false, code: "42501" });
  });

  it("today: each bill's open part, and the supplier's balance in the books", async () => {
    const a = await aging(onDate);
    expect(sen(openOf(a, billA)!)).toBe(60000); // 1,000 less 400 paid
    expect(sen(openOf(a, billB)!)).toBe(30000); // 500 less 200 knocked off
    expect(sen(ours(a)!.balance)).toBe(80000); // 1,500 billed less 700 paid; 100 of the advance is left
  });

  it("before the voucher: bill A open whole, and bill B not billed yet", async () => {
    const a = await aging(await day(-10));
    expect(sen(openOf(a, billA)!)).toBe(100000);
    expect(openOf(a, billB)).toBeUndefined();
    expect(sen(ours(a)!.balance)).toBe(100000);
  });

  it("yesterday: the voucher had paid, the knock-off had not happened", async () => {
    const a = await aging(await day(-1));
    expect(sen(openOf(a, billA)!)).toBe(60000);
    expect(openOf(a, billB)).toBeUndefined();
    expect(sen(ours(a)!.balance)).toBe(30000); // 1,000 less 700: the 300 advance sits against no bill
  });

  it("the suppliers' balances add up to the payables control accounts, on every day", async () => {
    for (const d of [onDate, await day(-1), await day(-10)]) {
      const a = await aging(d);
      const suppliers = a.suppliers.reduce((t, s) => t + sen(s.balance), 0);
      const controls = a.controls.reduce((t, c) => t + sen(c.balance), 0);
      expect(suppliers, d).toBe(controls);
    }
  });

  it("paid has one arithmetic: ap_bill_paid reads 0484's rule through ap_bill_settled", async () => {
    // 0484's own paid, written out, against what ap_bill_paid answers now — for every bill.
    const diff = (await q(`
      with rule as (
        select x.bid, coalesce(sum(x.amount) filter (where x.settled), 0)::numeric(12,2) as paid,
               coalesce(sum(x.amount), 0)::numeric(12,2) as held
          from (
            select al.bill_id as bid, al.amount_applied as amount, (pv.status = 'approved') as settled
              from payment_voucher_allocations al join payment_vouchers pv on pv.id = al.voucher_id
             where pv.status <> 'cancelled'
            union all
            select ap.bill_id, ap.amount, true from supplier_advance_applications ap where ap.status = 'applied'
          ) x group by x.bid)
      select count(*)::int as n
        from rule r full join public.ap_bill_paid() p on p.bill_id = r.bid
       where r.bid is null or p.bill_id is null or r.paid <> p.paid or r.held <> p.held`)).rows[0].n as number;
    expect(diff).toBe(0);
    const ours = (await q("select paid::float as paid from public.ap_bill_paid($1)", [billA])).rows[0].paid as number;
    expect(ours).toBe(400);
  });
});

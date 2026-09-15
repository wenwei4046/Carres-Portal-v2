import { describe, it, expect, beforeAll, afterAll } from "vitest";
import pg from "pg";

/**
 * 0508 ON A REAL POSTGRESQL RUNNING THE WHOLE MIGRATION CHAIN: the database
 * refuses a finance approval the API would refuse.
 *
 * The API admits only finance or principal to the approve / cancel doors
 * (requireFinance). Before 0508 the database asked only has_finance_approver,
 * which said yes to any active non-dealer whose position held the
 * finance_approver duty — so an operation user given that duty could approve
 * a payment voucher straight over /rpc. 0508 also makes Workspace → Staff &
 * Duties decide who the finance approver is (the holder, or today's cover),
 * with the HR position tick as the fallback while nobody holds the duty. The
 * cases prove both halves: who is now refused, and who still passes.
 *
 * Everything runs inside ONE transaction that is rolled back at the end, so
 * the suite writes nothing that survives it. Identities are impersonated
 * through the request-claims GUC exactly as PostgREST sets it.
 * PREREQUISITE — a throwaway local cluster with the chain:
 *
 *   PG_BIN=<postgres bin> node scripts/dry-run-migrations.mjs --baseline scripts/migration-replay-baseline.json --keep
 *   CARRES_TEST_DATABASE_URL=postgres://postgres@localhost:<port>/<db> pnpm --filter @carres/api test -- finance-approver-role
 *
 * Without the URL every case is SKIPPED — reported as skipped, never as passed.
 */
const URL = process.env.CARRES_TEST_DATABASE_URL ?? "";
const LOCAL = /^postgres(ql)?:\/\/[^@/]*@?(localhost|127\.0\.0\.1|\[::1\])(:\d+)?\//.test(URL);
const RUN = Date.now() % 100000;
const HEX = RUN.toString(16).padStart(5, "0");
const uid = (tail: string) => `cccccccc-0000-4000-8000-${HEX}${tail.padStart(7, "0")}`;

const U = {
  operationApprover: uid("1"), // operation, position holds finance_approver
  financeApprover: uid("2"), // finance, position holds finance_approver
  financePreparer: uid("3"), // finance, no duty — prepares the voucher
  financeChecker: uid("4"), // finance, no duty — checks it
  principal: uid("5"), // principal, no position
  disabledFinanceApprover: uid("6"), // finance, holds the duty, account disabled
};
const POS = { approver: uid("a1"), plain: uid("a2") };
const NOBODY = uid("f1"); // a document id that does not exist

describe.skipIf(!URL)("only a finance user or the principal is a finance approver (real PostgreSQL, 0508)", () => {
  let db: pg.Client;
  const q = (sql: string, params: unknown[] = []) => db.query(sql, params);
  const actAs = (id: string | null) =>
    q("select set_config('request.jwt.claims', $1, false)", [id ? JSON.stringify({ sub: id, role: "authenticated" }) : ""]);
  /** Runs one call in a savepoint: a refusal is returned as its detail code and
   *  does not abort the suite's transaction. */
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
  const approver = (id: string | null) =>
    q("select public.has_finance_approver($1::uuid) as v", [id]).then((r) => r.rows[0].v as boolean);

  let voucherId = "";

  beforeAll(async () => {
    if (!LOCAL) throw new Error("CARRES_TEST_DATABASE_URL must point at localhost");
    db = new pg.Client({ connectionString: URL });
    await db.connect();
    await q("begin");
    await q("insert into org_positions (id, name, band) values ($1, $2, 'executive'), ($3, $4, 'executive')", [
      POS.approver, `IT approver ${RUN}`, POS.plain, `IT plain ${RUN}`,
    ]);
    await q("insert into org_position_duties (position_id, duty_key) values ($1, 'finance_approver')", [POS.approver]);
    // nobody holds finance_approver in Staff & Duties unless a case says so
    // (inside the transaction, so this is undone with everything else)
    await q("update workspace_duty_covers set duty_key = 'finance_approver_parked_by_it' where duty_key = 'finance_approver'");
    await q("update workspace_duty_assignments set duty_key = 'finance_approver_parked_by_it' where duty_key = 'finance_approver'");
    const people: Array<[string, string, string | null, string]> = [
      [U.operationApprover, "operation", POS.approver, "active"],
      [U.financeApprover, "finance", POS.approver, "active"],
      [U.financePreparer, "finance", POS.plain, "active"],
      [U.financeChecker, "finance", POS.plain, "active"],
      [U.principal, "principal", null, "active"],
      [U.disabledFinanceApprover, "finance", POS.approver, "disabled"],
    ];
    for (const [id, role, position, status] of people) {
      const email = `it-fa-${role}-${id.slice(-4)}-${RUN}@carres.test`;
      await q("insert into auth.users (id, email) values ($1, $2)", [id, email]);
      await q("insert into app_users (id, email, name, role, status, position_id) values ($1, $2, $3, $4, $5, $6)", [
        id, email, `IT ${role} ${id.slice(-4)}`, role, status, position,
      ]);
    }

    // A real voucher, taken to "checked" through the real doors by two
    // finance users who are not approvers: the state an approver releases.
    const acct = await q(`
      select (select a.code from gl_accounts a
               where a.is_active and public.ap_account_is_money(a.code)
                 and not exists (select 1 from gl_accounts c where c.parent_code = a.code)
               order by a.code limit 1) as pay_from,
             (select a.code from gl_accounts a
               where a.is_active and not a.is_control and a.kind = 'EXPENSE'
                 and not public.ap_account_is_money(a.code)
                 and not exists (select 1 from gl_accounts c where c.parent_code = a.code)
               order by a.code limit 1) as expense,
             greatest(timezone('Asia/Kuala_Lumpur', now())::date,
                      (select go_live_on from gl_config where id))::text as on_date`);
    const { pay_from, expense, on_date } = acct.rows[0];
    await actAs(U.financePreparer);
    voucherId = (
      await q(
        `select public.payment_voucher_save_draft(null, 'DIRECT', null, $1, $2::date, $3,
                  jsonb_build_array(jsonb_build_object('account_code', $4::text, 'amount', 10))) as id`,
        [`IT payee ${RUN}`, on_date, pay_from, expense],
      )
    ).rows[0].id as string;
    await q("select public.payment_voucher_prepare($1)", [voucherId]);
    await actAs(U.financeChecker);
    await q("select public.payment_voucher_check($1)", [voucherId]);
  }, 30000);

  afterAll(async () => {
    if (!db) return;
    await q("rollback").catch(() => undefined);
    await db.end();
  });

  it("the helper answers yes only for an active principal or an active finance user holding the duty", async () => {
    expect(await approver(U.operationApprover)).toBe(false);
    expect(await approver(U.financeApprover)).toBe(true);
    expect(await approver(U.financePreparer)).toBe(false);
    expect(await approver(U.principal)).toBe(true);
    expect(await approver(U.disabledFinanceApprover)).toBe(false);
    expect(await approver(null)).toBe(false);
  });

  it("an operation user holding finance_approver cannot approve a payment voucher over /rpc", async () => {
    await actAs(U.operationApprover);
    // before 0508 this approve went through; the savepoint keeps a failing run
    // from spending the voucher the next cases need
    await q("savepoint op_try");
    const approve = await attempt("select public.payment_voucher_approve($1)", [voucherId]);
    const reject = await attempt("select public.payment_voucher_reject($1, 'no')", [voucherId]);
    // the doors that ask the helper first: refused before the document is even looked up
    const voidReceipt = await attempt("select public.other_receipt_void($1, 'no')", [NOBODY]);
    const cancelMoneyBack = await attempt("select public.supplier_advance_money_back_cancel($1, 'no')", [NOBODY]);
    await q("rollback to savepoint op_try");
    expect(approve).toEqual({ ok: false, detail: "not_finance_approver" });
    expect(reject).toEqual({ ok: false, detail: "not_finance" });
    expect(voidReceipt).toEqual({ ok: false, detail: "not_finance_approver" });
    expect(cancelMoneyBack).toEqual({ ok: false, detail: "not_finance_approver" });
  });

  it("the principal still approves it", async () => {
    await actAs(U.principal);
    await q("savepoint principal_try");
    const r = await attempt("select public.payment_voucher_approve($1)", [voucherId]);
    // put the voucher back to "checked" for the next cases
    await q("rollback to savepoint principal_try");
    expect(r.ok).toBe(true);
  });

  /** Staff & Duties names `holder` for finance_approver from a week ago; `cover`
   *  optionally acts for them today. Runs `body`, then undoes all of it. */
  async function withStaffAndDuties<T>(holder: string, cover: string | null, body: () => Promise<T>): Promise<T> {
    await q("savepoint sd");
    try {
      const today = "timezone('Asia/Kuala_Lumpur', now())::date";
      await q(`insert into workspace_duty_assignments (duty_key, holder_id, effective_from) values ('finance_approver', $1, ${today} - 7)`, [holder]);
      if (cover) {
        await q(
          `insert into workspace_duty_covers (duty_key, normal_user_id, acting_user_id, starts_on, ends_on) values ('finance_approver', $1, $2, ${today} - 1, ${today} + 1)`,
          [holder, cover],
        );
      }
      return await body();
    } finally {
      await q("rollback to savepoint sd");
    }
  }

  it("once Staff & Duties names a finance approver, that person approves and the HR tick stops counting", async () => {
    const r = await withStaffAndDuties(U.financeChecker, null, async () => {
      const answers = [await approver(U.financeChecker), await approver(U.financeApprover), await approver(U.principal)];
      await actAs(U.financeApprover);
      const byTick = await attempt("select public.payment_voucher_approve($1)", [voucherId]);
      await actAs(U.financeChecker);
      const byHolder = await attempt("select public.payment_voucher_approve($1)", [voucherId]);
      return { answers, byTick, byHolder };
    });
    expect(r.answers).toEqual([true, false, true]);
    expect(r.byTick).toEqual({ ok: false, detail: "not_finance_approver" });
    expect(r.byHolder.ok).toBe(true);
  });

  it("today's buddy cover approves in the holder's place, and separation of duties still applies to them", async () => {
    // the cover is the person who prepared this voucher
    const r = await withStaffAndDuties(U.financeChecker, U.financePreparer, async () => {
      const answers = [await approver(U.financePreparer), await approver(U.financeChecker)];
      await actAs(U.financePreparer);
      const byCover = await attempt("select public.payment_voucher_approve($1)", [voucherId]);
      return { answers, byCover };
    });
    expect(r.answers).toEqual([true, false]);
    expect(r.byCover).toEqual({ ok: false, detail: "separation_of_duties" });
  });

  it("Staff & Duties naming an operation user does not make them an approver: the role check still applies", async () => {
    const r = await withStaffAndDuties(U.operationApprover, null, async () => {
      const answers = [await approver(U.operationApprover), await approver(U.financeApprover), await approver(U.principal)];
      await actAs(U.operationApprover);
      const byOperation = await attempt("select public.payment_voucher_approve($1)", [voucherId]);
      return { answers, byOperation };
    });
    expect(r.answers).toEqual([false, false, true]);
    expect(r.byOperation).toEqual({ ok: false, detail: "not_finance_approver" });
  });

  it("a call with no user (the service role) still posts through gl_post — it has no role gate on purpose (0468)", async () => {
    await actAs(null);
    await q("savepoint svc");
    try {
      await q("set local role service_role");
      const lines = await q(`
        select jsonb_build_array(
                 jsonb_build_object('account_code', d.code, 'debit', 1),
                 jsonb_build_object('account_code', c.code, 'credit', 1)) as l,
               greatest(timezone('Asia/Kuala_Lumpur', now())::date, (select go_live_on from gl_config where id))::text as on_date
          from (select a.code from gl_accounts a where a.is_active and not a.is_control and a.kind = 'EXPENSE'
                  and not exists (select 1 from gl_accounts x where x.parent_code = a.code) order by a.code limit 1) d,
               (select a.code from gl_accounts a where a.is_active and not a.is_control and a.kind = 'EQUITY'
                  and not exists (select 1 from gl_accounts x where x.parent_code = a.code) order by a.code limit 1) c`);
      const r = await q("select public.gl_post('MANUAL', $1, $2::date, 'IT service call', $3::jsonb) as id", [
        `IT-SVC-${RUN}`, lines.rows[0].on_date, JSON.stringify(lines.rows[0].l),
      ]);
      expect(r.rows[0].id).toMatch(/^[0-9a-f-]{36}$/);
    } finally {
      await q("rollback to savepoint svc");
    }
  });

  it("a finance user holding finance_approver still approves it, and it posts", async () => {
    await actAs(U.financeApprover);
    expect(await attempt("select public.other_receipt_void($1, 'no')", [NOBODY])).toEqual({ ok: false, detail: "receipt_missing" });
    const r = await attempt("select public.payment_voucher_approve($1)", [voucherId]);
    expect(r.ok).toBe(true);
    const status = await q("select status, gl_entry_id is not null as posted from payment_vouchers where id = $1", [voucherId]);
    expect(status.rows[0]).toEqual({ status: "approved", posted: true });
  });
});

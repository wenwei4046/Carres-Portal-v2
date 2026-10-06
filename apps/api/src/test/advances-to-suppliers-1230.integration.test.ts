import { describe, it, expect, beforeAll, afterAll } from "vitest";
import pg from "pg";

/**
 * 0510 ON A REAL POSTGRESQL RUNNING THE WHOLE MIGRATION CHAIN: 1230 Advances
 * to suppliers is written only by the Advance flow.
 *
 * 1230 is where the Balance Sheet shows money paid to a supplier before its
 * bill (0507, report only). No line a person types may land on it: not a
 * supplier bill line, a payment voucher line, a manual journal line or an
 * other receipt line. The Advance flow itself (0484) still works, and books
 * the advance on the supplier's payables account, not on 1230.
 *
 * Everything runs inside ONE transaction that is rolled back at the end, so
 * the suite writes nothing that survives it. Identities are impersonated
 * through the request-claims GUC exactly as PostgREST sets it.
 * PREREQUISITE — a throwaway local cluster with the chain:
 *
 *   PG_BIN=<postgres bin> node scripts/dry-run-migrations.mjs --baseline scripts/migration-replay-baseline.json --keep
 *   CARRES_TEST_DATABASE_URL=postgres://postgres@localhost:<port>/<db> pnpm --filter @carres/api test -- advances-to-suppliers-1230
 *
 * Without the URL every case is SKIPPED — reported as skipped, never as passed.
 */
const URL = process.env.CARRES_TEST_DATABASE_URL ?? "";
const LOCAL = /^postgres(ql)?:\/\/[^@/]*@?(localhost|127\.0\.0\.1|\[::1\])(:\d+)?\//.test(URL);
const RUN = Date.now() % 100000;
const HEX = RUN.toString(16).padStart(5, "0");
const uid = (tail: string) => `cccccccc-0000-4000-8000-${HEX}${tail.padStart(7, "0")}`;

const U = { preparer: uid("1"), checker: uid("2"), principal: uid("3") };

describe.skipIf(!URL)("1230 Advances to suppliers is written only by the Advance flow (real PostgreSQL, 0510)", () => {
  let db: pg.Client;
  const q = (sql: string, params: unknown[] = []) => db.query(sql, params);
  const actAs = (id: string | null) =>
    q("select set_config('request.jwt.claims', $1, false)", [id ? JSON.stringify({ sub: id, role: "authenticated" }) : ""]);
  /** Runs one call in a savepoint, then undoes it: a refusal is returned as
   *  its detail code, and nothing the call wrote survives. */
  async function attempt(sql: string, params: unknown[] = []): Promise<{ ok: true; value: unknown } | { ok: false; detail: string }> {
    await q("savepoint s");
    try {
      const r = await q(sql, params);
      return { ok: true, value: r.rows[0] ? Object.values(r.rows[0])[0] : null };
    } catch (e) {
      return { ok: false, detail: (e as { detail?: string }).detail ?? (e as Error).message };
    } finally {
      await q("rollback to savepoint s");
    }
  }

  let payFrom = "";
  let expense = "";
  let onDate = "";
  let supplierId = "";
  // Every voucher line names its department (0540); Office takes any expense.
  const line = (code: string) =>
    JSON.stringify([{ account_code: code, description: "IT line", amount: 10, department_type: "OFFICE" }]);
  const saveDirect = (code: string) =>
    attempt(
      `select public.payment_voucher_save_draft(null, 'DIRECT', null, $1, $2::date, $3, $4::jsonb) as id`,
      [`IT payee ${RUN}`, onDate, payFrom, line(code)],
    );
  const journal = (code: string) =>
    attempt(
      `select public.gl_manual_journal($1::date, $2, $3::jsonb, null::uuid) as id`,
      [onDate, `IT 0510 ${RUN}`, JSON.stringify([
        { account_code: code, debit: 10, credit: 0 },
        { account_code: payFrom, debit: 0, credit: 10 },
      ])],
    );

  beforeAll(async () => {
    if (!LOCAL) throw new Error("CARRES_TEST_DATABASE_URL must point at localhost");
    db = new pg.Client({ connectionString: URL });
    await db.connect();
    await q("begin");
    for (const [id, role] of [[U.preparer, "finance"], [U.checker, "finance"], [U.principal, "principal"]] as const) {
      const email = `it-1230-${role}-${id.slice(-4)}-${RUN}@carres.test`;
      await q("insert into auth.users (id, email) values ($1, $2)", [id, email]);
      await q("insert into app_users (id, email, name, role, status, is_person) values ($1, $2, $3, $4, 'active', true)", [
        id, email, `IT ${role} ${id.slice(-4)}`, role,
      ]);
    }
    const r = await q(`
      select (select a.code from gl_accounts a
               where a.is_active and public.ap_account_is_money(a.code)
                 and not exists (select 1 from gl_accounts c where c.parent_code = a.code)
               order by a.code limit 1) as pay_from,
             (select a.code from gl_accounts a
               where a.is_active and not a.is_control and a.kind = 'EXPENSE'
                 and not public.ap_account_is_money(a.code)
                 and not exists (select 1 from gl_accounts c where c.parent_code = a.code)
               order by a.code limit 1) as expense,
             (select s.id from suppliers s where s.kind::text <> 'other_creditor' order by s.name limit 1) as supplier_id,
             greatest(timezone('Asia/Kuala_Lumpur', now())::date,
                      (select go_live_on from gl_config where id))::text as on_date`);
    ({ pay_from: payFrom, expense, supplier_id: supplierId, on_date: onDate } = r.rows[0]);
  });

  afterAll(async () => {
    if (!db) return;
    await q("rollback");
    await db.end();
  });

  it("the bill and voucher pickers stop offering 1230, and keep offering the rest", async () => {
    await actAs(U.preparer);
    const r = await q("select code, for_bill_line, for_voucher_line from public.ap_account_choices() where code in ('1230', '1250')");
    const by = Object.fromEntries(r.rows.map((x) => [x.code, [x.for_bill_line, x.for_voucher_line]]));
    expect(by).toEqual({ "1230": [false, false], "1250": [true, true] });
  });

  it("a supplier bill line and a payment voucher line on 1230 are refused", async () => {
    // the bill door checks each line with this helper (a bill comes from its GRN)
    for (const use of ["bill_line", "voucher_line"]) {
      const r = await attempt("select public._ap_require_account('1230', $1, 'Line 1')", [use]);
      expect(r).toEqual({ ok: false, detail: "account_kept_by_own_documents" });
    }
    await actAs(U.preparer);
    expect(await saveDirect("1230")).toEqual({ ok: false, detail: "account_kept_by_own_documents" });
    expect((await saveDirect(expense)).ok).toBe(true);
  });

  it("a manual journal line on 1230 is refused, even for the principal", async () => {
    await actAs(U.principal);
    expect(await journal("1230")).toEqual({ ok: false, detail: "gl_manual_journal_control_account" });
    expect((await journal(expense)).ok).toBe(true);
  });

  it("an other receipt line on 1230 is refused, and its picker stops offering it", async () => {
    const problem = await q("select public.fin_money_in_account_problem('1230', 'receipt_line') as p");
    expect(problem.rows[0].p).toMatch(/is kept by its own documents/);
    await actAs(U.preparer);
    const r = await q("select code, for_receipt_line from public.fin_money_in_account_options() where code in ('1230', '1250')");
    expect(Object.fromEntries(r.rows.map((x) => [x.code, x.for_receipt_line]))).toEqual({ "1230": false, "1250": true });
  });

  it("the Advance flow still pays a supplier before its bill, on the supplier's payables account", async () => {
    await actAs(U.preparer);
    const id = (
      await q(
        `select public.payment_voucher_save_draft(null, 'SUPPLIER_BILLS', $1::uuid, null, $2::date, $3,
                  '[]'::jsonb, '[]'::jsonb, 'BANK_TRANSFER', null, null, 25) as id`,
        [supplierId, onDate, payFrom],
      )
    ).rows[0].id as string;
    await q("select public.payment_voucher_prepare($1)", [id]);
    await actAs(U.checker);
    await q("select public.payment_voucher_check($1)", [id]);
    await actAs(U.principal);
    await q("select public.payment_voucher_approve($1)", [id]);
    const posted = await q(
      `select l.account_code, l.debit, l.credit from gl_entry_lines l
         join payment_vouchers v on v.gl_entry_id = l.entry_id
        where v.id = $1 order by l.debit desc`,
      [id],
    );
    expect(posted.rows.map((x) => [x.account_code, Number(x.debit), Number(x.credit)])).toEqual([
      ["2110", 25, 0],
      [payFrom, 0, 25],
    ]);
  });
});

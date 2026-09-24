import { describe, it, expect, beforeAll, afterAll } from "vitest";
import pg from "pg";
import { LEDGER_ACCOUNT_CODE_MESSAGE } from "@carres/shared/finance-ledger";

/**
 * A MONEY ACCOUNT'S NUMBER, CHANGED ON FINANCE SETTINGS → MONEY ACCOUNTS
 * (YH, 24 Sep 2026), on a real PostgreSQL running the whole migration chain.
 *
 * The form sends the Chart of accounts form's own request, PATCH
 * /api/finance/ledger/accounts/:code { name, code }, and the route calls
 * gl_account_update(p_code, p_name, p_new_code) with those three values
 * (ledger.test.ts pins the route; FinanceSettings.test.tsx pins the request).
 * This file makes that call as a Finance user and reads what followed the
 * number: a posted ledger line, an approved money move, a card payout bank.
 *
 * The accounts are picked from the money-account list, never written here.
 * Same harness as money-moves.integration.test.ts: one transaction, rolled
 * back; identities through the request-claims GUC.
 *
 *   CARRES_TEST_DATABASE_URL=postgres://postgres@localhost:<port>/<db> pnpm --filter @carres/api test -- money-account-renumber
 *
 * Without the URL every case is SKIPPED.
 */
const URL = process.env.CARRES_TEST_DATABASE_URL ?? "";
const LOCAL = /^postgres(ql)?:\/\/[^@/]*@?(localhost|127\.0\.0\.1|\[::1\])(:\d+)?\//.test(URL);
const RUN = Date.now() % 100000;
const HEX = RUN.toString(16).padStart(5, "0");
const uid = (tail: string) => `eeeeeeee-0000-4000-8000-${HEX}${tail.padStart(7, "0")}`;
const U = { finance: uid("1"), principal: uid("2"), operation: uid("3") };
const POS = uid("a1");

describe.skipIf(!URL)("a money account renumbered from its own form (real PostgreSQL, 0570's door)", () => {
  let db: pg.Client;
  const q = (sql: string, params: unknown[] = []) => db.query(sql, params);
  const actAs = (id: string | null) =>
    q("select set_config('request.jwt.claims', $1, false)", [id ? JSON.stringify({ sub: id, role: "authenticated" }) : ""]);
  async function attempt(sql: string, params: unknown[] = []): Promise<{ ok: true; value: unknown } | { ok: false; detail: string; message: string }> {
    await q("savepoint s");
    try {
      const r = await q(sql, params);
      await q("release savepoint s");
      return { ok: true, value: r.rows[0] ? Object.values(r.rows[0])[0] : null };
    } catch (e) {
      await q("rollback to savepoint s");
      return { ok: false, detail: (e as { detail?: string }).detail ?? "", message: (e as Error).message };
    }
  }
  /** Exactly the call PATCH /accounts/:code makes for the form's body. */
  const renumber = (from: string, name: string, to: string) =>
    attempt("select public.gl_account_update($1, $2, $3) as code", [from, name, to]);

  // Picked in beforeAll from the list, as the screen would show it.
  let bank = { code: "", name: "", parent: "" };
  let otherBank = "";
  let holding = "";
  let fresh = "";
  let moveId = "";
  let entryId = "";
  let totalBefore = 0;

  beforeAll(async () => {
    if (!LOCAL) throw new Error("CARRES_TEST_DATABASE_URL must point at localhost");
    db = new pg.Client({ connectionString: URL });
    await db.connect();
    await q("begin");
    await q("update gl_config set go_live_on = coalesce(go_live_on, date '2026-01-01') where id");
    const onDate = (await q("select greatest(timezone('Asia/Kuala_Lumpur', now())::date, (select go_live_on from gl_config where id))::text as d")).rows[0].d;
    await q("insert into org_positions (id, name, band) values ($1, $2, 'executive')", [POS, `IT rn ${RUN}`]);
    const people: Array<[string, string, string | null]> = [
      [U.finance, "finance", POS],
      [U.principal, "principal", null],
      [U.operation, "operation", POS],
    ];
    for (const [id, role, position] of people) {
      const email = `it-rn-${role}-${id.slice(-4)}-${RUN}@carres.test`;
      await q("insert into auth.users (id, email) values ($1, $2)", [id, email]);
      await q("insert into app_users (id, email, name, role, status, position_id) values ($1, $2, $3, $4, 'active', $5)", [
        id, email, `IT ${role} ${id.slice(-4)}`, role, position,
      ]);
    }
    // 0533: a principal approves only as a person, not as a shared login.
    await q("update app_users set is_person = true where id = $1", [U.principal]);

    await actAs(U.finance);
    const list = (await q("select code, name, money_kind, is_active from public.gl_money_accounts_list()")).rows as Array<{
      code: string; name: string; money_kind: string; is_active: boolean;
    }>;
    const banks = list.filter((r) => r.money_kind === "BANK" && r.is_active);
    const holdings = list.filter((r) => r.money_kind === "HOLDING" && r.is_active);
    if (banks.length < 2 || holdings.length < 1) throw new Error("this test needs two banks and a holding account in use");
    const parent = (await q("select parent_code from gl_accounts where code = $1", [banks[0]!.code])).rows[0].parent_code as string;
    bank = { code: banks[0]!.code, name: banks[0]!.name, parent };
    otherBank = banks[1]!.code;
    holding = holdings[0]!.code;
    // A number nobody has, in AutoCount's form.
    fresh = (await q(
      `select n from unnest(array['310-2000','310-3000','310-4000','310-5000','310-6000']) n
        where not exists (select 1 from gl_accounts a where a.code = n) limit 1`,
    )).rows[0].n;

    // A money move out of the bank, approved, so it is posted and frozen.
    const made = await attempt("select public.gl_money_move_create('TRANSFER', $1::date, $2, $3, 250, 0, 'IT renumber') as id", [
      onDate, bank.code, otherBank,
    ]);
    if (!made.ok) throw new Error(`money move not made: ${made.message}`);
    moveId = made.value as string;
    await actAs(U.principal);
    const approved = await attempt("select public.gl_money_move_approve($1) as entry", [moveId]);
    if (!approved.ok) throw new Error(`money move not approved: ${approved.message}`);
    entryId = approved.value as string;

    // The card money of one holding account pays out to this bank.
    await actAs(U.finance);
    const route = await attempt("select public.card_settlement_route_set($1, 'showroom', $2)", [holding, bank.code]);
    if (!route.ok) throw new Error(`route not set: ${route.message}`);

    totalBefore = Number((await q(
      "select coalesce(sum(debit - credit), 0)::float as t from gl_entry_lines where account_code = $1", [bank.code],
    )).rows[0].t);
  }, 30000);

  afterAll(async () => {
    if (!db) return;
    await q("rollback").catch(() => undefined);
    await db.end();
  });

  it("refuses, each with the sentence the form shows under the Number field", async () => {
    await actAs(U.operation);
    expect(await renumber(bank.code, bank.name, fresh)).toEqual({
      ok: false, detail: "not_finance", message: "Only Finance changes the chart of accounts.",
    });
    await actAs(U.finance);
    expect(await renumber(bank.code, bank.name, otherBank)).toEqual({
      ok: false, detail: "code_exists", message: `An account numbered ${otherBank} is already in the chart.`,
    });
    expect(await renumber(bank.code, bank.name, "99")).toEqual({
      ok: false, detail: "code_shape", message: LEDGER_ACCOUNT_CODE_MESSAGE,
    });
    // Nothing moved.
    expect((await q("select count(*)::int as n from gl_accounts where code = $1", [bank.code])).rows[0].n).toBe(1);
  });

  it("renumbers, and the posted line, the approved money move and the payout bank carry the new number", async () => {
    await actAs(U.finance);
    expect(await renumber(bank.code, bank.name, fresh)).toEqual({ ok: true, value: fresh });

    // The money move: same move, same amount, still approved, new number.
    const move = (await q(
      "select from_account_code, to_account_code, amount::float as amount, status, gl_entry_id from gl_money_moves where id = $1", [moveId],
    )).rows[0];
    expect(move).toEqual({ from_account_code: fresh, to_account_code: otherBank, amount: 250, status: "approved", gl_entry_id: entryId });

    // The posted line: the entry's credit now names the new number.
    const lines = (await q(
      "select account_code, debit::float as debit, credit::float as credit from gl_entry_lines where entry_id = $1 order by credit desc",
      [entryId],
    )).rows;
    expect(lines).toEqual([
      { account_code: fresh, debit: 0, credit: 250 },
      { account_code: otherBank, debit: 250, credit: 0 },
    ]);
    expect((await q("select count(*)::int as n from gl_entry_lines where account_code = $1", [bank.code])).rows[0].n).toBe(0);
    const totalAfter = Number((await q(
      "select coalesce(sum(debit - credit), 0)::float as t from gl_entry_lines where account_code = $1", [fresh],
    )).rows[0].t);
    expect(totalAfter).toBe(totalBefore);

    // The card payout bank, and the list the Money accounts tab reads.
    expect((await q("select bank_code from card_settlement_routes where holding_code = $1 and channel = 'showroom'", [holding])).rows[0].bank_code)
      .toBe(fresh);
    const listed = (await q("select code, name, money_kind, is_active from public.gl_money_accounts_list() where code in ($1, $2)", [bank.code, fresh])).rows;
    expect(listed).toEqual([{ code: fresh, name: bank.name, money_kind: "BANK", is_active: true }]);
    // Same heading in the chart; only the number changed.
    expect((await q("select name, parent_code from gl_accounts where code = $1", [fresh])).rows[0]).toEqual({ name: bank.name, parent_code: bank.parent });
  });

  it("the form's next save reaches the account at its new number, and a frozen move still refuses a direct edit", async () => {
    await actAs(U.finance);
    expect(await attempt("select public.gl_money_account_update($1, $2, true)", [fresh, bank.name])).toEqual({ ok: true, value: fresh });
    const edit = await attempt("update gl_money_moves set amount = amount + 1 where id = $1", [moveId]);
    expect(edit.ok).toBe(false);
  });
});

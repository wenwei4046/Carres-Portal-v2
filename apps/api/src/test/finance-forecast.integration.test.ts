import { describe, it, expect, beforeAll, afterAll } from "vitest";
import pg from "pg";
import { forecastReport, type ForecastAnswer } from "@carres/shared/forecast";

/**
 * 0646 ON A REAL POSTGRESQL RUNNING THE WHOLE MIGRATION CHAIN: the Forecast
 * (Chew 2026-10-03, docs/finance/MASTER.md §3.6). A month is planned through
 * the real door, read back through the shared arithmetic, saved again over a
 * stale read (refused), cleared, and carried along when an account is
 * renumbered.
 *
 * One transaction, rolled back at the end.
 *
 *   PG_BIN=<postgres bin> node scripts/dry-run-migrations.mjs --baseline scripts/migration-replay-baseline.json --keep
 *   CARRES_TEST_DATABASE_URL=postgres://postgres@localhost:<port>/<db> pnpm --filter @carres/api test -- finance-forecast
 *
 * Without the URL every case is SKIPPED — reported as skipped, never as passed.
 */
const URL = process.env.CARRES_TEST_DATABASE_URL ?? "";
const LOCAL = /^postgres(ql)?:\/\/[^@/]*@?(localhost|127\.0\.0\.1|\[::1\])(:\d+)?\//.test(URL);
const RUN = Date.now() % 100000;
const HEX = RUN.toString(16).padStart(5, "0");
const uid = (tail: string) => `fcfcfcfc-0000-4000-8000-${HEX}${tail.padStart(7, "0")}`;
const U = { finance: uid("1"), principal: uid("2"), operation: uid("3") };
// Months far from any real plan, so the test never meets one.
const M1 = "2091-05";
const M2 = "2091-06";

describe.skipIf(!URL)("the Forecast (real PostgreSQL, 0646)", () => {
  let db: pg.Client;
  let income = "";
  let cost = "";
  let expense = "";
  let heading = "";
  let savedAt: string | null = null;
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
  /** Exactly the call PUT /forecast/:month makes. */
  const save = (month: string, lines: unknown, was: string | null) =>
    attempt("select public.fin_forecast_save($1, $2::jsonb, $3::timestamptz)::text as at", [month, JSON.stringify(lines), was]);
  const read = async (month: string) => (await q("select public.fin_forecast_read($1) as r", [month])).rows[0].r as ForecastAnswer;
  /** The save time as the read serves it: what the page sends back as `was`. */
  const wasOf = async (month: string) => (await read(month)).updated_at;

  beforeAll(async () => {
    if (!LOCAL) throw new Error("CARRES_TEST_DATABASE_URL must point at localhost");
    db = new pg.Client({ connectionString: URL });
    await db.connect();
    await q("begin");
    for (const [id, role] of [[U.finance, "finance"], [U.principal, "principal"], [U.operation, "operation"]] as const) {
      const email = `it-fc-${role}-${RUN}@carres.test`;
      await q("insert into auth.users (id, email) values ($1, $2)", [id, email]);
      await q("insert into app_users (id, email, name, role, status, is_person) values ($1, $2, $3, $4, 'active', true)", [id, email, `IT ${role}`, role]);
    }
    const picked = (await q(`
      select (select a.code from gl_accounts a where a.is_active and not a.is_heading and a.kind = 'INCOME' order by a.code limit 1) as income,
             public.gl_account_for('COST_OF_GOODS_SOLD') as cost,
             (select a.code from gl_accounts a where a.is_active and not a.is_heading and a.kind = 'EXPENSE'
                and coalesce(a.parent_code, '') <> coalesce((select c.parent_code from gl_accounts c where c.code = public.gl_account_for('COST_OF_GOODS_SOLD')), '')
              order by a.code limit 1) as expense,
             (select a.code from gl_accounts a where a.is_heading and a.kind = 'EXPENSE' order by a.code limit 1) as heading`)).rows[0];
    ({ income, cost, expense, heading } = picked);
  }, 30000);

  afterAll(async () => {
    if (!db) return;
    await q("rollback").catch(() => undefined);
    await db.end();
  });

  it("only Finance and the principal read and plan a month", async () => {
    await actAs(U.operation);
    expect(await attempt("select public.fin_forecast_read($1)", [M1])).toMatchObject({ ok: false, detail: "not_internal" });
    expect(await save(M1, { [income]: { amount: 1 } }, null)).toMatchObject({ ok: false, detail: "not_finance" });
    await actAs(null);
    expect(await attempt("select public.fin_forecast_read($1)", [M1])).toMatchObject({ ok: false });
    // Nothing is written by the door's caller directly.
    await actAs(U.finance);
    await q("set local role authenticated");
    expect(await attempt("insert into fin_forecasts (month) values ($1)", [M1])).toMatchObject({ ok: false });
    await q("reset role");
  });

  it("lists every account that can be planned, in blocks, and never a heading", async () => {
    await actAs(U.finance);
    const r = await read(M1);
    const blockOf = new Map(r.accounts.map((a) => [a.code, a.block]));
    expect([blockOf.get(income), blockOf.get(cost), blockOf.get(expense)]).toEqual(["income", "cost", "expense"]);
    expect(blockOf.has(heading)).toBe(false);
    // Income first, then cost of sales, then expenses.
    const blocks = r.accounts.map((a) => a.block);
    expect(blocks).toEqual([...blocks].sort((x, y) => ["income", "cost", "expense"].indexOf(x) - ["income", "cost", "expense"].indexOf(y)));
    expect(r).toMatchObject({ month: M1, lines: {}, updated_at: null, previous: null });
  });

  it("checks every cell and names the first wrong one; nothing is kept then", async () => {
    await actAs(U.finance);
    expect(await save("2091-13", {}, null)).toMatchObject({ ok: false, detail: "month_invalid" });
    expect(await save(M1, { [heading]: { amount: 1 } }, null)).toMatchObject({ ok: false, detail: "account_not_plannable" });
    expect(await save(M1, { "1100": { amount: 1 } }, null)).toMatchObject({ ok: false, detail: "account_not_plannable" });
    const shareOnIncome = await save(M1, { [income]: { share: 100 } }, null);
    expect(shareOnIncome).toMatchObject({ ok: false, detail: "income_needs_amount" });
    expect((shareOnIncome as { message: string }).message).toMatch(new RegExp(`^${income} .+: an income account is planned as an amount\\.$`));
    expect(await save(M1, { [expense]: { amount: 1, share: 1 } }, null)).toMatchObject({ ok: false, detail: "cell_invalid" });
    expect(await save(M1, { [expense]: { amount: 1.234 } }, null)).toMatchObject({ ok: false, detail: "cell_invalid" });
    expect(await save(M1, { [expense]: { share: 12.5 } }, null)).toMatchObject({ ok: false, detail: "cell_invalid" });
    expect(await save(M1, { [expense]: { share: -1 } }, null)).toMatchObject({ ok: false, detail: "cell_invalid" });
    expect(await save(M1, { [expense]: { amount: "12" } }, null)).toMatchObject({ ok: false, detail: "cell_invalid" });
    expect(await save(M1, { [expense]: { other: 1 } }, null)).toMatchObject({ ok: false, detail: "cell_invalid" });
    // A good cell beside a bad one is not kept either.
    expect(await save(M1, { [income]: { amount: 5 }, [expense]: { amount: 1.234 } }, null)).toMatchObject({ ok: false });
    expect((await read(M1)).lines).toEqual({});
  });

  it("saves the month, reads it back through the shared arithmetic, and refuses a save over a stale read", async () => {
    await actAs(U.finance);
    const first = await save(M1, { [income]: { amount: 100000 }, [cost]: { share: 5500 }, [expense]: { amount: 8000.5 } }, null);
    expect(first.ok, JSON.stringify(first)).toBe(true);
    const r = await read(M1);
    expect(r.lines).toEqual({ [income]: { amount: 100000 }, [cost]: { share: 5500 }, [expense]: { amount: 8000.5 } });
    expect(r.updated_by_name).toBe("IT finance");
    expect(r.planned_months).toContain(M1);
    const report = forecastReport(r.accounts, r.lines, null);
    expect(report.lines.find((l) => l.account.code === cost)).toMatchObject({ plan: 5500000, share: 5500 });
    savedAt = r.updated_at;

    // A save that read nothing, after Finance saved the month: refused.
    expect(await save(M1, { [income]: { amount: 1 } }, null)).toMatchObject({ ok: false, detail: "forecast_changed" });
    // The principal saves over the right read; Finance's older read is then stale.
    await actAs(U.principal);
    expect((await save(M1, { [income]: { amount: 120000 }, [cost]: { share: 5000 } }, savedAt)).ok).toBe(true);
    await actAs(U.finance);
    expect(await save(M1, { [income]: { amount: 1 } }, savedAt)).toMatchObject({ ok: false, detail: "forecast_changed" });
    const now = await read(M1);
    // The cell the new plan no longer holds is gone.
    expect(now.lines).toEqual({ [income]: { amount: 120000 }, [cost]: { share: 5000 } });
    expect(now.updated_by_name).toBe("IT principal");
  });

  it("hands the next month the latest earlier plan, and an empty plan clears a month", async () => {
    await actAs(U.finance);
    const r = await read(M2);
    expect(r.previous).toEqual({ month: M1, lines: { [income]: { amount: 120000 }, [cost]: { share: 5000 } } });
    expect((await save(M1, {}, await wasOf(M1))).ok).toBe(true);
    const cleared = await read(M1);
    expect(cleared.lines).toEqual({});
    expect(cleared.planned_months).not.toContain(M1);
    expect((await read(M2)).previous).toBeNull();
  });

  it("a renumbered account keeps its plan (0570's law)", async () => {
    await actAs(U.finance);
    expect((await save(M2, { [expense]: { amount: 700 } }, await wasOf(M2))).ok).toBe(true);
    const name = (await q("select name from gl_accounts where code = $1", [expense])).rows[0].name as string;
    const fresh = (await q(
      "select min(c)::text as c from generate_series(6950, 6999) c where not exists (select 1 from gl_accounts where code = c::text)",
    )).rows[0].c as string;
    expect(await attempt("select public.gl_account_update($1, $2, $3) as code", [expense, name, fresh])).toEqual({ ok: true, value: fresh });
    expect((await read(M2)).lines).toEqual({ [fresh]: { amount: 700 } });
  });
});

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import pg from "pg";

/**
 * 0639 ON A REAL POSTGRESQL RUNNING THE WHOLE MIGRATION CHAIN: the General
 * Ledger (Chew 2026-10-03, docs/finance/MASTER.md §3.6). Every account's
 * period, gathered from gl_account_ledger's own rows.
 *
 * One transaction, rolled back at the end.
 *
 *   PG_BIN=<postgres bin> node scripts/dry-run-migrations.mjs --baseline scripts/migration-replay-baseline.json --keep
 *   CARRES_TEST_DATABASE_URL=postgres://postgres@localhost:<port>/<db> pnpm --filter @carres/api test -- finance-general-ledger
 *
 * Without the URL every case is SKIPPED — reported as skipped, never as passed.
 */
const URL = process.env.CARRES_TEST_DATABASE_URL ?? "";
const LOCAL = /^postgres(ql)?:\/\/[^@/]*@?(localhost|127\.0\.0\.1|\[::1\])(:\d+)?\//.test(URL);
const RUN = Date.now() % 100000;
const HEX = RUN.toString(16).padStart(5, "0");
const uid = (tail: string) => `dddddddd-0000-4000-8000-${HEX}${tail.padStart(7, "0")}`;
const U = { finance: uid("1"), operation: uid("2") };

type WireRow = { row_kind: string; account_code: string; entry_no: string | null; debit: number | null; credit: number | null; running_balance: number };
type Ledger = { status: string; go_live_on: string; accounts: Array<{ account_code: string; rows: WireRow[] }> };

describe.skipIf(!URL)("General Ledger (real PostgreSQL, 0639)", () => {
  let db: pg.Client;
  let goLive = "";
  let onDate = "";
  let bank = "";
  let expense = "";
  let quiet = "";
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
  async function ledger(from: string, to: string, accounts: string[] | null = null): Promise<Ledger> {
    await actAs(U.finance);
    const r = await attempt("select public.fin_general_ledger($1::date, $2::date, $3::text[]) as g", [from, to, accounts]);
    if (!r.ok) throw new Error(`fin_general_ledger refused: ${r.code}`);
    return r.value as Ledger;
  }
  const post = (doc: string, lines: unknown[]) =>
    q("select public.gl_post('IT_0639', $1, $2::date, 'IT 0639', $3::jsonb) as id", [doc, onDate, JSON.stringify(lines)]);

  beforeAll(async () => {
    if (!LOCAL) throw new Error("CARRES_TEST_DATABASE_URL must point at localhost");
    db = new pg.Client({ connectionString: URL });
    await db.connect();
    await q("begin");
    await q("update gl_config set go_live_on = coalesce(go_live_on, date '2026-01-01') where id");
    const d = (await q(`select go_live_on::text as g,
                               greatest(timezone('Asia/Kuala_Lumpur', now())::date, go_live_on)::text as d
                          from gl_config where id`)).rows[0];
    goLive = d.g;
    onDate = d.d;
    const leaf = "not exists (select 1 from gl_accounts c where c.parent_code = a.code)";
    const pick = (
      await q(`
        select (select m.account_code from gl_money_accounts m join gl_accounts a on a.code = m.account_code
                 where m.money_kind = 'BANK' and a.is_active and ${leaf} order by m.account_code limit 1) as bank,
               (select a.code from gl_accounts a where a.is_active and not a.is_control and a.kind = 'EXPENSE'
                   and not public.ap_account_is_money(a.code) and ${leaf} order by a.code limit 1) as expense`)
    ).rows[0];
    ({ bank, expense } = pick);
    // An account nobody has ever posted to: added for the test, so it is certain.
    quiet = `IT${HEX}Q`;
    await q(`insert into gl_accounts (code, name, kind, parent_code, is_control, is_active)
             select $1, 'IT quiet', 'EXPENSE', parent_code, false, true from gl_accounts where code = $2`, [quiet, expense]);

    for (const [id, role] of [[U.finance, "finance"], [U.operation, "operation"]] as const) {
      const email = `it-gl-${role}-${id.slice(-4)}-${RUN}@carres.test`;
      await q("insert into auth.users (id, email) values ($1, $2)", [id, email]);
      await q("insert into app_users (id, email, name, role, status, is_person) values ($1, $2, $3, $4, 'active', true)", [id, email, `IT ${role}`, role]);
    }
    await post(`IT-0639-A-${RUN}`, [{ account_code: expense, debit: 120.25, department_type: "OFFICE" }, { account_code: bank, credit: 120.25 }]);
  }, 30000);

  afterAll(async () => {
    if (!db) return;
    await q("rollback").catch(() => undefined);
    await db.end();
  });

  it("is internal, and asks for a period that runs forward", async () => {
    await actAs(U.operation);
    expect(await attempt("select public.fin_general_ledger($1::date, $1::date)", [onDate])).toEqual({ ok: false, code: "42501" });
    await actAs(U.finance);
    expect(await attempt("select public.fin_general_ledger(null, $1::date)", [onDate])).toEqual({ ok: false, code: "22004" });
    expect(await attempt("select public.fin_general_ledger($1::date, ($1::date - 1))", [onDate])).toEqual({ ok: false, code: "22007" });
  });

  it("lists an account that moved, in code order, and leaves out one that never did", async () => {
    const g = await ledger(goLive, onDate);
    expect(g.status).toBe("OK");
    const codes = g.accounts.map((a) => a.account_code);
    expect(codes).toContain(bank);
    expect(codes).toContain(expense);
    expect(codes).not.toContain(quiet);
    expect(codes).toEqual([...codes].sort());
  });

  it("names only the accounts asked for", async () => {
    const g = await ledger(goLive, onDate, [expense, quiet]);
    expect(g.accounts.map((a) => a.account_code)).toEqual([expense]);
  });

  it("every block is gl_account_ledger's own rows for that account", async () => {
    const g = await ledger(goLive, onDate, [bank, expense]);
    for (const block of g.accounts) {
      const own = (await q(
        "select row_kind, entry_no, debit::float as debit, credit::float as credit, running_balance::float as running_balance from public.gl_account_ledger($1, $2::date, $3::date) order by ordinal",
        [block.account_code, goLive, onDate],
      )).rows;
      expect(block.rows.map((r) => [r.row_kind, r.entry_no, r.debit === null ? null : Number(r.debit), r.credit === null ? null : Number(r.credit), Number(r.running_balance)]))
        .toEqual(own.map((r) => [r.row_kind, r.entry_no, r.debit, r.credit, r.running_balance]));
    }
  });

  it("an account whose lines all fall before the period still shows its balance brought forward", async () => {
    const later = (await q("select ($1::date + 1)::text as d", [onDate])).rows[0].d as string;
    const g = await ledger(later, later, [expense]);
    expect(g.accounts).toHaveLength(1);
    const rows = g.accounts[0]!.rows;
    expect(rows.filter((r) => r.row_kind === "LINE")).toHaveLength(0);
    expect(Number(rows.find((r) => r.row_kind === "OPENING")!.running_balance)).not.toBe(0);
  });

  it("a period that ends before go-live says so instead of printing zeros", async () => {
    const before = (await q("select ($1::date - 1)::text as d", [goLive])).rows[0].d as string;
    const g = await ledger(before, before);
    expect(g).toMatchObject({ status: "BEFORE_GO_LIVE", accounts: [] });
  });
});

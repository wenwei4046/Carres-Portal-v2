import { describe, it, expect, beforeAll, afterAll } from "vitest";
import pg from "pg";

/**
 * 0608 ON A REAL POSTGRESQL RUNNING THE WHOLE MIGRATION CHAIN: a heading is
 * added on its own, with no first account. It is stored as a heading at once,
 * takes an account under it, is never posted to while empty, and still never
 * goes under a gl_rule_headings heading. One transaction, rolled back; every
 * account is reached by role or by the chart itself, never by number.
 *
 *   CARRES_TEST_DATABASE_URL=postgres://postgres@localhost:<port>/<db> pnpm --filter @carres/api test -- chart-heading-on-its-own
 *
 * Without the URL every case is SKIPPED.
 */
const URL = process.env.CARRES_TEST_DATABASE_URL ?? "";
const LOCAL = /^postgres(ql)?:\/\/[^@/]*@?(localhost|127\.0\.0\.1|\[::1\])(:\d+)?\//.test(URL);
const RUN = Date.now() % 100000;
const HEX = RUN.toString(16).padStart(5, "0");
const FINANCE = `eeeeeeee-0608-4000-8000-${HEX}0000001`;

describe.skipIf(!URL)("a heading is added on its own (real PostgreSQL, 0608)", () => {
  let db: pg.Client;
  let onDate = "";
  let parent = "";   // an expense heading outside the money and rule headings
  let posting = "";  // any account that takes postings
  let rule = "";     // a heading gl_rule_headings names
  const q = (sql: string, params: unknown[] = []) => db.query(sql, params);
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
  const refusal = (detail: string) => expect.objectContaining({ ok: false, detail });
  /** A four digit number nobody has, so the case never collides with the chart. */
  const free = async (skip = 0): Promise<string> =>
    (await q(`select lpad(g::text, 4, '0') as c from generate_series(1000, 9999) g
               where not exists (select 1 from gl_accounts a where a.code = lpad(g::text, 4, '0'))
               order by g offset $1 limit 1`, [skip])).rows[0].c;
  const row = async (code: string) =>
    (await q("select parent_code, is_heading, sort_order from gl_accounts where code = $1", [code])).rows[0] as
      { parent_code: string; is_heading: boolean; sort_order: number } | undefined;

  beforeAll(async () => {
    if (!LOCAL) throw new Error("CARRES_TEST_DATABASE_URL must point at localhost");
    db = new pg.Client({ connectionString: URL });
    await db.connect();
    await q("begin");
    await q("update gl_config set go_live_on = coalesce(go_live_on, date '2026-01-01') where id");
    onDate = (await q("select greatest(timezone('Asia/Kuala_Lumpur', now())::date, (select go_live_on from gl_config where id))::text as d")).rows[0].d;
    const email = `it-heading-${RUN}@carres.test`;
    await q("insert into auth.users (id, email) values ($1, $2)", [FINANCE, email]);
    await q("insert into app_users (id, email, name, role, status) values ($1, $2, 'IT finance', 'finance', 'active')", [FINANCE, email]);
    await q("select set_config('request.jwt.claims', $1, false)", [JSON.stringify({ sub: FINANCE, role: "authenticated" })]);
    rule = (await q("select (public.gl_rule_headings())[1] as c")).rows[0].c;
    parent = (await q(`select a.code from gl_accounts a
                        where a.is_heading and a.kind = 'EXPENSE' and a.parent_code is null
                          and a.code <> all (public.gl_rule_headings())
                        order by a.sort_order, a.code limit 1`)).rows[0].code;
    posting = (await q(`select a.code from gl_accounts a
                         where not a.is_heading and a.is_active and not a.is_control and a.kind = 'EXPENSE'
                         order by a.sort_order, a.code limit 1`)).rows[0].code;
  }, 30000);

  afterAll(async () => {
    if (!db) return;
    await q("rollback").catch(() => undefined);
    await db.end();
  });

  it("keeps exactly one gl_account_add, run by authenticated and never by anon", async () => {
    const fns = await q("select p.oid::regprocedure::text as f from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'gl_account_add'");
    expect(fns.rows.map((r) => r.f)).toEqual(["gl_account_add(text,text,text,text,text,boolean)"]);
    const g = await q(`select has_function_privilege('anon', 'public.gl_account_add(text,text,text,text,text,boolean)', 'execute') as anon,
                              has_function_privilege('authenticated', 'public.gl_account_add(text,text,text,text,text,boolean)', 'execute') as auth`);
    expect(g.rows[0]).toEqual({ anon: false, auth: true });
  });

  it("adds a heading with no first account; it is a heading at once and takes an account under it", async () => {
    const lastBefore = (await q("select coalesce(max(sort_order), 0) as m from gl_accounts where parent_code = $1", [parent])).rows[0].m;
    const head = await free();
    expect(await attempt("select public.gl_account_add($1, $2, 'IT heading alone', p_is_heading => true)", [parent, head])).toEqual({ ok: true, value: head });
    expect(await row(head)).toEqual({ parent_code: parent, is_heading: true, sort_order: lastBefore + 1 });
    expect((await q("select count(*)::int as n from gl_accounts where parent_code = $1", [head])).rows[0].n).toBe(0);

    const under = await free();
    expect(await attempt("select public.gl_account_add($1, $2, 'IT under the new heading')", [head, under])).toEqual({ ok: true, value: under });
    expect(await row(under)).toEqual({ parent_code: head, is_heading: false, sort_order: 1 });
  });

  it("never posts to the empty heading", async () => {
    const head = await free();
    expect((await attempt("select public.gl_account_add($1, $2, 'IT empty heading', p_is_heading => true)", [parent, head])).ok).toBe(true);
    const post = await attempt("select public.gl_post('IT_0608', $1, $2::date, 'x', $3::jsonb)", [
      `IT-0608-${RUN}`, onDate, JSON.stringify([{ account_code: head, debit: 10 }, { account_code: posting, credit: 10 }]),
    ]);
    expect(post).toEqual(refusal("gl_post_account_is_header"));
  });

  it("still refuses a heading under a rule heading, alone or with a first account", async () => {
    expect(await attempt("select public.gl_account_add($1, $2, 'IT rule heading', p_is_heading => true)", [rule, await free()]))
      .toEqual(refusal("add_rule_heading"));
    expect(await attempt("select public.gl_account_add($1, $2, 'IT rule heading', $3, 'IT rule first')", [rule, await free(), await free(1)]))
      .toEqual(refusal("add_rule_heading"));
  });

  it("still adds a heading with its first account, five arguments as before", async () => {
    const head = await free();
    const first = await free(1);
    expect(await attempt("select public.gl_account_add($1, $2, 'IT heading with first', $3, 'IT first account')", [parent, head, first]))
      .toEqual({ ok: true, value: head });
    expect((await row(head))?.is_heading).toBe(true);
    expect(await row(first)).toEqual({ parent_code: head, is_heading: false, sort_order: 1 });
  });

  it("an account added without the flag is not a heading, and a signed out caller is refused", async () => {
    const plain = await free();
    expect((await attempt("select public.gl_account_add($1, $2, 'IT plain account')", [parent, plain])).ok).toBe(true);
    expect((await row(plain))?.is_heading).toBe(false);
    await q("select set_config('request.jwt.claims', '', false)");
    expect(await attempt("select public.gl_account_add($1, $2, 'IT nobody', p_is_heading => true)", [parent, await free()]))
      .toEqual(refusal("not_finance"));
    await q("select set_config('request.jwt.claims', $1, false)", [JSON.stringify({ sub: FINANCE, role: "authenticated" })]);
  });
});

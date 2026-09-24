import { describe, it, expect, beforeAll, afterAll } from "vitest";
import pg from "pg";

/**
 * 0580 ON A REAL POSTGRESQL RUNNING THE WHOLE MIGRATION CHAIN: an account moves
 * between any two headings of the same kind, the last account may leave its
 * heading, the emptied heading stays a heading, and only bank and cash
 * accounts go under the money accounts heading. One transaction, rolled back;
 * identities through the request-claims GUC, as money-moves.integration.test.ts.
 *
 *   CARRES_TEST_DATABASE_URL=postgres://postgres@localhost:<port>/<db> pnpm --filter @carres/api test -- chart-move-same-kind
 *
 * Without the URL every case is SKIPPED.
 */
const URL = process.env.CARRES_TEST_DATABASE_URL ?? "";
const LOCAL = /^postgres(ql)?:\/\/[^@/]*@?(localhost|127\.0\.0\.1|\[::1\])(:\d+)?\//.test(URL);
const RUN = Date.now() % 100000;
const HEX = RUN.toString(16).padStart(5, "0");
const uid = (tail: string) => `eeeeeeee-0580-4000-8000-${HEX}${tail.padStart(7, "0")}`;
const U = { finance: uid("1"), principal: uid("2") };
const POS = uid("a1");

describe.skipIf(!URL)("chart moves between any two headings of the same kind (real PostgreSQL, 0580)", () => {
  let db: pg.Client;
  let onDate = "";
  // Reached by role, never by number.
  let money = "";
  let stock = "";
  let customerMoney = "";
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
      return { ok: false, detail: (e as { detail?: string }).detail ?? (e as Error).message, message: (e as Error).message };
    }
  }
  const role = async (r: string) => (await q("select public.gl_account_for($1) as c", [r])).rows[0].c as string;
  const kids = async (parent: string | null): Promise<string[]> =>
    (await q("select coalesce(array_agg(code order by sort_order, code), '{}') as k from gl_accounts where parent_code is not distinct from $1", [parent])).rows[0].k;
  const parentOf = async (code: string) => (await q("select parent_code from gl_accounts where code = $1", [code])).rows[0].parent_code as string | null;
  const flag = async (code: string) => (await q("select is_heading from gl_accounts where code = $1", [code])).rows[0].is_heading as boolean;
  /** What the chart screen sends: both headings' order as read, and as wanted. */
  async function move(code: string, to: string) {
    const fromWas = await kids(await parentOf(code));
    const toWas = await kids(to);
    return attempt("select public.gl_account_move($1, $2, $3, $4, $5, $6)", [
      code, to, fromWas, fromWas.filter((c) => c !== code), toWas, [...toWas, code],
    ]);
  }
  const add = (parent: string, code: string, name: string, firstCode: string | null = null, firstName: string | null = null) =>
    attempt("select public.gl_account_add($1, $2, $3, $4, $5)", [parent, code, name, firstCode, firstName]);
  const refusal = (detail: string) => expect.objectContaining({ ok: false, detail });

  beforeAll(async () => {
    if (!LOCAL) throw new Error("CARRES_TEST_DATABASE_URL must point at localhost");
    db = new pg.Client({ connectionString: URL });
    await db.connect();
    await q("begin");
    await q("update gl_config set go_live_on = coalesce(go_live_on, date '2026-01-01') where id");
    onDate = (await q("select greatest(timezone('Asia/Kuala_Lumpur', now())::date, (select go_live_on from gl_config where id))::text as d")).rows[0].d;
    await q("insert into org_positions (id, name, band) values ($1, $2, 'executive')", [POS, `IT chart ${RUN}`]);
    for (const [id, r, position] of [[U.finance, "finance", POS], [U.principal, "principal", null]] as const) {
      const email = `it-chart-${r}-${RUN}@carres.test`;
      await q("insert into auth.users (id, email) values ($1, $2)", [id, email]);
      await q("insert into app_users (id, email, name, role, status, position_id) values ($1, $2, $3, $4, 'active', $5)", [
        id, email, `IT ${r}`, r, position,
      ]);
    }
    await q("update app_users set is_person = true where id = $1", [U.principal]);
    money = await role("MONEY_ACCOUNTS_HEADING");
    stock = await role("STOCK_HEADING");
    customerMoney = await role("CUSTOMER_MONEY_HEADING");
    await actAs(U.finance);
  }, 30000);

  afterAll(async () => {
    if (!db) return;
    await q("rollback").catch(() => undefined);
    await db.end();
  });

  it("stores every heading the chart has today", async () => {
    const wrong = await q(`select code from gl_accounts a
                            where is_heading <> exists (select 1 from gl_accounts c where c.parent_code = a.code)`);
    expect(wrong.rows).toEqual([]);
  });

  it("moves 2310 out of 2300 as its last account; 2300 stays a heading and takes it back", async () => {
    expect(await kids("2300")).toEqual(["2310"]);
    expect(await move("2310", "2100")).toMatchObject({ ok: true, value: "2310" });
    expect(await kids("2300")).toEqual([]);
    expect(await flag("2300")).toBe(true);
    expect(await parentOf("2310")).toBe("2100");
    // Back in: the empty heading's order before the drag is {}.
    expect(await move("2310", "2300")).toMatchObject({ ok: true, value: "2310" });
    expect(await kids("2300")).toEqual(["2310"]);
  });

  it("an empty heading is never posted to and no picker offers it", async () => {
    expect((await move("2310", "2100")).ok).toBe(true);
    const post = await attempt("select public.gl_post('IT_0580', $1, $2::date, 'x', $3::jsonb)", [
      `IT-0580-${RUN}`, onDate, JSON.stringify([{ account_code: "2300", credit: 10 }, { account_code: "6900", debit: 10 }]),
    ]);
    expect(post).toEqual(refusal("gl_post_account_is_header"));
    const ap = await q("select code from public.ap_account_choices() where code = '2300'");
    expect(ap.rows).toEqual([]);
    const moneyIn = await q("select code from public.fin_money_in_account_options() where code = '2300'");
    expect(moneyIn.rows).toEqual([]);
    expect(await attempt("select public._ap_require_account('2300', 'voucher_line', 'Line 1')")).toEqual(refusal("account_is_heading"));
    const problem = await q("select public.fin_money_in_account_problem('2300', 'receipt_line') as p");
    expect(problem.rows[0].p).toBe("Account 2300 Taxes is a group heading. Pick an account under it.");
    expect(await attempt("select public.gl_accounts_reorder('2300', array['2310'], array['2310'])")).toEqual(refusal("order_stale"));
    expect((await move("2310", "2300")).ok).toBe(true);
  });

  it("the Balance Sheet and the Profit and Loss print no line for an empty heading", async () => {
    expect((await move("2310", "2100")).ok).toBe(true);
    expect((await add("6000", "6600", "Travel", "6610", "Air fares")).ok).toBe(true);
    expect(await flag("6600")).toBe(true);
    expect((await move("6610", "6000")).ok).toBe(true);
    const posted = await attempt("select public.gl_post('IT_0580', $1, $2::date, 'x', $3::jsonb)", [
      `IT-0580-PL-${RUN}`, onDate, JSON.stringify([{ account_code: "6610", debit: 25 }, { account_code: "1110", credit: 25 }]),
    ]);
    expect(posted.ok).toBe(true);
    const bs = await q("select row_kind, header_code, account_code, amount::float as amount from public.gl_balance_sheet($1::date)", [onDate]);
    expect(bs.rows.filter((r) => r.header_code === "2300" || r.account_code === "2300")).toEqual([]);
    expect(bs.rows.find((r) => r.row_kind === "EQUATION")!.amount).toBe(0);
    const pl = await q("select row_kind, header_code, account_code, amount::float as amount from public.gl_profit_and_loss($1::date, $1::date)", [onDate]);
    expect(pl.rows.filter((r) => r.header_code === "6600" || r.account_code === "6600")).toEqual([]);
    expect(pl.rows).toContainEqual({ row_kind: "ACCOUNT", header_code: "6000", account_code: "6610", amount: 25 });
    expect(pl.rows).toContainEqual({ row_kind: "HEADER_SUBTOTAL", header_code: "6000", account_code: null, amount: 25 });
    expect((await move("2310", "2300")).ok).toBe(true);
  });

  it("an account is added under an empty heading, and adding a heading still makes one", async () => {
    expect((await move("2310", "2100")).ok).toBe(true);
    expect((await add("2300", "2320", "Service tax payable")).ok).toBe(true);
    expect(await kids("2300")).toEqual(["2320"]);
    expect(await flag("2320")).toBe(false);
    expect((await add("2000", "2400", "Provisions", "2410", "Warranty provision")).ok).toBe(true);
    expect(await flag("2400")).toBe(true);
    expect(await add("2410", "2420", "Other provision")).toEqual(refusal("add_onto_account"));
  });

  it("a heading with nothing under it cannot be mapped to receive money or income", async () => {
    expect((await add("4000", "4500", "Commissions", "4510", "Referral fees")).ok).toBe(true);
    expect((await move("4510", "4000")).ok).toBe(true);
    await actAs(U.principal);
    expect(await attempt("select public.gl_map_income_account('STORAGE', null, '4500', null)")).toEqual(refusal("account_is_header"));
    await actAs(U.finance);
  });

  it("refuses an account that is not a bank or cash account under the money accounts heading", async () => {
    const r = await move("1250", money);
    expect(r).toEqual(refusal("move_into_money_heading"));
    expect((r as { message: string }).message).toBe(
      `1250 Loans and advances given is not a bank or cash account. Only bank and cash accounts go under ${money} Cash and bank.`,
    );
    // A heading holding one is refused too, and names it.
    const h = await move("1200", money);
    expect(h).toEqual(refusal("move_into_money_heading"));
    expect((h as { message: string }).message).toMatch(/^1200 Receivables holds 1210 .+, which is not a bank or cash account\./);
  });

  it("refuses the same account under a heading inside the money accounts heading; a bank account goes in and out", async () => {
    expect((await add("1000", "1400", "Deposits paid", "1410", "Rental deposits")).ok).toBe(true);
    // An ordinary account leaves 1400 as its last, and the empty heading may go in.
    expect((await move("1410", "1200")).ok).toBe(true);
    expect((await move("1400", money)).ok).toBe(true);
    expect(await move("1250", "1400")).toEqual(refusal("move_into_money_heading"));
    const bank = (await kids(money)).find((c) => c !== "1400")!;
    expect((await move(bank, "1400")).ok).toBe(true);
    expect(await move(bank, "1200")).toMatchObject({ ok: true });
    expect(await move(bank, money)).toMatchObject({ ok: true });
    // No payment method may map to the empty heading either.
    expect((await move(bank, "1400")).ok).toBe(true);
    expect((await move(bank, money)).ok).toBe(true);
    await actAs(U.principal);
    expect(await attempt("select public.gl_map_payment_account('cash', '1400')")).toEqual(refusal("account_is_header"));
    await actAs(U.finance);
  });

  it("keeps the refusals: another kind, a rule heading, a heading under itself, an account as the target", async () => {
    expect(await move("1130", "2100")).toEqual(refusal("move_other_kind"));
    const stockAccount = (await kids(stock))[0]!;
    expect(await move(stockAccount, "1200")).toEqual(refusal("move_rule_heading"));
    expect(await move("2130", customerMoney)).toEqual(refusal("move_rule_heading"));
    expect(await move("1000", "1200")).toEqual(refusal("move_into_itself"));
    expect(await move("1250", "1230")).toEqual(refusal("move_onto_account"));
  });

  it("keeps the staleness check, and wants the order sent for an empty heading", async () => {
    const fromWas = await kids("2300");
    expect(fromWas).not.toEqual([]);
    const code = fromWas[0]!;
    const toWas = await kids("2100");
    const call = (to: string[] | null, fromNow: string[]) =>
      attempt("select public.gl_account_move($1, '2100', $2, $3, $4, $5)", [code, fromWas, fromNow, to, [...(to ?? toWas), code]]);
    expect(await call(toWas.slice(1), fromWas.slice(1))).toEqual(refusal("order_stale"));
    expect(await call(null, fromWas.slice(1))).toEqual(refusal("order_was_missing"));
    if (fromWas.length === 1) expect(await call(toWas, ["2210"])).toEqual(refusal("order_not_sibling"));
  });

  it("a heading keeps its flag while an account is under it", async () => {
    expect(await attempt("update gl_accounts set is_heading = false where code = '2100'")).toEqual(refusal("gl_heading_has_accounts"));
  });

  it("only Finance moves", async () => {
    await actAs(null);
    expect(await move("2130", "2350")).toEqual(refusal("not_finance"));
    await actAs(U.finance);
  });
});

/**
 * Two changes to the chart at once. Each door walks up and down the chart
 * through rows it does not lock, so without one shared lock a move into an
 * empty heading and a move of that heading's parent under the money accounts
 * heading could both pass and put an ordinary account under Cash and bank.
 * Each session below is its own connection and its own transaction, rolled back.
 */
describe.skipIf(!URL)("one change to the chart's structure at a time (real PostgreSQL, 0580)", () => {
  const open: pg.Client[] = [];
  let n = 0;
  /** A connection inside an open transaction, signed in as a Finance user of its own. */
  async function financeSession(): Promise<pg.Client> {
    if (!LOCAL) throw new Error("CARRES_TEST_DATABASE_URL must point at localhost");
    const c = new pg.Client({ connectionString: URL });
    await c.connect();
    open.push(c);
    const id = uid(`f${++n}`);
    const email = `it-chart-lock-${n}-${RUN}@carres.test`;
    await c.query("begin");
    await c.query("insert into auth.users (id, email) values ($1, $2)", [id, email]);
    await c.query("insert into app_users (id, email, name, role, status) values ($1, $2, $3, 'finance', 'active')", [
      id, email, `IT lock ${n}`,
    ]);
    await c.query("select set_config('request.jwt.claims', $1, false)", [JSON.stringify({ sub: id, role: "authenticated" })]);
    return c;
  }
  /** Asked from a third connection: is the chart-structure lock free right now? */
  async function lockIsFree(): Promise<boolean> {
    const c = new pg.Client({ connectionString: URL });
    await c.connect();
    try {
      return (await c.query("select pg_try_advisory_xact_lock(hashtext('gl_chart_structure')) as free")).rows[0].free as boolean;
    } finally {
      await c.end();
    }
  }
  const settle = async (p: Promise<unknown>) => p.then(() => "ok", (e: { code?: string }) => e.code ?? "error");

  afterAll(async () => {
    for (const c of open) {
      await c.query("rollback").catch(() => undefined);
      await c.end().catch(() => undefined);
    }
  });

  const kids = async (c: pg.Client, parent: string): Promise<string[]> =>
    (await c.query("select coalesce(array_agg(code order by sort_order, code), '{}') as k from gl_accounts where parent_code = $1", [parent])).rows[0].k;
  /** 2310 out of 2300 into 2100, as the chart screen sends it. */
  async function move2310(c: pg.Client) {
    const from = await kids(c, "2300");
    const to = await kids(c, "2100");
    return c.query("select public.gl_account_move('2310', '2100', $1, $2, $3, $4)", [
      from, from.filter((x) => x !== "2310"), to, [...to, "2310"],
    ]);
  }

  // Each call must SUCCEED: a statement that fails aborts its transaction, and
  // PostgreSQL lets go of that transaction's locks there and then.
  it.each([
    ["gl_account_move", (c: pg.Client) => move2310(c)],
    ["gl_account_add", (c: pg.Client) => c.query("select public.gl_account_add('6000', '6600', 'Travel', '6610', 'Air fares')")],
    ["gl_money_account_add", (c: pg.Client) => c.query("select public.gl_money_account_add($1, 'BANK')", [`IT lock bank ${RUN}`])],
    ["gl_account_update", (c: pg.Client) => c.query("select public.gl_account_update('2310', (select name from gl_accounts where code = '2310'))")],
  ])("%s holds the chart-structure lock until its transaction ends", async (_name, call) => {
    expect(await lockIsFree()).toBe(true);
    const s = await financeSession();
    await call(s);
    expect(await lockIsFree()).toBe(false);
    await s.query("rollback");
    expect(await lockIsFree()).toBe(true);
  });

  it("an add waits for a move elsewhere in the chart to finish", async () => {
    const first = await financeSession();
    const second = await financeSession();
    // The first moves 2310 out of 2300 and has not committed.
    await move2310(first);
    // The second adds under 6000: not one row in common with the move, so
    // only the shared lock makes it wait.
    await second.query("set local lock_timeout = '300ms'");
    expect(await settle(second.query("select public.gl_account_add('6000', '6600', 'Travel', '6610', 'Air fares')"))).toBe("55P03");
  });
});

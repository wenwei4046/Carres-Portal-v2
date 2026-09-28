import { describe, it, expect, beforeAll, afterAll } from "vitest";
import pg from "pg";

/**
 * 0583 ON A REAL POSTGRESQL RUNNING THE WHOLE MIGRATION CHAIN: after the card
 * payment methods are pointed at a new account, Money moves still refuses a
 * card payout from the old one while a card sale's money was posted there. A
 * plain bank account is unaffected. One transaction, rolled back; identities
 * through the request-claims GUC, as money-moves.integration.test.ts.
 *
 *   CARRES_TEST_DATABASE_URL=postgres://postgres@localhost:<port>/<db> pnpm --filter @carres/api test -- money-moves-card-posted
 *
 * Without the URL every case is SKIPPED.
 */
const URL = process.env.CARRES_TEST_DATABASE_URL ?? "";
const LOCAL = /^postgres(ql)?:\/\/[^@/]*@?(localhost|127\.0\.0\.1|\[::1\])(:\d+)?\//.test(URL);
const RUN = Date.now() % 100000;
const HEX = RUN.toString(16).padStart(5, "0");
const uid = (tail: string) => `ffffffff-0583-4000-8000-${HEX}${tail.padStart(7, "0")}`;
const U = { finance: uid("1"), operation: uid("2") };
const DEALER = uid("d1");
const SALES = uid("d2");
const ORDER = uid("e1");
const CARD_METHODS = ["card", "credit_card", "debit_card"];

describe.skipIf(!URL)("Money moves refuses every account a card sale was posted to (real PostgreSQL, 0583)", () => {
  let db: pg.Client;
  let onDate = "";
  // Made through Finance's own door, never named by number.
  let oldCard = "";
  let newCard = "";
  let bank = "";
  let otherBank = "";
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
  const create = (kind: string, from: string, to: string, amount: number) =>
    attempt("select public.gl_money_move_create($1, $2::date, $3, $4, $5, 0, 'IT 0583') as id", [kind, onDate, from, to, amount]);
  const cardAccounts = async () => (await q("select coalesce(array_agg(c), '{}') as c from public.gl_card_accounts_list() c")).rows[0].c as string[];
  const pointCardMethodsAt = (code: string) =>
    q("update gl_payment_account_map set account_code = $1 where method = any($2::text[])", [code, CARD_METHODS]);

  beforeAll(async () => {
    if (!LOCAL) throw new Error("CARRES_TEST_DATABASE_URL must point at localhost");
    db = new pg.Client({ connectionString: URL });
    await db.connect();
    await q("begin");
    await q("update gl_config set go_live_on = coalesce(go_live_on, date '2026-01-01') where id");
    onDate = (await q("select greatest(timezone('Asia/Kuala_Lumpur', now())::date, (select go_live_on from gl_config where id))::text as d")).rows[0].d;
    for (const [id, role] of [[U.finance, "finance"], [U.operation, "operation"]] as const) {
      const email = `it-0583-${role}-${RUN}@carres.test`;
      await q("insert into auth.users (id, email) values ($1, $2)", [id, email]);
      await q("insert into app_users (id, email, name, role, status) values ($1, $2, $3, $4, 'active')", [id, email, `IT ${role}`, role]);
    }
    await q("insert into dealers (id, name) values ($1, 'IT Dealer 0583')", [DEALER]);
    await q("insert into salespersons (id, dealer_id, name) values ($1, $2, 'IT Salesperson 0583')", [SALES, DEALER]);
    await q("insert into orders (id, dealer_id, salesperson_id, customer_name, customer_phone) values ($1, $2, $3, 'IT customer', '0100000000')", [ORDER, DEALER, SALES]);

    await actAs(U.finance);
    oldCard = (await q("select public.gl_money_account_add($1, 'HOLDING', null) as c", [`IT old card ${RUN}`])).rows[0].c;
    newCard = (await q("select public.gl_money_account_add($1, 'HOLDING', null) as c", [`IT new card ${RUN}`])).rows[0].c;
    bank = (await q("select public.gl_money_account_add($1, 'BANK', null) as c", [`IT bank ${RUN}`])).rows[0].c;
    otherBank = (await q("select public.gl_money_account_add($1, 'BANK', null) as c", [`IT bank two ${RUN}`])).rows[0].c;

    // A card sale is posted into the old card account ...
    await pointCardMethodsAt(oldCard);
    const posted = await q(
      "select public._customer_payment_post($1, 250, $2::date, 'card', 'payment', 'it_0583', $3, null, 'A1B2C3') as r",
      [ORDER, onDate, `it-0583-${RUN}`],
    );
    const entry = posted.rows[0].r.gl_entry_id as string;
    const debited = (await q("select account_code from gl_entry_lines where entry_id = $1 and debit > 0", [entry])).rows.map((r) => r.account_code);
    expect(debited).toEqual([oldCard]);
    // ... then the card setting moves to a new one, as a chart remap would.
    await pointCardMethodsAt(newCard);
  }, 30000);

  afterAll(async () => {
    if (!db) return;
    await q("rollback").catch(() => undefined);
    await db.end();
  });

  it("the old account is no longer in the card settings, so only the ledger still names it", async () => {
    const mapped = (await q("select 1 from gl_payment_account_map where account_code = $1", [oldCard])).rowCount;
    const routed = (await q("select 1 from card_settlement_routes where holding_code = $1", [oldCard])).rowCount;
    expect([mapped, routed]).toEqual([0, 0]);
  });

  it("Money moves refuses a card payout from the old card account that still holds the posted card money", async () => {
    await actAs(U.finance);
    expect(await create("CARD_PAYOUT", oldCard, bank, 250)).toMatchObject({ ok: false, detail: "card_payout_by_card_settlement" });
    // and from the account the card setting names now
    expect(await create("CARD_PAYOUT", newCard, bank, 250)).toMatchObject({ ok: false, detail: "card_payout_by_card_settlement" });
  });

  it("the list Money moves hides from is the list the door refuses: both card accounts, no bank", async () => {
    await actAs(U.finance);
    const card = await cardAccounts();
    expect(card).toEqual(expect.arrayContaining([oldCard, newCard]));
    expect(card).not.toContain(bank);
    expect(card).not.toContain(otherBank);
  });

  it("a plain bank account is unaffected: a bank transfer out of it is prepared", async () => {
    await actAs(U.finance);
    expect(await create("TRANSFER", bank, otherBank, 100)).toMatchObject({ ok: true });
  });

  it("the card account list is Finance's: operation and a caller with no role are refused", async () => {
    for (const who of [U.operation, null]) {
      await actAs(who);
      expect(await attempt("select public.gl_card_accounts_list()")).toMatchObject({ ok: false, detail: "not_finance" });
    }
    await actAs(U.finance);
  });
});

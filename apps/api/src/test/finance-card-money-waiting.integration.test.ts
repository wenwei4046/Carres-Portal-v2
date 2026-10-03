import { describe, it, expect, beforeAll, afterAll } from "vitest";
import pg from "pg";
import { parseCardFile } from "@carres/shared/card-settlement";
import { ghlFile } from "@carres/shared/__fixtures__/card-settlement-files";

/**
 * 0641 ON A REAL POSTGRESQL RUNNING THE WHOLE MIGRATION CHAIN: Card money
 * waiting (Chew 2026-10-03, docs/finance/MASTER.md §3.4). Card payments go
 * through the real doors — posted as the payment door posts them, a card
 * company file imported and matched, the day's card payout prepared and
 * approved — and the list is read after each step.
 *
 * One transaction, rolled back at the end. Every value is invented.
 *
 *   PG_BIN=<postgres bin> node scripts/dry-run-migrations.mjs --baseline scripts/migration-replay-baseline.json --keep
 *   CARRES_TEST_DATABASE_URL=postgres://postgres@localhost:<port>/<db> pnpm --filter @carres/api test -- finance-card-money-waiting
 *
 * Without the URL every case is SKIPPED — reported as skipped, never as passed.
 */
const URL = process.env.CARRES_TEST_DATABASE_URL ?? "";
const LOCAL = /^postgres(ql)?:\/\/[^@/]*@?(localhost|127\.0\.0\.1|\[::1\])(:\d+)?\//.test(URL);
const RUN = Date.now() % 100000;
const HEX = RUN.toString(16).padStart(5, "0");
const uid = (tail: string) => `dddddddd-0000-4000-8000-${HEX}${tail.padStart(7, "0")}`;
const U = { finance: uid("1"), principal: uid("2"), operation: uid("3") };
const DEALER = uid("d1");
const SALES = uid("d2");
const ORDER = uid("e1");

const plus = (iso: string, days: number) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

type Waiting = {
  holdings: Array<{ account_code: string; balance: number }>;
  payments: Array<{ payment_id: string | null; account_code: string; amount: number; state: string; move_no: string | null; so: number | null; customer_name: string | null }>;
};

describe.skipIf(!URL)("Card money waiting (real PostgreSQL, 0641)", () => {
  let db: pg.Client;
  let D = "";
  let holding = "";
  let bank = "";
  const P: Record<string, string> = {};
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
  async function waiting(): Promise<Waiting> {
    await actAs(U.finance);
    const r = await attempt("select public.fin_card_money_waiting() as w");
    if (!r.ok) throw new Error(`fin_card_money_waiting refused: ${r.detail}`);
    return r.value as Waiting;
  }
  const mine = (w: Waiting, key: string) => w.payments.find((p) => p.payment_id === P[key]);
  const sen = (n: number | string) => Math.round(Number(n) * 100);
  const holdingBalance = (w: Waiting) => sen(w.holdings.find((h) => h.account_code === holding)?.balance ?? 0);
  const listed = (w: Waiting) => w.payments.filter((p) => p.account_code === holding).reduce((t, p) => t + sen(p.amount), 0);

  async function pay(key: string, amount: number, on: string) {
    const r = await q(
      "insert into order_payments (order_id, amount, paid_on, method, reference, recorded_by) values ($1, $2, $3::date, 'card', null, $4) returning id",
      [ORDER, amount, on, U.finance],
    );
    P[key] = r.rows[0].id;
    await q("select public._customer_payment_to_ledger($1)", [P[key]]);
  }

  beforeAll(async () => {
    if (!LOCAL) throw new Error("CARRES_TEST_DATABASE_URL must point at localhost");
    db = new pg.Client({ connectionString: URL });
    await db.connect();
    await q("begin");
    await q("update gl_config set go_live_on = coalesce(go_live_on, date '2026-01-01') where id");
    D = (await q(`select greatest(timezone('Asia/Kuala_Lumpur', now())::date - 10,
                                  (select go_live_on from gl_config where id) + 7)::text as d`)).rows[0].d;
    for (const [id, role] of [[U.finance, "finance"], [U.principal, "principal"], [U.operation, "operation"]] as const) {
      const email = `it-cmw-${role}-${RUN}@carres.test`;
      await q("insert into auth.users (id, email) values ($1, $2)", [id, email]);
      await q("insert into app_users (id, email, name, role, status, is_person) values ($1, $2, $3, $4, 'active', true)", [id, email, `IT ${role}`, role]);
    }
    await q("insert into dealers (id, name) values ($1, 'IT Dealer cmw')", [DEALER]);
    await q("insert into salespersons (id, dealer_id, name) values ($1, $2, 'IT Salesperson cmw')", [SALES, DEALER]);
    await q("insert into orders (id, dealer_id, salesperson_id, customer_name, customer_phone) values ($1, $2, $3, 'IT customer cmw', '0100000000')", [ORDER, DEALER, SALES]);

    await actAs(U.finance);
    await pay("a", 300, D);
    await pay("b", 420, D);
    await pay("c", 510, plus(D, 1));
    // The card account the payments were posted to, read from the ledger.
    holding = (await q(`select l.account_code from gl_entry_lines l join gl_entries e on e.id = l.entry_id
                         where e.source_type = 'CUSTOMER_PAYMENT' and e.source_doc_no = $1 and l.debit > 0`, [P.a])).rows[0].account_code;
    bank = (await q("select account_code from gl_money_accounts where money_kind = 'BANK' and gl_money_account_ok(account_code, 'in') order by account_code limit 1")).rows[0].account_code;
    await q(
      "insert into card_settlement_routes (holding_code, channel, bank_code) values ($1, 'showroom', $2) on conflict (holding_code, channel) do update set bank_code = excluded.bank_code",
      [holding, bank],
    );
  }, 30000);

  afterAll(async () => {
    if (!db) return;
    await q("rollback").catch(() => undefined);
    await db.end();
  });

  it("is internal", async () => {
    await actAs(U.operation);
    expect(await attempt("select public.fin_card_money_waiting()")).toEqual({ ok: false, detail: "not_internal" });
  });

  it("a card payment no card company file shows yet is waiting, with its order and customer", async () => {
    const w = await waiting();
    expect(mine(w, "a")).toMatchObject({ account_code: holding, state: "NOT_ON_A_FILE", move_no: null, customer_name: "IT customer cmw" });
    expect(sen(mine(w, "a")!.amount)).toBe(30000);
    expect(mine(w, "c")?.state).toBe("NOT_ON_A_FILE");
  });

  it("matched, then prepared, then paid out: the payments leave the list only when the payout is approved", async () => {
    const before = await waiting();
    const content = ghlFile([
      { at: `${D} 10:00:00.0`, amount: "300.00", fee: "3.90", net: "296.10", tid: "TESTTERM01", txId: "8001" },
      { at: `${D} 11:00:00.0`, amount: "420.00", fee: "5.46", net: "414.54", tid: "TESTTERM01", txId: "8002" },
    ]);
    const parsed = parseCardFile("GHL", content, "ghl.csv");
    if (!parsed.ok) throw new Error(parsed.message);
    await actAs(U.finance);
    await q("select public.card_settlement_import('GHL', 'ghl.csv', $1, $2::jsonb, $3::jsonb)",
      [content, JSON.stringify(parsed.rows), JSON.stringify(parsed.published)]);
    const lines = (await q(`select id, amount::float as amount, day_date::text as day, group_key from card_settlement_lines
                             where acquirer = 'GHL' and day_date = $1::date order by amount`, [D])).rows;
    for (const [line, key] of [[lines[0], "a"], [lines[1], "b"]] as const) {
      const m = await attempt("select public.card_settlement_match($1, $2)", [line.id, P[key]]);
      expect(m.ok, JSON.stringify(m)).toBe(true);
    }
    const matched = await waiting();
    expect(mine(matched, "a")?.state).toBe("NOT_PREPARED");
    expect(mine(matched, "b")?.state).toBe("NOT_PREPARED");
    expect(listed(matched)).toBe(listed(before));

    const prep = await attempt("select public.card_settlement_payout_prepare('GHL', $1::date, $2, $3::date, $4, $5, null, null)",
      [D, lines[0].group_key, plus(D, 1), holding, bank]);
    expect(prep.ok, JSON.stringify(prep)).toBe(true);
    const prepared = await waiting();
    expect(mine(prepared, "a")?.state).toBe("WAITING_APPROVAL");
    expect(mine(prepared, "a")?.move_no).toMatch(/^MM-/);

    const move = (await q(`select cp.move_id from card_settlement_payouts cp
                            where cp.acquirer = 'GHL' and cp.day_date = $1::date and cp.released_at is null`, [D])).rows[0].move_id as string;
    await actAs(U.principal);
    const approved = await attempt("select public.gl_money_move_approve($1)", [move]);
    expect(approved.ok, JSON.stringify(approved)).toBe(true);
    const paidOut = await waiting();
    expect(mine(paidOut, "a")).toBeUndefined();
    expect(mine(paidOut, "b")).toBeUndefined();
    expect(mine(paidOut, "c")?.state).toBe("NOT_ON_A_FILE");
    // The payout took 720 off the card account and off the list together.
    expect(holdingBalance(before) - holdingBalance(paidOut)).toBe(72000);
    expect(listed(before) - listed(paidOut)).toBe(72000);
  });
});

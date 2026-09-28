import { describe, it, expect, beforeAll, afterAll } from "vitest";
import pg from "pg";
import { parseCardFile, dayMayApprove, type CardSettlementReview } from "@carres/shared/card-settlement";
import { pbbFile } from "@carres/shared/__fixtures__/card-settlement-files";

/**
 * 0595 ON A REAL POSTGRESQL: Approve day refuses a day whose matched payments
 * do not add up to its Sales total, and a day with a matched payment that was
 * voided since. A day whose payout is not prepared stays on the review however
 * old it is. One transaction, rolled back; identities through the
 * request-claims GUC, as card-settlement.integration.test.ts. Every value is
 * invented.
 *
 *   CARRES_TEST_DATABASE_URL=postgres://postgres@localhost:<port>/<db> pnpm --filter @carres/api test -- card-settlement-day-adds-up
 *
 * Without the URL every case is SKIPPED.
 */
const URL = process.env.CARRES_TEST_DATABASE_URL ?? "";
const LOCAL = /^postgres(ql)?:\/\/[^@/]*@?(localhost|127\.0\.0\.1|\[::1\])(:\d+)?\//.test(URL);
const RUN = Date.now() % 100000;
const HEX = RUN.toString(16).padStart(5, "0");
const uid = (tail: string) => `cccccccc-0595-4000-8000-${HEX}${tail.padStart(7, "0")}`;
const U = { finance: uid("1") };
const DEALER = uid("d1");
const SALES = uid("d2");
const ORDER = uid("e1");

const plus = (iso: string, days: number) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};
const ddmmyyyy = (iso: string) => `${iso.slice(8, 10)}${iso.slice(5, 7)}${iso.slice(0, 4)}`;

describe.skipIf(!URL)("card settlement: a day must add up and hold no voided payment (real PostgreSQL, 0595)", () => {
  let db: pg.Client;
  let D = ""; // a recent sale day
  let OLD = ""; // a sale day more than 92 days ago
  let holding = "";
  let bank = "";
  const P: Record<string, string> = {};
  const q = (sql: string, params: unknown[] = []) => db.query(sql, params);
  const actAs = (id: string) => q("select set_config('request.jwt.claims', $1, false)", [JSON.stringify({ sub: id, role: "authenticated" })]);
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
  async function pay(key: string, amount: number, on: string, reference: string) {
    const r = await q(
      "insert into order_payments (order_id, amount, paid_on, method, reference, recorded_by) values ($1, $2, $3::date, 'card', $4, $5) returning id",
      [ORDER, amount, on, reference, U.finance],
    );
    P[key] = r.rows[0].id;
    await q("select public._customer_payment_to_ledger($1)", [P[key]]);
  }
  // one Public Bank machine's file: each sale is [amount, approval code]
  async function importDay(tid: string, sale: string, sales: [string, string][]) {
    const content = pbbFile(sales.map(([amt, code], i) => ({
      sett: ddmmyyyy(plus(sale, 1)), trans: ddmmyyyy(sale), amt, net: (Number(amt) * 0.99).toFixed(2),
      mid: "900000000095", tid, code, trace: `0009${String(i).padStart(2, "0")}`,
    })));
    const parsed = parseCardFile("PBB", content, `pbb-${tid}.csv`);
    if (!parsed.ok) throw new Error(parsed.message);
    await q("select public.card_settlement_import('PBB', $1, $2, $3::jsonb, null)", [`pbb-${tid}.csv`, content, JSON.stringify(parsed.rows)]);
  }
  const review = async () => (await q("select public.card_settlement_review() as r")).rows[0].r as CardSettlementReview;
  const dayOf = (r: CardSettlementReview, tid: string) => r.days.find((d) => d.group_key === `900000000095 / ${tid}`);
  const rowOf = (r: CardSettlementReview, tid: string, amount: number) =>
    r.rows.find((x) => x.group_key === `900000000095 / ${tid}` && Number(x.amount) === amount)!;
  const match = (line: string, payment: string | null) => attempt("select public.card_settlement_match($1, $2) as r", [line, payment]);
  // the money move is dated in the ledger's life (a day before go-live has no ledger to move)
  const prepare = (tid: string, sale: string) =>
    attempt("select public.card_settlement_payout_prepare('PBB', $1::date, $2, $3::date, $4, $5) as r", [
      plus(sale, 1), `900000000095 / ${tid}`, D, holding, bank,
    ]);

  beforeAll(async () => {
    if (!LOCAL) throw new Error("CARRES_TEST_DATABASE_URL must point at localhost");
    db = new pg.Client({ connectionString: URL });
    await db.connect();
    await q("begin");
    await q("update gl_config set go_live_on = coalesce(go_live_on, date '2026-01-01') where id");
    D = (await q(`select greatest(timezone('Asia/Kuala_Lumpur', now())::date - 10,
                                  (select go_live_on from gl_config where id) + 7)::text as d`)).rows[0].d;
    OLD = (await q("select (timezone('Asia/Kuala_Lumpur', now())::date - 100)::text as d")).rows[0].d;
    const email = `it-0595-finance-${RUN}@carres.test`;
    await q("insert into auth.users (id, email) values ($1, $2)", [U.finance, email]);
    await q("insert into app_users (id, email, name, role, status) values ($1, $2, 'IT finance', 'finance', 'active')", [U.finance, email]);
    await q("insert into dealers (id, name) values ($1, 'IT Dealer 0595')", [DEALER]);
    await q("insert into salespersons (id, dealer_id, name) values ($1, $2, 'IT Salesperson 0595')", [SALES, DEALER]);
    await q("insert into orders (id, dealer_id, salesperson_id, customer_name, customer_phone) values ($1, $2, $3, 'IT customer', '0100000000')", [ORDER, DEALER, SALES]);
    await actAs(U.finance);

    await pay("hundred", 100, D, "AD1111");
    await pay("sixty", 60, D, "ZZ6060");
    await pay("fifty", 50, D, "YY5050");
    await pay("seventy", 70, D, "QQ7070");
    await pay("forty", 40, D, "AV4040");
    await pay("oldOpen", 30, OLD, "AO3030");
    await pay("oldPaid", 20, OLD, "AO2020");
    // the card account the card method maps to, and a bank for its route
    holding = (await q("select public.gl_account_for_payment_method('card', null) as c")).rows[0].c;
    bank = (await q("select account_code from gl_money_accounts where money_kind = 'BANK' and gl_money_account_ok(account_code, 'in') order by account_code limit 1")).rows[0].account_code;
    await q(
      "insert into card_settlement_routes (holding_code, channel, bank_code) values ($1, 'showroom', $2) on conflict (holding_code, channel) do update set bank_code = excluded.bank_code",
      [holding, bank],
    );

    await importDay("90000095", D, [["100.00", "AD1111"], ["50.00", "AD2222"]]);
    await importDay("90000096", D, [["80.00", "AS8080"]]);
    await importDay("90000097", D, [["40.00", "AV4040"]]);
    await importDay("90000098", OLD, [["30.00", "AO3030"]]);
    await importDay("90000099", OLD, [["20.00", "AO2020"]]);
  }, 30000);

  afterAll(async () => {
    if (!db) return;
    await q("rollback").catch(() => undefined);
    await db.end();
  });

  it("a hand match to a bigger payment is refused by Approve day, and says by how much", async () => {
    const r = await review();
    expect(await match(rowOf(r, "90000095", 50).id, P.sixty)).toMatchObject({ ok: true });
    const day = dayOf(await review(), "90000095")!;
    expect([day.matched_count, Number(day.gross), Number(day.recorded)]).toEqual([2, 150, 160]);
    expect(dayMayApprove(day)).toBe(false);
    expect(await prepare("90000095", D)).toEqual({
      ok: false, detail: "day_not_adding_up",
      message: "Recorded in Carres is RM 10.00 over the Sales total. Check the matches before you approve the day.",
    });
  });

  it("a hand match to a smaller payment is refused too", async () => {
    const r = await review();
    expect(await match(rowOf(r, "90000096", 80).id, P.seventy)).toMatchObject({ ok: true });
    expect(await prepare("90000096", D)).toEqual({
      ok: false, detail: "day_not_adding_up",
      message: "Recorded in Carres is RM 10.00 short of the Sales total. Check the matches before you approve the day.",
    });
  });

  it("once the matches add up, the day is approved", async () => {
    const r = await review();
    expect(await match(rowOf(r, "90000095", 50).id, P.fifty)).toMatchObject({ ok: true });
    const day = dayOf(await review(), "90000095")!;
    expect(Number(day.recorded)).toBe(150);
    expect(dayMayApprove(day)).toBe(true);
    expect(await prepare("90000095", D)).toMatchObject({ ok: true });
  });

  it("a matched payment voided since shows as voided and blocks Approve day until its match is taken off", async () => {
    expect(dayOf(await review(), "90000097")).toMatchObject({ matched_count: 1, voided_count: 0 });
    await q("update order_payments set voided_at = now(), voided_by = $2, void_reason = 'IT 0595' where id = $1", [P.forty, U.finance]);
    const r = await review();
    const day = dayOf(r, "90000097")!;
    expect(day).toMatchObject({ matched_count: 1, voided_count: 1 });
    expect(r.payments.find((p) => p.id === P.forty)).toMatchObject({ voided: true });
    expect(dayMayApprove(day)).toBe(false);
    expect(await prepare("90000097", D)).toEqual({
      ok: false, detail: "day_payment_voided",
      message: "A matched payment on this day was voided. Take off its match before you approve the day.",
    });
    expect(await match(rowOf(r, "90000097", 40).id, null)).toMatchObject({ ok: true });
    expect(dayOf(await review(), "90000097")).toMatchObject({ matched_count: 0, voided_count: 0 });
  });

  it("a fully matched day older than 92 days stays on the review until its payout is prepared", async () => {
    const r = await review();
    expect(dayOf(r, "90000098")).toMatchObject({ row_count: 1, matched_count: 1, payout_status: null });
    expect(dayOf(r, "90000099")).toMatchObject({ row_count: 1, matched_count: 1, payout_status: null });
    const made = await prepare("90000099", OLD);
    expect(made, JSON.stringify(made)).toMatchObject({ ok: true });
    const after = await review();
    expect(dayOf(after, "90000099")).toBeUndefined();
    expect(dayOf(after, "90000098")).toBeDefined();
  });
});

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import pg from "pg";
import { parseCardFile, dayMayApprove, dayFee, type CardAcquirer, type CardSettlementReview } from "@carres/shared/card-settlement";
import { ghlFile, maybankFile, pbbFile } from "@carres/shared/__fixtures__/card-settlement-files";

/**
 * 0572 ON A REAL POSTGRESQL: card settlement files are kept whole and their
 * rows matched to the recorded card payments. One transaction, rolled back;
 * identities through the request-claims GUC. Every value is invented.
 *
 *   CARRES_TEST_DATABASE_URL=postgres://postgres@localhost:<port>/<db> pnpm --filter @carres/api test -- card-settlement.integration
 *
 * Without the URL every case is SKIPPED.
 */
const URL = process.env.CARRES_TEST_DATABASE_URL ?? "";
const LOCAL = /^postgres(ql)?:\/\/[^@/]*@?(localhost|127\.0\.0\.1|\[::1\])(:\d+)?\//.test(URL);
const RUN = Date.now() % 100000;
const HEX = RUN.toString(16).padStart(5, "0");
const uid = (tail: string) => `cccccccc-0000-4000-8000-${HEX}${tail.padStart(7, "0")}`;
const U = { finance: uid("1"), operation: uid("2") };
const DEALER = uid("d1");
const SALES = uid("d2");
const ORDER = uid("e1");

const plus = (iso: string, days: number) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};
const ddmmyyyy = (iso: string) => `${iso.slice(8, 10)}${iso.slice(5, 7)}${iso.slice(0, 4)}`;
const ddmmyy = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(2, 4)}`;

describe.skipIf(!URL)("card settlement matching (real PostgreSQL, 0572)", () => {
  let db: pg.Client;
  let D = ""; // the sale day
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
  const P: Record<string, string> = {};
  // a recorded payment, posted to the ledger as the payment door does (0463):
  // Approve day reads the card account from that posting (0581)
  async function pay(key: string, amount: number, on: string, reference: string | null, method = "card") {
    const r = await q(
      "insert into order_payments (order_id, amount, paid_on, method, reference, recorded_by) values ($1, $2, $3::date, $4, $5, $6) returning id",
      [ORDER, amount, on, method, reference, U.finance],
    );
    P[key] = r.rows[0].id;
    await q("select public._customer_payment_to_ledger($1)", [P[key]]);
  }
  function importFile(acquirer: CardAcquirer, name: string, content: string) {
    const parsed = parseCardFile(acquirer, content, name);
    if (!parsed.ok) throw new Error(parsed.message);
    return attempt("select public.card_settlement_import($1, $2, $3, $4::jsonb, $5::jsonb) as r", [
      acquirer, name, content, JSON.stringify(parsed.rows), JSON.stringify(parsed.published),
    ]);
  }
  const review = async () => (await q("select public.card_settlement_review() as r")).rows[0].r as CardSettlementReview;
  const rowOf = (r: CardSettlementReview, acquirer: CardAcquirer, amount: number) => {
    const x = r.rows.find((y) => y.acquirer === acquirer && Number(y.amount) === amount);
    if (!x) throw new Error(`no ${acquirer} row of ${amount}`);
    return x;
  };
  const match = (line: string, payment: string | null) =>
    attempt("select public.card_settlement_match($1, $2) as r", [line, payment]);
  const pbbDay = (r: CardSettlementReview) => r.days.find((d) => d.acquirer === "PBB" && d.group_key === "900000000001 / 90000001")!;
  let holding = "";
  let bank = "";
  const prepareDay = (d: { acquirer: string; day_date: string; group_key: string }, key: string | null = null, moveDate: string | null = d.day_date) =>
    attempt("select public.card_settlement_payout_prepare($1, $2::date, $3, $4::date, $5, $6, null, $7::uuid) as r", [
      d.acquirer, d.day_date, d.group_key, moveDate, holding, bank, key,
    ]);
  const ledgerRows = async () => Number((await q("select (select count(*) from gl_entries) + (select count(*) from gl_entry_lines) as n")).rows[0].n);
  let ledgerAtStart = 0;

  // Public Bank: one machine, sale day D, paid out D+1.
  const pbb = () => {
    const s = { sett: ddmmyyyy(plus(D, 1)), trans: ddmmyyyy(D), mid: "900000000001", tid: "90000001" };
    return pbbFile([
      { ...s, amt: "100.00", net: "99.00", code: "A1B2C3", trace: "000101" }, // exact code
      { ...s, amt: "250.00", net: "247.50", code: "K7M8N9", trace: "000102" }, // typed K7M8N0
      { ...s, amt: "75.00", net: "74.25", code: "Q1W2E3", trace: "000103" }, // nothing recorded
      { ...s, amt: "60.00", net: "59.40", code: "H4J5K6", trace: "000104" }, // typed H45JK6
    ]);
  };
  // GHL: no approval code; amount and date.
  const ghl = () => {
    const at = `${D} 10:00:00.0`;
    return ghlFile([
      { at, amount: "300.00", fee: "3.90", net: "296.10", tid: "TESTTERM01", txId: "7001" }, // same day
      { at, amount: "420.00", fee: "5.46", net: "414.54", tid: "TESTTERM01", txId: "7002" }, // recorded 2 days later
      { at, amount: "510.00", fee: "6.63", net: "503.37", tid: "TESTTERM01", txId: "7003" }, // recorded 5 days before
      { at, amount: "640.00", fee: "8.32", net: "631.68", tid: "TESTTERM01", txId: "7004" }, // recorded 9 days later
      { at, amount: "700.00", fee: "9.10", net: "690.90", tid: "TESTTERM01", txId: "7005" }, // 1 day and 6 days
    ]);
  };
  const maybank = (merchant = "900000000009") =>
    maybankFile({
      merchant, reportDate: ddmmyy(plus(D, 1)),
      sales: [
        { amount: "150.00", date: ddmmyy(D), code: "M1N2P3", tid: "90000009", ref: "600000000001" },
        { amount: "50.00", date: ddmmyy(D), code: "Q4R5S6", tid: "90000009", ref: "600000000002" },
      ],
      gross: "200.00", fee: "2.00", net: "198.00",
    });

  beforeAll(async () => {
    if (!LOCAL) throw new Error("CARRES_TEST_DATABASE_URL must point at localhost");
    db = new pg.Client({ connectionString: URL });
    await db.connect();
    await q("begin");
    await q("update gl_config set go_live_on = coalesce(go_live_on, date '2026-01-01') where id");
    D = (await q(`select greatest(timezone('Asia/Kuala_Lumpur', now())::date - 10,
                                  (select go_live_on from gl_config where id) + 7)::text as d`)).rows[0].d;
    for (const [id, role] of [[U.finance, "finance"], [U.operation, "operation"]] as const) {
      const email = `it-cs-${role}-${RUN}@carres.test`;
      await q("insert into auth.users (id, email) values ($1, $2)", [id, email]);
      await q("insert into app_users (id, email, name, role, status) values ($1, $2, $3, $4, 'active')", [id, email, `IT ${role}`, role]);
    }
    await q("insert into dealers (id, name) values ($1, 'IT Dealer')", [DEALER]);
    await q("insert into salespersons (id, dealer_id, name) values ($1, $2, 'IT Salesperson')", [SALES, DEALER]);
    await q("insert into orders (id, dealer_id, salesperson_id, customer_name, customer_phone) values ($1, $2, $3, 'IT customer', '0100000000')", [ORDER, DEALER, SALES]);

    await actAs(U.finance); // the ledger takes a posting from Finance
    await pay("exact", 100, D, "A1B2C3");
    await pay("typo", 250, D, "K7M8N0");
    await pay("sameAmountOtherCode", 75, D, "X0X0X0");
    await pay("swap", 60, D, "H45JK6");
    await pay("ghlSameDay", 300, D, null);
    await pay("ghl2", 420, plus(D, 2), null);
    await pay("ghl5", 510, plus(D, -5), null);
    await pay("ghl9", 640, plus(D, 9), null);
    await pay("ghl1", 700, plus(D, 1), null);
    await pay("ghl6", 700, plus(D, 6), null);
    await pay("mb1", 150, D, "M1N2P3");
    await pay("mb2", 50, D, "Q4R5S6");
    await pay("ghlTwin", 120, D, null);
    await pay("coded", 333, D, "Z9Z9Z9");
    await pay("cash", 99, D, null, "cash");
    await pay("voided", 98, D, null);
    await q("update order_payments set voided_at = now(), voided_by = $2, void_reason = 'IT' where id = $1", [P.voided, U.finance]);
    holding = (await q("select account_code from gl_money_accounts where money_kind = 'HOLDING' and gl_money_account_ok(account_code, 'in') order by account_code limit 1")).rows[0].account_code;
    bank = (await q("select account_code from gl_money_accounts where money_kind = 'BANK' and gl_money_account_ok(account_code, 'in') order by account_code limit 1")).rows[0].account_code;
    // Approve day pays only from a routed card account into its route's bank.
    await q(
      "insert into card_settlement_routes (holding_code, channel, bank_code) values ($1, 'showroom', $2) on conflict (holding_code, channel) do update set bank_code = excluded.bank_code",
      [holding, bank],
    );
    ledgerAtStart = await ledgerRows();
  }, 30000);

  afterAll(async () => {
    if (!db) return;
    await q("rollback").catch(() => undefined);
    await db.end();
  });

  it("only Finance imports", async () => {
    await actAs(U.operation);
    expect(await importFile("PBB", "pbb.csv", pbb())).toMatchObject({ ok: false, detail: "not_finance" });
    await actAs(null);
    expect(await importFile("PBB", "pbb.csv", pbb())).toMatchObject({ ok: false, detail: "not_finance" });
  });

  it("Public Bank: an exact code matches at once; a one-character typo and a swap are only suggested; a row with no candidate stays open", async () => {
    await actAs(U.finance);
    const made = await importFile("PBB", "pbb.csv", pbb());
    console.log("PBB import:", JSON.stringify((made as { value: unknown }).value));
    expect(made).toMatchObject({ ok: true, value: { rows: 4, imported: 4, matched: 1 } });

    const r = await review();
    const exact = rowOf(r, "PBB", 100);
    expect(exact).toMatchObject({ payment_id: P.exact, matched_how: "approval_code", approval_code: "A1B2C3", card_no: "400000XXXXXX0001" });

    const typo = rowOf(r, "PBB", 250);
    console.log("typo row K7M8N9:", JSON.stringify({ payment_id: typo.payment_id, suggestions: typo.suggestions }));
    expect(typo.payment_id).toBeNull();
    expect(typo.suggestions).toEqual([{ payment_id: P.typo, how: "code_near", days_apart: 0 }]);

    const swap = rowOf(r, "PBB", 60);
    expect(swap.payment_id).toBeNull();
    expect(swap.suggestions).toEqual([{ payment_id: P.swap, how: "code_near", days_apart: 0 }]);

    const none = rowOf(r, "PBB", 75);
    console.log("no-candidate row Q1W2E3:", JSON.stringify({ payment_id: none.payment_id, suggestions: none.suggestions }));
    expect(none).toMatchObject({ payment_id: null, suggestions: [] });

    // the whole line and every column are kept
    const kept = (await q("select raw_line, fields from card_settlement_lines where id = $1", [exact.id])).rows[0];
    expect(kept.raw_line).toBe(pbb().split("\r\n")[1]);
    expect(Object.keys(kept.fields)).toHaveLength(21);
  });

  it("GHL: same day matches; 2 days apart is suggested; 5 days is found only when nothing is inside 3; 9 days is not found", async () => {
    await actAs(U.finance);
    // the statement date in the file name is the paid-out date
    const made = await importFile("GHL", `StatementOfAccountDetails${plus(D, 1)}_1.csv`, ghl());
    console.log("GHL import:", JSON.stringify((made as { value: unknown }).value));
    expect(made).toMatchObject({ ok: true, value: { rows: 5, imported: 5, matched: 1 } });

    const r = await review();
    expect(rowOf(r, "GHL", 300)).toMatchObject({ payment_id: P.ghlSameDay, matched_how: "amount_and_date", txn_date: D, day_date: D, payout_date: plus(D, 1) });
    const two = rowOf(r, "GHL", 420).suggestions;
    const five = rowOf(r, "GHL", 510).suggestions;
    const nine = rowOf(r, "GHL", 640).suggestions;
    const oneAndSix = rowOf(r, "GHL", 700).suggestions;
    console.log("GHL 2 days:", JSON.stringify(two), "| 5 days:", JSON.stringify(five), "| 9 days:", JSON.stringify(nine), "| 1 and 6 days:", JSON.stringify(oneAndSix));
    expect(two).toEqual([{ payment_id: P.ghl2, how: "amount_near_date", days_apart: 2 }]);
    expect(five).toEqual([{ payment_id: P.ghl5, how: "amount_near_date", days_apart: 5 }]);
    expect(nine).toEqual([]);
    expect(oneAndSix).toEqual([{ payment_id: P.ghl1, how: "amount_near_date", days_apart: 1 }]);
  });

  it("GHL: two rows of one amount on one day and one payment: neither is matched at once, both are suggested", async () => {
    await actAs(U.finance);
    const at = `${D} 11:00:00.0`;
    const twins = ghlFile([
      { at, amount: "120.00", fee: "1.56", net: "118.44", tid: "TESTTERM02", txId: "7101" },
      { at, amount: "120.00", fee: "1.56", net: "118.44", tid: "TESTTERM02", txId: "7102" },
    ]);
    expect(await importFile("GHL", "ghl-twins.csv", twins)).toMatchObject({ ok: true, value: { imported: 2, matched: 0 } });
    const rows = (await review()).rows.filter((x) => x.group_key === "TESTTERM02");
    expect(rows.map((x) => [x.payment_id, x.suggestions])).toEqual([
      [null, [{ payment_id: P.ghlTwin, how: "amount_and_date", days_apart: 0 }]],
      [null, [{ payment_id: P.ghlTwin, how: "amount_and_date", days_apart: 0 }]],
    ]);
    // a renamed GHL file carries no paid-out date; its day is the sale date
    expect(rows[0]).toMatchObject({ payout_date: null, day_date: D });
  });

  it("a Public Bank row wins its coded payment back from a GHL row that took it automatically", async () => {
    await actAs(U.finance);
    const g = ghlFile([{ at: `${D} 12:00:00.0`, amount: "333.00", fee: "4.33", net: "328.67", tid: "TESTTERM03", txId: "7201" }]);
    expect(await importFile("GHL", "ghl-333.csv", g)).toMatchObject({ ok: true, value: { matched: 1 } });
    const p = pbbFile([{ sett: ddmmyyyy(plus(D, 1)), trans: ddmmyyyy(D), amt: "333.00", net: "329.67", mid: "900000000002", tid: "90000002", code: "Z9Z9Z9", trace: "000301" }]);
    const made = await importFile("PBB", "pbb-333.csv", p);
    console.log("coded row after a GHL auto-match:", JSON.stringify((made as { value: unknown }).value));
    expect(made).toMatchObject({ ok: true, value: { matched: 1, released: 1 } });
    const r = await review();
    expect(rowOf(r, "PBB", 333)).toMatchObject({ payment_id: P.coded, matched_how: "approval_code" });
    expect(rowOf(r, "GHL", 333)).toMatchObject({ payment_id: null, matched_how: null });
  });

  it("a tab-only terminal is blank and refused by the database", async () => {
    await actAs(U.finance);
    const row = { line_no: 2, raw_line: "tab", fields: { tx_code_true: "PAYMENT" }, txn_date: D, payout_date: null, terminal_id: "\t", amount: 55, net_amount: 54.28 };
    expect(await attempt("select public.card_settlement_import('GHL', 'tab.csv', 'tab', $1::jsonb) as r", [JSON.stringify([row])]))
      .toMatchObject({ ok: false, detail: "row_unreadable" });
  });

  it("Maybank: both codes match and the payout is the one per merchant", async () => {
    await actAs(U.finance);
    expect(await importFile("MAYBANK", "t41.csv", maybank())).toMatchObject({ ok: true, value: { rows: 2, imported: 2, matched: 2 } });
    const day = (await review()).days.find((d) => d.acquirer === "MAYBANK")!;
    expect(day).toMatchObject({ group_key: "900000000009", payout_date: plus(D, 1), day_date: plus(D, 1), row_count: 2, matched_count: 2 });
    expect([Number(day.gross), Number(day.net), dayFee(day), Number(day.recorded)]).toEqual([200, 198, 2, 200]);
  });

  it("the same file, or the same Maybank report, is refused a second time", async () => {
    await actAs(U.finance);
    expect(await importFile("PBB", "again.csv", pbb())).toMatchObject({ ok: false, detail: "file_imported", message: "This file was imported before." });
    const other = maybank().replace("TEST COMPANY", "TEST COMPANY 2");
    expect(await importFile("MAYBANK", "t41-b.csv", other)).toMatchObject({ ok: false, detail: "file_imported" });
  });

  it("a refund, void or chargeback row is refused by the database too, and nothing of the file is kept", async () => {
    await actAs(U.finance);
    const content = pbbFile([
      { sett: ddmmyyyy(plus(D, 1)), trans: ddmmyyyy(D), amt: "90.00", net: "89.10", mid: "900000000001", tid: "90000001", code: "R1R1R1", trace: "000201" },
      { sett: ddmmyyyy(plus(D, 1)), trans: ddmmyyyy(D), amt: "40.00", net: "39.60", mid: "900000000001", tid: "90000001", code: "R2R2R2", trace: "000202" },
    ]);
    const parsed = parseCardFile("PBB", content);
    if (!parsed.ok) throw new Error(parsed.message);
    const rows = parsed.rows.map((x, i) => (i === 0 ? { ...x, fields: { ...x.fields, Status: "REFUND" } } : x));
    const files = Number((await q("select count(*) from card_settlement_files")).rows[0].count);
    const refused = await attempt("select public.card_settlement_import('PBB', 'refund.csv', $1, $2::jsonb, null) as r", [content, JSON.stringify(rows)]);
    console.log("reversal:", JSON.stringify(refused));
    expect(refused).toEqual({
      ok: false, detail: "reversal_refused",
      message: "Row 2 is a refund, void or chargeback. Carres cannot import it yet. Give the file to IT.",
    });
    const negative = parsed.rows.map((x, i) => (i === 1 ? { ...x, amount: -40 } : x));
    expect(await attempt("select public.card_settlement_import('PBB', 'refund.csv', $1, $2::jsonb, null) as r", [content, JSON.stringify(negative)]))
      .toMatchObject({ ok: false, detail: "reversal_refused", message: expect.stringMatching(/^Row 3 is a refund/) });
    expect(Number((await q("select count(*) from card_settlement_files")).rows[0].count)).toBe(files);
  });

  it("staff approve a suggestion or adjust by hand; the typed code is never rewritten", async () => {
    let r = await review();
    const typo = rowOf(r, "PBB", 250);
    const swap = rowOf(r, "PBB", 60);
    const none = rowOf(r, "PBB", 75);
    const exact = rowOf(r, "PBB", 100);

    await actAs(U.operation);
    expect(await match(typo.id, P.typo)).toMatchObject({ ok: false, detail: "not_finance" });

    await actAs(U.finance);
    expect(await match(typo.id, P.typo)).toMatchObject({ ok: true, value: { matched_how: "suggestion" } });
    // the same payment saved again keeps how it was matched
    expect(await match(typo.id, P.typo)).toMatchObject({ ok: true, value: { matched_how: "suggestion" } });
    expect(await match(swap.id, P.swap)).toMatchObject({ ok: true, value: { matched_how: "suggestion" } });
    expect(await match(none.id, P.exact)).toMatchObject({ ok: false, detail: "payment_taken" });
    expect(await match(none.id, P.cash)).toMatchObject({ ok: false, detail: "not_card_payment" });
    expect(await match(none.id, P.voided)).toMatchObject({ ok: false, detail: "not_card_payment" });
    expect(await match(none.id, P.sameAmountOtherCode)).toMatchObject({ ok: true, value: { matched_how: "by_hand" } });
    // an automatic match saved again by staff becomes theirs, so no import releases it
    expect(exact.matched_how).toBe("approval_code");
    expect(await match(exact.id, P.exact)).toMatchObject({ ok: true, value: { matched_how: "suggestion" } });
    expect((await q("select matched_by from card_settlement_lines where id = $1", [exact.id])).rows[0].matched_by).toBe(U.finance);
    // taken off and put back
    expect(await match(exact.id, null)).toMatchObject({ ok: true, value: { payment_id: null } });
    expect(await match(exact.id, P.exact)).toMatchObject({ ok: true, value: { matched_how: "suggestion" } });
    expect(await match(uid("404"), P.exact)).toMatchObject({ ok: false, detail: "row_not_found" });

    const typed = (await q("select reference from order_payments where id = $1", [P.typo])).rows[0].reference;
    expect(typed).toBe("K7M8N0");

    r = await review();
    const day = pbbDay(r);
    console.log("PBB day after matching:", JSON.stringify(day));
    expect(day).toMatchObject({ group_key: "900000000001 / 90000001", row_count: 4, matched_count: 4, payout_status: null });
    expect(dayMayApprove(day)).toBe(true);
  });

  it("Approve day prepares the day's one payout and writes no ledger row; a second press is refused; the matches are then fixed", async () => {
    await actAs(U.finance);
    expect(await ledgerRows()).toBe(ledgerAtStart);
    const day = pbbDay(await review());
    expect([Number(day.gross), Number(day.net), dayFee(day)]).toEqual([485, 480.15, 4.85]);
    const key = uid("aa1");
    const made = await prepareDay(day, key);
    console.log("first press:", JSON.stringify(made));
    expect(made.ok).toBe(true);
    // the same press sent again returns the same move; another press is refused
    expect(await prepareDay(day, key)).toEqual(made);
    expect(await prepareDay(day, uid("aa2"))).toMatchObject({ ok: false, detail: "payout_exists", message: "The payout for this day is already prepared." });
    const moves = (await q("select m.amount, m.fee, m.reference from card_settlement_payouts cp join gl_money_moves m on m.id = cp.move_id")).rows;
    expect(moves).toEqual([{ amount: "480.15", fee: "4.85", reference: day.reference }]);
    // the card company's screen name and the day as D Mon YYYY (YH, 24 Sep 2026)
    const [yyyy, mm, dd] = day.day_date.split("-");
    const mon = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][Number(mm) - 1];
    expect(day.reference).toBe(`Card settlement Public Bank 900000000001 / 90000001 ${Number(dd)} ${mon} ${yyyy}`);

    const after = pbbDay(await review());
    console.log("PBB day after the payout is prepared:", JSON.stringify({ reference: after.reference, payout_status: after.payout_status, payout_move_no: after.payout_move_no }));
    expect(after.payout_status).toBe("prepared");
    expect(dayMayApprove(after)).toBe(false);
    const line = rowOf(await review(), "PBB", 100);
    expect(await match(line.id, null)).toMatchObject({ ok: false, detail: "day_paid" });

    const ledger = await ledgerRows();
    console.log("ledger rows at start:", ledgerAtStart, "after imports, matches and the prepared payout:", ledger);
    expect(ledger).toBe(ledgerAtStart);
  });

  it("a cancelled payout frees the day: the match can change and the day can be prepared again", async () => {
    await actAs(U.finance);
    const moveId = (await q("select move_id from card_settlement_payouts where released_at is null and group_key = '900000000001 / 90000001'")).rows[0].move_id;
    expect(await attempt("select public.gl_money_move_reverse($1, 'IT wrong bank') as r", [moveId])).toMatchObject({ ok: true });
    const day = pbbDay(await review());
    expect(day.payout_status).toBeNull();
    expect(dayMayApprove(day)).toBe(true);
    const line = rowOf(await review(), "PBB", 100);
    expect(await match(line.id, P.exact)).toMatchObject({ ok: true });
    expect(await prepareDay(day, uid("aa3"))).toMatchObject({ ok: true });
    expect((await q("select count(*)::int as n from card_settlement_payouts where group_key = '900000000001 / 90000001' and released_at is null")).rows[0].n).toBe(1);
  });

  it("a GHL day with no paid-out date takes the date the bank received it", async () => {
    await actAs(U.finance);
    await pay("ghlTwin2", 120, D, null);
    const twins = (await review()).rows.filter((x) => x.group_key === "TESTTERM02");
    expect(await match(twins[0].id, P.ghlTwin)).toMatchObject({ ok: true });
    expect(await match(twins[1].id, P.ghlTwin2)).toMatchObject({ ok: true });
    const day = (await review()).days.find((d) => d.group_key === "TESTTERM02")!;
    expect(day).toMatchObject({ acquirer: "GHL", day_date: D, payout_date: null });
    const noDate = await prepareDay(day, null, null);
    console.log("GHL day prepared with no date:", JSON.stringify(noDate));
    expect(noDate).toMatchObject({ ok: false, detail: "date_missing" });
    expect(await prepareDay(day, null, plus(D, 1))).toMatchObject({ ok: true });
  });

  it("a card payout from a routed card account has one door: Approve day. Money moves is refused; an unrouted account is not", async () => {
    await actAs(U.finance);
    expect(await attempt("select public.card_settlement_route_set($1, 'showroom', $2) as r", [holding, bank])).toMatchObject({ ok: true });
    const mb = (await review()).days.find((d) => d.acquirer === "MAYBANK")!;
    const direct = await attempt("select public.gl_money_move_create('CARD_PAYOUT', $1::date, $2, $3, 198, 2, $4) as r", [mb.day_date, holding, bank, mb.reference]);
    console.log("Money moves card payout from a routed card account:", JSON.stringify(direct));
    expect(direct).toMatchObject({ ok: false, detail: "card_payout_by_card_settlement" });
    const other = (await q(
      "select account_code from gl_money_accounts where money_kind = 'HOLDING' and gl_money_account_ok(account_code, 'in') and account_code not in (select holding_code from card_settlement_routes) order by 1 limit 1",
    )).rows[0]?.account_code as string | undefined;
    console.log("an unrouted card account:", other ?? "none on this database");
    if (other) {
      expect(await attempt("select public.gl_money_move_create('CARD_PAYOUT', $1::date, $2, $3, 10, 0, 'IT unrouted') as r", [mb.day_date, other, bank]))
        .toMatchObject({ ok: true });
    }
    // Approve day refuses an unrouted card account, and a bank that is not the route's
    const otherBank = (await q(
      "select account_code from gl_money_accounts where money_kind = 'BANK' and gl_money_account_ok(account_code, 'in') and account_code <> $1 order by 1 limit 1",
      [bank],
    )).rows[0].account_code as string;
    const prep = (from: string, to: string) =>
      attempt("select public.card_settlement_payout_prepare($1, $2::date, $3, $2::date, $4, $5) as r", [mb.acquirer, mb.day_date, mb.group_key, from, to]);
    if (other) expect(await prep(other, bank)).toMatchObject({ ok: false, detail: "from_not_routed" });
    expect(await prep(holding, otherBank)).toMatchObject({ ok: false, detail: "to_not_routed" });
    // Approve day passes; a tab-only note is stored as no note
    const made = await attempt(
      "select public.card_settlement_payout_prepare($1, $2::date, $3, $2::date, $4, $5, $6, $7::uuid) as r",
      [mb.acquirer, mb.day_date, mb.group_key, holding, bank, "\t", uid("bb1")],
    );
    expect(made).toMatchObject({ ok: true });
    const move = (await q(
      "select m.kind, m.amount, m.fee, m.note from card_settlement_payouts cp join gl_money_moves m on m.id = cp.move_id where cp.group_key = $1 and cp.released_at is null",
      [mb.group_key],
    )).rows;
    expect(move).toEqual([{ kind: "CARD_PAYOUT", amount: "198.00", fee: "2.00", note: null }]);
    // a second payout for that day through Money moves is still refused
    expect(await attempt("select public.gl_money_move_create('CARD_PAYOUT', $1::date, $2, $3, 198, 2, $4) as r", [mb.day_date, holding, bank, mb.reference]))
      .toMatchObject({ ok: false, detail: "card_payout_by_card_settlement" });
  });

  it("an idempotency key returns only the day's own live payout; any other key is refused and links nothing", async () => {
    await actAs(U.finance);
    const mb = (await review()).days.find((d) => d.acquirer === "MAYBANK")!;
    expect(await prepareDay(mb, uid("bb1"))).toMatchObject({ ok: true }); // the same press again
    // a key that belongs to a bank transfer
    const bank2 = (await q(
      "select account_code from gl_money_accounts where money_kind = 'BANK' and gl_money_account_ok(account_code, 'in') and account_code <> $1 order by 1 limit 1",
      [bank],
    )).rows[0].account_code;
    expect(await attempt("select public.gl_money_move_create('TRANSFER', $1::date, $2, $3, 12345, 0, 'IT transfer', null, $4::uuid) as r", [D, bank, bank2, uid("bb2")]))
      .toMatchObject({ ok: true });
    await pay("keyDay", 44, D, "KEY444");
    const f = pbbFile([{ sett: ddmmyyyy(plus(D, 1)), trans: ddmmyyyy(D), amt: "44.00", net: "43.56", mid: "900000000004", tid: "90000004", code: "KEY444", trace: "000401" }]);
    expect(await importFile("PBB", "pbb-key.csv", f)).toMatchObject({ ok: true });
    const kd = (await review()).days.find((d) => d.group_key === "900000000004 / 90000004")!;
    expect(kd.matched_count).toBe(1);
    const hijack = await prepareDay(kd, uid("bb2"));
    console.log("a bank transfer's key sent with Approve day:", JSON.stringify(hijack));
    expect(hijack).toMatchObject({ ok: false, detail: "idempotency_key_used" });
    // another day's key
    expect(await prepareDay(kd, uid("bb1"))).toMatchObject({ ok: false, detail: "idempotency_key_used" });
    expect((await q("select count(*)::int as n from card_settlement_payouts where group_key = $1", [kd.group_key])).rows[0].n).toBe(0);
    // a cancelled payout's key does not bring it back
    expect(await prepareDay(kd, uid("bb3"))).toMatchObject({ ok: true });
    const moveId = (await q("select move_id from card_settlement_payouts where group_key = $1", [kd.group_key])).rows[0].move_id;
    expect(await attempt("select public.gl_money_move_reverse($1, 'IT cancel') as r", [moveId])).toMatchObject({ ok: true });
    expect(await prepareDay(kd, uid("bb3"))).toMatchObject({ ok: false, detail: "idempotency_key_used" });
    expect(await prepareDay(kd, uid("bb4"))).toMatchObject({ ok: true });
  });

  it("a card payout made outside Card settlement from a routed card account is listed on the day of its date", async () => {
    await actAs(U.finance);
    // as a payout made on Money moves before Approve day was its only door
    await q("select set_config('carres.card_payout_day', 'IT before the door', true)");
    const old = await attempt("select public.gl_money_move_create('CARD_PAYOUT', $1::date, $2, $3, 50, 1, 'IT before the door') as r", [D, holding, bank]);
    await q("select set_config('carres.card_payout_day', '', true)");
    expect(old.ok).toBe(true);
    const day = (await review()).days.find((d) => d.group_key === "TESTTERM01")!;
    console.log("unlinked payouts on the GHL day:", JSON.stringify(day.unlinked_payouts));
    expect(day.unlinked_payouts).toMatchObject([{ move_id: old.ok ? old.value : "", from_account_code: holding, move_date: D, status: "prepared" }]);
  });
});

/**
 * The final matches do not depend on the order the files are imported. Four
 * files (Public Bank, two GHL machines, Maybank) over one set of payments,
 * imported in two orders in one transaction (a savepoint between).
 */
describe.skipIf(!URL)("card settlement: the import order does not change the matches (real PostgreSQL, 0572)", () => {
  let db: pg.Client;
  const q = (sql: string, params: unknown[] = []) => db.query(sql, params);
  const T = { fin: uid("f1"), dealer: uid("f2"), sales: uid("f3"), order: uid("f4") };
  let D = "";
  const files = (): Record<string, [CardAcquirer, string, string]> => ({
    pbb: ["PBB", "pbb-order.csv", pbbFile([
      { sett: ddmmyyyy(plus(D, 1)), trans: ddmmyyyy(D), amt: "150.00", net: "148.50", mid: "900000000071", tid: "90000071", code: "AAA111", trace: "000701" },
      { sett: ddmmyyyy(plus(D, 1)), trans: ddmmyyyy(D), amt: "333.00", net: "329.67", mid: "900000000071", tid: "90000071", code: "Z9Z9Z9", trace: "000702" },
      // a one-character typo of B2C3D5, the same amount and day as a GHL row
      { sett: ddmmyyyy(plus(D, 1)), trans: ddmmyyyy(D), amt: "275.00", net: "272.25", mid: "900000000071", tid: "90000071", code: "B2C3D4", trace: "000703" },
    ])],
    ghlA: ["GHL", `StatementOfAccountDetails${plus(D, 1)}_71.csv`, ghlFile([
      { at: `${D} 10:00:00.0`, amount: "333.00", fee: "3.33", net: "329.67", tid: "ORDERT01", txId: "7701" },
      { at: `${D} 10:01:00.0`, amount: "120.00", fee: "1.20", net: "118.80", tid: "ORDERT01", txId: "7702" },
      { at: `${D} 10:02:00.0`, amount: "88.00", fee: "0.88", net: "87.12", tid: "ORDERT01", txId: "7703" },
      { at: `${D} 10:03:00.0`, amount: "275.00", fee: "2.75", net: "272.25", tid: "ORDERT01", txId: "7704" },
    ])],
    ghlB: ["GHL", `StatementOfAccountDetails${plus(D, 1)}_72.csv`, ghlFile([
      { at: `${D} 11:00:00.0`, amount: "120.00", fee: "1.20", net: "118.80", tid: "ORDERT02", txId: "7711" },
    ])],
    mbb: ["MAYBANK", "t41-order.csv", maybankFile({
      merchant: "900000000079", reportDate: ddmmyy(plus(D, 2)),
      sales: [
        { amount: "60.00", date: ddmmyy(D), code: "MMM111", tid: "90000079", ref: "600000000071" },
        { amount: "88.00", date: ddmmyy(D), code: "MB8888", tid: "90000079", ref: "600000000072" },
      ],
      gross: "148.00", fee: "1.48", net: "146.52",
    })],
  });
  async function importAll(order: string[]) {
    for (const k of order) {
      const [acquirer, name, content] = files()[k]!;
      const parsed = parseCardFile(acquirer, content, name);
      if (!parsed.ok) throw new Error(parsed.message);
      await q("select public.card_settlement_import($1, $2, $3, $4::jsonb, $5::jsonb)", [acquirer, name, content, JSON.stringify(parsed.rows), JSON.stringify(parsed.published)]);
    }
    const r = await q(`
      select l.acquirer || ' ' || l.group_key || ' ' || l.amount || ' -> ' || coalesce(p.reference, 'open') || ' ' || coalesce(l.matched_how, '')
             || ' | ' || coalesce((select string_agg(pp.reference || '/' || c.how, ',' order by pp.reference)
                                     from public._card_settlement_candidates(l.id) c join order_payments pp on pp.id = c.payment_id), '') as s
        from card_settlement_lines l left join order_payments p on p.id = l.payment_id
       where l.group_key in ('900000000071 / 90000071', 'ORDERT01', 'ORDERT02', '900000000079')
       order by 1`);
    return r.rows.map((x) => x.s as string);
  }

  beforeAll(async () => {
    if (!LOCAL) throw new Error("CARRES_TEST_DATABASE_URL must point at localhost");
    db = new pg.Client({ connectionString: URL });
    await db.connect();
    await q("begin");
    await q("update gl_config set go_live_on = coalesce(go_live_on, date '2026-01-01') where id");
    D = (await q(`select greatest(timezone('Asia/Kuala_Lumpur', now())::date - 10, (select go_live_on from gl_config where id) + 7)::text as d`)).rows[0].d;
    await q("insert into auth.users (id, email) values ($1, $2)", [T.fin, `it-cs-order-${RUN}@carres.test`]);
    await q("insert into app_users (id, email, name, role, status) values ($1, $2, 'IT order', 'finance', 'active')", [T.fin, `it-cs-order-${RUN}@carres.test`]);
    await q("insert into dealers (id, name) values ($1, 'IT Dealer order')", [T.dealer]);
    await q("insert into salespersons (id, dealer_id, name) values ($1, $2, 'IT Salesperson order')", [T.sales, T.dealer]);
    await q("insert into orders (id, dealer_id, salesperson_id, customer_name, customer_phone) values ($1, $2, $3, 'IT customer order', '0100000000')", [T.order, T.dealer, T.sales]);
    for (const [ref, amount] of [["AAA111", 150], ["Z9Z9Z9", 333], ["B2C3D5", 275], ["GH0120", 120], ["GH0088", 88], ["MB8888", 88], ["MMM111", 60]] as const) {
      await q("insert into order_payments (order_id, amount, paid_on, method, reference, recorded_by) values ($1, $2, $3::date, 'credit_card', $4, $5)", [T.order, amount, D, ref, T.fin]);
    }
    await q("select set_config('request.jwt.claims', $1, false)", [JSON.stringify({ sub: T.fin, role: "authenticated" })]);
  }, 30000);

  afterAll(async () => {
    if (!db) return;
    await q("rollback").catch(() => undefined);
    await db.end();
  });

  it("four files in two orders end in the same matches and the same suggestions", async () => {
    await q("savepoint first");
    const a = await importAll(["pbb", "ghlA", "ghlB", "mbb"]);
    await q("rollback to savepoint first");
    const b = await importAll(["mbb", "ghlB", "ghlA", "pbb"]);
    console.log(`pbb > ghlA > ghlB > mbb:\n  ${a.join("\n  ")}\nmbb > ghlB > ghlA > pbb:\n  ${b.join("\n  ")}`);
    expect(b).toEqual(a);
    expect(a).toEqual([
      "GHL ORDERT01 120.00 -> open  | GH0120/amount_and_date",
      "GHL ORDERT01 275.00 -> open  | B2C3D5/amount_and_date",
      "GHL ORDERT01 333.00 -> open  | ",
      "GHL ORDERT01 88.00 -> GH0088 amount_and_date | GH0088/amount_and_date",
      "GHL ORDERT02 120.00 -> open  | GH0120/amount_and_date",
      "MAYBANK 900000000079 60.00 -> MMM111 approval_code | MMM111/approval_code",
      "MAYBANK 900000000079 88.00 -> MB8888 approval_code | MB8888/approval_code",
      "PBB 900000000071 / 90000071 150.00 -> AAA111 approval_code | AAA111/approval_code",
      "PBB 900000000071 / 90000071 275.00 -> open  | B2C3D5/code_near",
      "PBB 900000000071 / 90000071 333.00 -> Z9Z9Z9 approval_code | Z9Z9Z9/approval_code",
    ]);
  });
});

/**
 * 0576, 0581: Approve day pays a day out from the card account its sales were
 * paid into, and refuses a day paid into no card account or into two. The
 * first three cases hold on 0576 and 0581 alike. The fourth is 0581's: a card
 * method pointed at another account after the sale does not move an old day.
 * The last holds on 0576 and 0581 alike: a day before go-live, which the
 * ledger never saw, still pays out from its payment method's account.
 */
describe.skipIf(!URL)("Approve day pays from the card account the day's sales were posted to (real PostgreSQL, 0576, 0581)", () => {
  let db: pg.Client;
  const q = (sql: string, params: unknown[] = []) => db.query(sql, params);
  const T = { fin: uid("ad1"), boss: uid("ad2"), dealer: uid("ad3"), sales: uid("ad4"), order: uid("ad5") };
  let D = "";
  let A = ""; // the first card account
  let B = ""; // a second card account
  let bank = "";
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
  // a card sale, posted to the ledger when its method has an account
  async function sale(amount: number, code: string, method: string, post = true, on = D) {
    const id = (await q(
      "insert into order_payments (order_id, amount, paid_on, method, reference, recorded_by) values ($1, $2, $3::date, $4, $5, $6) returning id",
      [T.order, amount, on, method, code, T.fin],
    )).rows[0].id as string;
    if (post) await q("select public._customer_payment_to_ledger($1)", [id]);
  }
  // one Public Bank machine's day, every sale matched by its approval code
  async function cardDay(machine: string, rows: Array<{ amt: string; net: string; code: string }>, on = D) {
    const content = pbbFile(rows.map((r, i) => ({
      ...r, sett: ddmmyyyy(plus(on, 1)), trans: ddmmyyyy(on), mid: `9000000000${machine}`, tid: `900000${machine}`, trace: `000${machine}${i}`,
    })));
    const parsed = parseCardFile("PBB", content, `pbb-${machine}.csv`);
    if (!parsed.ok) throw new Error(parsed.message);
    await q("select public.card_settlement_import('PBB', $1, $2, $3::jsonb, null)", [`pbb-${machine}.csv`, content, JSON.stringify(parsed.rows)]);
    const review = (await q("select public.card_settlement_review() as r")).rows[0].r as CardSettlementReview;
    const day = review.days.find((d) => d.group_key === `9000000000${machine} / 900000${machine}`)!;
    expect([day.matched_count, day.row_count]).toEqual([rows.length, rows.length]);
    return day;
  }
  const approve = (d: { acquirer: string; day_date: string; group_key: string }, from: string) =>
    attempt("select public.card_settlement_payout_prepare($1, $2::date, $3, $2::date, $4, $5) as r", [d.acquirer, d.day_date, d.group_key, from, bank]);
  const mapCard = async (method: string, account: string) => {
    await actAs(T.boss); // only the principal points a payment method at an account
    await q("select public.gl_map_payment_account($1, $2)", [method, account]);
    await actAs(T.fin);
  };

  beforeAll(async () => {
    if (!LOCAL) throw new Error("CARRES_TEST_DATABASE_URL must point at localhost");
    db = new pg.Client({ connectionString: URL });
    await db.connect();
    await q("begin");
    await q("update gl_config set go_live_on = coalesce(go_live_on, date '2026-01-01') where id");
    D = (await q(`select greatest(timezone('Asia/Kuala_Lumpur', now())::date - 10, (select go_live_on from gl_config where id) + 7)::text as d`)).rows[0].d;
    for (const [id, role] of [[T.fin, "finance"], [T.boss, "principal"]] as const) {
      const email = `it-cs-day-${role}-${RUN}@carres.test`;
      await q("insert into auth.users (id, email) values ($1, $2)", [id, email]);
      await q("insert into app_users (id, email, name, role, status) values ($1, $2, $3, $4, 'active')", [id, email, `IT day ${role}`, role]);
    }
    await q("insert into dealers (id, name) values ($1, 'IT Dealer day')", [T.dealer]);
    await q("insert into salespersons (id, dealer_id, name) values ($1, $2, 'IT Salesperson day')", [T.sales, T.dealer]);
    await q("insert into orders (id, dealer_id, salesperson_id, customer_name, customer_phone) values ($1, $2, $3, 'IT customer day', '0100000001')", [T.order, T.dealer, T.sales]);
    const cards = (await q("select account_code from gl_money_accounts where money_kind = 'HOLDING' and gl_money_account_ok(account_code, 'in') order by 1 limit 2")).rows;
    if (cards.length < 2) throw new Error("this test needs two card accounts in use");
    [A, B] = [cards[0].account_code, cards[1].account_code];
    bank = (await q("select account_code from gl_money_accounts where money_kind = 'BANK' and gl_money_account_ok(account_code, 'in') order by 1 limit 1")).rows[0].account_code;
    // both card accounts pay out to the bank, so only the day's own account decides
    for (const holding of [A, B]) {
      await q(
        "insert into card_settlement_routes (holding_code, channel, bank_code) values ($1, 'showroom', $2) on conflict (holding_code, channel) do update set bank_code = excluded.bank_code",
        [holding, bank],
      );
    }
    await mapCard("card", A);
    await mapCard("credit_card", B);
    await q("delete from gl_payment_account_map where method = 'debit_card'"); // a card method with no account
  }, 30000);

  afterAll(async () => {
    if (!db) return;
    await q("rollback").catch(() => undefined);
    await db.end();
  });

  it("a day whose sales were paid into no card account is refused (day_no_holding)", async () => {
    await sale(210, "K1L2M3", "debit_card", false);
    const day = await cardDay("61", [{ amt: "210.00", net: "207.90", code: "K1L2M3" }]);
    expect(day.holding_codes).toEqual([]);
    expect(await approve(day, A)).toEqual({
      ok: false, detail: "day_no_holding",
      message: "The sales on this day were not paid into a card account, so they cannot be paid out here. Check the payment method of each sale.",
    });
  });

  it("a day whose sales were paid into two card accounts is refused (day_many_holdings)", async () => {
    await sale(220, "P4Q5R6", "card");
    await sale(230, "S7T8U9", "credit_card");
    const day = await cardDay("62", [{ amt: "220.00", net: "217.80", code: "P4Q5R6" }, { amt: "230.00", net: "227.70", code: "S7T8U9" }]);
    expect([...day.holding_codes].sort()).toEqual([A, B]);
    for (const from of [A, B]) {
      expect(await approve(day, from)).toEqual({
        ok: false, detail: "day_many_holdings",
        message: "The sales on this day were paid into more than one card account, so one payout cannot cover them. Check the payment method of each sale.",
      });
    }
  });

  it("a day is paid out only from the card account its sales went into (from_not_day_holding)", async () => {
    await sale(240, "V1W2X3", "card");
    const day = await cardDay("63", [{ amt: "240.00", net: "237.60", code: "V1W2X3" }]);
    expect(day.holding_codes).toEqual([A]);
    expect(await approve(day, B)).toEqual({
      ok: false, detail: "from_not_day_holding",
      message: `Pay this day out from ${A}, the card account its sales were paid into.`,
    });
    expect(await approve(day, A)).toMatchObject({ ok: true });
  });

  it("0581: pointing the card method at another account later does not move an old day", async () => {
    await sale(260, "Y4Z5A6", "card");
    const day = await cardDay("64", [{ amt: "260.00", net: "257.40", code: "Y4Z5A6" }]);
    await mapCard("card", B);
    const after = ((await q("select public.card_settlement_review() as r")).rows[0].r as CardSettlementReview).days
      .find((d) => d.group_key === day.group_key)!;
    console.log("the day's card accounts after card was pointed at", B, ":", JSON.stringify(after.holding_codes));
    expect(after.holding_codes).toEqual([A]);
    expect(await approve(day, B)).toMatchObject({ ok: false, detail: "from_not_day_holding" });
    expect(await approve(day, A)).toMatchObject({ ok: true });
  });

  it("0581: a card day before the ledger's go-live date, never posted, still pays out from its method's account", async () => {
    // go-live moves to 3 days ago, inside this rolled-back transaction, so a
    // day before it is still on the review
    const goLive = (await q("update gl_config set go_live_on = timezone('Asia/Kuala_Lumpur', now())::date - 3 where id returning go_live_on::text as d")).rows[0].d as string;
    const before = plus(goLive, -2);
    await mapCard("card", A);
    await sale(270, "B7C8D9", "card", true, before); // posts nothing: ruling L
    const day = await cardDay("65", [{ amt: "270.00", net: "267.30", code: "B7C8D9" }], before);
    expect(day.holding_codes).toEqual([A]);
    const payOut = (from: string) =>
      attempt("select public.card_settlement_payout_prepare($1, $2::date, $3, $4::date, $5, $6) as r", [day.acquirer, day.day_date, day.group_key, goLive, from, bank]);
    expect(await payOut(B)).toMatchObject({ ok: false, detail: "from_not_day_holding" });
    expect(await payOut(A)).toMatchObject({ ok: true });
  });
});

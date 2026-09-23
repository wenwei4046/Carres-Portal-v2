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
  async function pay(key: string, amount: number, on: string, reference: string | null, method = "card") {
    const r = await q(
      "insert into order_payments (order_id, amount, paid_on, method, reference, recorded_by) values ($1, $2, $3::date, $4, $5, $6) returning id",
      [ORDER, amount, on, method, reference, U.finance],
    );
    P[key] = r.rows[0].id;
  }
  function importFile(acquirer: CardAcquirer, name: string, content: string) {
    const parsed = parseCardFile(acquirer, content);
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
    await pay("cash", 99, D, null, "cash");
    await pay("voided", 98, D, null);
    await q("update order_payments set voided_at = now(), voided_by = $2, void_reason = 'IT' where id = $1", [P.voided, U.finance]);
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
    const made = await importFile("GHL", "ghl.csv", ghl());
    console.log("GHL import:", JSON.stringify((made as { value: unknown }).value));
    expect(made).toMatchObject({ ok: true, value: { rows: 5, imported: 5, matched: 1 } });

    const r = await review();
    expect(rowOf(r, "GHL", 300)).toMatchObject({ payment_id: P.ghlSameDay, matched_how: "amount_and_date" });
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

  it("Maybank: both codes match and the payout is the one per merchant", async () => {
    await actAs(U.finance);
    expect(await importFile("MAYBANK", "t41.csv", maybank())).toMatchObject({ ok: true, value: { rows: 2, imported: 2, matched: 2 } });
    const day = (await review()).days.find((d) => d.acquirer === "MAYBANK")!;
    expect(day).toMatchObject({ group_key: "900000000009", payout_date: plus(D, 1), row_count: 2, matched_count: 2 });
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
      message: "Row 2 is a refund, void or chargeback. Carres does not import these until their sign is confirmed on a real one.",
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
    expect(await match(swap.id, P.swap)).toMatchObject({ ok: true, value: { matched_how: "suggestion" } });
    expect(await match(none.id, P.exact)).toMatchObject({ ok: false, detail: "payment_taken" });
    expect(await match(none.id, P.cash)).toMatchObject({ ok: false, detail: "not_card_payment" });
    expect(await match(none.id, P.voided)).toMatchObject({ ok: false, detail: "not_card_payment" });
    expect(await match(none.id, P.sameAmountOtherCode)).toMatchObject({ ok: true, value: { matched_how: "by_hand" } });
    // taken off and put back
    expect(await match(exact.id, null)).toMatchObject({ ok: true, value: { payment_id: null } });
    expect(await match(exact.id, P.exact)).toMatchObject({ ok: true, value: { matched_how: "suggestion" } });
    expect(await match(uid("404"), P.exact)).toMatchObject({ ok: false, detail: "row_not_found" });

    const typed = (await q("select reference from order_payments where id = $1", [P.typo])).rows[0].reference;
    expect(typed).toBe("K7M8N0");

    r = await review();
    const day = r.days.find((d) => d.acquirer === "PBB")!;
    console.log("PBB day after matching:", JSON.stringify(day));
    expect(day).toMatchObject({ group_key: "900000000001 / 90000001", row_count: 4, matched_count: 4, payout_status: null });
    expect(dayMayApprove(day)).toBe(true);
  });

  it("approving a day fills the card payout form and writes no ledger row; the prepared payout shows on the day", async () => {
    await actAs(U.finance);
    expect(await ledgerRows()).toBe(ledgerAtStart);
    const day = (await review()).days.find((d) => d.acquirer === "PBB")!;
    expect([Number(day.gross), Number(day.net), dayFee(day)]).toEqual([485, 480.15, 4.85]);
    // what the filled form submits when staff press Prepare (0529, unchanged)
    const holding = (await q("select account_code from gl_money_accounts where money_kind = 'HOLDING' and gl_money_account_ok(account_code, 'in') order by account_code limit 1")).rows[0].account_code;
    const bank = (await q("select account_code from gl_money_accounts where money_kind = 'BANK' and gl_money_account_ok(account_code, 'in') order by account_code limit 1")).rows[0].account_code;
    const made = await attempt("select public.gl_money_move_create('CARD_PAYOUT', $1::date, $2, $3, $4, $5, $6) as id", [
      day.payout_date, holding, bank, Number(day.net), dayFee(day), day.reference,
    ]);
    expect(made.ok).toBe(true);
    const after = (await review()).days.find((d) => d.acquirer === "PBB")!;
    console.log("PBB day after the payout is prepared:", JSON.stringify({ reference: after.reference, payout_status: after.payout_status, payout_move_no: after.payout_move_no }));
    expect(after.payout_status).toBe("prepared");
    expect(dayMayApprove(after)).toBe(false);
    const ledger = await ledgerRows();
    console.log("ledger rows at start:", ledgerAtStart, "after imports, matches and the prepared payout:", ledger);
    expect(ledger).toBe(ledgerAtStart);
  });
});

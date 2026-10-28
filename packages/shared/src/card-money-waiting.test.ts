import { describe, expect, it } from "vitest";
import { cardMoneyWaiting, cardWaitingAge, type CardWaitingAnswer, type CardWaitingPaymentWire } from "./card-money-waiting";

const pay = (over: Partial<CardWaitingPaymentWire>): CardWaitingPaymentWire => ({
  entry_no: "JE-202610-0001", entry_date: "2026-10-01", source_type: "CUSTOMER_PAYMENT", doc_no: "OR-1",
  account_code: "1131", amount: "100.00", payment_id: "p-1", receipt_no: "OR-1", order_id: "o-1", so: 1401,
  customer_name: "Tan Mei Ling", acquirer: null, day_date: null, move_no: null, state: "NOT_ON_A_FILE", ...over,
});

const ANSWER: CardWaitingAnswer = {
  today: "2026-10-03",
  go_live_on: "2026-09-01",
  holdings: [{ account_code: "1131", name: "GHL", balance: "550.00" }, { account_code: "1132", name: "AhaPay", balance: "0.00" }],
  payments: [
    pay({ amount: "300.00", entry_date: "2026-10-03" }),
    pay({ entry_no: "JE-202609-0040", entry_date: "2026-09-20", amount: "200.00", state: "NOT_PREPARED", acquirer: "GHL", day_date: "2026-09-20" }),
  ],
};

describe("Card money waiting (0641, Chew 2026-10-03)", () => {
  it("counts the days each payment has waited, and its age", () => {
    const r = cardMoneyWaiting(ANSWER);
    expect(r.rows.map((x) => [x.days, x.age, x.holdingName])).toEqual([[0, "0 to 7 days", "GHL"], [13, "8 to 14 days", "GHL"]]);
  });

  it("adds the list up and says how much of each holding account it explains", () => {
    const r = cardMoneyWaiting(ANSWER);
    expect(r.total).toBe(500);
    expect(r.booksTotal).toBe(550);
    expect(r.difference).toBe(50);
    expect(r.holdings[0]).toMatchObject({ code: "1131", balance: 550, explained: 500, difference: 50 });
    expect(r.holdings[1]).toMatchObject({ code: "1132", balance: 0, explained: 0, difference: 0 });
  });

  it("ages in four steps", () => {
    expect([0, 7, 8, 14, 15, 30, 31].map(cardWaitingAge)).toEqual([
      "0 to 7 days", "0 to 7 days", "8 to 14 days", "8 to 14 days", "15 to 30 days", "15 to 30 days", "Over 30 days",
    ]);
  });

  it("refuses a figure it cannot read", () => {
    expect(() => cardMoneyWaiting({ ...ANSWER, payments: [pay({ amount: "" })] })).toThrow();
  });
});

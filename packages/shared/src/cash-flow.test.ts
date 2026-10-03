import { describe, expect, it } from "vitest";
import { cashFlowQuery, cashFlowReport, type CashFlowAnswer } from "./cash-flow";

const answer = (over: Partial<CashFlowAnswer> = {}): CashFlowAnswer => ({
  from: "2026-09-01",
  to: "2026-09-30",
  go_live_on: "2026-09-01",
  accounts: [
    { account_code: "1110", name: "Cash in hand", money_kind: "CASH", is_active: true, opening: "500.00", receipts: "300.00", payments: "500.00" },
    { account_code: "1121", name: "Public Bank", money_kind: "BANK", is_active: true, opening: "10000.00", receipts: "6497.50", payments: "1200.00" },
  ],
  rows: [
    { side: "IN", account_code: "1210", name: "Trade receivables", kind: "ASSET", money_kind: null, amount: "6300.00" },
    { side: "IN", account_code: "1131", name: "GHL", kind: "ASSET", money_kind: "HOLDING", amount: "97.50" },
    { side: "IN", account_code: "1110", name: "Cash in hand", kind: "ASSET", money_kind: "CASH", amount: "400.00" },
    { side: "OUT", account_code: "2110", name: "Trade payables", kind: "LIABILITY", money_kind: null, amount: "1200.00" },
    { side: "OUT", account_code: "1121", name: "Public Bank", kind: "ASSET", money_kind: "BANK", amount: "400.00" },
    { side: "OUT", account_code: "6100", name: "Staff cost and commission", kind: "EXPENSE", money_kind: null, amount: "100.00" },
  ],
  card: { taken: "2150.00", waiting: "2052.50" },
  ...over,
});

describe("Cash Flow arithmetic (0638, Chew 2026-10-03)", () => {
  it("carries each account forward and totals the period", () => {
    const r = cashFlowReport(answer());
    expect(r.accounts.map((a) => [a.account.account_code, a.carriedForward])).toEqual([["1110", 300], ["1121", 15297.5]]);
    expect(r.totalInflow).toBe(6797.5);
    expect(r.totalOutflow).toBe(1700);
    expect(r.net).toBe(5097.5);
    expect(r.broughtForward).toBe(10500);
    expect(r.carriedForward).toBe(15597.5);
  });

  it("names a transfer between Carres's own accounts, and card money arriving from a holding account", () => {
    const r = cashFlowReport(answer());
    expect(r.inflow.map((l) => [l.code, l.transfer, l.holding])).toEqual([["1210", false, false], ["1131", false, true], ["1110", true, false]]);
    expect(r.outflow.find((l) => l.code === "1121")?.transfer).toBe(true);
  });

  it("reads the card money taken and still waiting", () => {
    const r = cashFlowReport(answer());
    expect(r.cardTaken).toBe(2150);
    expect(r.cardWaiting).toBe(2052.5);
  });

  it("refuses an answer whose rows do not add up to the accounts' money in and out", () => {
    const broken = answer();
    broken.rows[0]!.amount = "6300.01";
    expect(() => cashFlowReport(broken)).toThrow("Cash Flow does not add up.");
  });

  it("refuses a figure it cannot read", () => {
    const broken = answer();
    broken.accounts[0]!.opening = "five hundred";
    expect(() => cashFlowReport(broken)).toThrow();
  });

  it("a retired account with nothing in it and nothing moving leaves the list, and still adds nothing", () => {
    const r = cashFlowReport(answer({
      accounts: [...answer().accounts, { account_code: "1124", name: "RHB", money_kind: "BANK", is_active: false, opening: 0, receipts: 0, payments: 0 }],
    }));
    expect(r.accounts.map((a) => a.account.account_code)).toEqual(["1110", "1121"]);
  });

  it("asks for both days, the first no later than the last", () => {
    expect(cashFlowQuery.safeParse({ from: "2026-09-01", to: "2026-09-30" }).success).toBe(true);
    expect(cashFlowQuery.safeParse({ from: "2026-09-30", to: "2026-09-01" }).success).toBe(false);
    expect(cashFlowQuery.safeParse({ from: "2026-09-01" }).success).toBe(false);
    expect(cashFlowQuery.safeParse({ from: "2026-09-01", to: "2026-09-30", account: "1121" }).success).toBe(false);
  });
});

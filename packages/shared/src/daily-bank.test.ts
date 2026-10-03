import { describe, expect, it } from "vitest";
import { dailyBankRow, dailyBankShows, dailyBankTotals, sen, type DailyBankAccount } from "./daily-bank";

const acct = (over: Partial<DailyBankAccount>): DailyBankAccount => ({
  account_code: "1122",
  name: "Maybank",
  money_kind: "BANK",
  is_active: true,
  brought_forward: "0.00",
  received: "0.00",
  paid: "0.00",
  pending: "0.00",
  pending_vouchers: [],
  lines: [],
  ...over,
});

describe("Daily Bank arithmetic (0637, Chew 2026-10-03)", () => {
  it("closing is the day before plus money in less money out; available takes off the checked vouchers", () => {
    const r = dailyBankRow(acct({ brought_forward: "10000.10", received: "2500.20", paid: "1200.05", pending: "800.00" }));
    expect(r.closing).toBe(11300.25);
    expect(r.pending).toBe(800);
    expect(r.available).toBe(10500.25);
    expect(r.inTransit).toBeNull();
  });

  it("adds in sen, so 0.1 + 0.2 is exactly 0.30", () => {
    const r = dailyBankRow(acct({ brought_forward: 0.1, received: 0.2 }));
    expect(r.closing).toBe(0.3);
  });

  it("a holding account is money in transit: never available, never pending", () => {
    const r = dailyBankRow(acct({ account_code: "1131", name: "GHL", money_kind: "HOLDING", brought_forward: "640.00", received: "360.00", pending: "99.00" }));
    expect(r.available).toBeNull();
    expect(r.pending).toBe(0);
    expect(r.inTransit).toBe(1000);
  });

  it("the three totals: can move (cash and bank after pending), in transit, awaiting approval", () => {
    const rows = [
      dailyBankRow(acct({ account_code: "1110", name: "Cash", money_kind: "CASH", brought_forward: "500.00" })),
      dailyBankRow(acct({ brought_forward: "10000.00", pending: "800.00" })),
      dailyBankRow(acct({ account_code: "1131", name: "GHL", money_kind: "HOLDING", brought_forward: "1000.00" })),
    ];
    expect(dailyBankTotals(rows)).toEqual({ canMove: 9700, inTransit: 1000, awaitingApproval: 800 });
  });

  it("a retired account leaves the board only when nothing sits in it and nothing moved", () => {
    expect(dailyBankShows(dailyBankRow(acct({ is_active: false })))).toBe(false);
    expect(dailyBankShows(dailyBankRow(acct({ is_active: false, brought_forward: "1.00" })))).toBe(true);
    expect(dailyBankShows(dailyBankRow(acct({ is_active: true })))).toBe(true);
  });

  it("refuses a figure it cannot read rather than counting it as zero", () => {
    expect(() => sen("abc")).toThrow("A money figure could not be read.");
    expect(() => dailyBankRow(acct({ received: "" }))).toThrow();
  });
});

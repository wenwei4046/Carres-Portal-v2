import { describe, expect, it } from "vitest";
import type { LedgerChart } from "@carres/shared/finance-ledger";
import { accountMovement, cashAccounts, cashWeeks, parseAccountLedger, weeklyCashMovement, type CashLine } from "./cash-movement";

const acct = (code: string, parent: string | null, over: Partial<LedgerChart["accounts"][number]> = {}) => ({
  code, name: `Account ${code}`, kind: "ASSET", parent_code: parent, is_control: false, control_for: null,
  is_active: true, is_header: false, sort_order: 0, ...over,
});

/** The 0461 shape: 1100 Cash and bank is a header under 1000 Assets. */
const CHART: LedgerChart = {
  go_live_on: "2026-09-10",
  accounts: [
    acct("1000", null, { is_header: true }),
    acct("1100", "1000", { is_header: true }),
    acct("1110", "1100"),
    acct("1120", "1100"),
    acct("1130", "1100"),
    acct("1140", "1100", { is_active: false }),
    acct("1200", "1000", { is_header: true }),
    acct("1210", "1200", { is_control: true, control_for: "CUSTOMER" }),
    acct("4100", null, { kind: "INCOME" }),
  ],
};

const line = (account: string, entryNo: string, entryDate: string, debit: number, credit: number): CashLine =>
  ({ account, entryNo, entryDate, debit, credit });

describe("cash and bank accounts", () => {
  it("are the posting accounts under 1100, a retired one included; no header, no receivable", () => {
    expect(cashAccounts(CHART).map((a) => a.code)).toEqual(["1110", "1120", "1130", "1140"]);
  });
});

describe("the weeks", () => {
  it("never start before go-live: the go-live week starts on the go-live day", () => {
    // Go-live Thursday 10 Sep; today Monday 14 Sep.
    expect(cashWeeks("2026-09-10", "2026-09-14")).toEqual([
      { from: "2026-09-10", to: "2026-09-13" },
      { from: "2026-09-14", to: "2026-09-14" },
    ]);
  });

  it("are twelve Monday-to-Sunday weeks once the ledger is old enough, the last ending today", () => {
    const weeks = cashWeeks("2026-09-10", "2026-12-09");
    expect(weeks).toHaveLength(12);
    expect(weeks[0]).toEqual({ from: "2026-09-21", to: "2026-09-27" });
    expect(weeks[11]).toEqual({ from: "2026-12-07", to: "2026-12-09" });
  });

  it("is short while the first of the twelve still starts mid-week at go-live", () => {
    const weeks = cashWeeks("2026-09-10", "2026-11-25");
    expect(weeks).toHaveLength(12);
    expect(weeks[0]!.from).toBe("2026-09-10");
    expect(weeklyCashMovement([], weeks, "2026-09-10").short).toBe(true);
    expect(weeklyCashMovement([], cashWeeks("2026-09-10", "2026-12-09"), "2026-09-10").short).toBe(false);
  });

  it("are none while today is before go-live", () => {
    expect(cashWeeks("2026-09-10", "2026-09-09")).toEqual([]);
  });
});

describe("the movement", () => {
  const weeks = cashWeeks("2026-09-10", "2026-09-20");
  const lines = [
    line("1120", "JE-1", "2026-09-10", 1000, 0), // a receipt into the bank
    line("1110", "JE-2", "2026-09-12", 0, 250), // cash paid out
    line("1110", "JE-3", "2026-09-15", 0, 300), // cash drawer → bank: one entry, nets to nothing
    line("1120", "JE-3", "2026-09-15", 300, 0),
    line("1130", "JE-4", "2026-09-20", 80.1, 0), // card settlement on the last day
  ];

  it("is money in less money out per week, a transfer between cash accounts in neither", () => {
    const m = weeklyCashMovement(lines, weeks, "2026-09-10");
    expect(m.weeks.map(({ from, moneyIn, moneyOut, net }) => ({ from, moneyIn, moneyOut, net }))).toEqual([
      { from: "2026-09-10", moneyIn: 1000, moneyOut: 250, net: 750 },
      { from: "2026-09-14", moneyIn: 80.1, moneyOut: 0, net: 80.1 },
    ]);
    expect(m).toMatchObject({ moneyIn: 1080.1, moneyOut: 250, net: 830.1, short: true });
  });

  it("the tile's total is the sum of the chart's weeks (one arithmetic)", () => {
    const m = weeklyCashMovement(lines, weeks, "2026-09-10");
    expect(m.weeks.reduce((s, w) => s + Math.round(w.net * 100), 0) / 100).toBe(m.net);
  });
});

describe("reading one account", () => {
  const body = (over: Record<string, unknown> = {}, lines: Record<string, unknown>[] = [
    { row_kind: "LINE", entry_no: "JE-1", entry_date: "2026-09-10", debit: 1000, credit: 0 },
    { row_kind: "LINE", entry_no: "JE-2", entry_date: "2026-09-12", debit: 0, credit: 250 },
  ], closing = { debit: 1000, credit: 250 }) => ({
    status: "OK", go_live_on: "2026-09-10", account_code: "1120",
    rows: [
      { row_kind: "OPENING", entry_no: null, entry_date: null, debit: null, credit: null },
      ...lines,
      { row_kind: "CLOSING", entry_no: null, entry_date: null, ...closing },
    ],
    ...over,
  });

  it("returns the lines when they add up to the closing row", () => {
    expect(parseAccountLedger(body(), "1120", "2026-09-10", "2026-09-14")).toHaveLength(2);
  });

  it.each([
    ["another status", body({ status: "BEFORE_GO_LIVE" })],
    ["another account", body({ account_code: "1110" })],
    ["lines that do not add up to the closing row", body({}, undefined, { debit: 1000, credit: 999 })],
    ["a line outside the window", body({}, [{ row_kind: "LINE", entry_no: "JE-0", entry_date: "2026-09-09", debit: 5, credit: 0 }], { debit: 5, credit: 0 })],
    ["no closing row", { status: "OK", account_code: "1120", rows: [] }],
    ["a money figure that is not a number", body({}, [{ row_kind: "LINE", entry_no: "JE-1", entry_date: "2026-09-10", debit: null, credit: 0 }], { debit: 0, credit: 0 })],
  ])("refuses %s — never a zero", (_why, answer) => {
    expect(() => parseAccountLedger(answer, "1120", "2026-09-10", "2026-09-14")).toThrow("Cash and bank could not be loaded.");
  });
});

describe("each account since go-live", () => {
  it("counts a move between two cash accounts as Out on one and In on the other, and lists an idle account at 0.00", () => {
    const lines = [
      line("1110", "JE-1", "2026-09-10", 500, 0),
      line("1110", "JE-2", "2026-09-11", 0, 200),
      line("1120", "JE-2", "2026-09-11", 200, 0),
      line("1120", "JE-3", "2026-09-12", 0, 50.1),
    ];
    const accts = cashAccounts(CHART).slice(0, 3);
    expect(accountMovement(lines, accts)).toEqual([
      { code: "1110", name: "Account 1110", moneyIn: 500, moneyOut: 200, net: 300 },
      { code: "1120", name: "Account 1120", moneyIn: 200, moneyOut: 50.1, net: 149.9 },
      { code: "1130", name: "Account 1130", moneyIn: 0, moneyOut: 0, net: 0 },
    ]);
  });
});

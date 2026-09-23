import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { LedgerChart } from "@carres/shared/finance-ledger";
import {
  accountMovement, cashAccounts, cashWeeks, parseAccountLedger, useCashAccountMovement, useCashMovement,
  weeklyCashMovement, weeklyReadFrom, CASH_WEEKS, type CashLine,
} from "./cash-movement";

/** Every account ledger read, by URL; each answers an empty but well-formed ledger. */
const api = vi.hoisted(() => ({ urls: [] as string[] }));
vi.mock("@/lib/api", () => ({
  apiFetch: async (url: string) => {
    api.urls.push(url);
    return {
      status: "OK", account_code: new URL(url, "http://portal.test").searchParams.get("account"),
      rows: [{ row_kind: "CLOSING", entry_no: null, entry_date: null, debit: 0, credit: 0 }],
    };
  },
}));

const acct = (code: string, parent: string | null, over: Partial<LedgerChart["accounts"][number]> = {}) => ({
  code, name: `Account ${code}`, kind: "ASSET", parent_code: parent, is_control: false, control_for: null,
  is_active: true, is_header: false, sort_order: 0, ...over,
});

/** An AutoCount-shaped chart: 310-0000 CASH AT BANK is a heading under
 *  399-0000, and CASH IN HAND (320-0000) sits OUTSIDE it, straight under
 *  399-0000. The money-accounts list, not the heading, says which count. */
const CHART: LedgerChart = {
  go_live_on: "2026-09-10",
  accounts: [
    acct("399-0000", null, { is_header: true }),
    acct("310-0000", "399-0000", { is_header: true }),
    acct("320-0000", "399-0000"),
    acct("310-1000", "310-0000"),
    acct("310-A001", "310-0000"),
    acct("310-2000", "310-0000", { is_active: false }),
    acct("310-5000", "310-0000"),
    acct("309-0000", "399-0000", { is_header: true }),
    acct("300-0000", "309-0000", { is_control: true, control_for: "CUSTOMER" }),
    acct("500-0000", null, { kind: "INCOME" }),
  ],
  money_accounts: ["310-2000", "320-0000", "310-A001", "310-1000"],
};

const line = (account: string, entryNo: string, entryDate: string, debit: number, credit: number): CashLine =>
  ({ account, entryNo, entryDate, debit, credit });

describe("cash and bank accounts", () => {
  it("are the accounts on the money-accounts list, a retired one included, wherever they sit; in chart order", () => {
    // 310-5000 sits under the bank heading but is not a money account: the
    // heading decides nothing. 320-0000 sits outside it and still counts.
    expect(cashAccounts(CHART).map((a) => a.code)).toEqual(["320-0000", "310-1000", "310-A001", "310-2000"]);
  });

  it("are none when the chart came without its money-accounts list", () => {
    expect(cashAccounts({ ...CHART, money_accounts: undefined })).toEqual([]);
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
    line("310-1000", "JE-1", "2026-09-10", 1000, 0), // a receipt into the bank
    line("320-0000", "JE-2", "2026-09-12", 0, 250), // cash paid out
    line("320-0000", "JE-3", "2026-09-15", 0, 300), // cash drawer → bank: one entry, nets to nothing
    line("310-1000", "JE-3", "2026-09-15", 300, 0),
    line("310-A001", "JE-4", "2026-09-20", 80.1, 0), // card settlement on the last day
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
    status: "OK", go_live_on: "2026-09-10", account_code: "310-1000",
    rows: [
      { row_kind: "OPENING", entry_no: null, entry_date: null, debit: null, credit: null },
      ...lines,
      { row_kind: "CLOSING", entry_no: null, entry_date: null, ...closing },
    ],
    ...over,
  });

  it("returns the lines when they add up to the closing row", () => {
    expect(parseAccountLedger(body(), "310-1000", "2026-09-10", "2026-09-14")).toHaveLength(2);
  });

  it.each([
    ["another status", body({ status: "BEFORE_GO_LIVE" })],
    ["another account", body({ account_code: "320-0000" })],
    ["lines that do not add up to the closing row", body({}, undefined, { debit: 1000, credit: 999 })],
    ["a line outside the window", body({}, [{ row_kind: "LINE", entry_no: "JE-0", entry_date: "2026-09-09", debit: 5, credit: 0 }], { debit: 5, credit: 0 })],
    ["no closing row", { status: "OK", account_code: "310-1000", rows: [] }],
    ["a money figure that is not a number", body({}, [{ row_kind: "LINE", entry_no: "JE-1", entry_date: "2026-09-10", debit: null, credit: 0 }], { debit: 0, credit: 0 })],
  ])("refuses %s — never a zero", (_why, answer) => {
    expect(() => parseAccountLedger(answer, "310-1000", "2026-09-10", "2026-09-14")).toThrow("Cash and bank could not be loaded.");
  });
});

describe("each account since go-live", () => {
  it("counts a move between two cash accounts as Out on one and In on the other, and lists an idle account at 0.00", () => {
    const lines = [
      line("320-0000", "JE-1", "2026-09-10", 500, 0),
      line("320-0000", "JE-2", "2026-09-11", 0, 200),
      line("310-1000", "JE-2", "2026-09-11", 200, 0),
      line("310-1000", "JE-3", "2026-09-12", 0, 50.1),
    ];
    const accts = cashAccounts(CHART).slice(0, 3);
    expect(accountMovement(lines, accts)).toEqual([
      { code: "320-0000", name: "Account 320-0000", moneyIn: 500, moneyOut: 200, net: 300 },
      { code: "310-1000", name: "Account 310-1000", moneyIn: 200, moneyOut: 50.1, net: 149.9 },
      { code: "310-A001", name: "Account 310-A001", moneyIn: 0, moneyOut: 0, net: 0 },
    ]);
  });
});

/**
 * THE READ WINDOW. The tile and the chart read the twelve weeks they show; the
 * per-account panel reads from go-live. The bound on the first is the point:
 * the account ledger refuses more than 20,000 lines per account ("Choose a
 * shorter period for this account"), and nobody can shorten a window the page
 * computes for them. A window that grows with the ledger's age fails here.
 */
describe("the read window", () => {
  const GO_LIVE = CHART.go_live_on!;
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  const wrapper = ({ children }: { children: ReactNode }) => createElement(QueryClientProvider, { client }, children);
  const froms = () => api.urls.map((u) => new URL(u, "http://portal.test").searchParams.get("from")!);
  const days = (from: string, to: string) => (Date.parse(to) - Date.parse(from)) / 86_400_000;

  beforeEach(() => {
    api.urls.length = 0;
    client.clear();
  });

  it("stays twelve weeks for the tile and the chart, however old the ledger gets", async () => {
    // Two years after go-live: the twelve-week window has long parted from it.
    const today = "2028-09-11";
    expect(weeklyReadFrom(cashWeeks(GO_LIVE, today))).not.toBe(GO_LIVE);
    const { result } = renderHook(() => useCashMovement(CHART, today), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(api.urls).toHaveLength(4); // one read per money account
    expect(new Set(froms()).size).toBe(1);
    const from = froms()[0]!;
    expect(from).not.toBe(GO_LIVE);
    expect(days(from, today)).toBeLessThanOrEqual(CASH_WEEKS * 7);
  });

  it("stays at go-live for the per-account panel — movement since the ledger started is what it is for", async () => {
    const { result } = renderHook(() => useCashAccountMovement(CHART, "2028-09-11"), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(new Set(froms())).toEqual(new Set([GO_LIVE]));
  });

  it("is one read while the two windows are the same day, and two reads once they part", async () => {
    // 25 Nov 2026: the twelve weeks still reach back past go-live, so both windows start there.
    const together = renderHook(() => ({
      weekly: useCashMovement(CHART, "2026-11-25"), panel: useCashAccountMovement(CHART, "2026-11-25"),
    }), { wrapper });
    await waitFor(() => expect(together.result.current.panel.isSuccess).toBe(true));
    expect(api.urls).toHaveLength(4);
    expect(new Set(froms())).toEqual(new Set([GO_LIVE]));

    api.urls.length = 0;
    const parted = renderHook(() => ({
      weekly: useCashMovement(CHART, "2026-12-14"), panel: useCashAccountMovement(CHART, "2026-12-14"),
    }), { wrapper });
    await waitFor(() => expect(parted.result.current.panel.isSuccess).toBe(true));
    expect(api.urls).toHaveLength(8);
    expect(new Set(froms()).size).toBe(2);
  });

  it("reads nothing at all while today is still before go-live", async () => {
    const { result } = renderHook(() => ({
      weekly: useCashMovement(CHART, "2026-09-09"), panel: useCashAccountMovement(CHART, "2026-09-09"),
    }), { wrapper });
    await waitFor(() => expect(result.current.panel.isSuccess).toBe(true));
    expect(api.urls).toEqual([]);
    expect(result.current.weekly.data!.weeks).toEqual([]);
  });
});

import { QueryClient } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  defaultPackMonth,
  exportMonthEndPack,
  packFileName,
  packMonths,
  packPeriod,
} from "./month-end-pack";

const api = vi.hoisted(() => ({ fetch: vi.fn(), book: [] as { name: string; rows: unknown[][] }[], files: [] as string[] }));
vi.mock("@/lib/api", () => ({ apiFetch: api.fetch }));
vi.mock("xlsx", () => ({
  utils: {
    book_new: () => ({}),
    aoa_to_sheet: (rows: unknown[][]) => ({ rows }),
    book_append_sheet: (_wb: unknown, sheet: { rows: unknown[][] }, name: string) => api.book.push({ name, rows: sheet.rows }),
  },
  writeFile: (_wb: unknown, name: string) => api.files.push(name),
}));

const GO_LIVE = "2026-09-10";

// ── the three reports as the ledger API serves them ──────────────────────────
type Row = Record<string, unknown>;
const BLANK = { section: null, row_kind: null, header_code: null, header_name: null, account_code: null, account_name: null, amount: null };
const acc = (section: string, hdr: string, code: string, name: string, amount: number): Row =>
  ({ section, row_kind: "ACCOUNT", header_code: hdr, header_name: `Header ${hdr}`, account_code: code, account_name: name, amount });
const sub = (section: string, hdr: string, amount: number): Row =>
  ({ section, row_kind: "HEADER_SUBTOTAL", header_code: hdr, header_name: `Header ${hdr}`, amount });
const tot = (section: string, amount: number): Row => ({ section, row_kind: "SECTION_TOTAL", amount });

const trialBalance = (asOf: string) => ({
  status: "ok", go_live_on: GO_LIVE, as_of: asOf, total_debit: 1500, total_credit: 1500, difference: 0, balances: true,
  accounts: [
    { account_code: "1120", account_name: "Bank — current account", kind: "ASSET", is_control: false, is_active: true, total_debit: 1500, total_credit: 250, natural_balance: 1250 },
    { account_code: "1110", account_name: "Cash on hand", kind: "ASSET", is_control: false, is_active: true, total_debit: 0, total_credit: 0, natural_balance: 0 },
    { account_code: "4100", account_name: "Furniture sales", kind: "INCOME", is_control: false, is_active: true, total_debit: 0, total_credit: 1250, natural_balance: 1250 },
  ],
});
const profitAndLoss = (from: string, to: string) => ({
  rows: [
    acc("INCOME", "4000", "4100", "Furniture sales", 1250), sub("INCOME", "4000", 1250), tot("INCOME", 1250),
    acc("EXPENSE", "6000", "6200", "Rent and utilities", 0), sub("EXPENSE", "6000", 0), tot("EXPENSE", 0),
    { section: "NET", row_kind: "NET", amount: 1250 },
  ].map((r, i) => ({ report_status: "OK", go_live_on: GO_LIVE, period_from: from, period_to: to, ordinal: i + 1, ...BLANK, ...r })),
});
const balanceSheet = (asOf: string) => ({
  rows: [
    acc("ASSET", "1100", "1120", "Bank — current account", 1250), sub("ASSET", "1100", 1250), tot("ASSET", 1250),
    acc("LIABILITY", "2100", "2110", "Trade payables", 0), sub("LIABILITY", "2100", 0), tot("LIABILITY", 0),
    acc("EQUITY", "3000", "3100", "Share capital", 0), sub("EQUITY", "3000", 0),
    { section: "EQUITY", row_kind: "DERIVED", amount: 1250 }, tot("EQUITY", 1250),
    { section: "CHECK", row_kind: "EQUATION", amount: 0 },
  ].map((r, i) => ({ report_status: "OK", go_live_on: GO_LIVE, as_of: asOf, ordinal: i + 1, ...BLANK,
    equation_balances: true, equation_difference: 0, ...r })),
});

beforeEach(() => {
  api.book.length = 0;
  api.files.length = 0;
  api.fetch.mockReset();
  api.fetch.mockImplementation(async (url: string) => {
    const u = new URL(url, "http://portal.test");
    const p = u.searchParams;
    if (u.pathname === "/api/finance/ledger/trial-balance") return trialBalance(p.get("asOf")!);
    if (u.pathname === "/api/finance/ledger/profit-and-loss") return profitAndLoss(p.get("from")!, p.get("to")!);
    if (u.pathname === "/api/finance/ledger/balance-sheet") return balanceSheet(p.get("asOf")!);
    throw new Error(`unexpected read ${url}`);
  });
});

const client = () => new QueryClient({ defaultOptions: { queries: { retry: false } } });

describe("the month the pack opens on", () => {
  it("is the last complete month", () => {
    expect(defaultPackMonth("2026-11-03", GO_LIVE)).toBe("2026-10");
    expect(defaultPackMonth("2027-01-15", GO_LIVE)).toBe("2026-12");
  });

  it("is this month when the last complete month ended before go-live", () => {
    expect(defaultPackMonth("2026-09-14", GO_LIVE)).toBe("2026-09");
    // October: September holds go-live, so it is the last complete month.
    expect(defaultPackMonth("2026-10-01", GO_LIVE)).toBe("2026-09");
  });

  it("offers every month from go-live to this one, newest first", () => {
    expect(packMonths("2026-11-03", GO_LIVE)).toEqual(["2026-11", "2026-10", "2026-09"]);
  });

  it("always offers the month it opens on", () => {
    for (const [today, goLive] of [["2026-11-03", null], ["2026-09-14", GO_LIVE], ["2026-08-20", GO_LIVE]] as const) {
      expect(packMonths(today, goLive)).toContain(defaultPackMonth(today, goLive));
    }
  });

  it("a running month ends today; a finished one on its last day", () => {
    expect(packPeriod("2026-09", "2026-09-14")).toEqual({ from: "2026-09-01", to: "2026-09-14" });
    expect(packPeriod("2026-10", "2026-11-03")).toEqual({ from: "2026-10-01", to: "2026-10-31" });
  });
});

describe("Export month-end pack", () => {
  it("writes one workbook with the three reports for the chosen month", async () => {
    const sheets = await exportMonthEndPack(client(), "2026-10", "2026-11-03");
    const urls = api.fetch.mock.calls.map(([u]) => String(u));
    expect(urls).toEqual(expect.arrayContaining([
      "/api/finance/ledger/trial-balance?asOf=2026-10-31",
      "/api/finance/ledger/profit-and-loss?from=2026-10-01&to=2026-10-31",
      "/api/finance/ledger/balance-sheet?asOf=2026-10-31",
    ]));
    expect(api.book.map((s) => s.name)).toEqual(["Trial Balance", "Profit and Loss", "Balance Sheet"]);
    expect(api.files).toEqual([packFileName("2026-10")]);
    expect(api.files[0]).toBe("Month-end pack Oct 2026.xlsx");
    expect(sheets.map((s) => s.name)).toEqual(["Trial Balance", "Profit and Loss", "Balance Sheet"]);
  });

  it("each sheet carries the figures its report page prints", async () => {
    await exportMonthEndPack(client(), "2026-10", "2026-11-03");
    const [tb, pl, bs] = api.book;
    // Trial Balance: the account nothing was posted to is left out, as on the page; debit and credit sides.
    expect(tb!.rows).toContainEqual(["1120 Bank — current account", "Asset", 1250, 0]);
    expect(tb!.rows.some((r) => String(r[0]).startsWith("1110"))).toBe(false);
    expect(tb!.rows.at(-1)).toEqual(["Total", "", 1250, 1250]);
    expect(pl!.rows).toContainEqual(["4100 Furniture sales", 1250]);
    expect(pl!.rows.at(-1)).toEqual(["Net result", 1250]);
    expect(bs!.rows).toContainEqual(["1120 Bank — current account", 1250]);
    // A section at RM 0.00 says what it has none of, in the page's words.
    expect(pl!.rows).toContainEqual(["No expenses in this period."]);
    expect(bs!.rows).toContainEqual(["No liabilities on this day."]);
    expect(bs!.rows.some((r) => /paid before their invoice/.test(String(r[0])))).toBe(false);
    for (const s of api.book) expect(s.rows[1]).toEqual(["Since Thu, 10 Sep 26 · No opening balances"]);
    // A filed workbook always carries the year, even this year's.
    expect(tb!.rows[0]).toEqual(["Trial Balance", "As of Sat, 31 Oct 26"]);
  });

  it("the Balance Sheet sheet says, under Customer deposits held, what customers paid before their invoice (0506)", async () => {
    const ok = api.fetch.getMockImplementation()!;
    api.fetch.mockImplementation(async (url: string) => {
      if (!url.includes("balance-sheet")) return ok(url);
      const asOf = new URL(url, "http://portal.test").searchParams.get("asOf")!;
      return {
        rows: [
          acc("ASSET", "1100", "1120", "Bank — current account", 4065), sub("ASSET", "1100", 4065), tot("ASSET", 4065),
          { ...acc("LIABILITY", "2200", "2210", "Customer deposits held", 2815), reclassified: 2815 },
          sub("LIABILITY", "2200", 2815), tot("LIABILITY", 2815),
          acc("EQUITY", "3000", "3100", "Share capital", 0), sub("EQUITY", "3000", 0),
          { section: "EQUITY", row_kind: "DERIVED", amount: 1250 }, tot("EQUITY", 1250),
          { section: "CHECK", row_kind: "EQUATION", amount: 0 },
        ].map((r, i) => ({ report_status: "OK", go_live_on: GO_LIVE, as_of: asOf, ordinal: i + 1, ...BLANK,
          equation_balances: true, equation_difference: 0, ...r })),
      };
    });
    await exportMonthEndPack(client(), "2026-10", "2026-11-03");
    const bs = api.book[2]!;
    const at = bs.rows.findIndex((r) => r[0] === "2210 Customer deposits held");
    expect(bs.rows[at]).toEqual(["2210 Customer deposits held", 2815]);
    expect(bs.rows[at + 1]).toEqual(["Includes RM 2,815.00 from customers who paid before their invoice."]);
  });

  it("writes nothing when any of the three reads fails", async () => {
    const ok = api.fetch.getMockImplementation()!;
    api.fetch.mockImplementation(async (url: string) => {
      if (url.includes("balance-sheet")) throw Object.assign(new Error("boom"), { status: 500 });
      return ok(url);
    });
    await expect(exportMonthEndPack(client(), "2026-10", "2026-11-03")).rejects.toThrow();
    expect(api.files).toEqual([]);
    expect(api.book).toEqual([]);
  });
});

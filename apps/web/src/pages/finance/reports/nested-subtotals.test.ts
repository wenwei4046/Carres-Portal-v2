import { describe, expect, it } from "vitest";
import { parseBalanceSheet, parseProfitAndLoss } from "./report-queries";
import { statementRows } from "./StatementTable";
import { profitAndLossSheet } from "../month-end-pack";

// Rows as 0579 serves them: 6000 > 6T10 > 6T11, each heading with its own
// subtotal after everything under it, in the chart's order.
const base = { report_status: "OK", go_live_on: "2026-09-10", period_from: "2026-09-01", period_to: "2026-09-30" };
const acct = (ordinal: number, hdr: string, code: string, amount: number) =>
  ({ ...base, ordinal, section: "EXPENSE", row_kind: "ACCOUNT", header_code: hdr, header_name: `H ${hdr}`, account_code: code, account_name: `A ${code}`, amount, header_depth: null, parent_header_code: null });
const sub = (ordinal: number, hdr: string, amount: number, depth: number, parent: string | null) =>
  ({ ...base, ordinal, section: "EXPENSE", row_kind: "HEADER_SUBTOTAL", header_code: hdr, header_name: `H ${hdr}`, account_code: null, account_name: null, amount, header_depth: depth, parent_header_code: parent });
const rows = [
  acct(1, "6000", "6200", 3),
  acct(2, "6T11", "6T13", 40),
  acct(3, "6T11", "6T12", 100),
  sub(4, "6T11", 140, 3, "6T10"),
  acct(5, "6T10", "6T14", 7),
  sub(6, "6T10", 147, 2, "6000"),
  sub(7, "6000", 150, 1, null),
  { ...base, ordinal: 8, section: "EXPENSE", row_kind: "SECTION_TOTAL", header_code: null, header_name: "Total expense", account_code: null, account_name: null, amount: 150, header_depth: null, parent_header_code: null },
  { ...base, ordinal: 9, section: "NET", row_kind: "NET", header_code: null, header_name: "Net result for the period", account_code: null, account_name: null, amount: -150, header_depth: null, parent_header_code: null },
];

describe("a heading under a heading under a heading", () => {
  it("keeps each heading's own subtotal, depth and parent", () => {
    const pl = parseProfitAndLoss({ rows }, "2026-09-01", "2026-09-30");
    if (pl.status !== "ok") throw new Error("expected ok");
    const g = pl.sections[0]!.groups.map((x) => [x.code, x.subtotal, x.depth, x.parentCode]);
    expect(g).toEqual([["6T11", 140, 3, "6T10"], ["6T10", 147, 2, "6000"], ["6000", 150, 1, null]]);
  });

  it("prints every heading with its subtotal, nested, and each account once", () => {
    const pl = parseProfitAndLoss({ rows }, "2026-09-01", "2026-09-30");
    if (pl.status !== "ok") throw new Error("expected ok");
    const printed = statementRows(pl.sections).map((r) =>
      r.kind === "group" ? `G${r.depth} ${r.name} ${r.amount}` : r.kind === "line" ? `L${r.depth} ${r.code} ${r.amount}` : r.kind);
    expect(printed).toEqual([
      "G1 H 6000 150",
      "L2 6200 3",
      "G2 H 6T10 147",
      "G3 H 6T11 140",
      "L4 6T13 40",
      "L4 6T12 100",
      "L3 6T14 7",
    ]);
    const lines = statementRows(pl.sections).filter((r) => r.kind === "line");
    expect(lines.reduce((t, r) => t + r.amount, 0)).toBe(pl.sections[0]!.total);
  });

  it("the month-end pack indents each heading and account one step per level", () => {
    const pl = parseProfitAndLoss({ rows }, "2026-09-01", "2026-09-30");
    if (pl.status !== "ok") throw new Error("expected ok");
    const body = profitAndLossSheet(pl).rows.slice(3, -1);
    expect(body).toEqual([
      ["Account", "Amount"],
      ["Expense", 150],
      ["H 6000", 150],
      ["  6200 A 6200", 3],
      ["  H 6T10", 147],
      ["    H 6T11", 140],
      ["      6T13 A 6T13", 40],
      ["      6T12 A 6T12", 100],
      ["    6T14 A 6T14", 7],
    ]);
  });

  it("still reads rows served before 0579 (no depth, no parent)", () => {
    const old = rows.filter((r) => r.header_code !== "6T10" && r.header_code !== "6T11")
      .map((r) => ({ ...r, header_depth: undefined, parent_header_code: undefined }));
    old[1] = { ...old[1]!, amount: 3 };
    const oldRows = old.map((r) => (r.row_kind === "SECTION_TOTAL" ? { ...r, amount: 3 } : r));
    const pl = parseProfitAndLoss({ rows: oldRows }, "2026-09-01", "2026-09-30");
    if (pl.status !== "ok") throw new Error("expected ok");
    expect(pl.sections[0]!.groups.map((x) => [x.code, x.depth, x.parentCode])).toEqual([["6000", 1, null]]);
  });
});

// Chart order: 6000 > [6T10 > 6T12] 6100 [6T20 > 6T21 at 0] 6200. The
// sub-heading 6T10 sits before 6000's own accounts, and the empty heading
// 6T20 sits between two of them.
const chartRows = [
  acct(1, "6T10", "6T12", 5),
  sub(2, "6T10", 5, 2, "6000"),
  acct(3, "6000", "6100", 10),
  acct(4, "6T20", "6T21", 0),
  sub(5, "6T20", 0, 2, "6000"),
  acct(6, "6000", "6200", 20),
  sub(7, "6000", 35, 1, null),
  { ...base, ordinal: 8, section: "EXPENSE", row_kind: "SECTION_TOTAL", header_code: null, header_name: "Total expense", account_code: null, account_name: null, amount: 35, header_depth: null, parent_header_code: null },
  { ...base, ordinal: 9, section: "NET", row_kind: "NET", header_code: null, header_name: "Net result for the period", account_code: null, account_name: null, amount: -35, header_depth: null, parent_header_code: null },
];

const printedOf = (sections: Parameters<typeof statementRows>[0]) => statementRows(sections).map((r) =>
  r.kind === "group" ? `G${r.depth} ${r.name} ${r.amount}` : r.kind === "line" ? `L${r.depth} ${r.code} ${r.amount}` : r.kind);

describe("accounts and sub-headings print in the chart's order", () => {
  it("prints a sub-heading before the heading's own accounts when the chart puts it first", () => {
    const pl = parseProfitAndLoss({ rows: chartRows }, "2026-09-01", "2026-09-30");
    if (pl.status !== "ok") throw new Error("expected ok");
    expect(printedOf(pl.sections)).toEqual([
      "G1 H 6000 35",
      "G2 H 6T10 5",
      "L3 6T12 5",
      "L2 6100 10",
      "L2 6200 20",
    ]);
  });

  it("the month-end pack prints the same order, indented", () => {
    const pl = parseProfitAndLoss({ rows: chartRows }, "2026-09-01", "2026-09-30");
    if (pl.status !== "ok") throw new Error("expected ok");
    expect(profitAndLossSheet(pl).rows.slice(5, -1)).toEqual([
      ["H 6000", 35],
      ["  H 6T10", 5],
      ["    6T12 A 6T12", 5],
      ["  6100 A 6100", 10],
      ["  6200 A 6200", 20],
    ]);
  });

  it("on the Balance Sheet, an account after a sub-heading prints after it", () => {
    const bs = { report_status: "OK", go_live_on: "2026-09-10", as_of: "2026-09-30", equation_balances: true, equation_difference: 0 };
    const row = (ordinal: number, section: string, rk: string, hdr: string | null, code: string | null, amount: number, depth: number | null = null, parent: string | null = null) =>
      ({ ...bs, ordinal, section, row_kind: rk, header_code: hdr, header_name: hdr && `H ${hdr}`, account_code: code, account_name: code && `A ${code}`, amount, header_depth: depth, parent_header_code: parent });
    const sheet = parseBalanceSheet({ rows: [
      row(1, "ASSET", "ACCOUNT", "1000", "1100", 50),
      row(2, "ASSET", "ACCOUNT", "1T10", "1T11", 30),
      row(3, "ASSET", "HEADER_SUBTOTAL", "1T10", null, 30, 2, "1000"),
      row(4, "ASSET", "ACCOUNT", "1000", "1300", 20),
      row(5, "ASSET", "HEADER_SUBTOTAL", "1000", null, 100, 1),
      row(6, "ASSET", "SECTION_TOTAL", null, null, 100),
      row(7, "EQUITY", "ACCOUNT", "3000", "3100", 100),
      row(8, "EQUITY", "HEADER_SUBTOTAL", "3000", null, 100, 1),
      row(9, "EQUITY", "DERIVED", null, null, 0),
      row(10, "EQUITY", "SECTION_TOTAL", null, null, 100),
      row(11, "CHECK", "EQUATION", null, null, 0),
    ] }, "2026-09-30");
    if (sheet.status !== "ok") throw new Error("expected ok");
    expect(printedOf(sheet.sections)).toEqual([
      "G1 H 1000 100",
      "L2 1100 50",
      "G2 H 1T10 30",
      "L3 1T11 30",
      "L2 1300 20",
      "L1 3100 100",
    ]);
  });
});

import { describe, expect, it } from "vitest";
import { readAutocountChart, type ChartPdfItem } from "./finance-chart-import";

/**
 * A made-up chart laid out the way AutoCount prints one: page header, column
 * titles, a bold section line, then accounts with the number at 36 / 57.6 /
 * 68.3 for each indent, the description at 161.9, the currency at 496 and the
 * special type at 555. Every word is its own piece of text, as the PDF reader
 * returns them. No real chart is used: the real one names people.
 */
const M = 36;
const I1 = 57.6;
const I2 = 68.3;

function line(page: number, y: number, x: number, text: string, special?: string): ChartPdfItem[] {
  const out: ChartPdfItem[] = [];
  const [code, ...words] = text.split(" ");
  out.push({ page, y, x, str: code! });
  let dx = 161.9;
  for (const w of words) {
    out.push({ page, y, x: dx, str: w });
    dx += w.length * 5.4 + 5;
  }
  out.push({ page, y: y + 0.4, x: 496, str: "MYR" });
  if (special) out.push({ page, y, x: 555.3, str: special });
  return out;
}

function header(page: number, pages: number): ChartPdfItem[] {
  return [
    { page, y: 767, x: 499.3, str: "Date : " },
    { page, y: 767, x: 520.6, str: "22/09/2026 12:14:53" },
    { page, y: 757, x: 490.6, str: "User ID : ADMIN" },
    { page, y: 746, x: 240.7, str: "Chart of Accounts" },
    { page, y: 715, x: 36, str: "TEST TRADING SDN. BHD. (202400000000 (1000000-X))" },
    { page, y: 714, x: 545.2, str: `Page ${page} of ${pages}` },
    { page, y: 697, x: 539.4, str: "Special" },
    { page, y: 687, x: 536.8, str: "Acc" },
    { page, y: 687, x: 558.3, str: "Type" },
    { page, y: 686, x: 36, str: "Acc." },
    { page, y: 686, x: 63, str: "No." },
    { page, y: 686, x: 161.9, str: "Description" },
    { page, y: 686, x: 482.6, str: "Currency" },
  ];
}

const section = (page: number, y: number, ...words: string[]): ChartPdfItem[] =>
  words.map((w, i) => ({ page, y, x: 36 + i * 50, str: w }));

describe("readAutocountChart", () => {
  const items: ChartPdfItem[] = [
    ...header(1, 2),
    ...section(1, 662, "CAPITAL"),
    ...line(1, 644, M, "100-0000 SHARE CAPITAL"),
    ...section(1, 623, "CURRENT", "ASSETS"),
    ...line(1, 604, M, "300-0000 TRADE DEBTORS", "SDC"),
    ...line(1, 592, M, "310-0000 CASH AT BANK"),
    ...line(1, 580, I1, "310-1000 FIRST BANK", "SBK"),
    ...line(1, 568, I1, "310-2000 SECOND BANK", "SBK"),
    ...section(1, 547, "CURRENT", "LIABILITIES"),
    ...line(1, 529, M, "410-0000 ACCRUALS"),
    ...line(1, 517, I1, "411-0000 ACCRUALS - SALARIES"),
    ...line(1, 505, I2, "410-0010 ACCRUALS - SALARY (OFFICE)"),
    // page 2 carries on under the same parents
    ...header(2, 2),
    ...line(2, 671, I2, "410-0011 ACCRUALS - SALARY (SALES)"),
    ...line(2, 659, I1, "412-0000 ACCRUALS - EPF"),
    ...line(2, 647, M, "440-0000 DEPOSIT RECEIVED"),
    ...section(2, 626, "EXPENSES"),
    ...line(2, 608, M, "900-A001 ADVERTISING"),
    // skips an indent: hangs under the nearest shallower account
    ...line(2, 596, I2, "900-A002 ADVERTISING - ONLINE"),
    ...line(2, 584, I1, "900-A003 ADVERTISING - OTHERS"),
    ...line(2, 572, M, "902-0000 BANK CHARGES"),
  ];

  it("reads every account with its name, section, special type and parent, across pages", () => {
    const { rows, problems } = readAutocountChart(items);
    expect(problems).toEqual([]);
    expect(rows.map((r) => [r.code, r.name, r.parentCode, r.section, r.special])).toEqual([
      ["100-0000", "SHARE CAPITAL", null, "CAPITAL", null],
      ["300-0000", "TRADE DEBTORS", null, "CURRENT ASSETS", "SDC"],
      ["310-0000", "CASH AT BANK", null, "CURRENT ASSETS", null],
      ["310-1000", "FIRST BANK", "310-0000", "CURRENT ASSETS", "SBK"],
      ["310-2000", "SECOND BANK", "310-0000", "CURRENT ASSETS", "SBK"],
      ["410-0000", "ACCRUALS", null, "CURRENT LIABILITIES", null],
      ["411-0000", "ACCRUALS - SALARIES", "410-0000", "CURRENT LIABILITIES", null],
      ["410-0010", "ACCRUALS - SALARY (OFFICE)", "411-0000", "CURRENT LIABILITIES", null],
      ["410-0011", "ACCRUALS - SALARY (SALES)", "411-0000", "CURRENT LIABILITIES", null],
      ["412-0000", "ACCRUALS - EPF", "410-0000", "CURRENT LIABILITIES", null],
      ["440-0000", "DEPOSIT RECEIVED", null, "CURRENT LIABILITIES", null],
      ["900-A001", "ADVERTISING", null, "EXPENSES", null],
      ["900-A002", "ADVERTISING - ONLINE", "900-A001", "EXPENSES", null],
      ["900-A003", "ADVERTISING - OTHERS", "900-A001", "EXPENSES", null],
      ["902-0000", "BANK CHARGES", null, "EXPENSES", null],
    ]);
  });

  it("never reads the report's own heading lines as a section or an account", () => {
    const { rows } = readAutocountChart(items);
    expect(rows.some((r) => /Page|Chart|ADMIN|Currency/i.test(r.name))).toBe(false);
    expect(new Set(rows.map((r) => r.section))).toEqual(
      new Set(["CAPITAL", "CURRENT ASSETS", "CURRENT LIABILITIES", "EXPENSES"]),
    );
  });

  it("says when an account comes before any section line, or twice", () => {
    const { rows, problems } = readAutocountChart([
      ...header(1, 1),
      ...line(1, 650, M, "100-0000 SHARE CAPITAL"),
      ...section(1, 630, "CAPITAL"),
      ...line(1, 610, M, "150-0000 RETAINED EARNING", "SRE"),
      ...line(1, 598, M, "150-0000 RETAINED EARNING", "SRE"),
    ]);
    expect(rows.map((r) => r.code)).toEqual(["150-0000"]);
    expect(problems).toEqual([
      "100-0000 is printed before any section line.",
      "150-0000 is printed twice.",
    ]);
  });

  it("reads a printout without column titles from its last words", () => {
    const { rows } = readAutocountChart([
      ...section(1, 700, "CURRENT", "ASSETS"),
      { page: 1, y: 680, x: M, str: "310-0000" },
      { page: 1, y: 680, x: 150, str: "CASH AT BANK MYR" },
      { page: 1, y: 668, x: I1, str: "310-1000" },
      { page: 1, y: 668, x: 150, str: "FIRST BANK SDN BHD MYR SBK" },
    ]);
    expect(rows.map((r) => [r.code, r.name, r.parentCode, r.special])).toEqual([
      ["310-0000", "CASH AT BANK", null, null],
      ["310-1000", "FIRST BANK SDN BHD", "310-0000", "SBK"],
    ]);
  });
});

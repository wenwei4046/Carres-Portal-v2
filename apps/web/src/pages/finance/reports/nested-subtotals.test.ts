import { describe, expect, it } from "vitest";
import { parseProfitAndLoss } from "./report-queries";
import { statementRows } from "./StatementTable";

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
      "L3 6T14 7",
      "G3 H 6T11 140",
      "L4 6T13 40",
      "L4 6T12 100",
    ]);
    const lines = statementRows(pl.sections).filter((r) => r.kind === "line");
    expect(lines.reduce((t, r) => t + r.amount, 0)).toBe(pl.sections[0]!.total);
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

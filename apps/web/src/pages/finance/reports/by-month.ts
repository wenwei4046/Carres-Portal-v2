/**
 * Reports → By month: one statement, one column per month, the latest month
 * first. Each column is that month's own single-period read (the page makes
 * them), so a month here shows what the statement shows for that month.
 *
 * The rows are `statementRows` over every month at once: an account that
 * moved in any month gets its line, in the chart's order, under every heading
 * with its subtotal, and a month where it did not move shows RM 0.00. Every
 * figure is one the ledger served for that month; this file adds nothing up.
 */
import { isZeroMoney, ledgerKindWord } from "@carres/shared/finance-ledger";
import { fmtMonth } from "@/lib/fmt-date";
import { noOpening, type PackSheet } from "../month-end-pack";
import { statementRows } from "./StatementTable";
import type { StatementGroup, StatementLine, StatementSection } from "./report-queries";

/** The `Months` choice. A read per month, so twelve is also the most reads. */
export const MONTH_CHOICES = [3, 6, 12] as const;
export const MAX_MONTHS = 12;

/** `?plMonths=` · `?bsMonths=`: 3, 6 or 12; anything else is 6. */
export const readMonthCount = (v: string | null): number => MONTH_CHOICES.find((n) => String(n) === v) ?? 6;

/** The last `n` months as YYYY-MM, this month first, never more than twelve. */
export function lastMonths(today: string, n: number): string[] {
  const [y, m] = today.slice(0, 7).split("-").map(Number) as [number, number];
  return Array.from({ length: Math.min(n, MAX_MONTHS) }, (_, i) => new Date(Date.UTC(y, m - 1 - i, 1)).toISOString().slice(0, 7));
}

/** One row of the by-month table: its words, its depth and one amount per
 *  month (null: nothing to print, as for a month before go-live). */
export interface ByMonthLine {
  id: string;
  label: string;
  depth: number;
  /** A section band, a heading or the bottom line: printed in bold, as on the statement. */
  strong: boolean;
  amounts: (number | null)[];
}

/** One statement holding every section, heading and account any month has.
 *  An account keeps a month's non-zero amount when it has one, so
 *  `statementRows` prints its line when it moved in any month. */
function everyMonth(months: readonly (readonly StatementSection[] | null)[]): StatementSection[] {
  const kinds = new Map<string, { s: StatementSection; groups: Map<string, { g: StatementGroup; lines: Map<string, StatementLine> }> }>();
  for (const sections of months) {
    for (const s of sections ?? []) {
      let k = kinds.get(s.kind);
      if (!k) kinds.set(s.kind, (k = { s: { ...s, unclosedResult: null }, groups: new Map() }));
      if (k.s.unclosedResult === null || isZeroMoney(k.s.unclosedResult)) k.s.unclosedResult = s.unclosedResult;
      for (const g of s.groups) {
        let mg = k.groups.get(g.code);
        if (!mg) k.groups.set(g.code, (mg = { g, lines: new Map() }));
        for (const l of g.lines) {
          const had = mg.lines.get(l.code);
          if (!had || isZeroMoney(had.amount)) mg.lines.set(l.code, l);
        }
      }
    }
  }
  return [...kinds.values()].map(({ s, groups }) => ({
    ...s,
    groups: [...groups.values()]
      .map(({ g, lines }) => ({ ...g, lines: [...lines.values()] }))
      .sort((a, b) => a.ordinal - b.ordinal),
  }));
}

/** One month's served figures under the ids `statementRows` gives its rows. */
function servedFigures(sections: readonly StatementSection[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const s of sections) {
    out.set(`${s.kind}:total`, s.total);
    if (s.unclosedResult !== null) out.set(`${s.kind}:unclosed`, s.unclosedResult);
    for (const g of s.groups) {
      out.set(`${s.kind}:group:${g.code}`, g.subtotal);
      for (const l of g.lines) out.set(`${s.kind}:line:${l.code}`, l.amount);
    }
  }
  return out;
}

/**
 * The rows, each section opening with its band and total, then its headings
 * and accounts as the statement prints them. `months` is newest first; null
 * is a month before go-live, whose cells stay empty. `bottom` is the strip
 * under the last row (the Profit and Loss's `Net result`).
 */
export function byMonthLines(
  months: readonly (readonly StatementSection[] | null)[],
  nothing: (section: string) => string,
  bottom: { label: string; amounts: (number | null)[] } | null,
): ByMonthLine[] {
  const figures = months.map((m) => (m ? servedFigures(m) : null));
  // A month the ledger answered: an account it did not serve did not move, so RM 0.00.
  const each = (id: string) => figures.map((f) => (f ? f.get(id) ?? 0 : null));
  const out: ByMonthLine[] = [];
  let section: string | null = null;
  for (const r of statementRows(everyMonth(months))) {
    if (r.section !== section) {
      section = r.section;
      out.push({ id: `${r.section}:total`, label: ledgerKindWord(r.section), depth: 0, strong: true, amounts: each(`${r.section}:total`) });
    }
    switch (r.kind) {
      case "group": out.push({ id: r.id, label: r.name, depth: r.depth, strong: true, amounts: each(r.id) }); break;
      case "line": out.push({ id: r.id, label: `${r.code} ${r.name ?? "Account name not available"}`, depth: r.depth, strong: false, amounts: each(r.id) }); break;
      case "unclosed": out.push({ id: r.id, label: "Net result not yet closed", depth: 1, strong: false, amounts: each(r.id) }); break;
      case "nothing": out.push({ id: r.id, label: nothing(r.section), depth: 1, strong: false, amounts: months.map(() => null) }); break;
    }
  }
  if (bottom) out.push({ id: "bottom", label: bottom.label, depth: 0, strong: true, amounts: bottom.amounts });
  return out;
}

/**
 * Export Excel on the by-month table: the same rows and columns as the screen,
 * numbers as numbers, an empty cell where the screen prints nothing.
 * `heads` are the column words with the year always in them.
 */
export function byMonthExport(
  name: PackSheet["name"],
  months: readonly string[],
  heads: readonly string[],
  lines: readonly ByMonthLine[],
  goLive: string,
  department: string | null,
): { sheet: PackSheet; stem: string } {
  const rows: PackSheet["rows"] = [
    [`${name} by month`],
    ...(department ? [["Department", department]] : []),
    [noOpening(goLive)],
    [],
    ["Account", ...heads],
    // Two spaces per level under the top, as the month-end pack indents.
    ...lines.map((l) => ["  ".repeat(Math.max(l.depth - 1, 0)) + l.label, ...l.amounts.map((a) => a ?? "")]),
  ];
  const span = `${fmtMonth(months[months.length - 1])} to ${fmtMonth(months[0])}`;
  // A department name is typed by a person; keep the characters a file name cannot hold out of it.
  const stem = [`${name} by month`, span, department].filter(Boolean).join(" ").replace(/[\\/:*?"<>|]/g, "-");
  return { sheet: { name, rows }, stem };
}

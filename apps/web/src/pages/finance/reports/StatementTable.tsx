/**
 * One statement as a kit DataTable. Each section (Income, Expense, Asset …)
 * opens with a band carrying the section total. When a section has more than
 * one chart header with entries, each header gets its own line with its
 * subtotal. Then one line per account that moved, each a link to the Journal
 * narrowed to that account and the statement's dates.
 *
 * Every figure printed here is one the ledger summed and the API served.
 * This file adds nothing up.
 */
import { Link } from "react-router-dom";
import { isZeroMoney, ledgerKindWord } from "@carres/shared/finance-ledger";
import Button from "@/components/kit/Button";
import DataTable, { type Column, type GroupRowCell } from "@/components/kit/DataTable";
import Tooltip from "@/components/kit/Tooltip";
import { rm } from "@/lib/format-currency";
import type { StatementLine, StatementSection } from "./report-queries";

// The line under a section where every account is at RM 0.00 (YH, 14 Sep
// 2026). Reports and the month-end pack print the same words.
const NOTHING_IN_PERIOD: Record<string, string> = {
  INCOME: "No income in this period.",
  EXPENSE: "No expenses in this period.",
};
const NOTHING_ON_DAY: Record<string, string> = {
  ASSET: "No assets on this day.",
  LIABILITY: "No liabilities on this day.",
  EQUITY: "No equity on this day.",
};
/** Profit and Loss: `No income in this period.` · `No expenses in this period.` */
export const nothingInPeriod = (section: string): string => NOTHING_IN_PERIOD[section] ?? NOTHING_IN_PERIOD.INCOME!;
/** Balance Sheet: `No assets on this day.` · `No liabilities …` · `No equity …` */
export const nothingOnDay = (section: string): string => NOTHING_ON_DAY[section] ?? NOTHING_ON_DAY.ASSET!;

/** Balance Sheet: money paid before its document, which the ledger books on
 *  the party's own account. Customers who paid before their invoice sit on
 *  receivables (0506); money paid to suppliers before their bill sits on
 *  payables (0507). On the line the money was moved onto (Customer deposits
 *  held, Advances to suppliers) it says what was added; on the line it was
 *  moved off it says what was left out, so that line still reconciles to the
 *  Trial Balance. The database moved it and says whose money it was; this
 *  only says so. Null for any other line, and before 0506 is applied. */
export const paidBeforeInvoiceNote = (line: Pick<StatementLine, "reclassified" | "reclassifiedFor">): string | null => {
  if (line.reclassified === null || isZeroMoney(line.reclassified)) return null;
  const added = line.reclassified > 0;
  const money = rm(Math.abs(line.reclassified));
  switch (line.reclassifiedFor) {
    case "CUSTOMER":
      return added
        ? `Includes ${money} from customers who paid before their invoice.`
        : `Leaves out ${money} that customers paid before their invoice.`;
    case "SUPPLIER":
      return added
        ? `Includes ${money} paid to suppliers before their bill.`
        : `Leaves out ${money} paid to suppliers before their bill.`;
    default:
      return null;
  }
};

export type StatementRow =
  | { id: string; section: string; kind: "group"; name: string; amount: number; depth: number }
  | {
      id: string; section: string; kind: "line"; code: string; name: string | null; amount: number;
      nested: boolean; depth: number; reclassified: number | null; reclassifiedFor: StatementLine["reclassifiedFor"];
    }
  | { id: string; section: string; kind: "unclosed"; amount: number }
  | { id: string; section: string; kind: "nothing" };

/** A header as `headingWalk` reads it: where it sits in the chart, the header
 *  it sits under, and the lines filed directly under it that are to print. */
export interface WalkGroup<L extends { ordinal: number }> {
  code: string;
  parentCode: string | null;
  ordinal: number;
  lines: readonly L[];
}

/**
 * One section's headers and lines in print order. A header line comes first,
 * then everything under it in the chart's order: its own lines and the
 * headers under it mixed together by `ordinal`, as the Chart of accounts
 * lists them, down to any depth (0579). A header with no line anywhere under
 * it is left out, so an empty header prints nothing. When one header holds
 * the whole section and no header sits inside it, no header line prints
 * (`headed` is false) and its lines print flush. The Balance Sheet, the Profit
 * and Loss and the Trial Balance all print through this one walk.
 */
export function headingWalk<G extends WalkGroup<{ ordinal: number }>>(groups: readonly G[]): {
  headed: boolean;
  rows: ({ group: G; depth: number } | { line: G["lines"][number]; depth: number })[];
} {
  type L = G["lines"][number];
  const codes = new Set(groups.map((g) => g.code));
  const children = new Map<string | null, G[]>();
  for (const g of groups) {
    const parent = g.parentCode !== null && codes.has(g.parentCode) ? g.parentCode : null;
    children.set(parent, [...(children.get(parent) ?? []), g]);
  }
  const shown = (g: G): boolean => g.lines.length > 0 || (children.get(g.code) ?? []).some(shown);
  const roots = (children.get(null) ?? []).filter(shown);
  // A header line only earns its place when there is more than one header,
  // or when a header holds headers.
  const headed = roots.length > 1 || groups.some((g) => g.parentCode !== null && codes.has(g.parentCode) && shown(g));
  const rows: ({ group: G; depth: number } | { line: L; depth: number })[] = [];
  const emit = (g: G, depth: number) => {
    if (headed) rows.push({ group: g, depth });
    // Lines and sub-headers in the chart's order. On a statement a
    // sub-header's ordinal is its subtotal row, served right after everything
    // under it, so it sorts against the lines beside it the way the chart does.
    const under: ({ line: L } | { sub: G })[] = [
      ...g.lines.map((line) => ({ line })),
      ...(children.get(g.code) ?? []).filter(shown).map((sub) => ({ sub })),
    ];
    const at = (x: (typeof under)[number]) => ("sub" in x ? x.sub.ordinal : x.line.ordinal);
    for (const x of under.sort((a, b) => at(a) - at(b))) {
      if ("sub" in x) emit(x.sub, depth + 1);
      else rows.push({ line: x.line, depth: headed ? depth + 1 : depth });
    }
  };
  for (const g of roots) emit(g, 1);
  return { headed, rows };
}

/**
 * The rows the table prints, through `headingWalk`. Each header keeps its
 * own subtotal. An account at RM 0.00 is left out, as the Trial Balance
 * does, and so is a header with nothing but RM 0.00 under it. A section where
 * every account is at RM 0.00 keeps its band and gets one line saying so
 * (`No income in this period.`). So even when every section is at zero, the
 * bands stay, and so does the bottom strip under them.
 */
export function statementRows(sections: readonly StatementSection[]): StatementRow[] {
  const out: StatementRow[] = [];
  for (const s of sections) {
    const before = out.length;
    const { headed, rows } = headingWalk(
      s.groups.map((g) => ({ ...g, lines: g.lines.filter((l) => !isZeroMoney(l.amount)) })),
    );
    for (const r of rows) {
      if ("group" in r) {
        const g = r.group;
        out.push({ id: `${s.kind}:group:${g.code}`, section: s.kind, kind: "group", name: g.name ?? g.code, amount: g.subtotal, depth: r.depth });
        continue;
      }
      const l = r.line;
      out.push({
        id: `${s.kind}:line:${l.code}`, section: s.kind, kind: "line", code: l.code, name: l.name,
        amount: l.amount, nested: headed, depth: r.depth,
        reclassified: l.reclassified, reclassifiedFor: l.reclassifiedFor,
      });
    }
    if (s.unclosedResult !== null && !isZeroMoney(s.unclosedResult)) {
      out.push({ id: `${s.kind}:unclosed`, section: s.kind, kind: "unclosed", amount: s.unclosedResult });
    }
    if (out.length === before) out.push({ id: `${s.kind}:nothing`, section: s.kind, kind: "nothing" });
  }
  return out;
}

/** Left padding by depth: a header at depth 1 sits flush, each level in one step. */
const INDENT = ["", "", "pl-4", "pl-8", "pl-12"] as const;
export const indent = (depth: number): string => INDENT[Math.min(depth, INDENT.length - 1)]!;

export default function StatementTable({
  label,
  testId,
  sections,
  loading,
  empty,
  nothing,
  accountHref,
  lineNote,
  bottomLine,
}: {
  /** What the table is, for a screen reader. */
  label: string;
  testId: string;
  sections: readonly StatementSection[];
  loading: boolean;
  /** Shown instead of rows when no statement was served (before go-live). */
  empty: string;
  /** The line under a section band where every account is at RM 0.00, by section kind. */
  nothing: (section: string) => string;
  accountHref: (code: string) => string;
  /** A note about an account, or null for none. It shows in the tooltip of a
   *  small mark after the account name, so the row stays one line. */
  lineNote?: (line: Pick<StatementLine, "code" | "reclassified" | "reclassifiedFor">) => string | null;
  /** The strip under the last row. Null: no strip. */
  bottomLine: { label: string; amount: number } | null;
}) {
  const bySection = new Map(sections.map((s) => [s.kind, s]));
  const rows = statementRows(sections);

  const columns: Column<StatementRow>[] = [
    {
      key: "account",
      label: "Account",
      width: 70,
      cell: (r) => {
        switch (r.kind) {
          case "group":
            return <span className={`font-semibold ${indent(r.depth)}`}>{r.name}</span>;
          case "line": {
            // The account link, then (only when there is a note) a mark that
            // shows the note on hover or keyboard focus. A long name cuts off
            // with "…"; the mark never does.
            const note = lineNote?.(r) ?? null;
            return <span className={`flex items-center ${indent(r.depth)}`}>
              <Link className="min-w-0 truncate underline underline-offset-2" to={accountHref(r.code)}>
                {r.code} {r.name ?? "Account name not available"}
              </Link>
              {note && <Tooltip content={note}>
                <Button variant="ghost" size="sm" icon="help" aria-label={note} />
              </Tooltip>}
            </span>;
          }
          case "unclosed":
            return "Net result not yet closed";
          case "nothing":
            return <span className="text-kit-slate-11">{nothing(r.section)}</span>;
        }
      },
    },
    {
      key: "amount",
      label: "Amount",
      width: 30,
      align: "right",
      numeric: true,
      cell: (r) => {
        if (r.kind === "nothing") return null;
        return r.kind === "group" ? <span className="font-semibold">{rm(r.amount)}</span> : rm(r.amount);
      },
    },
  ];

  const band = (r: StatementRow): readonly GroupRowCell[] => {
    const s = bySection.get(r.section);
    return [
      { content: <span className="font-semibold">{ledgerKindWord(r.section)}</span> },
      { align: "right", content: s ? <span className="font-semibold tabular-nums">{rm(s.total)}</span> : null },
    ];
  };

  return <DataTable
    label={label}
    testId={testId}
    rowTestId={`${testId}-row`}
    rows={loading ? [] : rows}
    columns={columns}
    rowId={(r) => r.id}
    loading={loading}
    empty={empty}
    group={{ keyOf: (r) => r.section, cells: band }}
    totals={bottomLine ? {
      label: bottomLine.label,
      cells: () => [
        { content: <span className="font-semibold">{bottomLine.label}</span> },
        { align: "right", content: <span className="font-semibold tabular-nums">{rm(bottomLine.amount)}</span> },
      ],
    } : undefined}
  />;
}

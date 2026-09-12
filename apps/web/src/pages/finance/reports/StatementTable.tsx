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
import DataTable, { type Column, type GroupRowCell } from "@/components/kit/DataTable";
import { rm } from "@/lib/format-currency";
import type { StatementSection } from "./report-queries";

export type StatementRow =
  | { id: string; section: string; kind: "group"; name: string; amount: number }
  | { id: string; section: string; kind: "line"; code: string; name: string | null; amount: number; nested: boolean }
  | { id: string; section: string; kind: "unclosed"; amount: number }
  | { id: string; section: string; kind: "nothing" };

/**
 * The rows the table prints, in the served order. An account at RM 0.00 is
 * left out, as the Trial Balance does. A section where every account is at
 * RM 0.00 keeps its band and gets one line saying so. At RM 0.00 is not "no
 * entries": entries can cancel out. So even when every section is at zero,
 * the bands stay, and so does the bottom strip under them.
 */
export function statementRows(sections: readonly StatementSection[]): StatementRow[] {
  const out: StatementRow[] = [];
  for (const s of sections) {
    const groups = s.groups
      .map((g) => ({ g, lines: g.lines.filter((l) => !isZeroMoney(l.amount)) }))
      .filter((x) => x.lines.length > 0);
    // A header line only earns its place when there is more than one.
    const headed = groups.length > 1;
    const before = out.length;
    for (const { g, lines } of groups) {
      if (headed) {
        out.push({ id: `${s.kind}:group:${g.code}`, section: s.kind, kind: "group", name: g.name ?? g.code, amount: g.subtotal });
      }
      for (const l of lines) {
        out.push({ id: `${s.kind}:line:${l.code}`, section: s.kind, kind: "line", code: l.code, name: l.name, amount: l.amount, nested: headed });
      }
    }
    if (s.unclosedResult !== null && !isZeroMoney(s.unclosedResult)) {
      out.push({ id: `${s.kind}:unclosed`, section: s.kind, kind: "unclosed", amount: s.unclosedResult });
    }
    if (out.length === before) out.push({ id: `${s.kind}:nothing`, section: s.kind, kind: "nothing" });
  }
  return out;
}

export default function StatementTable({
  label,
  testId,
  sections,
  loading,
  empty,
  nothing,
  accountHref,
  bottomLine,
}: {
  /** What the table is, for a screen reader. */
  label: string;
  testId: string;
  sections: readonly StatementSection[];
  loading: boolean;
  /** Shown instead of rows when no statement was served (before go-live). */
  empty: string;
  /** The line under a section band where every account is at RM 0.00. */
  nothing: string;
  accountHref: (code: string) => string;
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
            return <span className="font-semibold">{r.name}</span>;
          case "line":
            return <span className={`block truncate ${r.nested ? "pl-4" : ""}`}>
              <Link className="underline underline-offset-2" to={accountHref(r.code)}>
                {r.code} {r.name ?? "Account name not available"}
              </Link>
            </span>;
          case "unclosed":
            return "Net result not yet closed";
          case "nothing":
            return <span className="text-kit-slate-11">{nothing}</span>;
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

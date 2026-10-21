/**
 * REPORT DRILL-DOWN (Chew 2026-10-21, docs/finance/MASTER.md §3.6). Under an
 * account line of the Profit and Loss, the Balance Sheet or the Trial Balance,
 * the ledger entries behind it: Date · Entry No · Description · Document ·
 * Party · Amount, for the report's own period or day and its department.
 *
 * ONE ARITHMETIC (Law D). The entries are the General Ledger's own read
 * (`fin_general_ledger` for this one account, through `/report-drill`),
 * checked by the same reader the General Ledger page uses. The statements and
 * the Trial Balance count the same rows (posted entries, `gl_department_lines`
 * for the department, the period's days or every day up to the as-of day).
 * The page only prints each line on the line's own side and adds them up to
 * check: when the entries do not add up to the line's figure, the difference
 * is said in red under them, never hidden.
 */
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import type { ReportDrillAnswer, ReportDrillLine } from "@carres/shared/general-ledger";
import { ledgerDocWord } from "@carres/shared/finance-ledger";
import DataTable, { type Column } from "@/components/kit/DataTable";
import { apiFetch } from "@/lib/api";
import { fmtDate } from "@/lib/fmt-date";
import { rm } from "@/lib/format-currency";
import { departmentSearch } from "../department";
import { ReadFailed } from "../payables/PayablesParts";
import { FINANCE_WIDTH, amountCell } from "../finance-widths";
import { STATEMENT_LINK } from "./StatementTable";

/** What a drill reads: one account, both days included, one department ("" = All). */
export interface DrillScope {
  account: string;
  from: string;
  to: string;
  dept: string;
}

export function reportDrillQuery(scope: DrillScope) {
  const q = new URLSearchParams({ account: scope.account, from: scope.from, to: scope.to, ...departmentSearch(scope.dept) });
  return {
    queryKey: ["finance", "ledger", "report-drill", scope.account, scope.from, scope.to, scope.dept] as const,
    queryFn: () => apiFetch<ReportDrillAnswer>(`/api/finance/ledger/report-drill?${q.toString()}`),
    retry: (count: number, error: unknown) => ![409, 422].includes((error as { status?: number }).status ?? 0) && count < 2,
  };
}

/**
 * Which side the line prints on. `natural`: the account's own (debit for
 * ASSET and EXPENSE), as the statements and the General Ledger's Balance
 * count it. `debit` / `credit`: the side the Trial Balance shows the balance on.
 */
export type DrillSide = "natural" | "debit" | "credit";

const debitSide = (side: DrillSide, kind: string) =>
  side === "natural" ? kind === "ASSET" || kind === "EXPENSE" : side === "debit";
const sen = (n: number) => Math.round(n * 100);

/** One line's amount on the side the report prints, in sen. */
export const drillSen = (l: Pick<ReportDrillLine, "debit" | "credit">, side: DrillSide, kind: string): number =>
  debitSide(side, kind) ? sen(l.debit) - sen(l.credit) : sen(l.credit) - sen(l.debit);

type Row =
  | { id: string; kind: "brought"; amount: number }
  | { id: string; kind: "line"; line: ReportDrillLine; amount: number };

/** The rows a drill prints and what they add up to, in sen. `carried`: the
 *  line counts everything before `from` too (the Balance Sheet and the Trial
 *  Balance read from the ledger's first day, so this is RM 0.00 there). */
export function drillRows(answer: ReportDrillAnswer, side: DrillSide, carried: boolean): { rows: Row[]; sum: number } {
  const b = answer.block;
  if (!b) return { rows: [], sum: 0 };
  const rows: Row[] = [];
  let sum = 0;
  if (carried && sen(b.opening) !== 0) {
    // The opening balance is on the account's own side.
    const opening = (debitSide(side, b.kind) === debitSide("natural", b.kind) ? 1 : -1) * sen(b.opening);
    rows.push({ id: "brought", kind: "brought", amount: opening / 100 });
    sum += opening;
  }
  b.lines.forEach((line, i) => {
    const s = drillSen(line, side, b.kind);
    rows.push({ id: `${line.entryNo}:${i}`, kind: "line", line, amount: s / 100 });
    sum += s;
  });
  return { rows, sum };
}

const partyText = (l: ReportDrillLine) => (l.partyType ? l.partyName ?? "Name not available" : "");

const COLUMNS: readonly Column<Row>[] = [
  { key: "date", label: "Date", width: "110px", cell: (r) => (r.kind === "line" ? fmtDate(r.line.entryDate) : "") },
  { key: "entry", label: "Entry No", width: `${FINANCE_WIDTH.entryNo}px`,
    cell: (r) => (r.kind === "line"
      ? <Link className={STATEMENT_LINK} to={`/finance/ledger?${new URLSearchParams({ entry: r.line.entryNo }).toString()}`}>{r.line.entryNo}</Link>
      : "") },
  { key: "description", label: "Description", width: "auto",
    cell: (r) => (r.kind === "brought" ? <span data-fin-tone="brought">Brought forward</span>
      : <span className="whitespace-normal" title={r.line.description ?? "No memo"}>{r.line.description ?? "No memo"}</span>) },
  { key: "document", label: "Document", width: "170px", cell: (r) => (r.kind === "line" ? ledgerDocWord(r.line.docNo) : "") },
  { key: "party", label: "Party", width: `${FINANCE_WIDTH.party}px`,
    cell: (r) => (r.kind === "line" ? <span className="whitespace-normal">{partyText(r.line)}</span> : "") },
  { key: "amount", label: "Amount", width: `${FINANCE_WIDTH.amount}px`, align: "right", numeric: true, cell: (r) => amountCell(r.amount) },
];

export default function ReportDrill({ scope, label, side, expected, carried, empty, testId }: {
  scope: DrillScope;
  /** The account, for a screen reader: `{code} {name}`. */
  label: string;
  side: DrillSide;
  /** The figure the report prints on the line. */
  expected: number;
  carried: boolean;
  /** Shown when the account has no entry in the scope. */
  empty: string;
  testId: string;
}) {
  const query = useQuery(reportDrillQuery(scope));
  if (query.isError) return <ReadFailed what="The General Ledger" onRetry={() => void query.refetch()} />;
  if (!query.data) return <p className="text-body" role="status">Loading the General Ledger…</p>;
  const { rows, sum } = drillRows(query.data, side, carried);
  const differs = sum !== sen(expected);
  return <div className="flex flex-col gap-2" data-testid={testId}>
    <DataTable label={label} testId={`${testId}-table`} rowTestId={`${testId}-row`} rows={rows} columns={COLUMNS}
      rowId={(r) => r.id} empty={empty} />
    {differs && <p role="alert" className="text-body text-kit-red-11" data-testid={`${testId}-differs`}>
      Entries add up to {rm(sum / 100)}; the line shows {rm(expected)}.
    </p>}
  </div>;
}

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
import type { StatementLine } from "./report-queries";

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
  | { id: string; kind: "line"; line: ReportDrillLine; amount: number }
  | { id: string; kind: "moved"; text: string; amount: number };

/** A row under the entries for money the Balance Sheet moves onto or off the
 *  line, on the line's own side: `Moved to {line}` / `Moved from {line}`. */
export interface DrillMove {
  id: string;
  text: string;
  amount: number;
}

/** A Balance Sheet line, as the moves read it: its account, name and the
 *  amount the database moved (`reclassified`, 0506 / 0507). */
export type MoveLine = Pick<StatementLine, "code" | "name" | "reclassified" | "reclassifiedFor">;

/**
 * Chew 2026-10-21: the money paid before its document that the Balance Sheet
 * moves (0506 customers onto Customer deposits held, 0507 suppliers onto
 * Advances to suppliers) is shown as rows under the drilled entries, so the
 * entries and the moves add up to the line. The amounts are the report's own,
 * `reclassified` as gl_balance_sheet served it: the database prints a line it
 * moved money off as its booked balance less the (negative) moved amount, and
 * the line it moved money onto as its booked balance plus it. So on the line
 * the money leaves, the row is `-reclassified`; on the line it reaches, one row
 * per line it came from, each that line's `-reclassified`. Stock (0688) does
 * not drill and has no move rows.
 */
export function balanceSheetMoves(line: MoveLine, lines: readonly MoveLine[]): DrillMove[] {
  const r = line.reclassified;
  const whose = line.reclassifiedFor;
  if (r === null || sen(r) === 0 || (whose !== "CUSTOMER" && whose !== "SUPPLIER")) return [];
  const same = lines.filter((l) => l.reclassifiedFor === whose && l.reclassified !== null && sen(l.reclassified) !== 0);
  const word = (l: MoveLine) => l.name ?? l.code;
  if (r < 0) {
    // The money leaves this line; it lands on the one line it was added to.
    const to = same.find((l) => l.reclassified! > 0);
    return to ? [{ id: `moved:${to.code}`, text: `Moved to ${word(to)}`, amount: -sen(r) / 100 }] : [];
  }
  return same.filter((l) => l.reclassified! < 0)
    .map((from) => ({ id: `moved:${from.code}`, text: `Moved from ${word(from)}`, amount: -sen(from.reclassified!) / 100 }));
}

/** The rows a drill prints and what they add up to, in sen. `carried`: the
 *  line counts everything before `from` too (the Balance Sheet and the Trial
 *  Balance read from the ledger's first day, so this is RM 0.00 there). */
export function drillRows(answer: ReportDrillAnswer, side: DrillSide, carried: boolean,
  moves: readonly DrillMove[] = []): { rows: Row[]; sum: number } {
  const b = answer.block;
  const rows: Row[] = [];
  let sum = 0;
  const addMoves = () => {
    for (const m of moves) {
      rows.push({ id: m.id, kind: "moved", text: m.text, amount: m.amount });
      sum += sen(m.amount);
    }
  };
  if (!b) {
    addMoves();
    return { rows, sum };
  }
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
  addMoves();
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
      : r.kind === "moved" ? <span data-fin-tone="brought" className="whitespace-normal">{r.text}</span>
      : <span className="whitespace-normal" title={r.line.description ?? "No memo"}>{r.line.description ?? "No memo"}</span>) },
  { key: "document", label: "Document", width: "170px", cell: (r) => (r.kind === "line" ? ledgerDocWord(r.line.docNo) : "") },
  { key: "party", label: "Party", width: `${FINANCE_WIDTH.party}px`,
    cell: (r) => (r.kind === "line" ? <span className="whitespace-normal">{partyText(r.line)}</span> : "") },
  { key: "amount", label: "Amount", width: `${FINANCE_WIDTH.amount}px`, align: "right", numeric: true, cell: (r) => amountCell(r.amount) },
];

export default function ReportDrill({ scope, label, side, expected, carried, empty, testId, moves }: {
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
  /** Balance Sheet: the money it moved onto or off this line (`balanceSheetMoves`). */
  moves?: readonly DrillMove[];
}) {
  const query = useQuery(reportDrillQuery(scope));
  if (query.isError) return <ReadFailed what="The General Ledger" onRetry={() => void query.refetch()} />;
  if (!query.data) return <p className="text-body" role="status">Loading the General Ledger…</p>;
  const { rows, sum } = drillRows(query.data, side, carried, moves);
  const differs = sum !== sen(expected);
  // The fixed columns take 868px; on a narrow screen the table scrolls sideways
  // rather than squeezing Description (the one `auto` column) to nothing.
  return <div className="flex flex-col gap-2 [&_table]:min-w-[1090px]" data-testid={testId}>
    <DataTable label={label} testId={`${testId}-table`} rowTestId={`${testId}-row`} rows={rows} columns={COLUMNS}
      rowId={(r) => r.id} empty={empty} />
    {differs && <p role="alert" className="text-body text-kit-red-11" data-testid={`${testId}-differs`}>
      Entries add up to {rm(sum / 100)}; the line shows {rm(expected)}.
    </p>}
  </div>;
}

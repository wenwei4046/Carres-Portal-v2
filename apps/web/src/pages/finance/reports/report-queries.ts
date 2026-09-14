/**
 * The Profit and Loss and the Balance Sheet, read from the ledger's own
 * statement functions (gl_profit_and_loss and gl_balance_sheet, migration
 * 0469) through the ledger API. Since 0506 the Balance Sheet shows customers
 * who paid before their invoice under 2210 instead of as negative receivables;
 * the database does that move too.
 *
 * The database does every sum. This file only checks that the rows arrived
 * whole and files each one where the page prints it. If anything is missing
 * or doubled, the whole report is refused: a total that did not arrive must
 * never print as RM 0.00.
 */
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";

export const PL_SECTIONS = ["INCOME", "EXPENSE"] as const;
export const BS_SECTIONS = ["ASSET", "LIABILITY", "EQUITY"] as const;

/** One account and the amount the ledger summed for it. `reclassified` is
 *  what the Balance Sheet moved onto (plus) or off (minus) this line from
 *  customers who paid before their invoice (0506); the move is already inside
 *  `amount`. Null when nothing was moved, or before 0506 is applied. */
export interface StatementLine {
  code: string;
  name: string | null;
  amount: number;
  reclassified: number | null;
}

/** The accounts under one chart header, and the subtotal the ledger served. */
export interface StatementGroup {
  code: string;
  name: string | null;
  subtotal: number;
  lines: StatementLine[];
}

/** Income, Expense, Asset, Liability or Equity, with its served total.
 *  `unclosedResult` is the Balance Sheet's income less expense not yet
 *  closed to equity; it is already inside the Equity total. */
export interface StatementSection {
  kind: string;
  total: number;
  groups: StatementGroup[];
  unclosedResult: number | null;
}

export type ProfitAndLoss =
  | { status: "before_go_live"; goLiveOn: string; from: string; to: string }
  | { status: "ok"; goLiveOn: string; from: string; to: string; sections: StatementSection[]; net: number };

export type BalanceSheet =
  | { status: "before_go_live"; goLiveOn: string; asOf: string }
  | {
      status: "ok";
      goLiveOn: string;
      asOf: string;
      sections: StatementSection[];
      /** The database's own check: assets = liabilities + equity. */
      balances: boolean;
      difference: number;
    };

/** The rows arrived, but not as a whole report. Never retried: asking again
 *  gets the same rows. */
export class UnreadableReport extends Error {
  constructor(what: string) {
    super(`${what} could not be loaded. Try again.`);
    this.name = "UnreadableReport";
  }
}

const PL_WHAT = "The profit and loss";
const BS_WHAT = "The balance sheet";

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
const DECIMAL = /^-?\d+(\.\d+)?$/;

type Raw = Record<string, unknown>;
type Fail = () => UnreadableReport;

function rowsOf(body: unknown, bad: Fail): Raw[] {
  const rows = (body as { rows?: unknown } | null)?.rows;
  if (!Array.isArray(rows) || rows.length === 0) throw bad();
  if (!rows.every((r) => r !== null && typeof r === "object" && !Array.isArray(r))) throw bad();
  return rows as Raw[];
}

/** A value every row carries alike: the status, the dates, the check. */
function sameOnEveryRow(rows: Raw[], key: string, bad: Fail): unknown {
  const first = rows[0]![key];
  if (!rows.every((r) => r[key] === first)) throw bad();
  return first;
}

function isoDay(v: unknown, bad: Fail): string {
  if (typeof v !== "string" || !ISO_DAY.test(v)) throw bad();
  return v;
}

/** PostgREST sends numeric as a JSON number. A null or anything else is
 *  refused, never read as zero. */
function money(v: unknown, bad: Fail): number {
  const n = typeof v === "number" ? v : typeof v === "string" && DECIMAL.test(v) ? Number(v) : NaN;
  if (!Number.isFinite(n)) throw bad();
  return n;
}

function code(v: unknown, bad: Fail): string {
  if (typeof v !== "string" || v === "") throw bad();
  return v;
}

function nameOf(v: unknown, bad: Fail): string | null {
  if (v === null || v === undefined) return null;
  if (typeof v !== "string") throw bad();
  return v;
}

/** In the database's own order. `ordinal` is its row number. */
function inOrder(rows: Raw[], bad: Fail): Raw[] {
  if (!rows.every((r) => Number.isInteger(r.ordinal))) throw bad();
  const sorted = [...rows].sort((a, b) => (a.ordinal as number) - (b.ordinal as number));
  for (let i = 1; i < sorted.length; i += 1) {
    if (sorted[i]!.ordinal === sorted[i - 1]!.ordinal) throw bad();
  }
  return sorted;
}

interface Draft {
  kind: string;
  total: number | null;
  groups: Map<string, { code: string; name: string | null; subtotal: number | null; lines: StatementLine[] }>;
  unclosedResult: number | null;
}

/**
 * Files the account, subtotal and total rows under their sections, and hands
 * back the closing rows (the P&L's NET, the Balance Sheet's EQUATION) for the
 * caller to check. `derived` allows the Balance Sheet's one unclosed-result
 * row inside Equity.
 */
function readBody(
  rows: Raw[],
  sectionKinds: readonly string[],
  closingKind: "NET" | "EQUATION",
  derived: boolean,
  bad: Fail,
): { sections: StatementSection[]; closing: Raw[]; derivedRows: number } {
  const drafts = new Map<string, Draft>();
  const closing: Raw[] = [];
  let derivedRows = 0;

  const section = (kind: unknown): Draft => {
    if (typeof kind !== "string" || !sectionKinds.includes(kind)) throw bad();
    let d = drafts.get(kind);
    if (!d) {
      d = { kind, total: null, groups: new Map(), unclosedResult: null };
      drafts.set(kind, d);
    }
    return d;
  };
  const group = (d: Draft, r: Raw) => {
    const hdr = code(r.header_code, bad);
    let g = d.groups.get(hdr);
    if (!g) {
      g = { code: hdr, name: nameOf(r.header_name, bad), subtotal: null, lines: [] };
      d.groups.set(hdr, g);
    }
    return g;
  };

  for (const r of rows) {
    switch (r.row_kind) {
      case "ACCOUNT": {
        const g = group(section(r.section), r);
        g.lines.push({
          code: code(r.account_code, bad),
          name: nameOf(r.account_name, bad),
          amount: money(r.amount, bad),
          // Absent before 0506, and on the Profit and Loss.
          reclassified: r.reclassified === undefined || r.reclassified === null ? null : money(r.reclassified, bad),
        });
        break;
      }
      case "HEADER_SUBTOTAL": {
        const g = group(section(r.section), r);
        if (g.subtotal !== null) throw bad();
        g.subtotal = money(r.amount, bad);
        break;
      }
      case "SECTION_TOTAL": {
        const d = section(r.section);
        if (d.total !== null) throw bad();
        d.total = money(r.amount, bad);
        break;
      }
      case "DERIVED": {
        if (!derived || r.section !== "EQUITY") throw bad();
        const d = section(r.section);
        if (d.unclosedResult !== null) throw bad();
        d.unclosedResult = money(r.amount, bad);
        derivedRows += 1;
        break;
      }
      default:
        if (r.row_kind !== closingKind) throw bad();
        closing.push(r);
    }
  }

  const sections: StatementSection[] = [];
  for (const d of drafts.values()) {
    if (d.total === null || d.groups.size === 0) throw bad();
    const groups: StatementGroup[] = [];
    for (const g of d.groups.values()) {
      if (g.subtotal === null || g.lines.length === 0) throw bad();
      groups.push({ code: g.code, name: g.name, subtotal: g.subtotal, lines: g.lines });
    }
    sections.push({ kind: d.kind, total: d.total, groups, unclosedResult: d.unclosedResult });
  }
  return { sections, closing, derivedRows };
}

export function parseProfitAndLoss(body: unknown, from: string, to: string): ProfitAndLoss {
  const bad = () => new UnreadableReport(PL_WHAT);
  const rows = rowsOf(body, bad);
  const status = sameOnEveryRow(rows, "report_status", bad);
  const goLiveOn = isoDay(sameOnEveryRow(rows, "go_live_on", bad), bad);
  // The period the database answered for must be the one asked for.
  if (sameOnEveryRow(rows, "period_from", bad) !== from) throw bad();
  if (sameOnEveryRow(rows, "period_to", bad) !== to) throw bad();

  if (status === "BEFORE_GO_LIVE") {
    if (rows.length !== 1 || rows[0]!.row_kind !== "NOTICE") throw bad();
    return { status: "before_go_live", goLiveOn, from, to };
  }
  if (status !== "OK") throw bad();

  const { sections, closing } = readBody(inOrder(rows, bad), PL_SECTIONS, "NET", false, bad);
  if (closing.length !== 1 || closing[0]!.section !== "NET") throw bad();
  return { status: "ok", goLiveOn, from, to, sections, net: money(closing[0]!.amount, bad) };
}

export function parseBalanceSheet(body: unknown, asOf: string): BalanceSheet {
  const bad = () => new UnreadableReport(BS_WHAT);
  const rows = rowsOf(body, bad);
  const status = sameOnEveryRow(rows, "report_status", bad);
  const goLiveOn = isoDay(sameOnEveryRow(rows, "go_live_on", bad), bad);
  if (sameOnEveryRow(rows, "as_of", bad) !== asOf) throw bad();

  if (status === "BEFORE_GO_LIVE") {
    if (rows.length !== 1 || rows[0]!.row_kind !== "NOTICE") throw bad();
    return { status: "before_go_live", goLiveOn, asOf };
  }
  if (status !== "OK") throw bad();

  const balances = sameOnEveryRow(rows, "equation_balances", bad);
  if (typeof balances !== "boolean") throw bad();
  const served = money(sameOnEveryRow(rows, "equation_difference", bad), bad);

  const { sections, closing, derivedRows } = readBody(inOrder(rows, bad), BS_SECTIONS, "EQUATION", true, bad);
  if (derivedRows !== 1 || closing.length !== 1 || closing[0]!.section !== "CHECK") throw bad();
  const difference = money(closing[0]!.amount, bad);
  if (difference !== served) throw bad();
  return { status: "ok", goLiveOn, asOf, sections, balances, difference };
}

export const reportKeys = {
  // Under the ledger's own key, so anything that refreshes the ledger
  // refreshes these too.
  profitAndLoss: (from: string, to: string) => ["finance", "ledger", "profit-and-loss", from, to] as const,
  balanceSheet: (asOf: string) => ["finance", "ledger", "balance-sheet", asOf] as const,
};

/** One more try for a failed request. None for a ledger with no start date
 *  (409), a date the server refused (422) or rows that did not add up:
 *  asking again gets the same answer. */
function retryOnce(failures: number, error: unknown): boolean {
  if (error instanceof UnreadableReport) return false;
  const status = (error as { status?: number } | null)?.status;
  if (status === 409 || status === 422) return false;
  return failures < 1;
}

/** The Profit and Loss read, as options — Reports and the Dashboard's month-end pack share it. */
export function profitAndLossQuery(from: string, to: string) {
  return {
    queryKey: reportKeys.profitAndLoss(from, to),
    queryFn: async () => parseProfitAndLoss(
      await apiFetch<unknown>(`/api/finance/ledger/profit-and-loss?${new URLSearchParams({ from, to }).toString()}`),
      from,
      to,
    ),
    retry: retryOnce,
  };
}

/** The Balance Sheet read, as options — Reports and the Dashboard's month-end pack share it. */
export function balanceSheetQuery(asOf: string) {
  return {
    queryKey: reportKeys.balanceSheet(asOf),
    queryFn: async () => parseBalanceSheet(
      await apiFetch<unknown>(`/api/finance/ledger/balance-sheet?${new URLSearchParams({ asOf }).toString()}`),
      asOf,
    ),
    retry: retryOnce,
  };
}

export function useProfitAndLoss(from: string, to: string) {
  return useQuery(profitAndLossQuery(from, to));
}

export function useBalanceSheet(asOf: string) {
  return useQuery(balanceSheetQuery(asOf));
}

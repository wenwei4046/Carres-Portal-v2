/**
 * The month-end pack — one Excel workbook with three sheets: the Trial
 * Balance, the Profit and Loss and the Balance Sheet for one month.
 *
 * Each sheet is read through the SAME query its own page uses (the Trial
 * Balance page, and Reports), and laid out from the same rows the page prints
 * (`statementRows` for the two statements, `trialBalanceLines` for the Trial
 * Balance). This file adds nothing up that a page does not already show.
 *
 * The workbook is written with `xlsx`, the library every list page's
 * `Export Excel` already uses; Reports → Payment writes its multi-sheet
 * workbook the same way.
 */
import type { QueryClient } from "@tanstack/react-query";
import type { TrialBalanceReport } from "@carres/shared/finance-ledger";
import { ledgerKindWord } from "@carres/shared/finance-ledger";
import { fmtDate, fmtMonth } from "@/lib/fmt-date";
import { trialBalanceQuery } from "./ledger/ledger-queries";
import { trialBalanceLabel, trialBalanceLines } from "./ledger/LedgerTrialBalance";
import { nothingInPeriod, nothingOnDay, paidBeforeInvoiceNote, statementRows } from "./reports/StatementTable";
import {
  balanceSheetQuery,
  profitAndLossQuery,
  type BalanceSheet,
  type ProfitAndLoss,
  type StatementLine,
  type StatementSection,
} from "./reports/report-queries";

type Cell = string | number;
export interface PackSheet {
  name: "Trial Balance" | "Profit and Loss" | "Balance Sheet";
  rows: Cell[][];
}

const pad = (n: number) => String(n).padStart(2, "0");

/** The last day of a YYYY-MM month. */
export function monthEnd(ym: string): string {
  const [y, m] = ym.split("-").map(Number) as [number, number];
  return `${ym}-${pad(new Date(Date.UTC(y, m, 0)).getUTCDate())}`;
}

function previousMonth(ym: string): string {
  const [y, m] = ym.split("-").map(Number) as [number, number];
  return m === 1 ? `${y - 1}-12` : `${y}-${pad(m - 1)}`;
}

function nextMonth(ym: string): string {
  const [y, m] = ym.split("-").map(Number) as [number, number];
  return m === 12 ? `${y + 1}-01` : `${y}-${pad(m + 1)}`;
}

/**
 * The month the pack opens on: the last complete month — unless that month
 * ended before the ledger started, when there is nothing in it and the pack
 * opens on this month instead.
 */
export function defaultPackMonth(today: string, goLive: string | null): string {
  const last = previousMonth(today.slice(0, 7));
  return goLive && monthEnd(last) < goLive ? today.slice(0, 7) : last;
}

/**
 * Every month from the ledger's first to this one, newest first. Without a
 * go-live date (not read yet), this month and the last; always at least this
 * month, so the month the pack opens on is always one of the choices.
 */
export function packMonths(today: string, goLive: string | null): string[] {
  const last = today.slice(0, 7);
  const out: string[] = [];
  let ym = goLive ? goLive.slice(0, 7) : previousMonth(last);
  if (ym > last) ym = last;
  for (let i = 0; ym <= last && i < 600; i += 1) {
    out.push(ym);
    ym = nextMonth(ym);
  }
  return out.reverse();
}

/** The month's period: its first day to its last, or to today while the month is still running. */
export function packPeriod(ym: string, today: string): { from: string; to: string } {
  const end = monthEnd(ym);
  return { from: `${ym}-01`, to: end > today ? today : end };
}

// A workbook is filed and re-read in a later year, so its dates always carry the year (fmt-date's document option).
const day = (iso: string) => fmtDate(iso, { year: "always" });
const beforeGoLive =(goLive: string) => `The ledger started on ${day(goLive)}. Pick a day from then on.`;
const noOpening = (goLive: string) => `Since ${day(goLive)} · No opening balances`;

export function trialBalanceSheet(tb: TrialBalanceReport): PackSheet {
  const head: Cell[][] = [["Trial Balance", `As of ${day(tb.as_of)}`], [noOpening(tb.go_live_on)], []];
  if (tb.status === "before_go_live") return { name: "Trial Balance", rows: [...head, [beforeGoLive(tb.go_live_on)]] };
  // The rows the page's Export Excel writes: headings by name with their Debit
  // and Credit left empty, and the accounts anything was posted to, so adding
  // up a column counts each account once and matches the Total line.
  const lines = trialBalanceLines(tb);
  const sum = (side: "debit" | "credit") =>
    Math.round(lines.reduce((s, r) => (r.heading ? s : s + r[side]), 0) * 100) / 100;
  return {
    name: "Trial Balance",
    rows: [
      ...head,
      ["Account", "Kind", "Debit", "Credit"],
      ...lines.map((r) => [trialBalanceLabel(r), ledgerKindWord(r.kind), r.heading ? "" : r.debit, r.heading ? "" : r.credit]),
      ["Total", "", sum("debit"), sum("credit")],
    ],
  };
}

function statementBody(
  sections: readonly StatementSection[],
  nothing: (section: string) => string,
  lineNote: (line: Pick<StatementLine, "reclassified" | "reclassifiedFor">) => string | null = () => null,
): Cell[][] {
  const bySection = new Map(sections.map((s) => [s.kind, s]));
  const out: Cell[][] = [["Account", "Amount"]];
  let section: string | null = null;
  for (const r of statementRows(sections)) {
    if (r.section !== section) {
      section = r.section;
      out.push([ledgerKindWord(r.section), bySection.get(r.section)?.total ?? ""]);
    }
    switch (r.kind) {
      // Two spaces per level under the top, so a heading inside a heading reads as nested (0579).
      case "group": out.push(["  ".repeat(r.depth - 1) + r.name, r.amount]); break;
      case "line": {
        out.push(["  ".repeat(r.depth - 1) + `${r.code} ${r.name ?? "Account name not available"}`, r.amount]);
        // The note the page shows in the tooltip next to the account, as a row of its own under it.
        const note = lineNote(r);
        if (note) out.push([note]);
        break;
      }
      case "unclosed": out.push(["Net result not yet closed", r.amount]); break;
      case "nothing": out.push([nothing(r.section)]); break;
    }
  }
  return out;
}

export function profitAndLossSheet(pl: ProfitAndLoss): PackSheet {
  const head: Cell[][] = [["Profit and Loss", `${day(pl.from)} to ${day(pl.to)}`], [noOpening(pl.goLiveOn)], []];
  if (pl.status === "before_go_live") return { name: "Profit and Loss", rows: [...head, [beforeGoLive(pl.goLiveOn)]] };
  return {
    name: "Profit and Loss",
    rows: [...head, ...statementBody(pl.sections, nothingInPeriod), ["Net result", pl.net]],
  };
}

export function balanceSheetSheet(bs: BalanceSheet): PackSheet {
  const head: Cell[][] = [["Balance Sheet", `As of ${day(bs.asOf)}`], [noOpening(bs.goLiveOn)], []];
  if (bs.status === "before_go_live") return { name: "Balance Sheet", rows: [...head, [beforeGoLive(bs.goLiveOn)]] };
  const rows = [...head, ...statementBody(bs.sections, nothingOnDay, paidBeforeInvoiceNote)];
  if (!bs.balances) rows.push([`Assets differ from liabilities plus equity by`, Math.abs(bs.difference)]);
  return { name: "Balance Sheet", rows };
}

/** The file name: `Month-end pack Aug 2026.xlsx`. */
export const packFileName = (ym: string) => `Month-end pack ${fmtMonth(ym)}.xlsx`;

/**
 * Reads the three reports for the month (from the cache when a page already
 * read them) and writes one workbook. Throws when any read fails, so the
 * caller says so instead of writing a pack with a sheet missing.
 */
export async function exportMonthEndPack(qc: QueryClient, ym: string, today: string): Promise<PackSheet[]> {
  const { from, to } = packPeriod(ym, today);
  const [tb, pl, bs] = await Promise.all([
    qc.fetchQuery(trialBalanceQuery(to)),
    qc.fetchQuery(profitAndLossQuery(from, to)),
    qc.fetchQuery(balanceSheetQuery(to)),
  ]);
  const sheets = [trialBalanceSheet(tb), profitAndLossSheet(pl), balanceSheetSheet(bs)];
  const XLSX = await import("xlsx");
  const wb = XLSX.utils.book_new();
  for (const s of sheets) XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(s.rows), s.name);
  XLSX.writeFile(wb, packFileName(ym));
  return sheets;
}

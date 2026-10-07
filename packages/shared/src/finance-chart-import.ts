/**
 * Reading AutoCount's printed chart of accounts (Finance → Settings → Chart of
 * accounts → Import from AutoCount, migration 0655).
 *
 * AutoCount prints the chart as a report: a bold section line (CAPITAL, CURRENT
 * ASSETS, EXPENSES ...), then one line per account with its number, its
 * description, the currency and, for some, a special account type (SBK bank,
 * SDC debtor control ...). An account under another is printed indented: the
 * number starts further right. Nothing else says which account is the parent.
 *
 * This file turns the text a PDF reader returns (each piece of text with the
 * page and the x/y it sits at) into rows: number, name, the account it sits
 * under, and its section. It does not decide anything about the chart:
 * gl_chart_import (0655) maps each section to a kind and a top heading,
 * refuses what does not fit, and writes. The rows are sent as read, so the
 * database stays the one place that says what an import would do.
 *
 * PURE: no PDF library, no I/O. The screen extracts the text; tests feed it
 * text directly.
 */

/** One piece of text on a page, as the PDF reader places it. `x` grows to the
 *  right; `y` grows UP the page, so a lower line has a smaller `y`. */
export interface ChartPdfItem {
  page: number;
  x: number;
  y: number;
  str: string;
}

/** One account as the report prints it. `parentCode` is the account it is
 *  printed under, or null for an account at the left margin of its section. */
export interface ChartImportRow {
  code: string;
  name: string;
  parentCode: string | null;
  section: string;
  special: string | null;
}

export interface ChartReadResult {
  rows: ChartImportRow[];
  /** Lines that could not be read as an account, in plain words. */
  problems: string[];
}

/** AutoCount's numbers, and the four-digit ones the ledger started with. */
export const CHART_IMPORT_CODE = /^([0-9]{4}|[0-9]{3}-[0-9A-Z][0-9]{3})$/;

/** A section line is capital letters and spaces only (CURRENT ASSETS,
 *  EXTRA-ORDINARY INCOME); the report's own heading lines all carry a digit,
 *  a colon or a small letter, so they never look like one. */
const SECTION_LINE = /^[A-Z][A-Z &'/-]*[A-Z]$/;

/** Pieces of text on one line sit within this many points of each other. */
const SAME_LINE = 2;
/** Two numbers are at the same indent when they start this close together. */
const SAME_INDENT = 3;

interface Line {
  page: number;
  y: number;
  cells: ChartPdfItem[];
}

function linesOf(items: ChartPdfItem[]): Line[] {
  const sorted = items
    .filter((i) => i.str.trim() !== "")
    .slice()
    .sort((a, b) => a.page - b.page || b.y - a.y || a.x - b.x);
  const lines: Line[] = [];
  for (const it of sorted) {
    const last = lines[lines.length - 1];
    if (last && last.page === it.page && Math.abs(last.y - it.y) <= SAME_LINE) last.cells.push(it);
    else lines.push({ page: it.page, y: it.y, cells: [it] });
  }
  for (const l of lines) l.cells.sort((a, b) => a.x - b.x);
  return lines;
}

/** The x where the Description and Currency columns start, read from the
 *  report's own column titles when it prints them. */
function columnsOf(lines: Line[]): { desc: number | null; currency: number | null } {
  for (const l of lines) {
    const desc = l.cells.find((c) => c.str.trim() === "Description");
    const currency = l.cells.find((c) => c.str.trim() === "Currency");
    if (desc && currency) return { desc: desc.x, currency: currency.x };
  }
  return { desc: null, currency: null };
}

const words = (cells: ChartPdfItem[]) =>
  cells.map((c) => c.str.trim()).filter(Boolean).join(" ").replace(/\s+/g, " ").trim();

export function readAutocountChart(items: ChartPdfItem[]): ChartReadResult {
  const lines = linesOf(items);
  const cols = columnsOf(lines);
  const problems: string[] = [];

  // Every indent the report uses, left to right: the first is the margin.
  const indents: number[] = [];
  for (const l of lines) {
    const first = l.cells[0];
    if (!first || !CHART_IMPORT_CODE.test(first.str.trim())) continue;
    if (!indents.some((x) => Math.abs(x - first.x) <= SAME_INDENT)) indents.push(first.x);
  }
  indents.sort((a, b) => a - b);
  const levelOf = (x: number) => {
    const i = indents.findIndex((v) => Math.abs(v - x) <= SAME_INDENT);
    return i < 0 ? 0 : i;
  };

  const rows: ChartImportRow[] = [];
  const seen = new Set<string>();
  let section: string | null = null;
  /** The account last printed at each indent of the current section. */
  let stack: (string | undefined)[] = [];

  for (const l of lines) {
    const first = l.cells[0];
    if (!first) continue;
    const head = first.str.trim().toUpperCase();

    if (CHART_IMPORT_CODE.test(head)) {
      const rest = l.cells.slice(1);
      let nameCells: ChartPdfItem[];
      let special: string | null = null;
      if (cols.desc !== null && cols.currency !== null) {
        const currencyX = cols.currency;
        nameCells = rest.filter((c) => c.x < currencyX - 2);
        // The special type sits well right of the currency (SBK, SDC ...).
        const after = rest.filter((c) => c.x > currencyX + 30);
        special = after.length ? words(after) : null;
      } else {
        // No column titles: the currency and the special type are the last
        // one or two words. The special type always starts with S.
        const tokens = rest.flatMap((c) => c.str.trim().split(/\s+/)).filter(Boolean);
        if (tokens.length >= 3 && /^S[A-Z]{2}$/.test(tokens[tokens.length - 1]!) && /^[A-Z]{3}$/.test(tokens[tokens.length - 2]!)) {
          special = tokens.pop()!;
        }
        if (tokens.length >= 2 && /^[A-Z]{3}$/.test(tokens[tokens.length - 1]!)) tokens.pop();
        nameCells = tokens.map((str) => ({ page: l.page, x: 0, y: l.y, str }));
      }
      const name = words(nameCells);
      if (!section) {
        problems.push(`${head} is printed before any section line.`);
        continue;
      }
      if (!name) {
        problems.push(`${head} has no name.`);
        continue;
      }
      if (seen.has(head)) {
        problems.push(`${head} is printed twice.`);
        continue;
      }
      seen.add(head);
      const level = levelOf(first.x);
      // An account hangs under the nearest shallower account printed above it
      // in the same section, even when the report skips an indent.
      let parentCode: string | null = null;
      for (let i = level - 1; i >= 0; i--) {
        const above = stack[i];
        if (above) {
          parentCode = above;
          break;
        }
      }
      stack = stack.slice(0, level);
      stack[level] = head;
      rows.push({ code: head, name, parentCode, section, special });
      continue;
    }

    const text = words(l.cells);
    if (SECTION_LINE.test(text)) {
      section = text;
      stack = [];
    }
  }

  return { rows, problems };
}

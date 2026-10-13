/**
 * Finance's column widths (Chew 2026-10-13, the Finance look). A Finance table
 * no longer stretches to its card, so each column is the width of what it
 * holds: an amount fits RM 1,234,567.89 in the footer's bold, a code fits
 * `400-A001`, and a name or a party wraps rather than being cut. A width
 * belongs to the field, so every Finance page prints the same fact the same
 * width; a value that clips is fixed here, once.
 */
import { rm } from "@/lib/format-currency";

export const FINANCE_WIDTH = {
  /** An amount, right aligned: `RM 1,234,567.89` in 13px tabular figures. */
  amount: 128,
  /** An account or party code: `310-2000`, `400-A001`. */
  code: 96,
  /** An account's name; it wraps. */
  account: 220,
  /** A supplier, customer or other party; it wraps. */
  party: 260,
} as const;

/**
 * The Finance look's amount cell (Chew 2026-10-13): a zero, to the cent, is a
 * blank cell, so the figures that hold money stand out; any other figure
 * prints in RM. An absent figure is blank too. Only the screen: a sort, a
 * filter, a footer total or an export keeps the number.
 */
export function amountCell(v: number | string | null | undefined): string {
  if (v === null || v === undefined || v === "") return "";
  const n = Number(v);
  return !Number.isFinite(n) || Math.round(n * 100) === 0 ? "" : rm(n);
}

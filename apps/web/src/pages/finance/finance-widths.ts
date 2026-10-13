/**
 * Finance's column widths (Chew 2026-10-13, the Finance look). A Finance table
 * no longer stretches to its card, so each column is the width of what it
 * holds: an amount fits RM 1,234,567.89 in the footer's bold, a code fits
 * `400-A001`, and a name or a party wraps rather than being cut. A width
 * belongs to the field, so every Finance page prints the same fact the same
 * width; a value that clips is fixed here, once.
 */
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

/* Catalog display formatters. Presentation only — nothing here computes a
   business fact, so a caller is free to format without owning arithmetic. */

/** Money, as the catalog grids print it: `RM 1,234.00`. */
export function fmtRm(n: number): string {
  return `RM ${n.toLocaleString("en-MY", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/** A short human summary of a combo's slots, e.g. "2A(LHF)|2A(RHF) + L(LHF)". */
export function slotsSummary(slots: string[][]): string {
  if (slots.length === 0) return "—";
  return slots.map((s) => s.join("|")).join(" + ");
}

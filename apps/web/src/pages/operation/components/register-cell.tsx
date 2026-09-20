/**
 * ⭐ THE SECOND LINE OF A TWO-LINE CELL — one implementation, 2026-09-18.
 *
 * UI MASTER §6.8 rules the treatment: "Main/item text 13px; configuration and
 * Unit ID on line two 11px/slate-11." Three files had spelt that as the same
 * 46-character class string (UI-KIT §6.6), and a typography rule copied by
 * hand is a typography rule that drifts — one file gains a margin, another
 * loses the colour, and two tables that must read as one listing stop doing so.
 *
 * It is a RECIPE, not a kit component: the kit owns type tokens, and this is
 * one page-family's way of stacking two of them inside a table cell. When the
 * kit grows a two-line cell, this file is what it replaces.
 *
 * ── WHAT BELONGS ON LINE TWO ────────────────────────────────────────────────
 * The quieter half of ONE fact: a Unit ID under its document, a specification
 * under its model, a configuration under its item. Never a second fact that
 * deserves its own column — line two is a smaller voice, not a spare cell.
 */
import type { ReactNode } from "react";

export default function SecondLine({ children }: { children: ReactNode }) {
  return (
    <div className="mt-0.5 break-words text-meta text-kit-slate-11">{children}</div>
  );
}

/**
 * THE single status → pill-class mapping (Jess 2026-07-20).
 *
 * ONE SOURCE OF TRUTH — every surface that renders a status word MUST call
 * this, so a state never drifts between screens (the bug that shipped:
 * "Pending" was amber in the list but grey in the drawer). Covers BOTH the
 * order-STAGE words (Pending / Placed / Proceed / Scheduled / Delivered / On
 * hold …) AND the PAYMENT-status words (Paid / Partial / Follow Up / Unpaid) —
 * the Payments grid folds into it too (no separate `statusPill`).
 *
 * Colour law (UI-KIT §A1/§A6): blue is reserved for SELECTION only — no state
 * maps to `pill-sent`. Green = settled/good · amber = LIVE/waiting (work to
 * do) · red = a problem/alarm · grey = done or an early neutral stage.
 */
export function orderStatusPill(word: string): string {
  switch (word.trim().toLowerCase()) {
    // settled / good — green
    case "scheduled":
    case "confirmed":
    case "collected":
    case "paid":
      return "pill-confirmed";
    // problem / alarm — red
    case "overdue":
    case "cancelled":
    case "unpaid":
      return "pill-overdue";
    // LIVE / waiting — amber (Pending was wrongly grey before this)
    case "pending":
    case "on hold":
    case "unscheduled":
    case "owing":
    case "partial":
    case "follow up":
      return "pill-warning";
    // done (delivered) + early neutral stages (placed / proceed / draft / unset) — grey
    default:
      return "pill-neutral";
  }
}

/**
 * The ORDER's DB status → the word Loo and the operators actually use.
 *
 * Same vocabulary as the POS board lanes (`order-board-ui.tsx` LANES) and the
 * order drawer's eyebrow, so one order never reads "Order placed" on one screen
 * and "place" on another. The state-vocabulary law lives here: a raw DB word
 * (underscored, lowercase) must never reach the screen, and an unmapped value
 * degrades to a de-underscored Title Case instead of leaking.
 */
export function orderStatusWord(dbStatus: string | null | undefined): string {
  switch ((dbStatus ?? "").trim().toLowerCase()) {
    case "place":
      return "Order placed";
    case "proceed_order":
      return "Proceed";
    case "delivered":
      return "Delivered";
    case "cancelled":
      return "Cancelled";
    case "":
      return "—";
    default:
      return (dbStatus ?? "")
        .replace(/_/g, " ")
        .replace(/^\w/, (m) => m.toUpperCase());
  }
}

/**
 * THE single order-status → pill-class mapping (Jess 2026-07-20).
 *
 * ONE SOURCE OF TRUTH — every surface that renders an order-STATE word (the
 * Orders list STATUS column, the drawer customer-card header, the Payments
 * grid …) MUST call this, so a state never drifts between screens (the bug
 * that shipped: "Pending" was amber in the list but grey in the drawer).
 *
 * Colour law (UI-KIT §A1/§A6): blue is reserved for SELECTION only — no order
 * state maps to `pill-sent`. Amber = a LIVE / waiting state (there's work to
 * do); green = a settled/good state; red = a problem; grey = done or an early
 * neutral stage.
 */
export function orderStatusPill(word: string): string {
  switch (word.trim().toLowerCase()) {
    // settled / good — green
    case "scheduled":
    case "confirmed":
    case "collected":
    case "paid":
      return "pill-confirmed";
    // problem — red
    case "overdue":
    case "cancelled":
      return "pill-overdue";
    // LIVE / waiting — amber (Pending was wrongly grey before this)
    case "pending":
    case "on hold":
    case "unscheduled":
    case "owing":
      return "pill-warning";
    // done (delivered) + early neutral stages (placed / proceed / draft) — grey
    default:
      return "pill-neutral";
  }
}

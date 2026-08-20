/**
 * R4 · Problem stock is quarantined
 * (docs/receiving-claim-execution-queue.md, locked with Jess 2026-07-27).
 *
 * The card:
 *
 *   "damaged/wrong units flip to `on_hold` (with reason) so they can never be
 *    allocated, reserved, or delivered; goods physically sent back flip to
 *    `returned_to_supplier`; claim resolution flips them back to free (or
 *    writes them off)."
 *   Done when: **a held unit is invisible to every sell/reserve/deliver path,
 *   provably.**
 *
 * ── Where the held units come from ──────────────────────────────────────────
 * A PO mints one `incoming` unit per ordered piece (0153/0154). Receiving flips
 * the GOOD ones to `free`. Before this card the broken ones stayed `incoming`
 * FOREVER — which is worse than invisible: `reorder-alert.ts` and
 * `ready-stock-plan.ts` both count `incoming` as "on the way", so a unit sitting
 * broken in our own warehouse was counted as a future arrival that will never
 * come, and the reorder engine under-ordered by exactly that many. R4 flips
 * those units `incoming → on_hold`, stamped with the claim that is chasing them.
 *
 * ── Why "provably" is a property of the STATUS, not of a screen ─────────────
 * `ops_stock_items` carries a blanket internal write policy, so a guard that
 * only lived in one RPC would be a guard one PostgREST call can walk around.
 * The rule is therefore written as a DESTINATION rule and enforced by a trigger
 * (0299): a unit on hold may only ever become `free`, `returned_to_supplier` or
 * `written_off`. It can never become `reserved`, `sold` or `transferred` — the
 * three states every sell / reserve / deliver path actually writes — no matter
 * who tries or through which door. `SELLABLE_STOCK_STATUSES` below is the other
 * half of the same fact, and the tests read both.
 *
 * ── What is deliberately NOT here ───────────────────────────────────────────
 * A hold is created by RECEIVING and by nothing else. A unit already in the
 * pool that is later found damaged has its own machine (`needs_repair` +
 * condition, the Defective view) and a second quarantine concept competing with
 * it would leave two ways to say the same thing. Sending FREE goods back to a
 * factory is a Purchase Return, which the queue doc files under LATER.
 *
 * PURE — no I/O, no clock. The web (buttons + gates), the API (validation) and
 * the tests read this one copy; the database mirrors the rules in CHECK
 * constraints and a trigger, because SQL cannot import TypeScript.
 */

// ── Every status a unit can hold ─────────────────────────────────────────────

/**
 * The whole `ops_stock_items.status` vocabulary, labelled once.
 *
 * Before R4 the stock table printed the raw column value (`incoming`,
 * `voided`), which is how `written_off` would have shipped reading
 * "written_off". Every label lives in ONE place (COPY-STANDARD rule) — this is
 * that place for the register.
 */
export const OPS_STOCK_STATUS_LABEL: Record<string, string> = {
  incoming: "On the way",
  free: "Free",
  reserved: "Reserved",
  sold: "Sold",
  // 0365 gave `transferred` its first writer and its meaning: the goods have
  // left one site and the destination has not yet received them. The word says
  // what is TRUE NOW ("In transit"), not what will be true when the journey
  // ends — an operator reading "Transferred" would look for the unit at the
  // destination, where it is not. Safe to fix rather than change: the status
  // had no writer and zero rows before 0365, so no screen ever printed it.
  transferred: "In transit",
  voided: "Cancelled",
  // R4
  on_hold: "On hold",
  returned_to_supplier: "Returned to supplier",
  written_off: "Written off",
};

export function opsStockStatusLabel(status: string | null | undefined): string {
  if (!status) return "—";
  return OPS_STOCK_STATUS_LABEL[status] ?? status;
}

/**
 * The ONLY status a unit can be in and still be sold, reserved or delivered.
 *
 * Every sell / reserve / deliver path in the system filters on it:
 * `ops_stock_reserve`, `ops_stock_pool_draw`, the sofa-loan claim, the `/ready`
 * list and `ops_stock_takeout` (which also accepts `reserved`, i.e. a unit that
 * was already drawn out of this same pool). `ops_rollup_stock_balances` counts
 * only `free` + `reserved` into `stock_balances`, so a held unit is absent from
 * the aggregate ledger the entire logistics reserve machine runs on.
 *
 * Stated here as data so a test can assert the list rather than a comment
 * claiming it.
 */
export const SELLABLE_STOCK_STATUSES = ["free"] as const;

/** Statuses a unit can occupy while it is quarantined or gone. None of them is
 *  sellable, and none of them is counted into `stock_balances`. */
export const HELD_STOCK_STATUS = "on_hold" as const;
export const RETURNED_STOCK_STATUS = "returned_to_supplier" as const;
export const WRITTEN_OFF_STOCK_STATUS = "written_off" as const;

/** Once goods have physically left — back to the factory, or to the skip — they
 *  do not come back. A replacement is a NEW delivery of a NEW unit, which is
 *  what the PO line's pending qty is already asking for. The trigger in 0299
 *  refuses any move off these two. */
export const TERMINAL_STOCK_STATUSES = [
  RETURNED_STOCK_STATUS,
  WRITTEN_OFF_STOCK_STATUS,
] as const;

export function isHeldStockStatus(status: string | null | undefined): boolean {
  return status === HELD_STOCK_STATUS;
}

export function isSellableStockStatus(status: string | null | undefined): boolean {
  return (SELLABLE_STOCK_STATUSES as readonly string[]).includes(status ?? "");
}

// ── Why a unit is held ───────────────────────────────────────────────────────

/**
 * The two reasons receiving quarantines a unit — R2's disjoint domains, kept
 * disjoint here. A claim typed `damaged` covers the line's `damaged_qty`; every
 * other non-late type covers `wrong_item_qty`, so a held unit belongs to exactly
 * one of these two buckets and can never be counted twice.
 *
 * There is no third reason, because a hold is created by receiving and by
 * nothing else.
 */
export const STOCK_HOLD_REASONS = [
  { key: "damaged", label: "Arrived damaged" },
  { key: "wrong_item", label: "Wrong item" },
] as const;

export type StockHoldReason = (typeof STOCK_HOLD_REASONS)[number]["key"];

export const STOCK_HOLD_REASON_KEYS = STOCK_HOLD_REASONS.map((r) => r.key) as [
  StockHoldReason,
  ...StockHoldReason[],
];

export function stockHoldReasonLabel(key: string | null | undefined): string {
  if (!key) return "—";
  return STOCK_HOLD_REASONS.find((r) => r.key === key)?.label ?? key;
}

// ── How a hold ends ──────────────────────────────────────────────────────────

/**
 * The three ways quarantined goods stop being quarantined. The card names all
 * three ("flips them back to free · goods physically sent back · or writes them
 * off"); there is no fourth, and there is deliberately no "cancel the hold"
 * that leaves no trace.
 *
 * `back_to_stock` is the only one that puts a unit into sellable stock, and it
 * is the only one that writes a stock movement — the goods really do enter the
 * pool at that moment, and In & out must be able to say when.
 */
export const STOCK_HOLD_OUTCOMES = [
  { key: "back_to_stock", label: "Put back in stock" },
  { key: "returned", label: "Returned to supplier" },
  { key: "written_off", label: "Written off" },
] as const;

export type StockHoldOutcome = (typeof STOCK_HOLD_OUTCOMES)[number]["key"];

export const STOCK_HOLD_OUTCOME_KEYS = STOCK_HOLD_OUTCOMES.map((o) => o.key) as [
  StockHoldOutcome,
  ...StockHoldOutcome[],
];

export function stockHoldOutcomeLabel(key: string | null | undefined): string {
  if (!key) return "—";
  return STOCK_HOLD_OUTCOMES.find((o) => o.key === key)?.label ?? key;
}

/** The status a unit lands in for each outcome. One mapping, mirrored by the
 *  RPC in 0299 — the browser must never be the thing that decides a status. */
export const STOCK_HOLD_OUTCOME_STATUS: Record<StockHoldOutcome, string> = {
  back_to_stock: "free",
  returned: RETURNED_STOCK_STATUS,
  written_off: WRITTEN_OFF_STOCK_STATUS,
};

/**
 * Which outcome must carry a note.
 *
 * Only the write-off. Destroying a unit we paid for and cannot chase anyone for
 * is the one outcome that leaves no other trace of WHY — the other two are
 * self-describing (it is in the pool; it went back to the factory). Same
 * principle as 0291's `reject` / `other_agreement` rule, and the same reason
 * the other outcomes are NOT made to demand one: a mandatory box people must
 * fill to proceed gets filled with ".".
 */
export function holdOutcomeNeedsNote(
  outcome: string | null | undefined,
): boolean {
  return outcome === "written_off";
}

export type StockHoldResolveProblem =
  | "no_held_units"
  | "outcome_required"
  | "note_required";

/**
 * What is still missing before this claim's held units may be resolved.
 *
 * Asked by the button (so it can be disabled with a reason on screen) and by
 * the RPC (so the server is the one that decides). Empty array = go.
 */
export function holdResolveProblems(d: {
  heldUnits: number;
  outcome: string | null;
  note: string;
}): StockHoldResolveProblem[] {
  const out: StockHoldResolveProblem[] = [];
  if (d.heldUnits <= 0) out.push("no_held_units");
  if (!d.outcome) out.push("outcome_required");
  else if (holdOutcomeNeedsNote(d.outcome) && d.note.trim().length === 0)
    out.push("note_required");
  return out;
}

/** Plain words for the operator — the copy law: an error names the fix. */
export const STOCK_HOLD_RESOLVE_PROBLEM_TEXT: Record<
  StockHoldResolveProblem,
  string
> = {
  no_held_units: "No units are on hold for this claim.",
  outcome_required: "Say what happened to the units.",
  note_required: "Say why the units were written off.",
};

/**
 * The sentence the claim panel shows above the buttons.
 *
 * A FACT, not an action (COPY-STANDARD's UI type dictionary): it states what is
 * true of the goods right now. The second half is the whole point of the card,
 * so it is said out loud rather than left to be inferred from a status word.
 */
export function heldUnitsLine(heldUnits: number, reason?: string | null): string {
  if (heldUnits <= 0) return "Nothing on hold — these units are not in the register.";
  const units = `${heldUnits} unit${heldUnits === 1 ? "" : "s"}`;
  const why = reason ? ` · ${stockHoldReasonLabel(reason)}` : "";
  return `${units} on hold${why} — cannot be sold, reserved or delivered.`;
}

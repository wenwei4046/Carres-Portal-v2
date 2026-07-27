/**
 * T11 · The delivery board's ORDER — which row an operator sees first.
 * (docs/delivery-execution-queue.md T11, promotes L5; Jess 2026-07-27.)
 *
 * T11 is assembly: every signal, queue, word, reason, profile and calendar the
 * Delivery module shows already exists. The ONE thing a standalone module needs
 * that no earlier card produced is a **ranking** — the Orders list sorts by the
 * order's overall slack (stock included), and a delivery board must sort by
 * delivery risk instead, or the top row is not the truck that needs a human.
 *
 * The rule is `docs/ACTION-FLOW-STANDARD.md` Law 5, narrowed to this module:
 *
 *   1. a step past its OWN deadline (T7's auto-overdue) outranks everything
 *   2. then the earliest deadline — the next thing to go late
 *   3. then the earliest truck day (a booking moving tomorrow beats one in Sep)
 *   4. then the earliest promise to the customer
 *   5. then the older SO — a deterministic tail so the list never reshuffles
 *      between renders (an order that jumps rows while being clicked is a bug
 *      an operator experiences as "I opened the wrong one")
 *
 * **A missing date sorts LAST, never first.** T7's law is that a step with no
 * anchor can never be late (a TBD delivery date has nothing to measure from), so
 * it must not be able to reach the top of a board that means "most urgent" —
 * silence over a false alarm, in ranking form.
 *
 * PURE — no I/O, no clock, no locale. The caller computes `overdue` / `dueIso`
 * from `delivery-queue.ts` and `bookingIso` from `delivery-calendar.ts`, so this
 * module never becomes a second definition of either.
 */

/**
 * One row of the delivery board, reduced to what decides its place.
 *
 * Which of the four queues the row sits in is deliberately NOT here: the
 * ranking does not care which step is next, only how much delivery risk the row
 * carries — and a field the comparator ignores would read as though it were
 * consulted.
 */
export interface DeliveryBoardRow {
  /** The step's own deadline — `deliveryStepDueIso`. Null = no anchor. */
  dueIso?: string | null;
  /** Past that deadline — `deliveryStepOverdue`. */
  overdue?: boolean;
  /** The day this order's truck moves — `bookingDayOf().date`. */
  bookingIso?: string | null;
  /** The date the customer was promised (null when TBD). */
  promisedIso?: string | null;
  /** Sales order number — the deterministic tail. */
  so: number;
}

/** An absent date is the WEAKEST claim on attention, never the strongest. */
function byDateNullsLast(a: string | null | undefined, b: string | null | undefined): number {
  const x = a ? a.slice(0, 10) : null;
  const y = b ? b.slice(0, 10) : null;
  if (x === y) return 0;
  if (!x) return 1;
  if (!y) return -1;
  return x < y ? -1 : 1;
}

/** ACTION-FLOW Law 5, narrowed to the delivery board. See the module header. */
export function compareDeliveryRows(a: DeliveryBoardRow, b: DeliveryBoardRow): number {
  if (!!a.overdue !== !!b.overdue) return a.overdue ? -1 : 1;
  return (
    byDateNullsLast(a.dueIso, b.dueIso) ||
    byDateNullsLast(a.bookingIso, b.bookingIso) ||
    byDateNullsLast(a.promisedIso, b.promisedIso) ||
    a.so - b.so
  );
}

/** Non-mutating sort — the caller's array is never reordered in place. */
export function sortDeliveryRows<T extends DeliveryBoardRow>(rows: readonly T[]): T[] {
  return [...rows].sort(compareDeliveryRows);
}

/**
 * How a step's own deadline reads, as a shape the UI formats.
 *
 * `late` and `due` both carry the SAME date — the deadline — because the
 * sentence an operator needs is "when should this have happened", not a
 * countdown. `none` means the step has no anchor (TBD customer date, nothing
 * delivered yet): there is nothing honest to say, so the UI says nothing rather
 * than printing a dash that reads like a missing value.
 */
export type DeliveryDueState = "late" | "due" | "none";

export function deliveryDueState(row: DeliveryBoardRow): DeliveryDueState {
  if (!row.dueIso) return "none";
  return row.overdue ? "late" : "due";
}

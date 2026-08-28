/**
 * THE FINANCE EXCEPTION — the one money blocker, and the ONE predicate for it.
 *
 * Owner ruling 2026-08-16 ("decision A"), `docs/orders/MASTER.md` §8:
 *
 * ```
 * outstanding money does not block the DO
 * an OPEN Finance exception is the ONLY money blocker
 * OPEN     blocks the DO gate
 * CLEARED  removes the block
 * ```
 *
 * ⭐ THIS MODULE TAKES NO MONEY. Not a balance, not an outstanding figure, not
 * a storage fee, not a collection-clock state. That is the whole point and it
 * is enforced by the signatures below: an exception is a Finance JUDGEMENT, and
 * owing money is a FACT. Deriving either from the other would rebuild the gate
 * this ruling retired, under a new name. If a future change makes it tempting
 * to pass `orderMoney` in here, the change is wrong.
 *
 * ONE ARITHMETIC, MANY READERS (Architecture Law D). Slice 3 points the issue
 * gate, the action engine and the route canvas at `financeExceptionHolds`, so
 * the three surfaces are structurally incapable of disagreeing. Until then this
 * module is deliberately wired to nothing: the blocker exists before the thing
 * it blocks is changed, so the DO is never briefly ungated.
 */

import { z } from "zod";

/** A Finance exception as the readers see it. `order_finance_exceptions` (0355). */
export interface FinanceException {
  id: string;
  /** `open` blocks the delivery order; `cleared` does not. */
  status: "open" | "cleared";
  /** Why Finance stopped the goods. Required at the door and by the table. */
  reason: string;
  openedAt: string | null;
  clearedAt: string | null;
  /** Required to clear. A block lifted without a reason is the retired defect. */
  clearEvidence: string | null;
}

/** Is this one still holding the delivery? */
export function isOpenFinanceException(
  /* Only `status` is read — see the note on `openFinanceExceptions`. */
  exception: Pick<FinanceException, "status">,
): boolean {
  return exception.status === "open";
}

/**
 * The ones still holding the delivery, in the order they were given.
 *
 * An order may carry more than one: two Finance reasons are two decisions, and
 * collapsing them would hide the second from the operator who has to resolve it.
 */
export function openFinanceExceptions<T extends Pick<FinanceException, "status">>(
  exceptions: readonly T[],
): T[] {
  return exceptions.filter(isOpenFinanceException);
}

/**
 * ⭐ THE ONE PREDICATE. Does money hold this delivery order?
 *
 * The answer is now exactly one question — *has Finance opened an exception and
 * not cleared it?* — and never *does the customer owe us anything?*
 */
export function financeExceptionHolds(
  exceptions: readonly FinanceException[],
): boolean {
  return exceptions.some(isOpenFinanceException);
}

/**
 * What the gate SAYS when it refuses, in the governed voice.
 *
 * `COPY-STANDARD.md`'s error pattern: a refusal names the thing that is missing
 * AND what closes it, because a gate that only states a fact leaves a new hire
 * holding a phone with no idea who to ring. Finance owns the act, so Finance is
 * who the sentence names.
 *
 * Returns `null` when nothing holds — a caller that prints an empty string has
 * to remember to check, and one that prints `null` cannot.
 */
export function financeExceptionReason(
  exceptions: readonly FinanceException[],
): string | null {
  const open = openFinanceExceptions(exceptions);
  if (open.length === 0) return null;
  if (open.length === 1) {
    return `Finance is holding this delivery: ${open[0]!.reason} — Finance clears it.`;
  }
  return `Finance is holding this delivery for ${open.length} reasons: ${open
    .map((e) => e.reason)
    .join(" · ")} — Finance clears them.`;
}

/* ─────────────────────────────────────────────────────────────────────────────
 * The two doors' inputs. The RPCs enforce the same rules again in the database
 * — these exist so a bad request is refused before it reaches a role check,
 * not so the database can trust them.
 * ──────────────────────────────────────────────────────────────────────────── */

/** `POST /api/finance/exceptions` — Finance opens the block. */
export const financeExceptionOpenInput = z.object({
  orderId: z.string().uuid(),
  reason: z.string().trim().min(1, "A reason is required to hold a delivery."),
});
export type FinanceExceptionOpenInput = z.infer<typeof financeExceptionOpenInput>;

/**
 * `POST /api/finance/exceptions/:id/clear` — Finance lifts it.
 *
 * The evidence is mandatory here, in the RPC and in a table constraint. Three
 * places, because this is the rule the retired `payment_status` defect was made
 * of: a state a human can change without saying why.
 */
export const financeExceptionClearInput = z.object({
  evidence: z
    .string()
    .trim()
    .min(1, "Clear evidence is required to lift a finance exception."),
});
export type FinanceExceptionClearInput = z.infer<typeof financeExceptionClearInput>;

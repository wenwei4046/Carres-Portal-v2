/**
 * THE DELIVERY PAYMENT APPROVAL — the black-and-white door that opens the
 * money gate (owner ruling 2026-08-19, `docs/orders/MASTER.md` §8).
 *
 * The 2026-08-16 law — "outstanding never blocks the DO" — is REVERSED on the
 * owner's own evidence: on 2026-08-19 an order was delivered with money
 * uncollected and no approval. The SOP is now:
 *
 * ```
 * Money in full BEFORE delivery. That is the only default.
 * Operation cannot proceed on its own word. The exception is a recorded
 * approval — black and white in the system, never verbal.
 * ```
 *
 * One append-only record beside the Finance exception it mirrors (0362 beside
 * 0355). Operation or the salesperson RAISES a request with its reason;
 * the configured approver — today Jess only, the list is data — APPROVES or
 * REFUSES with a reason. Only an APPROVED record opens the money gate, and an
 * approval means COD on the owner's exact terms: the customer may see the
 * goods on the truck, pays the full balance by ONLINE TRANSFER before
 * unloading, no cash; unpaid, the goods return.
 *
 * ONE ARITHMETIC, MANY READERS (Architecture Law D). The issue gate, the DO
 * mint's database trigger, the route canvas and the print path all ask
 * `paymentApprovalOpensGate` (or its SQL twin in 0362); nothing recomputes
 * the answer from a balance or a status word of its own.
 */

import { z } from "zod";
import { fmtMoney } from "./money-format";

/** A request/decision row as the readers see it.
 *  `order_delivery_payment_approvals` (0362). */
export interface DeliveryPaymentApproval {
  id: string;
  /** `pending` and `refused` keep the gate shut; only `approved` opens it. */
  status: "pending" | "approved" | "refused";
  /** Why Operation / the salesperson asked. Required at the door and by the table. */
  requestReason: string;
  requestedAt: string | null;
  decidedAt: string | null;
  /** The approver's own words. Required to decide — a verbal yes is the defect
   *  this record exists to end. */
  decisionReason: string | null;
}

/** ⭐ THE ONE PREDICATE. Does a recorded approval open this order's money gate? */
export function paymentApprovalOpensGate(
  /* Only `status` is read, so the parameter asks for only `status`. The Order
     Route carries a narrower row than the money gate does, and it must be able
     to ask THIS function rather than retype the test (Law D). */
  approvals: readonly Pick<DeliveryPaymentApproval, "status">[],
): boolean {
  return approvals.some((a) => a.status === "approved");
}

/** The newest request still waiting for the approver. */
export function pendingPaymentApproval<T extends Pick<DeliveryPaymentApproval, "status">>(
  approvals: readonly T[],
): T | null {
  const pending = approvals.filter((a) => a.status === "pending");
  return pending.length > 0 ? pending[pending.length - 1]! : null;
}

/**
 * What the money gate SAYS when it refuses, in the governed voice
 * (`COPY-STANDARD.md` error pattern: what broke · how to fix it · who to ask).
 *
 * Returns `null` when money does not hold — an approved record exists, or
 * nothing is outstanding. The gate calls this only when outstanding > 0.
 */
export function paymentApprovalReason(
  outstanding: number,
  approvals: readonly DeliveryPaymentApproval[],
): string | null {
  if (outstanding <= 0) return null;
  if (paymentApprovalOpensGate(approvals)) return null;
  const pending = pendingPaymentApproval(approvals);
  if (pending) {
    return `${fmtMoney(outstanding)} is still outstanding — a payment approval is waiting for the approver's decision.`;
  }
  return `${fmtMoney(outstanding)} is still outstanding — collect it in full, or request a payment approval.`;
}

/**
 * The COD instruction the DO document prints when it was issued under an
 * approval (owner's words, 2026-08-19). The amount is the order's outstanding
 * through the ONE money arithmetic at render time — the balance the driver
 * must see land before the goods come down.
 */
export function codInstruction(outstanding: number): string {
  return `COLLECT ${fmtMoney(outstanding)} BY ONLINE TRANSFER BEFORE UNLOADING — NO CASH.`;
}

/* ─────────────────────────────────────────────────────────────────────────────
 * The two doors' inputs. The RPCs (0362) enforce the same rules again in the
 * database — these refuse a bad request before it reaches a role check.
 * ──────────────────────────────────────────────────────────────────────────── */

/** `POST /api/operation/orders/:id/payment-approvals` — raise the request. */
export const paymentApprovalRequestInput = z.object({
  reason: z
    .string()
    .trim()
    .min(1, "A reason is required to request a payment approval."),
});
export type PaymentApprovalRequestInput = z.infer<
  typeof paymentApprovalRequestInput
>;

/** `POST /api/operation/payment-approvals/:id/decide` — the approver's word. */
export const paymentApprovalDecideInput = z.object({
  decision: z.enum(["approved", "refused"]),
  reason: z
    .string()
    .trim()
    .min(1, "The decision records the approver's reason — black and white."),
});
export type PaymentApprovalDecideInput = z.infer<
  typeof paymentApprovalDecideInput
>;

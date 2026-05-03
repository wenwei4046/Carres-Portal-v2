/**
 * Proceed-blocker codes — emitted by the `proceed_order` RPC and consumed
 * by both the server route (apps/api) and the dealer UI (apps/web).
 *
 * Each code maps to a single failed precondition. When the RPC raises an
 * exception, it puts the code into the Postgres `DETAIL` field, the Hono
 * route relays it as { code, message } in a 422 response, and the wizard
 * UI uses the code to render the matching inline blocker hint.
 *
 * Mirrors `proceedBlockers()` in `reference/proto/store.jsx`.
 */
export const PROCEED_BLOCKER_CODES = [
  // Validation blockers — caller must fix the order before retrying.
  "customer_name_required",
  "customer_phone_required",
  "delivery_address_required",
  "delivery_date_required",
  "signature_required",
  "terms_not_accepted",
  "total_amount_missing",
  "payment_below_50",
  // State blockers — the order can't be proceeded because of its current state.
  "wrong_status",
  // Authz blockers — caller doesn't own this order or it doesn't exist.
  "forbidden",
  "order_not_found",
] as const;

export type ProceedBlockerCode = (typeof PROCEED_BLOCKER_CODES)[number];

export interface ProceedBlocker {
  code: ProceedBlockerCode;
  message: string;
}

/** True when the code is shaped like a known blocker. Used by the API route
 *  to validate the RPC's DETAIL field before relaying to the client. */
export function isProceedBlockerCode(value: unknown): value is ProceedBlockerCode {
  return typeof value === "string" && (PROCEED_BLOCKER_CODES as readonly string[]).includes(value);
}

/** Default user-facing label per code. The UI overrides this for the
 *  payment-below-50 case which needs the dynamic % from the order. */
export const PROCEED_BLOCKER_LABEL: Record<ProceedBlockerCode, string> = {
  customer_name_required: "Customer name",
  customer_phone_required: "Phone",
  delivery_address_required: "Delivery address",
  delivery_date_required: "Delivery date",
  signature_required: "Signature",
  terms_not_accepted: "T&C accepted",
  total_amount_missing: "Order pricing",
  payment_below_50: "Payment ≥ 50%",
  wrong_status: "Order is not in Place status",
  forbidden: "Not allowed for this order",
  order_not_found: "Order not found",
};

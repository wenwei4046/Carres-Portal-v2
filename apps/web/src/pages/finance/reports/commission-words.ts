import type { DcOrder, DcOrderMonth, DcStatementLine } from "@carres/shared/dealer-commission";
import { fmtMonth } from "@/lib/fmt-date";

/*
 * The words of dealer commission that Finance's report and the store's own
 * Commission page both show, so the two always say the same thing.
 * PROPOSAL - PENDING APPROVAL (docs/COPY-STANDARD.md, Finance (Chew), dealer commission steps 2 and 3).
 */

export const soWord = (o: Pick<DcOrder, "so">) => (o.so !== null ? `SO-${o.so}` : "SO not available");
export const customerWord = (o: Pick<DcOrder, "customer">) => o.customer?.trim() || "Customer not recorded";

/** The one word that says where an order stands. */
export function noteWord(r: Pick<DcOrderMonth, "takenBack" | "cancelled" | "terms" | "stillToEarn" | "halfReachedOn">): string {
  if (r.takenBack) return "Commission taken back";
  if (r.cancelled) return "Cancelled";
  if (!(r.terms.full > 0)) return "Earns nothing";
  if (r.stillToEarn <= 0) return "Paid in full";
  if (!r.halfReachedOn) return "Under half paid";
  return "Waiting for the balance";
}

/** A statement line's description (0664). */
export function statementLineWord(l: Pick<DcStatementLine, "kind" | "month" | "soFar" | "voucherNo">): string {
  if (l.kind === "payment") return `Payment ${l.voucherNo ?? ""}`.trim();
  const month = l.month ? fmtMonth(l.month) : "";
  if (l.kind === "rebate") return `Renovation rebate ${month}`;
  return l.soFar ? `Commission ${month} so far` : `Commission ${month}`;
}

/** A statement line's key in a list. */
export const statementLineKey = (l: Pick<DcStatementLine, "kind" | "month" | "paymentId">) =>
  `${l.kind}:${l.month ?? l.paymentId ?? ""}`;

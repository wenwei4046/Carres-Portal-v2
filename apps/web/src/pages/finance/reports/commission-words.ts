import type { DcKpiRule, DcOrder, DcOrderMonth, DcStatementLine } from "@carres/shared/dealer-commission";
import { fmtMonth } from "@/lib/fmt-date";
import { rm } from "@/lib/format-currency";

/*
 * The words of dealer commission that Finance's report and the store's own
 * Commission page both show, so the two always say the same thing.
 * PROPOSAL - PENDING APPROVAL (docs/COPY-STANDARD.md, Finance (Chew), dealer commission steps 2 to 4).
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

/** A statement line's description (0664, 0665). */
export function statementLineWord(l: Pick<DcStatementLine, "kind" | "month" | "soFar" | "voucherNo">): string {
  if (l.kind === "payment") return `Payment ${l.voucherNo ?? ""}`.trim();
  const month = l.month ? fmtMonth(l.month) : "";
  const what = l.kind === "rebate" ? "Renovation rebate" : l.kind === "kpi" ? "KPI allowance" : "Commission";
  return l.soFar ? `${what} ${month} so far` : `${what} ${month}`;
}

/** 0665 — whether a KPI count starts again each month or each year. */
export const kpiPeriodWord = (period: DcKpiRule["period"]) => (period === "year" ? "Each year" : "Each month");

/** 0665 — a KPI rule's tiers, lowest first. */
export function kpiTiersWord(r: Pick<DcKpiRule, "tiers">): string {
  if (r.tiers.length === 0) return "No tier bonus";
  return [...r.tiers]
    .sort((a, b) => Number(a.units) - Number(b.units))
    .map((t) => `${Number(t.units)} guarantees ${rm(Number(t.bonus))}`)
    .join(" · ");
}

/** A statement line's key in a list. */
export const statementLineKey = (l: Pick<DcStatementLine, "kind" | "month" | "paymentId">) =>
  `${l.kind}:${l.month ?? l.paymentId ?? ""}`;

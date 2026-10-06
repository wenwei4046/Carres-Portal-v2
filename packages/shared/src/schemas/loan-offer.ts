import { z } from "zod";

/**
 * THE LOAN OFFER RECORD — Delivery MASTER §14.2, Orders MASTER §7 (Card 15,
 * migration 0492). Carres Operation offers the loan and records the customer's
 * answer on the Sales Order; the loan itself stays the 0209 `ops_sofa_loans`
 * row. Append-only: the latest record is the current state.
 */
export const LOAN_OFFER_EVENTS = [
  { key: "offered", label: "Loan offered" },
  { key: "accepted", label: "Customer accepted the loan" },
  { key: "declined", label: "Customer declined the loan" },
] as const;
export type LoanOfferEvent = (typeof LOAN_OFFER_EVENTS)[number]["key"];
export function loanOfferEventLabel(event: string | null | undefined): string | null {
  return LOAN_OFFER_EVENTS.find((e) => e.key === event)?.label ?? null;
}

export const loanOfferRecordInput = z
  .object({
    event: z.enum(["offered", "accepted", "declined"]),
    /** The exact Unit offered, when Operation names one. */
    itemId: z.string().uuid().nullish(),
    /** What is offered, in the operator's words — required on an offer. */
    label: z.string().trim().max(200).nullish(),
    /** Why it is offered, or why the customer declined (required on a decline). */
    reason: z.string().trim().max(1000).nullish(),
  })
  .superRefine((v, ctx) => {
    if (v.event === "offered" && !v.label) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["label"], message: "Say what is offered." });
    }
    if (v.event === "declined" && !v.reason) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["reason"], message: "Say why the customer declined." });
    }
  });
export type LoanOfferRecordInput = z.infer<typeof loanOfferRecordInput>;

export interface LoanOfferRow {
  id: string;
  /** The append order (0492) — decides the latest record when two share a clock. */
  seq?: number;
  order_id: string;
  event: LoanOfferEvent;
  item_id: string | null;
  label: string | null;
  reason: string | null;
  recorded_by: string | null;
  recorded_at: string;
}

/** The current state of the offer conversation — ONE arithmetic for the
 *  Order Route node, the drawer and the Work feed. `none` = never offered. */
export type LoanOfferState = "none" | "offered" | "accepted" | "declined";
export function loanOfferStateOf(
  offers: ReadonlyArray<Pick<LoanOfferRow, "event" | "recorded_at" | "seq">>,
): { state: LoanOfferState; at: string | null } {
  const latest =
    [...offers].sort(
      (a, b) => b.recorded_at.localeCompare(a.recorded_at) || (b.seq ?? 0) - (a.seq ?? 0),
    )[0] ?? null;
  return latest ? { state: latest.event, at: latest.recorded_at } : { state: "none", at: null };
}

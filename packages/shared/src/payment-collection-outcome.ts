import { z } from "zod";

/**
 * The structured collection outcome (docs/payment/MASTER.md §3, 0446).
 *
 * §3, verbatim: staff record a structured result, and the SYSTEM creates the
 * next action from it. The five words are the approved set and nothing else
 * reaches a screen (COPY-STANDARD); the stored keys are their machine names.
 *
 * ⛔ AN OUTCOME IS NOT MONEY. `Customer paid` records what the customer SAID.
 * Only the canonical posting service writes `orders.paid` and mints a receipt
 * (§2), so a said-paid order keeps its balance and its collection open until
 * the money is actually recorded. That is the whole point of separating them:
 * "`Done` never replaces authoritative completion."
 */
export const COLLECTION_OUTCOMES = [
  "customer_paid",
  "will_pay_on_date",
  "needs_help",
  "disputes_amount",
  "no_answer",
] as const;
export type CollectionOutcome = (typeof COLLECTION_OUTCOMES)[number];

/** The §3 words, exactly. */
export const COLLECTION_OUTCOME_WORD: Record<CollectionOutcome, string> = {
  customer_paid: "Customer paid",
  will_pay_on_date: "Customer will pay on a date",
  needs_help: "Customer needs help",
  disputes_amount: "Customer disputes the amount",
  no_answer: "Customer did not answer",
};

/** What the operator should do next, in the §3 spirit — one sentence per
 *  result, never an invented promise about what the system will do. */
export const COLLECTION_OUTCOME_NEXT: Record<CollectionOutcome, string> = {
  customer_paid: "Record the payment when the money is in. This result is not money.",
  will_pay_on_date: "Ask again on the promised day if the money has not arrived.",
  needs_help: "Agree what help is possible, then ask again.",
  disputes_amount: "Check the invoice against the order before asking again.",
  no_answer: "Try again on the next working day.",
};

export const collectionOutcomeInput = z.object({
  outcome: z.enum(COLLECTION_OUTCOMES),
  promisedDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullish(),
  note: z.string().trim().max(500).nullish(),
});

export interface CollectionOutcomeRow {
  id: string;
  order_id: string;
  invoice_id: string | null;
  outcome: CollectionOutcome;
  promised_date: string | null;
  note: string | null;
  recorded_at: string;
  recorded_by_name?: string | null;
}

/** The order's most recent recorded conversation — the ledger is append-only,
 *  so "latest" is the current answer and the rest is history. */
export function latestOutcomeOf(
  rows: readonly CollectionOutcomeRow[] | null | undefined,
  orderId: string,
): CollectionOutcomeRow | null {
  const mine = (rows ?? []).filter((r) => r.order_id === orderId);
  if (mine.length === 0) return null;
  return mine.reduce((latest, r) => (r.recorded_at > latest.recorded_at ? r : latest));
}

/** A promise the customer has already broken: the promised day has passed and
 *  money is still owed. The §3 risk sort's "missed promise" — a FACT derived
 *  from the ledger, never a stored flag anybody has to maintain. */
export function missedPromise(
  outcome: CollectionOutcomeRow | null,
  todayIso: string,
  stillOwing: boolean,
): boolean {
  return (
    stillOwing &&
    outcome?.outcome === "will_pay_on_date" &&
    outcome.promised_date != null &&
    outcome.promised_date < todayIso
  );
}

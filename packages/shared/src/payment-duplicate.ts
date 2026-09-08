/**
 * The §5 likely-duplicate check (payment/MASTER.md §5).
 *
 * §5, verbatim: "Likely duplicate: compare customer, amount, paid date and
 * reference; staff must inspect the earlier payment before privileged
 * continuation."
 *
 * The customer is implicit — this only ever compares payments already ON the
 * same order. What it compares is the three facts a human would: the AMOUNT,
 * the PAID DATE (same day, or either side of it — a bank slip and the keying
 * often fall on different days), and the REFERENCE when both carry one.
 *
 * It is a WARNING, never a refusal: the posting service's idempotency key
 * already makes an accidental double-submit impossible, and a customer may
 * genuinely pay the same amount twice. This exists so nobody records the same
 * transfer twice by hand without having looked at the earlier one.
 */

export interface ExistingPayment {
  id: string;
  receipt_no: string | null;
  amount: number;
  paid_on: string;
  voided_at: string | null;
  reference?: string | null;
  method?: string | null;
}

export interface DuplicateCandidate {
  amount: number;
  paidOn: string;
  reference?: string | null;
}

/** How many days either side of the keyed date still counts as "the same
 *  payment, keyed on a different day". Two working days covers a Friday slip
 *  keyed on Monday. */
const DAY_WINDOW = 2;

function daysApart(a: string, b: string): number {
  return Math.abs(
    Math.round((Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86_400_000),
  );
}

function sameReference(a: string | null | undefined, b: string | null | undefined): boolean {
  const x = (a ?? "").trim().toLowerCase();
  const y = (b ?? "").trim().toLowerCase();
  return x !== "" && x === y;
}

/**
 * The LIVE payments on this order that look like the one about to be
 * recorded, strongest match first. A voided payment is not money and never
 * matches.
 *
 * A row matches when the amounts are equal AND either the dates are within
 * the window or the references are the same. An identical reference alone is
 * enough to be worth a look even on a different amount — the same slip should
 * not be keyed twice — so it is included and ranked first.
 */
export function likelyDuplicatePayments(
  existing: readonly ExistingPayment[] | null | undefined,
  candidate: DuplicateCandidate,
): ExistingPayment[] {
  const live = (existing ?? []).filter((p) => p.voided_at == null);
  const matches = live.filter((p) => {
    const refHit = sameReference(p.reference, candidate.reference);
    if (refHit) return true;
    if (Number(p.amount) !== Number(candidate.amount)) return false;
    return daysApart(p.paid_on, candidate.paidOn) <= DAY_WINDOW;
  });
  // Strongest first: same reference, then same day, then nearest day.
  return matches.sort((a, b) => {
    const aRef = sameReference(a.reference, candidate.reference) ? 0 : 1;
    const bRef = sameReference(b.reference, candidate.reference) ? 0 : 1;
    if (aRef !== bRef) return aRef - bRef;
    return daysApart(a.paid_on, candidate.paidOn) - daysApart(b.paid_on, candidate.paidOn);
  });
}

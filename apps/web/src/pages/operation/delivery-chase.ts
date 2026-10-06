/**
 * THE CHASE MESSAGE — Delivery Card 05, now spoken from the Monitor brief
 * (Delivery MASTER §8.6, CARD 11) and the Work Logistics card: plain facts,
 * primary-school English, and NOTHING that reads as a confirmation (§2:
 * prepared, copied, opened or sent never means confirmed). Pure and exported
 * for its test.
 *
 * ⭐ AN OUTSIDE PARTY NEVER SEES THE SO NUMBER (Orders MASTER, messages rule):
 * the logistics message leads with the customer's own reference (CR / TCF),
 * else the customer's name. ⭐ The current external link rides at the end,
 * inserted by the system, so nobody pastes a link from memory (owner ruling
 * 2026-09-24).
 */
export function chaseMessageFor(input: {
  reference: string | null;
  customer: string | null;
  address: string | null;
  building: string | null;
  goods: string[];
  requestedDate: string | null; // already formatted, or null
  linkUrl?: string | null;
}): string {
  const lines = [
    [input.reference, input.customer].filter(Boolean).join(" · "),
    input.address ?? "",
    input.building ? `Building: ${input.building}` : "",
    input.goods.length > 0 ? `Goods: ${input.goods.join(", ")}` : "",
    input.requestedDate ? `Customer asked: ${input.requestedDate}` : "Customer date not given yet",
    "Please send the scheduled delivery date. The time is optional.",
    input.linkUrl ? `Answer here: ${input.linkUrl}` : "",
  ];
  return lines.filter(Boolean).join("\n");
}
/** The reply screenshot family and ceiling — the same as the handover proof. */
export const REPLY_PROOF_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export const REPLY_PROOF_MAX_BYTES = 10 * 1024 * 1024;

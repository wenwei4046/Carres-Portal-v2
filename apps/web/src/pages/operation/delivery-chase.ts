/**
 * THE CHASE MESSAGE — Delivery Card 05, now spoken from the Monitor brief
 * (Delivery MASTER §8.6, CARD 11): plain facts, primary-school English, and
 * NOTHING that reads as a confirmation (§2: prepared, copied, opened or sent
 * never means confirmed). Pure and exported for its test.
 */
export function chaseMessageFor(input: {
  so: number | null;
  customer: string | null;
  address: string | null;
  building: string | null;
  goods: string[];
  requestedDate: string | null; // already formatted, or null
}): string {
  const lines = [
    `SO-${input.so ?? "?"} · ${input.customer ?? ""}`.trim(),
    input.address ?? "",
    input.building ? `Building: ${input.building}` : "",
    input.goods.length > 0 ? `Goods: ${input.goods.join(", ")}` : "",
    input.requestedDate ? `Customer asked: ${input.requestedDate}` : "Customer date not given yet",
    "Please confirm the delivery date and time.",
  ];
  return lines.filter(Boolean).join("\n");
}

/** The reply screenshot family and ceiling — the same as the handover proof. */
export const REPLY_PROOF_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export const REPLY_PROOF_MAX_BYTES = 10 * 1024 * 1024;

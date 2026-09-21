/**
 * THE ORDER TERMS — one array, two readers.
 *
 * The customer signs these on the POS screen (`Step3SignaturePayment`) and
 * receives them on the Sales Order PDF (`sales-order-template`). For a year
 * the two held their own copies and a comment asked future editors to "touch
 * both files together". Prose cannot enforce that:
 *
 *   - 2026-08-09 the owner corrected clause 1. Card 3.0-FIX applied it to the
 *     PDF and MISSED the screen, so customers signed "becomes a binding tax
 *     invoice" while receiving "the sales invoice is a separate document".
 *   - 2026-09-21 the reverse happened: the PDF dropped clause 4 with the
 *     Access row while the screen kept it — a signed 5-clause agreement
 *     printing as 4. The comment claimed a `sales-order-terms.test.tsx`
 *     guarded this; that file has never existed.
 *
 * So the sentences live HERE and nowhere else. Drift is now impossible by
 * construction rather than by discipline.
 *
 * The WORDING is owner law — see `docs/pdf/SO-PDF-STANDARD.md §7.1`. Changing
 * a sentence is an owner decision, recorded there first.
 */

/** Heading above the clauses on the POS screen.
 *  `Carres Group Sdn Bhd` was WRONG — the legal entity is `CARRES SDN. BHD.`
 *  (SSM 20201055306 · 1601150-X), the name on every Carres document. The
 *  customer was signing under one company name and receiving another. The
 *  owner's call (2026-09-21): drop the name here and just say what the block
 *  is — the entity is on the document's letterhead, which is where a legal
 *  name belongs. */
export const ORDER_TERMS_HEADING = "Terms & Conditions";

export const ORDER_TERMS: readonly string[] = [
  /* Clause 1 — the owner's 2026-08-09 correction. A Sales Order never claims
     to convert into the finance document: SO · DO · Sales Invoice are SEPARATE
     lifecycle documents. */
  "This sales order records your purchase agreement with Carres. The sales invoice is a separate document issued upon delivery.",
  "Balance due is payable in full on or before delivery. Cash, bank transfer, DuitNow QR, and cheque accepted.",
  "Delivery date is best-effort and may shift ±3 working days subject to operation confirmation.",
  /* Clause 4 carries NO reference to a printed floor/lift row — that is why it
     survives the Access row moving to the Delivery Order (owner, 2026-09-21).
     A clause that said "the access recorded above" could not. */
  "Stair-carry surcharges (if any) are billed on this sales order and are not invoiced separately on the DO.",
  "Once the delivery date has been confirmed, any subsequent request to change or extend the date will incur a rescheduling surcharge.",
] as const;

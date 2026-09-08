/**
 * storageObligation — ONE storage figure for every reader (payment/MASTER.md
 * §2 · §7 · §12), so the Payment screens, shared Work, the TS booking gate and
 * the database Delivery door cannot disagree.
 *
 * ⛔ THE 2026-09-08 CORRECTION. Two earlier shapes of this rule were wrong, and
 * both were wrong in the same direction — they let a valid obligation vanish:
 *
 *   1. `a live paper exists` → voiding the last paper fell back to the legacy
 *      charge, and a partly-invoiced order hid the un-invoiced group's fee.
 *   2. `paper history decides` → the invoice model then OWNED the order and
 *      the legacy fee stopped counting at all. That rested on a rule nobody
 *      approved: that VOIDING A PAPER IS A WAIVER. It is not. §4 makes a void
 *      the CORRECTION path (void + linked replacement). The approved storage
 *      waiver is the §7 extra-free decision, which changes the FREE PERIOD
 *      before anything is charged; and C9's own semantics are explicit —
 *      `storage_waiver_status = 'approved'` RELEASES the hold and leaves the
 *      money owed, while the write-off is `storage_fee_override = 0`
 *      ("an override must never quietly forgive money", Jess 2026-07-27).
 *      Also, ownership keyed on paper history meant a NEVER-ISSUED DRAFT could
 *      silently erase a live legacy obligation.
 *
 * THE CORRECTED RULE, which invents nothing: each model's obligation stands
 * under its own approved rule, and they are ADDED — each counted exactly once.
 *
 *   INVOICE (0436/0438 · §2)  live ISSUED storage-kind papers, netted so
 *                             `orders.paid` subtracts once across goods and
 *                             storage. A draft asks nothing (issued or not,
 *                             replacement or not); a voided paper asks nothing
 *                             until its replacement is ISSUED.
 *   LEGACY C9 (2026-07-27)    `storageHold`'s answer, untouched: cleared only
 *                             by `storage_collected_at` or an override of 0.
 *                             It is never netted against `paid` — C9 never
 *                             read `paid`, and its clearing fact is collection.
 *
 * Nothing decides that the two are "the same debt" — nothing can, because the
 * legacy columns are ONE per-order figure with no product-group breakdown. So
 * the composer never guesses: it adds them and reports `unreconciledLegacy` so
 * the operator collapses the state by COLLECTING the old fee or writing it off
 * with an override of 0 (the approved instruments). Over-asking is recoverable
 * by the approved write-off; under-asking ships goods for free and is not.
 *
 * The state is also unbirthable from BOTH directions: `payment_storage_start`
 * refuses a case while an uncollected keyed legacy fee stands (0445), and the
 * order-control door refuses to write a storage fee onto an order that already
 * has a case (0447).
 */

export interface StorageObligationInput {
  /** Σ live ISSUED storage-kind invoices (amount + tax) — §2 exactly. */
  invoiceStorageSum: number;
  /** The order's goods value (lines + addons), when priced. */
  goodsTotal: number | null;
  /** `orders.paid`. */
  paid: number | string | null;
  /** The legacy C9 answer for this SO (`storageHold`). */
  legacyOwing: number;
  /** C9's release flag (`storage_waiver_status === 'approved'`). */
  legacyReleased: boolean;
}

export interface StorageObligationResult {
  /** What to hand `orderMoney` as `storageOwing` — already netted on the
   *  invoice path so the combined outstanding subtracts `paid` exactly once. */
  owing: number;
  /** The gross obligation the customer is asked for (the papers' sum, or the
   *  legacy fee) — the figure a message quotes before payments. */
  gross: number;
  released: boolean;
  source: "invoices" | "legacy" | "mixed" | "none";
  /** The legacy C9 part of `owing` when storage PAPERS also exist — the
   *  unreconciled state, named so an operator collapses it by collecting the
   *  old fee or writing it off with an override of 0. Zero on every ordinary
   *  order. It is INCLUDED in `owing`; it is not a separate debt. */
  unreconciledLegacy: number;
}

function n(v: number | string | null | undefined): number {
  if (v == null || v === "") return 0;
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
}

export function storageObligation({
  invoiceStorageSum,
  goodsTotal,
  paid,
  legacyOwing,
  legacyReleased,
}: StorageObligationInput): StorageObligationResult {
  const storage = Math.max(0, n(invoiceStorageSum));
  const legacy = Math.max(0, n(legacyOwing));

  // The invoice part nets against `orders.paid` ONCE: goods are covered
  // first, the remainder of the payment falls on the papers.
  const goods = Math.max(0, n(goodsTotal));
  const paidNum = Math.max(0, n(paid));
  const nettedStorage =
    Math.max(0, goods + storage - paidNum) - Math.max(0, goods - paidNum);

  const source: StorageObligationResult["source"] =
    storage > 0 && legacy > 0 ? "mixed"
    : storage > 0 ? "invoices"
    : legacy > 0 ? "legacy"
    : "none";

  return {
    // Each model's obligation under its own rule, added, each counted once.
    owing: nettedStorage + legacy,
    gross: storage + legacy,
    released: legacyReleased,
    source,
    unreconciledLegacy: storage > 0 ? legacy : 0,
  };
}

/** Σ live ISSUED storage-kind invoices (amount + tax) from a raw invoices
 *  select — the §2 storage obligation, spelled once for every feeder. */
export function invoiceStorageSumOf(
  invoices:
    | Array<{
        kind: string;
        status: string;
        amount: number | string;
        tax_amount: number | string;
        voided_at: string | null;
      }>
    | null
    | undefined,
): number {
  return (invoices ?? [])
    .filter((i) => i.kind !== "sales" && i.status === "issued" && !i.voided_at)
    .reduce((s, i) => s + n(i.amount) + n(i.tax_amount), 0);
}

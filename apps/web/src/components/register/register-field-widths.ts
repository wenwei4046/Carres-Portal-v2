/**
 * ⭐ ONE FIELD-WIDTH REGISTRY FOR THE PURCHASING REGISTERS
 * (UI MASTER §6.8, owner-approved consolidation 2026-09-18).
 *
 * A width belongs to a FIELD, not to a page. SO Batch Purchase, Manual
 * Purchase, Purchase Orders and Receiving print the same facts, and when each
 * page guessed its own number the same `PO No` was 142px on one register and
 * 168px on the next — so two registers opened side by side read as two
 * products. The registry is the fix the owner approved: the same field/role
 * shares its default width, and a field that fails validation is fixed HERE,
 * once, rather than nudged on the page that noticed.
 *
 * ```
 * These are PROTOTYPE STARTING WIDTHS, not verified production maxima.
 * Required numbers never truncate; content may wrap; user resizing stays.
 * Validate actual fonts, longest values, 200% zoom and 1440/1180/820/390
 * before production, and fix the shared definition when one fails.
 * ```
 *
 * A page passes `REGISTER_FIELD_WIDTH.poNo`, never `168`. That is what makes
 * the next divergence a one-line change instead of an audit.
 */
export const REGISTER_FIELD_WIDTH = {
  /** Checkbox / disclosure gutter, each. */
  control: 40,
  /** A short date — `Wed, 16 Sep`. */
  date: 118,
  /** A formal document number: `PO-…`, `MPR-…`, `GRN-…`. */
  documentNo: 170,
  soNo: 90,
  /** The PO register's two-way `SO No / MPR No`. */
  mixedReferenceTwoWay: 176,
  status: 144,
  poSafetyDays: 110,
  category: 112,
  qty: 64,
  items: 208,
  supplier: 136,
  supplierDeliverTo: 150,
  customer: 150,
  customerDeliveryLocation: 176,
  customerRequestedDeliveryDate: 180,
  poDefaultDeliveryDate: 150,
  supplierConfirmedDeliveryDate: 180,
  goodsReceivedDate: 140,
  stockLocation: 160,
  /** `PO No / Ref No` with its Unit IDs beneath, in one cell. */
  sourceAndUnitId: 230,
  unitId: 140,
  condition: 120,
  purposeRequestedBy: 144,
  poVersionWithSendEvidence: 238,

  /* ── RECEIVING'S THREE ADDITIONS — measured 2026-09-18 against this page's
     approved columns (PURCHASING CARD 12). Each was a gap the registry could
     not answer, and each is added HERE rather than guessed on the page. ──── */

  /**
   * `SO No / MPR No / CO No / RO No` — the GRN register's FOUR-way reference.
   * The registry's two-way entry is 176 and this one keeps it: the header is
   * longer but wraps inside the shared two-line header height, so the header
   * does not set the width. The CONTENT does, and it is the same 17-character
   * formal document number (`MPR-20260904-8935` ≈ 133px at 13px mono, plus
   * the shared 16px of padding ≈ 149). Several references stack as lines
   * inside the cell and never widen it.
   */
  mixedReferenceFourWay: 176,
  /**
   * `Goods arrived at` — a receiving SITE name. It is deliberately NOT
   * `Stock Location` (160): that names a stock position and this names where
   * goods physically arrived, and §9.4 keeps the two facts apart. It is the
   * same class of value as `Supplier Deliver To`, so it takes the same 150.
   */
  goodsArrivedAt: 150,
  /**
   * `Received Qty` · `Damaged Qty` · `Wrong Item Qty` · `Extra Qty` — four
   * adjacent quantity columns that read as one family, so they share one
   * width. The `Qty` role's 64 cannot hold them: their headers are two lines
   * and the widest first line, `Wrong Item`, is about 63px at 11px/600 before
   * the sort and filter affordances the engine draws beside it. The registry's
   * own rule — a complete two-line header plus its controls sets the minimum —
   * gives 112.
   */
  receiptQty: 112,
  /**
   * `Supplier DO No.` — THEIRS, not ours, so it obeys no Carres format and
   * has no upper bound the registry can prove. The two-line header
   * (`Supplier` / `DO No.`) needs about 60px at 11px/600 plus the sort and
   * filter affordances; the values seen in production are 8–14 characters at
   * 13px mono (≈110px) plus the shared 16px of padding. 150 holds every one
   * of them and matches the other identity-ish columns beside it; a longer
   * supplier reference wraps rather than truncating.
   */
  supplierDoNo: 150,
} as const;

export type RegisterFieldWidth = keyof typeof REGISTER_FIELD_WIDTH;

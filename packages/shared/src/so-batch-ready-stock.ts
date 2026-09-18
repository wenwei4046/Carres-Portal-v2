import { z } from "zod";

/**
 * ── SO BATCH PURCHASE · READY STOCK — the customer-line contract ────────────
 *
 * The contract for the collapsible table under a buying row's own goods: what
 * free stock could answer it, and the one act that commits an exact Unit to an
 * exact Sales Order ITEM LINE.
 *
 * ⛔ THE SENTENCE THAT USED TO STAND HERE IS OVERWRITTEN, NOT SOFTENED
 * (Law 3; owner ruling 2026-09-18). It read: *an internal replenishment is not
 * owed by any Unit on the shelf, so the Manual Purchase section shows what is
 * there and writes nothing.* That described ONE kind of Manual Purchase while
 * being written as though it described all of them. A Manual Purchase raised
 * for a CONCRETE NEED can now be answered by exact Units, and its saved
 * allocation reduces what is left to buy. The half that survives — an
 * ADDITIONAL replenishment is never netted against the shelf — survives in
 * `manual-purchase-stock.ts`, which owns that lane entirely.
 *
 * The shared vocabulary below (condition words, identity scope, ownership)
 * still serves both surfaces, so `exhibition` cannot read `Display` on one
 * page and `Exhibition` on the other (Law D).
 *
 * THREE THINGS THIS CONTRACT INSISTS ON, and each is a measured defect it
 * exists to close (production, 2026-09-10):
 *
 *  1. A UNIT ANSWERS A LINE, NEVER AN ORDER NUMBER. SO-1251, SO-1207 and
 *     SO-1246 each carry two item lines of the SAME SKU today, so `SO-1251`
 *     cannot say which of them a reserved sofa is for.
 *  2. A COUNTED ROW IS NOT A UNIT. Five `identity_scope = 'quantity'` rows
 *     stand for 893 pieces and wear a `QTY-` key, not a Unit ID (0453). 0368
 *     already ruled bulk is not bindable; the table shows such stock and
 *     refuses to let it be chosen, rather than hiding it and looking wrong.
 *  3. VIEWING IS NOT RESERVING. Reading this table commits nothing. Only
 *     `Choose Ready Unit` writes, and it writes every chosen Unit or none.
 */

/** How a Unit is identified. `quantity` rows carry a key, never a Unit ID. */
export const readyStockIdentityScopeSchema = z.enum(["unit", "quantity"]);

/** Whose goods these are. Consignment stock is reservable (Purchasing MASTER
 *  §7.7 — reservation creates no supplier notice), but the operator has to be
 *  able to SEE that they are committing a supplier's property. */
export const readyStockOwnershipSchema = z.enum(["carres_owned", "supplier_consignment"]);

export const readyStockUnitSchema = z.object({
  itemId: z.string().uuid(),
  /** `U1-000-014`, a legacy `id-…` code, or a `QTY-…` key on a counted row. */
  unitCode: z.string().nullable(),
  identityScope: readyStockIdentityScopeSchema,
  /** The warehouse's own name for the goods — not necessarily the Catalog's. */
  sku: z.string(),
  /** Grade, and it is NOT availability: an Exhibition unit is fully available. */
  condition: z.string().nullable(),
  siteName: z.string().nullable(),
  holderName: z.string().nullable(),
  ownership: readyStockOwnershipSchema,
  supplier: z.string().nullable(),
  /** A counted row stands for several pieces; an exact Unit stands for one. */
  qty: z.number().int(),
  dateIn: z.string().nullable(),
  /** The Unit's OWN source document — the approved stock picker's
   *  `PO No / Ref No` (owner ruling 2026-09-18). Provenance, never the order
   *  that is looking at it: missing provenance stays missing. */
  poNo: z.string().nullable().default(null),
  /** The order's item lines this Unit could answer, by the portal's one key. */
  matchingLineIds: z.array(z.string()),
  /** Why the Unit cannot be chosen, when it cannot. `null` = choosable. */
  blocked: z
    .enum(["counted_stock", "no_line_needs_it"])
    .nullable(),
});
export type ReadyStockUnit = z.infer<typeof readyStockUnitSchema>;

/** One item line of the Sales Order, with what already answers it. */
export const readyStockLineSchema = z.object({
  orderLineId: z.string(),
  sku: z.string(),
  item: z.string(),
  /** What the customer ordered. Never reduced — the original demand stands. */
  qty: z.number().int(),
  /** Units already bound to THIS line (reserved or delivered). */
  reservedQty: z.number().int(),
  reservedUnitCodes: z.array(z.string()),
  /** Units on a non-cancelled purchase order sourced to this line. */
  onPoQty: z.number().int(),
  /** `qty − reservedQty − onPoQty`. What Choose Ready Unit may still answer. */
  remainingQty: z.number().int(),
});
export type ReadyStockLine = z.infer<typeof readyStockLineSchema>;

export const readyStockResponseSchema = z.object({
  orderId: z.string(),
  so: z.number().nullable(),
  /** `SO-1251` — the reference a chosen Unit is committed to. */
  reference: z.string().nullable(),
  lines: z.array(readyStockLineSchema),
  units: z.array(readyStockUnitSchema),
});
export type ReadyStockResponse = z.infer<typeof readyStockResponseSchema>;

/** One pick: this exact Unit, for this exact item line. */
export const readyStockPickSchema = z.object({
  itemId: z.string().uuid(),
  orderLineId: z.string().uuid(),
});
export type ReadyStockPick = z.infer<typeof readyStockPickSchema>;

export const readyStockReserveInputSchema = z.object({
  orderId: z.string().min(1),
  picks: z.array(readyStockPickSchema).min(1).max(50),
});
export type ReadyStockReserveInput = z.infer<typeof readyStockReserveInputSchema>;

export const readyStockReserveResultSchema = z.object({
  reserved: z.number().int(),
  reference: z.string(),
  units: z.array(z.object({ itemId: z.string(), orderLineId: z.string() })),
});
export type ReadyStockReserveResult = z.infer<typeof readyStockReserveResultSchema>;

/**
 * WHY A UNIT CANNOT BE CHOSEN, in the operator's words.
 *
 * Every string here is a FACT about the goods, never an instruction and never
 * an apology — `docs/COPY-STANDARD.md`. A blocked row still SHOWS: hiding the
 * 893 pillows would make the table look empty while the shelf is full.
 */
export const READY_STOCK_BLOCKED_WORDS: Record<
  NonNullable<ReadyStockUnit["blocked"]>,
  string
> = {
  /* `docs/COPY-STANDARD.md`: a quantity-scoped goods line has no Unit ID BY
     LAW, so its Unit ID cell is the absence dash and this column says what
     the goods are instead — never `No Unit ID`, which implies one is owed. */
  counted_stock: "Counted stock",
  /* `Covered` is RETIRED from SO Batch Purchase, never to return. The fact is
     that no item line still needs these goods, and that is what it says. */
  no_line_needs_it: "No item line needs it",
};

/**
 * The refusals the reservation door answers with, in the operator's words.
 * The server sends the code; nothing here is invented in the browser.
 */
export const READY_STOCK_REFUSAL_WORDS: Record<string, string> = {
  order_line_required: "Choose which item line this Unit is for.",
  order_line_not_found: "That item line is no longer on this Sales Order.",
  line_not_in_order: "That item line belongs to a different Sales Order.",
  unit_not_found: "That Unit is no longer in the register.",
  unit_does_not_match_line: "That Unit is not the goods this item line ordered.",
  unit_not_available: "That Unit is not free and sound ready stock.",
  quantity_row_not_bindable: "Counted stock has no Unit ID to commit to one item line.",
  line_already_covered: "That item line is already covered by Ready Stock or a purchase order.",
  /* The outcome is stated ONCE, by the panel, for every refusal alike — the
     door is atomic, so `No Unit was reserved.` is true of all of them and
     saying it twice in this one made the two sentences disagree in length
     about a fact they share. */
  unit_no_longer_free: "Someone else took that Unit.",
  no_units_chosen: "Choose a Unit first.",
  too_many_units: "Choose at most 50 Units at a time.",
  no_reference: "This Sales Order has no number yet.",
};

export function readyStockRefusalWord(code: string | null | undefined): string {
  return (code && READY_STOCK_REFUSAL_WORDS[code]) || "That Unit could not be reserved.";
}

/**
 * ⭐ CONDITION IS A GRADE, AND IT IS NOT AVAILABILITY — one arithmetic, both
 * purchasing surfaces (Law D; owner ruling 2026-09-11).
 *
 * A `Display` unit is FULLY available; the grade is a separate fact and gets
 * its own column rather than being folded into a single "status" word. This
 * map lived in the SO Batch panel as a private constant; the settled Manual
 * Purchase design needs the identical words, and two private copies of a
 * vocabulary is how `exhibition` ends up reading `Display` on one page and
 * `Exhibition` on the other.
 *
 * An unrecognised grade prints ITSELF — never a blank, and never a borrowed
 * word it did not earn.
 */
export const READY_STOCK_CONDITION_WORDS: Record<string, string> = {
  new: "New",
  exhibition: "Display",
  old: "Fair (used)",
  refurbished: "Refurbished",
  damaged: "Damaged",
};

/** `docs/COPY-STANDARD.md` — an absent grade is a stated fact, not a blank. */
export const READY_STOCK_CONDITION_ABSENT = "Not recorded";

export function readyStockConditionWord(condition: string | null | undefined): string {
  if (!condition) return READY_STOCK_CONDITION_ABSENT;
  return READY_STOCK_CONDITION_WORDS[condition] ?? condition;
}

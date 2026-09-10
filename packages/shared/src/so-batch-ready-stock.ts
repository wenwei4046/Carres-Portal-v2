import { z } from "zod";

/**
 * ── READY STOCK — THE ONE CONTRACT, BOTH PURCHASING SURFACES ───────────────
 *
 * The contract for the collapsible table under a buying row's own goods:
 * what free stock could answer it. Written for SO Batch Purchase first; the
 * settled Manual Purchase design (owner ruling 2026-09-11) reads the same
 * vocabulary from here rather than growing a second one, so `Display` can
 * never mean two things on two purchasing pages (Law D).
 *
 * ⭐ THE TWO SURFACES DIFFER IN EXACTLY ONE PLACE, AND IT IS A BUSINESS
 * DIFFERENCE, NOT A STYLE ONE.
 *
 *   SO BATCH      a customer item line is owed goods, so a Unit can be
 *                 COMMITTED to it — `Choose Ready Unit` writes.
 *   MANUAL        an internal replenishment is not owed by any Unit on the
 *                 shelf. The section SHOWS what is there and writes nothing:
 *                 no reservation act is copied across, and a replenishment
 *                 quantity is never automatically reduced by inventory.
 *
 * For SO Batch, what follows is the item-line contract and the one act that
 * commits an exact Unit to an exact line.
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
  unit_no_longer_free: "Someone else took that Unit. Nothing was reserved.",
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

/**
 * ── MANUAL PURCHASE · READY STOCK — the settled design, 2026-09-11 ─────────
 *
 * `Is this product already on our shelf?`, grouped by the goods themselves.
 *
 * FIVE THINGS THIS SHAPE REFUSES TO PRETEND, and every one of them is an
 * owner instruction rather than a taste:
 *
 *  1. **VIEWING IS NEITHER SELECTION NOR RESERVATION.** There is no pick
 *     list, no chosen set and no act — hence no `picks`, no `reserve` input
 *     and no `blocked` reason in this contract. Nothing here can write.
 *  2. **A REPLENISHMENT IS NOT REDUCED BY WHAT IS ON THE SHELF.** The group
 *     states what the request asked for and what exists, side by side. The
 *     ask is never rewritten, and nothing nets one against the other.
 *  3. **MATCHING RESPECTS THE WHOLE CONFIGURATION, NOT THE SKU TEXT.** The
 *     group key is `stockMatchKey` — the portal's one rule, pinned to its
 *     SQL twin by a contract test — so a size or fabric that differs is a
 *     different group rather than a false match.
 *  4. **CONDITION AND AVAILABILITY ARE DIFFERENT FACTS.** Everything offered
 *     is already `available`; `condition` rides beside it as a grade.
 *  5. **A COUNTED ROW IS SHOWN AND IS NOT A UNIT** (0453 · 0368). Hiding
 *     bulk stock would make a full shelf read as an empty one.
 */
export const manualPurchaseReadyStockGroupSchema = z.object({
  /** `stockMatchKey` of the requested SKU — the group's identity. */
  matchKey: z.string(),
  /** The Catalog words the request line prints, so the group is readable. */
  item: z.string(),
  /** Every requested SKU that matched into this group. */
  skus: z.array(z.string()),
  /** What the request ASKED for across those lines. Never reduced here. */
  requestedQty: z.number().int(),
  /** Free pieces on the shelf under this key — exact Units and counted rows. */
  freeQty: z.number().int(),
  units: z.array(readyStockUnitSchema.omit({ matchingLineIds: true, blocked: true })),
});
export type ManualPurchaseReadyStockGroup = z.infer<
  typeof manualPurchaseReadyStockGroupSchema
>;

export const manualPurchaseReadyStockResponseSchema = z.object({
  requestId: z.string(),
  groups: z.array(manualPurchaseReadyStockGroupSchema),
});
export type ManualPurchaseReadyStockResponse = z.infer<
  typeof manualPurchaseReadyStockResponseSchema
>;

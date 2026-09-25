import { z } from "zod";
import { readyStockIdentityScopeSchema, readyStockOwnershipSchema } from "./so-batch-ready-stock";

/**
 * ── MANUAL PURCHASE · READY STOCK ALLOCATION — owner ruling 2026-09-18 ──────
 *
 * `docs/purchasing/MASTER.md` §9.2 · `docs/ui/MASTER.md` §6.8–6.9 ·
 * `docs/COPY-STANDARD.md` Manual Purchase.
 *
 * ⭐ THE RULING THIS FILE EXISTS TO CARRY, AND IT REVERSES A SENTENCE THIS
 * REPOSITORY USED TO STATE AS LAW.
 *
 * Until 2026-09-18 the portal said, in `so-batch-ready-stock.ts` and on the
 * screen: *an internal replenishment is owed by nobody on the shelf, so there
 * is no line to bind to and no act to press.* That was true of ONE kind of
 * Manual Purchase and was written as though it were true of all of them.
 *
 * ```
 * CONCRETE NEED          somebody needs this exact thing. Units already on the
 *                        shelf CAN answer it, and a saved allocation reduces
 *                        what is left to buy.
 * ADDITIONAL STOCK       buying EXTRA on top of what is there. Existing stock
 *                        is reference information and is NEVER netted against
 *                        the ask — that would silently rewrite the request.
 * NOT RECORDED           the request never answered the question. The stock is
 *                        shown read-only and the screen says why, because
 *                        guessing between the two above is exactly what the
 *                        owner forbade.
 * ```
 *
 * The intent is a STORED fact (`purchase_requests.fulfilment_intent`, 0546).
 * It is never inferred from the SKU, from the shelf count, or from the
 * purpose — `Other Purchase` in particular answers nothing at all.
 *
 * ── FIVE THINGS THIS CONTRACT REFUSES TO PRETEND ───────────────────────────
 *
 *  1. A UNIT ANSWERS A LINE, NEVER A DOCUMENT. The binding is the exact
 *     `purchase_demands.id`, because one request routinely carries several
 *     lines and the MPR number cannot say which of them a sofa is for. An MPR
 *     id NEVER reaches the Sales-Order reservation route.
 *  2. VIEWING IS NOT SAVING. Ticking edits a draft and writes nothing.
 *  3. UNKNOWN IS NOT ZERO. Loading, failure and an unrecorded intent are three
 *     distinct states and none of them prints `0`.
 *  4. A COUNTED ROW IS NOT A UNIT (0453 · 0368). Bulk stock shows, with its
 *     key and no checkbox.
 *  5. THE ORIGINAL ASK SURVIVES. `requestedQty` is what was asked for and is
 *     never reduced; the allocation is stated beside it.
 */

/** The stored answer to *what is this purchase for, in allocation terms*. */
export const manualPurchaseIntentSchema = z.enum(["concrete_need", "additional_stock"]);
export type ManualPurchaseIntent = z.infer<typeof manualPurchaseIntentSchema>;

/**
 * WHY THIS LINE CANNOT TAKE A STOCK CHOICE — `null` means it can.
 *
 * Every one is a FACT about the request or the goods, never an apology, and
 * each is DIFFERENT from the others: merging them is how `not recorded` comes
 * to read as `not allowed`.
 */
export const manualPurchaseStockBlockSchema = z.enum([
  /** Waiting for a decision, sent back, refused or withdrawn. */
  "not_approved",
  /** The request records that it is buying EXTRA. */
  "additional_stock",
  /** The request never answered the question. */
  "intent_not_recorded",
  /** Approved, but nothing is left to buy on this line. */
  "nothing_left_to_buy",
  /** The line is marked not going ahead. */
  "line_not_going_ahead",
  /** A request minted before 0546 has no MPR No to commit a Unit to. */
  "request_has_no_number",
]);
export type ManualPurchaseStockBlock = z.infer<typeof manualPurchaseStockBlockSchema>;

/**
 * THE SENTENCES, in the operator's words (`docs/COPY-STANDARD.md`).
 *
 * Each names what is true and, where there is one, the act that changes it.
 * None of them says "not allowed": a person who reads `not allowed` goes
 * looking for a permission, and none of these is about permission.
 */
export const MANUAL_PURCHASE_STOCK_BLOCK_WORDS: Record<ManualPurchaseStockBlock, string> = {
  not_approved: "Stock can be chosen after this purchase is approved.",
  additional_stock:
    "This purchase buys extra stock. What is on the shelf does not reduce it.",
  intent_not_recorded:
    "This purchase did not record whether stock can answer it, so stock cannot be chosen.",
  nothing_left_to_buy: "Nothing is left to buy on this line.",
  line_not_going_ahead: "This line is not going ahead.",
  request_has_no_number: "This purchase has no MPR No, so stock cannot be saved against it.",
};

export function manualPurchaseStockBlockWord(
  block: ManualPurchaseStockBlock | null | undefined,
): string | null {
  return block ? MANUAL_PURCHASE_STOCK_BLOCK_WORDS[block] : null;
}

/**
 * ONE OFFERED UNIT — the stock picker's own row.
 *
 * The approved six columns are `☐ · Goods Received Date · Stock Location ·
 * Supplier · PO No / Ref No (Unit ID on line two) · Condition`, so this shape
 * carries exactly those facts and no more. Every one of them is READ from the
 * stock register: a missing fact stays missing and is never filled in from the
 * purchase that is looking at it.
 */
export const manualPurchaseStockUnitSchema = z.object({
  itemId: z.string(),
  /** `U1-000-014`, a legacy `id-…` code, or a `QTY-…` key on a counted row. */
  unitCode: z.string().nullable(),
  identityScope: readyStockIdentityScopeSchema,
  sku: z.string(),
  /** Physical receipt DATE — no time on this picker, and the stored timestamp
   *  is not discarded to produce it. `null` prints the governed absence. */
  goodsReceivedDate: z.string().nullable(),
  /** Where the Unit is STANDING now, never the purchase's destination. */
  stockLocation: z.string().nullable(),
  /** Who the goods came from, off the stock record. */
  supplier: z.string().nullable(),
  /** The Unit's OWN source document or reference. Never this purchase's. */
  sourceRef: z.string().nullable(),
  /** A GRADE, and it is not availability (0371). */
  condition: z.string().nullable(),
  ownership: readyStockOwnershipSchema,
  qty: z.number().int(),
  /** Saved against THIS exact MPR line — it is held, not free. */
  reservedForThisLine: z.boolean(),
  /** Why it cannot be ticked, or `null`. A blocked row still SHOWS. */
  blocked: z.enum(["counted_stock", "nothing_left_to_buy"]).nullable(),
});
export type ManualPurchaseStockUnit = z.infer<typeof manualPurchaseStockUnitSchema>;

/** Why a Unit on the picker cannot be ticked, in the operator's words. */
export const MANUAL_PURCHASE_STOCK_UNIT_BLOCKED_WORDS: Record<
  NonNullable<ManualPurchaseStockUnit["blocked"]>,
  string
> = {
  /* 0453: a quantity-scoped goods line has no Unit ID by law. */
  counted_stock: "Counted stock",
  nothing_left_to_buy: "Nothing left to buy",
};

/**
 * ONE MANUAL PURCHASE LINE, with everything the goods row and its stock frame
 * have to print.
 *
 * ⭐ `availableQty` AND `reservedQty` ARE TWO NUMBERS AND STAY TWO NUMBERS
 * (COPY-STANDARD: `{n} available` / `{n} reserved`). Reserved means *saved
 * against this exact MPR line* — not "reserved somewhere in the warehouse",
 * which is a fact about somebody else's work.
 */
export const manualPurchaseStockLineSchema = z.object({
  /** `purchase_demands.id` — the binding, and the selection key. */
  demandId: z.string(),
  sku: z.string(),
  item: z.string(),
  /** What the request ASKED for. Never reduced. */
  requestedQty: z.number().int(),
  /** The approver's number when they cut it; `null` = approved as asked. */
  approvedQty: z.number().int().nullable(),
  /** Units of this line already on a purchase order. */
  issuedQty: z.number().int(),
  /** Free pieces on the shelf that match these goods. */
  availableQty: z.number().int(),
  /** Units SAVED against this exact line. */
  reservedQty: z.number().int(),
  /** What is still to BUY: approved − issued − reserved. */
  remainingQty: z.number().int(),
  /** `null` = this line can take a stock choice. */
  stockBlock: manualPurchaseStockBlockSchema.nullable(),
  units: z.array(manualPurchaseStockUnitSchema),
});
export type ManualPurchaseStockLine = z.infer<typeof manualPurchaseStockLineSchema>;

export const manualPurchaseStockResponseSchema = z.object({
  requestId: z.string(),
  /** The MPR No a saved Unit is committed to; `null` on a pre-0546 request. */
  reference: z.string().nullable(),
  /** The STORED answer, or `null` when the request never recorded one. */
  intent: manualPurchaseIntentSchema.nullable(),
  approved: z.boolean(),
  lines: z.array(manualPurchaseStockLineSchema),
});
export type ManualPurchaseStockResponse = z.infer<typeof manualPurchaseStockResponseSchema>;

/**
 * THE SAVE — the COMPLETE desired set for ONE line.
 *
 * Not "add these" and not "remove those": the browser states what it wants the
 * saved set to BE, and the server reconciles in one transaction. That is what
 * makes *remove every Unit* expressible (`itemIds: []`) without a second door,
 * and what makes a half-applied replacement impossible.
 *
 * `expectedItemIds` is the set the browser believed was saved. A different
 * current set means somebody else moved this line, and the whole save is
 * refused rather than silently overwriting their work.
 */
export const manualPurchaseStockSaveInputSchema = z.object({
  demandId: z.string().uuid(),
  itemIds: z.array(z.string().uuid()).max(50),
  expectedItemIds: z.array(z.string().uuid()).max(50).optional(),
});
export type ManualPurchaseStockSaveInput = z.infer<typeof manualPurchaseStockSaveInputSchema>;

export const manualPurchaseStockSaveResultSchema = z.object({
  demandId: z.string(),
  reference: z.string().nullable(),
  reserved: z.number().int(),
  added: z.number().int(),
  removed: z.number().int(),
  unitIds: z.array(z.string()),
  remainingQty: z.number().int(),
});
export type ManualPurchaseStockSaveResult = z.infer<typeof manualPurchaseStockSaveResultSchema>;

/**
 * THE REFUSALS THE ALLOCATION DOOR ANSWERS WITH.
 *
 * The server sends the code; nothing here is invented in the browser. The
 * outcome is stated ONCE by the panel — the save is atomic, so *nothing was
 * saved* is true of every one of them and repeating it inside each sentence
 * made two sentences disagree about a fact they share.
 */
export const MANUAL_PURCHASE_STOCK_REFUSAL_WORDS: Record<string, string> = {
  mpr_line_not_found: "That purchase line is no longer on this Manual Purchase Request.",
  mpr_line_has_no_request: "That purchase line belongs to no Manual Purchase Request.",
  mpr_line_not_going_ahead: "That purchase line is not going ahead.",
  mpr_line_already_covered:
    "That purchase line is already covered by Ready Stock or a purchase order.",
  mpr_line_needs_request_ref: "Stock is saved against this Manual Purchase Request's own number.",
  request_not_approved: "This purchase is not approved.",
  request_not_a_concrete_need:
    "This purchase buys extra stock, so what is on the shelf cannot be saved against it.",
  request_has_no_number: "This purchase has no MPR No to save stock against.",
  unit_not_found: "That Unit is no longer in the register.",
  unit_does_not_match_line: "That Unit is not the goods this purchase line asked for.",
  unit_not_available: "That Unit is not free and sound ready stock.",
  unit_no_longer_free: "Someone else took that Unit.",
  unit_cannot_be_released: "That Unit is no longer held for this purchase.",
  quantity_row_not_bindable: "Counted stock has no Unit ID to commit to one purchase line.",
  stock_selection_changed: "Someone else changed this line's stock.",
  duplicate_unit_chosen: "One Unit was chosen twice.",
  too_many_units: "Choose at most 50 Units at a time.",
  one_binding_only: "That Unit is already held for a Sales Order.",
  forbidden: "You cannot save stock for a Manual Purchase Request.",
};

/** The second line — what to DO about it. Fact, then act (COPY-STANDARD). */
export const MANUAL_PURCHASE_STOCK_REFUSAL_ACTS: Record<string, string> = {
  mpr_line_not_found: "Reopen the Manual Purchase Request to see its lines.",
  mpr_line_has_no_request: "Reopen the Manual Purchase Request to see its lines.",
  mpr_line_not_going_ahead: "Reopen the Manual Purchase Request to see where it is now.",
  mpr_line_already_covered: "Reopen the Manual Purchase Request to see what covers it.",
  mpr_line_needs_request_ref: "Reopen the Manual Purchase Request and choose the Units again.",
  request_not_approved: "Wait for the approver to decide it.",
  request_not_a_concrete_need: "Issue a PO for the extra stock instead.",
  request_has_no_number: "Raise a new Manual Purchase Request for these goods.",
  unit_not_found: "Choose another Unit.",
  unit_does_not_match_line: "Choose a Unit of the goods this line asked for.",
  unit_not_available: "Choose another Unit.",
  unit_no_longer_free: "Choose another Unit.",
  unit_cannot_be_released: "Reopen the Manual Purchase Request to see what holds it now.",
  quantity_row_not_bindable: "Choose a Unit that has its own Unit ID.",
  stock_selection_changed: "Reopen the Manual Purchase Request and choose the Units again.",
  duplicate_unit_chosen: "Choose each Unit once.",
  too_many_units: "Untick some Units, then save again.",
  one_binding_only: "Choose another Unit.",
  forbidden: "Ask Operation to save it.",
};

export function manualPurchaseStockRefusal(code: string | null | undefined): {
  wrong: string;
  todo: string;
} {
  const key = code && MANUAL_PURCHASE_STOCK_REFUSAL_WORDS[code] ? code : null;
  return {
    wrong: key
      ? MANUAL_PURCHASE_STOCK_REFUSAL_WORDS[key]!
      : "The stock selection was not saved.",
    todo: key
      ? MANUAL_PURCHASE_STOCK_REFUSAL_ACTS[key]!
      : "Reopen the Manual Purchase Request and try again. Tell IT if it happens again.",
  };
}

/**
 * ⭐ WHAT A MANUAL PURCHASE LINE STILL HAS TO BUY — ONE ARITHMETIC (Law D).
 *
 * The SQL twin is `purchasing_mpr_line_remaining_requirement` (0546) and the
 * two are the same expression written twice on purpose: the browser needs it
 * to draw a number before the round trip, the door needs it on the locked row
 * so a tab left open cannot over-commit. A contract test pins them together.
 *
 * A cancelled line asks for nothing. An approver's cut REPLACES the ask; it
 * never adds to it.
 */
export function manualPurchaseLineStockRemaining(l: {
  qty: number;
  approvedQty: number | null;
  issuedQty: number;
  reservedQty: number;
  cancelled?: boolean;
}): number {
  if (l.cancelled) return 0;
  const approved = l.approvedQty ?? l.qty;
  return Math.max(0, approved - l.issuedQty - l.reservedQty);
}

/**
 * WHETHER THIS LINE MAY TAKE A STOCK CHOICE, and if not, which fact says so.
 *
 * ⚠️ THE ORDER OF THESE TESTS IS THE RULING'S OWN ORDER and it is not
 * cosmetic. Approval first, because an unapproved request may not save stock
 * whatever its intent. Intent next, because an additional replenishment is
 * read-only even when there is plenty on the shelf. Only then the quantity —
 * so a line that is simply finished says *nothing left to buy* rather than
 * borrowing one of the sentences above it.
 */
export function manualPurchaseStockBlockOf(f: {
  approved: boolean;
  intent: ManualPurchaseIntent | null;
  hasReference: boolean;
  cancelled: boolean;
  remainingQty: number;
  reservedQty: number;
}): ManualPurchaseStockBlock | null {
  if (f.cancelled) return "line_not_going_ahead";
  if (!f.approved) return "not_approved";
  if (f.intent === "additional_stock") return "additional_stock";
  if (f.intent == null) return "intent_not_recorded";
  if (!f.hasReference) return "request_has_no_number";
  /* A line with nothing left to buy is still REACHABLE while it holds saved
     Units: the operator has to be able to take their own choice back. That is
     the whole reason `Change selection` exists, and blocking here would trap
     them behind a number their own save created. */
  if (f.remainingQty <= 0 && f.reservedQty === 0) return "nothing_left_to_buy";
  return null;
}

/**
 * THE PURCHASE-NEED STATUS OF ONE GOODS ROW — `Need PO` · `No PO needed`.
 *
 * ⭐ IT IS NOT THE APPROVAL STATE AND NEVER BORROWS ITS WORDS (owner ruling
 * 2026-09-18). A line can read `Need PO` while the request reads
 * `Need approval`: the goods ARE needed, and the tick is refused for a
 * different reason, which the row states separately.
 *
 * ⚠️ AND UNKNOWN COVERAGE IS NEITHER ANSWER. `known: false` returns `null`,
 * and the caller prints the governed missing-coverage fact instead — guessing
 * `No PO needed` would tell an operator to stop buying something nobody
 * checked.
 */
export type ManualPurchaseNeedStatus = "need_po" | "no_po_needed";

export const MANUAL_PURCHASE_NEED_STATUS_WORDS: Record<ManualPurchaseNeedStatus, string> = {
  need_po: "Need PO",
  no_po_needed: "No PO needed",
};

export function manualPurchaseNeedStatusOf(f: {
  known: boolean;
  remainingQty: number;
  terminal: boolean;
}): ManualPurchaseNeedStatus | null {
  if (f.terminal) return "no_po_needed";
  if (!f.known) return null;
  return f.remainingQty > 0 ? "need_po" : "no_po_needed";
}

/** `{n} available` / `{n} reserved` — two lines, never one merged number. */
export function manualPurchaseStockCounts(f: {
  availableQty: number;
  reservedQty: number;
}): { available: string; reserved: string | null } {
  return {
    available: `${f.availableQty} available`,
    reserved: f.reservedQty > 0 ? `${f.reservedQty} reserved` : null,
  };
}

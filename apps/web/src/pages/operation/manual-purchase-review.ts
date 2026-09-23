/**
 * MANUAL PURCHASE → REVIEW PURCHASE ORDERS — the selection, resolved once
 * (owner instruction 2026-09-23; `docs/purchasing/MASTER.md` §9.2).
 *
 * ── THE DEFECT THIS FILE EXISTS TO CLOSE ──────────────────────────────────
 *
 * The register used to send the chosen LINES only when EVERY selected request
 * had a per-line choice:
 *
 * ```
 * demandIds = chosen.length > 0 && selectedRows.every(r => goodsChoice.has(r.id))
 *   ? chosen : undefined      //  undefined = "the server decides"
 * ```
 *
 * So the mixed case — one request ticked whole, another narrowed to one of its
 * goods — fell into `undefined`, and the door then issued EVERYTHING still
 * open on both requests. The operator had unticked goods that were bought
 * anyway, and the toolbar's `Issue {n} PO(s)` counted them too.
 *
 * ⭐ THE FIX IS ONE LIST, NOT A BETTER CONDITION. `manualPurchaseSelectedWalls`
 * resolves whole-request and narrowed selections into the exact lines being
 * bought; the sentence, the draft documents and the wire are all derived from
 * that one list, so they cannot disagree. A request with an EMPTY choice set
 * contributes nothing — an explicit "none of these" is never widened back into
 * "all of them".
 *
 * The partition itself stays where it was: `manualPurchaseIssueDocuments` in
 * `@carres/shared`, the same five facts the issue door groups by.
 */
import {
  manualPurchaseIssueDocuments,
  type ProductCategory,
  type SoBatchDocument,
} from "@carres/shared";

/** One selectable line, exactly as the Register already computed it. */
export interface ManualPurchaseIssueWall {
  demandId: string;
  supplierId: string | null;
  supplierName: string | null;
  supplierAddress?: string | null;
  category: string | null;
  destinationId: string;
  destinationName: string;
  destinationAddress?: string | null;
  purpose: string;
  purposeLabel: string;
  deliveryDate: string | null;
  /** The PO Delivery Date the server would stamp — read, never computed here. */
  poDeliveryDate?: string | null;
  sku: string;
  item: string;
  note?: string | null;
  requestNo?: string | null;
  purchaseRequirement?: string | null;
  remainingQty: number;
}

export interface ManualPurchaseSelectionRow {
  id: string;
  issueWalls: ManualPurchaseIssueWall[];
}

/**
 * THE EXACT LINES THIS SELECTION BUYS.
 *
 * `choices` holds a per-request narrowing: a request that appears in the map
 * buys only the demand ids in its set, and a request absent from it buys
 * everything still open on it. Nothing here widens either answer.
 */
export function manualPurchaseSelectedWalls(
  rows: readonly ManualPurchaseSelectionRow[],
  choices: ReadonlyMap<string, ReadonlySet<string>>,
): ManualPurchaseIssueWall[] {
  return rows.flatMap((row) => {
    const picked = choices.get(row.id);
    return row.issueWalls.filter(
      (wall) =>
        wall.remainingQty > 0 && (picked == null || picked.has(wall.demandId)),
    );
  });
}

/**
 * THE DOCUMENTS THOSE LINES BECOME — in the shape `Review Purchase Orders`
 * reads, so Manual Purchase and SO Batch Purchase check their papers on ONE
 * surface (Law C: a door, never a duplicate).
 *
 * A line with no Catalog supplier is left out of every document: the issue
 * door refuses it by name (`unresolved_supplier`), and a draft that showed it
 * would promise a purchase order nobody can raise.
 */
export function manualPurchaseReviewDocuments(
  walls: readonly ManualPurchaseIssueWall[],
): SoBatchDocument[] {
  const buyable = walls.filter((wall) => wall.supplierId != null);
  return manualPurchaseIssueDocuments(buyable).map(({ key, lines }) => {
    const first = lines[0]!;
    return {
      key,
      supplierId: first.supplierId!,
      supplierName: first.supplierName,
      supplierAddress: first.supplierAddress ?? null,
      destinationId: first.destinationId,
      destinationName: first.destinationName,
      destinationAddress: first.destinationAddress ?? null,
      poDeliveryDate: first.poDeliveryDate ?? null,
      category: (first.category ?? null) as ProductCategory | null,
      /* A Manual Purchase serves no customer order, so the sofa
         one-PO-per-order rule has nothing to key on. */
      orderId: null,
      qty: lines.reduce((n, line) => n + line.remainingQty, 0),
      supplierKind: null,
      lines: lines.map((line) => ({
        demandId: line.demandId,
        /* The REQUEST is this line's parent record; the review's `1 of n`
           and the evidence step both key on the document, not on this. */
        orderId: line.demandId,
        so: null,
        /* `MPR No` in the Source column — a Manual Purchase has no SO. */
        sourceLabel: line.requestNo ?? null,
        purchaseRequirement: line.purchaseRequirement ?? null,
        item: line.item,
        variant: [line.purposeLabel, line.note].filter(Boolean).join(" · ") || null,
        skus: [line.sku],
        qty: line.remainingQty,
        /* The MPR's own requested arrival date — the fact that SPLIT this
           document from the next one, which is why the review prints it. */
        goodsMustArrive: line.deliveryDate,
        issueRef: { proposalKey: line.demandId, buildKey: line.demandId },
        parts: [{ sku: line.sku, qty: line.remainingQty, unitCost: null }],
      })),
    };
  });
}

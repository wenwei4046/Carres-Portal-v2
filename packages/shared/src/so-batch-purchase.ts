import { z } from "zod";
import type { PurchaseDemandRow, PurchaseDemandState } from "./purchase-demands";

/**
 * SO BATCH PURCHASE — the arrangement a buyer makes BEFORE a purchase order
 * exists (CARD-2026-08-22-purchasing-02; `docs/purchasing/MASTER.md` §§5.1,
 * 5.4, 9.1).
 *
 * ── WHAT THIS FILE IS ALLOWED TO KNOW ───────────────────────────────────────
 *
 * Exactly one thing: **where the goods the server says we must buy should be
 * sent.** It may check that an arrangement adds back to the server's own `Buy`,
 * and it may compose the `supplier × Deliver To` key the server will recompute
 * for itself. It may not net a quantity, resolve a supplier, price a line,
 * choose an arrival date or decide coverage — those are the engine's, and a
 * second implementation of any of them would be a second truth (Law D).
 *
 * `toBuy` arrives here as a NUMBER THIS FILE CANNOT EXPLAIN. That is the point:
 * every function below treats it as given, so there is nowhere for browser
 * arithmetic to grow.
 *
 * ── AND THE ARRANGEMENT IS NOT A STORED FACT ────────────────────────────────
 *
 * It lives in the operator's session until `Issue PO`. A refresh returns to the
 * server default, because *where this buy should go* only becomes truth when
 * the purchase order carries it. Persisting it would create a second demand
 * field that nothing recomputes.
 */

// ─── The words ───────────────────────────────────────────────────────────────

/**
 * Every word this destination spells that its own Register owns
 * (`docs/COPY-STANDARD.md` — the SO Batch Purchase / purchase-demand block).
 *
 * The six STATE words are not repeated here: they live in `purchase-demands.ts`
 * because the states are the demand's, not the page's, and respelling them is
 * exactly how two surfaces start disagreeing.
 */
export const SO_BATCH_PURCHASE_WORDS = {
  destination: "SO Batch Purchase",
  search: "Search Sales Order, customer, SKU or supplier…",
  empty: "Nothing needs buying.",
  /** What the footer's bare numbers count. */
  footerUnit: "buying lines",

  /** Column heads, in the approved order (`docs/purchasing/MASTER.md` §9.1). */
  colSourceSo: "Source SO",
  colRequiredFor: "Required For",
  colSku: "SKU / configuration",
  colRequired: "Required",
  colStock: "Stock",
  colOpenPo: "Open PO",
  buy: "Buy",
  colSupplier: "Supplier",
  deliverTo: "Deliver To",
  goodsMustArrive: "Goods Must Arrive",
  colWork: "Work",

  /** The row inspector's four-number explanation. */
  inspectorRequired: "REQUIRED",
  inspectorFromStock: "FROM STOCK",
  inspectorOnOpenPo: "ON OPEN PO",
  inspectorBuy: "BUY",
  inspectorSource: "Source",
  inspectorRequiredFor: "Required for",
  inspectorGoodsMustArrive: "Goods must arrive",
  inspectorDeliverTo: "Deliver to",

  /** The destination editor. */
  split: "Split",
  splitTotal: "Total",

  /** The issue journey. */
  issuePo: "Issue PO",
  reviewTitle: "Review Purchase Orders",
  backToBuying: "Back to buying",
  previewNotSendable: "This is a preview. Issue PO creates the number.",
} as const;

// ─── The rail ────────────────────────────────────────────────────────────────

export interface SoBatchRailGroup {
  heading: string;
  states: readonly PurchaseDemandState[];
}

/**
 * Two headings over the six governed states, and there is no seventh
 * (`docs/COPY-STANDARD.md` — `Rail heading | BUYING RECORDS · WORK TO DO`).
 *
 * The split is not cosmetic. `BUYING RECORDS` answers *what is the buying
 * position*; `WORK TO DO` answers *what must somebody fix first*. A rail that
 * mixed them would make a blocked line look like a buying choice.
 */
export const SO_BATCH_RAIL_GROUPS: readonly SoBatchRailGroup[] = [
  { heading: "BUYING RECORDS", states: ["ready_to_buy", "covered"] },
  {
    heading: "WORK TO DO",
    states: ["no_customer_date", "no_sku", "no_supplier", "no_production_days"],
  },
] as const;

// ─── Destinations ────────────────────────────────────────────────────────────

export interface PurchasingDestination {
  id: string;
  name: string;
  isDefault: boolean;
  active: boolean;
}

export const purchasingDestinationSchema = z.object({
  id: z.string(),
  name: z.string(),
  isDefault: z.boolean(),
  active: z.boolean(),
});

// ─── Selection ───────────────────────────────────────────────────────────────

export interface DestinationAllocation {
  destinationId: string;
  qty: number;
}

export interface SoBatchSelection {
  demandId: string;
  allocations: DestinationAllocation[];
}

/**
 * Whether this row may be ticked at all.
 *
 * Five conditions, and every one of them is the SERVER's fact: the state it
 * derived, the remainder it computed, the supplier it resolved and the build
 * reference it will accept back. A row missing any of them cannot be turned
 * into a purchase order, so offering a tick-box would be offering an act that
 * fails — the Register refuses it here and the API refuses it again.
 */
export function isSelectableForBuying(row: PurchaseDemandRow): boolean {
  return (
    row.state === "ready_to_buy" &&
    row.toBuy != null &&
    row.toBuy > 0 &&
    row.supplierId != null &&
    row.issueRef != null
  );
}

/** Everything to Carres Klang — the standing Purchasing default (MASTER §5.4). */
export function defaultAllocations(
  row: PurchaseDemandRow,
  defaultDestinationId: string,
): DestinationAllocation[] {
  const qty = row.toBuy ?? 0;
  if (qty <= 0) return [];
  return [{ destinationId: defaultDestinationId, qty }];
}

/**
 * The whole row moves. Returns a NEW selection — the caller's array is left
 * alone, because a React state object that is mutated in place is a re-render
 * that never happens.
 */
export function setDestination(
  selection: SoBatchSelection,
  destinationId: string,
  qty: number,
): SoBatchSelection {
  return {
    demandId: selection.demandId,
    allocations: qty > 0 ? [{ destinationId, qty }] : [],
  };
}

/**
 * The inline split. Two lines aimed at one destination are MERGED and an empty
 * line is dropped — a purchase order that named the same place twice, or named
 * a place it sends nothing to, would be a document nobody could read.
 */
export function splitAllocation(
  selection: SoBatchSelection,
  allocations: readonly DestinationAllocation[],
): SoBatchSelection {
  const merged = new Map<string, number>();
  for (const a of allocations) {
    if (a.qty <= 0) continue;
    merged.set(a.destinationId, (merged.get(a.destinationId) ?? 0) + a.qty);
  }
  return {
    demandId: selection.demandId,
    allocations: [...merged].map(([destinationId, qty]) => ({ destinationId, qty })),
  };
}

export type AllocationCheck = { ok: true } | { ok: false; message: string };

/**
 * The one check this module owns: **does the arrangement add back to the
 * number the server gave us?**
 *
 * It is deliberately unable to compute the target. `row.toBuy` is read, never
 * derived; if the server changes its mind, this check changes with it, and the
 * API repeats the whole thing after its own recomputation anyway. The message
 * prints both numbers because an operator fixing a split needs to know the gap,
 * not that there is one.
 */
export function validateAllocations(
  row: PurchaseDemandRow,
  allocations: readonly DestinationAllocation[],
  destinations: readonly PurchasingDestination[],
): AllocationCheck {
  if (!isSelectableForBuying(row)) {
    return { ok: false, message: "This line cannot be bought yet." };
  }
  const target = row.toBuy ?? 0;
  if (allocations.length === 0) {
    return { ok: false, message: `Choose where the ${target} go.` };
  }
  const byId = new Map(destinations.map((d) => [d.id, d]));
  let total = 0;
  for (const a of allocations) {
    const dest = byId.get(a.destinationId);
    if (!dest) return { ok: false, message: "Choose a Deliver To that exists." };
    if (!dest.active) {
      return { ok: false, message: `${dest.name} is closed. Choose another Deliver To.` };
    }
    if (!Number.isInteger(a.qty) || a.qty <= 0) {
      return { ok: false, message: `${dest.name} needs a whole number above zero.` };
    }
    total += a.qty;
  }
  if (total !== target) {
    return { ok: false, message: `${total} of ${target} arranged.` };
  }
  return { ok: true };
}

// ─── Documents ───────────────────────────────────────────────────────────────

/**
 * ONE PO HAS ONE SUPPLIER AND ONE `Deliver To` (Card §4.2). The key says so and
 * nothing else — no category, no date, no order. Two Sales Orders on the same
 * supplier going to the same place belong on one document; the same supplier
 * going to two places cannot.
 *
 * This key is a HINT. The server recomputes it, and the server's answer wins.
 */
export function documentGroupKey(supplierId: string, destinationId: string): string {
  return `${supplierId}::${destinationId}`;
}

export interface SoBatchDocumentLine {
  demandId: string;
  orderId: string;
  so: number | null;
  item: string;
  variant: string | null;
  skus: string[];
  qty: number;
  goodsMustArrive: string | null;
  issueRef: { proposalKey: string; buildKey: string };
}

export interface SoBatchDocument {
  key: string;
  supplierId: string;
  supplierName: string | null;
  destinationId: string;
  qty: number;
  lines: SoBatchDocumentLine[];
}

/**
 * The documents the operator is about to create, in the order their first line
 * was selected — so `1 of 3` means the same thing on every screen.
 *
 * A selection whose row is unknown or unbuyable is SKIPPED rather than guessed
 * at: a stale tick from before a refetch must not become a purchase order.
 */
export function groupSelectionsIntoDocuments(
  selections: readonly SoBatchSelection[],
  rowsById: ReadonlyMap<string, PurchaseDemandRow>,
): SoBatchDocument[] {
  const docs = new Map<string, SoBatchDocument>();
  for (const selection of selections) {
    const row = rowsById.get(selection.demandId);
    if (!row || !isSelectableForBuying(row) || row.supplierId == null || !row.issueRef) {
      continue;
    }
    for (const a of selection.allocations) {
      if (a.qty <= 0) continue;
      const key = documentGroupKey(row.supplierId, a.destinationId);
      let doc = docs.get(key);
      if (!doc) {
        doc = {
          key,
          supplierId: row.supplierId,
          supplierName: row.supplier,
          destinationId: a.destinationId,
          qty: 0,
          lines: [],
        };
        docs.set(key, doc);
      }
      doc.qty += a.qty;
      doc.lines.push({
        demandId: row.id,
        orderId: row.orderId,
        so: row.so,
        item: row.item,
        variant: row.variant,
        skus: row.skus,
        qty: a.qty,
        goodsMustArrive: row.goodsMustArrive,
        issueRef: row.issueRef,
      });
    }
  }
  return [...docs.values()];
}

// ─── The selection bar ───────────────────────────────────────────────────────

export interface SoBatchSelectionSummary {
  lines: number;
  units: number;
  documents: number;
  /** Empty when nothing is selected — a bar that says `0 selected` is noise. */
  text: string;
}

export function soBatchSelectionSummary(
  selections: readonly SoBatchSelection[],
  rowsById: ReadonlyMap<string, PurchaseDemandRow>,
): SoBatchSelectionSummary {
  const documents = groupSelectionsIntoDocuments(selections, rowsById);
  const lines = new Set(documents.flatMap((d) => d.lines.map((l) => l.demandId))).size;
  const units = documents.reduce((s, d) => s + d.qty, 0);
  if (lines === 0) return { lines: 0, units: 0, documents: 0, text: "" };
  return {
    lines,
    units,
    documents: documents.length,
    text: `${lines} selected · ${units} ${units === 1 ? "unit" : "units"} · Issue ${
      documents.length
    } ${documents.length === 1 ? "PO" : "POs"}`,
  };
}

// ─── The wire ────────────────────────────────────────────────────────────────

export const destinationAllocationSchema = z.object({
  destinationId: z.string().uuid(),
  qty: z.number().int().positive(),
});

export const soBatchSelectionSchema = z.object({
  demandId: z.string().min(1),
  allocations: z.array(destinationAllocationSchema).min(1),
});

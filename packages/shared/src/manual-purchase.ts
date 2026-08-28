/**
 * MANUAL PURCHASE — the request, the approval, the order
 * (CARD-2026-08-18-manual-purchase; docs/purchasing/MASTER.md §3).
 *
 * The words are `docs/COPY-STANDARD.md`'s Manual Purchase block, spelt once
 * here so no screen respells them. The status is ONE arithmetic (Law D) over
 * facts the database stores — only the states a human DECIDES have columns
 * (approval, refusal, cancel); `Ordered` and `Arrived` derive from the lines'
 * `po_id` and its posted receipt, exactly as 0323 ruled and 0359 kept.
 */
import type { ProductCategory } from "./db-types";
import { DEMAND_PURPOSES, type DemandPurpose } from "./to-order";
import { SO_BATCH_RAIL, type SoBatchProductCategory } from "./so-batch-purchase";

/** Every visible word on the Manual Purchase surfaces (COPY-STANDARD). */
export const MANUAL_PURCHASE_WORDS = {
  page: "Manual Purchase",
  newRequest: "+ New request",
  createTitle: "NEW REQUEST",
  send: "Send for approval",
  /** The disabled Send NAMES its gap (the Receiving law: a grey button that
   *  will not say why is banned). The FIRST missing header fact wins, in the
   *  form's own top-to-bottom order. */
  sendNeedsDate: "Send — pick a date",
  sendNeedsWhy: "Send — say why",
  cancel: "Cancel",
  needFor: "Need for",
  neededBy: "Needed by",
  deliverTo: "Deliver to",
  raisedBy: "Raised by",
  why: "Why",
  items: "ITEMS",
  addLine: "+ Add line",
  remove: "Remove",
  alreadyHave: "WHAT WE ALREADY HAVE",
  freeStock: "free stock",
  alreadyOnPo: "already on PO",
  stillNeeded: "still needed",
  /** Register column heads (card §7). */
  colRef: "Ref",
  colWhat: "What",
  colQty: "Qty",
  colStatus: "Status",
} as const;

/**
 * The states (card §5). `Waiting` always names what it waits ON; `Arrived`
 * is a FACT the system observes, never a button.
 */
export type ManualPurchaseStatusKind =
  | "waiting_approval"
  | "waiting_sku"
  | "ready_to_order"
  | "ordered"
  | "arrived"
  | "not_going_ahead";

export const MANUAL_PURCHASE_STATUS_WORDS: Record<ManualPurchaseStatusKind, string> = {
  waiting_approval: "Waiting for approval",
  waiting_sku: "Waiting for the SKU",
  ready_to_order: "Ready to order",
  ordered: "Ordered",
  arrived: "Arrived",
  not_going_ahead: "Not going ahead",
};

/** What the arithmetic reads about one request. All facts, no decisions. */
export interface ManualPurchaseStatusInput {
  approvalRequired: boolean;
  approvedAt: string | null;
  refusedAt: string | null;
  refuseReason: string | null;
  lines: Array<{
    qty: number;
    issuedQty: number;
    remainingQty: number;
    cancelledAt: string | null;
    poId: string | null;
    /** Slice 3 wires this from the linked PO's posted receipt. */
    received?: boolean;
  }>;
}

export interface ManualPurchaseStatus {
  kind: ManualPurchaseStatusKind;
  label: string;
  /** The one small-line fact a register may print under the pill. */
  reasonLabel: string | null;
}

/**
 * THE one status arithmetic. Order of precedence:
 *   Not going ahead  — refused (with its required reason), or every line
 *                      cancelled (0321's door, reason required there too).
 *   Waiting for approval — the switch was ON at creation and nobody decided.
 *   Arrived          — every live line's PO has a posted receipt (slice 3
 *                      feeds `received`; until then no row reaches it).
 *   Ordered          — every live line fully issued onto a PO.
 *   Ready to order   — everything else: approved, or never needed approval.
 */
export function manualPurchaseStatusOf(r: ManualPurchaseStatusInput): ManualPurchaseStatus {
  const live = r.lines.filter((l) => l.cancelledAt === null);

  if (r.refusedAt !== null) {
    return {
      kind: "not_going_ahead",
      label: MANUAL_PURCHASE_STATUS_WORDS.not_going_ahead,
      reasonLabel: r.refuseReason,
    };
  }
  if (r.lines.length > 0 && live.length === 0) {
    return {
      kind: "not_going_ahead",
      label: MANUAL_PURCHASE_STATUS_WORDS.not_going_ahead,
      reasonLabel: null,
    };
  }
  if (r.approvalRequired && r.approvedAt === null) {
    return {
      kind: "waiting_approval",
      label: MANUAL_PURCHASE_STATUS_WORDS.waiting_approval,
      reasonLabel: null,
    };
  }
  if (live.length > 0 && live.every((l) => l.received === true)) {
    return {
      kind: "arrived",
      label: MANUAL_PURCHASE_STATUS_WORDS.arrived,
      reasonLabel: null,
    };
  }
  if (live.length > 0 && live.every((l) => l.remainingQty <= 0 && l.poId !== null)) {
    return {
      kind: "ordered",
      label: MANUAL_PURCHASE_STATUS_WORDS.ordered,
      reasonLabel: null,
    };
  }
  return {
    kind: "ready_to_order",
    label: MANUAL_PURCHASE_STATUS_WORDS.ready_to_order,
    reasonLabel: null,
  };
}

/**
 * `still needed` — THE printed arithmetic (card §3: printed, never left to
 * the reader). Free stock and open-PO cover both count against the ask.
 */
export function stillNeededOf(qty: number, free: number, alreadyOnPo: number): number {
  return Math.max(0, qty - Math.max(0, free) - Math.max(0, alreadyOnPo));
}

// ─── The rail — PURCHASING CARD 03, owner ruling 2026-08-28 ──────────────────

/**
 * THE MANUAL PURCHASE RAIL CONTRACT (Card 03;
 * `docs/purchasing/MASTER.md` §9.2; `docs/COPY-STANDARD.md`).
 *
 * Four sections, in this exact order, drawn on the shared 240px
 * `FilterRail` shell (Card 02-C; `docs/ui/MASTER.md` — LOCAL FILTER RAIL).
 *
 *   TO ORDER          the three derived request states worth walking to:
 *                     `All not ordered` (live quantity not yet fully issued
 *                     to a PO), `Need approval` (submitted, awaiting the
 *                     configured approver), `Ready to order` (approved
 *                     remainder for PO Duty).
 *   PURCHASE PURPOSE  the five approved purposes — `DEMAND_PURPOSES`, the one
 *                     creatable list. A retired historical value matches no
 *                     row and lives under `All purposes` only.
 *   PRODUCT           the CATALOG's categories — the same three-row authority
 *                     SO Batch Purchase draws, never SKU-text inference.
 *   SUPPLIER          actual names, dynamic and alphabetical — the demand
 *                     line's Catalog-derived supplier, never chosen by
 *                     Operation, never hardcoded, never a placeholder.
 *
 * The rail is NAVIGATION, not selection: no checkboxes, one filter per
 * section, sections combine with AND, each `All …` row clears only its own
 * section, and the empty filter is the permanent Register — ordered history
 * included. What Card 02-C §10 bans stays banned: no `ORDER TIMING`, no
 * Safety-days arithmetic, no `Ordered` / receipt / cancel rows, no
 * missing-SKU or missing-supplier facet — a hole in Catalog is named on the
 * affected request and fixed at its owning boundary.
 */
export const MANUAL_PURCHASE_RAIL = {
  toOrder: {
    heading: "TO ORDER",
    rows: [
      { state: "not_ordered", word: "All not ordered" },
      { state: "need_approval", word: "Need approval" },
      { state: "ready_to_order", word: "Ready to order" },
    ],
  },
  purpose: { heading: "PURCHASE PURPOSE", all: "All purposes", rows: DEMAND_PURPOSES },
  /** The Catalog category rows — SO Batch's own list, shared so the two rails
   *  cannot drift (Law D). */
  product: SO_BATCH_RAIL.product,
  supplier: { heading: "SUPPLIER", all: "All suppliers" },
} as const;

export type ManualPurchaseToOrderState =
  (typeof MANUAL_PURCHASE_RAIL.toOrder.rows)[number]["state"];

/**
 * WHAT THE OPERATOR HAS PICKED — one slot per section; `null` is that
 * section's `All …`. Different sections combine with AND; clearing every slot
 * restores the complete permanent Register, Ordered records included.
 */
export interface ManualPurchaseRailFilter {
  toOrder: ManualPurchaseToOrderState | null;
  purpose: DemandPurpose | null;
  product: SoBatchProductCategory | null;
  supplier: string | null;
}

export const MANUAL_PURCHASE_RAIL_CLEAR: ManualPurchaseRailFilter = {
  toOrder: null,
  purpose: null,
  product: null,
  supplier: null,
};

/**
 * Whether a request in this derived status matches a `TO ORDER` row. The rows
 * are DERIVED REQUEST TRUTH (`manualPurchaseStatusOf`), never a stored
 * status: `not_ordered` is every request whose live quantity is not yet fully
 * issued (waiting states + ready), so a fully Ordered/Arrived request leaves
 * it while staying in the Register, and a refused / fully-cancelled request
 * (`Not going ahead`) is not awaiting ordering and never counts.
 */
export function manualPurchaseToOrderMatches(
  status: ManualPurchaseStatusKind,
  row: ManualPurchaseToOrderState,
): boolean {
  switch (row) {
    case "not_ordered":
      return (
        status === "waiting_approval" ||
        status === "waiting_sku" ||
        status === "ready_to_order"
      );
    case "need_approval":
      return status === "waiting_approval";
    case "ready_to_order":
      return status === "ready_to_order";
  }
}

/**
 * One request's rail-relevant facts, projected once from the register read:
 * the derived status, the stored purpose, the CATALOG's categories on the
 * request's live lines (the API reads `product_models.category`; SKU text
 * never decides), and the actual supplier names behind those lines (the
 * Catalog-derived `supplier_id` recorded at creation — 0323/0359 — which the
 * issuance walls carry onto any PO unchanged). This file combines and counts;
 * it derives nothing new.
 */
export interface ManualPurchaseRailFacts {
  requestId: string;
  status: ManualPurchaseStatusKind;
  purpose: string;
  categories: ReadonlySet<ProductCategory>;
  suppliers: ReadonlySet<string>;
}

export function manualPurchaseRailFacts(
  rows: readonly {
    requestId: string;
    status: ManualPurchaseStatusKind;
    purpose: string;
    lineCategories: readonly (ProductCategory | null | undefined)[];
    lineSupplierNames: readonly (string | null | undefined)[];
  }[],
): ManualPurchaseRailFacts[] {
  return rows.map((r) => ({
    requestId: r.requestId,
    status: r.status,
    purpose: r.purpose,
    categories: new Set(
      r.lineCategories.filter((c): c is ProductCategory => c != null),
    ),
    suppliers: new Set(
      r.lineSupplierNames.filter((s): s is string => s != null && s !== ""),
    ),
  }));
}

type ManualPurchaseRailSection = "toOrder" | "purpose" | "product" | "supplier";

/** Does this request pass every selected section — except, optionally, one? */
function railMatches(
  f: ManualPurchaseRailFacts,
  filter: ManualPurchaseRailFilter,
  except?: ManualPurchaseRailSection,
): boolean {
  if (
    except !== "toOrder" &&
    filter.toOrder != null &&
    !manualPurchaseToOrderMatches(f.status, filter.toOrder)
  ) {
    return false;
  }
  if (except !== "purpose" && filter.purpose != null && f.purpose !== filter.purpose) {
    return false;
  }
  if (except !== "product" && filter.product != null && !f.categories.has(filter.product)) {
    return false;
  }
  if (except !== "supplier" && filter.supplier != null && !f.suppliers.has(filter.supplier)) {
    return false;
  }
  return true;
}

/**
 * WHAT THE RAIL PRINTS (Card 03 §4). Every count is UNIQUE Manual Purchase
 * requests — never lines, SKU quantities, POs or notifications — and every
 * section's counts are computed under the OTHER sections' selections, so the
 * printed number predicts exactly the rows a click would show. The fixed rows
 * print their live count, zero included; a supplier row exists only while it
 * matches, except the selected supplier, which stays visible with `0`.
 */
export interface ManualPurchaseRailModel {
  /** Requests passing every selected filter — what the Register shows. */
  visibleRequestIds: ReadonlySet<string>;
  toOrderCounts: Record<ManualPurchaseToOrderState, number>;
  purposeCounts: Record<DemandPurpose, number>;
  productCounts: Record<SoBatchProductCategory, number>;
  /** Actual names, alphabetical. Never hardcoded, never a placeholder. */
  suppliers: Array<{ name: string; count: number }>;
}

export function manualPurchaseRailModel(
  facts: readonly ManualPurchaseRailFacts[],
  filter: ManualPurchaseRailFilter,
): ManualPurchaseRailModel {
  const count = (
    section: ManualPurchaseRailSection,
    has: (f: ManualPurchaseRailFacts) => boolean,
  ) => facts.filter((f) => railMatches(f, filter, section) && has(f)).length;

  const toOrderCounts = {} as Record<ManualPurchaseToOrderState, number>;
  for (const row of MANUAL_PURCHASE_RAIL.toOrder.rows) {
    toOrderCounts[row.state] = count("toOrder", (f) =>
      manualPurchaseToOrderMatches(f.status, row.state),
    );
  }
  const purposeCounts = {} as Record<DemandPurpose, number>;
  for (const p of MANUAL_PURCHASE_RAIL.purpose.rows) {
    purposeCounts[p.value] = count("purpose", (f) => f.purpose === p.value);
  }
  const productCounts = {} as Record<SoBatchProductCategory, number>;
  for (const c of MANUAL_PURCHASE_RAIL.product.categories) {
    productCounts[c.category] = count("product", (f) => f.categories.has(c.category));
  }

  const supplierCounts = new Map<string, number>();
  for (const f of facts) {
    if (!railMatches(f, filter, "supplier")) continue;
    for (const name of f.suppliers) {
      supplierCounts.set(name, (supplierCounts.get(name) ?? 0) + 1);
    }
  }
  /* The selected supplier stays visible with 0 while another section
     temporarily removes its matches — a filter the operator cannot see is a
     narrowing they cannot clear. */
  if (filter.supplier != null && !supplierCounts.has(filter.supplier)) {
    supplierCounts.set(filter.supplier, 0);
  }

  return {
    visibleRequestIds: new Set(
      facts.filter((f) => railMatches(f, filter)).map((f) => f.requestId),
    ),
    toOrderCounts,
    purposeCounts,
    productCounts,
    suppliers: [...supplierCounts]
      .map(([name, n]) => ({ name, count: n }))
      .sort((a, b) => a.name.localeCompare(b.name)),
  };
}

/**
 * Card 03 §3 — the rail says `Need approval`; the Register and object print
 * the REAL action owner's name. One sentence, spelt once: `Jess approves`,
 * `Jess or YJ approves` when several hold the duty. No approver resolved
 * prints nothing — an absent name is honest; a guessed one is not.
 */
export function manualPurchaseApproverLine(
  names: ReadonlyArray<string | null | undefined>,
): string | null {
  const real = names.filter((n): n is string => n != null && n.trim() !== "");
  if (real.length === 0) return null;
  return `${real.join(" or ")} approves`;
}

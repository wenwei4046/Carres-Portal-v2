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

import { DEMAND_PURPOSES, isDemandPurpose, type DemandPurpose } from "./to-order";

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

// ─── The left filter rail (Card 03, owner-approved 2026-08-28) ───────────────

/**
 * THE MANUAL PURCHASE RAIL — the shared 240px `FilterRail` shell, Card 02-C's
 * grammar imported exactly as that card ordered ("Manual Purchase later
 * imports the same shell, grammar, Product authority and unique-object count
 * rule"). Four groups, in this exact order; the rail is NAVIGATION, not
 * selection — no rail row ever grows a checkbox. One filter per section;
 * sections combine with AND; an `All…` row clears only its own section.
 *
 * Never rendered here (Card 03 §1): `Supplier not selected` · `No supplier` ·
 * `Not in catalog` · `Need price` · `Ordered` · `Part received` · `Received` ·
 * `Arrived` · `Cancelled` · `My drafts` · `Need correction` · `Queues` ·
 * `ORDER TIMING` · safety-days rows. A missing SKU or supplier is named inside
 * the affected request, never made a rail facet.
 */
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

export const MANUAL_PURCHASE_RAIL = {
  toOrder: {
    heading: "TO ORDER",
    rows: [
      { state: "not_ordered", word: "All not ordered" },
      { state: "need_approval", word: "Need approval" },
      { state: "ready_to_order", word: "Ready to order" },
    ],
  },
  purpose: {
    heading: "PURCHASE PURPOSE",
    all: "All purposes",
    /** The five approved purposes, in the approved order — `DEMAND_PURPOSES`
     *  is the one dictionary (Law D), already spelt in the rail's order. */
    purposes: DEMAND_PURPOSES,
  },
  product: {
    heading: "PRODUCT",
    all: "All products",
    /** The Product authority is SO Batch's own — the CATALOG categories,
     *  never SKU text (Card 02-C's rule, imported not copied). */
    categories: [
      { category: "mattress", word: "Mattress" },
      { category: "bedframe", word: "Bedframe" },
      { category: "sofa", word: "Sofa" },
    ],
  },
  supplier: { heading: "SUPPLIER", all: "All suppliers" },
} as const;

export type ManualPurchaseToOrderState =
  (typeof MANUAL_PURCHASE_RAIL.toOrder.rows)[number]["state"];
export type ManualPurchaseProductCategory =
  (typeof MANUAL_PURCHASE_RAIL.product.categories)[number]["category"];

/**
 * WHAT THE OPERATOR HAS PICKED — one slot per section; `null` is that
 * section's `All`/clear. A second click on a selected row clears it.
 */
export interface ManualPurchaseRailFilter {
  toOrder: ManualPurchaseToOrderState | null;
  purpose: DemandPurpose | null;
  product: ManualPurchaseProductCategory | null;
  supplier: string | null;
}

export const MANUAL_PURCHASE_RAIL_CLEAR: ManualPurchaseRailFilter = {
  toOrder: null,
  purpose: null,
  product: null,
  supplier: null,
};

/**
 * One request's rail-relevant facts, derived ONCE from the register's own rows
 * and the request's one status arithmetic — the model below combines and
 * counts them; it derives nothing new.
 */
export interface ManualPurchaseRailFacts {
  requestId: string;
  /** `Need approval` — awaiting the configured approver's decision. */
  needApproval: boolean;
  /** `Ready to order` — approved (or never gated), with remaining quantity
   *  for PO Duty to issue. */
  readyToOrder: boolean;
  /** `All not ordered` — live quantity not yet fully issued to a PO: the
   *  union of the two states above. */
  notOrdered: boolean;
  /** The stored purpose when it is one of the approved five; a LEGACY token
   *  matches no purpose filter and lives under `All purposes` only. */
  purpose: DemandPurpose | null;
  /** The CATALOG's categories on the request's live lines. */
  categories: ReadonlySet<string>;
  /** Derived supplier names: line Catalog supplier + issued PO lineage. */
  suppliers: ReadonlySet<string>;
}

/**
 * The facts for one request. `issuable` is the `/issue` door's own remainder
 * arithmetic — `coalesce(approved_qty, qty) − issued_qty` over live lines —
 * called on the same rows, never a second version.
 */
export function manualPurchaseRailFactsOf(r: {
  requestId: string;
  status: ManualPurchaseStatusKind;
  purpose: string;
  lines: Array<{
    cancelledAt: string | null;
    qty: number;
    approvedQty: number | null;
    issuedQty: number;
    category: string | null;
    supplierNames: Array<string | null>;
  }>;
}): ManualPurchaseRailFacts {
  const live = r.lines.filter((l) => l.cancelledAt === null);
  const issuable = live.some(
    (l) => Math.max(0, Number(l.approvedQty ?? l.qty) - Number(l.issuedQty ?? 0)) > 0,
  );
  const needApproval = r.status === "waiting_approval";
  const readyToOrder = r.status === "ready_to_order" && issuable;
  return {
    requestId: r.requestId,
    needApproval,
    readyToOrder,
    notOrdered: needApproval || readyToOrder,
    purpose: isDemandPurpose(r.purpose) ? r.purpose : null,
    categories: new Set(
      live.map((l) => l.category).filter((c): c is string => c != null && c !== ""),
    ),
    suppliers: new Set(
      live
        .flatMap((l) => l.supplierNames)
        .filter((s): s is string => s != null && s !== ""),
    ),
  };
}

type ManualPurchaseRailSection = "toOrder" | "purpose" | "product" | "supplier";

function toOrderMatches(f: ManualPurchaseRailFacts, s: ManualPurchaseToOrderState): boolean {
  if (s === "not_ordered") return f.notOrdered;
  if (s === "need_approval") return f.needApproval;
  return f.readyToOrder;
}

/** Does this request pass every selected section — except, optionally, one? */
function railMatches(
  f: ManualPurchaseRailFacts,
  filter: ManualPurchaseRailFilter,
  except?: ManualPurchaseRailSection,
): boolean {
  if (except !== "toOrder" && filter.toOrder != null && !toOrderMatches(f, filter.toOrder)) {
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
 * WHAT THE RAIL PRINTS. Every count is UNIQUE Manual Purchase requests —
 * never lines, SKU quantities or POs — and every section's counts are computed
 * under the OTHER sections' selections, so the printed number predicts exactly
 * the rows a click would show (Card 02-C's count rule, imported). The fixed
 * rows print their live count, zero included; a supplier row exists only while
 * it matches — except the selected supplier, which stays visible with `0`.
 */
export interface ManualPurchaseRailModel {
  /** Requests passing every selected filter — what the Register shows. */
  visibleRequestIds: ReadonlySet<string>;
  toOrderCounts: Record<ManualPurchaseToOrderState, number>;
  purposeCounts: Record<DemandPurpose, number>;
  productCounts: Record<ManualPurchaseProductCategory, number>;
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
    toOrderCounts[row.state] = count("toOrder", (f) => toOrderMatches(f, row.state));
  }
  const purposeCounts = {} as Record<DemandPurpose, number>;
  for (const p of MANUAL_PURCHASE_RAIL.purpose.purposes) {
    purposeCounts[p.value] = count("purpose", (f) => f.purpose === p.value);
  }
  const productCounts = {} as Record<ManualPurchaseProductCategory, number>;
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
     narrowing they cannot clear (Card 02-C's rule, imported). */
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

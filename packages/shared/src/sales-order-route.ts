/**
 * Sales Order Route — TWO LAYERS OF FACT, and no third.
 *
 * ⭐ OWNER FINAL RULING 2026-08-15 (the ten points). This module is a read-only
 * projection of facts owned elsewhere. It has no workflow state, no writer and
 * no hand-tickable mark.
 *
 * ```
 * LAYER 1  ORDER TRACKS      GOODS · STOCK · DELIVERY · MONEY — four FIXED
 *                            parallel facts, always rendered, NEVER combined
 *                            into an overall Sales Order status.
 *          LINKED PROBLEMS   conditional, visually separate. Service is NEVER
 *                            a fifth track: no operator may read Service as a
 *                            stage every Sales Order passes through.
 * LAYER 2  GOODS ROUTES      one block per goods line, branching by quantity,
 *                            source and destination into sub-lanes. `CURRENT`
 *                            belongs to a SUB-LANE, never to the Sales Order —
 *                            `YOU ARE HERE` is withdrawn.
 *          DELIVERY RELEASE  the derived gate summary. Read-only, NO release
 *                            button: the act lives in the owning module.
 * ```
 *
 * TWO RULES THIS FILE EXISTS TO HOLD:
 *
 * 1. **A `✓` costs real completion evidence.** A station is complete only when
 *    it can name its document, its labelled date and the door to the object
 *    that owns it. Nothing is ticked because the next thing started.
 * 2. **The balance fact and the release decision are TWO facts.** A manager
 *    release lifts the HOLD; it never erases or hides the outstanding amount
 *    (`orderMoney` already separates `holding` from `outstanding` — §8).
 *
 * Dates travel as ISO with their MEANING attached (`Issued: 2026-08-13`); the
 * page spells them through the one date format. A bare date never ships.
 */

import { deliveryGroupOf, type DeliveryGroupKey } from "./delivery-groups";
import { fmtMoney } from "./money-format";
import type { AllocationUnit, SalesOrderAllocation } from "./sales-order-allocation";
import { normalizeSkuKey } from "./sku-code";

/* ─────────────────────────────────────────────────────────────────────────────
 * The vocabulary of a mark. Four marks, and each one means one thing.
 * ──────────────────────────────────────────────────────────────────────────── */

/** `✓` complete · `●` in progress / CURRENT · `○` not started · `⚠` blocked. */
export type RouteMark = "complete" | "current" | "waiting" | "blocked";

/** A track carries no `○`: a track that has not started is in progress. */
export type TrackMark = "complete" | "current" | "blocked";

export interface RouteDoor {
  /** The governed door word, e.g. `Open PO-2048 →`. */
  label: string;
  href: string;
}

/* ── Layer 1 ──────────────────────────────────────────────────────────────── */

export type OrderTrackKey = "goods" | "stock" | "delivery" | "money";

export interface OrderTrack {
  key: OrderTrackKey;
  title: "GOODS" | "STOCK" | "DELIVERY" | "MONEY";
  mark: TrackMark;
  /** One factual line. A blocked track always states its reason here. */
  status: string;
  door: RouteDoor | null;
}

export interface LinkedProblem {
  id: string;
  /** `SC-1031 · Investigation in progress` */
  title: string;
  door: RouteDoor;
}

/* ── Layer 2 · a station ──────────────────────────────────────────────────── */

/** Who the action-engine line belongs to. The page resolves the person; this
 *  module never knows a staff name. */
export type StationOwnerKey = "purchasing" | "receiving" | "stock" | "delivery";

export interface StationAction {
  ownerKey: StationOwnerKey;
  /** The act, in the governed voice: `Confirm the ready date`. */
  label: string;
}

export interface RouteStation {
  id: string;
  /** `PURCHASING` · `SUPPLIER` · `RECEIVING` · `STOCK` · `SALES ORDER` */
  title: string;
  mark: RouteMark;
  /** Completion evidence — document number plus its labelled date. Present
   *  only on a `✓`; that is what makes the tick cost something. */
  evidence: string | null;
  /** The factual status line for `●` · `○` · `⚠`. */
  status: string | null;
  action: StationAction | null;
  door: RouteDoor | null;
  /** Exactly one station per sub-lane carries this. */
  current: boolean;
}

export type SubLaneSource = "ready-stock" | "delivered" | "purchase" | "unassigned";

export interface GoodsSubLane {
  id: string;
  /** `Qty 2 · PURCHASE` — quantity first, then where it comes from. */
  title: string;
  qty: number;
  source: SubLaneSource;
  /** `Carres Klang` — Purchasing's own destination answer, never inferred. */
  destination: string | null;
  stations: RouteStation[];
}

export interface GoodsRoute {
  id: string;
  /** `B1201S · King · Qty 3` */
  title: string;
  qty: number;
  /** A cancelled line renders one grey line and no stations. */
  cancelled: boolean;
  /** `Cancelled · Rev 3` */
  cancelledWord: string | null;
  /** The SALES ORDER station every route starts from. */
  origin: RouteStation | null;
  lanes: GoodsSubLane[];
  /** True when the quantity forks — the page draws the branch only then. */
  forked: boolean;
}

/* ── Layer 2 · the release gate ───────────────────────────────────────────── */

export type ReleaseRequirementId = "goods" | "money" | "appointment";

export interface ReleaseRequirement {
  id: ReleaseRequirementId;
  mark: RouteMark;
  /** `Goods not ready` · `Money release cleared` · `Appointment not confirmed` */
  title: string;
  /** The supporting facts, one per line. Never a substitute for the title. */
  details: string[];
}

export interface DeliveryRelease {
  ready: boolean;
  /** `READY FOR DELIVERY` / `NOT READY FOR DELIVERY` */
  headline: string;
  /** `All release requirements are complete.` / `3 requirements still open` */
  summary: string;
  openCount: number;
  requirements: ReleaseRequirement[];
  /** The ONLY control on this block. The release act belongs to Delivery. */
  door: RouteDoor;
}

export interface SalesOrderRoute {
  orderId: string;
  soNumber: string;
  customerName: string | null;
  tracks: OrderTrack[];
  linkedProblems: LinkedProblem[];
  goodsRoutes: GoodsRoute[];
  release: DeliveryRelease;
}

/* ─────────────────────────────────────────────────────────────────────────────
 * The input — every field is a fact somebody else owns.
 * ──────────────────────────────────────────────────────────────────────────── */

export interface RoutePurchaseOrder {
  id: string;
  /** `purchase_orders.placed_at` — the day the PO was issued. */
  issuedAt: string | null;
  /** `purchase_orders.expected_ready_date` — what the SUPPLIER confirmed.
   *  Null means the supplier has not confirmed; it is never guessed. */
  expectedReadyDate: string | null;
  lines: ReadonlyArray<{ sku: string; qty: number; receivedQty: number }>;
}

export interface RouteReceivingRecord {
  id: string;
  recordNo: string;
  poId: string;
  receivedAt: string | null;
}

export interface RouteDeliveryAttempt {
  id: string;
  attemptNo: number;
  result: "delivered" | "partial" | "failed";
  reason: string | null;
  doNumber: string | null;
  scheduledDate: string | null;
  recordedAt: string | null;
}

export interface RouteLinkedCase {
  id: string;
  caseNo: string;
  /** Already translated by its owning module — no internal enum reaches here. */
  statusLabel: string | null;
  closed: boolean;
}

export interface RouteLinkedClaim {
  id: string;
  claimNo: string;
  statusLabel: string | null;
  closed: boolean;
}

export interface SalesOrderRouteInput {
  order: {
    id: string;
    so: number;
    customerName: string | null;
    /** `orders.placed_at` — printed as `Ordered:`. */
    placedAt: string | null;
    /** The customer's promise — printed as `Customer requested:`. */
    deliveryDate: string | null;
    deliveredAt: string | null;
  };
  /** Friendly product names keyed by the committed SKU. */
  lineLabels?: Readonly<Record<string, string>>;
  /** Purchasing's own Deliver To answer per SKU, including quantity splits.
   *  Sales Order stores neither the destination nor its split. */
  lineDestinations?: Readonly<Record<string, ReadonlyArray<{ name: string; qty: number }>>>;
  /** Lines a governed Revision removed. The route always reflects the CURRENT
   *  effective Revision; a cancelled line states its outcome and stops. */
  cancelledLines?: ReadonlyArray<{ sku: string; label?: string | null; qty: number; revision: number }>;
  allocation: SalesOrderAllocation;
  purchaseOrders: ReadonlyArray<RoutePurchaseOrder>;
  receivingRecords: ReadonlyArray<RouteReceivingRecord>;
  delivery: {
    booking: {
      confirmedDate: string | null;
      slot: string | null;
      /** The delivery groups THIS trip carries. Null = the whole order. */
      scope: ReadonlyArray<DeliveryGroupKey> | null;
    } | null;
    attempts: ReadonlyArray<RouteDeliveryAttempt>;
  };
  /** Straight from `orderMoney` — this module never recomputes the number. */
  money: {
    known: boolean;
    outstanding: number;
    /** `holds` false with `outstanding` above zero IS a manager release. */
    holds: boolean;
  };
  cases: ReadonlyArray<RouteLinkedCase>;
  claims: ReadonlyArray<RouteLinkedClaim>;
}

/* ─────────────────────────────────────────────────────────────────────────────
 * Doors — one spelling per destination.
 * ──────────────────────────────────────────────────────────────────────────── */

const poHref = (poId: string) => `/operation/procurement?po=${encodeURIComponent(poId)}`;
const purchasingHref = "/operation?tab=purchase";
const receivingHref = (recordId: string) =>
  `/operation?tab=receiving&receipt=${encodeURIComponent(recordId)}`;
const stockHref = "/operation?tab=stock-onhand";
const deliveryHref = (orderId: string) =>
  `/operation?tab=delivery&order=${encodeURIComponent(orderId)}`;
const paymentsHref = (so: number) => `/operation?tab=payments&so=${so}`;
const caseHref = (caseId: string) =>
  `/operation?tab=service-notes&case=${encodeURIComponent(caseId)}`;
const claimHref = (claimId: string) =>
  `/operation?tab=claims&claim=${encodeURIComponent(claimId)}`;
const orderHref = (orderId: string) => `/operation/orders/so/${encodeURIComponent(orderId)}`;

const door = (label: string, href: string): RouteDoor => ({ label, href });
const open = (what: string, href: string): RouteDoor => door(`Open ${what} →`, href);

/** `1 item` / `2 items` — a count that reads like a sentence. */
const items = (n: number) => `${n} ${n === 1 ? "item" : "items"}`;
const units = (n: number) => `${n} ${n === 1 ? "Unit" : "Units"}`;
/** `fmtMoney` already carries `RM` — the ONE money spelling, not a second one. */
const ringgit = (n: number) => fmtMoney(n);

/** A date never ships bare — its meaning travels with it. */
const dated = (label: string, iso: string | null) => (iso ? `${label}: ${iso}` : null);

const skuKey = (sku: string) => normalizeSkuKey(sku) || sku;

const unitQty = (unit: AllocationUnit) =>
  Number.isFinite(unit.qty) && unit.qty > 0 ? Math.floor(unit.qty) : 1;

const unitNames = (list: ReadonlyArray<AllocationUnit>) =>
  list.map((unit) => unit.unitCode ?? unit.id).join(" · ");

/* ─────────────────────────────────────────────────────────────────────────────
 * Stations.
 * ──────────────────────────────────────────────────────────────────────────── */

interface StationDraft {
  id: string;
  title: string;
  /** Complete stations carry evidence; everything else carries a status. */
  complete: boolean;
  blocked?: boolean;
  evidence?: string | null;
  status?: string | null;
  action?: StationAction | null;
  door?: RouteDoor | null;
}

/**
 * THE ONE PLACE `CURRENT` IS DECIDED. The first station that is not complete
 * is where the work stands: it renders `●` (or `⚠` when it is blocked) and
 * carries `CURRENT`. Every station after it is `○` — not started, and said in
 * primary-school English rather than a dash.
 */
function seal(drafts: StationDraft[]): RouteStation[] {
  let currentTaken = false;
  return drafts.map((draft) => {
    const isCurrent = !draft.complete && !currentTaken;
    if (isCurrent) currentTaken = true;
    const mark: RouteMark = draft.complete
      ? "complete"
      : draft.blocked
        ? "blocked"
        : isCurrent
          ? "current"
          : "waiting";
    return {
      id: draft.id,
      title: draft.title,
      mark,
      evidence: draft.complete ? (draft.evidence ?? null) : null,
      status: draft.complete ? null : (draft.status ?? null),
      /* An action belongs to the position being worked, not to a queue of
         stations nobody has reached. */
      action: isCurrent ? (draft.action ?? null) : null,
      door: draft.door ?? null,
      current: isCurrent,
    };
  });
}

/* ─────────────────────────────────────────────────────────────────────────────
 * Layer 2 · goods routes.
 * ──────────────────────────────────────────────────────────────────────────── */

interface LineFacts {
  sku: string;
  label: string;
  committedQty: number;
  reservedUnits: AllocationUnit[];
  soldUnits: AllocationUnit[];
  reservedQty: number;
  soldQty: number;
  outstandingQty: number;
}

interface PurchaseSlice {
  po: RoutePurchaseOrder;
  qty: number;
  orderedQty: number;
  receivedQty: number;
}

/**
 * How much of this line each matching PO covers, in PO order.
 *
 * The cover is the PO's ORDERED quantity, not what is still open on it. A PO
 * whose goods arrived but whose Units nobody has created yet is still this
 * line's route — dropping it the moment `received` caught up with `qty` made
 * the whole lane vanish at exactly the step where the work sits (`○ STOCK ·
 * Units not created yet`). Units that DID reach the register have already
 * lowered `outstandingQty`, so this cannot double-count.
 */
function purchaseSlices(line: LineFacts, pos: ReadonlyArray<RoutePurchaseOrder>): {
  slices: PurchaseSlice[];
  unassignedQty: number;
} {
  const key = skuKey(line.sku);
  let remaining = line.outstandingQty;
  const slices: PurchaseSlice[] = [];
  for (const po of pos) {
    if (remaining <= 0) break;
    const matching = po.lines.filter((row) => skuKey(row.sku) === key);
    if (matching.length === 0) continue;
    const orderedQty = matching.reduce((sum, row) => sum + Math.max(0, Number(row.qty)), 0);
    const receivedQty = matching.reduce((sum, row) => sum + Math.max(0, Number(row.receivedQty)), 0);
    if (orderedQty <= 0) continue;
    const qty = Math.min(remaining, orderedQty);
    slices.push({ po, qty, orderedQty, receivedQty });
    remaining -= qty;
  }
  return { slices, unassignedQty: Math.max(0, remaining) };
}

function purchaseStations(
  slice: PurchaseSlice,
  receiving: ReadonlyArray<RouteReceivingRecord>,
  unitsFromPo: AllocationUnit[],
  destination: string | null,
): RouteStation[] {
  const { po, orderedQty, receivedQty } = slice;
  const record = receiving.find((row) => row.poId === po.id && row.receivedAt) ?? null;

  const drafts: StationDraft[] = [
    {
      id: `${po.id}:purchasing`,
      title: "PURCHASING",
      complete: true,
      evidence: [po.id, dated("Issued", po.issuedAt)].filter(Boolean).join(" · "),
      door: open(po.id, poHref(po.id)),
    },
    {
      id: `${po.id}:supplier`,
      title: "SUPPLIER",
      complete: Boolean(po.expectedReadyDate),
      evidence: dated("Estimated ready", po.expectedReadyDate),
      status: "Ready date not confirmed",
      action: { ownerKey: "purchasing", label: "Confirm the ready date" },
      door: open(po.id, poHref(po.id)),
    },
    {
      id: `${po.id}:receiving`,
      title: "RECEIVING",
      complete: orderedQty > 0 && receivedQty >= orderedQty && Boolean(record),
      evidence: record
        ? [record.recordNo, dated("Received", record.receivedAt)].filter(Boolean).join(" · ")
        : null,
      status:
        receivedQty > 0 && receivedQty < orderedQty
          ? `${receivedQty} of ${orderedQty} received`
          : "Not received yet",
      action: { ownerKey: "receiving", label: "Receive the goods" },
      door: record ? open(record.recordNo, receivingHref(record.id)) : null,
    },
    {
      id: `${po.id}:stock`,
      title: "STOCK",
      complete: unitsFromPo.length > 0,
      evidence: [unitNames(unitsFromPo), destination].filter(Boolean).join(" · ") || null,
      status: "Units not created yet",
      action: { ownerKey: "stock", label: "Create the Units" },
      door: unitsFromPo.length > 0 ? open("Stock", stockHref) : null,
    },
  ];
  return seal(drafts);
}

function stockLane(
  id: string,
  qty: number,
  source: "ready-stock" | "delivered",
  laneUnits: AllocationUnit[],
  destination: string | null,
): GoodsSubLane {
  const word = source === "delivered" ? "DELIVERED" : "READY STOCK";
  return {
    id,
    title: `Qty ${qty} · ${word}`,
    qty,
    source,
    destination,
    stations: seal([
      {
        id: `${id}:stock`,
        title: "STOCK",
        complete: true,
        evidence:
          [
            unitNames(laneUnits),
            source === "delivered" ? "Delivered" : destination,
          ]
            .filter(Boolean)
            .join(" · ") || null,
        door: open("Stock", stockHref),
      },
    ]),
  };
}

/**
 * ONE LANE PER Deliver To — but only where Purchasing's own answer identifies
 * the split without inference. With a single purchase lane the destination
 * quantities ARE that lane's quantities, so the fork is a fact. With several
 * POs the destinations are stated on each lane instead: distributing another
 * order's quantity by guesswork is exactly what MASTER §0.1 forbids.
 */
function forkByDestination(
  lane: GoodsSubLane,
  destinations: ReadonlyArray<{ name: string; qty: number }>,
): GoodsSubLane[] {
  const named = destinations.filter((d) => d.name.trim().length > 0 && d.qty > 0);
  if (named.length < 2) return [lane];
  const total = named.reduce((sum, d) => sum + d.qty, 0);
  if (total !== lane.qty) return [lane];
  return named.map((d, index) => ({
    ...lane,
    id: `${lane.id}:dest-${index}`,
    title: `Qty ${d.qty} · PURCHASE · ${d.name}`,
    qty: d.qty,
    destination: d.name,
    stations: lane.stations.map((station) => ({ ...station, id: `${station.id}:dest-${index}` })),
  }));
}

function goodsRouteFor(
  line: LineFacts,
  input: SalesOrderRouteInput,
  origin: RouteStation | null,
): GoodsRoute {
  const destinations = input.lineDestinations?.[line.sku] ?? [];
  const singleDestination = destinations.length === 1 ? destinations[0]!.name : null;
  const lanes: GoodsSubLane[] = [];

  if (line.soldQty > 0) {
    lanes.push(
      stockLane(`${line.sku}:delivered`, line.soldQty, "delivered", line.soldUnits, singleDestination),
    );
  }
  if (line.reservedQty > 0) {
    lanes.push(
      stockLane(`${line.sku}:ready`, line.reservedQty, "ready-stock", line.reservedUnits, singleDestination),
    );
  }

  const { slices, unassignedQty } = purchaseSlices(line, input.purchaseOrders);
  const purchaseLanes: GoodsSubLane[] = slices.map((slice) => {
    const unitsFromPo = [...line.reservedUnits, ...line.soldUnits].filter(
      (unit) => unit.poNo === slice.po.id,
    );
    return {
      id: `${line.sku}:${slice.po.id}`,
      title: `Qty ${slice.qty} · PURCHASE`,
      qty: slice.qty,
      source: "purchase" as const,
      destination:
        singleDestination ??
        (destinations.length > 1
          ? destinations.map((d) => `${d.name} ×${d.qty}`).join(" · ")
          : null),
      stations: purchaseStations(slice, input.receivingRecords, unitsFromPo, singleDestination),
    };
  });
  lanes.push(
    ...(purchaseLanes.length === 1
      ? forkByDestination(purchaseLanes[0]!, destinations)
      : purchaseLanes),
  );

  if (unassignedQty > 0) {
    lanes.push({
      id: `${line.sku}:unassigned`,
      title: `Qty ${unassignedQty} · PURCHASE`,
      qty: unassignedQty,
      source: "unassigned",
      destination: singleDestination,
      stations: seal([
        {
          id: `${line.sku}:unassigned:purchasing`,
          title: "PURCHASING",
          complete: false,
          blocked: true,
          status: "No Purchase Order yet",
          action: { ownerKey: "purchasing", label: "Raise the Purchase Order" },
          door: open("Purchasing", purchasingHref),
        },
      ]),
    });
  }

  return {
    id: line.sku,
    title: `${line.label} · Qty ${line.committedQty}`,
    qty: line.committedQty,
    cancelled: false,
    cancelledWord: null,
    origin,
    lanes,
    forked: lanes.length > 1,
  };
}

/* ─────────────────────────────────────────────────────────────────────────────
 * Layer 1 · the four tracks.
 * ──────────────────────────────────────────────────────────────────────────── */

interface GoodsTotals {
  committedQty: number;
  readyQty: number;
  soldQty: number;
  onOrderQty: number;
  unassignedQty: number;
}

function goodsTotals(lines: LineFacts[], input: SalesOrderRouteInput): GoodsTotals {
  let onOrderQty = 0;
  let unassignedQty = 0;
  for (const line of lines) {
    const { slices, unassignedQty: open } = purchaseSlices(line, input.purchaseOrders);
    onOrderQty += slices.reduce((sum, slice) => sum + slice.qty, 0);
    unassignedQty += open;
  }
  return {
    committedQty: lines.reduce((sum, line) => sum + line.committedQty, 0),
    readyQty: lines.reduce((sum, line) => sum + line.reservedQty + line.soldQty, 0),
    soldQty: lines.reduce((sum, line) => sum + line.soldQty, 0),
    onOrderQty,
    unassignedQty,
  };
}

function goodsTrack(totals: GoodsTotals, unmatched: number): OrderTrack {
  if (unmatched > 0) {
    return {
      key: "goods",
      title: "GOODS",
      mark: "blocked",
      status: `${units(unmatched)} not on this order · check the Stock register`,
      door: null,
    };
  }
  if (totals.unassignedQty > 0) {
    return {
      key: "goods",
      title: "GOODS",
      mark: "current",
      status: `${items(totals.unassignedQty)} waiting for Purchasing`,
      door: null,
    };
  }
  if (totals.onOrderQty > 0) {
    return {
      key: "goods",
      title: "GOODS",
      mark: "current",
      status: `${items(totals.onOrderQty)} on order with the supplier`,
      door: null,
    };
  }
  if (totals.committedQty === 0) {
    return { key: "goods", title: "GOODS", mark: "complete", status: "No goods on this order", door: null };
  }
  return {
    key: "goods",
    title: "GOODS",
    mark: "complete",
    status: totals.readyQty >= totals.committedQty ? "All goods bought" : "No purchase needed",
    door: null,
  };
}

function stockTrack(totals: GoodsTotals): OrderTrack {
  if (totals.committedQty === 0) {
    return { key: "stock", title: "STOCK", mark: "complete", status: "No goods on this order", door: null };
  }
  if (totals.readyQty >= totals.committedQty) {
    return {
      key: "stock",
      title: "STOCK",
      mark: "complete",
      status:
        totals.soldQty >= totals.committedQty
          ? `${units(totals.committedQty)} delivered`
          : `${units(totals.committedQty)} ready`,
      door: null,
    };
  }
  return {
    key: "stock",
    title: "STOCK",
    mark: "current",
    status: `${totals.readyQty} of ${totals.committedQty} Units ready`,
    door: null,
  };
}

function deliveryTrack(input: SalesOrderRouteInput): OrderTrack {
  const attempts = input.delivery.attempts;
  const delivered = attempts.some((a) => a.result === "delivered") || Boolean(input.order.deliveredAt);
  if (delivered) {
    return { key: "delivery", title: "DELIVERY", mark: "complete", status: "Delivered", door: null };
  }
  const lastFailed = [...attempts].reverse().find((a) => a.result !== "delivered");
  if (lastFailed) {
    return {
      key: "delivery",
      title: "DELIVERY",
      mark: "blocked",
      status: `Delivery ${lastFailed.attemptNo} not completed · ${lastFailed.reason ?? "no reason recorded"}`,
      door: null,
    };
  }
  const confirmed = input.delivery.booking?.confirmedDate ?? null;
  if (confirmed) {
    return {
      key: "delivery",
      title: "DELIVERY",
      mark: "current",
      status: dated("Delivery appointment", confirmed)!,
      door: null,
    };
  }
  return {
    key: "delivery",
    title: "DELIVERY",
    mark: "current",
    status: "Appointment not confirmed",
    door: null,
  };
}

function moneyTrack(input: SalesOrderRouteInput): OrderTrack {
  const payments = open("Payments", paymentsHref(input.order.so));
  if (!input.money.known) {
    return { key: "money", title: "MONEY", mark: "current", status: "No price yet", door: payments };
  }
  if (input.money.outstanding > 0) {
    return {
      key: "money",
      title: "MONEY",
      mark: "current",
      status: `${ringgit(input.money.outstanding)} still to collect`,
      door: payments,
    };
  }
  return { key: "money", title: "MONEY", mark: "complete", status: "Paid in full", door: payments };
}

/* ─────────────────────────────────────────────────────────────────────────────
 * Layer 2 · DELIVERY RELEASE — derived, read-only, and honest about a partial.
 * ──────────────────────────────────────────────────────────────────────────── */

function goodsRequirement(
  lines: LineFacts[],
  totals: GoodsTotals,
  input: SalesOrderRouteInput,
): ReleaseRequirement {
  const scope = input.delivery.booking?.scope ?? null;
  const doNumber =
    [...input.delivery.attempts].reverse().find((a) => a.doNumber)?.doNumber ?? null;

  /* A `✓` on partial goods is allowed ONLY when an explicit partial-delivery
     scope exists — and then the scope is DISPLAYED, never implied. */
  if (scope && scope.length > 0) {
    const inScope = lines.filter((line) => {
      const group = deliveryGroupOf(line.sku);
      return group != null && scope.includes(group);
    });
    if (inScope.length > 0 && inScope.length < lines.length) {
      const scopeCommitted = inScope.reduce((sum, line) => sum + line.committedQty, 0);
      const scopeReady = inScope.reduce((sum, line) => sum + line.reservedQty + line.soldQty, 0);
      const remaining = totals.committedQty - scopeCommitted;
      if (scopeReady >= scopeCommitted && scopeCommitted > 0) {
        return {
          id: "goods",
          mark: "complete",
          title: "Goods ready for this delivery",
          details: [
            `${units(scopeCommitted)} included${doNumber ? ` in ${doNumber}` : ""}`,
            `${units(remaining)} remain open`,
          ],
        };
      }
    }
  }

  if (totals.committedQty === 0) {
    return { id: "goods", mark: "complete", title: "Goods ready", details: ["No goods on this order"] };
  }
  if (totals.readyQty >= totals.committedQty) {
    return { id: "goods", mark: "complete", title: "Goods ready", details: [`${units(totals.committedQty)} ready`] };
  }
  return {
    id: "goods",
    mark: "waiting",
    title: "Goods not ready",
    details: [`${totals.readyQty} of ${totals.committedQty} ready`],
  };
}

function moneyRequirement(input: SalesOrderRouteInput): ReleaseRequirement {
  if (!input.money.known) {
    return {
      id: "money",
      mark: "complete",
      title: "Money release cleared",
      details: ["No price yet", "Money does not hold this delivery"],
    };
  }
  if (input.money.holds) {
    return {
      id: "money",
      mark: "blocked",
      title: "Money release not cleared",
      details: [`${ringgit(input.money.outstanding)} still to collect`],
    };
  }
  /* ⭐ TWO FACTS, NEVER ONE. A manager release lifts the HOLD; the amount the
     customer still owes stays on the screen and stays on the worklist. */
  if (input.money.outstanding > 0) {
    return {
      id: "money",
      mark: "complete",
      title: "Money release cleared",
      details: [`${ringgit(input.money.outstanding)} remains to collect`, "Manager release recorded"],
    };
  }
  return { id: "money", mark: "complete", title: "Money release cleared", details: ["Paid in full"] };
}

function appointmentRequirement(input: SalesOrderRouteInput): ReleaseRequirement {
  const booking = input.delivery.booking;
  if (booking?.confirmedDate) {
    return {
      id: "appointment",
      mark: "complete",
      title: "Appointment confirmed",
      details: [dated("Delivery appointment", booking.confirmedDate)!, booking.slot].filter(
        (line): line is string => Boolean(line),
      ),
    };
  }
  return {
    id: "appointment",
    mark: "waiting",
    title: "Appointment not confirmed",
    details: [dated("Customer requested", input.order.deliveryDate) ?? "No delivery date"],
  };
}

function deliveryRelease(
  lines: LineFacts[],
  totals: GoodsTotals,
  input: SalesOrderRouteInput,
): DeliveryRelease {
  const requirements = [
    goodsRequirement(lines, totals, input),
    moneyRequirement(input),
    appointmentRequirement(input),
  ];
  const openCount = requirements.filter((r) => r.mark !== "complete").length;
  const ready = openCount === 0;
  return {
    ready,
    headline: ready ? "READY FOR DELIVERY" : "NOT READY FOR DELIVERY",
    summary: ready
      ? "All release requirements are complete."
      : `${openCount} ${openCount === 1 ? "requirement" : "requirements"} still open`,
    openCount,
    requirements,
    door: open("Delivery", deliveryHref(input.order.id)),
  };
}

/* ─────────────────────────────────────────────────────────────────────────────
 * The resolver.
 * ──────────────────────────────────────────────────────────────────────────── */

export function resolveSalesOrderRoute(input: SalesOrderRouteInput): SalesOrderRoute {
  const soNumber = `SO-${input.order.so}`;
  const lines: LineFacts[] = input.allocation.lines.map((line) => ({
    sku: line.sku,
    label: input.lineLabels?.[line.sku]?.trim() || line.sku,
    committedQty: line.committedQty,
    reservedUnits: [...line.reservedUnits],
    soldUnits: [...line.soldUnits],
    reservedQty: line.reservedQty,
    soldQty: line.soldQty,
    outstandingQty: line.outstandingQty,
  }));

  const origin: RouteStation = {
    id: "origin",
    title: "SALES ORDER",
    mark: "complete",
    evidence: [soNumber, dated("Ordered", input.order.placedAt)].filter(Boolean).join(" · "),
    status: null,
    action: null,
    door: open(soNumber, orderHref(input.order.id)),
    current: false,
  };

  const goodsRoutes: GoodsRoute[] = lines.map((line) => goodsRouteFor(line, input, origin));

  /* A cancelled line keeps its place in the story and states its outcome. It
     has no stations: there is no route to walk. */
  for (const cancelled of input.cancelledLines ?? []) {
    goodsRoutes.push({
      id: `cancelled:${cancelled.sku}`,
      title: `${cancelled.label?.trim() || cancelled.sku} · Qty ${cancelled.qty}`,
      qty: cancelled.qty,
      cancelled: true,
      cancelledWord: `Cancelled · Rev ${cancelled.revision}`,
      origin: null,
      lanes: [],
      forked: false,
    });
  }

  const unmatched = input.allocation.unmatchedUnits.reduce((sum, unit) => sum + unitQty(unit), 0);
  const totals = goodsTotals(lines, input);

  const linkedProblems: LinkedProblem[] = [
    ...input.cases
      .filter((item) => !item.closed)
      .map((item) => ({
        id: `case:${item.id}`,
        title: [item.caseNo, item.statusLabel].filter(Boolean).join(" · "),
        door: open(item.caseNo, caseHref(item.id)),
      })),
    ...input.claims
      .filter((item) => !item.closed)
      .map((item) => ({
        id: `claim:${item.id}`,
        title: [item.claimNo, item.statusLabel].filter(Boolean).join(" · "),
        door: open(item.claimNo, claimHref(item.id)),
      })),
  ];

  return {
    orderId: input.order.id,
    soNumber,
    customerName: input.order.customerName,
    tracks: [
      goodsTrack(totals, unmatched),
      stockTrack(totals),
      deliveryTrack(input),
      moneyTrack(input),
    ],
    linkedProblems,
    goodsRoutes,
    release: deliveryRelease(lines, totals, input),
  };
}

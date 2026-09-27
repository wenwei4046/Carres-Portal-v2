/**
 * Sales Order Route — ONE NODE MAP, and no second surface.
 *
 * ⭐ OWNER RULING 2026-08-16 (`docs/cards/CARD-2026-08-16-order-route-node-map.md`).
 * This OVERWRITES the two-layer `ORDER TRACKS + GOODS ROUTES + DELIVERY RELEASE`
 * stack: three section cards asked the operator to assemble the order in their
 * head. The route is now one connected map — white node cards joined by
 * connectors, three routes leaving the Sales Order at once, converging on the
 * Delivery Order gate.
 *
 * ```
 * SO
 * ├── Goods            ONE LANE PER GOODS LINE (owner ruling 2026-08-17):
 * │                    a caption plate names the line, its purchase chains
 * │                    hang under the plate (one column per source PO), and
 * │                    every chain converges on the line's ONE STOCK node
 * ├── Delivery         LOGISTICS → DELIVERY DATE
 * ├── Money            MONEY
 * └── Loan             rendered ONLY when a loan is out
 *
 * Goods + Logistics + Delivery Date + Money → DELIVERY ORDER → DELIVER → PHOTO
 * ```
 *
 * ⭐ MULTI-ITEM READABILITY — OWNER RULING 2026-08-17. Route names live on
 * GROUP BANDS (`GOODS · DELIVERY · MONEY · LOAN`), never as per-edge captions;
 * a goods line's product name lives on its caption plate, never ON a
 * connector; groups are separated by a wider gap than columns inside a group.
 * Colour still belongs to STATE alone — routes are told apart by band and
 * spacing, not by hue.
 *
 * ⭐ THE MONEY REQUIREMENT IS THE FINANCE EXCEPTION — OWNER RULING 2026-08-16,
 * decision A (`docs/orders/MASTER.md` §8). Outstanding money does not block
 * the DO; an OPEN Finance exception is the ONLY money blocker, CLEARED removes
 * it, and only Finance opens or clears one. Decision B — money stays a
 * requirement — shipped first and was honest about why: the Finance-exception
 * mechanism did not exist and inventing one was refused. The owner then
 * defined it (0355, `order_finance_exceptions`), which answered that objection
 * rather than overruled it, and this gate re-keyed in the same slice as
 * `deliveryOrderIssueGate` and the action engine — because decision B's law
 * still binds: a gate that counts requirements the server does not is the
 * screen telling a lie (Architecture Law D), in either direction.
 *
 * TWO RULES THIS FILE STILL HOLDS, UNCHANGED:
 *
 * 1. **A `✓` costs real completion evidence.** A node is complete only when it
 *    can name its document, its labelled date and the door to the object that
 *    owns it. Nothing is ticked because the next thing started.
 * 2. **The gate never erases the money fact.** The MONEY branch keeps printing
 *    what the customer owes, and `collect` survives delivery — money left the
 *    GATE, not the screen and not the worklist.
 *
 * The canvas computes nothing of its own and stores nothing: every line is a
 * fact some other module owns. Dates travel as ISO with their MEANING attached
 * (`Issued: 2026-08-13`); the page spells them through the one date format.
 */

import { unitsShortWords } from "./line-readiness";
import { deliveryGroupOf, type DeliveryGroupKey } from "./delivery-groups";
/* ⭐ LAW D — the canvas ASKS these, it does not re-decide them. Both predicates
   were re-implemented inline here while this file's own comment claimed it
   asked the shared one. They agreed, which is the condition Law D names: two
   implementations that merely happen to match. */
import { paymentApprovalOpensGate } from "./delivery-payment-approval";
import { openFinanceExceptions } from "./finance-exception";
import { paymentDeadlineOf } from "./logistics-card";
import type { DeliveryHandoverKind, DeliveryOrderAttemptFact } from "./delivery-order-status";
import {
  deliveryJourneyProgressFromStatus,
  deliveryWorkStatusOf,
  type DeliveryStatusSpell,
} from "./delivery-work-status";
import { fmtMoney } from "./money-format";
import type { AllocationUnit, SalesOrderAllocation } from "./sales-order-allocation";
import { normalizeSkuKey } from "./sku-code";

/* ─────────────────────────────────────────────────────────────────────────────
 * The vocabulary of a node.
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * `complete` green · `current` blue border + owner chip · `waiting` grey ·
 * `blocked` amber · `future` grey DASHED — a step the work has not reached.
 *
 * State is never colour alone (card §12): complete also carries `✓`, current
 * also carries its chip, future also carries the dashed border, blocked also
 * carries `⚠` and says why in words.
 */
export type NodeMark = "complete" | "current" | "waiting" | "blocked" | "future" | "unreadable";

/**
 * ⭐ A READ THAT FAILED IS NOT A POSITION — owner ruling 2026-09-26. The owning
 * module could not be read, so its nodes say exactly that and what it does NOT
 * mean. Never a tick, never CURRENT, never a business sentence: `No Purchase
 * Order yet` printed from a thrown read is a false claim. Not `unknown` — that
 * word already means an unknown MONEY VALUE in this file.
 */
export interface RouteUnreadable {
  /** Delivery's arrangement / attempts read failed. */
  delivery?: boolean;
  /** The Finance hold / payment record read failed. */
  payments?: boolean;
  /** Purchasing's read failed — for every line, or for the named SKUs only. */
  purchasing?: boolean | ReadonlyArray<string>;
  /** The change requests read failed (the banner's own read). */
  amendment?: boolean;
}

/** The `PROPOSED CHANGE` band above the canvas — never a node, never a lane. */
export interface RouteProposedChange {
  kind: "waiting" | "out-of-date" | "unreadable";
  fact: string;
  /** WHAT changes — `Delivery date: Thu, 24 Sep → Mon, 28 Sep`. At most three
   *  rows; `more` counts the rest, which the request itself lists. */
  changes: string[];
  more: number;
  door: RouteDoor;
  /** The sentence that stops the wrong reading. Null only on a failed read. */
  rule: string | null;
}

/** Which of the routes leaving the Sales Order this node belongs to. */
export type RouteBranchKey = "root" | "goods" | "delivery" | "money" | "loan" | "gate" | "tail";

export type RouteNodeKind =
  | "sales-order"
  | "purchasing"
  | "supplier"
  | "receiving"
  | "stock"
  | "logistics"
  | "delivery-date"
  | "money"
  | "delivery-order"
  | "deliver"
  | "delivery-photo"
  | "loan"
  | "cancelled"
  /** A delivery lane's caption plate — `Leg 1 · Carres Klang → JB transit
   *  warehouse` · `Trip 2 · Sofa, 2 items`. Like the goods plate, it is not a
   *  station: no state, no action, no door. */
  | "delivery-lane"
  /** The goods line's caption plate — the product name and quantity, drawn as
   *  a small grey header ABOVE the lane so it never sits on a connector. It is
   *  not a station: no action, no door, no state of its own. */
  | "goods-line";

export interface RouteDoor {
  /** The governed door word, e.g. `Open PO-2048 →`. */
  label: string;
  href: string;
}

/**
 * Who the action line belongs to. The route never derives duty and never knows
 * a staff name — the page resolves the holder from the Work Engine roster
 * (card §7), buddy cover included.
 */
export type StationOwnerKey =
  | "purchasing"
  | "receiving"
  | "stock"
  | "delivery"
  | "sales"
  | "payment";

export interface NodeAction {
  ownerKey: StationOwnerKey;
  /** The act, in the governed voice: `Confirm the ready date`. */
  label: string;
  /** The third row on a current node: object, quantity/place and the actual
   *  governed calendar date that gives the action meaning. It never repeats
   *  the Sales Order/customer identity and never falls back to generic Due. */
  context: {
    detail: string;
  };
}

/** One plain sentence on the gate, GitHub-checks style. */
export interface GateRequirement {
  id: GateRequirementId;
  met: boolean;
  /** `Goods not ready (0 of 1)` · `RM 1,249.00 still to collect` */
  text: string;
}

export type GateRequirementId =
  | "goods"
  | "logistics"
  | "appointment"
  | "money"
  | "finance-exception"
  | "refused-day"
  /** Leg 2 and later: the leg before it must have arrived at its stop. */
  | "previous-leg";

export interface RouteNode {
  id: string;
  kind: RouteNodeKind;
  branch: RouteBranchKey;
  /** `PURCHASING` · `DELIVERY ORDER` — the node's one heading. */
  title: string;
  mark: NodeMark;
  /** The fact lines, in reading order. Complete nodes carry their evidence
   *  here; everything else carries its plain-sentence status. */
  lines: string[];
  /** The same facts BEFORE they were broken into rows — what a screen reader
   *  speaks. A row break is for the eye; a sentence is read whole. */
  spoken: string[];
  /** The gate's requirement list. Empty on every other node. */
  requirements: GateRequirement[];
  action: NodeAction | null;
  door: RouteDoor | null;
  /** One per route, up to three at once — never a fourth (card §13). */
  current: boolean;
  /* Geometry, computed here so the connectors are testable without a DOM. */
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface RoutePoint {
  x: number;
  y: number;
}

export interface RouteEdge {
  id: string;
  from: string;
  to: string;
  /** Completed segments solid; a path the work has not walked is dashed. */
  style: "solid" | "dashed";
  /** Small grey text sitting ON the line — `goods` · `collect back`. */
  labelLines: string[];
  /** The orthogonal elbow, ready for one `<polyline>`. */
  points: RoutePoint[];
  labelAt: RoutePoint | null;
}

/** An open Service Case / Supplier Claim. NEVER a node on the map: a node is a
 *  stage every Sales Order passes through and an exception is not one. Kept as
 *  a conditional strip beside the canvas so the capability §0.1 approved is not
 *  lost in the redraw. */
export interface LinkedProblem {
  id: string;
  /** `SC-1031 · Investigation in progress` */
  title: string;
  door: RouteDoor;
}

/** One route-group header — `GOODS` · `DELIVERY` · `MONEY` · `LOAN` — drawn
 *  once above its group of columns. The band is where a route says its name;
 *  edges no longer carry route captions. */
export interface RouteBand {
  id: RouteBranchKey;
  label: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface SalesOrderRouteMap {
  orderId: string;
  soNumber: string;
  customerName: string | null;
  nodes: RouteNode[];
  edges: RouteEdge[];
  bands: RouteBand[];
  linkedProblems: LinkedProblem[];
  /** Owner ruling 2026-09-25: a waiting amendment is announced ABOVE the map.
   *  The map itself keeps meaning what is true now. */
  proposedChange: RouteProposedChange | null;
  /** The drawn bounding box — the page fits THIS to the viewport on load. */
  width: number;
  height: number;
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

/** `ops_sofa_loans` — an INDEPENDENT obligation (Card 6). The real goods
 *  arriving does not close it, and it never blocks the delivery. */
export interface RouteLoan {
  id: string;
  /** What is out: the borrowed label, else the loaned unit's SKU. */
  label: string;
  qty: number;
  returned: boolean;
  /** The loaned Unit's permanent Carres Unit ID (0492 / Card 15), when ours. */
  unitId?: string | null;
}

/** `ops_loan_offers` (0492, Delivery MASTER §14.2) — the offer and the
 *  customer's answer, recorded on the Sales Order. The whole history rides
 *  the input; the map renders the CURRENT state. */
export interface RouteLoanOffer {
  id: string;
  seq?: number;
  event: "offered" | "accepted" | "declined";
  label: string | null;
  reason: string | null;
  recordedAt: string;
}

export interface RouteDeliveryPhoto {
  /** `ops_order_control.delivery_photos[].at` */
  at: string | null;
  /** The uploader, already resolved to a name by the page. */
  by: string | null;
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

/**
 * ⭐ ONE DELIVERY SCOPE — one `(leg, trip)` of `ops_delivery_orders` (owner
 * ruling 2026-09-26). Every field is Delivery's own record for that scope: the
 * arrangement, the live Delivery Order, its attempts, its handover facts and
 * the photos bound to its number. The Route reads them; it never infers one
 * from the Sales Order.
 */
export interface RouteDeliveryScope {
  /** 0 = the whole order; 1.. = a leg of a Delivery Journey. */
  leg: number;
  /** 0 = unsplit; 1..3 = a trip of a split delivery. */
  trip: number;
  /** The lane's caption, already in the dictionary's words. Null on an
   *  ordinary order, which has one scope and no plate. */
  plate: string | null;
  /** A Journey leg before the last: it arrives at a stop, not at the customer,
   *  and owes no delivery photo. */
  transfer: boolean;
  legStop: string | null;
  partnerName: string | null;
  confirmedDate: string | null;
  confirmedTime: string | null;
  /** The live (non-void) document. The door opens it by its row id. */
  deliveryOrder: { id: string; number: string } | null;
  /** The delivery groups this trip carries. Null = everything. */
  tripGroups: ReadonlyArray<DeliveryGroupKey> | null;
  attempts: ReadonlyArray<DeliveryOrderAttemptFact & { reason?: string | null }>;
  handoverEvents: ReadonlyArray<{ kind: DeliveryHandoverKind; recordedAt?: string | null }>;
  photos: ReadonlyArray<RouteDeliveryPhoto>;
}

export interface SalesOrderRouteInput {
  order: {
    id: string;
    so: number;
    customerName: string | null;
    /** `orders.placed_at` — printed as `SO Doc Date:`. */
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
    /** The company currently assigned to carry this order — Delivery's own
     *  answer (`booking-brief.assignedLogistics`), never inferred. */
    logistics: { partnerName: string | null } | null;
    booking: {
      confirmedDate: string | null;
      slot: string | null;
      /** The delivery groups THIS trip carries. Null = the whole order. */
      scope: ReadonlyArray<DeliveryGroupKey> | null;
    } | null;
    attempts: ReadonlyArray<RouteDeliveryAttempt>;
    /** The order's issued document number (`orders.do_number`). The gate used
     *  to read it off the ATTEMPTS alone, so a system-issued DO with no run
     *  yet showed a ready gate with no number — two sources for one fact
     *  (Law D). The document's own column is the truth; attempts remain the
     *  fallback for pre-0356 rows. */
    doNumber?: string | null;
    /** `ops_order_control.delivery_photos` (0280). */
    photos?: ReadonlyArray<RouteDeliveryPhoto>;
    /** Delivery's own records, one entry per scope, in lane order. When
     *  present they OVERWRITE `logistics`, `booking`, `doNumber`, `photos` and
     *  `attempts`, which read the V1 booking fields. */
    scopes?: ReadonlyArray<RouteDeliveryScope>;
    /** The assigned company is not a Klang Valley default — payment must be
     *  complete 3 working days before the delivery instead of 2. */
    outstation?: boolean;
  };
  /** Straight from `orderMoney` — this module never recomputes the number.
   *  Decision A removed `holds`: money cannot hold a delivery any more, so a
   *  field whose whole meaning was "does the balance stop the truck?" has no
   *  honest value left to carry. The MONEY branch reads only the two facts
   *  that survive — is the value known, and what is still owed. */
  money: {
    known: boolean;
    outstanding: number;
  };
  /** `order_finance_exceptions` (0355) — this order's rows, read from the one
   *  owning table. An OPEN one blocks the gate regardless of payment. REQUIRED
   *  so a caller cannot forget the fetch and render a gate that lies. */
  financeExceptions: ReadonlyArray<{
    id: string;
    status: "open" | "cleared";
    reason: string;
  }>;
  /** `order_delivery_payment_approvals` (0362, owner ruling 2026-08-19) — this
   *  order's rows. Money in full before delivery is the only default; an
   *  APPROVED row is the one exception (COD on the owner's terms). REQUIRED
   *  for the same reason the exceptions are. */
  paymentApprovals: ReadonlyArray<{
    id: string;
    status: "pending" | "approved" | "refused";
  }>;
  loans?: ReadonlyArray<RouteLoan>;
  /** 0492 — the loan offer conversation, newest first or not; sorted here. */
  loanOffers?: ReadonlyArray<RouteLoanOffer>;
  cases: ReadonlyArray<RouteLinkedCase>;
  claims: ReadonlyArray<RouteLinkedClaim>;
  /** Malaysian public holidays as `YYYY-MM-DD`. A confirmed date landing on one
   *  — or on a Sunday — is a refused delivery day (§8). */
  publicHolidays?: ReadonlyArray<string>;
  /** Which owning reads FAILED. A failed read yellows its own group only. */
  unreadable?: RouteUnreadable;
  /** `sales_order_amendment_live` — only a `submitted` or out of date request
   *  is announced; a rejected or applied one renders nothing. */
  amendment?: {
    status: "submitted" | "stale";
    submittedAt: string | null;
    submittedBy: string | null;
    /** Who decides it, named by Staff & Duties — never hard-coded. */
    approver?: string | null;
    changes?: ReadonlyArray<{ what: string; before: string; after: string }>;
  } | null;
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
  /* The Delivery page opens a row from `open`, on its `All delivery work`
     view — the one spelling `monitorRowHref` and the Work cards already use.
     `?order=` was read by nothing (found 2026-09-27). */
  `/operation?tab=delivery&view=all&open=${encodeURIComponent(orderId)}`;
// THE MONEY DOOR OPENS THE CANONICAL REGISTER (payment/MASTER.md §16).
// `/operation?tab=payments` was the Master-Sheet Balance desk — a SECOND form
// for one act, which ownership Law C forbids. The order context travels as
// `?order=<SO No>`, which the Register reads as its scope.
const paymentsHref = (so: number) => `/finance/payments?order=${so}`;
const caseHref = (caseId: string) =>
  `/operation?tab=service-notes&case=${encodeURIComponent(caseId)}`;
const claimHref = (claimId: string) =>
  `/operation?tab=claims&claim=${encodeURIComponent(claimId)}`;
const door = (label: string, href: string): RouteDoor => ({ label, href });
const open = (what: string, href: string): RouteDoor => door(`Open ${what} →`, href);

const units = (n: number) => `${n} ${n === 1 ? "Unit" : "Units"}`;
/** `fmtMoney` already carries `RM` — the ONE money spelling, not a second one. */
const ringgit = (n: number) => fmtMoney(n);

/** A date never ships bare — its meaning travels with it. */
const dated = (label: string, iso: string | null) => (iso ? `${label}: ${iso}` : null);

/** The customer's promise, in the Route's own word (owner ruling 2026-09-26). */
const requested = (iso: string | null) => `Customer requested: ${iso ?? "Not recorded"}`;

const skuKey = (sku: string) => normalizeSkuKey(sku) || sku;

const unitQty = (unit: AllocationUnit) =>
  Number.isFinite(unit.qty) && unit.qty > 0 ? Math.floor(unit.qty) : 1;

const unitNames = (list: ReadonlyArray<AllocationUnit>) =>
  list.map((unit) => unit.unitCode ?? unit.id).join(" · ");

const truthy = (list: ReadonlyArray<string | null | undefined>): string[] =>
  list.filter((line): line is string => Boolean(line && line.trim().length > 0));

/**
 * ⭐ NOTHING ON A NODE IS EVER CUT. Measured 2026-09-27 at 1440/1180/820/743/390:
 * the 208px box ended `RM 1,500.00 unpaid · by Tue, 22 Sep`, the gate's money
 * line and every action context in an ellipsis. The box draws one row per
 * line, so text is broken HERE, on a word, and the geometry counts the rows —
 * the page draws the rows this function returns and no others.
 *
 * Budgets are characters per row at the governed type scale inside the box's
 * 184px of text: `text-body` 13px fact lines, `text-label` 11px context rows,
 * and requirement rows that give 12px to their tick.
 */
export const ROUTE_TEXT_BUDGET = { line: 26, requirement: 30, context: 32 } as const;

/** A date travels as ISO and is SPELLED by the page (`Thu, 24 Sep`), one
 *  character longer. The row is measured at the length the operator reads. */
const spelledLength = (text: string) =>
  text.replace(/\d{4}-\d{2}-\d{2}/g, "ddd, dd mmm").length;

/**
 * Facts are joined by ` · `, so a row breaks at a separator first — the line
 * break then does the separator's work and no row starts or ends with a dot.
 * Only a single fact longer than the row is broken on a word.
 */
export function wrapRouteText(text: string, budget: number): string[] {
  const rows: string[] = [];
  let row = "";
  for (const fact of text.split(" · ")) {
    if (row && spelledLength(`${row} · ${fact}`) <= budget) {
      row = `${row} · ${fact}`;
      continue;
    }
    if (row) rows.push(row);
    row = "";
    /* An amount is one word: `RM` never ends a row with its number on the next. */
    const words = fact.split(" ").reduce<string[]>((list, word) => {
      if (list.length > 0 && list[list.length - 1] === "RM") list[list.length - 1] = `RM ${word}`;
      else list.push(word);
      return list;
    }, []);
    for (const word of words) {
      if (row && spelledLength(`${row} ${word}`) > budget) {
        rows.push(row);
        row = word;
      } else {
        row = row ? `${row} ${word}` : word;
      }
    }
  }
  if (row) rows.push(row);
  return rows;
}
const wrapWords = (text: string) => wrapRouteText(text, ROUTE_TEXT_BUDGET.line);

/* The read-failure words — `docs/COPY-STANDARD.md` § The Order Route words. */
const UNREADABLE = {
  delivery: {
    what: "Could not read Delivery for this order.",
    not: "This does not mean nothing is arranged.",
    retry: "#retry-delivery",
  },
  payments: {
    what: "Could not read Payments for this order.",
    not: "This does not mean the order is unpaid.",
    retry: "#retry-payments",
  },
  purchasing: {
    what: "Could not read Purchasing for this line.",
    not: "This does not mean there is no purchase order.",
    retry: "#retry-purchasing",
  },
} as const;
type UnreadableOwner = keyof typeof UNREADABLE;
const tryAgain = (owner: UnreadableOwner): RouteDoor => ({
  label: "Try again →",
  href: UNREADABLE[owner].retry,
});

const NO_PRICE = "No price yet — money does not hold this delivery";

/* ─────────────────────────────────────────────────────────────────────────────
 * Geometry. Fixed node width, height derived from content, so a connector can
 * be computed — and asserted — without rendering anything.
 * ──────────────────────────────────────────────────────────────────────────── */

export const NODE_W = 208;
const COL_GAP = 32;
const PITCH = NODE_W + COL_GAP;
const PAD = 28;
/** Columns INSIDE a group sit COL_GAP apart; GROUPS sit GROUP_GAP apart —
 *  the wider gap is how GOODS, DELIVERY and MONEY read as three routes
 *  without inventing a colour (owner ruling 2026-08-17). */
export const GROUP_GAP = 72;
/** The group band row: its height, the gap above it (under the Sales Order)
 *  and the drop from the band to the first node row. */
const BAND_H = 22;
const BAND_GAP = 28;
const BAND_DROP = 18;
const ROW_GAP = 30;
const GATE_GAP = 56;

/* These MUST match the box the page draws (`SalesOrderRoute.tsx`), or a
   connector would stop short of its node. `text-body` is 13/18 and
   `text-label` is 11/14 — the governed scale, not numbers chosen here. */
const TITLE_H = 20;
const LINE_H = 18;
const REQ_H = 16;
const ACTION_H = 22;
const CONTEXT_H = 18;
const DOOR_H = 18;
const BOX_PAD = 22;

function nodeHeight(node: {
  lines: string[];
  requirements: GateRequirement[];
  action: NodeAction | null;
  door: RouteDoor | null;
}): number {
  return (
    BOX_PAD +
    TITLE_H +
    node.lines.length * LINE_H +
    node.requirements.reduce(
      (rows, req) => rows + wrapRouteText(req.text, ROUTE_TEXT_BUDGET.requirement).length,
      0,
    ) * REQ_H +
    (node.action
      ? ACTION_H +
        wrapRouteText(node.action.context.detail, ROUTE_TEXT_BUDGET.context).length * CONTEXT_H
      : 0) +
    /* A node that acts still shows its door: `Collect` tells the operator what
       to do, `Open Payments →` is where (approved mock 2026-09-26). */
    (node.door ? DOOR_H : 0)
  );
}

/** The org-chart elbow: down out of the source, across, down into the target. */
function elbow(from: RouteNode, to: RouteNode): RoutePoint[] {
  const x1 = from.x + from.w / 2;
  const y1 = from.y + from.h;
  const x2 = to.x + to.w / 2;
  const y2 = to.y;
  if (x1 === x2) return [{ x: x1, y: y1 }, { x: x2, y: y2 }];
  const midY = y1 + (y2 - y1) / 2;
  return [
    { x: x1, y: y1 },
    { x: x1, y: midY },
    { x: x2, y: midY },
    { x: x2, y: y2 },
  ];
}

/* ─────────────────────────────────────────────────────────────────────────────
 * Node drafting. A branch is a vertical chain; the chain decides which of its
 * nodes is the head (the position being worked) and which are still future.
 * ──────────────────────────────────────────────────────────────────────────── */

interface NodeDraft {
  id: string;
  kind: RouteNodeKind;
  title: string;
  complete: boolean;
  blocked?: boolean;
  /** The owning read failed. Overrides every other state. */
  unreadable?: boolean;
  /** What a screen reader speaks, when it is not simply the lines. */
  spoken?: string[];
  lines: (string | null | undefined)[];
  requirements?: GateRequirement[];
  action?: NodeAction | null;
  door?: RouteDoor | null;
}

/** One goods line, drawn as ONE LANE (owner ruling 2026-08-17): the caption
 *  plate on top, one purchase-chain column per source PO under it, and the
 *  line's ONE stock node as the lane's tail — every chain converges on it. */
interface GoodsLane {
  /** The caption plate; null only on a cancelled lane. */
  plate: RouteNode | null;
  chains: RouteNode[][];
  stock: RouteNode | null;
  /** A cancelled line: one node, no chain, no gate edge. */
  solo: RouteNode | null;
  w: number;
}

/**
 * THE ONE PLACE A CHAIN'S POSITION IS DECIDED. The first node that is not
 * complete is where the work stands; every node after it is a path the work has
 * not walked yet, and says so with a dashed border rather than a dash.
 */
function sealChain(
  drafts: NodeDraft[],
  branch: RouteBranchKey,
  ownsCurrent: boolean,
): { nodes: RouteNode[]; hasHead: boolean } {
  let headTaken = false;
  const nodes = drafts.map((draft) => {
    const failed = draft.unreadable === true;
    const isHead = (failed || !draft.complete) && !headTaken;
    if (isHead) headTaken = true;
    /* A failed read is not a position: it takes the chain's head so nothing
       after it is drawn as walked, and it never becomes CURRENT. */
    const isCurrent = isHead && ownsCurrent && !failed;
    const mark: NodeMark = failed
      ? "unreadable"
      : draft.complete
      ? "complete"
      : draft.blocked
        ? "blocked"
        : isCurrent
          ? "current"
          : isHead
            ? "waiting"
            : "future";
    /* The plate prints `text-label` 11px, so its row holds what a context row holds. */
    const spoken = draft.spoken ?? truthy(draft.lines);
    const lines = truthy(draft.lines).flatMap((line) =>
      draft.kind === "goods-line" || draft.kind === "delivery-lane"
        ? wrapRouteText(line, ROUTE_TEXT_BUDGET.context)
        : wrapWords(line),
    );
    const requirements = draft.requirements ?? [];
    /* An action belongs to the position being worked, not to a queue of nodes
       nobody has reached. */
    const action = isCurrent ? (draft.action ?? null) : null;
    const doorway = draft.door ?? null;
    const node: RouteNode = {
      id: draft.id,
      kind: draft.kind,
      branch,
      title: draft.title,
      mark,
      lines,
      spoken,
      requirements,
      action,
      door: doorway,
      current: isCurrent,
      x: 0,
      y: 0,
      w: NODE_W,
      h: 0,
    };
    node.h = nodeHeight({ lines, requirements, action, door: doorway });
    return node;
  });
  return { nodes, hasHead: headTaken };
}

/* ─────────────────────────────────────────────────────────────────────────────
 * Goods.
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
 * the whole branch vanish at exactly the step where the work sits. Units that
 * DID reach the register have already lowered `outstandingQty`, so this cannot
 * double-count.
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

/** PURCHASING → SUPPLIER → RECEIVING for one Purchase Order. */
function purchaseChain(
  slice: PurchaseSlice,
  receiving: ReadonlyArray<RouteReceivingRecord>,
  destination: string | null,
  customerDelivery: string | null,
): NodeDraft[] {
  const { po, orderedQty, receivedQty } = slice;
  const record = receiving.find((row) => row.poId === po.id && row.receivedAt) ?? null;
  return [
    {
      id: `${po.id}:purchasing`,
      kind: "purchasing",
      title: "PURCHASING",
      complete: true,
      lines: [po.id, dated("Issued", po.issuedAt)],
      door: open(po.id, poHref(po.id)),
    },
    {
      id: `${po.id}:supplier`,
      kind: "supplier",
      title: "SUPPLIER",
      complete: Boolean(po.expectedReadyDate),
      lines: [po.expectedReadyDate ? dated("Estimated ready", po.expectedReadyDate) : "Supplier has not confirmed the ready date"],
      action: {
        ownerKey: "purchasing",
        label: "Confirm ready date",
        context: {
          detail: `${po.id} · ${units(slice.qty)} · ${destination ?? "Carres Warehouse"} · ${requested(customerDelivery)}`,
        },
      },
      /* The PO's door already stands on PURCHASING directly above; a working
         SUPPLIER node repeats no door (approved mock 2026-09-26). A complete
         node still names its document. */
      door: po.expectedReadyDate ? open(po.id, poHref(po.id)) : null,
    },
    {
      id: `${po.id}:receiving`,
      kind: "receiving",
      title: "RECEIVING",
      complete: orderedQty > 0 && receivedQty >= orderedQty && Boolean(record),
      lines: record
        ? [record.recordNo, dated("Received", record.receivedAt)]
        : [
            receivedQty > 0 && receivedQty < orderedQty
              ? `${receivedQty} of ${orderedQty} received`
              : "Warehouse has not received the goods",
          ],
      action: {
        ownerKey: "receiving",
        label: "Check in",
        context: {
          detail: `${po.id} · ${units(slice.qty)} · ${destination ?? "Carres Warehouse"} · ${dated("Estimated ready", po.expectedReadyDate) ?? requested(customerDelivery)}`,
        },
      },
      door: record ? open(record.recordNo, receivingHref(record.id)) : null,
    },
  ];
}

/** The quantity no Purchase Order covers — the whole chain is still ahead. */
function unassignedChain(
  line: LineFacts,
  qty: number,
  destination: string | null,
  customerDelivery: string | null,
): NodeDraft[] {
  return [
    {
      id: `${line.sku}:unassigned:purchasing`,
      kind: "purchasing",
      title: "PURCHASING",
      complete: false,
      blocked: true,
      lines: ["Carres has not issued a Purchase Order"],
      action: {
        ownerKey: "purchasing",
        label: "Issue PO",
        context: {
          detail: `${line.label} · ${units(qty)} · ${destination ?? "Carres Warehouse"} · ${requested(customerDelivery)}`,
        },
      },
      door: open("Purchasing", purchasingHref),
    },
    {
      id: `${line.sku}:unassigned:supplier`,
      kind: "supplier",
      title: "SUPPLIER",
      complete: false,
      lines: ["Supplier has not confirmed the ready date"],
    },
    {
      id: `${line.sku}:unassigned:receiving`,
      kind: "receiving",
      title: "RECEIVING",
      complete: false,
      lines: ["Warehouse has not received the goods"],
    },
  ];
}

/**
 * The stations of a group whose owning read FAILED. The first carries the two
 * sentences and `Try again →`; the rest carry the mark and the first sentence,
 * so no node in the group is ticked, CURRENT or speaking a business sentence.
 */
function unreadableDrafts(
  owner: UnreadableOwner,
  stations: ReadonlyArray<{ id: string; kind: RouteNodeKind; title: string }>,
): NodeDraft[] {
  const words = UNREADABLE[owner];
  return stations.map((station, index) => ({
    ...station,
    complete: false,
    unreadable: true,
    lines: index === 0 ? [words.what, words.not] : [words.what],
    door: index === 0 ? tryAgain(owner) : null,
  }));
}

const purchasingUnreadable = (input: SalesOrderRouteInput, sku: string): boolean => {
  const flag = input.unreadable?.purchasing;
  if (!flag) return false;
  if (flag === true) return true;
  const key = skuKey(sku);
  return flag.some((entry) => skuKey(entry) === key);
};

/** The STOCK truth of one goods line — its own fork off the Sales Order. */
function stockDraft(
  line: LineFacts,
  destination: string | null,
  customerDelivery: string | null,
  purchasingFailed = false,
): NodeDraft {
  const readyQty = line.reservedQty + line.soldQty;
  const allReady = readyQty >= line.committedQty && line.committedQty > 0;
  const codes = unitNames([...line.reservedUnits, ...line.soldUnits]);
  if (purchasingFailed && !allReady) {
    /* The count is Stock's own fact and stays. WHY the Units are short is
       Purchasing's answer, and Purchasing could not be read. */
    return {
      id: `${line.sku}:stock`,
      kind: "stock",
      title: "STOCK",
      complete: false,
      lines: [`${readyQty} of ${line.committedQty} Units ready`],
      door: open("Stock", stockHref),
    };
  }
  return {
    id: `${line.sku}:stock`,
    kind: "stock",
    title: "STOCK",
    complete: allReady,
    lines: allReady
      ? [`${units(line.committedQty)} ready`, codes || null, destination]
      : unitsShortWords(readyQty, line.committedQty),
    action: {
      ownerKey: "stock",
      label: "Create the Units",
      context: {
        detail: `${line.label} · ${units(Math.max(0, line.committedQty - readyQty))} · ${destination ?? "Carres Warehouse"} · ${requested(customerDelivery)}`,
      },
    },
    door: open("Stock", stockHref),
  };
}

/* ─────────────────────────────────────────────────────────────────────────────
 * Delivery, money, loan.
 * ──────────────────────────────────────────────────────────────────────────── */

function logisticsDraft(input: SalesOrderRouteInput): NodeDraft {
  const name = input.delivery.logistics?.partnerName?.trim() || null;
  return {
    id: "logistics",
    kind: "logistics",
    title: "LOGISTICS",
    complete: Boolean(name),
    lines: name ? [name] : ["Logistics not assigned"],
    action: {
      ownerKey: "delivery",
      label: "Assign logistics",
      context: {
        detail: requested(input.order.deliveryDate),
      },
    },
    door: open("Delivery", deliveryHref(input.order.id)),
  };
}

function deliveryDateDraft(input: SalesOrderRouteInput): NodeDraft {
  const booking = input.delivery.booking;
  const confirmed = booking?.confirmedDate ?? null;
  return {
    id: "delivery-date",
    kind: "delivery-date",
    title: "DELIVERY DATE",
    /* Owner ruling 2026-09-24: the Scheduled date completes it; the time is
       optional and printed only when recorded. */
    complete: Boolean(confirmed),
    lines: confirmed
      ? [dated("Scheduled delivery", confirmed), ...(booking?.slot ? [booking.slot] : [])]
      : ["Logistics has not scheduled the delivery", dated("Requested delivery", input.order.deliveryDate)],
    action: {
      ownerKey: "sales",
      label: "Confirm delivery date",
      context: {
        detail: requested(input.order.deliveryDate),
      },
    },
    door: open("Delivery", deliveryHref(input.order.id)),
  };
}

/**
 * ⭐ THE PAYMENT NODE SPEAKS IN TWO LINES — owner ruling 2026-09-26. Money in
 * full before delivery is absolute (2026-08-19, door closed 2026-09-01), so the
 * node says what that means for the truck — `Hold delivery` — over the amount
 * and the day it must be paid by. The deadline is ONE arithmetic with the Work
 * right panel and the Logistics card (`paymentDeadlineOf`, Law D): 2 working
 * days before the Scheduled delivery, else the Customer requested date; 3 for
 * an outstation delivery.
 */
function paymentDraft(input: SalesOrderRouteInput): NodeDraft {
  const payments = open("Payments", paymentsHref(input.order.so));
  const base = { id: "money", kind: "money" as const, title: "PAYMENT" };
  if (input.unreadable?.payments) {
    return unreadableDrafts("payments", [base])[0]!;
  }
  const holds = openFinanceExceptions(input.financeExceptions);
  const financeLine =
    holds.length === 0
      ? null
      : holds.length === 1
        ? `Finance hold · ${holds[0]!.reason}`
        : `Finance hold · ${holds.length} reasons`;
  const owing = input.money.known && input.money.outstanding > 0;

  if (!owing) {
    if (financeLine) {
      return { ...base, complete: false, blocked: true, lines: ["Hold delivery", financeLine], door: payments };
    }
    if (!input.money.known) {
      return { ...base, complete: false, lines: [NO_PRICE], door: payments };
    }
    return { ...base, complete: true, lines: ["Customer paid in full"], door: payments };
  }

  const scheduled = input.delivery.booking?.confirmedDate ?? null;
  const anchor = scheduled ?? input.order.deliveryDate;
  const deadline = paymentDeadlineOf({
    anchorIso: anchor,
    outstation: input.delivery.outstation === true,
    holidays: input.publicHolidays ? new Set(input.publicHolidays) : undefined,
  });
  const amount = `Customer has not paid ${ringgit(input.money.outstanding)}${deadline ? ` · Customer must pay by ${deadline}` : ""}`;
  /* An approval granted before the door closed is still honoured by the 0362
     predicate, so the delivery is NOT held — the money is simply still owed. */
  const honoured = paymentApprovalOpensGate(input.paymentApprovals) && !financeLine;
  return {
    ...base,
    complete: false,
    lines: [honoured ? null : "Hold delivery", amount, financeLine],
    action: {
      ownerKey: "payment",
      label: "Collect",
      context: {
        detail: scheduled ? `Scheduled delivery: ${scheduled}` : requested(input.order.deliveryDate),
      },
    },
    door: payments,
  };
}

/** Amber while the item is out. It never blocks the DO and never blocks the
 *  delivery — it is an independent obligation (Card 6, card §8). */
function loanDrafts(input: SalesOrderRouteInput): NodeDraft[] {
  const out = (input.loans ?? []).filter((loan) => !loan.returned);
  if (out.length === 0) {
    /* 0492 (Card 15) — before any item is out, the OFFER conversation is the
       loan's current state: an open offer waits for the customer's answer, an
       accepted offer waits for the loan Unit to go out. A declined offer
       renders nothing on the map — the history stays on the Sales Order. */
    const latest = [...(input.loanOffers ?? [])].sort(
      (a, b) => b.recordedAt.localeCompare(a.recordedAt) || (b.seq ?? 0) - (a.seq ?? 0),
    )[0];
    if (!latest || latest.event === "declined") return [];
    const what = latest.label?.trim() || "item";
    return [
      {
        id: `loan-offer:${latest.id}`,
        kind: "loan" as const,
        title: "LOAN",
        complete: false,
        /* Amber, like the loan itself: an open obligation, never a gate. */
        blocked: true,
        lines:
          latest.event === "offered"
            ? [`Loan offered · ${what}`, "Waiting for the customer's answer"]
            : [`Customer accepted the loan · ${what}`, "Prepare the loan Unit"],
        action: {
          ownerKey: latest.event === "offered" ? ("sales" as const) : ("delivery" as const),
          label: latest.event === "offered" ? "Record the customer's answer" : "Lend out the loan Unit",
          context: { detail: dated("Offered", latest.recordedAt) ?? "Offered" },
        },
        door:
          latest.event === "offered"
            ? door("Open Sales Order →", `/operation/orders/so/${encodeURIComponent(input.order.id)}`)
            : open("Delivery", deliveryHref(input.order.id)),
      },
    ];
  }
  return out.map((loan) => ({
    id: `loan:${loan.id}`,
    kind: "loan" as const,
    title: "LOAN",
    complete: false,
    blocked: true,
    lines: [
      `${loan.qty} ${loan.label} on loan to customer`,
      input.order.deliveredAt ? "Loan not collected back" : "Collect back on delivery day",
    ],
    action: {
      ownerKey: "delivery" as const,
      label: "Collect the loan item",
      context: {
        detail:
          dated("Collect on delivery", input.delivery.booking?.confirmedDate ?? input.order.deliveredAt) ??
          "Delivery date not confirmed",
      },
    },
    door: open("Delivery", deliveryHref(input.order.id)),
  }));
}

/* ─────────────────────────────────────────────────────────────────────────────
 * The gate. Read-only, and the SYSTEM issues the document — no Release button
 * exists anywhere in this module.
 * ──────────────────────────────────────────────────────────────────────────── */

const WEEKDAY_SUNDAY = 0;

/** A confirmed date on a Sunday or a Malaysian public holiday is refused (§8). */
function refusedDayLine(
  confirmed: string | null,
  holidays: ReadonlyArray<string>,
): string | null {
  if (!confirmed) return null;
  if (holidays.includes(confirmed)) return "Date falls on a public holiday — pick another day";
  const day = new Date(`${confirmed}T00:00:00Z`);
  if (Number.isNaN(day.getTime())) return null;
  return day.getUTCDay() === WEEKDAY_SUNDAY ? "Date falls on a Sunday — pick another day" : null;
}

interface GoodsTotals {
  committedQty: number;
  readyQty: number;
  soldQty: number;
}

function goodsTotals(lines: LineFacts[]): GoodsTotals {
  return {
    committedQty: lines.reduce((sum, line) => sum + line.committedQty, 0),
    readyQty: lines.reduce((sum, line) => sum + line.reservedQty + line.soldQty, 0),
    soldQty: lines.reduce((sum, line) => sum + line.soldQty, 0),
  };
}

function goodsRequirement(
  lines: LineFacts[],
  totals: GoodsTotals,
  input: SalesOrderRouteInput,
): GateRequirement {
  const scope = input.delivery.booking?.scope ?? null;

  /* A met goods requirement on PARTIAL goods is allowed ONLY when an explicit
     partial-delivery scope exists — and then the scope is DISPLAYED, never
     implied. */
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
          met: true,
          text: `Warehouse has ${units(scopeCommitted)} ready for this delivery · ${units(remaining)} still open`,
        };
      }
    }
  }

  if (totals.committedQty === 0) {
    return { id: "goods", met: true, text: "Customer ordered no goods" };
  }
  if (totals.readyQty >= totals.committedQty) {
    return { id: "goods", met: true, text: `Warehouse has ${units(totals.committedQty)} ready` };
  }
  return {
    id: "goods",
    met: false,
    text: `Warehouse has ${totals.readyQty} of ${totals.committedQty} Units ready`,
  };
}

/**
 * ⭐ THE FINANCE EXCEPTION IS THE MONEY REQUIREMENT — owner ruling 2026-08-16,
 * decision A. `financeExceptionHolds` is the ONE predicate the issue gate and
 * `order-actions.ts` ask; this requirement asks the same one so the map, the
 * worklist and the server can never disagree (Law D — the rule decision B was
 * right about, kept pointing the new way). An outstanding balance never lands
 * here: it stays on the MONEY branch as a collection fact with its open
 * `collect`, and the truck goes regardless.
 */
function financeExceptionRequirement(input: SalesOrderRouteInput): GateRequirement {
  const openOnes = openFinanceExceptions(input.financeExceptions);
  if (openOnes.length === 0) {
    return { id: "finance-exception", met: true, text: "No Finance hold" };
  }
  return {
    id: "finance-exception",
    met: false,
    text:
      openOnes.length === 1
        ? `Hold delivery · Finance hold · ${openOnes[0]!.reason}`
        : `Hold delivery · Finance hold · ${openOnes.length} reasons`,
  };
}

/**
 * ⭐ THE MONEY REQUIREMENT — owner ruling 2026-08-19, superseding decision A.
 * The same question `deliveryOrderIssueGate` and the 0362 database door ask:
 * outstanding = 0, or a recorded APPROVED Delivery Payment Approval. The
 * canvas asks the same predicate so the map, the worklist and the server can
 * never disagree (Law D). An UNKNOWN value never blocks — `orderMoney` reads
 * an unpriced order's goods owing as 0, so the figure here is always known.
 */
function moneyRequirement(input: SalesOrderRouteInput): GateRequirement {
  if (!input.money.known && input.money.outstanding <= 0) {
    // §8: an unknown value never holds — a number nobody knows may not stand
    // between a customer and their goods. The PAYMENT branch already warns.
    return { id: "money", met: true, text: NO_PRICE };
  }
  if (input.money.outstanding <= 0) {
    return { id: "money", met: true, text: "Customer paid in full" };
  }
  /* The door closed on 2026-09-01 and no surface invites an approval. One
     granted before that is history honoured: the line is met and reads `Paid`
     on the terms recorded — the DO prints its COD instruction (Delivery §3). */
  if (paymentApprovalOpensGate(input.paymentApprovals)) {
    return { id: "money", met: true, text: "Customer paid in full" };
  }
  return {
    id: "money",
    met: false,
    text: `Customer has not paid ${ringgit(input.money.outstanding)}`,
  };
}

function gateRequirements(
  lines: LineFacts[],
  totals: GoodsTotals,
  input: SalesOrderRouteInput,
): GateRequirement[] {
  const booking = input.delivery.booking;
  const confirmed = booking?.confirmedDate ?? null;
  const logisticsName = input.delivery.logistics?.partnerName?.trim() || null;
  const list: GateRequirement[] = [
    goodsRequirement(lines, totals, input),
    {
      id: "logistics",
      met: Boolean(logisticsName),
      text: logisticsName ? `Logistics chosen (${logisticsName})` : "Logistics not assigned",
    },
    {
      id: "appointment",
      met: Boolean(confirmed),
      text: confirmed ? "Logistics scheduled the delivery" : "Logistics has not scheduled the delivery",
    },
    moneyRequirement(input),
    financeExceptionRequirement(input),
  ];
  const refused = refusedDayLine(confirmed, input.publicHolidays ?? []);
  if (refused) list.push({ id: "refused-day", met: false, text: refused });
  return list;
}

function gateDraft(
  requirements: GateRequirement[],
  doNumber: string | null,
  failed: UnreadableOwner | null = null,
  /** The document's row id, when Delivery's record carries it. A number may
   *  change format; the id never does. */
  doId: string | null = null,
): NodeDraft {
  if (failed) {
    /* A gate that cannot read one of its requirements counts nothing: `3 of 5
       requirements met` from a failed read is the false claim this mark stops. */
    return {
      id: "delivery-order",
      kind: "delivery-order",
      title: "DELIVERY ORDER",
      complete: false,
      unreadable: true,
      lines: [UNREADABLE[failed].what],
      door: null,
    };
  }
  const met = requirements.filter((r) => r.met).length;
  const total = requirements.length;
  /* ⭐ ISSUED = THE ROW EXISTS (owner ruling 2026-09-26). When Delivery's own
     record names the live document, the document is the fact; the Route does
     not re-judge a Delivery Order the system already issued. */
  const ready = met === total || Boolean(doId && doNumber);
  return {
    id: "delivery-order",
    kind: "delivery-order",
    title: "DELIVERY ORDER",
    complete: ready && Boolean(doNumber),
    blocked: false,
    lines:
      ready && doNumber
        ? [doNumber, "Delivery order issued"]
        : [
            ready ? "READY FOR DELIVERY" : "NOT READY FOR DELIVERY",
            `${met} of ${total} requirements met`,
          ],
    requirements: ready && doNumber ? [] : requirements,
    /* The system issues the document. There is no Release button, no Approve
       button and no manual bypass anywhere in this module (§7, card §9). Once
       ISSUED the node is a complete node, and a complete node's anatomy law
       requires its door — to the DO object page (blueprint card 2026-08-16),
       never to a control. */
    door:
      ready && doNumber
        ? open(doNumber, `/operation/delivery-orders/${encodeURIComponent(doId ?? doNumber)}`)
        : null,
  };
}

function deliverDraft(input: SalesOrderRouteInput): NodeDraft {
  const attempts = input.delivery.attempts;
  const delivered =
    attempts.some((a) => a.result === "delivered") || Boolean(input.order.deliveredAt);
  const lastFailed = [...attempts].reverse().find((a) => a.result !== "delivered");
  const confirmed = input.delivery.booking?.confirmedDate ?? null;
  if (delivered) {
    const done = attempts.find((a) => a.result === "delivered") ?? null;
    return {
      id: "deliver",
      kind: "deliver",
      title: "DELIVER",
      complete: true,
      lines: ["Delivered", dated("Delivered", done?.recordedAt ?? input.order.deliveredAt)],
      door: open("Delivery", deliveryHref(input.order.id)),
    };
  }
  if (lastFailed) {
    return {
      id: "deliver",
      kind: "deliver",
      title: "DELIVER",
      complete: false,
      blocked: true,
      lines: [
        `Delivery ${lastFailed.attemptNo} not completed`,
        lastFailed.reason ?? "No reason recorded",
      ],
      action: {
        ownerKey: "delivery",
        label: "Arrange new delivery date",
        context: {
          detail: `${lastFailed.doNumber ?? "Delivery"} · ${dated("Previous visit", lastFailed.scheduledDate ?? lastFailed.recordedAt) ?? "Previous visit date not recorded"}`,
        },
      },
      door: open("Delivery", deliveryHref(input.order.id)),
    };
  }
  return {
    id: "deliver",
    kind: "deliver",
    title: "DELIVER",
    complete: false,
    lines: confirmed ? ["Logistics has not delivered the goods", dated("Scheduled", confirmed)] : ["Logistics has not delivered the goods"],
    door: open("Delivery", deliveryHref(input.order.id)),
  };
}

function photoDraft(input: SalesOrderRouteInput): NodeDraft {
  const photo = (input.delivery.photos ?? [])[0] ?? null;
  return {
    id: "delivery-photo",
    kind: "delivery-photo",
    title: "DELIVERY PHOTO",
    complete: Boolean(photo),
    lines: photo
      ? [photo.by ? `Uploaded by ${photo.by}` : "Uploaded", dated("Uploaded", photo.at)]
      : ["Logistics has not uploaded the delivery photo"],
    action: {
      ownerKey: "delivery",
      label: "Upload delivery photo",
      context: {
        detail: `${input.delivery.doNumber ?? "Delivery order"} · ${dated("Delivered", input.order.deliveredAt) ?? "Delivery date not recorded"}`,
      },
    },
    door: open("Delivery", deliveryHref(input.order.id)),
  };
}

/* ─────────────────────────────────────────────────────────────────────────────
 * The resolver — branches, then geometry, then connectors.
 * ──────────────────────────────────────────────────────────────────────────── */

/* ─────────────────────────────────────────────────────────────────────────────
 * Delivery scopes — one lane each.
 * ──────────────────────────────────────────────────────────────────────────── */

/** Dates leave this module as ISO and the page spells them. */
const ROUTE_SPELL: DeliveryStatusSpell = {
  date: (iso) => iso.slice(0, 10),
  dateTime: (iso) => iso.slice(0, 10),
  time: (value) => value,
};

const scopeKey = (scope: RouteDeliveryScope) => `${scope.leg}:${scope.trip}`;

const arrivedOrDelivered = (scope: RouteDeliveryScope) =>
  scope.attempts.some((attempt) => attempt.result === "delivered");

/** The same input, seen from ONE scope: Delivery's record for that scope
 *  stands where the V1 booking fields stood, so every draft below reads the
 *  owner's record through the one path it already had. */
function scopedInput(input: SalesOrderRouteInput, scope: RouteDeliveryScope): SalesOrderRouteInput {
  return {
    ...input,
    delivery: {
      ...input.delivery,
      logistics: scope.partnerName?.trim() ? { partnerName: scope.partnerName } : null,
      booking: scope.confirmedDate
        ? { confirmedDate: scope.confirmedDate, slot: scope.confirmedTime, scope: null }
        : null,
      doNumber: scope.deliveryOrder?.number ?? null,
      photos: scope.photos,
      attempts: [],
    },
  };
}

/**
 * ⭐ `DELIVER` PRINTS DELIVERY'S WORDS, NOT ITS OWN (owner ruling 2026-09-26).
 * Line one is the scope's rung through Delivery's ONE label function; a second
 * label function on this surface is a Law D defect. The Route's own sentence
 * survives only for a scope with no Delivery Order yet.
 */
function scopeDeliverDraft(
  input: SalesOrderRouteInput,
  scope: RouteDeliveryScope,
  id: string,
): NodeDraft {
  const doorway = open("Delivery", deliveryHref(input.order.id));
  if (!scope.deliveryOrder) {
    return {
      id,
      kind: "deliver",
      title: "DELIVER",
      complete: false,
      lines: ["Logistics has not delivered the goods", dated("Scheduled", scope.confirmedDate)],
      door: doorway,
    };
  }
  const facts = {
    partnerName: scope.partnerName,
    confirmedDate: scope.confirmedDate,
    confirmedTime: scope.confirmedTime,
    hasDeliveryOrder: true,
    handoverEvents: scope.handoverEvents,
    attempts: scope.attempts,
    intermediateLeg: scope.transfer,
    legStop: scope.legStop,
    missingFacts: [],
    todayIso: null,
  };
  const status = deliveryWorkStatusOf(facts, ROUTE_SPELL);
  const progress = deliveryJourneyProgressFromStatus(status, facts);
  const done = status.kind === "delivered" || status.kind === "arrived";
  const latest = [...scope.attempts].sort((a, b) => b.recordedAt.localeCompare(a.recordedAt))[0];
  const second = done
    ? dated(scope.transfer ? "Arrived" : "Delivered", latest?.recordedAt?.slice(0, 10) ?? null)
    : status.kind === "failed"
      ? (latest?.reason ?? status.reasonLabel ?? status.second)
      : status.kind === "confirmed"
        ? dated("Scheduled", scope.confirmedDate)
        : status.second;
  return {
    id,
    kind: "deliver",
    title: "DELIVER",
    complete: done,
    blocked: status.kind === "failed",
    lines: [progress.label, second],
    action:
      status.kind === "failed"
        ? {
            ownerKey: "delivery",
            label: "Arrange new delivery date",
            context: { detail: scope.deliveryOrder.number },
          }
        : null,
    door: doorway,
  };
}

export function resolveSalesOrderRoute(given: SalesOrderRouteInput): SalesOrderRouteMap {
  /* ⭐ DELIVERY'S OWN RECORDS WIN (owner ruling 2026-09-26). An ordinary order
     has one scope and keeps today's single chain, read from that scope. Two or
     more scopes each take a lane; the money deadline then anchors on the first
     scope that reaches the customer. */
  const scopes =
    given.unreadable?.delivery === true ? [] : [...(given.delivery.scopes ?? [])];
  const anchor = scopes.find((scope) => !scope.transfer) ?? scopes[0] ?? null;
  const input = anchor ? scopedInput(given, anchor) : given;
  const laneScopes = scopes.length > 1 ? scopes : [];
  const soleScope = scopes.length === 1 ? scopes[0]! : null;
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

  /* ── CURRENT: one per route, up to three, never a fourth. Loan is an
     obligation, not a position, so it never takes one. Seal order is reading
     order, so the goods CURRENT lands on the first unfinished position. ── */
  const currentTaken: Partial<Record<RouteBranchKey, boolean>> = {};
  const seal = (drafts: NodeDraft[], branch: RouteBranchKey): RouteNode[] => {
    const eligible = branch === "goods" || branch === "delivery" || branch === "money";
    const mayOwn = eligible && !currentTaken[branch];
    const { nodes: sealedNodes, hasHead } = sealChain(drafts, branch, mayOwn);
    if (mayOwn && hasHead) currentTaken[branch] = true;
    return sealedNodes;
  };

  /* ── goods: ONE LANE PER LINE. The plate names the line so no product name
     ever sits on a connector; the chains hang under it; every chain
     converges on the line's ONE stock node. ────────────────────────────── */
  const lanes: GoodsLane[] = [];
  for (const line of lines) {
    const destinations = input.lineDestinations?.[line.sku] ?? [];
    const destination = destinations.length === 1 ? destinations[0]!.name : null;
    const purchasingFailed = purchasingUnreadable(input, line.sku);
    const { slices, unassignedQty } = purchasingFailed
      ? { slices: [] as PurchaseSlice[], unassignedQty: 0 }
      : purchaseSlices(line, input.purchaseOrders);

    const chains: RouteNode[][] = [];
    if (purchasingFailed && line.outstandingQty > 0) {
      chains.push(
        seal(
          unreadableDrafts("purchasing", [
            { id: `${line.sku}:unreadable:purchasing`, kind: "purchasing", title: "PURCHASING" },
            { id: `${line.sku}:unreadable:supplier`, kind: "supplier", title: "SUPPLIER" },
            { id: `${line.sku}:unreadable:receiving`, kind: "receiving", title: "RECEIVING" },
          ]),
          "goods",
        ),
      );
    }
    for (const slice of slices) {
      chains.push(
        seal(
          purchaseChain(slice, input.receivingRecords, destination, input.order.deliveryDate),
          "goods",
        ),
      );
    }
    if (unassignedQty > 0) {
      chains.push(
        seal(
          unassignedChain(line, unassignedQty, destination, input.order.deliveryDate),
          "goods",
        ),
      );
    }
    const stock = seal(
      [stockDraft(line, destination, input.order.deliveryDate, purchasingFailed)],
      "goods",
    )[0]!;

    /* Owner ruling 2026-09-26: `on order` is covered by an issued PO, `to buy`
       is covered by none. `to buy from factory` said *buy* about goods already
       bought, and is retired. */
    const onOrderQty = slices.reduce((sum, slice) => sum + slice.qty, 0);
    const { nodes: plateNodes } = sealChain(
      [
        {
          id: `${line.sku}:goods-line`,
          kind: "goods-line",
          title: line.label,
          complete: true,
          lines: [
`Customer ordered ${line.committedQty}`,
            onOrderQty > 0 ? `Carres ordered ${onOrderQty} from supplier` : null,
            unassignedQty > 0 ? `Carres has not ordered ${unassignedQty} yet` : null,
          ],
        },
      ],
      "goods",
      false,
    );
    const plate = plateNodes[0]!;
    const cols = Math.max(1, chains.length);
    const w = cols * NODE_W + (cols - 1) * COL_GAP;
    plate.w = w;
    lanes.push({ plate, chains, stock, solo: null, w });
  }

  /* A cancelled line keeps its place in the story and states its outcome. It
     has no chain: there is no route to walk. */
  for (const cancelled of input.cancelledLines ?? []) {
    const { nodes: soloNodes } = sealChain(
      [
        {
          id: `cancelled:${cancelled.sku}`,
          kind: "cancelled",
          title: "CANCELLED",
          complete: true,
          lines: [
            `${cancelled.label?.trim() || cancelled.sku} · Qty ${cancelled.qty}`,
            `Cancelled · Rev ${cancelled.revision}`,
          ],
        },
      ],
      "goods",
      false,
    );
    lanes.push({ plate: null, chains: [], stock: null, solo: soloNodes[0]!, w: NODE_W });
  }

  const deliveryFailed = input.unreadable?.delivery === true;
  const deliveryChain = seal(
    deliveryFailed
      ? unreadableDrafts("delivery", [
          { id: "logistics", kind: "logistics", title: "LOGISTICS" },
          { id: "delivery-date", kind: "delivery-date", title: "DELIVERY DATE" },
        ])
      : laneScopes.length > 0
        ? []
        : [logisticsDraft(input), deliveryDateDraft(input)],
    "delivery",
  );

  /* ── ONE DELIVERY SCOPE IS ONE LANE (owner ruling 2026-09-26). The plate
     names the scope; the lane carries its own LOGISTICS → DELIVERY DATE →
     DELIVERY ORDER → DELIVER → DELIVERY PHOTO. `CURRENT` stays ONE for the
     whole group — `seal` hands it to the earliest unfinished lane. ───────── */
  interface DeliveryLane {
    scope: RouteDeliveryScope;
    plate: RouteNode;
    gate: RouteNode;
    /** Every node under the plate, in reading order. */
    column: RouteNode[];
    deliver: RouteNode;
  }
  const paymentsFailed = input.unreadable?.payments === true;
  const goodsLane = (line: LineFacts): number => {
    if (laneScopes.every((scope) => scope.trip === 0)) return 0;
    const group = deliveryGroupOf(line.sku);
    const index = laneScopes.findIndex(
      (scope) => group != null && (scope.tripGroups ?? []).includes(group),
    );
    return index >= 0 ? index : 0;
  };
  const deliveryLanes: DeliveryLane[] = laneScopes.map((scope, index) => {
    const key = scopeKey(scope);
    const seen = scopedInput(given, scope);
    const rename = (draft: NodeDraft): NodeDraft => ({ ...draft, id: `${draft.id}:${key}` });
    const plate = sealChain(
      [
        {
          id: `delivery-lane:${key}`,
          kind: "delivery-lane",
          /* `Leg 1` heads the plate; its two places take the rows under it,
             so a long stop name is never cut. */
          title: (scope.plate ?? "").split(" · ")[0] || `Trip ${scope.trip}`,
          complete: true,
          lines: [(scope.plate ?? "").split(" · ").slice(1).join(" · ")],
          spoken: [scope.plate ?? `Trip ${scope.trip}`],
        },
      ],
      "delivery",
      false,
    ).nodes[0]!;
    const head = seal([rename(logisticsDraft(seen)), rename(deliveryDateDraft(seen))], "delivery");

    /* Readiness follows the shipment: a trip counts the goods it carries, a
       Journey's first leg counts the order, and a later leg counts nothing —
       its goods are the ones the leg before it brought. */
    const carried =
      scope.trip > 0
        ? lines.filter((line) => goodsLane(line) === index)
        : index === 0
          ? lines
          : [];
    const laneRequirements = gateRequirements(carried, goodsTotals(carried), seen).filter(
      (requirement) => requirement.id !== "goods" || scope.trip > 0 || index === 0,
    );
    const before = scope.leg > 1 ? laneScopes[index - 1] ?? null : null;
    if (before) {
      const arrived = arrivedOrDelivered(before);
      const stop = before.legStop?.trim();
      laneRequirements.push({
        id: "previous-leg",
        met: arrived,
        text: arrived
          ? `Leg ${before.leg} arrived${stop ? ` at ${stop}` : ""}`
          : `Leg ${before.leg} not arrived yet`,
      });
    }
    const gate = sealChain(
      [
        rename(
          gateDraft(
            laneRequirements,
            scope.deliveryOrder?.number ?? null,
            paymentsFailed ? "payments" : null,
            scope.deliveryOrder?.id ?? null,
          ),
        ),
      ],
      "gate",
      false,
    ).nodes[0]!;
    const tailDrafts = [
      scopeDeliverDraft(given, scope, `deliver:${key}`),
      /* A transfer leg draws no DELIVERY PHOTO: the customer leg owes the proof. */
      ...(scope.transfer ? [] : [rename(photoDraft(seen))]),
    ];
    const tail =
      gate.mark === "complete"
        ? seal(tailDrafts, "delivery")
        : sealChain(tailDrafts, "delivery", false).nodes;
    return { scope, plate, gate, column: [...head, gate, ...tail], deliver: tail[0]! };
  });

  const moneyChain = seal([paymentDraft(input)], "money");
  const loanNodes = loanDrafts(input).map(
    (draft) => sealChain([draft], "loan", false).nodes[0]!,
  );

  /* ── geometry: the bands name the routes, and the wider GROUP_GAP is what
     separates GOODS from DELIVERY from MONEY — never a colour. ─────────── */
  const goodsW =
    lanes.length > 0
      ? lanes.reduce((sum, lane) => sum + lane.w, 0) + (lanes.length - 1) * COL_GAP
      : 0;
  const groups: { key: RouteBranchKey; label: string; w: number }[] = [];
  if (lanes.length > 0) groups.push({ key: "goods", label: "GOODS", w: goodsW });
  groups.push({
    key: "delivery",
    label: "DELIVERY",
    w:
      deliveryLanes.length > 0
        ? deliveryLanes.length * NODE_W + (deliveryLanes.length - 1) * COL_GAP
        : NODE_W,
  });
  groups.push({ key: "money", label: "PAYMENT", w: NODE_W });
  if (loanNodes.length > 0) {
    groups.push({
      key: "loan",
      label: "LOAN",
      w: loanNodes.length * NODE_W + (loanNodes.length - 1) * COL_GAP,
    });
  }

  const spanW = Math.max(
    NODE_W,
    groups.reduce((sum, group) => sum + group.w, 0) + (groups.length - 1) * GROUP_GAP,
  );
  const centreX = PAD + spanW / 2;

  const totals = goodsTotals(lines);
  const requirements = gateRequirements(lines, totals, input);
  const doNumber =
    input.delivery.doNumber ??
    [...input.delivery.attempts].reverse().find((a) => a.doNumber)?.doNumber ??
    null;

  const originDraft: NodeDraft = {
    id: "sales-order",
    kind: "sales-order",
    title: "SALES ORDER",
    complete: true,
    lines: [soNumber, dated("SO Doc Date", input.order.placedAt)],
    /* Order Route already sits inside this Sales Order object. A door back to
       the same object is circular navigation, not useful evidence (§0.1). */
    door: null,
  };
  const { nodes: originNodes } = sealChain([originDraft], "root", false);
  const origin = originNodes[0]!;
  origin.x = centreX - NODE_W / 2;
  origin.y = PAD;

  const bandY = origin.y + origin.h + BAND_GAP;
  const rowTop = bandY + BAND_H + BAND_DROP;
  const bands: RouteBand[] = [];
  let deepest = rowTop;
  let groupX = PAD;
  for (const group of groups) {
    bands.push({ id: group.key, label: group.label, x: groupX, y: bandY, w: group.w, h: BAND_H });
    if (group.key === "goods") {
      let laneX = groupX;
      for (const lane of lanes) {
        if (lane.solo) {
          lane.solo.x = laneX;
          lane.solo.y = rowTop;
          deepest = Math.max(deepest, rowTop + lane.solo.h);
        } else {
          const plate = lane.plate!;
          plate.x = laneX;
          plate.y = rowTop;
          const chainTop = rowTop + plate.h + ROW_GAP;
          let laneBottom = chainTop;
          lane.chains.forEach((chain, index) => {
            let y = chainTop;
            for (const chainNode of chain) {
              chainNode.x = laneX + index * PITCH;
              chainNode.y = y;
              y += chainNode.h + ROW_GAP;
            }
            laneBottom = Math.max(laneBottom, y - ROW_GAP);
          });
          const stock = lane.stock!;
          stock.x = laneX + (lane.w - NODE_W) / 2;
          stock.y = lane.chains.length > 0 ? laneBottom + ROW_GAP : chainTop;
          deepest = Math.max(deepest, stock.y + stock.h);
        }
        laneX += lane.w + COL_GAP;
      }
    } else if (group.key === "delivery" && deliveryLanes.length > 0) {
      /* The plates share one height, so every lane's stations start on the
         same row and a leg reads across as easily as down. */
      const plateH = Math.max(...deliveryLanes.map((lane) => lane.plate.h));
      for (const lane of deliveryLanes) lane.plate.h = plateH;
      deliveryLanes.forEach((lane, index) => {
        const x = groupX + index * PITCH;
        lane.plate.x = x;
        lane.plate.y = rowTop;
        let y = rowTop + lane.plate.h + ROW_GAP;
        for (const laneNode of lane.column) {
          laneNode.x = x;
          laneNode.y = y;
          y += laneNode.h + ROW_GAP;
        }
        deepest = Math.max(deepest, y - ROW_GAP);
      });
    } else if (group.key === "delivery" || group.key === "money") {
      const chain = group.key === "delivery" ? deliveryChain : moneyChain;
      let y = rowTop;
      for (const chainNode of chain) {
        chainNode.x = groupX;
        chainNode.y = y;
        y += chainNode.h + ROW_GAP;
      }
      deepest = Math.max(deepest, y - ROW_GAP);
    } else {
      loanNodes.forEach((loanNode, index) => {
        loanNode.x = groupX + index * PITCH;
        loanNode.y = rowTop;
        deepest = Math.max(deepest, rowTop + loanNode.h);
      });
    }
    groupX += group.w + GROUP_GAP;
  }

  const gateFailed: UnreadableOwner | null = deliveryFailed
    ? "delivery"
    : input.unreadable?.payments
      ? "payments"
      : null;
  const { nodes: gateNodes } = sealChain(
    [gateDraft(requirements, doNumber, gateFailed, soleScope?.deliveryOrder?.id ?? null)],
    "gate",
    false,
  );
  const gate = gateNodes[0]!;
  gate.x = centreX - NODE_W / 2;
  gate.y = deepest + GATE_GAP;
  const laned = deliveryLanes.length > 0;

  const { nodes: tailNodes } = sealChain(
    deliveryFailed
      ? unreadableDrafts("delivery", [
          { id: "deliver", kind: "deliver", title: "DELIVER" },
          { id: "delivery-photo", kind: "delivery-photo", title: "DELIVERY PHOTO" },
        ]).map((draft) => ({ ...draft, lines: [UNREADABLE.delivery.what], door: null }))
      : [
          soleScope ? scopeDeliverDraft(given, soleScope, "deliver") : deliverDraft(input),
          photoDraft(input),
        ],
    "tail",
    false,
  );
  let tailY = gate.y + gate.h + ROW_GAP;
  for (const node of tailNodes) {
    node.x = centreX - NODE_W / 2;
    node.y = tailY;
    tailY += node.h + ROW_GAP;
  }
  const deliver = tailNodes[0]!;
  const photo = tailNodes[1]!;

  const nodes: RouteNode[] = [
    origin,
    ...lanes.flatMap((lane) =>
      lane.solo ? [lane.solo] : [lane.plate!, ...lane.chains.flat(), lane.stock!],
    ),
    ...deliveryChain,
    ...deliveryLanes.flatMap((lane) => [lane.plate, ...lane.column]),
    ...moneyChain,
    ...loanNodes,
    /* With lanes, every lane carries its own gate and tail; the one central
       gate is not drawn. */
    ...(laned ? [] : [gate, ...tailNodes]),
  ];

  /* ── connectors ──────────────────────────────────────────────────────── */
  const edges: RouteEdge[] = [];
  const segment = (from: RouteNode, to: RouteNode, labelLines: string[], forceDashed = false) => {
    const points = elbow(from, to);
    const style: RouteEdge["style"] =
      forceDashed || from.mark !== "complete" ? "dashed" : "solid";
    const drop = points[points.length - 1]!;
    edges.push({
      id: `${from.id}→${to.id}`,
      from: from.id,
      to: to.id,
      style,
      labelLines,
      points,
      labelAt: labelLines.length > 0 ? { x: drop.x, y: to.y - 10 } : null,
    });
  };

  /* The Sales Order is the ONLY start node: goods, delivery and money leave
     it simultaneously. Route names live on the BANDS, so no edge carries a
     caption — the one edge fact left is the loan's `collect back`. */
  for (const lane of lanes) {
    if (lane.solo) {
      segment(origin, lane.solo, []);
      continue;
    }
    const plate = lane.plate!;
    const stock = lane.stock!;
    segment(origin, plate, []);
    for (const chain of lane.chains) {
      segment(plate, chain[0]!, []);
      for (let i = 0; i < chain.length - 1; i += 1) segment(chain[i]!, chain[i + 1]!, []);
      segment(chain[chain.length - 1]!, stock, []);
    }
    if (lane.chains.length === 0) segment(plate, stock, []);
    /* A goods tail joins the gate of the trip that carries it; on a Journey
       every tail joins leg 1's gate. */
    const line = lines.find((item) => `${item.sku}:stock` === stock.id);
    segment(stock, laned ? deliveryLanes[line ? goodsLane(line) : 0]!.gate : gate, []);
  }
  for (const lane of deliveryLanes) {
    segment(origin, lane.plate, []);
    segment(lane.plate, lane.column[0]!, []);
    for (let i = 0; i < lane.column.length - 1; i += 1) {
      segment(lane.column[i]!, lane.column[i + 1]!, []);
    }
    /* The last node of a lane has no trailing line. */
    segment(moneyChain[moneyChain.length - 1]!, lane.gate, []);
  }
  if (!laned) {
    segment(origin, deliveryChain[0]!, []);
    for (let i = 0; i < deliveryChain.length - 1; i += 1) {
      segment(deliveryChain[i]!, deliveryChain[i + 1]!, []);
    }
    segment(deliveryChain[deliveryChain.length - 1]!, gate, []);
  }
  segment(origin, moneyChain[0]!, []);
  for (let i = 0; i < moneyChain.length - 1; i += 1) {
    segment(moneyChain[i]!, moneyChain[i + 1]!, []);
  }
  if (!laned) segment(moneyChain[moneyChain.length - 1]!, gate, []);
  /* The loan is collected back where the customer is — the last lane. */
  const collectAt = laned ? deliveryLanes[deliveryLanes.length - 1]!.deliver : deliver;
  for (const loanNode of loanNodes) {
    segment(origin, loanNode, []);
    segment(loanNode, collectAt, ["collect back"], true);
  }

  if (!laned) {
    segment(gate, deliver, []);
    segment(deliver, photo, []);
  }
  /* The last node has no trailing line. */

  const width = PAD * 2 + spanW;
  const height = (laned ? deepest : photo.y + photo.h) + PAD;

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

  /* `unmatchedUnits` is a Stock-register discrepancy, not a step on the route;
     it stays out of the map and is reported by the Stock register itself. */
  void input.allocation.unmatchedUnits.reduce((sum, unit) => sum + unitQty(unit), 0);

  return {
    orderId: input.order.id,
    soNumber,
    customerName: input.order.customerName,
    nodes,
    edges,
    bands,
    linkedProblems,
    proposedChange: proposedChangeOf(input),
    width,
    height,
  };
}

/**
 * ⭐ `PROPOSED CHANGE` — owner ruling 2026-09-25. One band above the canvas,
 * three sentences and no more: the fact with who and when, the door, and the
 * sentence that stops the wrong reading. It links to the request (Law C); no
 * proposed lane is ever drawn on the map.
 */
const valueWord = (value: string) =>
  !value.trim() || /^[—–-]$/.test(value.trim()) ? "Not recorded" : value.trim();

function proposedChangeOf(input: SalesOrderRouteInput): RouteProposedChange | null {
  if (input.unreadable?.amendment) {
    return {
      kind: "unreadable",
      fact: "Could not read the change requests for this order.",
      changes: [],
      more: 0,
      door: { label: "Try again →", href: "#retry-amendment" },
      rule: null,
    };
  }
  const request = input.amendment ?? null;
  if (!request) return null;
  const stale = request.status === "stale";
  const who = request.submittedBy?.trim() || "Staff";
  const when = request.submittedAt ? ` on ${request.submittedAt.slice(0, 10)}` : "";
  const approver = request.approver?.trim() || null;
  const rows = request.changes ?? [];
  return {
    kind: stale ? "out-of-date" : "waiting",
    /* WHO asked · WHAT object · WHO decides · WHAT they must do (owner, 2026-09-27). */
    fact: stale
      ? `${who} asked to change this order${when}. The order changed after that. ${who} must send the request again.`
      : `${who} asked to change this order${when}. ${approver ?? "The approver"} has not approved it yet.`,
    /* No dash stands for a value (owner ruling 2026-09-26): an empty side of
       the arrow prints its word. */
    changes: rows
      .slice(0, 3)
      .map((row) => `${row.what}: ${valueWord(row.before)} → ${valueWord(row.after)}`),
    more: Math.max(0, rows.length - 3),
    door: door("Open the request →", `/operation/orders/so/${encodeURIComponent(input.order.id)}`),
    rule: "The map shows the order as it stands today, not the change.",
  };
}

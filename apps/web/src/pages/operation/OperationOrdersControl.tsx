import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useParams, useSearchParams } from "react-router-dom";
import {
  useAllPendingChangeRequests,
  useOperationOrders,
  useOperationStock,
  useDeliveryPartners,
  useOperationStaff,
  usePurchasingSettings,
  useOperationPoDuty,
  useUpdateStaffSetting,
  useAssignOrderStaff,
  assignOrderStaffRequest,
  useCatalog,
  useOperationSuppliers,
  type operationOrderListRow,
} from "@/lib/queries";
import { useActiveOrder } from "@/lib/active-order";
import { fmtDate, fmtDateShort } from "@/lib/fmt-date";
import { orderStatusPill } from "@/lib/status-pill";
import { cjkClassName } from "@/lib/cjk";
import { areaForAddress, detectState, locationForAddress } from "@/lib/region";
import {
  type CoreCat,
  type ItemKind,
  lineCategory,
  lineSize,
  accShort,
  lineKind,
} from "@/lib/line-category";
import { apiFetch } from "@/lib/api";
import { orderBookingDay, orderControlOf } from "@/lib/order-booking";
import { personLabel, personInitials, avatarColor } from "@/lib/staff-avatar";
import OrderDetailDrawer from "./components/OrderDetailDrawer";
import type { OrderJourneySignals } from "./components/OrderJourneyHeader";
import { TopBarIcons } from "./components/GlobalTopBar";
import FollowUpForm from "./components/FollowUpForm";
import ImportStockEtaDialog from "./components/ImportStockEtaDialog";
import ListPageShell, { type ActiveChip } from "@/components/ListPageShell";
import { SectionBand, SectionCard } from "@/components/SectionPanel";
import { TASKS_KEY } from "./components/rail/TasksPanel";
import {
  distributeOrders,
  seenTodayMYT,
  countsAsInToday,
  isOpsManager,
  isOpsManagerRow,
  isOpsGenericAccount,
  canRaisePo,
  isPoDayMYT,
  nextPoDayMYT,
  poUrgentBypass,
  purchasingUrgentWindowDays,
  DELIVERY_QUEUES,
  deliveryQueueByKey,
  deliveryQueueForLabel,
  deliveryQueueLeads,
  deliveryStepOverdue,
  orderActionOverdue,
  myHolidaySet,
  deliveryDateGapFact,
  orderActionButton,
  orderActionChecklist,
  orderActionLine,
  orderActionQueue,
  orderActionsInDisplayOrder,
  displayOrderAction,
  openOrderActions,
  orderIsDelivering,
  orderMoney,
  storageHold,
  type OrderActionKey,
  type OrderActionSignals,
  type OrderOpenAction,
  type OrderMoney,
  type DeliveryQueueKey,
  type OpsTask,
  type OpsTasksListResponse,
  type OpsStaffMember,
} from "@carres/shared";
import RaisePoReview from "./components/RaisePoReview";
import type { RaisePoOrder } from "./components/raise-po-plan";
import ChaseSupplierReview from "./components/ChaseSupplierReview";
import type { ChaseOrder } from "./components/chase-supplier-plan";
import ChasePartnerReview, {
  type PartnerChaseOrder,
} from "./components/ChasePartnerReview";
import { useAuth } from "@/lib/auth";
import type { OperationStage } from "./components/StageChip";
import {
  RefreshCw,
  ChevronRight,
  ChevronsLeft,
  Clock,
  Inbox,
  LayoutGrid,
  PackageOpen,
  Truck,
  Warehouse,
  Download,
  CheckCircle2,
  X,
  Flag,
  Lock,
  Printer,
  MoreVertical,
  MoreHorizontal,
  Bell,
  Users,
  PackagePlus,
  MessageCircle,
  // C10 — the three dots' glyphs (UI-KIT §A4 canonical mapping:
  // stock `package` · logistic `truck` · money `wallet`).
  Package,
  Wallet,
  type LucideIcon,
} from "lucide-react";

/**
 * OperationOrdersControl — the unified Orders **control table** (Jess redesign
 * step 2, 2026-06-08, `docs/operation-portal-redesign.md` §1).
 *
 * Merges the three legacy Orders surfaces — the 6-column kanban
 * (OperationOrders), the AutoCount triage Inbox (OperationInbox), and the flat
 * read-only feed (OperationAllOrders) — into ONE daily-driver table. Every
 * order lands here; a click opens the existing full-control OrderDetailDrawer.
 *
 * Status tabs map the Master Sheet's logistics-remark flow onto the live
 * pipeline (Placed → Proceed → To book → Customer confirmed → Delivered → All).
 * C1 (Jess 2026-07-27) renamed the middle two: `Pending` is a banned word
 * (pending on WHAT?) and a date logistics proposed is not a booking.
 *
 *   Placed            — genuinely new, not yet triaged (native/salesperson)
 *   Proceed           — being arranged. INCLUDES AutoCount-imported orders per
 *                       the agreed entry rule (AutoCount import → Proceed;
 *                       future salesperson → Placed) + proceed_request stage.
 *   To book           — past placement, goods and/or the customer's date still
 *                       outstanding (the readiness split below)
 *   Customer confirmed— stock in AND the customer confirmed a date + slot
 *   Delivered         — delivered
 *   All               — see-everything
 *
 * Reuses the kanban driver `/api/operation/orders` (via useOperationOrders) as
 * the single source of truth for stage derivation — the control table is the
 * kanban-as-table, so stage logic stays in one place (`stageOf`, mirrored from
 * OperationOrders). The endpoint was extended 2026-06-08 with the flat columns
 * this table needs (customer_phone, source_*, ops_assigned_logistic, lines).
 *
 * Cancelled orders are excluded server-side (the driver filters
 * status IN place/proceed_order/delivered), so "All" = every live order. That
 * matches current intent; surface cancelled later if Jess asks.
 */

type ControlTab =
  | "placed"
  | "proceed"
  | "pending"
  | "scheduled"
  | "completed"
  | "all";

// The 5 pipeline stages + "All". Default = All, but completed orders sort to the
// bottom (see compareBySlack), so the live work shows first WITHOUT a separate
// "Open" tab (Jess 2026-06-29: dropped the Open meta-tab — it confused him).
const TABS: { key: ControlTab; label: string }[] = [
  { key: "all", label: "All" },
  { key: "placed", label: "Placed" },
  { key: "proceed", label: "Proceed" },
  { key: "pending", label: "To book" },
  { key: "scheduled", label: "Customer confirmed" },
  { key: "completed", label: "Delivered" },
];

/** Tooltip for the "All" meta tab — the five pipeline stages get theirs from
 *  TAB_DESC below. */
const STATUS_META_DESC: Partial<Record<ControlTab, string>> = {
  all: "Every order — live work first, completed history at the bottom",
};

type SettledTab = Exclude<ControlTab, "all">;

const TAB_LABEL: Record<SettledTab, string> = {
  placed: "Placed",
  proceed: "Proceed",
  pending: "To book",
  scheduled: "Customer confirmed",
  completed: "Delivered",
};

/** Plain-English meaning of each pipeline status — surfaced as a hover tooltip
 *  on the tabs + the row Status chip so operation doesn't have to guess what
 *  "Proceed" means. */
const TAB_DESC: Record<SettledTab, string> = {
  placed: "New order, not processed yet (a salesperson placed it)",
  proceed: "Confirmed — being arranged. Every AutoCount-imported order starts here.",
  pending:
    "The customer has not confirmed a delivery date yet — the Actions column says who to call",
  scheduled: "The customer confirmed a delivery date + time slot",
  completed: "Delivered and closed",
};

/** Stage derivation — mirrors OperationOrders.stageOf so the two surfaces never
 *  disagree on where an order sits in the pipeline. */
export function stageOf(o: operationOrderListRow): OperationStage {
  if (o.status === "place") return "placed";
  if (o.operation_stage) return o.operation_stage as OperationStage;
  if (o.status === "delivered") return "delivered";
  return "in_production";
}

/** Which control tab an order belongs to. */
function controlTabOf(
  o: operationOrderListRow,
  availableBySku?: Map<string, number>,
): SettledTab {
  const s = stageOf(o);
  if (s === "delivered") return "completed";
  // Native POS order not yet proceeded stays "placed".
  if (s === "placed" && o.source_system !== "autocount") return "placed";
  // In-pipeline (proceeded / autocount / confirmed / in_production / dispatched).
  // READINESS split (Jess 2026-07-19): the pipeline stage never advances in the
  // portal (POs are raised outside), so tabs must read the REAL state — To book
  // = still waiting on stock OR the customer's date; Customer confirmed = stock
  // in AND that date confirmed. Needs the live free-stock map; without it we
  // fall back to the old stage mapping (the param-less `=== "completed"`
  // callers).
  if (availableBySku) {
    // C2 (2026-07-27) — the predicate now matches the WORD. C1 renamed these
    // tabs `To book` / `Customer confirmed` and correctly left the computation
    // alone; this card owns it. The old split also required stock to be in, so
    // an order whose customer HAD confirmed a date but whose goods were still
    // out landed in `To book` — where the word is simply wrong, because there
    // is nothing left to book. Goods and the booking are two independent facts
    // (Law 1), and the goods one is already told by the Stock column and by the
    // goods action; this tab answers only "has the customer confirmed?".
    //
    // T1 (0277): "confirmed" = the CUSTOMER's yes (booking_stage + a date), not
    // the logistics company's provisional word — provisional rows stay in
    // `To book`, so the tab agrees with the drawer's booking chip.
    //
    // Nothing moves today: 0 of 56 live control rows carry a confirmed booking.
    return bookingConfirmedOf(o) ? "scheduled" : "pending";
  }
  if (s === "dispatched" || s === "ready_to_dispatch") return "scheduled";
  if (s === "in_production") return "pending";
  return "proceed"; // confirmed OR autocount-placed
}

type StockState = "ready" | "in_stock" | "need_po" | "awaiting" | "unknown";

export interface StockInfo {
  state: StockState;
  /** Units needed / coverable from free stock — only on the matchable
   *  early-stage states (in_stock / need_po). */
  need?: number;
  have?: number;
  /** Per-SKU shortfall, for the need_po tooltip. */
  short?: { sku: string; need: number; have: number }[];
}

/** Stock cell — HYBRID of pipeline stage + a live free-stock check.
 *
 *  Later stages are read from the pipeline, NOT recounted: ready_to_dispatch+
 *  means stock was already secured/reserved (a free-balance recount would now
 *  read 0 and wrongly cry "short"), and awaiting_operation_action means a PO is
 *  already open against a confirmed shortage. So those stay stage-derived.
 *
 *  Early stages (placed / proceed_request) haven't reserved anything yet, so we
 *  CAN compare each line's need against live free balance (availableBySku, from
 *  /api/operation/stock — same source as the Stock On-Hand page):
 *    • every line covered      → in_stock   ("fulfil from shelf")
 *    • some line short          → need_po    ("make to order / raise PO")
 *  AutoCount orders carry free-text SKUs that aren't in the catalog, so their
 *  SKUs are absent from availableBySku → unknown ("—"), the old behaviour. The
 *  map being undefined (stock still loading / errored) also falls back to
 *  unknown, so the column degrades gracefully. */
export function stockReadiness(
  o: operationOrderListRow,
  availableBySku?: Map<string, number>,
): StockInfo {
  const s = stageOf(o);
  if (s === "ready_to_dispatch" || s === "dispatched" || s === "delivered")
    return { state: "ready" };
  if (s === "in_production") return { state: "awaiting" };

  // Early stages: real free-stock check, only when the live map is present AND
  // every line SKU is a known catalog SKU (else we can't honestly compute it).
  const lines = o.order_lines ?? [];
  // An AutoCount-imported line carries its PO in source_po (not a portal PO), so
  // "has a PO" ⇒ at least Waiting, never "No PO" — keeps the list STOCK pill in
  // sync with the order-detail readiness (Jess 2026-07-02, inside/outside tally).
  const hasPo = lines.some((l) => !!l.source_po);
  const noStock: StockInfo = hasPo ? { state: "awaiting" } : { state: "unknown" };
  if (!availableBySku || lines.length === 0) return noStock;

  const needBySku = new Map<string, number>();
  for (const l of lines) {
    const q = Number(l.qty || 0);
    if (q > 0) needBySku.set(l.sku, (needBySku.get(l.sku) ?? 0) + q);
  }
  if (needBySku.size === 0) return noStock;
  for (const sku of needBySku.keys())
    if (!availableBySku.has(sku)) return noStock;

  let need = 0;
  let have = 0;
  const short: { sku: string; need: number; have: number }[] = [];
  for (const [sku, q] of needBySku) {
    const avail = Math.max(0, availableBySku.get(sku) ?? 0);
    need += q;
    have += Math.min(avail, q);
    if (avail < q) short.push({ sku, need: q, have: avail });
  }
  return short.length === 0
    ? { state: "in_stock", need, have }
    : { state: "need_po", need, have, short };
}

/** Three-state stock bucket for the header filter — collapses the 5 internal
 *  StockStates into the same Ready / Waiting / Not set the Stock column shows
 *  (Jess: filter the list by stock too, not just status + region). */
const STOCK_BUCKETS = ["Ready", "Waiting", "No PO"] as const;
type StockBucket = (typeof STOCK_BUCKETS)[number];
function stockBucketOf(
  o: operationOrderListRow,
  availableBySku?: Map<string, number>,
): StockBucket {
  const s = stockReadiness(o, availableBySku).state;
  if (s === "ready" || s === "in_stock") return "Ready";
  if (s === "need_po" || s === "awaiting") return "Waiting";
  return "No PO";
}

/** A follow-up IS an ops_task linked to the order (#2, Jess 2026-06-26). The
 *  table reads the open (not done/cancelled) tasks per order from the Tasks feed;
 *  the "lead" task drives the row flag + the Action cell — escalated first, then
 *  overdue (red ⚠), then in-progress (amber 🚩); newest within a tier. */
type TaskUrgency = "escalated" | "overdue" | "inprogress";
function taskUrgency(t: OpsTask): TaskUrgency {
  if (t.escalatedAt) return "escalated";
  if (t.overdue) return "overdue";
  return "inprogress";
}
const TASK_RANK: Record<TaskUrgency, number> = { escalated: 3, overdue: 2, inprogress: 1 };
function openTaskOf(tasks: OpsTask[]): OpsTask | null {
  if (!tasks.length) return null;
  return [...tasks].sort(
    (a, b) =>
      TASK_RANK[taskUrgency(b)] - TASK_RANK[taskUrgency(a)] ||
      (a.createdAt < b.createdAt ? 1 : -1),
  )[0];
}

/** Days from today to the customer deadline (negative = overdue); null when the
 *  order carries no actionable date (TBD / undated). */
/** Row → the pure Raise-PO plan input (0236 consolidated PO review). */
function toRaisePoOrder(o: operationOrderListRow): RaisePoOrder {
  return {
    id: o.id,
    so: o.so ?? null,
    deliveryDate: o.delivery_date_tbd ? null : (o.delivery_date ?? null),
    lines: (o.order_lines ?? []).map((l) => ({
      sku: l.sku,
      qty: Number(l.qty || 0),
      sourcePo: (l as { source_po?: string | null }).source_po ?? null,
      attrs: (l as { attrs?: Record<string, unknown> | null }).attrs ?? null,
    })),
  };
}

/** Row → the pure supplier follow-up plan input. Suppliers speak the ORIGINAL
 *  CR/TCF ref (source_ref[0]), never the SO number. */
function toChaseOrder(o: operationOrderListRow): ChaseOrder {
  return {
    id: o.id,
    so: o.so ?? null,
    refNo: (o.source_ref ?? []).filter(Boolean)[0] ?? null,
    deliveryDate: o.delivery_date ?? null,
    lines: (o.order_lines ?? []).map((l) => ({
      sku: l.sku,
      qty: Number(l.qty || 0),
      sourcePo: l.source_po ?? null,
    })),
  };
}

/** Row → the logistics follow-up input. Companies speak the ORIGINAL
 *  CR/TCF ref; the partner is the order-level LP (delivery_partner_id) or the
 *  Inbox-triaged LP (ops_assigned_logistic). Region = the real delivery place. */
function toPartnerChaseOrder(o: operationOrderListRow): PartnerChaseOrder {
  return {
    id: o.id,
    partnerId: o.delivery_partner_id ?? o.ops_assigned_logistic ?? null,
    refNo: (o.source_ref ?? []).filter(Boolean)[0] ?? null,
    customer: o.customer_name ?? null,
    region: locationForAddress(o.customer_address).label,
    deliveryDate: o.delivery_date ?? null,
    deliveryTbd: !!o.delivery_date_tbd,
    lines: (o.order_lines ?? []).map((l) => ({
      sku: l.sku,
      qty: Number(l.qty || 0),
    })),
  };
}

function daysToDue(o: operationOrderListRow): number | null {
  if (o.delivery_date_tbd || !o.delivery_date) return null;
  const d = new Date(`${o.delivery_date}T00:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((d.getTime() - today.getTime()) / 86_400_000);
}

// (supplierDeadlineBucket + supplierLeadDays removed with the SUPPLIER-urgency
//  rail pills — Jess 2026-07-19 B redesign: deadline is now the ONE shared
//  customer-deadline DEADLINE band; the supplier stock-window nuance stays in
//  the NEXT verb's red/amber tone, not a separate filter.)

/** Today as a local ISO date (YYYY-MM-DD) — for lexical ISO date compares. */
export function todayIso(): string {
  const t = new Date();
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`;
}
/** Shift an ISO date by n days (n may be negative), returned as ISO. */
function addDaysIso(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// ─── Stock supplier ETA (stock_eta version, 2026-07-12) ──────────────────────
// The STOCK column carries the SUPPLIER arrival ETA, read from the imported
// per-line data on the ops_order_control overlay (Import from Master →
// line_etas + line_stock_status; migration 0170). "When can the whole order
// ship" = the LATEST ETA among lines still WAITING; a Ready order shows no ETA
// (no noise once the goods are in). Measured against the customer DEADLINE:
//   • OVERDUE = the ETA has passed and the goods still haven't arrived.
//   • LATE    = the ETA is later than deadline − 3d (misses the promise buffer).
// NOTE the PO-date+lead formula (下PO日 + MS/BF 7d · SOF 5d) is deferred to
// Phase 2 — there's no PO-raised date on the order; this reads stock_eta only.
type StockEtaState = "ready" | "on_track" | "late" | "overdue" | "no_eta" | "none";
/** Exported because `rowDotsOf` takes one — a caller (and its test) could not
 *  otherwise name the type of an argument it has to build. */
export interface StockEta {
  /** Latest ETA among waiting lines (ISO), or null when none / all ready. */
  etaIso: string | null;
  /** Any line still waiting on stock. */
  waiting: boolean;
  state: StockEtaState;
}
export function stockEtaOf(o: operationOrderListRow): StockEta {
  const ovl = ovlOf(o);
  const etas = (ovl?.line_etas ?? null) as Record<string, string> | null;
  const status = (ovl?.line_stock_status ?? null) as Record<string, string> | null;
  if (!etas && !status) return { etaIso: null, waiting: false, state: "none" };

  // Waiting lines: prefer the imported per-line status; without it, treat any
  // ETA'd line as still-waiting (an ETA is only entered while awaiting arrival).
  const waitingKeys =
    status && Object.keys(status).length > 0
      ? Object.entries(status)
          .filter(([, v]) => String(v).toLowerCase() !== "ready")
          .map(([k]) => k)
      : Object.keys(etas ?? {});
  if (waitingKeys.length === 0) return { etaIso: null, waiting: false, state: "ready" };

  // Latest ETA among the waiting lines (fall back to any ETA present).
  let etaIso: string | null = null;
  if (etas) {
    const pool = waitingKeys.map((k) => etas[k]).filter(Boolean);
    for (const d of pool.length ? pool : Object.values(etas))
      if (!etaIso || d > etaIso) etaIso = d;
  }
  if (!etaIso) return { etaIso: null, waiting: true, state: "no_eta" };

  if (etaIso < todayIso()) return { etaIso, waiting: true, state: "overdue" };
  const dd = !o.delivery_date_tbd && o.delivery_date ? o.delivery_date : null;
  if (dd && etaIso > addDaysIso(dd, -3)) return { etaIso, waiting: true, state: "late" };
  return { etaIso, waiting: true, state: "on_track" };
}

/** Supplier-late (Jess 2026-07-18): the goods ETA misses or has passed the
 *  customer promise and the goods aren't in — the machine's answer to
 *  "which orders got problem"; a fact, never a submission. */
export function isSupplierLate(o: operationOrderListRow): boolean {
  const se = stockEtaOf(o);
  return se.waiting && (se.state === "late" || se.state === "overdue");
}

/** Slack (days) = buffer before this order is late; LOWER = more dangerous, so
 *  the list sorts ascending. OPTION B (Loo 2026-07-12): the customer DEADLINE is
 *  the spine (deadline − today); a blocked stock track applies a BOUNDED upward
 *  BUMP — overdue / late / no-ETA stock floats an order a few days up the queue,
 *  but an order already past its promise still outranks one merely due soon (the
 *  bump never overrides a much-later deadline). Completed sinks to the bottom;
 *  TBD / undated sit just above it. */
export function slackDays(o: operationOrderListRow): number {
  if (controlTabOf(o) === "completed") return 99_999;
  const dd = daysToDue(o);
  if (dd == null) return 9_000; // TBD / undated → tail, above completed
  const se = stockEtaOf(o);
  let bump = 0;
  if (se.waiting) {
    if (se.state === "overdue") bump = 5; // stock overdue → strongest bump
    else if (se.state === "late" || se.state === "no_eta") bump = 3; // late / unknown ETA
  }
  return dd - bump;
}

/** DUE filter group (Jess 2026-06-25): one standardised urgency ladder by
 *  days-to-deadline, so urgency is a proper filter dimension like Status/Stock —
 *    Overdue (past) · Urgent (≤1d, today/tomorrow) · Attention (2–3d) ·
 *    Upcoming (4–7d) · Later (7+d).
 *  Completed / TBD / undated orders sit in NO bucket (only "All" shows them). */
// DEADLINE filter buckets (Jess 2026-07-19, B redesign) — the CUSTOMER deadline
// (delivery_date) is the single shared spine; SUPPLIER + LOGISTIC both filter by
// it. Multi-select. "Next week" caps at 14d; further-out orders are unbucketed
// (the filter is opt-in). "Overdue" is ALSO the QUEUES Overdue row (same state).
const DUE_BUCKETS = ["Overdue", "Due ≤3d", "This week", "Next week"] as const;
type DueBucket = (typeof DUE_BUCKETS)[number];
function dueBucketOf(o: operationOrderListRow): DueBucket | null {
  if (controlTabOf(o) === "completed") return null;
  const diff = daysToDue(o);
  if (diff === null) return null;
  if (diff < 0) return "Overdue";
  if (diff <= 3) return "Due ≤3d";
  if (diff <= 7) return "This week";
  if (diff <= 14) return "Next week";
  return null;
}

/** Immutable toggle of one value in a Set — add if absent, remove if present.
 *  Powers every multi-select facet (Jess 2026-07-19, B redesign). */
function toggleInSet<T>(prev: Set<T>, v: T): Set<T> {
  const n = new Set(prev);
  if (n.has(v)) n.delete(v);
  else n.add(v);
  return n;
}

// (Follow-up + Escalate-to-Jess now live in ops_tasks, keyed per order — see
//  openTaskOf / taskUrgency above + the tasksByOrder map in the component.)

// The logistic's committed delivery ETA (ops_order_control.logistic_eta, 0180)
// used to be read here. Since T10 it is read as the PROVISIONAL half of the
// booking, inside `orderBookingRead` (@/lib/order-booking) — one adapter, so the
// Delivery column and the delivery calendar cannot read different columns.

/** D1 two-stage booking (0277, T1) — TRUE only when the CUSTOMER confirmed the
 *  delivery: booking_stage='confirmed' AND a confirmed_date (invariant #1 —
 *  the stage word alone is never trusted without its date). */
function bookingConfirmedOf(o: operationOrderListRow): boolean {
  const ovl = ovlOf(o);
  return ovl?.booking_stage === "confirmed" && !!ovl.confirmed_date;
}

/** C-vocab (Jess 2026-07-19): the QUEUES rows ARE the actions — one vocabulary
 *  across QUEUES · the Actions column · the drawer. A row sits in exactly the
 *  queue its action names; the counts match by construction. State words
 *  (Waiting/Ready) live in FILTERS only.
 *
 *  C1 (Jess 2026-07-27): every one of these words now comes from
 *  `orderActionQueue` in packages/shared — the ONE home of COPY-STANDARD's
 *  action dictionary — so the queue word and the row line can never drift. A
 *  queue word carries NO party (a queue holds many suppliers); the row line
 *  names one (`Call Ohana — confirm ready date`). */
// T7 (Jess 2026-07-27) — the QUEUE SPLIT: the STOCK actions stay here, the four
// DELIVERY actions moved to their own facet group (DELIVERY_QUEUES in
// packages/shared), each carrying its own auto-overdue deadline. Assign /
// Confirm delivery date used to sit in this list; they are the same actions,
// just rendered in the delivery group now — no row changed queue.
// C8 (Jess 2026-07-27) — the delay radar's one queue became TWO, because the
// two are different work done by different people: `Delay planning` is an
// internal DECISION, `Arrange new delivery date` is a call to logistics that
// only exists when the decision said the promise cannot be kept.
// `Send PO` is retired. Raising a purchase order is ONE act — `Issue PO`, which
// ends when the formal PO exists (Loo, 2026-07-30 — the Purchasing clean
// restart). The keys are listed here in LIFECYCLE order, which is what this rail
// has always used (`Delay planning` sits below the ready-date call here and
// above it in Law 4).
// Display priority is the engine's DISPLAY_RANK and is not this list's job.
const STOCK_QUEUE_KEYS = [
  "issue_po",
  "confirm_ready_date",
  "delay_planning",
  "arrange_new_delivery_date",
] as const satisfies readonly OrderActionKey[];
const NEXT_QUEUE_VERBS = STOCK_QUEUE_KEYS.map(orderActionQueue);
const NEXT_QUEUE_DESC: Record<string, string> = {
  [orderActionQueue("issue_po")]:
    "Nothing ordered and no purchase order covers these goods — issue one, which mints the PO number and the document the supplier receives",
  [orderActionQueue("confirm_ready_date")]:
    "PO issued but goods not in yet — call the supplier for the ready date (red once inside the stock window)",
  // C8 — this tooltip used to read "call the customer now", which is the exact
  // thing Law 4 rung 2 forbids. Carres does not phone a customer about a delay.
  [orderActionQueue("delay_planning")]:
    "Supplier date lands after the promised date — decide before anyone calls (Delay planning)",
  [orderActionQueue("arrange_new_delivery_date")]:
    "The promised date cannot be met — logistics arranges the new date with the customer",
};

/** A stored timestamp as the operator's OWN calendar date.
 *
 *  A deadline is a calendar fact, so the timezone question belongs to the
 *  caller and not to the shared engine (`delivery-queue.ts` says the same). The
 *  browser doing this work sits in MYT, so its local date IS the business day —
 *  slicing the UTC string instead would read midnight-to-08:00 work as the day
 *  before. */
function localDateOf(ts: string | null | undefined): string | null {
  if (!ts) return null;
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return null;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** C8b — the day one of the two delay clocks starts (`ORDERS-WORKING-FLOW` §3).
 *
 *  `Delay planning` counts from the day the supplier's date FIRST overshot the
 *  promise; the logistics call counts from the moment Operations recorded that
 *  the promise cannot be met. Both stamps are server-owned (0304 / 0305), so
 *  nobody can move their own deadline.
 *
 *  The sighting NAMES the supplier date it was about, and this is where that
 *  pays: if the stamp is no longer about the date the ladder is looking at, it
 *  is not about this delay, and the action carries NO deadline rather than a
 *  wrong one. Silence over a false alarm — the rule every other queue here
 *  already follows. */
export function delayActionAnchor(
  o: operationOrderListRow,
  key: OrderActionKey,
): string | null {
  const ovl = ovlOf(o);
  if (key === "arrange_new_delivery_date")
    return localDateOf(ovl?.delay_decision_at);
  if (key !== "delay_planning") return null;
  const detectedEta = ovl?.delay_detected_eta ?? null;
  if (!detectedEta || detectedEta !== stockEtaOf(o).etaIso) return null;
  return localDateOf(ovl?.delay_detected_at);
}

/** T7 — the delivery-photo action. Its queue is the ONLY delivery queue that
 *  deliberately spans CLOSED orders (same reason as Owing: the proof is still
 *  outstanding after the order is delivered), so it is named here for the two
 *  places that must special-case it — the count scope and the facet-active
 *  completed-drop. */
const DELIVERY_PHOTO_VERB = deliveryQueueByKey("photo").label;
/** The step's anchor date for the auto-overdue check — a TBD customer date has
 *  no anchor, so those rows can never be late (silence over a false alarm). */
export function deliveryStepAnchor(
  o: operationOrderListRow,
  step: DeliveryQueueKey,
): string | null {
  switch (step) {
    case "assign":
    case "chase":
      return o.delivery_date_tbd ? null : o.delivery_date;
    case "deliver_today":
      return ovlOf(o)?.confirmed_date ?? null;
    case "photo":
      return o.delivered_at;
  }
}

// ─── Next action (C2, 2026-07-08) ────────────────────────────────────────────
// The single most-urgent NEXT step per order — one lamp per row. PURE: reads
// only existing signals (stock readiness, controlTabOf stage, the control
// overlay). Never mutates readinessOf / stageOf / counts.
type NextTone = "danger" | "warning" | "info" | "success" | "neutral";
export interface NextAction {
  /** Which action this is. The QUEUE word and the row LINE are both derived
   *  from it (packages/shared `order-action-words`), so a rename lands in one
   *  place and every surface follows. */
  key: OrderActionKey;
  /** The action's QUEUE word — party-free, so it can name a facet row, a filter
   *  chip and a count. The row's own line is `orderActionLine(key, parties)`. */
  label: string;
  tone: NextTone;
  /** Delivery is HELD on an owing balance/storage (🔒). */
  locked?: boolean;
}
/** ACTIONS column (Jess 2026-07-19, renamed from Manage 2026-07-27): every
 *  action is a tone-coloured .pill — one consistent language (no plain-text
 *  verb next to a money pill). Each NextTone maps to its status pill:
 *  danger→red · warning→amber · info→blue · success→green · neutral→grey.
 *  (Money's `Collect RM {amount}` keeps the distinct indigo pill-collected so
 *  the independent money track reads apart from the goods/delivery action.) */
const NEXT_PILL_CLASS: Record<NextTone, string> = {
  danger: "pill-overdue",
  warning: "pill-warning",
  // info actions (Assign logistics / Confirm delivery date-not-yet) are AMBER,
  // not blue: blue is reserved for SELECTION only (§2 colour law, 2026-07-19).
  info: "pill-warning",
  success: "pill-confirmed",
  neutral: "pill-neutral",
};

// ─── The three dots (C10, Jess 2026-07-27 — ACTION-FLOW Law 6 + §7) ──────────
// THREE INDEPENDENT FACTS — goods · delivery · money — never merged into one
// word. They sit BESIDE the stage pill (Jess: the pill says WHERE the order is,
// the dots say WHICH PART has trouble); neither replaces the other. The dots are
// the row's ONLY colour channel; the fact cells (n/m, ETA, logistics, ladder
// word) stay ink/grey. Grey = not applicable / nothing known yet.
//
// ORDER: goods · delivery · money, per Law 6 and ORDERS-WORKING-FLOW §7. (The
// §14 note of 2026-07-18 said Money · Stock · Delivery; the 2026-07-27 laws
// re-ruled it, and since nothing had ever rendered these dots no screen changes.)
//
// This function returns the STATE, never a colour: the hue is the renderer's
// business, so a test can pin the meaning without pinning a hex.
const DOT_HEX = {
  green: "#639922",
  amber: "#EF9F27",
  red: "#E24B4A",
  grey: "#D1D5DB",
} as const;
type DotState = keyof typeof DOT_HEX;
interface RowDot {
  state: DotState;
  title: string;
}
export function rowDotsOf(
  o: operationOrderListRow,
  stock: StockInfo,
  se: StockEta,
  logi: LogisticState,
): [RowDot, RowDot, RowDot] {
  const completed = controlTabOf(o) === "completed";
  // 钱 — an owing balance stays RED even after delivery (§7: the owing customer
  // is the one call that survives Delivered). C5: the number comes from the
  // shared rule, so this dot and the row's 🔒 can never disagree. Grey stays
  // reserved for genuinely UNKNOWN money — an order nobody has priced.
  const m = moneyOf(o);
  const money: RowDot = !m.known
    ? { state: "grey", title: "Money — no order value on record" }
    : m.owing
      ? { state: "red", title: `Money — RM ${fmtRM(m.outstanding)} outstanding` }
      : { state: "green", title: "Money — settled" };
  // 货 — red only for the true blockers (No PO / supplier ETA late-or-overdue).
  let goods: RowDot;
  if (completed) goods = { state: "green", title: "Stock — done (delivered)" };
  else if (se.state === "ready" || stock.state === "ready" || stock.state === "in_stock")
    goods = { state: "green", title: "Stock — all in" };
  else if (stock.state === "unknown")
    goods = { state: "red", title: "Stock — no PO raised yet" };
  else if (se.state === "overdue" || se.state === "late")
    goods = { state: "red", title: "Stock — supplier ETA late vs the deadline" };
  else goods = { state: "amber", title: "Stock — waiting arrival" };
  // 送 — guardrail #2: a delivered order never alarms. T1 (0277): green is
  // reserved for the CUSTOMER's confirmation; a provisional logistics date stays
  // amber (never green); red only past deadline while unconfirmed.
  let delivery: RowDot;
  if (completed) delivery = { state: "green", title: "Delivery — delivered" };
  else if (logi.key === "confirmed")
    delivery = { state: "green", title: "Delivery — customer confirmed" };
  else if (logi.key === "unassigned")
    delivery = { state: "grey", title: "Delivery — no logistics picked yet" };
  else {
    const dd = daysToDue(o);
    const late = dd !== null && dd < 0;
    delivery =
      logi.key === "provisional"
        ? late
          ? { state: "red", title: "Delivery — past deadline, customer not confirmed" }
          : { state: "amber", title: "Delivery — logistics date only, customer not confirmed" }
        : late
          ? { state: "red", title: "Delivery — past deadline, no booking" }
          : { state: "amber", title: "Delivery — customer has not confirmed a date" };
  }
  return [goods, delivery, money];
}
/** The three dots on screen (C10). Each dot IS its own icon — that is what
 *  labels it, which is why the dots need no header of their own (Jess
 *  2026-07-27). Glyphs come from the UI-KIT §A4 canonical mapping so the same
 *  meaning wears the same icon portal-wide: goods `package` · delivery `truck`
 *  · money `wallet`. Never emoji (§A11 rule 2), never a bare coloured circle —
 *  a circle with no icon would be unreadable without a header to look up.
 *
 *  Each dot carries its own tooltip, because a colour alone states a fact
 *  nobody can name (COPY-STANDARD rule 7: the label says WHAT, the tip WHY).
 *  `shrink-0` is deliberate: on a narrow screen the stage PILL truncates (it
 *  has a tooltip and a five-word vocabulary) and the dots stay whole. */
const DOT_ICON: Record<"goods" | "delivery" | "money", LucideIcon> = {
  goods: Package,
  delivery: Truck,
  money: Wallet,
};
function RowDots({
  o,
  stock,
  se,
  logi,
}: {
  o: operationOrderListRow;
  stock: StockInfo;
  se: StockEta;
  logi: LogisticState;
}) {
  const dots = rowDotsOf(o, stock, se, logi);
  const kinds = ["goods", "delivery", "money"] as const;
  return (
    <span className="inline-flex items-center gap-1 shrink-0" data-testid="row-dots">
      {dots.map((dot, i) => {
        const kind = kinds[i];
        const Icon = DOT_ICON[kind];
        return (
          <span
            key={kind}
            title={dot.title}
            aria-label={dot.title}
            data-testid={`row-dot-${kind}`}
            data-dot-state={dot.state}
            className="inline-flex"
          >
            <Icon size={14} strokeWidth={2} style={{ color: DOT_HEX[dot.state] }} />
          </span>
        );
      })}
    </span>
  );
}
export function fmtRM(n: number): string {
  return n.toLocaleString("en-MY", { maximumFractionDigits: 0 });
}

// ─── Staff ownership (migration 0232, Jess model B 2026-07-18) ───────────────
// One soft owner per order (ops_order_control.assigned_staff). NEVER a
// visibility wall: everyone sees every row; the owner is who's watching it.
const NO_STAFF = "__none" as const;
function ownerOf(o: operationOrderListRow): string | null {
  return ovlOf(o)?.assigned_staff ?? null;
}
/** Identity label/initials/colour — shared with the right-rail Team panel
 *  via @/lib/staff-avatar (one person = one look everywhere). */
function staffLabel(m: OpsStaffMember): string {
  return personLabel(m.name, m.email);
}
function staffInitials(m: OpsStaffMember): string {
  return personInitials(m.name, m.email);
}

function ovlOf(o: operationOrderListRow) {
  return orderControlOf(o);
}

// ─── Money (C5, 2026-07-27) ──────────────────────────────────────────────────
// ONE reading of what an order still owes, shared with the booking gate, the
// drawer and the collections desk (`orderMoney`, packages/shared). Before this
// card every money surface here read `ops_order_control.balance` — NULL on all
// 55 live control rows — so the 🔒, the Owing facet row and the Collect RM pill
// were all permanently silent while 18 orders owed RM 56,859. The money DOT
// reads this too — since C10 it is on screen, beside the stage pill, so a row
// that owes money says so in three places that cannot disagree.
//
// STORAGE comes through its own shared rule (`storageHold`, C9) — this page
// used to read the Master-imported fee columns and IGNORE `storage_fee_override`,
// so an order the operator had marked "No storage" still counted its fee, and
// the dispatch gate disagreed with this row. One rule now, three readers.
//
// C9 also split two questions that used to be one: a manager may RELEASE a
// delivery over an uncollected storage fee. That lifts the 🔒 (`holds`) and
// leaves the money owed (`owing`), so `Collect RM …` stays on the worklist —
// a release never quietly forgives money.
export function moneyOf(o: operationOrderListRow): OrderMoney {
  const ovl = ovlOf(o);
  const lines = o.order_lines ?? [];
  const hold = storageHold({
    storageFrom: ovl?.storage_from ?? null,
    override: ovl?.storage_fee_override ?? null,
    importedMsbf: ovl?.storage_fee_msbf ?? null,
    importedSof: ovl?.storage_fee_sof ?? null,
    skus: lines.map((l) => String(l.sku ?? "")),
    asOf: todayIso(),
    collectedAt: ovl?.storage_collected_at ?? null,
    waiverStatus: ovl?.storage_waiver_status ?? null,
  });
  const price = (r: { qty: number; unit_price?: number | string | null }) =>
    Number(r.unit_price ?? 0) * Number(r.qty ?? 0);
  return orderMoney({
    lineSum: lines.reduce((s, l) => s + price(l), 0),
    addonSum: (o.order_addons ?? []).reduce((s, a) => s + price(a), 0),
    paid: o.paid,
    controlBalance: ovl?.balance ?? null,
    storageOwing: hold.owing,
    storageReleased: hold.released,
  });
}

/** NEXT — TWO LAYERS since C2 (Jess 2026-07-27, `docs/ACTION-FLOW-STANDARD.md`
 *  Law 1). This file no longer decides what an order's next step IS: it reads
 *  the row's signals, hands them to the shared engine (`order-actions`), and
 *  renders the answer.
 *
 *    LAYER 1 · `openOrderActions` — every track evaluated independently, so a
 *              goods action can no longer swallow the delivery and money work.
 *    LAYER 2 · `displayOrderAction` — which ONE the row shows.
 *
 *  `nextActionOf` keeps its exact signature and its exact answers: it is now
 *  Layer 2 over Layer 1, and its whole test suite (the ladder's locked rulings —
 *  Loo's freeze gate, the T3 delay radar, the T7 date split, C5's money hold)
 *  is the parity oracle proving the split changed no row's headline.
 *
 *  WORD LAW (Jess 2026-07-19 C-vocab, re-ruled 2026-07-27): "Assign" = WE pick
 *  the logistics company; "Confirmed" = the CUSTOMER fixed a date + slot (a
 *  STATE, never our verb). "Chase" is banned — every former Chase label is a
 *  `Call {party} — {measurable outcome}` (COPY-STANDARD).
 *
 *  `label` is the action's QUEUE word (party-free). The pill the operator reads
 *  is `orderActionLine(key, …)` — the same action with the real name in it. */

/** The row's signals, in the engine's vocabulary. ONE mapping, so Layer 1 and
 *  the drawer's list can never read the same order two different ways.
 *
 *  `goodsReady` honours BOTH signals (Jess 2026-07-19 #5 fix): the live
 *  free-stock check AND the Master import's per-line `line_stock_status`.
 *  AutoCount SKUs miss the catalog, so the live check alone is always
 *  "awaiting" and a Master-ready order would never leave the goods track. */
export function orderActionSignalsOf(
  o: operationOrderListRow,
  stock: StockInfo,
  lines: { sku: string; qty: number }[],
): OrderActionSignals {
  const se = stockEtaOf(o);
  // The stock-arrival window: MS/BF = deadline−7d, sofa = −5d. Still a flat
  // per-category number — the supplier master holds production time as free
  // text, so nothing can compute a real one yet (ORDERS-WORKING-FLOW §3).
  const hasMsbf = lines.some((l) => {
    const c = lineCategory(l.sku);
    return c === "mattress" || c === "bedframe";
  });
  const hasSofa = lines.some((l) => lineCategory(l.sku) === "sofa");
  const money = moneyOf(o);
  return {
    completed: controlTabOf(o) === "completed",
    goodsReady:
      stock.state === "ready" ||
      stock.state === "in_stock" ||
      se.state === "ready",
    goodsUnordered: stock.state === "unknown",
    stockEtaIso: se.etaIso,
    promisedDateIso: o.delivery_date_tbd ? null : o.delivery_date ?? null,
    daysToDue: daysToDue(o),
    stockWindowDays: hasMsbf ? 7 : hasSofa ? 5 : 7,
    hasLogistics: !!(o.delivery_partners?.name || o.ops_assigned_logistic),
    bookingConfirmed: bookingConfirmedOf(o),
    confirmedDateIso: ovlOf(o)?.confirmed_date ?? null,
    todayIso: todayIso(),
    // C7 — has this trip's delivery order been issued? `do_number` is the
    // document's own completion signal, and it is on the list select already.
    // Three-way like the photo ledger: `undefined` (an older Worker that does
    // not select the column) is UNKNOWN and raises nothing.
    deliveryOrderIssued:
      o.do_number === undefined ? null : !!(o.do_number ?? "").trim(),
    // T7's three-way answer: [] is "no photo yet", absent is UNKNOWN — an older
    // Worker that doesn't select the column must not flood every delivered row
    // with a demand we cannot substantiate.
    photoOnFile: Array.isArray(ovlOf(o)?.delivery_photos)
      ? (ovlOf(o)!.delivery_photos as unknown[]).length > 0
      : null,
    // C8 — the recorded answer to "can we still make the promised date?", and
    // the supplier date it was made ABOUT. Both come from the overlay in one
    // read, so the engine can compare them against the CURRENT date: a factory
    // that slips again is a NEW delay, and an old answer may not silence it.
    // Absent on a pre-0304 Worker → `undefined` → the pre-C8 behaviour exactly
    // (Delay planning opens on the overshoot, as the radar always did).
    delayDecision: ovlOf(o)?.delay_decision ?? null,
    delayDecisionEtaIso: ovlOf(o)?.delay_decision_eta ?? null,
    // C9 — two different questions. `owing` raises the money ACTION; `holds`
    // is the 🔒 on the delivery, and a manager's release parts them.
    moneyOwing: money.owing,
    moneyHolds: money.holds,
  };
}

/** LAYER 1 for this row — every open action, in display order. The drawer's
 *  dynamic checklist and the row's headline read this same list. */
export function openActionsOf(
  o: operationOrderListRow,
  stock: StockInfo,
  lines: { sku: string; qty: number }[],
): OrderOpenAction[] {
  return orderActionsInDisplayOrder(orderActionSignalsOf(o, stock, lines));
}

/** One action, one word — the label is never typed here. */
function act(key: OrderActionKey, tone: NextTone, locked?: true): NextAction {
  return locked
    ? { key, label: orderActionQueue(key), tone, locked }
    : { key, label: orderActionQueue(key), tone };
}

/** LAYER 2 for this row. Nothing open → a FACT, because the engine refuses to
 *  invent one (an empty list is its honest answer) and this is the surface that
 *  has to print something. TWO facts, and picking the wrong one is the whole
 *  point of C3: `Delivering …` when the trip is arranged and the day has not
 *  come, `Done` when the order is genuinely finished. Both are quiet, neither
 *  is ever a queue — no facet row and no delivery queue names either word. */
export function nextActionOf(
  o: operationOrderListRow,
  stock: StockInfo,
  lines: { sku: string; qty: number }[],
): NextAction {
  const s = orderActionSignalsOf(o, stock, lines);
  const top = displayOrderAction(openOrderActions(s));
  if (!top) return act(orderIsDelivering(s) ? "delivering" : "done", "neutral");
  return top.locked
    ? act(top.key, top.tone, true)
    : act(top.key, top.tone);
}

/** Sort by SLACK ascending (Jess spec §5) — the most dangerous order (least
 *  buffer, adjusted for the blocking stock track) floats to the top; completed
 *  sinks to the bottom. Ties keep the old newest-placed-first order. */
function compareBySlack(
  a: operationOrderListRow,
  b: operationOrderListRow,
): number {
  const sa = slackDays(a);
  const sb = slackDays(b);
  if (sa !== sb) return sa - sb;
  return (b.placed_at ?? "").localeCompare(a.placed_at ?? "");
}

/** Region bucket for the state filter chips: Klang Valley (grouped) · each
 *  outstation state / Singapore · "Others" when undetectable. */
const KV_LABEL = "Klang Valley";
const OTHERS_LABEL = "Others";
function regionBucket(address: string | null): string {
  if (areaForAddress(address) === "KV") return KV_LABEL;
  return detectState(address) ?? OTHERS_LABEL;
}

/** Logistics company name for an order — the formal LP, else the Inbox-triage
 *  assignment resolved via the partners map; null when none yet. Drives the
 *  LOGISTICS filter chips + the Delivery cell (Jess 2026-06-24). */
function logisticOf(
  o: operationOrderListRow,
  partnerName: Map<string, string>,
): string | null {
  return (
    o.delivery_partners?.name ??
    (o.ops_assigned_logistic ? partnerName.get(o.ops_assigned_logistic) ?? null : null)
  );
}
const NO_CARRIER = "—";

// ─── Logistics delivery state (locked column spec 2026-07-12 · T1 booking truth
// 2026-07-26) ─────────────────────────────────────────────────────────────────
// The LOGISTIC column = partner tag + booking state, as a small state machine.
// D1 (0277) split "a date exists" into two stages, and the column tells the
// truth (Jess, T1): "confirmed" = the CUSTOMER's yes (date + slot) — the ONLY
// green; "provisional" = only the carrier's word (logistic_eta) — amber, never
// green; "need_booking" = partner assigned, no date at all. The old
// call_now/no_date time-window split is dead — both rendered the same word.
type LogisticStateKey =
  | "delivered"
  | "confirmed"
  | "provisional"
  | "need_booking"
  | "unassigned";
/** Exported for the same reason as `StockEta` — `rowDotsOf` takes one. */
export interface LogisticState {
  key: LogisticStateKey;
  partner: string | null;
  /** ISO date — the customer's confirmed date on "confirmed"; the logistics
   *  provisional date on "provisional". */
  date: string | null;
  /** Customer's time slot — only on "confirmed" (null until recorded). */
  slot: string | null;
}
/** "31 Jul 26" → "31 Jul" — the column speaks the drawer chip's exact date
 *  form (T1: one booking vocabulary across the two surfaces). */
const dayMon = (iso: string) => fmtDateShort(iso).replace(/\s\d{2}$/, "");
/** "Afternoon (12pm–3pm)" → "12pm–3pm" — same short-slot read as the drawer. */
const shortSlot = (slot: string) => /\(([^)]+)\)/.exec(slot)?.[1] ?? slot;

export function logisticStateOf(
  o: operationOrderListRow,
  partnerName: Map<string, string>,
): LogisticState {
  const partner = logisticOf(o, partnerName);
  if (controlTabOf(o) === "completed")
    return { key: "delivered", partner, date: null, slot: null };
  // T10: the confirmed-vs-provisional decision is ONE rule (`bookingDayOf` in
  // packages/shared), shared with the delivery calendar. This column and that
  // calendar cannot put the same order on two different days.
  const booking = orderBookingDay(o);
  if (booking.kind === "confirmed")
    return { key: "confirmed", partner, date: booking.date, slot: booking.slot };
  if (booking.kind === "provisional")
    return { key: "provisional", partner, date: booking.date, slot: null };
  if (!partner) return { key: "unassigned", partner: null, date: null, slot: null };
  return { key: "need_booking", partner, date: null, slot: null };
}

/** Item category short-form (Master Sheet model): core goods Mattress / Bedframe
 *  / Sofa need POs + stock; everything else is accessory/service. Native SKUs
 *  carry a `mattress:` / `bedframe:` / `sofa:` prefix; AutoCount free-text SKUs
 *  use the `MS## / BF## / SF##|SOF##` item codes. A trailing `-K/-Q/-S` is the
 *  size (King/Queen/Single). */
/** Master-Sheet short codes (Jess 2026-06-12): MS / BF / SOF — the vocabulary
 *  the team already speaks (the sheet's MS/BF/SOF columns + AutoCount item
 *  codes). Accessories keep full names. */
const CORE_LABEL: Record<CoreCat, string> = {
  mattress: "MS",
  bedframe: "BF",
  sofa: "SOF",
};
const CORE_ORDER: CoreCat[] = ["mattress", "bedframe", "sofa"];

/** Product-category filter options (Jess 2026-06-24, +Pillow/M.P 2026-06-25):
 *  the 3 core types PLUS the two key accessories — an order matches when it has
 *  at least one line of that type. Each option carries its own predicate so core
 *  (lineCategory) and accessory (accShort) matching live in one list. */
function orderHasCore(o: operationOrderListRow, cat: CoreCat): boolean {
  return (o.order_lines ?? []).some((l) => lineCategory(l.sku) === cat);
}
function orderHasAcc(o: operationOrderListRow, name: string): boolean {
  return (o.order_lines ?? []).some(
    (l) => lineCategory(l.sku) === "acc" && accShort(l.sku) === name,
  );
}
const CATEGORY_OPTS: {
  key: string;
  label: string;
  match: (o: operationOrderListRow) => boolean;
}[] = [
  { key: "mattress", label: "Mattress", match: (o) => orderHasCore(o, "mattress") },
  { key: "bedframe", label: "Bedframe", match: (o) => orderHasCore(o, "bedframe") },
  { key: "sofa", label: "Sofa", match: (o) => orderHasCore(o, "sofa") },
  { key: "pillow", label: "Pillow", match: (o) => orderHasAcc(o, "Pillow") },
  { key: "mp", label: "M.P", match: (o) => orderHasAcc(o, "M.P") },
];

/** Primary supplier of an order = the supplier of its FIRST core line
 *  (Mattress/Bedframe/Sofa). Mirrors raise-po / chase-supplier resolution:
 *  catalog `product_skus.supplier_id`, else the SOLE supplier covering that
 *  category, else unresolved (null). Accessory/service lines never carry a
 *  supplier here. PURE so the SUPPLIER facet count stays cheap. */
function primarySupplierId(
  o: operationOrderListRow,
  skuMeta: Map<string, { supplierId: string | null; category: string | null }>,
  suppliers: { id: string; cat_covered: string[] | null }[],
): string | null {
  for (const l of o.order_lines ?? []) {
    const meta = skuMeta.get(l.sku);
    const cat =
      meta?.category && (CORE_ORDER as readonly string[]).includes(meta.category)
        ? meta.category
        : (lineCategory(l.sku) as string);
    if (!(CORE_ORDER as readonly string[]).includes(cat)) continue;
    const covering = suppliers.filter((s) => (s.cat_covered ?? []).includes(cat));
    const supplierId = meta?.supplierId ?? (covering.length === 1 ? covering[0].id : null);
    if (supplierId) return supplierId;
  }
  return null;
}

/** Physical-goods unit total — core + accessories. Service lines (Disposal,
 *  floor charge…) are NOT units, so they don't count (matches the Master
 *  Sheet's qty column: "8 X" = 2 Mattress + 2 Bedframe + 4 Pillow, Disposal
 *  excluded). */
function unitTotal(lines: { sku: string; qty: number }[]): number {
  let t = 0;
  for (const l of lines)
    if (lineKind(l.sku) !== "service") t += Number(l.qty || 0);
  return t;
}

/** Roll a line list up into boxed TAGS, one per category, ordered core →
 *  accessories → services. qty + name come back SEPARATE so the cell can drop
 *  the qty on single-category orders (the left total already says it — avoids
 *  the ugly "1× | 1× Sofa" repetition). e.g. [{core,2,"Mattress(Q)"},
 *  {acc,3,"Pillow"}, {service,1,"Disposal"}]. */
function itemTags(
  lines: { sku: string; qty: number }[],
): { kind: ItemKind; qty: number; name: string }[] {
  // Core grouped by (category, size) so each size carries its OWN qty (Jess:
  // "1× MS(K)" + "2× MS(Q)", never a lazy "3× MS(K,Q)"). Sofas have no K/Q/S
  // size (sized by seater) → one group; unknown size → bare "MS".
  const core = new Map<string, { cat: CoreCat; size: string; qty: number }>();
  const rest = new Map<string, { qty: number; kind: ItemKind }>();
  for (const l of lines) {
    const q = Number(l.qty || 0);
    if (q <= 0) continue;
    const cat = lineCategory(l.sku);
    if (cat === "acc") {
      const name = accShort(l.sku);
      const e = rest.get(name) ?? { qty: 0, kind: lineKind(l.sku) };
      e.qty += q;
      rest.set(name, e);
      continue;
    }
    const size = cat === "sofa" ? "" : (lineSize(l.sku) ?? "");
    const key = `${cat}|${size}`;
    const e = core.get(key) ?? { cat, size, qty: 0 };
    e.qty += q;
    core.set(key, e);
  }
  const out: { kind: ItemKind; qty: number; name: string }[] = [];
  for (const cat of CORE_ORDER) {
    const entries = [...core.values()]
      .filter((e) => e.cat === cat)
      .sort((a, b) => a.size.localeCompare(b.size)); // K, Q, S, then ""
    for (const e of entries)
      out.push({
        kind: "core",
        qty: e.qty,
        name: `${CORE_LABEL[cat]}${e.size ? `(${e.size})` : ""}`,
      });
  }
  // Accessories ordered pillow → M.P → others, then service last (Jess: fixed
  // item sequence). Core already ordered via CORE_ORDER above.
  const accRank = (name: string) => (name === "Pillow" ? 0 : name === "M.P" ? 1 : 2);
  const restSorted = [...rest.entries()].sort(
    (a, b) => accRank(a[0]) - accRank(b[0]),
  );
  for (const wanted of ["acc", "service"] as const)
    for (const [name, e] of restSorted)
      if (e.kind === wanted) out.push({ kind: e.kind, qty: e.qty, name });
  return out;
}

/** Tag display label — ALWAYS qty-prefixed ("1× M.P", "2× Disposal"), no qty-1
 *  exemption (Jess P1: the standard format). The only bare tag is the
 *  single-category CORE de-dup, decided at render time. */
function tagLabel(t: { kind: ItemKind; qty: number; name: string }): string {
  return `${t.qty}× ${t.name}`;
}

/** Flat single-line rollup (CSV export + tooltips). */
function itemRollup(lines: { sku: string; qty: number }[]): string {
  return itemTags(lines).map(tagLabel).join(" · ") || "—";
}

/** Units of ONE core category (Mattress / Bedframe / Sofa) on an order — the
 *  per-category count the MS / BF / Sofa columns show. Sums each line's qty
 *  whose `lineCategory` matches; accessories / services never count. */
export function catQty(lines: { sku: string; qty: number }[], cat: CoreCat): number {
  let t = 0;
  for (const l of lines)
    if (lineCategory(l.sku) === cat) t += Number(l.qty || 0);
  return t;
}

/** Old kanban stage slug (still produced by hand-typed `/operation/orders/:stage`
 *  URLs) → control tab, so legacy deep-links land somewhere sensible. */
function tabFromStageParam(raw: string | undefined): ControlTab | null {
  switch (raw) {
    case "placed":
      return "placed";
    case "confirmed":
      return "proceed";
    case "in_production":
      return "pending";
    case "ready_to_dispatch":
    case "dispatched":
      return "scheduled";
    case "delivered":
      return "completed";
    case "all":
      return "all";
    default:
      return null;
  }
}

interface Props {
  /** Header "+ Import from AutoCount" button → OperationApp flips to the import
   *  tab. Optional so the page renders standalone (e.g. in tests). */
  onImport?: () => void;
}

/** Columns for the top-bar export (CSV + print). Address added vs the old
 *  bulk-only CSV — it's core delivery data the ops team exports for the day
 *  (Jess 2026-06-25, #4 top-bar Export menu). */
const EXPORT_HEADER = [
  "SO", "Customer", "Phone", "Address", "Units", "Items",
  "Deadline", "Proceed", "Location", "Logistics", "Status",
] as const;

/** One order → its export cells (strings). Shared by CSV + print so the two
 *  formats can never drift. Pure — every helper it calls is module-scope. */
function exportRow(
  o: operationOrderListRow,
  partnerName: Map<string, string>,
): string[] {
  const ls = o.order_lines ?? [];
  const loc = locationForAddress(o.customer_address ?? null);
  const logi =
    o.delivery_partners?.name ??
    (o.ops_assigned_logistic ? partnerName.get(o.ops_assigned_logistic) ?? "" : "");
  return [
    `SO-${o.so}`,
    o.customer_name ?? "",
    o.customer_phone ?? "",
    o.customer_address ?? "",
    String(unitTotal(ls)),
    itemRollup(ls),
    o.delivery_date_tbd ? "TBD" : o.delivery_date ?? "",
    o.proceed_date ?? "",
    loc.label ?? "",
    logi,
    TAB_LABEL[controlTabOf(o)],
  ];
}

/** Build the orders CSV (header + rows). Pure + exported for unit tests; the
 *  caller adds the UTF-8 BOM and triggers the download. */
export function buildOrdersCsv(
  rows: operationOrderListRow[],
  partnerName: Map<string, string>,
): string {
  const cell = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  return [
    EXPORT_HEADER.join(","),
    ...rows.map((o) => exportRow(o, partnerName).map(cell).join(",")),
  ].join("\n");
}

/** Build a print-friendly HTML doc for the filtered orders → the browser's
 *  print dialog (the user picks "Save as PDF"). Pure + exported for tests; no
 *  PDF library, so nothing lands in the bundle. */
export function buildOrdersPrintHtml(
  rows: operationOrderListRow[],
  partnerName: Map<string, string>,
  title: string,
): string {
  const esc = (v: string) =>
    v.replace(/[&<>]/g, (ch) => (ch === "&" ? "&amp;" : ch === "<" ? "&lt;" : "&gt;"));
  const head = EXPORT_HEADER.map((h) => `<th>${esc(h)}</th>`).join("");
  const body = rows
    .map(
      (o) =>
        `<tr>${exportRow(o, partnerName).map((c) => `<td>${esc(c)}</td>`).join("")}</tr>`,
    )
    .join("");
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title>
<style>
  *{font-family:Inter,Arial,sans-serif}
  h1{font-size:16px;margin:0 0 2px}
  .sub{font-size:11px;color:#666;margin:0 0 12px}
  table{border-collapse:collapse;width:100%;font-size:10px}
  th,td{border:1px solid #d4d4d8;padding:4px 6px;text-align:left;vertical-align:top}
  th{background:#f4f4f5;font-weight:600}
  @media print{@page{size:A4 landscape;margin:10mm}}
</style></head><body>
<h1>${esc(title)}</h1>
<p class="sub">${rows.length} orders · Carres Portal</p>
<table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>
</body></html>`;
}

/** Trigger a CSV file download. BOM prefix so Excel reads UTF-8 (Chinese
 *  customer names) instead of mojibake. */
function downloadCsv(filename: string, csv: string) {
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/** Open the print HTML in a new window and invoke the print dialog. */
function openPrint(html: string) {
  const w = window.open("", "_blank");
  if (!w) {
    toast.error("Allow pop-ups to print / save as PDF");
    return;
  }
  w.document.write(html);
  w.document.close();
  w.focus();
  // Let the new document lay out before the print dialog grabs it.
  setTimeout(() => w.print(), 200);
}

// ─── Column show/hide (locked spec §4 "control strip: tabs + count + Columns") ──
// Reuses the SO Maintenance control pattern (btn + N/M + popover of checkboxes)
// over the hand-rolled table. The 2 structural columns (select, flag) always
// show; these 8 DATA columns toggle. Base widths sum to 94% (select+flag = 3%+3%);
// when some are hidden the visible widths scale up so the table stays exactly
// full-width. The preference persists per-browser in localStorage (client-only —
// no server config; Saved Views deferred per Jess).
interface OrderColDef {
  key: string;
  label: string;
  w: number;
}
/** §14 six-col rebuild (Jess picked C, 2026-07-18): dots lead, SO+Ref and
 *  Customer+Region merge into two-line cells, LOGISTIC→DELIVERY (truth-ladder
 *  words). Old keys (orderId/ref/region/logistic) retired —
 *  stale hidden-column prefs for them just no-op. */
const ORDER_COL_DEFS: OrderColDef[] = [
  // Status holds TWO things since C10 (Jess 2026-07-27): the STAGE word pill
  // (Placed / Proceed / To book / Customer confirmed / Delivered) and, beside
  // it, the three dots. 11 → 14: the widest pill measures 135px and the three
  // 14px icons 50px, so both fit intact (12px cell padding + 135 + 6 + 50 =
  // 203px ≈ 14% of the table's ~1448px). The 3 points came from the two
  // neighbours with MEASURED slack, never from Actions: deadline 13 → 12
  // (needs 142px, had 188) and stock 11 → 9 (needs ~107px, had 159).
  { key: "dots", label: "Status", w: 14 },
  // C3 took 1 of the 2 points Actions grew by. `SO-1002` + `CR0418 +1` are
  // short mono strings: 9 ≈ 130px against ~62px of content.
  { key: "order", label: "Order", w: 9 },
  { key: "customer", label: "Customer", w: 11 },
  // Deadline right after Customer (Jess 2026-07-18). Wide enough for the weekday:
  // "Sun, 20 Jul 26" + the heat pill (Jess 2026-07-19 date law). C3 took the
  // other point from C10's own measurement: 142px needed, 12 → 11 ≈ 159px.
  // `stock` was left alone — C10 had already cut it to its measured floor.
  { key: "deadline", label: "Deadline", w: 11 },
  { key: "stock", label: "Stock", w: 9 },
  // Delivery + Actions each took a point from the cells beside them: C1's words
  // name the party, so the strings are longer ("NETS — confirm delivery date").
  { key: "delivery", label: "Delivery", w: 13 },
  // PIC = the staff owner, its OWN column (Jess 2026-07-18: "add one column
  // — assignee?"). Word law: PIC is the team's word (Issue Tracker SOP).
  { key: "pic", label: "PIC", w: 5 },
  // ACTIONS, plural (Jess 2026-07-27): an order can have several. Was "Manage".
  //
  // C3 · the truncation question Jess deferred to this card, DECIDED: the
  // column takes 2 more units (from `order` and `deadline`, the two with slack
  // left after C10) and the longest lines still truncate with their tooltip — that
  // is accepted, not conceded. A row of eight columns cannot hold
  // `Call NETS Logistics — confirm delivery date` whole without starving a
  // neighbour, the visible half is the half that acts (verb + party), and since
  // C2 the FULL text has a proper home one click away: the drawer lists every
  // open action in full. The `+N` beside the pill says how much is behind it.
  { key: "next", label: "Actions", w: 16 },
];
const HIDDEN_COLS_KEY = "carres.orders.hiddenCols";
function loadHiddenCols(): Set<string> {
  if (typeof localStorage === "undefined") return new Set();
  try {
    const raw = localStorage.getItem(HIDDEN_COLS_KEY);
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}
function saveHiddenCols(s: Set<string>) {
  try {
    localStorage.setItem(HIDDEN_COLS_KEY, JSON.stringify([...s]));
  } catch {
    /* ignore quota / private-mode errors */
  }
}

export default function OperationOrdersControl({ onImport }: Props) {
  const params = useParams<{ stage?: string }>();
  const [tab, setTab] = useState<ControlTab>(
    () => tabFromStageParam(params.stage) ?? "all",
  );
  const [search, setSearch] = useState("");
  // J2 — `?order=<id>` opens that order's drawer on arrival, which is how a
  // Service Case links back to the order it is about. Seeded into the initial
  // state, so the drawer is the first thing rendered rather than a flash of the
  // list. The param is stripped once consumed: closing the drawer must return
  // to the list, not re-open the order.
  const [searchParams, setSearchParams] = useSearchParams();
  const [openOrderId, setOpenOrderId] = useState<string | null>(
    () => searchParams.get("order"),
  );
  useEffect(() => {
    const deepLink = searchParams.get("order");
    if (!deepLink) return;
    // Also SET it, not only strip it: the lazy initializer above covers a fresh
    // mount, but a link arriving while this page is already mounted would
    // otherwise clear the param and open nothing.
    setOpenOrderId(deepLink);
    const next = new URLSearchParams(searchParams);
    next.delete("order");
    setSearchParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);
  // Share the open order with the global right rail so its Activity panel shows
  // THIS order's history (Jess 2026-06-30: Activity moved off the page).
  useEffect(() => {
    useActiveOrder.getState().set(openOrderId);
    return () => useActiveOrder.getState().set(null);
  }, [openOrderId]);
  // The order whose follow-up form is open in the side panel (#2); null = closed.
  const [composeOrder, setComposeOrder] = useState<{
    id: string;
    so: number | null;
    refNo: string | null;
  } | null>(null);
  // Infinite scroll (P11, Loo 2026-07-09): render 30 rows, append 30 more each
  // time the bottom sentinel scrolls into view. Replaces the old fixed-box +
  // CSS-zoom + N/page pager — a lazy-loading scroll list scales past 500 orders
  // (only ~30 <tr> in the DOM until the user scrolls).
  const ROWS_PER_BATCH = 30;
  const [renderCount, setRenderCount] = useState(ROWS_PER_BATCH);
  // Bulk select (Gmail-style): selected order ids + the ⋮ menu mode.
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkMenu, setBulkMenu] = useState<
    null | "supplier" | "logistic" | "assign" | "more"
  >(null);
  // Filter dimensions (Jess 2026-07-19, B redesign) — ALL multi-select: pick
  // several suppliers / partners / regions / deadline buckets at once (an order
  // matches ANY selected value within a dimension = OR). Empty set = no filter.
  // The left rail is now pure FILTER; the follow-up ACTIONS live in the bulk
  // bar (Supplier ⋮ / Logistics ⋮).
  const [dueFilter, setDueFilter] = useState<Set<DueBucket>>(new Set());
  const [regionFilter, setRegionFilter] = useState<Set<string>>(new Set());
  const [stockFilter, setStockFilter] = useState<StockBucket | null>(null);
  const [logisticFilter, setLogisticFilter] = useState<Set<string>>(new Set());
  const [supplierFilter, setSupplierFilter] = useState<Set<string>>(new Set());
  // Multi-select (Jess 2026-07-02): pick more than one category pill; an order
  // matches if it hits ANY selected category (OR). Empty set = no filter.
  const [categoryFilter, setCategoryFilter] = useState<Set<string>>(new Set());
  // P1 (Loo 2026-07-09) — the left filter KANBAN open/collapsed toggle. (The
  // facet scroll container is now owned by <ListPageShell>.)
  const [kanbanOpen, setKanbanOpen] = useState(true);
  // GMAIL_FINAL C3 — per-group collapse; CATEGORY starts collapsed at the bottom.
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(
    // B rebuild: the dimension taxonomy starts folded — queues + team lead.
    () => new Set(["FILTERS", "FIX DATA", "CATEGORY"]),
  );
  const toggleGroup = (k: string) =>
    setCollapsedGroups((prev) => {
      const n = new Set(prev);
      if (n.has(k)) n.delete(k);
      else n.add(k);
      return n;
    });
  // Two action lanes (Jess 2026-06-25): 🚩 Follow-up = team handoff (follow_up
  // annotations) · ⏫ For manager review = needs a manager's decision. Each is
  // a derived open-annotation state with its own quick-view filter; the per-row
  // Action cell owns flag/resolve via its own useAddAnnotation.
  const [flaggedOnly, setFlaggedOnly] = useState(false);
  const [escalateOnly, setEscalateOnly] = useState(false);
  // C-vocab verb queue filter (Jess 2026-07-19): one NEXT verb, or null.
  // (etaOnly/"To book" died with the C-vocab queues.)
  const [nextFilter, setNextFilter] = useState<string | null>(null);
  // Supplier-late queue (storage arc, merged from main).
  const [supplierLateOnly, setSupplierLateOnly] = useState(false);
  // Import stock ETA from the Master "Ops" sheet (fills each line's Stock ETA).
  const [etaImportOpen, setEtaImportOpen] = useState(false);
  // Column show/hide (locked §4) — hidden data-column keys (localStorage-persisted)
  // + the popover open state; the popover closes on an outside click.
  const [hiddenCols, setHiddenCols] = useState<Set<string>>(loadHiddenCols);
  const [columnsOpen, setColumnsOpen] = useState(false);
  const columnsRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!columnsOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (columnsRef.current && !columnsRef.current.contains(e.target as Node))
        setColumnsOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [columnsOpen]);
  const toggleCol = (key: string) =>
    setHiddenCols((prev) => {
      const n = new Set(prev);
      if (n.has(key)) n.delete(key);
      else n.add(key);
      saveHiddenCols(n);
      return n;
    });
  const showCol = (key: string) => !hiddenCols.has(key);
  const visibleColDefs = ORDER_COL_DEFS.filter((d) => showCol(d.key));
  // Scale visible data widths to fill 94% (select+flag keep 3%+3%) so the table
  // stays exactly full-width no matter how many columns are hidden.
  const colScale = 94 / (visibleColDefs.reduce((s, d) => s + d.w, 0) || 94);
  const visibleColSpan = 2 + visibleColDefs.length; // select + flag + visible data

  // Server applies the search; we always fetch the full list and bucket
  // client-side so every tab shows its true count.
  // 0234 (add-product P3.1) — pending change-request badge set for the rows.
  const pendingCRQ = useAllPendingChangeRequests();
  const pendingCROrders = useMemo(
    () => new Set((pendingCRQ.data?.requests ?? []).map((r) => r.orderId)),
    [pendingCRQ.data],
  );

  const { data, isLoading, isError, error, refetch } = useOperationOrders({
    search: search.trim() || undefined,
  });
  const partnersQ = useDeliveryPartners();
  // Catalog + suppliers → the SUPPLIER facet. skuMeta mirrors ChaseSupplierReview:
  // sku → { supplierId, category }. Empty (facet hidden) until the catalog loads.
  const catalogQ = useCatalog();
  const suppliersQ = useOperationSuppliers();
  const suppliers = useMemo(() => suppliersQ.data?.suppliers ?? [], [suppliersQ.data]);
  const supplierNameById = useMemo(
    () => new Map(suppliers.map((s) => [s.id, s.name])),
    [suppliers],
  );
  const skuMeta = useMemo(() => {
    const modelCat = new Map(
      (catalogQ.data?.models ?? []).map((m) => [m.id, m.category as string]),
    );
    const m = new Map<string, { supplierId: string | null; category: string | null }>();
    for (const s of catalogQ.data?.skus ?? []) {
      m.set(s.sku, {
        supplierId: s.supplierId ?? null,
        category: modelCat.get(s.modelId) ?? null,
      });
    }
    return m;
  }, [catalogQ.data]);
  // Live free-balance map (sku → available) from the Stock On-Hand source. Its
  // keys ARE the matchable catalog SKUs; AutoCount free-text SKUs are absent.
  // `undefined` until loaded → the Stock cell falls back to stage-only state.
  const stockQ = useOperationStock();
  const qc = useQueryClient();

  // Staff assignment pool (0232) — fails soft to an empty list on a Worker
  // that predates the route, keeping the whole assignment layer inert.
  // MANAGEMENT gate (Jess 2026-07-18): only operation@carres.com + principal
  // may manually assign / manage the pool / run the sweep; staff read-only.
  const authRole = useAuth((s) => s.role);
  const authEmail = useAuth((s) => s.user?.email ?? null);
  // HR-P2 (0260): "management" is the `ops_manager` duty on the caller's
  // position, not an email list. The duties ride the staff payload this page
  // already fetches, so the query moved UP here — `isManager` is derived from
  // it and every consumer below reads the same answer.
  const staffQ = useOperationStaff();
  const myDuties = staffQ.data?.myDuties;
  const isManager = isOpsManager(authRole, authEmail, myDuties);
  // P1 (0303) — the PO days, the urgent-bypass window and the working days of
  // notice on `Confirm delivery date` are SETTINGS now (Purchasing →
  // Settings). This page used to hold its own copies: PO days as a constant
  // that read Mon+Thu for months after Jess moved to Mon/Wed/Fri, and a sofa
  // window of 5 days against a production time of 14. Nothing else about this
  // page changes.
  const purchasingSettingsQ = usePurchasingSettings();
  const purchasingSettings = purchasingSettingsQ.data ?? null;
  // PO duty (0236, Jess 人分单货合买): this month's PO controller — gates the
  // bulk-bar Raise PO (holder + management only), badges the TEAM row, and
  // powers the Mon/Thu PO-day banner. Fails soft: old Worker / pre-0236 DB →
  // holder null → no gate, no badge, no banner.
  const authUserId = useAuth((s) => s.user?.id ?? null);
  const dutyQ = useOperationPoDuty();
  const poDutyHolder = dutyQ.data?.holder ?? null;
  const canRaise = canRaisePo(
    poDutyHolder?.userId ?? null,
    authUserId,
    authRole,
    authEmail,
    // Close over the caller's duties — canRaisePo takes the manager test as a
    // function precisely so the duty source can vary by surface.
    (r, e) => isOpsManager(r, e, myDuties),
  );
  // The consolidated Raise-PO review (Option A cards); null = closed.
  const [raisePoOrders, setRaisePoOrders] = useState<operationOrderListRow[] | null>(null);
  const [chaseOrders, setChaseOrders] = useState<operationOrderListRow[] | null>(null);
  // Logistics ⋮ → Remind/Call over the selection (company-grouped review).
  const [chasePartnerOrders, setChasePartnerOrders] = useState<
    operationOrderListRow[] | null
  >(null);
  // Which tone the Chase-supplier review opens on (Jess 2026-07-19): the
  // SUPPLIER section's Remind opens remind, Call opens the firmer tone.
  const [chaseInitialMode, setChaseInitialMode] = useState<"remind" | "chase">("remind");
  // When the chase is opened from the SUPPLIER facet (a specific supplier picked),
  // scope the review to THAT supplier so a multi-supplier order doesn't leak the
  // other supplier's card (Jess 2026-07-19 bug). null = bulk Supplier ⋮ (all).
  const [chaseSupplierScope, setChaseSupplierScope] = useState<string | null>(null);
  // ?poday=1 — MANAGER-ONLY preview of the PO-day surfaces (Jess 2026-07-19:
  // "you can't let me wait the day to see"): forces the banner + duty badge
  // on ANY day, using the real holder when 0236 is live, else the first pool
  // member as a stand-in labeled "demo". Staff sessions and normal URLs are
  // byte-identical. Use it live in the Wed-22-Jul team briefing.
  const poDayPreview =
    isManager &&
    typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).has("poday");
  const staffList = useMemo(() => staffQ.data?.staff ?? [], [staffQ.data]);
  const staffById = useMemo(
    () => new Map(staffList.map((s) => [s.user_id, s])),
    [staffList],
  );
  const poolStaff = useMemo(() => staffList.filter((s) => s.pooled), [staffList]);
  // Not-yet-onboarded staff (Jess 2026-07-19: "show Chow first, like LC") —
  // account created but not pooled yet. Shown greyed in TEAM so the roster
  // reads complete BEFORE day one; her FIRST LOGIN auto-enrolls + deals her a
  // share (round-4), no admin step. Managers + generic accounts excluded.
  const pendingStaff = useMemo(
    () =>
      staffList.filter(
        (s) =>
          !s.pooled &&
          // Per-ROW: the listed person's own duties decide, never the viewer's.
          !isOpsManagerRow(s.email, s.duties) &&
          !isOpsGenericAccount(s.email),
      ),
    [staffList],
  );
  // Preview stand-in: the badge/banner need a holder to draw; before 0236 is
  // live the first pool member plays the part (marked demo, never gates).
  const poDutyHolderShown =
    poDutyHolder ??
    (poDayPreview && poolStaff[0]
      ? {
          userId: poolStaff[0].user_id,
          email: poolStaff[0].email,
          name: poolStaff[0].name,
          assignedBy: null,
        }
      : null);
  const [staffFilter, setStaffFilter] = useState<string | null>(null);
  // Owing queue filter (B rebuild) — orders with money outstanding, closed
  // ones included (§7: owing survives Delivered).
  const [owingOnly, setOwingOnly] = useState(false);
  const assignStaffMut = useAssignOrderStaff({
    onSuccess: () => toast.success("Reassigned"),
    onError: (e) => toast.error(`Reassign failed — ${e.message}`),
  });

  // Bulk-action mutations: assign-logistics loops the Inbox ops-assign endpoint;
  // create-tasks loops the ops cockpit /ops/tasks. CSV export is client-side.
  const assignMut = useMutation({
    mutationFn: (a: { orderId: string; partnerId: string | null }) =>
      apiFetch(`/api/orders/${a.orderId}/ops-assign`, {
        method: "POST",
        body: JSON.stringify({ deliveryPartnerId: a.partnerId }),
      }),
  });
  const taskMut = useMutation({
    mutationFn: (body: { title: string; relatedOrderId: string }) =>
      apiFetch("/api/ops/tasks", { method: "POST", body: JSON.stringify(body) }),
  });
  const completeMut = useMutation({
    mutationFn: (orderIds: string[]) =>
      apiFetch("/api/operation/orders/bulk-complete", {
        method: "POST",
        body: JSON.stringify({ orderIds }),
      }),
  });

  const partnerName = useMemo(() => {
    const m = new Map<string, string>();
    for (const p of partnersQ.data?.partners ?? []) m.set(p.id, p.name);
    return m;
  }, [partnersQ.data]);

  const availableBySku = useMemo(() => {
    const rows = stockQ.data?.skus ?? [];
    if (rows.length === 0) return undefined;
    const m = new Map<string, number>();
    for (const s of rows) m.set(s.sku, s.available);
    return m;
  }, [stockQ.data]);

  // Follow-ups are ops_tasks linked to an order (#2, Jess 2026-06-26). One shared
  // Tasks-feed fetch (same cache key as the right-rail board) → the open (not
  // done/cancelled) tasks grouped per order. The Action cell, the left flag icon
  // + the Follow-up / For-Jess quick-views all read from this map.
  const tasksQ = useQuery<OpsTasksListResponse>({
    queryKey: TASKS_KEY,
    queryFn: () => apiFetch("/api/ops/tasks"),
    refetchInterval: 60_000,
  });
  const tasksByOrder = useMemo(() => {
    const m = new Map<string, OpsTask[]>();
    for (const t of tasksQ.data?.tasks ?? []) {
      if (!t.relatedOrderId || t.status === "done" || t.status === "cancelled") continue;
      const arr = m.get(t.relatedOrderId);
      if (arr) arr.push(t);
      else m.set(t.relatedOrderId, [t]);
    }
    return m;
  }, [tasksQ.data]);
  const orderTasks = (o: operationOrderListRow) => tasksByOrder.get(o.id) ?? [];
  const hasOpenTask = (o: operationOrderListRow) => tasksByOrder.has(o.id);
  const hasEscalatedTask = (o: operationOrderListRow) =>
    orderTasks(o).some((t) => t.escalatedAt);
  const openFollowUp = (o: operationOrderListRow) =>
    setComposeOrder({
      id: o.id,
      so: o.so,
      refNo: (o.source_ref ?? []).filter(Boolean)[0] ?? null,
    });

  const orders = useMemo(() => data?.orders ?? [], [data]);

  const counts = useMemo(() => {
    const c: Record<ControlTab, number> = {
      placed: 0,
      proceed: 0,
      pending: 0,
      scheduled: 0,
      completed: 0,
      all: orders.length,
    };
    for (const o of orders) c[controlTabOf(o, availableBySku)] += 1;
    return c;
  }, [orders, availableBySku]);

  // Status-tab filter first; the Urgent chip + region pills layer on top (all
  // stackable). The chip/region counts are computed over the tab-filtered set
  // so they reflect the current view.
  const tabFiltered = useMemo(
    () =>
      tab === "all"
        ? orders
        : orders.filter((o) => controlTabOf(o, availableBySku) === tab),
    [orders, tab],
  );
  // LIVE scope (B rebuild, Jess 2026-07-18): every facet count runs over OPEN
  // orders only — the 104 delivered stopped inflating Ready/NETS/KV etc.
  const liveScope = useMemo(
    () => tabFiltered.filter((o) => controlTabOf(o) !== "completed"),
    [tabFiltered],
  );
  // Owing queue — the ONE count that deliberately spans closed orders too
  // (§7: the owing customer is the call that survives Delivered).
  const owing = useMemo(() => {
    let n = 0;
    let rm = 0;
    for (const o of orders) {
      const m = moneyOf(o);
      if (m.owing) {
        n += 1;
        rm += m.outstanding;
      }
    }
    return { n, rm };
  }, [orders]);
  const flaggedCount = useMemo(() => liveScope.filter(hasOpenTask).length, [liveScope, tasksByOrder]);
  const escalateCount = useMemo(() => liveScope.filter(hasEscalatedTask).length, [liveScope, tasksByOrder]);
  // NEXT-verb counts over OPEN orders — the C-vocab QUEUES rows read these,
  // so queue numbers equal the NEXT column by construction.
  const nextVerbOf = (o: operationOrderListRow) =>
    nextActionOf(o, stockReadiness(o, availableBySku), o.order_lines ?? []).label;
  /** J3 — the drawer's journey strip, computed HERE and handed down.
   *
   *  The card's DONE WHEN is "the strip agrees with the ladder/queues for the
   *  same order, always". The only way to guarantee that is to never run the
   *  ladder twice: this page owns `nextActionOf` + every signal it reads, so
   *  the strip receives the SAME NextAction object the row's MANAGE pill
   *  renders and the queue counts tally. The drawer adds only what this page
   *  cannot see (its document check and its payment ledger) and derives
   *  nothing the ladder already answered.
   *
   *  Returns undefined when the order is not in the loaded list (a deep link
   *  landing straight on a drawer): the strip then renders nothing rather than
   *  guess — same degradation law as J1/J2. */
  const journeySignalsFor = (
    orderId: string,
  ): OrderJourneySignals | undefined => {
    const o = orders.find((r) => r.id === orderId);
    if (!o) return undefined;
    const stock = stockReadiness(o, availableBySku);
    const ovl = ovlOf(o);
    const photos = ovl?.delivery_photos;
    // The ladder's own 🔒 input, read the same way nextActionOf reads it (C5:
    // ONE shared computation). `null` when nothing on record says what the
    // order is worth — that is "we do not know", never "settled".
    const money = moneyOf(o);
    const holdAmount = money.known ? money.outstanding : null;
    const na = nextActionOf(o, stock, o.order_lines ?? []);
    // ONE signals object for the whole strip: the open actions AND their C6
    // checklists read it, so a step can never be measured against a different
    // reading of the order than the action it belongs to.
    const actionSignals = orderActionSignalsOf(o, stock, o.order_lines ?? []);
    const sid = primarySupplierId(o, skuMeta, suppliers);
    // C3 — the drawer is the ONE surface that prints the delivering FACT in
    // full (`Delivering 27 Jul · 12pm–3pm`). The Orders row and the Delivery
    // detail pane both sit beside a cell that already carries the booked day,
    // so they print the short `Delivering`; here nothing else says it.
    const booking = orderBookingDay(o);
    const actionParties = {
      supplier: sid ? supplierNameById.get(sid) ?? null : null,
      logistics: logisticOf(o, partnerName),
      customer: o.customer_name,
      amount: money.known ? fmtRM(money.outstanding) : null,
      deliveryDate:
        booking.kind === "confirmed" && booking.date ? dayMon(booking.date) : null,
      deliverySlot:
        booking.kind === "confirmed" && booking.slot ? shortSlot(booking.slot) : null,
    };
    return {
      next: {
        ...na,
        // C1 — the strip shows the SAME row line the list pill shows, built by
        // the same shared helper. One action, one spelling, two surfaces.
        line: orderActionLine(na.key, actionParties),
      },
      // The same test the ladder's RUNG 1 makes: goods with no purchase order
      // anywhere are goods nobody has ordered.
      hasPo: (o.order_lines ?? []).some((l) => !!l.source_po),
      // The ladder's own two-signal ready rule (live free stock OR the Master
      // import's per-line ready flag) — not the drawer's line readiness.
      goodsReady:
        stock.state === "ready" ||
        stock.state === "in_stock" ||
        stockEtaOf(o).state === "ready",
      bookingConfirmed: bookingConfirmedOf(o),
      delivered: controlTabOf(o) === "completed",
      // T7's three-way answer: [] is "no photo yet", undefined is UNKNOWN.
      photoOnFile: Array.isArray(photos) ? photos.length > 0 : null,
      holdAmount,
      // C8 — the delay this order is in, when it is in one. The condition is
      // the radar's OWN condition (`docs/ORDERS-WORKING-FLOW.md` §3, stage 1's
      // trigger) read from the same signals object above, so the panel cannot
      // appear for an order the ladder does not think is delayed — and the
      // panel itself renders only when the ladder actually raised the action.
      delay:
        actionSignals.stockEtaIso &&
        actionSignals.promisedDateIso &&
        actionSignals.stockEtaIso > actionSignals.promisedDateIso
          ? {
              supplierEtaIso: actionSignals.stockEtaIso,
              promisedDateIso: actionSignals.promisedDateIso,
              decision: actionSignals.delayDecision ?? null,
            }
          : undefined,
      // C2 — LAYER 1: every open action, in display order. The drawer's list
      // and this row's pill are the same computation, so the count the drawer
      // shows and the headline the row shows can never contradict each other.
      // The party names are resolved ONCE, here, where the maps live.
      //
      // C6 — each action also carries the STEPS that close it, measured against
      // the SAME signals object the ladder just read. Building them here (and
      // not in the component) is the J3/C2 law: the drawer renders, it never
      // re-derives, so a step and the action above it cannot come from two
      // different readings of the order. The step's word is the dictionary's
      // BUTTON string — this file spells no verb.
      openActions: orderActionsInDisplayOrder(actionSignals).map((a) => ({
        key: a.key,
        line: orderActionLine(a.key, actionParties),
        tone: a.tone,
        locked: a.locked,
        steps: orderActionChecklist(a.key, actionSignals).map((st) => ({
          key: st.key,
          label: orderActionButton(st.key) ?? orderActionQueue(st.key),
          done: st.state === "done",
        })),
      })),
    };
  };
  const nextCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const o of liveScope) {
      const label = nextVerbOf(o);
      m.set(label, (m.get(label) ?? 0) + 1);
    }
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveScope, availableBySku]);
  const supplierLateCount = useMemo(
    () => liveScope.filter(isSupplierLate).length,
    [liveScope],
  );
  // ONE holiday set for the page — every deadline on this screen skips the same
  // Malaysian public holidays (Law 2A: the calendars differ in their WEEK, never
  // in their holidays).
  const officeHolidays = useMemo(() => myHolidaySet(), []);
  // C8b · THE TWO DELAY CLOCKS (Loo 2026-07-28, `ORDERS-WORKING-FLOW` §3).
  // Delay planning gets 2 working days from the day the supplier's date first
  // overshot the promise; the logistics call gets the SAME working day from the
  // moment Operations recorded that the promise cannot be met. Both on the
  // OFFICE calendar (Law 2A) — the shared module passes that week itself, so
  // this surface cannot count either clock on the warehouse's six days.
  // Same shape as the delivery queues: the "· N late" tail is the auto-overdue.
  const delayQueueStats = useMemo(() => {
    const today = todayIso();
    const stat = new Map<string, { n: number; late: number }>();
    for (const o of liveScope) {
      const a = nextActionOf(o, stockReadiness(o, availableBySku), o.order_lines ?? []);
      if (a.key !== "delay_planning" && a.key !== "arrange_new_delivery_date")
        continue;
      const cur = stat.get(a.label) ?? { n: 0, late: 0 };
      cur.n += 1;
      if (
        orderActionOverdue(
          a.key,
          delayActionAnchor(o, a.key),
          today,
          officeHolidays,
        )
      )
        cur.late += 1;
      stat.set(a.label, cur);
    }
    return stat;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveScope, availableBySku, officeHolidays]);
  // T7 · DELIVERY queues + auto-overdue (Jess 2026-07-27). Each of the four
  // delivery steps carries its own deadline (shared `delivery-queue.ts`), so a
  // queue item turns LATE by itself — nobody has to watch it. Counts still come
  // from the NEXT verb, so queue numbers equal the NEXT column by construction
  // (C-vocab). The photo queue is the one that spans CLOSED orders, for the same
  // reason Owing does: the proof is still outstanding after delivery.
  const holidayOpts = useMemo(() => ({ holidays: officeHolidays }), [officeHolidays]);
  // P1 — the working days of notice on `Confirm delivery date` (Jess may set
  // 5). Undefined until the settings land, which leaves the step on its seed.
  const queueLeads = useMemo(
    () => (purchasingSettings ? deliveryQueueLeads(purchasingSettings) : undefined),
    [purchasingSettings],
  );
  const deliveryQueueStats = useMemo(() => {
    const today = todayIso();
    const stat = new Map<string, { n: number; late: number }>();
    const bump = (label: string, late: boolean) => {
      const cur = stat.get(label) ?? { n: 0, late: 0 };
      cur.n += 1;
      if (late) cur.late += 1;
      stat.set(label, cur);
    };
    const tally = (o: operationOrderListRow, only?: DeliveryQueueKey) => {
      const label = nextVerbOf(o);
      const def = deliveryQueueForLabel(label);
      if (!def) return;
      if (only ? def.key !== only : def.key === "photo") return;
      bump(
        label,
        deliveryStepOverdue(
          def.key,
          deliveryStepAnchor(o, def.key),
          today,
          holidayOpts,
          queueLeads,
        ),
      );
    };
    for (const o of liveScope) tally(o);
    for (const o of orders) tally(o, "photo");
    return stat;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveScope, orders, availableBySku, holidayOpts, queueLeads]);
  const dueEntries = useMemo(() => {
    const m = new Map<DueBucket, number>();
    for (const o of liveScope) {
      const b = dueBucketOf(o);
      if (b) m.set(b, (m.get(b) ?? 0) + 1);
    }
    return DUE_BUCKETS.filter((b) => m.has(b)).map((b) => ({
      bucket: b,
      count: m.get(b) ?? 0,
    }));
  }, [liveScope]);
  const regionEntries = useMemo(() => {
    const m = new Map<string, number>();
    for (const o of liveScope) {
      const b = regionBucket(o.customer_address ?? null);
      m.set(b, (m.get(b) ?? 0) + 1);
    }
    const keys = [...m.keys()].sort((a, b) => {
      if (a === KV_LABEL) return -1;
      if (b === KV_LABEL) return 1;
      if (a === OTHERS_LABEL) return 1;
      if (b === OTHERS_LABEL) return -1;
      return a.localeCompare(b);
    });
    return keys.map((k) => ({ region: k, count: m.get(k) ?? 0 }));
  }, [liveScope]);
  const stockEntries = useMemo(() => {
    const m = new Map<StockBucket, number>();
    for (const o of liveScope) {
      const b = stockBucketOf(o, availableBySku);
      m.set(b, (m.get(b) ?? 0) + 1);
    }
    return STOCK_BUCKETS.filter((b) => m.has(b)).map((b) => ({
      bucket: b,
      count: m.get(b) ?? 0,
    }));
  }, [liveScope, availableBySku]);

  // URGENT BYPASS (PO duty spec, Jess 2026-07-18): open orders whose deadline
  // sits inside the production window with stock NOT secured — flagged red
  // ANY day, must not wait for a PO day. The window is the configured
  // production working days (P1); with no settings loaded, or no number set
  // for those categories, nothing is called urgent — an unrated category may
  // not claim to know better.
  const urgentPoCount = useMemo(
    () =>
      liveScope.filter((o) => {
        if (stockBucketOf(o, availableBySku) === "Ready") return false;
        if (!purchasingSettings) return false;
        const cats = CORE_ORDER.filter((c) => orderHasCore(o, c));
        return poUrgentBypass(
          o.delivery_date_tbd ? null : o.delivery_date,
          purchasingUrgentWindowDays(purchasingSettings, cats),
        );
      }).length,
    [liveScope, availableBySku, purchasingSettings],
  );

  // No-logistics queue (Jess 2026-07-19): open orders with NO logistics company
  // yet, regardless of stock — the whole "nobody is carrying this" list. Via
  // logisticFilter holding NO_CARRIER.
  const unassignedCount = useMemo(
    () => liveScope.filter((o) => !logisticOf(o, partnerName)).length,
    [liveScope, partnerName],
  );
  const logisticEntries = useMemo(() => {
    const m = new Map<string, number>();
    for (const o of liveScope) {
      const key = logisticOf(o, partnerName) ?? NO_CARRIER;
      if (key === NO_CARRIER) continue; // no-carrier = the Assign-logistic queue
      m.set(key, (m.get(key) ?? 0) + 1);
    }
    // Every partner is a filter option even at 0 (Jess 2026-07-19) — union the
    // full delivery-partners list in with a 0 default.
    for (const p of partnersQ.data?.partners ?? [])
      if (!m.has(p.name)) m.set(p.name, 0);
    // Data-present companies by count desc first (tiebreak alpha), then the
    // remaining 0-count partners alphabetically.
    return [...m.entries()]
      .sort((a, b) => {
        if ((a[1] > 0) !== (b[1] > 0)) return b[1] - a[1]; // non-zero group first
        if (a[1] !== b[1]) return b[1] - a[1];
        return a[0].localeCompare(b[0]);
      })
      .map(([carrier, count]) => ({ carrier, count }));
  }, [liveScope, partnerName, partnersQ.data]);

  // SUPPLIER facet counts — per primary core-line supplier, over liveScope.
  // Unresolved (no core line / no supplier) rows are skipped. Sorted by name.
  // (B redesign: the supplier-deadline urgency pills + Remind/Call left the
  // rail — deadline is the shared DEADLINE band; chasing lives in the bulk bar.)
  const supplierEntries = useMemo(() => {
    const m = new Map<string, number>();
    for (const o of liveScope) {
      const sid = primarySupplierId(o, skuMeta, suppliers);
      if (!sid) continue;
      m.set(sid, (m.get(sid) ?? 0) + 1);
    }
    return [...m.entries()]
      .map(([id, count]) => ({ id, name: supplierNameById.get(id) ?? id, count }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [liveScope, skuMeta, suppliers, supplierNameById]);

  const categoryEntries = useMemo(
    () =>
      CATEGORY_OPTS.map((opt) => ({
        key: opt.key,
        label: opt.label,
        count: liveScope.filter(opt.match).length,
      })),
    [liveScope],
  );

  // STAFF facet counts — per pool member + "No PIC", over the current tab.
  // A DELIVERED order without a PIC is closed work, not "nobody watching" —
  // it never counts toward No PIC (guardrail #2 spirit).
  const staffEntries = useMemo(() => {
    const counts = new Map<string, number>();
    let none = 0;
    for (const o of liveScope) {
      const owner = ownerOf(o);
      if (owner) counts.set(owner, (counts.get(owner) ?? 0) + 1);
      else if (controlTabOf(o) !== "completed") none += 1;
    }
    return { counts, none };
  }, [liveScope]);

  // AUTO-ASSIGN sweep — SERVER-SIDE (Jess go-live feedback 2026-07-18): ONE
  // POST per page load from ANY operation session. The server stamps the
  // caller's presence first, then distributes every open unassigned order to
  // the pool members seen today — so a staff member receives their orders the
  // moment THEY open the portal, no manager session required. (Manual assign
  // stays management-only; this is system behaviour.) Fails soft on an old
  // Worker (404 → nothing happens).
  // Default a plain salesperson to their OWN orders on first load (Jess
  // 2026-07-19): if the signed-in user is NOT a manager and matches a staff
  // row by email, pre-select their PIC. Runs ONCE (ref-guarded) and never
  // overrides a manual staffFilter change; managers land on Everyone.
  const didDefaultStaff = useRef(false);
  useEffect(() => {
    if (didDefaultStaff.current) return;
    if (isManager) return; // managers see the whole team
    if (staffFilter !== null) return; // respect any manual pick
    if (!authEmail || staffList.length === 0) return;
    const mine = staffList.find(
      (s) => s.email?.toLowerCase() === authEmail.toLowerCase(),
    );
    if (!mine) return; // no matching PIC row → leave on Everyone
    didDefaultStaff.current = true;
    setStaffFilter(mine.user_id);
  }, [staffList, isManager, authEmail, staffFilter]);

  const sweepDone = useRef(false);
  useEffect(() => {
    if (sweepDone.current) return;
    if (!staffQ.data) return; // wait until the staff route proved to exist
    if (!staffQ.data.staff.some((s) => s.pooled)) return; // empty pool → inert
    sweepDone.current = true;
    void apiFetch<{ assigned: number }>(`/api/operation/staff/auto-assign`, {
      method: "POST",
    })
      .then((r) => {
        if (r.assigned > 0) {
          toast.success(
            `Auto-assigned ${r.assigned} order${r.assigned === 1 ? "" : "s"}`,
          );
          void qc.invalidateQueries({ queryKey: ["operation", "orders"] });
          void qc.invalidateQueries({ queryKey: ["operation", "staff"] });
        }
      })
      .catch(() => {});
  }, [staffQ.data, qc]);

  // Redistribute ONE member's open orders across the other available members
  // (the resign / long-MC one-click; Team popover).
  async function redistributeStaff(userId: string) {
    const all = data?.orders ?? [];
    const open = all.filter((o) => controlTabOf(o) !== "completed");
    const mine = open.filter((o) => ownerOf(o) === userId);
    // Same rule as the server sweep: away is out; after the 10:00 MYT cutoff
    // a member with no heartbeat today is auto-treated absent (Jess round-3).
    const others = poolStaff.filter(
      (s) =>
        s.available && countsAsInToday(s.last_seen_at) && s.user_id !== userId,
    );
    if (mine.length === 0 || others.length === 0) {
      toast.error(
        mine.length === 0
          ? "No open orders to redistribute"
          : "No other available staff to take them",
      );
      return;
    }
    const loads = others.map((s) => ({
      userId: s.user_id,
      openCount: open.filter((o) => ownerOf(o) === s.user_id).length,
    }));
    const plan = distributeOrders(mine.map((o) => o.id), loads);
    let ok = 0;
    for (let i = 0; i < plan.length; i += 8) {
      const chunk = plan.slice(i, i + 8);
      const results = await Promise.allSettled(
        chunk.map((p) => assignOrderStaffRequest(p.orderId, p.userId)),
      );
      ok += results.filter((r) => r.status === "fulfilled").length;
    }
    toast.success(`Redistributed ${ok} order${ok === 1 ? "" : "s"}`);
    void qc.invalidateQueries({ queryKey: ["operation", "orders"] });
  }

  const visible = useMemo(() => {
    let r = tabFiltered;
    // B rebuild consistency rule: facet counts are OPEN-only (liveScope), so
    // an active facet filter must return exactly those rows — completed
    // orders drop out while any facet (except Owing, which deliberately
    // spans closed orders) is engaged. Delivered history = the Delivered tab.
    // T7 exception: the "Upload delivery photo" queue holds DELIVERED orders by
    // definition, so its own filter must not drop them (same exemption Owing
    // has). Every other facet keeps the open-only rule.
    const facetActive =
      flaggedOnly ||
      escalateOnly ||
      (!!nextFilter && nextFilter !== DELIVERY_PHOTO_VERB) ||
      supplierLateOnly ||
      dueFilter.size > 0 ||
      regionFilter.size > 0 ||
      !!stockFilter ||
      logisticFilter.size > 0 ||
      supplierFilter.size > 0 ||
      !!staffFilter ||
      categoryFilter.size > 0;
    if (facetActive) r = r.filter((o) => controlTabOf(o) !== "completed");
    if (flaggedOnly) r = r.filter(hasOpenTask);
    if (escalateOnly) r = r.filter(hasEscalatedTask);
    if (nextFilter) r = r.filter((o) => nextVerbOf(o) === nextFilter);
    if (supplierLateOnly) r = r.filter(isSupplierLate);
    // Multi-select: a row matches if its bucket/value is in the picked set (OR).
    if (dueFilter.size > 0)
      r = r.filter((o) => {
        const b = dueBucketOf(o);
        return b !== null && dueFilter.has(b);
      });
    if (regionFilter.size > 0)
      r = r.filter((o) => regionFilter.has(regionBucket(o.customer_address ?? null)));
    if (stockFilter) r = r.filter((o) => stockBucketOf(o, availableBySku) === stockFilter);
    if (logisticFilter.size > 0)
      r = r.filter((o) => logisticFilter.has(logisticOf(o, partnerName) ?? NO_CARRIER));
    if (supplierFilter.size > 0)
      r = r.filter((o) => {
        const sid = primarySupplierId(o, skuMeta, suppliers);
        return sid !== null && supplierFilter.has(sid);
      });
    if (staffFilter)
      r = r.filter((o) =>
        staffFilter === NO_STAFF ? !ownerOf(o) : ownerOf(o) === staffFilter,
      );
    if (owingOnly) r = r.filter((o) => moneyOf(o).owing);
    if (categoryFilter.size > 0) {
      const opts = CATEGORY_OPTS.filter((c) => categoryFilter.has(c.key));
      r = r.filter((o) => opts.some((c) => c.match(o)));
    }
    return [...r].sort(compareBySlack);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabFiltered, flaggedOnly, escalateOnly, nextFilter, supplierLateOnly, dueFilter, regionFilter, stockFilter, logisticFilter, supplierFilter, staffFilter, owingOnly, categoryFilter, availableBySku, partnerName, skuMeta, suppliers, tasksByOrder]);

  // Most-recent order/import time → shown next to the count.
  const latestIn = useMemo(() => {
    let mx: string | null = null;
    for (const o of orders) if (o.placed_at && (!mx || o.placed_at > mx)) mx = o.placed_at;
    return mx;
  }, [orders]);

  // Reset the render window to the first batch whenever the filtered set changes.
  useEffect(
    () => setRenderCount(ROWS_PER_BATCH),
    [tab, search, dueFilter, flaggedOnly, escalateOnly, nextFilter, supplierLateOnly, regionFilter, stockFilter, logisticFilter, supplierFilter, categoryFilter],
  );

  const total = visible.length;
  const shown = useMemo(() => visible.slice(0, renderCount), [visible, renderCount]);

  // The list is the only scroll area. An IntersectionObserver sentinel at the
  // bottom appends the next batch as it scrolls into view (guarded for jsdom).
  const listBoxRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLTableRowElement>(null);
  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return;
    const el = sentinelRef.current;
    const root = listBoxRef.current;
    if (!el || !root) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting)
          setRenderCount((c) => Math.min(visible.length, c + ROWS_PER_BATCH));
      },
      { root, rootMargin: "240px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [visible.length]);

  // ── Bulk select (Gmail-style) ──────────────────────────────────────────────
  const pagedIds = useMemo(() => shown.map((o) => o.id), [shown]);
  const allPagedSelected =
    pagedIds.length > 0 && pagedIds.every((id) => selected.has(id));
  // Partial tick → the header checkbox shows an indeterminate dash (Gmail).
  const somePagedSelected =
    !allPagedSelected && pagedIds.some((id) => selected.has(id));
  function toggleOne(id: string) {
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }
  function toggleAllPaged() {
    setSelected((s) => {
      const n = new Set(s);
      if (allPagedSelected) pagedIds.forEach((id) => n.delete(id));
      else pagedIds.forEach((id) => n.add(id));
      return n;
    });
  }
  function clearSel() {
    setSelected(new Set());
    setBulkMenu(null);
  }
  // Gmail "Select all N in <tab>" — the whole filtered tab is already in memory
  // (visible), windowing only limits what's RENDERED, so this needs no API call.
  function selectAllInTab() {
    setSelected(new Set(visible.map((o) => o.id)));
  }
  const selectedOrders = orders.filter((o) => selected.has(o.id));

  // Both export actions live in the bulk ⋮ menu (tick rows → ⋮ → CSV / Print).
  // Tick one customer → Print prints just that order; tick N → batch.
  function exportSelectedCsv() {
    downloadCsv(
      `orders-${selectedOrders.length}.csv`,
      buildOrdersCsv(selectedOrders, partnerName),
    );
    setBulkMenu(null);
  }
  function printSelected() {
    openPrint(buildOrdersPrintHtml(selectedOrders, partnerName, "Orders"));
    setBulkMenu(null);
  }

  async function bulkAssignLogistic(partnerId: string) {
    const ids = [...selected];
    try {
      await Promise.all(ids.map((id) => assignMut.mutateAsync({ orderId: id, partnerId })));
      toast.success(`Assigned ${ids.length} order${ids.length === 1 ? "" : "s"} → ${partnerName.get(partnerId) ?? "partner"}`);
      clearSel();
      void refetch();
    } catch (e) {
      toast.error(`Bulk assign failed — ${(e as Error).message}`);
    }
  }

  async function bulkCreateTasks() {
    const rows = selectedOrders;
    try {
      await Promise.all(
        rows.map((o) =>
          taskMut.mutateAsync({
            title: `Follow up SO-${o.so}${o.customer_name ? ` — ${o.customer_name}` : ""}`,
            relatedOrderId: o.id,
          }),
        ),
      );
      toast.success(`Created ${rows.length} follow-up task${rows.length === 1 ? "" : "s"}`);
      qc.invalidateQueries({ queryKey: ["ops", "tasks"] });
      clearSel();
    } catch (e) {
      toast.error(`Bulk task create failed — ${(e as Error).message}`);
    }
  }

  // Bulk "Mark completed" (migration 0166) — AutoCount legacy cleanup. The RPC
  // is server-scoped to source_system='autocount'; others come back skipped.
  async function bulkMarkCompleted() {
    const ids = [...selected];
    const ok = window.confirm(
      `Mark ${ids.length} order${ids.length === 1 ? "" : "s"} completed?\n\nOnly AutoCount-imported orders are completed — anything else is skipped.`,
    );
    if (!ok) return;
    try {
      const r = (await completeMut.mutateAsync(ids)) as {
        completed: number;
        skipped: number;
      };
      toast.success(
        `Marked ${r.completed} completed` +
          (r.skipped > 0 ? ` · ${r.skipped} skipped (not AutoCount / already closed)` : ""),
      );
      clearSel();
      void refetch();
    } catch (e) {
      toast.error(`Bulk complete failed — ${(e as Error).message}`);
    }
  }

  // Bulk "No storage" (Jess 2026-07-18): exempt the ticked orders from the
  // auto storage fee (override 0 — same as the drawer's No-storage; undo is
  // per-order in the Storage tab).
  async function bulkNoStorage() {
    const ids = [...selected];
    const ok = window.confirm(
      `No storage for ${ids.length} order${ids.length === 1 ? "" : "s"}?\n\nTheir storage fee is set to RM 0 (exempt). Undo per order in its Storage tab.`,
    );
    if (!ok) return;
    try {
      await Promise.all(
        ids.map((id) =>
          apiFetch(`/api/operation/orders/${id}/control`, {
            method: "PUT",
            body: JSON.stringify({ storage_fee_override: 0 }),
          }),
        ),
      );
      toast.success(`${ids.length} order${ids.length === 1 ? "" : "s"} exempted from storage`);
      clearSel();
      void refetch();
    } catch (e) {
      toast.error(`Bulk No-storage failed — ${(e as Error).message}`);
    }
  }

  // Full-page order detail (Jess 2026-06-30) — renders IN PLACE of the list,
  // inside the operation shell, so the sidebar + right rail stay visible (no
  // overlay). Close (✕) clears openOrderId → back to the list (filters preserved).
  if (openOrderId) {
    // ‹ n of m › — step through the SAME filtered+sorted list the table shows.
    const navIdx = visible.findIndex((o) => o.id === openOrderId);
    return (
      <OrderDetailDrawer
        orderId={openOrderId}
        journey={journeySignalsFor(openOrderId)}
        onClose={() => setOpenOrderId(null)}
        nav={
          navIdx >= 0
            ? {
                index: navIdx + 1,
                total: visible.length,
                onPrev:
                  navIdx > 0
                    ? () => setOpenOrderId(visible[navIdx - 1].id)
                    : undefined,
                onNext:
                  navIdx < visible.length - 1
                    ? () => setOpenOrderId(visible[navIdx + 1].id)
                    : undefined,
              }
            : undefined
        }
      />
    );
  }

  if (isLoading) {
    return (
      <div className="px-9 py-8 pb-14">
        <TableSkeleton />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="px-9 py-8 pb-14">
        <div className="rounded-md bg-destructive/10 border border-destructive/30 p-4 text-body">
          <div className="text-destructive font-semibold mb-2">
            Couldn&rsquo;t load orders
          </div>
          <div className="text-meta text-base-700 mb-3">
            {(error as Error | undefined)?.message ?? "Unknown error"}
          </div>
          <button
            type="button"
            onClick={() => void refetch()}
            className="btn-secondary text-label py-1.5 px-3"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  // Active-filter chips + Reset (surfaced through <ListPageShell>). Derived from
  // the same filter state the facet kanban drives, so a chip's ✕ and a Reset
  // clear exactly what the kanban set.
  const anyFilter =
    !!search ||
    !!stockFilter ||
    logisticFilter.size > 0 ||
    !!staffFilter ||
    owingOnly ||
    regionFilter.size > 0 ||
    dueFilter.size > 0 ||
    supplierFilter.size > 0 ||
    categoryFilter.size > 0 ||
    !!nextFilter ||
    supplierLateOnly ||
    flaggedOnly ||
    escalateOnly;

  function resetFilters() {
    setSearch("");
    setStockFilter(null);
    setLogisticFilter(new Set());
    setStaffFilter(null);
    setOwingOnly(false);
    setRegionFilter(new Set());
    setDueFilter(new Set());
    setSupplierFilter(new Set());
    setCategoryFilter(new Set());
    setNextFilter(null);
    setFlaggedOnly(false);
    setEscalateOnly(false);
  }

  const activeChips: ActiveChip[] = [];
  if (search) activeChips.push({ label: `Search: ${search}`, onClear: () => setSearch("") });
  if (stockFilter)
    activeChips.push({ label: `Stock: ${stockFilter}`, onClear: () => setStockFilter(null) });
  // Multi-select facets: one chip per picked value (✕ removes just that one).
  for (const c of logisticFilter)
    activeChips.push({
      label: c === NO_CARRIER ? "No logistics picked" : `Logistics: ${c}`,
      onClear: () => setLogisticFilter((p) => toggleInSet(p, c)),
    });
  for (const rg of regionFilter)
    activeChips.push({
      label: rg === OTHERS_LABEL ? "No region" : `Region: ${rg}`,
      onClear: () => setRegionFilter((p) => toggleInSet(p, rg)),
    });
  if (staffFilter)
    activeChips.push({
      label:
        staffFilter === NO_STAFF
          ? "No PIC"
          : `PIC: ${(() => {
              const m = staffById.get(staffFilter);
              return m ? staffLabel(m) : staffFilter;
            })()}`,
      onClear: () => setStaffFilter(null),
    });
  for (const sid of supplierFilter)
    activeChips.push({
      label: `Supplier: ${supplierNameById.get(sid) ?? sid}`,
      onClear: () => setSupplierFilter((p) => toggleInSet(p, sid)),
    });
  if (owingOnly) activeChips.push({ label: "Owing", onClear: () => setOwingOnly(false) });
  if (supplierLateOnly)
    activeChips.push({ label: "Supplier late", onClear: () => setSupplierLateOnly(false) });
  for (const b of dueFilter)
    activeChips.push({ label: `Deadline: ${b}`, onClear: () => setDueFilter((p) => toggleInSet(p, b)) });
  if (nextFilter)
    activeChips.push({ label: `Action: ${nextFilter}`, onClear: () => setNextFilter(null) });
  if (flaggedOnly) activeChips.push({ label: "Follow-up", onClear: () => setFlaggedOnly(false) });
  // A product must not hard-code a person (Jess 2026-07-27) — the escalation
  // goes to whoever holds the manager seat, not to a name in the code.
  if (escalateOnly)
    activeChips.push({ label: "For manager review", onClear: () => setEscalateOnly(false) });
  for (const key of categoryFilter)
    activeChips.push({
      label: `Cat: ${key}`,
      onClear: () =>
        setCategoryFilter((prev) => {
          const n = new Set(prev);
          n.delete(key);
          return n;
        }),
    });

  // PO-day banner (Mon/Thu) + urgent bypass (any day) — shown to the WHOLE
  // operation team (Jess 2026-07-19: the duty roster is a notice board, not a
  // private message — everyone must see whose month it is and that today is
  // PO day). Only the ACTION is gated: the Raise PO button renders for the
  // holder + management. Speaks the C-vocab queue words, same as QUEUES+NEXT.
  // A number printed under a queue word must be a number that queue's own click
  // can produce, so each count is read from its own queue and never summed.
  const issuePoCount = nextCounts.get(orderActionQueue("issue_po")) ?? 0;
  const chaseSupplierCount =
    nextCounts.get(orderActionQueue("confirm_ready_date")) ?? 0;
  // Quiet chip = every day (whole team, zero clicks): holder avatar + next PO
  // day. Hot state = Mon/Thu, urgent, or ?poday preview: the SAME slot grows
  // the action chip (+ Raise PO for holder/management). One announce home.
  const poDays = purchasingSettings?.poDays ?? [];
  const isPoDayToday = poDays.length > 0 && isPoDayMYT(new Date(), poDays);
  const poHot = poDayPreview || isPoDayToday || urgentPoCount > 0;
  const nextPoIso = nextPoDayMYT(new Date(), poDays);
  // No PO day configured (or the settings have not landed yet) → no date to
  // print. Better a blank than a made-up "next Monday".
  const nextPoLabel = nextPoIso
    ? `${new Date(`${nextPoIso}T00:00:00`).toLocaleDateString("en-US", { weekday: "short" })} ${fmtDateShort(nextPoIso)}`
    : "—";
  // Queue-row owner adornments (B+C): goods queues carry the duty holder's
  // avatar, PIC queues a grey tag. Every QUEUES/TEAM row gets the SAME
  // fixed-width leading slot — mixed chip widths broke label alignment
  // (Jess 2026-07-19 "PIC & SH & LC should align"); chip-less rows carry an
  // empty slot so all labels start on one line.
  const chipSlot = (content?: ReactNode) => (
    <span className="w-8 shrink-0 flex justify-center">{content}</span>
  );
  const emptyQueueChip = chipSlot();
  const dutyQueueChip = chipSlot(
    poDutyHolderShown ? (
      <span
        className="w-[18px] h-[18px] rounded-full flex items-center justify-center text-label font-semibold leading-none shrink-0"
        style={{
          background: avatarColor(poDutyHolderShown.userId).bg,
          color: avatarColor(poDutyHolderShown.userId).fg,
        }}
        title={`${personLabel(poDutyHolderShown.name, poDutyHolderShown.email)}'s queue — PO duty this month`}
      >
        {personInitials(poDutyHolderShown.name, poDutyHolderShown.email)}
      </span>
    ) : undefined,
  );
  const picQueueChip = chipSlot(
    <span
      className="shrink-0 text-label leading-4 border border-base-200 rounded-full px-1.5 text-base-500 bg-white"
      title="Each PIC follows up their own orders"
    >
      PIC
    </span>,
  );
  const poDutyTitleChips = poDutyHolderShown ? (
    <div className="flex items-center gap-1.5" data-testid="po-duty-strip">
      <span
        className="inline-flex items-center gap-1.5 h-[26px] rounded-full border border-base-200 bg-white px-2 text-label text-base-500 whitespace-nowrap"
        title={`PO duty this month: ${poDutyHolderShown.name ?? poDutyHolderShown.email}${poDutyHolder ? "" : " (demo)"} — controls ${orderActionQueue("issue_po")} + ${orderActionQueue("confirm_ready_date")} (the one voice to suppliers). Full roster: right rail → Team.`}
      >
        <span
          className="w-4 h-4 rounded-full flex items-center justify-center text-label font-semibold leading-none shrink-0"
          style={{
            background: avatarColor(poDutyHolderShown.userId).bg,
            color: avatarColor(poDutyHolderShown.userId).fg,
          }}
        >
          {personInitials(poDutyHolderShown.name, poDutyHolderShown.email)}
        </span>
        PO duty{!poDutyHolder && " · demo"} · next {nextPoLabel}
      </span>
      {poHot && (
        <span
          className={`inline-flex items-center gap-1 h-[26px] rounded-full px-2 text-label font-semibold whitespace-nowrap ${
            urgentPoCount > 0 && !(poDayPreview || isPoDayToday)
              ? "bg-destructive/10 text-destructive"
              : "bg-warning-soft text-warning"
          }`}
          data-testid="po-day-chip"
        >
          <PackagePlus size={14} strokeWidth={2} />
          {poDayPreview || isPoDayToday
            ? `PO day — ${orderActionQueue("issue_po")} ${issuePoCount} · ${orderActionQueue("confirm_ready_date")} ${chaseSupplierCount}`
            : `${urgentPoCount} urgent — inside the stock window`}
          {(poDayPreview || isPoDayToday) && urgentPoCount > 0 && (
            <span className="text-destructive">· {urgentPoCount} urgent</span>
          )}
        </span>
      )}
      {poHot && canRaise && (
        <button
          type="button"
          onClick={() =>
            setRaisePoOrders(
              liveScope.filter((o) => stockBucketOf(o, availableBySku) !== "Ready"),
            )
          }
          className="btn-secondary text-label h-[26px] py-0 px-2 whitespace-nowrap inline-flex items-center"
        >
          Raise PO
        </button>
      )}
    </div>
  ) : undefined;
  // Header PO-duty strip REMOVED (Jess 2026-07-19: "useless") — the duty holder
  // lives in the right-rail Team board; Raise PO stays in the bulk bar. Built
  // above but no longer mounted; `void` keeps the vars referenced (no churn).
  void poDutyTitleChips;

  return (
    <>
      <ListPageShell
        testId="operation-orders-control"
        breadcrumb={
          <>
            <span>Operations</span>
            <ChevronRight size={12} className="text-base-300" />
            <span className="text-base-600">Orders</span>
          </>
        }
        title={
          <span className="inline-flex items-baseline gap-3">
            <span>Orders</span>
            {latestIn && (
              <span className="inline-flex items-center gap-1.5 text-meta font-normal text-base-400">
                <span className="tabular-nums" title="Most recent order / import">
                  Synced {fmtDate(latestIn)}
                </span>
                <button
                  type="button"
                  onClick={() => void refetch()}
                  title="Refresh"
                  aria-label="Refresh orders"
                  className="p-0.5 rounded hover:text-base-900 hover:bg-hovertint transition-colors"
                >
                  <RefreshCw size={13} strokeWidth={2} />
                </button>
              </span>
            )}
          </span>
        }
        titleRight={undefined}
        actions={
          /* Header right cluster (ONE white header surface): search → Bell →
             HelpCircle → Settings. Search lives HERE now, not in the toolbar. */
          <>
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="SO number or customer…"
              className="w-[230px] px-4 py-1.5 border border-base-200 rounded-full text-body bg-white outline-none focus:border-base-700"
            />
            <TopBarIcons />
          </>
        }
        facetOpen={kanbanOpen}
        onFacetToggle={() => setKanbanOpen((v) => !v)}
        toolbar={
          /* STATUS pipeline as top horizontal tabs (Gmail Primary/Social). */
          <StatusTabs
            tabs={TABS.map((t) => ({
              key: t.key,
              label: t.label,
              count: counts[t.key],
              title: STATUS_META_DESC[t.key] ?? TAB_DESC[t.key as SettledTab],
            }))}
            active={tab}
            onSelect={setTab}
          />
        }
        toolbarRight={
          /* ONE-row toolbar, right cluster: + Master · + AutoCount · ⋮. The
             "N of M" counter is GONE (Jess 2026-07-18: it floated in the air
             and duplicated the footer count + the Loading-more sentinel). */
          <>
            <button
              type="button"
              onClick={() => setEtaImportOpen(true)}
              className="btn-secondary text-meta whitespace-nowrap rounded-xl"
              title="Import from Master — fill each order line's Stock ETA + status from your Master sheet"
            >
              + Master
            </button>
            {onImport && (
              <button
                type="button"
                onClick={onImport}
                className="btn-hero text-meta whitespace-nowrap rounded-xl"
                title="Import orders from AutoCount"
              >
                + AutoCount
              </button>
            )}
            {hiddenCols.size > 0 && (
              <span
                className="text-meta text-base-500 tabular-nums"
                title="Some columns are hidden"
              >
                {visibleColDefs.length}/{ORDER_COL_DEFS.length}
              </span>
            )}
            <div className="relative" ref={columnsRef}>
              <button
                type="button"
                onClick={() => setColumnsOpen((o) => !o)}
                aria-label="Table options"
                title="Table options"
                aria-haspopup="menu"
                aria-expanded={columnsOpen}
                className="p-1 rounded-md border border-base-200 text-base-500 hover:text-base-800 hover:bg-hovertint transition-colors"
              >
                <MoreVertical size={15} />
              </button>
              {columnsOpen && (
                <div className="absolute z-30 mt-1 right-0 w-56 max-h-80 overflow-auto bg-card text-card-foreground border border-base-200 rounded-md shadow-lg py-1">
                  <div className="text-label uppercase tracking-[0.05em] text-base-500 px-3 pt-1 pb-1.5">Show columns</div>
                  <div className="px-1.5 pb-1">
                    {ORDER_COL_DEFS.map((d) => (
                      <label
                        key={d.key}
                        className="flex items-center gap-2 px-1.5 py-1 rounded hover:bg-hovertint cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          checked={showCol(d.key)}
                          onChange={() => toggleCol(d.key)}
                        />
                        <span className="text-body text-base-700 truncate">{d.label}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </>
        }
        toolbarSecondary={
          /* PIC tabs on the RIGHT listing too (Jess 2026-07-18: "every staff
             and no pic … as tab, can click to see total list of them") — the
             SAME staffFilter the left TEAM rows drive; click either side. */
          poolStaff.length > 0 ? (
            <div className="w-full flex items-center gap-1.5 justify-start overflow-x-auto no-scrollbar">
              <StaffChip
                label="Everyone"
                count={liveScope.length}
                active={!staffFilter}
                onClick={() => setStaffFilter(null)}
              />
              {poolStaff.map((s) => (
                <StaffChip
                  key={s.user_id}
                  count={staffEntries.counts.get(s.user_id) ?? 0}
                  active={staffFilter === s.user_id}
                  avatar={{ text: staffInitials(s), ...avatarColor(s.user_id) }}
                  title={`${staffLabel(s)} · ${s.email}`}
                  onClick={() =>
                    setStaffFilter((f) => (f === s.user_id ? null : s.user_id))
                  }
                />
              ))}
              <StaffChip
                label="No PIC"
                count={staffEntries.none}
                active={staffFilter === NO_STAFF}
                onClick={() =>
                  setStaffFilter((f) => (f === NO_STAFF ? null : NO_STAFF))
                }
              />
            </div>
          ) : undefined
        }
        bulkBar={
          selected.size > 0 ? (
            <OrdersBulkBar
              count={selected.size}
              total={total}
              tabLabel={TABS.find((t) => t.key === tab)?.label ?? "this tab"}
              allChecked={allPagedSelected}
              someChecked={somePagedSelected}
              onSelectAllInTab={selectAllInTab}
              menu={bulkMenu}
              setMenu={setBulkMenu}
              partners={partnersQ.data?.partners ?? []}
              onAssign={bulkAssignLogistic}
              onRaisePo={() => setRaisePoOrders(selectedOrders)}
              canRaisePo={canRaise}
              raisePoTitle={
                canRaise
                  ? "Raise consolidated POs — one per supplier — for the selection"
                  : `${poDutyHolder?.name ?? poDutyHolder?.email ?? "The duty holder"}'s PO month — only the duty holder and management can raise POs`
              }
              onChaseSupplier={(mode) => {
                setChaseInitialMode(mode);
                // If exactly one supplier is filtered, scope the review to it so a
                // multi-supplier order doesn't leak the other supplier's card
                // (Jess #1). Otherwise show every supplier in the selection.
                setChaseSupplierScope(
                  supplierFilter.size === 1 ? [...supplierFilter][0] : null,
                );
                setChaseOrders(selectedOrders);
              }}
              onChasePartner={(mode) => {
                setChaseInitialMode(mode);
                setChasePartnerOrders(selectedOrders);
              }}
              onFlag={bulkCreateTasks}
              onExport={exportSelectedCsv}
              onPrint={printSelected}
              onComplete={bulkMarkCompleted}
              onNoStorage={bulkNoStorage}
              onClear={clearSel}
              busy={assignMut.isPending || taskMut.isPending || completeMut.isPending}
            />
          ) : undefined
        }
        activeChips={activeChips}
        footer={
          <>
            <span className="tabular-nums">
              {total} {total === 1 ? "order" : "orders"}
            </span>
            {anyFilter && (
              <button
                type="button"
                onClick={resetFilters}
                className="hover:text-base-900 transition-colors"
              >
                Reset filters
              </button>
            )}
          </>
        }
        facet={
          /* ONE white panel — every section is a cream title bar (collapsible ˅).
             SUMMARY sits on top and carries the whole-panel collapse ‹; the 240px
             scroll container is owned by <ListPageShell>. Token classes only
             (design-standard: no raw hex in new code). */
          <SectionCard>
              {/* QUEUES — Jess's daily questions as clickable work queues (B
                  rebuild 2026-07-18, Gmail-label pattern): 谁欠钱 · 过期未送 ·
                  该约车 · 等货 · 没物流. Zero rows auto-hide; NO group total
                  (heterogeneous buckets overlap). Word law: "Not booked"/"To
                  book" = the §12 truth-ladder word; "Urgent/At-risk" retired —
                  ONE urgency word (Overdue). */}
              <KanbanGroup
                title="QUEUES"
                danger
                collapsed={collapsedGroups.has("QUEUES")}
                onToggle={() => toggleGroup("QUEUES")}
                headerRight={
                  <button
                    type="button"
                    onClick={() => setKanbanOpen(false)}
                    title="Collapse filters"
                    aria-label="Collapse filters"
                    className="shrink-0 p-0.5 rounded text-base-400 hover:text-base-800 hover:bg-hovertint transition-colors"
                  >
                    <ChevronsLeft size={15} />
                  </button>
                }
              >
                {/* C-vocab (Jess 2026-07-19): Overdue (结果) + Owing (钱) on
                    top, then the action queues — the row's queue IS its action,
                    so the numbers match the Actions column by construction.
                    States live in FILTERS; no-logistics = Assign logistics. */}
                {(dueEntries.find((e) => e.bucket === "Overdue")?.count ?? 0) > 0 && (
                  <KanbanRow
                    label="Overdue"
                    count={dueEntries.find((e) => e.bucket === "Overdue")?.count ?? 0}
                    tone="danger"
                    active={dueFilter.has("Overdue")}
                    chip={emptyQueueChip}
                    title="Past the delivery date and not delivered yet — who to call = the row's Actions cell"
                    onClick={() => setDueFilter((p) => toggleInSet(p, "Overdue"))}
                  />
                )}
                {owing.n > 0 && (
                  <KanbanRow
                    label="Owing"
                    count={owing.n}
                    valueText={`RM ${Math.round(owing.rm).toLocaleString("en-MY")}`}
                    tone="danger"
                    active={owingOnly}
                    chip={picQueueChip}
                    title={`${owing.n} orders still owe money (delivered included)`}
                    onClick={() => setOwingOnly((v) => !v)}
                  />
                )}
                {NEXT_QUEUE_VERBS.map((v) => {
                  // C8b — the two delay queues carry their own deadline, so
                  // they show the same "5 · 2 late" tail the delivery queues
                  // do. `undefined` on every other queue leaves the row exactly
                  // as it was.
                  const delayStat = delayQueueStats.get(v);
                  const delayLate = delayStat && delayStat.late > 0 ? delayStat : null;
                  return (nextCounts.get(v) ?? 0) > 0 ? (
                    <KanbanRow
                      key={v}
                      label={v}
                      count={nextCounts.get(v) ?? 0}
                      valueText={
                        delayLate ? `${delayLate.n} · ${delayLate.late} late` : undefined
                      }
                      tone={
                        v === orderActionQueue("confirm_ready_date")
                          ? "warning"
                          : "danger"
                      }
                      active={nextFilter === v}
                      chip={
                        // C8 — both delay queues belong to the order's PIC:
                        // §3 gives BOTH stages to Operations (the conversation
                        // is logistics', the action in this portal is ours),
                        // and C6 ruled the order's PIC is the task owner of
                        // every action of that order.
                        v === orderActionQueue("delay_planning") ||
                        v === orderActionQueue("arrange_new_delivery_date")
                          ? picQueueChip
                          : dutyQueueChip
                      }
                      title={
                        delayLate
                          ? `${NEXT_QUEUE_DESC[v]}. ${delayLate.late} of ${delayLate.n} already past that deadline.`
                          : NEXT_QUEUE_DESC[v]
                      }
                      onClick={() => setNextFilter((f) => (f === v ? null : v))}
                    />
                  ) : null;
                })}
                {/* Supplier-late (storage arc, merged from main): the goods ETA
                    misses the promise — the supplier is the problem. Kept as a
                    QUEUE alongside the C-vocab verbs (it's a data flag, not a
                    NEXT verb). */}
                {supplierLateCount > 0 && (
                  <KanbanRow
                    label="Supplier late"
                    count={supplierLateCount}
                    tone="danger"
                    active={supplierLateOnly}
                    chip={dutyQueueChip}
                    title="The goods ETA misses or has passed the customer promise — the supplier is the problem, not the customer"
                    onClick={() => setSupplierLateOnly((v) => !v)}
                  />
                )}
                {flaggedCount > 0 && (
                  <KanbanRow
                    label="Follow-up"
                    count={flaggedCount}
                    active={flaggedOnly}
                    chip={emptyQueueChip}
                    title="Orders with an open follow-up note for the next operator"
                    onClick={() => setFlaggedOnly((v) => !v)}
                  />
                )}
                {escalateCount > 0 && (
                  <KanbanRow
                    label="For manager review"
                    count={escalateCount}
                    active={escalateOnly}
                    chip={emptyQueueChip}
                    title="Escalated — orders that need a manager's decision before anyone else can act"
                    onClick={() => setEscalateOnly((v) => !v)}
                  />
                )}
              </KanbanGroup>

              {/* DELIVERY — T7 (Jess 2026-07-27): the delivery lifecycle as FOUR
                  real queues instead of one blob, each with its OWN deadline so
                  an item turns late by itself (assign ≥3 working days before the
                  promised date · confirm ≥1 · deliver ON the confirmed date ·
                  photo same/next working day). The labels ARE the NEXT verbs, so
                  the counts match the NEXT column by construction (C-vocab); the
                  "· N late" tail is the auto-overdue. Zero rows auto-hide, and
                  the whole group hides when the team has no delivery work. */}
              {(unassignedCount > 0 ||
                DELIVERY_QUEUES.some((q) => (deliveryQueueStats.get(q.label)?.n ?? 0) > 0)) && (
                <KanbanGroup
                  title="DELIVERY"
                  testid="filter-delivery"
                  collapsed={collapsedGroups.has("DELIVERY")}
                  onToggle={() => toggleGroup("DELIVERY")}
                >
                  {/* Every open order with no logistics company yet — the
                      broader list (Assign logistics fires only once stock is
                      Ready). Filters via logisticFilter holding NO_CARRIER.
                      The word is COPY-STANDARD's: a fact may state an absence,
                      and "Unassigned" is not one of the allowed ones. */}
                  {unassignedCount > 0 && (
                    <KanbanRow
                      label="No logistics picked"
                      count={unassignedCount}
                      active={logisticFilter.has(NO_CARRIER)}
                      chip={picQueueChip}
                      title="No logistics company picked yet — the Actions cell says Assign logistics once the stock is in"
                      onClick={() => setLogisticFilter((p) => toggleInSet(p, NO_CARRIER))}
                    />
                  )}
                  {DELIVERY_QUEUES.map((q) => {
                    const s = deliveryQueueStats.get(q.label);
                    if (!s || s.n === 0) return null;
                    return (
                      <KanbanRow
                        key={q.key}
                        label={q.label}
                        count={s.n}
                        // Numbers up front (COPY-STANDARD rule 3): "5 · 2 late".
                        valueText={s.late > 0 ? `${s.n} · ${s.late} late` : undefined}
                        tone={s.late > 0 ? "danger" : undefined}
                        active={nextFilter === q.label}
                        chip={picQueueChip}
                        title={
                          s.late > 0
                            ? `${q.description}. ${s.late} of ${s.n} already past that deadline.`
                            : q.description
                        }
                        onClick={() => setNextFilter((f) => (f === q.label ? null : q.label))}
                      />
                    );
                  })}
                </KanbanGroup>
              )}

              {/* TEAM — 每人手上几张 (B rebuild): pool members + No PIC.
                  ⚙ Team manages membership / MC availability / redistribute.
                  Hidden entirely while the staff route is absent (old Worker). */}
              {staffList.length > 0 && (
                <KanbanGroup
                  title="TEAM"
                  testid="filter-staff"
                  collapsed={collapsedGroups.has("STAFF")}
                  onToggle={() => toggleGroup("STAFF")}
                  headerRight={
                    /* Pool management = management only (Jess 2026-07-18). */
                    isManager ? (
                      <TeamPopover
                        staff={staffList}
                        openCounts={staffEntries.counts}
                        onRedistribute={(id) => void redistributeStaff(id)}
                      />
                    ) : undefined
                  }
                >
                  {poolStaff.map((s) => {
                    // Presence dot on the avatar (Jess 2026-07-19): green = in
                    // today, grey = not in yet — replaces the "· not in" text.
                    // "away" (planned leave) keeps its word; the dot is grey.
                    const inToday = s.available && seenTodayMYT(s.last_seen_at);
                    const presence = !s.available
                      ? `${staffLabel(s)} · away`
                      : staffLabel(s);
                    // PO duty badge (0236) — the month's PO controller.
                    const isDuty = poDutyHolderShown?.userId === s.user_id;
                    const baseTitle = !s.available
                      ? `${s.email} — marked away (planned leave); their orders shift to the others`
                      : !seenTodayMYT(s.last_seen_at)
                        ? `${s.email} — not in yet today; from 10:00 their orders auto-shift to whoever is in, and flow back when they show up`
                        : `${s.email} — in today`;
                    return (
                      <KanbanRow
                        key={s.user_id}
                        label={isDuty ? `${presence} · PO duty` : presence}
                        count={staffEntries.counts.get(s.user_id) ?? 0}
                        active={staffFilter === s.user_id}
                        chip={chipSlot(
                          <span className="relative w-[18px] h-[18px] shrink-0">
                            <span
                              className="w-[18px] h-[18px] rounded-full flex items-center justify-center text-label font-semibold leading-none"
                              style={{
                                background: avatarColor(s.user_id).bg,
                                color: avatarColor(s.user_id).fg,
                              }}
                            >
                              {staffInitials(s)}
                            </span>
                            <span
                              className={`absolute -right-0.5 -bottom-0.5 w-2 h-2 rounded-full border border-white ${inToday ? "bg-success" : "bg-base-300"}`}
                              title={inToday ? "in today" : "not in yet"}
                            />
                          </span>,
                        )}
                        title={
                          isDuty
                            ? `${baseTitle} — controls POs this month (PO duty)`
                            : baseTitle
                        }
                        onClick={() =>
                          setStaffFilter((f) => (f === s.user_id ? null : s.user_id))
                        }
                      />
                    );
                  })}
                  {/* Not-yet-onboarded staff — visible in the roster before
                      day one; first login auto-activates (round-4). */}
                  {pendingStaff.map((s) => {
                    const isDuty = poDutyHolderShown?.userId === s.user_id;
                    return (
                      <KanbanRow
                        key={s.user_id}
                        label={
                          /* "· pending" (Jess 2026-07-19: the long "joins on
                             first login" truncated the name) — the suffix
                             disappears the moment she first logs in (auto-
                             enroll flips her to a normal pooled row). */
                          isDuty
                            ? `${staffLabel(s)} · pending · PO duty`
                            : `${staffLabel(s)} · pending`
                        }
                        count={0}
                        active={staffFilter === s.user_id}
                        chip={chipSlot(
                          <span
                            className="w-[18px] h-[18px] rounded-full flex items-center justify-center text-label font-semibold leading-none shrink-0 opacity-60"
                            style={{
                              background: avatarColor(s.user_id).bg,
                              color: avatarColor(s.user_id).fg,
                            }}
                          >
                            {staffInitials(s)}
                          </span>,
                        )}
                        title={`${s.email} — account ready; her first login auto-joins the pool and deals her a share (no admin step)`}
                        onClick={() =>
                          setStaffFilter((f) => (f === s.user_id ? null : s.user_id))
                        }
                      />
                    );
                  })}
                  {/* "No PIC" — never a bare "Unassigned": that reads as the
                      no-logistics row two groups down (word law). */}
                  <KanbanRow
                    label="No PIC"
                    count={staffEntries.none}
                    active={staffFilter === NO_STAFF}
                    chip={emptyQueueChip}
                    title="Orders nobody is watching yet"
                    onClick={() =>
                      setStaffFilter((f) => (f === NO_STAFF ? null : NO_STAFF))
                    }
                  />
                  {/* (Round-2: the "waits for login" explainer died with the
                      presence gate — assignment is immediate on Add now.) */}
                </KanbanGroup>
              )}

              {/* FILTERS wrapper header REMOVED (Jess 2026-07-19) — the filter
                  dimensions (Logistic / Supplier / Region / Category) render
                  directly, no parent fold. */}
              <>
                {/* DEADLINE (Jess 2026-07-19, B redesign) — the shared customer
                    delivery-date urgency band. Multi-select pills; SUPPLIER +
                    LOGISTIC both read against it. "Overdue" mirrors the QUEUES
                    Overdue row (same dueFilter state). */}
                <KanbanGroup
                  title="DEADLINE"
                  testid="filter-deadline"
                  collapsed={collapsedGroups.has("DEADLINE")}
                  onToggle={() => toggleGroup("DEADLINE")}
                >
                  <div className="flex flex-wrap items-center gap-1.5 px-2.5 py-1">
                    {DUE_BUCKETS.map((b) => {
                      const count = dueEntries.find((e) => e.bucket === b)?.count ?? 0;
                      const cls = b === "Overdue" ? "pill-overdue" : b === "Due ≤3d" ? "pill-warning" : "pill-neutral";
                      return (
                        <button
                          key={b}
                          type="button"
                          aria-pressed={dueFilter.has(b)}
                          onClick={() => setDueFilter((p) => toggleInSet(p, b))}
                          className={`pill ${cls} hover:brightness-95 ${dueFilter.has(b) ? "font-semibold ring-1 ring-current" : ""}`}
                        >
                          {b} {count}
                        </button>
                      );
                    })}
                  </div>
                </KanbanGroup>
                <KanbanGroup
                  title="LOGISTICS"
                  testid="filter-logistic"
                  collapsed={collapsedGroups.has("LOGISTICS")}
                  onToggle={() => toggleGroup("LOGISTICS")}
                >
                  {/* no-logistics = the "Assign logistics" QUEUE (C-vocab); here
                      EVERY company is an option (0-count included, Jess
                      2026-07-19) so the whole fleet is filterable. */}
                  {logisticEntries.map((e) => (
                    <KanbanRow
                      key={e.carrier}
                      label={e.carrier}
                      count={e.count}
                      active={logisticFilter.has(e.carrier)}
                      onClick={() => setLogisticFilter((p) => toggleInSet(p, e.carrier))}
                    />
                  ))}
                </KanbanGroup>
                <KanbanGroup
                  title="SUPPLIER"
                  testid="filter-supplier"
                  collapsed={collapsedGroups.has("SUPPLIER")}
                  onToggle={() => toggleGroup("SUPPLIER")}
                >
                  {/* Pure FILTER now (Jess 2026-07-19, B redesign): multi-select
                      suppliers. The deadline filter is the shared DEADLINE band;
                      Remind/Chase moved to the bulk bar's Supplier ⋮. */}
                  {supplierEntries.map((e) => (
                    <KanbanRow
                      key={e.id}
                      label={e.name}
                      count={e.count}
                      active={supplierFilter.has(e.id)}
                      onClick={() => setSupplierFilter((p) => toggleInSet(p, e.id))}
                    />
                  ))}
                </KanbanGroup>
                <KanbanGroup
                  title="REGION"
                  collapsed={collapsedGroups.has("REGION")}
                  onToggle={() => toggleGroup("REGION")}
                >
                  {/* "Others" (no region) lives in FIX DATA — here real regions. */}
                  {regionEntries
                    .filter((e) => e.region !== OTHERS_LABEL && e.count > 0)
                    .map((e) => (
                      <KanbanRow
                        key={e.region}
                        label={e.region}
                        count={e.count}
                        active={regionFilter.has(e.region)}
                        onClick={() => setRegionFilter((p) => toggleInSet(p, e.region))}
                      />
                    ))}
                </KanbanGroup>
                <KanbanGroup
                  title="CATEGORY"
                  collapsed={collapsedGroups.has("CATEGORY")}
                  onToggle={() => toggleGroup("CATEGORY")}
                >
                  {categoryEntries
                    .filter((e) => e.count > 0)
                    .map((e) => (
                      <KanbanRow
                        key={e.key}
                        label={e.label}
                        count={e.count}
                        active={categoryFilter.has(e.key)}
                        onClick={() =>
                          setCategoryFilter((prev) => {
                            const next = new Set(prev);
                            if (next.has(e.key)) next.delete(e.key);
                            else next.add(e.key);
                            return next;
                          })
                        }
                      />
                    ))}
                </KanbanGroup>
              </>

              {/* FIX DATA — broken records to repair, NOT people to chase (B
                  rebuild): unreadable region + missing PO. Hidden when clean. */}
              {((regionEntries.find((e) => e.region === OTHERS_LABEL)?.count ?? 0) > 0 ||
                (stockEntries.find((e) => e.bucket === "No PO")?.count ?? 0) > 0) && (
                <KanbanGroup
                  title="FIX DATA"
                  collapsed={collapsedGroups.has("FIX DATA")}
                  onToggle={() => toggleGroup("FIX DATA")}
                >
                  {(regionEntries.find((e) => e.region === OTHERS_LABEL)?.count ?? 0) > 0 && (
                    <KanbanRow
                      label="No region"
                      count={regionEntries.find((e) => e.region === OTHERS_LABEL)?.count ?? 0}
                      active={regionFilter.has(OTHERS_LABEL)}
                      title="Delivery region couldn't be read from the address — fix the address"
                      onClick={() => setRegionFilter((p) => toggleInSet(p, OTHERS_LABEL))}
                    />
                  )}
                  {(stockEntries.find((e) => e.bucket === "No PO")?.count ?? 0) > 0 && (
                    <KanbanRow
                      label="No PO"
                      count={stockEntries.find((e) => e.bucket === "No PO")?.count ?? 0}
                      active={stockFilter === "No PO"}
                      title="No purchase order raised yet — open the order to raise it"
                      onClick={() => setStockFilter((r) => (r === "No PO" ? null : "No PO"))}
                    />
                  )}
                </KanbanGroup>
              )}
          </SectionCard>
        }
      >
          {/* Listing — the ONLY scroll area (the page stays put, only the rows
              scroll). table-fixed + a colgroup → columns keep their width. */}
      <div
        ref={listBoxRef}
        className="flex-1 min-h-0 bg-white border border-base-200 rounded-t-[12px] rounded-b-none shadow-sm overflow-auto"
      >
        <table
          /* SIZING LAW §3 (2026-07-18): list rows are 40px FIXED (44 deleted) —
             content adapts to the row, never the reverse. whitespace-nowrap
             kills the silent row-growers (text WRAPPING inside narrow fixed
             columns); the two-line cells (Order / Customer / Stock / Delivery)
             stack at 15px line-height, each line just ellipsises. */
          className="w-full border-collapse text-body table-fixed [&_td]:h-[40px] [&_td]:py-1 [&_td]:align-middle [&_td]:overflow-hidden [&_td]:whitespace-nowrap"
        >
          {/* PERCENTAGE colgroup (Loo 2026-07-09) — table-fixed + w-full + % widths
              so the table is ALWAYS exactly the container width → it NEVER
              horizontally scrolls on any screen; long content ellipsis-truncates.
              Order (C rebuild §14): ☐ · ⚑ · Status dots · Order · Customer ·
              Stock · Delivery · Deadline · Next. */}
          <colgroup>
            <col style={{ width: "3%" }} />
            <col style={{ width: "3%" }} />
            {visibleColDefs.map((d) => (
              <col key={d.key} style={{ width: `${(d.w * colScale).toFixed(2)}%` }} />
            ))}
          </colgroup>
          {/* Wireframe header band (P11) — the old solid black #221F20 band is
              gone: a light warm surface + a 0.5px hairline, dark micro-uppercase
              labels. When rows are selected the SAME row (same height) fills grey
              with the bulk actions (BulkHeadRow) — Gmail-style, so the table
              never jumps. sticky so the header stays put as the list scrolls. */}
          <thead className="sticky top-0 z-10">
            {/* One header row (the bulk actions live in the top bar now, so the
                table never swaps its head). The select-all shows Gmail's
                indeterminate dash on a partial tick. */}
            <tr
              className="border-b h-10"
              /* v4 §11a cool header band (warm #F8F6F1 retired with the C rebuild).
                 h-10 = same 40px as the data rows (SIZING LAW §3) so the header
                 never reads thinner than the listing. */
              style={{ backgroundColor: "#E5E7EB", borderBottomColor: "#D1D5DB" }}
            >
              <th className="px-2 py-1.5">
                <input
                  type="checkbox"
                  checked={allPagedSelected}
                  ref={(el) => {
                    if (el) el.indeterminate = somePagedSelected;
                  }}
                  onChange={toggleAllPaged}
                  aria-label="Select all on this page"
                  className="cursor-pointer accent-base-900 align-middle w-[17px] h-[17px]"
                />
              </th>
              <th className="px-1 py-1.5 text-center" title="Follow-up">
                <Flag size={13} strokeWidth={2} className="inline text-base-400" aria-label="Follow-up" />
              </th>
              {showCol("dots") && (
                <Th>
                  {/* The word heads the STAGE PILL only. The three dots beside
                      it need no header of their own (Jess 2026-07-27) — each is
                      labelled by its own icon and carries its own tooltip. */}
                  <span title="Where the order sits: Placed → Proceed → To book → Customer confirmed → Delivered. Beside it, three checks: goods, delivery, money.">
                    Status
                  </span>
                </Th>
              )}
              {showCol("order") && <Th>Order</Th>}
              {showCol("customer") && <Th>Customer</Th>}
              {showCol("deadline") && <Th>Deadline</Th>}
              {showCol("stock") && <Th>Stock</Th>}
              {showCol("delivery") && <Th>Delivery</Th>}
              {showCol("pic") && (
                <Th>
                  <span title="Person in charge — who's watching this order">PIC</span>
                </Th>
              )}
              {/* The header word lives in ORDER_COL_DEFS too (the Columns
                  popover reads it) — take it from there so the two cannot
                  disagree, which is exactly how "Manage" survived here. */}
              {showCol("next") && (
                <Th>{ORDER_COL_DEFS.find((d) => d.key === "next")!.label}</Th>
              )}
            </tr>
          </thead>
          <tbody>
            {total === 0 && (
              <tr>
                <td
                  colSpan={visibleColSpan}
                  className="p-12 text-center text-meta text-base-500"
                >
                  No orders in this tab.
                </td>
              </tr>
            )}
            {shown.map((o) => (
              <OrderRow
                key={o.id}
                o={o}
                partnerName={partnerName}
                availableBySku={availableBySku}
                tasks={orderTasks(o)}
                selected={selected.has(o.id)}
                onToggle={() => toggleOne(o.id)}
                onOpen={() => setOpenOrderId(o.id)}
                onFlag={openFollowUp}
                showCol={showCol}
                staffById={staffById}
                poolStaff={poolStaff}
                onAssignStaff={(orderId, staff) =>
                  assignStaffMut.mutate({ orderId, staff })
                }
                canAssign={isManager}
                hasPendingChange={pendingCROrders.has(o.id)}
                /* C1 — the row line names the real supplier, so the row needs
                   the same resolution the SUPPLIER facet uses. Null = we cannot
                   prove which supplier, and the line falls back to the role
                   word rather than to a blank. */
                supplierName={(() => {
                  const sid = primarySupplierId(o, skuMeta, suppliers);
                  return sid ? supplierNameById.get(sid) ?? null : null;
                })()}
                onNextAction={(verb) => {
                  // `Issue PO` opens the raise-PO flow, which is the only write
                  // path the portal has for creating a purchase order.
                  if (verb === orderActionQueue("issue_po"))
                    setRaisePoOrders([o]);
                  else if (verb === orderActionQueue("confirm_ready_date")) {
                    setChaseSupplierScope(null);
                    setChaseOrders([o]);
                  }
                  else setOpenOrderId(o.id);
                }}
              />
            ))}
            {/* Infinite-scroll sentinel — appends the next 30 as it nears view. */}
            {shown.length < total && (
              <tr ref={sentinelRef} aria-hidden>
                <td colSpan={visibleColSpan} className="text-center text-label text-base-400">
                  Loading more… ({shown.length} of {total})
                </td>
              </tr>
            )}
          </tbody>
        </table>
          </div>
      </ListPageShell>

      {/* Consolidated Raise-PO review (Option A cards, 0236) — from the bulk
          bar's selection or the PO-day banner's waiting set. */}
      {raisePoOrders && (
        <RaisePoReview
          orders={raisePoOrders.map(toRaisePoOrder)}
          availableBySku={availableBySku}
          onClose={() => {
            setRaisePoOrders(null);
            clearSel();
            void refetch();
          }}
        />
      )}

      {/* Confirm ready date — one WhatsApp message per supplier group over the
          selection (Remind / Call). Open to all operation (no PO-duty gate). */}
      {chaseOrders && (
        <ChaseSupplierReview
          orders={chaseOrders.map(toChaseOrder)}
          initialMode={chaseInitialMode}
          supplierScope={chaseSupplierScope}
          onClose={() => {
            setChaseOrders(null);
            clearSel();
          }}
        />
      )}

      {/* Confirm delivery date — one WhatsApp message per logistics company
          over the selection (Remind / Call). Open to all operation. */}
      {chasePartnerOrders && (
        <ChasePartnerReview
          orders={chasePartnerOrders.map(toPartnerChaseOrder)}
          partners={partnersQ.data?.partners ?? []}
          initialMode={chaseInitialMode}
          onClose={() => {
            setChasePartnerOrders(null);
            clearSel();
          }}
        />
      )}

      {/* Follow-up form — slides in from the right (#2); opened by an order's flag. */}
      {etaImportOpen && <ImportStockEtaDialog onClose={() => setEtaImportOpen(false)} />}

      {composeOrder && (
        <FollowUpForm
          orderId={composeOrder.id}
          so={composeOrder.so}
          refNo={composeOrder.refNo}
          onClose={() => setComposeOrder(null)}
        />
      )}
    </>
  );
}

/** Gmail-style bulk-action band — REPLACES the tabs row in place (via the shell's
 *  `bulkBar` slot) when ≥1 order is selected, so the left facet + the table never
 *  move. A warm flame band (token classes, no raw hex). The leading checkbox
 *  stays checked / indeterminate so you can untick in place like Gmail; when the
 *  loaded window is a subset of the tab it offers "Select all N in <tab>". Inline:
 *  Assign logistics · Flag · Export ▾ (CSV / Print / Mark delivered); ✕ clears. */
/**
 * Bulk bar — Option B (Jess 2026-07-19): grouped by COUNTERPARTY, not by verb.
 * Three chips — [📦 Supplier ⋮] [🚚 Logistics ⋮] [More] — and the two
 * counterparty menus each hold that party's actions incl. Remind / Call. The
 * gated Raise PO sits INSIDE the Supplier menu (locked for non-duty), so the bar
 * never shows a dead primary button; the shape stays 3 chips regardless of
 * permission or selection.
 */
function OrdersBulkBar({
  count,
  total,
  tabLabel,
  allChecked,
  someChecked,
  onSelectAllInTab,
  menu,
  setMenu,
  partners,
  onAssign,
  onRaisePo,
  canRaisePo,
  raisePoTitle,
  onChaseSupplier,
  onChasePartner,
  onFlag,
  onExport,
  onPrint,
  onComplete,
  onNoStorage,
  onClear,
  busy,
}: {
  count: number;
  total: number;
  tabLabel: string;
  allChecked: boolean;
  someChecked: boolean;
  onSelectAllInTab: () => void;
  menu: null | "supplier" | "logistic" | "assign" | "more";
  setMenu: (m: null | "supplier" | "logistic" | "assign" | "more") => void;
  partners: { id: string; name: string }[];
  onAssign: (partnerId: string) => void;
  onRaisePo: () => void;
  canRaisePo: boolean;
  raisePoTitle: string;
  /** Open the supplier follow-up review on the given tone (Remind / Call). */
  onChaseSupplier: (mode: "remind" | "chase") => void;
  /** Open the logistics follow-up review on the given tone (Remind / Call). */
  onChasePartner: (mode: "remind" | "chase") => void;
  onFlag: () => void;
  onExport: () => void;
  onPrint: () => void;
  onComplete: () => void;
  onNoStorage: () => void;
  onClear: () => void;
  busy: boolean;
}) {
  const chip =
    "inline-flex items-center gap-1.5 text-body px-2.5 py-1 rounded-md hover:bg-white/70 disabled:opacity-50";
  const toggle = (m: "supplier" | "logistic" | "assign" | "more") =>
    setMenu(menu === m ? null : m);
  const pop =
    "absolute left-0 top-full mt-1 z-30 w-60 bg-white text-base-900 rounded-lg shadow-lg border border-base-200 p-1 max-h-80 overflow-auto";
  return (
    <div className="flex items-center gap-2 rounded-xl border border-signature-100 bg-signature-50 px-3 py-1.5 text-base-800">
      <input
        type="checkbox"
        checked={allChecked}
        ref={(el) => {
          if (el) el.indeterminate = someChecked;
        }}
        onChange={onClear}
        aria-label="Deselect all"
        title="Deselect all"
        className="cursor-pointer accent-primary align-middle"
      />
      <span className="text-body font-semibold tabular-nums whitespace-nowrap">
        {count} selected
      </span>
      {/* Gmail cross-page select-all — only while the tab holds more. */}
      {count < total && (
        <button
          type="button"
          onClick={onSelectAllInTab}
          className="text-meta text-primary hover:underline whitespace-nowrap"
        >
          Select all {total} in {tabLabel}
        </button>
      )}
      <span className="mx-1 h-4 w-px bg-signature-100" aria-hidden />

      {/* — SUPPLIER ⋮ — the goods counterparty. Raise PO (gated) + Remind +
          Call all live here; one voice per supplier. */}
      <div className="relative">
        <button
          type="button"
          onClick={() => toggle("supplier")}
          disabled={busy}
          aria-haspopup="menu"
          aria-expanded={menu === "supplier"}
          className={chip}
        >
          <PackageOpen size={15} className="text-base-500" /> Supplier
          <MoreVertical size={13} className="text-base-400 -mr-0.5" />
        </button>
        {menu === "supplier" && (
          <div className={pop} role="menu">
            <BulkMenuItem
              icon={PackagePlus}
              label="Raise PO"
              onClick={onRaisePo}
              disabled={!canRaisePo}
              title={raisePoTitle}
              right={canRaisePo ? undefined : <Lock size={11} className="text-base-400" />}
            />
            <div className="h-px bg-base-200 my-1 mx-1.5" />
            <BulkMenuItem
              icon={Bell}
              label="Remind suppliers"
              hint="before deadline"
              onClick={() => onChaseSupplier("remind")}
            />
            <BulkMenuItem
              icon={MessageCircle}
              label="Call suppliers — confirm ready date"
              hint="overdue"
              tone="wa"
              onClick={() => onChaseSupplier("chase")}
            />
          </div>
        )}
      </div>

      {/* — LOGISTICS ⋮ — the delivery counterparty. Assign (company picker) +
          Remind + Call. */}
      <div className="relative">
        <button
          type="button"
          onClick={() => toggle("logistic")}
          disabled={busy}
          aria-haspopup="menu"
          aria-expanded={menu === "logistic"}
          className={chip}
        >
          <Truck size={15} className="text-base-500" /> Logistics
          <MoreVertical size={13} className="text-base-400 -mr-0.5" />
        </button>
        {menu === "logistic" && (
          <div className={pop} role="menu">
            <BulkMenuItem
              icon={Truck}
              label="Assign to…"
              onClick={() => setMenu("assign")}
              right={<ChevronRight size={13} className="text-base-400" />}
            />
            <div className="h-px bg-base-200 my-1 mx-1.5" />
            <BulkMenuItem
              icon={Bell}
              label="Remind logistics"
              /* Was "before收货日" — the UI is English only (PR 209). */
              hint="before the delivery day"
              onClick={() => onChasePartner("remind")}
            />
            <BulkMenuItem
              icon={MessageCircle}
              label="Call logistics — confirm delivery date"
              hint="overdue"
              tone="wa"
              onClick={() => onChasePartner("chase")}
            />
          </div>
        )}
        {menu === "assign" && (
          <div className={pop} role="menu">
            <div className="px-2 py-1.5 text-label uppercase tracking-[0.08em] text-base-400">
              Assign to…
            </div>
            {partners.length === 0 && (
              <div className="px-2 py-1.5 text-meta text-base-400">
                No logistics companies on file. Ask a manager to add one.
              </div>
            )}
            {partners.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => onAssign(p.id)}
                className="w-full text-left px-2 py-1.5 text-meta rounded hover:bg-hovertint"
              >
                {p.name}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* — More — utility (Flag · Export · Print · Mark delivered · No storage). */}
      <div className="relative">
        <button
          type="button"
          onClick={() => toggle("more")}
          disabled={busy}
          aria-haspopup="menu"
          aria-expanded={menu === "more"}
          className={chip}
        >
          <MoreHorizontal size={15} className="text-base-500" /> More
        </button>
        {menu === "more" && (
          <div className={pop} role="menu">
            <BulkMenuItem icon={Flag} label="Flag for follow-up" onClick={onFlag} />
            <BulkMenuItem icon={Download} label="Export CSV" onClick={onExport} />
            <BulkMenuItem icon={Printer} label="Print / Save as PDF" onClick={onPrint} />
            <div className="h-px bg-base-200 my-1 mx-1.5" />
            <BulkMenuItem
              icon={CheckCircle2}
              label={busy ? "Working…" : "Mark delivered"}
              onClick={onComplete}
            />
            <BulkMenuItem
              icon={Warehouse}
              label="No storage (exempt fee)"
              onClick={onNoStorage}
            />
          </div>
        )}
      </div>

      <button
        type="button"
        onClick={onClear}
        aria-label="Clear selection"
        title="Clear selection"
        className="ml-auto inline-flex items-center gap-1 text-body text-base-500 hover:text-base-900"
      >
        <X size={15} />
      </button>
    </div>
  );
}

function BulkMenuItem({
  icon: Icon,
  label,
  hint,
  onClick,
  disabled,
  title,
  right,
  tone,
}: {
  icon: LucideIcon;
  label: string;
  /** Faint trailing context (e.g. "overdue"). */
  hint?: string;
  onClick: () => void;
  disabled?: boolean;
  title?: string;
  /** Trailing node (lock, chevron). */
  right?: ReactNode;
  /** "wa" tints the leading icon WhatsApp-green (Chase); default = grey. */
  tone?: "wa";
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      role="menuitem"
      className="w-full flex items-center gap-2 px-2 py-2 text-meta rounded hover:bg-hovertint disabled:opacity-45 disabled:hover:bg-transparent"
    >
      <Icon
        size={14}
        className={tone === "wa" ? "text-[#25D366]" : "text-base-500"}
      />
      <span>{label}</span>
      {hint && <span className="text-label text-base-400">{hint}</span>}
      {right && <span className="ml-auto flex items-center">{right}</span>}
    </button>
  );
}

/** Gmail-minimal filter ROW (Loo GMAIL_FINAL) — pure text: name LEFT / count
 *  RIGHT, no icon / dot / pill / box. Normal = grey-black; SELECTED = a light
 *  blue pill (#D3E3FD) with black-bold text (name + count); hover = a faint
 *  grey. The kanban's ONLY colour is this selection blue. */
function KanbanRow({
  label,
  count,
  active,
  onClick,
  title,
  valueText,
  tone,
  chip,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
  title?: string;
  /** Override the count display (e.g. the Owing queue shows RM, not a count). */
  valueText?: string;
  /** Queue severity colour on the value (B rebuild): danger red · warning amber. */
  tone?: "danger" | "warning";
  /** Owner adornment between label and value (B+C 2026-07-19): the duty
   *  holder's avatar on the goods queues, a grey PIC tag on the PIC queues. */
  chip?: ReactNode;
}) {
  const valueColor = active
    ? "#0B0B0B"
    : tone === "danger"
      ? "#A32D2D"
      : tone === "warning"
        ? "#854F0B"
        : "#5F6368";
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-pressed={active}
      className={`w-full flex items-center gap-1.5 rounded-full text-left transition-colors ${
        active ? "" : "hover:bg-hovertint"
      }`}
      style={{ padding: "6px 10px", backgroundColor: active ? "#C2E7FF" : undefined }}
    >
      {/* Owner chip LEADS the row (Jess 2026-07-19: "icon at front, avoid all
          at number there") — identity first, the count column stays clean. */}
      {chip}
      <span
        className="flex-1 min-w-0 truncate text-body"
        style={{ color: active ? "#0B0B0B" : "#3C4043", fontWeight: active ? 700 : 400 }}
      >
        {label}
      </span>
      <span
        className="text-body tabular-nums shrink-0"
        style={{ color: valueColor, fontWeight: active || tone ? 700 : 400 }}
      >
        {valueText ?? count}
      </span>
    </button>
  );
}

/** Gmail-minimal filter GROUP (Loo GMAIL_FINAL, C3) — a light-grey TITLE BAR
 *  (`.section-band`, v4 neutral grey) with the group total on the right + a
 *  collapse toggle (▾ open / ▸ collapsed). CHASE NOW's title reads v4 red;
 *  titles are the v4 LABEL. `testid` keeps `filter-logistic` addressable. */
function KanbanGroup({
  title,
  danger,
  total,
  collapsed,
  onToggle,
  testid,
  headerRight,
  children,
}: {
  title: string;
  danger?: boolean;
  /** Group total shown on the right of the title bar; omit to hide it (CATEGORY
   *  overlaps across orders, so its sum would exceed the order count → hidden). */
  total?: number;
  collapsed: boolean;
  onToggle: () => void;
  testid?: string;
  /** Extra control pinned to the right of the cream title bar (e.g. the SUMMARY
   *  row's whole-panel collapse ‹). Rendered OUTSIDE the toggle button so it's a
   *  sibling, never a button-in-button. */
  headerRight?: React.ReactNode;
  children: React.ReactNode;
}) {
  // The cream band is THE shared <SectionBand> (components/SectionPanel.tsx) —
  // the order drawer's panels render the exact same component, so list + drawer
  // stay 1:1 by construction (Jess 2026-07-13). Tokens: .section-band* in
  // index.css, recorded in design-standard.ts COLOR.sectionBand.
  return (
    <div data-testid={testid} className="mb-1">
      {/* strong = a step-darker band (base-200) so the Orders-list facet groups
          actually separate on the white rail (Jess 2026-07-19: #F9FAFB→#F3F4F6
          was still invisible). The shared order-drawer bands don't pass it, so
          they're unaffected. */}
      <SectionBand
        title={title}
        danger={danger}
        collapsed={collapsed}
        onToggle={onToggle}
        total={total}
        right={headerRight}
        strong
      />
      {!collapsed && <div className="flex flex-col gap-0.5 mt-0.5">{children}</div>}
    </div>
  );
}

/** PIC tab chip — the right-side per-person tabs above the table (Jess
 *  2026-07-18). Mirrors the left TEAM rows: same staffFilter, blue =
 *  selection. */
function StaffChip({
  label,
  count,
  active,
  onClick,
  avatar,
  title,
}: {
  /** Omitted on member chips (Jess: the avatar IS the identity — "SH no
   *  need to show shasha"); the full name lives in the tooltip. */
  label?: string;
  count: number;
  active: boolean;
  onClick: () => void;
  avatar?: { text: string; bg: string; fg: string };
  title?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-pressed={active}
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-meta whitespace-nowrap transition-colors ${
        active
          ? "border-transparent font-semibold text-[#0B0B0B]"
          : "border-base-200 bg-white text-base-700 hover:bg-hovertint hover:border-base-300"
      }`}
      style={active ? { backgroundColor: "#C2E7FF" } : undefined}
    >
      {avatar && (
        <span
          className="w-[18px] h-[18px] rounded-full flex items-center justify-center text-label font-semibold leading-none shrink-0"
          style={{ background: avatar.bg, color: avatar.fg }}
        >
          {avatar.text}
        </span>
      )}
      {label}
      <span className="tabular-nums text-label text-base-500">{count}</span>
    </button>
  );
}

/** Team popover (0232) — the ⚙ on the STAFF band. Lists every ACTIVE operation
 *  account: [Add] opts one into the auto-assign pool; pool members get an
 *  "away" toggle (MC/leave — new orders skip them) + [Remove] + a one-click
 *  [Shift N] that redistributes their open orders to the other available
 *  members. Everything here is pool mechanics — visibility never changes. */
function TeamPopover({
  staff,
  openCounts,
  onRedistribute,
}: {
  staff: OpsStaffMember[];
  openCounts: Map<string, number>;
  onRedistribute: (userId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  // FIXED positioning: the facet column is an overflow-auto scroller, so an
  // absolutely-positioned panel gets clipped at its edge — anchor to the
  // viewport off the button rect instead.
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const qc = useQueryClient();
  const mut = useUpdateStaffSetting({
    onError: (e) => toast.error(`Team update failed — ${e.message}`),
    // Any pool change re-splits IMMEDIATELY (Jess round-2: never wait for a
    // login) — Add Li Ching tonight, she owns her share tonight.
    onSuccess: () => {
      void apiFetch<{ assigned: number }>(`/api/operation/staff/auto-assign`, {
        method: "POST",
      })
        .then((r) => {
          if (r.assigned > 0)
            toast.success(
              `Re-split ${r.assigned} order${r.assigned === 1 ? "" : "s"}`,
            );
        })
        .catch(() => {})
        .finally(() => {
          void qc.invalidateQueries({ queryKey: ["operation", "orders"] });
        });
    },
  });
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);
  return (
    <div ref={ref} onClick={(e) => e.stopPropagation()}>
      <button
        type="button"
        aria-label="Manage team"
        title="Manage team — who receives auto-assigned orders"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          setPos({
            top: r.bottom + 4,
            left: Math.max(8, Math.min(r.left, window.innerWidth - 296)),
          });
          setOpen((v) => !v);
        }}
        className="p-0.5 rounded text-base-500 hover:text-base-800 hover:bg-hovertint"
      >
        <Users size={14} strokeWidth={2} />
      </button>
      {open && pos && (
        <div
          className="fixed z-40 w-72 bg-card text-card-foreground border border-base-200 rounded-md shadow-lg py-1"
          style={{ top: pos.top, left: pos.left }}
        >
          <div className="text-label uppercase tracking-[0.05em] text-base-500 px-3 pt-1 pb-1.5">
            Auto-assign pool
          </div>
          {staff.map((s) => (
            <div
              key={s.user_id}
              className="flex items-center gap-2 px-3 py-1.5 hover:bg-hovertint"
            >
              <div className="flex-1 min-w-0">
                <div className="text-body text-base-900 truncate">
                  {staffLabel(s)}
                  {s.pooled && !s.available && (
                    <span className="text-label text-base-500"> · away</span>
                  )}
                </div>
                <div className="text-label text-base-500 truncate">
                  {s.email}
                  {s.pooled &&
                    (seenTodayMYT(s.last_seen_at) ? " · in today" : " · not in yet")}
                </div>
              </div>
              {!s.pooled ? (
                /* Round-4: joining is AUTOMATIC on first login — the button
                   is only an optional head-start (deals her a share today). */
                <button
                  type="button"
                  className="btn-ghost text-label py-0.5 px-2 text-base-500"
                  disabled={mut.isPending}
                  title="She joins automatically the first time she logs in — click only to deal her a share before that"
                  onClick={() => mut.mutate({ userId: s.user_id, pooled: true })}
                >
                  joins on first login
                </button>
              ) : (
                <>
                  <label
                    className="flex items-center gap-1 text-label text-base-600 cursor-pointer"
                    title="Planned leave — orders shift to the others while checked (day-to-day MC is automatic, no click needed)"
                  >
                    <input
                      type="checkbox"
                      checked={!s.available}
                      disabled={mut.isPending}
                      onChange={() =>
                        mut.mutate({
                          userId: s.user_id,
                          pooled: true,
                          available: !s.available ? true : false,
                        })
                      }
                    />
                    away
                  </label>
                  {(openCounts.get(s.user_id) ?? 0) > 0 && (
                    <button
                      type="button"
                      className="btn-ghost text-label py-0.5 px-1.5"
                      title="Shift all their open orders to the other available staff"
                      onClick={() => onRedistribute(s.user_id)}
                    >
                      Shift {openCounts.get(s.user_id)}
                    </button>
                  )}
                </>
              )}
            </div>
          ))}
          <div className="text-label uppercase tracking-[0.05em] text-base-400 px-3 pt-1.5 pb-1">
            New staff join automatically on their first login. No-show after
            10:00 → their orders shift for the day. Leaving staff → disable
            the account (Principal · Accounts).
          </div>
        </div>
      )}
    </div>
  );
}

/** Status pipeline TABS (P2 H) — Gmail Primary/Social-style horizontal tabs at
 *  the top of the LIST. Keeps `data-testid="filter-status"` + button names
 *  (label + count) so the status-filter tests resolve. Active = ink label +
 *  ink underline. */
function StatusTabs({
  tabs,
  active,
  onSelect,
}: {
  tabs: { key: ControlTab; label: string; count: number; title?: string }[];
  active: ControlTab;
  onSelect: (k: ControlTab) => void;
}) {
  // v4 §9 (LOCKED, sample type 2): icon + label + count chip; active = ink +
  // a 2px dark underline; inactive = mid-grey. No pill-buttons, no boxes.
  const TAB_ICON: Record<ControlTab, LucideIcon> = {
    all: LayoutGrid,
    placed: Inbox,
    proceed: PackageOpen,
    pending: Clock,
    scheduled: Truck,
    completed: CheckCircle2,
  };
  return (
    /* ONE line always (Jess 2026-07-18: Delivered wrapped to a 2nd row on
       MacBook) — no wrap; tab icons only show on wide desktops so the six
       tabs + the import cluster fit ~1000px content width (§0 rule 11). */
    <div
      data-testid="filter-status"
      /* overflow-x scroll = the below-MacBook fallback: tabs stay reachable
         on a squeezed window instead of clipping Delivered off the row. */
      className="flex items-center gap-0.5 flex-nowrap min-w-0 overflow-x-auto no-scrollbar"
    >
      {tabs.map((t) => {
        const on = active === t.key;
        const Icon = TAB_ICON[t.key];
        return (
          <button
            key={t.key}
            type="button"
            onClick={() => onSelect(t.key)}
            title={t.title}
            className={`inline-flex items-center gap-1.5 px-2 pt-1.5 pb-1 border-b-2 transition-colors text-body whitespace-nowrap ${
              on
                ? "border-foreground text-foreground font-semibold"
                : "border-transparent text-base-500 font-medium hover:text-base-800"
            }`}
          >
            <Icon
              size={16}
              strokeWidth={2}
              className="shrink-0 hidden min-[1600px]:inline"
              aria-hidden="true"
            />
            {t.label}
            <span
              className={`tabular-nums text-label px-1.5 rounded-full ${
                on ? "bg-base-200 text-base-700" : "bg-base-100 text-base-500"
              }`}
            >
              {t.count}
            </span>
          </button>
        );
      })}
    </div>
  );
}


/** Owner chip (0232) — 20px initials avatar on every row; hollow when
 *  unassigned. Click = reassign popover (management only). Identity colour,
 *  never status colour. */
function OwnerChip({
  o,
  staffById,
  poolStaff,
  onAssignStaff,
  canEdit,
}: {
  o: operationOrderListRow;
  staffById: Map<string, OpsStaffMember>;
  poolStaff: OpsStaffMember[];
  onAssignStaff: (orderId: string, staff: string | null) => void;
  /** Management only (Jess 2026-07-18) — staff see the avatar read-only. */
  canEdit: boolean;
}) {
  const [open, setOpen] = useState(false);
  // FIXED positioning — the table lives in an overflow-auto scroller, so an
  // absolute menu would clip at the container edge (esp. bottom rows).
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);
  const owner = ownerOf(o);
  const member = owner ? staffById.get(owner) : undefined;
  // No pool at all (feature dormant) → render nothing.
  if (poolStaff.length === 0 && !member) return null;
  const av = member ? avatarColor(member.user_id) : null;
  // Staff = read-only avatar (identity + tooltip, no menu).
  if (!canEdit) {
    return member ? (
      <span
        className="shrink-0 w-[20px] h-[20px] rounded-full flex items-center justify-center text-label font-semibold leading-none"
        style={{ background: av!.bg, color: av!.fg }}
        title={`PIC: ${member.name ?? member.email}`}
        aria-label={`Assigned to ${staffLabel(member)}`}
      >
        {staffInitials(member)}
      </span>
    ) : (
      <span
        className="shrink-0 w-[20px] h-[20px] rounded-full border border-dashed border-base-300 flex items-center justify-center text-label text-base-300 leading-none"
        title="No PIC yet"
      >
        —
      </span>
    );
  }
  return (
    <div className="shrink-0" ref={ref} onClick={(e) => e.stopPropagation()}>
      <button
        type="button"
        aria-label={member ? `Assigned to ${staffLabel(member)}` : "Assign PIC"}
        title={
          member
            ? `PIC: ${member.name ?? member.email} — click to reassign`
            : "No PIC — click to assign"
        }
        onClick={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          setPos({
            top: Math.min(r.bottom + 4, window.innerHeight - 240),
            left: Math.max(8, Math.min(r.left, window.innerWidth - 184)),
          });
          setOpen((v) => !v);
        }}
        className={`w-[20px] h-[20px] rounded-full flex items-center justify-center text-label font-semibold leading-none ${
          member
            ? "hover:ring-2 hover:ring-base-300"
            : "border border-dashed border-base-300 text-base-300 hover:border-base-500 hover:text-base-500"
        }`}
        style={member ? { background: av!.bg, color: av!.fg } : undefined}
      >
        {member ? staffInitials(member) : "+"}
      </button>
      {open && pos && (
        <div
          className="fixed z-40 w-44 bg-card text-card-foreground border border-base-200 rounded-md shadow-lg py-1"
          style={{ top: pos.top, left: pos.left }}
        >
          {poolStaff.map((s) => (
            <button
              key={s.user_id}
              type="button"
              className={`w-full text-left px-3 py-1.5 text-body hover:bg-hovertint ${
                s.user_id === owner ? "font-semibold text-base-900" : "text-base-700"
              }`}
              onClick={() => {
                setOpen(false);
                if (s.user_id !== owner) onAssignStaff(o.id, s.user_id);
              }}
            >
              {staffLabel(s)}
              {!s.available && <span className="t4-caption"> · away</span>}
            </button>
          ))}
          {owner && (
            <button
              type="button"
              className="w-full text-left px-3 py-1.5 text-body text-base-500 hover:bg-hovertint border-t border-base-100"
              onClick={() => {
                setOpen(false);
                onAssignStaff(o.id, null);
              }}
            >
              Clear PIC
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function OrderRow({
  o,
  partnerName,
  availableBySku,
  tasks,
  selected,
  onToggle,
  onOpen,
  onFlag,
  showCol,
  staffById,
  poolStaff,
  onAssignStaff,
  canAssign,
  hasPendingChange,
  supplierName,
  onNextAction,
}: {
  o: operationOrderListRow;
  partnerName: Map<string, string>;
  availableBySku?: Map<string, number>;
  /** Open follow-up ops_tasks for this order (#2) — drives the flag + Action cell. */
  tasks: OpsTask[];
  selected: boolean;
  onToggle: () => void;
  onOpen: () => void;
  /** Open the side follow-up form for this order (#2). */
  onFlag: (o: operationOrderListRow) => void;
  /** Column visibility predicate (Columns show/hide) — gates the 8 data cells. */
  showCol: (key: string) => boolean;
  /** Staff pool (0232) — owner-chip lookup + the reassign popover options. */
  staffById: Map<string, OpsStaffMember>;
  poolStaff: OpsStaffMember[];
  onAssignStaff: (orderId: string, staff: string | null) => void;
  /** Management-only manual assignment (Jess 2026-07-18). */
  canAssign: boolean;
  /** 0234 (add-product P3.1) — a dealer product change awaits approval. */
  hasPendingChange?: boolean;
  /** C1 — the order's primary supplier NAME, so the action line can say
   *  "Call Ohana — confirm ready date". Null → the role word "supplier". */
  supplierName?: string | null;
  /** One-click action (2026-07-19) — the row's action QUEUE word, clicked = act
   *  on it. The queue word, not the row line: the handler branches on it. */
  onNextAction: (verb: string) => void;
}) {
  const ref = (o.source_ref ?? []).filter(Boolean);
  const lines = o.order_lines ?? [];
  const stock = stockReadiness(o, availableBySku);
  const se = stockEtaOf(o);
  const loc = locationForAddress(o.customer_address ?? null);
  const msQty = catQty(lines, "mattress");
  const bfQty = catQty(lines, "bedframe");
  const sofaQty = catQty(lines, "sofa");

  const logi = logisticStateOf(o, partnerName);
  const completed = controlTabOf(o) === "completed";

  return (
    <tr
      onClick={onOpen}
      className={`group border-t border-[rgba(34,31,32,0.06)] cursor-pointer align-middle ${
        selected ? "bg-[#e6f1fb]" : "bg-white hover:bg-hovertint"
      }`}
      data-testid="order-row"
    >
      <td className="pl-3 pr-0.5 py-2" onClick={(e) => e.stopPropagation()}>
        <input
          type="checkbox"
          checked={selected}
          onChange={onToggle}
          aria-label={`Select SO-${o.so}`}
          /* v4 §8b — 17px checkbox: registers by shape before reading. */
          className="cursor-pointer accent-base-900 align-middle w-[17px] h-[17px]"
        />
      </td>
      {/* Follow-up — the order's STATUS flag (#2), 2nd column (Jess: left, not a
          separate empty column). Click opens the side form. */}
      <ActionCell order={o} tasks={tasks} onFlag={onFlag} />
      {/* Status (Jess 2026-07-19): the pipeline STAGE in words — same vocabulary
          as the tabs (Placed → Proceed → To book → Customer confirmed →
          Delivered), read from TAB_LABEL so the two can never drift. A quiet
          .pill for the live stages; a muted "Delivered" (no pill) once done. */}
      {showCol("dots") && (
      <td className="pl-2 pr-1">
        {/* C10 (Jess 2026-07-27): the stage pill and the three dots SIDE BY
            SIDE — they answer different questions and neither replaces the
            other. The pill is byte-identical to before this card; the dots are
            new. The pill takes the slack and truncates on a narrow screen; the
            dots are fixed-width and never squeezed out. */}
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="min-w-0 truncate">
            {completed ? (
              <span className="text-meta text-base-400">Delivered</span>
            ) : (
              (() => {
                const label = TAB_LABEL[controlTabOf(o, availableBySku)];
                // ONE shared status→pill map (no per-surface hand-roll).
                return <span className={`pill ${orderStatusPill(label)}`}>{label}</span>;
              })()
            )}
          </span>
          <RowDots o={o} stock={stock} se={se} logi={logi} />
        </div>
      </td>
      )}
      {/* Order — SO number (emphasis line) + the day-to-day Ref(s) on the
          caption line ("+N" folds extras; full list in the tooltip). Phone
          tooltip kept on the cell. */}
      {showCol("order") && (
      <td className="pl-1 pr-1" title={o.customer_phone ?? undefined}>
        <div style={{ lineHeight: "15px" }}>
          <div
            className="font-mono tabular-nums truncate"
            style={{ fontSize: "13px", fontWeight: 600, color: "#1A1A1A" }}
          >
            SO-{o.so}
            {/* 0234 (merged from main) — a dealer product change awaits
                approval; open the order → the approval card tops the drawer. */}
            {hasPendingChange && (
              <span
                className="ml-1 inline-block align-middle rounded-full px-1.5 py-0.5 text-label font-semibold bg-warning-soft text-base-800 border border-warning"
                title="Product change awaiting approval — open the order to decide"
                data-testid="oc-change-badge"
              >
                Change
              </span>
            )}
          </div>
          {ref.length > 0 && (
            <div
              className="font-mono tabular-nums truncate t4-caption"
              title={ref.join("\n")}
            >
              {ref[0]}
              {ref.length > 1 ? ` +${ref.length - 1}` : ""}
            </div>
          )}
        </div>
      </td>
      )}
      {/* Customer — name (emphasis) + region on the caption line; the
          outstation warning survives in the tooltip. */}
      {showCol("customer") && (
      <td className="pl-1 pr-2">
        <div style={{ lineHeight: "15px" }}>
          {o.customer_name ? (
            <div
              className={`${cjkClassName(o.customer_name)} t4-row-strong truncate`}
              title={o.customer_name}
            >
              {o.customer_name}
            </div>
          ) : (
            <div className="text-base-300">—</div>
          )}
          <div
            className="t4-caption truncate"
            title={
              loc.area === "Outstation"
                ? "Outstation — no warehouse buffer; call the customer to confirm the ETA before ordering stock (do it in the order drawer)."
                : loc.label ?? undefined
            }
          >
            {loc.label ?? "—"}
          </div>
        </div>
      </td>
      )}
      {/* Deadline — date + days-left heat pill, OPEN orders only. A delivered
          order NEVER alarms (guardrail #2): muted date, no pill. */}
      {showCol("deadline") && (
      <td
        className="pl-1 pr-2 leading-[1.2]"
        title="Customer's requested delivery date + days left. Stock at the warehouse 7 days before; logistic contacts the customer 2–3 days before."
      >
        {completed ? (
          o.delivery_date ? (
            <span className="tabular-nums" style={{ fontSize: "12px", color: "#A8A8A8" }}>
              {fmtDate(o.delivery_date)}
            </span>
          ) : (
            <span className="text-base-300">—</span>
          )
        ) : o.delivery_date_tbd ? (
          <span className="text-label font-medium" style={{ color: "#A8A8A8" }}>TBD</span>
        ) : o.delivery_date ? (
          (() => {
            const datePart = fmtDate(o.delivery_date);
            // Reuse the SAME DUE bucket as the top filter header so they can never
            // drift: the date turns red on the two hottest tiers (Overdue / Urgent).
            const dd = daysToDue(o);
            const pillText =
              dd == null ? null : dd < 0 ? "over" : dd === 0 ? "today" : `${dd}d`;
            // Countdown heat (Loo 2026-07-09): a 4-level ramp by days-left so 2–6d
            // read as orange / yellow urgency; only 7d+ goes grey. The DATE text
            // stays clear black — only this pill carries the heat.
            // v4 hues (ramp SEMANTICS unchanged — Loo-locked 4 tiers; only the
            // fills moved onto the kit's red/amber family + neutral grey).
            const heat =
              dd == null || dd <= 1
                ? { bg: "#FCEBEB", fg: "#A32D2D" } // overdue / today / 1d — red
                : dd <= 3
                  ? { bg: "#FAEEDA", fg: "#854F0B" } // 2–3d — amber
                  : dd <= 6
                    ? { bg: "#FEF7CD", fg: "#854D0E" } // 4–6d — light amber
                    : { bg: "#F3F4F6", fg: "#6B7280" }; // 7d+ — neutral grey
            return (
              <div className="flex items-center gap-1.5">
                {/* Badge FIRST (Loo round 3), fixed min-width so today/1d/2d/over
                    are all the same width → the dates after them line up. */}
                {pillText && (
                  <span
                    className="tabular-nums shrink-0 text-center"
                    style={{
                      fontSize: "11px",
                      color: heat.fg,
                      background: heat.bg,
                      padding: "0 4px",
                      borderRadius: "999px",
                      minWidth: "34px",
                      display: "inline-block",
                    }}
                  >
                    {pillText}
                  </span>
                )}
                {/* Closed set: the date is row EMPHASIS — clear dark ink. */}
                <span className="tabular-nums t4-row-strong">{datePart}</span>
              </div>
            );
          })()
        ) : (
          <span className="text-base-300">—</span>
        )}
      </td>
      )}
      {/* Stock — facts only (n/m ratio + sub word / supplier ETA); the 货 dot
          carries the colour. */}
      {showCol("stock") && (
      <td className="pl-1 pr-2">
        <StockDot info={stock} coreTotal={msQty + bfQty + sofaQty} se={se} />
      </td>
      )}
      {/* Delivery — the logistics company + the T1 booking truth (0277). C1
          (Jess 2026-07-27) struck the last gap-word: `need booking` hid a to-do
          inside a fact ("need" = the reader still has to work out what to do),
          so the sub-line is now the ACTION that closes the gap —
          `{logistics} — confirm delivery date`. Green `27 Jul · 12pm–3pm` ONLY
          on the customer's confirmation; amber `logistics said 27 Jul` while
          only their provisional date exists. Same vocabulary as the drawer. */}
      {showCol("delivery") && (
      <td className="pl-1 pr-2">
        {logi.key === "unassigned" ? (
          <span className="t4-caption">No logistics picked</span>
        ) : (
          <div style={{ lineHeight: "15px" }}>
            <div className="t4-row-strong truncate">{logi.partner}</div>
            {logi.key === "delivered" ? (
              <div style={{ fontSize: "11px", fontWeight: 600, color: "#3B6D11" }}>
                Delivered ✓
              </div>
            ) : logi.key === "confirmed" && logi.date ? (
              <div
                className="tabular-nums"
                style={{ fontSize: "11px", fontWeight: 600, color: "#3B6D11" }}
              >
                {dayMon(logi.date)}
                {logi.slot ? ` · ${shortSlot(logi.slot)}` : ""}
              </div>
            ) : logi.key === "provisional" && logi.date ? (
              <div
                className="tabular-nums text-warning"
                style={{ fontSize: "11px", fontWeight: 600 }}
              >
                logistics said {dayMon(logi.date)}
              </div>
            ) : (
              (() => {
                // A FACT slot, so the action WITHOUT its verb — the neighbours
                // in this cell are facts too (COPY-STANDARD's audit table).
                const fact = deliveryDateGapFact(logi.partner);
                return (
                  <div className="t4-caption truncate" title={fact}>
                    {fact}
                  </div>
                );
              })()
            )}
          </div>
        )}
      </td>
      )}
      {/* PIC — the staff owner, own column (Jess 2026-07-18): initials chip,
          click = reassign. Word law: PIC (the team's Issue-Tracker word). */}
      {showCol("pic") && (
      <td className="pl-1 pr-1">
        <OwnerChip
          o={o}
          staffById={staffById}
          poolStaff={poolStaff}
          onAssignStaff={onAssignStaff}
          canEdit={canAssign}
        />
      </td>
      )}
      {/* ACTIONS — the whole truth (C3, Jess 2026-07-27): the top action from
          Layer 2, with the party NAMED (C1), plus `+N` when more are open. The
          pill reads the row LINE (`Call NETS — confirm delivery date`); the
          QUEUE word behind it (`Confirm delivery date`) is what the facet rail
          and the counts use, and `data-next-action` keeps carrying that stable
          word. One-click act (2026-07-19): the whole row opens the drawer, so
          the pill itself is the button that acts on the order. */}
      {showCol("next") && (
      <td className="pl-2 pr-2">
        {(() => {
          // Delivered = closed → Actions is a next-action column, and a closed
          // order has no action, so the cell is BLANK (Jess 2026-07-19: STATUS
          // already says "Delivered"; a "Done" pill is redundant — and would be
          // wrong if a 2nd delivery were still outstanding, which keeps the
          // order in-pipeline, not Delivered).
          // TWO exceptions, and both are actions a delivered order genuinely
          // still owes, so their pill DOES show — only "Done" blanks the cell:
          // T7's "Upload delivery photo" (no photo on file) and, since C2,
          // "Collect RM …" — money is its own track and it SURVIVES delivery
          // (ORDERS-WORKING-FLOW §3). Delivered is not paid.
          const na = nextActionOf(o, stock, lines);
          if (!na.label) return null;
          if (completed && na.key === "done") return null;
          const m = moneyOf(o);
          const parties = {
            supplier: supplierName,
            logistics: logi.partner,
            customer: o.customer_name,
            amount: m.known ? fmtRM(m.outstanding) : null,
            // C3 — the fact's own two values, already formatted; the words
            // module owns the sentence and never a date (see below: this cell
            // prints the SHORT form, so they only reach the tooltip).
            deliveryDate: logi.date ? dayMon(logi.date) : null,
            deliverySlot: logi.slot ? shortSlot(logi.slot) : null,
          };
          // C3 — the FACT that replaced `Confirm delivery with {customer}`:
          // everything is arranged and the day has not come, so there is
          // nothing to do and nothing to click. Quiet grey, never a pill: a
          // pill in this column is a button, and a fact is not one.
          //
          // WHICH FORM: the short one. The Delivery cell immediately to the
          // left already prints `27 Jul · 12pm–3pm`, so the full
          // `Delivering 27 Jul · 12pm–3pm` would say the same thing twice in
          // adjacent columns — the trap C1 hit in the delivery badge and solved
          // by dropping the verb. Here the duplicated half is the DATE, so the
          // cell keeps the word and the tooltip carries the day. The full
          // sentence still ships, in the drawer's journey strip, where nothing
          // else on screen says it.
          if (na.key === "delivering") {
            const full = orderActionLine("delivering", parties);
            return (
              <span
                className="t4-caption truncate block"
                data-next-action={na.label}
                title={
                  full === "Delivering"
                    ? "Goods in, logistics booked, the customer confirmed the day. Nothing to do until then."
                    : `Goods in, logistics booked. Nothing to do until ${full.replace(/^Delivering /, "")}.`
                }
              >
                {na.label}
              </span>
            );
          }
          // C2/C3: money is its own track, so `collect` can BE the headline —
          // on a delivered order that still owes, or on one whose delivery is
          // held for the balance, it is the only action left. The amount rides
          // the line then, or the pill reads "Collect from John Tan" and names
          // no figure. C5: the figure comes from the shared money rule, so the
          // pill, the 🔒 and the Owing facet can never disagree.
          const line = orderActionLine(na.key, parties);
          // C3 — everything else that is open, folded into ONE `+N`. It
          // replaces the old secondary `Collect RM …` pill: a cell may have
          // exactly one way of saying "there is more", and the `+N` covers all
          // three tracks where the money pill covered one (and, since Law 4,
          // money is the one that displays LAST). The count is
          // `open.length − 1` by construction, so the drawer opened by this row
          // shows exactly `1 + N` rows — it is the same computation.
          const open = openActionsOf(o, stock, lines);
          const more = open.slice(1);
          return (
            <div className="flex items-center gap-1.5 max-w-full">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onNextAction(na.label);
                }}
                className={`pill ${NEXT_PILL_CLASS[na.tone]} inline-flex items-center gap-1 min-w-0 hover:brightness-95`}
                data-next-action={na.label}
                title={`${line} — click to act`}
              >
                {na.locked && <Lock size={11} strokeWidth={2.5} className="shrink-0" aria-hidden="true" />}
                <span className="truncate min-w-0">{line}</span>
              </button>
              {more.length > 0 && (
                <button
                  type="button"
                  data-testid="next-more"
                  onClick={(e) => {
                    e.stopPropagation();
                    onOpen();
                  }}
                  className="shrink-0 tabular-nums text-meta font-semibold text-base-500 hover:text-base-900"
                  title={`Also open: ${more
                    .map((a) => orderActionLine(a.key, parties))
                    .join(" · ")} — click to see them all`}
                >
                  +{more.length}
                </button>
              )}
            </div>
          );
        })()}
      </td>
      )}
    </tr>
  );
}

/** Action cell (#2) — the order's follow-up FLAG, STATUS ONLY (no name, Jess
 *  2026-06-26). Empty → faint "Flag". Open + on time → amber flag, no word.
 *  Overdue → red flag + "Late" (the one short word — colour-blind safe). Click →
 *  opens the side follow-up form. Who / what / Take-it / Done live in the form +
 *  the right-rail Tasks board (the side menu everyone sees). */
function ActionCell({
  order,
  tasks,
  onFlag,
}: {
  order: operationOrderListRow;
  tasks: OpsTask[];
  onFlag: (o: operationOrderListRow) => void;
}) {
  const lead = openTaskOf(tasks);
  const u = lead ? taskUrgency(lead) : null;
  return (
    <td className="px-0.5 py-2 align-middle text-center" onClick={(e) => e.stopPropagation()}>
      {/* Icon-only follow-up flag (Jess 2026-06-29): no "Flag" / "Late" text — the
          colour carries the state so the column stays narrow + scannable.
          faint = none · amber = open · red = overdue. */}
      <button
        type="button"
        onClick={() => onFlag(order)}
        title={
          !lead
            ? "Flag for follow-up"
            : u === "overdue"
              ? "Follow-up overdue"
              : "Follow-up open"
        }
        aria-label={!lead ? "Flag for follow-up" : u === "overdue" ? "Follow-up overdue" : "Follow-up open"}
        className="inline-flex"
      >
        {!lead ? (
          <Flag size={15} strokeWidth={2} className="text-base-300 hover:text-base-800" />
        ) : u === "overdue" ? (
          <Flag size={15} strokeWidth={2.5} className="fill-current text-danger" />
        ) : (
          /* Open follow-up = amber STATUS — v4 amber ink. */
          <Flag size={15} strokeWidth={2} className="fill-current" style={{ color: "#854F0B" }} />
        )}
      </button>
    </td>
  );
}

/** Stock cell (C rebuild §14) — FACTS only, two lines: the CORE arrival ratio
 *  `n/m` (emphasis) + a grey sub-line (Ready / No PO / supplier ETA). The 货
 *  dot owns the colour — this cell stays ink/grey (the old Ready/Waiting/No-PO
 *  pill + the red/amber ETA line are gone). Denominator = Mattress+Bedframe+
 *  Sofa unit total (accessories don't gate delivery). `data-stock-state` /
 *  `data-stock-eta` kept verbatim for the tests. */
function StockDot({
  info,
  coreTotal,
  se,
}: {
  info: StockInfo;
  coreTotal: number;
  se: StockEta;
}) {
  let key: "ready" | "waiting" | "no_po";
  let title: string;
  // The imported per-line status is authoritative for "all in" — when it says
  // every line is ready, show Ready (no ETA noise), even where the free-balance
  // heuristic can't confirm it (AutoCount free-text SKUs never match a catalog
  // SKU, so the heuristic alone would read "No PO" forever).
  if (se.state === "ready") {
    key = "ready";
    title = "All lines marked in-stock (imported)";
  } else {
    switch (info.state) {
      case "ready":
      case "in_stock":
        key = "ready";
        title = "All core stock secured for this order";
        break;
      case "unknown":
        key = "no_po";
        title = "No PO raised yet — open the order to reserve stock or raise a PO";
        break;
      default: // awaiting / need_po → Waiting (Partial merged in)
        key = "waiting";
        title = "Core stock not all in yet — PO open / awaiting arrival";
        break;
    }
  }
  const num = key === "ready" ? String(coreTotal) : "0";

  // Sub-line: Ready / No PO / supplier ETA while waiting. GREY — the tip keeps
  // the detail (overdue/late), the 货 dot keeps the colour.
  const sub = (() => {
    if (key === "ready") return { text: "Ready", tip: title };
    if (key === "no_po") return { text: "No PO", tip: title };
    if (se.state === "no_eta" || !se.etaIso)
      return { text: "ETA —", tip: "Waiting on stock — no supplier ETA entered yet" };
    const d = fmtDate(se.etaIso);
    if (se.state === "overdue")
      return { text: `ETA ${d}`, tip: "Supplier ETA has passed and the goods still aren't in" };
    if (se.state === "late")
      return { text: `ETA ${d}`, tip: "Supplier ETA is later than the deadline − 3 days" };
    return { text: `ETA ${d}`, tip: "Supplier arrival ETA — on track" };
  })();

  return (
    <div style={{ lineHeight: "15px" }} title={title} data-stock-state={info.state}>
      {coreTotal > 0 ? (
        <div className="tabular-nums t4-row-strong truncate">
          {num}/{coreTotal}
        </div>
      ) : (
        <div className="text-base-300">—</div>
      )}
      <div
        className="tabular-nums t4-caption truncate"
        title={sub.tip}
        data-stock-eta={se.state}
      >
        {sub.text}
      </div>
    </div>
  );
}

function Th({
  children,
  center,
}: {
  children: React.ReactNode;
  /** Center-align the header (the narrow MS / BF / Sofa count columns). */
  center?: boolean;
}) {
  return (
    <th
      className={`px-2 py-1.5 font-semibold uppercase ${center ? "text-center" : "text-left"}`}
      /* v4 header: DARK 12/600 cool ink (warm #4A4335 retired). */
      style={{ color: "#374151", fontSize: "12px", letterSpacing: "0.04em" }}
    >
      {children}
    </th>
  );
}

function TableSkeleton() {
  return (
    <div data-testid="operation-orders-control-skeleton">
      <div className="h-9 w-1/3 bg-base-100 rounded animate-pulse mb-6" />
      <div className="flex gap-2 mb-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-7 w-20 bg-base-100 rounded animate-pulse" />
        ))}
      </div>
      <div className="bg-white border border-base-200 rounded">
        {Array.from({ length: 8 }).map((_, i) => (
          <div
            key={i}
            className="h-14 border-b border-base-100 animate-pulse bg-base-50/40"
          />
        ))}
      </div>
    </div>
  );
}

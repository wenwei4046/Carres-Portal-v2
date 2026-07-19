import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useParams } from "react-router-dom";
import {
  useAllPendingChangeRequests,
  useOperationOrders,
  useOperationStock,
  useDeliveryPartners,
  useOperationStaff,
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
import { personLabel, personInitials, avatarColor } from "@/lib/staff-avatar";
import OrderDetailDrawer from "./components/OrderDetailDrawer";
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
  isOpsGenericAccount,
  canRaisePo,
  isPoDayMYT,
  nextPoDayMYT,
  poUrgentBypass,
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
 * Status tabs map the Master Sheet's `Logistic Remark` flow onto the live
 * pipeline (Placed → Proceed → Pending → Scheduled → Completed → All):
 *
 *   Placed    — genuinely new, not yet triaged (native/salesperson)
 *   Proceed   — being arranged. INCLUDES AutoCount-imported orders per the
 *               agreed entry rule (AutoCount import → Proceed; future
 *               salesperson → Placed) + proceed_request stage.
 *   Pending   — awaiting_operation_action (PO open, waiting on stock)
 *   Scheduled — ready_to_dispatch + dispatched (LP assigned / en route)
 *   Completed — delivered
 *   All       — see-everything
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
  { key: "pending", label: "Pending" },
  { key: "scheduled", label: "Scheduled" },
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
  pending: "Pending",
  scheduled: "Scheduled",
  completed: "Delivered",
};

/** Plain-English meaning of each pipeline status — surfaced as a hover tooltip
 *  on the tabs + the row Status chip so operation doesn't have to guess what
 *  "Proceed" means. */
const TAB_DESC: Record<SettledTab, string> = {
  placed: "New order, not processed yet (a salesperson placed it)",
  proceed: "Confirmed — being arranged. Every AutoCount-imported order starts here.",
  pending: "PO raised — waiting for stock to arrive at the warehouse",
  scheduled: "Stock secured — delivery partner assigned / out for delivery",
  completed: "Delivered and closed",
};

/** Stage derivation — mirrors OperationOrders.stageOf so the two surfaces never
 *  disagree on where an order sits in the pipeline. */
function stageOf(o: operationOrderListRow): OperationStage {
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
  // portal (POs are raised outside), so tabs must read the REAL state — Pending
  // = still waiting on stock OR a delivery slot; Scheduled = stock in AND a slot
  // booked. Needs the live free-stock map; without it we fall back to the old
  // stage mapping (used by the param-less `=== "completed"` callers).
  if (availableBySku) {
    const stockReady = stockBucketOf(o, availableBySku) === "Ready";
    const logisticBooked = !!logisticEtaOf(o);
    return stockReady && logisticBooked ? "scheduled" : "pending";
  }
  if (s === "dispatched" || s === "ready_to_dispatch") return "scheduled";
  if (s === "in_production") return "pending";
  return "proceed"; // confirmed OR autocount-placed
}

type StockState = "ready" | "in_stock" | "need_po" | "awaiting" | "unknown";

interface StockInfo {
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
function stockReadiness(
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

/** Row → the pure Chase-supplier plan input. Suppliers speak the ORIGINAL
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

/** Row → the partner (logistic) chase input. Partners speak the ORIGINAL
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

/** Supplier stock lead (Jess 2026-07-19): the days the supplier needs to have
 *  the goods in before the customer deadline — sofa 5d, mattress/bedframe 7d.
 *  5 only when EVERY core line is a sofa; else 7 (also the unknown default). */
function supplierLeadDays(o: operationOrderListRow): number {
  const cores = (o.order_lines ?? [])
    .map((l) => lineCategory(l.sku))
    .filter((c) => c === "mattress" || c === "bedframe" || c === "sofa");
  if (cores.length > 0 && cores.every((c) => c === "sofa")) return 5;
  return 7;
}

/** The SUPPLIER's stock-arrival deadline bucket = customer deadline − lead. A
 *  goods-in view (distinct from the customer DEADLINE ladder): overdue = the
 *  supplier deadline has passed, due3d = within 3 days of it. null = no dated
 *  deadline (TBD / undated). */
function supplierDeadlineBucket(o: operationOrderListRow): "overdue" | "due3d" | null {
  const d = daysToDue(o);
  if (d === null) return null;
  const left = d - supplierLeadDays(o);
  if (left < 0) return "overdue";
  if (left <= 3) return "due3d";
  return null;
}

/** Today as a local ISO date (YYYY-MM-DD) — for lexical ISO date compares. */
function todayIso(): string {
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
interface StockEta {
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
const DUE_BUCKETS = ["Overdue", "Urgent", "Attention", "Upcoming", "Later"] as const;
type DueBucket = (typeof DUE_BUCKETS)[number];
// (B rebuild 2026-07-18: the ladder's only rail surface is the Overdue queue —
// the per-bucket DUE_DESC strings retired with the Urgent row.)
function dueBucketOf(o: operationOrderListRow): DueBucket | null {
  if (controlTabOf(o) === "completed") return null;
  const diff = daysToDue(o);
  if (diff === null) return null;
  if (diff < 0) return "Overdue";
  if (diff <= 1) return "Urgent";
  if (diff <= 3) return "Attention";
  if (diff <= 7) return "Upcoming";
  return "Later";
}

// (Follow-up + Escalate-to-Jess now live in ops_tasks, keyed per order — see
//  openTaskOf / taskUrgency above + the tasksByOrder map in the component.)

/** The logistic's committed delivery ETA (ops_order_control.logistic_eta, 0180) —
 *  distinct from the customer `delivery_date` deadline. */
function logisticEtaOf(o: operationOrderListRow): string | null {
  const raw = o.ops_order_control;
  const ovl = Array.isArray(raw) ? raw[0] : raw;
  return ovl?.logistic_eta ?? null;
}

/** C-vocab (Jess 2026-07-19): the QUEUES rows ARE the NEXT verbs — one
 *  vocabulary across QUEUES · the NEXT column · the drawer's Chase Now. A row
 *  sits in exactly the queue its NEXT verb names; the counts match by
 *  construction. State words (Waiting/Ready) live in FILTERS only. The old
 *  "To book" / "Waiting stock" / "No logistic" queue rows are dead words. */
const NEXT_QUEUE_VERBS = [
  "Order PO",
  "Chase supplier",
  "Assign logistic",
  "Chase logistic",
] as const;
const NEXT_QUEUE_DESC: Record<string, string> = {
  "Order PO": "Goods not ordered from any supplier yet — raise the PO",
  "Chase supplier":
    "PO raised but goods not in yet — chase the supplier (red once inside the stock window)",
  "Assign logistic": "No delivery partner picked yet — assign one",
  "Chase logistic":
    "Partner assigned but no delivery booked with the customer — chase the logistic",
};

// ─── Next action (C2, 2026-07-08) ────────────────────────────────────────────
// The single most-urgent NEXT step per order — one lamp per row. PURE: reads
// only existing signals (stock readiness, controlTabOf stage, the control
// overlay). Never mutates readinessOf / stageOf / counts.
type NextTone = "danger" | "warning" | "info" | "success" | "neutral";
export interface NextAction {
  label: string;
  tone: NextTone;
  /** Delivery is HELD on an owing balance/storage (🔒). */
  locked?: boolean;
}
/** NEXT is plain TEXT in the C rebuild (§14, 2026-07-18) — the pill chrome and
 *  the legacy info-BLUE are gone (blue = selection only). Red text is reserved
 *  for the two genuine dangers (past-deadline Chase logistic + Order PO);
 *  green = Confirm; everything in progress is plain ink; Done is muted. */
const NEXT_TEXT_COLOR: Record<NextTone, string> = {
  danger: "#A32D2D",
  warning: "#374151",
  info: "#374151",
  success: "#3B6D11",
  neutral: "#A8A8A8",
};

// ─── 三线点 row dots (§14, Jess picked C 2026-07-18) ─────────────────────────
// One row = three dots in a FIXED order — Money · Stock · Delivery — sharing
// the §8 dial hues. The dots are the row's ONLY colour channel; the fact cells
// (n/m, ETA, partner, ladder word) stay ink/grey. Grey = not applicable.
const DOT_HEX = {
  green: "#639922",
  amber: "#EF9F27",
  red: "#E24B4A",
  grey: "#D1D5DB",
} as const;
interface RowDot {
  color: string;
  title: string;
}
export function rowDotsOf(
  o: operationOrderListRow,
  stock: StockInfo,
  se: StockEta,
  logi: LogisticState,
): [RowDot, RowDot, RowDot] {
  const completed = controlTabOf(o) === "completed";
  const ovl = ovlOf(o);
  const bal = ovl?.balance == null ? null : Number(ovl.balance);
  // 钱 — an owing balance stays RED even after delivery (§7: the owing customer
  // is the one chase that survives Delivered).
  const money: RowDot =
    bal == null
      ? { color: DOT_HEX.grey, title: "Money — no balance data" }
      : bal > 0
        ? { color: DOT_HEX.red, title: `Money — RM ${fmtRM(bal)} outstanding` }
        : { color: DOT_HEX.green, title: "Money — settled" };
  // 货 — red only for the true blockers (No PO / supplier ETA late-or-overdue).
  let goods: RowDot;
  if (completed) goods = { color: DOT_HEX.green, title: "Stock — done (delivered)" };
  else if (se.state === "ready" || stock.state === "ready" || stock.state === "in_stock")
    goods = { color: DOT_HEX.green, title: "Stock — all in" };
  else if (stock.state === "unknown")
    goods = { color: DOT_HEX.red, title: "Stock — no PO raised yet" };
  else if (se.state === "overdue" || se.state === "late")
    goods = { color: DOT_HEX.red, title: "Stock — supplier ETA late vs the deadline" };
  else goods = { color: DOT_HEX.amber, title: "Stock — waiting arrival" };
  // 送 — guardrail #2: a delivered order never alarms. Open: booked = green,
  // not booked = amber NORMAL state (truth ladder §12), red only past deadline.
  let delivery: RowDot;
  if (completed) delivery = { color: DOT_HEX.green, title: "Delivery — delivered" };
  else if (logi.key === "scheduled")
    delivery = { color: DOT_HEX.green, title: "Delivery — booked" };
  else if (logi.key === "unassigned")
    delivery = { color: DOT_HEX.grey, title: "Delivery — no carrier yet" };
  else {
    const dd = daysToDue(o);
    delivery =
      dd !== null && dd < 0
        ? { color: DOT_HEX.red, title: "Delivery — past deadline, not booked" }
        : { color: DOT_HEX.amber, title: "Delivery — not booked yet" };
  }
  return [money, goods, delivery];
}
function fmtRM(n: number): string {
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
  const raw = o.ops_order_control;
  return Array.isArray(raw) ? raw[0] : raw;
}

/** NEXT — one single-action verb per order, DUAL-TRACK (Jess spec §5, 2026-07-12):
 *  a stock track ∥ a logistic track, surfaced as the one most-urgent verb —
 *    Order PO → Chase supplier → Assign logistic → Chase logistic → Confirm.
 *  WORD LAW (Jess 2026-07-19, C-vocab): "assign" = WE pick the carrier;
 *  "booked" = the PARTNER fixed a slot with the customer (a STATE, never our
 *  verb). "Book logistic" was firing on no-carrier rows — wrong word, dead.
 *  Stock leads while it isn't secured (you don't arrange delivery of goods that
 *  don't exist yet); once Ready the logistic track takes over. Confirm is the
 *  close, and it stays 🔒 LOCKED while a money-hold (unpaid balance / storage) is
 *  outstanding. Operation neither schedules nor calls the customer from here. */
export function nextActionOf(
  o: operationOrderListRow,
  stock: StockInfo,
  lines: { sku: string; qty: number }[],
): NextAction {
  if (controlTabOf(o) === "completed") return { label: "Done", tone: "neutral" };

  // PAST-DEADLINE ESCALATION (Loo locked, freeze gate 2026-07-12): once the
  // promise date has passed with a partner assigned but no delivery booked, the
  // responsibility shifts from the partner's "call now" (LOGISTIC) to OPS's
  // "Chase logistic" (NEXT) — this OVERRIDES the stock track. Scoped to
  // has-partner (you can't chase a logistic that isn't assigned yet) AND to
  // stock NOT "unknown": a No-PO order's real unblock is RUNG 1 "Order PO", which
  // the escalation must never leapfrog (chasing a partner for un-ordered goods is
  // an empty action).
  const dd = daysToDue(o);
  const hasPartner = !!(o.delivery_partners?.name || o.ops_assigned_logistic);
  if (dd !== null && dd < 0 && hasPartner && stock.state !== "unknown" && !logisticEtaOf(o))
    return { label: "Chase logistic", tone: "danger" };

  // STOCK-READY signal (Jess 2026-07-19 #5 fix): the STOCK column trusts the
  // Master import's per-line `line_stock_status='ready'` (stockEtaOf), but
  // nextActionOf used to trust ONLY stockReadiness (order_lines vs live
  // stock_balances) — which is always "awaiting" for AutoCount SKUs that don't
  // match the catalog → the row stayed on "Chase supplier" even when the STOCK
  // column showed "Ready". Honour BOTH signals so a Master-ready order flows to
  // the logistic track (Assign / Chase logistic), matching what the row shows.
  const ready =
    stock.state === "ready" ||
    stock.state === "in_stock" ||
    stockEtaOf(o).state === "ready";

  // STOCK TRACK — leads until the goods are secured.
  if (!ready) {
    if (stock.state === "unknown") return { label: "Order PO", tone: "danger" };
    // "Chase supplier" turns red once we're inside the stock-arrival window and
    // it still hasn't landed (MS/BF = deadline−7d, Sofa = deadline−5d), amber otherwise.
    const hasMsbf = lines.some((l) => {
      const c = lineCategory(l.sku);
      return c === "mattress" || c === "bedframe";
    });
    const hasSofa = lines.some((l) => lineCategory(l.sku) === "sofa");
    const lead = hasMsbf ? 7 : hasSofa ? 5 : 7;
    const overdue = dd !== null && dd < lead;
    return { label: "Chase supplier", tone: overdue ? "danger" : "warning" };
  }

  // LOGISTIC TRACK — stock is in; arrange the delivery.
  if (!(o.delivery_partners?.name || o.ops_assigned_logistic))
    return { label: "Assign logistic", tone: "info" };
  if (!logisticEtaOf(o)) return { label: "Chase logistic", tone: "info" };

  // Both tracks done → Confirm. A money-hold keeps it 🔒 (never a separate action).
  const ovl = ovlOf(o);
  const owingBalance = Number(ovl?.balance ?? 0) > 0;
  const storageFee =
    (Number(ovl?.storage_fee_msbf) || 0) + (Number(ovl?.storage_fee_sof) || 0);
  const owingStorage =
    storageFee > 0 && !ovl?.storage_collected_at && ovl?.storage_waiver_status !== "approved";
  if (owingBalance || owingStorage)
    return { label: "Confirm", tone: "warning", locked: true };
  return { label: "Confirm", tone: "success" };
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

/** Carrier / logistic name for an order — the formal LP, else the Inbox-triage
 *  assignment resolved via the partners map; null when none yet. Drives the
 *  Logistic filter chips + the Carrier cell (Jess 2026-06-24). */
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

// ─── Logistic delivery state (locked列 spec, 2026-07-12) ──────────────────────
// The LOGISTIC column = partner tag + delivery date, as a small state machine.
// The logistic PARTNER queries the slot + calls the customer; ops only chases —
// so "call now" is a time-window alarm (inside the deadline−1..3d window), NOT a
// stock signal. Uses the committed delivery date (ops_order_control.logistic_eta).
type LogisticStateKey = "delivered" | "scheduled" | "call_now" | "no_date" | "unassigned";
interface LogisticState {
  key: LogisticStateKey;
  partner: string | null;
  /** ISO committed delivery date — only on "scheduled". */
  date: string | null;
}
export function logisticStateOf(
  o: operationOrderListRow,
  partnerName: Map<string, string>,
): LogisticState {
  const partner = logisticOf(o, partnerName);
  if (controlTabOf(o) === "completed") return { key: "delivered", partner, date: null };
  const eta = logisticEtaOf(o);
  if (eta) return { key: "scheduled", partner, date: eta }; // date booked → Deliver <date>
  if (!partner) return { key: "unassigned", partner: null, date: null };
  // No date yet: "call now" once inside the arrangement window (≤3 days to the
  // promise, incl. today/overdue), regardless of stock; else it's still early.
  const dd = daysToDue(o);
  if (dd !== null && dd <= 3) return { key: "call_now", partner, date: null };
  return { key: "no_date", partner, date: null };
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
  "Deadline", "Proceed", "Location", "Logistic", "Status",
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
 *  words), NEXT is plain text. Old keys (orderId/ref/region/logistic) retired —
 *  stale hidden-column prefs for them just no-op. */
const ORDER_COL_DEFS: OrderColDef[] = [
  // Status now shows a STAGE word pill (Placed/Proceed/Pending/Scheduled),
  // not the old anonymous dots — 9% so "Scheduled"/"Pending" never clip to
  // "Pendir" (Jess 2026-07-19). Rebalanced out of customer/deadline/delivery/next.
  { key: "dots", label: "Status", w: 9 },
  { key: "order", label: "Order", w: 11 },
  { key: "customer", label: "Customer", w: 16 },
  // Deadline right after Customer (Jess 2026-07-18).
  { key: "deadline", label: "Deadline", w: 12 },
  { key: "stock", label: "Stock", w: 12 },
  { key: "delivery", label: "Delivery", w: 11 },
  // PIC = the staff owner, its OWN column (Jess 2026-07-18: "add one column
  // — assignee?"). Word law: PIC is the team's word (Issue Tracker SOP).
  { key: "pic", label: "PIC", w: 5 },
  { key: "next", label: "Next", w: 12 },
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
  const [openOrderId, setOpenOrderId] = useState<string | null>(null);
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
  // Filter dimensions stacked on top of the status tabs.
  const [dueFilter, setDueFilter] = useState<DueBucket | null>(null);
  const [regionFilter, setRegionFilter] = useState<string | null>(null);
  const [stockFilter, setStockFilter] = useState<StockBucket | null>(null);
  const [logisticFilter, setLogisticFilter] = useState<string | null>(null);
  // SUPPLIER facet (Jess 2026-07-19): filter by the order's primary core-line
  // supplier (holds a supplierId; null = no filter).
  const [supplierFilter, setSupplierFilter] = useState<string | null>(null);
  // SUPPLIER-deadline urgency (Jess 2026-07-19): multi-select the supplier's
  // stock-arrival deadline buckets (overdue / due≤3d). Empty set = no filter.
  const [supplierUrgency, setSupplierUrgency] = useState<Set<"overdue" | "due3d">>(new Set());
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
  // annotations) · ⏫ For Jess = escalations needing the boss (escalate). Each is
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
  const isManager = isOpsManager(authRole, authEmail);
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
    isOpsManager,
  );
  // The consolidated Raise-PO review (Option A cards); null = closed.
  const [raisePoOrders, setRaisePoOrders] = useState<operationOrderListRow[] | null>(null);
  const [chaseOrders, setChaseOrders] = useState<operationOrderListRow[] | null>(null);
  // Logistic ⋮ → Remind/Chase over the selection (partner-grouped review).
  const [chasePartnerOrders, setChasePartnerOrders] = useState<
    operationOrderListRow[] | null
  >(null);
  // Which tone the Chase-supplier review opens on (Jess 2026-07-19): the
  // SUPPLIER section's Remind opens remind, Chase opens chase.
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
  const staffQ = useOperationStaff();
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
          !isOpsManager("operation", s.email) &&
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

  // Bulk-action mutations: assign-logistic loops the Inbox ops-assign endpoint;
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
  // (§7: the owing customer is the chase that survives Delivered).
  const owing = useMemo(() => {
    let n = 0;
    let rm = 0;
    for (const o of orders) {
      const b = Number(ovlOf(o)?.balance ?? 0);
      if (b > 0) {
        n += 1;
        rm += b;
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
  // sits inside the stock lead window (MS/BF 7d · sofa 5d) with stock NOT
  // secured — flagged red ANY day, must not wait for the Mon/Thu PO day.
  const urgentPoCount = useMemo(
    () =>
      liveScope.filter((o) => {
        if (stockBucketOf(o, availableBySku) === "Ready") return false;
        const cats = CORE_ORDER.filter((c) => orderHasCore(o, c));
        return poUrgentBypass(o.delivery_date_tbd ? null : o.delivery_date, cats);
      }).length,
    [liveScope, availableBySku],
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
    // Data-present carriers by count desc first (tiebreak alpha), then the
    // remaining 0-count partners alphabetically.
    return [...m.entries()]
      .sort((a, b) => {
        if ((a[1] > 0) !== (b[1] > 0)) return b[1] - a[1]; // non-zero group first
        if (a[1] !== b[1]) return b[1] - a[1];
        return a[0].localeCompare(b[0]);
      })
      .map(([carrier, count]) => ({ carrier, count }));
  }, [liveScope, partnerName, partnersQ.data]);

  // SUPPLIER-deadline urgency counts (Jess 2026-07-19) — the supplier's stock
  // arrival deadline (customer deadline − lead), over liveScope.
  const supOverdue = useMemo(
    () => liveScope.filter((o) => supplierDeadlineBucket(o) === "overdue").length,
    [liveScope],
  );
  const supDue3d = useMemo(
    () => liveScope.filter((o) => supplierDeadlineBucket(o) === "due3d").length,
    [liveScope],
  );

  // SUPPLIER facet counts — per primary core-line supplier, over liveScope.
  // Unresolved (no core line / no supplier) rows are skipped. Sorted by name.
  // When an urgency is selected, only orders in that bucket count, so the
  // supplier rows reflect the pill selection.
  const supplierEntries = useMemo(() => {
    const m = new Map<string, number>();
    for (const o of liveScope) {
      if (supplierUrgency.size > 0) {
        const b = supplierDeadlineBucket(o);
        if (!b || !supplierUrgency.has(b)) continue;
      }
      const sid = primarySupplierId(o, skuMeta, suppliers);
      if (!sid) continue;
      m.set(sid, (m.get(sid) ?? 0) + 1);
    }
    return [...m.entries()]
      .map(([id, count]) => ({ id, name: supplierNameById.get(id) ?? id, count }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [liveScope, skuMeta, suppliers, supplierNameById, supplierUrgency]);

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
    const facetActive =
      flaggedOnly ||
      escalateOnly ||
      !!nextFilter ||
      supplierLateOnly ||
      !!dueFilter ||
      !!regionFilter ||
      !!stockFilter ||
      !!logisticFilter ||
      !!supplierFilter ||
      supplierUrgency.size > 0 ||
      !!staffFilter ||
      categoryFilter.size > 0;
    if (facetActive) r = r.filter((o) => controlTabOf(o) !== "completed");
    if (flaggedOnly) r = r.filter(hasOpenTask);
    if (escalateOnly) r = r.filter(hasEscalatedTask);
    if (nextFilter) r = r.filter((o) => nextVerbOf(o) === nextFilter);
    if (supplierLateOnly) r = r.filter(isSupplierLate);
    if (dueFilter) r = r.filter((o) => dueBucketOf(o) === dueFilter);
    if (regionFilter) r = r.filter((o) => regionBucket(o.customer_address ?? null) === regionFilter);
    if (stockFilter) r = r.filter((o) => stockBucketOf(o, availableBySku) === stockFilter);
    if (logisticFilter)
      r = r.filter((o) => (logisticOf(o, partnerName) ?? NO_CARRIER) === logisticFilter);
    if (supplierFilter)
      r = r.filter((o) => primarySupplierId(o, skuMeta, suppliers) === supplierFilter);
    if (supplierUrgency.size > 0) {
      const b = supplierUrgency;
      r = r.filter((o) => {
        const bucket = supplierDeadlineBucket(o);
        return bucket !== null && b.has(bucket);
      });
    }
    if (staffFilter)
      r = r.filter((o) =>
        staffFilter === NO_STAFF ? !ownerOf(o) : ownerOf(o) === staffFilter,
      );
    if (owingOnly) r = r.filter((o) => Number(ovlOf(o)?.balance ?? 0) > 0);
    if (categoryFilter.size > 0) {
      const opts = CATEGORY_OPTS.filter((c) => categoryFilter.has(c.key));
      r = r.filter((o) => opts.some((c) => c.match(o)));
    }
    return [...r].sort(compareBySlack);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabFiltered, flaggedOnly, escalateOnly, nextFilter, supplierLateOnly, dueFilter, regionFilter, stockFilter, logisticFilter, supplierFilter, supplierUrgency, staffFilter, owingOnly, categoryFilter, availableBySku, partnerName, skuMeta, suppliers, tasksByOrder]);

  // Most-recent order/import time → shown next to the count.
  const latestIn = useMemo(() => {
    let mx: string | null = null;
    for (const o of orders) if (o.placed_at && (!mx || o.placed_at > mx)) mx = o.placed_at;
    return mx;
  }, [orders]);

  // Reset the render window to the first batch whenever the filtered set changes.
  useEffect(
    () => setRenderCount(ROWS_PER_BATCH),
    [tab, search, dueFilter, flaggedOnly, escalateOnly, nextFilter, supplierLateOnly, regionFilter, stockFilter, logisticFilter, supplierFilter, supplierUrgency, categoryFilter],
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
        <div className="rounded-md bg-destructive/10 border border-destructive/30 p-4 text-sm">
          <div className="text-destructive font-semibold mb-2">
            Couldn&rsquo;t load orders
          </div>
          <div className="text-[12px] text-base-700 mb-3">
            {(error as Error | undefined)?.message ?? "Unknown error"}
          </div>
          <button
            type="button"
            onClick={() => void refetch()}
            className="btn-secondary text-[11px] py-1.5 px-3"
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
    !!logisticFilter ||
    !!staffFilter ||
    owingOnly ||
    !!regionFilter ||
    !!dueFilter ||
    categoryFilter.size > 0 ||
    !!nextFilter ||
    supplierLateOnly ||
    flaggedOnly ||
    escalateOnly;

  function resetFilters() {
    setSearch("");
    setStockFilter(null);
    setLogisticFilter(null);
    setStaffFilter(null);
    setOwingOnly(false);
    setRegionFilter(null);
    setDueFilter(null);
    setCategoryFilter(new Set());
    setNextFilter(null);
    setFlaggedOnly(false);
    setEscalateOnly(false);
  }

  const activeChips: ActiveChip[] = [];
  if (search) activeChips.push({ label: `Search: ${search}`, onClear: () => setSearch("") });
  if (stockFilter)
    activeChips.push({ label: `Stock: ${stockFilter}`, onClear: () => setStockFilter(null) });
  if (logisticFilter)
    activeChips.push({
      label: logisticFilter === NO_CARRIER ? "Unassigned" : `Logistic: ${logisticFilter}`,
      onClear: () => setLogisticFilter(null),
    });
  if (regionFilter)
    activeChips.push({
      label: regionFilter === OTHERS_LABEL ? "No region" : `Region: ${regionFilter}`,
      onClear: () => setRegionFilter(null),
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
  if (supplierFilter)
    activeChips.push({
      label: `Supplier: ${supplierNameById.get(supplierFilter) ?? supplierFilter}`,
      onClear: () => setSupplierFilter(null),
    });
  if (supplierUrgency.size > 0)
    activeChips.push({
      label: `Supplier due: ${[...supplierUrgency]
        .map((b) => (b === "overdue" ? "overdue" : "due ≤3d"))
        .join(" + ")}`,
      onClear: () => setSupplierUrgency(new Set()),
    });
  if (owingOnly) activeChips.push({ label: "Owing", onClear: () => setOwingOnly(false) });
  if (supplierLateOnly)
    activeChips.push({ label: "Supplier late", onClear: () => setSupplierLateOnly(false) });
  if (dueFilter) activeChips.push({ label: `Due: ${dueFilter}`, onClear: () => setDueFilter(null) });
  if (nextFilter)
    activeChips.push({ label: `Next: ${nextFilter}`, onClear: () => setNextFilter(null) });
  if (flaggedOnly) activeChips.push({ label: "Follow-up", onClear: () => setFlaggedOnly(false) });
  if (escalateOnly) activeChips.push({ label: "For Jess", onClear: () => setEscalateOnly(false) });
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
  const orderPoCount = nextCounts.get("Order PO") ?? 0;
  const chaseSupplierCount = nextCounts.get("Chase supplier") ?? 0;
  // Quiet chip = every day (whole team, zero clicks): holder avatar + next PO
  // day. Hot state = Mon/Thu, urgent, or ?poday preview: the SAME slot grows
  // the action chip (+ Raise PO for holder/management). One announce home.
  const poHot = poDayPreview || isPoDayMYT() || urgentPoCount > 0;
  const nextPoIso = nextPoDayMYT();
  const nextPoLabel = `${new Date(`${nextPoIso}T00:00:00`).toLocaleDateString("en-US", { weekday: "short" })} ${fmtDateShort(nextPoIso)}`;
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
        className="w-[18px] h-[18px] rounded-full flex items-center justify-center text-[11px] font-bold leading-none shrink-0"
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
      className="shrink-0 text-[11px] leading-4 border border-base-200 rounded-full px-1.5 text-base-500 bg-white"
      title="Each PIC chases their own orders"
    >
      PIC
    </span>,
  );
  const poDutyTitleChips = poDutyHolderShown ? (
    <div className="flex items-center gap-1.5" data-testid="po-duty-strip">
      <span
        className="inline-flex items-center gap-1.5 h-[26px] rounded-full border border-base-200 bg-white px-2 text-[11px] text-base-500 whitespace-nowrap"
        title={`PO duty this month: ${poDutyHolderShown.name ?? poDutyHolderShown.email}${poDutyHolder ? "" : " (demo)"} — controls Order PO + Chase supplier (the one voice to suppliers). Full roster: right rail → Team.`}
      >
        <span
          className="w-4 h-4 rounded-full flex items-center justify-center text-[10px] font-bold leading-none shrink-0"
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
          className={`inline-flex items-center gap-1 h-[26px] rounded-full px-2 text-[11px] font-semibold whitespace-nowrap ${
            urgentPoCount > 0 && !(poDayPreview || isPoDayMYT())
              ? "bg-destructive/10 text-destructive"
              : "bg-warning-soft text-warning"
          }`}
          data-testid="po-day-chip"
        >
          <PackagePlus size={14} strokeWidth={2} />
          {poDayPreview || isPoDayMYT()
            ? `PO day — Order PO ${orderPoCount} · Chase supplier ${chaseSupplierCount}`
            : `${urgentPoCount} urgent — inside the stock window`}
          {(poDayPreview || isPoDayMYT()) && urgentPoCount > 0 && (
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
          className="btn-secondary text-[11px] h-[26px] py-0 px-2 whitespace-nowrap inline-flex items-center"
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
              <span className="inline-flex items-center gap-1.5 text-[12px] font-normal text-base-400">
                <span className="tabular-nums" title="Most recent order / import">
                  Synced {fmtDateShort(latestIn)}
                </span>
                <button
                  type="button"
                  onClick={() => void refetch()}
                  title="Refresh"
                  aria-label="Refresh orders"
                  className="p-0.5 rounded hover:text-base-900 hover:bg-base-100 transition-colors"
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
              className="w-[230px] px-4 py-1.5 border border-base-200 rounded-full text-[13px] bg-white outline-none focus:border-base-700"
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
              className="btn-secondary text-[12px] whitespace-nowrap rounded-xl"
              title="Import from Master — fill each order line's Stock ETA + status from your Master sheet"
            >
              + Master
            </button>
            {onImport && (
              <button
                type="button"
                onClick={onImport}
                className="btn-hero text-[12px] whitespace-nowrap rounded-xl"
                title="Import orders from AutoCount"
              >
                + AutoCount
              </button>
            )}
            {hiddenCols.size > 0 && (
              <span
                className="t-tiny text-base-500 tabular-nums"
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
                className="p-1 rounded-md border border-base-200 text-base-500 hover:text-base-800 hover:bg-base-50 transition-colors"
              >
                <MoreVertical size={15} />
              </button>
              {columnsOpen && (
                <div className="absolute z-30 mt-1 right-0 w-56 max-h-80 overflow-auto bg-card text-card-foreground border border-base-200 rounded-md shadow-lg py-1">
                  <div className="t-micro text-base-500 px-3 pt-1 pb-1.5">Show columns</div>
                  <div className="px-1.5 pb-1">
                    {ORDER_COL_DEFS.map((d) => (
                      <label
                        key={d.key}
                        className="flex items-center gap-2 px-1.5 py-1 rounded hover:bg-base-50 cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          checked={showCol(d.key)}
                          onChange={() => toggleCol(d.key)}
                        />
                        <span className="t-small text-base-700 truncate">{d.label}</span>
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
                setChaseSupplierScope(null);
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
                    className="shrink-0 p-0.5 rounded text-base-400 hover:text-base-800 hover:bg-base-200/60 transition-colors"
                  >
                    <ChevronsLeft size={15} />
                  </button>
                }
              >
                {/* C-vocab (Jess 2026-07-19): Overdue (结果) + Owing (钱) on
                    top, then the NEXT-verb queues — the row's queue IS its
                    NEXT word, so numbers match the column by construction.
                    "To book" / "Waiting stock" / "No logistic" = dead words
                    (states live in FILTERS; no-carrier = Assign logistic). */}
                {(dueEntries.find((e) => e.bucket === "Overdue")?.count ?? 0) > 0 && (
                  <KanbanRow
                    label="Overdue"
                    count={dueEntries.find((e) => e.bucket === "Overdue")?.count ?? 0}
                    tone="danger"
                    active={dueFilter === "Overdue"}
                    chip={emptyQueueChip}
                    title="Past the delivery date and not delivered yet — who to chase = the row's NEXT verb"
                    onClick={() => setDueFilter((r) => (r === "Overdue" ? null : "Overdue"))}
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
                {NEXT_QUEUE_VERBS.map((v) =>
                  (nextCounts.get(v) ?? 0) > 0 ? (
                    <KanbanRow
                      key={v}
                      label={v}
                      count={nextCounts.get(v) ?? 0}
                      tone={
                        v === "Order PO"
                          ? "danger"
                          : v === "Chase supplier"
                            ? "warning"
                            : undefined
                      }
                      active={nextFilter === v}
                      chip={
                        v === "Order PO" || v === "Chase supplier"
                          ? dutyQueueChip
                          : picQueueChip
                      }
                      title={NEXT_QUEUE_DESC[v]}
                      onClick={() => setNextFilter((f) => (f === v ? null : v))}
                    />
                  ) : null,
                )}
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
                    label="For Jess"
                    count={escalateCount}
                    active={escalateOnly}
                    chip={emptyQueueChip}
                    title="Escalated to Jess — orders needing the boss's action"
                    onClick={() => setEscalateOnly((v) => !v)}
                  />
                )}
              </KanbanGroup>

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
                              className="w-[18px] h-[18px] rounded-full flex items-center justify-center text-[11px] font-bold leading-none"
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
                            className="w-[18px] h-[18px] rounded-full flex items-center justify-center text-[11px] font-bold leading-none shrink-0 opacity-60"
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
                  {/* "No PIC", NOT "Unassigned" — that word already means
                      no-logistic in CHASE NOW (Jess 2026-07-18, word law). */}
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
                {/* Generic DEADLINE section REMOVED (Jess 2026-07-19: "6 is
                    of who?") — an unlabelled deadline read as ambiguous. Deadline
                    urgency now lives ONLY under its owner: SUPPLIER (stock-arrival
                    deadline) and LOGISTIC (customer delivery deadline). */}
                <KanbanGroup
                  title="LOGISTIC"
                  testid="filter-logistic"
                  collapsed={collapsedGroups.has("LOGISTIC")}
                  onToggle={() => toggleGroup("LOGISTIC")}
                >
                  {/* no-carrier = the "Assign logistic" QUEUE (C-vocab); here
                      EVERY partner is an option (0-count included, Jess
                      2026-07-19) so the whole fleet is filterable. */}
                  {logisticEntries.map((e) => (
                    <KanbanRow
                      key={e.carrier}
                      label={e.carrier}
                      count={e.count}
                      active={logisticFilter === e.carrier}
                      onClick={() => setLogisticFilter((r) => (r === e.carrier ? null : e.carrier))}
                    />
                  ))}
                </KanbanGroup>
                <KanbanGroup
                  title="SUPPLIER"
                  testid="filter-supplier"
                  collapsed={collapsedGroups.has("SUPPLIER")}
                  onToggle={() => toggleGroup("SUPPLIER")}
                >
                  {/* SUPPLIER-deadline urgency (Jess 2026-07-19): the supplier's
                      stock-arrival deadline = customer deadline − lead (sofa 5d ·
                      else 7d). Multi-select pills — both can be on. */}
                  <div className="flex items-center gap-1.5 px-2.5 py-1">
                    <button
                      type="button"
                      aria-pressed={supplierUrgency.has("overdue")}
                      onClick={() =>
                        setSupplierUrgency((prev) => {
                          const n = new Set(prev);
                          if (n.has("overdue")) n.delete("overdue");
                          else n.add("overdue");
                          return n;
                        })
                      }
                      className={`pill pill-overdue ${
                        supplierUrgency.has("overdue") ? "font-bold ring-1 ring-current" : ""
                      }`}
                    >
                      Overdue {supOverdue}
                    </button>
                    <button
                      type="button"
                      aria-pressed={supplierUrgency.has("due3d")}
                      onClick={() =>
                        setSupplierUrgency((prev) => {
                          const n = new Set(prev);
                          if (n.has("due3d")) n.delete("due3d");
                          else n.add("due3d");
                          return n;
                        })
                      }
                      className={`pill pill-warning ${
                        supplierUrgency.has("due3d") ? "font-bold ring-1 ring-current" : ""
                      }`}
                    >
                      Due ≤3d {supDue3d}
                    </button>
                  </div>
                  {/* Every supplier with ≥1 order in scope (Jess 2026-07-19).
                      Empty until the catalog loads. */}
                  {supplierEntries.map((e) => (
                    <KanbanRow
                      key={e.id}
                      label={e.name}
                      count={e.count}
                      active={supplierFilter === e.id}
                      onClick={() => setSupplierFilter((r) => (r === e.id ? null : e.id))}
                    />
                  ))}
                  {/* One-click chase over the current supplier scope (Jess
                      2026-07-19): Remind the due-≤3d, Chase the overdue. */}
                  {supOverdue + supDue3d > 0 && (
                    <div className="flex items-center gap-2 px-2.5 py-1">
                      <button
                        type="button"
                        className="btn-secondary text-[12px] py-1 px-2 text-warning"
                        onClick={() => {
                          setChaseInitialMode("remind");
                          setChaseSupplierScope(supplierFilter);
                          setChaseOrders(
                            liveScope.filter(
                              (o) =>
                                supplierDeadlineBucket(o) === "due3d" &&
                                (!supplierFilter ||
                                  primarySupplierId(o, skuMeta, suppliers) === supplierFilter),
                            ),
                          );
                        }}
                      >
                        Remind {supDue3d}
                      </button>
                      <button
                        type="button"
                        className="btn-secondary text-[12px] py-1 px-2 text-danger"
                        onClick={() => {
                          setChaseInitialMode("chase");
                          setChaseSupplierScope(supplierFilter);
                          setChaseOrders(
                            liveScope.filter(
                              (o) =>
                                supplierDeadlineBucket(o) === "overdue" &&
                                (!supplierFilter ||
                                  primarySupplierId(o, skuMeta, suppliers) === supplierFilter),
                            ),
                          );
                        }}
                      >
                        Chase {supOverdue}
                      </button>
                    </div>
                  )}
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
                        active={regionFilter === e.region}
                        onClick={() => setRegionFilter((r) => (r === e.region ? null : e.region))}
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
                      active={regionFilter === OTHERS_LABEL}
                      title="Delivery region couldn't be read from the address — fix the address"
                      onClick={() => setRegionFilter((r) => (r === OTHERS_LABEL ? null : OTHERS_LABEL))}
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
          className="w-full border-collapse text-[13px] table-fixed [&_td]:h-[40px] [&_td]:py-1 [&_td]:align-middle [&_td]:overflow-hidden [&_td]:whitespace-nowrap"
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
                  <span title="Money · Stock · Delivery — green OK · amber in progress · red needs action">
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
              {showCol("next") && <Th>Next</Th>}
            </tr>
          </thead>
          <tbody>
            {total === 0 && (
              <tr>
                <td
                  colSpan={visibleColSpan}
                  className="p-12 text-center text-[12px] text-base-500"
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
                onNextAction={(verb) => {
                  if (verb === "Order PO") setRaisePoOrders([o]);
                  else if (verb === "Chase supplier") {
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
                <td colSpan={visibleColSpan} className="text-center text-[11px] text-base-400">
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

      {/* Chase supplier — one WhatsApp message per supplier group over the
          selection (Remind / Chase). Open to all operation (no PO-duty gate). */}
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

      {/* Chase logistic — one WhatsApp message per delivery-partner group over
          the selection (Remind / Chase). Open to all operation. */}
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
 *  Assign logistic · Flag · Export ▾ (CSV / Print / Mark delivered); ✕ clears. */
/**
 * Bulk bar — Option B (Jess 2026-07-19): grouped by COUNTERPARTY, not by verb.
 * Three chips — [📦 Supplier ⋮] [🚚 Logistic ⋮] [More] — and the two
 * counterparty menus each hold that party's actions incl. Remind / Chase. The
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
  /** Open the supplier chase-review on the given tone (Remind / Chase). */
  onChaseSupplier: (mode: "remind" | "chase") => void;
  /** Open the partner chase-review on the given tone (Remind / Chase). */
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
    "inline-flex items-center gap-1.5 text-[13px] px-2.5 py-1 rounded-md hover:bg-white/70 disabled:opacity-50";
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
      <span className="text-[13px] font-semibold tabular-nums whitespace-nowrap">
        {count} selected
      </span>
      {/* Gmail cross-page select-all — only while the tab holds more. */}
      {count < total && (
        <button
          type="button"
          onClick={onSelectAllInTab}
          className="text-[12px] text-primary hover:underline whitespace-nowrap"
        >
          Select all {total} in {tabLabel}
        </button>
      )}
      <span className="mx-1 h-4 w-px bg-signature-100" aria-hidden />

      {/* — SUPPLIER ⋮ — the goods counterparty. Raise PO (gated) + Remind +
          Chase all live here; one voice per supplier. */}
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
              label="Remind"
              hint="before deadline"
              onClick={() => onChaseSupplier("remind")}
            />
            <BulkMenuItem
              icon={MessageCircle}
              label="Chase"
              hint="overdue"
              tone="wa"
              onClick={() => onChaseSupplier("chase")}
            />
          </div>
        )}
      </div>

      {/* — LOGISTIC ⋮ — the delivery counterparty. Assign (partner picker) +
          Remind + Chase. */}
      <div className="relative">
        <button
          type="button"
          onClick={() => toggle("logistic")}
          disabled={busy}
          aria-haspopup="menu"
          aria-expanded={menu === "logistic"}
          className={chip}
        >
          <Truck size={15} className="text-base-500" /> Logistic
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
              label="Remind"
              hint="before收货日"
              onClick={() => onChasePartner("remind")}
            />
            <BulkMenuItem
              icon={MessageCircle}
              label="Chase"
              hint="overdue"
              tone="wa"
              onClick={() => onChasePartner("chase")}
            />
          </div>
        )}
        {menu === "assign" && (
          <div className={pop} role="menu">
            <div className="px-2 py-1.5 text-[10px] uppercase tracking-[0.08em] text-base-400">
              Assign to…
            </div>
            {partners.length === 0 && (
              <div className="px-2 py-1.5 text-[12px] text-base-400">No partners.</div>
            )}
            {partners.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => onAssign(p.id)}
                className="w-full text-left px-2 py-1.5 text-[12px] rounded hover:bg-base-100"
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
        className="ml-auto inline-flex items-center gap-1 text-[13px] text-base-500 hover:text-base-900"
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
      className="w-full flex items-center gap-2 px-2 py-2 text-[12px] rounded hover:bg-base-100 disabled:opacity-45 disabled:hover:bg-transparent"
    >
      <Icon
        size={14}
        className={tone === "wa" ? "text-[#25D366]" : "text-base-500"}
      />
      <span>{label}</span>
      {hint && <span className="text-[11px] text-base-400">{hint}</span>}
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
        active ? "" : "hover:bg-[#E9ECEF]"
      }`}
      style={{ padding: "6px 10px", backgroundColor: active ? "#C2E7FF" : undefined }}
    >
      {/* Owner chip LEADS the row (Jess 2026-07-19: "icon at front, avoid all
          at number there") — identity first, the count column stays clean. */}
      {chip}
      <span
        className="flex-1 min-w-0 truncate text-[13px]"
        style={{ color: active ? "#0B0B0B" : "#3C4043", fontWeight: active ? 700 : 400 }}
      >
        {label}
      </span>
      <span
        className="text-[13px] tabular-nums shrink-0"
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
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[12px] whitespace-nowrap transition-colors ${
        active
          ? "border-transparent font-bold text-[#0B0B0B]"
          : "border-base-200 bg-white text-base-700 hover:border-base-400"
      }`}
      style={active ? { backgroundColor: "#C2E7FF" } : undefined}
    >
      {avatar && (
        <span
          className="w-[18px] h-[18px] rounded-full flex items-center justify-center text-[11px] font-bold leading-none shrink-0"
          style={{ background: avatar.bg, color: avatar.fg }}
        >
          {avatar.text}
        </span>
      )}
      {label}
      <span className="tabular-nums text-[11px] text-base-500">{count}</span>
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
        className="p-0.5 rounded text-base-500 hover:text-base-800 hover:bg-base-100"
      >
        <Users size={14} strokeWidth={2} />
      </button>
      {open && pos && (
        <div
          className="fixed z-40 w-72 bg-card text-card-foreground border border-base-200 rounded-md shadow-lg py-1"
          style={{ top: pos.top, left: pos.left }}
        >
          <div className="t-micro text-base-500 px-3 pt-1 pb-1.5">
            Auto-assign pool
          </div>
          {staff.map((s) => (
            <div
              key={s.user_id}
              className="flex items-center gap-2 px-3 py-1.5 hover:bg-base-50"
            >
              <div className="flex-1 min-w-0">
                <div className="text-[13px] text-base-900 truncate">
                  {staffLabel(s)}
                  {s.pooled && !s.available && (
                    <span className="text-[11px] text-base-500"> · away</span>
                  )}
                </div>
                <div className="text-[11px] text-base-500 truncate">
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
                  className="btn-ghost text-[11px] py-0.5 px-2 text-base-500"
                  disabled={mut.isPending}
                  title="She joins automatically the first time she logs in — click only to deal her a share before that"
                  onClick={() => mut.mutate({ userId: s.user_id, pooled: true })}
                >
                  joins on first login
                </button>
              ) : (
                <>
                  <label
                    className="flex items-center gap-1 text-[11px] text-base-600 cursor-pointer"
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
                      className="btn-ghost text-[11px] py-0.5 px-1.5"
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
          <div className="t-micro text-base-400 px-3 pt-1.5 pb-1">
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
            className={`inline-flex items-center gap-1.5 px-2 pt-1.5 pb-1 border-b-2 transition-colors text-[13px] whitespace-nowrap ${
              on
                ? "border-[#1A1A1A] text-[#1A1A1A] font-semibold"
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
              className={`tabular-nums text-[11px] px-1.5 rounded-full ${
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
        className="shrink-0 w-[20px] h-[20px] rounded-full flex items-center justify-center text-[11px] font-semibold leading-none"
        style={{ background: av!.bg, color: av!.fg }}
        title={`PIC: ${member.name ?? member.email}`}
        aria-label={`Assigned to ${staffLabel(member)}`}
      >
        {staffInitials(member)}
      </span>
    ) : (
      <span
        className="shrink-0 w-[20px] h-[20px] rounded-full border border-dashed border-base-300 flex items-center justify-center text-[11px] text-base-300 leading-none"
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
        className={`w-[20px] h-[20px] rounded-full flex items-center justify-center text-[11px] font-semibold leading-none ${
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
              className={`w-full text-left px-3 py-1.5 text-[13px] hover:bg-base-50 ${
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
              className="w-full text-left px-3 py-1.5 text-[13px] text-base-500 hover:bg-base-50 border-t border-base-100"
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
  /** One-click NEXT (2026-07-19) — the row's NEXT verb, clicked = act on it. */
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
        selected ? "bg-[#e6f1fb]" : "bg-white hover:bg-base-50"
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
          as the tabs (Placed → Proceed → Pending → Scheduled → Delivered). A
          quiet .pill for the live stages; a muted "Delivered" (no pill) once
          done. Replaces the anonymous status dots (new staff couldn't read). */}
      {showCol("dots") && (
      <td className="pl-2 pr-1">
        {completed ? (
          <span className="text-[12px] text-base-400">Delivered</span>
        ) : (
          (() => {
            const stage = controlTabOf(o, availableBySku);
            const { label, cls } =
              stage === "pending"
                ? { label: "Pending", cls: "pill-warning" }
                : stage === "scheduled"
                  ? { label: "Scheduled", cls: "pill-confirmed" }
                  : stage === "proceed"
                    ? { label: "Proceed", cls: "pill-neutral" }
                    : { label: "Placed", cls: "pill-neutral" };
            return <span className={`pill ${cls}`}>{label}</span>;
          })()
        )}
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
                className="ml-1 inline-block align-middle rounded-full px-1.5 py-0.5 text-[10px] font-semibold bg-warning-soft text-base-800 border border-warning"
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
              {fmtDate(o.delivery_date).split(", ")[0]}
            </span>
          ) : (
            <span className="text-base-300">—</span>
          )
        ) : o.delivery_date_tbd ? (
          <span className="text-[11px] font-medium" style={{ color: "#A8A8A8" }}>TBD</span>
        ) : o.delivery_date ? (
          (() => {
            const datePart = fmtDate(o.delivery_date).split(", ")[0];
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
      {/* Delivery — partner + §12 truth-ladder word. "call now" is DEAD (§14:
          the red time-window alarm painted every row); call_now/no_date both
          render "not booked" — the NORMAL state, worded grey because the 送
          dot carries the colour. */}
      {showCol("delivery") && (
      <td className="pl-1 pr-2">
        {logi.key === "unassigned" ? (
          <span className="t4-caption text-[13px]">— unassigned</span>
        ) : (
          <div style={{ lineHeight: "15px" }}>
            <div className="t4-row-strong truncate">{logi.partner}</div>
            {logi.key === "delivered" ? (
              <div style={{ fontSize: "11px", fontWeight: 600, color: "#3B6D11" }}>
                Delivered ✓
              </div>
            ) : logi.key === "scheduled" && logi.date ? (
              <div
                className="tabular-nums"
                style={{ fontSize: "11px", fontWeight: 600, color: "#3B6D11" }}
              >
                booked {fmtDate(logi.date).split(", ")[0]}
              </div>
            ) : (
              <div className="t4-caption">not booked</div>
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
      {/* Next action — one plain-text verb, now a one-click action (2026-07-19):
          the whole row opens the drawer, so the NEXT verb itself is the button
          that acts on the order (Order PO / Chase supplier / else open). */}
      {showCol("next") && (
      <td className="pl-2 pr-2">
        {(() => {
          const na = nextActionOf(o, stock, lines);
          if (!na.label) return null;
          // MONEY track (Jess 2026-07-19 legend): the goods/delivery bottleneck
          // is the PRIMARY verb; an outstanding balance is an INDEPENDENT track,
          // shown as a secondary "Collect $" pill (max two pills). Hidden once
          // the order is closed. `Confirm 🔒` already means "money-held", so the
          // pill isn't doubled up there.
          const owing = !completed && Number(ovlOf(o)?.balance ?? 0) > 0;
          const showMoney = owing && na.label !== "Confirm";
          return (
            <div className="flex items-center gap-1.5 max-w-full">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onNextAction(na.label);
                }}
                className="inline-flex items-center gap-1 align-middle min-w-0 hover:underline"
                style={{
                  fontSize: "12px",
                  fontWeight: 600,
                  letterSpacing: "0.01em",
                  color: NEXT_TEXT_COLOR[na.tone],
                }}
                data-next-action={na.label}
                title={`${na.label} — click to act`}
              >
                {na.locked && <Lock size={11} strokeWidth={2.5} className="shrink-0" aria-hidden="true" />}
                <span className="truncate min-w-0">{na.label}</span>
              </button>
              {showMoney && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onNextAction("Collect $");
                  }}
                  className="pill pill-collected shrink-0 hover:brightness-95"
                  data-next-action="Collect $"
                  title="Outstanding balance — open the order to collect"
                >
                  Collect $
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
    const d = fmtDate(se.etaIso).split(", ")[0];
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

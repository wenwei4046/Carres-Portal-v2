import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useParams } from "react-router-dom";
import {
  useAllPendingChangeRequests,
  useOperationOrders,
  useOperationStock,
  useDeliveryPartners,
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
import OrderDetailDrawer from "./components/OrderDetailDrawer";
import { TopBarIcons } from "./components/GlobalTopBar";
import FollowUpForm from "./components/FollowUpForm";
import ImportStockEtaDialog from "./components/ImportStockEtaDialog";
import ListPageShell, { type ActiveChip } from "@/components/ListPageShell";
import { SectionBand, SectionCard } from "@/components/SectionPanel";
import { TASKS_KEY } from "./components/rail/TasksPanel";
import type { OpsTask, OpsTasksListResponse } from "@carres/shared";
import type { OperationStage } from "./components/StageChip";
import {
  RefreshCw,
  ChevronDown,
  ChevronRight,
  ChevronsLeft,
  Clock,
  ExternalLink,
  Inbox,
  LayoutGrid,
  PackageOpen,
  Truck,
  Download,
  CheckCircle2,
  X,
  Flag,
  Lock,
  Printer,
  MoreVertical,
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
function controlTabOf(o: operationOrderListRow): SettledTab {
  const s = stageOf(o);
  if (s === "delivered") return "completed";
  if (s === "dispatched" || s === "ready_to_dispatch") return "scheduled";
  if (s === "in_production") return "pending";
  if (s === "confirmed") return "proceed";
  // s === "placed": entry rule splits by source.
  return o.source_system === "autocount" ? "proceed" : "placed";
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
function daysToDue(o: operationOrderListRow): number | null {
  if (o.delivery_date_tbd || !o.delivery_date) return null;
  const d = new Date(`${o.delivery_date}T00:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((d.getTime() - today.getTime()) / 86_400_000);
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
const DUE_DESC: Record<DueBucket, string> = {
  Overdue: "Past the delivery date",
  Urgent: "Due today or tomorrow (≤1 day)",
  Attention: "Due in 2–3 days",
  Upcoming: "Due in 4–7 days",
  Later: "More than 7 days away",
};
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

/** Order needs its logistic ETA chased (Jess 2026-06-25, Q3): open + no ETA set
 *  + deadline ≤7 days out. Drives the red "No ETA" alert + the quick-view. */
function needsEta(o: operationOrderListRow): boolean {
  if (controlTabOf(o) === "completed") return false;
  if (logisticEtaOf(o)) return false;
  const diff = daysToDue(o);
  return diff !== null && diff <= 7;
}

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
// Next-action pill colours — restored to Jess's original proposal
// (carres_full_page_final_dateformat.html) so the five action tones read as
// five DISTINCT colours, not one washed-out red. Each = soft fill + strong
// ink + a matching border; carried inline so the shared global `.pill` stays put.
/* v4 §6 hues (tone SEMANTICS unchanged): red/amber/green/grey from the kit;
 * borders dropped (v4 pills are borderless — border mirrors the fill). The
 * blue info tone is the same known legacy as `.pill-sent` (v4 blue =
 * selection) — realigned when the scheduled-tone question is settled. */
const NEXT_TONE_STYLE: Record<NextTone, { text: string; bg: string; border: string }> = {
  danger: { text: "#A32D2D", bg: "#FCEBEB", border: "#FCEBEB" }, // chase / overdue — red
  warning: { text: "#854F0B", bg: "#FAEEDA", border: "#FAEEDA" }, // waiting stock — amber
  info: { text: "#1E40AF", bg: "#D3E4FB", border: "#D3E4FB" }, // call / assign — blue (LEGACY)
  success: { text: "#3B6D11", bg: "#EAF3DE", border: "#EAF3DE" }, // schedule delivery — green
  neutral: { text: "#6B7280", bg: "#F3F4F6", border: "#F3F4F6" }, // done — grey
};

function ovlOf(o: operationOrderListRow) {
  const raw = o.ops_order_control;
  return Array.isArray(raw) ? raw[0] : raw;
}

/** NEXT — one single-action verb per order, DUAL-TRACK (Jess spec §5, 2026-07-12):
 *  a stock track ∥ a logistic track, surfaced as the one most-urgent verb —
 *    Order PO → Chase supplier → Book logistic → Chase logistic → Confirm.
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

  const ready = stock.state === "ready" || stock.state === "in_stock";

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
    return { label: "Book logistic", tone: "info" };
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
const ORDER_COL_DEFS: OrderColDef[] = [
  { key: "orderId", label: "Order ID", w: 7 },
  { key: "ref", label: "Ref No", w: 8 },
  { key: "customer", label: "Customer", w: 14 },
  { key: "region", label: "Region", w: 8 },
  { key: "logistic", label: "Logistic", w: 11 },
  { key: "deadline", label: "Deadline", w: 13 },
  { key: "stock", label: "Stock", w: 13 },
  { key: "next", label: "Next", w: 20 },
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
  const [bulkMenu, setBulkMenu] = useState<null | "menu" | "assign">(null);
  // Filter dimensions stacked on top of the status tabs.
  const [dueFilter, setDueFilter] = useState<DueBucket | null>(null);
  const [regionFilter, setRegionFilter] = useState<string | null>(null);
  const [stockFilter, setStockFilter] = useState<StockBucket | null>(null);
  const [logisticFilter, setLogisticFilter] = useState<string | null>(null);
  // Multi-select (Jess 2026-07-02): pick more than one category pill; an order
  // matches if it hits ANY selected category (OR). Empty set = no filter.
  const [categoryFilter, setCategoryFilter] = useState<Set<string>>(new Set());
  // P1 (Loo 2026-07-09) — the left filter KANBAN open/collapsed toggle. (The
  // facet scroll container is now owned by <ListPageShell>.)
  const [kanbanOpen, setKanbanOpen] = useState(true);
  // GMAIL_FINAL C3 — per-group collapse; CATEGORY starts collapsed at the bottom.
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(
    () => new Set(["CATEGORY"]),
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
  // No-ETA quick-view (Jess 2026-06-25): open orders the logistic hasn't given a
  // delivery ETA for, with a near deadline — the chase list.
  const [etaOnly, setEtaOnly] = useState(false);
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
  // Live free-balance map (sku → available) from the Stock On-Hand source. Its
  // keys ARE the matchable catalog SKUs; AutoCount free-text SKUs are absent.
  // `undefined` until loaded → the Stock cell falls back to stage-only state.
  const stockQ = useOperationStock();
  const qc = useQueryClient();

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
    for (const o of orders) c[controlTabOf(o)] += 1;
    return c;
  }, [orders]);

  // AT A GLANCE (locked spec) — the facet's top health summary, computed over the
  // WHOLE live book (stable headline, not reactive to the status tab):
  //   • Outstanding = Σ money customers still owe HQ (ops_order_control.balance > 0)
  //   • At-risk     = open orders past the safe line (slackDays < 0 — the frozen
  //                   engine's deadline+stock danger score; reused, no new logic)
  //   • On-time     = open orders still with buffer (slackDays ≥ 0)
  const glance = useMemo(() => {
    let outstanding = 0;
    let atRisk = 0;
    let onTime = 0;
    for (const o of orders) {
      const bal = Number(ovlOf(o)?.balance ?? 0);
      if (bal > 0) outstanding += bal;
      if (controlTabOf(o) === "completed") continue;
      if (slackDays(o) < 0) atRisk += 1;
      else onTime += 1;
    }
    return { outstanding, atRisk, onTime };
  }, [orders]);

  // Status-tab filter first; the Urgent chip + region pills layer on top (all
  // stackable). The chip/region counts are computed over the tab-filtered set
  // so they reflect the current view.
  const tabFiltered = useMemo(
    () => (tab === "all" ? orders : orders.filter((o) => controlTabOf(o) === tab)),
    [orders, tab],
  );
  const flaggedCount = useMemo(() => tabFiltered.filter(hasOpenTask).length, [tabFiltered, tasksByOrder]);
  const escalateCount = useMemo(() => tabFiltered.filter(hasEscalatedTask).length, [tabFiltered, tasksByOrder]);
  const etaCount = useMemo(() => tabFiltered.filter(needsEta).length, [tabFiltered]);
  const dueEntries = useMemo(() => {
    const m = new Map<DueBucket, number>();
    for (const o of tabFiltered) {
      const b = dueBucketOf(o);
      if (b) m.set(b, (m.get(b) ?? 0) + 1);
    }
    return DUE_BUCKETS.filter((b) => m.has(b)).map((b) => ({
      bucket: b,
      count: m.get(b) ?? 0,
    }));
  }, [tabFiltered]);
  const regionEntries = useMemo(() => {
    const m = new Map<string, number>();
    for (const o of tabFiltered) {
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
  }, [tabFiltered]);
  const stockEntries = useMemo(() => {
    const m = new Map<StockBucket, number>();
    for (const o of tabFiltered) {
      const b = stockBucketOf(o, availableBySku);
      m.set(b, (m.get(b) ?? 0) + 1);
    }
    return STOCK_BUCKETS.filter((b) => m.has(b)).map((b) => ({
      bucket: b,
      count: m.get(b) ?? 0,
    }));
  }, [tabFiltered, availableBySku]);

  const logisticEntries = useMemo(() => {
    const m = new Map<string, number>();
    for (const o of tabFiltered) {
      const key = logisticOf(o, partnerName) ?? NO_CARRIER;
      m.set(key, (m.get(key) ?? 0) + 1);
    }
    // Unassigned FIRST (most urgent — no carrier yet), then the rest by count
    // desc (Loo 2026-07-09). Display order only; the filter is unchanged.
    return [...m.entries()]
      .sort((a, b) => {
        if (a[0] === NO_CARRIER) return -1;
        if (b[0] === NO_CARRIER) return 1;
        return b[1] - a[1];
      })
      .map(([carrier, count]) => ({ carrier, count }));
  }, [tabFiltered, partnerName]);

  const categoryEntries = useMemo(
    () =>
      CATEGORY_OPTS.map((opt) => ({
        key: opt.key,
        label: opt.label,
        count: tabFiltered.filter(opt.match).length,
      })),
    [tabFiltered],
  );

  const visible = useMemo(() => {
    let r = tabFiltered;
    if (flaggedOnly) r = r.filter(hasOpenTask);
    if (escalateOnly) r = r.filter(hasEscalatedTask);
    if (etaOnly) r = r.filter(needsEta);
    if (dueFilter) r = r.filter((o) => dueBucketOf(o) === dueFilter);
    if (regionFilter) r = r.filter((o) => regionBucket(o.customer_address ?? null) === regionFilter);
    if (stockFilter) r = r.filter((o) => stockBucketOf(o, availableBySku) === stockFilter);
    if (logisticFilter)
      r = r.filter((o) => (logisticOf(o, partnerName) ?? NO_CARRIER) === logisticFilter);
    if (categoryFilter.size > 0) {
      const opts = CATEGORY_OPTS.filter((c) => categoryFilter.has(c.key));
      r = r.filter((o) => opts.some((c) => c.match(o)));
    }
    return [...r].sort(compareBySlack);
  }, [tabFiltered, flaggedOnly, escalateOnly, etaOnly, dueFilter, regionFilter, stockFilter, logisticFilter, categoryFilter, availableBySku, partnerName, tasksByOrder]);

  // Most-recent order/import time → shown next to the count.
  const latestIn = useMemo(() => {
    let mx: string | null = null;
    for (const o of orders) if (o.placed_at && (!mx || o.placed_at > mx)) mx = o.placed_at;
    return mx;
  }, [orders]);

  // Reset the render window to the first batch whenever the filtered set changes.
  useEffect(
    () => setRenderCount(ROWS_PER_BATCH),
    [tab, search, dueFilter, flaggedOnly, escalateOnly, etaOnly, regionFilter, stockFilter, logisticFilter, categoryFilter],
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
    !!regionFilter ||
    !!dueFilter ||
    categoryFilter.size > 0 ||
    etaOnly ||
    flaggedOnly ||
    escalateOnly;

  function resetFilters() {
    setSearch("");
    setStockFilter(null);
    setLogisticFilter(null);
    setRegionFilter(null);
    setDueFilter(null);
    setCategoryFilter(new Set());
    setEtaOnly(false);
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
  if (dueFilter) activeChips.push({ label: `Due: ${dueFilter}`, onClear: () => setDueFilter(null) });
  if (etaOnly) activeChips.push({ label: "No ETA", onClear: () => setEtaOnly(false) });
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
          /* ONE-row toolbar, right cluster in this exact order:
             N of M · + Master · + AutoCount · ⋮ (the overflow sits at the far
             corner; its menu = Show columns, with room for Density/Export). */
          <>
            {total > 0 && (
              <span
                className="text-[12px] text-base-500 tabular-nums"
                title="Rows loaded / total in this tab"
              >
                {Math.min(shown.length, total)} of {total}
              </span>
            )}
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
              onFlag={bulkCreateTasks}
              onExport={exportSelectedCsv}
              onPrint={printSelected}
              onComplete={bulkMarkCompleted}
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
              {/* SUMMARY — whole-book health (Outstanding · at-risk · on-time). The
                  ‹ on its title bar collapses the entire filter panel. */}
              <KanbanGroup
                title="SUMMARY"
                collapsed={collapsedGroups.has("SUMMARY")}
                onToggle={() => toggleGroup("SUMMARY")}
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
                {[
                  {
                    label: "Outstanding",
                    value: `RM ${Math.round(glance.outstanding).toLocaleString("en-MY")}`,
                    cls: glance.outstanding > 0 ? "text-danger" : "text-base-600",
                  },
                  { label: "At-risk", value: String(glance.atRisk), cls: glance.atRisk > 0 ? "text-warning" : "text-base-600" },
                  { label: "On-time", value: String(glance.onTime), cls: "text-success" },
                ].map((s) => (
                  <div key={s.label} className="flex items-center justify-between px-2.5 py-1">
                    <span className="text-[13px] text-base-700">{s.label}</span>
                    <span className={`text-[13px] font-bold tabular-nums ${s.cls}`}>{s.value}</span>
                  </div>
                ))}
              </KanbanGroup>

              {/* CHASE NOW — the triage lane (title reads dark red). */}
              <KanbanGroup
                title="CHASE NOW"
                danger
                total={
                  etaCount +
                  (stockEntries.find((e) => e.bucket === "No PO")?.count ?? 0) +
                  (logisticEntries.find((e) => e.carrier === NO_CARRIER)?.count ?? 0) +
                  (regionEntries.find((e) => e.region === OTHERS_LABEL)?.count ?? 0) +
                  (dueEntries.find((e) => e.bucket === "Urgent")?.count ?? 0) +
                  flaggedCount +
                  escalateCount
                }
                collapsed={collapsedGroups.has("CHASE NOW")}
                onToggle={() => toggleGroup("CHASE NOW")}
              >
                <KanbanRow
                  label="No ETA"
                  count={etaCount}
                  active={etaOnly}
                  title="Logistic hasn't given an ETA + deadline near (≤7d) — chase them"
                  onClick={() => setEtaOnly((v) => !v)}
                />
                <KanbanRow
                  label="No PO"
                  count={stockEntries.find((e) => e.bucket === "No PO")?.count ?? 0}
                  active={stockFilter === "No PO"}
                  onClick={() => setStockFilter((r) => (r === "No PO" ? null : "No PO"))}
                />
                {/* Unassigned (no carrier) moved here from LOGISTIC — no carrier
                    yet ⇒ needs chasing (Jess 2026-07-10). */}
                <KanbanRow
                  label="Unassigned"
                  count={logisticEntries.find((e) => e.carrier === NO_CARRIER)?.count ?? 0}
                  active={logisticFilter === NO_CARRIER}
                  title="No logistic partner assigned yet — assign / chase"
                  onClick={() => setLogisticFilter((r) => (r === NO_CARRIER ? null : NO_CARRIER))}
                />
                {/* "No region" = region couldn't be read from the address (was the
                    vague "Others" under REGION) — surfaced here to fix (Jess). */}
                <KanbanRow
                  label="No region"
                  count={regionEntries.find((e) => e.region === OTHERS_LABEL)?.count ?? 0}
                  active={regionFilter === OTHERS_LABEL}
                  title="Delivery region couldn't be read from the address — check it"
                  onClick={() => setRegionFilter((r) => (r === OTHERS_LABEL ? null : OTHERS_LABEL))}
                />
                <KanbanRow
                  label="Urgent"
                  count={dueEntries.find((e) => e.bucket === "Urgent")?.count ?? 0}
                  active={dueFilter === "Urgent"}
                  title={DUE_DESC.Urgent}
                  onClick={() => setDueFilter((r) => (r === "Urgent" ? null : "Urgent"))}
                />
                <KanbanRow
                  label="Follow-up"
                  count={flaggedCount}
                  active={flaggedOnly}
                  title="Orders with an open follow-up note for the next operator"
                  onClick={() => setFlaggedOnly((v) => !v)}
                />
                <KanbanRow
                  label="For Jess"
                  count={escalateCount}
                  active={escalateOnly}
                  title="Escalated to Jess — orders needing the boss's action"
                  onClick={() => setEscalateOnly((v) => !v)}
                />
              </KanbanGroup>

              <KanbanGroup
                title="STOCK"
                total={stockEntries
                  .filter((e) => e.bucket !== "No PO")
                  .reduce((s, e) => s + e.count, 0)}
                collapsed={collapsedGroups.has("STOCK")}
                onToggle={() => toggleGroup("STOCK")}
              >
                {/* "No PO" lives in CHASE NOW — not repeated here (Jess 2026-07-10). */}
                {stockEntries
                  .filter((e) => e.bucket !== "No PO")
                  .map((e) => (
                    <KanbanRow
                      key={e.bucket}
                      label={e.bucket}
                      count={e.count}
                      active={stockFilter === e.bucket}
                      onClick={() => setStockFilter((r) => (r === e.bucket ? null : e.bucket))}
                    />
                  ))}
              </KanbanGroup>

              <KanbanGroup
                title="LOGISTIC"
                testid="filter-logistic"
                total={logisticEntries
                  .filter((e) => e.carrier !== NO_CARRIER)
                  .reduce((s, e) => s + e.count, 0)}
                collapsed={collapsedGroups.has("LOGISTIC")}
                onToggle={() => toggleGroup("LOGISTIC")}
              >
                {/* Unassigned moved to CHASE NOW — here only real carriers (Jess). */}
                {logisticEntries
                  .filter((e) => e.carrier !== NO_CARRIER)
                  .map((e) => (
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
                title="REGION"
                total={regionEntries
                  .filter((e) => e.region !== OTHERS_LABEL)
                  .reduce((s, e) => s + e.count, 0)}
                collapsed={collapsedGroups.has("REGION")}
                onToggle={() => toggleGroup("REGION")}
              >
                {/* "Others" (no region) moved to CHASE NOW as "No region" — here
                    only real regions (Jess 2026-07-10). */}
                {regionEntries
                  .filter((e) => e.region !== OTHERS_LABEL)
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

              {/* CATEGORY — its own group at the bottom, collapsed by default.
                  No total (category matches overlap → the sum misleads). */}
              <KanbanGroup
                title="CATEGORY"
                collapsed={collapsedGroups.has("CATEGORY")}
                onToggle={() => toggleGroup("CATEGORY")}
              >
                {categoryEntries.map((e) => (
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
          </SectionCard>
        }
      >
          {/* Listing — the ONLY scroll area (the page stays put, only the rows
              scroll). table-fixed + a colgroup → columns keep their width. */}
      <div
        ref={listBoxRef}
        className="flex-1 min-h-0 bg-white border border-[rgba(34,31,32,0.10)] rounded-t-lg rounded-b-none shadow-[0_1px_2px_rgba(34,31,32,0.04),0_4px_16px_rgba(34,31,32,0.05)] overflow-auto"
      >
        <table
          /* UI-KIT v4 §8b (LOCKED): rows are 44px FIXED — content adapts to
             the row, never the reverse. whitespace-nowrap kills the silent
             row-growers (text WRAPPING inside narrow fixed columns — "SO-1112"
             at a 31px column folded to 2 lines and pushed rows to 48/57px);
             stacked multi-DIV cells (ref ≤2 lines, logistic, deadline) still
             stack, each line just ellipsises. Keep in sync with
             design-standard.ts ROW.heightPx. */
          className="w-full border-collapse text-[13px] table-fixed [&_td]:h-[44px] [&_td]:py-1 [&_td]:align-middle [&_td]:overflow-hidden [&_td]:whitespace-nowrap"
        >
          {/* PERCENTAGE colgroup (Loo 2026-07-09) — table-fixed + w-full + % widths
              so the table is ALWAYS exactly the container width → it NEVER
              horizontally scrolls on any screen; long content ellipsis-truncates.
              Data columns take a small share (tight groups); Manage takes the
              largest (its future multi-line message). Order: ☐ · ⚑ · Order ID ·
              Ref No · Customer · Region · Logistic · ETA · Deadline · Stock ·
              Manage. */}
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
              className="border-b"
              style={{ backgroundColor: "#F8F6F1", borderBottomColor: "rgba(34,31,32,0.14)" }}
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
                  className="cursor-pointer accent-base-700 align-middle"
                />
              </th>
              <th className="px-1 py-1.5 text-center" title="Follow-up">
                <Flag size={13} strokeWidth={2} className="inline text-base-400" aria-label="Follow-up" />
              </th>
              {showCol("orderId") && <Th>Order ID</Th>}
              {showCol("ref") && <Th>Ref No</Th>}
              {showCol("customer") && <Th>Customer</Th>}
              {showCol("region") && <Th>Region</Th>}
              {showCol("logistic") && <Th>Logistic</Th>}
              {showCol("deadline") && <Th>Deadline</Th>}
              {showCol("stock") && <Th>Stock</Th>}
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
                hasPendingChange={pendingCROrders.has(o.id)}
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
  onFlag,
  onExport,
  onPrint,
  onComplete,
  onClear,
  busy,
}: {
  count: number;
  total: number;
  tabLabel: string;
  allChecked: boolean;
  someChecked: boolean;
  onSelectAllInTab: () => void;
  menu: null | "menu" | "assign";
  setMenu: (m: null | "menu" | "assign") => void;
  partners: { id: string; name: string }[];
  onAssign: (partnerId: string) => void;
  onFlag: () => void;
  onExport: () => void;
  onPrint: () => void;
  onComplete: () => void;
  onClear: () => void;
  busy: boolean;
}) {
  const btn =
    "inline-flex items-center gap-1 text-[13px] px-2 py-1 rounded-md hover:bg-white/70 disabled:opacity-50";
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
      {/* Assign logistic — inline dropdown of partners. */}
      <div className="relative">
        <button
          type="button"
          onClick={() => setMenu(menu === "assign" ? null : "assign")}
          disabled={busy}
          className={btn}
        >
          <Truck size={14} /> Assign logistic <ChevronDown size={12} />
        </button>
        {menu === "assign" && (
          <div className="absolute left-0 top-full mt-1 z-30 w-56 bg-white text-base-900 rounded-md shadow-lg border border-base-200 py-1 max-h-72 overflow-auto">
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
                className="w-full text-left px-2 py-1.5 text-[12px] hover:bg-base-100"
              >
                {p.name}
              </button>
            ))}
          </div>
        )}
      </div>
      {/* Flag for follow-up (creates a follow-up task per selected order). */}
      <button type="button" onClick={onFlag} disabled={busy} className={btn}>
        <Flag size={14} /> Flag
      </button>
      {/* Export ▾ — CSV / Print / Mark delivered. */}
      <div className="relative">
        <button
          type="button"
          onClick={() => setMenu(menu === "menu" ? null : "menu")}
          disabled={busy}
          className={btn}
        >
          <Download size={14} /> Export <ChevronDown size={12} />
        </button>
        {menu === "menu" && (
          <div className="absolute left-0 top-full mt-1 z-30 w-56 bg-white text-base-900 rounded-md shadow-lg border border-base-200 py-1 max-h-72 overflow-auto">
            <BulkMenuItem icon={Download} label="Export CSV" onClick={onExport} />
            <BulkMenuItem icon={Printer} label="Print / Save as PDF" onClick={onPrint} />
            <BulkMenuItem
              icon={CheckCircle2}
              label={busy ? "Working…" : "Mark delivered"}
              onClick={onComplete}
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
  onClick,
}: {
  icon: LucideIcon;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full flex items-center gap-2 px-2 py-2 text-[12px] hover:bg-base-100"
    >
      <Icon size={14} className="text-base-500" /> {label}
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
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
  title?: string;
}) {
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
      <span
        className="flex-1 min-w-0 truncate text-[13px]"
        style={{ color: active ? "#0B0B0B" : "#3C4043", fontWeight: active ? 700 : 400 }}
      >
        {label}
      </span>
      <span
        className="text-[13px] tabular-nums shrink-0"
        style={{ color: active ? "#0B0B0B" : "#5F6368", fontWeight: active ? 700 : 400 }}
      >
        {count}
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
      <SectionBand
        title={title}
        danger={danger}
        collapsed={collapsed}
        onToggle={onToggle}
        total={total}
        right={headerRight}
      />
      {!collapsed && <div className="flex flex-col gap-0.5 mt-0.5">{children}</div>}
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
    <div data-testid="filter-status" className="flex items-center gap-1 flex-wrap">
      {tabs.map((t) => {
        const on = active === t.key;
        const Icon = TAB_ICON[t.key];
        return (
          <button
            key={t.key}
            type="button"
            onClick={() => onSelect(t.key)}
            title={t.title}
            className={`inline-flex items-center gap-1.5 px-3 pt-1.5 pb-1 border-b-2 transition-colors text-[13px] ${
              on
                ? "border-[#1A1A1A] text-[#1A1A1A] font-semibold"
                : "border-transparent text-base-500 font-medium hover:text-base-800"
            }`}
          >
            <Icon size={16} strokeWidth={2} className="shrink-0" aria-hidden="true" />
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
  hasPendingChange,
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
  /** 0234 (add-product P3.1) — a dealer product change awaits approval. */
  hasPendingChange?: boolean;
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
      {/* Order ID — the system SO number (13px ink, tabular). Phone tooltip lives
          here; paired tight with the Ref No column to its right. */}
      {showCol("orderId") && (
      <td className="pl-1 pr-1 py-1.5" title={o.customer_phone ?? undefined}>
        <span
          className="font-mono tabular-nums"
          style={{ fontSize: "13px", fontWeight: 500, color: "#1A1A1A" }}
        >
          SO-{o.so}
        </span>
        {/* 0234 — a dealer product change awaits approval (open the order →
            the approval card sits at the top of the drawer). */}
        {hasPendingChange && (
          <span
            className="ml-1 inline-block align-middle rounded-full px-1.5 py-0.5 text-[10px] font-semibold bg-warning-soft text-base-800 border border-warning"
            title="Product change awaiting approval — open the order to decide"
            data-testid="oc-change-badge"
          >
            Change
          </span>
        )}
      </td>
      )}
      {/* Ref No — the day-to-day reference(s), the PRIMARY identifier. v4 §8b:
          the row is 44px FIXED, so at most 2 refs show (2×16px lines fit);
          the rest fold to "+N" ON the second line — content adapts to the
          row, never the other way. Full list stays in the title tooltip. */}
      {showCol("ref") && (
      <td className="px-1 py-1.5">
        {ref.length === 0 ? (
          <span className="text-base-300">—</span>
        ) : (
          /* Closed set: REF = row EMPHASIS (13/600 ink); "+N" = caption. */
          <div className="font-mono" style={{ lineHeight: "16px" }} title={ref.join("\n")}>
            <div className="truncate tabular-nums t4-row-strong">{ref[0]}</div>
            {ref.length === 2 ? (
              <div className="truncate tabular-nums t4-row-strong">{ref[1]}</div>
            ) : ref.length > 2 ? (
              <div className="t4-caption">+{ref.length - 1} more</div>
            ) : null}
          </div>
        )}
      </td>
      )}
      {/* Customer — identity trio (tight to Ref); single-line ellipsis (P2). */}
      {showCol("customer") && (
      <td className="pl-1 pr-2 py-2">
        {o.customer_name ? (
          /* Closed set: the NAME is row EMPHASIS (the sample's bold company). */
          <span
            className={`${cjkClassName(o.customer_name)} t4-row-strong block truncate`}
            title={o.customer_name}
          >
            {o.customer_name}
          </span>
        ) : (
          <span className="text-base-300">—</span>
        )}
      </td>
      )}
      {/* Region — its own group; gap before it separates it from the identity trio. */}
      {showCol("region") && (
      <td className="pl-4 pr-2 py-2">
        {loc.label ? (
          /* Closed set: region = row content, ink (the outstation gold tint
             was decoration — the tooltip + MiniBadge carry that signal). */
          <span
            className="t4-row block truncate"
            title={
              loc.area === "Outstation"
                ? "Outstation — no warehouse buffer; call the customer to confirm the ETA before ordering stock (do it in the order drawer)."
                : loc.label ?? undefined
            }
          >
            {loc.label}
          </span>
        ) : (
          <span className="text-base-400">—</span>
        )}
      </td>
      )}
      {/* Logistic — partner tag + delivery-date state machine (伙伴 + 送货日):
          — unassigned · no date yet (grey) · call now (red, ≤3d window) ·
          Deliver <date> (green, booked) · Delivered ✓. Never "by". */}
      {showCol("logistic") && (
      <td className="pl-4 pr-1 py-2 whitespace-nowrap leading-[1.25]">
        {logi.key === "unassigned" ? (
          <span className="t4-caption text-[13px]">— unassigned</span>
        ) : (
          <>
            {/* Closed set: partner name = row content (ink); the sub-line is a
                STATUS signal so it keeps colour — v4 hues only. */}
            <span className="t4-row block truncate">{logi.partner}</span>
            <div style={{ marginTop: 1 }}>
              {logi.key === "delivered" ? (
                <span style={{ fontSize: "11px", fontWeight: 600, color: "#3B6D11" }}>
                  Delivered ✓
                </span>
              ) : logi.key === "scheduled" && logi.date ? (
                <span
                  className="tabular-nums"
                  style={{ fontSize: "12px", fontWeight: 600, color: "#3B6D11" }}
                >
                  Deliver {fmtDate(logi.date).split(", ")[0]}
                </span>
              ) : logi.key === "call_now" ? (
                <span style={{ fontSize: "11px", fontWeight: 700, color: "#A32D2D" }}>
                  call now
                </span>
              ) : (
                <span style={{ fontSize: "11px", fontWeight: 600, color: "#A8A8A8" }}>
                  no date yet
                </span>
              )}
            </div>
          </>
        )}
      </td>
      )}
      {/* Deadline — three distinct segments: date (bold, red when hot) · weekday
          (grey) · a faint days-left pill (-Nd / today / Nd / over). */}
      {showCol("deadline") && (
      <td
        className="pl-1 pr-2 py-2 leading-[1.2] whitespace-nowrap"
        title="Customer's requested delivery date + days left. Stock at the warehouse 7 days before; logistic contacts the customer 2–3 days before."
      >
        {o.delivery_date_tbd ? (
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
      {/* Stock — its own group; gap before it separates it from the logistic trio. */}
      {showCol("stock") && (
      <td className="pl-4 pr-2 py-2 whitespace-nowrap">
        <StockDot info={stock} coreTotal={msQty + bfQty + sofaQty} se={se} />
      </td>
      )}
      {/* Next action — the most-urgent next step (one pill) + Gmail-style hover
          actions (open / flag / assign) that appear on row hover (P2 F). */}
      {showCol("next") && (
      <td className="pl-2 pr-2 py-2 whitespace-nowrap relative">
        {(() => {
          const na = nextActionOf(o, stock, lines);
          const st = NEXT_TONE_STYLE[na.tone];
          return (
            <span
              className="inline-flex items-center gap-1 rounded-full align-middle max-w-full group-hover:opacity-0 transition-opacity"
              style={{
                fontSize: "11px",
                fontWeight: 600,
                letterSpacing: "0.01em",
                padding: "2px 9px",
                color: st.text,
                background: st.bg,
                border: `1px solid ${st.border}`,
              }}
              data-next-action={na.label}
            >
              {na.locked && <Lock size={11} strokeWidth={2.5} className="shrink-0" aria-hidden="true" />}
              <span className="truncate min-w-0">{na.label}</span>
            </span>
          );
        })()}
        {/* Hover actions — hidden until the row is hovered (Gmail pattern). */}
        <div
          className="absolute right-1 top-1/2 -translate-y-1/2 hidden group-hover:flex items-center gap-0.5 rounded-md border border-base-200 bg-white shadow-sm px-0.5 py-0.5"
          onClick={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            onClick={onOpen}
            title="Open order"
            aria-label="Open order"
            className="p-1 rounded text-base-500 hover:bg-base-100 hover:text-base-800"
          >
            <ExternalLink size={13} />
          </button>
          <button
            type="button"
            onClick={() => onFlag(o)}
            title="Flag for follow-up"
            aria-label="Flag for follow-up"
            className="p-1 rounded text-base-500 hover:bg-base-100 hover:text-base-800"
          >
            <Flag size={13} />
          </button>
          <button
            type="button"
            onClick={onOpen}
            title="Assign logistic (opens the order)"
            aria-label="Assign logistic"
            className="p-1 rounded text-base-500 hover:bg-base-100 hover:text-base-800"
          >
            <Truck size={13} />
          </button>
        </div>
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

// STOCK cell = a 3-state pill (Partial merged into Waiting) + a CORE-only
// received/total ratio (Loo 2026-07-09). Colours reuse Jess's proposal legend
// (Ready green / Waiting amber / No PO red).
const STOCK_PILL: Record<
  "ready" | "waiting" | "no_po",
  { label: string; text: string; bg: string; border: string }
> = {
  ready: { label: "Ready", text: "#3B6D11", bg: "#EAF3DE", border: "#EAF3DE" },
  waiting: { label: "Waiting", text: "#854F0B", bg: "#FAEEDA", border: "#FAEEDA" },
  no_po: { label: "No PO", text: "#A32D2D", bg: "#FCEBEB", border: "#FCEBEB" },
};

/** Stock cell — a status pill (Ready / Waiting / No PO, Partial folded into
 *  Waiting) + a CORE-only arrival ratio `received/total`. Denominator = the
 *  order's Mattress+Bedframe+Sofa unit total (accessories don't gate delivery,
 *  so they're excluded). Numerator: Ready = all core, No PO = 0; Waiting shows
 *  "–" because the list payload carries no per-line GRN-received qty (esp.
 *  AutoCount orders). `data-stock-state` kept verbatim for the tests. */
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
  const S = STOCK_PILL[key];
  const num = key === "ready" ? String(coreTotal) : "0";

  // Supplier ETA line (stock_eta version) — shown only while waiting; coloured
  // vs the customer deadline: OVERDUE red · LATE orange · on-track grey · no-ETA
  // faint. Ready shows nothing (no ETA noise once the goods are in).
  const eta = (() => {
    if (key === "ready" || se.state === "ready" || se.state === "none") return null;
    // Colour carries the state (red=overdue · orange=late · grey=on-track), like
    // the DEADLINE pill — no text suffix, so the line stays short + never clips.
    if (se.state === "no_eta")
      return { text: "ETA —", color: "#A8A8A8", tip: "Waiting on stock — no supplier ETA entered yet" };
    if (!se.etaIso) return null;
    const d = fmtDate(se.etaIso).split(", ")[0];
    // v4 hues: red overdue · amber late; on-track is CONTENT (a date) → ink.
    if (se.state === "overdue")
      return { text: `ETA ${d}`, color: "#A32D2D", tip: "OVERDUE — supplier ETA has passed and the goods still aren't in" };
    if (se.state === "late")
      return { text: `ETA ${d}`, color: "#854F0B", tip: "LATE — supplier ETA is later than the deadline − 3 days" };
    return { text: `ETA ${d}`, color: "#1A1A1A", tip: "Supplier arrival ETA — on track" };
  })();

  return (
    <div className="leading-[1.3]">
      <span
        className="inline-flex items-center rounded-full whitespace-nowrap"
        style={{
          fontSize: "11px",
          fontWeight: 600,
          padding: "1px 9px",
          color: S.text,
          background: S.bg,
          border: `1px solid ${S.border}`,
        }}
        title={title}
        data-stock-state={info.state}
      >
        <span>{S.label}</span>
        {coreTotal > 0 && (
          <span className="tabular-nums" style={{ marginLeft: 6, fontWeight: 700 }}>
            {num}/{coreTotal}
          </span>
        )}
      </span>
      {eta && (
        <div
          className="tabular-nums"
          style={{ fontSize: "10.5px", fontWeight: 600, color: eta.color, marginTop: 1 }}
          title={eta.tip}
          data-stock-eta={se.state}
        >
          {eta.text}
        </div>
      )}
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
      style={{ color: "#4A4335", fontSize: "11px", letterSpacing: "0.04em" }}
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

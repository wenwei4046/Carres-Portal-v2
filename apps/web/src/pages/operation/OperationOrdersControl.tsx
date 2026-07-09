import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useParams } from "react-router-dom";
import {
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
import FollowUpForm from "./components/FollowUpForm";
import ImportStockEtaDialog from "./components/ImportStockEtaDialog";
import { TASKS_KEY } from "./components/rail/TasksPanel";
import type { OpsTask, OpsTasksListResponse } from "@carres/shared";
import type { OperationStage } from "./components/StageChip";
import {
  RefreshCw,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Filter,
  MoreVertical,
  Truck,
  Download,
  ListTodo,
  CheckCircle2,
  X,
  Flag,
  Lock,
  Printer,
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
// bottom (see compareByDeadline), so the live work shows first WITHOUT a separate
// "Open" tab (Jess 2026-06-29: dropped the Open meta-tab — it confused him).
const TABS: { key: ControlTab; label: string }[] = [
  { key: "all", label: "All" },
  { key: "placed", label: "Placed" },
  { key: "proceed", label: "Proceed" },
  { key: "pending", label: "Pending" },
  { key: "scheduled", label: "Scheduled" },
  { key: "completed", label: "Completed" },
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
  completed: "Completed",
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
const NEXT_TONE_STYLE: Record<NextTone, { text: string; bg: string; border: string }> = {
  danger: { text: "#991B1B", bg: "#FCE4E4", border: "#F3B4B4" }, // chase / overdue — red
  warning: { text: "#92400E", bg: "#FBE8C6", border: "#F0D08A" }, // waiting stock — amber
  info: { text: "#1E40AF", bg: "#D3E4FB", border: "#A9C8F2" }, // call / assign — blue
  success: { text: "#166534", bg: "#D6EFD9", border: "#A9D8B0" }, // schedule delivery — green
  neutral: { text: "#4B5563", bg: "#EAE7DF", border: "#D6D2C6" }, // done — grey
};

function ovlOf(o: operationOrderListRow) {
  const raw = o.ops_order_control;
  return Array.isArray(raw) ? raw[0] : raw;
}

/** The one action the operator should take next on an order. Priority (Jess
 *  2026-07-08): money is only chased once stock is READY and we're arranging
 *  delivery — an owing balance/storage then suppresses the green action and
 *  HOLDS dispatch (🔒). While stock isn't ready the order leads with its
 *  supplier / PO step (you don't chase payment before the goods even exist).
 *  ETA wording is logistic-only; the supplier line uses overdue / waiting /
 *  no-PO. "Supplier overdue" fires once we're inside the stock-arrival window
 *  and it still hasn't landed: MS/BF = deadline−7d, Sofa = deadline−5d. */
export function nextActionOf(
  o: operationOrderListRow,
  stock: StockInfo,
  lines: { sku: string; qty: number }[],
): NextAction {
  if (controlTabOf(o) === "completed") return { label: "Done", tone: "neutral" };

  const ready = stock.state === "ready" || stock.state === "in_stock";

  // Stock not secured yet → the supplier / PO step leads.
  if (!ready) {
    if (stock.state === "unknown") return { label: "No PO · order it", tone: "danger" };
    const dd = daysToDue(o);
    const hasMsbf = lines.some((l) => {
      const c = lineCategory(l.sku);
      return c === "mattress" || c === "bedframe";
    });
    const hasSofa = lines.some((l) => lineCategory(l.sku) === "sofa");
    const lead = hasMsbf ? 7 : hasSofa ? 5 : 7;
    if (dd !== null && dd < lead) return { label: "Supplier overdue", tone: "danger" };
    return { label: "Waiting stock", tone: "warning" };
  }

  // Stock READY → delivery stage. Payment hold: owing balance/storage holds it.
  const ovl = ovlOf(o);
  const owingBalance = Number(ovl?.balance ?? 0) > 0;
  const storageFee =
    (Number(ovl?.storage_fee_msbf) || 0) + (Number(ovl?.storage_fee_sof) || 0);
  const owingStorage =
    storageFee > 0 && !ovl?.storage_collected_at && ovl?.storage_waiver_status !== "approved";
  if (owingBalance) return { label: "Collect $ · balance", tone: "danger", locked: true };
  if (owingStorage) return { label: "Collect $ · storage", tone: "danger", locked: true };

  // Paid → arrange the delivery (assign → chase ETA → confirm customer → go).
  const hasLogistic = !!(o.delivery_partners?.name || o.ops_assigned_logistic);
  if (!hasLogistic) return { label: "Assign logistic", tone: "info" };
  if (!logisticEtaOf(o)) return { label: "Logistic · no ETA", tone: "info" };
  if (!ovl?.called_customer) return { label: "Call customer", tone: "info" };
  return { label: "Schedule delivery", tone: "success" };
}

/** Default sort — deadline ASCENDING (Jess P3): overdue/earliest first so the
 *  table reads as a work queue. TBD + undated sink to the bottom; within that
 *  tail (and on date ties) newest placed_at first, the old list default. */
function compareByDeadline(
  a: operationOrderListRow,
  b: operationOrderListRow,
): number {
  // Completed orders sink to the bottom (Jess 2026-06-29): the work-in-progress
  // shows first on the default "All" view; finished history sits at the end.
  const ca = controlTabOf(a) === "completed" ? 1 : 0;
  const cb = controlTabOf(b) === "completed" ? 1 : 0;
  if (ca !== cb) return ca - cb;
  const da = !a.delivery_date_tbd && a.delivery_date ? a.delivery_date : null;
  const db = !b.delivery_date_tbd && b.delivery_date ? b.delivery_date : null;
  if (da && db && da !== db) return da < db ? -1 : 1; // ISO dates compare lexically
  if (da && !db) return -1;
  if (!da && db) return 1;
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
  // Fixed at 20 rows/page (C1 redesign): ≥20 auto-enables the dense `compact`
  // layout. The listing is a fixed box that auto-scales (CSS zoom) so the rows
  // always fit, no scroll.
  const [pageSize] = useState<number | "all">(15);
  const [page, setPage] = useState(0);
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
  // P1 (Loo 2026-07-09) — the left filter KANBAN open/collapsed toggle.
  const [kanbanOpen, setKanbanOpen] = useState(true);
  // Scroll shadow — a faint top line appears once the kanban is scrolled down.
  const [kanbanScrolled, setKanbanScrolled] = useState(false);
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

  // Server applies the search; we always fetch the full list and bucket
  // client-side so every tab shows its true count.
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
    return [...r].sort(compareByDeadline);
  }, [tabFiltered, flaggedOnly, escalateOnly, etaOnly, dueFilter, regionFilter, stockFilter, logisticFilter, categoryFilter, availableBySku, partnerName, tasksByOrder]);

  // Most-recent order/import time → shown next to the count.
  const latestIn = useMemo(() => {
    let mx: string | null = null;
    for (const o of orders) if (o.placed_at && (!mx || o.placed_at > mx)) mx = o.placed_at;
    return mx;
  }, [orders]);

  // Reset to the first page whenever the filtered set changes.
  useEffect(
    () => setPage(0),
    [tab, search, pageSize, dueFilter, flaggedOnly, escalateOnly, etaOnly, regionFilter, stockFilter, logisticFilter, categoryFilter],
  );

  const total = visible.length;
  const pageCount =
    pageSize === "all" ? 1 : Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, pageCount - 1);
  const paged = useMemo(() => {
    if (pageSize === "all") return visible;
    const start = safePage * pageSize;
    return visible.slice(start, start + pageSize);
  }, [visible, pageSize, safePage]);
  const rangeStart = total === 0 ? 0 : safePage * (pageSize === "all" ? total : pageSize) + 1;
  const rangeEnd = pageSize === "all" ? total : Math.min(total, (safePage + 1) * pageSize);

  // Fixed listing — scale the whole table (CSS zoom) so every row of the page
  // fits the box with NO vertical scroll (Jess 2026-06-24: "fix listing, not
  // scroll; 15/30/45/60 → show smaller"). zoom reflows (font + row height shrink
  // together) and is set imperatively so it can't trigger a re-render loop.
  const listBoxRef = useRef<HTMLDivElement>(null);
  const listTableRef = useRef<HTMLTableElement>(null);
  useLayoutEffect(() => {
    const box = listBoxRef.current;
    const table = listTableRef.current;
    if (!box || !table) return;
    const fit = () => {
      table.style.zoom = "1";
      const natural = table.scrollHeight;
      const avail = box.clientHeight - 2; // small margin so a fit doesn't leave a 1px scrollbar
      // Scale down to fit, but never below a readable floor — past that (45/60
      // rows on a short screen) the box scrolls rather than hiding rows.
      table.style.zoom =
        avail > 0 && natural > avail ? String(Math.max(0.5, avail / natural)) : "1";
    };
    fit();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(fit);
    ro.observe(box);
    return () => ro.disconnect();
  }, [pageSize, safePage, paged]);

  // ── Bulk select (Gmail-style) ──────────────────────────────────────────────
  const pagedIds = useMemo(() => paged.map((o) => o.id), [paged]);
  const allPagedSelected =
    pagedIds.length > 0 && pagedIds.every((id) => selected.has(id));
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
    return (
      <OrderDetailDrawer
        orderId={openOrderId}
        onClose={() => setOpenOrderId(null)}
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

  return (
    <div
      className="h-full flex flex-col px-6 pt-6 pb-5 bg-[#ECE8E0]"
      data-testid="operation-orders-control"
    >
      {/* Header — title + count + search + import (fixed; does not scroll) */}
      <div className="flex items-center justify-between gap-4 mb-3 flex-wrap shrink-0">
        <div className="flex items-baseline gap-2.5 flex-wrap">
          <h1 className="t-h1 font-display">Orders</h1>
          <span className="text-[14px] font-medium text-base-500 tabular-nums">
            {orders.length} orders
          </span>
          {latestIn && (
            <span className="text-[12px] text-base-400" title="Most recent order / import">
              · last in {fmtDateShort(latestIn)}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2.5">
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="SO number or customer…"
            className="w-[230px] px-4 py-2 border border-base-200 rounded-full text-[13px] bg-white outline-none focus:border-base-700"
          />
          <button
            type="button"
            onClick={() => setEtaImportOpen(true)}
            className="btn-secondary text-[12px] whitespace-nowrap rounded-xl"
            title="Fill each order line's Stock ETA + status from your Master sheet"
          >
            Import from Master
          </button>
          {onImport && (
            <button
              type="button"
              onClick={onImport}
              className="btn-hero text-[12px] whitespace-nowrap rounded-xl"
            >
              + Import from AutoCount
            </button>
          )}
        </div>
      </div>

      {/* Toolbar — result count + bulk actions, full-width above the split (P2 D:
          keeps the kanban + table header on one line). */}
      <div className="shrink-0 mb-2">
        {selected.size > 0 ? (
          <BulkBar
            count={selected.size}
            menu={bulkMenu}
            setMenu={setBulkMenu}
            partners={partnersQ.data?.partners ?? []}
            onAssign={bulkAssignLogistic}
            onExport={exportSelectedCsv}
            onPrint={printSelected}
            onTasks={bulkCreateTasks}
            onComplete={bulkMarkCompleted}
            onClear={clearSel}
            busy={assignMut.isPending || taskMut.isPending || completeMut.isPending}
          />
        ) : (
          <div className="flex items-center justify-between gap-3">
            {/* H — STATUS pipeline as top horizontal tabs (Gmail Primary/Social). */}
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
            {total > 0 && (
              <Pager
                safePage={safePage}
                onPage={setPage}
                total={total}
                rangeStart={rangeStart}
                rangeEnd={rangeEnd}
                pageCount={pageCount}
                onRefresh={() => void refetch()}
              />
            )}
          </div>
        )}
      </div>

      {/* Body split (Loo 2026-07-09, P1) — a left FILTER KANBAN (240px, collapsible
          to a 28px rail) + the LIST column. The filter GROUPS + their state move
          here verbatim from the old top band; only the container changes (a
          vertical stack, chips wrap within 240). Regroup (CHASE NOW…) + the
          vertical-row chip restyle are P2 (deferred). */}
      <div className="flex-1 flex gap-4 min-h-0">
        {kanbanOpen ? (
          <aside
            className="w-[240px] shrink-0 flex flex-col gap-2 overflow-y-auto no-scrollbar pb-2"
            data-testid="orders-filter-kanban"
            onScroll={(e) => setKanbanScrolled(e.currentTarget.scrollTop > 2)}
            style={{
              boxShadow: kanbanScrolled
                ? "inset 0 8px 6px -7px rgba(34,31,32,0.14)"
                : undefined,
            }}
          >
            {/* One white card (P2 G) — Gmail-nav rows. No "Filters" label; the
                collapse chevron sits top-right. */}
            <div className="bg-white border rounded-[12px] p-1.5" style={{ borderColor: "#E5E1D8" }}>
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => setKanbanOpen(false)}
                  title="Collapse filters"
                  aria-label="Collapse filters"
                  className="p-1 rounded text-base-500 hover:bg-base-100"
                >
                  <ChevronLeft size={15} />
                </button>
              </div>

              {/* CHASE NOW — the triage lane (title reads dark red). */}
              <KanbanGroup
                title="CHASE NOW"
                danger
                total={
                  etaCount +
                  (stockEntries.find((e) => e.bucket === "No PO")?.count ?? 0) +
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
                total={stockEntries.reduce((s, e) => s + e.count, 0)}
                collapsed={collapsedGroups.has("STOCK")}
                onToggle={() => toggleGroup("STOCK")}
              >
                {stockEntries.map((e) => (
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
                total={logisticEntries.reduce((s, e) => s + e.count, 0)}
                collapsed={collapsedGroups.has("LOGISTIC")}
                onToggle={() => toggleGroup("LOGISTIC")}
              >
                {logisticEntries.map((e) => (
                  <KanbanRow
                    key={e.carrier}
                    label={e.carrier === NO_CARRIER ? "Unassigned" : e.carrier}
                    count={e.count}
                    active={logisticFilter === e.carrier}
                    title={e.carrier === NO_CARRIER ? "No logistic partner assigned yet — assign / chase" : undefined}
                    onClick={() => setLogisticFilter((r) => (r === e.carrier ? null : e.carrier))}
                  />
                ))}
              </KanbanGroup>

              <KanbanGroup
                title="REGION"
                total={regionEntries.reduce((s, e) => s + e.count, 0)}
                collapsed={collapsedGroups.has("REGION")}
                onToggle={() => toggleGroup("REGION")}
              >
                {regionEntries.map((e) => (
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
            </div>
          </aside>
        ) : (
          <button
            type="button"
            onClick={() => setKanbanOpen(true)}
            title="Show filters"
            aria-label="Show filters"
            data-testid="orders-filter-rail"
            className="w-[28px] shrink-0 self-start flex flex-col items-center gap-2 pt-1.5 pb-2 rounded-md border border-base-200 bg-white text-base-500 hover:text-base-800 hover:bg-base-100"
          >
            <Filter size={14} />
            <ChevronRight size={14} />
          </button>
        )}

        {/* List column — the scrolling listing (the toolbar moved full-width
            above the split so the kanban + table header line up, P2 D). */}
        <div className="flex-1 min-w-0 flex flex-col min-h-0">
          {/* Listing — the ONLY scroll area (the page stays put, only the rows
              scroll). table-fixed + a colgroup → columns keep their width. */}
      <div
        ref={listBoxRef}
        className="flex-1 min-h-0 bg-white border border-[rgba(34,31,32,0.10)] rounded-t-lg rounded-b-none shadow-[0_1px_2px_rgba(34,31,32,0.04),0_4px_16px_rgba(34,31,32,0.05)] overflow-auto no-scrollbar"
      >
        <table
          ref={listTableRef}
          className="w-full border-collapse text-[13px] table-fixed [&_td]:h-[50px] [&_td]:py-2 [&_td]:align-middle [&_td]:overflow-hidden"
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
            <col style={{ width: "7%" }} />
            <col style={{ width: "8%" }} />
            <col style={{ width: "14%" }} />
            <col style={{ width: "8%" }} />
            <col style={{ width: "6.5%" }} />
            <col style={{ width: "6.5%" }} />
            <col style={{ width: "12%" }} />
            <col style={{ width: "9%" }} />
            <col style={{ width: "23%" }} />
          </colgroup>
          {/* Dark ink header band (#221F20) — kept per Loo; the flame underline
              stays DROPPED (flame never enters the table), replaced by a faint
              light hairline. Light micro uppercase labels on the dark band. */}
          <thead>
            <tr
              className="border-b"
              style={{ backgroundColor: "#221F20", borderBottomColor: "rgba(201,197,187,0.22)" }}
            >
              <th className="px-2 py-1.5">
                <input
                  type="checkbox"
                  checked={allPagedSelected}
                  onChange={toggleAllPaged}
                  aria-label="Select all on this page"
                  className="cursor-pointer accent-base-900 align-middle"
                />
              </th>
              <th className="px-1 py-1.5 text-center" title="Follow-up">
                <Flag size={13} strokeWidth={2} className="inline text-[#C9C5BB]" aria-label="Follow-up" />
              </th>
              <Th>Order ID</Th>
              <Th>Ref No</Th>
              <Th>Customer</Th>
              <Th>Region</Th>
              <Th>Logistic</Th>
              <Th>ETA</Th>
              <Th>Deadline</Th>
              <Th>Stock</Th>
              <Th>Manage</Th>
            </tr>
          </thead>
          <tbody>
            {total === 0 && (
              <tr>
                <td
                  colSpan={11}
                  className="p-12 text-center text-[12px] text-base-500"
                >
                  No orders in this tab.
                </td>
              </tr>
            )}
            {paged.map((o) => (
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
              />
            ))}
          </tbody>
        </table>
          </div>
          {/* /list column */}
        </div>
        {/* /body split */}
      </div>

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

    </div>
  );
}

function Pager({
  safePage,
  onPage,
  total,
  rangeStart,
  rangeEnd,
  pageCount,
  onRefresh,
}: {
  safePage: number;
  onPage: (updater: (p: number) => number) => void;
  total: number;
  rangeStart: number;
  rangeEnd: number;
  pageCount: number;
  onRefresh: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 mb-2.5 text-[12px] text-base-600">
      {/* Left — refresh + the rows-per-page selector (Jess 2026-06-24: the box is
          fixed, more rows ⇒ smaller rows, no scroll). */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onRefresh}
          title="Refresh"
          aria-label="Refresh orders"
          className="p-1.5 rounded text-base-500 hover:text-base-900 hover:bg-base-100 transition-colors"
        >
          <RefreshCw size={15} strokeWidth={2} />
        </button>
      </div>
      {/* Range + prev/next (right) */}
      <div className="flex items-center gap-1.5">
        <span className="tabular-nums text-base-500 mr-1">
          {rangeStart}–{rangeEnd} of {total}
        </span>
        <button
          type="button"
          disabled={safePage <= 0}
          onClick={() => onPage((p) => Math.max(0, p - 1))}
          aria-label="Previous page"
          className="p-1 rounded text-base-600 disabled:opacity-30 enabled:hover:bg-base-100 transition-colors"
        >
          <ChevronLeft size={18} strokeWidth={2} />
        </button>
        <button
          type="button"
          disabled={safePage >= pageCount - 1}
          onClick={() => onPage((p) => Math.min(pageCount - 1, p + 1))}
          aria-label="Next page"
          className="p-1 rounded text-base-600 disabled:opacity-30 enabled:hover:bg-base-100 transition-colors"
        >
          <ChevronRight size={18} strokeWidth={2} />
        </button>
      </div>
    </div>
  );
}

/** Gmail-style bulk-action bar — shown when ≥1 order is selected. A ⋮ menu
 *  expands to: Assign logistic (→ partner list) · Export CSV · Create tasks. */
function BulkBar({
  count,
  menu,
  setMenu,
  partners,
  onAssign,
  onExport,
  onPrint,
  onTasks,
  onComplete,
  onClear,
  busy,
}: {
  count: number;
  menu: null | "menu" | "assign";
  setMenu: (m: null | "menu" | "assign") => void;
  partners: { id: string; name: string }[];
  onAssign: (partnerId: string) => void;
  onExport: () => void;
  onPrint: () => void;
  onTasks: () => void;
  onComplete: () => void;
  onClear: () => void;
  busy: boolean;
}) {
  return (
    <div className="flex items-center gap-2 mb-2.5 px-2 py-2 rounded bg-base-900 text-white">
      <span className="text-[12px] font-semibold tabular-nums">
        {count} selected
      </span>
      <div className="relative">
        <button
          type="button"
          onClick={() => setMenu(menu ? null : "menu")}
          disabled={busy}
          className="inline-flex items-center gap-1 text-[12px] px-2 py-1 rounded hover:bg-white/10 disabled:opacity-50"
        >
          <MoreVertical size={14} /> {busy ? "Working…" : "Actions"}
        </button>
        {menu && (
          <div className="absolute left-0 top-full mt-1 z-30 w-56 bg-white text-base-900 rounded-md shadow-lg border border-base-200 py-1 max-h-72 overflow-auto">
            {menu === "menu" ? (
              <>
                <BulkMenuItem icon={Truck} label="Assign logistic…" onClick={() => setMenu("assign")} />
                <BulkMenuItem icon={Download} label="Export CSV" onClick={onExport} />
                <BulkMenuItem icon={Printer} label="Print / Save as PDF" onClick={onPrint} />
                <BulkMenuItem icon={ListTodo} label="Create follow-up tasks" onClick={onTasks} />
                <BulkMenuItem icon={CheckCircle2} label="Mark completed" onClick={onComplete} />
              </>
            ) : (
              <>
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
                <button
                  type="button"
                  onClick={() => setMenu("menu")}
                  className="w-full text-left px-2 py-1.5 text-[11px] text-base-500 hover:bg-base-100 border-t border-base-100 mt-1"
                >
                  ← Back
                </button>
              </>
            )}
          </div>
        )}
      </div>
      <button
        type="button"
        onClick={onClear}
        className="ml-auto inline-flex items-center gap-1 text-[12px] text-base-300 hover:text-white"
      >
        <X size={14} /> Clear
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
 *  (#F1EFE8, radius 6) with the group total on the right + a collapse toggle
 *  (▾ open / ▸ collapsed). CHASE NOW's title reads dark red; all other titles
 *  are black. `testid` keeps `filter-logistic` addressable for the tests. */
function KanbanGroup({
  title,
  danger,
  total,
  collapsed,
  onToggle,
  testid,
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
  children: React.ReactNode;
}) {
  return (
    <div data-testid={testid} className="mb-1">
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center gap-1 rounded-md px-2 py-1.5 hover:brightness-[0.97]"
        style={{ background: "#F1EFE8" }}
      >
        {collapsed ? (
          <ChevronRight size={12} className="shrink-0 text-base-500" />
        ) : (
          <ChevronDown size={12} className="shrink-0 text-base-500" />
        )}
        <span
          className="uppercase flex-1 text-left"
          style={{
            fontSize: "11px",
            fontWeight: 700,
            letterSpacing: "0.04em",
            color: danger ? "#991B1B" : "#221F20",
          }}
        >
          {title}
        </span>
        {total !== undefined && (
          <span
            className="tabular-nums shrink-0"
            style={{ fontSize: "11px", fontWeight: 600, color: "#6F6960" }}
          >
            {total}
          </span>
        )}
      </button>
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
  return (
    <div data-testid="filter-status" className="flex items-center gap-0.5 flex-wrap">
      {tabs.map((t) => {
        const on = active === t.key;
        return (
          <button
            key={t.key}
            type="button"
            onClick={() => onSelect(t.key)}
            title={t.title}
            className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full transition-colors"
            style={{
              fontSize: "13px",
              fontWeight: on ? 600 : 500,
              color: on ? "#FFFFFF" : "#4B5563",
              background: on ? "#221F20" : "#FFFFFF",
              border: on ? "1px solid #221F20" : "1px solid #DDD8CE",
            }}
          >
            {t.label}
            <span
              className="tabular-nums"
              style={{ color: on ? "rgba(255,255,255,0.85)" : "#9CA3AF", fontSize: "12px" }}
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
}) {
  const ref = (o.source_ref ?? []).filter(Boolean);
  const lines = o.order_lines ?? [];
  const stock = stockReadiness(o, availableBySku);
  const loc = locationForAddress(o.customer_address ?? null);
  const msQty = catQty(lines, "mattress");
  const bfQty = catQty(lines, "bedframe");
  const sofaQty = catQty(lines, "sofa");

  // Logistic: prefer the formal LP (joined name), fall back to the Inbox-triage
  // assignment resolved via the partners map.
  const logistic =
    o.delivery_partners?.name ??
    (o.ops_assigned_logistic
      ? partnerName.get(o.ops_assigned_logistic) ?? "…"
      : null);

  return (
    <tr
      onClick={onOpen}
      className={`group border-t border-[rgba(34,31,32,0.06)] cursor-pointer align-middle ${
        selected ? "bg-[#C2E7FF]" : "bg-white hover:bg-[#E9ECEF]"
      }`}
      data-testid="order-row"
    >
      <td className="pl-3 pr-0.5 py-2" onClick={(e) => e.stopPropagation()}>
        <input
          type="checkbox"
          checked={selected}
          onChange={onToggle}
          aria-label={`Select SO-${o.so}`}
          className="cursor-pointer accent-base-900 align-middle"
        />
      </td>
      {/* Follow-up — the order's STATUS flag (#2), 2nd column (Jess: left, not a
          separate empty column). Click opens the side form. */}
      <ActionCell order={o} tasks={tasks} onFlag={onFlag} />
      {/* Order ID — the system SO number (13px ink, tabular). Phone tooltip lives
          here; paired tight with the Ref No column to its right. */}
      <td className="pl-1 pr-1 py-1.5" title={o.customer_phone ?? undefined}>
        <span
          className="font-mono tabular-nums"
          style={{ fontSize: "13px", fontWeight: 500, color: "#1F2937" }}
        >
          SO-{o.so}
        </span>
      </td>
      {/* Ref No — the day-to-day reference(s), the PRIMARY identifier. All refs
          stack vertically; only >3 fold to "+N". Tight to the identity trio. */}
      <td className="px-1 py-1.5">
        {ref.length === 0 ? (
          <span className="text-base-300">—</span>
        ) : (
          <div className="font-mono" style={{ lineHeight: "16px" }} title={ref.join("\n")}>
            {ref.slice(0, 3).map((r, i) => (
              <div
                key={i}
                className="truncate tabular-nums"
                style={{ fontSize: "13px", fontWeight: 600, color: "#111827" }}
              >
                {r}
              </div>
            ))}
            {ref.length > 3 && (
              <div style={{ fontSize: "12px", fontWeight: 400, color: "#9B9389" }}>
                +{ref.length - 3} more
              </div>
            )}
          </div>
        )}
      </td>
      {/* Customer — identity trio (tight to Ref); single-line ellipsis (P2). */}
      <td className="pl-1 pr-2 py-2">
        {o.customer_name ? (
          <span
            className={`${cjkClassName(o.customer_name)} text-[14px] text-base-800 block truncate`}
            style={{ color: "#1F2937" }}
            title={o.customer_name}
          >
            {o.customer_name}
          </span>
        ) : (
          <span className="text-base-300">—</span>
        )}
      </td>
      {/* Region — its own group; gap before it separates it from the identity trio. */}
      <td className="pl-4 pr-2 py-2">
        {loc.label ? (
          <span
            className="text-[14px] block truncate"
            style={{ color: loc.area === "Outstation" ? "#9A7B3F" : "#4B5563" }}
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
      {/* Logistic — carrier name, moved up next to Region (who's delivering +
          where). Neutral grey. */}
      <td className="pl-4 pr-1 py-2 whitespace-nowrap">
        {logistic ? (
          <span className="text-[14px] block truncate" style={{ color: "#4B5563" }}>{logistic}</span>
        ) : (
          <span className="text-base-300">—</span>
        )}
      </td>
      {/* Logistic ETA — the logistic's committed delivery date
          (ops_order_control.logistic_eta), just before the customer Deadline for
          a quick compare. "No ETA" (red) when it's overdue for chasing. */}
      <td className="px-1 py-2 whitespace-nowrap">
        {(() => {
          const eta = logisticEtaOf(o);
          if (eta) {
            const [d, wd] = fmtDate(eta).split(", ");
            return (
              <span className="inline-flex items-baseline gap-1.5">
                <span
                  className="tabular-nums"
                  style={{ fontSize: "14px", fontWeight: 600, color: "#111827" }}
                >
                  {d}
                </span>
                {wd && <span style={{ fontSize: "11.5px", color: "#9CA3AF" }}>{wd}</span>}
              </span>
            );
          }
          return needsEta(o) ? (
            <span style={{ fontSize: "12px", fontWeight: 600, color: "#991B1B" }}>No ETA</span>
          ) : (
            <span className="text-base-300">—</span>
          );
        })()}
      </td>
      {/* Deadline — three distinct segments: date (bold, red when hot) · weekday
          (grey) · a faint days-left pill (-Nd / today / Nd / over). */}
      <td
        className="pl-1 pr-2 py-2 leading-[1.2] whitespace-nowrap"
        title="Customer's requested delivery date + days left. Stock at the warehouse 7 days before; logistic contacts the customer 2–3 days before."
      >
        {o.delivery_date_tbd ? (
          <span className="text-[11px] font-medium" style={{ color: "#9A7B3F" }}>TBD</span>
        ) : o.delivery_date ? (
          (() => {
            const [datePart, dayPart] = fmtDate(o.delivery_date).split(", ");
            // Reuse the SAME DUE bucket as the top filter header so they can never
            // drift: the date turns red on the two hottest tiers (Overdue / Urgent).
            const dd = daysToDue(o);
            // BUG 1 (Loo 2026-07-09): a COMPLETED (delivered) order's deadline is
            // HISTORY — never colour it red/hot. Otherwise a delivered order whose
            // delivery_date is in the past shows a red "over" pill and reads as
            // overdue. Mirrors dueBucketOf/needsEta, which already null-out for
            // completed. Drop the days-left pill + grey the date to read as settled.
            const done = controlTabOf(o) === "completed";
            const pillText = done
              ? null
              : dd == null ? null : dd < 0 ? "over" : dd === 0 ? "today" : `${dd}d`;
            // Countdown heat (Loo 2026-07-09): a 4-level ramp by days-left so 2–6d
            // read as orange / yellow urgency; only 7d+ goes grey. The DATE text
            // stays clear black — only this pill carries the heat.
            const heat =
              dd == null || dd <= 1
                ? { bg: "#FCE4E4", fg: "#991B1B" } // overdue / today / 1d — red
                : dd <= 3
                  ? { bg: "#FDEBD8", fg: "#B45309" } // 2–3d — orange
                  : dd <= 6
                    ? { bg: "#FEF7CD", fg: "#854D0E" } // 4–6d — yellow
                    : { bg: "#EAE7DF", fg: "#6B7280" }; // 7d+ — grey
            return (
              <div className="flex items-center gap-1.5">
                {/* Badge FIRST (Loo round 3), fixed min-width so today/1d/2d/over
                    are all the same width → the dates after them line up. */}
                {pillText && (
                  <span
                    className="tabular-nums shrink-0 text-center"
                    style={{
                      fontSize: "11.5px",
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
                <span
                  className="tabular-nums"
                  style={{
                    fontSize: "14px",
                    fontWeight: 600,
                    color: done ? "#9CA3AF" : "#111827", // completed = greyed history
                  }}
                >
                  {datePart}
                </span>
                {dayPart && (
                  <span style={{ fontSize: "11.5px", color: "#9CA3AF" }}>{dayPart}</span>
                )}
              </div>
            );
          })()
        ) : (
          <span className="text-base-300">—</span>
        )}
      </td>
      {/* Stock — its own group; gap before it separates it from the logistic trio. */}
      <td className="pl-4 pr-2 py-2 whitespace-nowrap">
        <StockDot info={stock} coreTotal={msQty + bfQty + sofaQty} />
      </td>
      {/* Next action — the most-urgent next step (one pill) + Gmail-style hover
          actions (open / flag / assign) that appear on row hover (P2 F). */}
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
            className="p-1 rounded text-base-500 hover:bg-base-100 hover:text-[#9A7B3F]"
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
          <Flag size={15} strokeWidth={2} className="text-base-300 hover:text-[#9A7B3F]" />
        ) : u === "overdue" ? (
          <Flag size={15} strokeWidth={2.5} className="fill-current text-danger" />
        ) : (
          <Flag size={15} strokeWidth={2} className="fill-current" style={{ color: "#9A7B3F" }} />
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
  ready: { label: "Ready", text: "#166534", bg: "#D6EFD9", border: "#A9D8B0" },
  waiting: { label: "Waiting", text: "#92400E", bg: "#FBE8C6", border: "#F0D08A" },
  no_po: { label: "No PO", text: "#991B1B", bg: "#FCE4E4", border: "#F3B4B4" },
};

/** Stock cell — a status pill (Ready / Waiting / No PO, Partial folded into
 *  Waiting) + a CORE-only arrival ratio `received/total`. Denominator = the
 *  order's Mattress+Bedframe+Sofa unit total (accessories don't gate delivery,
 *  so they're excluded). Numerator: Ready = all core, No PO = 0; Waiting shows
 *  "–" because the list payload carries no per-line GRN-received qty (esp.
 *  AutoCount orders). `data-stock-state` kept verbatim for the tests. */
function StockDot({ info, coreTotal }: { info: StockInfo; coreTotal: number }) {
  let key: "ready" | "waiting" | "no_po";
  let title: string;
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
  const S = STOCK_PILL[key];
  // ONE pill = status + core ratio, e.g. "Waiting 0/2" (Loo 2026-07-09). Ready =
  // all core; Waiting / No PO start at 0 received (the list payload has no
  // per-line GRN-received qty, so 0 is the confirmed-received baseline).
  const num = key === "ready" ? String(coreTotal) : "0";
  return (
    <span
      className="inline-flex items-center rounded-full whitespace-nowrap"
      style={{
        fontSize: "11.5px",
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
      style={{ color: "#C9C5BB", fontSize: "11px", letterSpacing: "0.04em" }}
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

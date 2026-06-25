import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useParams } from "react-router-dom";
import {
  useOperationOrders,
  useOperationStock,
  useDeliveryPartners,
  useAddAnnotation,
  useSaveOrderControl,
  type operationOrderListRow,
} from "@/lib/queries";
import { fmtDate, fmtDateShort } from "@/lib/fmt-date";
import { cjkClassName } from "@/lib/cjk";
import { isFollowUpFlagged } from "@/lib/follow-up";
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
import type { OperationStage } from "./components/StageChip";
import {
  AlertTriangle,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  MoreVertical,
  Truck,
  Download,
  ListTodo,
  CheckCircle2,
  X,
  Flag,
  ChevronsUp,
  Check,
  CalendarClock,
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

const TABS: { key: ControlTab; label: string }[] = [
  { key: "placed", label: "Placed" },
  { key: "proceed", label: "Proceed" },
  { key: "pending", label: "Pending" },
  { key: "scheduled", label: "Scheduled" },
  { key: "completed", label: "Completed" },
  { key: "all", label: "All" },
];

type SettledTab = Exclude<ControlTab, "all">;

/** Status pill per control tab (Jess 2026-06-24 Q1: colour confined to the
 *  Status "lane" — like his CRM reference — so a coloured Status column is fine
 *  now that Location + Stock read neutral). Active states carry a hue; Completed
 *  stays neutral grey because it's ~78% of orders, so a green-for-done pill would
 *  re-flood the table with colour. Tune in the live preview. */
const TAB_PILL: Record<SettledTab, string> = {
  placed: "pill-sent", // blue — new, needs triage
  proceed: "pill-draft", // purple — being arranged
  pending: "pill-warning", // amber — waiting on stock
  scheduled: "pill-collected", // indigo — LP assigned / en route
  completed: "pill-neutral", // grey — done (kept calm; the majority state)
};

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
  if (!availableBySku || lines.length === 0) return { state: "unknown" };

  const needBySku = new Map<string, number>();
  for (const l of lines) {
    const q = Number(l.qty || 0);
    if (q > 0) needBySku.set(l.sku, (needBySku.get(l.sku) ?? 0) + q);
  }
  if (needBySku.size === 0) return { state: "unknown" };
  for (const sku of needBySku.keys())
    if (!availableBySku.has(sku)) return { state: "unknown" };

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
const STOCK_BUCKETS = ["Ready", "Waiting", "Not set"] as const;
type StockBucket = (typeof STOCK_BUCKETS)[number];
function stockBucketOf(
  o: operationOrderListRow,
  availableBySku?: Map<string, number>,
): StockBucket {
  const s = stockReadiness(o, availableBySku).state;
  if (s === "ready" || s === "in_stock") return "Ready";
  if (s === "need_po" || s === "awaiting") return "Waiting";
  return "Not set";
}

/** Left-edge urgency accent per row (Jess 2026-06-24, his CRM-sample "priority
 *  lane"): red overdue/today/tomorrow · amber the 2–7-day prep window · none
 *  otherwise. Completed / TBD / undated rows get no bar. */
function urgencyColor(o: operationOrderListRow, ct: SettledTab): string | null {
  if (ct === "completed" || o.delivery_date_tbd || !o.delivery_date) return null;
  const d = new Date(`${o.delivery_date}T00:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diff = Math.round((d.getTime() - today.getTime()) / 86_400_000);
  if (diff <= 1) return "#DC2626"; // overdue / today / tomorrow
  if (diff <= 7) return "#D97706"; // prep window
  return null;
}

/** ⭐ Flagged for follow-up — derived from the order's annotations (the latest
 *  follow_up/resolved note is a follow_up). Drives the row star + the "Starred"
 *  filter chip; mirrors the drawer-header star (Jess: multi-operator handoff). */
function isFlaggedOrder(o: operationOrderListRow): boolean {
  return isFollowUpFlagged(
    (o.order_annotations ?? []).map((a) => ({ tag: a.tag, at: a.created_at })),
  );
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
/** Soft colour per bucket — a red→grey heat ramp (matches the agreed mock): the
 *  hotter the deadline, the warmer the chip. Applied as the chip's resting tint;
 *  the selected chip still flips to the shared black active state. */
const DUE_TONE: Record<DueBucket, { bg: string; text: string; border: string }> = {
  Overdue: { bg: "#FCEBEB", text: "#A32D2D", border: "#F0959566" },
  Urgent: { bg: "#FAECE7", text: "#993C1D", border: "#F0997B66" },
  Attention: { bg: "#FAEEDA", text: "#854F0B", border: "#EF9F2766" },
  Upcoming: { bg: "#E6F1FB", text: "#185FA5", border: "#85B7EB66" },
  Later: { bg: "#F1EFE8", text: "#5F5E5A", border: "#D3D1C766" },
};
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

/** 🚨 Escalated-to-Jess — the escalate/resolved lane (mirrors isFollowUpFlagged
 *  for the follow_up lane). Drives the "For Jess" quick-view + the Action cell. */
function isEscalatedOrder(o: operationOrderListRow): boolean {
  let latest: { tag: string; at: string } | null = null;
  for (const a of o.order_annotations ?? []) {
    if (a.tag !== "escalate" && a.tag !== "resolved") continue;
    if (!latest || a.created_at > latest.at) latest = { tag: a.tag, at: a.created_at };
  }
  return latest?.tag === "escalate";
}

/** The open action note for a row's Action cell — the operation team's handoff.
 *  Two lanes, escalate first (boss action before team follow-up): returns the
 *  lane + the latest unresolved note's text, or null when nothing is open. */
function openActionFor(
  o: operationOrderListRow,
): { lane: "escalate" | "follow_up"; content: string } | null {
  const latestNote = (tag: "escalate" | "follow_up"): string | null => {
    let at = "";
    let open = false;
    let content = "";
    for (const a of o.order_annotations ?? []) {
      if (a.tag !== tag && a.tag !== "resolved") continue;
      if (a.created_at >= at) {
        at = a.created_at;
        open = a.tag === tag;
        content = a.content;
      }
    }
    return open ? content : null;
  };
  const esc = latestNote("escalate");
  if (esc !== null) return { lane: "escalate", content: esc };
  const fu = latestNote("follow_up");
  if (fu !== null) return { lane: "follow_up", content: fu };
  return null;
}

/** Countdown line for the merged Deadline cell (Jess 2026-06-25: date on top,
 *  days-left below — merges the old Due + Deadline columns into one). "+5d" grey
 *  for the future · "-2d · overdue" red for the past · "Today" red. */
function countdownLabel(
  o: operationOrderListRow,
): { text: string; cls: string } | null {
  const diff = daysToDue(o);
  if (diff === null) return null;
  if (diff < 0) return { text: `${diff}d · overdue`, cls: "text-destructive font-medium" };
  if (diff === 0) return { text: "Today", cls: "text-destructive font-medium" };
  if (diff === 1) return { text: "+1d", cls: "text-destructive font-medium" };
  return { text: `+${diff}d`, cls: "text-base-400" };
}

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

/** Default sort — deadline ASCENDING (Jess P3): overdue/earliest first so the
 *  table reads as a work queue. TBD + undated sink to the bottom; within that
 *  tail (and on date ties) newest placed_at first, the old list default. */
function compareByDeadline(
  a: operationOrderListRow,
  b: operationOrderListRow,
): number {
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

/** Full item breakdown for the items-cell tooltip — answers "what are the +N
 *  accessories" on hover without cluttering the row. */
function itemBreakdown(lines: { sku: string; qty: number }[]): string {
  return lines.map((l) => `${l.sku} ×${l.qty}`).join("\n");
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

export default function OperationOrdersControl({ onImport }: Props) {
  const params = useParams<{ stage?: string }>();
  const [tab, setTab] = useState<ControlTab>(
    () => tabFromStageParam(params.stage) ?? "all",
  );
  const [search, setSearch] = useState("");
  const [openOrderId, setOpenOrderId] = useState<string | null>(null);
  // Fixed at 15 rows (Jess 2026-06-25: stick to 15, no selector). The listing is
  // a fixed box that auto-scales (CSS zoom) so the 15 rows always fit, no scroll.
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
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
  // Two action lanes (Jess 2026-06-25): 🚩 Follow-up = team handoff (follow_up
  // annotations) · ⏫ For Jess = escalations needing the boss (escalate). Each is
  // a derived open-annotation state with its own quick-view filter; the per-row
  // Action cell owns flag/resolve via its own useAddAnnotation.
  const [flaggedOnly, setFlaggedOnly] = useState(false);
  const [escalateOnly, setEscalateOnly] = useState(false);
  // No-ETA quick-view (Jess 2026-06-25): open orders the logistic hasn't given a
  // delivery ETA for, with a near deadline — the chase list.
  const [etaOnly, setEtaOnly] = useState(false);

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
  const flaggedCount = useMemo(() => tabFiltered.filter(isFlaggedOrder).length, [tabFiltered]);
  const escalateCount = useMemo(() => tabFiltered.filter(isEscalatedOrder).length, [tabFiltered]);
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
    return [...m.entries()]
      .sort((a, b) => b[1] - a[1])
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
    if (flaggedOnly) r = r.filter(isFlaggedOrder);
    if (escalateOnly) r = r.filter(isEscalatedOrder);
    if (etaOnly) r = r.filter(needsEta);
    if (dueFilter) r = r.filter((o) => dueBucketOf(o) === dueFilter);
    if (regionFilter) r = r.filter((o) => regionBucket(o.customer_address ?? null) === regionFilter);
    if (stockFilter) r = r.filter((o) => stockBucketOf(o, availableBySku) === stockFilter);
    if (logisticFilter)
      r = r.filter((o) => (logisticOf(o, partnerName) ?? NO_CARRIER) === logisticFilter);
    if (categoryFilter) {
      const opt = CATEGORY_OPTS.find((c) => c.key === categoryFilter);
      if (opt) r = r.filter(opt.match);
    }
    return [...r].sort(compareByDeadline);
  }, [tabFiltered, flaggedOnly, escalateOnly, etaOnly, dueFilter, regionFilter, stockFilter, logisticFilter, categoryFilter, availableBySku, partnerName]);

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

  // Denser rows once the page shows 20+ (single-line cells + tight padding) so
  // they fit at FULL-SIZE text instead of the auto-scale shrinking the font to
  // unreadable (Jess 2026-06-24: "20 rows too small"). 15 = roomy multi-line.
  const compact = typeof pageSize === "number" && pageSize >= 20;

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

  function exportSelectedCsv() {
    const cell = (v: unknown) => {
      const s = String(v ?? "");
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const header = ["SO", "Customer", "Phone", "Units", "Items", "Deadline", "Process", "Location", "Logistic", "Status"];
    const body = selectedOrders.map((o) => {
      const ls = o.order_lines ?? [];
      const units = unitTotal(ls);
      const loc = locationForAddress(o.customer_address ?? null);
      const logi =
        o.delivery_partners?.name ??
        (o.ops_assigned_logistic ? partnerName.get(o.ops_assigned_logistic) ?? "" : "");
      return [
        `SO-${o.so}`, o.customer_name ?? "", o.customer_phone ?? "", units,
        itemRollup(ls), o.delivery_date_tbd ? "TBD" : o.delivery_date ?? "",
        o.proceed_date ?? "",
        loc.label ?? "", logi, TAB_LABEL[controlTabOf(o)],
      ].map(cell).join(",");
    });
    const csv = [header.join(","), ...body].join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `orders-${selectedOrders.length}.csv`;
    a.click();
    URL.revokeObjectURL(url);
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
      className="h-full flex flex-col px-6 pt-6 pb-5 bg-base-200"
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
            className="w-[230px] px-3 py-2 border border-base-200 rounded text-[13px] bg-white outline-none focus:border-base-700"
          />
          {onImport && (
            <button
              type="button"
              onClick={onImport}
              className="btn-primary text-[12px] whitespace-nowrap"
            >
              + Import from AutoCount
            </button>
          )}
        </div>
      </div>

      {/* Filter panel — boxed 3-row (Jess 2026-06-25 "go"): each group in its own
          box (clear separation without columns — columns would wrap chips and
          grow taller, which Jess rejected). Row 1 Status + the 🚩 Follow-up / ⏫
          For Jess action lanes · Row 2 Due + Stock + Category · Row 3 Region +
          Logistic. All 11px chips, selected = black. */}
      <div className="shrink-0 bg-white border border-base-200 rounded-lg shadow-md mb-3 p-2 space-y-1.5">
        {/* Row 1 — Status, plus the two action quick-views on the right. */}
        <div className="flex items-start gap-1.5 flex-wrap">
          <FilterGroup label="Status">
            <RegionChip
              label="All"
              count={counts.all}
              active={tab === "all"}
              title="Every active order"
              onClick={() => setTab("all")}
            />
            {TABS.filter((t) => t.key !== "all").map((t) => (
              <RegionChip
                key={t.key}
                label={t.label}
                count={counts[t.key]}
                active={tab === t.key}
                title={TAB_DESC[t.key as SettledTab]}
                onClick={() => setTab(t.key)}
              />
            ))}
          </FilterGroup>
          <div className="ml-auto flex items-center gap-2">
            <QuickView
              icon={Flag}
              label="Follow-up"
              count={flaggedCount}
              tone="warning"
              active={flaggedOnly}
              title="Team handoff — orders with an open follow-up note for the next operator"
              onClick={() => setFlaggedOnly((v) => !v)}
            />
            <QuickView
              icon={ChevronsUp}
              label="For Jess"
              count={escalateCount}
              tone="danger"
              active={escalateOnly}
              title="Escalated to Jess — orders needing the boss's action"
              onClick={() => setEscalateOnly((v) => !v)}
            />
            <QuickView
              icon={CalendarClock}
              label="No ETA"
              count={etaCount}
              tone="warning"
              active={etaOnly}
              title="Logistic hasn't given a delivery ETA + deadline is near (≤7 days) — chase them"
              onClick={() => setEtaOnly((v) => !v)}
            />
          </div>
        </div>
        {/* Row 2 — Due · Stock · Category (the fixed / fast filters). */}
        <div className="flex items-start gap-1.5 flex-wrap">
          <FilterGroup label="Due">
            <RegionChip
              label="All"
              count={tabFiltered.length}
              active={dueFilter === null}
              onClick={() => setDueFilter(null)}
            />
            {dueEntries.map((e) => (
              <RegionChip
                key={e.bucket}
                label={e.bucket}
                count={e.count}
                active={dueFilter === e.bucket}
                tone={DUE_TONE[e.bucket]}
                title={DUE_DESC[e.bucket]}
                onClick={() => setDueFilter((r) => (r === e.bucket ? null : e.bucket))}
              />
            ))}
          </FilterGroup>
          <FilterGroup label="Stock">
            <RegionChip
              label="All"
              count={tabFiltered.length}
              active={stockFilter === null}
              onClick={() => setStockFilter(null)}
            />
            {stockEntries.map((e) => (
              <RegionChip
                key={e.bucket}
                label={e.bucket}
                count={e.count}
                active={stockFilter === e.bucket}
                dot={e.bucket === "Ready" ? "#16A34A" : e.bucket === "Waiting" ? "#D97706" : "#DC2626"}
                onClick={() => setStockFilter((r) => (r === e.bucket ? null : e.bucket))}
              />
            ))}
          </FilterGroup>
          <FilterGroup label="Category">
            <RegionChip
              label="All"
              count={tabFiltered.length}
              active={categoryFilter === null}
              onClick={() => setCategoryFilter(null)}
            />
            {categoryEntries.map((e) => (
              <RegionChip
                key={e.key}
                label={e.label}
                count={e.count}
                active={categoryFilter === e.key}
                onClick={() => setCategoryFilter((r) => (r === e.key ? null : e.key))}
              />
            ))}
          </FilterGroup>
        </div>
        {/* Row 3 — Region · Logistic (the long / growing filters). */}
        <div className="flex items-start gap-1.5 flex-wrap">
          <FilterGroup label="Region">
            <RegionChip
              label="All"
              count={tabFiltered.length}
              active={regionFilter === null}
              onClick={() => setRegionFilter(null)}
            />
            {regionEntries.map((e) => (
              <RegionChip
                key={e.region}
                label={e.region}
                count={e.count}
                active={regionFilter === e.region}
                onClick={() => setRegionFilter((r) => (r === e.region ? null : e.region))}
              />
            ))}
          </FilterGroup>
          <FilterGroup label="Logistic">
            <RegionChip
              label="All"
              count={tabFiltered.length}
              active={logisticFilter === null}
              onClick={() => setLogisticFilter(null)}
            />
            {logisticEntries.map((e) => (
              <RegionChip
                key={e.carrier}
                label={e.carrier === NO_CARRIER ? "Unassigned" : e.carrier}
                count={e.count}
                active={logisticFilter === e.carrier}
                title={e.carrier === NO_CARRIER ? "No logistic partner assigned yet — operation to assign / chase" : undefined}
                onClick={() => setLogisticFilter((r) => (r === e.carrier ? null : e.carrier))}
              />
            ))}
          </FilterGroup>
        </div>
      </div>

      {/* Toolbar — result count + bulk actions, between the filter card and the
          listing (fixed, does not scroll). */}
      <div className="shrink-0">
      {selected.size > 0 ? (
        <BulkBar
          count={selected.size}
          menu={bulkMenu}
          setMenu={setBulkMenu}
          partners={partnersQ.data?.partners ?? []}
          onAssign={bulkAssignLogistic}
          onExport={exportSelectedCsv}
          onTasks={bulkCreateTasks}
          onComplete={bulkMarkCompleted}
          onClear={clearSel}
          busy={assignMut.isPending || taskMut.isPending || completeMut.isPending}
        />
      ) : (
        total > 0 && (
          <Pager
            safePage={safePage}
            onPage={setPage}
            total={total}
            rangeStart={rangeStart}
            rangeEnd={rangeEnd}
            pageCount={pageCount}
            onRefresh={() => void refetch()}
          />
        )
      )}

      </div>

      {/* Listing — the ONLY scroll area (Jess 2026-06-24: the page itself stays
          put, only the rows scroll). table-fixed + a colgroup → columns keep
          their width; long Ref/Customer/Location/Remark wrap to ≤3 lines. */}
      <div
        ref={listBoxRef}
        className="flex-1 min-h-0 bg-white border border-base-200 rounded-lg shadow-md overflow-auto"
      >
        <table
          ref={listTableRef}
          className={`w-full border-collapse text-[13px] table-fixed ${
            compact ? "[&_td]:py-0.5 [&_th]:py-1" : ""
          }`}
          style={{ minWidth: 1260 }}
        >
          <colgroup>
            <col style={{ width: 34 }} />
            <col style={{ width: 26 }} />
            <col style={{ width: 96 }} />
            <col style={{ width: 70 }} />
            <col style={{ width: 80 }} />
            <col style={{ width: 132 }} />
            <col style={{ width: 72 }} />
            <col style={{ width: 88 }} />
            <col style={{ width: 96 }} />
            <col style={{ width: 64 }} />
            <col style={{ width: 70 }} />
            <col style={{ width: 150 }} />
            <col style={{ width: 160 }} />
            <col style={{ width: 168 }} />
          </colgroup>
          {/* ONE thin, darker header band so it reads clearly AS the header
              (Jess 2026-06-24: header darker, no column shade, less thick). */}
          <thead>
            <tr className="bg-base-100 border-b border-base-300">
              <th className="px-3 py-1.5 border-r border-base-200">
                <input
                  type="checkbox"
                  checked={allPagedSelected}
                  onChange={toggleAllPaged}
                  aria-label="Select all on this page"
                  className="cursor-pointer accent-base-900 align-middle"
                />
              </th>
              <th className="border-r border-base-200" title="Follow-up / escalate flag" />
              <Th>Status</Th>
              <Th noBorder>Order ID</Th>
              <Th noBorder>Ref No</Th>
              <Th>Customer</Th>
              <Th>Deadline</Th>
              <Th>ETA</Th>
              <Th>Location</Th>
              <Th>Carrier</Th>
              <Th>Stock</Th>
              <Th>Items</Th>
              <Th>Action</Th>
              <Th>Remark</Th>
            </tr>
          </thead>
          <tbody>
            {total === 0 && (
              <tr>
                <td
                  colSpan={14}
                  className="p-12 text-center text-[12px] text-base-500"
                >
                  No orders in this tab.
                </td>
              </tr>
            )}
            {paged.map((o, idx) => (
              <OrderRow
                key={o.id}
                o={o}
                idx={idx}
                compact={compact}
                partnerName={partnerName}
                availableBySku={availableBySku}
                selected={selected.has(o.id)}
                onToggle={() => toggleOne(o.id)}
                onOpen={() => setOpenOrderId(o.id)}
              />
            ))}
          </tbody>
        </table>
      </div>

      {openOrderId && (
        <OrderDetailDrawer
          orderId={openOrderId}
          onClose={() => setOpenOrderId(null)}
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
  onTasks: () => void;
  onComplete: () => void;
  onClear: () => void;
  busy: boolean;
}) {
  return (
    <div className="flex items-center gap-2 mb-2.5 px-3 py-2 rounded bg-base-900 text-white">
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
                <BulkMenuItem icon={ListTodo} label="Create follow-up tasks" onClick={onTasks} />
                <BulkMenuItem icon={CheckCircle2} label="Mark completed" onClick={onComplete} />
              </>
            ) : (
              <>
                <div className="px-3 py-1.5 text-[10px] uppercase tracking-[0.08em] text-base-400">
                  Assign to…
                </div>
                {partners.length === 0 && (
                  <div className="px-3 py-1.5 text-[12px] text-base-400">No partners.</div>
                )}
                {partners.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => onAssign(p.id)}
                    className="w-full text-left px-3 py-1.5 text-[12px] hover:bg-base-100"
                  >
                    {p.name}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => setMenu("menu")}
                  className="w-full text-left px-3 py-1.5 text-[11px] text-base-500 hover:bg-base-100 border-t border-base-100 mt-1"
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
      className="w-full flex items-center gap-2 px-3 py-2 text-[12px] hover:bg-base-100"
    >
      <Icon size={14} className="text-base-500" /> {label}
    </button>
  );
}

/** State-region filter pill (Klang Valley / each state / Others) + its count. */
function RegionChip({
  label,
  count,
  active,
  onClick,
  dot,
  tone,
  title,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
  /** Optional leading colour dot — the Stock chips use it (green/amber/red) to
   *  tie to the Stock column + set them apart from the neutral Region chips. */
  dot?: string;
  /** Resting colour tint for the DUE buckets (red→grey heat ramp). Applied only
   *  when NOT selected; selected still flips to the shared black active state. */
  tone?: { bg: string; text: string; border: string };
  /** Hover tooltip — Status tab meaning, Due bucket day-range, etc. */
  title?: string;
}) {
  const tinted = !!tone && !active;
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      style={
        tinted
          ? { backgroundColor: tone!.bg, color: tone!.text, border: `0.5px solid ${tone!.border}` }
          : undefined
      }
      className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] whitespace-nowrap shrink-0 transition-colors ${
        active
          ? "bg-base-900 text-white font-semibold"
          : tinted
            ? "font-medium hover:brightness-95"
            : "bg-base-100 text-base-600 font-medium hover:bg-base-200"
      }`}
    >
      {dot && (
        <span
          className="inline-block w-2 h-2 rounded-full shrink-0"
          style={{ backgroundColor: dot }}
          aria-hidden="true"
        />
      )}
      {label}
      <span
        className={`text-[10px] tabular-nums ${
          active ? "text-white/70" : tinted ? "opacity-60" : "text-base-400"
        }`}
      >
        {count}
      </span>
    </button>
  );
}

/** Filter-group box — one bordered container per dimension (Jess 2026-06-25): a
 *  dark uppercase label + a hairline + the group's chips, so groups read as
 *  separated units without the height cost of stacking them into columns. */
function FilterGroup({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className="inline-flex items-center gap-x-0.5 gap-y-1 flex-wrap border border-base-200 rounded-md px-1.5 py-0.5"
      data-testid={`filter-${label.toLowerCase()}`}
    >
      <span className="text-[11px] font-semibold uppercase tracking-[0.04em] text-base-800 border-r border-base-200 pr-1.5 shrink-0">
        {label}
      </span>
      {children}
    </div>
  );
}

/** Action-lane quick-view (Jess 2026-06-25): the two clickable filters for the
 *  open-annotation lanes — 🚩 Follow-up (amber, team) + ⏫ For Jess (red, boss).
 *  Always shown (even at 0) so the lanes are discoverable. */
function QuickView({
  icon: Icon,
  label,
  count,
  active,
  tone,
  title,
  onClick,
}: {
  icon: LucideIcon;
  label: string;
  count: number;
  active: boolean;
  tone: "warning" | "danger";
  title: string;
  onClick: () => void;
}) {
  const cls =
    tone === "danger"
      ? active
        ? "bg-destructive text-white"
        : "border border-destructive/40 text-destructive hover:bg-destructive/5"
      : active
        ? "bg-warning text-white"
        : "border border-warning/40 text-warning hover:bg-warning/5";
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-pressed={active}
      className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-medium whitespace-nowrap transition-colors ${cls}`}
    >
      <Icon size={11} strokeWidth={2.5} /> {label}
      <span className="tabular-nums opacity-80">{count}</span>
    </button>
  );
}

/** Inline remark editor (Jess 2026-06-24: edit the 4 operator remarks straight
 *  from the list, no need to open the full order drawer). Saves via the
 *  order-control overlay PUT, which also refreshes the orders list. */
/** Remark cell — shows the 4 operator remarks (Carres / Action / WH / Cust) IN
 *  the cell and edits them IN PLACE on click (Jess 2026-06-24: no popup modal).
 *  Saves via the order-control overlay PUT, which also refreshes the list. */
const REMARK_FIELDS = [
  { key: "carres_remark", label: "Carres" },
  { key: "action_for_logistic", label: "Action" },
  { key: "warehouse_remark", label: "WH" },
  { key: "customer_request", label: "Cust" },
] as const;
function RemarkCell({ order }: { order: operationOrderListRow }) {
  const ovlRaw = order.ops_order_control;
  const ovl = Array.isArray(ovlRaw) ? ovlRaw[0] : ovlRaw;
  const [editing, setEditing] = useState(false);
  const [vals, setVals] = useState({
    carres_remark: ovl?.carres_remark ?? "",
    action_for_logistic: ovl?.action_for_logistic ?? "",
    warehouse_remark: ovl?.warehouse_remark ?? "",
    customer_request: ovl?.customer_request ?? "",
  });
  const save = useSaveOrderControl(order.id, {
    onSuccess: () => {
      toast.success("Remark saved");
      setEditing(false);
    },
    onError: (e) => toast.error(`Couldn't save — ${e.message}`),
  });

  if (editing) {
    return (
      <td className="px-3 py-2 align-top" onClick={(e) => e.stopPropagation()}>
        <div className="space-y-1">
          {REMARK_FIELDS.map((f) => (
            <div key={f.key} className="flex items-center gap-1">
              <span className="text-[9px] font-semibold uppercase text-base-400 w-9 shrink-0">
                {f.label}
              </span>
              <input
                value={vals[f.key]}
                onChange={(e) => setVals((v) => ({ ...v, [f.key]: e.target.value }))}
                className="flex-1 min-w-0 px-1.5 py-0.5 border border-base-200 rounded text-[11px] bg-white outline-none focus:border-base-700"
              />
            </div>
          ))}
          <div className="flex justify-end gap-2 pt-0.5">
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="text-[10px] text-base-500 hover:text-base-900"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={save.isPending}
              onClick={() =>
                save.mutate({
                  carres_remark: vals.carres_remark.trim() || null,
                  action_for_logistic: vals.action_for_logistic.trim() || null,
                  warehouse_remark: vals.warehouse_remark.trim() || null,
                  customer_request: vals.customer_request.trim() || null,
                })
              }
              className="text-[10px] font-semibold text-primary hover:underline disabled:opacity-50"
            >
              {save.isPending ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      </td>
    );
  }

  const filled = REMARK_FIELDS.filter((f) => vals[f.key].trim());
  return (
    <td
      className="px-3 py-2 align-top cursor-text hover:bg-base-50"
      onClick={(e) => {
        e.stopPropagation();
        setEditing(true);
      }}
      title="Click to edit remarks"
    >
      {filled.length === 0 ? (
        <span className="text-[10px] text-base-300">+ add remark</span>
      ) : (
        <div className="leading-[1.3]">
          {filled.map((f) => (
            <div key={f.key} className="truncate text-[10px]">
              <span className="font-semibold text-base-500">{f.label}:</span>{" "}
              <span className="text-base-700">{vals[f.key]}</span>
            </div>
          ))}
        </div>
      )}
    </td>
  );
}

/** ETA cell — the logistic's committed delivery date (Jess 2026-06-25), edited
 *  IN PLACE from the list (click → date) via the same order-control overlay PUT
 *  the drawer uses. Shows a red "No ETA" alert when missing + the deadline is
 *  near (≤7d); else the date, or a faint "+ set". Distinct from the Deadline. */
function EtaCell({ order, ct }: { order: operationOrderListRow; ct: SettledTab }) {
  const eta = logisticEtaOf(order);
  const alert = needsEta(order);
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(eta ?? "");
  const save = useSaveOrderControl(order.id, {
    onSuccess: () => {
      toast.success("ETA saved");
      setEditing(false);
    },
    onError: (e) => toast.error(`Couldn't save — ${e.message}`),
  });
  if (editing) {
    return (
      <td className="px-2 py-2 align-top" onClick={(e) => e.stopPropagation()}>
        <div className="flex flex-col gap-1">
          <input
            type="date"
            value={val}
            onChange={(e) => setVal(e.target.value)}
            className="w-full px-1 py-0.5 border border-base-200 rounded text-[10px] bg-white outline-none focus:border-base-700"
          />
          <div className="flex justify-end gap-1.5">
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="text-[9px] text-base-500 hover:text-base-900"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={save.isPending}
              onClick={() => save.mutate({ logistic_eta: val.trim() || null })}
              className="text-[9px] font-semibold text-primary hover:underline disabled:opacity-50"
            >
              {save.isPending ? "…" : "Save"}
            </button>
          </div>
        </div>
      </td>
    );
  }
  return (
    <td
      className="px-3 py-2 border-r border-base-100 whitespace-nowrap cursor-text hover:bg-base-50"
      onClick={(e) => {
        e.stopPropagation();
        setEditing(true);
      }}
      title="Logistic's committed delivery ETA — click to set"
    >
      {eta ? (
        <span className="text-[11px] text-base-700 tabular-nums">
          {fmtDate(eta).split(", ")[0]}
        </span>
      ) : ct === "completed" ? (
        <span className="text-base-300">—</span>
      ) : alert ? (
        <span
          className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-destructive"
          title="No logistic ETA + deadline near — chase the logistic to confirm"
        >
          <AlertTriangle size={11} strokeWidth={2.5} /> No ETA
        </span>
      ) : (
        <span className="text-[10px] text-base-300">+ set</span>
      )}
    </td>
  );
}

function OrderRow({
  o,
  idx,
  compact,
  partnerName,
  availableBySku,
  selected,
  onToggle,
  onOpen,
}: {
  o: operationOrderListRow;
  idx: number;
  /** Page shows 30+ rows → clamp wrapping cells to a single line so the
   *  auto-scale doesn't have to shrink the text as hard. */
  compact: boolean;
  partnerName: Map<string, string>;
  availableBySku?: Map<string, number>;
  selected: boolean;
  onToggle: () => void;
  onOpen: () => void;
}) {
  const ct = controlTabOf(o);
  const urg = urgencyColor(o, ct);
  const ref = (o.source_ref ?? []).filter(Boolean);
  const lines = o.order_lines ?? [];
  const qtyTotal = unitTotal(lines);
  const tags = itemTags(lines);
  const stock = stockReadiness(o, availableBySku);
  const loc = locationForAddress(o.customer_address ?? null);

  // Logistic: prefer the formal LP (joined name), fall back to the Inbox-triage
  // assignment resolved via the partners map.
  const logistic =
    o.delivery_partners?.name ??
    (o.ops_assigned_logistic
      ? partnerName.get(o.ops_assigned_logistic) ?? "…"
      : null);

  // ≤3-line clamp shared by the wrapping cells (Ref / Customer / Location) —
  // fixed width, never taller than 3 lines (Jess 2026-06-24).
  const clamp3 = {
    display: "-webkit-box",
    WebkitBoxOrient: "vertical" as const,
    WebkitLineClamp: compact ? 1 : 3,
    overflow: "hidden",
  };

  return (
    <tr
      onClick={onOpen}
      className={`border-t border-base-200 hover:bg-info-soft/50 cursor-pointer align-top ${
        selected ? "bg-primary/5" : idx % 2 ? "bg-base-100/70" : "bg-white"
      }`}
      data-testid="order-row"
    >
      <td
        className="px-3 py-2 border-r border-base-100"
        style={{ borderLeft: `3px solid ${urg ?? "transparent"}` }}
        onClick={(e) => e.stopPropagation()}
      >
        <input
          type="checkbox"
          checked={selected}
          onChange={onToggle}
          aria-label={`Select SO-${o.so}`}
          className="cursor-pointer accent-base-900 align-middle"
        />
      </td>
      {/* Action-lane flag (Jess 2026-06-25): a left-edge scan icon — a Flag
          (amber) for an open follow-up, a ChevronsUp (red) for an open escalate
          — lights up only when the order has an open action; the note + Resolve
          live in the Action column. */}
      <td className="px-1 py-2 text-center border-r border-base-100">
        {(() => {
          const a = openActionFor(o);
          if (!a) return null;
          return a.lane === "escalate" ? (
            <ChevronsUp
              size={14}
              strokeWidth={2.5}
              className="text-destructive inline align-middle"
              aria-label="Escalated to Jess"
            />
          ) : (
            <Flag
              size={13}
              strokeWidth={2}
              className="text-warning fill-current inline align-middle"
              aria-label="Open follow-up"
            />
          );
        })()}
      </td>
      {/* Status — Q1 (Jess 2026-06-24): a soft coloured pill, colour confined to
          THIS column (his CRM-ref pattern). Completed stays neutral grey. */}
      <td className="px-3 py-2 whitespace-nowrap border-r border-base-100">
        <span title={TAB_DESC[ct]} className={`pill ${TAB_PILL[ct]}`}>
          {TAB_LABEL[ct]}
        </span>
      </td>
      {/* Order ID — the SO number (phone in tooltip) */}
      <td
        className="px-3 py-2 whitespace-nowrap font-mono font-semibold text-[12px] text-base-900"
        title={o.customer_phone ?? undefined}
      >
        SO-{o.so}
      </td>
      {/* Ref No — each ref on its OWN line, ≤3 lines. Part of the customer-detail
          group (Order ID · Ref · Customer) → no inner divider, darker text. */}
      <td className="px-3 py-2">
        {ref.length > 0 ? (
          <div
            className="font-mono text-[10px] text-base-800 leading-[1.3]"
            style={clamp3}
            title={ref.join("\n")}
          >
            {ref.map((r, i) => (
              <div key={i} className="truncate">
                {r}
              </div>
            ))}
          </div>
        ) : (
          <span className="text-base-300">—</span>
        )}
      </td>
      {/* Customer — fixed width, wraps to ≤3 lines (Jess 2026-06-24). */}
      <td className="px-3 py-2 border-r border-base-100">
        {o.customer_name ? (
          <span
            className={`${cjkClassName(o.customer_name)} text-[11px] text-base-800 leading-[1.3]`}
            style={clamp3}
            title={o.customer_name}
          >
            {o.customer_name}
          </span>
        ) : (
          <span className="text-base-300">—</span>
        )}
      </td>
      {/* Deadline — merged Due + Deadline (Jess 2026-06-25 screenshot): the date
          on top, the days-left countdown below — saves a column + reads cleaner.
          Overdue/today/tomorrow read red, the rest grey. */}
      <td
        className="px-3 py-2 border-r border-base-100 leading-[1.2] whitespace-nowrap"
        title="Customer's requested delivery date + days left. Stock at the warehouse 7 days before; logistic contacts the customer 2–3 days before."
      >
        {ct === "completed" ? (
          <span className="text-base-300">—</span>
        ) : o.delivery_date_tbd ? (
          <span className="text-[11px] font-medium text-warning">TBD</span>
        ) : o.delivery_date ? (
          (() => {
            const datePart = fmtDate(o.delivery_date).split(", ")[0];
            const cd = countdownLabel(o);
            return (
              <>
                <div className="text-[11px] text-base-700 tabular-nums">{datePart}</div>
                {cd && <div className={`text-[10px] tabular-nums ${cd.cls}`}>{cd.text}</div>}
              </>
            );
          })()
        ) : (
          <span className="text-base-300">—</span>
        )}
      </td>
      {/* ETA — the logistic's committed delivery date (Jess 2026-06-25, distinct
          from the customer Deadline). Inline-editable; a red "No ETA" alert when
          missing + the deadline is near (≤7d) → chase the logistic. */}
      <EtaCell order={o} ct={ct} />
      {/* Location — delivery city/state. Q1 colour restraint (Jess 2026-06-24):
          KV (the majority) is now NEUTRAL grey so the green leaves the table;
          only Outstation keeps a quiet amber (no warehouse buffer = special
          handling). The "Call before PO" action moved INTO the drawer. */}
      <td className="px-3 py-2 border-r border-base-100">
        {loc.label ? (
          <span
            className={`text-[11px] font-medium leading-[1.3] ${
              loc.area === "Outstation" ? "text-warning" : "text-base-600"
            }`}
            style={clamp3}
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
      {/* Carrier (was Logistic) */}
      <td className="px-3 py-2 whitespace-nowrap border-r border-base-100">
        {logistic ? (
          <span className="text-[12px] text-base-500">{logistic}</span>
        ) : (
          <span className="text-base-300">—</span>
        )}
      </td>
      {/* Stock · qty — merged (Jess 2026-06-24): one button carries readiness +
          the goods-unit count, sitting next to Items. */}
      <td className="px-3 py-2 whitespace-nowrap border-r border-base-100">
        <StockCell info={stock} qty={qtyTotal} />
      </td>
      {/* Items — 2-line summary (Jess): core goods (dark) on top, accessories
          (dim) below; the size is kept in every tag (e.g. "1× MS(K)"). */}
      <td className="px-3 py-2 border-r border-base-100" title={itemBreakdown(lines)}>
        {tags.length === 0 ? (
          <span className="text-base-300">—</span>
        ) : (
          <div className="leading-tight space-y-0.5">
            {tags.filter((t) => t.kind === "core").length > 0 && (
              <div className="truncate text-[11px] font-medium text-base-800">
                {tags
                  .filter((t) => t.kind === "core")
                  .map((t, i) => (
                    <span key={i} className="mr-3">
                      {tagLabel(t)}
                    </span>
                  ))}
              </div>
            )}
            {tags.filter((t) => t.kind !== "core").length > 0 && (
              <div className="truncate text-[11px] text-base-400">
                {tags
                  .filter((t) => t.kind !== "core")
                  .map((t, i) => (
                    <span key={i} className="mr-3">
                      {tagLabel(t)}
                    </span>
                  ))}
              </div>
            )}
          </div>
        )}
      </td>
      {/* Action — the operation team's own handoff (🚩 follow-up / ⏫ escalate
          note); separate from the 4 party Remarks. */}
      <ActionCell order={o} />
      {/* Remark — the 4 operator remarks shown in-cell; click to edit in place. */}
      <RemarkCell order={o} />
    </tr>
  );
}

/** Action cell — the operation team's internal next-step (Jess 2026-06-25),
 *  DISTINCT from the 4 per-party Remarks. Surfaces the latest open annotation in
 *  either lane (⏫ Escalate to Jess first, then 🚩 Follow up) + a one-click ✓
 *  Resolve; an empty cell offers a quick Flag. Add/escalate proper happens in the
 *  drawer timeline. Self-contained mutation, like RemarkCell. */
function ActionCell({ order }: { order: operationOrderListRow }) {
  const open = openActionFor(order);
  const add = useAddAnnotation();
  const post = (content: string, tag: "follow_up" | "resolved", ok: string) => {
    if (add.isPending) return;
    add.mutate(
      { orderId: order.id, content, tag },
      { onSuccess: () => toast.success(ok), onError: () => toast.error("Couldn't update — retry") },
    );
  };
  return (
    <td className="px-3 py-2 align-top" onClick={(e) => e.stopPropagation()}>
      {open ? (
        <div className="flex items-start gap-1.5">
          {open.lane === "escalate" ? (
            <ChevronsUp
              size={13}
              strokeWidth={2.5}
              className="text-destructive shrink-0 mt-px"
              aria-label="Escalated to Jess"
            />
          ) : (
            <Flag
              size={12}
              strokeWidth={2}
              className="text-warning fill-current shrink-0 mt-px"
              aria-label="Follow up"
            />
          )}
          <div className="min-w-0 flex-1">
            <div
              className="text-[10px] leading-[1.3] text-base-700 line-clamp-2"
              title={open.content}
            >
              {open.content}
            </div>
            <button
              type="button"
              disabled={add.isPending}
              onClick={() => post("Resolved", "resolved", "Resolved")}
              className="mt-0.5 inline-flex items-center gap-0.5 text-[9px] font-medium text-base-400 hover:text-success disabled:opacity-50"
            >
              <Check size={10} strokeWidth={2.5} /> Resolve
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          disabled={add.isPending}
          onClick={() => post("Flagged for follow-up", "follow_up", "Flagged for follow-up")}
          title="Flag for follow-up (set the next action in the order drawer)"
          className="inline-flex items-center gap-1 text-[10px] text-base-300 hover:text-warning disabled:opacity-50"
        >
          <Flag size={11} strokeWidth={2} /> Flag
        </button>
      )}
    </td>
  );
}

/** Stock · qty cell — a colour-coded WORD badge that tallies with the top Stock
 *  legend (Jess 2026-06-24): green "Ready N" · amber "Waiting N/M" · RED "Not set
 *  N" (alert — go set it). The number is the goods-unit count (have/need where a
 *  short is known). A traffic-light read: green ok · amber on its way · red act. */
function StockCell({ info, qty }: { info: StockInfo; qty: number }) {
  const n = qty > 0 ? ` ${qty}` : "";
  let label: string;
  let pill: string;
  let title: string;
  switch (info.state) {
    case "unknown":
      label = `Not set${n}`;
      pill = "pill-overdue"; // red — readiness unknown, a human must set it
      title = "Stock not auto-checked (free-text SKU) — open the order to set it";
      break;
    case "ready":
      label = `Ready${n}`;
      pill = "pill-confirmed"; // green — secured / reserved
      title = "Stock secured / reserved for this order";
      break;
    case "in_stock":
      label = `Ready ${info.have ?? qty}`;
      pill = "pill-confirmed";
      title = "Free warehouse stock covers every line";
      break;
    case "need_po": {
      const need = info.need ?? qty;
      const have = info.have ?? 0;
      label = `Waiting ${have}/${need}`;
      pill = "pill-warning"; // amber — short, raise a PO
      title =
        "Short — raise a PO" +
        (info.short && info.short.length > 0
          ? ": " + info.short.map((s) => `${shortSku(s.sku)} ${s.have}/${s.need}`).join(", ")
          : "");
      break;
    }
    default: // awaiting
      label = `Waiting${n}`;
      pill = "pill-warning";
      title = "PO open — stock on the way";
      break;
  }
  return (
    <span
      className={`pill ${pill} whitespace-nowrap tabular-nums`}
      title={title}
      data-stock-state={info.state}
    >
      {label}
    </span>
  );
}

/** Trim a long/free-text SKU to a compact token for the items sub-line. */
function shortSku(sku: string): string {
  const s = sku.includes(":") ? sku.split(":").slice(1).join(":") : sku;
  return s.length > 14 ? s.slice(0, 13) + "…" : s;
}

function Th({
  children,
  noBorder,
}: {
  children: React.ReactNode;
  /** Drop the right divider so adjacent columns read as ONE category group
   *  (e.g. Order ID · Ref · Customer = customer detail). */
  noBorder?: boolean;
}) {
  return (
    <th
      className={`px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.04em] text-base-700 text-left ${
        noBorder ? "" : "border-r border-base-200"
      }`}
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

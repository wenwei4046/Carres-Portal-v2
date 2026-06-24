import { useEffect, useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useParams } from "react-router-dom";
import {
  useOperationOrders,
  useOperationStock,
  useDeliveryPartners,
  useAddAnnotation,
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
  Star,
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

/** Countdown from today to the deadline (customer's requested delivery date)
 *  → short label + tone, encoding Jess's prep SOP off the deadline:
 *    • ≤7 days  ⚠  stock must be at the warehouse (the "Before 7 Days" flag —
 *                  standard early-receive to avoid last-minute damage)
 *    • ≤3 days  📞 logistic must contact the customer to arrange delivery
 *  overdue/today/≤3d read red; the 4–7d prep window reads amber. */
function deadlineInfo(
  dateStr: string | null | undefined,
): { label: string; pill: string; urgent: boolean } | null {
  if (!dateStr) return null;
  const d = new Date(`${dateStr}T00:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diff = Math.round((d.getTime() - today.getTime()) / 86_400_000);
  // Jess: short form + ≤1 day = urgent (red). Overdue / today / tomorrow read
  // red; everything else is a plain neutral "Nd" countdown.
  if (diff < 0) return { label: `${-diff}d`, pill: "pill-overdue", urgent: true };
  if (diff === 0) return { label: "Today", pill: "pill-overdue", urgent: true };
  if (diff === 1) return { label: "1d", pill: "pill-overdue", urgent: true };
  return { label: `${diff}d`, pill: "pill-neutral", urgent: false };
}

/** Whether an order needs urgent attention — open (not delivered) + a deadline
 *  ≤1 day out (today/tomorrow/overdue). Drives the top "Urgent" filter chip. */
function isUrgentOrder(o: operationOrderListRow): boolean {
  if (o.status === "delivered" || o.delivery_date_tbd || !o.delivery_date) return false;
  return deadlineInfo(o.delivery_date)?.urgent ?? false;
}

/** ⭐ Flagged for follow-up — derived from the order's annotations (the latest
 *  follow_up/resolved note is a follow_up). Drives the row star + the "Starred"
 *  filter chip; mirrors the drawer-header star (Jess: multi-operator handoff). */
function isFlaggedOrder(o: operationOrderListRow): boolean {
  return isFollowUpFlagged(
    (o.order_annotations ?? []).map((a) => ({ tag: a.tag, at: a.created_at })),
  );
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
  // 15 rows/page → a fixed listing box that stays put, no endless scroll (Jess
  // 2026-06-24).
  const [pageSize] = useState<number | "all">(15);
  const [page, setPage] = useState(0);
  // Bulk select (Gmail-style): selected order ids + the ⋮ menu mode.
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkMenu, setBulkMenu] = useState<null | "menu" | "assign">(null);
  // Urgent chip + state-region pills — both stack on top of the status tab.
  const [urgentOnly, setUrgentOnly] = useState(false);
  const [regionFilter, setRegionFilter] = useState<string | null>(null);
  const [stockFilter, setStockFilter] = useState<StockBucket | null>(null);
  // ⭐ Follow-up star (Gmail-style) — flag from the row OR the drawer header.
  // The flag itself is a follow_up note; one shared mutation toggles it.
  const [flaggedOnly, setFlaggedOnly] = useState(false);
  const addFollowUpNote = useAddAnnotation();
  const toggleFollowUp = (orderId: string, flagged: boolean) => {
    if (addFollowUpNote.isPending) return;
    addFollowUpNote.mutate(
      flagged
        ? { orderId, content: "✅ Follow-up cleared", tag: "resolved" }
        : { orderId, content: "⭐ Flagged for follow-up", tag: "follow_up" },
      {
        onSuccess: () =>
          toast.success(flagged ? "Follow-up cleared" : "Flagged for follow-up"),
        onError: () => toast.error("Couldn't update — retry"),
      },
    );
  };

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
  const urgentCount = useMemo(() => tabFiltered.filter(isUrgentOrder).length, [tabFiltered]);
  const flaggedCount = useMemo(() => tabFiltered.filter(isFlaggedOrder).length, [tabFiltered]);
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

  const visible = useMemo(() => {
    let r = tabFiltered;
    if (urgentOnly) r = r.filter(isUrgentOrder);
    if (flaggedOnly) r = r.filter(isFlaggedOrder);
    if (regionFilter) r = r.filter((o) => regionBucket(o.customer_address ?? null) === regionFilter);
    if (stockFilter) r = r.filter((o) => stockBucketOf(o, availableBySku) === stockFilter);
    return [...r].sort(compareByDeadline);
  }, [tabFiltered, urgentOnly, flaggedOnly, regionFilter, stockFilter, availableBySku]);

  // Most-recent order/import time → shown next to the count.
  const latestIn = useMemo(() => {
    let mx: string | null = null;
    for (const o of orders) if (o.placed_at && (!mx || o.placed_at > mx)) mx = o.placed_at;
    return mx;
  }, [orders]);

  // Reset to the first page whenever the filtered set changes.
  useEffect(
    () => setPage(0),
    [tab, search, pageSize, urgentOnly, flaggedOnly, regionFilter, stockFilter],
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
    <div className="px-9 py-8 pb-14" data-testid="operation-orders-control">
      {/* Header — compact: title + inline count, no kicker/subtitle (Gmail-style) */}
      <div className="flex items-center justify-between gap-4 mb-3 flex-wrap">
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

      {/* Status tabs (tier-coloured counts) + the Urgent chip */}
      <div className="flex items-center gap-3 mb-2.5 flex-wrap">
        <div
          className="flex gap-1 p-1 bg-base-100 rounded w-fit max-w-full overflow-auto"
          role="tablist"
          aria-label="Order status"
        >
          {TABS.map((t) => {
            const active = tab === t.key;
            return (
              <button
                key={t.key}
                role="tab"
                aria-selected={active}
                onClick={() => setTab(t.key)}
                title={t.key === "all" ? "Every active order" : TAB_DESC[t.key as SettledTab]}
                className={`px-3 py-1.5 text-[12px] rounded cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
                  active
                    ? "bg-white text-base-900 font-semibold shadow-sm"
                    : "text-base-600 font-medium hover:text-base-900"
                }`}
              >
                <span>{t.label}</span>
                <span
                  className={`text-[11px] tabular-nums ${active ? "text-base-600" : "text-base-400"}`}
                >
                  {counts[t.key]}
                </span>
              </button>
            );
          })}
        </div>
        {urgentCount > 0 && (
          <button
            type="button"
            onClick={() => setUrgentOnly((v) => !v)}
            title="Due within 1 day (today / tomorrow) or overdue"
            className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded text-[12px] font-semibold transition-colors ${
              urgentOnly
                ? "bg-destructive text-white"
                : "border border-destructive/40 text-destructive hover:bg-destructive/5"
            }`}
          >
            <AlertTriangle size={13} strokeWidth={2.5} /> Urgent {urgentCount}
          </button>
        )}
        {flaggedCount > 0 && (
          <button
            type="button"
            onClick={() => setFlaggedOnly((v) => !v)}
            title="Flagged for follow-up (⭐ starred, not yet resolved)"
            className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded text-[12px] font-semibold transition-colors ${
              flaggedOnly
                ? "bg-warning text-white"
                : "border border-warning/40 text-warning hover:bg-warning/5"
            }`}
          >
            <Star size={13} strokeWidth={2.5} className="fill-current" /> Starred {flaggedCount}
          </button>
        )}
      </div>

      {/* State-region filter pills (Jess: pick a state → select-all → assign
          logistic). Stacks with the status tab + Urgent chip above. */}
      <div className="flex items-center gap-1.5 mb-2 flex-wrap">
        <span className="text-[11px] font-medium text-base-400 mr-0.5">Region</span>
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
      </div>

      {/* Stock-status filter pills (Jess: header should filter by stock too —
          Ready / Waiting / Not set, the same three states as the Stock column).
          Stacks on top of the status tab + region above. */}
      <div className="flex items-center gap-1.5 mb-3.5 flex-wrap">
        <span className="text-[11px] font-medium text-base-400 mr-0.5">Stock</span>
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
            onClick={() =>
              setStockFilter((r) => (r === e.bucket ? null : e.bucket))
            }
          />
        ))}
      </div>

      {/* Toolbar: bulk-action bar when rows are selected, else the pager. */}
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

      {/* Table */}
      <div className="bg-white border border-base-200 rounded overflow-auto">
        <table
          className="w-full border-collapse text-[13px]"
          style={{ minWidth: 1280 }}
        >
          <thead>
            <tr className="bg-base-50 border-b border-base-200">
              <th className="px-3 py-2.5 w-9">
                <input
                  type="checkbox"
                  checked={allPagedSelected}
                  onChange={toggleAllPaged}
                  aria-label="Select all on this page"
                  className="cursor-pointer accent-base-900 align-middle"
                />
              </th>
              <th className="w-8" />
              <Th>Status</Th>
              <Th>Order ID</Th>
              <Th>Ref No</Th>
              <Th>Customer</Th>
              <Th>Due</Th>
              <Th>Deadline</Th>
              <Th>Location</Th>
              <Th>Carrier</Th>
              <Th>Stock · qty</Th>
              <Th>Items</Th>
            </tr>
          </thead>
          <tbody>
            {total === 0 && (
              <tr>
                <td
                  colSpan={12}
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
                partnerName={partnerName}
                availableBySku={availableBySku}
                selected={selected.has(o.id)}
                onToggle={() => toggleOne(o.id)}
                onOpen={() => setOpenOrderId(o.id)}
                onToggleStar={toggleFollowUp}
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
      {/* Gmail-style toolbar (left) — refresh. Select-all + a ⋮ bulk-action menu
          land in the next pass. */}
      <button
        type="button"
        onClick={onRefresh}
        title="Refresh"
        aria-label="Refresh orders"
        className="p-1.5 rounded text-base-500 hover:text-base-900 hover:bg-base-100 transition-colors"
      >
        <RefreshCw size={15} strokeWidth={2} />
      </button>
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
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11.5px] transition-colors ${
        active
          ? "bg-base-900 text-white font-semibold"
          : "bg-base-100 text-base-600 font-medium hover:bg-base-200"
      }`}
    >
      {label}
      <span className={`text-[10px] tabular-nums ${active ? "text-white/70" : "text-base-400"}`}>
        {count}
      </span>
    </button>
  );
}

function OrderRow({
  o,
  idx,
  partnerName,
  availableBySku,
  selected,
  onToggle,
  onOpen,
  onToggleStar,
}: {
  o: operationOrderListRow;
  idx: number;
  partnerName: Map<string, string>;
  availableBySku?: Map<string, number>;
  selected: boolean;
  onToggle: () => void;
  onOpen: () => void;
  onToggleStar: (orderId: string, flagged: boolean) => void;
}) {
  const ct = controlTabOf(o);
  const flagged = isFlaggedOrder(o);
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

  return (
    <tr
      onClick={onOpen}
      className={`border-t border-base-100 hover:bg-base-100/70 cursor-pointer align-top ${
        selected ? "bg-primary/5" : idx % 2 ? "bg-base-50/50" : ""
      }`}
      data-testid="order-row"
    >
      <td className="px-3 py-2 border-r border-base-100" onClick={(e) => e.stopPropagation()}>
        <input
          type="checkbox"
          checked={selected}
          onChange={onToggle}
          aria-label={`Select SO-${o.so}`}
          className="cursor-pointer accent-base-900 align-middle"
        />
      </td>
      {/* ⭐ follow-up flag — own column (Gmail star): click to flag/unflag
          without opening the order. */}
      <td
        className="px-1 py-2 text-center border-r border-base-100"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={() => onToggleStar(o.id, flagged)}
          aria-pressed={flagged}
          aria-label={flagged ? "Clear follow-up flag" : "Flag for follow-up"}
          title={flagged ? "Flagged for follow-up — click to clear" : "Flag for follow-up"}
          className="p-0.5 rounded hover:bg-base-200 shrink-0"
        >
          <Star
            size={15}
            strokeWidth={2}
            className={flagged ? "fill-current text-warning" : "text-base-300"}
          />
        </button>
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
        className="px-3 py-2 whitespace-nowrap border-r border-base-100 font-mono font-semibold text-[12px] text-base-900"
        title={o.customer_phone ?? undefined}
      >
        SO-{o.so}
      </td>
      {/* Ref No — TCF / CR / DL source refs. Compact (Jess 2026-06-24): 10px,
          wraps to ≤3 tight lines inside a capped width, so several refs save
          space without making the row taller. */}
      <td className="px-3 py-2 border-r border-base-100">
        {ref.length > 0 ? (
          <span
            className="font-mono text-[10px] text-base-400 break-words max-w-[140px]"
            style={{
              display: "-webkit-box",
              WebkitBoxOrient: "vertical",
              WebkitLineClamp: 3,
              overflow: "hidden",
              lineHeight: 1.3,
            }}
          >
            {ref.join(" · ")}
          </span>
        ) : (
          <span className="text-base-300">—</span>
        )}
      </td>
      {/* Customer */}
      <td className="px-3 py-2 whitespace-nowrap border-r border-base-100">
        {o.customer_name ? (
          <span className={`${cjkClassName(o.customer_name)} text-[12px] text-base-800`}>
            {o.customer_name}
          </span>
        ) : (
          <span className="text-base-300">—</span>
        )}
      </td>
      {/* Due — compact countdown. Urgent (overdue/today/tomorrow) = a small red
          badge; otherwise a plain grey "Nd". Completed orders show a quiet "—"
          (no fake "overdue" on a closed order — Jess 2026-06-24). */}
      <td className="px-3 py-2 whitespace-nowrap border-r border-base-100">
        {ct === "completed" ? (
          <span className="text-base-300">—</span>
        ) : o.delivery_date_tbd ? (
          <span className="text-[11px] font-medium text-warning">TBD</span>
        ) : o.delivery_date ? (
          (() => {
            const dl = deadlineInfo(o.delivery_date);
            if (!dl) return <span className="text-base-300">—</span>;
            return dl.urgent ? (
              <span
                className="inline-flex items-center gap-0.5 text-[11px] font-semibold tabular-nums whitespace-nowrap rounded px-1.5 py-0.5 bg-destructive/10 text-destructive"
                title="Urgent — due today / tomorrow or overdue"
              >
                <AlertTriangle size={10} strokeWidth={2.5} />
                {dl.label}
              </span>
            ) : (
              <span className="text-[12px] font-medium tabular-nums text-base-500">
                {dl.label}
              </span>
            );
          })()
        ) : (
          <span className="text-base-300">—</span>
        )}
      </td>
      {/* Deadline — the customer's requested delivery date */}
      <td
        className="px-3 py-2 whitespace-nowrap border-r border-base-100 text-[12px] text-base-700 tabular-nums"
        title="Customer's requested delivery date. Stock at the warehouse 7 days before; logistic contacts the customer 2–3 days before."
      >
        {o.delivery_date && !o.delivery_date_tbd ? (
          fmtDate(o.delivery_date)
        ) : (
          <span className="text-base-300">—</span>
        )}
      </td>
      {/* Location — delivery city/state. Q1 colour restraint (Jess 2026-06-24):
          KV (the majority) is now NEUTRAL grey so the green leaves the table;
          only Outstation keeps a quiet amber (no warehouse buffer = special
          handling). The "Call before PO" action moved INTO the drawer. */}
      <td className="px-3 py-2 whitespace-nowrap border-r border-base-100">
        {loc.label ? (
          <span
            className={`text-[11px] font-medium ${
              loc.area === "Outstation" ? "text-warning" : "text-base-600"
            }`}
            title={
              loc.area === "Outstation"
                ? "Outstation — no warehouse buffer; call the customer to confirm the ETA before ordering stock (do it in the order drawer)."
                : undefined
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
          <span className="text-[12px] font-medium text-base-800">{logistic}</span>
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
      <td className="px-3 py-2 max-w-[300px]" title={itemBreakdown(lines)}>
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
    </tr>
  );
}

/** Stock · qty cell — ONE button carrying readiness + the goods-unit count
 *  (Jess 2026-06-24 merged Stock + Qty). Grey Ready (secured / shelf covers it) ·
 *  amber Waiting (short → PO, or PO open) · grey Not set (can't auto-check).
 *  Coverage rides inside where known ("Ready 3/3" / "Waiting 0/1"), else "×N". */
function StockCell({ info, qty }: { info: StockInfo; qty: number }) {
  const qtySuffix = qty > 0 ? ` ×${qty}` : "";
  if (info.state === "unknown")
    return (
      <span
        data-stock-state="unknown"
        className="pill pill-neutral text-base-400 font-medium whitespace-nowrap tabular-nums"
        title="Can't auto-check from the catalog (free-text SKU) — open the order to check stock"
      >
        Not set{qtySuffix}
      </span>
    );

  // have/need coverage when known; otherwise the goods-unit count (Stock + Qty
  // merged into one button, Jess 2026-06-24).
  const counts =
    info.need != null && info.have != null ? ` ${info.have}/${info.need}` : qtySuffix;
  // Q1 colour restraint (Jess 2026-06-24): Ready is the common case → render it
  // QUIET (neutral grey) so the green leaves the table; colour now only marks the
  // exception — amber Waiting = "raise a PO / on the way".
  const cfg = {
    ready: { pill: "pill-neutral", label: `Ready${qtySuffix}`, title: "Stock secured / reserved for this order" },
    in_stock: { pill: "pill-neutral", label: `Ready${counts}`, title: "Free warehouse stock covers every line" },
    need_po: {
      pill: "pill-warning",
      label: `Waiting${counts}`,
      title:
        "Short — raise a PO" +
        (info.short && info.short.length > 0
          ? ": " + info.short.map((s) => `${shortSku(s.sku)} ${s.have}/${s.need}`).join(", ")
          : ""),
    },
    awaiting: { pill: "pill-warning", label: `Waiting${qtySuffix}`, title: "PO open — stock on the way" },
  }[info.state];

  return (
    <span
      className={`pill ${cfg.pill} whitespace-nowrap tabular-nums`}
      title={cfg.title}
      data-stock-state={info.state}
    >
      {cfg.label}
    </span>
  );
}

/** Trim a long/free-text SKU to a compact token for the items sub-line. */
function shortSku(sku: string): string {
  const s = sku.includes(":") ? sku.split(":").slice(1).join(":") : sku;
  return s.length > 14 ? s.slice(0, 13) + "…" : s;
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th className="px-4 py-2.5 text-[11px] font-semibold uppercase tracking-[0.05em] text-base-700 text-left">
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

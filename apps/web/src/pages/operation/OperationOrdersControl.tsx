import { useEffect, useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useParams } from "react-router-dom";
import {
  useOperationOrders,
  useOperationStock,
  useDeliveryPartners,
  type operationOrderListRow,
} from "@/lib/queries";
import { fmtDate, fmtDateShort } from "@/lib/fmt-date";
import { cjkClassName } from "@/lib/cjk";
import { areaForAddress, detectState, locationForAddress } from "@/lib/region";
import { apiFetch } from "@/lib/api";
import OrderDetailDrawer from "./components/OrderDetailDrawer";
import type { OperationStage } from "./components/StageChip";
import {
  Phone,
  AlertTriangle,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  MoreVertical,
  Truck,
  Download,
  ListTodo,
  X,
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

/** v17 status pills per control tab (warning=amber for Pending = waiting on
 *  stock). placed→neutral, proceed→purple, pending→amber, scheduled→indigo,
 *  completed→green. */
const TAB_PILL: Record<SettledTab, string> = {
  placed: "pill-neutral",
  proceed: "pill-draft",
  pending: "pill-warning",
  scheduled: "pill-collected",
  completed: "pill-confirmed",
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
  return "awaiting_operation_action";
}

/** Which control tab an order belongs to. */
function controlTabOf(o: operationOrderListRow): SettledTab {
  const s = stageOf(o);
  if (s === "delivered") return "completed";
  if (s === "dispatched" || s === "ready_to_dispatch") return "scheduled";
  if (s === "awaiting_operation_action") return "pending";
  if (s === "proceed_request") return "proceed";
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
  if (s === "awaiting_operation_action") return { state: "awaiting" };

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
  if (diff < 0) return { label: `Overdue ${-diff}d`, pill: "pill-overdue", urgent: true };
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
type CoreCat = "mattress" | "bedframe" | "sofa";
const CORE_LABEL: Record<CoreCat, string> = {
  mattress: "Mattress",
  bedframe: "Bedframe",
  sofa: "Sofa",
};
const CORE_ORDER: CoreCat[] = ["mattress", "bedframe", "sofa"];

function lineCategory(sku: string): CoreCat | "acc" {
  const s = sku.trim();
  if (s.includes(":")) {
    const p = s.split(":")[0].toLowerCase();
    return p === "mattress" || p === "bedframe" || p === "sofa" ? p : "acc";
  }
  if (/^ms\d/i.test(s)) return "mattress";
  if (/^bf\d/i.test(s)) return "bedframe";
  if (/^(sof|sf)\d/i.test(s)) return "sofa";
  return "acc";
}

function lineSize(sku: string): string | null {
  const m = sku.trim().match(/-([KQS])$/i);
  return m ? m[1].toUpperCase() : null;
}

/** Short proper TYPE name for a non-core line — the list shows these instead of
 *  a generic "accessories" (Loo: show Pillow / M.P / Disposal by name). The
 *  drawer shows the full original name; this is the list-only short form. */
function accShort(sku: string): string {
  const s = sku.toLowerCase();
  if (/pillow/.test(s)) return "Pillow";
  if (/protector|protect|\bm\.?p\b/.test(s)) return "M.P";
  if (/disposal|dispose/.test(s)) return "Disposal";
  if (/floor|lift|stair|transport|delivery|charge|install/.test(s)) return "Service";
  if (/topper/.test(s)) return "Topper";
  const w = sku.trim().split(/[\s/]+/)[0] ?? sku;
  return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
}

/** Per-category colour for the item tags (Jess: box each category to avoid
 *  misreading). Reuses the design-system pill palette so colours are guaranteed
 *  present + consistent: Mattress blue · Bedframe amber · Sofa purple ·
 *  accessories neutral grey. */
const ITEM_TAG: Record<CoreCat | "acc", string> = {
  mattress: "pill-sent",
  bedframe: "pill-warning",
  sofa: "pill-draft",
  acc: "pill-neutral",
};

/** Roll a line list up into per-category TAGS (Jess: one boxed tag per
 *  category). Core goods carry qty + size; accessories the short type name
 *  (qty when >1). e.g. [{mattress,"2× Mattress(Q)"}, {acc,"2× Pillow"}]. */
function itemTags(
  lines: { sku: string; qty: number }[],
): { cat: CoreCat | "acc"; label: string }[] {
  const core = new Map<CoreCat, { qty: number; sizes: Set<string> }>();
  const acc = new Map<string, number>();
  for (const l of lines) {
    const q = Number(l.qty || 0);
    if (q <= 0) continue;
    const cat = lineCategory(l.sku);
    if (cat === "acc") {
      const name = accShort(l.sku);
      acc.set(name, (acc.get(name) ?? 0) + q);
      continue;
    }
    const e = core.get(cat) ?? { qty: 0, sizes: new Set<string>() };
    e.qty += q;
    const sz = lineSize(l.sku);
    if (sz) e.sizes.add(sz);
    core.set(cat, e);
  }
  const out: { cat: CoreCat | "acc"; label: string }[] = [];
  for (const cat of CORE_ORDER) {
    const e = core.get(cat);
    if (!e) continue;
    const sizes = e.sizes.size ? `(${[...e.sizes].sort().join(",")})` : "";
    out.push({ cat, label: `${e.qty}× ${CORE_LABEL[cat]}${sizes}` });
  }
  for (const [name, q] of acc) out.push({ cat: "acc", label: q > 1 ? `${q}× ${name}` : name });
  return out;
}

/** Flat single-line rollup (CSV export + tooltips). */
function itemRollup(lines: { sku: string; qty: number }[]): string {
  return itemTags(lines).map((t) => t.label).join(" · ") || "—";
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
    case "proceed_request":
      return "proceed";
    case "awaiting_operation_action":
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
  const [pageSize] = useState<number | "all">(50);
  const [page, setPage] = useState(0);
  // Bulk select (Gmail-style): selected order ids + the ⋮ menu mode.
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkMenu, setBulkMenu] = useState<null | "menu" | "assign">(null);
  // Urgent chip + state-region pills — both stack on top of the status tab.
  const [urgentOnly, setUrgentOnly] = useState(false);
  const [regionFilter, setRegionFilter] = useState<string | null>(null);

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

  const visible = useMemo(() => {
    let r = tabFiltered;
    if (urgentOnly) r = r.filter(isUrgentOrder);
    if (regionFilter) r = r.filter((o) => regionBucket(o.customer_address ?? null) === regionFilter);
    return r;
  }, [tabFiltered, urgentOnly, regionFilter]);

  // Most-recent order/import time → shown next to the count.
  const latestIn = useMemo(() => {
    let mx: string | null = null;
    for (const o of orders) if (o.placed_at && (!mx || o.placed_at > mx)) mx = o.placed_at;
    return mx;
  }, [orders]);

  // Reset to the first page whenever the filtered set changes.
  useEffect(() => setPage(0), [tab, search, pageSize, urgentOnly, regionFilter]);

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
    const header = ["SO", "Customer", "Phone", "Units", "Items", "Deadline", "Location", "Logistic", "Status"];
    const body = selectedOrders.map((o) => {
      const ls = o.order_lines ?? [];
      const units = ls.reduce((s, l) => s + Number(l.qty || 0), 0);
      const loc = locationForAddress(o.customer_address ?? null);
      const logi =
        o.delivery_partners?.name ??
        (o.ops_assigned_logistic ? partnerName.get(o.ops_assigned_logistic) ?? "" : "");
      return [
        `SO-${o.so}`, o.customer_name ?? "", o.customer_phone ?? "", units,
        itemRollup(ls), o.delivery_date_tbd ? "TBD" : o.delivery_date ?? "",
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
            const pill = t.key === "all" ? "pill-neutral" : TAB_PILL[t.key as SettledTab];
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
                <span className={`pill ${pill} text-[10px] px-1.5 py-0`}>{counts[t.key]}</span>
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
      </div>

      {/* State-region filter pills (Jess: pick a state → select-all → assign
          logistic). Stacks with the status tab + Urgent chip above. */}
      <div className="flex items-center gap-1.5 mb-3.5 flex-wrap">
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
          onClear={clearSel}
          busy={assignMut.isPending || taskMut.isPending}
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
          style={{ minWidth: 960 }}
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
              <Th>Order ID</Th>
              <Th>Customer</Th>
              <Th>Items</Th>
              <Th>Deadline</Th>
              <Th>Location</Th>
              <Th>Stock</Th>
              <Th>Logistic</Th>
              <Th>Status</Th>
            </tr>
          </thead>
          <tbody>
            {total === 0 && (
              <tr>
                <td
                  colSpan={9}
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
  partnerName,
  availableBySku,
  selected,
  onToggle,
  onOpen,
}: {
  o: operationOrderListRow;
  partnerName: Map<string, string>;
  availableBySku?: Map<string, number>;
  selected: boolean;
  onToggle: () => void;
  onOpen: () => void;
}) {
  const ct = controlTabOf(o);
  const ref = (o.source_ref ?? []).filter(Boolean);
  const lines = o.order_lines ?? [];
  const qtyTotal = lines.reduce((s, l) => s + Number(l.qty || 0), 0);
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
      className={`border-t border-base-100 hover:bg-base-50 cursor-pointer align-top ${selected ? "bg-primary/5" : ""}`}
      data-testid="order-row"
    >
      <td className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
        <input
          type="checkbox"
          checked={selected}
          onChange={onToggle}
          aria-label={`Select SO-${o.so}`}
          className="cursor-pointer accent-base-900 align-middle"
        />
      </td>
      {/* Ref */}
      <td className="px-4 py-2.5 whitespace-nowrap">
        <div className="font-mono font-semibold text-base-900">SO-{o.so}</div>
        {ref.length > 0 && (
          <div className="font-mono text-[10.5px] text-base-500 mt-0.5">
            {ref.join(" + ")}
          </div>
        )}
      </td>
      {/* Customer — name only; phone lives in the drawer (Jess: save list space) */}
      <td className="px-4 py-2.5">
        <div
          className={`${cjkClassName(o.customer_name)} font-medium text-base-900`}
        >
          {o.customer_name || "—"}
        </div>
      </td>
      {/* Items — total-units headline + one boxed colour tag per category
          (Mattress blue · Bedframe amber · Sofa purple · accessories grey) so
          nothing gets misread. Tooltip = full SKU list. */}
      <td className="px-4 py-2.5">
        <div className="text-base-900 font-semibold">
          {qtyTotal} unit{qtyTotal === 1 ? "" : "s"}
        </div>
        {tags.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1 max-w-[300px]" title={itemBreakdown(lines)}>
            {tags.map((t, i) => (
              <span key={i} className={`pill ${ITEM_TAG[t.cat]} text-[10px] px-1.5 py-0`}>
                {t.label}
              </span>
            ))}
          </div>
        )}
      </td>
      {/* Deadline — customer's requested delivery date + prep-milestone countdown.
          Tooltip spells out the SOP: stock at WH 7 days before, logistic
          contacts the customer 2–3 days before. */}
      <td
        className="px-4 py-2.5 whitespace-nowrap text-base-700"
        title="Deadline = customer's requested delivery date. Stock should be at the warehouse 7 days before; logistic contacts the customer 2–3 days before to arrange delivery."
      >
        {o.delivery_date_tbd ? (
          <span className="pill pill-warning">TBD</span>
        ) : o.delivery_date ? (
          (() => {
            const dl = deadlineInfo(o.delivery_date);
            return (
              <div className="flex flex-col items-start gap-1">
                <div className="text-[12px] text-base-700">{fmtDate(o.delivery_date)}</div>
                {dl && (
                  <span
                    className={`pill ${dl.pill} whitespace-nowrap ${dl.urgent ? "inline-flex items-center gap-1" : ""}`}
                  >
                    {dl.urgent && <AlertTriangle size={11} strokeWidth={2.5} />}
                    {dl.label}
                  </span>
                )}
              </div>
            );
          })()
        ) : (
          <span className="text-base-400">—</span>
        )}
      </td>
      {/* Location — the real delivery place from the imported address (city/state),
          coloured by KV (green) vs Outstation (amber). Outstation carries a 📞
          flag for the call-first-before-PO SOP. */}
      <td className="px-4 py-2.5 whitespace-nowrap">
        {loc.label ? (
          <span className="inline-flex items-center gap-1">
            <span
              className={`text-[11px] font-medium ${
                loc.area === "KV"
                  ? "text-success"
                  : loc.area === "Outstation"
                    ? "text-warning"
                    : "text-base-600"
              }`}
            >
              {loc.label}
            </span>
            {loc.area === "Outstation" && (
              <span
                title="Outstation — confirm the delivery window with the customer before raising the PO (no warehouse buffer outstation)."
                aria-label="call customer before raising PO"
              >
                <Phone size={12} strokeWidth={2} className="inline text-warning" />
              </span>
            )}
          </span>
        ) : (
          <span className="text-base-400">—</span>
        )}
      </td>
      {/* Stock */}
      <td className="px-4 py-2.5 whitespace-nowrap">
        <StockCell info={stock} />
      </td>
      {/* Logistic */}
      <td className="px-4 py-2.5 whitespace-nowrap">
        {logistic ? (
          <span className="text-[12px] font-medium text-base-800">
            {logistic}
          </span>
        ) : (
          <span className="text-base-400">—</span>
        )}
      </td>
      {/* Status */}
      <td className="px-4 py-2.5 whitespace-nowrap">
        <span title={TAB_DESC[ct]} className={`pill ${TAB_PILL[ct]}`}>
          {TAB_LABEL[ct]}
        </span>
      </td>
    </tr>
  );
}

/** Visual config per stock state. Two greens (pipeline-secured "Ready" vs
 *  shelf-available "In stock") and two ambers ("Make to order" = no PO yet vs
 *  "Awaiting stock" = PO already open) — same tone, distinct label so the
 *  operator reads the next action at a glance. */
const STOCK_CFG: Record<
  Exclude<StockState, "unknown">,
  { tone: string; dot: string; label: string }
> = {
  ready: { tone: "text-success", dot: "bg-success", label: "Ready" },
  in_stock: { tone: "text-success", dot: "bg-success", label: "In stock" },
  need_po: { tone: "text-warning", dot: "bg-warning", label: "Make to order" },
  awaiting: { tone: "text-warning", dot: "bg-warning", label: "Awaiting stock" },
};

function StockCell({ info }: { info: StockInfo }) {
  if (info.state === "unknown")
    return (
      <span data-stock-state="unknown" className="text-base-400">
        —
      </span>
    );
  const cfg = STOCK_CFG[info.state];

  // Real numbers (Jess's ask): show coverage on the matchable early states.
  const showCounts =
    (info.state === "in_stock" || info.state === "need_po") &&
    info.need != null &&
    info.have != null;
  const title =
    info.short && info.short.length > 0
      ? "Short — " +
        info.short.map((s) => `${shortSku(s.sku)} ${s.have}/${s.need}`).join(", ")
      : undefined;

  return (
    <span
      className="inline-flex flex-col gap-0.5"
      title={title}
      data-stock-state={info.state}
    >
      <span className={`inline-flex items-center gap-1 text-[12px] ${cfg.tone}`}>
        <span className={`w-[7px] h-[7px] rounded-full ${cfg.dot}`} />
        {cfg.label}
      </span>
      {showCounts && (
        <span className="text-[10px] text-base-500 font-mono">
          {info.have}/{info.need} units
        </span>
      )}
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
    <th className="px-4 py-2.5 text-[11px] font-semibold uppercase tracking-[0.05em] text-base-500 text-left">
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

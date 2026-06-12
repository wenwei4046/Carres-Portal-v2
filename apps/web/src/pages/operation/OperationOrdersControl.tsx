import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import {
  useOperationOrders,
  useOperationStock,
  useDeliveryPartners,
  type operationOrderListRow,
} from "@/lib/queries";
import { fmtDate } from "@/lib/fmt-date";
import { cjkClassName } from "@/lib/cjk";
import { locationForAddress } from "@/lib/region";
import OrderDetailDrawer from "./components/OrderDetailDrawer";
import type { OperationStage } from "./components/StageChip";

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

const TAB_CHIP: Record<SettledTab, { text: string; border: string }> = {
  placed: { text: "text-base-500", border: "border-base-300" },
  proceed: { text: "text-info", border: "border-info" },
  pending: { text: "text-warning", border: "border-warning" },
  scheduled: { text: "text-primary", border: "border-primary" },
  completed: { text: "text-success", border: "border-success" },
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

const PAGE_SIZES = [50, 100] as const;

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
): { label: string; tone: string } | null {
  if (!dateStr) return null;
  const d = new Date(`${dateStr}T00:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diff = Math.round((d.getTime() - today.getTime()) / 86_400_000);
  if (diff < 0) return { label: `overdue ${-diff}d`, tone: "text-destructive" };
  if (diff === 0) return { label: "today 📞", tone: "text-destructive" };
  if (diff <= 3) return { label: `${diff}d 📞`, tone: "text-destructive" };
  if (diff <= 7) return { label: `${diff}d ⚠`, tone: "text-warning" };
  return { label: `in ${diff}d`, tone: "text-base-500" };
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

/** Roll a line list up into "2× Mattress(Q) · 1× Bedframe · +3 acc". */
function itemRollup(lines: { sku: string; qty: number }[]): string {
  const core = new Map<CoreCat, { qty: number; sizes: Set<string> }>();
  let accQty = 0;
  for (const l of lines) {
    const q = Number(l.qty || 0);
    if (q <= 0) continue;
    const cat = lineCategory(l.sku);
    if (cat === "acc") {
      accQty += q;
      continue;
    }
    const e = core.get(cat) ?? { qty: 0, sizes: new Set<string>() };
    e.qty += q;
    const sz = lineSize(l.sku);
    if (sz) e.sizes.add(sz);
    core.set(cat, e);
  }
  const parts: string[] = [];
  for (const cat of CORE_ORDER) {
    const e = core.get(cat);
    if (!e) continue;
    const sizes = e.sizes.size ? `(${[...e.sizes].sort().join(",")})` : "";
    parts.push(`${e.qty}× ${CORE_LABEL[cat]}${sizes}`);
  }
  if (accQty > 0)
    parts.push(`+${accQty} ${accQty === 1 ? "accessory" : "accessories"}`);
  return parts.join(" · ") || "—";
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
  const [pageSize, setPageSize] = useState<number | "all">(50);
  const [page, setPage] = useState(0);

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

  const visible = useMemo(() => {
    if (tab === "all") return orders;
    return orders.filter((o) => controlTabOf(o) === tab);
  }, [orders, tab]);

  // Reset to the first page whenever the filtered set changes (tab/search/size).
  useEffect(() => setPage(0), [tab, search, pageSize]);

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
      {/* Header */}
      <div className="flex items-start justify-between gap-4 mb-[18px] flex-wrap">
        <div>
          <div className="kicker">HQ · Operations</div>
          <h1 className="font-display text-[30px] leading-[1.05] mt-1.5 tracking-[-0.025em] font-semibold">
            Orders
          </h1>
          <div className="text-[13px] text-base-600 mt-1.5">
            {orders.length} order{orders.length !== 1 ? "s" : ""} · click a row
            for full control
          </div>
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

      {/* Status tabs */}
      <div
        className="flex gap-1 p-1 bg-base-100 rounded mb-3.5 w-fit max-w-full overflow-auto"
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
              title={
                t.key === "all"
                  ? "Every active order"
                  : TAB_DESC[t.key as SettledTab]
              }
              className={`px-3 py-1.5 text-[12px] rounded cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
                active
                  ? "bg-white text-base-900 font-semibold shadow-sm"
                  : "text-base-600 font-medium hover:text-base-900"
              }`}
            >
              <span>{t.label}</span>
              <span
                className={`text-[10px] font-mono px-1.5 py-px rounded-full ${
                  active ? "bg-base-100 text-base-700" : "bg-base-200 text-base-500"
                }`}
              >
                {counts[t.key]}
              </span>
            </button>
          );
        })}
      </div>

      {/* Table */}
      <div className="bg-white border border-base-200 rounded overflow-auto">
        <table
          className="w-full border-collapse text-[13px]"
          style={{ minWidth: 960 }}
        >
          <thead>
            <tr className="bg-base-50 border-b border-base-200">
              <Th>Ref</Th>
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
                  colSpan={8}
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
                onOpen={() => setOpenOrderId(o.id)}
              />
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination — page-size + range + prev/next, so the list never dumps all
          155 rows at once. */}
      {total > 0 && (
        <div className="flex items-center justify-between gap-3 mt-3 flex-wrap text-[12px] text-base-600">
          <div className="flex items-center gap-2">
            <span>Rows per page</span>
            {PAGE_SIZES.map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setPageSize(n)}
                className={`px-2 py-1 rounded border text-[11px] ${
                  pageSize === n
                    ? "border-primary text-primary font-semibold bg-primary/5"
                    : "border-base-200 text-base-600 hover:border-base-400"
                }`}
              >
                {n}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setPageSize("all")}
              className={`px-2 py-1 rounded border text-[11px] ${
                pageSize === "all"
                  ? "border-primary text-primary font-semibold bg-primary/5"
                  : "border-base-200 text-base-600 hover:border-base-400"
              }`}
            >
              All
            </button>
          </div>
          <div className="flex items-center gap-3">
            <span className="tabular-nums">
              {rangeStart}–{rangeEnd} of {total}
            </span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                disabled={pageSize === "all" || safePage <= 0}
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                className="px-2 py-1 rounded border border-base-200 text-[11px] disabled:opacity-40 hover:border-base-400"
              >
                ‹ Prev
              </button>
              <span className="tabular-nums text-[11px] text-base-500">
                {safePage + 1}/{pageCount}
              </span>
              <button
                type="button"
                disabled={pageSize === "all" || safePage >= pageCount - 1}
                onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
                className="px-2 py-1 rounded border border-base-200 text-[11px] disabled:opacity-40 hover:border-base-400"
              >
                Next ›
              </button>
            </div>
          </div>
        </div>
      )}

      {openOrderId && (
        <OrderDetailDrawer
          orderId={openOrderId}
          onClose={() => setOpenOrderId(null)}
        />
      )}
    </div>
  );
}

function OrderRow({
  o,
  partnerName,
  availableBySku,
  onOpen,
}: {
  o: operationOrderListRow;
  partnerName: Map<string, string>;
  availableBySku?: Map<string, number>;
  onOpen: () => void;
}) {
  const ct = controlTabOf(o);
  const ref = (o.source_ref ?? []).filter(Boolean);
  const lines = o.order_lines ?? [];
  const qtyTotal = lines.reduce((s, l) => s + Number(l.qty || 0), 0);
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
      className="border-t border-base-100 hover:bg-base-50 cursor-pointer align-top"
      data-testid="order-row"
    >
      {/* Ref */}
      <td className="px-4 py-3 whitespace-nowrap">
        <div className="font-mono font-semibold text-base-900">SO-{o.so}</div>
        {ref.length > 0 && (
          <div className="font-mono text-[10.5px] text-base-500 mt-0.5">
            {ref.join(" + ")}
          </div>
        )}
      </td>
      {/* Customer */}
      <td className="px-4 py-3">
        <div
          className={`${cjkClassName(o.customer_name)} font-medium text-base-900`}
        >
          {o.customer_name || "—"}
        </div>
        {o.customer_phone && (
          <div className="text-[11px] text-base-500 mt-0.5">
            {o.customer_phone}
          </div>
        )}
      </td>
      {/* Items */}
      <td className="px-4 py-3">
        <div className="text-base-800">
          {qtyTotal} unit{qtyTotal === 1 ? "" : "s"}
        </div>
        {lines.length > 0 && (
          <div
            className="text-[10.5px] text-base-600 mt-0.5 leading-snug max-w-[230px] truncate"
            title={itemBreakdown(lines)}
          >
            {itemRollup(lines)}
          </div>
        )}
      </td>
      {/* Deadline — customer's requested delivery date + prep-milestone countdown.
          Tooltip spells out the SOP: stock at WH 7 days before, logistic
          contacts the customer 2–3 days before. */}
      <td
        className="px-4 py-3 whitespace-nowrap text-base-700"
        title="Deadline = customer's requested delivery date. Stock should be at the warehouse 7 days before; logistic contacts the customer 2–3 days before to arrange delivery."
      >
        {o.delivery_date_tbd ? (
          <span className="text-warning text-[12px]">TBD</span>
        ) : o.delivery_date ? (
          (() => {
            const dl = deadlineInfo(o.delivery_date);
            return (
              <div>
                <div>{fmtDate(o.delivery_date)}</div>
                {dl && (
                  <div className={`text-[10.5px] font-semibold ${dl.tone}`}>
                    {dl.label}
                  </div>
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
      <td className="px-4 py-3 whitespace-nowrap">
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
                📞
              </span>
            )}
          </span>
        ) : (
          <span className="text-base-400">—</span>
        )}
      </td>
      {/* Stock */}
      <td className="px-4 py-3 whitespace-nowrap">
        <StockCell info={stock} />
      </td>
      {/* Logistic */}
      <td className="px-4 py-3 whitespace-nowrap">
        {logistic ? (
          <span className="text-[12px] font-medium text-base-800">
            {logistic}
          </span>
        ) : (
          <span className="text-base-400">—</span>
        )}
      </td>
      {/* Status */}
      <td className="px-4 py-3 whitespace-nowrap">
        <span
          title={TAB_DESC[ct]}
          className={`inline-block text-[9px] font-bold uppercase tracking-[0.12em] py-[3px] px-[7px] border rounded-[3px] ${TAB_CHIP[ct].text} ${TAB_CHIP[ct].border}`}
        >
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

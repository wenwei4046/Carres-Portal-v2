import { useMemo, useState } from "react";
import {
  useLogisticsOrders,
  type LogisticsOrderListRow,
} from "@/lib/queries";
import CreatePOModal, {
  type CreatePoPrefill,
} from "./components/CreatePOModal";
import OrderColumn from "./components/OrderColumn";
import OrderDetailDrawer from "./components/OrderDetailDrawer";
import CrossOrderBundleSheet from "./components/CrossOrderBundleSheet";
import type { LogisticsStage } from "./components/StageChip";

/**
 * LogisticsOrders — full kanban view for the HQ logistics role.
 *
 * Mirrors `reference/proto/logistics-orders.jsx` `LogisticsOrders`
 * (lines 1-138) with Pipeline v2 (Phase 4 C3) extensions:
 *   - Header (Pipeline kicker + count strap + search + dealer/showroom select)
 *   - Stage filter chips (All + 6 stage chips with counts)
 *   - Bulk action bar when ≥1 awaiting_stock orders selected
 *   - 6-column kanban (placed / proceed_request / awaiting_stock /
 *     ready_to_dispatch / dispatched / delivered) with click-to-expand
 *     (the active column gets `flex: 4`, others compress to `flex: 0.4`)
 *   - OrderDetailDrawer overlay when an order is opened
 *
 * Pipeline v2 LOGISTICS_FLOW (mirrors proto + C1 enum extension):
 *   placed             → "Awaiting request"        · action null
 *   proceed_request    → "Awaiting your decision"  · action "Confirm"
 *   awaiting_stock     → "PO open with supplier"   · action "Check stock"
 *   ready_to_dispatch  → "Stock secured"           · action "Assign delivery"
 *   dispatched         → "With delivery partner"   · action "Attach DO"
 *   delivered          → "DO on file"              · action null
 *
 * Filtering: stage + channel both go to the server (cache key respects them);
 * `search` also goes to the server (the route's regex-whitelisted search field
 * matches customer_name ILIKE + dl numeric exact).
 */
const LOGISTICS_FLOW: ReadonlyArray<{
  key: LogisticsStage;
  label: string;
  hint: string;
  action: string | null;
}> = [
  { key: "placed",            label: "Placed",            hint: "Awaiting request",        action: null },
  { key: "proceed_request",   label: "Proceed Request",   hint: "Awaiting your decision",  action: "Confirm" },
  { key: "awaiting_stock",    label: "Awaiting Stock",    hint: "PO open with supplier",   action: "Check stock" },
  { key: "ready_to_dispatch", label: "Ready to Dispatch", hint: "Stock secured",           action: "Assign delivery" },
  { key: "dispatched",        label: "Dispatched",        hint: "With delivery partner",   action: "Attach DO" },
  { key: "delivered",         label: "Delivered",         hint: "DO on file",              action: null },
];

type StageFilter = "all" | LogisticsStage;
type ChannelFilter = "all" | "dealers" | "showrooms";

export default function LogisticsOrders() {
  const [stage, setStage] = useState<StageFilter>("all");
  const [channel, setChannel] = useState<ChannelFilter>("all");
  const [search, setSearch] = useState("");
  const [openOrderId, setOpenOrderId] = useState<string | null>(null);
  const [selectedDls, setSelectedDls] = useState<Set<number>>(() => new Set());
  const [bundlePrefill, setBundlePrefill] = useState<CreatePoPrefill | null>(
    null,
  );
  // Pipeline v2 (C3) expand-to-zoom: clicking a column header focuses it (flex:4)
  // while the others compress (flex:0.4). Click again to collapse. Clicking a
  // different column flips focus instantly (no need to collapse first).
  const [expandedStage, setExpandedStage] = useState<LogisticsStage | null>(null);

  // The server applies stage + channel + search; we still fetch the full list
  // for the per-column filter chips (which need ALL stage counts even when a
  // stage filter is active). To get "All · N" + each stage's count, the
  // simplest fix is to ALWAYS fetch with stage='all' and filter client-side.
  const { data, isLoading, isError, error, refetch } = useLogisticsOrders({
    channel: channel === "all" ? undefined : channel,
    search: search.trim() || undefined,
  });

  const allOrders = useMemo(() => data?.orders ?? [], [data]);

  // Bucket orders by stage. Pipeline v2 (C1) widens the enum:
  //   - status='place'     → placed (regardless of logistics_stage; the order
  //                          hasn't been pushed to logistics yet)
  //   - logistics_stage    → use it directly when set
  //   - else status='delivered' → delivered (legacy seed safety net)
  //   - else                → awaiting_stock (legacy proceed_order rows
  //                          without a logistics_stage value still exist in
  //                          older seed data; default them to the work bucket)
  const stageOf = (o: LogisticsOrderListRow): LogisticsStage => {
    if (o.status === "place") return "placed";
    if (o.logistics_stage) return o.logistics_stage as LogisticsStage;
    if (o.status === "delivered") return "delivered";
    return "awaiting_stock";
  };

  const stageCounts = useMemo(() => {
    const counts: Record<LogisticsStage, number> = {
      placed: 0,
      proceed_request: 0,
      awaiting_stock: 0,
      ready_to_dispatch: 0,
      dispatched: 0,
      delivered: 0,
    };
    for (const o of allOrders) counts[stageOf(o)] += 1;
    return counts;
  }, [allOrders]);

  const visibleOrders = useMemo(() => {
    if (stage === "all") return allOrders;
    return allOrders.filter((o) => stageOf(o) === stage);
  }, [allOrders, stage]);

  const ordersByStage = useMemo(() => {
    const buckets: Record<LogisticsStage, LogisticsOrderListRow[]> = {
      placed: [],
      proceed_request: [],
      awaiting_stock: [],
      ready_to_dispatch: [],
      dispatched: [],
      delivered: [],
    };
    for (const o of visibleOrders) buckets[stageOf(o)].push(o);
    return buckets;
  }, [visibleOrders]);

  const toggleSelect = (dl: number) => {
    setSelectedDls((prev) => {
      const next = new Set(prev);
      if (next.has(dl)) next.delete(dl);
      else next.add(dl);
      return next;
    });
  };
  const clearSelected = () => setSelectedDls(new Set());

  const selectedOrderIds = useMemo(() => {
    return allOrders
      .filter((o) => selectedDls.has(o.dl) && stageOf(o) === "awaiting_stock")
      .map((o) => o.id);
  }, [allOrders, selectedDls]);

  function selectAllInColumn(stageKey: LogisticsStage) {
    if (stageKey !== "awaiting_stock") return;
    const stageOrders = ordersByStage.awaiting_stock;
    const stageDls = stageOrders.map((o) => o.dl);
    const allSelected = stageDls.every((dl) => selectedDls.has(dl));
    setSelectedDls((prev) => {
      const next = new Set(prev);
      if (allSelected) {
        for (const dl of stageDls) next.delete(dl);
      } else {
        for (const dl of stageDls) next.add(dl);
      }
      return next;
    });
  }

  if (isLoading) {
    return (
      <div className="px-9 py-8 pb-14">
        <KanbanSkeleton />
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

  const totalIncoming = allOrders.length;

  return (
    <div className="px-9 py-7">
      {/* Header */}
      <div className="flex justify-between items-start mb-[22px] gap-4 flex-wrap">
        <div>
          <div className="kicker">Orders</div>
          <h1 className="font-display text-[32px] leading-[1.05] mt-1.5 tracking-[-0.025em] font-bold text-base-900">
            Pipeline
          </h1>
          <div className="font-body text-[13px] text-base-600 mt-1">
            {visibleOrders.length} of {totalIncoming} orders shown
          </div>
        </div>
        <div className="flex gap-2.5 items-center flex-wrap">
          <input
            type="search"
            placeholder="Search #DL or customer…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Search orders by DL number or customer name"
            className="px-3.5 py-2 border border-base-300 rounded-[4px] text-[13px] min-w-[220px] outline-none focus:border-base-500"
          />
          <select
            value={channel}
            onChange={(e) => setChannel(e.target.value as ChannelFilter)}
            aria-label="Sales channel filter"
            className="px-3 py-2 border border-base-300 rounded-[4px] text-[13px] bg-white outline-none focus:border-base-500"
          >
            <option value="all">All sales channels</option>
            <option value="dealers">Dealers</option>
            <option value="showrooms">Showrooms</option>
          </select>
        </div>
      </div>

      {/* Stage filter chips */}
      <div
        className="flex gap-1.5 mb-[18px] flex-wrap"
        role="tablist"
        aria-label="Stage filter"
      >
        <FilterChip
          active={stage === "all"}
          label={`All · ${totalIncoming}`}
          onClick={() => setStage("all")}
        />
        {LOGISTICS_FLOW.map((s) => (
          <FilterChip
            key={s.key}
            active={stage === s.key}
            label={`${s.label} · ${stageCounts[s.key]}`}
            onClick={() => setStage(s.key)}
          />
        ))}
      </div>

      {/* Bulk-select action bar */}
      {selectedOrderIds.length > 0 && (
        <CrossOrderBundleSheet
          selectedOrderIds={selectedOrderIds}
          onClear={clearSelected}
          // M5.3 wires the bundle CTA to CreatePOModal. We pass the selected
          // orders' DL numbers as `dlRefs` so the create-PO RPC ties the new
          // PO back to all source orders. Line aggregation is left to the
          // user — the proto NewPODialog accepts manual SKU picking; the
          // client-side N-detail-fetch shortage rollup was deferred so the
          // modal feels fast.
          onBundleClick={(orderIds) => {
            const dls = allOrders
              .filter((o) => orderIds.includes(o.id))
              .map((o) => o.dl);
            setBundlePrefill({
              dlRefs: dls,
              note: `Bundle from ${dls.length} orders: ${dls.map((d) => `#${d}`).join(", ")}`,
            });
          }}
        />
      )}

      {/* Kanban — flex row so each column can animate flex-basis on expand. */}
      <div className="flex gap-3 items-stretch">
        {LOGISTICS_FLOW.map((s) => (
          <OrderColumn
            key={s.key}
            stage={s.key}
            label={s.label}
            hint={s.hint}
            bucketAction={s.action}
            orders={ordersByStage[s.key]}
            selectedDls={selectedDls}
            onToggleSelect={toggleSelect}
            onOpenOrder={setOpenOrderId}
            onSelectAll={() => selectAllInColumn(s.key)}
            expanded={expandedStage === s.key}
            anyExpanded={expandedStage !== null}
            onToggleExpand={() =>
              setExpandedStage((prev) => (prev === s.key ? null : s.key))
            }
          />
        ))}
      </div>

      {openOrderId && (
        <OrderDetailDrawer
          orderId={openOrderId}
          onClose={() => setOpenOrderId(null)}
        />
      )}
      {bundlePrefill && (
        <CreatePOModal
          prefill={bundlePrefill}
          onClose={() => {
            setBundlePrefill(null);
            clearSelected();
          }}
        />
      )}
    </div>
  );
}

function FilterChip({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={[
        "px-3 py-1.5 rounded-[4px] text-[12px] transition-colors border",
        active
          ? "bg-base-900 text-white border-base-900 font-semibold"
          : "bg-white text-base-700 border-base-200 font-medium hover:border-base-400",
      ].join(" ")}
    >
      {label}
    </button>
  );
}

function KanbanSkeleton() {
  return (
    <div data-testid="logistics-orders-skeleton">
      <div className="h-12 w-1/3 bg-base-100 rounded animate-pulse mb-6" />
      <div className="flex gap-2 mb-4">
        {Array.from({ length: 7 }).map((_, i) => (
          <div key={i} className="h-7 w-24 bg-base-100 rounded animate-pulse" />
        ))}
      </div>
      <div className="flex gap-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="flex-1 bg-white border border-base-200 rounded-[4px] min-h-[360px] p-3"
          >
            <div className="h-4 w-1/2 bg-base-100 rounded animate-pulse mb-3" />
            {Array.from({ length: 3 }).map((__, j) => (
              <div
                key={j}
                className="h-16 bg-base-50 border border-base-100 rounded-[4px] mb-1.5 animate-pulse"
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

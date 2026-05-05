import {
  useLogisticsDashboard,
  useLogisticsOrders,
  type LogisticsDashboardKpis,
  type LogisticsPipelineCounts,
} from "@/lib/queries";
import LogisticsKpiTile from "./components/LogisticsKpiTile";
import PipelineColumn from "./components/PipelineColumn";
import OpenPOsCard from "./components/OpenPOsCard";
import LowStockCard from "./components/LowStockCard";
import StockAlertsTile from "./components/StockAlertsTile";

/**
 * Logistics landing page — hero summary + 3 KPI tiles + 3-column pipeline +
 * 2 side cards (Open POs / Low Stock).
 *
 * Mirrors `reference/proto/logistics-dashboard.jsx` (`LogisticsDashboard` +
 * `StackedLayout`, lines 1-122). Per spec §18.2 + Loo's MVP F2 decision the
 * "split" layout variant is deferred to Phase 4 polish; we ship `stacked`
 * only.
 *
 * Data sources:
 *   - `useLogisticsDashboard()` — single RPC for KPIs / open_pos / low_stock
 *     side card payloads + pipeline counts (migration 0019).
 *   - `useLogisticsOrders()` — full active orders list, used to slice 5
 *     recent items per pipeline column. The RPC returns counts only on
 *     purpose so the dashboard side cards stay cheap and the kanban list
 *     is paid for once and shared.
 *
 * KPI tab routing (per M5 plan "Click KPI tile → tab switches via setTab"):
 *   - Today  → orders        (jumps to the kanban so the user sees today's row)
 *   - Open POs → procurement (procurement page)
 *   - Overdue → orders       (kanban, dispatched/awaiting tabs surface them)
 *
 * Side card "View all" links:
 *   - Manage POs → procurement
 *   - Open warehouse → warehouse
 */
interface Props {
  setTab: (t: string) => void;
}

const RM = (n: number) => `RM ${Math.round(Number(n) || 0).toLocaleString()}`;

export default function LogisticsDashboard({ setTab }: Props) {
  const { data, isLoading, isError, error, refetch } = useLogisticsDashboard();
  // Active pipeline items — all proceed_order rows + recently delivered (the
  // proto's `incoming` filter). The kanban / orders page reuses the same
  // cache key (`["logistics","orders",{}]`) so this is effectively a free
  // fetch when the user navigates from dashboard → orders.
  const { data: ordersData } = useLogisticsOrders();

  if (isLoading) {
    return (
      <div className="px-9 py-8 pb-14">
        <DashboardSkeleton />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="px-9 py-8 pb-14">
        <div className="rounded-md bg-destructive/10 border border-destructive/30 p-4 text-sm">
          <div className="text-destructive font-semibold mb-2">
            Couldn&rsquo;t load dashboard
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

  const { kpis, pipeline, open_pos, low_stock } = data;
  const orders = ordersData?.orders ?? [];

  // KPI accent rules — mirror proto lines 41-43.
  // Today  > 0 → primary (terracotta) ; 0 → muted (base-400)
  // Open POs > 0 → warning ; 0 → success
  // Overdue > 0 → danger (vivid red, proto #b91c1c) ; 0 → success
  const todayAccent = kpis.today_deliveries > 0 ? "primary" : "muted";
  const poAccent = kpis.open_pos > 0 ? "warning" : "success";
  const overdueAccent = kpis.overdue_orders > 0 ? "danger" : "success";

  return (
    <div className="px-9 py-8 pb-14">
      {/* Hero — proto lines 25-44. The grid is 1.6fr 1fr 1fr 1fr; the first
        cell is the headline + active orders/value strap; the next three
        are the KPI tiles. */}
      <div
        className="grid gap-4 mb-7"
        style={{ gridTemplateColumns: "1.6fr 1fr 1fr 1fr" }}
      >
        <Hero kpis={kpis} pipeline={pipeline} />

        <LogisticsKpiTile
          label="Today"
          value={kpis.today_deliveries}
          hint="deliveries scheduled"
          accent={todayAccent}
          onClick={() => setTab("orders")}
        />
        <LogisticsKpiTile
          label="Open POs"
          value={kpis.open_pos}
          hint={kpis.open_pos === 0 ? "no shortages" : "with suppliers"}
          accent={poAccent}
          onClick={() => setTab("procurement")}
        />
        <LogisticsKpiTile
          label="Overdue"
          value={kpis.overdue_orders}
          hint={
            kpis.overdue_orders === 0 ? "all on track" : "past delivery date"
          }
          accent={overdueAccent}
          onClick={() => setTab("orders")}
        />
      </div>

      {/* Active pipeline header — proto lines 78-83. The proto's overline
          is base-500 (calm-operations), not terracotta — so we use explicit
          Tailwind here instead of the .kicker utility (which @applies
          text-primary). */}
      <div className="flex items-end justify-between gap-4 mb-3.5 flex-wrap">
        <div className="text-[11px] uppercase tracking-[0.22em] font-semibold text-base-500">
          Active pipeline
        </div>
        <button
          type="button"
          onClick={() => setTab("orders")}
          className="btn-ghost text-[12px] py-1 px-2"
        >
          See all orders &rarr;
        </button>
      </div>

      {/* Five pipeline columns — Pipeline v2 (C3) widens the dashboard's
          at-a-glance row from the proto's 3 to mirror the kanban's 6-stage
          shape (delivered is the side-card / drawer surface, not a column).
          Order matches the kanban: Placed → Proceed Request → Awaiting
          Logistics Action → Ready to Dispatch → Dispatched. */}
      <div className="grid grid-cols-5 gap-3.5 mb-7">
        <PipelineColumn
          stage="placed"
          label="Placed"
          hint="awaiting request to proceed"
          count={pipeline.placed}
          orders={orders}
          onOpenOrder={() => setTab("orders")}
        />
        <PipelineColumn
          stage="proceed_request"
          label="Proceed Request"
          hint="awaiting your decision"
          count={pipeline.proceed_request}
          orders={orders}
          onOpenOrder={() => setTab("orders")}
        />
        <PipelineColumn
          stage="awaiting_logistics_action"
          label="Awaiting logistics action"
          hint="auto-PO issued"
          count={pipeline.awaiting_logistics_action}
          orders={orders}
          onOpenOrder={() => setTab("orders")}
        />
        <PipelineColumn
          stage="ready_to_dispatch"
          label="Ready to dispatch"
          hint="stock confirmed"
          count={pipeline.ready_to_dispatch}
          orders={orders}
          onOpenOrder={() => setTab("orders")}
        />
        <PipelineColumn
          stage="dispatched"
          label="Dispatched"
          hint="in transit"
          count={pipeline.dispatched}
          orders={orders}
          onOpenOrder={() => setTab("orders")}
        />
      </div>

      {/* Side cards — proto lines 88-118. Phase 4.5 Chunk 2 (T21) widens the
          row from 2 to 3 columns to seat the new StockAlertsTile alongside
          OpenPOsCard + LowStockCard. The StockAlertsTile is self-contained
          (fetches its own alerts feed via TanStack Query). */}
      <div className="grid grid-cols-3 gap-3.5">
        <OpenPOsCard pos={open_pos} onViewAll={() => setTab("procurement")} />
        <LowStockCard lowStock={low_stock} onViewAll={() => setTab("warehouse")} />
        <StockAlertsTile />
      </div>
    </div>
  );
}

interface HeroProps {
  kpis: LogisticsDashboardKpis;
  pipeline: LogisticsPipelineCounts;
}

/** Hero block — proto lines 27-39. Today's date label, big headline, and
 *  a strap line with active-order count + GMV. */
function Hero({ kpis, pipeline }: HeroProps) {
  // Localised long date (Tuesday · April 28). The proto hardcodes today =
  // "2026-04-28" because it's a static demo; in v2 we use `new Date()`.
  const today = new Date();
  const fmtDate = today.toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  return (
    <div>
      <div className="kicker">{fmtDate} &middot; Logistics</div>
      <h1 className="font-display text-[36px] leading-[1.05] mt-2 tracking-[-0.025em] font-bold text-base-900">
        {kpis.today_deliveries} deliveries today.
        <br />
        <span className="text-base-600 font-medium">
          {pipeline.awaiting_logistics_action} waiting on stock,{" "}
          {pipeline.ready_to_dispatch} ready to ship.
        </span>
      </h1>
      <div className="text-[13px] text-base-600 mt-1.5">
        <strong className="font-mono">{kpis.active_orders}</strong> active
        orders &middot; value{" "}
        <strong className="font-mono">{RM(kpis.active_gmv)}</strong>
      </div>
    </div>
  );
}

/** Loading skeleton — KPI tile placeholders + pipeline column placeholders.
 *  Uses base-100 fills (very subtle) per the proto's calm-operations palette. */
function DashboardSkeleton() {
  return (
    <div data-testid="logistics-dashboard-skeleton">
      <div
        className="grid gap-4 mb-7"
        style={{ gridTemplateColumns: "1.6fr 1fr 1fr 1fr" }}
      >
        <div className="space-y-2">
          <div className="h-4 w-32 bg-base-100 rounded animate-pulse" />
          <div className="h-9 w-3/4 bg-base-100 rounded animate-pulse" />
          <div className="h-4 w-1/2 bg-base-100 rounded animate-pulse" />
        </div>
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="bg-white border border-base-200 rounded-md p-5 border-l-[3px] border-l-base-200"
          >
            <div className="h-3 w-1/2 bg-base-100 rounded animate-pulse mb-3" />
            <div className="h-9 w-1/3 bg-base-100 rounded animate-pulse" />
          </div>
        ))}
      </div>
      <div className="grid grid-cols-5 gap-3.5 mb-7">
        {[0, 1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className="bg-white border border-base-200 rounded-md min-h-[200px] p-4"
          >
            <div className="h-3 w-1/2 bg-base-100 rounded animate-pulse mb-3" />
            <div className="h-12 bg-base-100 rounded animate-pulse" />
          </div>
        ))}
      </div>
    </div>
  );
}

import type { LogisticsOrderListRow } from "@/lib/queries";
import { cjkClassName } from "@/lib/cjk";

/**
 * Active-pipeline column for the logistics dashboard. Renders a card with a
 * header (stage label + count + hint) and the top 5 orders for that stage.
 *
 * Mirrors `reference/proto/logistics-dashboard.jsx` `DashColumn` (lines
 * 202-235):
 *   - Card wrapper: white bg, hairline border, rounded
 *   - Header: padding 14/16, hairline divider, accent-colored uppercase label,
 *     mono count, base-500 hint underneath
 *   - Body: padding 8, min-height 200
 *   - Order card: white background, base-100 border, 4px radius, hover →
 *     terracotta border. Two rows: "#DL · total RM" then customer name (CJK
 *     font detect), then dealer · delivery date.
 *
 * The proto fetches the orders list once at the dashboard level and filters
 * client-side per column. We do the same — caller passes in the full list
 * and the stage filter happens here, capped at 5 items per the M5 plan
 * ("5 most recent orders").
 *
 * Stage → accent token map mirrors proto lines 203:
 *   awaiting_stock    → warning  (honey)
 *   ready_to_dispatch → info     (slate blue)
 *   dispatched        → success  (olive)
 */
export type PipelineStage = "awaiting_stock" | "ready_to_dispatch" | "dispatched";

interface Props {
  stage: PipelineStage;
  label: string;
  hint: string;
  count: number;
  orders: LogisticsOrderListRow[];
  onOpenOrder?: (orderId: string) => void;
}

const stageToText: Record<PipelineStage, string> = {
  awaiting_stock: "text-warning",
  ready_to_dispatch: "text-info",
  dispatched: "text-success",
};

const MAX_ORDERS = 5;

export default function PipelineColumn({
  stage,
  label,
  hint,
  count,
  orders,
  onOpenOrder,
}: Props) {
  const accentText = stageToText[stage];
  // The dashboard hands us a pre-filtered list from `useLogisticsOrders`,
  // but we re-filter defensively so the component is safe on its own.
  const items = orders
    .filter((o) => o.logistics_stage === stage)
    .slice(0, MAX_ORDERS);

  return (
    <div className="bg-white border border-base-200 rounded-md overflow-hidden">
      <div className="px-4 py-3.5 border-b border-base-100">
        <div className="flex items-baseline justify-between">
          <div
            className={`text-[11px] uppercase tracking-[0.14em] font-bold ${accentText}`}
          >
            {label}
          </div>
          <span className="font-mono text-[13px] font-semibold text-base-900">
            {count}
          </span>
        </div>
        <div className="text-[11px] text-base-500 mt-0.5">{hint}</div>
      </div>
      <div className="p-2 min-h-[200px]">
        {items.length === 0 ? (
          <div className="text-center text-base-400 text-[11px] py-6">—</div>
        ) : (
          items.map((o) => (
            <PipelineOrderCard
              key={o.id}
              order={o}
              onClick={onOpenOrder ? () => onOpenOrder(o.id) : undefined}
            />
          ))
        )}
      </div>
    </div>
  );
}

interface OrderCardProps {
  order: LogisticsOrderListRow;
  onClick?: () => void;
}

function PipelineOrderCard({ order, onClick }: OrderCardProps) {
  const customerName = order.customer_name;
  const dealerName = order.dealers?.name ?? "—";
  const deliveryDate = order.delivery_date ?? "TBD";

  // Mirror proto: white card, base-100 border, hover swaps to brand-signature.
  const baseCls =
    "block w-full text-left bg-white border border-base-100 rounded-[4px] px-3 py-2.5 mb-1.5 last:mb-0 transition-colors";
  const interactiveCls = onClick
    ? "cursor-pointer hover:border-primary"
    : "";

  // The proto's right-hand "total RM" requires the order's grand total, but
  // `LogisticsOrderListRow` doesn't carry a precomputed total — the route
  // returns header columns only. We surface the delivery date here instead so
  // the row stays informative without an extra fetch. Total is restored when
  // M5 task 2 (LogisticsOrders) wires the kanban + drawer.
  const inner = (
    <>
      <div className="flex items-baseline justify-between">
        <span className="font-mono text-[11px] font-semibold text-base-900">
          #{order.dl}
        </span>
        <span className="font-mono text-[11px] text-base-500">
          {deliveryDate === "TBD" ? "TBD" : deliveryDate}
        </span>
      </div>
      <div
        className={`${cjkClassName(customerName)} text-[13px] font-medium text-base-900 mt-0.5`}
      >
        {customerName}
      </div>
      <div className="text-[10px] text-base-500 mt-1">
        {dealerName} · {deliveryDate === "TBD" ? "TBD" : `→ ${deliveryDate}`}
      </div>
    </>
  );

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={`${baseCls} ${interactiveCls}`}
      >
        {inner}
      </button>
    );
  }
  return <div className={baseCls}>{inner}</div>;
}

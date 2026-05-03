import type { LogisticsOrderListRow } from "@/lib/queries";
import OrderCard from "./OrderCard";
import type { LogisticsStage } from "./StageChip";

/**
 * OrderColumn — one of the four kanban stage columns inside `LogisticsOrders`.
 *
 * Mirrors `reference/proto/logistics-orders.jsx` `OrderColumn` (lines 152-258):
 *   - White card wrapper, 1px base-100 border, 4px radius, min-height 360px
 *   - Top accent bar: 2px solid stage color (warning/info/primary/success)
 *   - Header: 14/16 padding, hairline divider underneath
 *     - Label: 11px font-ui bold uppercase tracking 0.14em colored to match accent
 *     - Count: mono 13px bold, right-aligned
 *     - Hint: 11px base-500 (e.g. "PO open with supplier")
 *     - Select-all checkbox (awaiting_stock only): "Select all to combine PO"
 *   - Body: 8px padding, contains OrderCards
 *   - Empty state: centered "—"
 *
 * `bucketAction` is the bottom-right hint each card shows when not delivered
 * — proto exposes it via LOGISTICS_FLOW.action ("Check stock" / "Assign
 * delivery" / "Attach DO" / null). Pass it down to OrderCard.
 */
const STAGE_ACCENT_BORDER: Record<LogisticsStage, string> = {
  awaiting_stock: "border-t-warning",
  ready_to_dispatch: "border-t-info",
  dispatched: "border-t-primary",
  delivered: "border-t-success",
};

const STAGE_ACCENT_TEXT: Record<LogisticsStage, string> = {
  awaiting_stock: "text-warning",
  ready_to_dispatch: "text-info",
  dispatched: "text-primary",
  delivered: "text-success",
};

interface Props {
  stage: LogisticsStage;
  label: string;
  hint: string;
  bucketAction: string | null;
  orders: LogisticsOrderListRow[];
  selectedDls: Set<number>;
  onToggleSelect: (dl: number) => void;
  onOpenOrder: (id: string) => void;
  onSelectAll: () => void;
}

export default function OrderColumn({
  stage,
  label,
  hint,
  bucketAction,
  orders,
  selectedDls,
  onToggleSelect,
  onOpenOrder,
  onSelectAll,
}: Props) {
  const accentText = STAGE_ACCENT_TEXT[stage];
  const accentBorder = STAGE_ACCENT_BORDER[stage];
  const selectable = stage === "awaiting_stock";
  const itemDls = orders.map((o) => o.dl);
  const allSelected =
    selectable && itemDls.length > 0 && itemDls.every((dl) => selectedDls.has(dl));
  const someSelected =
    selectable && itemDls.some((dl) => selectedDls.has(dl)) && !allSelected;

  return (
    <div
      className={`bg-white border border-base-100 rounded-[4px] overflow-hidden min-h-[360px] border-t-2 ${accentBorder}`}
      data-testid={`stage-column-${stage}`}
    >
      <div className="px-4 py-3.5 border-b border-base-100">
        <div className="flex items-baseline justify-between">
          <div
            className={`text-[11px] uppercase tracking-[0.14em] font-bold ${accentText}`}
          >
            {label}
          </div>
          <span className="font-mono text-[13px] font-semibold text-base-900">
            {orders.length}
          </span>
        </div>
        <div className="text-[11px] text-base-500 mt-0.5">{hint}</div>
        {selectable && orders.length > 0 && (
          <label className="flex items-center gap-1.5 mt-2 cursor-pointer text-[11px] text-base-700">
            <input
              type="checkbox"
              checked={allSelected}
              ref={(el) => {
                if (el) el.indeterminate = someSelected;
              }}
              onChange={onSelectAll}
              className="cursor-pointer accent-primary"
              aria-label="Select all awaiting-stock orders to combine PO"
            />
            <span className="font-body">Select all to combine PO</span>
          </label>
        )}
      </div>
      <div className="p-2">
        {orders.length === 0 ? (
          <div className="text-center text-base-400 text-[11px] py-6">—</div>
        ) : (
          orders.map((o) => (
            <OrderCard
              key={o.id}
              order={o}
              selectable={selectable}
              selected={selectedDls.has(o.dl)}
              onToggleSelect={() => onToggleSelect(o.dl)}
              onOpen={() => onOpenOrder(o.id)}
              actionHint={bucketAction ?? undefined}
            />
          ))
        )}
      </div>
    </div>
  );
}

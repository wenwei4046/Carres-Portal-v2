import type { operationOrderListRow } from "@/lib/queries";
import OrderCard from "./OrderCard";
import type { OperationStage } from "./StageChip";

/**
 * OrderColumn — one of the six kanban stage columns inside `OperationOrders`.
 *
 * Mirrors `reference/proto/operation-orders.jsx` `OrderColumn` (lines 152-258)
 * with Pipeline v2 (Phase 4 C3) extensions:
 *   - White card wrapper, 1px base-100 border, 4px radius, min-height 360px
 *   - Top accent bar: 2px solid stage color (base-300/warning/info/primary/success)
 *   - Header: 14/16 padding, hairline divider underneath
 *     - Label: 11px font-ui bold uppercase tracking 0.14em colored to match accent
 *     - Count: mono 13px bold, right-aligned
 *     - Hint: 11px base-500 (e.g. "PO open with supplier")
 *     - Select-all checkbox (awaiting_operation_action only): "Select all to combine PO"
 *   - Body: 8px padding, contains OrderCards
 *   - Empty state: centered "—"
 *
 * Pipeline v2 expand-to-zoom: when one column is expanded, click any column
 * header to swap the focus. Clicking the active column header collapses back
 * to equal-flex. Cards become compact (just `#SO`) when another column is
 * expanded — keeps non-focus columns scannable rather than truncated mid-card.
 *
 * `bucketAction` is the bottom-right hint each card shows when not delivered
 * — proto exposes it via operation_FLOW.action ("Confirm" / "Check stock" /
 * "Assign delivery" / "Attach DO" / null). Pass it down to OrderCard.
 */
const STAGE_ACCENT_BORDER: Record<OperationStage, string> = {
  placed: "border-t-base-300",
  proceed_request: "border-t-warning",
  awaiting_operation_action: "border-t-warning",
  ready_to_dispatch: "border-t-info",
  dispatched: "border-t-primary",
  delivered: "border-t-success",
};

const STAGE_ACCENT_TEXT: Record<OperationStage, string> = {
  placed: "text-base-500",
  proceed_request: "text-warning",
  awaiting_operation_action: "text-warning",
  ready_to_dispatch: "text-info",
  dispatched: "text-primary",
  delivered: "text-success",
};

interface Props {
  stage: OperationStage;
  label: string;
  hint: string;
  bucketAction: string | null;
  orders: operationOrderListRow[];
  selectedDls: Set<number>;
  onToggleSelect: (so: number) => void;
  onOpenOrder: (id: string) => void;
  onSelectAll: () => void;
  /** Pipeline v2 expand state. `expanded` is true for the focused column,
   *  `anyExpanded` is true if any column is currently expanded (so non-focus
   *  columns can render in compact mode). */
  expanded: boolean;
  anyExpanded: boolean;
  onToggleExpand: () => void;
  /** 2026-05-12 (Loo) — fires when a card's `↶ Revert` link is clicked.
   *  Parent owns the confirm dialog + mutation. */
  onRevert?: (orderId: string, so: number, kind: "proceed" | "dispatch") => void;
  /** Migration 0147 (item h, 2026-05-23) — fires when a card's "Reselect →"
   *  link in the LP-rejected badge is clicked. Parent owns the dialog state. */
  onReselectPartner?: (orderId: string) => void;
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
  expanded,
  anyExpanded,
  onToggleExpand,
  onRevert,
  onReselectPartner,
}: Props) {
  const accentText = STAGE_ACCENT_TEXT[stage];
  const accentBorder = STAGE_ACCENT_BORDER[stage];
  const selectable = stage === "awaiting_operation_action";
  const itemDls = orders.map((o) => o.so);
  const allSelected =
    selectable && itemDls.length > 0 && itemDls.every((so) => selectedDls.has(so));
  const someSelected =
    selectable && itemDls.some((so) => selectedDls.has(so)) && !allSelected;

  // Compact mode: another column is expanded; render trimmed cards so the
  // non-focus columns stay readable at a glance.
  const compact = anyExpanded && !expanded;

  // Flex basis driven inline so the kanban container can run as a single
  // flex row. `flex: 1` for the equal-width default, `flex: 4` / `flex: 0.4`
  // for the focus / non-focus split when `anyExpanded`.
  const flexValue = !anyExpanded ? "1 1 0" : expanded ? "4 4 0" : "0.4 0.4 0";

  return (
    <div
      className={`bg-white border border-base-200 rounded-[4px] overflow-hidden min-h-[360px] border-t-2 ${accentBorder} transition-all duration-300 ease-in-out min-w-0`}
      style={{ flex: flexValue }}
      data-testid={`stage-column-${stage}`}
      data-expanded={expanded ? "true" : "false"}
    >
      <button
        type="button"
        onClick={onToggleExpand}
        aria-expanded={expanded}
        aria-label={`${expanded ? "Collapse" : "Expand"} ${label} column`}
        className="block w-full text-left px-4 py-3.5 border-b border-base-100 hover:bg-base-50 focus:outline-none focus:bg-base-50 transition-colors"
      >
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
          // Wrap as a label INSIDE the header button — but stop click
          // propagation so toggling the checkbox doesn't fire the column
          // expand toggle. The label still triggers the underlying onChange.
          <span
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => {
              if (e.key === " " || e.key === "Enter") e.stopPropagation();
            }}
            className="flex items-center gap-1.5 mt-2 cursor-pointer text-[11px] text-base-700"
          >
            <input
              type="checkbox"
              checked={allSelected}
              ref={(el) => {
                if (el) el.indeterminate = someSelected;
              }}
              onChange={onSelectAll}
              onClick={(e) => e.stopPropagation()}
              className="cursor-pointer accent-primary"
              aria-label="Select all awaiting-operation-action orders to combine PO"
            />
            <span className="font-body">Select all to combine PO</span>
          </span>
        )}
      </button>
      <div className="p-2">
        {orders.length === 0 ? (
          <div className="text-center text-base-400 text-[11px] py-6">—</div>
        ) : (
          orders.map((o) => (
            <OrderCard
              key={o.id}
              order={o}
              selectable={selectable}
              selected={selectedDls.has(o.so)}
              onToggleSelect={() => onToggleSelect(o.so)}
              onOpen={() => onOpenOrder(o.id)}
              actionHint={bucketAction ?? undefined}
              compact={compact}
              stage={stage}
              onRevert={
                onRevert
                  ? (kind) => onRevert(o.id, o.so, kind)
                  : undefined
              }
              onReselectPartner={
                onReselectPartner ? () => onReselectPartner(o.id) : undefined
              }
            />
          ))
        )}
      </div>
    </div>
  );
}

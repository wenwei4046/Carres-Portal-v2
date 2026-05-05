/**
 * StageChip — small pill that labels a logistics order's stage with a
 * 1px outline + matching text color. Used both in the kanban OrderCard
 * (corner badge) and the OrderDetailDrawer header.
 *
 * Mirrors `reference/proto/logistics-dashboard.jsx` `StageChip`
 * (lines 252-260) plus Pipeline v2 (Phase 4 C1/C2) extensions:
 *   - 9px font-ui (DM Sans), letter-spacing 0.12em, font-weight 700, uppercase
 *   - color + border match the LOGISTICS_FLOW accent palette:
 *       placed                       → base-500 (muted, read-only feel)
 *       proceed_request              → warning  (signature-tinted, action-needed feel)
 *       awaiting_logistics_action    → warning  (honey)
 *       ready_to_dispatch            → info     (slate blue)
 *       dispatched                   → primary  (terracotta == --brand-signature in proto)
 *       delivered                    → success  (olive)
 *   - 3px y / 7px x padding, 3px radius
 */
export type LogisticsStage =
  | "placed"
  | "proceed_request"
  | "awaiting_logistics_action"
  | "ready_to_dispatch"
  | "dispatched"
  | "delivered";

interface Props {
  stage: LogisticsStage;
}

const STAGE_LABEL: Record<LogisticsStage, string> = {
  placed: "Placed",
  proceed_request: "Proceed Request",
  awaiting_logistics_action: "Awaiting Logistics Action",
  ready_to_dispatch: "Ready to Dispatch",
  dispatched: "Dispatched",
  delivered: "Delivered",
};

const STAGE_TEXT: Record<LogisticsStage, string> = {
  placed: "text-base-500",
  proceed_request: "text-warning",
  awaiting_logistics_action: "text-warning",
  ready_to_dispatch: "text-info",
  dispatched: "text-primary",
  delivered: "text-success",
};

const STAGE_BORDER: Record<LogisticsStage, string> = {
  placed: "border-base-300",
  proceed_request: "border-warning",
  awaiting_logistics_action: "border-warning",
  ready_to_dispatch: "border-info",
  dispatched: "border-primary",
  delivered: "border-success",
};

export function stageLabel(stage: LogisticsStage): string {
  return STAGE_LABEL[stage];
}

export default function StageChip({ stage }: Props) {
  return (
    <span
      className={`inline-block text-[9px] font-bold uppercase tracking-[0.12em] py-[3px] px-[7px] border rounded-[3px] ${STAGE_TEXT[stage]} ${STAGE_BORDER[stage]}`}
    >
      {STAGE_LABEL[stage]}
    </span>
  );
}

/**
 * StageChip — small pill that labels a operation order's stage with a
 * 1px outline + matching text color. Used both in the kanban OrderCard
 * (corner badge) and the OrderDetailDrawer header.
 *
 * Mirrors `reference/proto/operation-dashboard.jsx` `StageChip`
 * (lines 252-260) plus Pipeline v2 (Phase 4 C1/C2) extensions:
 *   - 9px font-ui (DM Sans), letter-spacing 0.12em, font-weight 700, uppercase
 *   - color + border match the operation_FLOW accent palette:
 *       placed                       → base-500 (muted, read-only feel)
 *       confirmed              → warning  (signature-tinted, action-needed feel)
 *       in_production    → warning  (honey)
 *       ready_to_dispatch            → info     (slate blue)
 *       dispatched                   → primary  (terracotta == --brand-signature in proto)
 *       delivered                    → success  (olive)
 *   - 3px y / 7px x padding, 3px radius
 */
export type OperationStage =
  | "placed"
  | "confirmed"
  | "in_production"
  | "ready_to_dispatch"
  | "dispatched"
  | "delivered";

interface Props {
  stage: OperationStage;
}

const STAGE_LABEL: Record<OperationStage, string> = {
  placed: "Placed",
  confirmed: "Confirmed",
  in_production: "In Production",
  ready_to_dispatch: "Ready to Dispatch",
  dispatched: "Dispatched",
  delivered: "Delivered",
};

/** v17 status pills — each stage → a pill colour. warning=amber marks the
 *  "in production" state; the full ramp reads neutral → purple → amber →
 *  blue → indigo → green across the 6 stages. Replaces the old outline chip.
 *  Keys use the 11.2 collapsed enum (confirmed/in_production). */
const STAGE_PILL: Record<OperationStage, string> = {
  placed: "pill-neutral",
  confirmed: "pill-draft",
  in_production: "pill-warning",
  ready_to_dispatch: "pill-sent",
  dispatched: "pill-collected",
  delivered: "pill-confirmed",
};

export function stageLabel(stage: OperationStage): string {
  return STAGE_LABEL[stage];
}

export default function StageChip({ stage }: Props) {
  return (
    <span className={`pill ${STAGE_PILL[stage]}`}>{STAGE_LABEL[stage]}</span>
  );
}

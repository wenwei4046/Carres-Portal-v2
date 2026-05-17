import type { OperationStage } from "./StageChip";

/**
 * 2026-05-10 — Stage banner shown on `/operation/orders/:stage`.
 *
 * Two-column strap: left side carries the numbered chip + stage label +
 * descriptive sub-line (Loo's mockup uses operationally-flavoured copy that's
 * more specific than the generic kanban hints — see `STAGE_DESCRIPTIONS`
 * below). Right side carries a big tabular count + "ORDERS" eyebrow.
 *
 * The banner is purely presentational — counting and visibility are owned by
 * the parent page. When `count === 0` the parent is expected to render an
 * empty-state below the banner; the banner itself doesn't change shape.
 */

interface Props {
  stage: OperationStage;
  /** Numeric prefix matching the chip ordering ("01" through "06"). */
  num: string;
  /** Short label, e.g. "Order received". */
  label: string;
  /** Single-line operational description shown under the label. */
  description: string;
  /** Number of orders currently in this stage (after sub-filters). */
  count: number;
}

/**
 * Per-stage descriptive copy from Loo's 2026-05-10 mockup. More specific than
 * the generic kanban hints in `operation_FLOW.hint` because the stage page
 * has more vertical real-estate to explain ops responsibilities. Kept here
 * (not on operation_FLOW) to avoid disturbing kanban tests that pin the
 * shorter copy.
 */
export const STAGE_DESCRIPTIONS: Record<OperationStage, string> = {
  placed: "Placed at the showroom · awaiting coordinator triage",
  proceed_request: "Sales pressed Proceed · ready to be picked up by ops",
  awaiting_operation_action:
    "PO open with supplier · monitor stock + bundle when ready",
  ready_to_dispatch: "Stock secured · assign delivery partner",
  dispatched: "With delivery partner · attach DO when collected",
  delivered: "DO on file · order complete",
};

export default function StageBanner({
  stage,
  num,
  label,
  description,
  count,
}: Props) {
  return (
    <div
      data-testid={`stage-banner-${stage}`}
      className="flex justify-between items-start rounded-[6px] px-5 py-4 mb-4 border"
      style={{
        background: "var(--signature-50, #fef3eb)",
        borderColor: "var(--brand-signature-soft, #f4d3bd)",
      }}
    >
      <div>
        <div className="flex items-center gap-2 mb-1">
          <span className="px-2 py-0.5 rounded-full bg-card text-base-700 text-[10px] font-mono tabular-nums border border-base-200">
            {num}
          </span>
          <h2 className="font-display text-[20px] font-bold text-base-900 leading-tight">
            {label}
          </h2>
        </div>
        <div className="text-[12px] text-base-600 font-body">{description}</div>
      </div>
      <div className="text-right">
        <div
          className="font-display font-bold text-primary tabular-nums leading-none"
          style={{ fontSize: "32px" }}
          data-testid={`stage-banner-count-${stage}`}
        >
          {count}
        </div>
        <div className="text-[10px] uppercase tracking-[0.14em] text-base-600 font-body mt-1">
          Orders
        </div>
      </div>
    </div>
  );
}

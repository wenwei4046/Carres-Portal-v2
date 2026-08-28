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

/**
 * TWO QUESTIONS, ONE SPELLING EACH (D3, docs/orders/MASTER.md 12).
 *
 * 12 called these "two spellings of one derivation". They are not. They are two
 * DIFFERENT questions that were each spelt once, in different files, with
 * nothing naming the difference - which is why the duplication looked
 * accidental and why merging them breaks the list.
 *
 *   stageOf         WHERE IS THIS ORDER IN THE PIPELINE?
 *                   Raw. `place` is a real slot, and `controlTabOf` depends on
 *                   an imported order reaching it so the fall-through can route
 *                   the row to `proceed` ("confirmed OR autocount-placed").
 *
 *   displayStageOf  WHAT DO WE TELL THE OPERATOR?
 *                   Applies Jess's 2026-07-02 ruling: an AutoCount import
 *                   arrived ALREADY proceeded and carries a PO, so it is never
 *                   "placed / waiting for the dealer to push" - that copy is
 *                   WRONG for these. Only a native order sits at `placed`.
 *
 * They live here because both readers already import `OperationStage` from this
 * file, and could not import from each other: the Orders control imports the
 * drawer, so a drawer-to-control import is a cycle. That cycle is why the rule
 * was written twice; putting it beside its own type removes the reason.
 *
 * Structurally typed on purpose - the list row and the drawer's order object
 * are different shapes and this needs three fields from either.
 */
export function stageOf(o: {
  status?: string | null;
  operation_stage?: string | null;
}): OperationStage {
  if (o.status === "place") return "placed";
  if (o.operation_stage) return o.operation_stage as OperationStage;
  if (o.status === "delivered") return "delivered";
  return "in_production";
}

/** The stage an operator is shown. See the note above `stageOf`. */
export function displayStageOf(o: {
  status?: string | null;
  operation_stage?: string | null;
  source_system?: string | null;
}): OperationStage {
  if (o.status === "place" && o.source_system === "autocount") {
    /* Only the `placed` answer is overridden. `delivered` is unreachable here
       (the status is already `place`), so the branch is the import's real stage
       or the in-production default - never a second copy of the whole ladder. */
    return (o.operation_stage as OperationStage | null) ?? "in_production";
  }
  return stageOf(o);
}

export function stageLabel(stage: OperationStage): string {
  return STAGE_LABEL[stage];
}

export default function StageChip({ stage }: Props) {
  return (
    <span className={`pill ${STAGE_PILL[stage]}`}>{STAGE_LABEL[stage]}</span>
  );
}

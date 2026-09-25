/**
 * THE SELECTED WORK SUMMARY — the top of the right panel (Workspace §5.10).
 *
 * It answers only: what is wrong · what to do now · which record opens the
 * source module. `{object} · {module}` · the problem 16/22/600 · the action
 * 13/18 · the `Open {object}` door on the same row. When the work has no party
 * cards (it names no single Sales Order) the required result prints under the
 * action so the act is never ambiguous. An admitted embedded action (Delivery
 * proof review) renders beneath with `Finish when: {statement}` (§5.1) — and
 * is then the panel's one blue action. Owner, timing and source live in their
 * own section at the bottom (`WorkOwnerSource`), never here.
 */
import type { ReactNode } from "react";
import type { OperationWorkItem } from "@carres/shared";
import Button from "@/components/kit/Button";
import DeliveryProofReviewWork from "../components/DeliveryProofReviewWork";
import { WORK_MODULE_WORD } from "./module-word";


export default function WorkActionPanel({
  item,
  embedded,
  onOpen,
  hasParties = false,
  primaryAct = null,
  openIsPrimary = false,
}: {
  item: OperationWorkItem;
  embedded?: ReactNode;
  onOpen: () => void;
  /** The mission's party cards carry the result; the summary stays compact. */
  hasParties?: boolean;
  /** The mission's ONE blue act while every party card is collapsed (§5.10):
   *  it opens that card. Absent when a card is open or the work is embedded. */
  primaryAct?: { label: string; onClick: () => void } | null;
  /** The `Open {object}` door IS the act (a PO window with demand left opens
   *  SO Batch Purchase on exactly that window) — then it is the one blue. */
  openIsPrimary?: boolean;
}) {
  /* The party is said once: `Call AL Logistics`, never `Call AL Logistics · AL Logistics`. */
  const action = `${item.action}${item.recipient && !item.action.includes(item.recipient) ? ` · ${item.recipient}` : ""}`;
  const owningForm = item.interaction.mode === "embedded" && item.interaction.componentKey === "delivery.proof_review"
    ? <DeliveryProofReviewWork doNumber={item.object.id} />
    : null;
  const result = item.interaction.mode === "read_only" ? item.interaction.reason : item.requiredResult;
  return (
    <section
      aria-label="Work summary"
      className="shrink-0 rounded-work border border-work-line bg-white p-3 min-[768px]:px-4 min-[768px]:py-3"
      data-testid="work-detail-header"
    >
      {/* On a phone (below 600px) the doors stack under the words (Jess's 390
          rule): the primary act fills its row, `Open {object}` takes the next.
          From 600px they sit beside the text, so the 743×704 acceptance keeps
          all three party headings in view. */}
      <div className="flex flex-col gap-2 min-[600px]:flex-row min-[600px]:items-start min-[600px]:gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-medium leading-[14px] text-kit-slate-11">{item.object.label} · {WORK_MODULE_WORD[item.module]}</p>
          <h2 className="text-[16px] font-semibold leading-[22px] text-kit-slate-12" data-testid="work-detail-title">{item.problem}</h2>
          <p className="text-[13px] leading-[18px] text-kit-slate-11" data-testid="work-detail-action">{action}</p>
          {!hasParties && item.interaction.mode !== "embedded" ? (
            <p className="text-[13px] leading-[18px] text-kit-slate-11" data-testid="work-detail-result">{result}</p>
          ) : null}
        </div>
        <div className="flex flex-col items-start gap-2 min-[600px]:max-w-[50%] min-[600px]:shrink-0 min-[600px]:flex-row min-[600px]:flex-wrap min-[600px]:justify-end" data-testid="work-detail-open-row">
          {primaryAct && item.interaction.mode !== "embedded" ? (
            <div className="grid w-full min-[600px]:block min-[600px]:w-auto" data-testid="work-detail-primary-row">
              <Button type="button" size="touch" variant="primary" onClick={primaryAct.onClick} data-testid="work-detail-primary-act">
                {primaryAct.label}
              </Button>
            </div>
          ) : null}
          <Button type="button" size="touch" variant={openIsPrimary ? "primary" : "neutral"} onClick={onOpen} data-testid="work-detail-open">Open {item.object.label}</Button>
        </div>
      </div>
      {item.interaction.mode === "embedded" ? (
        <section aria-label="Do this work" className="mt-3 flex max-w-[760px] flex-col gap-3" data-testid="work-detail-task">
          <p className="text-label text-kit-slate-11">Finish when: {item.completionStatement}</p>
          {embedded ?? owningForm}
        </section>
      ) : null}
    </section>
  );
}

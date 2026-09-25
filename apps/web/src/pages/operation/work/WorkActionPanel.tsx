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
}: {
  item: OperationWorkItem;
  embedded?: ReactNode;
  onOpen: () => void;
  /** The mission's party cards carry the result; the summary stays compact. */
  hasParties?: boolean;
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
      className="shrink-0 rounded-work border border-work-line bg-white p-3 min-[960px]:px-4 min-[960px]:py-3"
      data-testid="work-detail-header"
    >
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-medium leading-[14px] text-kit-slate-11">{item.object.label} · {WORK_MODULE_WORD[item.module]}</p>
          <h2 className="text-[16px] font-semibold leading-[22px] text-kit-slate-12" data-testid="work-detail-title">{item.problem}</h2>
          <p className="text-[13px] leading-[18px] text-kit-slate-11" data-testid="work-detail-action">{action}</p>
          {!hasParties && item.interaction.mode !== "embedded" ? (
            <p className="text-[13px] leading-[18px] text-kit-slate-11" data-testid="work-detail-result">{result}</p>
          ) : null}
        </div>
        <div className="shrink-0" data-testid="work-detail-open-row">
          <Button type="button" size="touch" onClick={onOpen}>Open {item.object.label}</Button>
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

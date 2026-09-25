import type { ReactNode } from "react";
import type { OperationWorkItem, OperationWorkModule } from "@carres/shared";
import Button from "@/components/kit/Button";
import DeliveryProofReviewWork from "../components/DeliveryProofReviewWork";

const MODULE: Record<OperationWorkModule, string> = {
  orders: "Sales Orders",
  purchasing: "Purchasing",
  receiving: "Receiving",
  delivery: "Delivery",
  payment: "Payment",
  issue_tracker: "Issue Tracker",
};

export default function WorkActionPanel({ item, embedded, onOpen }: { item: OperationWorkItem; embedded?: ReactNode; onOpen: () => void }) {
  const action = `${item.action}${item.recipient ? ` · ${item.recipient}` : ""}`;
  const owningForm = item.interaction.mode === "embedded" && item.interaction.componentKey === "delivery.proof_review"
    ? <DeliveryProofReviewWork doNumber={item.object.id} />
    : null;
  return (
    <>
      <header className="shrink-0 rounded-work border border-work-line bg-white p-3 min-[960px]:px-6 min-[960px]:py-4" data-testid="work-detail-header">
        <p className="text-label font-medium text-kit-slate-11">{item.object.label} · {MODULE[item.module]}</p>
        <h2 className="text-[16px] font-semibold leading-[22px] text-kit-slate-12" data-testid="work-detail-title">{item.problem}</h2>
        <p className="text-body text-kit-slate-11" data-testid="work-detail-action">{action}</p>
      </header>
      <section aria-label="What to do" className="shrink-0 rounded-work border border-work-line bg-white p-3 min-[960px]:px-6 min-[960px]:py-4" data-testid="work-detail-task">
        <div className="max-w-[760px]">
        {item.interaction.mode === "embedded" ? (
          <section aria-label="Do this work" className="flex flex-col gap-3">
            <p className="text-label text-kit-slate-11">Finish when: {item.completionStatement}</p>
            {embedded ?? owningForm}
          </section>
        ) : null}

        {/* Below 960px the result line and its one door share a row, so the
            party cards stay above the fold at 743×704 (density ruling
            2026-09-25); from 960px they stack as before. */}
        <div className={`flex items-center gap-3 min-[960px]:block ${item.interaction.mode === "embedded" ? "mt-2 min-[960px]:mt-4" : ""}`} data-testid="work-detail-open-row">
          {item.interaction.mode !== "embedded" ? (
            <p className="min-w-0 flex-1 text-body text-kit-slate-11">
              {item.interaction.mode === "read_only" ? item.interaction.reason : item.requiredResult}
            </p>
          ) : null}
          <div className={`shrink-0 ${item.interaction.mode === "embedded" ? "" : "min-[960px]:mt-4"}`}>
            <Button type="button" onClick={onOpen}>Open {item.object.label}</Button>
          </div>
        </div>

        <details className="mt-2 border-t border-kit-slate-5 text-label text-kit-slate-11 min-[960px]:mt-4" data-testid="work-detail-disclosure">
          <summary className="flex h-9 cursor-pointer items-center text-[12px] font-medium leading-4 text-kit-slate-12">Owner, timing and source</summary>
          <div className="mt-2 flex flex-col gap-1">
            <p>{item.owner.acting?.name ?? item.owner.normal?.name ?? "Not assigned"}</p>
            <p>{item.timing.actionOn ?? item.timing.noDateReason ?? "No working date"}</p>
            <p>{item.observedAt}</p>
          </div>
        </details>
        </div>
      </section>
    </>
  );
}

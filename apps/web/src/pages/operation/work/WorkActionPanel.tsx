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
      <header className="shrink-0 rounded-work border border-work-line bg-white px-6 py-4">
        <p className="text-label font-medium text-kit-slate-11">{item.object.label} · {MODULE[item.module]}</p>
        <h2 className="mt-1 text-section font-semibold text-kit-slate-12">{item.problem}</h2>
        <p className="mt-1 text-body text-kit-slate-11">{action}</p>
      </header>
      <section aria-label="What to do" className="shrink-0 rounded-work border border-work-line bg-white px-6 py-4">
        <div className="max-w-[760px]">
        {item.interaction.mode === "embedded" ? (
          <section aria-label="Do this work" className="flex flex-col gap-3">
            <p className="text-label text-kit-slate-11">Finish when: {item.completionStatement}</p>
            {embedded ?? owningForm}
          </section>
        ) : item.interaction.mode === "read_only" ? (
          <p className="text-body text-kit-slate-11">{item.interaction.reason}</p>
        ) : (
          <p className="text-body text-kit-slate-11">{item.requiredResult}</p>
        )}

        <div className="mt-4">
          <Button type="button" onClick={onOpen}>Open {item.object.label}</Button>
        </div>

        <details className="mt-4 border-t border-kit-slate-5 pt-3 text-label text-kit-slate-11">
          <summary className="cursor-pointer font-medium text-kit-slate-12">Owner, timing and source</summary>
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

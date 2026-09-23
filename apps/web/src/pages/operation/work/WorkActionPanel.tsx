import type { ReactNode } from "react";
import type { OperationWorkItem, OperationWorkModule } from "@carres/shared";
import Button from "@/components/kit/Button";
import DeliveryProofReviewWork from "../components/DeliveryProofReviewWork";
import { fmtDate } from "@/lib/fmt-date";

const MODULE: Record<OperationWorkModule, string> = {
  orders: "Sales Orders",
  purchasing: "Purchasing",
  receiving: "Receiving",
  delivery: "Delivery",
  payment: "Payment",
  issue_tracker: "Issue Tracker",
};

export interface WorkActionPanelProps {
  item: OperationWorkItem;
  embedded?: ReactNode;
  onOpen: () => void;
  className?: string;
}

function evidenceHeading(item: OperationWorkItem): string {
  return item.owner.state === "primary" ? "Working day and source" : "Owner, working day and source";
}

/** The selected item is required, so a component-level empty state is not applicable. */
export default function WorkActionPanel({ item, embedded, onOpen, className = "" }: WorkActionPanelProps) {
  const action = `${item.action}${item.recipient ? ` · ${item.recipient}` : ""}`;
  const owningForm = item.interaction.mode === "embedded" && item.interaction.componentKey === "delivery.proof_review"
    ? <DeliveryProofReviewWork doNumber={item.object.id} />
    : null;
  return (
    <div className={`min-h-full bg-white ${className}`}>
      <header className="border-b border-kit-slate-5 px-6 py-4">
        <p className="text-label font-medium text-kit-slate-11">{item.object.label} · {MODULE[item.module]}</p>
        <h2 className="mt-1 text-title font-semibold text-kit-slate-12">{item.action}</h2>
      </header>
      <div className="max-w-[760px] px-6 py-4">
        <section aria-labelledby="work-current-fact">
          <h3 id="work-current-fact" className="text-label font-semibold text-kit-slate-11">CURRENT FACT</h3>
          <p className="mt-1 text-body text-kit-slate-12">{item.problem}</p>
        </section>

        <section aria-labelledby="work-action" className="mt-4">
          <h3 id="work-action" className="text-label font-semibold text-kit-slate-11">ACTION</h3>
          <p className="mt-1 text-body text-kit-slate-12">{action}</p>
        </section>

        <section aria-labelledby="work-required-result" className="mt-4">
          <h3 id="work-required-result" className="text-label font-semibold text-kit-slate-11">REQUIRED RESULT</h3>
          <p className="mt-1 text-body text-kit-slate-12">{item.requiredResult}</p>
        </section>

        {item.interaction.mode === "embedded" ? (
          <section aria-label="Do this work" className="mt-4 flex flex-col gap-3">
            {embedded ?? owningForm}
            <p className="text-label text-kit-slate-11">Finish when: {item.completionStatement}</p>
          </section>
        ) : item.interaction.mode === "read_only" ? (
          <p className="mt-4 text-body text-kit-slate-11">{item.interaction.reason}</p>
        ) : null}

        <div className="mt-4">
          <Button type="button" variant={item.interaction.mode === "embedded" ? "neutral" : "primary"} onClick={onOpen}>
            Open {item.object.label}
          </Button>
        </div>

        <details className="mt-4 border-t border-kit-slate-5 pt-3 text-label text-kit-slate-11">
          <summary className="cursor-pointer font-medium text-kit-slate-12 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-kit-blue-9">
            {evidenceHeading(item)}
          </summary>
          <div className="mt-2 flex flex-col gap-1">
            {item.owner.state !== "primary" ? <p>{item.owner.acting?.name ?? item.owner.normal?.name ?? "Not assigned"}</p> : null}
            <p>Working day: {item.timing.actionOn ? fmtDate(item.timing.actionOn) : item.timing.noDateReason ?? "No working date"}</p>
            <p>Source: Last updated {fmtDate(item.observedAt, { time: true })}</p>
          </div>
        </details>
      </div>
    </div>
  );
}

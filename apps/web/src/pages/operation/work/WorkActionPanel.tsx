import type { ReactNode } from "react";
import type { OperationWorkItem, OperationWorkModule } from "@carres/shared";
import Button from "@/components/kit/Button";
import Icon from "@/components/kit/Icon";
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
  onCompleted?: (receipt: string) => void;
  className?: string;
}

function evidenceHeading(item: OperationWorkItem): string {
  return item.owner.state === "primary" ? "Working day and source" : "Owner, working day and source";
}

function isTextEntry(target: EventTarget | null): boolean {
  return target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement ||
    (target instanceof HTMLElement && target.isContentEditable);
}

/** The selected item is required, so a component-level empty state is not applicable. */
export default function WorkActionPanel({ item, embedded, onOpen, onCompleted, className = "" }: WorkActionPanelProps) {
  const owningForm = item.interaction.mode === "embedded" && item.interaction.componentKey === "delivery.proof_review"
    ? <DeliveryProofReviewWork doNumber={item.object.id} onSaved={onCompleted} />
    : null;
  return (
    <div
      className={`min-h-full bg-kit-slate-3 p-4 ${className}`}
      onKeyDown={(event) => {
        if (event.key.toLowerCase() === "o" && !event.altKey && !event.ctrlKey && !event.metaKey && !isTextEntry(event.target)) {
          event.preventDefault();
          onOpen();
        }
      }}
    >
      <header className="rounded-panel border border-kit-slate-5 bg-white px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <p className="text-label font-semibold text-kit-blue-11">{MODULE[item.module]}</p>
          <Button type="button" variant="ghost" onClick={onOpen} aria-label={`Open ${item.object.label}`} title={`Open ${item.object.label} · O`} data-work-entry={item.interaction.mode === "read_only" || undefined}><Icon name="open" size={14} /><span>{item.object.label}</span></Button>
        </div>
        <h2 className="mt-2 text-title font-semibold text-kit-slate-12">{item.problem}</h2>
        <p className="mt-1 text-body text-kit-slate-11">{item.action}{item.recipient ? ` · ${item.recipient}` : ""}</p>
      </header>
      <div className="max-w-[760px]">
        {item.interaction.mode === "embedded" ? (
          <section aria-label="Record result" className="mt-4 rounded-panel border border-kit-slate-5 bg-white p-4">
            <h3 className="border-b border-kit-slate-5 pb-3 text-body font-semibold text-kit-blue-11">Record result</h3>
            <div className="mt-3" data-work-entry>
            {embedded ?? owningForm}
            </div>
            <p className="mt-3 text-label text-kit-slate-11">{item.completionStatement}</p>
          </section>
        ) : item.interaction.mode === "read_only" ? (
          <section className="mt-4 rounded-panel border border-kit-slate-5 bg-white p-4"><p className="text-body text-kit-slate-11">{item.interaction.reason}</p></section>
        ) : (
          <section aria-labelledby="work-next-step" className="mt-4 rounded-panel border border-kit-slate-5 bg-white p-4">
            <h3 id="work-next-step" className="border-b border-kit-slate-5 pb-3 text-body font-semibold text-kit-blue-11">Next step</h3>
            <p className="mt-3 text-body text-kit-slate-12">{item.action}</p>
            <div className="mt-3"><Button type="button" variant="primary" onClick={onOpen} data-work-entry><Icon name="open" /><span>{item.object.label}</span></Button></div>
          </section>
        )}

        <details className="mt-4 rounded-panel border border-kit-slate-5 bg-white p-4 text-label text-kit-slate-11">
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

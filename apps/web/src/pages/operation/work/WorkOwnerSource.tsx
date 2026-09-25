/**
 * OWNER, TIMING AND SOURCE — the last section of the right panel
 * (Workspace §5.10): audit only, collapsed to one row, never a working control
 * and never repeated inside a party card. Every value is the feed's own fact.
 */
import type { OperationWorkItem } from "@carres/shared";
import { fmtDate } from "@/lib/fmt-date";
import { WORK_MODULE_WORD } from "./module-word";
import { WorkSection } from "./WorkCard";

export default function WorkOwnerSource({ item }: { item: OperationWorkItem }) {
  const normal = item.owner.normal?.name ?? null;
  const acting = item.owner.acting?.name ?? null;
  const read = item.observedAt;
  return (
    <WorkSection className="shrink-0" data-testid="work-owner-source">
      <details className="group">
        <summary className="flex h-10 cursor-pointer list-none items-center justify-between gap-2 rounded-work px-3 text-[12px] font-medium leading-4 text-kit-slate-12 hover:bg-kit-slate-2 min-[768px]:px-4 [&::-webkit-details-marker]:hidden">
          Owner, timing and source
          <span aria-hidden="true" className="text-kit-slate-11 transition-transform group-open:rotate-90 motion-reduce:transition-none">›</span>
        </summary>
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 border-t border-work-line px-3 py-2.5 text-[12px] leading-4 min-[768px]:px-4">
          <dt className="text-kit-slate-11">Normal owner</dt>
          <dd className="text-kit-slate-12">{normal ?? "Not assigned"}</dd>
          {acting && acting !== normal ? (
            <>
              <dt className="text-kit-slate-11">Acting today</dt>
              <dd className="text-kit-slate-12">{acting}</dd>
            </>
          ) : null}
          <dt className="text-kit-slate-11">Action day</dt>
          <dd className="text-kit-slate-12">{item.timing.actionOn ? fmtDate(item.timing.actionOn) : item.timing.noDateReason ?? "No working date"}</dd>
          {item.timing.businessDueOn && item.timing.businessDueOn !== item.timing.actionOn ? (
            <>
              <dt className="text-kit-slate-11">Due</dt>
              <dd className="text-kit-slate-12">{fmtDate(item.timing.businessDueOn)}</dd>
            </>
          ) : null}
          <dt className="text-kit-slate-11">Source</dt>
          <dd className="text-kit-slate-12">{WORK_MODULE_WORD[item.module]} · {item.object.label}</dd>
          <dt className="text-kit-slate-11">Read</dt>
          <dd className="text-kit-slate-12">{fmtDate(read, { time: true })}</dd>
        </dl>
      </details>
    </WorkSection>
  );
}

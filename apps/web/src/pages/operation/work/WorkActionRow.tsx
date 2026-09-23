import type { OperationWorkItem, OperationWorkModule } from "@carres/shared";
import { fmtDate } from "@/lib/fmt-date";

const MODULE: Record<OperationWorkModule, string> = {
  orders: "Sales Orders",
  purchasing: "Purchasing",
  receiving: "Receiving",
  delivery: "Delivery",
  payment: "Payment",
  issue_tracker: "Issue Tracker",
};

function timingText(item: OperationWorkItem): string {
  if (!item.timing.actionOn) return item.timing.noDateReason ?? "No working date";
  if (item.timing.placement === "missed") {
    const age = item.timing.missedAge;
    return age.state === "counted"
      ? `Required ${fmtDate(item.timing.actionOn)} · ${age.workingDays} working ${age.workingDays === 1 ? "day" : "days"} missed`
      : `Required ${fmtDate(item.timing.actionOn)} · Missed age unavailable`;
  }
  return fmtDate(item.timing.actionOn);
}

export interface WorkActionRowProps {
  item: OperationWorkItem;
  selected: boolean;
  onSelect: () => void;
  ownerContext?: string | null;
  className?: string;
}

/** A Work row always has an item, so a component-level empty state is not applicable. */
export default function WorkActionRow({
  item,
  selected,
  onSelect,
  ownerContext = null,
  className = "",
}: WorkActionRowProps) {
  const action = `${item.action}${item.recipient ? ` · ${item.recipient}` : ""}`;
  const timing = timingText(item);
  return (
    <button
      type="button"
      aria-pressed={selected}
      aria-label={`${item.broken ? "Broken commitment. " : ""}${item.object.label}. ${item.problem}. ${action}. ${timing}`}
      onClick={onSelect}
      data-testid={`work-row-${item.object.label}-${item.ruleKey}`}
      className={`relative min-h-[64px] w-full border-b border-kit-slate-5 px-4 py-2 text-left transition-colors focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-kit-blue-9 active:bg-kit-slate-4 ${selected ? "bg-kit-blue-3 shadow-[inset_2px_0_0_var(--blue-9)]" : "hover:bg-kit-slate-3"} ${item.broken ? "before:absolute before:inset-y-2 before:left-0 before:w-0.5 before:bg-kit-red-9" : ""} ${className}`}
    >
      <span className="flex items-start justify-between gap-2">
        <span className="text-label font-medium text-kit-slate-11">{item.object.label} · {MODULE[item.module]}</span>
        {item.interaction.mode === "embedded" ? (
          <span className="shrink-0 text-label text-kit-slate-11">Do it here</span>
        ) : null}
      </span>
      <span className="block text-body font-medium text-kit-slate-12">{item.problem}</span>
      <span className="block text-label text-kit-slate-11">
        <span className="text-body">{action}</span>
        <span aria-hidden="true"> · </span>
        <span className={item.timing.placement === "missed" ? "text-kit-red-11" : "text-kit-slate-11"}>{timing}</span>
        {item.blocker ? <span className="block text-kit-amber-11">Blocked by {item.blocker.reason}</span> : null}
        {ownerContext ? <span className="block text-kit-amber-11">{ownerContext}</span> : null}
      </span>
    </button>
  );
}

import type { OperationWorkItem, OperationWorkModule } from "@carres/shared";
import Badge from "@/components/kit/Badge";
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

export default function WorkActionRow({ item, selected, onSelect }: { item: OperationWorkItem; selected: boolean; onSelect: () => void }) {
  const action = `${item.action}${item.recipient ? ` · ${item.recipient}` : ""}`;
  return (
    <button
      type="button"
      aria-pressed={selected}
      aria-label={`${item.object.label}. ${item.problem}. ${action}`}
      onClick={onSelect}
      className={`min-h-[88px] w-full border-b border-kit-slate-5 px-4 py-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-kit-blue-9 ${selected ? "bg-kit-blue-3 shadow-[inset_2px_0_0_var(--blue-9)]" : "hover:bg-kit-slate-3"}`}
    >
      <span className="flex items-start justify-between gap-2">
        <span className="text-label font-medium text-kit-slate-11">{item.object.label} · {MODULE[item.module]}</span>
        {item.interaction.mode === "embedded" ? <Badge>Do it here</Badge> : null}
      </span>
      <span className="mt-1 block text-body font-medium text-kit-slate-12">{item.problem}</span>
      <span className="mt-1 block text-body text-kit-slate-11">{action}</span>
      <span className={`mt-1 block text-label ${item.timing.placement === "missed" ? "text-kit-red-11" : "text-kit-slate-10"}`}>{timingText(item)}</span>
    </button>
  );
}

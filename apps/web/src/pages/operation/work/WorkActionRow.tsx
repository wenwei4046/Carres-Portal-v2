import type { OperationWorkItem, OperationWorkModule } from "@carres/shared";
import { fmtDate } from "@/lib/fmt-date";
import Icon from "@/components/kit/Icon";

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
  return `${item.broken ? "Promised" : "Required"} ${fmtDate(item.timing.actionOn)}`;
}

export interface WorkActionRowProps {
  item: OperationWorkItem;
  selected: boolean;
  onSelect: () => void;
  onEnter?: () => void;
  onOpen?: () => void;
  ownerContext?: string | null;
  className?: string;
}

/** A Work row always has an item, so a component-level empty state is not applicable. */
export default function WorkActionRow({
  item,
  selected,
  onSelect,
  onEnter,
  onOpen,
  ownerContext = null,
  className = "",
}: WorkActionRowProps) {
  const timing = timingText(item);
  return (
    <article
      className={`relative m-2 overflow-hidden rounded-control border border-kit-slate-5 bg-white ${selected ? "bg-kit-blue-2" : ""} ${item.broken ? "border-l-2 border-l-kit-red-9" : ""} ${className}`}
    >
      <button type="button" aria-pressed={selected} aria-label={`${item.object.label}. ${MODULE[item.module]}. ${timing}. ${item.problem}. ${item.action}${item.recipient ? `. ${item.recipient}` : ""}`} onClick={onSelect}
        onKeyDown={(event) => {
          if (event.key === "Enter" && onEnter) {
            event.preventDefault();
            onEnter();
          } else if (event.key.toLowerCase() === "o" && onOpen && !event.altKey && !event.ctrlKey && !event.metaKey) {
            event.preventDefault();
            onOpen();
          }
        }}
        data-testid={`work-row-${item.object.label}-${item.ruleKey}`}
        className="block w-full px-3 py-2 text-left hover:bg-kit-slate-3 active:bg-kit-slate-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-kit-blue-9">
        <span className="block text-meta font-semibold uppercase tracking-wide text-kit-slate-11">{MODULE[item.module]}</span>
        <span className="mt-1 block text-label text-kit-slate-11">{timing}</span>
        <span className="mt-0.5 block text-body font-semibold text-kit-slate-12">{item.problem}</span>
        <span className="mt-0.5 block text-label font-medium text-kit-slate-11">{item.action}</span>
        {item.recipient ? <span className="mt-0.5 block text-label text-kit-slate-11">{item.recipient}</span> : null}
        {item.blocker ? <span className="mt-0.5 block text-label text-kit-amber-11">Blocked · {item.blocker.reason}</span> : null}
        {ownerContext ? <span className="mt-0.5 block text-label text-kit-amber-11">{ownerContext}</span> : null}
      </button>
      <footer data-testid="work-card-footer" className="flex min-h-8 items-center justify-between border-t border-kit-slate-5 px-3 text-meta text-kit-slate-11">
        <span className="min-w-0 truncate">{item.object.label}</span>
        {onOpen ? <button type="button" aria-label={`Open ${item.object.label}`} title={`Open ${item.object.label} · O`} onClick={onOpen}
          className="grid h-8 w-8 place-items-center rounded-control hover:bg-kit-slate-3 active:bg-kit-slate-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-kit-blue-9"><Icon name="open" size={14} /></button> : <Icon name="open" size={14} />}
      </footer>
    </article>
  );
}

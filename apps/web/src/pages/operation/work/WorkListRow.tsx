/**
 * ⭐ THE WORK LIST ROW — Jess, 2026-09-26 (replaces the 104px middle card).
 *
 * ```
 *   SO-1362                              Thu, 1 Oct     ← document · due
 *   Call AL Logistics for a delivery date               ← the action, grey
 * ```
 *
 * The middle column is a PICKER, not the work: two lines in 300px, like an
 * inbox. Line 1 is the document number (bold) with the due date on the
 * right — red `Was due {date}` when missed, `No date` when none. Line 2 is
 * the action sentence, truncated. A covered row carries `For {normal owner}`
 * beside the number. Choosing a row shows it on the right; only the number
 * opens the record. The chosen row is the one blue of the list.
 */
import type { KeyboardEvent } from "react";
import { fmtDate } from "@/lib/fmt-date";
import type { WorkRow } from "../use-open-work";

export function workDueWord(item: Pick<WorkRow, "timingBucket" | "dueIso">): { text: string; missed: boolean } {
  if (!item.dueIso) return { text: "No date", missed: false };
  if (item.timingBucket === "overdue") return { text: `Was due ${fmtDate(item.dueIso)}`, missed: true };
  return { text: fmtDate(item.dueIso), missed: false };
}

export default function WorkListRow({
  item,
  action,
  cover,
  selected,
  onSelect,
  onOpenRecord,
}: {
  item: WorkRow;
  action: string;
  /** The normal owner's name when the signed-in person covers this row. */
  cover: string | null;
  selected: boolean;
  onSelect: () => void;
  onOpenRecord: () => void;
}) {
  const due = workDueWord(item);
  const onKey = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onSelect();
    }
  };
  return (
    <div
      role="button"
      tabIndex={0}
      aria-pressed={selected}
      aria-label={`${item.soRef} · ${action} · ${due.text}`}
      data-work-row
      data-testid={`work-row-${item.soRef}-${item.ruleKey}`}
      onClick={onSelect}
      onKeyDown={onKey}
      className={[
        "relative flex h-[52px] w-full cursor-pointer flex-col justify-center gap-0.5 border-b border-kit-slate-4 px-3 text-left",
        selected ? "bg-kit-blue-3" : "bg-white hover:bg-kit-slate-2",
      ].join(" ")}
    >
      {selected ? <span aria-hidden className="absolute left-0 top-1 bottom-1 w-0.5 bg-kit-blue-9" /> : null}
      <span className="flex min-w-0 items-baseline gap-2">
        <button
          type="button"
          className="shrink-0 text-[13px] font-semibold leading-[18px] text-kit-slate-12 underline-offset-2 hover:underline"
          onClick={(event) => { event.stopPropagation(); onOpenRecord(); }}
        >
          {item.soRef}
        </button>
        {cover ? (
          <span className="min-w-0 truncate rounded-[4px] bg-kit-amber-3 px-1.5 text-[11px] font-semibold leading-4 text-kit-amber-11" data-testid="work-row-cover">
            For {cover}
          </span>
        ) : null}
        <span className={`ml-auto shrink-0 text-[12px] leading-4 ${due.missed ? "font-semibold text-danger" : "text-kit-slate-11"}`} data-testid="work-row-due">
          {due.text}
        </span>
      </span>
      <span className="truncate text-[13px] leading-[18px] text-kit-slate-11">{action}</span>
    </div>
  );
}

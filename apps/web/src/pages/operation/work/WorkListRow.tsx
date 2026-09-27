/**
 * ⭐ THE INBOX ROW — one ACT, 76px, three lines, a mail row and not a card
 * (Jess, 2026-09-27: "one card one action"; the Gmail reading rhythm).
 *
 * ```
 *   SO-1362                              Tue, 22 Sep   ← document · date (red when missed), 12/16
 *   Call AL Logistics                                  ← the act, 14/20 semibold
 *   Delivery · The delivery is not scheduled           ← page · why, 12/18 grey
 * ```
 *
 * The eye lands on the act. Rows sit edge to edge on a 1px rule — no gap, no
 * radius, no chips. The chosen row is the pale-blue wash with a 3px blue
 * edge: the list's one blue. A covered row says `For {normal owner}` after
 * the document. Every line is one line; a long one ends in … and shows whole
 * on hover (the middle prints it in full). The number opens the record.
 */
import type { KeyboardEvent } from "react";
import { fmtDate } from "@/lib/fmt-date";
import type { WorkRow } from "../use-open-work";
import { WORK_MODULE_WORD } from "./module-word";

export function workDueWord(item: Pick<WorkRow, "timingBucket" | "dueIso">): { text: string; missed: boolean } {
  if (!item.dueIso) return { text: "No date", missed: false };
  /* A late row is the date in red — no word (Jess, 2026-09-26). */
  if (item.timingBucket === "overdue") return { text: fmtDate(item.dueIso), missed: true };
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
  const context = `${WORK_MODULE_WORD[item.module]} · ${item.problem}`;
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
      aria-label={`${item.soRef} · ${action} · ${item.problem} · ${due.text}`}
      data-work-row
      data-testid={`work-row-${item.soRef}-${item.ruleKey}`}
      onClick={onSelect}
      onKeyDown={onKey}
      className={[
        "relative flex h-[76px] w-full cursor-pointer flex-col justify-center border-b border-kit-slate-4 px-3 text-left",
        selected ? "bg-kit-blue-3" : "bg-white hover:bg-kit-slate-2",
      ].join(" ")}
    >
      {selected ? <span aria-hidden className="absolute inset-y-0 left-0 w-[3px] bg-kit-blue-9" /> : null}
      <span className="flex min-w-0 items-baseline gap-2">
        <button
          type="button"
          className="shrink-0 text-[12px] font-medium leading-4 text-kit-slate-11 underline-offset-2 hover:underline"
          onClick={(event) => { event.stopPropagation(); onOpenRecord(); }}
        >
          {item.soRef}
        </button>
        {cover ? <span className="min-w-0 truncate text-[12px] font-medium leading-4 text-kit-amber-11" data-testid="work-row-cover">For {cover}</span> : null}
        <span className={`ml-auto shrink-0 text-[12px] leading-4 ${due.missed ? "font-semibold text-danger" : "text-kit-slate-11"}`} data-testid="work-row-due">
          {due.text}
        </span>
      </span>
      <span className="truncate text-[14px] font-semibold leading-5 text-kit-slate-12" title={action} data-testid="work-row-action">{action}</span>
      <span className="truncate text-[12px] leading-[18px] text-kit-slate-11" title={context} data-testid="work-row-fact">{context}</span>
    </div>
  );
}

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
import type { KeyboardEvent, ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import { fmtDate } from "@/lib/fmt-date";
import type { WorkRow } from "../use-open-work";
import { WORK_MODULE_WORD } from "./module-word";

export function workDueWord(item: Pick<WorkRow, "timingBucket" | "dueIso">): { text: string; missed: boolean; today: boolean } {
  if (!item.dueIso) return { text: "No date", missed: false, today: false };
  /* A late row is the date in red, a row due today amber — no word (Jess, 2026-09-26/27). */
  if (item.timingBucket === "overdue") return { text: fmtDate(item.dueIso), missed: true, today: false };
  return { text: fmtDate(item.dueIso), missed: false, today: item.timingBucket === "today" };
}

export default function WorkListRow({
  item,
  action,
  cover: _cover,
  selected,
  onSelect,
  onOpenRecord: _onOpenRecord,
  task,
}: {
  item: WorkRow;
  action: string;
  /** The normal owner's name when the signed-in person covers this row. */
  cover: string | null;
  selected: boolean;
  onSelect: () => void;
  onOpenRecord: () => void;
  /**
   * The Tasks door's row (owner direction 2026-10-05, layout B) — the SAME row, two lines and an icon instead of three lines:
   * module icon · the act naming the party · `{time or document}` with the
   * original date in red when missed. A parameter, not a second row.
   */
  task?: { icon: ReactNode; detail: string; missedDate: string | null; noDate: string | null };
}) {
  const due = workDueWord(item);
  if (task) {
    const label = [action, task.detail, task.missedDate, task.noDate].filter(Boolean).join(" · ");
    return (
      <div
        role="button"
        tabIndex={0}
        aria-pressed={selected}
        aria-label={label}
        data-work-row
        data-task-row
        data-id={item.id}
        data-testid={`task-row-${item.id}`}
        onClick={onSelect}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            onSelect();
          }
        }}
        className={[
          "relative flex min-h-[47px] w-full cursor-pointer items-center gap-3 border-b border-kit-slate-4 px-3 py-1.5 text-left outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-kit-blue-9",
          selected ? "bg-kit-blue-3" : "bg-white hover:bg-kit-slate-2",
        ].join(" ")}
      >
        {selected ? <span aria-hidden className="absolute inset-y-0 left-0 w-[3px] bg-kit-blue-9" /> : null}
        <span aria-hidden className="shrink-0 text-kit-slate-11">{task.icon}</span>
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-[13px] font-semibold leading-[18px] text-kit-slate-12" title={action} data-testid="task-row-act">{action}</span>
          <span className="truncate text-[11px] leading-4 text-kit-slate-11" data-testid="task-row-detail">
            {task.detail}
            {task.missedDate ? <> · <span className="font-semibold text-danger">{task.missedDate}</span></> : null}
            {task.noDate ? <>{task.detail ? " · " : ""}<span className="font-semibold text-kit-amber-11">{task.noDate}</span></> : null}
          </span>
        </span>
        <ChevronRight aria-hidden size={14} className="shrink-0 text-kit-slate-9" />
      </div>
    );
  }
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
      data-id={item.id}
      data-testid={`work-row-${item.soRef}-${item.ruleKey}`}
      onClick={onSelect}
      onKeyDown={onKey}
      className={[
        "relative flex h-[76px] w-full cursor-pointer flex-col justify-center border-b border-kit-slate-4 px-3 text-left outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-kit-blue-9",
        selected ? "bg-kit-blue-3" : "bg-white hover:bg-kit-slate-2",
      ].join(" ")}
    >
      {selected ? <span aria-hidden className="absolute inset-y-0 left-0 w-[3px] bg-kit-blue-9" /> : null}
      <span className="flex min-w-0 items-baseline gap-2">
        {/* The whole row chooses the act; `Open order` lives in the middle (Jess, 2026-09-27). */}
        <span className="shrink-0 text-[12px] font-medium leading-4 text-kit-slate-11">{item.soRef}</span>
        <span className="min-w-0 truncate text-[12px] font-medium leading-4 text-kit-slate-11" data-testid="work-row-assigned">{item.ownerId ? `Assigned to ${item.ownerName ?? "Name not recorded"}` : "Not assigned"}</span>
        <span className={`ml-auto shrink-0 text-[12px] leading-4 ${due.missed ? "font-semibold text-danger" : due.today ? "font-semibold text-kit-amber-11" : "text-kit-slate-11"}`} data-testid="work-row-due">
          {due.text}
        </span>
      </span>
      <span className="truncate text-[14px] font-semibold leading-5 text-kit-slate-12" title={action} data-testid="work-row-action">{action}</span>
      <span className="truncate text-[12px] leading-[18px] text-kit-slate-11" title={context} data-testid="work-row-fact">{context}</span>
    </div>
  );
}

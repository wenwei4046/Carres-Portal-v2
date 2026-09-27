/**
 * ⭐ THE WORK CARD — Jess, 2026-09-26 ("this format is correct"; replaces the
 * 52px two-line row and the 104px card before it). An inbox card, four lines,
 * in a 300px column:
 *
 * ```
 *   SO-1362                          Tue, 22 Sep   ← document (bold, opens) · date (red when missed)
 *   Call AL Logistics                               ← the action
 *   The delivery is not scheduled                   ← the fact, grey
 *   [Delivery] [AL Logistics]                       ← chips: page · party (· For {owner})
 * ```
 *
 * Every line is ONE line: a long sentence ends in … and shows whole on hover
 * (the right panel prints it in full anyway). Cards sit edge to edge with a
 * 1px rule, no border, no radius; the chosen card is the pale-blue wash with
 * the 2px left line — the list's one blue. The number opens the record; the
 * card shows it on the right.
 */
import type { KeyboardEvent } from "react";
import { fmtDate } from "@/lib/fmt-date";
import type { WorkRow } from "../use-open-work";
import { WORK_MODULE_WORD } from "./module-word";

export function workDueWord(item: Pick<WorkRow, "timingBucket" | "dueIso">): { text: string; missed: boolean } {
  if (!item.dueIso) return { text: "No date", missed: false };
  /* A late row is the date in red — no word (Jess, 2026-09-26: "why was
     due? remove"); the rail's Missed row already says it. */
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
  const onKey = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onSelect();
    }
  };
  const chip = "max-w-[160px] truncate rounded-[4px] border border-kit-slate-4 bg-white px-1.5 text-[11px] font-medium leading-4 text-kit-slate-11";
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
        "relative flex w-full cursor-pointer flex-col gap-0.5 border-b border-kit-slate-4 px-3 py-2.5 text-left",
        selected ? "bg-kit-blue-3" : "bg-white hover:bg-kit-slate-2",
      ].join(" ")}
    >
      {selected ? <span aria-hidden className="absolute left-0 top-0 bottom-0 w-0.5 bg-kit-blue-9" /> : null}
      <span className="flex min-w-0 items-baseline gap-2">
        <button
          type="button"
          className="shrink-0 text-[13px] font-semibold leading-[18px] text-kit-slate-12 underline-offset-2 hover:underline"
          onClick={(event) => { event.stopPropagation(); onOpenRecord(); }}
        >
          {item.soRef}
        </button>
        <span className={`ml-auto shrink-0 text-[12px] leading-4 ${due.missed ? "font-semibold text-danger" : "text-kit-slate-11"}`} data-testid="work-row-due">
          {due.text}
        </span>
      </span>
      <span className="truncate text-[13px] font-medium leading-[18px] text-kit-slate-12" title={action} data-testid="work-row-action">{action}</span>
      <span className="truncate text-[12px] leading-4 text-kit-slate-11" title={item.problem} data-testid="work-row-fact">{item.problem}</span>
      <span className="mt-1 flex min-w-0 items-center gap-1.5" data-testid="work-row-chips">
        <span className={chip}>{WORK_MODULE_WORD[item.module]}</span>
        {item.recipient ? <span className={chip} title={item.recipient}>{item.recipient}</span> : null}
        {cover ? (
          <span className="truncate rounded-[4px] bg-kit-amber-3 px-1.5 text-[11px] font-semibold leading-4 text-kit-amber-11" data-testid="work-row-cover">
            For {cover}
          </span>
        ) : null}
      </span>
    </div>
  );
}

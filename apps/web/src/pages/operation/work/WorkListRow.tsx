/**
 * ⭐ THE WORK ROW = ONE ORDER (Jess, 2026-09-26 night: "order 就是那整个东西的核心").
 *
 * ```
 *   SO-1362                          Tue, 22 Sep   ← the record (bold, opens it) · its earliest date, red when missed
 *   Call AL Logistics · Ask customer to pay        ← today's acts on this order, in list order
 *   The delivery is not scheduled                  ← the first act's fact, grey
 *   [Delivery] [Payment]                           ← the pages the acts belong to (· For {owner})
 * ```
 *
 * One order appears once, however many acts it carries. Every line is one
 * line: a long sentence ends in … and shows whole on hover (the panel prints
 * everything). Rows sit edge to edge with a 1px rule; the chosen row is the
 * pale-blue wash with the 2px left line — the list's one blue.
 */
import type { KeyboardEvent } from "react";
import { fmtDate } from "@/lib/fmt-date";
import type { WorkRow } from "../use-open-work";
import { WORK_MODULE_WORD } from "./module-word";
import type { WorkRecord } from "./work-model";

export function workDueWord(item: Pick<WorkRow, "timingBucket" | "dueIso">): { text: string; missed: boolean } {
  if (!item.dueIso) return { text: "No date", missed: false };
  /* A late row is the date in red — no word (Jess, 2026-09-26: "why was
     due? remove"); the rail's Missed row already says it. */
  if (item.timingBucket === "overdue") return { text: fmtDate(item.dueIso), missed: true };
  return { text: fmtDate(item.dueIso), missed: false };
}

export default function WorkListRow({
  record,
  acts,
  cover,
  selected,
  onSelect,
  onOpenRecord,
}: {
  record: WorkRecord;
  /** The act sentences, one per open act, in list order. */
  acts: string[];
  /** The normal owner's name when the signed-in person covers this record. */
  cover: string | null;
  selected: boolean;
  onSelect: () => void;
  onOpenRecord: () => void;
}) {
  const due = workDueWord(record);
  const first = record.items[0]!;
  const pages = [...new Set(record.items.map((i) => WORK_MODULE_WORD[i.module]))];
  const actLine = acts.join(" · ");
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
      aria-label={`${record.soRef} · ${actLine} · ${first.problem} · ${due.text}`}
      data-work-row
      data-testid={`work-row-${record.soRef}`}
      onClick={onSelect}
      onKeyDown={onKey}
      className={[
        "relative flex w-full cursor-pointer flex-col gap-0.5 border-b border-kit-slate-4 px-3 py-2.5 text-left",
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
          {record.soRef}
        </button>
        <span className={`ml-auto shrink-0 text-[12px] leading-4 ${due.missed ? "font-semibold text-danger" : "text-kit-slate-11"}`} data-testid="work-row-due">
          {due.text}
        </span>
      </span>
      <span className="truncate text-[13px] font-medium leading-[18px] text-kit-slate-12" title={actLine} data-testid="work-row-action">{actLine}</span>
      <span className="truncate text-[12px] leading-4 text-kit-slate-11" title={first.problem} data-testid="work-row-fact">{first.problem}</span>
      <span className="mt-1 flex min-w-0 items-center gap-1.5" data-testid="work-row-chips">
        {pages.map((page) => <span key={page} className={chip}>{page}</span>)}
        {cover ? (
          <span className="truncate rounded-[4px] bg-kit-amber-3 px-1.5 text-[11px] font-semibold leading-4 text-kit-amber-11" data-testid="work-row-cover">
            For {cover}
          </span>
        ) : null}
      </span>
    </div>
  );
}

/**
 * ChecklistRow — one step of a card's checklist (Workspace MASTER §5.10 BUILD
 * SHEET, kit admission Jess 2026-09-28 "kit ok").
 *
 * A 16px square mark (radius 4), the step, its value and, on the right, the
 * step's document. The mark is a RECORDED fact, never something staff tick:
 *
 *   done     filled dark with a tick
 *   open     empty, 1.5px border — not yet
 *   missed   filled red with `!` — the step that is the act now, missed
 *   due      filled amber with `!` — the step that is the act now, due
 *   none     no mark — a stop that cannot start yet, or a fact
 *
 * The act's step reads 13/600 and its value takes the act's colour. `stacked`
 * drops the value under the step (the page sets it below 1340px).
 */
import type { ReactNode } from "react";
import Icon from "./Icon";

export type ChecklistMark = "done" | "open" | "missed" | "due" | "none";

export interface ChecklistRowProps {
  mark: ChecklistMark;
  step: string;
  value?: string | null;
  /** The step's document, e.g. an underlined PO No that opens its PDF. */
  doc?: ReactNode;
  stacked?: boolean;
  "data-testid"?: string;
}

const BOX: Record<Exclude<ChecklistMark, "none">, string> = {
  done: "border-kit-slate-11 bg-kit-slate-11 text-white",
  open: "border-kit-slate-9 bg-white",
  missed: "border-kit-red-9 bg-kit-red-9 text-white",
  due: "border-kit-amber-11 bg-kit-amber-11 text-white",
};

const VALUE: Record<ChecklistMark, string> = {
  done: "text-kit-slate-11",
  open: "text-kit-slate-11",
  none: "text-kit-slate-11",
  missed: "text-kit-red-11",
  due: "text-kit-amber-11",
};

export const CHECKLIST_MARK_WORD: Record<ChecklistMark, string | null> = {
  done: "Done",
  open: "Not yet",
  missed: "Missed",
  due: "Due",
  none: null,
};

export default function ChecklistRow({ mark, step, value, doc, stacked = false, "data-testid": testId }: ChecklistRowProps) {
  const act = mark === "missed" || mark === "due";
  const box = mark === "none" ? (
    <span aria-hidden className="h-4 w-4" />
  ) : (
    <span aria-hidden className={`grid h-4 w-4 place-items-center rounded-pill border-[1.5px] text-label ${BOX[mark]}`}>
      {mark === "done" ? <Icon name="confirm" size={14} /> : act ? "!" : null}
    </span>
  );
  const stepText = <span className={`min-w-0 text-body ${act ? "font-semibold text-kit-slate-12" : mark === "done" ? "text-kit-slate-11" : "text-kit-slate-12"}`}>{step}</span>;
  const valueText = value ? <span className={`min-w-0 text-meta ${VALUE[mark]}`}>{value}</span> : null;
  const spoken = [step, CHECKLIST_MARK_WORD[mark], value].filter(Boolean).join(", ");
  return stacked ? (
    <div className="grid min-h-8 grid-cols-[16px_minmax(0,1fr)_auto] items-start gap-x-2 py-1" aria-label={spoken} data-testid={testId} data-mark={mark}>
      <span className="pt-0.5">{box}</span>
      <span className="flex min-w-0 flex-col">
        {stepText}
        {valueText}
      </span>
      <span className="text-meta">{doc ?? null}</span>
    </div>
  ) : (
    <div className="grid min-h-8 grid-cols-[16px_minmax(150px,210px)_minmax(0,1fr)_auto] items-center gap-2" aria-label={spoken} data-testid={testId} data-mark={mark}>
      {box}
      {stepText}
      {valueText ?? <span />}
      <span className="text-meta">{doc ?? null}</span>
    </div>
  );
}

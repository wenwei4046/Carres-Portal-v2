/**
 * RouteStop — one stop on a vertical route (Workspace MASTER §5.10 BUILD SHEET,
 * kit admission Jess 2026-09-28 "kit ok").
 *
 * A 24px dot on a line, the stop label in small grey uppercase and, beside it,
 * `Missed` or `Due` only. The dot says the stop's state and never a number:
 * red `!` missed · amber `!` due · dark tick when every step is done · grey
 * otherwise. The line under the dot is dashed ahead and solid once the stop is
 * done; the last stop draws no line.
 *
 * The stop draws no box of its own — its cards (or one Quiet route row) are
 * the children.
 */
import type { ReactNode } from "react";
import Icon from "./Icon";

export type RouteStopTone = "missed" | "due" | "done" | "none";

export interface RouteStopProps {
  /** The node's name, e.g. `PURCHASING`. Printed in uppercase. */
  label: string;
  tone: RouteStopTone;
  /** The last stop draws no line under its dot. */
  last?: boolean;
  /** Replaces the label row, e.g. a Quiet route row that carries the label itself. */
  hideLabel?: boolean;
  children: ReactNode;
  "data-testid"?: string;
}

const DOT: Record<RouteStopTone, string> = {
  missed: "bg-kit-red-9 text-white",
  due: "bg-kit-amber-11 text-white",
  done: "bg-kit-slate-11 text-white",
  none: "bg-kit-slate-5 text-white",
};

export const ROUTE_STOP_WORD: Partial<Record<RouteStopTone, string>> = {
  missed: "Missed",
  due: "Due",
};

export default function RouteStop({ label, tone, last = false, hideLabel = false, children, "data-testid": testId }: RouteStopProps) {
  const word = ROUTE_STOP_WORD[tone];
  return (
    <section className="relative grid grid-cols-[24px_minmax(0,1fr)] gap-3 pb-6 last:pb-0" aria-label={label} data-testid={testId} data-tone={tone}>
      {!last ? (
        <span
          aria-hidden
          className={`absolute bottom-0 left-3 top-6 border-l-[1.5px] ${tone === "done" ? "border-solid border-kit-slate-11" : "border-dashed border-kit-slate-6"}`}
        />
      ) : null}
      <span aria-hidden className={`relative grid h-6 w-6 place-items-center rounded-full text-label ${DOT[tone]}`}>
        {tone === "missed" || tone === "due" ? "!" : tone === "done" ? <Icon name="confirm" size={14} /> : null}
      </span>
      <div className="min-w-0">
        {hideLabel ? null : (
          <div className="mb-2 flex min-h-6 items-center gap-3">
            <span className="text-label uppercase tracking-[0.06em] text-kit-slate-11">{label}</span>
            {word ? <span className={`text-label ${tone === "missed" ? "text-kit-red-11" : "text-kit-amber-11"}`}>{word}</span> : null}
          </div>
        )}
        {children}
      </div>
    </section>
  );
}

/**
 * StepList — the numbered steps of one job (02 "Task steps"; admitted with the
 * owner's 12 Oct 2026 package: the send card's three steps).
 *
 * Each step is a 20px round mark, a 13 / 500 title, one 12 grey line under it,
 * an optional button on the right and its own controls below. The mark says
 * where the person is, never what was recorded elsewhere:
 *
 *   done      green, with a tick
 *   current   dark, with the number: the step to do now
 *   pending   white, with the number: a later step
 *
 * A hairline separates the steps. The list has no frame of its own: it sits
 * inside the card that owns the job (never a box inside a box).
 */
import type { ReactNode } from "react";
import Icon from "./Icon";

export type StepState = "done" | "current" | "pending";

const MARK: Record<StepState, string> = {
  done: "border-transparent bg-c-ok-bg text-c-ok-fg",
  current: "border-c-main bg-c-main text-white",
  pending: "border-c-chip-border bg-white text-c-secondary",
};

export const STEP_STATE_WORD: Record<StepState, string> = {
  done: "Done",
  current: "Do this now",
  pending: "Later",
};

export function Step({ n, state, title, sub, action, children, "data-testid": testId }: {
  n: number;
  state: StepState;
  /** The step's name. A step whose whole content is one button may leave it out. */
  title?: string;
  sub?: ReactNode;
  /** One control on the title's right, e.g. the step's own button. */
  action?: ReactNode;
  children?: ReactNode;
  "data-testid"?: string;
}) {
  return (
    <li
      className="flex items-start gap-[10px] border-t border-c-row-line py-[10px] first:border-t-0 first:pt-0 last:pb-0"
      data-testid={testId}
      data-state={state}
    >
      <span
        className={`flex h-5 w-5 flex-none items-center justify-center rounded-full border text-label font-semibold ${MARK[state]}`}
        aria-label={`Step ${n}, ${STEP_STATE_WORD[state]}`}
      >
        {state === "done" ? <Icon name="confirm" size={14} /> : n}
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-[6px]">
        {(title || sub || action) && (
          /* The step's button drops under its words when the room is narrow
             (the Tasks panel at 320), so neither is squeezed or cut. */
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
            <span className="flex min-w-[112px] flex-1 flex-col">
              {title ? <span className="text-body font-medium text-c-ink">{title}</span> : null}
              {sub ? <span className="text-meta text-c-secondary">{sub}</span> : null}
            </span>
            {action ? <span className="flex-none">{action}</span> : null}
          </div>
        )}
        {children}
      </div>
    </li>
  );
}

export default function StepList({ children, "aria-label": label, "data-testid": testId }: {
  children: ReactNode;
  "aria-label"?: string;
  "data-testid"?: string;
}) {
  return (
    <ol className="m-0 flex list-none flex-col p-0" aria-label={label} data-testid={testId}>
      {children}
    </ol>
  );
}

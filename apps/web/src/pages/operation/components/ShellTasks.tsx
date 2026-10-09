/**
 * ShellTasks — the Tasks panel on the right of EVERY Operations page (Carres
 * Layout Standard §1 and §3.3, owner-confirmed template 2026-10-08; owner
 * answer 2026-10-08: the right side is the Tasks panel only — Calendar and
 * Activity leave the shell).
 *
 *   ┌ OCT ┐ Tasks  Thursday · 5 left                         ›
 *   └ 8  ┘
 *   (the Tasks list — module, week, sections, rows)
 *
 * A 320px white card on the canvas. `›` hides it; the shell header then shows
 * a `Tasks 5` pill that opens it again. The choice is remembered per browser.
 * While a task's own work panel is open the card widens, because a module's
 * form does not fit 320px.
 */
import { useEffect } from "react";
import { create } from "zustand";
import MIcon from "@/components/carres/MIcon";
import TasksArea from "../tasks/TasksArea";
import { useTasksHost } from "../tasks/tasks-host";
import { useOpenWorkSet } from "../use-open-work";
import { myMissedAndToday } from "../work/work-model";

const KEY = "shell-tasks-open";

function readOpen(): boolean {
  try {
    /* Open on a wide screen unless the person hid it (v8: Tasks from 1100px). */
    const stored = localStorage.getItem(KEY);
    return stored ? stored === "1" : window.innerWidth >= 1100;
  } catch {
    return true;
  }
}

export const useShellTasks = create<{
  open: boolean;
  setOpen: (open: boolean) => void;
  /** Pages that place their own `Tasks` pill in their toolbar (the list and
   *  the order detail, per the screenshots). The header shows its fallback
   *  pill only while none does. */
  pillHosts: number;
  hostPill: () => () => void;
}>((set) => ({
  open: readOpen(),
  pillHosts: 0,
  hostPill: () => {
    set((s) => ({ pillHosts: s.pillHosts + 1 }));
    return () => set((s) => ({ pillHosts: s.pillHosts - 1 }));
  },
  setOpen: (open) => {
    try {
      localStorage.setItem(KEY, open ? "1" : "0");
    } catch {
      /* a blocked storage may not break the panel */
    }
    set({ open });
  },
}));

/** Missed + today for the signed-in person — the same count the old rail
 *  badge carried. Null while loading or failed: never a guessed number. */
export function useTasksLeft(): number | null {
  const { items, myUserId, myFocus, hasData, error } = useOpenWorkSet();
  if (!hasData || error) return null;
  const { missed, today } = myMissedAndToday(items, myUserId, myFocus);
  return missed + today;
}

/** The `Tasks 5` pill that re-opens a hidden panel (Layout Standard §1: "a
 *  small pill in the toolbar opens them again"). A page puts it at the end of
 *  its own toolbar; `fallback` is the shell header's copy for pages that do
 *  not, shown only while no page hosts one. */
export function TasksPill({ fallback = false }: { fallback?: boolean } = {}) {
  const open = useShellTasks((s) => s.open);
  const setOpen = useShellTasks((s) => s.setOpen);
  const hosts = useShellTasks((s) => s.pillHosts);
  const hostPill = useShellTasks((s) => s.hostPill);
  useEffect(() => (fallback ? undefined : hostPill()), [fallback, hostPill]);
  const left = useTasksLeft();
  if (open || (fallback && hosts > 0)) return null;
  return (
    <button
      type="button"
      onClick={() => setOpen(true)}
      data-testid="tasks-pill"
      /* Below 768px the phone top bar carries its own Tasks door, so the
         pill hides there: one Tasks control per screen. */
      className="flex h-8 shrink-0 items-center gap-2 rounded-lg border border-c-input-border bg-white px-3 text-[14px] font-medium text-c-ink hover:bg-c-info-bg max-[767px]:hidden"
    >
      <MIcon name="right_panel_open" size={18} />
      Tasks
      {left != null && left > 0 && (
        <span className="grid h-[18px] min-w-[18px] place-items-center rounded-full bg-c-ink px-1 text-[11px] font-semibold tabular-nums text-white">{left}</span>
      )}
    </button>
  );
}

export default function ShellTasks() {
  const open = useShellTasks((s) => s.open);
  const setOpen = useShellTasks((s) => s.setOpen);
  const taskOpen = useTasksHost((s) => s.taskOpen);
  const guard = useTasksHost((s) => s.guard);
  const left = useTasksLeft();
  if (!open) return null;
  const now = new Date();
  const mon = now.toLocaleDateString("en-GB", { month: "short" }).toUpperCase();
  const weekday = now.toLocaleDateString("en-GB", { weekday: "long" });
  return (
    <aside
      aria-label="Tasks"
      data-testid="shell-tasks"
      className={`flex min-h-0 shrink-0 flex-col overflow-hidden rounded-lg border border-c-border bg-white ${
        taskOpen ? "w-[clamp(366px,32vw,560px)]" : "w-[320px]"
      }`}
    >
      <div className="flex shrink-0 items-center gap-1.5 border-b border-c-line px-3.5 pb-2.5 pt-3">
        {/* The day badge: month on charcoal over the day number. */}
        <span className="flex h-[30px] w-7 shrink-0 flex-col overflow-hidden rounded-[7px] border border-c-input-border bg-white" aria-hidden>
          <span className="bg-c-ink text-center text-[7px] font-semibold leading-[10px] tracking-[0.04em] text-white">{mon}</span>
          <span className="grid flex-1 place-items-center text-body font-semibold text-c-ink">{now.getDate()}</span>
        </span>
        <span className="flex min-w-0 flex-1 items-baseline gap-1.5 whitespace-nowrap">
          <span className="text-strong text-c-ink">Tasks</span>
          <span className="truncate text-meta text-c-muted">
            {weekday}
            {left != null ? ` · ${left} left` : ""}
          </span>
        </span>
        <button
          type="button"
          onClick={() => guard(() => setOpen(false))}
          aria-label="Hide tasks"
          title="Hide tasks"
          className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-c-muted hover:bg-c-hover"
        >
          <MIcon name="chevron_right" size={20} />
        </button>
      </div>
      <div className="flex min-h-0 flex-1 flex-col">
        <TasksArea onClose={() => setOpen(false)} fill bare />
      </div>
    </aside>
  );
}

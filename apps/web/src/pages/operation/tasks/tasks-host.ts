/**
 * THE TASKS HOST — one shared state for the right area's Tasks view, so the
 * Quick Rail doors, the area's × and the task's own `‹ Tasks` all pass the
 * same draft guard (owner direction 2026-10-05).
 *
 *   dirty     the open task holds typed input that is not saved
 *   guard(f)  run `f` now, or hold it behind `Leave without saving?`
 */
import type { ReactNode } from "react";
import { create } from "zustand";

interface TasksHostState {
  /** Bumped by `View tasks`: the rail (or the phone door) opens Tasks. */
  tasksRequest: number;
  requestTasks: () => void;
  /** Bumped when the operator chose `Leave` through another rail door: the
   *  open task (and its unsaved input) is discarded. */
  discardRequest: number;
  requestDiscard: () => void;
  dirty: boolean;
  /** A task's own work panel is open (the shell widens the Tasks card). */
  taskOpen: boolean;
  setTaskOpen: (open: boolean) => void;
  /** What the open task is about, for the guard's sentence (`SO-1368`). */
  subject: string | null;
  pending: (() => void) | null;
  setDirty: (dirty: boolean, subject?: string | null) => void;
  guard: (leave: () => void) => void;
  leave: () => void;
  stay: () => void;
}

export const useTasksHost = create<TasksHostState>((set, get) => ({
  tasksRequest: 0,
  requestTasks: () => set((s) => ({ tasksRequest: s.tasksRequest + 1 })),
  discardRequest: 0,
  requestDiscard: () => set((s) => ({ discardRequest: s.discardRequest + 1 })),
  dirty: false,
  taskOpen: false,
  setTaskOpen: (taskOpen) => set({ taskOpen }),
  subject: null,
  pending: null,
  setDirty: (dirty, subject) => set((s) => ({ dirty, subject: subject === undefined ? s.subject : subject })),
  guard: (leave) => {
    if (!get().dirty) {
      leave();
      return;
    }
    set({ pending: leave });
  },
  leave: () => {
    const pending = get().pending;
    set({ pending: null, dirty: false });
    pending?.();
  },
  stay: () => set({ pending: null }),
}));

/**
 * What a module panel receives from the host (contract sent to Purchasing A,
 * 2026-10-05). `result` takes the module's OWN success words; the host shows
 * them on the list. `openReview` is for the one act that needs a full
 * surface (Issue PO's 50/50 review, PROPOSAL): the task stays mounted and the
 * host returns to it when the review closes.
 */
export interface WorkPanelHost {
  close: () => void;
  back: () => void;
  result: (sentence: string, opts?: { stay?: boolean }) => void;
  openReview: (render: (close: () => void) => ReactNode) => void;
  /** True only in the local dev walk (`window.__carresSimulated`); production
   *  never sets it, so every write from a panel hits the real doors. */
  simulated: boolean;
}

/** The local walk marks itself; production never sets this. */
export function isSimulatedWalk(): boolean {
  return typeof window !== "undefined" && (window as unknown as { __carresSimulated?: boolean }).__carresSimulated === true;
}

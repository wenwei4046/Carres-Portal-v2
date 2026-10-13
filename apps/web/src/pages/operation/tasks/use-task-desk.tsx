/**
 * THE TASK DESK — the one way a task is opened, worked and closed, wherever
 * its list is drawn (the shell's Tasks panel, the Workspace page).
 *
 * The surface draws its own list and says in which order its cards stand; the
 * desk owns everything about the ONE opened task:
 *
 *   openTask · back     behind the `Leave without saving?` guard
 *   host                what a module panel receives (`WorkPanelHost`): its
 *                       success words go to the app's dark toast, with
 *                       `Next: {party}` when another task of the same kind
 *                       waits in the list's order; a full-surface review
 *   closing             the task returns to the list when the Work feed no
 *                       longer carries it (the source closed the act), never
 *                       on a guess
 *   opened              the task as its list card words it, for `TaskFrame`
 *   overlays            the guard dialog and the full-surface review
 *
 * No second engine: every task is an occurrence of the one Work read.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useQueryClient } from "@tanstack/react-query";
import Button from "@/components/kit/Button";
import Modal from "@/components/kit/Modal";
import { notifyTaskSaved } from "@/components/kit/Toast";
import { Z_DIALOG } from "@/components/kit/overlay-layer";
import { qk } from "@/lib/queries";
import { useOpenWorkSet, type WorkRow } from "../use-open-work";
import { TASK_CARD_WORDS, taskCard, type TaskCard } from "./task-cards";
import { isSimulatedWalk, useTasksHost, type WorkPanelHost } from "./tasks-host";
import type { PoWindowFacts } from "./tasks-model";

type Result = { text: string; taskId: string; stay: boolean };

export function useTaskDesk({ order, factsOf, onLeave }: {
  /** The open work of the list the task is opened from, in the list's order. */
  order: readonly TaskCard[];
  factsOf: (row: WorkRow) => PoWindowFacts | null;
  /** Leaves the whole surface (the Tasks panel's own close). */
  onLeave?: () => void;
}) {
  const { items, hasData } = useOpenWorkSet();
  const simulated = isSimulatedWalk();
  const queryClient = useQueryClient();

  const [taskId, setTaskId] = useState<string | null>(null);
  const [lastTaskId, setLastTaskId] = useState<string | null>(null);
  const snapshot = useRef<WorkRow | null>(null);
  const live = taskId ? items.find((r) => r.id === taskId) ?? null : null;
  if (live) snapshot.current = live;
  const task = taskId ? live ?? snapshot.current : null;
  const setTaskOpen = useTasksHost((s) => s.setTaskOpen);
  useEffect(() => {
    setTaskOpen(Boolean(task));
    return () => setTaskOpen(false);
  }, [task, setTaskOpen]);
  const [result, setResult] = useState<Result | null>(null);
  const [review, setReview] = useState<((close: () => void) => ReactNode) | null>(null);
  const setDirty = useTasksHost((s) => s.setDirty);
  const guard = useTasksHost((s) => s.guard);

  const closeTask = useCallback(() => {
    setTaskId(null);
    setReview(null);
    setDirty(false, null);
  }, [setDirty]);

  /* `Leave` through another door discards the open task's input. */
  const discardRequest = useTasksHost((s) => s.discardRequest);
  const seenDiscard = useRef(discardRequest);
  useEffect(() => {
    if (discardRequest === seenDiscard.current) return;
    seenDiscard.current = discardRequest;
    closeTask();
  }, [discardRequest, closeTask]);

  /* The source closed the act (it left the feed): back to the list. */
  /* A full-width review that just closed is followed by the module's own
     result a moment later; wait for it before deciding (no blind close). */
  const reviewClosedAt = useRef(0);
  const [recheck, setRecheck] = useState(0);
  useEffect(() => {
    /* …unless its own result asked to stay: the panel keeps showing what was
       just saved (a partial receipt) until the operator goes back. */
    const kept = result?.taskId === taskId && result.stay;
    if (!taskId || !hasData || kept || items.some((r) => r.id === taskId)) return;
    const wait = 3000 - (Date.now() - reviewClosedAt.current);
    if (wait > 0) {
      const t = setTimeout(() => setRecheck((n) => n + 1), wait);
      return () => clearTimeout(t);
    }
    closeTask();
  }, [taskId, hasData, items, closeTask, result, recheck]);

  const openTask = (row: WorkRow) => {
    guard(() => {
      setDirty(false, null);
      setTaskId(row.id);
      setLastTaskId(row.id);
      setResult(null);
    });
  };
  /* The toast's `Next` outlives the render that made it: it opens the task
     only while that task is still open work, never a stale one. */
  const openTaskRef = useRef(openTask);
  openTaskRef.current = (row: WorkRow) => { if (items.some((r) => r.id === row.id)) openTask(row); };

  const cardOrder = useMemo(() => order.filter((card) => card.work), [order]);
  const taskOrder = useMemo(() => cardOrder.map((card) => card.work!), [cardOrder]);

  const host: WorkPanelHost = useMemo(() => ({
    close: () => guard(() => { closeTask(); onLeave?.(); }),
    back: () => guard(closeTask),
    result: (text, opts) => {
      if (!taskId) return;
      setDirty(false);
      const stay = Boolean(opts?.stay);
      setResult({ text, taskId, stay });
      /* The app's dark toast says what was saved. When the task closes it
         offers the next task of the same kind, in the list's own order: one
         click, never an automatic jump (01 §3). */
      const at = cardOrder.findIndex((card) => card.id === taskId);
      const rule = cardOrder[at]?.work?.ruleKey;
      const after = at < 0 ? [] : [...cardOrder.slice(at + 1), ...cardOrder.slice(0, at)];
      const next = stay ? null : after.find((card) => card.work!.ruleKey === rule) ?? null;
      notifyTaskSaved(text, {
        closeLabel: TASK_CARD_WORDS.closeMessage,
        next: next ? { label: TASK_CARD_WORDS.next(next.party), onOpen: () => openTaskRef.current(next.work!) } : null,
      });
      /* Ask the ONE Work feed again now, so a closed act leaves the list
         without waiting for the next poll. */
      void queryClient.invalidateQueries({ queryKey: qk.operation.work() });
      /* A batch row is worded from the SO Batch read (to buy / to send), so
         an issued or sent PO changes that row's words too. */
      void queryClient.invalidateQueries({ queryKey: ["so-batch-purchase"] });
      if (!stay) closeTask();
    },
    openReview: (render) => setReview(() => render),
    simulated,
  }), [guard, onLeave, closeTask, taskId, setDirty, simulated, queryClient, cardOrder]);

  /* The opened task as its list card words it: one title, one set of facts. */
  const opened = useMemo(() => (task ? { row: task, card: taskCard(task, factsOf(task)), result: (words: string) => host.result(words) } : null), [task, factsOf, host]);

  const pending = useTasksHost((s) => s.pending);
  const subject = useTasksHost((s) => s.subject);
  const leave = useTasksHost((s) => s.leave);
  const stay = useTasksHost((s) => s.stay);

  const overlays = (
    <>
      <Modal
        open={pending !== null}
        onOpenChange={(next) => { if (!next) stay(); }}
        title="Leave without saving?"
        description={subject ? `What you typed for ${subject} is not saved yet.` : "What you typed is not saved yet."}
        footer={
          <div className="flex w-full justify-between gap-2">
            <Button onClick={leave} data-testid="guard-leave">Leave</Button>
            <Button variant="primary" onClick={stay} data-testid="guard-stay">Stay</Button>
          </div>
        }
      >
        {null}
      </Modal>
      {review && task ? createPortal(
        <div role="dialog" aria-modal="true" aria-label={`${task.line} · ${task.source.object.label}`} className={`fixed inset-0 ${Z_DIALOG} flex flex-col bg-white`} data-testid="tasks-review">
          {review(() => { reviewClosedAt.current = Date.now(); setReview(null); })}
        </div>,
        document.body,
      ) : null}
    </>
  );

  return {
    task, taskId, lastTaskId,
    openTask,
    /** Back to the list, behind the guard. */
    back: () => guard(closeTask),
    /** Mark what was typed in the open task as not saved. */
    markDirty: () => { if (task) setDirty(true, task.source.object.label); },
    guard,
    host, opened, taskOrder,
    taskAt: task ? taskOrder.findIndex((row) => row.id === task.id) + 1 : 0,
    overlays,
  };
}

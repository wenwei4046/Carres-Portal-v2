/**
 * PENDING WORK — the first-entry reminder (LOCAL PROPOSAL, owner walk pending;
 * words `Pending work` · `View tasks` · `Got it` are PROPOSAL until COPY
 * admits them).
 *
 *   · once per person per working day, on the FIRST portal entry of the day;
 *     later new missed items only move the Tasks door's red count
 *   · never when missed + today = 0, never while a task holds unsaved input
 *   · the numbers are the Tasks badge's own (`myMissedAndToday`) — no second
 *     arithmetic
 *   · `View tasks` opens the same Tasks list (Missed first, today open);
 *     `Got it` (and Esc) only acknowledges — it records nothing, completes
 *     nothing
 *
 * Uses the shared kit `Modal` on desktop and phone; no new surface.
 */
import { useEffect, useRef, useState } from "react";
import Modal from "@/components/kit/Modal";
import Button from "@/components/kit/Button";
import { useAuth } from "@/lib/auth";
import { useOpenWorkSet } from "../use-open-work";
import { myMissedAndToday } from "../work/work-model";
import { useTasksHost } from "./tasks-host";

export const PENDING_WORK_WORDS = {
  title: "Pending work",
  missed: (n: number) => `${n} missed`,
  today: (n: number) => `${n} due today`,
  view: "View tasks",
  gotIt: "Got it",
} as const;

const SHOWN_KEY = (userId: string) => `carres.pendingWork.shownOn.${userId}`;

function shownOn(userId: string): string | null {
  try {
    return window.localStorage.getItem(SHOWN_KEY(userId));
  } catch {
    return null;
  }
}
function markShown(userId: string, day: string): void {
  try {
    window.localStorage.setItem(SHOWN_KEY(userId), day);
  } catch {
    /* Blocked storage: the reminder simply may show again next entry. */
  }
}

export default function PendingWorkReminder() {
  const { items, myUserId, myFocus, hasData, error, generatedOn } = useOpenWorkSet();
  const userId = useAuth((s) => s.session?.user?.id ?? s.user?.id ?? null);
  const dirty = useTasksHost((s) => s.dirty);
  const requestTasks = useTasksHost((s) => s.requestTasks);
  const [open, setOpen] = useState(false);
  const [counts, setCounts] = useState<{ missed: number; today: number } | null>(null);
  /* The decision is taken ONCE per entry, on the first good read. */
  const decided = useRef(false);

  useEffect(() => {
    if (decided.current || !hasData || error || !userId || !generatedOn) return;
    decided.current = true;
    if (shownOn(userId) === generatedOn) return; // already this working day
    markShown(userId, generatedOn); // the first entry of the day is spent
    const { missed, today } = myMissedAndToday(items, myUserId, myFocus);
    if (missed + today === 0 || dirty) return;
    setCounts({ missed, today });
    setOpen(true);
  }, [hasData, error, userId, generatedOn, items, myUserId, myFocus, dirty]);

  if (!counts) return null;
  return (
    <Modal
      open={open}
      onOpenChange={(next) => { if (!next) setOpen(false); }}
      title={PENDING_WORK_WORDS.title}
      footer={
        <div className="flex w-full flex-wrap justify-end gap-2">
          <Button onClick={() => setOpen(false)} data-testid="pending-work-got-it">{PENDING_WORK_WORDS.gotIt}</Button>
          <Button variant="primary" onClick={() => { setOpen(false); requestTasks(); }} data-testid="pending-work-view">{PENDING_WORK_WORDS.view}</Button>
        </div>
      }
    >
      <p className="text-body text-kit-slate-12" data-testid="pending-work-line">
        {counts.missed > 0 ? <span className="font-semibold text-danger">{PENDING_WORK_WORDS.missed(counts.missed)}</span> : null}
        {counts.missed > 0 && counts.today > 0 ? " · " : null}
        {counts.today > 0 ? <span>{PENDING_WORK_WORDS.today(counts.today)}</span> : null}
      </p>
    </Modal>
  );
}

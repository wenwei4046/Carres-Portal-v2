/**
 * `RECORD AS SENT` — the one act that moves a task to `Waiting` (Workspace
 * MASTER §5.10 "Communication and Waiting", owner rulings 2026-09-24 to 28;
 * round 3 brief of 13 Oct 2026, point 4).
 *
 * The person has asked the party (by WhatsApp, Email, phone or in person) and
 * says so here, with the channel. The Work record stores the request, the
 * actor, the time and the answer day (one Office working day unless the rule
 * sets its own); the task is then in `Waiting` everywhere, and comes back to
 * `To do` by itself with `No answer by {date}` when that day passes.
 *
 * It completes nothing: only the owning module's fact completes a task.
 * Opening WhatsApp or copying a message is never a request recorded.
 *
 * Drawn for open work that names a party and is not waiting already. A
 * purchase batch is not asked this way: its own record is
 * `PO sent to supplier`.
 */
import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { WORK_CHANNELS, workLifecycleOrToDo, type OperationWorkLifecycle, type WorkChannel } from "@carres/shared";
import Button from "@/components/kit/Button";
import Select from "@/components/kit/Select";
import { ApiError, apiFetch } from "@/lib/api";
import { fmtDate } from "@/lib/fmt-date";
import { qk } from "@/lib/queries";
import type { WorkRow } from "../use-open-work";
import { TASK_CARD_WORDS } from "./task-cards";
import { TASK_VIEW_WORDS as W } from "./task-view";

/** The words. COPY-STANDARD "The Tasks panel words" and "Communication receipt". */
export const TASK_REQUEST_WORDS = {
  act: "Record as sent",
  channel: "Communication channel",
  channelWord: { whatsapp: "WhatsApp", email: "Email", phone: "Phone", in_person: "In person" } as Record<WorkChannel, string>,
  hint: (party: string) => `After you asked ${party}`,
  failed: "Not recorded · Try again",
} as const;

const R = TASK_REQUEST_WORDS;

/** Whether the task can be marked as asked. */
export function canRecordRequest(row: WorkRow): boolean {
  return Boolean(row.recipient) && row.source.object.kind !== "po_window" && workLifecycleOrToDo(row.source).state === "to_do";
}

/** What the toast says: who was asked, how, and when to contact them again. */
export function requestRecordedWords(row: WorkRow, channel: WorkChannel, replyDueOn: string | null): string {
  return [W.asked(row.recipient), R.channelWord[channel], replyDueOn ? `${TASK_CARD_WORDS.nextContact} ${fmtDate(replyDueOn)}` : null].filter(Boolean).join(" · ");
}

export default function TaskRequest({ row, onRecorded }: { row: WorkRow; onRecorded: (words: string) => void }) {
  const queryClient = useQueryClient();
  const [channel, setChannel] = useState<WorkChannel>(workLifecycleOrToDo(row.source).channel ?? "whatsapp");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /* One key per attempt: a retry after a lost answer is the same request,
     never a second one. A new attempt (another channel) takes a new key. */
  const attempt = useRef<{ key: string; channel: WorkChannel } | null>(null);

  async function record() {
    if (busy) return;
    setBusy(true); setError(null);
    if (!attempt.current || attempt.current.channel !== channel) attempt.current = { key: crypto.randomUUID(), channel };
    try {
      const out = await apiFetch<{ lifecycle?: OperationWorkLifecycle }>(`/api/operation/work/${encodeURIComponent(row.id)}/request-sent`, {
        method: "POST",
        body: JSON.stringify({ channel, contactKind: null, contactId: null, sourceVersion: row.source.sourceVersion, idempotencyKey: attempt.current.key }),
      });
      attempt.current = null;
      await queryClient.invalidateQueries({ queryKey: qk.operation.work() });
      onRecorded(requestRecordedWords(row, channel, out?.lifecycle?.replyDueOn ?? null));
    } catch (cause) {
      /* The door's own sentence when it refused; the Work read is asked
         again either way, so the task shows what the record really holds. */
      setError(cause instanceof ApiError && cause.status >= 400 && cause.status < 500 && cause.message ? cause.message : R.failed);
      void queryClient.invalidateQueries({ queryKey: qk.operation.work() });
    } finally { setBusy(false); }
  }

  return (
    <div className="flex flex-col gap-1.5 border-t border-c-row-line px-2.5 py-2" data-testid="task-request">
      <span className="text-meta text-c-secondary">{R.hint(row.recipient ?? "")}</span>
      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-[132px] flex-1">
          <Select id={`task-request-channel-${row.id}`} label={R.channel} value={channel} onValueChange={(value) => { setChannel(value as WorkChannel); setError(null); }}
            options={WORK_CHANNELS.map((key) => ({ value: key, label: R.channelWord[key] }))} />
        </div>
        <Button loading={busy} onClick={() => void record()} data-testid="task-request-record">{R.act}</Button>
      </div>
      {error ? <span role="alert" className="text-meta text-c-err-fg" data-testid="task-request-error">{error}</span> : null}
    </div>
  );
}

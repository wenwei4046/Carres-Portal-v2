/**
 * `+ Task` AND ITS DIALOG (Workspace MASTER "Employee-created internal
 * tasks", Jess 2026-10-14; the owner's kit, `Carres Shell.dc.html`, "New
 * task").
 *
 * One employee adds a task for another, or for themselves: its name, what the
 * person needs to know, who it is for, and the day it is due. The task then
 * sits in that person's Tasks and on the Workspace page like every other task.
 *
 * It asks for nothing else on purpose. It is internal work: it links to no
 * record of another module, so it can approve, send or post nothing there.
 */
import { useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { INTERNAL_TASK_DETAIL_MAX, INTERNAL_TASK_TITLE_MAX } from "@carres/shared";
import Button from "@/components/kit/Button";
import DatePicker from "@/components/kit/DatePicker";
import Input from "@/components/kit/Input";
import Modal from "@/components/kit/Modal";
import Select from "@/components/kit/Select";
import Textarea from "@/components/kit/Textarea";
import { notifyTaskSaved } from "@/components/kit/Toast";
import { ApiError, apiFetch } from "@/lib/api";
import { qk } from "@/lib/queries";
import { useOpenWorkSet } from "../use-open-work";
import {
  INTERNAL_TASK_WORDS as W,
  internalTaskAddedWords,
  internalTaskPeople,
  internalTaskRefusal,
  internalTaskRefusalField,
} from "./internal-task";
import { TASK_CARD_WORDS } from "./task-cards";
import { isSimulatedWalk } from "./tasks-host";

type Field = "name" | "detail" | "due" | "assignee";

/** `wide`: the Workspace toolbar's full word; else the 320 panel's short one. */
export default function NewTask({ wide = false }: { wide?: boolean }) {
  const queryClient = useQueryClient();
  const { staff, myUserId, generatedOn } = useOpenWorkSet();
  const people = useMemo(() => internalTaskPeople(staff, myUserId), [staff, myUserId]);
  const trigger = useRef<HTMLButtonElement>(null);

  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [detail, setDetail] = useState("");
  const [assignee, setAssignee] = useState<string | null>(null);
  const [due, setDue] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});
  const [failed, setFailed] = useState<string | null>(null);
  /* One key per attempt: a retry after a lost answer is the same task. */
  const attempt = useRef<string | null>(null);

  const chosen = assignee ?? myUserId ?? people[0]?.value ?? "";
  const dueOn = due ?? (generatedOn || null);

  function start() {
    setName(""); setDetail(""); setAssignee(null); setDue(null);
    setErrors({}); setFailed(null); attempt.current = null;
    setOpen(true);
  }

  async function add() {
    if (busy) return;
    const title = name.trim();
    const local: Partial<Record<Field, string>> = {};
    if (!title) local.name = W.nameRequired;
    if (!dueOn) local.due = W.dueRequired;
    setErrors(local); setFailed(null);
    if (local.name || local.due || !chosen) return;
    setBusy(true);
    attempt.current ??= crypto.randomUUID();
    try {
      if (!isSimulatedWalk()) {
        await apiFetch("/api/operation/internal-tasks", {
          method: "POST",
          body: JSON.stringify({ title, detail: detail.trim() || null, assignedTo: chosen, dueOn, idempotencyKey: attempt.current }),
        });
      }
      attempt.current = null;
      setOpen(false);
      notifyTaskSaved(internalTaskAddedWords(people.find((person) => person.value === chosen), myUserId), { closeLabel: TASK_CARD_WORDS.closeMessage });
      void queryClient.invalidateQueries({ queryKey: qk.operation.work() });
    } catch (cause) {
      const refused = cause instanceof ApiError && cause.status >= 400 && cause.status < 500;
      const code = refused ? (cause.body as { code?: unknown } | null)?.code : null;
      const sentence = refused ? internalTaskRefusal(code, cause.message || W.notSaved) : W.notSaved;
      const field = internalTaskRefusalField(code);
      /* A refusal changes what is sent, so the next press is a new attempt. */
      if (refused) attempt.current = null;
      if (field) setErrors({ [field]: sentence }); else setFailed(sentence);
    } finally { setBusy(false); }
  }

  return (
    <>
      <Button ref={trigger} size="sm" variant={wide ? "primary" : "neutral"} icon="add" title={W.hint} aria-label={W.title} onClick={start} data-testid="new-task-open">
        {wide ? W.buttonWide : W.button}
      </Button>
      <Modal
        open={open}
        onOpenChange={(next) => { if (!next && !busy) setOpen(false); }}
        title={W.title}
        returnFocusRef={trigger}
        footer={
          <div className="flex w-full justify-end gap-2">
            <Button onClick={() => setOpen(false)} disabled={busy} data-testid="new-task-cancel">{W.cancel}</Button>
            <Button variant="primary" loading={busy} onClick={() => void add()} data-testid="new-task-add">{W.add}</Button>
          </div>
        }
      >
        <form className="flex flex-col gap-3" onSubmit={(event) => { event.preventDefault(); void add(); }} data-testid="new-task-form">
          <Input id="new-task-name" label={W.name} required value={name} maxLength={INTERNAL_TASK_TITLE_MAX} placeholder={W.namePlaceholder} error={errors.name}
            onChange={(event) => { setName(event.target.value); setErrors((e) => ({ ...e, name: undefined })); }} />
          <Textarea id="new-task-detail" label={W.detail} value={detail} maxLength={INTERNAL_TASK_DETAIL_MAX} placeholder={W.detailPlaceholder} error={errors.detail}
            onChange={(event) => { setDetail(event.target.value); setErrors((e) => ({ ...e, detail: undefined })); }} />
          <Select id="new-task-assignee" label={W.assignee} required value={chosen} options={people} error={errors.assignee}
            onValueChange={(value) => { setAssignee(value); setErrors((e) => ({ ...e, assignee: undefined })); }} />
          <DatePicker id="new-task-due" label={W.due} required value={dueOn} minDate={generatedOn || undefined} error={errors.due}
            onChange={(iso) => { setDue(iso); setErrors((e) => ({ ...e, due: undefined })); }} />
          {failed ? <span role="alert" className="text-meta text-c-err-fg" data-testid="new-task-error">{failed}</span> : null}
        </form>
      </Modal>
    </>
  );
}

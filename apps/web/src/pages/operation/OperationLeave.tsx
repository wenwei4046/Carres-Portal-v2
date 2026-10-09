import { useState } from "react";
import {
  LEAVE_PROOF_BUCKET,
  LEAVE_PROOF_MAX_BYTES,
  LEAVE_PROOF_MAX_FILES,
  LEAVE_TYPES,
  leaveCancelAction,
  leaveLastDay,
  leaveState,
  leaveTypeLabel,
  staffLeaveRecordForInput,
  staffLeaveSubmitInput,
  type LeaveRecorderView,
  type LeaveType,
  type StaffLeaveRow,
} from "@carres/shared/workspace-leave";
import ModuleHeader from "./components/ModuleHeader";
import Block from "@/components/kit/Block";
import Button from "@/components/kit/Button";
import DatePicker from "@/components/kit/DatePicker";
import { FieldError } from "@/components/kit/FieldFrame";
import Input from "@/components/kit/Input";
import Loading from "@/components/kit/Loading";
import Select from "@/components/kit/Select";
import EvidenceUploadField, { type EvidenceEntry } from "@/components/EvidenceUploadField";
import { fmtDate } from "@/lib/fmt-date";
import {
  leaveRefusalSentence,
  openLeaveProof,
  signLeaveProof,
  useCancelLeave,
  useLeaveRecorder,
  useMyLeave,
  useRecordLeaveFor,
  useSubmitLeave,
} from "@/lib/leave-queries";

/**
 * Workspace → Leave — ONE entry for MC, Emergency leave and Planned leave
 * (migration 0670; owner rules 9 Oct 2026, `Carres Settings List.md` WS-11;
 * docs/workspace/MASTER.md §4.4 "One leave entry"). No standalone MC Report.
 *
 * Record leave (owner flow 9 Oct 2026): the person defaults to me; the owner or
 * a named Staff & Duties editor may choose a colleague who cannot log in, and
 * the record keeps who recorded it (0680). No type needs approval. MC proof is optional (owner rule 9 Oct 2026),
 * Emergency leave a short reason, Planned leave an optional note. Today's leave
 * starts cover at once and future leave on its own day — the database decides
 * who covers; this page never names a colleague or promises one.
 */

const PHOTO_MIMES = ["image/jpeg", "image/png", "image/webp"] as const;
const PDF_MIMES = ["application/pdf"] as const;

function dateRange(from: string, until: string | null): string {
  if (!until || until === from) return fmtDate(from);
  return `${fmtDate(from)} to ${fmtDate(until)}`;
}

const ME = "me";

function SubmitLeave({ policyNeedsApproval, recorder }: { policyNeedsApproval: boolean; recorder: LeaveRecorderView | undefined }) {
  const submitOwn = useSubmitLeave();
  const recordFor = useRecordLeaveFor();
  const [person, setPerson] = useState<string>(ME);
  const colleague = person === ME ? null : recorder?.people.find((p) => p.id === person) ?? null;
  const submit = colleague ? recordFor : submitOwn;
  const [type, setType] = useState<LeaveType | "">("");
  const [from, setFrom] = useState<string | null>(null);
  const [until, setUntil] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const [proofs, setProofs] = useState<EvidenceEntry[]>([]);
  const [proofKey, setProofKey] = useState(0);
  const [problem, setProblem] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const [doneFor, setDoneFor] = useState<string | null>(null);

  function reset() {
    setType(""); setFrom(null); setUntil(null); setReason(""); setNote(""); setProofs([]);
    setProofKey((k) => k + 1); setPerson(ME);
  }

  function send() {
    if (submit.isPending) return;
    setProblem(null);
    setDone(false);
    if (!type) return setProblem("Choose a type.");
    if (!from || !until) return setProblem("Choose the dates.");
    if (until < from) return setProblem("Until must be on or after From.");
    if (type === "emergency" && !/\S/.test(reason)) return setProblem("Write the reason.");
    const input = {
      type,
      startsOn: from,
      endsOn: until,
      ...(type === "emergency" ? { reason: reason.trim() } : {}),
      ...(type !== "emergency" && /\S/.test(note) ? { note: note.trim() } : {}),
      ...(type === "mc" && proofs.length > 0 ? { proofPaths: proofs.map((p) => p.path) } : {}),
    };
    if (colleague) {
      const { proofPaths: _none, ...forInput } = input as typeof input & { proofPaths?: string[] };
      const parsedFor = staffLeaveRecordForInput.safeParse({ ...forInput, userId: colleague.id });
      if (!parsedFor.success) return setProblem("Choose valid leave dates.");
      const name = colleague.name;
      recordFor.mutate(parsedFor.data, {
        onSuccess: () => { reset(); setDoneFor(name); setDone(true); },
      });
      return;
    }
    const parsed = staffLeaveSubmitInput.safeParse(input);
    if (!parsed.success) return setProblem("Choose valid leave dates.");
    submitOwn.mutate(parsed.data, {
      onSuccess: () => { reset(); setDoneFor(null); setDone(true); },
    });
  }

  const error = problem ?? (submit.error ? leaveRefusalSentence("submit", submit.error, colleague?.name) : null);

  return (
    <form
      /* The governed sentences guide, never the browser's own bubble. */
      noValidate
      className="flex flex-col gap-3"
      data-testid="leave-form"
      onSubmit={(event) => { event.preventDefault(); send(); }}
    >
      {recorder?.canRecordForOthers ? (
        <div className="max-w-[320px]">
          <Select
            id="leave-person"
            label="Leave for"
            value={person}
            onValueChange={(v) => { setPerson(v); setProblem(null); setDone(false); }}
            options={[{ value: ME, label: "Me" }, ...recorder.people.map((p) => ({ value: p.id, label: p.name }))]}
          />
        </div>
      ) : null}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Select
          id="leave-type"
          label="Type"
          required
          placeholder="Type"
          value={type || undefined}
          onValueChange={(v) => { setType(v as LeaveType); setProblem(null); setDone(false); }}
          options={LEAVE_TYPES.map((t) => ({ value: t.key, label: t.label }))}
        />
        <DatePicker id="leave-from" label="From" required value={from} onChange={setFrom} placeholder="From" />
        <DatePicker id="leave-until" label="Until" required value={until} minDate={from ?? undefined} onChange={setUntil} placeholder="Until" />
      </div>
      {type === "mc" && !colleague ? (
        <div className="flex flex-col gap-1">
          <p className="text-meta text-c-secondary">MC proof (optional)</p>
          <EvidenceUploadField
            key={proofKey}
            entries={proofs}
            onChange={setProofs}
            sign={signLeaveProof}
            bucket={LEAVE_PROOF_BUCKET}
            imageMimes={PHOTO_MIMES}
            videoMimes={[]}
            pdfMimes={PDF_MIMES}
            imageMaxBytes={LEAVE_PROOF_MAX_BYTES}
            pdfMaxBytes={LEAVE_PROOF_MAX_BYTES}
            videoMaxBytes={0}
            maxFiles={LEAVE_PROOF_MAX_FILES}
            ariaLabel="MC proof"
            disabled={submit.isPending}
            testId="leave-proof"
          />
        </div>
      ) : null}
      {type === "emergency" ? (
        <Input id="leave-reason" label="Reason" required maxLength={200} value={reason} onChange={(e) => setReason(e.target.value)} />
      ) : null}
      {type === "planned" || type === "mc" ? (
        <Input id="leave-note" label="Note" maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} />
      ) : null}
      {error ? <FieldError testId="leave-form-error">{error}</FieldError> : null}
      {done ? <p role="status" className="text-body text-c-ink">{doneFor ? `Leave recorded for ${doneFor}.` : "Leave recorded."}</p> : null}
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" variant="primary" loading={submit.isPending}>Submit</Button>
        {!policyNeedsApproval ? <span className="text-meta text-c-secondary">No approval needed.</span> : null}
      </div>
    </form>
  );
}

function LeaveRow({ row, today }: { row: StaffLeaveRow; today: string }) {
  const cancel = useCancelLeave();
  const [asking, setAsking] = useState(false);
  const action = leaveCancelAction(row, today);
  const state = leaveState(row, today);
  const last = leaveLastDay(row);
  return (
    <li data-testid={`leave-${row.id}`} className="flex flex-col gap-1 py-2">
      <p className="text-body text-c-ink">{leaveTypeLabel(row.leave_type)}</p>
      <p className="text-meta text-c-secondary">
        {state === "cancelled"
          ? `${dateRange(row.starts_on, row.ends_on)} · Cancelled`
          : row.cancelled_from
            ? `${dateRange(row.starts_on, last)} · Cancelled from ${fmtDate(row.cancelled_from)}`
            : dateRange(row.starts_on, row.ends_on)}
      </p>
      {(row.reason ?? row.note) ? <p className="text-meta text-c-secondary">{row.reason ?? row.note}</p> : null}
      {row.recorded_by_name ? <p className="text-meta text-c-secondary">Recorded by {row.recorded_by_name}</p> : null}
      {row.proof_paths.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {row.proof_paths.map((path, i) => (
            <Button key={path} size="sm" variant="ghost" onClick={() => void openLeaveProof(path)}>
              {row.proof_paths.length > 1 ? `View proof ${i + 1}` : "View proof"}
            </Button>
          ))}
        </div>
      ) : null}
      {action && !asking ? (
        <div>
          <Button size="sm" onClick={() => { cancel.reset(); setAsking(true); }}>
            {action === "whole" ? "Cancel leave" : "Cancel remaining days"}
          </Button>
        </div>
      ) : null}
      {action && asking ? (
        <div className="flex flex-wrap items-center gap-2" data-testid="leave-cancel-confirm">
          <span className="text-body text-c-ink">
            {action === "whole" ? "Cancel this leave?" : "Cancel the days after today?"}
          </span>
          <Button size="sm" variant="primary" loading={cancel.isPending}
            onClick={() => cancel.mutate(row.id, { onSuccess: () => setAsking(false) })}>
            {action === "whole" ? "Cancel leave" : "Cancel remaining days"}
          </Button>
          <Button size="sm" disabled={cancel.isPending} onClick={() => setAsking(false)}>Keep leave</Button>
        </div>
      ) : null}
      {cancel.error ? <FieldError>{leaveRefusalSentence("cancel", cancel.error)}</FieldError> : null}
    </li>
  );
}

/** A leave I recorded for a colleague: the person, type, dates, and — while
 *  days remain — the same Cancel as my own leave (the door allows the recorder). */
function RecordedForRow({ row, today }: { row: LeaveRecorderView["recorded"][number]; today: string }) {
  const cancel = useCancelLeave();
  const [asking, setAsking] = useState(false);
  const asLeave = { starts_on: row.starts_on, ends_on: row.ends_on, cancelled_from: row.cancelled_from } as StaffLeaveRow;
  const action = leaveCancelAction(asLeave, today);
  const state = leaveState(asLeave, today);
  const last = leaveLastDay(asLeave);
  return (
    <li data-testid={`leave-for-${row.id}`} className="flex flex-col gap-1 py-2">
      <p className="text-body text-c-ink">{row.name} · {leaveTypeLabel(row.leave_type)}</p>
      <p className="text-meta text-c-secondary">
        {state === "cancelled"
          ? `${dateRange(row.starts_on, row.ends_on)} · Cancelled`
          : row.cancelled_from
            ? `${dateRange(row.starts_on, last)} · Cancelled from ${fmtDate(row.cancelled_from)}`
            : dateRange(row.starts_on, row.ends_on)}
      </p>
      {action && !asking ? (
        <div><Button size="sm" onClick={() => { cancel.reset(); setAsking(true); }}>
          {action === "whole" ? "Cancel leave" : "Cancel remaining days"}
        </Button></div>
      ) : null}
      {action && asking ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-body text-c-ink">{action === "whole" ? "Cancel this leave?" : "Cancel the days after today?"}</span>
          <Button size="sm" variant="primary" loading={cancel.isPending}
            onClick={() => cancel.mutate(row.id, { onSuccess: () => setAsking(false) })}>
            {action === "whole" ? "Cancel leave" : "Cancel remaining days"}
          </Button>
          <Button size="sm" disabled={cancel.isPending} onClick={() => setAsking(false)}>Keep leave</Button>
        </div>
      ) : null}
      {cancel.error ? <FieldError>{leaveRefusalSentence("cancel", cancel.error)}</FieldError> : null}
    </li>
  );
}

export default function OperationLeave() {
  const q = useMyLeave();
  const recorder = useLeaveRecorder();
  const data = q.data;
  const upcoming = data?.leave.filter((r) => ["upcoming", "current"].includes(leaveState(r, data.today))) ?? [];
  const past = data?.leave.filter((r) => ["past", "cancelled"].includes(leaveState(r, data.today))) ?? [];
  const needsApproval = data?.policies.some((p) => p.approval_required) ?? false;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <ModuleHeader testId="leave-header" word="Leave" docTitle="Leave · Carres" destinationHeader />
      <div className="min-h-0 flex-1 overflow-y-auto bg-white px-4 py-4 sm:px-6" data-testid="leave-page">
        {q.isPending ? (
          <Loading variant="skeleton" lines={6} label="Opening Leave…" />
        ) : !data && (q.error as { status?: number } | null)?.status === 503 ? (
          <p role="status" className="text-body text-c-secondary" data-testid="leave-not-installed">
            Leave is not switched on yet.
          </p>
        ) : !data ? (
          <div role="alert" className="flex flex-col items-start gap-3">
            <p className="text-body text-c-ink">Leave could not be opened.</p>
            <Button onClick={() => void q.refetch()}>Try again</Button>
          </div>
        ) : (
          <div className="flex max-w-[760px] flex-col gap-4">
            {q.isError ? (
              <div role="alert" className="flex flex-wrap items-center gap-3">
                <p className="text-meta text-c-secondary">Leave could not be opened.</p>
                <Button onClick={() => void q.refetch()}>Try again</Button>
              </div>
            ) : null}
            <Block title="Record leave" subtitle="MC, Emergency leave or Planned leave. It counts at once; no approval.">
              {data.canSubmit
                ? <SubmitLeave policyNeedsApproval={needsApproval} recorder={recorder.data} />
                : <p className="text-body text-c-secondary">Only active staff can record leave.</p>}
            </Block>
            {recorder.data?.canRecordForOthers && recorder.data.recorded.length > 0 ? (
              <Block title="Leave I recorded for colleagues">
                <ul className="divide-y divide-c-card-border" data-testid="leave-recorded-for-others">
                  {recorder.data.recorded.map((r) => (
                    <RecordedForRow key={r.id} row={r} today={data.today} />
                  ))}
                </ul>
              </Block>
            ) : null}
            <Block title="My leave">
              {data.leave.length === 0 ? (
                <p className="text-body text-c-secondary">No leave recorded.</p>
              ) : (
                <div className="flex flex-col gap-3">
                  {upcoming.length > 0 ? (
                    <section aria-label="Upcoming">
                      <p className="text-meta font-medium text-c-secondary">Upcoming</p>
                      <ul className="divide-y divide-c-card-border">{upcoming.slice().reverse().map((r) => <LeaveRow key={r.id} row={r} today={data.today} />)}</ul>
                    </section>
                  ) : null}
                  {past.length > 0 ? (
                    <section aria-label="Past">
                      <p className="text-meta font-medium text-c-secondary">Past</p>
                      <ul className="divide-y divide-c-card-border">{past.map((r) => <LeaveRow key={r.id} row={r} today={data.today} />)}</ul>
                    </section>
                  ) : null}
                </div>
              )}
            </Block>
          </div>
        )}
      </div>
    </div>
  );
}

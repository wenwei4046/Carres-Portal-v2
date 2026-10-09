import { useState } from "react";
import { leaveTypeLabel } from "@carres/shared/workspace-leave";
import { saturdayOnCallWindowSchema, type SaturdayOnCallDay } from "@carres/shared/workspace-saturday-on-call";
import { clockWordOf } from "@carres/shared/purchasing-settings";
import Button from "@/components/kit/Button";
import { FieldError } from "@/components/kit/FieldFrame";
import Input from "@/components/kit/Input";
import Loading from "@/components/kit/Loading";
import SectionHeader from "@/components/kit/SectionHeader";
import Select from "@/components/kit/Select";
import { fmtDate } from "@/lib/fmt-date";
import { useMyLeave, useTeamLeave } from "@/lib/leave-queries";
import {
  saturdayOnCallRefusalSentence,
  useSaturdayOnCall,
  useSaveSaturdayOnCallWindow,
  useSetSaturdayOnCall,
} from "@/lib/saturday-on-call-queries";

/**
 * Three small Staff & Duties sections beside the duty facts (owner rules
 * 9 Oct 2026; Settings List WS-11, WS-12, "Leave approval policy"):
 *
 *   On leave          who is away today and in the next 7 days — names and
 *                     dates only (never the type or reason).
 *   Saturday on-call  the contact-coverage window and the dated rota. NOT a
 *                     Duty: it moves no routine Task. A person on leave that
 *                     Saturday is flagged, never replaced.
 *   Leave approval    the stored policy, read-only: no type needs approval.
 *
 * Each section is closed until clicked and says its current answer on its
 * header, so the duty catalogue keeps the page.
 */

const NONE = "none";

function range(from: string, until: string): string {
  return from === until ? fmtDate(from) : `${fmtDate(from)} to ${fmtDate(until)}`;
}

function TeamLeave() {
  const [open, setOpen] = useState(false);
  const q = useTeamLeave(7);
  const people = q.data?.people ?? [];
  const meta = q.isPending ? null : q.data ? (people.length === 0 ? "Nobody" : people.length === 1 ? "1 person" : `${people.length} people`) : null;
  return (
    <section data-testid="team-leave">
      <SectionHeader title="On leave" meta={meta} collapsible open={open} onToggle={() => setOpen((v) => !v)} />
      {open ? (
        <div className="px-4 pb-3">
          {q.isPending ? <Loading variant="skeleton" lines={2} label="Opening Staff & Duties…" />
            : !q.data ? (
              <div role="alert" className="flex flex-wrap items-center gap-3">
                <p className="text-body text-c-ink">Leave could not be opened.</p>
                <Button onClick={() => void q.refetch()}>Try again</Button>
              </div>
            ) : people.length === 0 ? (
              <p className="text-body text-c-secondary">Nobody is on leave in the next 7 days.</p>
            ) : (
              <ul className="flex flex-col gap-1">
                {people.map((p) => (
                  <li key={`${p.userId}-${p.startsOn}`} className="flex flex-wrap gap-x-3">
                    <span className="text-body text-c-ink">{p.name}</span>
                    <span className="text-meta text-c-secondary">{range(p.startsOn, p.endsOn)}</span>
                  </li>
                ))}
              </ul>
            )}
        </div>
      ) : null}
    </section>
  );
}

function LeavePolicy() {
  const [open, setOpen] = useState(false);
  const q = useMyLeave();
  const policies = q.data?.policies ?? [];
  const anyApproval = policies.some((p) => p.approval_required);
  return (
    <section data-testid="leave-policy">
      <SectionHeader title="Leave approval" meta={q.data ? (anyApproval ? null : "No approval needed") : null}
        collapsible open={open} onToggle={() => setOpen((v) => !v)} />
      {open ? (
        <div className="px-4 pb-3">
          {q.isPending ? <Loading variant="skeleton" lines={2} label="Opening Staff & Duties…" />
            : !q.data ? (
              <div role="alert" className="flex flex-wrap items-center gap-3">
                <p className="text-body text-c-ink">Leave could not be opened.</p>
                <Button onClick={() => void q.refetch()}>Try again</Button>
              </div>
            ) : (
              <ul className="flex flex-col gap-1">
                {(["mc", "emergency", "planned"] as const).map((key) => {
                  const p = policies.find((x) => x.leave_type === key);
                  if (!p) return null;
                  const facts = [
                    p.approval_required ? "Approval needed" : "No approval needed",
                    ...(p.proof_required ? ["Proof needed"] : []),
                    ...(p.reason_required ? ["Reason needed"] : []),
                  ];
                  return (
                    <li key={key} className="flex flex-wrap gap-x-3">
                      <span className="w-36 shrink-0 text-body text-c-ink">{leaveTypeLabel(key)}</span>
                      <span className="text-meta text-c-secondary">{facts.join(" · ")}</span>
                    </li>
                  );
                })}
              </ul>
            )}
        </div>
      ) : null}
    </section>
  );
}

function WindowEditor({ startsAt, endsAt, revision, onDone }: { startsAt: string; endsAt: string; revision: number; onDone: () => void }) {
  const [from, setFrom] = useState(startsAt);
  const [to, setTo] = useState(endsAt);
  const [problem, setProblem] = useState<string | null>(null);
  const save = useSaveSaturdayOnCallWindow();
  const error = problem ?? (save.error ? saturdayOnCallRefusalSentence(save.error) : null);
  return (
    <form noValidate className="mt-2 flex flex-col gap-2" data-testid="on-call-window-form" onSubmit={(e) => {
      e.preventDefault();
      setProblem(null);
      if (!saturdayOnCallWindowSchema.safeParse({ startsAt: from, endsAt: to }).success) return setProblem("Ends must be after Starts.");
      save.mutate({ startsAt: from, endsAt: to, revision }, { onSuccess: onDone });
    }}>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Input id="on-call-starts" label="Starts" type="time" required value={from} disabled={save.isPending} onChange={(e) => setFrom(e.target.value)} />
        <Input id="on-call-ends" label="Ends" type="time" required value={to} disabled={save.isPending} onChange={(e) => setTo(e.target.value)} />
      </div>
      {error ? <FieldError>{error}</FieldError> : null}
      <div className="flex flex-wrap gap-3">
        <Button type="submit" variant="primary" loading={save.isPending}>Save</Button>
        <Button disabled={save.isPending} onClick={onDone}>Cancel</Button>
      </div>
    </form>
  );
}

function DayEditor({ day, people, onDone }: { day: SaturdayOnCallDay; people: Array<{ id: string; name: string }>; onDone: () => void }) {
  const [person, setPerson] = useState(day.personId ?? NONE);
  const [cover, setCover] = useState(day.coverPersonId ?? NONE);
  const [problem, setProblem] = useState<string | null>(null);
  const set = useSetSaturdayOnCall();
  const nameOf = (id: string) => people.find((p) => p.id === id)?.name ?? "This person";
  const error = problem ?? (set.error ? saturdayOnCallRefusalSentence(set.error, nameOf(person)) : null);
  return (
    <form noValidate className="mt-2 flex flex-col gap-2" data-testid={`on-call-form-${day.saturday}`} onSubmit={(e) => {
      e.preventDefault();
      setProblem(null);
      if (cover !== NONE && person === NONE) return setProblem("Choose a person.");
      if (cover !== NONE && cover === person) return setProblem("Choose another person for Cover.");
      set.mutate({
        saturday: day.saturday,
        personId: person === NONE ? null : person,
        coverPersonId: cover === NONE ? null : cover,
      }, { onSuccess: onDone });
    }}>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Select id={`on-call-person-${day.saturday}`} label="On call" value={person} onValueChange={setPerson}
          placeholder="On call"
          options={[{ value: NONE, label: "Not assigned" }, ...people.map((p) => ({ value: p.id, label: p.name }))]} />
        <Select id={`on-call-cover-${day.saturday}`} label="Cover" value={cover} onValueChange={setCover}
          placeholder="Cover"
          options={[{ value: NONE, label: "No cover" }, ...people.map((p) => ({ value: p.id, label: p.name }))]} />
      </div>
      {error ? <FieldError>{error}</FieldError> : null}
      <div className="flex flex-wrap gap-3">
        <Button type="submit" variant="primary" loading={set.isPending}>Save</Button>
        <Button disabled={set.isPending} onClick={onDone}>Cancel</Button>
      </div>
    </form>
  );
}

function SaturdayOnCall() {
  const [open, setOpen] = useState(false);
  const [editingWindow, setEditingWindow] = useState(false);
  const [editingDay, setEditingDay] = useState<string | null>(null);
  const q = useSaturdayOnCall(6);
  const data = q.data;
  const time = data ? `${clockWordOf(data.window.startsAt)} to ${clockWordOf(data.window.endsAt)}` : null;
  const first = data?.saturdays[0];
  const meta = data && first ? `${first.personName ?? "Not assigned"} · ${time}` : null;
  return (
    <section data-testid="saturday-on-call">
      <SectionHeader title="Saturday on-call" meta={meta} collapsible open={open} onToggle={() => setOpen((v) => !v)} />
      {open ? (
        <div className="flex flex-col gap-2 px-4 pb-3">
          {q.isPending ? <Loading variant="skeleton" lines={3} label="Opening Staff & Duties…" />
            : !data ? (
              <div role="alert" className="flex flex-wrap items-center gap-3">
                <p className="text-body text-c-ink">Saturday on-call could not be opened.</p>
                <Button onClick={() => void q.refetch()}>Try again</Button>
              </div>
            ) : (
              <>
                <p className="text-meta text-c-secondary">
                  Answers customer, driver and warehouse calls and WhatsApp. Not an Office workday. Routine work does not move.
                </p>
                <div className="flex flex-wrap items-baseline gap-x-3">
                  <span className="w-28 shrink-0 text-label text-kit-slate-9">Time</span>
                  <span className="text-body text-c-ink" data-testid="on-call-time">{time}</span>
                  {data.canEdit && !editingWindow ? <Button size="sm" variant="ghost" onClick={() => setEditingWindow(true)}>Edit time</Button> : null}
                </div>
                {data.canEdit && editingWindow ? (
                  <WindowEditor startsAt={data.window.startsAt} endsAt={data.window.endsAt} revision={data.window.revision}
                    onDone={() => setEditingWindow(false)} />
                ) : null}
                <ul className="flex flex-col divide-y divide-c-card-border">
                  {data.saturdays.map((day) => (
                    <li key={day.saturday} className="py-1.5" data-testid={`on-call-${day.saturday}`}>
                      <div className="flex flex-wrap items-baseline gap-x-3">
                        <span className="w-28 shrink-0 text-label text-kit-slate-9">{fmtDate(day.saturday)}</span>
                        <span className="text-body text-c-ink">{day.personName ?? "Not assigned"}</span>
                        {day.personOnLeave ? <span className="text-meta text-c-warn-fg">On leave</span> : null}
                        {data.canEdit && editingDay !== day.saturday
                          ? <Button size="sm" variant="ghost" onClick={() => setEditingDay(day.saturday)}>Assign</Button> : null}
                      </div>
                      {day.coverName ? (
                        <div className="flex flex-wrap items-baseline gap-x-3">
                          <span className="w-28 shrink-0" />
                          <span className="text-meta text-c-secondary">Cover {day.coverName}</span>
                          {day.coverOnLeave ? <span className="text-meta text-c-warn-fg">On leave</span> : null}
                        </div>
                      ) : null}
                      {data.canEdit && editingDay === day.saturday
                        ? <DayEditor day={day} people={data.people} onDone={() => setEditingDay(null)} /> : null}
                    </li>
                  ))}
                </ul>
              </>
            )}
        </div>
      ) : null}
    </section>
  );
}

export default function LeaveAndOnCall() {
  return (
    <div data-testid="staff-leave-and-on-call" className="flex flex-col border-b border-kit-slate-5 px-2">
      <TeamLeave />
      <SaturdayOnCall />
      <LeavePolicy />
    </div>
  );
}

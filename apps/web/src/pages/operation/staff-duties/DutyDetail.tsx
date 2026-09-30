import { useRef, useState, type ReactNode } from "react";
import Button from "@/components/kit/Button";
import DropdownMenu from "@/components/kit/DropdownMenu";
import SectionHeader from "@/components/kit/SectionHeader";
import AssignHolderForm from "./AssignHolderForm";
import { currentDutyPerson, shownCoverOf } from "./staff-duties-model";
import { apiFetch } from "@/lib/api";
import { fmtDate } from "@/lib/fmt-date";
import { personInitials } from "@/lib/staff-avatar";
import { qk, useOperationStaff, useWorkspaceAssignmentHistory } from "@/lib/queries";
import type { WorkspaceDutiesResponse } from "@/lib/queries";
import type { OpsStaffListResponse } from "@carres/shared";

/**
 * The selected duty (workspace/MASTER.md §4.2, §4.5).
 *
 * One current assignment, its dates, the next effective assignment and
 * collapsed immutable history. Internal source identities never become
 * competing labels for staff.
 *
 * Avatar initials carry the full name for a reader and never replace the
 * printed name.
 */

type Duty = WorkspaceDutiesResponse["duties"][number];

function Person({ name, testId }: { name: string; testId: string }) {
  return (
    <span className="inline-flex items-center gap-2">
      <span
        role="img"
        aria-label={name}
        data-testid={testId}
        className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-kit-slate-3 text-label font-medium text-kit-slate-11"
      >
        {personInitials(name, "")}
      </span>
      <span className="text-body text-kit-slate-12">{name}</span>
    </span>
  );
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 py-1">
      <span className="w-28 shrink-0 text-label text-kit-slate-9">{label}</span>
      <span className="min-w-0 break-words">{children}</span>
    </div>
  );
}

export default function DutyDetail({
  duty,
  canAssign,
  today,
  onBack,
}: {
  duty: Duty;
  canAssign: boolean;
  today: string;
  /** Absent when no duty was explicitly chosen: below 1024px the catalogue is
   *  what shows, so there is nothing to go back FROM. A door to a page the
   *  reader is already on is not a door. */
  onBack?: () => void;
}) {
  /** Which focused act is open. One at a time: two overlapping dialogs would
   *  be two answers to the same duty. */
  const menuTrigger = useRef<HTMLButtonElement>(null);
  const [acting, setActing] = useState<"assign" | null>(null);
  /* Bumped on every open so a form arrives EMPTY rather than wearing the last
     attempt's answers. Clearing fields by hand instead would flip the kit
     Select between controlled and uncontrolled. */
  const [actingSeq, setActingSeq] = useState(0);
  /** The governed success sentence, announced after the refreshed read. */
  const [notice, setNotice] = useState<string | null>(null);

  /* The pickers offer whatever THIS duty's list returned. A duty the shared
     catalogue scopes to a role (Finance Approver) gets that role's accounts
     from the API; every other duty gets the operation list. No name is
     chosen, filtered or excluded here. */
  const staffQ = useOperationStaff({
    queryKey: [...qk.operation.staff, duty.key],
    queryFn: () =>
      apiFetch<OpsStaffListResponse>(
        `/api/operation/staff?duty=${encodeURIComponent(duty.key)}`,
      ),
    enabled: canAssign,
  });
  const staff = staffQ.data?.staff ?? [];
  const r = duty.resolution;
  const person = currentDutyPerson(duty);
  /** The cover the detail describes — the resolver's own row by id, today's
   *  or the next scheduled one. Never the first row whose dates match. */
  const shownCover = shownCoverOf(duty);
  /** The assignment that is in force — the newest one that has begun. */
  const activeAssignment =
    duty.assignments.find(
      (a) =>
        a.effective_from <= today &&
        (!a.effective_until || a.effective_until >= today),
    ) ?? null;

  return (
    <>
      {onBack ? (
        <button
          type="button"
          onClick={onBack}
          className="mb-2 inline-flex items-center rounded-control px-2 py-1 text-meta font-medium text-kit-slate-11 hover:text-kit-slate-12 lg:hidden"
        >
          Back to duties
        </button>
      ) : null}

      <section data-testid={`selected-duty-${duty.key}`}>
        <div className="flex items-center justify-between gap-3"><h2 className="text-strong text-kit-slate-12">{duty.label}</h2>
          {canAssign ? <DropdownMenu label="More actions" trigger={<Button ref={menuTrigger} variant="ghost" size="touch" icon="overflow" aria-label="More actions" />}
                items={[{ key: "assign", label: "Assign", onSelect: () => { menuTrigger.current?.focus(); setActingSeq(n => n + 1); setActing("assign"); } }]} /> : null}
        </div>
        <div className="mt-2">
          {person ? <Fact label="Assigned to"><Person name={person.name} testId="duty-avatar-current" /></Fact> : <p className="text-body">Not assigned</p>}
          {r.assignment_outcome === "no_candidate" ? <p role="alert" className="mt-2 text-meta text-kit-red-11">{duty.label} could not be updated. Try again.</p> : null}
          {r.source !== "system_assignment" && activeAssignment && !r.is_cover ? <p className="text-meta text-kit-slate-11">{activeAssignment.effective_until ? `${fmtDate(activeAssignment.effective_from)} to ${fmtDate(activeAssignment.effective_until)}` : `from ${fmtDate(activeAssignment.effective_from)}`}</p> : null}
          {r.source !== "system_assignment" && r.is_cover && shownCover ? <p className="text-meta text-kit-slate-11">{fmtDate(shownCover.starts_on)} to {fmtDate(shownCover.ends_on)}</p> : null}
        </div>
        {(() => {
          const next = duty.assignments.find(a => a.id === duty.next_assignment_id);
          const future = duty.covers.find(c => c.id === duty.scheduled_cover_id && c.starts_on > today);
          if (!next && !future) return null;
          return <div className="mt-4"><SectionHeader title="Next" />
            {next ? <p className="text-body">Assigned to {next.holder_name ?? "Name not recorded"}<br />{fmtDate(next.effective_from)}{next.effective_until ? ` to ${fmtDate(next.effective_until)}` : ""}</p> : null}
            {future ? <p className="text-body">Assigned to {future.acting_user_name ?? "Name not recorded"}<br />{fmtDate(future.starts_on)} to {fmtDate(future.ends_on)}</p> : null}
          </div>;
        })()}

        {canAssign ? (
          <>
            {notice ? (
              <p
                role="status"
                data-testid="duty-notice"
                className="mt-2 text-meta text-kit-slate-11"
              >
                {notice}
              </p>
            ) : null}
            <AssignHolderForm
              key={`assign-${duty.key}-${actingSeq}`}
              duty={duty}
              staff={staff}
              returnFocusRef={menuTrigger}
              staffLoading={staffQ.isLoading}
              staffError={staffQ.isError}
              retryStaff={() => void staffQ.refetch()}
              open={acting === "assign"}
              onClose={() => setActing(null)}
              onDone={setNotice}
            />

          </>
        ) : (
          /* §4.5: a reader gets the sentence, never a disabled control — an
             imitation of a capability is worse than its absence. */
null
        )}
      </section>
    </>
  );
}

/**
 * One immutable history — assignments then covers, newest first (the API
 * already orders both).
 *
 * It uses the governed three-rank record grammar: the EVENT first, then who
 * did it and when, then the note or reason. Not a dot-separated database
 * sentence, not a raw ISO date, not a dash standing in for a fact nobody
 * recorded — and no edit or delete anywhere, because an assignment that was
 * true on a day stays true for that day forever (§3, §4.3).
 */
function Record({
  testId,
  event,
  actor,
  note,
}: {
  testId: string;
  event: string;
  actor: string[];
  note: string | null;
}) {
  return (
    <li data-testid={testId} className="py-1">
      <p data-testid="record-event" className="text-body text-kit-slate-12">
        {event}
      </p>
      <p
        data-testid="record-actor"
        className="flex flex-wrap gap-x-3 text-meta text-kit-slate-11"
      >
        {actor.map((part) => (
          <span key={part}>{part}</span>
        ))}
      </p>
      {note ? (
        <p data-testid="record-note" className="text-meta text-kit-slate-9">
          {note}
        </p>
      ) : null}
    </li>
  );
}

export function DutyHistory({ duty }: { duty: Duty }) {
  const [open, setOpen] = useState(false);
  const changes = useWorkspaceAssignmentHistory(duty.key, open);
  return (
    <section
      data-testid={`duty-history-${duty.key}`}
      className="mt-4 border-t border-kit-slate-5 pt-3"
    >
      <SectionHeader title="History" collapsible open={open} onToggle={() => setOpen(value => !value)} />
      {open ? <>
      {changes.isLoading ? <p className="text-meta">Loading</p> : changes.isError ? <div role="alert"><p>Staff &amp; Duties could not be opened</p><Button onClick={() => void changes.refetch()}>Try again</Button></div> : null}
      <ul>{changes.data?.pages.flatMap(page => page.records).map(record => <Record key={`system-${record.id}`} testId={`system-assignment-${record.id}`}
        event={record.outcome === "reassigned" ? `Assigned to ${record.to_name ?? "Name not recorded"} by system` : record.outcome === "not_assigned" ? "Not assigned" : `${duty.label} could not be updated. Try again.`}
        actor={[fmtDate(record.recorded_at, { time: true })]}
        note={record.reason === "missing_period_activity" ? `Assignment reason: ${record.from_name ?? "Name not recorded"} was not online by ${fmtDate(record.cutoff_at, { timeOnly: true })}` : null} />)}</ul>
      {changes.hasNextPage ? <Button disabled={changes.isFetchingNextPage} onClick={() => void changes.fetchNextPage()}>Next</Button> : null}
      {duty.assignments.length === 0 ? (
        <p className="mt-1 text-meta text-kit-slate-9">No assignments yet</p>
      ) : (
        <ul className="mt-1">
          {duty.assignments.map((a) => (
            <Record
              key={a.id}
              testId={`assignment-${a.id}`}
              event={`Assigned to ${a.holder_name ?? "Name not recorded"}`}
              actor={[
                fmtDate(a.created_at, { time: true }),
                a.effective_until
                  ? `${fmtDate(a.effective_from)} to ${fmtDate(a.effective_until)}`
                  : `from ${fmtDate(a.effective_from)}`,
                ...(a.assigned_by_name
                  ? [`Assigned by ${a.assigned_by_name}`]
                  : []),
              ]}
              note={a.note}
            />
          ))}
        </ul>
      )}
      {duty.covers.length === 0 ? (
        null
      ) : (
        <ul className="mt-2">
          {duty.covers.map((v) => (
            <Record
              key={v.id}
              testId={`cover-${v.id}`}
              event={`Assigned to ${v.acting_user_name ?? "Name not recorded"}`}
              actor={[
                fmtDate(v.created_at, { time: true }),
                `${fmtDate(v.starts_on)} to ${fmtDate(v.ends_on)}`,
                ...(v.assigned_by_name ? [`Added by ${v.assigned_by_name}`] : []),
              ]}
              note={v.reason}
            />
          ))}
        </ul>
      )}
      </> : null}
    </section>
  );
}

import { useState } from "react";
import Button from "@/components/kit/Button";
import DropdownMenu from "@/components/kit/DropdownMenu";
import SectionHeader from "@/components/kit/SectionHeader";
import AddCoverForm from "./AddCoverForm";
import AssignHolderForm from "./AssignHolderForm";
import { shownCoverOf } from "./staff-duties-model";
import { apiFetch } from "@/lib/api";
import { fmtDate } from "@/lib/fmt-date";
import { personInitials } from "@/lib/staff-avatar";
import { qk, useOperationStaff } from "@/lib/queries";
import type { WorkspaceDutiesResponse } from "@/lib/queries";
import type { OpsStaffListResponse } from "@carres/shared";

/**
 * The selected duty (workspace/MASTER.md §4.2, §4.5).
 *
 * One resolved person and plain dates precede future arrangements.
 * Management actions belong to the overflow menu; history starts collapsed.
 *
 * Avatar initials carry the full name for a reader and never replace the
 * printed name.
 */

type Duty = WorkspaceDutiesResponse["duties"][number];

function Person({ name, testId }: { name: string; testId: string }) {
  return (
    <span className="inline-flex max-w-full items-start gap-2">
      <span
        role="img"
        aria-label={name}
        data-testid={testId}
        className="inline-flex shrink-0 h-6 w-6 items-center justify-center rounded-full bg-kit-slate-3 text-label font-medium text-kit-slate-11"
      >
        {personInitials(name, "")}
      </span>
      <span className="min-w-0 break-words text-body text-kit-slate-12">{name}</span>
    </span>
  );
}

export default function DutyDetail({
  duty,
  canAssign,
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
  const [acting, setActing] = useState<"assign" | "cover" | null>(null);
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
  /** The cover the detail describes — the resolver's own row by id, today's
   *  or the next scheduled one. Never the first row whose dates match. */
  const shownCover = shownCoverOf(duty);
  /** The assignment that is in force — the newest one that has begun. */
  const activeAssignment = duty.assignments.find(a => a.id === duty.current_assignment_id);
  const nextAssignment = duty.assignments.find(a => a.id === duty.next_assignment_id);
  const currentName = (r.is_cover ? r.acting_user_name : r.normal_user_name) ?? "Not assigned";
  const period = (from: string, until: string | null) => until ? `${fmtDate(from)} to ${fmtDate(until)}` : `from ${fmtDate(from)}`;
  const openAct = (act: "assign" | "cover") => { setActingSeq(n => n + 1); setActing(act); };

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
        <div className="flex items-start justify-between gap-3">
          <h2 className="text-strong text-kit-slate-12">{duty.label}</h2>
          {canAssign ? <DropdownMenu
            label="More actions"
            trigger={<Button variant="ghost" size="touch" icon="overflow" aria-label="More actions" />}
            items={[
              { key: "assign", label: "Assign holder", onSelect: () => openAct("assign") },
              ...(r.normal_user_id ? [{ key: "cover", label: "Add cover", onSelect: () => openAct("cover") }] : []),
            ]}
          /> : null}
        </div>
        <div className="mt-2 break-words">
          <Person name={currentName} testId={r.is_cover ? "duty-avatar-acting" : "duty-avatar-normal"} />
          {!r.normal_user_id ? <p className="mt-1 text-meta text-kit-slate-11">Nobody holds {duty.label}.</p> : null}
          {r.is_cover && shownCover ? <p className="mt-1 text-body text-kit-slate-11">{period(shownCover.starts_on, shownCover.ends_on)}</p>
            : activeAssignment ? <p className="mt-1 text-body text-kit-slate-11">{period(activeAssignment.effective_from, activeAssignment.effective_until)}</p> : null}
        </div>
        {!r.is_cover && shownCover ? <div className="mt-4 break-words">
          <h3 className="text-strong text-kit-slate-12">Cover scheduled</h3>
          <p className="mt-1 text-body text-kit-slate-12">{shownCover.acting_user_name ?? "Not recorded"}</p>
          <p className="text-body text-kit-slate-11">{period(shownCover.starts_on, shownCover.ends_on)}</p>
        </div> : null}
        {nextAssignment ? <div className="mt-4 break-words" data-testid="duty-next">
          <h3 className="text-strong text-kit-slate-12">Next</h3>
          <p className="mt-1 text-body text-kit-slate-12">{nextAssignment.holder_name ?? "Not recorded"}</p>
          <p className="text-body text-kit-slate-11">{period(nextAssignment.effective_from, nextAssignment.effective_until)}</p>
        </div> : null}
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
              staffLoading={staffQ.isLoading}
              staffError={staffQ.isError}
              onRetryStaff={() => void staffQ.refetch()}
              open={acting === "assign"}
              onClose={() => setActing(null)}
              onDone={setNotice}
            />
            <AddCoverForm
              key={`cover-${duty.key}-${actingSeq}`}
              duty={duty}
              staff={staff}
              staffLoading={staffQ.isLoading}
              staffError={staffQ.isError}
              onRetryStaff={() => void staffQ.refetch()}
              open={acting === "cover"}
              onClose={() => setActing(null)}
              onDone={setNotice}
            />
          </>
        ) : null}
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
  period,
}: {
  testId: string;
  event: string;
  actor: string[];
  period: string;
  note: string | null;
}) {
  return (
    <li data-testid={testId} className="break-words py-2">
      <p data-testid="record-event" className="text-body font-semibold text-kit-slate-12">
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
      <p data-testid="record-period" className="text-meta text-kit-slate-11">{period}</p>
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
  return (
    <section
      data-testid={`duty-history-${duty.key}`}
      className="mt-4 border-t border-kit-slate-5 pt-3"
    >
      <SectionHeader title="History" collapsible open={open} onToggle={() => setOpen(v => !v)} />
      {open ? <>
      {duty.assignments.length === 0 ? (
        <p className="mt-1 text-meta text-kit-slate-9">No assignments yet</p>
      ) : (
        <ul className="mt-1">
          {duty.assignments.map((a) => (
            <Record
              key={a.id}
              testId={`assignment-${a.id}`}
              event={`${a.holder_name ?? "Not recorded"} holds ${duty.label}`}
              period={a.effective_until
                ? `${fmtDate(a.effective_from)} to ${fmtDate(a.effective_until)}`
                : `from ${fmtDate(a.effective_from)}`}
              actor={[
                fmtDate(a.created_at, { time: true }),
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
        <p className="mt-2 text-meta text-kit-slate-9">No covers yet</p>
      ) : (
        <ul className="mt-2">
          {duty.covers.map((v) => (
            <Record
              key={v.id}
              testId={`cover-${v.id}`}
              event={`${v.acting_user_name ?? "Not recorded"} covering for ${v.normal_user_name ?? "Not recorded"}`}
              period={`${fmtDate(v.starts_on)} to ${fmtDate(v.ends_on)}`}
              actor={[
                fmtDate(v.created_at, { time: true }),
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

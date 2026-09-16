import { useState, type ReactNode } from "react";
import Button from "@/components/kit/Button";
import AssignHolderForm from "./AssignHolderForm";
import { dutyDisplayState } from "./staff-duties-model";
import { apiFetch } from "@/lib/api";
import { fmtDate } from "@/lib/fmt-date";
import { qk, useOperationStaff } from "@/lib/queries";
import type { WorkspaceDutiesResponse } from "@/lib/queries";
import type { OpsStaffListResponse } from "@carres/shared";

/**
 * The selected duty (workspace/MASTER.md §4.2, §4.5).
 *
 * Separate LABELLED facts, never one packed sentence: `Normal owner`,
 * `Acting today`, `Effective`, `Cover`, `Reason`. The acting line appears
 * only when somebody is actually covering — printing the holder twice would
 * invent an absence that nobody recorded.
 *
 * Avatar initials carry the full name for a reader and never replace the
 * printed name.
 */

type Duty = WorkspaceDutiesResponse["duties"][number];

/** `Yu Jun` → `YJ`. One glyph pair, never a third letter. */
export function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  const first = words[0]![0] ?? "";
  const last = words.length > 1 ? (words[words.length - 1]![0] ?? "") : "";
  return `${first}${last}`.toLocaleUpperCase();
}

function Person({ name, testId }: { name: string; testId: string }) {
  return (
    <span className="inline-flex items-center gap-2">
      <span
        role="img"
        aria-label={name}
        data-testid={testId}
        className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-kit-slate-3 text-label font-medium text-kit-slate-11"
      >
        {initialsOf(name)}
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
  const note = dutyDisplayState(duty, today);
  /** The cover the detail describes: the one in force today, else the next
   *  scheduled one. Both come from rows the server returned. */
  const shownCover =
    duty.covers.find(
      (c) => c.starts_on <= today && c.ends_on >= today && r.is_cover,
    ) ??
    duty.covers
      .filter((c) => c.starts_on > today)
      .sort((a, b) => a.starts_on.localeCompare(b.starts_on))[0] ??
    null;
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
        <h2 className="text-title text-kit-slate-12">{duty.label}</h2>

        {!r.normal_user_id ? (
          /* A missing holder is an explicit configuration exception — never a
             silent fallback person (§3, §4.5). */
          <div className="mt-2">
            <p className="text-body font-medium text-kit-slate-12">
              Not assigned
            </p>
            <p className="mt-0.5 text-meta text-kit-slate-11">
              Nobody holds {duty.label}.
            </p>
          </div>
        ) : (
          <div className="mt-2">
            <Fact label="Normal owner">
              <Person name={r.normal_user_name ?? r.normal_user_id} testId="duty-avatar-normal" />
            </Fact>
            {r.is_cover && r.acting_user_id ? (
              <Fact label="Acting today">
                <Person
                  name={r.acting_user_name ?? r.acting_user_id}
                  testId="duty-avatar-acting"
                />
              </Fact>
            ) : null}
            {activeAssignment ? (
              <Fact label="Effective">
                <span className="text-body text-kit-slate-12">
                  {activeAssignment.effective_until
                    ? `${fmtDate(activeAssignment.effective_from)} – ${fmtDate(activeAssignment.effective_until)}`
                    : `from ${fmtDate(activeAssignment.effective_from)}`}
                </span>
              </Fact>
            ) : null}
            {shownCover ? (
              <>
                <Fact label="Cover">
                  <span className="text-body text-kit-slate-12">
                    {`${fmtDate(shownCover.starts_on)} – ${fmtDate(shownCover.ends_on)}`}
                  </span>
                  {note.kind === "cover_scheduled" ? (
                    <span className="ml-2 text-label text-kit-slate-9">
                      {note.word}
                    </span>
                  ) : null}
                </Fact>
                {shownCover.reason ? (
                  <Fact label="Reason">
                    <span className="text-body text-kit-slate-12">
                      {shownCover.reason}
                    </span>
                  </Fact>
                ) : null}
              </>
            ) : null}
          </div>
        )}

        {canAssign ? (
          <>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button
                onClick={() => {
                  setActingSeq((n) => n + 1);
                  setActing("assign");
                }}
              >
                Assign holder
              </Button>
            </div>
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
              open={acting === "assign"}
              onClose={() => setActing(null)}
              onDone={setNotice}
            />
          </>
        ) : (
          /* §4.5: a reader gets the sentence, never a disabled control — an
             imitation of a capability is worse than its absence. */
          <p className="mt-3 text-meta text-kit-slate-9">
            Duty assignments are set by the manager.
          </p>
        )}
      </section>
    </>
  );
}

/**
 * One immutable history — assignments then covers, newest first (the API
 * already orders both). No edit and no delete exist anywhere: an assignment
 * that was true on a day stays true for that day forever (§3, §4.3).
 */
export function DutyHistory({ duty }: { duty: Duty }) {
  return (
    <section
      data-testid={`duty-history-${duty.key}`}
      className="mt-4 border-t border-kit-slate-5 pt-3"
    >
      <h3 className="text-label uppercase tracking-wide text-kit-slate-9">
        Assignment &amp; cover history
      </h3>
      {duty.assignments.length === 0 ? (
        <p className="mt-1 text-meta text-kit-slate-9">No assignments yet</p>
      ) : (
        <ul className="mt-1">
          {duty.assignments.map((a) => (
            <li
              key={a.id}
              data-testid={`assignment-${a.id}`}
              className="flex flex-wrap items-baseline gap-x-2 py-0.5 text-body leading-6"
            >
              <span className="text-kit-slate-12">
                {a.holder_name ?? a.holder_id}
              </span>
              <span className="text-meta text-kit-slate-11">
                {a.effective_until
                  ? `${fmtDate(a.effective_from)} – ${fmtDate(a.effective_until)}`
                  : `from ${fmtDate(a.effective_from)}`}
              </span>
              {a.assigned_by_name ? (
                <span className="text-meta text-kit-slate-9">
                  assigned by {a.assigned_by_name}
                </span>
              ) : null}
              {a.note ? (
                <span className="text-meta text-kit-slate-9">{a.note}</span>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      {duty.covers.length === 0 ? (
        <p className="mt-2 text-meta text-kit-slate-9">No covers yet</p>
      ) : (
        <ul className="mt-2">
          {duty.covers.map((v) => (
            <li
              key={v.id}
              data-testid={`cover-${v.id}`}
              className="flex flex-wrap items-baseline gap-x-2 py-0.5 text-body leading-6"
            >
              <span className="text-kit-slate-12">
                {v.acting_user_name ?? v.acting_user_id} covering for{" "}
                {v.normal_user_name ?? v.normal_user_id}
              </span>
              <span className="text-meta text-kit-slate-11">
                {fmtDate(v.starts_on)} – {fmtDate(v.ends_on)}
              </span>
              {v.reason ? (
                <span className="text-meta text-kit-slate-9">{v.reason}</span>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

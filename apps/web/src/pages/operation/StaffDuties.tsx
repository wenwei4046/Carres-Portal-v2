import { useState, type ReactNode } from "react";
import ModuleHeader from "./components/ModuleHeader";
import { DocSection } from "./components/workspace-doc";
import { appTodayIso, fmtDate } from "@/lib/fmt-date";
import {
  useOperationStaff,
  useWorkspaceAssignDutyMutation,
  useWorkspaceCoverDutyMutation,
  useWorkspaceDuties,
  type WorkspaceDutiesResponse,
} from "@/lib/queries";
import type { OpsStaffMember } from "@carres/shared";

/**
 * `Workspace → Staff & Duties` — the ONE company-wide duty assignment surface
 * (docs/workspace/MASTER.md, LOCKED 2026-09-03; ERP-ARCHITECTURE Global Duty
 * Law). One duty today: GRN Duty. The page shows today's RESOLUTION (primary
 * holder, or the active cover acting for them), lets an authorised manager
 * assign a holder and add a dated buddy cover, and lists the immutable
 * history. Every rule lives in the SQL doors; the page renders the server's
 * `can_assign` fact and never offers a control the server would refuse — a
 * non-manager sees the quiet sentence, not a disabled form.
 */

type Duty = WorkspaceDutiesResponse["duties"][number];

/** The workspace input recipe — same spelling as ReceivingWorkspace's FIELD. */
const FIELD =
  "h-8 rounded-control border border-kit-slate-5 bg-white px-2 text-body text-kit-slate-12 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-kit-blue-9";

/** The one blue primary — exactly one per form block. */
const PRIMARY_BTN =
  "inline-flex h-7 items-center rounded-control bg-kit-blue-9 px-3 text-meta font-medium text-white hover:opacity-90 disabled:opacity-40";

function FieldRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="mt-1 flex items-center gap-2 text-body leading-6">
      <span className="w-32 shrink-0 text-label text-kit-slate-9">{label}</span>
      {children}
    </div>
  );
}

function staffLabel(s: OpsStaffMember) {
  return s.name ?? s.email;
}

/** Today's resolution sentence — holder, active cover, or the honest gap. */
function Resolution({ duty, canAssign }: { duty: Duty; canAssign: boolean }) {
  const r = duty.resolution;
  const holderName = r.normal_user_name ?? r.normal_user_id;
  if (!r.normal_user_id) {
    // A missing required holder is an explicit configuration exception —
    // never a silent fallback person (workspace/MASTER §5).
    return (
      <div data-testid={`duty-resolution-${duty.key}`}>
        <p className="text-body font-medium text-kit-slate-12">Not assigned</p>
        <p className="mt-0.5 text-meta text-kit-slate-11">
          Nobody holds {duty.label}.{canAssign ? " Assign a holder below." : ""}
        </p>
      </div>
    );
  }
  if (r.is_cover && r.acting_user_id) {
    const actingName = r.acting_user_name ?? r.acting_user_id;
    return (
      <p
        className="text-body text-kit-slate-12"
        data-testid={`duty-resolution-${duty.key}`}
      >
        <span className="font-medium">{actingName}</span> covering for{" "}
        {holderName}
      </p>
    );
  }
  return (
    <p
      className="text-body font-medium text-kit-slate-12"
      data-testid={`duty-resolution-${duty.key}`}
    >
      {holderName}
    </p>
  );
}

function AssignForm({ duty, staff }: { duty: Duty; staff: OpsStaffMember[] }) {
  const [holderId, setHolderId] = useState("");
  const [effectiveFrom, setEffectiveFrom] = useState(appTodayIso());
  const [effectiveUntil, setEffectiveUntil] = useState("");
  const [note, setNote] = useState("");
  const assign = useWorkspaceAssignDutyMutation();

  return (
    <DocSection title="Assign Holder">
      <FieldRow label="Holder">
        <select
          value={holderId}
          onChange={(e) => setHolderId(e.target.value)}
          aria-label="Holder"
          data-testid={`assign-holder-${duty.key}`}
          className={FIELD}
        >
          <option value="">Choose staff</option>
          {staff.map((s) => (
            <option key={s.user_id} value={s.user_id}>
              {staffLabel(s)}
            </option>
          ))}
        </select>
      </FieldRow>
      <FieldRow label="Effective from">
        <input
          type="date"
          value={effectiveFrom}
          onChange={(e) => setEffectiveFrom(e.target.value)}
          aria-label="Effective from"
          data-testid={`assign-from-${duty.key}`}
          className={FIELD}
        />
      </FieldRow>
      <FieldRow label="Until">
        <input
          type="date"
          value={effectiveUntil}
          onChange={(e) => setEffectiveUntil(e.target.value)}
          aria-label="Until"
          data-testid={`assign-until-${duty.key}`}
          className={FIELD}
        />
      </FieldRow>
      <FieldRow label="Note">
        <input
          type="text"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          aria-label="Note"
          data-testid={`assign-note-${duty.key}`}
          className={`${FIELD} flex-1`}
        />
      </FieldRow>
      <div className="mt-2">
        <button
          type="button"
          data-testid={`assign-submit-${duty.key}`}
          disabled={!holderId || !effectiveFrom || assign.isPending}
          onClick={() =>
            assign.mutate(
              {
                dutyKey: duty.key,
                holderId,
                effectiveFrom,
                ...(effectiveUntil ? { effectiveUntil } : {}),
                ...(note.trim() ? { note: note.trim() } : {}),
              },
              {
                onSuccess: () => {
                  setHolderId("");
                  setEffectiveUntil("");
                  setNote("");
                },
              },
            )
          }
          className={PRIMARY_BTN}
        >
          Assign holder
        </button>
        {assign.error ? (
          // The API sends governed sentences — print them, do not rewrite.
          <p className="mt-1 text-meta text-kit-red-11" data-testid="assign-error">
            {assign.error.message}
          </p>
        ) : null}
      </div>
    </DocSection>
  );
}

function CoverForm({ duty, staff }: { duty: Duty; staff: OpsStaffMember[] }) {
  const [actingUserId, setActingUserId] = useState("");
  const [startsOn, setStartsOn] = useState(appTodayIso());
  const [endsOn, setEndsOn] = useState(appTodayIso());
  const [reason, setReason] = useState("");
  const cover = useWorkspaceCoverDutyMutation();

  return (
    <DocSection title="Add Cover">
      <FieldRow label="Acting staff">
        <select
          value={actingUserId}
          onChange={(e) => setActingUserId(e.target.value)}
          aria-label="Acting staff"
          data-testid={`cover-acting-${duty.key}`}
          className={FIELD}
        >
          <option value="">Choose staff</option>
          {staff.map((s) => (
            <option key={s.user_id} value={s.user_id}>
              {staffLabel(s)}
            </option>
          ))}
        </select>
      </FieldRow>
      <FieldRow label="From">
        <input
          type="date"
          value={startsOn}
          onChange={(e) => setStartsOn(e.target.value)}
          aria-label="From"
          data-testid={`cover-from-${duty.key}`}
          className={FIELD}
        />
      </FieldRow>
      <FieldRow label="Until">
        <input
          type="date"
          value={endsOn}
          onChange={(e) => setEndsOn(e.target.value)}
          aria-label="Until"
          data-testid={`cover-until-${duty.key}`}
          className={FIELD}
        />
      </FieldRow>
      <FieldRow label="Reason">
        <input
          type="text"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          aria-label="Reason"
          data-testid={`cover-reason-${duty.key}`}
          className={`${FIELD} flex-1`}
        />
      </FieldRow>
      <div className="mt-2">
        <button
          type="button"
          data-testid={`cover-submit-${duty.key}`}
          disabled={!actingUserId || !startsOn || !endsOn || cover.isPending}
          onClick={() =>
            cover.mutate(
              {
                dutyKey: duty.key,
                actingUserId,
                startsOn,
                endsOn,
                ...(reason.trim() ? { reason: reason.trim() } : {}),
              },
              {
                onSuccess: () => {
                  setActingUserId("");
                  setReason("");
                },
              },
            )
          }
          className={PRIMARY_BTN}
        >
          Add cover
        </button>
        {cover.error ? (
          <p className="mt-1 text-meta text-kit-red-11" data-testid="cover-error">
            {cover.error.message}
          </p>
        ) : null}
      </div>
    </DocSection>
  );
}

/** One immutable history — assignments then covers, newest first (the API
 *  already orders both). No edit, no delete: history is append-only. */
function History({ duty }: { duty: Duty }) {
  return (
    <DocSection title="History">
      <p className="text-label uppercase tracking-wide text-kit-slate-9">
        Assignments
      </p>
      {duty.assignments.length === 0 ? (
        <p className="mt-0.5 text-meta text-kit-slate-9">No assignments yet.</p>
      ) : (
        <ul className="mt-0.5">
          {duty.assignments.map((a) => (
            <li
              key={a.id}
              className="flex flex-wrap items-baseline gap-x-2 text-body leading-6"
              data-testid={`assignment-${a.id}`}
            >
              <span className="text-kit-slate-12">
                {a.holder_name ?? a.holder_id}
              </span>
              <span className="text-meta text-kit-slate-11">
                {a.effective_until
                  ? `${fmtDate(a.effective_from)} → ${fmtDate(a.effective_until)}`
                  : `from ${fmtDate(a.effective_from)}`}
              </span>
              {a.assigned_by_name ? (
                <span className="text-meta text-kit-slate-9">
                  assigned by {a.assigned_by_name}
                </span>
              ) : null}
              {a.note ? (
                <span className="text-meta text-kit-slate-9">· {a.note}</span>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      <p className="mt-2 text-label uppercase tracking-wide text-kit-slate-9">
        Covers
      </p>
      {duty.covers.length === 0 ? (
        <p className="mt-0.5 text-meta text-kit-slate-9">No covers yet.</p>
      ) : (
        <ul className="mt-0.5">
          {duty.covers.map((v) => (
            <li
              key={v.id}
              className="flex flex-wrap items-baseline gap-x-2 text-body leading-6"
              data-testid={`cover-${v.id}`}
            >
              <span className="text-kit-slate-12">
                {v.acting_user_name ?? v.acting_user_id} covering for{" "}
                {v.normal_user_name ?? v.normal_user_id}
              </span>
              <span className="text-meta text-kit-slate-11">
                {fmtDate(v.starts_on)} → {fmtDate(v.ends_on)}
              </span>
              {v.reason ? (
                <span className="text-meta text-kit-slate-9">· {v.reason}</span>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </DocSection>
  );
}

function DutyBlock({
  duty,
  canAssign,
  staff,
}: {
  duty: Duty;
  canAssign: boolean;
  staff: OpsStaffMember[];
}) {
  return (
    <section className="mb-6" data-testid={`duty-${duty.key}`}>
      <h2 className="text-title text-kit-slate-12">{duty.label}</h2>
      <div className="mt-1.5">
        <Resolution duty={duty} canAssign={canAssign} />
      </div>
      {canAssign ? (
        <>
          <AssignForm duty={duty} staff={staff} />
          <CoverForm duty={duty} staff={staff} />
        </>
      ) : (
        <p className="mt-2 text-meta text-kit-slate-9">
          Duty assignments are set by the manager.
        </p>
      )}
      <History duty={duty} />
    </section>
  );
}

export default function StaffDuties() {
  const dutiesQ = useWorkspaceDuties();
  const staffQ = useOperationStaff();
  const staff = staffQ.data?.staff ?? [];

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <ModuleHeader
        testId="staff-duties-destination-header"
        word="Staff & Duties"
        docTitle="Staff & Duties · Workspace — Carres"
        destinationHeader
      />
      <div
        className="min-h-0 flex-1 overflow-y-auto bg-white"
        data-testid="staff-duties"
      >
        <div className="mx-auto max-w-[720px] px-6 py-4">
          {dutiesQ.isLoading ? (
            <p className="py-8 text-body text-kit-slate-9">
              Opening Staff &amp; Duties…
            </p>
          ) : dutiesQ.isError ? (
            /* A failure sentence is never the empty sentence — what broke,
               then the act that fixes it. */
            <div className="flex flex-col items-center gap-3 py-8">
              <p className="text-body text-kit-slate-12">
                Staff &amp; Duties could not be opened
              </p>
              <button
                type="button"
                className="rounded-control border border-kit-slate-5 bg-white px-3 py-1.5 text-meta font-medium text-kit-slate-11 hover:text-kit-slate-12"
                onClick={() => void dutiesQ.refetch()}
              >
                Try again
              </button>
            </div>
          ) : (
            (dutiesQ.data?.duties ?? []).map((d) => (
              <DutyBlock
                key={d.key}
                duty={d}
                canAssign={dutiesQ.data?.can_assign === true}
                staff={staff}
              />
            ))
          )}
        </div>
      </div>
    </div>
  );
}

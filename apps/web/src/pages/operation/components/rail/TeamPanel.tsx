/**
 * TeamPanel — the Quick Rail's `who` surface.
 *
 * **THE ONE HOME FOR DUTY IDENTITY** (`purchasing/MASTER.md` §2.2, Loo
 * 2026-08-06): this panel states `PO DUTY` and `GRN DUTY`; no page repeats
 * them and no rail carries a duty chip.
 *
 * **The rail is quick peek, never a writer** (`ui/MASTER.md` §5) — with ONE
 * ruled exception, the duty edit door: duty identity has no other home, so
 * the only place it can be corrected is the only place it is stated. Every
 * other row here is read-only and deep-links to the owning surface.
 *
 * Two corrections landed 2026-08-15 (owner):
 *
 *  · **GRN DUTY always names its holder.** It is auto-assigned through the
 *    same rota as PO duty and the API resolves it; this file used to derive
 *    it on the client by looking BACKWARDS through a roster that starts at
 *    the current month, so it found nothing and printed `Not assigned` every
 *    month since it shipped.
 *  · **Per-person workload.** Each staff member's `{n} actions to do · {n} late`
 *    comes from the ONE governed work engine — literally the same function
 *    Team Work runs — and the row deep-links into that person's Team Work.
 */
import { ChevronRight, Pencil } from "lucide-react";
import { Link } from "react-router-dom";
import { useMemo, useState } from "react";
import { isPoDutyEditor } from "@carres/shared";
import { useOperationPoDuty, useOperationStaff, useUpdatePoDuty } from "@/lib/queries";
import { useAuth } from "@/lib/auth";
import { avatarColor, personInitials, personLabel } from "@/lib/staff-avatar";
import { fmtMonth } from "@/lib/fmt-date";
import { ownerWorkloads, useOpenWorkSet } from "../../use-open-work";

type DutyPerson = { userId: string; name: string | null; email: string };

function DutyRow({
  label,
  person,
  status,
  onEdit,
  fixHint,
}: {
  label: string;
  person: DutyPerson | null;
  status: string;
  onEdit?: () => void;
  /** Shown INSTEAD of a name when nobody can hold the duty. A fact stating an
   *  absence must say where it is fixed, or it is a dead end. */
  fixHint?: string;
}) {
  const colors = avatarColor(person?.userId ?? label);
  const slug = label.replace(/\s+/g, "-").toLowerCase();
  return (
    <div
      data-testid={`duty-row-${slug}`}
      className="flex items-center gap-2.5 px-3 py-2.5 border-b border-base-100 last:border-b-0"
    >
      <span
        className="relative w-8 h-8 rounded-full grid place-items-center text-meta font-semibold shrink-0"
        style={{ background: colors.bg, color: colors.fg }}
      >
        {person ? personInitials(person.name, person.email) : "—"}
        {person && (
          <span className="absolute right-0 bottom-0 w-2 h-2 rounded-full bg-success ring-2 ring-white" />
        )}
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-label uppercase tracking-[0.05em] text-base-500">{label}</div>
        <div className="text-body font-semibold text-base-900 truncate">
          {person ? personLabel(person.name, person.email) : "Not assigned"}
        </div>
        {!person && fixHint && (
          <div className="text-label text-base-500 mt-0.5">{fixHint}</div>
        )}
      </div>
      <span className="text-label text-base-500">{status}</span>
      {onEdit && (
        <button
          type="button"
          onClick={onEdit}
          data-testid={`duty-edit-${slug}`}
          aria-label={`Change ${label}`}
          title={`Change ${label}`}
          className="p-1 rounded text-base-500 hover:bg-hovertint shrink-0"
        >
          <Pencil size={14} />
        </button>
      )}
    </div>
  );
}

/** ERP-wide duty and coverage snapshot. Work actions live in My Work or their module. */
export default function TeamPanel() {
  const dutyQ = useOperationPoDuty();
  const staffQ = useOperationStaff();
  const updateDuty = useUpdatePoDuty();
  const authRole = useAuth((s) => s.role);
  const authEmail = useAuth((s) => s.user?.email ?? null);

  const staff = useMemo(() => staffQ.data?.staff ?? [], [staffQ.data]);
  const poHolder = dutyQ.data?.holder ?? null;
  const grnHolder = dutyQ.data?.grnHolder ?? null;
  const grnMonth = dutyQ.data?.grnMonth ?? null;
  const currentMonth = dutyQ.data?.month ?? "";

  // Who may rewrite the rota — STRICTER than manager (Jess 2026-07-19: roster
  // edits are hers). The API enforces the same duty key; this only decides
  // whether a door an unauthorised person cannot walk through is drawn at all.
  const mayEdit = isPoDutyEditor(authRole, authEmail, staffQ.data?.myDuties);

  const [editing, setEditing] = useState<null | { label: string; month: string }>(null);

  // The SAME work set Team Work renders — one engine, so a person's numbers
  // are the same on both surfaces by construction, not by agreement.
  const { items } = useOpenWorkSet();
  const workloads = useMemo(() => ownerWorkloads(items, staff), [items, staff]);

  const assignable = staff.filter((s) => s.pooled);

  return (
    <div className="space-y-4" data-testid="team-panel">
      <section>
        <h3 className="text-label uppercase tracking-[0.05em] text-base-500 mb-1.5">Duty coverage</h3>
        <div className="rounded-lg border border-base-200 bg-white">
          <DutyRow
            label="PO Duty"
            person={poHolder}
            status="Available"
            fixHint="Add someone to the assignment pool in Settings."
            onEdit={
              mayEdit && currentMonth
                ? () => setEditing({ label: "PO Duty", month: currentMonth })
                : undefined
            }
          />
          <DutyRow
            label="GRN Duty"
            person={grnHolder}
            status="Available"
            fixHint="Add someone to the assignment pool in Settings."
            onEdit={
              mayEdit && grnMonth
                ? () => setEditing({ label: "GRN Duty", month: grnMonth })
                : undefined
            }
          />
        </div>
      </section>

      {editing && (
        <DutyEditor
          label={editing.label}
          month={editing.month}
          staff={assignable}
          saving={updateDuty.isPending}
          onCancel={() => setEditing(null)}
          onPick={(userId) =>
            updateDuty.mutate(
              { userId, month: editing.month },
              { onSuccess: () => setEditing(null) },
            )
          }
        />
      )}

      <section>
        <h3 className="text-label uppercase tracking-[0.05em] text-base-500 mb-1.5">
          Team workload
        </h3>
        <div className="rounded-lg border border-base-200 bg-white overflow-hidden">
          {workloads.length === 0 ? (
            <div className="px-3 py-2.5 text-label text-base-500">
              No operations staff yet.
            </div>
          ) : (
            workloads.map((w) => (
              <Link
                key={w.userId}
                to={`/operation?tab=work&scope=team&owner=${w.userId}`}
                data-testid={`team-workload-${w.userId}`}
                className="flex items-center gap-2.5 px-3 py-2 border-b border-base-100 last:border-b-0 hover:bg-base-50"
              >
                <span
                  className="w-7 h-7 rounded-full grid place-items-center text-label font-semibold shrink-0"
                  style={{
                    background: avatarColor(w.userId).bg,
                    color: avatarColor(w.userId).fg,
                  }}
                >
                  {personInitials(w.member.name, w.member.email)}
                </span>
                <span className="min-w-0 flex-1 truncate text-body text-base-900">
                  {personLabel(w.member.name, w.member.email)}
                </span>
                <span className="text-label text-base-500 tabular-nums shrink-0">
                  {w.open} action{w.open === 1 ? "" : "s"} to do
                  {w.overdue > 0 && (
                    <span className="text-danger font-semibold"> · {w.overdue} late</span>
                  )}
                </span>
                <ChevronRight size={14} className="text-base-300 shrink-0" />
              </Link>
            ))
          )}
        </div>
      </section>

      <Link
        to="/operation?tab=work&scope=team"
        className="flex items-center justify-between rounded-lg border border-base-200 px-3 py-2 text-meta font-medium text-primary hover:bg-base-50"
      >
        <span>View Team Work →</span>
        <ChevronRight size={14} />
      </Link>
    </div>
  );
}

/**
 * The duty override door.
 *
 * It names the MONTH it writes, because duty is derived from one rota: GRN
 * duty this month is the next month's rota row, so changing the receiver also
 * changes who issues POs then. That is the locked duty model, not a side
 * effect to hide — a door that does two things must say both.
 */
function DutyEditor({
  label,
  month,
  staff,
  saving,
  onPick,
  onCancel,
}: {
  label: string;
  month: string;
  staff: { user_id: string; name: string | null; email: string }[];
  saving: boolean;
  onPick: (userId: string) => void;
  onCancel: () => void;
}) {
  return (
    <section className="rounded-lg border border-base-200 bg-base-50 p-3" data-testid="duty-editor">
      <div className="text-body font-semibold text-base-900">Change {label}</div>
      <div className="text-label text-base-500 mt-0.5 mb-2">
        Sets the duty holder for {fmtMonth(month)}.
      </div>
      {staff.length === 0 ? (
        <div className="text-label text-base-500">
          Nobody is in the assignment pool yet — add someone in Settings.
        </div>
      ) : (
        <div className="space-y-1">
          {staff.map((s) => (
            <button
              key={s.user_id}
              type="button"
              disabled={saving}
              onClick={() => onPick(s.user_id)}
              data-testid={`duty-pick-${s.user_id}`}
              className="w-full text-left px-2 py-1.5 rounded text-body text-base-800 bg-white border border-base-200 hover:bg-hovertint disabled:opacity-50"
            >
              {personLabel(s.name, s.email)}
            </button>
          ))}
        </div>
      )}
      <button
        type="button"
        onClick={onCancel}
        className="mt-2 text-label text-base-500 hover:text-base-800"
      >
        Cancel
      </button>
    </section>
  );
}

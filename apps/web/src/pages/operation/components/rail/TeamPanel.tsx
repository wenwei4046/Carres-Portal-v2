import { useMemo } from "react";
import { Link } from "react-router-dom";
import { ChevronRight } from "lucide-react";
import { useOperationPoDuty, useOperationStaff } from "@/lib/queries";
import { avatarColor, personInitials, personLabel } from "@/lib/staff-avatar";

type DutyPerson = { userId: string; name: string | null; email: string };

function DutyRow({ label, person, status }: { label: string; person: DutyPerson | null; status: string }) {
  const colors = avatarColor(person?.userId ?? label);
  return (
    <div className="flex items-center gap-2.5 px-3 py-2.5 border-b border-base-100 last:border-b-0">
      <span className="relative w-8 h-8 rounded-full grid place-items-center text-meta font-semibold shrink-0" style={{ background: colors.bg, color: colors.fg }}>
        {person ? personInitials(person.name, person.email) : "—"}
        {person && <span className="absolute right-0 bottom-0 w-2 h-2 rounded-full bg-success ring-2 ring-white" />}
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-label uppercase tracking-[0.05em] text-base-500">{label}</div>
        <div className="text-body font-semibold text-base-900 truncate">
          {person ? personLabel(person.name, person.email) : "Not assigned"}
        </div>
      </div>
      <span className="text-label text-base-500">{status}</span>
    </div>
  );
}

/** ERP-wide duty and coverage snapshot. Work actions live in My Work or their module. */
export default function TeamPanel() {
  const dutyQ = useOperationPoDuty();
  const staffQ = useOperationStaff();
  const roster = dutyQ.data?.roster ?? [];
  const currentMonth = dutyQ.data?.month ?? "";
  const poHolder = dutyQ.data?.holder ?? null;
  const grnHolder = useMemo(() => {
    const previous = [...roster].filter((row) => row.month < currentMonth).sort((a, b) => b.month.localeCompare(a.month))[0];
    return previous ? { userId: previous.userId, name: previous.name, email: previous.email } : null;
  }, [currentMonth, roster]);
  const staffCount = (staffQ.data?.staff ?? []).length;

  return (
    <div className="space-y-4" data-testid="team-panel">
      <section>
        <h3 className="text-label uppercase tracking-[0.05em] text-base-500 mb-1.5">Duty coverage</h3>
        <div className="rounded-lg border border-base-200 bg-white">
          <DutyRow label="PO Duty" person={poHolder} status="Available" />
          <DutyRow label="GRN Duty" person={grnHolder} status={grnHolder ? "Cover" : "—"} />
        </div>
      </section>
      <section>
        <h3 className="text-label uppercase tracking-[0.05em] text-base-500 mb-1.5">Team snapshot</h3>
        <div className="rounded-lg border border-base-200 bg-base-50 px-3 py-2.5">
          <div className="text-body font-medium text-base-900">{staffCount} operations staff</div>
          <div className="text-label text-base-500 mt-0.5">Open and overdue workload is available in Team Work.</div>
        </div>
      </section>
      <Link to="/operation?tab=work&scope=team" className="flex items-center justify-between rounded-lg border border-base-200 px-3 py-2 text-meta font-medium text-primary hover:bg-base-50">
        <span>View Team Work →</span>
        <ChevronRight size={14} />
      </Link>
    </div>
  );
}

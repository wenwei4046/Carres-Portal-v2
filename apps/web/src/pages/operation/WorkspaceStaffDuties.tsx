import { useEffect, useState } from "react";
import { toast } from "sonner";
import type { WorkspaceDutyResolution } from "@carres/shared";
import Button from "@/components/kit/Button";
import DatePicker from "@/components/kit/DatePicker";
import EmptyState from "@/components/kit/EmptyState";
import PageShell from "@/components/kit/PageShell";
import Select from "@/components/kit/Select";
import { avatarColor, personInitials } from "@/lib/staff-avatar";
import {
  useSetWorkspaceDutyAssignment,
  useWorkspaceDuties,
  type WorkspaceDutiesResponse,
} from "@/lib/queries";

function malaysiaDate(): string {
  return new Date(Date.now() + 8 * 60 * 60 * 1_000).toISOString().slice(0, 10);
}

function PersonChip({ person }: { person: { userId: string; name: string | null } }) {
  const colour = avatarColor(person.userId);
  const name = person.name ?? "Unknown staff";
  return (
    <span className="inline-flex items-center gap-2 text-body text-kit-slate-12" title={name}>
      <span
        aria-hidden="true"
        className="inline-flex h-6 w-6 items-center justify-center rounded-full text-label font-semibold"
        style={{ backgroundColor: colour.bg, color: colour.fg }}
      >
        {personInitials(person.name, "")}
      </span>
      <span>{name}</span>
    </span>
  );
}

function ResolutionLine({ resolution }: { resolution: WorkspaceDutyResolution }) {
  if (resolution.state === "not_assigned") {
    return (
      <div>
        <div className="text-strong text-kit-red-11">Not assigned</div>
        <div className="mt-1 text-meta text-kit-slate-11">Set Primary and optional Buddy here.</div>
      </div>
    );
  }
  if (resolution.state === "covered" && resolution.normalOwner && resolution.activeCover) {
    return (
      <div>
        <div className="text-strong text-kit-amber-11">Covered today</div>
        <div className="mt-1 text-meta text-kit-slate-11">
          Normal owner: {resolution.normalOwner.name ?? "Unknown staff"} · Today's cover: {resolution.activeCover.name ?? "Unknown staff"}
        </div>
      </div>
    );
  }
  return <div className="text-meta text-kit-slate-11">Primary is acting today.</div>;
}

function DutyRow({
  duty,
  staff,
  canEdit,
}: {
  duty: WorkspaceDutiesResponse["duties"][number];
  staff: WorkspaceDutiesResponse["staff"];
  canEdit: boolean;
}) {
  const [primary, setPrimary] = useState(duty.assignment?.primaryUserId);
  const [buddy, setBuddy] = useState(duty.assignment?.buddyUserId ?? "none");
  const [startsOn, setStartsOn] = useState<string | null>(duty.assignment?.startsOn ?? duty.resolution.onDate);
  const [endsOn, setEndsOn] = useState<string | null>(duty.assignment?.endsOn ?? null);
  useEffect(() => {
    setPrimary(duty.assignment?.primaryUserId);
    setBuddy(duty.assignment?.buddyUserId ?? "none");
    setStartsOn(duty.assignment?.startsOn ?? duty.resolution.onDate);
    setEndsOn(duty.assignment?.endsOn ?? null);
  }, [duty.assignment, duty.resolution.onDate]);

  const save = useSetWorkspaceDutyAssignment({
    onSuccess: () => toast.success("Duty assignment saved"),
    onError: (error) => toast.error(error.message),
  });
  const options = staff.map((person) => ({
    value: person.userId,
    label: person.name ?? "Unknown staff",
  }));
  const assignedPrimary = duty.resolution.normalOwner;
  const assignedBuddy = duty.resolution.buddy;

  return (
    <div data-testid="duty-row" className="grid gap-4 border-b border-kit-slate-5 px-4 py-4 last:border-b-0 lg:grid-cols-[minmax(190px,1.2fr)_minmax(170px,1fr)_minmax(170px,1fr)_minmax(220px,1.3fr)_auto] lg:items-start">
      <div>
        <div className="text-strong text-kit-slate-12">{duty.name}</div>
        <div className="mt-1 text-meta text-kit-slate-11">{duty.description}</div>
      </div>
      <div>
        {canEdit ? (
          <Select id={`${duty.key}-primary`} value={primary} onValueChange={setPrimary} placeholder="Select Primary" options={options} />
        ) : assignedPrimary ? <PersonChip person={assignedPrimary} /> : <span className="text-meta text-kit-slate-11">Not assigned</span>}
      </div>
      <div>
        {canEdit ? (
          <Select id={`${duty.key}-buddy`} value={buddy} onValueChange={setBuddy} options={[{ value: "none", label: "No Buddy" }, ...options.filter((person) => person.value !== primary)]} />
        ) : assignedBuddy ? <PersonChip person={assignedBuddy} /> : <span className="text-meta text-kit-slate-11">No Buddy</span>}
      </div>
      <div className="grid grid-cols-2 gap-2">
        {canEdit ? <>
          <DatePicker id={`${duty.key}-starts`} label="Starts" value={startsOn} onChange={setStartsOn} />
          <DatePicker id={`${duty.key}-ends`} label="Ends" value={endsOn} onChange={setEndsOn} placeholder="No end date" />
        </> : <ResolutionLine resolution={duty.resolution} />}
        {canEdit && <div className="col-span-2"><ResolutionLine resolution={duty.resolution} /></div>}
      </div>
      {canEdit && (
        <Button
          variant="primary"
          disabled={!primary || !startsOn || buddy === primary}
          loading={save.isPending}
          onClick={() => primary && startsOn && save.mutate({
            dutyKey: duty.key,
            primaryUserId: primary,
            buddyUserId: buddy === "none" ? null : buddy,
            startsOn,
            endsOn,
          })}
        >
          Save assignment
        </Button>
      )}
    </div>
  );
}

export default function WorkspaceStaffDuties() {
  const onDate = malaysiaDate();
  const query = useWorkspaceDuties(onDate);
  return (
    <PageShell
      variant="settings"
      title="Staff & Duties"
      titleRight={query.data && !query.data.canEdit ? <span className="text-meta text-kit-slate-11">Only authorised management can change assignments.</span> : undefined}
    >
      <div className="min-h-0 flex-1 overflow-auto rounded-card border border-kit-slate-5 bg-white">
        {query.isLoading ? (
          <div className="p-6 text-body text-kit-slate-11">Loading Staff & Duties…</div>
        ) : query.isError ? (
          <EmptyState title="Staff & Duties could not be loaded" detail="Try again. No assignment was changed." />
        ) : !query.data || query.data.duties.length === 0 ? (
          <EmptyState title="No Duties configured" detail="Add approved owner Duties before assigning staff." />
        ) : <>
          <div className="hidden grid-cols-[minmax(190px,1.2fr)_minmax(170px,1fr)_minmax(170px,1fr)_minmax(220px,1.3fr)_auto] gap-4 border-b border-kit-slate-5 bg-kit-slate-3 px-4 py-2 text-meta font-semibold text-kit-slate-11 lg:grid">
            <span>Duty</span><span>Primary</span><span>Buddy</span><span>Effective dates · Today</span><span>Action</span>
          </div>
          {query.data.duties.map((duty) => (
            <DutyRow key={duty.key} duty={duty} staff={query.data.staff} canEdit={query.data.canEdit} />
          ))}
        </>}
      </div>
    </PageShell>
  );
}

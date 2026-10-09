import { useEffect, useState } from "react";
import { workspaceActivityTimesFit, type WorkspaceActivitySettingsResponse } from "@carres/shared";
import Button from "@/components/kit/Button";
import Input from "@/components/kit/Input";
import Loading from "@/components/kit/Loading";
import { useWorkActivitySettings, useSaveWorkActivitySettings } from "@/lib/queries";
import { clock12 } from "../settings-core/parts";

/** "13:00" moved by whole minutes, for the inputs' min/max only. */
function shift(hhmm: string, minutes: number): string {
  const m = Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5)) + minutes;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

function SettingsForm({ value }: { value: WorkspaceActivitySettingsResponse }) {
  const [baseline, setBaseline] = useState(value);
  const [morning, setMorning] = useState(value.morning);
  const [afternoon, setAfternoon] = useState(value.afternoon);
  const save = useSaveWorkActivitySettings();
  /* The bounds follow the stored Office calendar (Settings → Office, 0677):
     morning from Office start and before the Office lunch; afternoon after
     the Office lunch and before Office end. */
  const office = value.office;
  const valid = workspaceActivityTimesFit({ morning, afternoon }, office);
  const morningLast = shift(office.lunchStart, -1);
  const afternoonFirst = shift(office.lunchEnd, 1);
  const afternoonLast = shift(office.end, -1);
  const changed = morning !== baseline.morning || afternoon !== baseline.afternoon;
  useEffect(() => {
    if (!changed && baseline.revision !== value.revision) {
      setBaseline(value); setMorning(value.morning); setAfternoon(value.afternoon);
    }
  }, [value, baseline.revision, changed]);
  return <form className="flex flex-col gap-3" onSubmit={(event) => {
    event.preventDefault();
    if (value.canEdit && valid && changed && !save.isPending) save.mutate({ morning, afternoon, revision: baseline.revision }, { onSuccess: (saved) => { setBaseline(saved); setMorning(saved.morning); setAfternoon(saved.afternoon); } });
  }}>
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <Input id="morning-check-time" label="Morning check time" type="time" min={office.start} max={morningLast} required
        value={morning} readOnly={!value.canEdit} disabled={save.isPending} onChange={(event) => setMorning(event.target.value)} />
      <Input id="afternoon-check-time" label="Afternoon check time" type="time" min={afternoonFirst} max={afternoonLast} required
        value={afternoon} readOnly={!value.canEdit} disabled={save.isPending} onChange={(event) => setAfternoon(event.target.value)} />
    </div>
    <p className="text-meta text-kit-slate-11" data-testid="check-time-bounds">
      Morning check from {clock12(office.start)} to {clock12(morningLast)}. Afternoon check from {clock12(afternoonFirst)} to {clock12(afternoonLast)}. A person&apos;s afternoon check moves with their own lunch.
    </p>
    {save.isError ? <p role="alert" className="text-body text-kit-red-11">{save.error instanceof Error && "status" in save.error && save.error.status === 409
      ? "These times changed. Cancel and try again."
      : "Check times were not saved. Try again."}</p> : null}
    {value.canEdit && changed ? <div className="flex flex-wrap items-center gap-3">
      <Button type="submit" variant="primary" loading={save.isPending}>Save</Button>
      <Button disabled={save.isPending} onClick={() => { setBaseline(value); setMorning(value.morning); setAfternoon(value.afternoon); save.reset(); }}>Cancel</Button>
    </div> : null}
  </form>;
}

export default function ActivitySettings() {
  const query = useWorkActivitySettings();
  return <section aria-label="Morning check time and Afternoon check time" className="border-b border-kit-slate-5 px-6 py-3">
    {query.isPending ? <Loading variant="skeleton" lines={2} label="Opening Staff & Duties…" /> : query.data ? <>
      {query.isError ? <p role="alert" className="mb-3 text-body text-kit-red-11">Check times could not be refreshed. Try again.</p> : null}
      <SettingsForm key={String(query.data.canEdit)} value={query.data} />
    </> : <p role="alert" className="text-body text-kit-red-11">Check times could not be loaded.</p>}
    {query.isError ? <div className="mt-3"><Button onClick={() => void query.refetch()}>Try again</Button></div> : null}
  </section>;
}

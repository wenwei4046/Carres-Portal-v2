import { useMemo, useState } from "react";
import { groupRuns, isOnLeave, lorryCapacity, proposeCrew, type FleetCrew, type LorryCapacityRow } from "@carres/shared/fleet";
import ListPageShell from "@/components/ListPageShell";
import { DataGrid, type DataGridColumn } from "@/components/register/DataGrid";
import Button from "@/components/kit/Button";
import Select from "@/components/kit/Select";
import { appTodayIso, fmtDate } from "@/lib/fmt-date";
import { rm } from "@/lib/format-currency";
import ModuleHeader from "./components/ModuleHeader";
import { FL, mapHref, monthRange, refusalOf, useFleet, useFleetWrite, type FleetPayload } from "./fleet";

/**
 * Carres' own lorries (migration 0724). Weisiang's decision (Mr Lim, WhatsApp
 * 2026-10-22): build Houzs Last Mile crew proposals + run sheet, Lorry Live
 * Map, Lorry Capacity and Driver Leave. Jess was not part of this decision;
 * her Delivery MASTER rejections (§11, §14, §15) are marked overturned.
 *
 * Lorries and crew are Settings → Logistics → Carres Lorries → Vehicles and
 * Drivers; a lorry run is one lorry on one day, read from the Monitor's
 * delivery dates whose vehicle is that lorry's plate.
 */

const dateInput = "h-8 rounded-md border border-border bg-background px-2 text-body";

function Page({ word, testId, payload, error, children }: {
  word: string; testId: string; payload: FleetPayload | undefined; error: boolean; children: React.ReactNode;
}) {
  return (
    <div className="flex h-full min-h-0 flex-col" data-testid={testId}>
      <ModuleHeader destinationHeader testId={`${testId}-destination-header`} word={word} docTitle={`${word} · Carres`} />
      {error ? (
        <p role="alert" className="p-4 text-body">{FL.failed}</p>
      ) : payload && !payload.company ? (
        <p className="p-4 text-body" data-testid={`${testId}-not-set-up`}>{FL.noOwnFleet}</p>
      ) : (
        <ListPageShell register>{children}</ListPageShell>
      )}
    </div>
  );
}

/* ── Fleet Day (Houzs FleetDay "Propose crew" + run sheets) ──────────────── */

interface DayRow { vehicleId: string | null; plate: string; capacity: string | null; stops: number; revenue: number }

export function FleetDayPage() {
  const [day, setDay] = useState(appTodayIso);
  const q = useFleet(day);
  const write = useFleetWrite();
  const [edits, setEdits] = useState<Record<string, { driverId: string | null; helperId: string | null }>>({});
  const [message, setMessage] = useState<string | null>(null);
  const data = q.data;

  const lorries = useMemo(() => (data?.lorries ?? []).filter((l) => l.active), [data]);
  const runs = useMemo(() => groupRuns((data?.stops ?? []).filter((s) => s.day === day)), [data, day]);
  const picks = useMemo(
    () => proposeCrew({
      day, lorries, crew: data?.crew ?? [], leave: data?.leave ?? [],
      confirmed: data?.crewDays ?? [], history: data?.crewDays ?? [],
      templateDriverName: new Map(lorries.map((l) => [l.id, l.templateDriverName])),
    }),
    [data, day, lorries],
  );
  const rows = useMemo<DayRow[]>(() => {
    const out: DayRow[] = lorries.map((l) => {
      const run = runs.find((r) => r.vehicleId === l.id);
      return { vehicleId: l.id, plate: l.plate, capacity: l.capacity, stops: run?.stops.length ?? 0, revenue: run?.revenue ?? 0 };
    });
    const loose = runs.find((r) => r.vehicleId === null);
    if (loose) out.push({ vehicleId: null, plate: FL.noLorryMatched, capacity: null, stops: loose.stops.length, revenue: loose.revenue });
    return out;
  }, [lorries, runs]);

  const crewFor = (role: "driver" | "helper") =>
    (data?.crew ?? []).filter((c) => c.active && c.role === role && !isOnLeave(c.id, day, data?.leave ?? []));
  const options = (people: FleetCrew[], none: string) => [{ value: "none", label: none }, ...people.map((c) => ({ value: c.id, label: c.name }))];
  const chosen = (vehicleId: string) => edits[vehicleId] ?? picks.get(vehicleId) ?? { driverId: null, helperId: null };
  const setPick = (vehicleId: string, key: "driverId" | "helperId", value: string) =>
    setEdits((e) => ({ ...e, [vehicleId]: { ...chosen(vehicleId), [key]: value === "none" ? null : value } }));

  const confirm = (vehicleId: string) => {
    const c = chosen(vehicleId);
    setMessage(null);
    write.mutate(
      { path: "/crew", body: { day, vehicleId, driverId: c.driverId, helperId: c.helperId } },
      {
        onSuccess: () => setEdits(({ [vehicleId]: _done, ...rest }) => rest),
        onError: (e) => setMessage(refusalOf(e)),
      },
    );
  };

  const columns: DataGridColumn<DayRow>[] = [
    { key: "lorry", label: FL.lorry, width: 160, accessor: (r) => r.plate },
    { key: "capacity", label: FL.lorryCapacity, width: 110, accessor: (r) => r.capacity ?? "" },
    { key: "stops", label: FL.stops, width: 80, align: "right", accessor: (r) => String(r.stops), numberValue: (r) => r.stops },
    { key: "revenue", label: FL.revenue, width: 120, align: "right", accessor: (r) => rm(r.revenue), numberValue: (r) => r.revenue, exportValue: (r) => r.revenue },
    { key: "driver", label: FL.driver, width: 180, sortable: false, filterable: false, accessor: (r) => r.vehicleId ? (
      <Select id={`fleet-driver-${r.vehicleId}`} value={chosen(r.vehicleId).driverId ?? "none"} onValueChange={(v) => setPick(r.vehicleId!, "driverId", v)}
        options={options(crewFor("driver"), FL.noDriver)} />
    ) : "" , exportValue: (r) => (r.vehicleId ? nameOf(data, chosen(r.vehicleId).driverId) : "") },
    { key: "helper", label: FL.helper, width: 180, sortable: false, filterable: false, accessor: (r) => r.vehicleId ? (
      <Select id={`fleet-helper-${r.vehicleId}`} value={chosen(r.vehicleId).helperId ?? "none"} onValueChange={(v) => setPick(r.vehicleId!, "helperId", v)}
        options={options(crewFor("helper"), FL.noHelper)} />
    ) : "", exportValue: (r) => (r.vehicleId ? nameOf(data, chosen(r.vehicleId).helperId) : "") },
    { key: "crew", label: FL.crew, width: 110, accessor: (r) =>
      !r.vehicleId ? FL.noLorryMatchedNote : picks.get(r.vehicleId)?.confirmed && !edits[r.vehicleId] ? FL.confirmed : FL.proposed },
    { key: "act", label: "", exportLabel: FL.confirmCrew, width: 240, sortable: false, filterable: false, accessor: (r) => (
      <span className="flex gap-2">
        {r.vehicleId ? (
          <Button size="sm" variant="primary" loading={write.isPending && (write.variables?.body as { vehicleId?: string } | undefined)?.vehicleId === r.vehicleId}
            onClick={(e) => { e.stopPropagation(); confirm(r.vehicleId!); }} data-testid={`fleet-confirm-${r.vehicleId}`}>{FL.confirmCrew}</Button>
        ) : null}
        {r.stops > 0 ? (
          <a className="text-c-link underline" target="_blank" rel="noreferrer"
            href={`/print/run-sheet?day=${day}${r.vehicleId ? `&lorry=${r.vehicleId}` : "&lorry=none"}`}>{FL.runSheet}</a>
        ) : null}
      </span>
    ) },
  ];

  return (
    <Page word={FL.fleetDay} testId="fleet-day" payload={data} error={q.isError}>
      {message ? <p role="alert" className="px-4 pb-2 text-body" data-testid="fleet-day-refusal">{message}</p> : null}
      <DataGrid
        rows={rows}
        columns={columns}
        rowKey={(r) => r.vehicleId ?? "none"}
        storageKey="carres.operation.fleet-day.v1"
        appearance="reference"
        exportName={`${FL.fleetDay} ${day}`}
        groupBanner={false}
        isLoading={!q.isSuccess && !q.isError}
        toolbarStart={
          <input type="date" aria-label={FL.day} className={dateInput} value={day} data-testid="fleet-day-date"
            onChange={(e) => { if (e.target.value) { setDay(e.target.value); setEdits({}); } }} />
        }
        toolbarEnd={runs.length > 0 ? (
          <a className="text-c-link underline" target="_blank" rel="noreferrer" href={`/print/run-sheet?day=${day}`}>{FL.printRunSheets}</a>
        ) : undefined}
        emptyMessage={FL.noLorries}
        statusSummary={(visible) => `${visible.reduce((n, r) => n + r.stops, 0)} ${FL.stops.toLowerCase()} · ${rm(visible.reduce((n, r) => n + r.revenue, 0))}`}
      />
    </Page>
  );
}

const nameOf = (data: FleetPayload | undefined, id: string | null) => data?.crew.find((c) => c.id === id)?.name ?? "";

/* ── Live Map (Houzs LorryLiveMap; no map library yet: a list with map links) ── */

interface MapRow { vehicleId: string; plate: string; lat: number | null; lng: number | null; recordedAt: string | null }

export function FleetLiveMapPage() {
  const today = appTodayIso();
  const q = useFleet(today);
  const rows = useMemo<MapRow[]>(() => (q.data?.lorries ?? []).filter((l) => l.active).map((l) => {
    const p = q.data?.positions.find((x) => x.vehicleId === l.id);
    return { vehicleId: l.id, plate: l.plate, lat: p?.lat ?? null, lng: p?.lng ?? null, recordedAt: p?.recordedAt ?? null };
  }), [q.data]);
  const old = (iso: string) => Date.now() - new Date(iso).getTime() > 30 * 60_000;
  const columns: DataGridColumn<MapRow>[] = [
    { key: "lorry", label: FL.lorry, width: 160, accessor: (r) => r.plate },
    { key: "seen", label: FL.lastSeen, width: 220, accessor: (r) => r.recordedAt
      ? `${fmtDate(r.recordedAt, { time: true })}${old(r.recordedAt) ? ` · ${FL.oldPosition}` : ""}` : FL.noPosition,
      dateValue: (r) => r.recordedAt ?? "" },
    { key: "position", label: FL.position, width: 200, accessor: (r) => (r.lat == null ? "" : `${r.lat}, ${r.lng}`) },
    { key: "map", label: "", exportLabel: FL.openMap, width: 120, sortable: false, filterable: false, accessor: (r) => r.lat == null ? "" : (
      <a className="text-c-link underline" target="_blank" rel="noreferrer" href={mapHref(r.lat, r.lng!)}>{FL.openMap}</a>
    ) },
  ];
  return (
    <Page word={FL.liveMap} testId="fleet-map" payload={q.data} error={q.isError}>
      <DataGrid rows={rows} columns={columns} rowKey={(r) => r.vehicleId} storageKey="carres.operation.fleet-map.v1"
        appearance="reference" exportName={FL.liveMap} groupBanner={false} isLoading={!q.isSuccess && !q.isError}
        emptyMessage={FL.noLorries} statusSummary={(v) => `${v.filter((r) => r.recordedAt).length} of ${v.length}`} />
    </Page>
  );
}

/* ── Lorry Capacity (Houzs LorryCapacity: utilisation + revenue per trip) ── */

export function LorryCapacityPage() {
  const [month, setMonth] = useState(() => appTodayIso().slice(0, 7));
  const { from, to } = monthRange(month);
  const q = useFleet(from, to);
  const rows = useMemo(() => lorryCapacity(from, to, q.data?.lorries ?? [], q.data?.stops ?? []), [q.data, from, to]);
  const num = (n: number | null, f: (x: number) => string) => (n == null ? "" : f(n));
  const columns: DataGridColumn<LorryCapacityRow>[] = [
    { key: "lorry", label: FL.lorry, width: 150, accessor: (r) => r.plate },
    { key: "capacity", label: FL.lorryCapacity, width: 110, accessor: (r) => r.capacity ?? "" },
    { key: "days", label: FL.workingDays, width: 120, align: "right", accessor: (r) => String(r.workingDays), numberValue: (r) => r.workingDays },
    { key: "trips", label: FL.trips, width: 80, align: "right", accessor: (r) => String(r.trips), numberValue: (r) => r.trips },
    { key: "util", label: FL.utilisation, width: 110, align: "right", accessor: (r) => num(r.utilisation, (x) => `${Math.round(x * 100)}%`), numberValue: (r) => r.utilisation ?? 0 },
    { key: "stops", label: FL.stops, width: 80, align: "right", accessor: (r) => String(r.stops), numberValue: (r) => r.stops },
    { key: "spt", label: FL.stopsPerTrip, width: 120, align: "right", accessor: (r) => num(r.stopsPerTrip, (x) => x.toFixed(1)), numberValue: (r) => r.stopsPerTrip ?? 0 },
    { key: "revenue", label: FL.revenue, width: 130, align: "right", accessor: (r) => rm(r.revenue), numberValue: (r) => r.revenue, exportValue: (r) => r.revenue },
    { key: "rpt", label: FL.revenuePerTrip, width: 140, align: "right", accessor: (r) => num(r.revenuePerTrip, rm), numberValue: (r) => r.revenuePerTrip ?? 0, exportValue: (r) => r.revenuePerTrip ?? "" },
  ];
  return (
    <Page word={FL.capacity} testId="fleet-capacity" payload={q.data} error={q.isError}>
      <DataGrid rows={rows} columns={columns} rowKey={(r) => r.vehicleId} storageKey="carres.operation.fleet-capacity.v1"
        appearance="reference" exportName={`${FL.capacity} ${month}`} groupBanner={false} isLoading={!q.isSuccess && !q.isError}
        toolbarStart={<input type="month" aria-label={FL.month} className={dateInput} value={month} data-testid="fleet-capacity-month"
          onChange={(e) => e.target.value && setMonth(e.target.value)} />}
        emptyMessage={FL.noLorries}
        statusSummary={(v) => {
          const trips = v.reduce((n, r) => n + r.trips, 0);
          const revenue = v.reduce((n, r) => n + r.revenue, 0);
          return `${trips} ${FL.trips.toLowerCase()} · ${rm(revenue)}${trips ? ` · ${FL.revenuePerTrip} ${rm(revenue / trips)}` : ""}`;
        }} />
    </Page>
  );
}

/* ── Crew Leave (Houzs DriverLeave; Fleet Day skips crew on leave) ───────── */

export function CrewLeavePage() {
  const today = appTodayIso();
  const q = useFleet(today);
  const write = useFleetWrite();
  const [form, setForm] = useState({ crewId: "", fromDate: today, toDate: today, reason: "" });
  const [message, setMessage] = useState<string | null>(null);
  const crew = q.data?.crew ?? [];
  type Row = FleetPayload["leave"][number];
  const columns: DataGridColumn<Row>[] = [
    { key: "crew", label: FL.crew, width: 180, accessor: (r) => nameOf(q.data, r.crewId) },
    { key: "role", label: FL.role, width: 100, accessor: (r) => (crew.find((c) => c.id === r.crewId)?.role === "helper" ? FL.helper : FL.driver) },
    { key: "from", label: FL.from, width: 130, accessor: (r) => fmtDate(r.fromDate), dateValue: (r) => r.fromDate },
    { key: "to", label: FL.to, width: 130, accessor: (r) => fmtDate(r.toDate), dateValue: (r) => r.toDate },
    { key: "reason", label: FL.reason, width: 240, accessor: (r) => r.reason },
    { key: "act", label: "", exportLabel: FL.remove, width: 110, sortable: false, filterable: false, accessor: (r) => (
      <Button size="sm" onClick={(e) => { e.stopPropagation(); write.mutate({ path: `/leave/${r.id}`, method: "DELETE" }, { onError: (err) => setMessage(refusalOf(err)) }); }}>{FL.remove}</Button>
    ) },
  ];
  const add = () => {
    setMessage(null);
    write.mutate({ path: "/leave", body: form }, {
      onSuccess: () => setForm((f) => ({ ...f, reason: "" })),
      onError: (e) => setMessage(refusalOf(e)),
    });
  };
  return (
    <Page word={FL.crewLeave} testId="crew-leave" payload={q.data} error={q.isError}>
      {message ? <p role="alert" className="px-4 pb-2 text-body">{message}</p> : null}
      <DataGrid rows={q.data?.leave ?? []} columns={columns} rowKey={(r) => r.id} storageKey="carres.operation.crew-leave.v1"
        appearance="reference" exportName={FL.crewLeave} groupBanner={false} isLoading={!q.isSuccess && !q.isError}
        emptyMessage={FL.noLeave}
        toolbarStart={
          <span className="flex items-center gap-2" data-testid="crew-leave-form">
            <Select id="crew-leave-crew" toolbar placeholder={FL.crew} value={form.crewId || undefined}
              onValueChange={(v) => setForm((f) => ({ ...f, crewId: v }))}
              options={crew.filter((c) => c.active).map((c) => ({ value: c.id, label: `${c.name} (${c.role === "helper" ? FL.helper : FL.driver})` }))} />
            <input type="date" aria-label={FL.from} className={dateInput} value={form.fromDate} onChange={(e) => setForm((f) => ({ ...f, fromDate: e.target.value }))} />
            <input type="date" aria-label={FL.to} className={dateInput} value={form.toDate} onChange={(e) => setForm((f) => ({ ...f, toDate: e.target.value }))} />
            <input aria-label={FL.reason} placeholder={FL.reason} maxLength={200} className={dateInput} value={form.reason} onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))} />
            <Button size="sm" variant="primary" disabled={!form.crewId || !form.reason.trim() || form.toDate < form.fromDate}
              loading={write.isPending} onClick={add} data-testid="crew-leave-add">{FL.addLeave}</Button>
          </span>
        } />
    </Page>
  );
}

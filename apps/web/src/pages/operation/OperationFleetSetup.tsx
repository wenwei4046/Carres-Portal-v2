import { useMemo, useState } from "react";
import { dueFlag, formatSofaBands, parseSofaBands, worstFlag, zoneForPostcode, type DueFlag, type FleetCrew, type RateCard } from "@carres/shared/fleet";
import ListPageShell from "@/components/ListPageShell";
import { DataGrid, type DataGridColumn } from "@/components/register/DataGrid";
import Button from "@/components/kit/Button";
import Select from "@/components/kit/Select";
import StatusPill from "@/components/kit/StatusPill";
import { MY_ADDRESS } from "@/data/malaysia-postcodes";
import { appTodayIso } from "@/lib/fmt-date";
import { rm } from "@/lib/format-currency";
import { useDeliverySettings } from "@/lib/queries";
import ModuleHeader from "./components/ModuleHeader";
import { ApiError } from "@/lib/api";
import {
  FL, refusalOf, useFleet, useFleetWrite, usePricing, useReconcile, useSettingsWrite, type FleetPayload, type PricingPayload, type ReconcileRow,
} from "./fleet";

/**
 * 0725 — Fleet, Fleet Health, Delivery Zones and Rate Cards. Weisiang's
 * decision (Mr Lim, WhatsApp 2026-10-22): build the Houzs way (Houzs Fleet,
 * FleetHealth, DeliveryZones, DeliveryRateCards). Jess was not part of this
 * decision; the Delivery MASTER rules it overturns are marked there (§15.3).
 *
 * Fleet edits the SAME rows as Settings → Logistics → Carres Lorries →
 * Vehicles and Drivers (0724 tables, the Settings doors); every other
 * Logistics company keeps its own lists in Settings.
 */

const field = "h-8 rounded-md border border-border bg-background px-2 text-body";
const stop = (e: React.MouseEvent) => e.stopPropagation();

function Shell({ word, testId, failed, children }: { word: string; testId: string; failed: boolean; children: React.ReactNode }) {
  return (
    <div className="flex h-full min-h-0 flex-col" data-testid={testId}>
      <ModuleHeader destinationHeader testId={`${testId}-destination-header`} word={word} docTitle={`${word} · Carres`} />
      {failed ? <p role="alert" className="p-4 text-body">{FL.failed}</p> : <ListPageShell register>{children}</ListPageShell>}
    </div>
  );
}

const Refusal = ({ text }: { text: string | null }) =>
  text ? <p role="alert" className="px-4 pb-2 text-body">{text}</p> : null;

const useCanEdit = () => useDeliverySettings().data?.canEdit === true;

/* ── Fleet (Houzs Fleet: lorries + drivers and helpers on one page) ─────── */

type Lorry = FleetPayload["lorries"][number];
const EMPTY_LORRY = { id: null as string | null, plate: "", vehicleType: "Lorry", capacity: "" };
const EMPTY_CREW = { id: null as string | null, name: "", phone: "", role: "driver" as "driver" | "helper" };

export function FleetPage() {
  const q = useFleet(appTodayIso());
  const write = useSettingsWrite();
  const canEdit = useCanEdit();
  const [view, setView] = useState<"lorries" | "crew">("lorries");
  const [lorry, setLorry] = useState(EMPTY_LORRY);
  const [crew, setCrew] = useState(EMPTY_CREW);
  const [message, setMessage] = useState<string | null>(null);
  const partnerId = q.data?.company?.id ?? null;

  const saveLorry = (l: Lorry | null, patch: { plate: string; vehicleType: string; capacity: string; active: boolean }) => {
    if (!partnerId) return;
    setMessage(null);
    write.mutate({ path: "/partner/vehicle", body: {
      partnerId, vehicleId: l?.id ?? null, plate: patch.plate, vehicleType: patch.vehicleType, capacity: patch.capacity || null,
      // the Settings template driver rides along unchanged
      driverName: l?.templateDriverName ?? null, driverPhone: l?.templateDriverPhone ?? null, active: patch.active,
    } }, { onSuccess: () => setLorry(EMPTY_LORRY), onError: (e) => setMessage(refusalOf(e)) });
  };
  const saveCrew = (c: FleetCrew | null, patch: { name: string; phone: string; role: "driver" | "helper"; active: boolean }) => {
    if (!partnerId) return;
    setMessage(null);
    write.mutate({ path: "/partner/driver", body: {
      partnerId, driverId: c?.id ?? null, name: patch.name, phone: patch.phone || null, role: patch.role, active: patch.active,
    } }, { onSuccess: () => setCrew(EMPTY_CREW), onError: (e) => setMessage(refusalOf(e)) });
  };

  const statusCell = (active: boolean) => <StatusPill tone={active ? "success" : "neutral"}>{active ? FL.active : FL.inactive}</StatusPill>;
  const lorryCols: DataGridColumn<Lorry>[] = [
    { key: "plate", label: FL.plate, width: 140, accessor: (r) => r.plate },
    { key: "capacity", label: FL.lorryCapacity, width: 120, accessor: (r) => r.capacity ?? "" },
    { key: "type", label: FL.vehicleType, width: 120, accessor: (r) => r.vehicleType },
    { key: "status", label: FL.status, width: 110, accessor: (r) => statusCell(r.active), exportValue: (r) => (r.active ? FL.active : FL.inactive) },
    ...(canEdit ? [{ key: "act", label: "", exportLabel: FL.edit, width: 200, sortable: false, filterable: false, accessor: (r: Lorry) => (
      <span className="flex gap-2" onClick={stop}>
        <Button size="sm" onClick={() => setLorry({ id: r.id, plate: r.plate, vehicleType: r.vehicleType, capacity: r.capacity ?? "" })}>{FL.edit}</Button>
        <Button size="sm" onClick={() => saveLorry(r, { plate: r.plate, vehicleType: r.vehicleType, capacity: r.capacity ?? "", active: !r.active })}>
          {r.active ? FL.deactivate : FL.activate}
        </Button>
      </span>
    ) } satisfies DataGridColumn<Lorry>] : []),
  ];
  const crewCols: DataGridColumn<FleetCrew>[] = [
    { key: "name", label: FL.name, width: 180, accessor: (r) => r.name },
    { key: "role", label: FL.role, width: 100, accessor: (r) => (r.role === "helper" ? FL.helper : FL.driver) },
    { key: "phone", label: FL.phone, width: 150, accessor: (r) => r.phone ?? "" },
    { key: "status", label: FL.status, width: 110, accessor: (r) => statusCell(r.active), exportValue: (r) => (r.active ? FL.active : FL.inactive) },
    ...(canEdit ? [{ key: "act", label: "", exportLabel: FL.edit, width: 200, sortable: false, filterable: false, accessor: (r: FleetCrew) => (
      <span className="flex gap-2" onClick={stop}>
        <Button size="sm" onClick={() => setCrew({ id: r.id, name: r.name, phone: r.phone ?? "", role: r.role })}>{FL.edit}</Button>
        <Button size="sm" onClick={() => saveCrew(r, { name: r.name, phone: r.phone ?? "", role: r.role, active: !r.active })}>
          {r.active ? FL.deactivate : FL.activate}
        </Button>
      </span>
    ) } satisfies DataGridColumn<FleetCrew>] : []),
  ];

  const viewPicker = (
    <Select id="fleet-view" toolbar value={view} onValueChange={(v) => setView(v === "crew" ? "crew" : "lorries")}
      options={[{ value: "lorries", label: FL.lorries }, { value: "crew", label: FL.crew }]} />
  );
  const lorryForm = canEdit && partnerId ? (
    <span className="flex items-center gap-2" data-testid="fleet-lorry-form">
      <input aria-label={FL.plate} placeholder={FL.plate} maxLength={20} className={field} value={lorry.plate} onChange={(e) => setLorry({ ...lorry, plate: e.target.value })} />
      <input aria-label={FL.lorryCapacity} placeholder={FL.lorryCapacity} maxLength={60} className={field} value={lorry.capacity} onChange={(e) => setLorry({ ...lorry, capacity: e.target.value })} />
      <input aria-label={FL.vehicleType} placeholder={FL.vehicleType} maxLength={60} className={field} value={lorry.vehicleType} onChange={(e) => setLorry({ ...lorry, vehicleType: e.target.value })} />
      <Button size="sm" variant="primary" disabled={!lorry.plate.trim() || !lorry.vehicleType.trim()} loading={write.isPending}
        onClick={() => { const l = q.data?.lorries.find((x) => x.id === lorry.id) ?? null; saveLorry(l, { ...lorry, active: l?.active ?? true }); }}>
        {lorry.id ? FL.save : FL.addLorry}
      </Button>
      {lorry.id ? <Button size="sm" onClick={() => setLorry(EMPTY_LORRY)}>{FL.cancel}</Button> : null}
    </span>
  ) : null;
  const crewForm = canEdit && partnerId ? (
    <span className="flex items-center gap-2" data-testid="fleet-crew-form">
      <input aria-label={FL.name} placeholder={FL.name} maxLength={120} className={field} value={crew.name} onChange={(e) => setCrew({ ...crew, name: e.target.value })} />
      <input aria-label={FL.phone} placeholder={FL.phone} maxLength={40} className={field} value={crew.phone} onChange={(e) => setCrew({ ...crew, phone: e.target.value })} />
      <Select id="fleet-crew-role" toolbar value={crew.role} onValueChange={(v) => setCrew({ ...crew, role: v === "helper" ? "helper" : "driver" })}
        options={[{ value: "driver", label: FL.driver }, { value: "helper", label: FL.helper }]} />
      <Button size="sm" variant="primary" disabled={!crew.name.trim()} loading={write.isPending}
        onClick={() => { const c = q.data?.crew.find((x) => x.id === crew.id) ?? null; saveCrew(c, { ...crew, active: c?.active ?? true }); }}>
        {crew.id ? FL.save : FL.addCrew}
      </Button>
      {crew.id ? <Button size="sm" onClick={() => setCrew(EMPTY_CREW)}>{FL.cancel}</Button> : null}
    </span>
  ) : null;

  return (
    <Shell word={FL.fleet} testId="fleet" failed={q.isError}>
      {q.data && !q.data.company ? <p className="p-4 text-body">{FL.noOwnFleet}</p> : null}
      <Refusal text={message} />
      {view === "lorries" ? (
        <DataGrid rows={q.data?.lorries ?? []} columns={lorryCols} rowKey={(r) => r.id} storageKey="carres.operation.fleet-lorries.v1"
          appearance="reference" exportName={FL.lorries} groupBanner={false} isLoading={!q.isSuccess && !q.isError}
          toolbarStart={<span className="flex items-center gap-2">{viewPicker}{lorryForm}</span>} emptyMessage={FL.noLorries} />
      ) : (
        <DataGrid rows={q.data?.crew ?? []} columns={crewCols} rowKey={(r) => r.id} storageKey="carres.operation.fleet-crew.v1"
          appearance="reference" exportName={FL.crew} groupBanner={false} isLoading={!q.isSuccess && !q.isError}
          toolbarStart={<span className="flex items-center gap-2">{viewPicker}{crewForm}</span>} emptyMessage={FL.noCrew} />
      )}
    </Shell>
  );
}

/* ── Fleet Health (Houzs FleetHealth: PUSPAKOM, road tax, insurance, service) ── */

const DUE_KEYS = ["puspakomDue", "roadTaxDue", "insuranceDue", "serviceDue"] as const;
type DueKey = (typeof DUE_KEYS)[number];
const DUE_WORD: Record<DueKey, string> = { puspakomDue: FL.puspakom, roadTaxDue: FL.roadTax, insuranceDue: FL.insurance, serviceDue: FL.service };
const FLAG: Record<DueFlag, { word: string; tone: "danger" | "warning" | "success" | "neutral" }> = {
  overdue: { word: FL.overdue, tone: "danger" },
  due_soon: { word: FL.dueSoon, tone: "warning" },
  ok: { word: FL.ok, tone: "success" },
  not_recorded: { word: FL.notRecorded, tone: "neutral" },
};

export function FleetHealthPage() {
  const today = appTodayIso();
  const q = useFleet(today);
  const write = useFleetWrite();
  const [edits, setEdits] = useState<Record<string, Partial<Record<DueKey, string>>>>({});
  const [message, setMessage] = useState<string | null>(null);
  const lorries = useMemo(() => (q.data?.lorries ?? []).filter((l) => l.active), [q.data]);
  const value = (l: Lorry, k: DueKey) => edits[l.id]?.[k] ?? l[k] ?? "";
  const flagOf = (l: Lorry) => worstFlag(DUE_KEYS.map((k) => dueFlag(value(l, k) || null, today)));

  const save = (l: Lorry) => {
    setMessage(null);
    const body = Object.fromEntries(DUE_KEYS.map((k) => [k, value(l, k) || null]));
    write.mutate({ path: "/health", body: { vehicleId: l.id, ...body } }, {
      onSuccess: () => setEdits(({ [l.id]: _done, ...rest }) => rest),
      onError: (e) => setMessage(refusalOf(e)),
    });
  };

  const columns: DataGridColumn<Lorry>[] = [
    { key: "plate", label: FL.lorry, width: 140, accessor: (r) => r.plate },
    { key: "flag", label: FL.status, width: 120, accessor: (r) => <StatusPill tone={FLAG[flagOf(r)].tone}>{FLAG[flagOf(r)].word}</StatusPill>,
      exportValue: (r) => FLAG[flagOf(r)].word },
    ...DUE_KEYS.map((k): DataGridColumn<Lorry> => ({
      key: k, label: DUE_WORD[k], width: 190, sortable: false, filterable: false, exportValue: (r) => r[k] ?? "",
      accessor: (r) => {
        const f = dueFlag(value(r, k) || null, today);
        return (
          <span className="flex items-center gap-2" onClick={stop}>
            <input type="date" aria-label={`${DUE_WORD[k]} ${r.plate}`} className={field} value={value(r, k)}
              onChange={(e) => setEdits((s) => ({ ...s, [r.id]: { ...s[r.id], [k]: e.target.value } }))} />
            {f === "overdue" || f === "due_soon" ? <StatusPill tone={FLAG[f].tone}>{FLAG[f].word}</StatusPill> : null}
          </span>
        );
      },
    })),
    { key: "act", label: "", exportLabel: FL.save, width: 100, sortable: false, filterable: false, accessor: (r) => edits[r.id] ? (
      <Button size="sm" variant="primary" loading={write.isPending} onClick={(e) => { e.stopPropagation(); save(r); }}>{FL.save}</Button>
    ) : "" },
  ];

  return (
    <Shell word={FL.fleetHealth} testId="fleet-health" failed={q.isError}>
      <Refusal text={message} />
      <DataGrid rows={lorries} columns={columns} rowKey={(r) => r.id} storageKey="carres.operation.fleet-health.v1"
        appearance="reference" exportName={FL.fleetHealth} groupBanner={false} isLoading={!q.isSuccess && !q.isError}
        emptyMessage={FL.noLorries}
        statusSummary={(v) => `${v.filter((l) => flagOf(l) === "overdue").length} ${FL.overdue.toLowerCase()} · ${v.filter((l) => flagOf(l) === "due_soon").length} ${FL.dueSoon.toLowerCase()}`} />
    </Shell>
  );
}

/* ── Delivery Zones (Houzs DeliveryZones: a postcode map, narrowest range wins) ── */

/** The post town and state of a postcode, from the address list the order pickers use. */
function townOf(postcode: string): string | null {
  for (const [state, towns] of Object.entries(MY_ADDRESS)) {
    for (const [town, codes] of Object.entries(towns)) if (codes.includes(postcode)) return `${town}, ${state}`;
  }
  return null;
}

type Zone = PricingPayload["zones"][number];

export function DeliveryZonesPage() {
  const q = usePricing();
  const write = useFleetWrite();
  const canEdit = useCanEdit();
  const [form, setForm] = useState({ id: null as string | null, name: "", postcodes: "" });
  const [lookup, setLookup] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const zones = q.data?.zones ?? [];
  const found = /^\d{5}$/.test(lookup) ? zoneForPostcode(lookup, zones) : null;

  const save = () => {
    setMessage(null);
    write.mutate({ path: "/zones", body: { id: form.id, name: form.name, postcodes: form.postcodes.split(/[\s,]+/).filter(Boolean) } }, {
      onSuccess: () => setForm({ id: null, name: "", postcodes: "" }),
      onError: (e) => setMessage(refusalOf(e)),
    });
  };

  const columns: DataGridColumn<Zone>[] = [
    { key: "name", label: FL.zone, width: 160, accessor: (r) => r.name },
    { key: "postcodes", label: FL.postcodes, width: 360, accessor: (r) => r.postcodes.join(", ") },
    ...(canEdit ? [{ key: "act", label: "", exportLabel: FL.edit, width: 200, sortable: false, filterable: false, accessor: (r: Zone) => (
      <span className="flex gap-2" onClick={stop}>
        <Button size="sm" onClick={() => setForm({ id: r.id, name: r.name, postcodes: r.postcodes.join(", ") })}>{FL.edit}</Button>
        <Button size="sm" onClick={() => {
          // Asks first. Follows Houzs frontend/src/pages/scm-v2/DeliveryZones.tsx:93-98 per Weisiang's ruling (2026-10-22): clear Carres rules, implement Houzs.
          if (!window.confirm(`Remove zone ${r.name}? Its postcodes will have no zone. You can add it again later.`)) return;
          write.mutate({ path: `/zones/${r.id}`, method: "DELETE" }, { onError: (e) => setMessage(refusalOf(e)) });
        }}>{FL.remove}</Button>
      </span>
    ) } satisfies DataGridColumn<Zone>] : []),
  ];

  return (
    <Shell word={FL.zones} testId="delivery-zones" failed={q.isError}>
      <div className="flex flex-wrap items-center gap-2 px-4 pb-2" data-testid="delivery-zones-lookup">
        <label className="text-body" htmlFor="zone-lookup">{FL.findZone}</label>
        <input id="zone-lookup" inputMode="numeric" maxLength={5} placeholder={FL.postcode} className={field} value={lookup}
          onChange={(e) => setLookup(e.target.value.replace(/\D/g, ""))} />
        {/^\d{5}$/.test(lookup) ? (
          <span className="text-body" data-testid="delivery-zones-answer">
            {found ? `${FL.zone} ${found.name}` : FL.noZone} · {townOf(lookup) ?? FL.notInAddressList}
          </span>
        ) : null}
      </div>
      <Refusal text={message} />
      <DataGrid rows={zones} columns={columns} rowKey={(r) => r.id} storageKey="carres.operation.delivery-zones.v1"
        appearance="reference" exportName={FL.zones} groupBanner={false} isLoading={!q.isSuccess && !q.isError}
        emptyMessage={FL.noZones}
        toolbarStart={canEdit ? (
          <span className="flex items-center gap-2" data-testid="delivery-zones-form">
            <input aria-label={FL.zone} placeholder={FL.zone} maxLength={60} className={field} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            <input aria-label={FL.postcodes} placeholder={FL.postcodesHint} className={`${field} w-72`} value={form.postcodes} onChange={(e) => setForm({ ...form, postcodes: e.target.value })} />
            <Button size="sm" variant="primary" disabled={!form.name.trim()} loading={write.isPending} onClick={save}>{form.id ? FL.save : FL.addZone}</Button>
            {form.id ? <Button size="sm" onClick={() => setForm({ id: null, name: "", postcodes: "" })}>{FL.cancel}</Button> : null}
          </span>
        ) : undefined} />
    </Shell>
  );
}

/* ── Rate Cards (Houzs DeliveryRateCards: 1st / 2nd / each further unit per zone, cap and overage,
   sofa compartment bands, service / pickup / disposal, minimum; and the Reconciliation tab). Follows Houzs
   frontend/src/pages/scm-v2/DeliveryRateCards.tsx:83-159 per Weisiang's ruling (2026-10-22): clear Carres
   rules, implement Houzs. ── */

const EMPTY_RATE = {
  id: null as string | null, zoneId: "all", basis: "item", firstUnit: "", secondUnit: "", furtherUnit: "", minCharge: "0",
  overageCap: "", overageEach: "0", sofaBands: "", serviceCharge: "0", pickupCharge: "0", disposalCharge: "0",
};
type MoneyKey = "firstUnit" | "secondUnit" | "furtherUnit" | "minCharge" | "overageEach" | "serviceCharge" | "pickupCharge" | "disposalCharge";
const MONEY_KEYS: MoneyKey[] = ["firstUnit", "secondUnit", "furtherUnit", "minCharge", "overageEach", "serviceCharge", "pickupCharge", "disposalCharge"];

export function RateCardsPage() {
  const [view, setView] = useState<"cards" | "reconcile">("cards");
  const switcher = (
    <Select id="rate-view" toolbar value={view} onValueChange={(v) => setView(v === "reconcile" ? "reconcile" : "cards")}
      options={[{ value: "cards", label: FL.rateCards }, { value: "reconcile", label: FL.reconciliation }]} />
  );
  return view === "cards" ? <RateCardsView switcher={switcher} /> : <ReconcileView switcher={switcher} />;
}

function RateCardsView({ switcher }: { switcher: React.ReactNode }) {
  const q = usePricing();
  const write = useFleetWrite();
  const canEdit = useCanEdit();
  const companies = (q.data?.companies ?? []).filter((c) => c.active);
  const [picked, setPicked] = useState<string | null>(null);
  const partnerId = picked ?? companies.find((c) => c.ownFleet)?.id ?? companies[0]?.id ?? null;
  const [form, setForm] = useState(EMPTY_RATE);
  const [message, setMessage] = useState<string | null>(null);
  const zoneName = (id: string | null) => (id ? q.data?.zones.find((z) => z.id === id)?.name ?? "" : FL.everyOtherZone);
  const rows = (q.data?.rates ?? []).filter((r) => r.partnerId === partnerId).sort((a, b) => zoneName(a.zoneId).localeCompare(zoneName(b.zoneId)));
  const num = (s: string) => Number(s);
  const bands = parseSofaBands(form.sofaBands);
  const capOk = form.overageCap.trim() === "" || (Number.isInteger(num(form.overageCap)) && num(form.overageCap) >= 1);
  const ready = MONEY_KEYS.every((k) => form[k].trim() !== "" && num(form[k]) >= 0) && capOk && bands !== null;

  const save = () => {
    if (!partnerId || !bands) return;
    setMessage(null);
    const money = Object.fromEntries(MONEY_KEYS.map((k) => [k, num(form[k])]));
    write.mutate({ path: "/rates", body: {
      id: form.id, partnerId, zoneId: form.zoneId === "all" ? null : form.zoneId, basis: form.basis, ...money,
      overageCap: form.overageCap.trim() === "" ? null : num(form.overageCap), sofaBrackets: bands,
    } }, { onSuccess: () => setForm(EMPTY_RATE), onError: (e) => setMessage(refusalOf(e)) });
  };
  const edit = (r: RateCard) => setForm({
    id: r.id, zoneId: r.zoneId ?? "all", basis: r.basis, overageCap: r.overageCap == null ? "" : String(r.overageCap),
    sofaBands: formatSofaBands(r.sofaBrackets),
    ...(Object.fromEntries(MONEY_KEYS.map((k) => [k, String(r[k])])) as Record<MoneyKey, string>),
  });

  const moneyCol = (key: MoneyKey, label: string, width = 110): DataGridColumn<RateCard> =>
    ({ key, label, width, align: "right", accessor: (r) => rm(r[key]), numberValue: (r) => r[key] });
  const columns: DataGridColumn<RateCard>[] = [
    { key: "zone", label: FL.zone, width: 160, accessor: (r) => zoneName(r.zoneId) },
    { key: "basis", label: FL.basis, width: 130, accessor: (r) => (r.basis === "order" ? FL.perOrder : FL.perItem) },
    moneyCol("firstUnit", FL.firstUnit),
    moneyCol("secondUnit", FL.secondUnit),
    moneyCol("furtherUnit", FL.furtherUnit, 130),
    { key: "cap", label: FL.overageCap, width: 90, align: "right", accessor: (r) => (r.overageCap == null ? "" : String(r.overageCap)), numberValue: (r) => r.overageCap ?? 0 },
    moneyCol("overageEach", FL.overageEach, 130),
    { key: "sofa", label: FL.sofaBands, width: 180, accessor: (r) => formatSofaBands(r.sofaBrackets) },
    moneyCol("serviceCharge", FL.serviceCharge),
    moneyCol("pickupCharge", FL.pickupCharge),
    moneyCol("disposalCharge", FL.disposalCharge),
    moneyCol("minCharge", FL.minCharge),
    ...(canEdit ? [{ key: "act", label: "", exportLabel: FL.edit, width: 200, sortable: false, filterable: false, accessor: (r: RateCard) => (
      <span className="flex gap-2" onClick={stop}>
        <Button size="sm" onClick={() => edit(r)}>{FL.edit}</Button>
        <Button size="sm" onClick={() => write.mutate({ path: `/rates/${r.id}`, method: "DELETE" }, { onError: (e) => setMessage(refusalOf(e)) })}>{FL.remove}</Button>
      </span>
    ) } satisfies DataGridColumn<RateCard>] : []),
  ];
  const input = (k: MoneyKey | "overageCap", word: string, w = "w-24") => (
    <input type="number" min={0} step="0.01" aria-label={word} placeholder={word} className={`${field} ${w}`} value={form[k]}
      onChange={(e) => setForm({ ...form, [k]: e.target.value })} />
  );

  return (
    <Shell word={FL.rateCards} testId="rate-cards" failed={q.isError}>
      <Refusal text={message ?? (bands === null ? FL.sofaBandsBad : null)} />
      <DataGrid rows={rows} columns={columns} rowKey={(r) => r.id} storageKey="carres.operation.rate-cards.v2"
        appearance="reference" exportName={FL.rateCards} groupBanner={false} isLoading={!q.isSuccess && !q.isError}
        emptyMessage={FL.noRates}
        toolbarStart={
          <span className="flex flex-wrap items-center gap-2" data-testid="rate-cards-form">
            {switcher}
            <Select id="rate-company" toolbar placeholder={FL.company} value={partnerId ?? undefined}
              onValueChange={(v) => { setPicked(v); setForm(EMPTY_RATE); }} options={companies.map((c) => ({ value: c.id, label: c.name }))} />
            {canEdit && partnerId ? (
              <>
                <Select id="rate-zone" toolbar value={form.zoneId} onValueChange={(v) => setForm({ ...form, zoneId: v })}
                  options={[{ value: "all", label: FL.everyOtherZone }, ...(q.data?.zones ?? []).map((z) => ({ value: z.id, label: z.name }))]} />
                <Select id="rate-basis" toolbar value={form.basis} onValueChange={(v) => setForm({ ...form, basis: v })}
                  options={[{ value: "item", label: FL.perItem }, { value: "order", label: FL.perOrder }]} />
                {input("firstUnit", FL.firstUnit)}
                {input("secondUnit", FL.secondUnit)}
                {input("furtherUnit", FL.furtherUnit)}
                {input("overageCap", FL.overageCap, "w-16")}
                {input("overageEach", FL.overageEach)}
                <input type="text" aria-label={FL.sofaBands} placeholder={`${FL.sofaBands}: ${FL.sofaBandsHint}`} className={`${field} w-48`}
                  value={form.sofaBands} onChange={(e) => setForm({ ...form, sofaBands: e.target.value })} />
                {input("serviceCharge", FL.serviceCharge)}
                {input("pickupCharge", FL.pickupCharge)}
                {input("disposalCharge", FL.disposalCharge)}
                {input("minCharge", FL.minCharge)}
                <Button size="sm" variant="primary" disabled={!ready} loading={write.isPending} onClick={save}>{form.id ? FL.save : FL.addRate}</Button>
                {form.id ? <Button size="sm" onClick={() => setForm(EMPTY_RATE)}>{FL.cancel}</Button> : null}
              </>
            ) : null}
          </span>
        } />
    </Shell>
  );
}

/* Reconciliation: each delivery order on a live Logistics bill, billed vs the rate card's charge.
   Follows Houzs frontend/src/pages/scm-v2/DeliveryRateCards.tsx:615-680 per Weisiang's ruling (2026-10-22):
   clear Carres rules, implement Houzs. */
function ReconcileView({ switcher }: { switcher: React.ReactNode }) {
  const [range, setRange] = useState({ from: "", to: "" });
  const q = useReconcile(range);
  const refused = q.error instanceof ApiError && q.error.status === 403;
  const status = (r: ReconcileRow) => (r.expected == null ? FL.noCard : r.difference === 0 ? FL.match : FL.mismatch);
  const columns: DataGridColumn<ReconcileRow>[] = [
    { key: "do", label: FL.doNo, width: 140, accessor: (r) => r.doNo },
    { key: "date", label: FL.date, width: 110, accessor: (r) => r.deliveryDate ?? "" },
    { key: "company", label: FL.company, width: 160, accessor: (r) => r.company },
    { key: "bill", label: FL.bill, width: 140, accessor: (r) => r.bills.join(", ") },
    { key: "zone", label: FL.zone, width: 120, accessor: (r) => r.zone ?? FL.noZone },
    { key: "items", label: FL.items, width: 80, align: "right", accessor: (r) => String(r.items), numberValue: (r) => r.items },
    { key: "sofas", label: FL.sofas, width: 80, align: "right", accessor: (r) => String(r.sofas), numberValue: (r) => r.sofas },
    { key: "expected", label: FL.expected, width: 130, align: "right", accessor: (r) => (r.expected == null ? "" : rm(r.expected)), numberValue: (r) => r.expected ?? 0 },
    { key: "billed", label: FL.billed, width: 120, align: "right", accessor: (r) => rm(r.billed), numberValue: (r) => r.billed },
    { key: "diff", label: FL.difference, width: 120, align: "right", accessor: (r) => (r.difference == null ? "" : rm(r.difference)), numberValue: (r) => r.difference ?? 0 },
    { key: "status", label: FL.status, width: 130, accessor: (r) => (
      <StatusPill tone={r.expected == null ? "neutral" : r.difference === 0 ? "success" : "danger"}>{status(r)}</StatusPill>
    ) },
  ];
  const date = (k: "from" | "to", word: string) => (
    <input type="date" aria-label={word} className={field} value={range[k]} onChange={(e) => setRange({ ...range, [k]: e.target.value })} />
  );
  return (
    <Shell word={FL.rateCards} testId="rate-reconcile" failed={q.isError && !refused}>
      <Refusal text={refused ? FL.reconRefused : null} />
      <p className="px-4 pb-2 text-body">{FL.reconNote}</p>
      <DataGrid rows={q.data?.rows ?? []} columns={columns} rowKey={(r) => r.doId} storageKey="carres.operation.rate-reconcile.v1"
        appearance="reference" exportName={FL.reconciliation} groupBanner={false} isLoading={q.isLoading}
        emptyMessage={FL.noBilled}
        toolbarStart={<span className="flex flex-wrap items-center gap-2">{switcher}{date("from", FL.from)}{date("to", FL.to)}</span>} />
    </Shell>
  );
}

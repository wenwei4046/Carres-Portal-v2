import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import ListPageShell from "@/components/ListPageShell";
import { DataGrid, type DataGridColumn } from "@/components/register/DataGrid";
import Button from "@/components/kit/Button";
import DatePicker from "@/components/kit/DatePicker";
import Input from "@/components/kit/Input";
import Modal from "@/components/kit/Modal";
import Select from "@/components/kit/Select";
import Tabs from "@/components/kit/Tabs";
import Textarea from "@/components/kit/Textarea";
import { FieldError } from "@/components/kit/FieldFrame";
import ModuleHeader from "@/pages/operation/components/ModuleHeader";
import CouldNotLoad from "@/pages/operation/components/CouldNotLoad";
import { Link } from "react-router-dom";
import { ApiError, apiFetch } from "@/lib/api";
import { appTodayIso, fmtDate } from "@/lib/fmt-date";
import { useDeliveryDays } from "@/lib/deadline-queries";
import {
  OWN_LORRY, carrierOf, companyDateAgreed, fillTimeSlots, ownFleetOf, planRows, planStatus, proposeDates, tripsOf,
  type PlanFeed, type PlanRegion, type PlanRow,
} from "./delivery-planning";

/**
 * Delivery Planning · DP Orders · Auto-schedule · Trips (migration 0723).
 *
 * Weisiang's decision (Mr Lim, Houzs owner side, WhatsApp 2026-10-22): office
 * staff plan delivery dates and trips with a time slot for every stop, the
 * Houzs way. This overturns Jess's Delivery MASTER §8 (no Trips / Regions /
 * Schedule destination), §14.3 (no automatic allocation or ordered stops) and
 * §10's rejection of mandatory time slots; Jess was not part of this decision.
 * A trip is one day + one carrier (a Logistics company, or Carres's own lorry =
 * the own-fleet company Carres Lorries, YH 2026-10-23).
 * For a Logistics company the date written is the planned date: the company
 * may still change it, and its own scheduled date wins.
 */

const BASE = "/api/operation/delivery-planning";
type Feed = PlanFeed & {
  closedOrders: { id: string; so: number | null; customer_name: string | null }[];
  cancelled: { id: string; order_id: string; leg: number; note: string | null; recorded_at: string; from_partner_id: string | null }[];
};
const send = <T,>(path: string, body: unknown, method = "POST") =>
  apiFetch<T>(`${BASE}${path}`, { method, body: JSON.stringify(body) });
const errorText = (e: unknown) => (e instanceof Error ? e.message : "Could not save. Try again.");

function usePlan() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["delivery-planning"], queryFn: () => apiFetch<Feed>(BASE) });
  const rows = useMemo(() => (q.data ? planRows(q.data) : []), [q.data]);
  const refresh = () => qc.invalidateQueries({ queryKey: ["delivery-planning"] });
  return { q, rows, refresh };
}

function Page({ word, testId, children }: { word: string; testId: string; children: React.ReactNode }) {
  return (
    <div className="flex h-full min-h-0 flex-col" data-testid={testId}>
      <ModuleHeader destinationHeader testId={`${testId}-header`} word={word} docTitle={`${word} · Delivery · Carres`} />
      {children}
    </div>
  );
}

const loadError = (retry: () => unknown) => <CouldNotLoad detail="The delivery plan could not be loaded." onRetry={() => void retry()} />;

const baseColumns: DataGridColumn<PlanRow>[] = [
  { key: "so", label: "SO No", width: 130, accessor: (r) => r.so },
  { key: "do", label: "DO No", width: 150, accessor: (r) => r.doNumber ?? "" },
  { key: "customer", label: "Customer", width: 190, accessor: (r) => r.customer },
  { key: "location", label: "Delivery Location", width: 190, accessor: (r) => r.location },
  { key: "region", label: "Region", width: 140, accessor: (r) => r.region, filterType: "enum", groupable: true, groupValue: (r) => r.region },
];
const ruleColumns: DataGridColumn<PlanRow>[] = [
  { key: "building", label: "Building type", width: 120, accessor: (r) => r.buildingType, filterType: "enum" },
  { key: "rule", label: "Residence rule", width: 260, accessor: (r) => r.rule, wrap: true },
];
const dayColumn: DataGridColumn<PlanRow> = {
  key: "day", label: "Delivery date", width: 130, accessor: (r) => (r.day ? fmtDate(r.day) : ""), dateValue: (r) => r.day, filterType: "date",
  groupable: true, groupValue: (r) => (r.day ? fmtDate(r.day) : "Waiting for a date"),
};
const requestedColumn: DataGridColumn<PlanRow> = {
  key: "requested", label: "Requested Delivery Date", width: 150, accessor: (r) => (r.requested ? fmtDate(r.requested) : ""), dateValue: (r) => r.requested, filterType: "date",
};
const carrierColumn: DataGridColumn<PlanRow> = { key: "carrier", label: "Lorry or Logistics", width: 180, accessor: (r) => r.carrier, filterType: "enum" };
const slotColumn: DataGridColumn<PlanRow> = { key: "slot", label: "Time slot", width: 120, accessor: (r) => r.timeSlot ?? (r.day ? "No time slot" : "") };
const statusColumn: DataGridColumn<PlanRow> = { key: "status", label: "Status", width: 220, accessor: planStatus, filterType: "enum" };

/** The one date form: Delivery Planning's row, and DP Orders' New DP Order. */
function PlanForm({ feed, row, onClose, onSaved }: { feed: Feed; row: PlanRow | "new"; onClose: () => void; onSaved: () => void }) {
  const isNew = row === "new";
  const [doNumber, setDoNumber] = useState("");
  const [date, setDate] = useState<string | null>(isNew ? null : row.day);
  const own = ownFleetOf(feed.companies);
  const [carrier, setCarrier] = useState(isNew ? "" : row.partnerId ?? "");
  const [vehicle, setVehicle] = useState(isNew ? "" : row.vehicle ?? "");
  const [slot, setSlot] = useState(isNew ? "" : row.timeSlot ?? "");
  const companyFixed = !isNew && row.partnerId !== null;
  const save = useMutation({
    mutationFn: () => {
      const body = { date, partnerId: carrier || null, vehicle: vehicle || null, timeSlot: slot || null };
      return isNew ? send("/jobs", { ...body, doNumber }) : send("/date", { ...body, orderId: row.orderId, leg: row.leg });
    },
    onSuccess: () => { onSaved(); onClose(); },
  });
  // `Own lorry` is saved as the Carres Lorries company, looked up by own_fleet.
  const options = [
    ...(own ? [{ value: own.id, label: OWN_LORRY }] : []),
    ...feed.companies.filter((c) => !c.own_fleet).map((c) => ({ value: c.id, label: c.name })),
  ];
  return (
    <Modal open onOpenChange={(o) => !o && onClose()} title={isNew ? "New DP Order" : `Delivery date · ${row.so}`}
      footer={<>
        <Button variant="neutral" onClick={onClose}>Close</Button>
        <Button variant="primary" loading={save.isPending} disabled={!date || !carrier || (isNew && !doNumber.trim())} onClick={() => save.mutate()}>Save</Button>
      </>}>
      <div className="flex flex-col gap-3">
        {isNew && <Input id="plan-do" label="DO No" required value={doNumber} onChange={(e) => setDoNumber(e.target.value)} />}
        <DatePicker id="plan-date" label="Delivery date" required value={date} onChange={setDate} />
        <Select id="plan-carrier" label="Lorry or Logistics" value={carrier || undefined} onValueChange={setCarrier} options={options} disabled={companyFixed} />
        {companyFixed && <p className="text-body text-c-muted">To change the Logistics company, use Change logistics on Monitor. The company may still change this date.</p>}
        {own && carrier === own.id && <Input id="plan-lorry" label="Lorry" value={vehicle} onChange={(e) => setVehicle(e.target.value)} />}
        <Input id="plan-slot" label="Time slot" placeholder="09:00-11:00" value={slot} onChange={(e) => setSlot(e.target.value)} />
        {save.isError && <FieldError>{errorText(save.error)}</FieldError>}
      </div>
    </Modal>
  );
}

function CancelJob({ row, onClose, onSaved }: { row: PlanRow; onClose: () => void; onSaved: () => void }) {
  const [reason, setReason] = useState("");
  const cancel = useMutation({
    mutationFn: () => send("/cancel", { orderId: row.orderId, leg: row.leg, reason }),
    onSuccess: () => { onSaved(); onClose(); },
  });
  // YH 2026-10-26: a day the Logistics company agreed is changed on Monitor, never cancelled here.
  const refusedCode = cancel.error instanceof ApiError ? (cancel.error.body as { code?: string } | null)?.code : undefined;
  const agreed = companyDateAgreed(row) || refusedCode === "company_date_agreed";
  return (
    <Modal open onOpenChange={(o) => !o && onClose()} title={`Cancel delivery job · ${row.so}`}
      footer={<>
        <Button variant="neutral" onClick={onClose}>Close</Button>
        {!agreed && <Button variant="primary" loading={cancel.isPending} disabled={!reason.trim()} onClick={() => cancel.mutate()}>Cancel delivery job</Button>}
      </>}>
      <div className="flex flex-col gap-3">
        <p className="text-body">{fmtDate(row.day ?? "")} · {row.carrier}{row.timeSlot ? ` · ${row.timeSlot}` : ""}.{agreed ? "" : " The order goes back to Waiting for a date."}</p>
        {agreed ? (
          <p role="alert" className="text-body" data-testid="cancel-company-date-agreed">
            {`The Logistics company has agreed ${fmtDate(row.day ?? "")} for this delivery. Change it on `}
            <Link className="text-kit-blue-11" to="/operation?tab=delivery">Monitor</Link>.
          </p>
        ) : (
          <Textarea id="cancel-reason" label="Reason" required rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />
        )}
        {cancel.isError && !agreed && <FieldError>{errorText(cancel.error)}</FieldError>}
      </div>
    </Modal>
  );
}

function RegionsList({ regions, onSaved }: { regions: PlanRegion[]; onSaved: () => void }) {
  const [editing, setEditing] = useState<{ state: string; region: string; perDay: string; isNew: boolean } | null>(null);
  const save = useMutation({
    mutationFn: () => send("/regions", { state: editing!.state, region: editing!.region, perDay: Number(editing!.perDay) }, "PUT"),
    onSuccess: () => { onSaved(); setEditing(null); },
  });
  const columns = useMemo<DataGridColumn<PlanRegion>[]>(() => [
    { key: "state", label: "State", width: 200, accessor: (r) => r.state },
    { key: "region", label: "Region", width: 200, accessor: (r) => r.region, filterType: "enum" },
    { key: "perDay", label: "Deliveries a day", width: 150, align: "right", accessor: (r) => r.per_day, numberValue: (r) => r.per_day },
  ], []);
  return (
    <>
      <DataGrid rows={regions} columns={columns} rowKey={(r) => r.state} storageKey="carres.delivery.regions.v1" appearance="reference"
        exportName="Delivery Regions" groupBanner={false} searchPlaceholder="Search state or region…"
        onRowClick={(r) => setEditing({ state: r.state, region: r.region, perDay: String(r.per_day), isNew: false })}
        toolbarEnd={<Button variant="primary" icon="add" onClick={() => setEditing({ state: "", region: "", perDay: "10", isNew: true })}>New state</Button>}
        emptyMessage="No regions yet." />
      {editing && (
        <Modal open onOpenChange={(o) => !o && setEditing(null)} title={editing.isNew ? "New state" : `Region · ${editing.state}`}
          footer={<>
            <Button variant="neutral" onClick={() => setEditing(null)}>Close</Button>
            <Button variant="primary" loading={save.isPending} disabled={!editing.state.trim() || !editing.region.trim() || !(Number(editing.perDay) >= 1)} onClick={() => save.mutate()}>Save</Button>
          </>}>
          <div className="flex flex-col gap-3">
            {editing.isNew && <Input id="region-state" label="State" required value={editing.state} onChange={(e) => setEditing({ ...editing, state: e.target.value })} />}
            <Input id="region-name" label="Region" required value={editing.region} onChange={(e) => setEditing({ ...editing, region: e.target.value })} />
            <Input id="region-per-day" label="Deliveries a day" type="number" required value={editing.perDay} onChange={(e) => setEditing({ ...editing, perDay: e.target.value })} />
            {save.isError && <FieldError>{errorText(save.error)}</FieldError>}
          </div>
        </Modal>
      )}
    </>
  );
}

type Rule = { building_type: string; note: string };
function ResidenceRules({ rules, onSaved }: { rules: Rule[]; onSaved: () => void }) {
  const [editing, setEditing] = useState<Rule | null>(null);
  const save = useMutation({
    mutationFn: () => send("/residence-rules", { buildingType: editing!.building_type, note: editing!.note }, "PUT"),
    onSuccess: () => { onSaved(); setEditing(null); },
  });
  const columns = useMemo<DataGridColumn<Rule>[]>(() => [
    { key: "type", label: "Building type", width: 160, accessor: (r) => r.building_type },
    { key: "note", label: "Residence rule", width: 520, accessor: (r) => r.note, wrap: true },
  ], []);
  return (
    <>
      <DataGrid rows={rules} columns={columns} rowKey={(r) => r.building_type} storageKey="carres.delivery.residence-rules.v1" appearance="reference"
        exportName="Residence Rules" groupBanner={false} onRowClick={(r) => setEditing({ ...r })} emptyMessage="No residence rules yet." />
      {editing && (
        <Modal open onOpenChange={(o) => !o && setEditing(null)} title={`Residence rule · ${editing.building_type}`}
          footer={<>
            <Button variant="neutral" onClick={() => setEditing(null)}>Close</Button>
            <Button variant="primary" loading={save.isPending} onClick={() => save.mutate()}>Save</Button>
          </>}>
          <div className="flex flex-col gap-3">
            <Textarea id="rule-note" label="Residence rule" rows={3} value={editing.note} onChange={(e) => setEditing({ ...editing, note: e.target.value })} />
            {save.isError && <FieldError>{errorText(save.error)}</FieldError>}
          </div>
        </Modal>
      )}
    </>
  );
}

/** Row 33 — the planning board, its Regions list and its Residence rules. */
export function DeliveryPlanning() {
  const { q, rows, refresh } = usePlan();
  const [view, setView] = useState("board");
  const [editing, setEditing] = useState<PlanRow | null>(null);
  const columns = useMemo(() => [...baseColumns, ...ruleColumns, requestedColumn, dayColumn, carrierColumn, slotColumn, statusColumn], []);
  return (
    <Page word="Delivery Planning" testId="delivery-planning">
      <div className="px-4 pt-2">
        <Tabs label="Delivery Planning" variant="segmented" value={view} onValueChange={setView}
          tabs={[{ value: "board", label: "Board" }, { value: "regions", label: "Regions" }, { value: "rules", label: "Residence rules" }]} />
      </div>
      {q.isError && !q.data ? loadError(q.refetch) : (
        <ListPageShell register>
          {view === "board" && (
            <DataGrid rows={rows} columns={columns} rowKey={(r) => r.key} storageKey="carres.delivery.planning.v1" appearance="reference"
              exportName="Delivery Planning" initialGroupBy={["region"]} sortDefault={{ key: "requested", dir: "asc" }}
              stickyIdentity isLoading={!q.isSuccess} searchPlaceholder="Search SO, DO, customer or location…"
              onRowClick={setEditing} emptyMessage="No orders waiting for delivery." />
          )}
          {view === "regions" && <RegionsList regions={q.data?.regions ?? []} onSaved={() => void refresh()} />}
          {view === "rules" && <ResidenceRules rules={q.data?.residenceRules ?? []} onSaved={() => void refresh()} />}
        </ListPageShell>
      )}
      {editing && q.data && <PlanForm feed={q.data} row={editing} onClose={() => setEditing(null)} onSaved={() => void refresh()} />}
    </Page>
  );
}

type Job = { key: string; row: PlanRow | null; doNumber: string; so: string; customer: string; day: string | null; carrier: string; timeSlot: string; status: string; note: string };

/** Row 34 — every delivery job, new and cancelled. */
export function DpOrders() {
  const { q, rows, refresh } = usePlan();
  const [creating, setCreating] = useState(false);
  const [cancelling, setCancelling] = useState<PlanRow | null>(null);
  const jobs = useMemo<Job[]>(() => {
    if (!q.data) return [];
    const live = rows.filter((r) => r.day).map((r) => ({
      key: r.key, row: r, doNumber: r.doNumber ?? "", so: r.so, customer: r.customer, day: r.day, carrier: r.carrier,
      timeSlot: r.timeSlot ?? "No time slot", status: r.scheduled ? "Scheduled" : "Planned", note: "",
    }));
    const company = new Map(q.data.companies.map((c) => [c.id, c]));
    const order = new Map([...q.data.orders, ...q.data.closedOrders].map((o) => [o.id, o]));
    const gone = q.data.cancelled.map((e) => {
      const o = order.get(e.order_id);
      return {
        key: e.id, row: null, doNumber: "", so: o?.so ? `SO-${o.so}${e.leg > 0 ? ` · Leg ${e.leg}` : ""}` : "", customer: o?.customer_name ?? "",
        day: null, carrier: carrierOf(e.from_partner_id ? company.get(e.from_partner_id) ?? null : null, null), timeSlot: "", status: "Cancelled",
        note: `${e.note ?? ""} · cancelled ${fmtDate(e.recorded_at)}`,
      };
    });
    return [...live, ...gone];
  }, [q.data, rows]);
  const columns = useMemo<DataGridColumn<Job>[]>(() => [
    { key: "do", label: "DO No", width: 150, accessor: (r) => r.doNumber },
    { key: "so", label: "SO No", width: 130, accessor: (r) => r.so },
    { key: "customer", label: "Customer", width: 200, accessor: (r) => r.customer },
    { key: "day", label: "Delivery date", width: 130, accessor: (r) => (r.day ? fmtDate(r.day) : ""), dateValue: (r) => r.day, filterType: "date" },
    { key: "carrier", label: "Lorry or Logistics", width: 180, accessor: (r) => r.carrier, filterType: "enum" },
    { key: "slot", label: "Time slot", width: 120, accessor: (r) => r.timeSlot },
    { key: "status", label: "Status", width: 120, accessor: (r) => r.status, filterType: "enum" },
    { key: "note", label: "Cancel reason", width: 300, accessor: (r) => r.note, wrap: true },
  ], []);
  return (
    <Page word="DP Orders" testId="dp-orders">
      {q.isError && !q.data ? loadError(q.refetch) : (
        <ListPageShell register>
          <DataGrid rows={jobs} columns={columns} rowKey={(r) => r.key} storageKey="carres.delivery.dp-orders.v1" appearance="reference"
            exportName="DP Orders" groupBanner={false} stickyIdentity isLoading={!q.isSuccess} sortDefault={{ key: "day", dir: "asc" }}
            searchPlaceholder="Search DO, SO or customer…" onRowClick={(r) => r.row && setCancelling(r.row)}
            toolbarEnd={<Button variant="primary" icon="add" onClick={() => setCreating(true)}>New DP Order</Button>}
            emptyMessage="No delivery jobs yet." />
        </ListPageShell>
      )}
      {creating && q.data && <PlanForm feed={q.data} row="new" onClose={() => setCreating(false)} onSaved={() => void refresh()} />}
      {cancelling && <CancelJob row={cancelling} onClose={() => setCancelling(null)} onSaved={() => void refresh()} />}
    </Page>
  );
}

/** Row 35 — propose dates by region and capacity; nothing is written until Confirm dates. */
export function AutoSchedule() {
  const { q, rows, refresh } = usePlan();
  const days = useDeliveryDays();
  const today = appTodayIso();
  const [start, setStart] = useState<string | null>(today);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [proposal, setProposal] = useState<Map<string, string>>(new Map());
  const [failures, setFailures] = useState<string[]>([]);
  const waiting = useMemo(() => rows.filter((r) => !r.day), [rows]);
  const confirm = useMutation({
    mutationFn: async () => {
      const failed: string[] = [];
      for (const r of waiting) {
        const date = proposal.get(r.key);
        if (!date) continue;
        // Date only, no company: follows Houzs frontend/src/pages/scm-v2/AutoSchedule.tsx:157,168 per
        // Weisiang's ruling (2026-10-22): clear Carres rules, implement Houzs. The lorry is given on Trips.
        try { await send("/date", { orderId: r.orderId, leg: r.leg, date }); } catch (e) { failed.push(`${r.so}: ${errorText(e)}`); }
      }
      return failed;
    },
    onSuccess: (failed) => { setFailures(failed); setProposal(new Map()); setSelected(new Set()); void refresh(); },
  });
  const columns = useMemo<DataGridColumn<PlanRow>[]>(() => [
    ...baseColumns, ruleColumns[0]!, requestedColumn, carrierColumn,
    { key: "proposed", label: "Proposed date", width: 140, accessor: (r) => (proposal.get(r.key) ? fmtDate(proposal.get(r.key)!) : "") },
  ], [proposal]);
  const picked = waiting.filter((r) => selected.has(r.key));
  return (
    <Page word="Auto-schedule" testId="auto-schedule">
      {q.isError && !q.data ? loadError(q.refetch) : (
        <ListPageShell register>
          <DataGrid rows={waiting} columns={columns} rowKey={(r) => r.key} storageKey="carres.delivery.auto-schedule.v1" appearance="reference"
            exportName="Auto-schedule" initialGroupBy={["region"]} stickyIdentity isLoading={!q.isSuccess}
            searchPlaceholder="Search SO, DO, customer or location…" emptyMessage="No orders waiting for a date."
            selectable={{
              selectedKeys: selected,
              onToggle: (k) => setSelected((s) => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n; }),
              onToggleAll: (keys, all) => setSelected((s) => { const n = new Set(s); keys.forEach((k) => (all ? n.delete(k) : n.add(k))); return n; }),
            }}
            toolbarStart={<DatePicker id="auto-start" label="Start from" value={start} onChange={setStart} />}
            toolbarEnd={<>
              <Button variant="neutral" disabled={picked.length === 0 || !start}
                onClick={() => setProposal(proposeDates(picked, rows, q.data?.regions ?? [], start!, days.refusal))}>
                {`Propose dates (${picked.length})`}
              </Button>
              <Button variant="primary" loading={confirm.isPending} disabled={proposal.size === 0} onClick={() => confirm.mutate()}>
                {`Confirm dates (${proposal.size})`}
              </Button>
            </>} />
          <p className="px-4 py-2 text-body text-c-muted">Own lorry: the date becomes the delivery date. Logistics company: the date is planned and the company may still change it.</p>
          {failures.length > 0 && <FieldError>{failures.join(" · ")}</FieldError>}
        </ListPageShell>
      )}
    </Page>
  );
}

/** Row 36 — trips: one day + one lorry or Logistics company, stops in order, a time slot for every stop. */
export function Trips() {
  const { q, rows, refresh } = usePlan();
  const trips = useMemo(() => tripsOf(rows), [rows]);
  const stops = useMemo(() => trips.flatMap((t) => t.stops), [trips]);
  const tripOf = useMemo(() => new Map(trips.flatMap((t) => t.stops.map((s) => [s.key, t]))), [trips]);
  const [editing, setEditing] = useState<{ row: PlanRow; seq: string; slot: string } | null>(null);
  const [cancelling, setCancelling] = useState<PlanRow | null>(null);
  const saveStop = (row: PlanRow, seq: number, timeSlot: string) => send("/stop", { orderId: row.orderId, leg: row.leg, seq, timeSlot });
  const save = useMutation({
    mutationFn: () => saveStop(editing!.row, Number(editing!.seq), editing!.slot),
    onSuccess: () => { setEditing(null); void refresh(); },
  });
  const fill = useMutation({
    mutationFn: async () => {
      for (const t of trips) {
        for (const s of fillTimeSlots(t.stops)) {
          if (s.seq !== s.row.seq || s.timeSlot !== s.row.timeSlot) await saveStop(s.row, s.seq, s.timeSlot);
        }
      }
    },
    onSettled: () => void refresh(),
  });
  const missing = stops.filter((s) => !s.timeSlot).length;
  const columns = useMemo<DataGridColumn<PlanRow>[]>(() => [
    { key: "seq", label: "Stop", width: 70, align: "right", accessor: (r) => r.seq ?? "", numberValue: (r) => r.seq },
    slotColumn,
    { key: "so", label: "SO No", width: 130, accessor: (r) => r.so },
    { key: "do", label: "DO No", width: 150, accessor: (r) => r.doNumber ?? "" },
    { key: "customer", label: "Customer", width: 190, accessor: (r) => r.customer },
    { key: "location", label: "Delivery Location", width: 190, accessor: (r) => r.location },
    ...ruleColumns,
    statusColumn,
  ], []);
  return (
    <Page word="Trips" testId="trips">
      {q.isError && !q.data ? loadError(q.refetch) : (
        <ListPageShell register>
          <DataGrid rows={stops} columns={columns} rowKey={(r) => r.key} storageKey="carres.delivery.trips.v1" appearance="reference"
            exportName="Trips" stickyIdentity isLoading={!q.isSuccess} searchPlaceholder="Search SO, DO, customer or location…"
            allowColumnGrouping={false}
            fixedGroups={{
              groups: trips.map((t) => ({ key: t.key, label: `${fmtDate(t.day)} · ${t.carrier} · ${t.stops.length} ${t.stops.length === 1 ? "stop" : "stops"}` })),
              groupOf: (r) => tripOf.get(r.key)?.key ?? "",
            }}
            onRowClick={(r) => setEditing({ row: r, seq: String(r.seq ?? ""), slot: r.timeSlot ?? "" })}
            toolbarEnd={<Button variant="primary" loading={fill.isPending} disabled={missing === 0} onClick={() => fill.mutate()}>{`Fill time slots (${missing})`}</Button>}
            emptyMessage="No trips yet. Give an order a delivery date on Delivery Planning, DP Orders or Auto-schedule." />
          {fill.isError && <FieldError>{errorText(fill.error)}</FieldError>}
        </ListPageShell>
      )}
      {editing && (
        <Modal open onOpenChange={(o) => !o && setEditing(null)} title={`Stop · ${editing.row.so}`}
          footer={<>
            <Button variant="neutral" onClick={() => { setCancelling(editing.row); setEditing(null); }}>Cancel delivery job</Button>
            <Button variant="neutral" onClick={() => setEditing(null)}>Close</Button>
            <Button variant="primary" loading={save.isPending} disabled={!editing.slot.trim() || !(Number(editing.seq) >= 1)} onClick={() => save.mutate()}>Save</Button>
          </>}>
          <div className="flex flex-col gap-3">
            <p className="text-body">{fmtDate(editing.row.day ?? "")} · {editing.row.carrier}</p>
            <Input id="stop-seq" label="Stop" type="number" required value={editing.seq} onChange={(e) => setEditing({ ...editing, seq: e.target.value })} />
            <Input id="stop-slot" label="Time slot" required placeholder="09:00-11:00" value={editing.slot} onChange={(e) => setEditing({ ...editing, slot: e.target.value })} />
            {editing.row.rule && <p className="text-body text-c-muted">{editing.row.buildingType}: {editing.row.rule}</p>}
            {save.isError && <FieldError>{errorText(save.error)}</FieldError>}
          </div>
        </Modal>
      )}
      {cancelling && <CancelJob row={cancelling} onClose={() => setCancelling(null)} onSaved={() => void refresh()} />}
    </Page>
  );
}

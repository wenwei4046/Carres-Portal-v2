// design-standard: not-a-list-page — this is a central Settings editor, not a Register.
/**
 * DELIVERY SETTINGS — the `Delivery` group of the Settings Workspace
 * (Delivery MASTER §11, owner ruling 2026-09-13; migration 0488).
 *
 * The Warehouse Settings grammar: readable rows, ONE `Save changes` per page
 * naming its gap while disabled, `Not configured` for a value nobody has
 * recorded, and every change listed with its actor, time, old and new value.
 *
 *   Logistics Partners   one row per partner → its object (seven sections)
 *   Delivery Rules       who contacts the customer · record-on-behalf · the
 *                        shared contact lead (read-only) · Payment's clock and
 *                        the DO gate (read-only mirrors) · proof by result
 *   Message Templates    the Payment template-library grammar, Delivery purposes
 *   Access               the two duty keys; the people resolve in Staff & Duties
 *
 * No roster, no owner list, no duty calculation lives here.
 */
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link, NavLink, useParams } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  DELIVERY_TEMPLATE_FIELDS,
  DELIVERY_TEMPLATE_PURPOSES,
  DELIVERY_TEMPLATE_PURPOSE_WORD,
  DEFAULT_PROOF_RULES,
  EMPTY_COVERAGE,
  EMPTY_SERVICES,
  NOT_CONFIGURED,
  PARTNER_SECTIONS,
  WEEKDAY_WORD,
  WORKSPACE_DUTIES,
  type DeliverySettingChangeRow,
  type HandoverPoint,
  type PartnerCoverage,
  type PartnerServices,
  type ProofRules,
} from "@carres/shared";
import { apiFetch } from "@/lib/api";
import { fmtDate } from "@/lib/fmt-date";
import {
  DELIVERY_SETTINGS_QUERY_KEY,
  useDeliverySettings,
  type DeliverySettingsPartnerRow,
  type DeliverySettingsResponse,
} from "@/lib/queries";
import PageShell from "@/components/kit/PageShell";
import Button from "@/components/kit/Button";
import Input from "@/components/kit/Input";
import Select from "@/components/kit/Select";
import Textarea from "@/components/kit/Textarea";
import { TemplateLibrary } from "./PaymentTemplateLibrary";

/* ── THE WORDS (COPY-STANDARD, Warehouse Settings grammar + Delivery §11) ── */
const DS = {
  partners: "Logistics Partners",
  rules: "Delivery Rules",
  templates: "Message Templates",
  access: "Access",
  saveChanges: "Save changes",
  saved: "Delivery Settings saved",
  active: "Active",
  inactive: "Inactive",
  yes: "Yes",
  no: "No",
  readOnly:
    "You can read Delivery Settings. Changing them is the manager's.",
  loadFailed: "Delivery Settings could not be loaded. Try again.",
  tryAgain: "Try again",
  loading: "Loading Delivery Settings…",
  /* Partner details */
  name: "Partner name",
  status: "Status",
  customerPhone: "Customer-facing number",
  officeContact: "Office contact",
  address: "Address",
  whatsappGroup: "WhatsApp group",
  /* Coverage */
  states: "States covered",
  cities: "Cities covered",
  postcodes: "Postcodes covered",
  excluded: "Excluded locations",
  kvDefault: "Klang Valley default",
  kvDefaultRule:
    "The Klang Valley default is pre-selected on a Klang Valley assignment and never locked; the operator may still pick another partner.",
  onePerLine: "One per line",
  /* Schedule */
  pickupDays: "Pickup weekdays",
  deliveryDays: "Delivery weekdays",
  offDays: "Not delivering on",
  capacity: "Capacity per day",
  leadDays: "Booking lead days",
  cutoff: "Cut-off time",
  blackouts: "Closed dates",
  journeyRegions: "Delivery weekdays per region",
  transitDays: "Transit days",
  region: "Region",
  surchargeAreas: "Surcharge areas",
  /* Handover */
  partnerWarehouse: "Partner warehouse",
  handoverPoints: "Handover points",
  pointName: "Place",
  pointKind: "Kind",
  pickupPoint: "Pickup point",
  transitPoint: "Two-leg handover",
  addPoint: "Add a handover point",
  /* Fleet */
  drivers: "Drivers",
  vehicles: "Vehicles",
  driverName: "Driver name",
  driverPhone: "Driver phone",
  plate: "Plate",
  vehicleType: "Vehicle type",
  vehicleCapacity: "Capacity",
  addDriver: "Add a driver",
  addVehicle: "Add a vehicle",
  /* Services */
  stairCarry: "Stair carry",
  dismantling: "Dismantling",
  disposal: "Disposal",
  charges: "Partner charges",
  /* Portal access */
  accounts: "Portal accounts",
  noAccounts: "No portal account",
  visibility: "Data visibility",
  visibilityRule:
    "A partner account sees only the deliveries assigned to it — never a customer's money, another partner's rows or Carres staff.",
  /* Rules */
  contactBy: "Who contacts the customer",
  contactByPartner: "The partner",
  contactByOperation: "Operation",
  onBehalf: "Operation may record on the partner's behalf",
  contactLead: "Contact lead days",
  contactLeadRule: (n: number) => `${n} working days before the requested delivery date — the shared chase setting`,
  paymentRule: "Payment clearance",
  paymentRuleWord:
    "Read-only mirror of Payment's clock: the Delivery Order needs Amount needed = RM 0 and no open Finance Exception.",
  doRule: "Delivery Order availability",
  doRuleWord:
    "Read-only mirror of the DO gate: the system issues the document when the day, the window, the goods, the partner and the money all hold.",
  proof: "Proof required",
  proofDeliveredPhoto: "Delivered · delivery photo",
  proofDeliveredSigned: "Delivered · signed Delivery Order",
  proofFailedPhoto: "Failed Delivery · photo",
  proofPartialSigned: "Partially Delivered · signed Delivery Order",
  servicesSupported: "Supported services",
  /* Access */
  accessRule: "Delivery Duty and Delivery Charge Approver are assigned in Workspace → Staff & Duties. This page names the keys and copies nobody.",
  openStaffDuties: "Open Workspace → Staff & Duties",
  /* History */
  changes: "Changes",
  noChanges: "No changes recorded yet.",
} as const;

const KV_STATES = ["Selangor", "Kuala Lumpur", "Putrajaya"];

function orNotConfigured(v: string | null | undefined): string {
  return v && v.trim() ? v : NOT_CONFIGURED;
}
function linesOf(list: readonly string[] | null | undefined): string {
  return (list ?? []).join("\n");
}
function listOf(text: string): string[] {
  return [...new Set(text.split(/\r?\n|,/).map((s) => s.trim()).filter(Boolean))];
}

function Row({ label, htmlFor, children }: { label: string; htmlFor?: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[200px_minmax(0,1fr)] items-start gap-3 py-1.5">
      {htmlFor ? (
        <label htmlFor={htmlFor} className="text-body text-kit-slate-11">
          {label}
        </label>
      ) : (
        <span className="text-body text-kit-slate-11">{label}</span>
      )}
      <div className="min-w-0 text-body text-kit-slate-12">{children}</div>
    </div>
  );
}

function SectionCard({ title, blurb, children, testId }: { title: string; blurb?: string; children: ReactNode; testId?: string }) {
  return (
    <section className="rounded-card border border-kit-slate-5 bg-white p-5" data-testid={testId}>
      <h2 className="text-section">{title}</h2>
      {blurb ? <p className="mt-1 text-body text-kit-slate-11">{blurb}</p> : null}
      <div className="mt-4 grid gap-1">{children}</div>
    </section>
  );
}

function YesNo({ id, value, onChange, disabled }: { id: string; value: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <Select
      id={id}
      value={value ? "yes" : "no"}
      onValueChange={(v) => onChange(v === "yes")}
      disabled={disabled}
      options={[
        { value: "yes", label: DS.yes },
        { value: "no", label: DS.no },
      ]}
    />
  );
}

function ChangesList({ changes, partnerId }: { changes: DeliverySettingChangeRow[]; partnerId?: string | null }) {
  const rows = partnerId ? changes.filter((c) => c.partner_id === partnerId) : changes;
  return (
    <section className="rounded-card border border-kit-slate-5 bg-white p-5" data-testid="delivery-settings-history">
      <h2 className="text-section">{DS.changes}</h2>
      {rows.length === 0 ? (
        <p className="mt-2 text-body text-kit-slate-11">{DS.noChanges}</p>
      ) : (
        <ul className="mt-2 divide-y divide-kit-slate-4">
          {rows.slice(0, 50).map((c) => (
            <li key={c.id} className="py-1.5 text-body">
              <span className="font-medium text-kit-slate-12">{c.what}</span>
              <span className="ml-2 text-kit-slate-11">
                {c.actor_name ?? "—"} · {fmtDate(c.changed_at, { time: true })}
              </span>
              <details className="mt-0.5">
                <summary className="cursor-pointer text-label text-kit-slate-11">Old and new value</summary>
                <pre className="whitespace-pre-wrap font-sans text-label text-kit-slate-11">
                  {JSON.stringify(c.old_value ?? null)}
                  {"\n→ "}
                  {JSON.stringify(c.new_value ?? null)}
                </pre>
              </details>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/* ── THE PAGE ─────────────────────────────────────────────────────────────── */
export default function DeliverySettings() {
  const params = useParams<{ section?: string; partnerId?: string; partnerSection?: string }>();
  const query = useDeliverySettings();
  const data = query.data;

  if (query.isError) {
    return (
      <PageShell variant="settings" title={DS.partners}>
        <div role="alert" className="p-6 text-body">
          <p>{DS.loadFailed}</p>
          <Button variant="neutral" onClick={() => void query.refetch()}>
            {DS.tryAgain}
          </Button>
        </div>
      </PageShell>
    );
  }
  if (!data) {
    return (
      <PageShell variant="settings" title={DS.partners}>
        <div className="p-6 text-body text-kit-slate-11">{DS.loading}</div>
      </PageShell>
    );
  }
  if (params.partnerId) {
    return <PartnerObject data={data} partnerId={params.partnerId} section={params.partnerSection ?? "details"} />;
  }
  switch (params.section) {
    case "rules":
      return <RulesPage data={data} />;
    case "templates":
      return <TemplatesPage data={data} />;
    case "access":
      return <AccessPage data={data} />;
    default:
      return <PartnersPage data={data} />;
  }
}

/* ── Logistics Partners — one row per partner ─────────────────────────────── */
function PartnersPage({ data }: { data: DeliverySettingsResponse }) {
  return (
    <PageShell variant="settings" title={DS.partners}>
      <div className="mx-auto grid w-full max-w-4xl gap-5 overflow-auto p-5" data-testid="delivery-settings-partners">
        {!data.canEdit && (
          <p className="text-meta text-kit-slate-11" data-testid="delivery-settings-read-only">
            {DS.readOnly}
          </p>
        )}
        <section className="rounded-card border border-kit-slate-5 bg-white">
          <ul className="divide-y divide-kit-slate-4">
            {data.partners.map((p) => (
              <li key={p.id}>
                <Link
                  to={`/operation/settings/delivery/partners/${encodeURIComponent(p.id)}`}
                  className="flex items-center justify-between gap-4 px-5 py-3 hover:bg-kit-slate-3"
                  data-testid={`delivery-settings-partner-${p.id}`}
                >
                  <span className="min-w-0">
                    <span className="block text-body font-medium text-kit-slate-12">{p.name}</span>
                    <span className="block text-label text-kit-slate-11">
                      {DS.customerPhone} · {orNotConfigured(p.customer_phone)}
                      {p.kv_default ? ` · ${DS.kvDefault}` : ""}
                    </span>
                  </span>
                  <span className={`text-label ${p.active === false ? "text-kit-slate-9" : "text-kit-green-11"}`}>
                    {p.active === false ? DS.inactive : DS.active}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
        <ChangesList changes={data.changes} />
      </div>
    </PageShell>
  );
}

/* ── One partner's object — seven sections, one Save per page ────────────── */
interface PartnerDraft {
  details: { name: string; active: boolean; customerPhone: string; officeContact: string; address: string; whatsappGroupUrl: string };
  coverage: { states: string; cities: string; postcodes: string; excluded: string; kvDefault: boolean };
  schedule: {
    pickupDays: number[];
    offDays: number[];
    capacity: string;
    leadDays: string;
    cutoff: string;
    blackouts: string;
    regions: Array<{ name: string; deliveryDays: number[]; transitDays: string }>;
    surchargeAreas: string;
  };
  handover: HandoverPoint[];
  fleet: {
    drivers: Array<{ id: string | null; name: string; phone: string; active: boolean }>;
    vehicles: Array<{ id: string | null; plate: string; vehicleType: string; capacity: string; driverName: string; driverPhone: string; active: boolean }>;
  };
  services: { stairCarry: boolean; dismantling: boolean; disposal: boolean; charges: string };
}

function draftOf(p: DeliverySettingsPartnerRow, data: DeliverySettingsResponse): PartnerDraft {
  const coverage = (p.coverage as PartnerCoverage | null) ?? EMPTY_COVERAGE;
  const services = (p.services as PartnerServices | null) ?? EMPTY_SERVICES;
  const regions = p.journey_regions && typeof p.journey_regions === "object"
    ? Object.entries(p.journey_regions as Record<string, { deliveryDays?: number[] | null; transitDays?: number }>).map(
        ([name, r]) => ({ name, deliveryDays: r.deliveryDays ?? [], transitDays: String(r.transitDays ?? 0) }),
      )
    : [];
  return {
    details: {
      name: p.name,
      active: p.active !== false,
      customerPhone: p.customer_phone ?? "",
      officeContact: p.office_contact ?? p.contact ?? "",
      address: p.address ?? "",
      whatsappGroupUrl: p.whatsapp_group_url ?? "",
    },
    coverage: {
      states: linesOf(coverage.states),
      cities: linesOf(coverage.cities),
      postcodes: linesOf(coverage.postcodes),
      excluded: linesOf(coverage.excluded),
      kvDefault: Boolean(p.kv_default),
    },
    schedule: {
      pickupDays: p.pickup_days ?? [],
      offDays: p.off_days ?? [0],
      capacity: p.daily_capacity != null ? String(p.daily_capacity) : "",
      leadDays: String(p.booking_lead_days ?? 0),
      cutoff: p.cutoff_time ? p.cutoff_time.slice(0, 5) : "",
      blackouts: linesOf(p.blackout_dates),
      regions,
      surchargeAreas: linesOf(p.surcharge_areas),
    },
    handover: (p.handover_points as HandoverPoint[] | null) ?? [],
    fleet: {
      drivers: data.drivers
        .filter((d) => d.partner_id === p.id)
        .map((d) => ({ id: d.id, name: d.name, phone: d.phone ?? "", active: d.active })),
      vehicles: data.vehicles
        .filter((v) => v.partner_id === p.id)
        .map((v) => ({
          id: v.id,
          plate: v.plate,
          vehicleType: v.vehicle_type,
          capacity: v.capacity ?? "",
          driverName: v.driver_name ?? "",
          driverPhone: v.driver_phone ?? "",
          active: v.active,
        })),
    },
    services: {
      stairCarry: services.stairCarry,
      dismantling: services.dismantling,
      disposal: services.disposal,
      charges: linesOf(services.charges),
    },
  };
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

function PartnerObject({ data, partnerId, section }: { data: DeliverySettingsResponse; partnerId: string; section: string }) {
  const qc = useQueryClient();
  const partner = data.partners.find((p) => p.id === partnerId) ?? null;
  const [draft, setDraft] = useState<PartnerDraft | null>(null);
  useEffect(() => {
    if (partner) setDraft(draftOf(partner, data));
  }, [partner, data]);
  const saved = useMemo(() => (partner ? draftOf(partner, data) : null), [partner, data]);

  const changed = useMemo(() => {
    if (!draft || !saved) return new Set<keyof PartnerDraft>();
    const out = new Set<keyof PartnerDraft>();
    for (const key of Object.keys(draft) as Array<keyof PartnerDraft>) {
      if (!same(draft[key], saved[key])) out.add(key);
    }
    return out;
  }, [draft, saved]);

  const gap = useMemo(() => {
    if (!draft) return null;
    if (!draft.details.name.trim()) return "name the partner";
    if (draft.schedule.capacity && !/^\d{1,3}$/.test(draft.schedule.capacity)) return "capacity is a whole number";
    if (!/^\d{1,2}$/.test(draft.schedule.leadDays)) return "booking lead days is a whole number";
    if (draft.schedule.cutoff && !/^([01]\d|2[0-3]):[0-5]\d$/.test(draft.schedule.cutoff)) return "cut-off is HH:MM";
    if (draft.fleet.drivers.some((d) => !d.name.trim())) return "every driver needs a name";
    if (draft.fleet.vehicles.some((v) => !v.plate.trim() || !v.vehicleType.trim())) return "every vehicle needs a plate and a type";
    if (draft.handover.some((h) => !h.name.trim())) return "every handover point needs a place";
    return null;
  }, [draft]);

  const save = useMutation({
    mutationFn: async () => {
      if (!draft || !saved || !partner) return;
      const id = partner.id;
      if (changed.has("details")) {
        await apiFetch("/api/operation/delivery-settings/partner/details", {
          method: "PUT",
          body: JSON.stringify({
            partnerId: id,
            name: draft.details.name.trim(),
            active: draft.details.active,
            customerPhone: draft.details.customerPhone.trim() || null,
            officeContact: draft.details.officeContact.trim() || null,
            address: draft.details.address.trim() || null,
            whatsappGroupUrl: draft.details.whatsappGroupUrl.trim() || null,
          }),
        });
      }
      if (changed.has("coverage")) {
        await apiFetch("/api/operation/delivery-settings/partner/coverage", {
          method: "PUT",
          body: JSON.stringify({
            partnerId: id,
            coverage: {
              states: listOf(draft.coverage.states),
              cities: listOf(draft.coverage.cities),
              postcodes: listOf(draft.coverage.postcodes),
              excluded: listOf(draft.coverage.excluded),
            },
            kvDefault: draft.coverage.kvDefault,
          }),
        });
      }
      if (changed.has("schedule")) {
        const s = draft.schedule;
        const rulesChanged =
          !same(s.offDays, saved.schedule.offDays) || s.capacity !== saved.schedule.capacity ||
          s.leadDays !== saved.schedule.leadDays || s.blackouts !== saved.schedule.blackouts;
        if (rulesChanged) {
          await apiFetch(`/api/operation/partners/${encodeURIComponent(id)}/delivery-rules`, {
            method: "PUT",
            body: JSON.stringify({
              offDays: s.offDays,
              blackoutDates: listOf(s.blackouts),
              dailyCapacity: s.capacity ? Number(s.capacity) : null,
              bookingLeadDays: Number(s.leadDays),
            }),
          });
        }
        const calendarChanged =
          !same(s.pickupDays, saved.schedule.pickupDays) || !same(s.regions, saved.schedule.regions) ||
          s.surchargeAreas !== saved.schedule.surchargeAreas;
        if (calendarChanged) {
          await apiFetch(`/api/operation/partners/${encodeURIComponent(id)}/journey-calendar`, {
            method: "PUT",
            body: JSON.stringify({
              pickupDays: s.pickupDays.length > 0 ? s.pickupDays : null,
              regions: Object.fromEntries(
                s.regions.filter((r) => r.name.trim()).map((r) => [
                  r.name.trim(),
                  { deliveryDays: r.deliveryDays.length > 0 ? r.deliveryDays : null, transitDays: Number(r.transitDays || 0) },
                ]),
              ),
              surchargeAreas: listOf(s.surchargeAreas),
            }),
          });
        }
        if (s.cutoff !== saved.schedule.cutoff) {
          await apiFetch("/api/operation/delivery-settings/partner/schedule", {
            method: "PUT",
            body: JSON.stringify({ partnerId: id, cutoffTime: s.cutoff || null, handoverPoints: draft.handover }),
          });
        }
      }
      if (changed.has("handover")) {
        await apiFetch("/api/operation/delivery-settings/partner/schedule", {
          method: "PUT",
          body: JSON.stringify({ partnerId: id, cutoffTime: draft.schedule.cutoff || null, handoverPoints: draft.handover }),
        });
      }
      if (changed.has("services")) {
        await apiFetch("/api/operation/delivery-settings/partner/services", {
          method: "PUT",
          body: JSON.stringify({
            partnerId: id,
            services: {
              stairCarry: draft.services.stairCarry,
              dismantling: draft.services.dismantling,
              disposal: draft.services.disposal,
              charges: listOf(draft.services.charges),
            },
          }),
        });
      }
      if (changed.has("fleet")) {
        for (const d of draft.fleet.drivers) {
          const was = saved.fleet.drivers.find((x) => x.id === d.id);
          if (d.id && was && same(was, d)) continue;
          await apiFetch("/api/operation/delivery-settings/partner/driver", {
            method: "POST",
            body: JSON.stringify({ partnerId: id, driverId: d.id, name: d.name.trim(), phone: d.phone.trim() || null, active: d.active }),
          });
        }
        for (const v of draft.fleet.vehicles) {
          const was = saved.fleet.vehicles.find((x) => x.id === v.id);
          if (v.id && was && same(was, v)) continue;
          await apiFetch("/api/operation/delivery-settings/partner/vehicle", {
            method: "POST",
            body: JSON.stringify({
              partnerId: id,
              vehicleId: v.id,
              plate: v.plate.trim(),
              vehicleType: v.vehicleType.trim(),
              capacity: v.capacity.trim() || null,
              driverName: v.driverName.trim() || null,
              driverPhone: v.driverPhone.trim() || null,
              active: v.active,
            }),
          });
        }
      }
    },
    onSuccess: () => toast.success(DS.saved),
    onError: (e: Error) => toast.error(e.message),
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: DELIVERY_SETTINGS_QUERY_KEY });
      void qc.invalidateQueries({ queryKey: ["operation", "partners"] });
    },
  });

  if (!partner || !draft) {
    return (
      <PageShell variant="settings" title={DS.partners}>
        <div className="p-6 text-body text-kit-slate-11">{partner ? DS.loading : "Logistic partner not found"}</div>
      </PageShell>
    );
  }
  const canEdit = data.canEdit;
  const dirty = changed.size > 0;
  const saveLabel = !dirty ? DS.saveChanges : gap ? `${DS.saveChanges} — ${gap}` : DS.saveChanges;
  const set = <K extends keyof PartnerDraft>(key: K, value: PartnerDraft[K]) =>
    setDraft((d) => (d ? { ...d, [key]: value } : d));

  return (
    <PageShell
      variant="settings"
      title={partner.name}
      titleRight={
        <Button
          variant="primary"
          data-testid="delivery-settings-save"
          disabled={!canEdit || !dirty || gap != null}
          loading={save.isPending}
          onClick={() => save.mutate()}
        >
          {saveLabel}
        </Button>
      }
    >
      <div className="mx-auto grid w-full max-w-4xl gap-5 overflow-auto p-5" data-testid="delivery-settings-partner">
        <div>
          <Link className="text-label text-kit-blue-11" to="/operation/settings/delivery/partners">
            ← {DS.partners}
          </Link>
          <div className="text-body text-kit-slate-11">
            {partner.active === false ? DS.inactive : DS.active}
            {partner.kv_default ? ` · ${DS.kvDefault}` : ""}
          </div>
        </div>
        {!canEdit && (
          <p className="text-meta text-kit-slate-11" data-testid="delivery-settings-read-only">
            {DS.readOnly}
          </p>
        )}
        <nav className="flex flex-wrap gap-1" aria-label="Partner sections" data-testid="delivery-settings-partner-nav">
          {PARTNER_SECTIONS.map((s) => (
            <NavLink
              key={s.slug}
              to={`/operation/settings/delivery/partners/${encodeURIComponent(partner.id)}/${s.slug}`}
              className={({ isActive }) =>
                `rounded-control px-2 py-1 text-label ${isActive || (s.slug === "details" && section === "details")
                  ? "bg-kit-blue-3 font-semibold text-kit-slate-12"
                  : "text-kit-slate-11 hover:bg-kit-slate-3"}`
              }
              end
            >
              {s.label}
            </NavLink>
          ))}
        </nav>

        {section === "details" && (
          <SectionCard title="Partner details" testId="delivery-settings-details">
            <Row label={DS.name} htmlFor="dp-name">
              {canEdit ? (
                <Input id="dp-name" value={draft.details.name} onChange={(e) => set("details", { ...draft.details, name: e.target.value })} />
              ) : partner.name}
            </Row>
            <Row label={DS.status} htmlFor="dp-status">
              {canEdit ? (
                <Select
                  id="dp-status"
                  value={draft.details.active ? "active" : "inactive"}
                  onValueChange={(v) => set("details", { ...draft.details, active: v === "active" })}
                  options={[{ value: "active", label: DS.active }, { value: "inactive", label: DS.inactive }]}
                />
              ) : draft.details.active ? DS.active : DS.inactive}
            </Row>
            <Row label={DS.customerPhone} htmlFor="dp-phone">
              {canEdit ? (
                <Input id="dp-phone" value={draft.details.customerPhone} placeholder={NOT_CONFIGURED} onChange={(e) => set("details", { ...draft.details, customerPhone: e.target.value })} />
              ) : orNotConfigured(partner.customer_phone)}
            </Row>
            <Row label={DS.officeContact} htmlFor="dp-office">
              {canEdit ? (
                <Input id="dp-office" value={draft.details.officeContact} placeholder={NOT_CONFIGURED} onChange={(e) => set("details", { ...draft.details, officeContact: e.target.value })} />
              ) : orNotConfigured(partner.office_contact ?? partner.contact)}
            </Row>
            <Row label={DS.address} htmlFor="dp-address">
              {canEdit ? (
                <Input id="dp-address" value={draft.details.address} placeholder={NOT_CONFIGURED} onChange={(e) => set("details", { ...draft.details, address: e.target.value })} />
              ) : orNotConfigured(partner.address)}
            </Row>
            <Row label={DS.whatsappGroup} htmlFor="dp-group">
              {canEdit ? (
                <Input id="dp-group" value={draft.details.whatsappGroupUrl} placeholder={NOT_CONFIGURED} onChange={(e) => set("details", { ...draft.details, whatsappGroupUrl: e.target.value })} />
              ) : orNotConfigured(partner.whatsapp_group_url)}
            </Row>
          </SectionCard>
        )}

        {section === "coverage" && (
          <SectionCard title="Coverage" blurb={DS.kvDefaultRule} testId="delivery-settings-coverage">
            {(["states", "cities", "postcodes", "excluded"] as const).map((key) => (
              <Row key={key} label={DS[key]} htmlFor={`dp-${key}`}>
                {canEdit ? (
                  <Textarea id={`dp-${key}`} rows={3} hint={DS.onePerLine} value={draft.coverage[key]} placeholder={NOT_CONFIGURED} onChange={(e) => set("coverage", { ...draft.coverage, [key]: e.target.value })} />
                ) : (
                  orNotConfigured(draft.coverage[key].replace(/\n/g, " · "))
                )}
              </Row>
            ))}
            <Row label={DS.kvDefault} htmlFor="dp-kv">
              {canEdit ? (
                <YesNo id="dp-kv" value={draft.coverage.kvDefault} onChange={(v) => set("coverage", { ...draft.coverage, kvDefault: v })} />
              ) : draft.coverage.kvDefault ? DS.yes : DS.no}
              <span className="block text-label text-kit-slate-11">{KV_STATES.join(" · ")}</span>
            </Row>
          </SectionCard>
        )}

        {section === "schedule" && (
          <SectionCard title="Schedule" testId="delivery-settings-schedule">
            <Row label={DS.pickupDays}>
              <WeekdayPicker value={draft.schedule.pickupDays} days={[1, 2, 3, 4, 5, 6]} disabled={!canEdit} onChange={(v) => set("schedule", { ...draft.schedule, pickupDays: v })} />
            </Row>
            <Row label={DS.offDays}>
              <WeekdayPicker value={draft.schedule.offDays} days={[0, 1, 2, 3, 4, 5, 6]} disabled={!canEdit} onChange={(v) => set("schedule", { ...draft.schedule, offDays: v })} />
            </Row>
            <Row label={DS.capacity} htmlFor="dp-capacity">
              {canEdit ? (
                <Input id="dp-capacity" value={draft.schedule.capacity} placeholder={NOT_CONFIGURED} onChange={(e) => set("schedule", { ...draft.schedule, capacity: e.target.value })} />
              ) : orNotConfigured(draft.schedule.capacity)}
            </Row>
            <Row label={DS.leadDays} htmlFor="dp-lead">
              {canEdit ? (
                <Input id="dp-lead" value={draft.schedule.leadDays} onChange={(e) => set("schedule", { ...draft.schedule, leadDays: e.target.value })} />
              ) : draft.schedule.leadDays}
            </Row>
            <Row label={DS.cutoff} htmlFor="dp-cutoff">
              {canEdit ? (
                <Input id="dp-cutoff" value={draft.schedule.cutoff} placeholder="HH:MM" onChange={(e) => set("schedule", { ...draft.schedule, cutoff: e.target.value })} />
              ) : orNotConfigured(draft.schedule.cutoff)}
            </Row>
            <Row label={DS.blackouts} htmlFor="dp-blackouts">
              {canEdit ? (
                <Textarea id="dp-blackouts" rows={3} hint="One date per line, YYYY-MM-DD" value={draft.schedule.blackouts} placeholder={NOT_CONFIGURED} onChange={(e) => set("schedule", { ...draft.schedule, blackouts: e.target.value })} />
              ) : orNotConfigured(draft.schedule.blackouts.replace(/\n/g, " · "))}
            </Row>
            <Row label={DS.journeyRegions}>
              <div className="grid gap-2">
                {draft.schedule.regions.map((r, i) => (
                  <div key={i} className="grid gap-1 rounded-control border border-kit-slate-5 p-2" data-testid={`delivery-settings-region-${i}`}>
                    {canEdit ? (
                      <Input id={`dp-region-${i}`} label={DS.region} value={r.name} onChange={(e) => {
                        const regions = [...draft.schedule.regions];
                        regions[i] = { ...r, name: e.target.value };
                        set("schedule", { ...draft.schedule, regions });
                      }} />
                    ) : <span className="font-medium">{r.name}</span>}
                    <span className="text-label text-kit-slate-11">{DS.deliveryDays}</span>
                    <WeekdayPicker value={r.deliveryDays} days={[1, 2, 3, 4, 5, 6]} disabled={!canEdit} onChange={(v) => {
                      const regions = [...draft.schedule.regions];
                      regions[i] = { ...r, deliveryDays: v };
                      set("schedule", { ...draft.schedule, regions });
                    }} />
                    {canEdit ? (
                      <Input id={`dp-transit-${i}`} label={DS.transitDays} value={r.transitDays} onChange={(e) => {
                        const regions = [...draft.schedule.regions];
                        regions[i] = { ...r, transitDays: e.target.value };
                        set("schedule", { ...draft.schedule, regions });
                      }} />
                    ) : <span>{DS.transitDays} · {r.transitDays}</span>}
                  </div>
                ))}
                {canEdit ? (
                  <Button size="sm" onClick={() => set("schedule", { ...draft.schedule, regions: [...draft.schedule.regions, { name: "", deliveryDays: [], transitDays: "0" }] })}>
                    Add a region
                  </Button>
                ) : draft.schedule.regions.length === 0 ? <span className="text-kit-slate-9">{NOT_CONFIGURED}</span> : null}
              </div>
            </Row>
            <Row label={DS.surchargeAreas} htmlFor="dp-surcharge">
              {canEdit ? (
                <Textarea id="dp-surcharge" rows={2} hint={DS.onePerLine} value={draft.schedule.surchargeAreas} placeholder={NOT_CONFIGURED} onChange={(e) => set("schedule", { ...draft.schedule, surchargeAreas: e.target.value })} />
              ) : orNotConfigured(draft.schedule.surchargeAreas.replace(/\n/g, " · "))}
            </Row>
          </SectionCard>
        )}

        {section === "handover" && (
          <SectionCard title="Warehouses & handover points" testId="delivery-settings-handover">
            <Row label={DS.partnerWarehouse}>
              {partner.operating_party_id ? "Operated site recorded" : <span className="text-kit-slate-9">{NOT_CONFIGURED}</span>}
            </Row>
            <Row label={DS.handoverPoints}>
              <div className="grid gap-2">
                {draft.handover.map((h, i) => (
                  <div key={i} className="grid gap-1 rounded-control border border-kit-slate-5 p-2 md:grid-cols-3" data-testid={`delivery-settings-handover-${i}`}>
                    {canEdit ? (
                      <>
                        <Input id={`dp-hp-name-${i}`} label={DS.pointName} value={h.name} onChange={(e) => {
                          const handover = [...draft.handover]; handover[i] = { ...h, name: e.target.value }; set("handover", handover);
                        }} />
                        <Select id={`dp-hp-kind-${i}`} label={DS.pointKind} value={h.kind} onValueChange={(v) => {
                          const handover = [...draft.handover]; handover[i] = { ...h, kind: v as HandoverPoint["kind"] }; set("handover", handover);
                        }} options={[{ value: "pickup", label: DS.pickupPoint }, { value: "transit", label: DS.transitPoint }]} />
                        <Input id={`dp-hp-address-${i}`} label={DS.address} value={h.address ?? ""} onChange={(e) => {
                          const handover = [...draft.handover]; handover[i] = { ...h, address: e.target.value }; set("handover", handover);
                        }} />
                      </>
                    ) : (
                      <span>{h.name} · {h.kind === "pickup" ? DS.pickupPoint : DS.transitPoint} · {orNotConfigured(h.address)}</span>
                    )}
                  </div>
                ))}
                {canEdit ? (
                  <Button size="sm" onClick={() => set("handover", [...draft.handover, { name: "", kind: "pickup", address: "" }])}>{DS.addPoint}</Button>
                ) : draft.handover.length === 0 ? <span className="text-kit-slate-9">{NOT_CONFIGURED}</span> : null}
              </div>
            </Row>
          </SectionCard>
        )}

        {section === "fleet" && (
          <SectionCard title="Drivers and Vehicles" blurb="Templates the arrangement binds; a template chosen once is the fact the Delivery Order prints." testId="delivery-settings-fleet">
            <Row label={DS.drivers}>
              <div className="grid gap-2">
                {draft.fleet.drivers.map((d, i) => (
                  <div key={d.id ?? `new-${i}`} className="grid gap-1 rounded-control border border-kit-slate-5 p-2 md:grid-cols-3" data-testid={`delivery-settings-driver-${i}`}>
                    {canEdit ? (
                      <>
                        <Input id={`dp-driver-name-${i}`} label={DS.driverName} value={d.name} onChange={(e) => {
                          const drivers = [...draft.fleet.drivers]; drivers[i] = { ...d, name: e.target.value }; set("fleet", { ...draft.fleet, drivers });
                        }} />
                        <Input id={`dp-driver-phone-${i}`} label={DS.driverPhone} value={d.phone} onChange={(e) => {
                          const drivers = [...draft.fleet.drivers]; drivers[i] = { ...d, phone: e.target.value }; set("fleet", { ...draft.fleet, drivers });
                        }} />
                        <Select id={`dp-driver-active-${i}`} label={DS.status} value={d.active ? "active" : "inactive"} onValueChange={(v) => {
                          const drivers = [...draft.fleet.drivers]; drivers[i] = { ...d, active: v === "active" }; set("fleet", { ...draft.fleet, drivers });
                        }} options={[{ value: "active", label: DS.active }, { value: "inactive", label: DS.inactive }]} />
                      </>
                    ) : (
                      <span>{d.name} · {orNotConfigured(d.phone)} · {d.active ? DS.active : DS.inactive}</span>
                    )}
                  </div>
                ))}
                {canEdit ? (
                  <Button size="sm" data-testid="delivery-settings-add-driver" onClick={() => set("fleet", { ...draft.fleet, drivers: [...draft.fleet.drivers, { id: null, name: "", phone: "", active: true }] })}>{DS.addDriver}</Button>
                ) : draft.fleet.drivers.length === 0 ? <span className="text-kit-slate-9">{NOT_CONFIGURED}</span> : null}
              </div>
            </Row>
            <Row label={DS.vehicles}>
              <div className="grid gap-2">
                {draft.fleet.vehicles.map((v, i) => (
                  <div key={v.id ?? `new-${i}`} className="grid gap-1 rounded-control border border-kit-slate-5 p-2 md:grid-cols-3" data-testid={`delivery-settings-vehicle-${i}`}>
                    {canEdit ? (
                      <>
                        <Input id={`dp-plate-${i}`} label={DS.plate} value={v.plate} onChange={(e) => {
                          const vehicles = [...draft.fleet.vehicles]; vehicles[i] = { ...v, plate: e.target.value }; set("fleet", { ...draft.fleet, vehicles });
                        }} />
                        <Input id={`dp-vtype-${i}`} label={DS.vehicleType} value={v.vehicleType} onChange={(e) => {
                          const vehicles = [...draft.fleet.vehicles]; vehicles[i] = { ...v, vehicleType: e.target.value }; set("fleet", { ...draft.fleet, vehicles });
                        }} />
                        <Input id={`dp-vcap-${i}`} label={DS.vehicleCapacity} value={v.capacity} onChange={(e) => {
                          const vehicles = [...draft.fleet.vehicles]; vehicles[i] = { ...v, capacity: e.target.value }; set("fleet", { ...draft.fleet, vehicles });
                        }} />
                        <Input id={`dp-vdriver-${i}`} label={DS.driverName} value={v.driverName} onChange={(e) => {
                          const vehicles = [...draft.fleet.vehicles]; vehicles[i] = { ...v, driverName: e.target.value }; set("fleet", { ...draft.fleet, vehicles });
                        }} />
                        <Input id={`dp-vphone-${i}`} label={DS.driverPhone} value={v.driverPhone} onChange={(e) => {
                          const vehicles = [...draft.fleet.vehicles]; vehicles[i] = { ...v, driverPhone: e.target.value }; set("fleet", { ...draft.fleet, vehicles });
                        }} />
                        <Select id={`dp-vactive-${i}`} label={DS.status} value={v.active ? "active" : "inactive"} onValueChange={(val) => {
                          const vehicles = [...draft.fleet.vehicles]; vehicles[i] = { ...v, active: val === "active" }; set("fleet", { ...draft.fleet, vehicles });
                        }} options={[{ value: "active", label: DS.active }, { value: "inactive", label: DS.inactive }]} />
                      </>
                    ) : (
                      <span>{v.plate} · {v.vehicleType} · {orNotConfigured(v.capacity)} · {orNotConfigured(v.driverName)} · {v.active ? DS.active : DS.inactive}</span>
                    )}
                  </div>
                ))}
                {canEdit ? (
                  <Button size="sm" data-testid="delivery-settings-add-vehicle" onClick={() => set("fleet", { ...draft.fleet, vehicles: [...draft.fleet.vehicles, { id: null, plate: "", vehicleType: "", capacity: "", driverName: "", driverPhone: "", active: true }] })}>{DS.addVehicle}</Button>
                ) : draft.fleet.vehicles.length === 0 ? <span className="text-kit-slate-9">{NOT_CONFIGURED}</span> : null}
              </div>
            </Row>
          </SectionCard>
        )}

        {section === "services" && (
          <SectionCard title="Services & charges" testId="delivery-settings-services">
            {(["stairCarry", "dismantling", "disposal"] as const).map((key) => (
              <Row key={key} label={DS[key]} htmlFor={`dp-${key}`}>
                {canEdit ? (
                  <YesNo id={`dp-${key}`} value={draft.services[key]} onChange={(v) => set("services", { ...draft.services, [key]: v })} />
                ) : draft.services[key] ? DS.yes : DS.no}
              </Row>
            ))}
            <Row label={DS.charges} htmlFor="dp-charges">
              {canEdit ? (
                <Textarea id="dp-charges" rows={3} hint={DS.onePerLine} value={draft.services.charges} placeholder={NOT_CONFIGURED} onChange={(e) => set("services", { ...draft.services, charges: e.target.value })} />
              ) : orNotConfigured(draft.services.charges.replace(/\n/g, " · "))}
            </Row>
            <Row label={DS.surchargeAreas}>{orNotConfigured(draft.schedule.surchargeAreas.replace(/\n/g, " · "))}</Row>
          </SectionCard>
        )}

        {section === "access" && (
          <SectionCard title="Portal access" blurb={DS.visibilityRule} testId="delivery-settings-portal-access">
            <Row label={DS.accounts}>
              {data.partnerAccounts.filter((a) => a.partner_id === partner.id).length === 0 ? (
                <span className="text-kit-slate-9">{DS.noAccounts}</span>
              ) : (
                <ul>
                  {data.partnerAccounts.filter((a) => a.partner_id === partner.id).map((a) => (
                    <li key={a.id}>{a.name ?? a.email} · {a.email} · {a.status}</li>
                  ))}
                </ul>
              )}
            </Row>
          </SectionCard>
        )}

        <ChangesList changes={data.changes} partnerId={partner.id} />
      </div>
    </PageShell>
  );
}

function WeekdayPicker({ value, days, onChange, disabled }: { value: number[]; days: number[]; onChange: (v: number[]) => void; disabled?: boolean }) {
  return (
    <div className="flex flex-wrap gap-2">
      {days.map((d) => (
        <label key={d} className="inline-flex items-center gap-1 text-body">
          <input
            type="checkbox"
            checked={value.includes(d)}
            disabled={disabled}
            onChange={(e) => onChange(e.target.checked ? [...value, d].sort() : value.filter((x) => x !== d))}
          />
          {WEEKDAY_WORD[d as keyof typeof WEEKDAY_WORD] ?? String(d)}
        </label>
      ))}
    </div>
  );
}

/* ── Delivery Rules ───────────────────────────────────────────────────────── */
type RulesDraft = Record<string, { contactBy: "partner" | "operation"; onBehalf: boolean; proof: ProofRules }>;

function rulesDraftOf(data: DeliverySettingsResponse): RulesDraft {
  return Object.fromEntries(
    data.partners.map((p) => [
      p.id,
      {
        contactBy: p.customer_contact_by ?? "partner",
        onBehalf: p.record_on_behalf_allowed !== false,
        proof: (p.proof_rules as ProofRules | null) ?? DEFAULT_PROOF_RULES,
      },
    ]),
  );
}

function RulesPage({ data }: { data: DeliverySettingsResponse }) {
  const qc = useQueryClient();
  const [draft, setDraft] = useState<RulesDraft>(() => rulesDraftOf(data));
  useEffect(() => setDraft(rulesDraftOf(data)), [data]);
  const saved = useMemo(() => rulesDraftOf(data), [data]);
  const changedIds = data.partners.map((p) => p.id).filter((id) => !same(draft[id], saved[id]));
  const save = useMutation({
    mutationFn: async () => {
      for (const id of changedIds) {
        const r = draft[id]!;
        await apiFetch("/api/operation/delivery-settings/partner/rules", {
          method: "PUT",
          body: JSON.stringify({ partnerId: id, customerContactBy: r.contactBy, recordOnBehalfAllowed: r.onBehalf, proofRules: r.proof }),
        });
      }
    },
    onSuccess: () => toast.success(DS.saved),
    onError: (e: Error) => toast.error(e.message),
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: DELIVERY_SETTINGS_QUERY_KEY });
      void qc.invalidateQueries({ queryKey: ["operation", "partners"] });
    },
  });
  const canEdit = data.canEdit;
  const setRule = (id: string, patch: Partial<RulesDraft[string]>) =>
    setDraft((d) => ({ ...d, [id]: { ...d[id]!, ...patch } }));
  return (
    <PageShell
      variant="settings"
      title={DS.rules}
      titleRight={
        <Button variant="primary" data-testid="delivery-settings-save" disabled={!canEdit || changedIds.length === 0} loading={save.isPending} onClick={() => save.mutate()}>
          {DS.saveChanges}
        </Button>
      }
    >
      <div className="mx-auto grid w-full max-w-4xl gap-5 overflow-auto p-5" data-testid="delivery-settings-rules">
        {!canEdit && <p className="text-meta text-kit-slate-11" data-testid="delivery-settings-read-only">{DS.readOnly}</p>}
        <SectionCard title="Shared rules, read here and owned elsewhere" testId="delivery-settings-rule-mirrors">
          <Row label={DS.contactLead}>
            {data.contactLeadWorkingDays != null ? DS.contactLeadRule(data.contactLeadWorkingDays) : <span className="text-kit-slate-9">{NOT_CONFIGURED}</span>}
          </Row>
          <Row label={DS.paymentRule}>{DS.paymentRuleWord}</Row>
          <Row label={DS.doRule}>{DS.doRuleWord}</Row>
        </SectionCard>
        {data.partners.map((p) => {
          const r = draft[p.id];
          if (!r) return null;
          const services = (p.services as PartnerServices | null) ?? EMPTY_SERVICES;
          const supported = [services.stairCarry && DS.stairCarry, services.dismantling && DS.dismantling, services.disposal && DS.disposal].filter(Boolean).join(" · ");
          return (
            <SectionCard key={p.id} title={p.name} testId={`delivery-settings-rules-${p.id}`}>
              <Row label={DS.contactBy} htmlFor={`rule-contact-${p.id}`}>
                {canEdit ? (
                  <Select id={`rule-contact-${p.id}`} value={r.contactBy} onValueChange={(v) => setRule(p.id, { contactBy: v as "partner" | "operation" })}
                    options={[{ value: "partner", label: DS.contactByPartner }, { value: "operation", label: DS.contactByOperation }]} />
                ) : r.contactBy === "partner" ? DS.contactByPartner : DS.contactByOperation}
              </Row>
              <Row label={DS.onBehalf} htmlFor={`rule-behalf-${p.id}`}>
                {canEdit ? <YesNo id={`rule-behalf-${p.id}`} value={r.onBehalf} onChange={(v) => setRule(p.id, { onBehalf: v })} /> : r.onBehalf ? DS.yes : DS.no}
              </Row>
              <Row label={DS.proof}>
                <div className="grid gap-1">
                  {([
                    ["deliveredPhoto", DS.proofDeliveredPhoto],
                    ["deliveredSignedDo", DS.proofDeliveredSigned],
                    ["failedPhoto", DS.proofFailedPhoto],
                    ["partialSignedDo", DS.proofPartialSigned],
                  ] as const).map(([key, label]) => (
                    <label key={key} className="inline-flex items-center gap-2 text-body">
                      <input type="checkbox" checked={r.proof[key]} disabled={!canEdit} onChange={(e) => setRule(p.id, { proof: { ...r.proof, [key]: e.target.checked } })} />
                      {label}
                    </label>
                  ))}
                </div>
              </Row>
              <Row label={DS.servicesSupported}>{supported || <span className="text-kit-slate-9">{NOT_CONFIGURED}</span>}</Row>
            </SectionCard>
          );
        })}
        <ChangesList changes={data.changes.filter((c) => c.what === "partner_rules")} />
      </div>
    </PageShell>
  );
}

/* ── Message Templates ────────────────────────────────────────────────────── */
const DELIVERY_LIBRARY = {
  purposes: DELIVERY_TEMPLATE_PURPOSES,
  purposeWord: DELIVERY_TEMPLATE_PURPOSE_WORD as Record<string, string>,
  knownFields: DELIVERY_TEMPLATE_FIELDS,
  sampleFacts: {
    customer: "LIM KUAN YANG",
    so: "SO-1358",
    address: "12 Jalan Damai, Klang, Selangor",
    goods: "1× King Mattress",
    requested_date: "Thu, 24 Sep",
    confirmed_date: "Thu, 22 Oct",
    confirmed_time: "2 PM to 5 PM",
    partner: "NETS",
  },
  requiredFields: {},
  queryKey: ["operation", "delivery-templates"],
  listPath: "/api/operation/delivery-settings",
  savePath: "/api/operation/delivery-settings/templates/save",
  setDefaultPath: "/api/operation/delivery-settings/templates/set-default",
  setActivePath: "/api/operation/delivery-settings/templates/set-active",
  recipientWord: "the reader",
  extraSave: { channel: "whatsapp" },
};

function TemplatesPage({ data }: { data: DeliverySettingsResponse }) {
  return (
    <PageShell variant="settings" title={DS.templates}>
      <div className="mx-auto grid w-full max-w-4xl gap-5 overflow-auto p-5" data-testid="delivery-settings-templates">
        {!data.canEdit && <p className="text-meta text-kit-slate-11" data-testid="delivery-settings-read-only">{DS.readOnly}</p>}
        <section className="rounded-card border border-kit-slate-5 bg-white p-5">
          <TemplateLibrary config={DELIVERY_LIBRARY} />
        </section>
      </div>
    </PageShell>
  );
}

/* ── Access ───────────────────────────────────────────────────────────────── */
function AccessPage({ data }: { data: DeliverySettingsResponse }) {
  const keys = WORKSPACE_DUTIES.filter((d) => d.key === "delivery_duty" || d.key === "delivery_charge_approver");
  return (
    <PageShell variant="settings" title={DS.access}>
      <div className="mx-auto grid w-full max-w-4xl gap-5 overflow-auto p-5" data-testid="delivery-settings-access">
        {!data.canEdit && <p className="text-meta text-kit-slate-11" data-testid="delivery-settings-read-only">{DS.readOnly}</p>}
        <SectionCard title={DS.access} blurb={DS.accessRule}>
          {keys.map((d) => (
            <Row key={d.key} label={d.label}>
              <Link className="text-kit-blue-11" to="/operation?tab=staff-duties" data-testid={`delivery-settings-duty-${d.key}`}>
                {DS.openStaffDuties}
              </Link>
            </Row>
          ))}
        </SectionCard>
      </div>
    </PageShell>
  );
}

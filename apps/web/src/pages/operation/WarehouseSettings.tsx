// design-standard: not-a-list-page — this is a central Settings editor, not a Register.
/**
 * Settings → Warehouse — the ONE Warehouse Settings surface.
 *
 * `docs/stock/MASTER.md` §11: *"The only Warehouse Settings entry is
 * `Page Header → Settings → Warehouse`. No Inventory rail, Monitor, panel or
 * object menu may create a second Settings door."* §12.13 rules the same
 * surface ADAPT + RESTRICT: Warehouse owns Site, calendar, Count, evidence and
 * partner permission; **Workspace → Staff & Duties owns the duty rota and
 * People owns employment truth**, and this page links to them rather than
 * copying either.
 *
 * FIVE SECTIONS, ONE PAGE, ONE SAVE (owner card 2026-09-09):
 *
 *     Warehouse Settings                              [Save changes]
 *     Carres Klang Warehouse
 *     Operated by NETS Warehouse · Active
 *
 * The sections are rows in the governed Settings rail, because they are
 * sections of one module's settings — not five settings pages. Everything the
 * operator changes is held as a DRAFT until `Save changes`, which is why one
 * button can honestly say whether anything is different.
 *
 * **THE BUTTON NAMES ITS GAP.** `COPY-STANDARD.md` §Receiving: a disabled Save
 * that will not say why is a puzzle. So it reads `Save changes` while nothing
 * has moved, `Save changes — {what is wrong}` while something is invalid, and
 * becomes pressable only when a real change would survive the server's own
 * validation.
 *
 * **IT EDITS CONFIGURATION, NEVER WAREHOUSE WORK.** There is no writer here
 * for a Unit ID, a stock quantity, a condition, a completed Inbound or
 * Outbound record, a Count result, a Month-end version, a Delivery date, an
 * ETA, a route or a customer's delivery information — the rule is the absence
 * of the door, not a warning banner printed over the page.
 *
 * **NOTHING IS INVENTED.** An address, a phone number, a person or a holiday
 * date that Carres has not recorded prints `Not configured` / `Not assigned` /
 * `No individual recorded`. Yu Jun and Shasha are Carres Operations and are
 * never rendered as NETS Warehouse personnel.
 */
import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  HOLIDAY_AVAILABILITIES,
  HOLIDAY_AVAILABILITY_WORD,
  NOT_ASSIGNED,
  NOT_CONFIGURED,
  NO_INDIVIDUAL_RECORDED,
  SPECIAL_DATE_KINDS,
  SPECIAL_DATE_WORD,
  WAREHOUSE_ACTIVITIES,
  WAREHOUSE_ACTIVITY_WORD,
  WAREHOUSE_WEEKDAYS,
  WEEKDAY_WORD,
  hhmm,
  isSpecialHoursKind,
  type WarehouseActivity,
  type WarehouseCapabilityKey,
  type WarehouseHolidayAvailability,
  type WarehouseSettingsResponse,
  type WarehouseSpecialDateKind,
  type WarehouseWorkingHourRow,
} from "@carres/shared";
import { apiFetch } from "@/lib/api";
import Button from "@/components/kit/Button";
import Checkbox from "@/components/kit/Checkbox";
import Input from "@/components/kit/Input";
import PageShell from "@/components/kit/PageShell";
import Select from "@/components/kit/Select";
import { fmtDate } from "@/lib/fmt-date";

/** The rail's rows, in the card's order. Exported so the Settings Workspace
 *  builds its rail from this one list and the two can never disagree. */
export const WAREHOUSE_SETTINGS_SECTIONS = [
  { slug: "details", label: "Warehouse Details" },
  { slug: "working-hours", label: "Working Hours" },
  { slug: "public-holidays", label: "Public Holidays" },
  { slug: "special-dates", label: "Special Dates" },
  { slug: "access", label: "Access" },
] as const;

export type WarehouseSettingsSection = (typeof WAREHOUSE_SETTINGS_SECTIONS)[number]["slug"];

const QUERY_KEY = ["operation", "warehouse-settings"] as const;

/** The time zones a Carres Site can sit in today. The list is the governed
 *  set, not a world picker: an operator choosing `America/Denver` for a Klang
 *  warehouse is a mistake the control should not make possible. */
const TIME_ZONES = [
  { value: "Asia/Kuala_Lumpur", label: "Kuala Lumpur (GMT+8)" },
  { value: "Asia/Singapore", label: "Singapore (GMT+8)" },
] as const;

/** Malaysia and Selangor are the verified facts for Carres Klang Warehouse.
 *  The state list is Malaysia's own; nothing outside it is offered. */
const COUNTRIES = [{ value: "Malaysia", label: "Malaysia" }] as const;
const MY_STATES = [
  "Johor", "Kedah", "Kelantan", "Melaka", "Negeri Sembilan", "Pahang",
  "Perak", "Perlis", "Pulau Pinang", "Sabah", "Sarawak", "Selangor",
  "Terengganu", "Kuala Lumpur", "Labuan", "Putrajaya",
] as const;

// ---------------------------------------------------------------------------
// The draft
// ---------------------------------------------------------------------------

interface DetailsDraft {
  name: string;
  address: string;
  status: "active" | "closed";
  operatingPartyId: string;
  timeZone: string;
  keyContactId: string;
  contactNumber: string;
}
interface HoursCell {
  configured: boolean;
  closed: boolean;
  opensAt: string;
  closesAt: string;
}
type HoursDraft = Record<string, HoursCell>;

interface HolidayDraft {
  saved: boolean;
  follow: boolean;
  country: string;
  state: string;
  observeReplacement: boolean;
  availability: WarehouseHolidayAvailability;
  opensAt: string;
  closesAt: string;
}

interface SpecialDraft {
  onDate: string;
  kind: WarehouseSpecialDateKind;
  opensAt: string;
  closesAt: string;
  reason: string;
}

interface AccessDraft {
  /** capability → the person ids that should hold it after Save. */
  holders: Record<string, string[]>;
}

interface Draft {
  details: DetailsDraft;
  hours: HoursDraft;
  holiday: HolidayDraft;
  special: SpecialDraft;
  access: AccessDraft;
}

const hoursKey = (weekday: number, activity: WarehouseActivity) => `${weekday}:${activity}`;

const EMPTY_CELL: HoursCell = { configured: false, closed: false, opensAt: "", closesAt: "" };

const EMPTY_SPECIAL: SpecialDraft = {
  onDate: "",
  kind: "closed_all_day",
  opensAt: "",
  closesAt: "",
  reason: "",
};

function draftFrom(data: WarehouseSettingsResponse): Draft {
  const hours: HoursDraft = {};
  for (const weekday of WAREHOUSE_WEEKDAYS) {
    for (const activity of WAREHOUSE_ACTIVITIES) {
      const row = data.workingHours.find(
        (r) => r.weekday === weekday && r.activity === activity,
      );
      hours[hoursKey(weekday, activity)] = row
        ? {
            configured: true,
            closed: row.closed,
            opensAt: hhmm(row.opensAt) ?? "",
            closesAt: hhmm(row.closesAt) ?? "",
          }
        : { ...EMPTY_CELL };
    }
  }
  const p = data.holidayPolicy;
  return {
    details: {
      name: data.details.name,
      address: data.details.address ?? "",
      status: data.details.status,
      operatingPartyId: data.details.operatingPartyId ?? "",
      timeZone: data.details.timeZone,
      keyContactId: data.details.keyContactId ?? "",
      contactNumber: data.details.contactNumber ?? "",
    },
    hours,
    holiday: {
      saved: p != null,
      follow: p?.followPublicHolidays ?? false,
      country: p?.country ?? "Malaysia",
      state: p?.state ?? "Selangor",
      observeReplacement: p?.observeReplacement ?? false,
      availability: p?.defaultAvailability ?? "closed",
      opensAt: hhmm(p?.specialOpensAt ?? null) ?? "",
      closesAt: hhmm(p?.specialClosesAt ?? null) ?? "",
    },
    special: { ...EMPTY_SPECIAL },
    access: {
      holders: Object.fromEntries(
        data.capabilities.map((c) => [c.key, c.holders.map((h) => h.userId)]),
      ),
    },
  };
}

/** `Not configured` for a setting nobody recorded — never a blank and never a
 *  zero (`feedback_verify_with_an_authenticated_read`: absent is not zero). */
function orNotConfigured(v: string | null | undefined): string {
  return v && v.trim() ? v : NOT_CONFIGURED;
}

function sameStringSet(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  const sorted = [...a].sort();
  return [...b].sort().every((v, i) => v === sorted[i]);
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function WarehouseSettings() {
  const params = useParams();
  const section = (params.section ?? "details") as WarehouseSettingsSection;
  const qc = useQueryClient();

  const query = useQuery<WarehouseSettingsResponse>({
    queryKey: QUERY_KEY,
    queryFn: () => apiFetch("/api/operation/warehouse-settings"),
  });
  const data = query.data;

  const [draft, setDraft] = useState<Draft | null>(null);
  useEffect(() => {
    if (data) setDraft(draftFrom(data));
  }, [data]);

  const saved = useMemo(() => (data ? draftFrom(data) : null), [data]);

  const changes = useMemo(
    () => (data && draft && saved ? whatChanged(draft, saved) : []),
    [data, draft, saved],
  );
  const gap = useMemo(() => (draft ? firstGap(draft) : null), [draft]);

  const save = useMutation({
    mutationFn: async () => {
      if (!data || !draft) return;
      const siteId = data.details.siteId;
      const kinds = new Set(changes);
      if (kinds.has("details")) {
        await apiFetch("/api/operation/warehouse-settings/details", {
          method: "PUT",
          body: JSON.stringify({
            siteId,
            name: draft.details.name.trim(),
            address: draft.details.address.trim() || null,
            status: draft.details.status,
            operatingPartyId: draft.details.operatingPartyId || null,
            timeZone: draft.details.timeZone,
            keyContactId: draft.details.keyContactId || null,
            contactNumber: draft.details.contactNumber.trim() || null,
          }),
        });
      }
      if (kinds.has("hours")) {
        await apiFetch("/api/operation/warehouse-settings/working-hours", {
          method: "PUT",
          body: JSON.stringify({ siteId, rows: hourRowsOf(draft) }),
        });
      }
      if (kinds.has("holiday")) {
        await apiFetch("/api/operation/warehouse-settings/holiday-policy", {
          method: "PUT",
          body: JSON.stringify({
            siteId,
            followPublicHolidays: draft.holiday.follow,
            country: draft.holiday.country,
            state: draft.holiday.state || null,
            observeReplacement: draft.holiday.observeReplacement,
            defaultAvailability: draft.holiday.availability,
            specialOpensAt: draft.holiday.availability === "special" ? draft.holiday.opensAt : null,
            specialClosesAt: draft.holiday.availability === "special" ? draft.holiday.closesAt : null,
          }),
        });
      }
      if (kinds.has("special")) {
        await apiFetch("/api/operation/warehouse-settings/special-dates", {
          method: "POST",
          body: JSON.stringify({
            siteId,
            onDate: draft.special.onDate,
            kind: draft.special.kind,
            opensAt: isSpecialHoursKind(draft.special.kind) ? draft.special.opensAt : null,
            closesAt: isSpecialHoursKind(draft.special.kind) ? draft.special.closesAt : null,
            reason: draft.special.reason.trim(),
          }),
        });
      }
      if (kinds.has("access") && saved) {
        for (const cap of data.capabilities) {
          const now = draft.access.holders[cap.key] ?? [];
          const was = saved.access.holders[cap.key] ?? [];
          for (const userId of now.filter((id) => !was.includes(id))) {
            await apiFetch("/api/operation/warehouse-settings/access/grant", {
              method: "POST",
              body: JSON.stringify({ capability: cap.key, userId }),
            });
          }
          for (const userId of was.filter((id) => !now.includes(id))) {
            await apiFetch("/api/operation/warehouse-settings/access/revoke", {
              method: "POST",
              body: JSON.stringify({ capability: cap.key, userId }),
            });
          }
        }
      }
    },
    onSuccess: () => toast.success("Warehouse Settings saved"),
    onError: (e: Error) => toast.error(e.message),
    /* Sections are written one door at a time, so a refusal on the third can
       leave the first two saved. Refetching on FAILURE as well as on success
       is what makes the screen show what actually landed, instead of leaving
       the operator's draft on top of a different server truth. */
    onSettled: () => void qc.invalidateQueries({ queryKey: QUERY_KEY }),
  });

  if (query.isError) {
    return (
      <PageShell variant="settings" title="Warehouse Settings">
        <div role="alert" className="p-6 text-body">
          <p>Warehouse Settings could not be loaded. Try again.</p>
          <Button variant="neutral" onClick={() => void query.refetch()}>
            Try again
          </Button>
        </div>
      </PageShell>
    );
  }
  if (!data || !draft) {
    return (
      <PageShell variant="settings" title="Warehouse Settings">
        <div className="p-6 text-body text-kit-slate-11">Loading Warehouse Settings…</div>
      </PageShell>
    );
  }

  const canEdit = data.canEdit;
  const dirty = changes.length > 0;
  const saveLabel = !dirty ? "Save changes" : gap ? `Save changes — ${gap}` : "Save changes";
  const set = (next: Partial<Draft>) => setDraft((d) => (d ? { ...d, ...next } : d));

  return (
    <PageShell
      variant="settings"
      title="Warehouse Settings"
      titleRight={
        <Button
          variant="primary"
          data-testid="warehouse-settings-save"
          disabled={!canEdit || !dirty || gap != null}
          loading={save.isPending}
          onClick={() => save.mutate()}
        >
          {saveLabel}
        </Button>
      }
    >
      <div className="mx-auto grid w-full max-w-4xl gap-5 overflow-auto p-5" data-testid="warehouse-settings">
        {/* The Site identity, exactly as the card writes it. */}
        <div data-testid="warehouse-settings-identity">
          <div className="text-section font-display text-kit-slate-12">{data.details.name}</div>
          <div className="text-body text-kit-slate-11">
            {data.details.operatingPartyName
              ? `Operated by ${data.details.operatingPartyName}`
              : `Operated by ${NOT_CONFIGURED}`}
            {" · "}
            {data.details.status === "active" ? "Active" : "Closed"}
          </div>
        </div>

        {!canEdit && (
          <p className="text-meta text-kit-slate-11" data-testid="warehouse-settings-read-only">
            You can read Warehouse Settings. Changing them is the manager&apos;s, or someone the
            manager gives Manage Warehouse Settings to.
          </p>
        )}

        {section === "details" && (
          <DetailsSection data={data} draft={draft} canEdit={canEdit} onChange={(details) => set({ details })} />
        )}
        {section === "working-hours" && (
          <HoursSection draft={draft} canEdit={canEdit} onChange={(hours) => set({ hours })} />
        )}
        {section === "public-holidays" && (
          <HolidaysSection
            data={data}
            draft={draft}
            canEdit={canEdit}
            onChange={(holiday) => set({ holiday })}
          />
        )}
        {section === "special-dates" && (
          <SpecialDatesSection
            data={data}
            draft={draft}
            canEdit={canEdit}
            onChange={(special) => set({ special })}
          />
        )}
        {section === "access" && (
          <AccessSection data={data} draft={draft} canEdit={canEdit} onChange={(access) => set({ access })} />
        )}

        <ChangeHistory data={data} section={section} />
      </div>
    </PageShell>
  );
}

// ---------------------------------------------------------------------------
// What changed, and what is wrong
// ---------------------------------------------------------------------------

type ChangeKind = "details" | "hours" | "holiday" | "special" | "access";

export function hourRowsOf(draft: Draft): WarehouseWorkingHourRow[] {
  const rows: WarehouseWorkingHourRow[] = [];
  for (const weekday of WAREHOUSE_WEEKDAYS) {
    for (const activity of WAREHOUSE_ACTIVITIES) {
      const cell = draft.hours[hoursKey(weekday, activity)];
      if (!cell?.configured) continue;
      rows.push({
        weekday,
        activity,
        closed: cell.closed,
        opensAt: cell.closed ? null : cell.opensAt,
        closesAt: cell.closed ? null : cell.closesAt,
      });
    }
  }
  return rows;
}

export function whatChanged(draft: Draft, saved: Draft): ChangeKind[] {
  const out: ChangeKind[] = [];
  if (JSON.stringify(draft.details) !== JSON.stringify(saved.details)) out.push("details");
  if (JSON.stringify(draft.hours) !== JSON.stringify(saved.hours)) out.push("hours");
  if (JSON.stringify(draft.holiday) !== JSON.stringify(saved.holiday)) out.push("holiday");
  if (draft.special.onDate || draft.special.reason.trim()) out.push("special");
  for (const key of Object.keys(draft.access.holders)) {
    if (!sameStringSet(draft.access.holders[key] ?? [], saved.access.holders[key] ?? [])) {
      out.push("access");
      break;
    }
  }
  return out;
}

/**
 * The FIRST thing that would be refused, in the operator's words — the
 * governed "disabled Save names its gap" law. Null means the draft is savable.
 */
export function firstGap(draft: Draft): string | null {
  if (!draft.details.name.trim()) return "name the warehouse site";
  if (!draft.details.timeZone) return "choose the time zone";
  for (const weekday of WAREHOUSE_WEEKDAYS) {
    for (const activity of WAREHOUSE_ACTIVITIES) {
      const cell = draft.hours[hoursKey(weekday, activity)];
      if (!cell?.configured || cell.closed) continue;
      if (!cell.opensAt || !cell.closesAt) {
        return `give ${WEEKDAY_WORD[weekday]} ${WAREHOUSE_ACTIVITY_WORD[activity].toLowerCase()} both times`;
      }
      if (cell.closesAt <= cell.opensAt) {
        return `${WEEKDAY_WORD[weekday]} ${WAREHOUSE_ACTIVITY_WORD[activity].toLowerCase()} must close after it opens`;
      }
    }
  }
  if (draft.holiday.saved || draft.holiday.follow) {
    if (!draft.holiday.country) return "choose the country";
    if (draft.holiday.availability === "special") {
      if (!draft.holiday.opensAt || !draft.holiday.closesAt) return "give both public-holiday times";
      if (draft.holiday.closesAt <= draft.holiday.opensAt) {
        return "public-holiday hours must close after they open";
      }
    }
  }
  /* A Special Date is only being written when the operator has started one.
     An untouched form is not a gap — it is simply nothing to save. */
  const s = draft.special;
  if (s.onDate || s.reason.trim()) {
    if (!s.onDate) return "pick the Special Date";
    if (!s.reason.trim()) return "say why this date is different";
    if (isSpecialHoursKind(s.kind)) {
      if (!s.opensAt || !s.closesAt) return "give both Special Date times";
      if (s.closesAt <= s.opensAt) return "the Special Date must close after it opens";
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// The audit trail — who changed what, when, and what it was before
// ---------------------------------------------------------------------------

/** Which recorded changes belong to the section being read. The audit is one
 *  log; showing the whole thing under every section would make the reader
 *  hunt, and hiding it entirely would waste the one record that answers
 *  "who moved this?". */
const CHANGE_PREFIX: Record<WarehouseSettingsSection, string[]> = {
  details: ["site_details:"],
  "working-hours": ["working_hours:"],
  "public-holidays": ["holiday_policy:", "holiday_calendar:"],
  "special-dates": ["special_date:"],
  access: ["access:"],
};

/** `site_details:{uuid}` reads as nothing to an operator. */
const CHANGE_WORD: Array<[string, string]> = [
  ["site_details:", "Warehouse Details"],
  ["working_hours:", "Working Hours"],
  ["holiday_policy:", "Public-holiday policy"],
  ["holiday_calendar:", "Holiday calendar imported"],
  ["special_date:", "Special Date"],
  ["access:manage_warehouse_settings", "Access · Manage Warehouse Settings"],
  ["access:confirm_inbound_receipt", "Access · Confirm inbound receipt"],
  ["access:confirm_collection_from_warehouse", "Access · Confirm collection from Warehouse"],
  ["access:perform_stock_count", "Access · Perform stock count"],
];

function changeWord(what: string): string {
  /* Longest prefix first, so `access:perform_stock_count` never resolves to
     the bare `access:` heading. */
  const hit = [...CHANGE_WORD]
    .sort((a, b) => b[0].length - a[0].length)
    .find(([prefix]) => what.startsWith(prefix));
  return hit ? hit[1] : what;
}

function ChangeHistory({
  data,
  section,
}: {
  data: WarehouseSettingsResponse;
  section: WarehouseSettingsSection;
}) {
  const prefixes = CHANGE_PREFIX[section] ?? [];
  const rows = data.changes
    .filter((c) => prefixes.some((p) => c.what.startsWith(p)))
    .slice(0, 20);

  return (
    <section
      className="rounded-card border border-kit-slate-5 bg-white p-5"
      data-testid="warehouse-settings-history"
    >
      <h2 className="text-section">History</h2>
      {rows.length === 0 ? (
        <p className="mt-1 text-body text-kit-slate-11">
          Nothing has been changed here yet.
        </p>
      ) : (
        <ul className="mt-2 grid gap-2">
          {rows.map((c) => (
            <li key={c.id} className="text-body">
              <span className="font-semibold">{changeWord(c.what)}</span>
              <div className="text-meta text-kit-slate-11">
                {c.actorName ?? "Not recorded"} · {fmtDate(c.changedAt)}
                {c.reason ? ` · ${c.reason}` : ""}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// A1 · Warehouse Details
// ---------------------------------------------------------------------------

/**
 * One `label — value` line. When the row carries an editable control, `htmlFor`
 * makes the left column a REAL `<label>` bound to it: the word is then the
 * control's accessible name and clicking it moves focus there. A settings row
 * whose label is only a `<div>` beside a box is a box a screen reader cannot
 * name.
 */
function Row({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid grid-cols-[180px_minmax(0,1fr)] items-start gap-3 py-1.5">
      {htmlFor ? (
        <label htmlFor={htmlFor} className="text-body text-kit-slate-11">
          {label}
        </label>
      ) : (
        <div className="text-body text-kit-slate-11">{label}</div>
      )}
      <div className="min-w-0 text-body text-kit-slate-12">{children}</div>
    </div>
  );
}

function DetailsSection({
  data,
  draft,
  canEdit,
  onChange,
}: {
  data: WarehouseSettingsResponse;
  draft: Draft;
  canEdit: boolean;
  onChange: (d: DetailsDraft) => void;
}) {
  const d = draft.details;
  const patch = (p: Partial<DetailsDraft>) => onChange({ ...d, ...p });
  const contact = data.people.find((p) => p.id === d.keyContactId);
  /* A key contact who has since been disabled KEEPS the record — history must
     still say who it was — and is simply no longer in the picker. */
  const recordedButGone = d.keyContactId && !contact ? data.details.keyContactName : null;

  return (
    <section className="rounded-card border border-kit-slate-5 bg-white p-5" data-testid="warehouse-details">
      <h2 className="text-section">Warehouse Details</h2>
      <p className="mt-1 text-body text-kit-slate-11">
        Who runs this site, where it is, and who to call. Operated by is an organisation. Key
        contact is a person from People — this page never creates one.
      </p>

      <div className="mt-4 grid gap-1">
        <Row label="Warehouse site" htmlFor={canEdit ? "wh-name" : undefined}>
          {canEdit ? (
            <Input
              id="wh-name"
              value={d.name}
              onChange={(e) => patch({ name: e.target.value })}
              aria-label="Warehouse site"
            />
          ) : (
            data.details.name
          )}
        </Row>
        <Row label="Status" htmlFor={canEdit ? "wh-status" : undefined}>
          {canEdit ? (
            <Select
              id="wh-status"
              value={d.status}
              onValueChange={(v) => patch({ status: v as "active" | "closed" })}
              options={[
                { value: "active", label: "Active" },
                { value: "closed", label: "Closed" },
              ]}
            />
          ) : d.status === "active" ? (
            "Active"
          ) : (
            "Closed"
          )}
        </Row>
        <Row label="Operated by" htmlFor={canEdit ? "wh-operator" : undefined}>
          {canEdit ? (
            <Select
              id="wh-operator"
              value={d.operatingPartyId || undefined}
              onValueChange={(v) => patch({ operatingPartyId: v })}
              placeholder={NOT_CONFIGURED}
              options={data.operatingParties.map((p) => ({ value: p.id, label: p.name }))}
            />
          ) : (
            orNotConfigured(data.details.operatingPartyName)
          )}
        </Row>
        <Row label="Full address" htmlFor={canEdit ? "wh-address" : undefined}>
          {canEdit ? (
            <Input
              id="wh-address"
              value={d.address}
              placeholder={NOT_CONFIGURED}
              onChange={(e) => patch({ address: e.target.value })}
              aria-label="Full address"
            />
          ) : (
            orNotConfigured(data.details.address)
          )}
        </Row>
        <Row label="Time zone" htmlFor={canEdit ? "wh-timezone" : undefined}>
          {canEdit ? (
            <Select
              id="wh-timezone"
              value={d.timeZone}
              onValueChange={(v) => patch({ timeZone: v })}
              options={TIME_ZONES.map((t) => ({ value: t.value, label: t.label }))}
            />
          ) : (
            (TIME_ZONES.find((t) => t.value === d.timeZone)?.label ?? d.timeZone)
          )}
        </Row>
        <Row label="Key contact" htmlFor={canEdit ? "wh-key-contact" : undefined}>
          {canEdit ? (
            <Select
              id="wh-key-contact"
              value={d.keyContactId || undefined}
              onValueChange={(v) => patch({ keyContactId: v === "__none__" ? "" : v })}
              placeholder={NOT_ASSIGNED}
              options={[
                { value: "__none__", label: NOT_ASSIGNED },
                ...data.people.map((p) => ({
                  value: p.id,
                  label: p.organisation ? `${p.name} · ${p.organisation}` : p.name,
                })),
              ]}
            />
          ) : d.keyContactId ? (
            (data.details.keyContactName ?? NO_INDIVIDUAL_RECORDED)
          ) : (
            NOT_ASSIGNED
          )}
          {recordedButGone && (
            <div className="text-meta text-kit-slate-11" data-testid="key-contact-departed">
              {recordedButGone} is recorded here and has left. Choose an active person.
            </div>
          )}
          {!d.keyContactId && (
            <div className="text-meta text-kit-slate-11" data-testid="key-contact-none">
              {NO_INDIVIDUAL_RECORDED} for {data.details.operatingPartyName ?? "this operator"}.
            </div>
          )}
        </Row>
        <Row label="Contact number" htmlFor={canEdit ? "wh-contact-number" : undefined}>
          {canEdit ? (
            <Input
              id="wh-contact-number"
              type="tel"
              value={d.contactNumber}
              placeholder={NOT_CONFIGURED}
              onChange={(e) => patch({ contactNumber: e.target.value })}
              aria-label="Contact number"
            />
          ) : (
            orNotConfigured(data.details.contactNumber)
          )}
        </Row>
      </div>

      <p className="mt-4 text-meta text-kit-slate-11">
        People, leave and last working date live in People. Who is on PO Duty or GRN Duty today
        lives in Workspace → Staff &amp; Duties. Neither is copied here.
      </p>
    </section>
  );
}

// ---------------------------------------------------------------------------
// A2 · Working Hours
// ---------------------------------------------------------------------------

function HoursSection({
  draft,
  canEdit,
  onChange,
}: {
  draft: Draft;
  canEdit: boolean;
  onChange: (h: HoursDraft) => void;
}) {
  const patch = (weekday: number, activity: WarehouseActivity, cell: Partial<HoursCell>) => {
    const key = hoursKey(weekday, activity);
    const current = draft.hours[key] ?? EMPTY_CELL;
    onChange({ ...draft.hours, [key]: { ...current, ...cell } });
  };

  return (
    <section className="rounded-card border border-kit-slate-5 bg-white p-5" data-testid="warehouse-working-hours">
      <h2 className="text-section">Working Hours</h2>
      <p className="mt-1 text-body text-kit-slate-11">
        Receiving hours are when suppliers or transport can bring goods in. Collection hours are
        when an authorised Delivery partner can collect goods. A day can be closed for one and
        open for the other. Times are this site&apos;s own time zone.
      </p>

      <table className="mt-4 w-full text-body">
        <thead>
          <tr className="border-b border-kit-slate-5 text-left">
            <th scope="col" className="py-2 pr-3 font-semibold">Day</th>
            {WAREHOUSE_ACTIVITIES.map((a) => (
              <th key={a} scope="col" className="py-2 pr-3 font-semibold">
                {WAREHOUSE_ACTIVITY_WORD[a]}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {WAREHOUSE_WEEKDAYS.map((weekday) => (
            <tr key={weekday} className="border-b border-kit-slate-3 align-top">
              <th scope="row" className="py-2 pr-3 text-left font-normal">
                {WEEKDAY_WORD[weekday]}
              </th>
              {WAREHOUSE_ACTIVITIES.map((activity) => {
                const cell = draft.hours[hoursKey(weekday, activity)] ?? EMPTY_CELL;
                const id = `hours-${weekday}-${activity}`;
                const cellLabel = `${WEEKDAY_WORD[weekday]} ${WAREHOUSE_ACTIVITY_WORD[activity]}`;
                if (!canEdit) {
                  return (
                    <td key={activity} className="py-2 pr-3" data-testid={id}>
                      {!cell.configured
                        ? NOT_CONFIGURED
                        : cell.closed
                          ? "Closed"
                          : `${cell.opensAt}–${cell.closesAt}`}
                    </td>
                  );
                }
                return (
                  <td key={activity} className="py-2 pr-3" data-testid={id}>
                    {!cell.configured ? (
                      <div className="flex items-center gap-2">
                        <span className="text-kit-slate-11">{NOT_CONFIGURED}</span>
                        <Button
                          size="sm"
                          variant="neutral"
                          aria-label={`Set ${cellLabel}`}
                          onClick={() =>
                            patch(weekday, activity, { configured: true, closed: false })
                          }
                        >
                          Set hours
                        </Button>
                      </div>
                    ) : (
                      <div className="grid gap-1.5">
                        <Checkbox
                          id={`${id}-closed`}
                          label="Closed"
                          checked={cell.closed}
                          onCheckedChange={(closed) =>
                            patch(weekday, activity, {
                              closed,
                              opensAt: closed ? "" : cell.opensAt,
                              closesAt: closed ? "" : cell.closesAt,
                            })
                          }
                        />
                        {!cell.closed && (
                          <div className="flex items-center gap-1.5">
                            <Input
                              id={`${id}-opens`}
                              type="time"
                              value={cell.opensAt}
                              aria-label={`${cellLabel} opens at`}
                              onChange={(e) => patch(weekday, activity, { opensAt: e.target.value })}
                            />
                            <span aria-hidden>–</span>
                            <Input
                              id={`${id}-closes`}
                              type="time"
                              value={cell.closesAt}
                              aria-label={`${cellLabel} closes at`}
                              onChange={(e) => patch(weekday, activity, { closesAt: e.target.value })}
                            />
                          </div>
                        )}
                        {!cell.closed && cell.opensAt && cell.closesAt && cell.closesAt <= cell.opensAt && (
                          <p role="alert" className="text-meta text-danger">
                            The closing time must be later than the opening time.
                          </p>
                        )}
                        <Button
                          size="sm"
                          variant="neutral"
                          aria-label={`Clear ${cellLabel}`}
                          onClick={() => patch(weekday, activity, { ...EMPTY_CELL })}
                        >
                          Clear
                        </Button>
                      </div>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

// ---------------------------------------------------------------------------
// B1 · Public Holidays
// ---------------------------------------------------------------------------

function HolidaysSection({
  data,
  draft,
  canEdit,
  onChange,
}: {
  data: WarehouseSettingsResponse;
  draft: Draft;
  canEdit: boolean;
  onChange: (h: HolidayDraft) => void;
}) {
  const h = draft.holiday;
  const patch = (p: Partial<HolidayDraft>) => onChange({ ...h, ...p });
  const activeCalendar = data.holidayCalendars.find((c) => c.active) ?? null;

  return (
    <section className="rounded-card border border-kit-slate-5 bg-white p-5" data-testid="warehouse-public-holidays">
      <h2 className="text-section">Public Holidays</h2>

      {!data.holidayPolicy && (
        <p className="mt-1 text-body text-kit-slate-12" data-testid="holiday-policy-state">
          Public-holiday policy {NOT_CONFIGURED}
        </p>
      )}

      <p className="mt-1 text-body text-kit-slate-11">
        Nothing is assumed. The Warehouse only follows public holidays after somebody saves this
        policy, and only for the dates in an imported calendar.
      </p>

      <div className="mt-4 grid gap-1">
        <Row label="Follow public holidays" htmlFor={canEdit ? "holiday-follow" : undefined}>
          {canEdit ? (
            <Checkbox
              id="holiday-follow"
              label=""
              ariaLabel="Follow public holidays"
              checked={h.follow}
              onCheckedChange={(follow) => patch({ follow })}
            />
          ) : h.follow ? (
            "Yes"
          ) : (
            "No"
          )}
        </Row>
        <Row label="Country" htmlFor={canEdit ? "holiday-country" : undefined}>
          {canEdit ? (
            <Select
              id="holiday-country"
              value={h.country || undefined}
              onValueChange={(country) => patch({ country })}
              placeholder={NOT_CONFIGURED}
              options={COUNTRIES.map((c) => ({ value: c.value, label: c.label }))}
            />
          ) : (
            orNotConfigured(h.country)
          )}
        </Row>
        <Row label="State" htmlFor={canEdit ? "holiday-state" : undefined}>
          {canEdit ? (
            <Select
              id="holiday-state"
              value={h.state || undefined}
              onValueChange={(state) => patch({ state })}
              placeholder={NOT_CONFIGURED}
              options={MY_STATES.map((s) => ({ value: s, label: s }))}
            />
          ) : (
            orNotConfigured(h.state)
          )}
        </Row>
        <Row label="Observed/replacement holidays" htmlFor={canEdit ? "holiday-observed" : undefined}>
          {canEdit ? (
            <Checkbox
              id="holiday-observed"
              label="Follow observed and replacement holidays too"
              ariaLabel="Observed/replacement holidays"
              checked={h.observeReplacement}
              onCheckedChange={(observeReplacement) => patch({ observeReplacement })}
            />
          ) : h.observeReplacement ? (
            "Followed"
          ) : (
            "Not followed"
          )}
        </Row>
        <Row label="Default public-holiday availability" htmlFor={canEdit ? "holiday-availability" : undefined}>
          {canEdit ? (
            <Select
              id="holiday-availability"
              value={h.availability}
              onValueChange={(v) => patch({ availability: v as WarehouseHolidayAvailability })}
              options={HOLIDAY_AVAILABILITIES.map((a) => ({
                value: a,
                label: HOLIDAY_AVAILABILITY_WORD[a],
              }))}
            />
          ) : (
            HOLIDAY_AVAILABILITY_WORD[h.availability]
          )}
        </Row>
        {h.availability === "special" && canEdit && (
          <Row label="Public-holiday hours">
            <div className="flex items-center gap-1.5">
              <Input
                id="holiday-opens"
                type="time"
                value={h.opensAt}
                aria-label="Public-holiday opens at"
                onChange={(e) => patch({ opensAt: e.target.value })}
              />
              <span aria-hidden>–</span>
              <Input
                id="holiday-closes"
                type="time"
                value={h.closesAt}
                aria-label="Public-holiday closes at"
                onChange={(e) => patch({ closesAt: e.target.value })}
              />
            </div>
          </Row>
        )}
      </div>

      <div className="mt-5 rounded-card border border-kit-slate-5 p-4" data-testid="holiday-calendar">
        <h3 className="text-strong">Holiday calendar</h3>
        {activeCalendar ? (
          <div className="mt-1 text-body">
            <p>
              {activeCalendar.country}
              {activeCalendar.state ? ` · ${activeCalendar.state}` : ""} · version{" "}
              {activeCalendar.version} · {activeCalendar.dateCount} dates
            </p>
            <p className="text-meta text-kit-slate-11">
              From {activeCalendar.sourceName} · {activeCalendar.sourceReference} · verified{" "}
              {fmtDate(activeCalendar.verifiedAt)} · imported by{" "}
              {activeCalendar.importedByName ?? "Not recorded"} {fmtDate(activeCalendar.importedAt)}
            </p>
          </div>
        ) : (
          <p className="mt-1 text-body" data-testid="holiday-calendar-empty">
            No holiday calendar has been imported. Carres has not chosen an official calendar to
            trust yet, so no date is recorded and none is guessed. Until one is imported, a public
            holiday changes nothing.
          </p>
        )}
        <p className="mt-2 text-meta text-kit-slate-11">
          A calendar is imported by hand from a source you name and have checked. Dates are kept
          here afterwards, so this page never asks an outside service anything. There is no
          automatic sync.
        </p>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// A3 · Special Dates
// ---------------------------------------------------------------------------

function SpecialDatesSection({
  data,
  draft,
  canEdit,
  onChange,
}: {
  data: WarehouseSettingsResponse;
  draft: Draft;
  canEdit: boolean;
  onChange: (s: SpecialDraft) => void;
}) {
  const s = draft.special;
  const patch = (p: Partial<SpecialDraft>) => onChange({ ...s, ...p });
  const today = new Date().toISOString().slice(0, 10);
  const upcoming = data.specialDates.filter((r) => r.onDate >= today);
  const past = data.specialDates.filter((r) => r.onDate < today);

  return (
    <section className="rounded-card border border-kit-slate-5 bg-white p-5" data-testid="warehouse-special-dates">
      <h2 className="text-section">Special Dates</h2>
      <p className="mt-1 text-body text-kit-slate-11">
        A day that is different from the normal week or the public-holiday policy. Every one needs
        a reason. A Special Date beats every other rule on that day.
      </p>

      {canEdit && (
        <div className="mt-4 grid gap-3" data-testid="special-date-form">
          <div className="grid grid-cols-2 gap-3">
            <Input
              id="special-date"
              label="Date"
              type="text"
              placeholder="2026-09-30"
              value={s.onDate}
              onChange={(e) => patch({ onDate: e.target.value })}
              hint="Give a date like 2026-09-30"
            />
            <Select
              id="special-kind"
              label="What is different"
              value={s.kind}
              onValueChange={(v) => patch({ kind: v as WarehouseSpecialDateKind })}
              options={SPECIAL_DATE_KINDS.map((k) => ({ value: k, label: SPECIAL_DATE_WORD[k] }))}
            />
          </div>
          {isSpecialHoursKind(s.kind) && (
            <div className="flex items-end gap-1.5">
              <Input
                id="special-opens"
                label="Opens at"
                type="time"
                value={s.opensAt}
                onChange={(e) => patch({ opensAt: e.target.value })}
              />
              <Input
                id="special-closes"
                label="Closes at"
                type="time"
                value={s.closesAt}
                onChange={(e) => patch({ closesAt: e.target.value })}
              />
            </div>
          )}
          <Input
            id="special-reason"
            label="Reason"
            required
            value={s.reason}
            onChange={(e) => patch({ reason: e.target.value })}
            hint="Say why this date is different. It is kept with the record."
          />
        </div>
      )}

      <h3 className="mt-6 text-strong">Upcoming</h3>
      {upcoming.length === 0 ? (
        <p className="text-body text-kit-slate-11" data-testid="special-upcoming-empty">
          No Special Date is coming up.
        </p>
      ) : (
        <ul className="mt-1 grid gap-2" data-testid="special-upcoming">
          {upcoming.map((r) => (
            <li key={r.id} className="text-body">
              <span className="font-semibold">{r.onDate}</span> · {SPECIAL_DATE_WORD[r.kind]}
              {r.opensAt && r.closesAt ? ` · ${hhmm(r.opensAt)}–${hhmm(r.closesAt)}` : ""} · {r.reason}
              <div className="text-meta text-kit-slate-11">
                {r.updatedByName ?? r.createdByName ?? "Not recorded"} · {fmtDate(r.updatedAt)}
              </div>
            </li>
          ))}
        </ul>
      )}

      <h3 className="mt-6 text-strong">Past</h3>
      {past.length === 0 ? (
        <p className="text-body text-kit-slate-11" data-testid="special-past-empty">
          No Special Date has passed yet.
        </p>
      ) : (
        <ul className="mt-1 grid gap-2" data-testid="special-past">
          {past.map((r) => (
            <li key={r.id} className="text-body text-kit-slate-11">
              <span className="font-semibold">{r.onDate}</span> · {SPECIAL_DATE_WORD[r.kind]} ·{" "}
              {r.reason}
              <div className="text-meta">
                {r.updatedByName ?? r.createdByName ?? "Not recorded"} · {fmtDate(r.updatedAt)} ·
                read-only
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// B3 · Access
// ---------------------------------------------------------------------------

function AccessSection({
  data,
  draft,
  canEdit,
  onChange,
}: {
  data: WarehouseSettingsResponse;
  draft: Draft;
  canEdit: boolean;
  onChange: (a: AccessDraft) => void;
}) {
  const toggle = (capability: WarehouseCapabilityKey, userId: string, on: boolean) => {
    const held = draft.access.holders[capability] ?? [];
    const next = on ? [...held, userId] : held.filter((id) => id !== userId);
    onChange({ holders: { ...draft.access.holders, [capability]: next } });
  };

  return (
    <section className="rounded-card border border-kit-slate-5 bg-white p-5" data-testid="warehouse-access">
      <h2 className="text-section">Access</h2>
      <p className="mt-1 text-body text-kit-slate-11">
        Who may do each Warehouse job. Only people who are still with Carres can be given access.
        Nothing here reaches a Delivery date, an ETA, a route or a customer&apos;s delivery
        information.
      </p>

      <div className="mt-4 grid gap-4">
        {data.capabilities.map((cap) => {
          const held = draft.access.holders[cap.key] ?? [];
          /* A grant recorded for somebody who has since left keeps their name —
             the audit must still answer "who held this?" — while the picker
             below offers active People only. */
          const departedHolders = cap.holders.filter(
            (h) => held.includes(h.userId) && !data.people.some((p) => p.id === h.userId),
          );
          return (
            <div
              key={cap.key}
              className="rounded-card border border-kit-slate-5 p-4"
              data-testid={`capability-${cap.key}`}
            >
              <h3 className="text-strong">{cap.label}</h3>
              <p className="text-meta text-kit-slate-11">{cap.helper}</p>
              <p className="text-meta text-kit-slate-11">{cap.appliesTo}</p>
              <div className="mt-2 grid gap-1">
                {data.people.length === 0 ? (
                  <p className="text-body">{NO_INDIVIDUAL_RECORDED}</p>
                ) : (
                  data.people.map((person) => (
                    <Checkbox
                      key={person.id}
                      id={`${cap.key}-${person.id}`}
                      label={
                        person.organisation ? `${person.name} · ${person.organisation}` : person.name
                      }
                      disabled={!canEdit}
                      checked={held.includes(person.id)}
                      onCheckedChange={(on) => toggle(cap.key, person.id, on)}
                    />
                  ))
                )}
                {departedHolders.map((h) => (
                  <p
                    key={h.userId}
                    className="text-meta text-kit-slate-11"
                    data-testid={`capability-departed-${cap.key}`}
                  >
                    {h.name} held this and has left. Take it back to end it.
                  </p>
                ))}
                {held.length === 0 && (
                  <p className="text-meta text-kit-slate-11">{NOT_ASSIGNED}</p>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <p className="mt-4 text-meta text-kit-slate-11">
        Roles, joining and leaving live in People. Who is on PO Duty or GRN Duty today lives in
        Workspace → Staff &amp; Duties. This page changes neither.
      </p>
    </section>
  );
}

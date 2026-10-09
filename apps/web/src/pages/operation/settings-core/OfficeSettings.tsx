// design-standard: not-a-list-page — this is a central Settings editor, not a Register.
/**
 * Settings → Office (Carres Settings List OFF-01 … OFF-05, owner confirmed
 * 9 Oct 2026; storage 0669). The ONE Office calendar every Office-based
 * deadline reads: working weekdays (Monday to Friday), office hours (9:00 AM
 * to 6:00 PM), flexi (one hour), lunch (1:00 PM to 2:00 PM, may move by one
 * hour) and the Office public holidays (Kuala Lumpur).
 *
 * Saturday on-call is a Staff & Duties rota; it never makes Saturday an Office
 * working day. Supplier work weeks, Warehouse hours and Logistics schedules are
 * separate calendars and are not edited here.
 *
 * Holidays are recorded one YEAR at a time. A year nobody recorded keeps the
 * built-in list, and the page says so — no Kuala Lumpur date is invented.
 */
import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  BUILT_IN_HOLIDAY_YEARS,
  DEFAULT_OFFICE_CALENDAR,
  officeCalendarValuesSchema,
  type OfficeCalendarValues,
} from "@carres/shared";
import Button from "@/components/kit/Button";
import Checkbox from "@/components/kit/Checkbox";
import DatePicker from "@/components/kit/DatePicker";
import Input from "@/components/kit/Input";
import Loading from "@/components/kit/Loading";
import PageShell from "@/components/kit/PageShell";
import Select from "@/components/kit/Select";
import { appTodayIso, fmtDate } from "@/lib/fmt-date";
import { useOfficeSettings, useSaveOfficeCalendar, useSaveOfficeHolidays } from "@/lib/settings-queries";
import { ChangeList, Notice, Row, Section, Value, W, clock12, minutesWord, refusalOf } from "./parts";

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] as const;
const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0] as const;

const FIELD_LABEL: Record<string, string> = {
  work_days: "Office working days",
  start_time: "Office opens",
  end_time: "Office closes",
  flexi_minutes: "Flexi allowance",
  lunch_start: "Lunch starts",
  lunch_end: "Lunch ends",
  lunch_shift_minutes: "Lunch may move by",
  holiday_region: "Holiday region",
};

function daysWord(days: readonly number[]): string {
  const set = new Set(days);
  const list = WEEK_ORDER.filter((d) => set.has(d)).map((d) => DAY_NAMES[d]);
  if (list.length === 5 && !set.has(0) && !set.has(6)) return "Monday to Friday";
  if (list.length === 6 && !set.has(0)) return "Monday to Saturday";
  return list.join(", ");
}

function valueWord(field: string, v: unknown): string {
  if (v == null) return W.notSet;
  if (field === "work_days" && Array.isArray(v)) return daysWord(v.map(Number));
  if (field.endsWith("_minutes")) return minutesWord(Number(v));
  if (field.endsWith("_time") || field === "lunch_start" || field === "lunch_end") return clock12(String(v));
  if (Array.isArray(v)) {
    const list = v as { date?: string; name?: string }[];
    return list.length === 0 ? "Built-in list" : `${list.length} holidays`;
  }
  return String(v);
}

export default function OfficeSettings() {
  const query = useOfficeSettings();
  if (query.isError) {
    return (
      <PageShell variant="settings" title="Office">
        <div role="alert" className="p-6 text-body">
          <p>{W.loadFailed}</p>
          <Button variant="neutral" onClick={() => void query.refetch()}>{W.tryAgain}</Button>
        </div>
      </PageShell>
    );
  }
  if (!query.data) {
    return <PageShell variant="settings" title="Office"><Loading label={W.loading} /></PageShell>;
  }
  const data = query.data;
  const editable = data.stored && data.canEdit;
  return (
    <PageShell variant="settings" title="Office">
      <div className="mx-auto grid w-full max-w-4xl gap-5 overflow-auto p-5" data-testid="office-settings">
        {!data.stored && <Notice testId="office-not-installed">{W.notInstalled}</Notice>}
        {data.stored && !data.canEdit && <Notice testId="office-read-only">{W.readOnly}</Notice>}
        <OfficeCalendarSection values={data.values as OfficeCalendarValues} revision={data.revision} editable={editable} />
        <OfficeHolidaysSection holidays={data.holidays} editable={editable} />
        <ChangeList
          changes={data.changes}
          testId="office-changes"
          labelOf={(what) => (what.startsWith("office_holidays:") ? `Office public holidays ${what.split(":")[1]}` : "Office working days and hours")}
          fieldLabel={(f) => FIELD_LABEL[f] ?? f}
          valueOf={valueWord}
        />
      </div>
    </PageShell>
  );
}

function OfficeCalendarSection({ values, revision, editable }: {
  values: OfficeCalendarValues; revision: number | null; editable: boolean;
}) {
  const save = useSaveOfficeCalendar();
  const [step, setStep] = useState<"view" | "edit" | "review">("view");
  const [draft, setDraft] = useState<OfficeCalendarValues>(values);
  const [reason, setReason] = useState("");

  const parsed = officeCalendarValuesSchema.safeParse(draft);
  const changedFields = Object.keys(FIELD_LABEL).filter(
    (f) => JSON.stringify((draft as Record<string, unknown>)[f]) !== JSON.stringify((values as Record<string, unknown>)[f]),
  );
  const gap = !parsed.success
    ? parsed.error.issues[0]?.message === "end_before_start" ? "the office must close after it opens"
      : parsed.error.issues[0]?.message === "lunch_outside_hours" ? "lunch must sit inside office hours"
      : draft.work_days.length === 0 ? "choose at least one working day" : "check the values"
    : changedFields.length === 0 ? "nothing changed" : null;

  const begin = () => { setDraft({ ...values, work_days: [...values.work_days] }); setReason(""); setStep("edit"); };
  const stop = () => { setReason(""); setStep("view"); };
  const commit = () => {
    if (!parsed.success || revision == null) return;
    save.mutate({ values: parsed.data, revision, reason: reason.trim() || undefined }, {
      onSuccess: () => { toast.success("Office settings saved"); stop(); },
      onError: (e) => toast.error(refusalOf(e)),
    });
  };
  const view = step === "view";
  const toggleDay = (d: number, on: boolean) => setDraft({
    ...draft,
    work_days: on ? [...new Set([...draft.work_days, d])].sort() : draft.work_days.filter((x) => x !== d),
  });

  return (
    <Section
      title="Office working days and hours"
      lead="Every Office deadline counts these days. Saturday on-call is set in Staff & Duties and does not make Saturday an Office working day."
      action={view && editable ? <Button variant="neutral" onClick={begin} data-testid="office-edit">{W.edit}</Button> : null}
      testId="office-calendar"
    >
      {view ? (
        <>
          <Row label="Office working days"><Value value={daysWord(values.work_days)} /></Row>
          <Row label="Office hours"><Value value={`${clock12(values.start_time)} to ${clock12(values.end_time)}`} /></Row>
          <Row label="Flexi allowance"><Value value={minutesWord(values.flexi_minutes)} /></Row>
          <Row label="Lunch"><Value value={`${clock12(values.lunch_start)} to ${clock12(values.lunch_end)}`} /></Row>
          <Row label="Lunch may move by"><Value value={minutesWord(values.lunch_shift_minutes)} /></Row>
          <Row label="Holiday region"><Value value={values.holiday_region} /></Row>
        </>
      ) : (
        <>
          <Row label="Office working days">
            <div className="flex flex-wrap gap-x-4 gap-y-2" role="group" aria-label="Office working days">
              {WEEK_ORDER.map((d) => (
                <Checkbox
                  key={d}
                  id={`office-day-${d}`}
                  label={DAY_NAMES[d]}
                  checked={draft.work_days.includes(d)}
                  disabled={step === "review"}
                  onCheckedChange={(on) => toggleDay(d, on)}
                />
              ))}
            </div>
          </Row>
          <Row label="Office opens" htmlFor="office-start">
            <Input id="office-start" type="time" value={draft.start_time} disabled={step === "review"}
              onChange={(e) => setDraft({ ...draft, start_time: e.target.value.slice(0, 5) })} />
          </Row>
          <Row label="Office closes" htmlFor="office-end">
            <Input id="office-end" type="time" value={draft.end_time} disabled={step === "review"}
              error={step === "edit" && draft.end_time <= draft.start_time ? "The office must close after it opens." : undefined}
              onChange={(e) => setDraft({ ...draft, end_time: e.target.value.slice(0, 5) })} />
          </Row>
          <Row label="Flexi allowance (minutes)" htmlFor="office-flexi">
            <Input id="office-flexi" type="number" min={0} max={180} value={String(draft.flexi_minutes)} disabled={step === "review"}
              onChange={(e) => setDraft({ ...draft, flexi_minutes: Number(e.target.value) })} />
          </Row>
          <Row label="Lunch starts" htmlFor="office-lunch-start">
            <Input id="office-lunch-start" type="time" value={draft.lunch_start} disabled={step === "review"}
              onChange={(e) => setDraft({ ...draft, lunch_start: e.target.value.slice(0, 5) })} />
          </Row>
          <Row label="Lunch ends" htmlFor="office-lunch-end">
            <Input id="office-lunch-end" type="time" value={draft.lunch_end} disabled={step === "review"}
              error={step === "edit" && !(draft.lunch_start < draft.lunch_end && draft.lunch_start >= draft.start_time && draft.lunch_end <= draft.end_time) ? "Lunch must sit inside office hours." : undefined}
              onChange={(e) => setDraft({ ...draft, lunch_end: e.target.value.slice(0, 5) })} />
          </Row>
          <Row label="Lunch may move by (minutes)" htmlFor="office-lunch-shift">
            <Input id="office-lunch-shift" type="number" min={0} max={120} value={String(draft.lunch_shift_minutes)} disabled={step === "review"}
              onChange={(e) => setDraft({ ...draft, lunch_shift_minutes: Number(e.target.value) })} />
          </Row>
          <Row label="Holiday region" htmlFor="office-region">
            <Input id="office-region" value={draft.holiday_region} maxLength={80} disabled={step === "review"}
              onChange={(e) => setDraft({ ...draft, holiday_region: e.target.value })} />
          </Row>
          {step === "review" && (
            <ul className="grid gap-0.5 pt-2" data-testid="office-review">
              {changedFields.map((f) => (
                <li key={f} className="text-body">
                  {FIELD_LABEL[f]}: {valueWord(f, (values as Record<string, unknown>)[f])} → {valueWord(f, (draft as Record<string, unknown>)[f])}
                </li>
              ))}
              <li className="text-meta text-kit-slate-11">Deadlines from now on count the new days. Dates already recorded do not move.</li>
            </ul>
          )}
          <Row label={W.reason} htmlFor="office-reason">
            <Input id="office-reason" value={reason} maxLength={500} onChange={(e) => setReason(e.target.value)} />
          </Row>
          <div className="flex flex-wrap gap-2 pt-2">
            {step === "edit" ? (
              <Button variant="primary" disabled={gap !== null} onClick={() => setStep("review")}>
                {gap ? `${W.reviewChanges}: ${gap}` : W.reviewChanges}
              </Button>
            ) : (
              <Button variant="primary" loading={save.isPending} onClick={commit} data-testid="office-save">{W.saveChanges}</Button>
            )}
            <Button variant="neutral" onClick={() => (step === "review" ? setStep("edit") : stop())}>
              {step === "review" ? W.back : W.cancel}
            </Button>
          </div>
        </>
      )}
    </Section>
  );
}

type HolidayDraft = { key: number; date: string; name: string };

function OfficeHolidaysSection({ holidays, editable }: {
  holidays: { date: string; name: string }[]; editable: boolean;
}) {
  const save = useSaveOfficeHolidays();
  const thisYear = Number(appTodayIso().slice(0, 4));
  const years = useMemo(() => {
    const set = new Set<number>([thisYear, thisYear + 1, ...BUILT_IN_HOLIDAY_YEARS]);
    for (const h of holidays) set.add(Number(h.date.slice(0, 4)));
    return [...set].sort((a, b) => a - b);
  }, [holidays, thisYear]);
  const [year, setYear] = useState(thisYear);
  const [step, setStep] = useState<"view" | "edit" | "review">("view");
  const [rows, setRows] = useState<HolidayDraft[]>([]);
  const [reason, setReason] = useState("");

  const recorded = holidays.filter((h) => h.date.startsWith(`${year}-`));
  const builtIn = DEFAULT_OFFICE_CALENDAR.holidays.filter((h) => h.date.startsWith(`${year}-`));
  const inForce = recorded.length > 0 ? recorded : builtIn;
  const source = recorded.length > 0
    ? "Recorded in Settings"
    : builtIn.length > 0
      ? "Built-in list. Not yet checked for Kuala Lumpur. Record this year to replace it."
      : "No holidays recorded for this year.";

  const clean = rows.map((r) => ({ date: r.date, name: r.name.trim() })).filter((r) => r.date || r.name);
  const bad = clean.find((r) => !/^\d{4}-\d{2}-\d{2}$/.test(r.date) || !r.date.startsWith(`${year}-`) || !r.name);
  const dup = new Set(clean.map((r) => r.date)).size !== clean.length;
  const same = JSON.stringify(clean.slice().sort((a, b) => a.date.localeCompare(b.date)))
    === JSON.stringify(recorded.map((h) => ({ date: h.date, name: h.name })));
  const gap = bad ? `every holiday needs a date in ${year} and a name` : dup ? "a date is listed twice" : same ? "nothing changed" : null;

  const nextKey = rows.reduce((m, r) => Math.max(m, r.key), 0) + 1;
  const begin = () => {
    setRows(inForce.map((h, i) => ({ key: i + 1, date: h.date, name: h.name })));
    setReason("");
    setStep("edit");
  };
  const stop = () => { setRows([]); setReason(""); setStep("view"); };
  const commit = () => {
    save.mutate({ year, holidays: clean.sort((a, b) => a.date.localeCompare(b.date)), reason: reason.trim() || undefined }, {
      onSuccess: () => { toast.success(`Office public holidays ${year} saved`); stop(); },
      onError: (e) => toast.error(refusalOf(e)),
    });
  };

  return (
    <Section
      title="Office public holidays"
      lead="Office deadlines skip these days. Warehouse keeps its own holidays."
      action={step === "view" && editable ? <Button variant="neutral" onClick={begin} data-testid="office-holidays-edit">{W.edit}</Button> : null}
      testId="office-holidays"
    >
      <Row label="Year" htmlFor="office-holiday-year">
        <div className="max-w-[160px]">
          <Select
            id="office-holiday-year"
            value={String(year)}
            disabled={step !== "view"}
            onValueChange={(v) => setYear(Number(v))}
            options={years.map((y) => ({ value: String(y), label: String(y) }))}
          />
        </div>
      </Row>
      <Row label="List in force"><Value value={source} /></Row>
      {step === "view" ? (
        inForce.length === 0 ? null : (
          <ul className="divide-y divide-kit-slate-4" data-testid="office-holiday-list">
            {inForce.map((h) => (
              <li key={h.date} className="grid grid-cols-[160px_minmax(0,1fr)] gap-3 py-1.5 text-body">
                <span className="text-kit-slate-11">{fmtDate(h.date)}</span>
                <span className="text-kit-slate-12">{h.name}</span>
              </li>
            ))}
          </ul>
        )
      ) : (
        <div className="grid gap-2" data-testid="office-holiday-form">
          {rows.map((r, i) => (
            <div key={r.key} className="grid grid-cols-1 items-end gap-2 md:grid-cols-[180px_minmax(0,1fr)_auto]">
              <DatePicker id={`holiday-date-${r.key}`} label={i === 0 ? "Date" : undefined}
                minDate={`${year}-01-01`} value={r.date || null} disabled={step === "review"}
                error={step === "edit" && r.date !== "" && !r.date.startsWith(`${year}-`) ? `Choose a date in ${year}.` : undefined}
                onChange={(iso) => setRows(rows.map((x) => (x.key === r.key ? { ...x, date: iso ?? "" } : x)))} />
              <Input id={`holiday-name-${r.key}`} label={i === 0 ? "Holiday name" : undefined} aria-label="Holiday name"
                value={r.name} maxLength={120} disabled={step === "review"}
                onChange={(e) => setRows(rows.map((x) => (x.key === r.key ? { ...x, name: e.target.value } : x)))} />
              {step === "edit" && (
                <Button variant="ghost" onClick={() => setRows(rows.filter((x) => x.key !== r.key))}
                  aria-label={`Remove ${r.name || "this holiday"}`}>Remove</Button>
              )}
            </div>
          ))}
          {step === "edit" && (
            <div>
              <Button variant="neutral" onClick={() => setRows([...rows, { key: nextKey, date: "", name: "" }])}>Add holiday</Button>
            </div>
          )}
          {step === "review" && (
            <p className="text-body" data-testid="office-holiday-review">
              {year}: {recorded.length > 0 ? `${recorded.length} recorded holidays` : "built-in list"} → {clean.length} recorded holidays.
              {clean.length === 0 ? " An empty list returns this year to the built-in list." : ""}
            </p>
          )}
          <Row label={W.reason} htmlFor="office-holiday-reason">
            <Input id="office-holiday-reason" value={reason} maxLength={500} onChange={(e) => setReason(e.target.value)} />
          </Row>
          <div className="flex flex-wrap gap-2 pt-2">
            {step === "edit" ? (
              <Button variant="primary" disabled={gap !== null} onClick={() => setStep("review")}>
                {gap ? `${W.reviewChanges}: ${gap}` : W.reviewChanges}
              </Button>
            ) : (
              <Button variant="primary" loading={save.isPending} onClick={commit} data-testid="office-holidays-save">{W.saveChanges}</Button>
            )}
            <Button variant="neutral" onClick={() => (step === "review" ? setStep("edit") : stop())}>
              {step === "review" ? W.back : W.cancel}
            </Button>
          </div>
        </div>
      )}
    </Section>
  );
}

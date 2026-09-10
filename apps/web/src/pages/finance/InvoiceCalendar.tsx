import { useMemo } from "react";
import type { InvoiceRegisterRow } from "@carres/shared/payment-invoice-register";
import {
  invoiceCustomerDelivery,
  invoiceGoodsFacts,
  soRemaining,
} from "@carres/shared/payment-invoice-register";
import { myHolidaySet } from "@carres/shared/my-holidays";
import MonthCalendar from "@/components/kit/MonthCalendar";
import { SectionCard } from "@/components/SectionPanel";
import { fmtDate } from "@/lib/fmt-date";
import { rm } from "@/lib/format-currency";

/**
 * The Payment Calendar view (payment/MASTER.md §17 — owner ruling 2026-09-06;
 * layout corrections 2026-09-07).
 *
 * 240px page rail: the kit's ONE pinned MonthCalendar primitive fixed at the
 * top — the complete month, Sunday-first with SUN MON TUE headings, arrows
 * one month at a time, the selected date on the governed blue, non-working
 * days muted, count markers with words — and the business filters scrolling
 * below it independently. The right side is one FIXED workweek with
 * Previous week / Next week beside the range — never an endless scroll.
 *
 * A business filter opens its LISTING while the month stays visible;
 * choosing a month date returns to Calendar. Entries are READ-ONLY facts
 * from their authoritative owners; one SO appears ONCE per date and type
 * whatever invoices it carries, its balance said once through the canonical
 * arithmetic; an Expected arrival entry creates no deadline and no chase.
 */
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function isoAddDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Monday of the week containing `iso` (the fixed workweek's first day;
 *  the month grid itself is Sunday-first per the approved sketch). */
export function weekMondayOf(iso: string): string {
  const d = new Date(`${iso}T00:00:00.000Z`);
  const dow = d.getUTCDay(); // 0=Sun
  return isoAddDays(iso, dow === 0 ? -6 : 1 - dow);
}

export type CalendarEntryKind = "delivery" | "arrival";

export interface CalendarEntry {
  /** The door row — the Sales invoice when the SO carries several kinds. */
  row: InvoiceRegisterRow;
  kind: CalendarEntryKind;
  dateIso: string;
}

/** The dated facts, ONE entry per SO · date · type — an SO carrying Sales,
 *  Storage and Additional Storage invoices is still one delivery and one
 *  arrival, and its balance is said once (the canonical SO arithmetic). The
 *  Sales invoice is the door; the other obligations stay reachable through
 *  the opened details. A record without a usable date has no calendar
 *  position and stays in the listing. */
export function calendarEntriesOf(rows: InvoiceRegisterRow[]): CalendarEntry[] {
  const seen = new Map<string, CalendarEntry>();
  for (const row of rows) {
    if (row.status === "voided") continue;
    const facts: Array<{ kind: CalendarEntryKind; dateIso: string | null }> = [
      { kind: "delivery", dateIso: invoiceCustomerDelivery(row).dateIso },
      { kind: "arrival", dateIso: invoiceGoodsFacts(row).arrivalIso },
    ];
    for (const f of facts) {
      if (!f.dateIso) continue;
      const key = `${row.order_id}|${f.dateIso}|${f.kind}`;
      const existing = seen.get(key);
      if (!existing || (existing.row.kind !== "sales" && row.kind === "sales")) {
        seen.set(key, { row, kind: f.kind, dateIso: f.dateIso });
      }
    }
  }
  return [...seen.values()];
}

const KIND_WORD: Record<CalendarEntryKind, string> = {
  delivery: "Customer Delivery",
  arrival: "Expected arrival",
};

const WEEKDAY_WORD = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export default function InvoiceCalendar({ rows, selectedDateIso, highlightOrderId, highlightKind, filter, onPickDate, onFilter, onOpenInvoice, onBack }: {
  rows: InvoiceRegisterRow[];
  selectedDateIso: string;
  /** The SO navigated from — highlighted in the week. */
  highlightOrderId: string | null;
  /** Which date fact brought us here (labels the highlight). */
  highlightKind: CalendarEntryKind | null;
  filter: "all" | CalendarEntryKind;
  onPickDate: (iso: string) => void;
  onFilter: (f: "all" | CalendarEntryKind) => void;
  onOpenInvoice: (row: InvoiceRegisterRow) => void;
  onBack: () => void;
}) {
  const holidays = useMemo(() => myHolidaySet(), []);
  const entries = useMemo(() => calendarEntriesOf(rows), [rows]);
  const visible = filter === "all" ? entries : entries.filter((e) => e.kind === filter);
  const safeDate = ISO_DATE.test(selectedDateIso)
    ? selectedDateIso
    : new Date().toISOString().slice(0, 10);
  const monday = weekMondayOf(safeDate);
  const weekDays = useMemo(() => Array.from({ length: 7 }, (_, i) => isoAddDays(monday, i)), [monday]);
  const byDay = useMemo(() => {
    const m = new Map<string, CalendarEntry[]>();
    for (const e of visible) {
      const list = m.get(e.dateIso) ?? [];
      list.push(e);
      m.set(e.dateIso, list);
    }
    return m;
  }, [visible]);
  const markers = useMemo(() => {
    const m: Record<string, number> = {};
    for (const e of visible) m[e.dateIso] = (m[e.dateIso] ?? 0) + 1;
    return m;
  }, [visible]);
  const nonWorking = (iso: string) => {
    const dow = new Date(`${iso}T00:00:00.000Z`).getUTCDay();
    return dow === 0 || holidays.has(iso);
  };
  // A business filter shows its LISTING; `All dates` is the Calendar week.
  const mode: "week" | "listing" = filter === "all" ? "week" : "listing";
  const listing = useMemo(() =>
    [...visible].sort((a, b) => a.dateIso.localeCompare(b.dateIso)),
  [visible]);

  const entryButton = (e: CalendarEntry, withDate: boolean) => {
    // The deduped SO card's money is the SO across EVERY live invoice kind —
    // the Sales door must not hide an unpaid Storage obligation, and the
    // combined law subtracts the paid money exactly once.
    const money = soRemaining(rows, e.row.order_id);
    const highlighted = highlightOrderId != null && e.row.order_id === highlightOrderId
      && (highlightKind == null || highlightKind === e.kind);
    return <button key={`${e.row.order_id}-${e.kind}-${e.dateIso}`} type="button"
      onClick={() => onOpenInvoice(e.row)}
      data-testid={highlighted ? "calendar-highlight" : undefined}
      className={`block w-full rounded-control border px-1.5 py-1 text-left ${
        highlighted ? "border-kit-blue-9 bg-kit-blue-3" : "border-base-200 bg-white hover:bg-hovertint"}`}>
      <span className="block text-label font-normal">
        {KIND_WORD[e.kind]}{withDate ? ` · ${fmtDate(e.dateIso)}` : ""}{highlighted ? " · selected" : ""}
      </span>
      <span className="block text-body font-semibold">
        {e.row.orders ? `SO-${e.row.orders.so}` : "SO not available"} · {e.row.orders?.customer_name ?? "Customer not available"}
      </span>
      <span className="block text-label font-normal">
        {money.known ? `${rm(money.outstanding)} still needed` : "Value not recorded"}
      </span>
    </button>;
  };

  return <div className="flex min-h-0 flex-1 flex-col gap-3 p-4 md:flex-row" data-testid="invoice-calendar">
    {/* 240px rail — the kit month fixed on top, filters scroll below. */}
    <div className="flex w-full shrink-0 flex-col gap-3 md:w-[240px]">
      <SectionCard><div className="p-3" data-testid="calendar-month">
        <MonthCalendar
          month={safeDate.slice(0, 7)}
          onMonthChange={(m) => onPickDate(`${m}-01`)}
          selected={safeDate}
          onSelect={(iso) => {
            // Choosing a month date RETURNS TO CALENDAR at that week;
            // pick-again keeps the day rather than clearing it.
            onFilter("all");
            if (iso) onPickDate(iso);
          }}
          markers={markers}
          markerWord={filter === "delivery" ? "customer delivery"
            : filter === "arrival" ? "expected arrival" : "dated delivery or arrival"}
          testId="calendar-month-grid"
        />
      </div></SectionCard>
      <div className="min-h-0 overflow-auto">
        <SectionCard><div className="p-3" data-testid="calendar-filters">
          <div className="text-label uppercase tracking-[0.08em] text-base-500 mb-1">Dates shown</div>
          {([
            ["all", "All dates"],
            ["delivery", "Customer Delivery"],
            ["arrival", "Expected arrival"],
          ] as const).map(([key, word]) => <button key={key} type="button"
            onClick={() => onFilter(key)}
            aria-current={filter === key ? "true" : undefined}
            className={`block w-full rounded-control px-2 py-1.5 text-left text-body ${
              filter === key ? "bg-kit-blue-3 text-kit-blue-11 font-semibold" : "hover:bg-hovertint"}`}>
            {word}
          </button>)}
        </div></SectionCard>
      </div>
    </div>

    {mode === "listing"
      ? <div className="min-w-0 flex-1" data-testid="calendar-listing">
        <div className="mb-2 flex items-center justify-between gap-2">
          <span className="text-body font-semibold">
            {filter === "delivery" ? "Customer Delivery dates" : "Expected arrival dates"}
          </span>
          <button className="btn-secondary" onClick={onBack}>Back to Invoices</button>
        </div>
        <div className="space-y-1">
          {listing.map((e) => entryButton(e, true))}
          {listing.length === 0 && <p className="text-label font-normal text-base-400">
            No dated work for this filter. Pick a month date to go back to the Calendar.
          </p>}
        </div>
      </div>
      : <div className="min-w-0 flex-1">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <span className="flex items-center gap-2">
            <button className="btn-secondary" aria-label="Previous week"
              onClick={() => onPickDate(isoAddDays(monday, -7))}>‹ Previous week</button>
            <span className="text-body font-semibold" data-testid="calendar-week-word">
              {fmtDate(monday)} – {fmtDate(isoAddDays(monday, 6))}
            </span>
            <button className="btn-secondary" aria-label="Next week"
              onClick={() => onPickDate(isoAddDays(monday, 7))}>Next week ›</button>
          </span>
          <button className="btn-secondary" onClick={onBack}>Back to Invoices</button>
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-7" data-testid="calendar-week">
          {weekDays.map((iso) => {
            const dow = new Date(`${iso}T00:00:00.000Z`).getUTCDay();
            const off = nonWorking(iso);
            const list = byDay.get(iso) ?? [];
            return <div key={iso}
              className={`rounded-card border border-base-200 p-2 ${off ? "bg-base-50" : "bg-white"}`}>
              <div className={`text-label ${off ? "text-base-400" : "text-base-600"} ${
                iso === safeDate ? "font-semibold text-kit-blue-11" : ""}`}>
                {WEEKDAY_WORD[dow === 0 ? 6 : dow - 1]}, {Number(iso.slice(8, 10))}
                {iso === safeDate && <span className="ml-1">· selected</span>}
                {off && <span className="ml-1">· not a working day</span>}
              </div>
              <div className="mt-1 space-y-1">
                {list.map((e) => entryButton(e, false))}
                {list.length === 0 && <p className="text-label font-normal text-base-400">No dated work.</p>}
              </div>
            </div>;
          })}
        </div>
      </div>}
  </div>;
}

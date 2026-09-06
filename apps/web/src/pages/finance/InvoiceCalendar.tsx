import { useMemo } from "react";
import type { InvoiceRegisterRow } from "@carres/shared/payment-invoice-register";
import {
  invoiceCustomerDelivery,
  invoiceGoodsFacts,
  invoiceNeeded,
} from "@carres/shared/payment-invoice-register";
import { myHolidaySet } from "@carres/shared/my-holidays";
import { SectionCard } from "@/components/SectionPanel";
import { fmtDate } from "@/lib/fmt-date";
import { rm } from "@/lib/format-currency";

/**
 * The Payment Calendar view (payment/MASTER.md §17 — owner ruling 2026-09-06).
 *
 * 240px page rail: the COMPLETE month fixed at its top (never a one-week
 * mini calendar), month arrows one month at a time, business filters
 * scrolling below it independently. The right side is one FIXED workweek —
 * no infinite horizontal scrolling. Sunday stays visible and is muted as
 * non-working. Selected date wears the standard blue token. Every work
 * indicator carries a textual meaning — never colour alone.
 *
 * The entries are READ-ONLY facts from their authoritative owners
 * (Customer Delivery from the order/booking; Expected arrival from Stock's
 * line ETAs) — Payment keeps no editable copy, and an Expected arrival
 * entry creates no deadline and no chase.
 */
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function isoAddDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Monday of the week containing `iso`. */
export function weekMondayOf(iso: string): string {
  const d = new Date(`${iso}T00:00:00.000Z`);
  const dow = d.getUTCDay(); // 0=Sun
  return isoAddDays(iso, dow === 0 ? -6 : 1 - dow);
}

export type CalendarEntryKind = "delivery" | "arrival";

export interface CalendarEntry {
  row: InvoiceRegisterRow;
  kind: CalendarEntryKind;
  dateIso: string;
}

/** The dated facts of one register row, exactly as the register derives them
 *  (one arithmetic — Law D). A record without a usable date has no calendar
 *  position and stays in the listing. */
export function calendarEntriesOf(rows: InvoiceRegisterRow[]): CalendarEntry[] {
  const out: CalendarEntry[] = [];
  for (const row of rows) {
    if (row.status === "voided") continue;
    const delivery = invoiceCustomerDelivery(row);
    if (delivery.dateIso) out.push({ row, kind: "delivery", dateIso: delivery.dateIso });
    const goods = invoiceGoodsFacts(row);
    if (goods.arrivalIso) out.push({ row, kind: "arrival", dateIso: goods.arrivalIso });
  }
  return out;
}

const KIND_WORD: Record<CalendarEntryKind, string> = {
  delivery: "Customer Delivery",
  arrival: "Expected arrival",
};

const WEEKDAY_WORD = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MONTH_WORD = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

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
  const monday = weekMondayOf(ISO_DATE.test(selectedDateIso) ? selectedDateIso : new Date().toISOString().slice(0, 10));
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

  // The complete month holding the selected date.
  const sel = new Date(`${selectedDateIso}T00:00:00.000Z`);
  const monthStart = `${selectedDateIso.slice(0, 7)}-01`;
  const firstDow = new Date(`${monthStart}T00:00:00.000Z`).getUTCDay(); // 0=Sun
  const lead = firstDow === 0 ? 6 : firstDow - 1; // Monday-first grid
  const daysInMonth = new Date(Date.UTC(sel.getUTCFullYear(), sel.getUTCMonth() + 1, 0)).getUTCDate();
  const monthCells: Array<string | null> = [
    ...Array.from({ length: lead }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => isoAddDays(monthStart, i)),
  ];
  const monthWord = `${MONTH_WORD[sel.getUTCMonth()]} ${sel.getUTCFullYear()}`;
  const moveMonth = (delta: number) => {
    const d = new Date(`${monthStart}T00:00:00.000Z`);
    d.setUTCMonth(d.getUTCMonth() + delta);
    onPickDate(d.toISOString().slice(0, 10));
  };
  const dayCount = (iso: string) => byDay.get(iso)?.length ?? 0;
  const nonWorking = (iso: string) => {
    const dow = new Date(`${iso}T00:00:00.000Z`).getUTCDay();
    return dow === 0 || holidays.has(iso);
  };

  return <div className="flex min-h-0 flex-1 flex-col gap-3 p-4 md:flex-row" data-testid="invoice-calendar">
    {/* 240px rail — complete month fixed on top, filters scroll below. */}
    <div className="flex w-full shrink-0 flex-col gap-3 md:w-[240px]">
      <SectionCard><div className="p-3" data-testid="calendar-month">
        <div className="mb-1 flex items-center justify-between">
          <button className="text-body" aria-label="Previous month" onClick={() => moveMonth(-1)}>‹</button>
          <span className="text-body font-semibold">{monthWord}</span>
          <button className="text-body" aria-label="Next month" onClick={() => moveMonth(1)}>›</button>
        </div>
        <div className="grid grid-cols-7 text-center text-label">
          {WEEKDAY_WORD.map((w) => <span key={w} className={w === "Sun" ? "text-base-400" : ""}>{w[0]}</span>)}
          {monthCells.map((iso, i) => iso ? <button key={iso} type="button"
            onClick={() => onPickDate(iso)}
            aria-label={`${fmtDate(iso)}${dayCount(iso) ? ` · ${dayCount(iso)} dated` : ""}`}
            className={`relative rounded-control py-1 text-body font-normal ${
              iso === selectedDateIso ? "bg-kit-blue-3 text-kit-blue-11 font-semibold"
              : nonWorking(iso) ? "text-base-400" : "text-base-800 hover:bg-base-50"}`}>
            {Number(iso.slice(8, 10))}
            {dayCount(iso) > 0 && <span aria-hidden
              className="absolute inset-x-0 bottom-0 mx-auto h-1 w-1 rounded-full bg-kit-blue-9" />}
          </button> : <span key={`lead-${i}`} />)}
        </div>
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
              filter === key ? "bg-kit-blue-3 text-kit-blue-11 font-semibold" : "hover:bg-base-50"}`}>
            {word}
          </button>)}
        </div></SectionCard>
      </div>
    </div>

    {/* One fixed workweek — never an endless scroll. */}
    <div className="min-w-0 flex-1">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-body font-semibold" data-testid="calendar-week-word">
          Week of {fmtDate(monday)}
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
              iso === selectedDateIso ? "font-semibold text-kit-blue-11" : ""}`}>
              {WEEKDAY_WORD[dow === 0 ? 6 : dow - 1]}, {Number(iso.slice(8, 10))}
              {iso === selectedDateIso && <span className="ml-1">· selected</span>}
              {off && <span className="ml-1">· not a working day</span>}
            </div>
            <div className="mt-1 space-y-1">
              {list.map((e) => {
                const money = invoiceNeeded(e.row);
                const highlighted = highlightOrderId != null && e.row.order_id === highlightOrderId
                  && (highlightKind == null || highlightKind === e.kind);
                return <button key={`${e.row.id}-${e.kind}`} type="button"
                  onClick={() => onOpenInvoice(e.row)}
                  data-testid={highlighted ? "calendar-highlight" : undefined}
                  className={`block w-full rounded-control border px-1.5 py-1 text-left ${
                    highlighted ? "border-kit-blue-9 bg-kit-blue-3" : "border-base-200 bg-white hover:bg-base-50"}`}>
                  <span className="block text-label font-normal">{KIND_WORD[e.kind]}{highlighted ? " · selected" : ""}</span>
                  <span className="block text-body font-semibold">
                    {e.row.orders ? `SO-${e.row.orders.so}` : "SO not available"} · {e.row.orders?.customer_name ?? "Customer not available"}
                  </span>
                  <span className="block text-label font-normal">
                    {money.known ? `${rm(money.outstanding)} still needed` : "Value not recorded"}
                  </span>
                </button>;
              })}
              {list.length === 0 && <p className="text-label font-normal text-base-400">No dated work.</p>}
            </div>
          </div>;
        })}
      </div>
    </div>
  </div>;
}

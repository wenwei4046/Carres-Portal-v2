/**
 * ⭐ DAILY PO WINDOWS (Purchasing MASTER §5.6.1 · owner rulings, Jess
 * 2026-09-24; storage 0585).
 *
 *   first window      11:30 Malaysia time, editable
 *   second window     16:00, editable, may be switched off
 *   supplier cut-off  a governed EARLIER time for one supplier: a standard
 *                     window after it is invalid for that supplier; when no
 *                     standard window is at or before it, the cut-off itself
 *                     is the supplier's window. Never a later, invalid window.
 *
 * Demand admitted BEFORE a window belongs to that window; after the last valid
 * window of a day it belongs to the next Purchasing working day's first. The
 * window decides, together: the Work due/missed moment, the PO batch, the PO
 * Date and — through `poDeliveryDateOf` from that PO Date — the PO Delivery
 * Date.
 *
 * Purchasing working day = the Office calendar (Saturday, Sunday and the shared
 * Malaysian public holidays are closed), the same calendar the Purchasing
 * supplier calls use. Every date is Malaysia's wall-clock date (UTC+8, no
 * daylight saving) — never the device's.
 */
import { myHolidaySet } from "./my-holidays";
import { PURCHASING_OFFICE_OFF_DAYS } from "./purchasing-supplier-calls";
import { addWorkingDays, isWorkingDay } from "./working-days";

export interface PoWindowSettings {
  /** `HH:MM`, Malaysia time. */
  first: string;
  second: string | null;
  secondEnabled: boolean;
}

export const DEFAULT_PO_WINDOWS: PoWindowSettings = { first: "11:30", second: "16:00", secondEnabled: true };

export interface SupplierPoWindow {
  time: string;
  kind: "standard" | "supplier";
}

export interface PoWindow extends SupplierPoWindow {
  /** The Malaysia date of the window. */
  date: string;
  /** The window moment with its offset: `2026-09-22T11:30:00+08:00`. */
  dueAt: string;
}

export interface PoWindowCalendar {
  holidays?: ReadonlySet<string>;
  offDays?: readonly number[];
}

const MY_OFFSET_MS = 8 * 60 * 60 * 1000;
const HHMM = /^([01]\d|2[0-3]):[0-5]\d/;

function hhmm(value: string): string {
  const match = HHMM.exec(value);
  if (!match) throw new Error(`not a HH:MM time: ${value}`);
  return match[0];
}

/** Malaysia wall-clock date and time of an instant. Fixed UTC+8 arithmetic:
 *  Malaysia has no daylight saving, and the device's zone is never consulted. */
export function malaysiaClockOf(instantIso: string): { date: string; time: string } {
  const ms = Date.parse(instantIso);
  if (Number.isNaN(ms)) throw new Error(`not an instant: ${instantIso}`);
  const shifted = new Date(ms + MY_OFFSET_MS);
  const pad = (n: number) => String(n).padStart(2, "0");
  return {
    date: `${shifted.getUTCFullYear()}-${pad(shifted.getUTCMonth() + 1)}-${pad(shifted.getUTCDate())}`,
    time: `${pad(shifted.getUTCHours())}:${pad(shifted.getUTCMinutes())}:${pad(shifted.getUTCSeconds())}`,
  };
}

/** The windows one supplier may use on a working day, earliest first. */
export function supplierPoWindows(settings: PoWindowSettings, supplierCutoff: string | null): SupplierPoWindow[] {
  const standard = [hhmm(settings.first)];
  if (settings.secondEnabled && settings.second) standard.push(hhmm(settings.second));
  standard.sort();
  if (!supplierCutoff) return standard.map((time) => ({ time, kind: "standard" }));
  const cutoff = hhmm(supplierCutoff);
  const valid = standard.filter((time) => time <= cutoff);
  return valid.length > 0
    ? valid.map((time) => ({ time, kind: "standard" }))
    : [{ time: cutoff, kind: "supplier" }];
}

function calendarOf(opts: PoWindowCalendar) {
  return { offDays: opts.offDays ?? PURCHASING_OFFICE_OFF_DAYS, holidays: opts.holidays ?? myHolidaySet() };
}

/**
 * THE WINDOW DAYS (owner correction, Jess 2026-09-25 — Purchasing §5.6.1).
 * A PO window opens only on a day ticked in `PO Days` that is also an Office
 * working day. `poDays` uses the `purchasing_settings.po_days` convention
 * (0 = Sunday … 6 = Saturday). The setting decides; nothing here assumes
 * Mon–Fri. An empty `PO Days` leaves the Office week, never a week with no
 * window at all — a calendar with no working day cannot place demand.
 */
export function poWindowCalendarOf(
  poDays: readonly number[],
  holidays?: ReadonlySet<string>,
): PoWindowCalendar {
  const ticked = new Set(poDays.map(Number));
  const offDays = [0, 1, 2, 3, 4, 5, 6].filter(
    (day) => PURCHASING_OFFICE_OFF_DAYS.includes(day) || (ticked.size > 0 && !ticked.has(day)),
  );
  return { offDays, ...(holidays ? { holidays } : {}) };
}

/** The stable key of a window: `2026-09-25T11:30` (Malaysia wall clock). */
export function poWindowKeyOf(window: Pick<PoWindow, "date" | "time">): string {
  return `${window.date}T${window.time}`;
}

/** `2026-09-25T11:30` → `{ date, time }`, or null for anything else. */
export function parsePoWindowKey(key: string): { date: string; time: string } | null {
  const match = /^(\d{4}-\d{2}-\d{2})T([01]\d|2[0-3]):([0-5]\d)$/.exec(key);
  return match ? { date: match[1]!, time: `${match[2]}:${match[3]}` } : null;
}

/** `11:30` → `11:30 AM`; `16:00` → `4:00 PM` — the screen's clock word. */
export function poWindowTimeWord(time: string): string {
  const [h, m] = hhmm(time).split(":").map(Number) as [number, number];
  const hour = h % 12 === 0 ? 12 : h % 12;
  return `${hour}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
}

/** The window demand admitted at `admittedAtIso` belongs to. */
export function poWindowFor(
  admittedAtIso: string,
  settings: PoWindowSettings,
  supplierCutoff: string | null,
  opts: PoWindowCalendar = {},
): PoWindow {
  const calendar = calendarOf(opts);
  const windows = supplierPoWindows(settings, supplierCutoff);
  const at = malaysiaClockOf(admittedAtIso);
  const window = (date: string, w: SupplierPoWindow): PoWindow => ({
    ...w, date, dueAt: `${date}T${w.time}:00+08:00`,
  });
  if (isWorkingDay(at.date, calendar)) {
    // BEFORE the window: arriving exactly on it is already too late for it.
    const same = windows.find((w) => `${w.time}:00` > at.time);
    if (same) return window(at.date, same);
  }
  return window(addWorkingDays(at.date, 1, calendar), windows[0]!);
}

/** The PO Date of a PO issued at `issuedAtIso`: the date of the window the
 *  issue falls into — after the last window it is the next working day. */
export function poDateForIssue(
  issuedAtIso: string,
  settings: PoWindowSettings,
  supplierCutoff: string | null,
  opts: PoWindowCalendar = {},
): string {
  return poWindowFor(issuedAtIso, settings, supplierCutoff, opts).date;
}

// ── the effective arrival ─────────────────────────────────────────────────────

export interface EffectiveArrivalPromise {
  kind: string;
  po_version?: number | null;
  channel?: string | null;
  recipient?: string | null;
  evidence?: string | null;
  reported_by?: string | null;
  reported_at?: string | null;
  recorded_by?: string | null;
  recorded_at: string;
  new_date: string | null;
  /** 0587 — a line-level answer and its batch. */
  po_line_id?: string | null;
  about_qty?: number | null;
  answer_group?: string | null;
  answer?: string | null;
  reason?: string | null;
}

/**
 * The effective expected arrival — mirrors `purchasing_po_effective_arrival`
 * (0585): the latest EVIDENCED answer on the CURRENT version, else the
 * immutable original PO Delivery Date, else the live planning date.
 */
export function effectivePoArrivalOf(po: {
  version: number;
  officialDeliveryDate: string | null;
  etaDate: string | null;
  promises: readonly EffectiveArrivalPromise[];
  /** 0587 — with the open lines, the PO-level arrival is the LAST expected
   *  arrival across them (the PO is not in until its last batch is). */
  lines?: readonly ExpectedArrivalLine[];
}): string | null {
  if (po.lines && po.lines.length) {
    const arrivals = poExpectedArrivalsOf({ ...po, lines: po.lines });
    if (arrivals.length) return arrivals.map((a) => a.arrival).sort().at(-1) ?? null;
  }
  const answer = po.promises
    .filter((p) => evidencedAnswer(p, po.version) && !p.po_line_id)
    .sort((a, b) => b.recorded_at.localeCompare(a.recorded_at))[0];
  return (answer?.new_date ?? po.officialDeliveryDate ?? po.etaDate)?.slice(0, 10) ?? null;
}

const evidencedAnswer = (p: EffectiveArrivalPromise, version: number) =>
  p.kind === "tomorrow_delivery" && p.po_version === version
  && !!p.channel?.trim() && !!p.recipient?.trim() && !!p.evidence?.trim() && !!p.reported_by?.trim()
  && !!p.reported_at && !!p.recorded_by && !!p.new_date;

export interface ExpectedArrivalLine {
  id: string;
  qty: number;
  receivedQty: number;
}

export interface ExpectedArrival {
  poLineId: string;
  qty: number;
  arrival: string;
  /** confirmed · earlier · delayed · reported — the server's classification; null = no answer yet. */
  answer: string | null;
  reason: string | null;
}

/**
 * ⭐ ONE EXPECTED ARRIVAL PER LINE / SPLIT BATCH — mirrors
 * `purchasing_po_expected_arrivals` (0587, Purchasing §5.7): for every open
 * line, the batches of its NEWEST evidenced answer on the current version;
 * else the PO-level newest evidenced answer; else the original PO Delivery
 * Date; else the planning date. The day-before check derives ONE occurrence
 * per distinct arrival from this list; the Register and the Supplier card
 * read the same list (Law D).
 */
export function poExpectedArrivalsOf(po: {
  version: number;
  officialDeliveryDate: string | null;
  etaDate: string | null;
  promises: readonly EffectiveArrivalPromise[];
  lines: readonly ExpectedArrivalLine[];
}): ExpectedArrival[] {
  const rows = po.promises.filter((p) => evidencedAnswer(p, po.version));
  const poLevel = rows.filter((p) => !p.po_line_id).sort((a, b) => b.recorded_at.localeCompare(a.recorded_at))[0] ?? null;
  const out: ExpectedArrival[] = [];
  for (const line of po.lines) {
    const still = Number(line.qty) - Number(line.receivedQty);
    if (!(still > 0)) continue;
    const own = rows.filter((p) => p.po_line_id === line.id).sort((a, b) => b.recorded_at.localeCompare(a.recorded_at));
    const newest = own[0];
    if (newest) {
      const group = own.filter((p) => newest.answer_group ? p.answer_group === newest.answer_group : p.recorded_at === newest.recorded_at);
      for (const p of group) {
        out.push({ poLineId: line.id, qty: p.about_qty ?? still, arrival: p.new_date!.slice(0, 10), answer: p.answer ?? null, reason: p.reason ?? null });
      }
      continue;
    }
    const fallback = (poLevel?.new_date ?? po.officialDeliveryDate ?? po.etaDate)?.slice(0, 10) ?? null;
    if (!fallback) continue;
    out.push({ poLineId: line.id, qty: still, arrival: fallback, answer: poLevel?.answer ?? null, reason: poLevel?.reason ?? null });
  }
  return out.sort((a, b) => a.poLineId.localeCompare(b.poLineId) || a.arrival.localeCompare(b.arrival));
}

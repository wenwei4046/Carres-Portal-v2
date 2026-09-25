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
}): string | null {
  const answer = po.promises
    .filter((p) => p.kind === "tomorrow_delivery" && p.po_version === po.version
      && p.channel?.trim() && p.recipient?.trim() && p.evidence?.trim() && p.reported_by?.trim()
      && p.reported_at && p.recorded_by && p.new_date)
    .sort((a, b) => b.recorded_at.localeCompare(a.recorded_at))[0];
  return (answer?.new_date ?? po.officialDeliveryDate ?? po.etaDate)?.slice(0, 10) ?? null;
}

// ── one mission per window ────────────────────────────────────────────────────

export interface PoWindowDemand {
  /** The exact source line. */
  id: string;
  orderId: string;
  orderLabel: string;
  supplierId: string;
  supplierName: string;
  admittedAt: string;
  supplierCutoff: string | null;
}

export interface PoWindowMission {
  /** `po_window:2026-09-22T11:30` — the window is the occurrence. */
  id: string;
  window: PoWindow;
  dueAt: string;
  missed: boolean;
  lineCount: number;
  suppliers: Array<{ supplierId: string; supplierName: string; lines: PoWindowDemand[] }>;
}

/**
 * One actionable mission per window over the exact eligible source lines,
 * grouped by supplier — never one per Sales Order, and matching one order
 * never pulls its lines from another window.
 */
export function poWindowMissions(
  demands: readonly PoWindowDemand[],
  settings: PoWindowSettings,
  nowIso: string,
  opts: PoWindowCalendar = {},
): PoWindowMission[] {
  const byWindow = new Map<string, { window: PoWindow; lines: PoWindowDemand[] }>();
  for (const demand of demands) {
    const window = poWindowFor(demand.admittedAt, settings, demand.supplierCutoff, opts);
    const key = `po_window:${window.date}T${window.time}`;
    const entry = byWindow.get(key) ?? { window, lines: [] };
    entry.lines.push(demand);
    byWindow.set(key, entry);
  }
  const now = Date.parse(nowIso);
  return [...byWindow.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([id, { window, lines }]) => {
      const bySupplier = new Map<string, { supplierId: string; supplierName: string; lines: PoWindowDemand[] }>();
      for (const line of lines) {
        const group = bySupplier.get(line.supplierId) ?? { supplierId: line.supplierId, supplierName: line.supplierName, lines: [] };
        group.lines.push(line);
        bySupplier.set(line.supplierId, group);
      }
      return {
        id,
        window,
        dueAt: window.dueAt,
        missed: Date.parse(window.dueAt) <= now,
        lineCount: lines.length,
        suppliers: [...bySupplier.values()]
          .map((group) => ({ ...group, lines: [...group.lines].sort((a, b) => a.id.localeCompare(b.id)) }))
          .sort((a, b) => a.supplierName.localeCompare(b.supplierName)),
      };
    });
}

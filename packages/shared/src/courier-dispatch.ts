/**
 * COURIER DISPATCH WITHIN — DEL-10 (owner default 8 Oct 2026, confirmed
 * 9 Oct 2026: 3 working days, adjustable).
 *
 * The clock starts only when the Warehouse confirms the dispatch scope is
 * received, checked fit and available for packing (OWNER-CLARIFICATIONS
 * "Courier accessory dispatch timing"; Stock MASTER "Pillow / MP courier
 * dispatch"). The Warehouse packs and hands the goods to the courier, so the
 * days are the DISPATCHING Warehouse's own working days (owner, 9 Oct 2026;
 * ACTION-FLOW-STANDARD Law 2A: Warehouse = Monday–Saturday with the Selangor
 * holidays): its Collection hours, special dates and holiday policy, with the
 * explicit fallback — a day nobody configured follows Sunday off + the
 * Selangor holidays (`warehouseAddOperatingDays`). Never the Office calendar,
 * never a mixed calendar.
 *
 * It is a Warehouse dispatch target, not a customer-delivery guarantee. The
 * lead is the ONE stored Delivery Rules value (`courier_dispatch_working_days`,
 * 0678); no screen keeps its own 3.
 *
 * PURE — no I/O, no clock.
 */
import type { IsoDate } from "./working-days";
import {
  warehouseAddOperatingDays,
  type WarehouseScheduleSettings,
} from "./warehouse-schedule";

/** The owner default (DEL-10), used only where no Delivery Rules row is read. */
export const DEFAULT_COURIER_DISPATCH_WORKING_DAYS = 3;

/** The dispatching Warehouse's calendar: its stored settings (null = none
 *  readable) and the governed fallback holidays (the Selangor list). */
export interface CourierDispatchCalendar {
  settings: WarehouseScheduleSettings | null;
  fallbackHolidays: ReadonlySet<IsoDate> | readonly IsoDate[];
}

const ISO = /^\d{4}-\d{2}-\d{2}$/;

/**
 * The day the goods must be handed to the courier: `lead` Warehouse working
 * days (collection days of the dispatching Site) after the day the Warehouse
 * confirmed the scope can be packed. No confirmation ⇒ null — the clock has
 * not started, and no date is manufactured.
 */
export function courierDispatchDueIso(
  confirmedOnIso: string | null | undefined,
  lead: number | null | undefined,
  calendar: CourierDispatchCalendar,
): IsoDate | null {
  const from = (confirmedOnIso ?? "").slice(0, 10);
  if (!ISO.test(from)) return null;
  const days = typeof lead === "number" && Number.isFinite(lead)
    ? Math.max(0, Math.trunc(lead))
    : DEFAULT_COURIER_DISPATCH_WORKING_DAYS;
  return warehouseAddOperatingDays(from, days, "collection", calendar.settings, calendar.fallbackHolidays);
}

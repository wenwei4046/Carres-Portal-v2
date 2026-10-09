/**
 * DEL-10 · Courier dispatch within {n} working days after the Warehouse
 * confirms the goods can be packed — on the DISPATCHING Warehouse's calendar.
 */
import { describe, expect, it } from "vitest";
import { courierDispatchDueIso, DEFAULT_COURIER_DISPATCH_WORKING_DAYS } from "./courier-dispatch";
import { deliveryHolidaySet } from "./delivery-working-calendar";
import type { WarehouseScheduleSettings } from "./warehouse-schedule";

const fallback = { settings: null, fallbackHolidays: deliveryHolidaySet() };

describe("courierDispatchDueIso", () => {
  it("counts 3 Warehouse working days by default: Saturday counts, Sunday and the Selangor holiday do not", () => {
    expect(DEFAULT_COURIER_DISPATCH_WORKING_DAYS).toBe(3);
    // Confirmed Wed 9 Dec 2026: Thu 10 · (Fri 11 Sultan of Selangor's Birthday) · Sat 12 · (Sun 13) · Mon 14.
    expect(courierDispatchDueIso("2026-12-09", 3, fallback)).toBe("2026-12-14");
    // Confirmed Thu 8 Oct 2026: Fri 9 · Sat 10 · (Sun 11) · Mon 12.
    expect(courierDispatchDueIso("2026-10-08", undefined, fallback)).toBe("2026-10-12");
  });

  it("follows the stored lead", () => {
    expect(courierDispatchDueIso("2026-10-08", 1, fallback)).toBe("2026-10-09");
    expect(courierDispatchDueIso("2026-10-08", 5, fallback)).toBe("2026-10-14");
  });

  it("reads the dispatching Site's own Collection days when they are configured", () => {
    // A Site that collects Monday–Friday only and is closed on Sat 10 Oct.
    const settings: WarehouseScheduleSettings = {
      siteStatus: "active",
      workingHours: [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({
        weekday,
        activity: "collection" as const,
        closed: weekday === 0 || weekday === 6,
        opensAt: weekday === 0 || weekday === 6 ? null : "09:00",
        closesAt: weekday === 0 || weekday === 6 ? null : "18:00",
      })),
      specialDates: [],
      holidayPolicy: null,
      holidayDates: [],
    };
    // Confirmed Thu 8 Oct: Fri 9 · (Sat 10 closed) · (Sun 11) · Mon 12 · Tue 13.
    expect(courierDispatchDueIso("2026-10-08", 3, { settings, fallbackHolidays: [] })).toBe("2026-10-13");
  });

  it("no Warehouse confirmation → no date (the clock has not started)", () => {
    expect(courierDispatchDueIso(null, 3, fallback)).toBeNull();
    expect(courierDispatchDueIso("not a date", 3, fallback)).toBeNull();
  });
});

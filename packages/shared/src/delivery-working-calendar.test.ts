/**
 * THE DELIVERY CALENDAR (owner order 9 Oct 2026): Monday–Saturday with the
 * Selangor holidays Warehouse Settings stores, else the built-in list — never
 * the Office (Kuala Lumpur) calendar.
 */
import { describe, expect, it } from "vitest";
import {
  DEFAULT_DELIVERY_CALENDAR,
  deliveryCalendarFromResponse,
  deliveryCalendarOf,
  deliveryDayRefusal,
  deliveryHolidayName,
  deliveryWorkingDayOptions,
  pickDeliveryHolidayCalendar,
} from "./delivery-working-calendar";
import { officeCalendarOf, officeWorkingDayOptions } from "./office-calendar";
import { assignLogisticsDueIso, deliveryStepDueIso } from "./delivery-queue";
import { logisticsCheckDueIso } from "./logistics-card";
import { isWorkingDay } from "./working-days";

/** An Office calendar whose 2026 Kuala Lumpur holidays were recorded: the
 *  Federal Territory Day is there, the Sultan of Selangor's Birthday is not. */
const KL_2026 = officeCalendarOf(null, [
  { holiday_date: "2026-01-01", name: "New Year's Day" },
  { holiday_date: "2026-02-01", name: "Federal Territory Day" },
  { holiday_date: "2026-12-25", name: "Christmas Day" },
]);

describe("the Delivery calendar is its own, never the Office one", () => {
  it("a Selangor-only holiday (Sultan of Selangor's Birthday, Fri 11 Dec 2026) is skipped by Delivery and not by the Office", () => {
    const delivery = deliveryWorkingDayOptions(DEFAULT_DELIVERY_CALENDAR);
    const office = officeWorkingDayOptions(KL_2026);
    expect(isWorkingDay("2026-12-11", delivery)).toBe(false);
    expect(isWorkingDay("2026-12-11", office)).toBe(true);
    // The photo is due 1 Delivery working day after a Thu 10 Dec delivery:
    // Fri 11 is closed, Sat 12 counts.
    expect(deliveryStepDueIso("photo", "2026-12-10", delivery)).toBe("2026-12-12");
    expect(deliveryStepDueIso("photo", "2026-12-10", office)).toBe("2026-12-11");
  });

  it("Saturday counts for Delivery and not for the Office", () => {
    const delivery = deliveryWorkingDayOptions();
    const office = officeWorkingDayOptions(KL_2026);
    // Delivered Fri 9 Oct 2026: Delivery's next working day is Sat 10; the Office's Mon 12.
    expect(deliveryStepDueIso("photo", "2026-10-09", delivery)).toBe("2026-10-10");
    expect(deliveryStepDueIso("photo", "2026-10-09", office)).toBe("2026-10-12");
  });

  it("Assign logistics by and the Logistics checks count back on the Delivery calendar", () => {
    const delivery = deliveryWorkingDayOptions();
    // Scheduled Mon 14 Dec 2026, lead 3: Sat 12 · (Fri 11 holiday) · Thu 10 · Wed 9.
    expect(assignLogisticsDueIso({ scheduledIso: "2026-12-14", opts: delivery, leads: { chase: 3, assign: 3 } })).toBe("2026-12-09");
    // The 2-working-day check of a Mon 14 Dec request: Sat 12 · (Fri 11) · Thu 10.
    expect(logisticsCheckDueIso("t2", { requestedIso: "2026-12-14", scheduledIso: null, holidays: delivery.holidays })).toBe("2026-12-10");
  });

  it("an IMPORTED Warehouse calendar overrides the built-in list for its year, and only that year", () => {
    const imported = deliveryCalendarOf({
      region: "Selangor",
      dates: [
        { onDate: "2026-10-20", name: "Imported holiday" },
        { onDate: "2026-12-25", name: "Christmas Day" },
      ],
    });
    const opts = deliveryWorkingDayOptions(imported);
    expect(isWorkingDay("2026-10-20", opts)).toBe(false);
    // 2026 now comes from the import: the built-in 11 Dec is gone…
    expect(isWorkingDay("2026-12-11", opts)).toBe(true);
    // …and early 2027 keeps the built-in list (nothing imported for 2027).
    expect(isWorkingDay("2027-01-01", opts)).toBe(false);
    expect(imported.holidaySource).toBe("mixed");
    expect(imported.recordedYears).toEqual([2026]);
    expect(deliveryHolidayName(imported, "2026-10-20")).toBe("Imported holiday");
  });

  it("nothing imported states the built-in list", () => {
    expect(deliveryCalendarOf({ dates: [] }).holidaySource).toBe("built_in");
    expect(DEFAULT_DELIVERY_CALENDAR.region).toBe("Selangor");
    expect(deliveryCalendarFromResponse(null)).toBe(DEFAULT_DELIVERY_CALENDAR);
  });

  it("the delivery-day refusal names Sunday and the holiday", () => {
    expect(deliveryDayRefusal(DEFAULT_DELIVERY_CALENDAR, "2026-12-13")).toBe("sunday");
    expect(deliveryDayRefusal(DEFAULT_DELIVERY_CALENDAR, "2026-12-11")).toBe("holiday");
    expect(deliveryDayRefusal(DEFAULT_DELIVERY_CALENDAR, "2026-12-12")).toBeNull();
    expect(deliveryDayRefusal(new Set(["2026-12-12"]), "2026-12-12")).toBe("holiday");
  });
});

describe("which imported calendar is the Delivery one", () => {
  const cals = [
    { id: "my", country: "Malaysia", state: null, active: true },
    { id: "kl", country: "Malaysia", state: "Kuala Lumpur", active: true },
    { id: "sel-old", country: "Malaysia", state: "Selangor", active: false },
    { id: "sel", country: "Malaysia", state: "Selangor", active: true },
  ];
  it("the dispatching Site's policy state, else Selangor; never a national-only or another state's calendar", () => {
    expect(pickDeliveryHolidayCalendar(cals, { country: "Malaysia", state: "Selangor" })?.id).toBe("sel");
    expect(pickDeliveryHolidayCalendar(cals, null)?.id).toBe("sel");
    expect(pickDeliveryHolidayCalendar(cals, { country: "Malaysia", state: "Kuala Lumpur" })?.id).toBe("kl");
    expect(pickDeliveryHolidayCalendar(cals.filter((c) => c.id !== "sel"), null)).toBeNull();
  });
});

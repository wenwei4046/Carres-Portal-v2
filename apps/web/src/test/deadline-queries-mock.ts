/**
 * The stored-calendar hooks (`@/lib/deadline-queries`) at their owner
 * defaults, for a component test that renders without a QueryClient:
 * `vi.mock("@/lib/deadline-queries", async () => (await import("@/test/deadline-queries-mock")).deadlineQueriesMock())`.
 * Office Monday–Friday with the built-in holidays; the Delivery calendar
 * Monday–Saturday with the built-in Selangor list; the ruled Collection
 * timing; the seed Delivery leads; no recorded personal working week.
 */
import {
  DEFAULT_COLLECTION_TIMING,
  DEFAULT_DELIVERY_CALENDAR,
  DEFAULT_OFFICE_CALENDAR,
  deliveryDayRefusal,
  deliveryHolidayName,
  deliveryWorkingDayOptions,
  officeOwnerCalendar,
  officeWorkingDayOptions,
} from "@carres/shared";

export function deadlineQueriesMock() {
  const office = officeWorkingDayOptions(DEFAULT_OFFICE_CALENDAR);
  const delivery = deliveryWorkingDayOptions(DEFAULT_DELIVERY_CALENDAR);
  return {
    deadlineKeys: {
      collectionTiming: (orderId: string | null) => ["settings", "deadlines", "collection-timing", orderId ?? ""],
      deliveryLeads: ["settings", "deadlines", "delivery-leads"],
      deliveryCalendar: ["settings", "deadlines", "delivery-calendar"],
    },
    useOfficeDays: () => ({
      calendar: DEFAULT_OFFICE_CALENDAR,
      office,
      holidays: office.holidays,
      offDays: office.offDays,
      owner: officeOwnerCalendar(DEFAULT_OFFICE_CALENDAR),
      holidayName: () => null,
    }),
    useDeliveryDays: () => ({
      calendar: DEFAULT_DELIVERY_CALENDAR,
      opts: delivery,
      holidays: delivery.holidays,
      holidayName: (iso: string) => deliveryHolidayName(DEFAULT_DELIVERY_CALENDAR, iso),
      refusal: (iso: string) => deliveryDayRefusal(DEFAULT_DELIVERY_CALENDAR, iso),
    }),
    useOrderCollectionTiming: () => DEFAULT_COLLECTION_TIMING,
    useCollectionTimingRules: () => [],
    useDeliveryLeads: () => ({ contactLeadWorkingDays: null, assignmentLeadWorkingDays: 3 }),
    usePersonWorkDays: () => new Map<string, number[]>(),
  };
}

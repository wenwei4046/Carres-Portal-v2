/**
 * THE STORED DEADLINE SETTINGS, as the browser reads them (9 Oct 2026).
 *
 * Every date the web computes for an Office deadline, a payment deadline or a
 * Delivery lead reads its stored setting through THESE hooks — never a
 * constant of its own:
 *
 *   useOfficeDays()          Settings → Office (`useOfficeCalendar`) as the
 *                            engine's working-day options and owner week
 *   useOrderCollectionTiming Settings → Payments → Collection timing, the
 *                            rule in force on the day this order's clock
 *                            started (outstation pair included, 0672)
 *   useCollectionTimingRules every effective-dated rule (the Monitor)
 *   useDeliveryLeads         the Contact lead (DEL-05) and `Assign logistics
 *                            by` (DEL-04, 0673)
 *   useDeliveryDays()        THE Delivery calendar (Monday–Saturday + the
 *                            Selangor holidays Warehouse Settings stores, else
 *                            the built-in list) — every Delivery date and the
 *                            payment-due FACT count on it, never the Office
 *
 * Each answers the owner-confirmed defaults while loading or when its source
 * cannot be read, so a screen never invents a date and never waits blank.
 */
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  DEFAULT_DELIVERY_CALENDAR,
  deliveryCalendarFromResponse,
  deliveryDayRefusal,
  deliveryHolidayName,
  deliveryWorkingDayOptions,
  type DeliveryCalendar,
  type DeliveryCalendarResponse,
  type DeliveryDayRefusal,
  DEFAULT_ASSIGNMENT_LEAD_WORKING_DAYS,
  DEFAULT_COLLECTION_TIMING,
  collectionTimingFor,
  collectionTimingRulesOf,
  officeHolidayName,
  officeOwnerCalendar,
  personOwnerCalendar,
  officeWorkingDayOptions,
  type CollectionTiming,
  type CollectionTimingRule,
  type CollectionTimingRuleRow,
  type OfficeCalendar,
  type OwnerCalendar,
  type WorkingDayOptions,
} from "@carres/shared";
import { apiFetch } from "./api";
import { appTodayIso } from "./fmt-date";
import { useOfficeCalendar } from "./settings-queries";

export const deadlineKeys = {
  collectionTiming: (orderId: string | null) => ["settings", "deadlines", "collection-timing", orderId ?? ""] as const,
  deliveryLeads: ["settings", "deadlines", "delivery-leads"] as const,
  deliveryCalendar: ["settings", "deadlines", "delivery-calendar"] as const,
};

/** The Delivery calendar in the shapes the engines take. */
export interface DeliveryDays {
  calendar: DeliveryCalendar;
  /** Delivery working-day options: Sunday off + the Delivery holidays. */
  opts: WorkingDayOptions;
  /** The Delivery holidays (stored Selangor calendar, else built-in). */
  holidays: ReadonlySet<string>;
  /** The Delivery holiday's name on a day, or null. */
  holidayName: (iso: string) => string | null;
  /** Why a day is not a delivery day (`sunday` · `holiday`), or null. */
  refusal: (iso: string) => DeliveryDayRefusal;
}

function deliveryDaysOf(calendar: DeliveryCalendar): DeliveryDays {
  const opts = deliveryWorkingDayOptions(calendar);
  const holidays = opts.holidays as ReadonlySet<string>;
  return {
    calendar,
    opts,
    holidays,
    holidayName: (iso: string) => deliveryHolidayName(calendar, iso),
    refusal: (iso: string) => deliveryDayRefusal(holidays, iso),
  };
}

const DEFAULT_DELIVERY_DAYS = deliveryDaysOf(DEFAULT_DELIVERY_CALENDAR);

/**
 * THE web reader of the Delivery calendar. The built-in list answers while
 * loading or when the read is refused, so a screen never waits blank and
 * never borrows the Office holidays.
 */
export function useDeliveryDays(): DeliveryDays {
  const q = useQuery({
    queryKey: deadlineKeys.deliveryCalendar,
    queryFn: () => apiFetch<DeliveryCalendarResponse>("/api/operation/delivery-settings/calendar"),
    staleTime: 5 * 60_000,
    retry: false,
  });
  return useMemo(
    () => (q.data ? deliveryDaysOf(deliveryCalendarFromResponse(q.data)) : DEFAULT_DELIVERY_DAYS),
    [q.data],
  );
}

/** The Office calendar in the shapes the engines take. */
export interface OfficeDays {
  calendar: OfficeCalendar;
  /** Office working-day options — Office deadlines and their lateness. */
  office: WorkingDayOptions;
  /** The Office holidays — Office deadlines, and the holidays an action owner
   *  steps back over (never a payment FACT: those count on `useDeliveryDays`). */
  holidays: ReadonlySet<string>;
  /** Non-working weekdays of the Office (Saturday + Sunday by default). */
  offDays: readonly number[];
  /** The Office calendar as an action owner's week when no person is
   *  resolved (`usePersonOwnerCalendars` for the responsible person). */
  owner: OwnerCalendar;
  /** The Office holiday's name on a day, or null. */
  holidayName: (iso: string) => string | null;
}

/**
 * THE RESPONSIBLE PERSONS' WORKING WEEKS (People/HR, 0677) as owner
 * calendars: `ownerOf(userId)` is that person's recorded working days with
 * the Office holidays, else the Office working weekdays. It moves only WHEN
 * staff act — never a payment fact. A refused or failed read answers the
 * Office calendar for everyone.
 */
export function usePersonOwnerCalendars(userIds: readonly (string | null | undefined)[]): (userId: string | null | undefined) => OwnerCalendar {
  const ids = [...new Set(userIds.filter((id): id is string => typeof id === "string" && id.length > 0))].sort();
  const q = useQuery({
    queryKey: ["people", "work-days", ids.join(",")] as const,
    queryFn: () => apiFetch<{ workDays: Record<string, number[]> }>(`/api/operation/people/work-days?ids=${encodeURIComponent(ids.join(","))}`),
    enabled: ids.length > 0,
    staleTime: 5 * 60_000,
    retry: false,
  });
  const office = useOfficeDays();
  return useMemo(() => {
    const days = q.data?.workDays ?? {};
    return (userId: string | null | undefined) =>
      userId ? personOwnerCalendar(office.calendar, days[userId] ?? null) : office.owner;
  }, [q.data, office]);
}

export function useOfficeDays(): OfficeDays {
  const calendar = useOfficeCalendar();
  /* `useOfficeCalendar` builds a fresh object on every render once a stored
     calendar answers; key the derived shapes on what they read, so screens
     that memoise on them do not recount every render. */
  const key = `${calendar.workDays.join(",")}|${calendar.holidays.map((h) => `${h.date}:${h.name}`).join(",")}`;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => {
    const office = officeWorkingDayOptions(calendar);
    return {
      calendar,
      office,
      holidays: office.holidays as ReadonlySet<string>,
      offDays: office.offDays ?? [0, 6],
      owner: officeOwnerCalendar(calendar),
      holidayName: (iso: string) => officeHolidayName(calendar, iso),
    };
  }, [key]);
}

interface CollectionTimingPayload {
  rules: CollectionTimingRuleRow[];
  clockStartIso: string;
}

function useCollectionTimingRead(orderId: string | null) {
  return useQuery({
    queryKey: deadlineKeys.collectionTiming(orderId),
    queryFn: () =>
      apiFetch<CollectionTimingPayload>(
        `/api/finance/payment-settings/collection-timing${orderId ? `?order=${encodeURIComponent(orderId)}` : ""}`,
      ),
    staleTime: 5 * 60_000,
    retry: false,
  });
}

/** Every effective-dated Collection timing rule; [] while loading. */
export function useCollectionTimingRules(): CollectionTimingRule[] {
  const q = useCollectionTimingRead(null);
  return useMemo(() => collectionTimingRulesOf(q.data?.rules ?? []), [q.data]);
}

/** The Collection timing this order's clock runs under: the rule in force on
 *  the day its clock started (its Sales Invoice's issue day, else today). */
export function useOrderCollectionTiming(orderId: string | null | undefined): CollectionTiming {
  const q = useCollectionTimingRead(orderId ?? null);
  return useMemo(() => {
    if (!q.data) return DEFAULT_COLLECTION_TIMING;
    return collectionTimingFor(collectionTimingRulesOf(q.data.rules), q.data.clockStartIso ?? appTodayIso());
  }, [q.data]);
}

export interface DeliveryLeads {
  /** DEL-05 · the shared `logistics_call_working_days`; null = not readable. */
  contactLeadWorkingDays: number | null;
  /** DEL-04 · Delivery Rules → `Assign logistics by` (default 3). */
  assignmentLeadWorkingDays: number;
}

export function useDeliveryLeads(): DeliveryLeads {
  const q = useQuery({
    queryKey: deadlineKeys.deliveryLeads,
    queryFn: () => apiFetch<DeliveryLeads & { stored: boolean }>("/api/operation/delivery-settings/leads"),
    staleTime: 5 * 60_000,
    retry: false,
  });
  return useMemo(() => ({
    contactLeadWorkingDays: q.data?.contactLeadWorkingDays ?? null,
    assignmentLeadWorkingDays: q.data?.assignmentLeadWorkingDays ?? DEFAULT_ASSIGNMENT_LEAD_WORKING_DAYS,
  }), [q.data]);
}

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
 *
 * Each answers the owner-confirmed defaults while loading or when its source
 * cannot be read, so a screen never invents a date and never waits blank.
 */
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  DEFAULT_ASSIGNMENT_LEAD_WORKING_DAYS,
  DEFAULT_COLLECTION_TIMING,
  collectionTimingFor,
  collectionTimingRulesOf,
  officeHolidayName,
  officeOwnerCalendar,
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
};

/** The Office calendar in the shapes the engines take. */
export interface OfficeDays {
  calendar: OfficeCalendar;
  /** Office working-day options — Office deadlines and their lateness. */
  office: WorkingDayOptions;
  /** The Office holidays — the payment clock's holiday set (both layers). */
  holidays: ReadonlySet<string>;
  /** Non-working weekdays of the Office (Saturday + Sunday by default). */
  offDays: readonly number[];
  /** The Office calendar as the collection owner's week. */
  owner: OwnerCalendar;
  /** The Office holiday's name on a day, or null. */
  holidayName: (iso: string) => string | null;
}

export function useOfficeDays(): OfficeDays {
  const calendar = useOfficeCalendar();
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
  }, [calendar]);
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

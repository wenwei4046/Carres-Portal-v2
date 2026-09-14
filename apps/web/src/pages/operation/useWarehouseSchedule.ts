import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  sortWarehouseScheduleCards,
  warehouseArrivalScheduleCards,
  warehouseOutboundCards,
  warehousePickupScheduleCards,
  warehousePickupScopeKey,
  warehouseScheduleOperatingDates,
  WAREHOUSE_SCHEDULE_DATE_COUNT,
  type DeliveryWarehouseScheduleEvent,
  type InboundArrival,
  type WarehouseArrivalSourceFacts,
  type WarehouseScheduleDirection,
  type WarehouseScheduleCard,
  type WarehouseScheduleError,
  type WarehouseScheduleResult,
  type WarehouseScheduleSettings,
} from "@carres/shared";
import { apiFetch, type ApiError } from "@/lib/api";
import { appTodayIso } from "@/lib/fmt-date";

/**
 * WAREHOUSE — ARRIVAL / PICKUP SCHEDULE, the one read the Schedule screen makes.
 *
 * Read-only. It opens no door, writes nothing, and stores no second copy of a
 * date, a quantity or a status. Every card it returns is assembled by the
 * shared projection in `@carres/shared/warehouse-schedule`; this hook only
 * fetches the authorized sources and hands them over.
 *
 * ── EACH DIRECTION IS READ INDEPENDENTLY ────────────────────────────────────
 * ARRIVAL reads Receiving's own Inbound register. PICKUP reads Delivery's
 * read-only warehouse-schedule feed. A failure in one contributes zero cards
 * AND one `errors` entry; it never empties the other. So an empty `cards` with
 * an empty `errors` is a genuine "nothing scheduled", and an empty `cards`
 * with a non-empty `errors` is a failure that must never be rendered as
 * "no arrangements".
 *
 * ── PERMISSION SCOPE IS UNCHANGED ───────────────────────────────────────────
 * Every request below is an EXISTING authorized endpoint, called exactly as
 * its current consumers call it. Nothing here broadens a role, widens a
 * select, or touches RLS. Two of the reads are deliberately OPTIONAL — the
 * Site settings and the arrangement agreement proofs are guarded
 * `operation | principal`, so for a warehouse-role user they refuse. A refusal
 * there degrades one field honestly and is reported; it is never worked around.
 */

export interface UseWarehouseScheduleOptions {
  direction: WarehouseScheduleDirection;
  /** Governed Site ID. Absent means every Site the caller may already read. */
  siteId?: string | null;
  /** ISO date the operating-date window starts at. Defaults to today. */
  from?: string;
  /** How many operating dates the window spans. Defaults to six. */
  count?: number;
}

interface InboundPayload {
  arrivals: InboundArrival[];
  sites: Array<{ id: string; name: string }>;
  /** Additive, read-only (this card). Absent on a Worker built before it. */
  sourceFacts?: WarehouseArrivalSourceFacts[];
  /** Additive, read-only: the CATALOG's own answer per SKU. Absent on a
   *  Worker built before it, which drops the ladder to its classifier rung. */
  skuCategories?: Array<{ sku: string; category: string | null }>;
  page: { offset: number; limit: number; total: number };
}

interface ArrangementsPayload {
  arrangements: Array<{
    order_id: string;
    leg: number;
    reply_proof_path: string | null;
  }>;
}

/** The Settings bundle `resolveWarehouseSchedule` needs, shaped as the
 *  Settings endpoint already returns it. */
interface SettingsPayload {
  details: { status: "active" | "closed" };
  workingHours: WarehouseScheduleSettings["workingHours"];
  specialDates: WarehouseScheduleSettings["specialDates"];
  holidayPolicy: WarehouseScheduleSettings["holidayPolicy"];
  holidayDates: WarehouseScheduleSettings["holidayDates"];
}

/** The Inbound register is server-paged. The Schedule wants the whole dated
 *  surface, so it asks for the register's maximum page — and reports honestly
 *  when there is more than one page rather than showing a silent truncation. */
const INBOUND_PAGE_LIMIT = 200;

function messageOf(error: unknown, fallback: string): string {
  const api = error as ApiError | undefined;
  return api?.message?.trim() || fallback;
}

export function useWarehouseSchedule(
  options: UseWarehouseScheduleOptions,
): WarehouseScheduleResult {
  const { direction, siteId, from, count = WAREHOUSE_SCHEDULE_DATE_COUNT } =
    options;
  const today = appTodayIso();
  const windowFrom = from ?? today;
  const isArrival = direction === "arrival";

  const inboundQuery = useQuery<InboundPayload, ApiError>({
    queryKey: ["operation", "warehouse-schedule", "arrival", siteId ?? ""],
    queryFn: () => {
      const p = new URLSearchParams({
        offset: "0",
        limit: String(INBOUND_PAGE_LIMIT),
      });
      if (siteId) p.set("site", siteId);
      return apiFetch<InboundPayload>(
        `/api/operation/warehouse/inbound?${p.toString()}`,
      );
    },
    enabled: isArrival,
    staleTime: 30_000,
  });

  const pickupQuery = useQuery<
    { events: DeliveryWarehouseScheduleEvent[] },
    ApiError
  >({
    /* The SAME key the existing feed consumer uses, so the two share one
       cache entry instead of doubling the request. */
    queryKey: ["operation", "delivery-arrangements", "warehouse-schedule"],
    queryFn: () =>
      apiFetch<{ events: DeliveryWarehouseScheduleEvent[] }>(
        "/api/operation/delivery-arrangements/warehouse-schedule",
      ),
    enabled: !isArrival,
    staleTime: 30_000,
  });

  /* OPTIONAL — the partner's actual reply on file, which is the only thing
     that makes a pickup date an AGREED arrangement rather than a date. Its
     endpoint is guarded `operation | principal`; a warehouse-role user is
     refused and `dateStatus` stays `expected`, never upgraded to fill a gap. */
  const proofsQuery = useQuery<ArrangementsPayload, ApiError>({
    queryKey: ["operation", "delivery-arrangements"],
    queryFn: () =>
      apiFetch<ArrangementsPayload>("/api/operation/delivery-arrangements"),
    enabled: !isArrival,
    staleTime: 30_000,
    retry: false,
  });

  /* OPTIONAL — the CONFIGURED Site operating dates. Same guard, same
     discipline: refused means the window falls back to the APPROVED standard
     Warehouse week and says so. It never invents a closure, and it never
     contradicts the approved one either. */
  const settingsQuery = useQuery<SettingsPayload, ApiError>({
    queryKey: ["operation", "warehouse-settings", siteId ?? ""],
    queryFn: () =>
      apiFetch<SettingsPayload>(
        siteId
          ? `/api/operation/warehouse-settings?siteId=${encodeURIComponent(siteId)}`
          : "/api/operation/warehouse-settings",
      ),
    staleTime: 5 * 60_000,
    retry: false,
  });

  const settings: WarehouseScheduleSettings | null = useMemo(() => {
    const data = settingsQuery.data;
    if (!data) return null;
    return {
      siteStatus: data.details.status,
      workingHours: data.workingHours ?? [],
      specialDates: data.specialDates ?? [],
      holidayPolicy: data.holidayPolicy ?? null,
      holidayDates: data.holidayDates ?? [],
    };
  }, [settingsQuery.data]);

  return useMemo<WarehouseScheduleResult>(() => {
    const errors: WarehouseScheduleError[] = [];
    let cards: WarehouseScheduleCard[] = [];

    if (isArrival) {
      if (inboundQuery.error) {
        errors.push({
          direction,
          message: messageOf(
            inboundQuery.error,
            "Arrivals could not be read. This is not an empty day.",
          ),
        });
      } else if (inboundQuery.data) {
        const payload = inboundQuery.data;
        if (!payload.sourceFacts)
          errors.push({
            direction,
            message:
              "Ordered lines and date agreement are not available from this server. Arrival lines fall back to recorded Units.",
          });
        if (payload.page && payload.page.total > payload.arrivals.length)
          errors.push({
            direction,
            message: `Showing ${payload.arrivals.length} of ${payload.page.total} arrival arrangements. The rest are not on this page.`,
          });
        if (!payload.skuCategories)
          errors.push({
            direction,
            message:
              "The product catalog is not available from this server. Categories fall back to the shared classifier.",
          });
        cards = warehouseArrivalScheduleCards(
          payload.arrivals,
          payload.sourceFacts ?? [],
          today,
          payload.skuCategories
            ? new Map(payload.skuCategories.map((r) => [r.sku, r.category]))
            : undefined,
        );
      }
    } else {
      if (pickupQuery.error) {
        errors.push({
          direction,
          message: messageOf(
            pickupQuery.error,
            "Pickups could not be read. This is not an empty day.",
          ),
        });
      } else if (pickupQuery.data) {
        const proofs = new Set<string>();
        if (proofsQuery.data)
          for (const row of proofsQuery.data.arrangements)
            if (row.reply_proof_path)
              proofs.add(warehousePickupScopeKey(row.order_id, row.leg));
        else if (proofsQuery.error)
          errors.push({
            direction,
            message:
              "The partner's reply on file could not be read, so no pickup date can be shown as agreed.",
          });
        const outbound = warehouseOutboundCards(pickupQuery.data.events);
        cards = warehousePickupScheduleCards(outbound, today, proofs);
      }
    }

    /* A Site filter narrows the RESULT, never the permission — the reads above
       are already RLS-scoped. A card whose Site was never recorded is kept:
       unsited work is exactly the work that goes missing. */
    const scoped = siteId
      ? cards.filter((card) => card.siteId === null || card.siteId === siteId)
      : cards;

    if (settingsQuery.error)
      errors.push({
        direction,
        message:
          "Site operating dates could not be read. Dates below follow the standard Warehouse week, not this Site's configured schedule.",
      });

    return {
      cards: sortWarehouseScheduleCards(scoped),
      operatingDates: warehouseScheduleOperatingDates(
        windowFrom,
        count,
        direction,
        settings,
      ),
      loading: isArrival ? inboundQuery.isPending : pickupQuery.isPending,
      errors,
    };
  }, [
    direction,
    isArrival,
    siteId,
    windowFrom,
    count,
    today,
    settings,
    inboundQuery.data,
    inboundQuery.error,
    inboundQuery.isPending,
    pickupQuery.data,
    pickupQuery.error,
    pickupQuery.isPending,
    proofsQuery.data,
    proofsQuery.error,
    settingsQuery.error,
  ]);
}

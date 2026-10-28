/**
 * THE WAREHOUSE SITE CALENDAR, as the browser reads it (9 Oct 2026).
 *
 * Warehouse lateness counts on the Site's OWN calendar — its Receiving or
 * Collection hours, special dates and holiday policy (Warehouse Settings) —
 * never the Office calendar. A day nobody configured falls back, explicitly,
 * to the governed Warehouse week: Sunday off + the Selangor holidays (the
 * stored Warehouse calendar the Delivery calendar reads, else the built-in
 * list). `warehouseDaysLate` is the one walk; this hook only feeds it.
 *
 * It reads the same Warehouse Settings query (same key) the Schedule reads,
 * so the two share one cache entry. A refused read answers the governed week.
 */
import { useCallback, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  warehouseDaysLate,
  type WarehouseActivity,
  type WarehouseScheduleSettings,
} from "@carres/shared";
import { apiFetch, type ApiError } from "./api";
import { appTodayIso } from "./fmt-date";
import { useDeliveryDays } from "./deadline-queries";

interface SettingsPayload {
  details: { siteId?: string; status: "active" | "closed" };
  workingHours: WarehouseScheduleSettings["workingHours"];
  specialDates: WarehouseScheduleSettings["specialDates"];
  holidayPolicy: WarehouseScheduleSettings["holidayPolicy"];
  holidayDates: WarehouseScheduleSettings["holidayDates"];
}

/** Days late at a Site for one activity: `(dueIso, siteId) => n`. */
export type SiteDaysLate = (dueIso: string, siteId: string | null) => number;

export function useWarehouseSiteDaysLate(siteId: string | null, activity: WarehouseActivity): SiteDaysLate {
  const q = useQuery<SettingsPayload, ApiError>({
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
  const holidays = useDeliveryDays().holidays;
  const settings = useMemo<WarehouseScheduleSettings | null>(() => {
    const data = q.data;
    if (!data) return null;
    return {
      siteStatus: data.details.status,
      workingHours: data.workingHours ?? [],
      specialDates: data.specialDates ?? [],
      holidayPolicy: data.holidayPolicy ?? null,
      holidayDates: data.holidayDates ?? [],
    };
  }, [q.data]);
  const settingsSiteId = q.data?.details.siteId ?? null;
  const today = appTodayIso();
  return useCallback(
    (dueIso: string, site: string | null) =>
      warehouseDaysLate(dueIso, today, activity, site && site === settingsSiteId ? settings : null, holidays),
    [today, activity, settingsSiteId, settings, holidays],
  );
}

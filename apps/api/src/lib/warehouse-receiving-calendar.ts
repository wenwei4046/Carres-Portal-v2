/**
 * THE RECEIVING SITE'S OWN CALENDAR for the Work feed's GRN lateness
 * (`receiving.check_in`, 9 Oct 2026). Warehouse owns its working hours,
 * special dates and holiday policy (Stock MASTER warehouse calendar · Delivery
 * MASTER §11.0: "Warehouse working hours/receiving/collection/holidays are
 * Warehouse-owned, not Office defaults"); this reads them for the Sites the
 * feed's submitted receipts name, in one round of reads, as the caller (RLS).
 *
 * The shape is `WarehouseScheduleSettings` — the same one the Arrival
 * Schedule walks through `warehouseOperatesOn`, so the lateness counts the
 * days the Schedule shows (Law D).
 *
 * Fails SAFE: an unreadable table yields an empty map, and a Site with no
 * entry falls back to the governed Warehouse week (Sunday off + public
 * holidays) inside `warehouseReceivingDaysLate` — today's behaviour.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { WarehouseHolidayAvailability, WarehouseScheduleSettings } from "@carres/shared";

type Row = Record<string, unknown>;
const str = (v: unknown) => (typeof v === "string" && v.length > 0 ? v : null);

export async function readWarehouseReceivingSettings(
  sb: SupabaseClient,
  siteIds: readonly string[],
): Promise<Map<string, WarehouseScheduleSettings>> {
  const ids = [...new Set(siteIds.filter(Boolean))];
  const out = new Map<string, WarehouseScheduleSettings>();
  if (ids.length === 0) return out;
  try {
    const [profilesR, hoursR, specialR, policyR, calendarsR] = await Promise.all([
      sb.from("warehouse_site_profiles").select("site_id, status").in("site_id", ids),
      sb
        .from("warehouse_working_hours")
        .select("site_id, weekday, activity, closed, opens_at, closes_at")
        .eq("activity", "receiving")
        .in("site_id", ids),
      sb.from("warehouse_special_dates").select("site_id, on_date, kind, opens_at, closes_at").in("site_id", ids),
      sb
        .from("warehouse_holiday_policies")
        .select(
          "site_id, follow_public_holidays, country, state, observe_replacement, default_availability, special_opens_at, special_closes_at",
        )
        .in("site_id", ids),
      sb.from("warehouse_holiday_calendars").select("id, active").eq("active", true).limit(1),
    ]);
    if (profilesR.error || hoursR.error || specialR.error || policyR.error || calendarsR.error) return out;
    const activeCalendar = ((calendarsR.data ?? []) as Row[])[0];
    let holidayDates: WarehouseScheduleSettings["holidayDates"] = [];
    if (activeCalendar) {
      const datesR = await sb
        .from("warehouse_holiday_dates")
        .select("on_date, name, observed")
        .eq("calendar_id", activeCalendar.id as string);
      if (datesR.error) return out;
      holidayDates = ((datesR.data ?? []) as Row[]).map((r) => ({
        onDate: String(r.on_date).slice(0, 10),
        name: (r.name as string) ?? "",
        observed: r.observed === true,
      }));
    }
    const by = <T extends Row>(rows: T[] | null) => {
      const m = new Map<string, T[]>();
      for (const r of rows ?? []) m.set(r.site_id as string, [...(m.get(r.site_id as string) ?? []), r]);
      return m;
    };
    const profiles = by((profilesR.data ?? []) as Row[]);
    const hours = by((hoursR.data ?? []) as Row[]);
    const special = by((specialR.data ?? []) as Row[]);
    const policies = by((policyR.data ?? []) as Row[]);
    for (const siteId of ids) {
      const policy = policies.get(siteId)?.[0] ?? null;
      out.set(siteId, {
        siteStatus: (profiles.get(siteId)?.[0]?.status as string) === "closed" ? "closed" : "active",
        workingHours: (hours.get(siteId) ?? []).map((r) => ({
          weekday: Number(r.weekday),
          activity: "receiving" as const,
          closed: r.closed === true,
          opensAt: str(r.opens_at),
          closesAt: str(r.closes_at),
        })),
        specialDates: (special.get(siteId) ?? []).map((r) => ({
          onDate: String(r.on_date).slice(0, 10),
          kind: r.kind as WarehouseScheduleSettings["specialDates"][number]["kind"],
          opensAt: str(r.opens_at),
          closesAt: str(r.closes_at),
        })),
        holidayPolicy: policy
          ? {
              followPublicHolidays: policy.follow_public_holidays === true,
              country: policy.country as string,
              state: str(policy.state),
              observeReplacement: policy.observe_replacement === true,
              defaultAvailability: policy.default_availability as WarehouseHolidayAvailability,
              specialOpensAt: str(policy.special_opens_at),
              specialClosesAt: str(policy.special_closes_at),
            }
          : null,
        holidayDates,
      });
    }
    return out;
  } catch {
    return new Map();
  }
}

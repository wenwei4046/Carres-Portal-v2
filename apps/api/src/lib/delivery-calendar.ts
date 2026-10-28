/**
 * The ONE reader of the Delivery calendar's holidays for every Delivery date
 * the Worker computes (owner order 9 Oct 2026): the Work feed, the Orders
 * list, the delivery-day refusals, the external link, the DO issue gate and
 * the payment-due fact. Read once per request and pass the result down.
 *
 * The holidays are the ones Warehouse Settings already stores for the
 * DISPATCHING Site (the first `warehouses` row — the same Site Warehouse
 * Settings governs today): its saved policy names the country/state
 * (`warehouse_holiday_policies`), and the ACTIVE imported calendar for that
 * state — else for Selangor — holds the dates. No second holiday editor.
 *
 * Fails SAFE to the built-in Selangor + national list (`DEFAULT_DELIVERY_CALENDAR`)
 * when nothing is imported, the tables are unreadable for this role, or the
 * read throws; `stored: false` says the storage could not be read.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  DEFAULT_DELIVERY_CALENDAR,
  deliveryCalendarOf,
  pickDeliveryHolidayCalendar,
  type DeliveryCalendar,
} from "@carres/shared";

export interface StoredDeliveryCalendar {
  calendar: DeliveryCalendar;
  /** False when Warehouse Settings could not be read — the built-in list answers. */
  stored: boolean;
}

type Row = Record<string, unknown>;
const str = (v: unknown) => (typeof v === "string" && v.trim().length > 0 ? v.trim() : null);

export async function readDeliveryCalendar(sb: SupabaseClient): Promise<StoredDeliveryCalendar> {
  try {
    return await readStored(sb);
  } catch {
    return { calendar: DEFAULT_DELIVERY_CALENDAR, stored: false };
  }
}

async function readStored(sb: SupabaseClient): Promise<StoredDeliveryCalendar> {
  const [siteR, calendarsR] = await Promise.all([
    sb.from("warehouses").select("id").order("created_at").limit(1),
    sb.from("warehouse_holiday_calendars").select("id, country, state, active").eq("active", true),
  ]);
  if (siteR.error || calendarsR.error) return { calendar: DEFAULT_DELIVERY_CALENDAR, stored: false };
  const siteId = str(((siteR.data ?? []) as Row[])[0]?.id);
  let policy: { country: string | null; state: string | null } | null = null;
  if (siteId) {
    const policyR = await sb
      .from("warehouse_holiday_policies")
      .select("country, state")
      .eq("site_id", siteId)
      .maybeSingle();
    if (policyR.error) return { calendar: DEFAULT_DELIVERY_CALENDAR, stored: false };
    const p = policyR.data as Row | null;
    policy = p ? { country: str(p.country), state: str(p.state) } : null;
  }
  const calendars = ((calendarsR.data ?? []) as Row[]).map((r) => ({
    id: String(r.id),
    country: str(r.country),
    state: str(r.state),
    active: r.active === true,
  }));
  const chosen = pickDeliveryHolidayCalendar(calendars, policy);
  if (!chosen) {
    // Nothing imported for the state: the built-in list, stated as such.
    return { calendar: deliveryCalendarOf({ region: policy?.state ?? null, dates: [] }), stored: true };
  }
  const datesR = await sb.from("warehouse_holiday_dates").select("on_date, name").eq("calendar_id", chosen.id);
  if (datesR.error) return { calendar: DEFAULT_DELIVERY_CALENDAR, stored: false };
  return {
    calendar: deliveryCalendarOf({
      region: chosen.state ?? policy?.state ?? null,
      dates: ((datesR.data ?? []) as Row[]).map((r) => ({ onDate: String(r.on_date), name: str(r.name) })),
    }),
    stored: true,
  };
}

/**
 * The ONE reader of the stored Office calendar (Settings → Office, 0668) for
 * every Office-based deadline the Worker computes: the Work feed, the payment
 * collection clock, the activity check. Read once per request (or cron run)
 * and pass the result down — never a second weekday or holiday list.
 *
 * Fails SAFE to the owner-confirmed defaults (Monday–Friday, the built-in
 * holiday list) when the storage is not installed or unreadable, and says so
 * through `stored: false`; a Settings page never offers Edit on that answer.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { DEFAULT_OFFICE_CALENDAR, officeCalendarOf, type OfficeCalendar } from "@carres/shared";

export interface StoredOfficeCalendar {
  calendar: OfficeCalendar;
  /** The raw stored row (null when not installed/unreadable). */
  row: Record<string, unknown> | null;
  holidays: { date: string; name: string }[];
  stored: boolean;
}

export async function readOfficeCalendar(sb: SupabaseClient): Promise<StoredOfficeCalendar> {
  try {
    return await readStored(sb);
  } catch {
    // A thrown read (network, a client without a table API) is the same
    // answer as an unreadable table: the owner defaults, `stored: false`.
    return { calendar: DEFAULT_OFFICE_CALENDAR, row: null, holidays: [], stored: false };
  }
}

async function readStored(sb: SupabaseClient): Promise<StoredOfficeCalendar> {
  const [cal, hol] = await Promise.all([
    sb
      .from("office_calendar")
      .select("work_days, start_time, end_time, flexi_minutes, lunch_start, lunch_end, lunch_shift_minutes, holiday_region, revision")
      .eq("id", 1)
      .maybeSingle(),
    sb.from("office_holidays").select("holiday_date, name").order("holiday_date"),
  ]);
  if (cal.error || hol.error || !cal.data) {
    return { calendar: DEFAULT_OFFICE_CALENDAR, row: null, holidays: [], stored: false };
  }
  const holidays = (hol.data ?? []).map((h) => ({
    date: String(h.holiday_date).slice(0, 10),
    name: String(h.name ?? ""),
  }));
  return {
    calendar: officeCalendarOf(cal.data as Parameters<typeof officeCalendarOf>[0], hol.data ?? []),
    row: cal.data as Record<string, unknown>,
    holidays,
    stored: true,
  };
}

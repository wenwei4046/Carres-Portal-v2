/**
 * Malaysia public-holiday calendar — Selangor + national (Jess D2, 2026-07-21).
 *
 * Fed into the working-day engine (`working-days.ts`) so procurement raise-by
 * and ETA math skips these. Klang warehouse is in **Selangor**, so this is the
 * Selangor observance set (federal holidays + Selangor state holidays).
 *
 * ⚠️ THIS IS A STARTER LIST — VERIFY AGAINST THE OFFICIAL SELANGOR GAZETTE.
 *   • `certain: true`  = fixed-date federal/state holidays (safe).
 *   • `certain: false` = Islamic (Hijri) / lunar / Hindu dates that shift with
 *     moon sighting each year — CONFIRM the exact date. Several happen to fall
 *     on a Sunday (already non-working), so a small error there is harmless.
 *
 * This is DATA, meant to become an editable table later (automation =
 * overridable default). Import { MY_HOLIDAYS_2026, myHolidaySet } and inject.
 */

import type { IsoDate } from "./working-days";

export interface Holiday {
  date: IsoDate; // 'YYYY-MM-DD'
  name: string;
  /** false = lunar/Islamic/Hindu date to verify against the gazette. */
  certain: boolean;
}

/** Selangor + national public holidays, 2026. VERIFY the `certain:false` rows. */
export const MY_HOLIDAYS_2026: readonly Holiday[] = [
  { date: "2026-01-01", name: "New Year's Day", certain: true },
  { date: "2026-02-01", name: "Thaipusam (Selangor)", certain: false }, // Sunday
  { date: "2026-02-17", name: "Chinese New Year", certain: false },
  { date: "2026-02-18", name: "Chinese New Year (Day 2)", certain: false },
  { date: "2026-03-06", name: "Nuzul Al-Quran (Selangor)", certain: false },
  { date: "2026-03-21", name: "Hari Raya Aidilfitri", certain: false },
  { date: "2026-03-22", name: "Hari Raya Aidilfitri (Day 2)", certain: false }, // Sunday
  { date: "2026-05-01", name: "Labour Day", certain: true },
  { date: "2026-05-27", name: "Hari Raya Aidiladha", certain: false },
  { date: "2026-05-31", name: "Wesak Day", certain: false }, // Sunday
  { date: "2026-06-01", name: "Agong's Birthday", certain: true }, // 1st Monday of June
  { date: "2026-06-17", name: "Awal Muharram (Maal Hijrah)", certain: false },
  { date: "2026-08-25", name: "Maulidur Rasul (Prophet's Birthday)", certain: false },
  { date: "2026-08-31", name: "National Day (Merdeka)", certain: true },
  { date: "2026-09-16", name: "Malaysia Day", certain: true },
  { date: "2026-11-08", name: "Deepavali", certain: false }, // Sunday
  { date: "2026-12-11", name: "Sultan of Selangor's Birthday", certain: true },
  { date: "2026-12-25", name: "Christmas Day", certain: true },
];

/**
 * Early-2027 dates needed because the peak season runs **Nov → Chinese New Year**
 * (Jess D3), so raise-by math in late 2026 reaches into early 2027. VERIFY.
 */
export const MY_HOLIDAYS_2027_EARLY: readonly Holiday[] = [
  { date: "2027-01-01", name: "New Year's Day", certain: true },
  { date: "2027-02-06", name: "Chinese New Year", certain: false },
  { date: "2027-02-07", name: "Chinese New Year (Day 2)", certain: false }, // Sunday
];

/** Flat 'YYYY-MM-DD' set ready to inject into the working-day engine. */
export function myHolidaySet(
  holidays: readonly Holiday[] = [...MY_HOLIDAYS_2026, ...MY_HOLIDAYS_2027_EARLY],
): Set<IsoDate> {
  return new Set(holidays.map((h) => h.date));
}

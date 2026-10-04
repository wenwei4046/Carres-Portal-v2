/** Shared column-filter arithmetic for browser and paged register readers. */
export type DatePreset = "today" | "tomorrow" | "thisWeek" | "thisMonth" | "lastMonth" | "overdue";
export interface RegisterColumnQuery {
  filters: Record<string, string[]>;
  dateFilters: Record<string, DatePreset>;
  numberFilters: Record<string, { min?: number; max?: number }>;
  dateRangeFilters: Record<string, { from?: string; to?: string }>;
  sort: { key: string; dir: "asc" | "desc" } | null;
}
export interface RegisterColumnFact { text: string; date?: string | null; number?: number | null }
export function matchesRegisterColumnFilters(
  query: RegisterColumnQuery,
  fact: (key: string) => RegisterColumnFact | undefined,
): boolean {
  for (const [key, values] of Object.entries(query.filters)) {
    const value = fact(key);
    if (value && values.length && !values.includes(value.text)) return false;
  }
  for (const [key, preset] of Object.entries(query.dateFilters)) {
    const value = fact(key);
    if (value && !dateMatchesPreset(value.date === undefined ? value.text : value.date, preset)) return false;
  }
  for (const [key, range] of Object.entries(query.dateRangeFilters)) {
    const value = fact(key); if (!value) continue;
    const day = String((value.date === undefined ? value.text : value.date) ?? "").slice(0, 10);
    if (!day || (range.from && day < range.from) || (range.to && day > range.to)) return false;
  }
  for (const [key, range] of Object.entries(query.numberFilters)) {
    const value = fact(key); if (!value) continue;
    const number = value.number === undefined ? Number(value.text) : value.number;
    if (number == null || Number.isNaN(number) || (range.min != null && number < range.min) || (range.max != null && number > range.max)) return false;
  }
  return true;
}

export const dateMatchesPreset = (iso: string | null | undefined, preset: DatePreset): boolean => {
  if (!iso) return false;
  const d = String(iso).slice(0, 10);
  if (d.length < 10) return false;
  const nowMyt = new Date(Date.now() + 8 * 3600 * 1000);
  const today = nowMyt.toISOString().slice(0, 10);
  switch (preset) {
    case "today":
      return d === today;
    case "overdue":
      return d < today;
    case "tomorrow": {
      const t = new Date(nowMyt);
      t.setUTCDate(t.getUTCDate() + 1);
      return d === t.toISOString().slice(0, 10);
    }
    case "thisWeek": {
      const dow = (nowMyt.getUTCDay() + 6) % 7; // 0 = Monday
      const mon = new Date(nowMyt);
      mon.setUTCDate(mon.getUTCDate() - dow);
      const sun = new Date(mon);
      sun.setUTCDate(sun.getUTCDate() + 6);
      return d >= mon.toISOString().slice(0, 10) && d <= sun.toISOString().slice(0, 10);
    }
    case "thisMonth":
      return d.slice(0, 7) === today.slice(0, 7);
    case "lastMonth": {
      const lm = new Date(nowMyt);
      lm.setUTCDate(1);
      lm.setUTCMonth(lm.getUTCMonth() - 1);
      return d.slice(0, 7) === lm.toISOString().slice(0, 7);
    }
    default:
      return false;
  }
};


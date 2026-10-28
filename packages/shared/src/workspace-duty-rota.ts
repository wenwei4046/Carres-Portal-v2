/**
 * The monthly PO / GRN rota's schedule (migration 0671; owner rule 9 Oct 2026,
 * WS-05). The cycle itself — who holds which Duty — is ONE arithmetic in SQL
 * (`_workspace_plan_duty_rota`); this file only says WHICH months the daily
 * run asks it to plan:
 *
 *   · the current month, every day — the planner leaves it alone unless the
 *     rotation already runs and the month is missing (a missed run) or its
 *     holder left;
 *   · next month, from the 25th — so Staff & Duties shows it under `Next`
 *     before it starts.
 */
export const DUTY_ROTA_PLAN_FROM_DAY = 25;

/** First-of-month ISO dates to plan on the company date `today` (YYYY-MM-DD). */
export function dutyRotaMonthsToPlan(today: string): string[] {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(today);
  if (!m) throw new Error("Invalid company date");
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  const current = `${m[1]}-${m[2]}-01`;
  if (day < DUTY_ROTA_PLAN_FROM_DAY) return [current];
  const nextYear = month === 12 ? year + 1 : year;
  const nextMonth = month === 12 ? 1 : month + 1;
  return [current, `${nextYear}-${String(nextMonth).padStart(2, "0")}-01`];
}

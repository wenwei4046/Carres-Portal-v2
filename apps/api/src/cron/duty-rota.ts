import { dutyRotaMonthsToPlan } from "@carres/shared/workspace-duty-rota";
import { klDateOf } from "../lib/receiving-time";
import { adminClient } from "../lib/supabase";
import type { Bindings } from "../types";

/**
 * The monthly PO / GRN rota (migration 0671; owner rule 9 Oct 2026, WS-05).
 * The daily 09:00 MYT run asks the ONE planner (`workspace_plan_duty_rota`,
 * service-role only for this caller) to look at this month and, from the
 * 25th, next month. The planner is idempotent: a month already planned is
 * kept, a manager's month is never touched, and a month whose rotation never
 * started is left to its manual baseline. Nobody is invented when nobody is
 * eligible.
 */
export async function runDutyRotaCron(env: Bindings, now: Date = new Date()): Promise<unknown[]> {
  const sb = adminClient(env);
  const results: unknown[] = [];
  for (const month of dutyRotaMonthsToPlan(klDateOf(now.toISOString()))) {
    const { data, error } = await sb.rpc("workspace_plan_duty_rota", { p_month: month });
    if (error) throw new Error(`Duty rota for ${month} failed: ${error.message}`);
    results.push(data);
  }
  console.log(`duty rota: ${JSON.stringify(results)}`);
  return results;
}

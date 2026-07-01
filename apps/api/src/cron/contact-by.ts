import { adminClient } from "../lib/supabase";
import type { Bindings } from "../types";

/**
 * Daily Contact-by cron (migration 0197). For each order entering its
 * contact-by window (delivery_date − N days, N = ops_order_control.contact_by_days
 * default 3), drop a "Contact customer · SO-x" task into ops_tasks so operation
 * reaches the customer before the deadline to confirm the window + stock.
 *
 * The whole scan+insert+stamp is one atomic SECURITY DEFINER RPC — idempotent
 * (it stamps ops_order_control.contact_by_task_at, skipping orders already
 * done). service_role: the RPC is cron-only (REVOKEd from authenticated/anon),
 * so a user JWT can't call it.
 */
export async function runContactByCron(env: Bindings): Promise<number> {
  const sb = adminClient(env);
  const { data, error } = await sb.rpc("ops_generate_contact_by_tasks");
  if (error) {
    console.error("contact-by cron failed:", error.message);
    throw new Error(error.message);
  }
  const created = typeof data === "number" ? data : 0;
  console.log(`contact-by cron: created ${created} contact-by task(s)`);
  return created;
}

/**
 * Follow-up P2 daily maintenance (migration 0198): reassign unacknowledged
 * assigned tasks back to the creator, roll overdue claimed tasks to the next
 * working day, and spawn a chase task for anything stalled 3+ days. Each is an
 * idempotent cron-only RPC. Failures are logged but don't abort the others (nor
 * the Contact-by run) — the cron is best-effort daily housekeeping.
 */
export async function runFollowUpMaintenanceCron(env: Bindings): Promise<void> {
  const sb = adminClient(env);
  const jobs = [
    "ops_tasks_reassign_unacknowledged",
    "ops_tasks_rollover_overdue",
    "ops_tasks_flag_stalled",
  ] as const;
  for (const fn of jobs) {
    const { data, error } = await sb.rpc(fn);
    if (error) {
      console.error(`${fn} failed:`, error.message);
    } else {
      console.log(`${fn}: ${typeof data === "number" ? data : 0} task(s)`);
    }
  }
}

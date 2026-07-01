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

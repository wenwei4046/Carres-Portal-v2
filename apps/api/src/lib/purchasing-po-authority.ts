import type { SupabaseClient } from "@supabase/supabase-js";

/** One application-side read of the database PO-issue capability. */
export async function purchasingActorMayIssue(
  sb: SupabaseClient,
  userId: string,
): Promise<{ mayIssue: boolean; error: { message: string; [key: string]: unknown } | null }> {
  const { data, error } = await sb.rpc("purchasing_actor_may_issue", { p_user: userId });
  return {
    mayIssue: error == null && data === true,
    error: error as { message: string; [key: string]: unknown } | null,
  };
}

/**
 * PO Duty through the ONE Shared Duty Resolver (0609,
 * `purchasing_po_duty_may_act`): the normal `po_duty` holder, today's dated
 * cover, or an Operations Superuser — the same resolver Work owners read. Used
 * by `Record what Carres does next` and `Plan Repair` (owner ruling
 * 2026-09-29); the ops_po_duty month path is not consulted. A read failure is
 * returned, never read as permission.
 */
export async function purchasingPoDutyMayAct(
  sb: SupabaseClient,
  userId: string,
): Promise<{ mayAct: boolean; error: { message: string; [key: string]: unknown } | null }> {
  const { data, error } = await sb.rpc("purchasing_po_duty_may_act", { p_user: userId });
  return {
    mayAct: error == null && data === true,
    error: error as { message: string; [key: string]: unknown } | null,
  };
}

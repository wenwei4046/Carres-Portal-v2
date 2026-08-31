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

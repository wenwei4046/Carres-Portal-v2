import { supabase } from "@/lib/supabase";

/**
 * Self-service password rotation, client → Supabase Auth directly (no Hono
 * hop — the user already holds their own session JWT; admin API would be
 * overkill). Shared by the /me ChangePasswordCard and the POS store-account
 * section (Loo 2026-07-19).
 *
 * Steps:
 *   1. Verify `current` by re-running signInWithPassword (Supabase has no
 *      dedicated verify endpoint; success ≡ correct password). Refreshes the
 *      session as a side effect — harmless.
 *   2. `auth.updateUser({ password: next })` on the now-fresh session.
 */
export async function changeOwnPassword(
  email: string,
  current: string,
  next: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const verify = await supabase.auth.signInWithPassword({ email, password: current });
  if (verify.error) return { ok: false, error: "Current password is incorrect" };
  const upd = await supabase.auth.updateUser({ password: next });
  if (upd.error) return { ok: false, error: upd.error.message };
  return { ok: true };
}

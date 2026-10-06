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

/** The shortest password the portal accepts. One number, two readers — the
 *  /me card and the recovery page — so the floor cannot drift between them. */
export const MIN_PASSWORD_LENGTH = 8;

/**
 * Recovery rotation — step 02 of the flow the login page starts.
 *
 * It cannot reuse `changeOwnPassword`: that one proves who you are by asking
 * for the CURRENT password, and someone who followed a recovery link is
 * precisely the person who does not have it. The proof here is the recovery
 * token instead, which Supabase has already exchanged for a session by the
 * time this runs (`detectSessionInUrl`), so `updateUser` is the whole act.
 *
 * The caller must confirm a session exists first. Without one this returns the
 * "link expired" answer rather than a raw Supabase string, because an expired
 * link is the ordinary case here, not an error.
 */
export async function setPasswordFromRecovery(
  next: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data } = await supabase.auth.getSession();
  if (!data.session) {
    return { ok: false, error: "This link has expired. Ask for a new one from the sign-in page." };
  }
  const upd = await supabase.auth.updateUser({ password: next });
  if (upd.error) return { ok: false, error: upd.error.message };
  return { ok: true };
}

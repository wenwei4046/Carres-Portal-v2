import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Disabling / re-enabling a login, in ONE place.
 *
 * Two doors call this: principal → Accounts, and (from HR-P4, Loo 2026-07-26)
 * hr → People. They must never drift, because the sequence below is the whole
 * security promise:
 *
 *   1. flip app_users.status   — since 0266/0267 this is what actually revokes.
 *                                app_role() returns NULL for a non-active row,
 *                                so RLS and every hr_* DEFINER function deny
 *                                them from the next query onward, and the auth
 *                                hook stops minting a role at the next login.
 *   2. GoTrue admin ban        — (0731) no new token and no refresh from NOW;
 *                                re-enable lifts it. The access token they are
 *                                already holding lives out its ~1h, and the
 *                                hook (0731) strips the role from any token
 *                                minted for a non-active row. That residual is
 *                                the documented, accepted gap.
 *   3. audit                   — one row, always.
 *
 * Step 2's failure is LOGGED, never swallowed. It used to be an empty catch, and
 * that is exactly how samantha@carres.com sat "disabled" with a live session for
 * two months (found 2026-07-26). The status flip has still applied by then, so a
 * ban failure degrades to "revoked at the next query" rather than "not
 * revoked" — but it must be visible.
 *
 * NOTE the deliberate asymmetry: HR gets this one power, not the whole principal
 * Accounts router (which also creates accounts and rotates passwords).
 */

export type SetAccountStatusResult =
  | { ok: true; email: string; name: string }
  | {
      ok: false;
      code: "not_found" | "cannot_disable_principal" | "status_update_failed";
      message: string;
    };

export async function setAccountStatus(
  /** MUST be the service_role client: auth.admin.* requires it. */
  admin: SupabaseClient,
  opts: {
    userId: string;
    status: "active" | "disabled";
    /** `null` as well as undefined: the principal door's schema allows an
     *  explicit null reason, and both mean "no reason given". */
    reason?: string | null;
    /** Audit attribution — the CALLER's role, not a hardcoded one. */
    actorRole: string;
    actorText: string;
  },
): Promise<SetAccountStatusResult> {
  const { userId, status, reason, actorRole, actorText } = opts;

  const target = await admin
    .from("app_users")
    .select("id, email, name, role, dealer_id")
    .eq("id", userId)
    .maybeSingle();

  if (!target.data) {
    return { ok: false, code: "not_found", message: "User not found" };
  }

  // Locking out the last principal would leave nobody able to unlock anyone.
  if (target.data.role === "principal" && status === "disabled") {
    return {
      ok: false,
      code: "cannot_disable_principal",
      message: "Cannot disable a principal account",
    };
  }

  const upd = await admin.from("app_users").update({ status }).eq("id", userId);
  if (upd.error) {
    return { ok: false, code: "status_update_failed", message: upd.error.message };
  }

  // 0731: a ban stops GoTrue issuing or refreshing tokens. signOut(userId) was
  // a no-op — it takes the user's JWT, not their id — and it RETURNS its error.
  const ban = await admin.auth.admin
    .updateUserById(userId, { ban_duration: status === "disabled" ? "876000h" : "none" })
    .catch((err: unknown) => ({ error: err }));
  if (ban.error) {
    console.log(
      JSON.stringify({
        event: status === "disabled" ? "disable_ban_failed" : "enable_unban_failed",
        userId,
        email: target.data.email,
        actorRole,
        message: ban.error instanceof Error ? ban.error.message : String(ban.error),
        note: "status flip still applied; RLS denies from the next query (0266)",
      }),
    );
  }

  const verb = status === "disabled" ? "Disabled" : "Re-enabled";
  await admin.from("audit_log").insert({
    role: actorRole,
    actor_text: actorText,
    action:
      `${verb} account · ${target.data.name} (${target.data.email})` +
      (reason ? ` · ${reason}` : ""),
    dealer_id: target.data.dealer_id,
    ref: userId,
  });

  return { ok: true, email: target.data.email as string, name: target.data.name as string };
}

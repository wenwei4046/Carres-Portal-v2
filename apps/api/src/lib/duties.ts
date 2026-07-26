import type { Context } from "hono";
import { HTTPException } from "hono/http-exception";
import { checkDuty, usedLegacyFallback, type DutyKey } from "@carres/shared";
import { userClient } from "./supabase";
import type { AppEnv } from "../types";

/**
 * HR-P2 (0260) — server-side duty resolution.
 *
 * The web may pass duties around for rendering, but a client-supplied duty is
 * never trusted for a write: every API gate re-reads them here from
 * `my_org_duties()`, a self-only STABLE SECURITY DEFINER function. Self-only
 * matters — even a compromised caller can only ever learn their own keys.
 */

/**
 * The caller's duty keys, memoised per request.
 *
 * FAILS SOFT to `[]` on any read error, and that is deliberate rather than
 * lazy: while the transition fallback is live, `[]` simply hands the decision
 * to the legacy email list, so a hiccup cannot lock Jess out. Once the
 * fallback is deleted, the same `[]` becomes fail-CLOSED — the gate denies —
 * which is the correct end state for a permission read.
 */
export async function myDuties(c: Context<AppEnv>): Promise<readonly string[]> {
  const cached = c.get("duties");
  if (cached) return cached;

  const auth = c.var.auth;
  let duties: readonly string[] = [];
  try {
    const sb = userClient(c.env, auth.jwt);
    const { data, error } = await sb.rpc("my_org_duties");
    if (!error && Array.isArray(data)) {
      duties = data.filter((d): d is string => typeof d === "string");
    }
  } catch {
    // Network / pre-0260 DB — leave duties empty, see the fail-soft note above.
  }

  c.set("duties", duties);
  return duties;
}

/**
 * Does the caller hold `key`? Resolves role → duty → legacy email, and logs
 * every hit that ONLY the legacy list allowed. That log is the retirement
 * signal: one clean week with zero `duty_legacy_fallback` lines and the email
 * block in `@carres/shared/schemas/org-duties` comes out.
 */
export async function hasDuty(c: Context<AppEnv>, key: DutyKey): Promise<boolean> {
  const auth = c.var.auth;
  const grant = checkDuty(key, auth.role, auth.email, await myDuties(c));

  if (usedLegacyFallback(grant)) {
    console.log(
      JSON.stringify({
        event: "duty_legacy_fallback",
        duty: key,
        email: auth.email,
        role: auth.role,
        path: c.req.path,
        note: "granted by the pre-0260 email list, not by a position duty",
      }),
    );
  }

  return grant.allowed;
}

/** `hasDuty` as a guard — throws 403 with a human sentence when denied. */
export async function requireDuty(
  c: Context<AppEnv>,
  key: DutyKey,
  message: string,
): Promise<void> {
  if (!(await hasDuty(c, key))) {
    throw new HTTPException(403, { message });
  }
}

/**
 * Duties for a LIST of people (`org_duty_holders()`), for surfaces that ask
 * "which of THESE are managers?" — a question the self-only read structurally
 * cannot answer. Fails soft to an empty map for the same reason as above.
 */
export async function dutyHolders(
  c: Context<AppEnv>,
): Promise<Record<string, readonly string[]>> {
  const auth = c.var.auth;
  const map: Record<string, readonly string[]> = {};
  try {
    const sb = userClient(c.env, auth.jwt);
    const { data, error } = await sb.rpc("org_duty_holders");
    if (error || !Array.isArray(data)) return map;
    for (const row of data as { user_id?: string; duties?: unknown }[]) {
      if (typeof row.user_id === "string") {
        map[row.user_id] = Array.isArray(row.duties)
          ? row.duties.filter((d): d is string => typeof d === "string")
          : [];
      }
    }
  } catch {
    // Same fail-soft contract as myDuties().
  }
  return map;
}

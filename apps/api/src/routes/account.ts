import { Hono, type Context } from "hono";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import {
  EMAIL_CHANGE_REQUESTS_TABLE,
  emailChangeRequestFromRow,
  submitEmailChangeInputSchema,
  type EmailChangeRequestRow,
} from "@carres/shared";
import { adminClient, userClient } from "../lib/supabase";
import { getStaffContext } from "../lib/staff-token";
import type { AppEnv } from "../types";

/**
 * /api/account — store-account self-service (Loo 2026-07-19).
 *
 * The dealer principal (店主) manages the STORE login credential from the POS:
 * the password is rotated client-direct against Supabase Auth (no route here),
 * while an EMAIL change is request + approval — these routes file/cancel the
 * request; the HQ decision routes live in /api/principal/accounts.
 *
 * Gate: a DEALER store login carrying a principal-tier staff token (0233).
 * Showrooms are excluded — their credential belongs to Carres HQ. Submitting
 * additionally re-proves the store PASSWORD (same GoTrue grant as
 * /api/staff/reauth) so a walked-away tablet can't file requests.
 */
const accountRouter = new Hono<AppEnv>();

/** The dealer store's principal-tier caller (owner-mode sid=null included). */
async function requireDealerPrincipal(c: Context<AppEnv>) {
  const auth = c.var.auth;
  if (auth.role !== "dealer") {
    throw new HTTPException(403, { message: "Dealer store login only" });
  }
  if (!auth.dealerId) throw new HTTPException(422, { message: "Caller has no dealer_id in JWT" });
  const staff = await getStaffContext(c);
  if (!staff || staff.tier !== "principal") {
    throw new HTTPException(403, { message: "Store owner (principal tier) only" });
  }
  return { auth, staff };
}

// ---------------------------------------------------------------------------
// GET /email-change — my store's latest request (pending banner / reject note)
// ---------------------------------------------------------------------------
accountRouter.get("/email-change", async (c) => {
  const { auth } = await requireDealerPrincipal(c);
  const sb = userClient(c.env, auth.jwt);
  const { data, error } = await sb
    .from(EMAIL_CHANGE_REQUESTS_TABLE)
    .select("*")
    .eq("user_id", auth.id)
    .order("created_at", { ascending: false })
    .limit(1);
  if (error) throw new HTTPException(500, { message: error.message });
  const row = (data ?? [])[0] as EmailChangeRequestRow | undefined;
  return c.json({ request: row ? emailChangeRequestFromRow(row) : null });
});

// ---------------------------------------------------------------------------
// POST /email-change — submit for approval (password re-proof required)
// ---------------------------------------------------------------------------
accountRouter.post("/email-change", async (c) => {
  const { auth, staff } = await requireDealerPrincipal(c);

  const parsed = submitEmailChangeInputSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    return c.json(
      { error: "invalid_body", code: "invalid_param", message: parsed.error.issues[0]?.message ?? "invalid body" },
      422,
    );
  }
  const { newEmail, password } = parsed.data;

  if (newEmail === (auth.email ?? "").toLowerCase()) {
    return c.json({ error: "same_email", message: "That is already the store's login email" }, 422);
  }

  // Password re-proof — server-side grant with the caller's own email (the
  // anon key is the apikey; the user JWT is NOT forwarded). Same shape as
  // /api/staff/reauth.
  let grantOk = false;
  try {
    const res = await fetch(`${c.env.SUPABASE_URL}/auth/v1/token?grant_type=password`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: c.env.SUPABASE_ANON_KEY },
      body: JSON.stringify({ email: auth.email, password }),
    });
    grantOk = res.ok;
  } catch {
    throw new HTTPException(502, { message: "Auth service unreachable" });
  }
  if (!grantOk) {
    return c.json({ error: "bad_password" }, 401);
  }

  // Early in-use probe (service_role, boolean only — mirrors the Principal
  // Accounts create flow). The approve route re-checks; this just gives the
  // store a clean error at submit time instead of an HQ reject later.
  const admin = adminClient(c.env);
  const { data: taken, error: takenErr } = await admin
    .from("app_users")
    .select("id")
    .eq("email", newEmail)
    .maybeSingle();
  if (takenErr) throw new HTTPException(500, { message: takenErr.message });
  if (taken) {
    return c.json({ error: "email_in_use", message: "Email already in use" }, 422);
  }

  const sb = userClient(c.env, auth.jwt);

  // Who filed — a real staff identity carries its name into the HQ queue;
  // owner-mode (sid null) files as the store credential itself.
  let requestedByName: string | null = null;
  if (staff.sid) {
    const { data: sp } = await sb
      .from("salespersons")
      .select("name")
      .eq("id", staff.sid)
      .maybeSingle();
    requestedByName = (sp as { name: string } | null)?.name ?? null;
  }

  const { data, error } = await sb
    .from(EMAIL_CHANGE_REQUESTS_TABLE)
    .insert({
      user_id: auth.id,
      dealer_id: auth.dealerId,
      current_email: auth.email ?? "",
      requested_email: newEmail,
      requested_by_staff_id: staff.sid,
      requested_by_name: requestedByName,
    })
    .select("*")
    .single();
  if (error) {
    // Partial unique (one pending per login) → the store already has one open.
    if (error.code === "23505") {
      return c.json({ error: "pending_exists", message: "A request is already awaiting approval" }, 409);
    }
    throw new HTTPException(500, { message: error.message });
  }
  return c.json(emailChangeRequestFromRow(data as EmailChangeRequestRow), 201);
});

// ---------------------------------------------------------------------------
// POST /email-change/:id/cancel — withdraw my own pending request
// ---------------------------------------------------------------------------
accountRouter.post("/email-change/:id/cancel", async (c) => {
  const { auth } = await requireDealerPrincipal(c);
  const id = c.req.param("id");
  if (!z.string().uuid().safeParse(id).success) {
    throw new HTTPException(422, { message: "invalid uuid" });
  }

  const sb = userClient(c.env, auth.jwt);
  const { data, error } = await sb
    .from(EMAIL_CHANGE_REQUESTS_TABLE)
    .update({ status: "cancelled" })
    .eq("id", id)
    .eq("user_id", auth.id)
    .eq("status", "pending")
    .select("*")
    .maybeSingle();
  if (error) throw new HTTPException(500, { message: error.message });
  if (!data) throw new HTTPException(404, { message: "No pending request to cancel" });
  return c.json(emailChangeRequestFromRow(data as EmailChangeRequestRow));
});

export default accountRouter;

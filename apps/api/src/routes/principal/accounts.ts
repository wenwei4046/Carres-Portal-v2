import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import {
  setAccountStatusInput,
  resetPasswordInput,
  decideEmailChangeInputSchema,
  emailChangeRequestFromRow,
  EMAIL_CHANGE_REQUESTS_TABLE,
  type EmailChangeRequestRow,
} from "@carres/shared";
import { setAccountStatus } from "../../lib/account-status";
import { handleCreateAccount } from "../../lib/create-account";
import { adminClient, userClient } from "../../lib/supabase";
import type { AppEnv } from "../../types";

/**
 * /api/principal/accounts — Phase 10 admin surface for user management.
 *
 *   GET  /                       — list all app_users with org name joined
 *   POST /                       — create user (service_role admin API +
 *                                  conditionally creates dealer/supplier/
 *                                  partner org row)
 *   POST /:id/status             — set status to active or disabled
 *   POST /:id/reset-password     — rotate password via auth.admin.updateUserById
 *
 * RED LINE (CLAUDE.md §4.4): every mutation route uses `adminClient`
 * (service_role) because auth.admin.* and password rotation require it.
 * The principal-only role guard is enforced inline before any service_role
 * call. The caller's JWT is never forwarded to the admin client.
 *
 * Audit: every mutation writes an audit_log row with role='principal' +
 * actor_text=email so the action shows up in PrincipalAudit immediately.
 *
 * Closes `phase-10-rotate-alpha-test-passwords` HIGH carry-forward.
 */
const principalAccountsRouter = new Hono<AppEnv>();

// Principal-only guard. Belt-and-brace before any service_role call.
principalAccountsRouter.use("*", async (c, next) => {
  const role = c.var.auth?.role;
  if (role !== "principal") {
    throw new HTTPException(403, { message: "Principal only" });
  }
  await next();
});

// ---------- GET / — list ----------
principalAccountsRouter.get("/", async (c) => {
  const sb = userClient(c.env, c.var.auth.jwt);
  const { data, error } = await sb
    .from("app_users")
    .select(
      "id, email, name, role, title, status, dealer_id, supplier_id, partner_id, outlet_id, created_by, last_seen_at, created_at",
    )
    .order("created_at", { ascending: false });
  if (error) throw new HTTPException(500, { message: error.message });

  // Bulk-fetch org names so the row can show "Dealer · Mattress King" beneath
  // the role chip without one query per user. Three small lookups, one per
  // org type — keys are all UUIDs so the IN-array stays tiny.
  const dealerIds = Array.from(new Set((data ?? []).map((u) => u.dealer_id).filter(Boolean) as string[]));
  const supplierIds = Array.from(new Set((data ?? []).map((u) => u.supplier_id).filter(Boolean) as string[]));
  const partnerIds = Array.from(new Set((data ?? []).map((u) => u.partner_id).filter(Boolean) as string[]));

  const [dealersRes, suppliersRes, partnersRes] = await Promise.all([
    dealerIds.length
      ? sb.from("dealers").select("id, name").in("id", dealerIds)
      : Promise.resolve({ data: [], error: null }),
    supplierIds.length
      ? sb.from("suppliers").select("id, name").in("id", supplierIds)
      : Promise.resolve({ data: [], error: null }),
    partnerIds.length
      ? sb.from("delivery_partners").select("id, name").in("id", partnerIds)
      : Promise.resolve({ data: [], error: null }),
  ]);

  const dealerMap = new Map<string, string>();
  const supplierMap = new Map<string, string>();
  const partnerMap = new Map<string, string>();
  (dealersRes.data ?? []).forEach((d) => dealerMap.set(d.id, d.name));
  (suppliersRes.data ?? []).forEach((s) => supplierMap.set(s.id, s.name));
  (partnersRes.data ?? []).forEach((p) => partnerMap.set(p.id, p.name));

  const users = (data ?? []).map((u) => ({
    id: u.id,
    email: u.email,
    name: u.name,
    role: u.role,
    title: u.title,
    status: u.status,
    dealerId: u.dealer_id,
    supplierId: u.supplier_id,
    partnerId: u.partner_id,
    outletId: u.outlet_id,
    orgName: u.dealer_id
      ? dealerMap.get(u.dealer_id) ?? null
      : u.supplier_id
        ? supplierMap.get(u.supplier_id) ?? null
        : u.partner_id
          ? partnerMap.get(u.partner_id) ?? null
          : null,
    createdBy: u.created_by,
    lastSeenAt: u.last_seen_at,
    createdAt: u.created_at,
  }));

  return c.json({ users });
});

// ---------- POST / — create ----------
// Body moved verbatim to lib/create-account.ts (2026-07-19) so the BD portal
// can mount the SAME door restricted to role=dealer (/api/bd/accounts).
// 2026-07-25 (Loo) — HR Team is THE account door now: every non-store user
// (operation/finance/hr/bd/principal/supplier/partner) is minted at
// /api/hr/team/accounts. This door keeps ONLY the store credentials —
// dealer + showroom — because stores are entities, not people.
principalAccountsRouter.post("/", (c) =>
  handleCreateAccount(c, { actorRole: "principal", allowedRoles: ["dealer", "showroom"] }),
);

// ---------- POST /:id/status — disable / re-enable ----------
principalAccountsRouter.post("/:id/status", async (c) => {
  const id = c.req.param("id");
  let raw: unknown;
  try {
    raw = await c.req.json();
  } catch {
    raw = {};
  }
  const parsed = setAccountStatusInput.safeParse(raw);
  if (!parsed.success) {
    return c.json(
      {
        error: "invalid_input",
        code: "invalid_param",
        message: parsed.error.issues[0]?.message ?? "invalid input",
      },
      422,
    );
  }
  const body = parsed.data;

  // The flip + GoTrue sign-out + audit sequence lives in lib/account-status so
  // this door and HR's People door (HR-P4) cannot drift apart. That sequence IS
  // the security promise — see the header there.
  const result = await setAccountStatus(adminClient(c.env), {
    userId: id,
    status: body.status,
    reason: body.reason,
    actorRole: "principal",
    actorText: c.var.auth.email,
  });

  if (!result.ok) {
    if (result.code === "not_found") {
      return c.json({ error: "not_found", code: result.code, message: result.message }, 404);
    }
    if (result.code === "cannot_disable_principal") {
      return c.json(
        { error: "invalid_input", code: result.code, message: result.message },
        422,
      );
    }
    return c.json({ error: "rpc_failed", code: result.code, message: result.message }, 500);
  }

  return c.json({ id, status: body.status });
});

// ---------- POST /:id/reset-password ----------
principalAccountsRouter.post("/:id/reset-password", async (c) => {
  const id = c.req.param("id");
  let raw: unknown;
  try {
    raw = await c.req.json();
  } catch {
    raw = {};
  }
  const parsed = resetPasswordInput.safeParse(raw);
  if (!parsed.success) {
    return c.json(
      {
        error: "invalid_input",
        code: "invalid_param",
        message: parsed.error.issues[0]?.message ?? "invalid input",
      },
      422,
    );
  }
  const sb = adminClient(c.env);
  const principalEmail = c.var.auth.email;

  const target = await sb
    .from("app_users")
    .select("id, email, name, dealer_id")
    .eq("id", id)
    .maybeSingle();
  if (!target.data) {
    return c.json(
      { error: "not_found", code: "not_found", message: "User not found" },
      404,
    );
  }

  const upd = await sb.auth.admin.updateUserById(id, {
    password: parsed.data.tempPassword,
  });
  if (upd.error) {
    return c.json(
      {
        error: "rpc_failed",
        code: "password_update_failed",
        message: upd.error.message,
      },
      500,
    );
  }

  await sb.from("audit_log").insert({
    role: "principal",
    actor_text: principalEmail,
    action: `Reset password · ${target.data.name} (${target.data.email})`,
    dealer_id: target.data.dealer_id,
    ref: id,
  });

  return c.json({ id, ok: true });
});

// ---------------------------------------------------------------------------
// Store email-change requests (0240, Loo 2026-07-19) — a dealer principal
// files a login-email change from the POS (/api/account/email-change); HQ
// decides here. Approve swaps the REAL login email (auth.admin) + app_users;
// reject parks a note the store sees. Same service_role + audit_log pattern
// as reset-password above.
// ---------------------------------------------------------------------------

// ---------- GET /email-change-requests — the HQ queue ----------
principalAccountsRouter.get("/email-change-requests", async (c) => {
  const sb = userClient(c.env, c.var.auth.jwt);
  const { data, error } = await sb
    .from(EMAIL_CHANGE_REQUESTS_TABLE)
    .select("*, dealers(name)")
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) throw new HTTPException(500, { message: error.message });
  return c.json({
    requests: ((data ?? []) as EmailChangeRequestRow[]).map(emailChangeRequestFromRow),
  });
});

// ---------- POST /email-change-requests/:id/approve ----------
principalAccountsRouter.post("/email-change-requests/:id/approve", async (c) => {
  const id = c.req.param("id");
  const sb = adminClient(c.env);
  const principalEmail = c.var.auth.email;

  const { data: row, error: findErr } = await sb
    .from(EMAIL_CHANGE_REQUESTS_TABLE)
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (findErr) throw new HTTPException(500, { message: findErr.message });
  if (!row) {
    return c.json({ error: "not_found", code: "not_found", message: "Request not found" }, 404);
  }
  const req = row as EmailChangeRequestRow;
  if (req.status !== "pending") {
    return c.json({ error: "not_pending", message: `Request is already ${req.status}` }, 409);
  }

  // Uniqueness re-check at decision time (excluding the target's own row so a
  // partially-applied approve stays retryable).
  const { data: taken, error: takenErr } = await sb
    .from("app_users")
    .select("id")
    .eq("email", req.requested_email)
    .neq("id", req.user_id)
    .maybeSingle();
  if (takenErr) throw new HTTPException(500, { message: takenErr.message });
  if (taken) {
    return c.json({ error: "email_in_use", message: "Email already in use — reject with a note instead" }, 422);
  }

  // The REAL swap: auth.users first (the login), then the app_users mirror.
  // If the mirror write fails the request stays pending — re-approving is
  // idempotent (same email onto the same auth user).
  const upd = await sb.auth.admin.updateUserById(req.user_id, {
    email: req.requested_email,
    email_confirm: true,
  });
  if (upd.error) {
    return c.json(
      { error: "rpc_failed", code: "auth_email_update_failed", message: upd.error.message },
      500,
    );
  }
  const mirror = await sb
    .from("app_users")
    .update({ email: req.requested_email })
    .eq("id", req.user_id);
  if (mirror.error) throw new HTTPException(500, { message: mirror.error.message });

  const { data: decided, error: decideErr } = await sb
    .from(EMAIL_CHANGE_REQUESTS_TABLE)
    .update({
      status: "approved",
      decided_by: c.var.auth.id,
      decided_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select("*")
    .single();
  if (decideErr) throw new HTTPException(500, { message: decideErr.message });

  await sb.from("audit_log").insert({
    role: "principal",
    actor_text: principalEmail,
    action: `Approved store email change · ${req.current_email} → ${req.requested_email}`,
    dealer_id: req.dealer_id,
    ref: req.user_id,
  });

  return c.json(emailChangeRequestFromRow(decided as EmailChangeRequestRow));
});

// ---------- POST /email-change-requests/:id/reject ----------
principalAccountsRouter.post("/email-change-requests/:id/reject", async (c) => {
  const id = c.req.param("id");
  const parsed = decideEmailChangeInputSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) {
    return c.json(
      { error: "invalid_body", code: "invalid_param", message: parsed.error.issues[0]?.message ?? "invalid body" },
      422,
    );
  }
  const sb = adminClient(c.env);
  const principalEmail = c.var.auth.email;

  const { data: decided, error } = await sb
    .from(EMAIL_CHANGE_REQUESTS_TABLE)
    .update({
      status: "rejected",
      decision_note: parsed.data.note?.length ? parsed.data.note : null,
      decided_by: c.var.auth.id,
      decided_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("status", "pending")
    .select("*")
    .maybeSingle();
  if (error) throw new HTTPException(500, { message: error.message });
  if (!decided) {
    return c.json({ error: "not_pending", message: "No pending request with that id" }, 404);
  }
  const req = decided as EmailChangeRequestRow;

  await sb.from("audit_log").insert({
    role: "principal",
    actor_text: principalEmail,
    action: `Rejected store email change · ${req.current_email} → ${req.requested_email}${parsed.data.note ? ` · ${parsed.data.note}` : ""}`,
    dealer_id: req.dealer_id,
    ref: req.user_id,
  });

  return c.json(emailChangeRequestFromRow(req));
});

export default principalAccountsRouter;

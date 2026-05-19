import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import {
  createAccountInput,
  setAccountStatusInput,
  resetPasswordInput,
} from "@carres/shared";
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
principalAccountsRouter.post("/", async (c) => {
  let raw: unknown;
  try {
    raw = await c.req.json();
  } catch {
    raw = {};
  }
  const parsed = createAccountInput.safeParse(raw);
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
  const sb = adminClient(c.env);
  const principalEmail = c.var.auth.email;

  // Email uniqueness check upfront (auth.admin.createUser surfaces a generic
  // 422 if collision; this gives a cleaner contract for the FE).
  const existing = await sb
    .from("app_users")
    .select("id")
    .eq("email", body.email)
    .maybeSingle();
  if (existing.data) {
    return c.json(
      {
        error: "invalid_input",
        code: "email_in_use",
        message: "Email already in use",
      },
      422,
    );
  }

  // Step 1 (if needed): create new org row for dealer/supplier/partner.
  let dealerId: string | null = null;
  let supplierId: string | null = null;
  let partnerId: string | null = null;
  let createdOrgTable: "dealers" | "suppliers" | "delivery_partners" | null = null;
  let createdOrgId: string | null = null;

  if (body.role === "dealer") {
    const dpInsert = await sb
      .from("dealers")
      .insert({
        name: body.companyName!,
        region: body.region?.trim() || "—",
        contact: `${body.name} · ${body.email}`,
      })
      .select("id")
      .single();
    if (dpInsert.error || !dpInsert.data) {
      return c.json(
        {
          error: "rpc_failed",
          code: "dealers_insert_failed",
          message: dpInsert.error?.message ?? "dealers insert failed",
        },
        500,
      );
    }
    dealerId = dpInsert.data.id;
    createdOrgTable = "dealers";
    createdOrgId = dealerId;
  } else if (body.role === "supplier") {
    const dpInsert = await sb
      .from("suppliers")
      .insert({
        name: body.companyName!,
        contact_email: body.email,
      })
      .select("id")
      .single();
    if (dpInsert.error || !dpInsert.data) {
      return c.json(
        {
          error: "rpc_failed",
          code: "suppliers_insert_failed",
          message: dpInsert.error?.message ?? "suppliers insert failed",
        },
        500,
      );
    }
    supplierId = dpInsert.data.id;
    createdOrgTable = "suppliers";
    createdOrgId = supplierId;
  } else if (body.role === "partner") {
    const dpInsert = await sb
      .from("delivery_partners")
      .insert({
        name: body.companyName!,
        contact: `${body.name} · ${body.email}`,
      })
      .select("id")
      .single();
    if (dpInsert.error || !dpInsert.data) {
      return c.json(
        {
          error: "rpc_failed",
          code: "delivery_partners_insert_failed",
          message: dpInsert.error?.message ?? "delivery_partners insert failed",
        },
        500,
      );
    }
    partnerId = dpInsert.data.id;
    createdOrgTable = "delivery_partners";
    createdOrgId = partnerId;
  }

  // Step 2: create auth.users via service_role admin API. The
  // app_metadata.role is mirrored into the JWT by the custom_access_token_hook
  // (migration 0004) at login — but we also write it here so the user can
  // sign in immediately without waiting for the hook to fire on first
  // session refresh.
  const appMetadata: Record<string, string | null> = { role: body.role };
  if (dealerId) appMetadata.dealer_id = dealerId;
  if (supplierId) appMetadata.supplier_id = supplierId;
  if (partnerId) appMetadata.partner_id = partnerId;

  const userResult = await sb.auth.admin.createUser({
    email: body.email,
    password: body.tempPassword,
    email_confirm: true,
    app_metadata: appMetadata,
  });

  if (userResult.error || !userResult.data?.user) {
    if (createdOrgTable && createdOrgId) {
      await sb.from(createdOrgTable).delete().eq("id", createdOrgId);
    }
    return c.json(
      {
        error: "rpc_failed",
        code: "auth_user_create_failed",
        message: userResult.error?.message ?? "auth.admin.createUser failed",
      },
      500,
    );
  }
  const authUserId = userResult.data.user.id;

  // Step 3: insert app_users row.
  const appUserInsert = await sb
    .from("app_users")
    .insert({
      id: authUserId,
      email: body.email,
      name: body.name,
      role: body.role,
      title: body.title ?? null,
      status: "active",
      dealer_id: dealerId,
      supplier_id: supplierId,
      partner_id: partnerId,
      created_by: c.var.auth.id,
    });

  if (appUserInsert.error) {
    await sb.auth.admin.deleteUser(authUserId);
    if (createdOrgTable && createdOrgId) {
      await sb.from(createdOrgTable).delete().eq("id", createdOrgId);
    }
    return c.json(
      {
        error: "rpc_failed",
        code: "app_users_insert_failed",
        message: appUserInsert.error.message,
      },
      500,
    );
  }

  // Audit — non-blocking. Action text mirrors proto wording.
  const orgPart = body.companyName ? ` · ${body.companyName}` : "";
  await sb.from("audit_log").insert({
    role: "principal",
    actor_text: principalEmail,
    action: `Created ${body.role} account · ${body.name} (${body.email})${orgPart}`,
    dealer_id: dealerId,
    ref: authUserId,
  });

  return c.json(
    {
      id: authUserId,
      email: body.email,
      name: body.name,
      role: body.role,
      dealerId,
      supplierId,
      partnerId,
    },
    201,
  );
});

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
  const sb = adminClient(c.env);
  const principalEmail = c.var.auth.email;

  // Look up target before mutating so we can audit-log the email.
  const target = await sb
    .from("app_users")
    .select("id, email, name, role, dealer_id")
    .eq("id", id)
    .maybeSingle();
  if (!target.data) {
    return c.json(
      { error: "not_found", code: "not_found", message: "User not found" },
      404,
    );
  }
  if (target.data.role === "principal" && body.status === "disabled") {
    return c.json(
      {
        error: "invalid_input",
        code: "cannot_disable_principal",
        message: "Cannot disable a principal account",
      },
      422,
    );
  }

  const upd = await sb.from("app_users").update({ status: body.status }).eq("id", id);
  if (upd.error) {
    return c.json(
      {
        error: "rpc_failed",
        code: "status_update_failed",
        message: upd.error.message,
      },
      500,
    );
  }

  // When disabling, also revoke active sessions so the user is signed out.
  // Supabase admin API: signOut by user_id immediately invalidates all
  // refresh tokens. The access token they already have remains valid until
  // it expires (default 1h) — acceptable for V1; tighter rotation later.
  if (body.status === "disabled") {
    try {
      await sb.auth.admin.signOut(id);
    } catch {
      // Ignore — status flip is the source of truth; signOut is best-effort.
    }
  }

  const verb = body.status === "disabled" ? "Disabled" : "Re-enabled";
  await sb.from("audit_log").insert({
    role: "principal",
    actor_text: principalEmail,
    action: `${verb} account · ${target.data.name} (${target.data.email})${body.reason ? ` · ${body.reason}` : ""}`,
    dealer_id: target.data.dealer_id,
    ref: id,
  });

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

export default principalAccountsRouter;

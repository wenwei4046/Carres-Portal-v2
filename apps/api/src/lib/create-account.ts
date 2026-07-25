import type { Context } from "hono";
import { createAccountInput } from "@carres/shared";
import { adminClient } from "./supabase";
import type { AppEnv } from "../types";

/**
 * Shared create-account handler (extracted verbatim from
 * routes/principal/accounts.ts POST / on 2026-07-19 so the BD portal can offer
 * the SAME account-creation door — Loo: "BD 可以帮 dealer 注册新户口，功能与
 * principal 一致").
 *
 * Two consumers:
 *   - POST /api/principal/accounts — every creatable role (unchanged).
 *   - POST /api/bd/accounts       — role=dealer only (`allowedRoles`).
 *
 * RED LINE (CLAUDE.md §4.4): uses `adminClient` (service_role) because
 * auth.admin.createUser requires it — the ROUTE guards (principal-only / bd-
 * only) run before this is ever called, and `allowedRoles` narrows what the
 * caller may mint. The caller's JWT is never forwarded to the admin client.
 */
export async function handleCreateAccount(
  c: Context<AppEnv>,
  opts: { actorRole: "principal" | "bd"; allowedRoles?: readonly string[] },
): Promise<Response> {
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
  if (opts.allowedRoles && !opts.allowedRoles.includes(body.role)) {
    return c.json(
      {
        error: "forbidden",
        code: "role_not_allowed",
        message: `${opts.actorRole} cannot create ${body.role} accounts`,
      },
      403,
    );
  }
  const sb = adminClient(c.env);
  const actorEmail = c.var.auth.email;

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

  if (body.role === "dealer" || body.role === "showroom") {
    // 2026-05-22 (Loo) — showroom is a dealer-with-channel='showroom' under
    // the hood, so the org-creation path is identical to plain dealer. The
    // only difference is the `channel` column value, which drives the
    // dealer-channel vs showroom-channel branching in downstream UI/PDF
    // (e.g. Sales Order "Sold By" letterhead).
    const channel = body.role === "showroom" ? "showroom" : "dealer";
    // 2026-07-19 (Loo) — showroom is Carres' own store: zod no longer
    // requires SSM / PIC contact for it, so every business-profile column
    // must tolerate absence (null, never the string "undefined").
    const dpInsert = await sb
      .from("dealers")
      .insert({
        name: body.companyName!,
        channel,
        // 2026-07-19 (Loo) — born ACTIVE. `dealers.status` defaults to
        // 'pending', which belongs to the OTHER door: `dealer_invite` (the
        // Dealers page's "+ Invite dealer"), where a reseller applies and the
        // principal approves. This door is HQ creating the store itself —
        // login, password and first staff PIN and all — so there is nobody
        // left to approve it. Left on 'pending' it was a dead end: no
        // `approvals` row is written here, so the drawer's "review in
        // Approvals tab" pointed at an empty tab, and the store never showed
        // in the on-behalf order picker (which lists active stores only).
        status: "active",
        region: body.region?.trim() || "—",
        // Legacy single-text `contact` column auto-built from the new
        // structured contact_name + contact_phone fields so existing reads
        // (DealerRow tooltip, DealerDrawer header) keep working.
        contact:
          body.contactName && body.contactPhone
            ? `${body.contactName} · ${body.contactPhone}`
            : null,
        address: body.address!,
        ssm_code: body.ssmCode ?? null,
        contact_name: body.contactName ?? null,
        contact_phone: body.contactPhone ?? null,
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

    // 2026-05-22 (Loo) — auto-create the default outlet so the dealer/
    // showroom can start creating sales orders immediately. Without this
    // the Step 1 picker stalls with "No outlets yet — add one in Settings".
    // outletName defaults to companyName when blank (handles the common
    // case "outlet = company"); explicit override supported via the form.
    const outletInsert = await sb
      .from("outlets")
      .insert({
        dealer_id: dealerId,
        name: (body.outletName?.trim() || body.companyName)!,
        address: body.address!,
      })
      .select("id")
      .single();
    if (outletInsert.error || !outletInsert.data) {
      return c.json(
        {
          error: "rpc_failed",
          code: "outlets_insert_failed",
          message: outletInsert.error?.message ?? "default outlet insert failed",
        },
        500,
      );
    }
    const defaultOutletId = outletInsert.data.id as string;

    // 2026-07-18 (Loo) — the FIRST staff identity + PIN provisioned right at
    // account creation, so the store is born ACTIVATED: its first login lands
    // straight on the PIN screen (no setup wizard). A Dealer-Principal tier is
    // store-wide (null outlet); manager/salesperson land in the default
    // outlet. zod already caps showroom at manager.
    if (body.initialStaff) {
      const st = body.initialStaff;
      // HR Team hierarchy (2026-07-25): showroom floor staff are OUR staff —
      // mint the company-wide CRnnn code at birth. Dealer staff carry none.
      let staffCode: string | null = null;
      if (channel === "showroom") {
        const codeRes = await sb.rpc("next_staff_code");
        if (codeRes.error) {
          await sb.from("dealers").delete().eq("id", dealerId);
          return c.json(
            { error: "rpc_failed", code: "staff_code_failed", message: codeRes.error.message },
            500,
          );
        }
        staffCode = codeRes.data as string;
      }
      const staffInsert = await sb
        .from("salespersons")
        .insert({
          dealer_id: dealerId,
          outlet_id: st.staffRole === "principal" ? null : defaultOutletId,
          name: st.name,
          staff_role: st.staffRole,
          active: true,
          // 0241 profile parity with the POS Add-staff form.
          email: st.email ?? null,
          birthday: st.birthday ?? null,
          gender: st.gender ?? null,
          phone: st.phone ?? null,
          color: st.color ?? null,
          staff_code: staffCode,
        })
        .select("id")
        .single();
      if (staffInsert.error || !staffInsert.data) {
        await sb.from("dealers").delete().eq("id", dealerId);
        return c.json(
          {
            error: "rpc_failed",
            code: "staff_insert_failed",
            message: staffInsert.error?.message ?? "initial staff insert failed",
          },
          500,
        );
      }
      const pinRes = await sb.rpc("staff_set_pin", {
        p_salesperson_id: staffInsert.data.id,
        p_pin: st.pin,
      });
      if (pinRes.error) {
        await sb.from("dealers").delete().eq("id", dealerId);
        return c.json(
          {
            error: "rpc_failed",
            code: "staff_pin_failed",
            message: pinRes.error.message,
          },
          500,
        );
      }
    }
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

  // Audit — non-blocking. Action text mirrors proto wording; role = the
  // actor's own role so PrincipalAudit / the BD activity feed attribute the
  // creation to who actually did it.
  const orgPart = body.companyName ? ` · ${body.companyName}` : "";
  await sb.from("audit_log").insert({
    role: opts.actorRole,
    actor_text: actorEmail,
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
}

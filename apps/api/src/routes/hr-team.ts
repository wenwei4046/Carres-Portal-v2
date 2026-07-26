import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import {
  hrCreateShowroomStaffInput,
  hrCreateTeamAccountInput,
  isTeamInternalRole,
  setPositionDutyInput,
  setReportsToInput,
  setStaffCodeInput,
  setTeamPositionInput,
  upsertOrgDepartmentInput,
  upsertOrgPositionInput,
  type HrTeamSource,
} from "@carres/shared";
import { requireHr } from "../lib/auth-guards";
import { adminClient, userClient } from "../lib/supabase";
import type { AppEnv } from "../types";

/**
 * /api/hr/team — HR Team hierarchy (Phase 1, 2026-07-25, Loo).
 *
 * THE account door going forward: every new user except dealers is minted
 * here (dealer + showroom STORES stay on the Dealers/Accounts side — they are
 * store credentials, not people). Carres' own team (internal roles + showroom
 * floor staff) carries a CRnnn staff code, a registry position (band:
 * C-level / Manager / Executive) and an optional reporting line.
 *
 * HR stays a keyhole role (0244 law): reads go through the gated DEFINER RPC
 * `hr_team_source`; position / reporting / staff-code writes go through the
 * audited DEFINER RPCs. Account creation uses adminClient (service_role) the
 * same way the Accounts door does (§4.4: guard first, JWT never forwarded).
 */
const hrTeamRouter = new Hono<AppEnv>();

/** GET /api/hr/team — accounts + showroom staff + positions + 职位更替 history
 *  + (0260) the duty catalogue and its position grants. */
hrTeamRouter.get("/", requireHr, async (c) => {
  const sb = userClient(c.env, c.var.auth.jwt);
  const { data, error } = await sb.rpc("hr_team_source");
  if (error) {
    if (error.code === "42501") throw new HTTPException(403, { message: "forbidden" });
    throw new HTTPException(500, { message: error.message });
  }
  const source = data as unknown as HrTeamSource;

  // HR-P2 (0260): read the duty tables DIRECTLY rather than widening
  // hr_team_source — that function is large, shared with other surfaces, and
  // a CREATE OR REPLACE on it risks a ghost overload for a purely additive
  // payload. RLS on both tables already admits exactly hr + principal, which
  // is precisely this route's audience.
  // Pre-0260 DB → leave both keys absent; the card hides and every gate keeps
  // running on the legacy email fallback. The try/catch matters as much as the
  // `.error` checks: this block is a PURELY ADDITIVE extension of an existing
  // payload, so no failure mode of it — error result or thrown — may be
  // allowed to turn a working Team page into a 500.
  try {
    const [duties, grants] = await Promise.all([
      sb.from("org_duties").select("key, name, description, sort").order("sort"),
      sb.from("org_position_duties").select("position_id, duty_key"),
    ]);
    if (!duties.error && !grants.error) {
      source.duties = (duties.data ?? []) as HrTeamSource["duties"];
      source.positionDuties = (grants.data ?? []).map((r) => ({
        positionId: r.position_id as string,
        dutyKey: r.duty_key as string,
      }));
    }
  } catch {
    // Additive payload only — the Team page renders fine without it.
  }

  return c.json(source);
});

/** POST /api/hr/team/position-duty — grant/revoke a duty on a position (0260). */
hrTeamRouter.post("/position-duty", requireHr, async (c) => {
  const parsed = setPositionDutyInput.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    throw new HTTPException(422, { message: parsed.error.issues[0]?.message ?? "invalid body" });
  }
  const sb = userClient(c.env, c.var.auth.jwt);
  const { error } = await sb.rpc("hr_set_position_duty", {
    p_position_id: parsed.data.positionId,
    p_duty_key: parsed.data.dutyKey,
    p_granted: parsed.data.granted,
  });
  if (error) {
    if (error.code === "42501") throw new HTTPException(403, { message: "forbidden" });
    if (error.message.includes("position_not_found")) {
      throw new HTTPException(422, { message: "position not found or retired" });
    }
    if (error.message.includes("duty_not_found")) {
      throw new HTTPException(422, { message: "unknown duty" });
    }
    throw new HTTPException(500, { message: error.message });
  }
  return c.json({ ok: true });
});

/** POST /api/hr/team/position — set/clear a user's registry position (audited). */
hrTeamRouter.post("/position", requireHr, async (c) => {
  const parsed = setTeamPositionInput.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    throw new HTTPException(422, { message: parsed.error.issues[0]?.message ?? "invalid body" });
  }
  const sb = userClient(c.env, c.var.auth.jwt);
  const { error } = await sb.rpc("hr_set_position", {
    p_user_id: parsed.data.userId,
    p_position_id: parsed.data.positionId,
  });
  if (error) {
    if (error.code === "42501") throw new HTTPException(403, { message: "forbidden" });
    if (error.message.includes("user_not_found")) {
      throw new HTTPException(404, { message: "user not found" });
    }
    if (error.message.includes("dealer_not_in_hierarchy")) {
      throw new HTTPException(422, { message: "dealer accounts are outside the hierarchy" });
    }
    if (error.message.includes("position_not_found")) {
      throw new HTTPException(422, { message: "position not found or retired" });
    }
    throw new HTTPException(500, { message: error.message });
  }
  return c.json({ ok: true });
});

/** POST /api/hr/team/reports-to — set/clear the reporting line (cycle-guarded). */
hrTeamRouter.post("/reports-to", requireHr, async (c) => {
  const parsed = setReportsToInput.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    throw new HTTPException(422, { message: parsed.error.issues[0]?.message ?? "invalid body" });
  }
  const sb = userClient(c.env, c.var.auth.jwt);
  const { error } = await sb.rpc("hr_set_reports_to", {
    p_user_id: parsed.data.userId,
    p_manager_id: parsed.data.managerId,
  });
  if (error) {
    if (error.code === "42501") throw new HTTPException(403, { message: "forbidden" });
    if (error.message.includes("user_not_found")) {
      throw new HTTPException(404, { message: "user not found" });
    }
    if (error.message.includes("reports_to_self")) {
      throw new HTTPException(422, { message: "cannot report to oneself" });
    }
    if (error.message.includes("reporting_cycle")) {
      throw new HTTPException(422, { message: "that line would create a cycle" });
    }
    if (error.message.includes("manager_not_found")) {
      throw new HTTPException(422, { message: "manager not found" });
    }
    throw new HTTPException(500, { message: error.message });
  }
  return c.json({ ok: true });
});

/** POST /api/hr/team/staff-code — edit a CRnnn code (cross-table unique, audited). */
hrTeamRouter.post("/staff-code", requireHr, async (c) => {
  const parsed = setStaffCodeInput.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    throw new HTTPException(422, { message: parsed.error.issues[0]?.message ?? "invalid body" });
  }
  const sb = userClient(c.env, c.var.auth.jwt);
  const { error } = await sb.rpc("hr_set_staff_code", {
    p_kind: parsed.data.kind,
    p_id: parsed.data.id,
    p_code: parsed.data.code,
  });
  if (error) {
    if (error.code === "42501") throw new HTTPException(403, { message: "forbidden" });
    if (error.message.includes("staff_code_taken")) {
      throw new HTTPException(422, { message: "staff code already in use" });
    }
    if (error.message.includes("invalid_staff_code")) {
      throw new HTTPException(422, { message: "staff code looks like CR001" });
    }
    if (error.message.includes("not_found")) {
      throw new HTTPException(404, { message: "staff not found" });
    }
    throw new HTTPException(500, { message: error.message });
  }
  return c.json({ ok: true });
});

/** POST /api/hr/team/positions — create / rename / retire a registry position. */
hrTeamRouter.post("/positions", requireHr, async (c) => {
  const parsed = upsertOrgPositionInput.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    throw new HTTPException(422, { message: parsed.error.issues[0]?.message ?? "invalid body" });
  }
  const { id, name, band, sort, active, departmentId } = parsed.data;

  const sb = userClient(c.env, c.var.auth.jwt);
  if (id) {
    const { error } = await sb
      .from("org_positions")
      .update({
        name,
        band,
        ...(sort !== undefined ? { sort } : {}),
        ...(active !== undefined ? { active } : {}),
        ...(departmentId !== undefined ? { department_id: departmentId } : {}),
        updated_by: c.var.auth.id,
      })
      .eq("id", id);
    if (error) {
      if (error.code === "23505") throw new HTTPException(422, { message: "position name already exists" });
      throw new HTTPException(500, { message: error.message });
    }
    return c.json({ ok: true, id });
  }
  const { data, error } = await sb
    .from("org_positions")
    .insert({
      name,
      band,
      sort: sort ?? 0,
      active: active ?? true,
      department_id: departmentId ?? null,
      updated_by: c.var.auth.id,
    })
    .select("id")
    .single();
  if (error) {
    if (error.code === "23505") throw new HTTPException(422, { message: "position name already exists" });
    throw new HTTPException(500, { message: error.message });
  }
  return c.json({ ok: true, id: (data as { id: string }).id }, 201);
});

/** POST /api/hr/team/departments — create / rename / retire a department (0259). */
hrTeamRouter.post("/departments", requireHr, async (c) => {
  const parsed = upsertOrgDepartmentInput.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    throw new HTTPException(422, { message: parsed.error.issues[0]?.message ?? "invalid body" });
  }
  const { id, name, sort, active } = parsed.data;

  const sb = userClient(c.env, c.var.auth.jwt);
  if (id) {
    const { error } = await sb
      .from("org_departments")
      .update({
        name,
        ...(sort !== undefined ? { sort } : {}),
        ...(active !== undefined ? { active } : {}),
        updated_by: c.var.auth.id,
      })
      .eq("id", id);
    if (error) {
      if (error.code === "23505") throw new HTTPException(422, { message: "department name already exists" });
      throw new HTTPException(500, { message: error.message });
    }
    return c.json({ ok: true, id });
  }
  const { data, error } = await sb
    .from("org_departments")
    .insert({ name, sort: sort ?? 0, active: active ?? true, updated_by: c.var.auth.id })
    .select("id")
    .single();
  if (error) {
    if (error.code === "23505") throw new HTTPException(422, { message: "department name already exists" });
    throw new HTTPException(500, { message: error.message });
  }
  return c.json({ ok: true, id: (data as { id: string }).id }, 201);
});

/**
 * POST /api/hr/team/accounts — mint a login account from the Team door.
 * Roles: internal (operation/finance/hr/bd + principal) and external
 * supplier/partner. Dealer + showroom stores are NOT creatable here (Loo:
 * they belong to the Dealers side). role=principal stays principal-only.
 */
hrTeamRouter.post("/accounts", requireHr, async (c) => {
  const parsed = hrCreateTeamAccountInput.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    throw new HTTPException(422, { message: parsed.error.issues[0]?.message ?? "invalid body" });
  }
  const body = parsed.data;
  if (body.role === "principal" && c.var.auth.role !== "principal") {
    throw new HTTPException(403, { message: "only a principal can create principal accounts" });
  }

  const admin = adminClient(c.env);
  const actor = c.var.auth;

  // Email uniqueness upfront — cleaner contract than the generic GoTrue 422.
  const existing = await admin.from("app_users").select("id").eq("email", body.email).maybeSingle();
  if (existing.data) {
    return c.json({ error: "invalid_input", code: "email_in_use", message: "Email already in use" }, 422);
  }

  // Org row for the two external roles (same shape as the Accounts door).
  let supplierId: string | null = null;
  let partnerId: string | null = null;
  if (body.role === "supplier") {
    const ins = await admin
      .from("suppliers")
      .insert({ name: body.companyName!, contact_email: body.email })
      .select("id")
      .single();
    if (ins.error || !ins.data) {
      throw new HTTPException(500, { message: ins.error?.message ?? "suppliers insert failed" });
    }
    supplierId = ins.data.id;
  } else if (body.role === "partner") {
    const ins = await admin
      .from("delivery_partners")
      .insert({ name: body.companyName!, contact: `${body.name} · ${body.email}` })
      .select("id")
      .single();
    if (ins.error || !ins.data) {
      throw new HTTPException(500, { message: ins.error?.message ?? "delivery_partners insert failed" });
    }
    partnerId = ins.data.id;
  }

  const rollbackOrg = async () => {
    if (supplierId) await admin.from("suppliers").delete().eq("id", supplierId);
    if (partnerId) await admin.from("delivery_partners").delete().eq("id", partnerId);
  };

  const appMetadata: Record<string, string> = { role: body.role };
  if (supplierId) appMetadata.supplier_id = supplierId;
  if (partnerId) appMetadata.partner_id = partnerId;

  const created = await admin.auth.admin.createUser({
    email: body.email,
    password: body.tempPassword,
    email_confirm: true,
    app_metadata: appMetadata,
  });
  if (created.error || !created.data?.user) {
    await rollbackOrg();
    throw new HTTPException(500, {
      message: created.error?.message ?? "auth.admin.createUser failed",
    });
  }
  const userId = created.data.user.id;

  // Carres' own team gets the CRnnn code + position + reporting line at hire.
  const internal = isTeamInternalRole(body.role);
  let staffCode: string | null = null;
  let positionName: string | null = null;
  if (internal) {
    const codeRes = await admin.rpc("next_staff_code");
    if (codeRes.error) {
      await admin.auth.admin.deleteUser(userId);
      await rollbackOrg();
      throw new HTTPException(500, { message: codeRes.error.message });
    }
    staffCode = codeRes.data as string;
    if (body.positionId) {
      const pos = await admin
        .from("org_positions")
        .select("name")
        .eq("id", body.positionId)
        .eq("active", true)
        .maybeSingle();
      if (!pos.data) {
        await admin.auth.admin.deleteUser(userId);
        await rollbackOrg();
        throw new HTTPException(422, { message: "position not found or retired" });
      }
      positionName = (pos.data as { name: string }).name;
    }
  }

  const appUserInsert = await admin.from("app_users").insert({
    id: userId,
    email: body.email,
    name: body.name,
    role: body.role,
    title: body.title ?? null,
    status: "active",
    supplier_id: supplierId,
    partner_id: partnerId,
    created_by: actor.id,
    staff_code: staffCode,
    position_id: internal ? (body.positionId ?? null) : null,
    reports_to_user_id: internal ? (body.reportsToUserId ?? null) : null,
  });
  if (appUserInsert.error) {
    await admin.auth.admin.deleteUser(userId);
    await rollbackOrg();
    throw new HTTPException(500, { message: appUserInsert.error.message });
  }

  // 职位更替 record starts at hire — the history is complete from day one.
  if (internal && positionName) {
    await admin.from("org_position_history").insert({
      subject_kind: "hq_user",
      subject_id: userId,
      subject_name: body.name,
      prev_position: null,
      new_position: positionName,
      changed_by: actor.id,
    });
  }

  await admin.from("audit_log").insert({
    role: actor.role,
    actor_text: actor.email,
    action: `Created ${body.role} account · ${body.name} (${body.email})${staffCode ? ` · ${staffCode}` : ""}`,
    ref: userId,
  });

  return c.json(
    { id: userId, email: body.email, name: body.name, role: body.role, staffCode },
    201,
  );
});

/**
 * POST /api/hr/team/showroom-staff — add a floor-staff PIN identity to one of
 * OUR showrooms. Mirrors the POS Add-staff door's rules (showrooms cap at
 * manager; outlet must belong to the store) and mints the CRnnn code.
 */
hrTeamRouter.post("/showroom-staff", requireHr, async (c) => {
  const parsed = hrCreateShowroomStaffInput.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    throw new HTTPException(422, { message: parsed.error.issues[0]?.message ?? "invalid body" });
  }
  const input = parsed.data;
  if (input.staffRole === "principal") {
    throw new HTTPException(403, { message: "Showroom stores cannot have a store principal" });
  }

  const admin = adminClient(c.env);

  const store = await admin
    .from("dealers")
    .select("id, name, channel")
    .eq("id", input.dealerId)
    .maybeSingle();
  if (!store.data) throw new HTTPException(404, { message: "store not found" });
  if ((store.data as { channel: string }).channel !== "showroom") {
    throw new HTTPException(422, { message: "dealer-side staff are not Carres staff" });
  }

  const outletId = input.outletId ?? null;
  if (outletId) {
    const outlet = await admin
      .from("outlets")
      .select("id, dealer_id")
      .eq("id", outletId)
      .maybeSingle();
    if (!outlet.data || (outlet.data as { dealer_id: string }).dealer_id !== input.dealerId) {
      throw new HTTPException(422, { message: "Outlet does not belong to this store" });
    }
  }

  const codeRes = await admin.rpc("next_staff_code");
  if (codeRes.error) throw new HTTPException(500, { message: codeRes.error.message });
  const staffCode = codeRes.data as string;

  const { data, error } = await admin
    .from("salespersons")
    .insert({
      dealer_id: input.dealerId,
      outlet_id: outletId,
      name: input.name,
      phone: input.phone ?? null,
      staff_role: input.staffRole,
      color: input.color ?? null,
      active: true,
      email: input.email ?? null,
      birthday: input.birthday ?? null,
      gender: input.gender ?? null,
      staff_code: staffCode,
    })
    .select("id, name")
    .single();
  if (error) throw new HTTPException(500, { message: error.message });
  const sp = data as { id: string; name: string };

  if (input.pin) {
    const pinRes = await admin.rpc("staff_set_pin", { p_salesperson_id: sp.id, p_pin: input.pin });
    if (pinRes.error) {
      await admin.from("salespersons").delete().eq("id", sp.id);
      throw new HTTPException(500, { message: pinRes.error.message });
    }
  }

  await admin.from("org_position_history").insert({
    subject_kind: "showroom_staff",
    subject_id: sp.id,
    subject_name: input.name,
    prev_position: null,
    new_position: input.staffRole === "manager" ? "Sales Manager" : "Sales Executive",
    changed_by: c.var.auth.id,
  });

  await admin.from("audit_log").insert({
    role: c.var.auth.role,
    actor_text: c.var.auth.email,
    action: `Added showroom staff · ${input.name} (${staffCode}) @ ${(store.data as { name: string }).name}`,
    dealer_id: input.dealerId,
    ref: sp.id,
  });

  return c.json({ id: sp.id, staffCode }, 201);
});

export default hrTeamRouter;

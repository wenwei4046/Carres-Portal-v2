import { Hono } from "hono";
import { z } from "zod";
import { WORKSPACE_DUTY_ASSIGNMENTS, WORKSPACE_DUTY_COVERS } from "@carres/shared/tables";
import { WORKSPACE_SCOPED_RPCS } from "@carres/shared/workspace-duty";
import {
  workspaceAssignDutyInput,
  workspaceCoverDutyInput,
} from "@carres/shared";
import { requireOperation } from "../../lib/auth-guards";
import { mapPgError, parseJsonBody } from "../../lib/route-helpers";
import { userClient } from "../../lib/supabase";
import type { AppEnv } from "../../types";

/**
 * /api/operation/workspace-duties — `Workspace → Staff & Duties` (0425).
 *
 * The ONE company-wide duty assignment door (workspace/MASTER.md, LOCKED
 * 2026-09-03; ERP-ARCHITECTURE Law F.1). This router is thin on purpose:
 * every rule — manager gate, active-staff check, no self-assignment, cover
 * needs a holder — lives in the SQL doors, and the page consumes the ONE
 * resolver's answer. No rota is read anywhere.
 *
 *   GET  /            the duty catalogue this surface manages, each with its
 *                     resolution today, its assignment history and its
 *                     covers; plus `can_assign` (the same gate the write
 *                     doors raise, as a fact — the page never offers a
 *                     control the server would refuse)
 *   POST /assign      one primary holder, effective-dated
 *   POST /cover       one dated buddy cover
 */
const workspaceDutiesRouter = new Hono<AppEnv>();

/** The duties this surface manages today. A new duty joins by adding a row
 *  here AND its consumer module — never by a module keeping its own list. */
const DUTIES = [
  { key: "po_duty", label: "PO Duty" },
  { key: "grn_duty", label: "GRN Duty" },
  { key: "payment_duty", label: "Payment Duty" },
  { key: "storage_waiver_approver", label: "Storage Waiver Approver" },
  { key: "purchasing_approver", label: "Purchasing Approver" },
  { key: "delivery_charge_approver", label: "Delivery Charge Approver" },
  { key: "payment_approver", label: "Payment Approver" },
  { key: "stock_adjustment_approver", label: "Stock Adjustment Approver" },
  { key: "service_case_approver", label: "Service Case Approver" },
] as const;

workspaceDutiesRouter.get("/", requireOperation, async (c) => {
  const query = z.object({ siteId: z.string().uuid().optional() }).safeParse(c.req.query());
  if (!query.success) return c.json({ error: "Choose a valid Site." }, 400);
  const siteId = query.data.siteId;
  const sb = userClient(c.env, c.var.auth.jwt);
  const sites = await sb.from("warehouses").select("id, name").eq("kind", "own").order("name");
  if (sites.error) { const m = mapPgError(sites.error); return c.json(m.body, m.status); }
  const site = siteId ? (sites.data ?? []).find((s) => s.id === siteId) : undefined;
  if (siteId && !site) return c.json({ error: "Choose a Carres Site." }, 400);
  const duties: Array<{ key: string; label: string; siteId?: string }> = [...DUTIES];
  if (siteId) duties.push({ key: "showroom_duty", label: "Showroom Duty", siteId });

  const [canAssignRes, assignments, covers] = await Promise.all([
    sb.rpc("workspace_can_assign_duties"),
    sb
      .from(WORKSPACE_DUTY_ASSIGNMENTS)
      .select(
        "id, duty_key, site_id, holder_id, effective_from, effective_until, assigned_by, note, created_at",
      )
      .or(siteId ? `site_id.is.null,site_id.eq.${siteId}` : "site_id.is.null")
      .order("effective_from", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(200),
    sb
      .from(WORKSPACE_DUTY_COVERS)
      .select(
        "id, duty_key, site_id, normal_user_id, acting_user_id, starts_on, ends_on, reason, assigned_by, created_at",
      )
      .or(siteId ? `site_id.is.null,site_id.eq.${siteId}` : "site_id.is.null")
      .order("starts_on", { ascending: false })
      .limit(200),
  ]);
  if (assignments.error) {
    const m = mapPgError(assignments.error);
    return c.json(m.body, m.status);
  }
  if (covers.error) {
    const m = mapPgError(covers.error);
    return c.json(m.body, m.status);
  }
  // A broken gate must not impersonate a non-manager (fail-closed is safe,
  // but indistinguishable) — a gate ERROR is surfaced as the failure it is.
  if (canAssignRes.error) {
    const m = mapPgError(canAssignRes.error);
    return c.json(m.body, m.status);
  }
  const canAssign = canAssignRes.data;

  const resolutions: Record<string, unknown> = {};
  for (const d of duties) {
    const { data, error } = await sb.rpc(d.siteId ? WORKSPACE_SCOPED_RPCS.resolve : "workspace_resolve_duty", {
      p_duty_key: d.key,
      p_on: null,
      ...(d.siteId ? { p_site_id: d.siteId } : {}),
    });
    if (error) {
      const m = mapPgError(error);
      return c.json(m.body, m.status);
    }
    if (!data || typeof data !== "object") {
      return c.json({ error: "The Duty could not be loaded. Try again." }, 502);
    }
    resolutions[d.key] = data;
  }

  // Names resolved once, for every id on the page.
  const ids = [
    ...new Set(
      [
        ...(assignments.data ?? []).flatMap((a) => [a.holder_id, a.assigned_by]),
        ...(covers.data ?? []).flatMap((v) => [
          v.normal_user_id,
          v.acting_user_id,
          v.assigned_by,
        ]),
        ...Object.values(resolutions).flatMap((r) => {
          const j = r as Record<string, unknown>;
          return [j.normal_user_id, j.acting_user_id];
        }),
      ].filter((v): v is string => typeof v === "string" && v.length > 0),
    ),
  ];
  const names = new Map<string, string>();
  if (ids.length > 0) {
    const { data: users, error: namesError } = await sb
      .from("app_users")
      .select("id, name")
      .in("id", ids);
    if (namesError) { const m = mapPgError(namesError); return c.json(m.body, m.status); }
    for (const u of users ?? []) names.set(u.id as string, u.name as string);
  }
  const name = (v: unknown) =>
    typeof v === "string" && v.length > 0 ? (names.get(v) ?? null) : null;

  const eligible = siteId ? await sb.from("app_users")
    .select("id, name, email").eq("status", "active").neq("role", "dealer").order("name") : null;
  if (eligible?.error) { const m = mapPgError(eligible.error); return c.json(m.body, m.status); }
  return c.json({
    sites: sites.data ?? [],
    site_staff: (eligible?.data ?? []).map((u) => ({ user_id: u.id, name: u.name, email: u.email })),
    can_assign: canAssign === true,
    duties: duties.map((d) => {
      const r = resolutions[d.key] as Record<string, unknown>;
      return {
        key: d.key,
        label: d.label,
        site_id: d.siteId ?? null,
        site_name: d.siteId ? site?.name : null,
        resolution: {
          ...r,
          normal_user_name: name(r?.normal_user_id),
          acting_user_name: name(r?.acting_user_id),
        },
        assignments: (assignments.data ?? [])
          .filter((a) => a.duty_key === d.key && (a.site_id ?? null) === (d.siteId ?? null))
          .map((a) => ({
            ...a,
            holder_name: name(a.holder_id),
            assigned_by_name: name(a.assigned_by),
          })),
        covers: (covers.data ?? [])
          .filter((v) => v.duty_key === d.key && (v.site_id ?? null) === (d.siteId ?? null))
          .map((v) => ({
            ...v,
            normal_user_name: name(v.normal_user_id),
            acting_user_name: name(v.acting_user_id),
            assigned_by_name: name(v.assigned_by),
          })),
      };
    }),
  });
});

workspaceDutiesRouter.post("/assign", requireOperation, async (c) => {
  const parsed = await parseJsonBody(c, workspaceAssignDutyInput);
  if (!parsed.ok) return c.json(parsed.body, parsed.status);
  const sb = userClient(c.env, c.var.auth.jwt);
  const { data, error } = await sb.rpc(parsed.data.siteId ? WORKSPACE_SCOPED_RPCS.assign : "workspace_assign_duty", {
    p_duty_key: parsed.data.dutyKey,
    p_holder_id: parsed.data.holderId,
    p_effective_from: parsed.data.effectiveFrom,
    p_effective_until: parsed.data.effectiveUntil ?? null,
    p_note: parsed.data.note ?? null,
    ...(parsed.data.siteId ? { p_site_id: parsed.data.siteId } : {}),
  });
  if (error) {
    const m = mapPgError(error);
    return c.json(m.body, m.status);
  }
  return c.json(data ?? {}, 201);
});

workspaceDutiesRouter.post("/cover", requireOperation, async (c) => {
  const parsed = await parseJsonBody(c, workspaceCoverDutyInput);
  if (!parsed.ok) return c.json(parsed.body, parsed.status);
  const sb = userClient(c.env, c.var.auth.jwt);
  const { data, error } = await sb.rpc(parsed.data.siteId ? WORKSPACE_SCOPED_RPCS.cover : "workspace_cover_duty", {
    p_duty_key: parsed.data.dutyKey,
    p_acting_user_id: parsed.data.actingUserId,
    p_starts_on: parsed.data.startsOn,
    p_ends_on: parsed.data.endsOn,
    p_reason: parsed.data.reason ?? null,
    ...(parsed.data.siteId ? { p_site_id: parsed.data.siteId } : {}),
  });
  if (error) {
    const m = mapPgError(error);
    return c.json(m.body, m.status);
  }
  return c.json(data ?? {}, 201);
});

export default workspaceDutiesRouter;

import { Hono } from "hono";
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
const DUTIES = [{ key: "grn_duty", label: "GRN Duty" }] as const;

workspaceDutiesRouter.get("/", requireOperation, async (c) => {
  const sb = userClient(c.env, c.var.auth.jwt);

  const [canAssignRes, assignments, covers] = await Promise.all([
    sb.rpc("workspace_can_assign_duties"),
    sb
      .from("workspace_duty_assignments")
      .select(
        "id, duty_key, holder_id, effective_from, effective_until, assigned_by, note, created_at",
      )
      .order("effective_from", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(200),
    sb
      .from("workspace_duty_covers")
      .select(
        "id, duty_key, normal_user_id, acting_user_id, starts_on, ends_on, reason, assigned_by, created_at",
      )
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
  for (const d of DUTIES) {
    const { data, error } = await sb.rpc("workspace_resolve_duty", {
      p_duty_key: d.key,
      p_on: null,
    });
    if (error) {
      const m = mapPgError(error);
      return c.json(m.body, m.status);
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
    const { data: users } = await sb
      .from("app_users")
      .select("id, name")
      .in("id", ids);
    for (const u of users ?? []) names.set(u.id as string, u.name as string);
  }
  const name = (v: unknown) =>
    typeof v === "string" && v.length > 0 ? (names.get(v) ?? null) : null;

  return c.json({
    can_assign: canAssign === true,
    duties: DUTIES.map((d) => {
      const r = resolutions[d.key] as Record<string, unknown>;
      return {
        key: d.key,
        label: d.label,
        resolution: {
          ...r,
          normal_user_name: name(r?.normal_user_id),
          acting_user_name: name(r?.acting_user_id),
        },
        assignments: (assignments.data ?? [])
          .filter((a) => a.duty_key === d.key)
          .map((a) => ({
            ...a,
            holder_name: name(a.holder_id),
            assigned_by_name: name(a.assigned_by),
          })),
        covers: (covers.data ?? [])
          .filter((v) => v.duty_key === d.key)
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
  const { data, error } = await sb.rpc("workspace_assign_duty", {
    p_duty_key: parsed.data.dutyKey,
    p_holder_id: parsed.data.holderId,
    p_effective_from: parsed.data.effectiveFrom,
    p_effective_until: parsed.data.effectiveUntil ?? null,
    p_note: parsed.data.note ?? null,
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
  const { data, error } = await sb.rpc("workspace_cover_duty", {
    p_duty_key: parsed.data.dutyKey,
    p_acting_user_id: parsed.data.actingUserId,
    p_starts_on: parsed.data.startsOn,
    p_ends_on: parsed.data.endsOn,
    p_reason: parsed.data.reason ?? null,
  });
  if (error) {
    const m = mapPgError(error);
    return c.json(m.body, m.status);
  }
  return c.json(data ?? {}, 201);
});

export default workspaceDutiesRouter;

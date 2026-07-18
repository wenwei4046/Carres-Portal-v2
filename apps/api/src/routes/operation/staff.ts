import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import {
  updateOpsStaffSettingInput,
  isOpsManager,
  distributeOrders,
  seenTodayMYT,
  type OpsStaffMember,
} from "@carres/shared";
import { mapPgError } from "../../lib/route-helpers";
import { userClient } from "../../lib/supabase";
import type { AppEnv } from "../../types";

/**
 * Staff assignment pool (migration 0232, Jess model B 2026-07-18).
 *
 *   GET /api/operation/staff          — active operation accounts + pool state
 *   PUT /api/operation/staff/:userId  — upsert pool membership / availability
 *
 * The pool is OPT-IN: only accounts with an ops_staff_settings row receive
 * auto-assignments (keeps generic accounts like logistics@ out by default).
 * available=false = temporarily away (MC / leave) — new orders skip them;
 * their existing orders move only via an explicit human redistribute (the
 * client computes the plan with the shared `distributeOrders` and writes it
 * through the normal per-order control PUT — audit-stamped per order).
 * Visibility is never gated by any of this. userClient/RLS is the boundary
 * (ops_staff_settings = operation+principal ALL, mirrors ops_tasks).
 */
const staffRouter = new Hono<AppEnv>();

const USER_ID = z.string().uuid();

function requireOperationOrPrincipal(
  role: string,
): asserts role is "operation" | "principal" {
  if (role !== "operation" && role !== "principal") {
    throw new HTTPException(403, { message: "Operation or principal only" });
  }
}

// GET / — every ACTIVE operation account, joined with its pool settings.
staffRouter.get("/", async (c) => {
  const auth = c.var.auth;
  requireOperationOrPrincipal(auth.role);
  const sb = userClient(c.env, auth.jwt);

  const [users, settings] = await Promise.all([
    sb
      .from("app_users")
      .select("id, email, name, status, last_seen_at")
      .eq("role", "operation")
      .order("email"),
    sb.from("ops_staff_settings").select("user_id, available, note"),
  ]);
  if (users.error) {
    const m = mapPgError(users.error);
    return c.json(m.body, m.status);
  }
  if (settings.error) {
    const m = mapPgError(settings.error);
    return c.json(m.body, m.status);
  }

  const byId = new Map(
    (settings.data ?? []).map((s) => [s.user_id as string, s]),
  );
  const staff: OpsStaffMember[] = (users.data ?? [])
    // Disabled accounts drop out of the pool automatically (resign = disable).
    .filter((u) => (u.status ?? "active") === "active")
    .map((u) => {
      const s = byId.get(u.id as string);
      return {
        user_id: u.id as string,
        email: (u.email as string) ?? "",
        name: (u.name as string | null) ?? null,
        pooled: !!s,
        available: !!s && s.available !== false,
        note: (s?.note as string | null) ?? null,
        last_seen_at: (u.last_seen_at as string | null) ?? null,
      };
    });

  return c.json({ staff });
});

// POST /heartbeat — stamp the CALLER's own last_seen_at via the 0235 DEFINER
// RPC (presence: opened the portal today = available for auto-assign).
staffRouter.post("/heartbeat", async (c) => {
  const auth = c.var.auth;
  requireOperationOrPrincipal(auth.role);
  const sb = userClient(c.env, auth.jwt);
  const { error } = await sb.rpc("touch_last_seen");
  if (error) {
    const m = mapPgError(error);
    return c.json(m.body, m.status);
  }
  return c.json({ ok: true });
});

// POST /auto-assign — SERVER-SIDE sweep (Jess go-live feedback 2026-07-18):
// any operation session may trigger it (the assignment PLAN is computed here,
// so staff can't game it — the manager-only gate stays on MANUAL PUTs). The
// staff member opening the portal is what makes them "in today", so the sweep
// runs right after their own heartbeat: goods land the moment they show up,
// no manager session needed.
//
// Stamps the caller first (heartbeat), then distributes every OPEN unassigned
// order across the pool members seen today (least-loaded, deterministic).
// assigned_by stays NULL = system.
staffRouter.post("/auto-assign", async (c) => {
  const auth = c.var.auth;
  requireOperationOrPrincipal(auth.role);
  const sb = userClient(c.env, auth.jwt);

  // 1) The caller counts as present from this very call.
  await sb.rpc("touch_last_seen");

  // 2) Pool members available + seen today (MYT).
  const [users, settings] = await Promise.all([
    sb
      .from("app_users")
      .select("id, status, last_seen_at")
      .eq("role", "operation"),
    sb.from("ops_staff_settings").select("user_id, available"),
  ]);
  if (users.error) {
    const m = mapPgError(users.error);
    return c.json(m.body, m.status);
  }
  if (settings.error) {
    const m = mapPgError(settings.error);
    return c.json(m.body, m.status);
  }
  const userById = new Map((users.data ?? []).map((u) => [u.id as string, u]));
  const availIds = (settings.data ?? [])
    .filter((s) => s.available !== false)
    .map((s) => s.user_id as string)
    .filter((id) => {
      const u = userById.get(id);
      return (
        !!u &&
        (u.status ?? "active") === "active" &&
        seenTodayMYT(u.last_seen_at as string | null)
      );
    });
  if (availIds.length === 0) return c.json({ assigned: 0, reason: "no_staff_in" });

  // 3) OPEN orders (mirrors the list's controlTabOf: delivered stage/status =
  //    closed) + their current owner.
  const { data: orders, error: ordErr } = await sb
    .from("orders")
    .select("id, status, operation_stage, ops_order_control(assigned_staff)")
    .neq("status", "cancelled");
  if (ordErr) {
    const m = mapPgError(ordErr);
    return c.json(m.body, m.status);
  }
  const ownerOf = (o: {
    ops_order_control?: { assigned_staff?: string | null }[] | { assigned_staff?: string | null } | null;
  }): string | null => {
    const raw = o.ops_order_control;
    const ovl = Array.isArray(raw) ? raw[0] : raw;
    return (ovl?.assigned_staff as string | null) ?? null;
  };
  const open = (orders ?? []).filter(
    (o) => o.operation_stage !== "delivered" && o.status !== "delivered",
  );
  const unassigned = open.filter((o) => !ownerOf(o));
  if (unassigned.length === 0) return c.json({ assigned: 0, reason: "none_open" });

  // 4) Least-loaded plan from current open counts.
  const loads = availIds.map((userId) => ({
    userId,
    openCount: open.filter((o) => ownerOf(o) === userId).length,
  }));
  const plan = distributeOrders(
    unassigned.map((o) => o.id as string),
    loads,
  );

  // 5) Write in chunks; assigned_by NULL = system auto-assign.
  const nowIso = new Date().toISOString();
  let assigned = 0;
  for (let i = 0; i < plan.length; i += 25) {
    const chunk = plan.slice(i, i + 25);
    const { error } = await sb.from("ops_order_control").upsert(
      chunk.map((p) => ({
        order_id: p.orderId,
        assigned_staff: p.userId,
        assigned_by: null,
        assigned_at: nowIso,
        updated_by: auth.id,
      })),
      { onConflict: "order_id" },
    );
    if (!error) assigned += chunk.length;
  }
  return c.json({ assigned });
});

// PUT /:userId — upsert pool membership. pooled:false deletes the row.
// MANAGEMENT-ONLY (Jess 2026-07-18): staff sessions read the pool, never
// manage it.
staffRouter.put("/:userId", async (c) => {
  const auth = c.var.auth;
  requireOperationOrPrincipal(auth.role);
  if (!isOpsManager(auth.role, auth.email)) {
    throw new HTTPException(403, {
      message: "Only management can manage the assignment pool",
    });
  }

  const idCheck = USER_ID.safeParse(c.req.param("userId"));
  if (!idCheck.success) throw new HTTPException(404, { message: "User not found" });

  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    throw new HTTPException(400, { message: "Body must be valid JSON" });
  }
  const parsed = updateOpsStaffSettingInput.safeParse(body);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return c.json(
      {
        error: "invalid_input",
        code: "invalid_param",
        message: `Invalid staff setting: ${issue?.message ?? "validation failed"}`,
      },
      422,
    );
  }

  const sb = userClient(c.env, auth.jwt);
  if (!parsed.data.pooled) {
    const { error } = await sb
      .from("ops_staff_settings")
      .delete()
      .eq("user_id", idCheck.data);
    if (error) {
      const m = mapPgError(error);
      return c.json(m.body, m.status);
    }
    return c.json({ ok: true, pooled: false });
  }

  const { error } = await sb.from("ops_staff_settings").upsert(
    {
      user_id: idCheck.data,
      available: parsed.data.available ?? true,
      note: parsed.data.note ?? null,
      updated_at: new Date().toISOString(),
      updated_by: auth.id,
    },
    { onConflict: "user_id" },
  );
  if (error) {
    const m = mapPgError(error);
    return c.json(m.body, m.status);
  }
  return c.json({ ok: true, pooled: true });
});

export default staffRouter;

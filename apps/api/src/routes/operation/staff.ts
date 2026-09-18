import { Hono, type Context } from "hono";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import {
  updateOpsStaffSettingInput,
  isOpsGenericAccount,
  planOpsAssignment,
  workspaceDutyRolesOf,
  type OpsStaffMember,
} from "@carres/shared";
import { dutyHolders, hasDuty, myDuties, requireDuty } from "../../lib/duties";
import { fail } from "../../lib/route-helpers";
import { userClient } from "../../lib/supabase";
import type { AppEnv } from "../../types";

/**
 * Staff assignment pool (migration 0232, Jess model B 2026-07-18).
 *
 *   GET /api/operation/staff          — active operation accounts + pool state
 *   PUT /api/operation/staff/:userId  — upsert pool membership / availability
 *
 * The pool is OPT-IN: only accounts with an ops_staff_settings row are dealt
 * orders, and since 0504 only INDIVIDUALS may be in it — an account with a
 * People record (`staff_code`). A shared login or a robot account records
 * evidence and never carries a customer.
 * available=false = temporarily away (MC / planned leave) — new orders skip
 * them; their existing orders NEVER move, because responsibility is stable:
 * the away day is covered by today's acting person
 * (`delivery_responsible_operation`, 0504), and a permanent change is the
 * formal handover. Visibility is never gated by any of this. userClient/RLS is
 * the boundary (ops_staff_settings = operation+principal ALL, mirrors
 * ops_tasks).
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
// GET /?duty=<key> — the Staff & Duties pickers for that duty. A duty whose
// catalogue entry names other roles (Finance Approver: finance) gets those
// accounts from workspace_duty_staff (0514), which only a duty manager may
// call; every other duty gets the operation list below, unchanged.
staffRouter.get("/", async (c) => {
  const auth = c.var.auth;
  requireOperationOrPrincipal(auth.role);
  const sb = userClient(c.env, auth.jwt);

  const dutyKey = c.req.query("duty") ?? "";
  const roles = workspaceDutyRolesOf(dutyKey);
  if (roles.join() !== "operation") {
    const { data, error } = await sb.rpc("workspace_duty_staff", {
      p_roles: roles,
    });
    if (error) return fail(c, error);
    const staff: OpsStaffMember[] = (
      (data ?? []) as { id: string; name: string | null; email: string | null }[]
    ).map((u) => ({
      user_id: u.id,
      email: u.email ?? "",
      name: u.name ?? null,
      pooled: false,
      available: false,
      note: null,
      last_seen_at: null,
      duties: [],
    }));
    return c.json({ staff, myDuties: [] });
  }

  const [users, settings] = await Promise.all([
    sb
      .from("app_users")
      .select("id, email, name, status, staff_code, last_seen_at")
      .eq("role", "operation")
      .order("email"),
    sb.from("ops_staff_settings").select("user_id, available, note"),
  ]);
  if (users.error) return fail(c, users.error);
  if (settings.error) return fail(c, settings.error);

  const byId = new Map(
    (settings.data ?? []).map((s) => [s.user_id as string, s]),
  );
  // HR-P2 (0260): duties ride this payload so the pool filter can ask "is this
  // OTHER person a manager?" — a per-row question `my_org_duties()` is
  // self-only and cannot answer. Both reads fail soft to empty, which hands
  // the decision back to the legacy email list during the transition.
  const [holders, mine] = await Promise.all([dutyHolders(c), myDuties(c)]);

  const staff: OpsStaffMember[] = (users.data ?? [])
    // Disabled accounts drop out of the pool automatically (resign = disable).
    .filter((u) => (u.status ?? "active") === "active")
    // A duty picker (S2-A) offers individuals only: a People record with a
    // staff_code, as 0504 requires of anyone who carries responsibility. A
    // shared login or a test robot records evidence and never holds a duty.
    .filter((u) => !dutyKey || u.staff_code != null)
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
        duties: [...(holders[u.id as string] ?? [])],
      };
    });

  return c.json({ staff, myDuties: [...mine] });
});

/** AUTO-ENROLL (Jess round-4, 2026-07-18: "i already created account — once
 *  she log in - system only detect?"): a plain-staff operation account joins
 *  the assignment pool automatically on its FIRST login — creating the
 *  account is the only admin step. Managers never auto-join. Row-exists =
 *  enrolled; the away toggle handles temporary outs; offboarding = disable
 *  the account.
 *  HR-P2 (0260): "manager" = the `ops_manager` duty on the caller's position,
 *  which is why this now takes the request context — the check is a DB read,
 *  not a string compare. */
async function autoEnroll(
  c: Context<AppEnv>,
  sb: ReturnType<typeof userClient>,
) {
  const auth = c.var.auth;
  if (auth.role !== "operation") return;
  if (await hasDuty(c, "ops_manager")) return;
  // Generic (non-person) accounts never auto-join — a login on logistics@
  // must not start swallowing orders (round-4 intent made explicit).
  if (isOpsGenericAccount(auth.email)) return;
  // 0504 — AND the real test of a person is the People record, not the email
  // spelling: only an account with a `staff_code` carries responsibility for a
  // customer. The email heuristic above let `operation-test@x.com` into the
  // pool, where it collected 100 orders nobody was answerable for.
  const { data: me } = await sb
    .from("app_users")
    .select("staff_code")
    .eq("id", auth.id)
    .maybeSingle();
  if (!me || me.staff_code == null) return;
  const { data: existing } = await sb
    .from("ops_staff_settings")
    .select("user_id")
    .eq("user_id", auth.id)
    .maybeSingle();
  if (!existing) {
    await sb
      .from("ops_staff_settings")
      .insert({ user_id: auth.id, available: true });
  }
}

// POST /heartbeat — stamp the CALLER's own last_seen_at via the 0235 DEFINER
// RPC (presence: opened the portal today = in) + first-login auto-enroll.
staffRouter.post("/heartbeat", async (c) => {
  const auth = c.var.auth;
  requireOperationOrPrincipal(auth.role);
  const sb = userClient(c.env, auth.jwt);
  const { error } = await sb.rpc("touch_last_seen");
  if (error) return fail(c, error);
  await autoEnroll(c, sb);
  return c.json({ ok: true });
});

// POST /auto-assign — SERVER-SIDE sweep (Jess go-live feedback 2026-07-18):
// any operation session may trigger it (the assignment PLAN is computed here,
// so staff can't game it — the manager-only gate stays on MANUAL PUTs).
//
// 0504 — THE DEAL IS ONCE, AND IT STICKS (owner ruling 2026-09-13). A Sales
// Order is dealt to ONE individual when it enters Operations and stays with
// that person: they carry the customer follow-up, the balance and the storage
// collection. The sweep therefore deals only orders that have NO responsible
// person yet; it never re-spreads an order that already has one.
//
// What changed, and why: the sweep used to re-split every SYSTEM-assigned open
// order across whoever was IN today, on every run. That made `assigned_staff`
// an actor of the day rather than a stable owner — the exact opposite of the
// owner's rule — and absence was expressed as a reassignment. Absence is now
// COVER: `delivery_responsible_operation` (0504) names today's acting person
// when the responsible one is away, and the order never moves.
//
// Who may be dealt an order: an ACTIVE INDIVIDUAL (a People record with a
// `staff_code`) who is in the pool and not on planned leave. Presence is NOT a
// condition — responsibility is durable and today's absence is covered, not
// redistributed. A shared login or a robot account may record evidence and
// never owns.
staffRouter.post("/auto-assign", async (c) => {
  const auth = c.var.auth;
  requireOperationOrPrincipal(auth.role);
  const sb = userClient(c.env, auth.jwt);

  // 1) The caller counts as present from this very call — and a first-login
  //    staff enrolls right here, so her very first page load already deals
  //    her a share (no race with the heartbeat).
  await sb.rpc("touch_last_seen");
  await autoEnroll(c, sb);

  // 2) Who may be dealt an order (0504): pool members who are ACTIVE
  //    INDIVIDUALS and not on planned leave. `available=false` is the
  //    person-level leave flag — new orders skip them, exactly as before.
  //    Today's heartbeat no longer decides ownership; it decides who ACTS
  //    (the cover rule inside `delivery_responsible_operation`).
  const [users, settings] = await Promise.all([
    sb
      .from("app_users")
      .select("id, status, last_seen_at, staff_code")
      .eq("role", "operation"),
    sb.from("ops_staff_settings").select("user_id, available"),
  ]);
  if (users.error) return fail(c, users.error);
  if (settings.error) return fail(c, settings.error);
  const userById = new Map((users.data ?? []).map((u) => [u.id as string, u]));
  /** An account that may CARRY a customer: active, and a People record with a
   *  staff_code. A shared login or a robot account never owns (0504). */
  const mayOwn = (id: string | null | undefined): boolean => {
    if (!id) return false;
    const u = userById.get(id);
    return !!u && (u.status ?? "active") === "active" && u.staff_code != null;
  };
  const availIds = (settings.data ?? [])
    .filter((s) => s.available !== false)
    .map((s) => s.user_id as string)
    .filter(mayOwn);
  if (availIds.length === 0) return c.json({ assigned: 0, reason: "no_staff" });

  // 3) OPEN orders (mirrors the list's controlTabOf: delivered stage/status =
  //    closed) + their current owner AND how they got it.
  const { data: orders, error: ordErr } = await sb
    .from("orders")
    .select(
      "id, status, operation_stage, ops_order_control(assigned_staff, assigned_by)",
    )
    .neq("status", "cancelled");
  if (ordErr) return fail(c, ordErr);
  type Ovl = { assigned_staff?: string | null; assigned_by?: string | null };
  const ovlOf = (o: { ops_order_control?: Ovl[] | Ovl | null }): Ovl | null => {
    const raw = o.ops_order_control;
    return (Array.isArray(raw) ? raw[0] : raw) ?? null;
  };
  const open = (orders ?? []).filter(
    (o) => o.operation_stage !== "delivered" && o.status !== "delivered",
  );

  // 4) DEAL WHAT NOBODY CARRIES (0504) — the arithmetic is the shared
  //    `planOpsAssignment`, so the rule has exactly one implementation.
  const candidates = open.map((o) => ({
    orderId: o.id as string,
    assignedStaff: ovlOf(o)?.assigned_staff ?? null,
    assignedBy: ovlOf(o)?.assigned_by ?? null,
  }));
  const plan = planOpsAssignment(candidates, availIds, mayOwn);
  if (plan.length === 0) return c.json({ assigned: 0, reason: "none_open" });

  // 5) Write only the CHANGES; assigned_by NULL = system auto-assign.
  const currentOwner = new Map(
    candidates.map((o) => [o.orderId, o.assignedStaff]),
  );
  const changes = plan.filter((p) => currentOwner.get(p.orderId) !== p.userId);
  const nowIso = new Date().toISOString();
  let assigned = 0;
  for (let i = 0; i < changes.length; i += 25) {
    const chunk = changes.slice(i, i + 25);
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
  // HR-P2 (0260): "management" is now the `ops_manager` duty key on the
  // caller's position, not an email list.
  await requireDuty(c, "ops_manager", "Only management can manage the assignment pool");

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
    if (error) return fail(c, error);
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
  if (error) return fail(c, error);
  return c.json({ ok: true, pooled: true });
});

export default staffRouter;

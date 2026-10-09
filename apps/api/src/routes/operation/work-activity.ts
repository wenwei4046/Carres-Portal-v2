import { Hono } from "hono";
import {
  TEAM_ONLINE_MINUTES,
  teamMemberState,
  teamTodayResponseSchema,
  workspaceActivitySettingsInput,
  workspaceActivitySettingsResponseSchema,
  workspaceActivityTimesFit,
  workspaceStaffLunchInput,
  workspaceStaffLunchSchema,
  type WorkspaceActivityOfficeHours,
} from "@carres/shared";
import { requireOperation } from "../../lib/auth-guards";
import { readOfficeCalendar } from "../../lib/office-calendar";
import { requireSettingsEditor } from "../../lib/settings-editor";
import { mapPgError, parseJsonBody } from "../../lib/route-helpers";
import { userClient } from "../../lib/supabase";
import type { AppEnv } from "../../types";

const router = new Hono<AppEnv>();
function settings(row: Record<string, unknown>, canEdit: boolean, office: WorkspaceActivityOfficeHours) {
  return workspaceActivitySettingsResponseSchema.parse({
    morning: typeof row.morning === "string" ? row.morning.slice(0, 5) : null,
    afternoon: typeof row.afternoon === "string" ? row.afternoon.slice(0, 5) : null,
    revision: row.revision,
    canEdit,
    office,
  });
}
/* The Office hours the check times must fit (Settings → Office, 0669), read
   through the ONE Office calendar reader. The SQL door re-reads the stored row
   itself, so a fallback here can only refuse early, never accept wrongly. */
async function officeHours(sb: Parameters<typeof readOfficeCalendar>[0]): Promise<WorkspaceActivityOfficeHours> {
  const { calendar } = await readOfficeCalendar(sb);
  return { start: calendar.start, end: calendar.end, lunchStart: calendar.lunchStart, lunchEnd: calendar.lunchEnd };
}
router.get("/settings", requireOperation, async (c) => {
  const sb = userClient(c.env, c.var.auth.jwt);
  const [read, gate, office] = await Promise.all([
    sb.from("workspace_activity_settings").select("morning, afternoon, revision").eq("id", 1).single(),
    sb.rpc("workspace_can_assign_duties"),
    officeHours(sb),
  ]);
  if (read.error || gate.error) {
    const mapped = mapPgError((read.error ?? gate.error)!);
    return c.json(mapped.body, mapped.status);
  }
  // Never silently substitute defaults for missing persisted configuration.
  try { return c.json(settings(read.data, gate.data === true, office)); }
  catch { return c.json({ error: "settings_unavailable", code: "settings_unavailable" }, 503); }
});
router.put("/settings", requireOperation, requireSettingsEditor("staff_duties"), async (c) => {
  const parsed = await parseJsonBody(c, workspaceActivitySettingsInput);
  if (!parsed.ok) return c.json(parsed.body, parsed.status);
  const { morning, afternoon, revision } = parsed.data;
  const sb = userClient(c.env, c.var.auth.jwt);
  const office = await officeHours(sb);
  if (!workspaceActivityTimesFit({ morning, afternoon }, office)) {
    return c.json({ error: "invalid_input", code: "invalid_check_times",
      message: "The morning check is from Office start and before lunch; the afternoon check is after lunch and before Office end." }, 422);
  }
  const { data, error } = await sb.rpc("workspace_set_activity_times", {
    p_morning: morning, p_afternoon: afternoon, p_revision: revision,
  });
  if (error) {
    if (error.details === "settings_changed") return c.json({ error: "settings_changed", code: "settings_changed" }, 409);
    const mapped = mapPgError(error);
    return c.json(mapped.body, mapped.status);
  }
  return c.json(settings(data as Record<string, unknown>, true, office));
});
/* GET/PUT /lunch — Settings → Personal → Lunch time (owner order 9 Oct 2026,
 * 0677). The database computes every time (the one lunch and window
 * arithmetic) and decides who may change whose lunch: the person, or a
 * Staff & Duties editor for anyone. */
router.get("/lunch", requireOperation, async (c) => {
  const sb = userClient(c.env, c.var.auth.jwt);
  const { data, error } = await sb.rpc("workspace_staff_lunch_view", { p_user: c.var.auth.id });
  if (error) {
    const mapped = mapPgError(error);
    return c.json(mapped.body, mapped.status);
  }
  const view = workspaceStaffLunchSchema.safeParse(data);
  if (!view.success) return c.json({ error: "lunch_unavailable", code: "lunch_unavailable" }, 503);
  return c.json(view.data);
});
router.put("/lunch", requireOperation, async (c) => {
  const parsed = await parseJsonBody(c, workspaceStaffLunchInput);
  if (!parsed.ok) return c.json(parsed.body, parsed.status);
  const sb = userClient(c.env, c.var.auth.jwt);
  const { data, error } = await sb.rpc("workspace_set_staff_lunch", {
    p_user: parsed.data.userId ?? c.var.auth.id,
    p_lunch_start: parsed.data.lunchStart,
  });
  if (error) {
    const mapped = mapPgError(error);
    return c.json(mapped.body, mapped.status);
  }
  const view = workspaceStaffLunchSchema.safeParse(data);
  if (!view.success) return c.json({ error: "lunch_unavailable", code: "lunch_unavailable" }, 503);
  return c.json(view.data);
});
/* GET /team-today — the page header's Team list (owner ruling 2026-10-08).
 * The definer function returns each person's last minute today; the state is
 * decided here against the Worker's clock with the one shared rule. */
router.get("/team-today", requireOperation, async (c) => {
  const sb = userClient(c.env, c.var.auth.jwt);
  const { data, error } = await sb.rpc("workspace_team_today");
  if (error) {
    const mapped = mapPgError(error);
    return c.json(mapped.body, mapped.status);
  }
  const now = new Date();
  const rows = (data ?? []) as Array<{
    user_id: string; name: string; role: string; last_active_at: string | null; available: boolean;
  }>;
  return c.json(teamTodayResponseSchema.parse({
    asOf: now.toISOString(),
    onlineMinutes: TEAM_ONLINE_MINUTES,
    members: rows.map((r) => {
      const lastActiveAt = r.last_active_at ? new Date(r.last_active_at).toISOString() : null;
      return {
        userId: r.user_id,
        name: r.name,
        role: r.role,
        lastActiveAt,
        ...teamMemberState(lastActiveAt, r.available, now),
      };
    }),
  }));
});
router.post("/", requireOperation, async (c) => {
  // The body never supplies identity or an occurrence time. Postgres uses
  // the authenticated person and server clock; background cron never calls it.
  const sb = userClient(c.env, c.var.auth.jwt);
  const { error } = await sb.rpc("workspace_record_activity");
  if (error) {
    const mapped = mapPgError(error);
    return c.json(mapped.body, mapped.status);
  }
  return c.json({ ok: true });
});
export default router;

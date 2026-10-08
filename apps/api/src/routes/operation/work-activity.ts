import { Hono } from "hono";
import {
  TEAM_ONLINE_MINUTES,
  teamMemberState,
  teamTodayResponseSchema,
  workspaceActivitySettingsInput,
  workspaceActivitySettingsResponseSchema,
} from "@carres/shared";
import { requireOperation } from "../../lib/auth-guards";
import { mapPgError, parseJsonBody } from "../../lib/route-helpers";
import { userClient } from "../../lib/supabase";
import type { AppEnv } from "../../types";

const router = new Hono<AppEnv>();
function settings(row: Record<string, unknown>, canEdit: boolean) {
  return workspaceActivitySettingsResponseSchema.parse({
    morning: typeof row.morning === "string" ? row.morning.slice(0, 5) : null,
    afternoon: typeof row.afternoon === "string" ? row.afternoon.slice(0, 5) : null,
    revision: row.revision,
    canEdit,
  });
}
router.get("/settings", requireOperation, async (c) => {
  const sb = userClient(c.env, c.var.auth.jwt);
  const [read, gate] = await Promise.all([
    sb.from("workspace_activity_settings").select("morning, afternoon, revision").eq("id", 1).single(),
    sb.rpc("workspace_can_assign_duties"),
  ]);
  if (read.error || gate.error) {
    const mapped = mapPgError((read.error ?? gate.error)!);
    return c.json(mapped.body, mapped.status);
  }
  // Never silently substitute defaults for missing persisted configuration.
  try { return c.json(settings(read.data, gate.data === true)); }
  catch { return c.json({ error: "settings_unavailable", code: "settings_unavailable" }, 503); }
});
router.put("/settings", requireOperation, async (c) => {
  const parsed = await parseJsonBody(c, workspaceActivitySettingsInput);
  if (!parsed.ok) return c.json(parsed.body, parsed.status);
  const { morning, afternoon, revision } = parsed.data;
  const sb = userClient(c.env, c.var.auth.jwt);
  const { data, error } = await sb.rpc("workspace_set_activity_times", {
    p_morning: morning, p_afternoon: afternoon, p_revision: revision,
  });
  if (error) {
    if (error.details === "settings_changed") return c.json({ error: "settings_changed", code: "settings_changed" }, 409);
    const mapped = mapPgError(error);
    return c.json(mapped.body, mapped.status);
  }
  return c.json(settings(data as Record<string, unknown>, true));
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

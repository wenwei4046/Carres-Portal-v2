import { Hono } from "hono";
import { workspaceActivitySettingsInput, workspaceActivitySettingsResponseSchema } from "@carres/shared";
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

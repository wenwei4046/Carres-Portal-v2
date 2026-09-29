import { z } from "zod";

/** Persisted settings are required. Defaults initialise configuration; they
 * must never stand in for an unreadable server configuration. */
const clockTime = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
export const workspaceActivitySettingsSchema = z.object({
  morning: clockTime.refine((value) => value > "10:00" && value < "13:00"),
  afternoon: clockTime.refine((value) => value > "14:00" && value < "18:00"),
}).strict();
export type WorkspaceActivitySettings = z.infer<typeof workspaceActivitySettingsSchema>;
export const INITIAL_WORKSPACE_ACTIVITY_SETTINGS: WorkspaceActivitySettings = {
  morning: "10:30",
  afternoon: "15:00",
};

/** Company-clock projection only. This does not infer attendance, a working
 * day, employee eligibility, or an assignment from the absence of an event. */
export function workspaceActivityWindow(
  day: string,
  period: "morning" | "afternoon",
  settings: WorkspaceActivitySettings,
): { start: string; cutoff: string } {
  const valid = workspaceActivitySettingsSchema.parse(settings);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) ||
      !Number.isFinite(Date.parse(`${day}T00:00:00Z`)) ||
      new Date(`${day}T00:00:00Z`).toISOString().slice(0, 10) !== day) {
    throw new Error("Invalid company date");
  }
  return {
    start: new Date(`${day}T${period === "morning" ? "09:00" : "14:00"}:00+08:00`).toISOString(),
    cutoff: new Date(`${day}T${valid[period]}:00+08:00`).toISOString(),
  };
}

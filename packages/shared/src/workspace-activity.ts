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

export const workspaceActivitySettingsInput = workspaceActivitySettingsSchema.extend({
  revision: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
});
export const workspaceActivitySettingsResponseSchema = workspaceActivitySettingsInput.extend({
  canEdit: z.boolean(),
});
export type WorkspaceActivitySettingsResponse = z.infer<typeof workspaceActivitySettingsResponseSchema>;

/* ── TEAM TODAY — the page header's Team list (owner ruling 2026-10-08,
 * Carres Layout Standard §1). Online = portal activity in the last
 * `TEAM_ONLINE_MINUTES` (owner default 15, 2026-10-08). The server decides the
 * state against its own clock; the screen only prints it. */
export const TEAM_ONLINE_MINUTES = 15;
export const teamMemberStateSchema = z.enum(["online", "away", "off", "not_seen"]);
export type TeamMemberState = z.infer<typeof teamMemberStateSchema>;
export const teamTodayMemberSchema = z.object({
  userId: z.string().uuid(),
  name: z.string(),
  role: z.string(),
  state: teamMemberStateSchema,
  /** Last recorded activity today (ISO), or null when none today. */
  lastActiveAt: z.string().nullable(),
  /** Whole minutes since `lastActiveAt`, or null. */
  idleMinutes: z.number().int().nonnegative().nullable(),
}).strict();
export type TeamTodayMember = z.infer<typeof teamTodayMemberSchema>;
export const teamTodayResponseSchema = z.object({
  asOf: z.string(),
  onlineMinutes: z.number().int().positive(),
  members: z.array(teamTodayMemberSchema),
}).strict();
export type TeamTodayResponse = z.infer<typeof teamTodayResponseSchema>;

/** One person's state from the database facts. `available === false` (staff
 * settings mark them off) wins over any activity; no activity today is
 * `not_seen`, never assumed away or off. */
export function teamMemberState(
  lastActiveAt: string | null,
  available: boolean,
  now: Date,
  onlineMinutes = TEAM_ONLINE_MINUTES,
): { state: TeamMemberState; idleMinutes: number | null } {
  if (!available) return { state: "off", idleMinutes: null };
  if (!lastActiveAt) return { state: "not_seen", idleMinutes: null };
  const idle = Math.max(0, Math.floor((now.getTime() - Date.parse(lastActiveAt)) / 60_000));
  return { state: idle < onlineMinutes ? "online" : "away", idleMinutes: idle };
}

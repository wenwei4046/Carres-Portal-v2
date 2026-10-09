import { z } from "zod";

/** Persisted settings are required. Defaults initialise configuration; they
 * must never stand in for an unreadable server configuration. */
const clockTime = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
/* The SHAPE of the two shared check times. Where they may sit follows the
 * stored Office calendar (`workspaceActivityTimesFit`, 0676): a stored value
 * that an Office change has since moved outside that range must still be
 * readable, so the range is not part of the shape. */
export const workspaceActivitySettingsSchema = z.object({
  morning: clockTime,
  afternoon: clockTime,
}).strict();
export type WorkspaceActivitySettings = z.infer<typeof workspaceActivitySettingsSchema>;
export const INITIAL_WORKSPACE_ACTIVITY_SETTINGS: WorkspaceActivitySettings = {
  morning: "10:30",
  afternoon: "15:00",
};

/** The Office hours the check times are bounded by (Settings → Office, 0669). */
export const workspaceActivityOfficeHoursSchema = z.object({
  start: clockTime,
  end: clockTime,
  lunchStart: clockTime,
  lunchEnd: clockTime,
}).strict();
export type WorkspaceActivityOfficeHours = z.infer<typeof workspaceActivityOfficeHoursSchema>;

/** Morning: from Office start and before the Office lunch. Afternoon: after
 * the Office lunch and before Office end. The SQL door
 * `workspace_set_activity_times` (0676) asks the same four comparisons. */
export function workspaceActivityTimesFit(
  settings: WorkspaceActivitySettings,
  office: WorkspaceActivityOfficeHours,
): boolean {
  const s = workspaceActivitySettingsSchema.safeParse(settings);
  const o = workspaceActivityOfficeHoursSchema.safeParse(office);
  if (!s.success || !o.success) return false;
  const { morning, afternoon } = s.data;
  const { start, end, lunchStart, lunchEnd } = o.data;
  return morning >= start && morning < lunchStart && afternoon > lunchEnd && afternoon < end;
}

/* One person's activity window for one period, computed ONLY by the database
 * (`_workspace_activity_window`, 0676 — the one arithmetic): morning from
 * Office start to the morning check (never into the person's lunch);
 * afternoon from the person's lunch end. The Worker reads it from the
 * checkpoint snapshot; it never recomputes it. */
const instant = z.string().refine((value) => Number.isFinite(Date.parse(value)), "Invalid time");
export const workspaceActivityWindowSchema = z.object({
  start: instant,
  cutoff: instant,
  lunchStart: instant,
  lunchEnd: instant,
}).refine((w) => Date.parse(w.cutoff) >= Date.parse(w.start) && Date.parse(w.lunchEnd) >= Date.parse(w.lunchStart),
  "Invalid activity window");
export type WorkspaceActivityWindow = z.infer<typeof workspaceActivityWindowSchema>;

export const workspaceActivitySettingsInput = workspaceActivitySettingsSchema.extend({
  revision: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
});
export const workspaceActivitySettingsResponseSchema = workspaceActivitySettingsInput.extend({
  canEdit: z.boolean(),
  /** The stored Office hours the two check times must fit (Settings → Office). */
  office: workspaceActivityOfficeHoursSchema,
});
export type WorkspaceActivitySettingsResponse = z.infer<typeof workspaceActivitySettingsResponseSchema>;

/* ── LUNCH TIME — each person's standing lunch start (owner order 9 Oct 2026;
 * Settings → Personal → Lunch time; 0676). Empty = the Office lunch. The
 * length is the Office lunch length; the allowed start is the Office lunch
 * start moved by up to the Office shift either way. Every time below is
 * computed by the database, never here. */
export const workspaceStaffLunchSchema = z.object({
  userId: z.string().uuid(),
  /** The saved start, or null when the person follows the Office lunch. */
  saved: clockTime.nullable(),
  /** False when an Office change has left the saved start outside the range:
   *  the Office lunch then applies. */
  savedFits: z.boolean(),
  lunchStart: clockTime,
  lunchEnd: clockTime,
  earliest: clockTime,
  latest: clockTime,
  officeLunchStart: clockTime,
  officeLunchEnd: clockTime,
  /** This person's own check times today. */
  morningCheck: clockTime,
  afternoonCheck: clockTime,
  canEdit: z.boolean(),
}).strict();
export type WorkspaceStaffLunch = z.infer<typeof workspaceStaffLunchSchema>;
export const workspaceStaffLunchInput = z.object({
  /** null = follow the Office lunch. */
  lunchStart: clockTime.nullable(),
  /** Another person (Staff & Duties editors only); absent = yourself. */
  userId: z.string().uuid().optional(),
}).strict();
export type WorkspaceStaffLunchInput = z.infer<typeof workspaceStaffLunchInput>;

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

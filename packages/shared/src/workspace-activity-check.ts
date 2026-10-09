import { OFFICE_OFF_DAYS } from "./order-action-due";
import { isWorkingDay } from "./working-days";
import { workspaceActivityWindowSchema, type WorkspaceActivityWindow } from "./workspace-activity";

export type WorkspaceActivityEvidence =
  | { status: "unavailable" }
  | { status: "healthy"; events: readonly { userId: string; observedAt: string }[] };

export type WorkspaceActivityCheck =
  | { status: "not_due" }
  | { status: "not_working_day" }
  | { status: "evidence_unavailable" }
  | { status: "ready"; start: string; cutoff: string; activeUserIds: readonly string[] };

/** Evaluate one allocation scope's checkpoint from server-recorded
 * observations. This is routing evidence only: it cannot establish attendance,
 * leave or execution permission. The caller supplies the authoritative office
 * holidays and complete event read. Do not use last_seen_at or minute buckets
 * here: the actual observation time decides whether an interaction preceded
 * the checkpoint.
 *
 * Every window comes from the database's one window arithmetic (0677), read
 * through the checkpoint snapshot; nothing here computes a time of day:
 *   · the scope is due only when the ASSIGNED person's own cutoff has passed,
 *     so nobody's work moves while they are at lunch; they are active with an
 *     event inside their own window;
 *   · a candidate counts as active only with an event inside their OWN window,
 *     up to now, and never while at lunch now — work is not handed to a
 *     colleague at lunch either.
 * The commit door (`workspace_commit_activity_checkpoint`) asks the same
 * questions; a disagreement is refused and re-evaluated the next minute. */
export function evaluateWorkspaceActivityCheck(input: {
  day: string;
  now: string;
  holidays: ReadonlySet<string>;
  /** The stored Office calendar's non-working weekdays (`officeOffDays`,
   *  Settings → Office). Absent ⇒ the owner default, Saturday and Sunday. */
  offDays?: readonly number[];
  /** The person the scope is assigned to now, or null. */
  assignedUserId: string | null;
  /** The assigned person's own window (the Office lunch when nobody is assigned). */
  window: WorkspaceActivityWindow;
  /** Every assigned person's and candidate's own window for this period. */
  windows: Readonly<Record<string, WorkspaceActivityWindow>>;
  evidence: WorkspaceActivityEvidence;
}): WorkspaceActivityCheck {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.day) ||
      !Number.isFinite(Date.parse(`${input.day}T00:00:00Z`)) ||
      new Date(`${input.day}T00:00:00Z`).toISOString().slice(0, 10) !== input.day) {
    throw new Error("Invalid company date");
  }
  const window = workspaceActivityWindowSchema.parse(input.window);
  const now = Date.parse(input.now);
  if (!Number.isFinite(now)) throw new Error("Invalid server time");
  if (!isWorkingDay(input.day, { holidays: input.holidays, offDays: input.offDays ?? OFFICE_OFF_DAYS })) {
    return { status: "not_working_day" };
  }
  const start = Date.parse(window.start);
  const cutoff = Date.parse(window.cutoff);
  if (now < cutoff) return { status: "not_due" };
  if (input.evidence.status === "unavailable") return { status: "evidence_unavailable" };
  const own = new Map<string, { start: number; until: number; lunchStart: number; lunchEnd: number }>();
  for (const [userId, raw] of Object.entries(input.windows)) {
    const parsed = workspaceActivityWindowSchema.safeParse(raw);
    // A window the server cannot state is not evidence of absence.
    if (!parsed.success) return { status: "evidence_unavailable" };
    own.set(userId, {
      start: Date.parse(parsed.data.start),
      until: Math.min(Date.parse(parsed.data.cutoff), now),
      lunchStart: Date.parse(parsed.data.lunchStart),
      lunchEnd: Date.parse(parsed.data.lunchEnd),
    });
  }
  const active = new Set<string>();
  for (const event of input.evidence.events) {
    const observed = Date.parse(event.observedAt);
    // Corrupt data is not evidence of absence. Refuse the entire decision.
    if (!event.userId || !Number.isFinite(observed)) return { status: "evidence_unavailable" };
    if (event.userId === input.assignedUserId) {
      if (observed >= start && observed <= cutoff) active.add(event.userId);
      continue;
    }
    const w = own.get(event.userId);
    if (!w || (now >= w.lunchStart && now < w.lunchEnd)) continue;
    if (observed >= w.start && observed <= w.until) active.add(event.userId);
  }
  return { status: "ready", start: window.start, cutoff: window.cutoff, activeUserIds: [...active].sort() };
}

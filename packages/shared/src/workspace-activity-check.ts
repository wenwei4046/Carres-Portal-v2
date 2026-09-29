import { OFFICE_OFF_DAYS } from "./order-action-due";
import { isWorkingDay } from "./working-days";
import { workspaceActivityWindow, type WorkspaceActivitySettings } from "./workspace-activity";

export type WorkspaceActivityEvidence =
  | { status: "unavailable" }
  | { status: "healthy"; events: readonly { userId: string; observedAt: string }[] };

export type WorkspaceActivityCheck =
  | { status: "not_due" | "not_working_day" | "evidence_unavailable" }
  | { status: "ready"; start: string; cutoff: string; activeUserIds: readonly string[] };

/** Evaluate one checkpoint from server-recorded observations. This is routing
 * evidence only: it cannot establish attendance, leave or execution permission.
 * The caller supplies the authoritative office holidays and complete event read.
 * Do not use last_seen_at or minute buckets here: the actual observation time
 * decides whether an interaction preceded the checkpoint. */
export function evaluateWorkspaceActivityCheck(input: {
  day: string;
  period: "morning" | "afternoon";
  settings: WorkspaceActivitySettings;
  now: string;
  holidays: ReadonlySet<string>;
  evidence: WorkspaceActivityEvidence;
}): WorkspaceActivityCheck {
  const window = workspaceActivityWindow(input.day, input.period, input.settings);
  const now = Date.parse(input.now);
  if (!Number.isFinite(now)) throw new Error("Invalid server time");
  if (!isWorkingDay(input.day, { holidays: input.holidays, offDays: OFFICE_OFF_DAYS })) {
    return { status: "not_working_day" };
  }
  const cutoff = Date.parse(window.cutoff);
  if (now < cutoff) return { status: "not_due" };
  if (input.evidence.status === "unavailable") return { status: "evidence_unavailable" };
  const active = new Set<string>();
  const start = Date.parse(window.start);
  for (const event of input.evidence.events) {
    const observed = Date.parse(event.observedAt);
    // Corrupt data is not evidence of absence. Refuse the entire decision.
    if (!event.userId || !Number.isFinite(observed)) return { status: "evidence_unavailable" };
    if (observed >= start && observed <= cutoff) active.add(event.userId);
  }
  return { status: "ready", ...window, activeUserIds: [...active].sort() };
}

import {
  isWorkingDay,
  decideWorkspaceReassignment,
  evaluateWorkspaceActivityCheck,
  officeWorkingDayOptions,
  workspaceActivitySettingsInput,
  workspaceActivityWindowSchema,
  type WorkspaceActivityWindow,
  type WorkspaceCheckpointIdentity,
} from "@carres/shared";
import { z } from "zod";
import { readOfficeCalendar } from "../lib/office-calendar";
import { todayIsoMYT } from "../lib/today";
import { adminClient } from "../lib/supabase";
import type { Bindings } from "../types";

interface Scope {
  type: "duty" | "order";
  key: string;
  assignedUserId: string | null;
  assignedPersonEligible: boolean;
  previousReceiptId: number | null;
  checked: WorkspaceCheckpointIdentity[];
  candidateUserIds: string[];
  /** The assigned person's own window (0676); the Office lunch when nobody. */
  window: WorkspaceActivityWindow;
}
interface Snapshot {
  day: string;
  now: string;
  settings: { morning: string; afternoon: string; revision: number };
  evidence: { status: "healthy"; events: { userId: string; observedAt: string }[] };
  scopes: Scope[];
  /** Every assigned person's and candidate's own window (0676). */
  windows: Record<string, WorkspaceActivityWindow>;
}
/* A snapshot without the per-person windows (a database before 0676) is an
   unreadable snapshot: no default window substitutes for it. */
const snapshotWindows = z.object({
  scopes: z.array(z.object({ window: workspaceActivityWindowSchema }).passthrough()),
  windows: z.record(z.string(), workspaceActivityWindowSchema),
}).passthrough();

/** One complete server snapshot per period. A failed read aborts the period;
 * no default settings, window or empty evidence substitute is permitted. The
 * commit RPC rechecks the source and serialises the receipt before accepting a
 * result. Morning is committed before a fresh afternoon snapshot is obtained.
 *
 * Each scope is evaluated on its ASSIGNED person's own window (Office hours
 * and that person's lunch, 0676): it is not due until that person's cutoff
 * has passed, so no work moves while they are at lunch. */
export async function runWorkActivityCron(env: Bindings, today: string = todayIsoMYT()): Promise<void> {
  const sb = adminClient(env);
  /* The stored Office calendar (Settings → Office), read ONCE per run: its
     working weekdays decide whether a period is checked at all, and its
     holidays are the ones the commit door is told about. Fails safe to the
     owner defaults (Monday–Friday, the built-in holidays). The commit SQL
     (`workspace_commit_activity_checkpoint`, 0676) reads the same stored
     working weekdays and recorded holidays itself, so the two agree. */
  const office = officeWorkingDayOptions((await readOfficeCalendar(sb)).calendar);
  const officeHolidays = office.holidays as ReadonlySet<string>;
  /* The trigger runs every day (wrangler `* 0-12 * * *`); the stored Office
     calendar — not the trigger's weekday field — decides whether today is a
     working day. A day off does nothing at all (read-time cover answers it). */
  if (!isWorkingDay(today, { holidays: officeHolidays, offDays: office.offDays })) return;
  const unavailable = await sb.rpc("workspace_process_recorded_unavailability");
  if (unavailable.error) throw new Error(`Recorded availability check failed: ${unavailable.error.message}`);
  for (const period of ["morning", "afternoon"] as const) {
    const read = await sb.rpc("workspace_activity_checkpoint_snapshot", { p_period: period });
    if (read.error) throw new Error(`Work activity snapshot failed: ${read.error.message}`);
    const snapshot = read.data as Snapshot | null;
    if (!snapshot || !Array.isArray(snapshot.scopes) || snapshot.evidence?.status !== "healthy" || !Array.isArray(snapshot.evidence.events)
        || !snapshotWindows.safeParse(snapshot).success) {
      throw new Error("Work activity snapshot unavailable");
    }
    const settings = workspaceActivitySettingsInput.parse(snapshot.settings);
    const checkpoint = { day: snapshot.day, period };
    for (const scope of snapshot.scopes) {
      const check = evaluateWorkspaceActivityCheck({
        day: snapshot.day, now: snapshot.now, holidays: officeHolidays, offDays: office.offDays,
        assignedUserId: scope.assignedUserId, window: scope.window, windows: snapshot.windows,
        evidence: snapshot.evidence,
      });
      if (check.status !== "ready") continue;
      const decision = decideWorkspaceReassignment({
        checkpoint, check, completed: false, ordinaryWork: true,
        assignedUserId: scope.assignedUserId,
        assignedPersonEligible: scope.assignedPersonEligible,
        previousReceiptId: scope.previousReceiptId,
        checked: scope.checked, candidateUserIds: scope.candidateUserIds,
      });
      if (decision.kind === "unchanged" && decision.reason !== "active") continue;
      if (decision.kind === "exception" && decision.reason === "evidence_unavailable") continue;
      const outcome = decision.kind === "reassign" ? "reassigned" : decision.reason;
      const commit = await sb.rpc("workspace_commit_activity_checkpoint", {
        p_scope_type: scope.type, p_scope_key: scope.key,
        p_office_day: snapshot.day, p_period: period,
        p_settings_revision: settings.revision,
        p_previous_receipt_id: scope.previousReceiptId,
        p_from_user_id: scope.assignedUserId,
        p_to_user_id: decision.kind === "reassign" ? decision.toUserId : scope.assignedUserId,
        p_outcome: outcome, p_reason: decision.reason,
        p_office_holidays: [...officeHolidays],
      });
      // The next minute gets fresh source state. Never retry a stale decision.
      if (commit.error?.code === "40001") continue;
      if (commit.error) throw new Error(`Work activity commit failed: ${commit.error.message}`);
    }
  }
}

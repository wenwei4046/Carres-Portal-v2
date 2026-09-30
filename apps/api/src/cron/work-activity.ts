import {
  decideWorkspaceReassignment,
  evaluateWorkspaceActivityCheck,
  myHolidaySet,
  workspaceActivitySettingsInput,
  type WorkspaceCheckpointIdentity,
} from "@carres/shared";
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
}
interface Snapshot {
  day: string;
  now: string;
  settings: { morning: string; afternoon: string; revision: number };
  evidence: { status: "healthy"; events: { userId: string; observedAt: string }[] };
  scopes: Scope[];
}

/** One complete server snapshot per period. A failed read aborts the period;
 * no default settings or empty evidence substitute is permitted. The commit
 * RPC rechecks the source and serialises the receipt before accepting a result.
 * Morning is committed before a fresh afternoon snapshot is obtained. */
export async function runWorkActivityCron(env: Bindings): Promise<void> {
  const sb = adminClient(env);
  for (const period of ["morning", "afternoon"] as const) {
    const read = await sb.rpc("workspace_activity_checkpoint_snapshot", { p_period: period });
    if (read.error) throw new Error(`Work activity snapshot failed: ${read.error.message}`);
    const snapshot = read.data as Snapshot | null;
    if (!snapshot || !Array.isArray(snapshot.scopes) || snapshot.evidence?.status !== "healthy" || !Array.isArray(snapshot.evidence.events)) {
      throw new Error("Work activity snapshot unavailable");
    }
    const settings = workspaceActivitySettingsInput.parse(snapshot.settings);
    const check = evaluateWorkspaceActivityCheck({
      day: snapshot.day, period, settings: { morning: settings.morning, afternoon: settings.afternoon }, now: snapshot.now,
      holidays: myHolidaySet(), evidence: snapshot.evidence,
    });
    if (check.status !== "ready") continue;
    const checkpoint = { day: snapshot.day, period };
    for (const scope of snapshot.scopes) {
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
        p_office_holidays: [...myHolidaySet()],
      });
      // The next minute gets fresh source state. Never retry a stale decision.
      if (commit.error?.code === "40001") continue;
      if (commit.error) throw new Error(`Work activity commit failed: ${commit.error.message}`);
    }
  }
}

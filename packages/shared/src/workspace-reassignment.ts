import type { WorkspaceActivityCheck } from "./workspace-activity-check";

export interface WorkspaceCheckpointIdentity {
  day: string;
  period: "morning" | "afternoon";
}
export type WorkspaceReassignmentDecision =
  | { kind: "unchanged"; reason: "completed" | "restricted_duty" | "already_checked" | "not_due" | "not_working_day" | "active" }
  | { kind: "exception"; reason: "evidence_unavailable" | "not_assigned" | "no_candidate" }
  | { kind: "reassign"; fromUserId: string; toUserId: string; expectedRevision: number;
      checkpoint: WorkspaceCheckpointIdentity; reason: "missing_period_activity" | "no_longer_eligible"; effectiveAt: string };

/** Candidate order/eligibility come from the governing Duty/object policy.
 * Grants no execution permission and never completes source work.
 * The writer must lock/re-read source completion and revision, persist checkpoint
 * result and movement atomically, and retry from fresh evidence on conflict.
 * A decision is not a committed assignment. */
export function decideWorkspaceReassignment(input: {
  checkpoint: WorkspaceCheckpointIdentity;
  check: WorkspaceActivityCheck;
  completed: boolean;
  ordinaryWork: boolean;
  assignedUserId: string | null;
  assignmentRevision: number;
  /** Current People/leave/role facts permit this allocation. */
  assignedPersonEligible: boolean;
  /** Durable receipts for THIS allocation scope, including no-op checks. */
  checked: readonly WorkspaceCheckpointIdentity[];
  /** Active, available, allocation-eligible people in authoritative policy order. */
  candidateUserIds: readonly string[];
}): WorkspaceReassignmentDecision {
  if (input.completed) return { kind: "unchanged", reason: "completed" };
  if (!input.ordinaryWork) return { kind: "unchanged", reason: "restricted_duty" };
  if (input.checked.some((c) => c.day === input.checkpoint.day && c.period === input.checkpoint.period)) {
    return { kind: "unchanged", reason: "already_checked" };
  }
  if (input.check.status === "not_due" || input.check.status === "not_working_day") {
    return { kind: "unchanged", reason: input.check.status };
  }
  if (input.check.status === "evidence_unavailable") return { kind: "exception", reason: "evidence_unavailable" };
  if (!input.assignedUserId) return { kind: "exception", reason: "not_assigned" };
  const active = new Set(input.check.activeUserIds);
  if (input.assignedPersonEligible && active.has(input.assignedUserId)) return { kind: "unchanged", reason: "active" };
  const next = input.candidateUserIds.find((id) => id !== input.assignedUserId && active.has(id));
  if (!next) return { kind: "exception", reason: "no_candidate" };
  if (!Number.isSafeInteger(input.assignmentRevision) || input.assignmentRevision < 1) throw new Error("Invalid assignment revision");
  return { kind: "reassign", fromUserId: input.assignedUserId, toUserId: next,
    expectedRevision: input.assignmentRevision, checkpoint: { ...input.checkpoint },
    reason: input.assignedPersonEligible ? "missing_period_activity" : "no_longer_eligible",
    effectiveAt: input.check.cutoff };
}

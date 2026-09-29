import { describe, expect, it } from "vitest";
import { decideWorkspaceReassignment as decide } from "./workspace-reassignment";
import type { WorkspaceActivityCheck } from "./workspace-activity-check";
const morning = { day: "2026-09-29", period: "morning" as const };
const base = {
  checkpoint: morning,
  check: { status: "ready", start: "2026-09-29T01:00:00Z", cutoff: "2026-09-29T02:30:00Z", activeUserIds: ["b", "c"] } as WorkspaceActivityCheck,
  completed: false, ordinaryWork: true, assignedUserId: "a", assignmentRevision: 4,
  assignedPersonEligible: true, checked: [], candidateUserIds: ["c", "b"],
};
describe("ordinary work checkpoint reassignment", () => {
  it("uses policy order and preserves previous person/revision for atomic writes", () => {
    expect(decide(base)).toEqual({ kind: "reassign", fromUserId: "a", toUserId: "c", expectedRevision: 4,
      checkpoint: morning, reason: "missing_period_activity", effectiveAt: "2026-09-29T02:30:00Z" });
  });
  it("cannot rewrite completed jobs or auto-allocate approvals", () => {
    expect(decide({ ...base, completed: true })).toEqual({ kind: "unchanged", reason: "completed" });
    expect(decide({ ...base, ordinaryWork: false })).toEqual({ kind: "unchanged", reason: "restricted_duty" });
  });
  it("does not bounce back after a durable checkpoint receipt", () => {
    expect(decide({ ...base, assignedUserId: "c", checked: [morning], candidateUserIds: ["a"],
      check: { status: "ready", start: "2026-09-29T01:00:00Z", cutoff: "2026-09-29T02:30:00Z", activeUserIds: ["a"] },
    })).toEqual({ kind: "unchanged", reason: "already_checked" });
  });
  it("afternoon checks the person assigned that morning independently", () => {
    expect(decide({ ...base, checkpoint: { ...morning, period: "afternoon" }, checked: [morning], assignedUserId: "c",
      check: { status: "ready", start: "2026-09-29T06:00:00Z", cutoff: "2026-09-29T07:00:00Z", activeUserIds: ["b"] },
    })).toMatchObject({ kind: "reassign", fromUserId: "c", toUserId: "b", effectiveAt: "2026-09-29T07:00:00Z" });
  });
  it("yesterday's receipt does not suppress today's check", () => {
    expect(decide({ ...base, checked: [{ ...morning, day: "2026-09-28" }] })).toMatchObject({ kind: "reassign" });
  });
  it("keeps an eligible person with current-period evidence", () => {
    expect(decide({ ...base, assignedUserId: "b" })).toEqual({ kind: "unchanged", reason: "active" });
  });
  it("never invents an assignee or selects an offline candidate", () => {
    expect(decide({ ...base, candidateUserIds: ["a", "offline"] })).toEqual({ kind: "exception", reason: "no_candidate" });
    expect(decide({ ...base, assignedUserId: null })).toEqual({ kind: "exception", reason: "not_assigned" });
  });
  it("does not treat an outage as absence", () => {
    expect(decide({ ...base, check: { status: "evidence_unavailable" } })).toEqual({ kind: "exception", reason: "evidence_unavailable" });
  });
  it("does not run before cutoff or on an office holiday", () => {
    for (const status of ["not_due", "not_working_day"] as const) expect(decide({ ...base, check: { status } })).toEqual({ kind: "unchanged", reason: status });
  });
  it("activity cannot override People leave/departure eligibility", () => {
    expect(decide({ ...base, assignedUserId: "b", assignedPersonEligible: false })).toMatchObject({ kind: "reassign", fromUserId: "b", toUserId: "c", reason: "no_longer_eligible" });
  });
  it("does not mutate assignments or source evidence while deciding", () => {
    const input = structuredClone(base), before = structuredClone(base);
    decide(input);
    expect(input).toEqual(before);
  });
});

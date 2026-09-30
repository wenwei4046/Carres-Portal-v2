import { beforeEach, describe, expect, it, vi } from "vitest";
const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("../lib/supabase", () => ({ adminClient: () => ({ rpc }) }));
import { runWorkActivityCron } from "./work-activity";
import type { Bindings } from "../types";
const env = {} as Bindings;
const scope = { type: "duty", key: "grn_duty", assignedUserId: "a", assignedPersonEligible: true,
  previousReceiptId: null, checked: [], candidateUserIds: ["b"] };
const snapshot = { day: "2026-09-29", now: "2026-09-29T07:01:00Z",
  settings: { morning: "10:30", afternoon: "15:00", revision: 1 },
  evidence: { status: "healthy", events: [{ userId: "b", observedAt: "2026-09-29T02:00:00Z" }] }, scopes: [scope] };
beforeEach(() => rpc.mockReset());
describe("two-period Work scheduler", () => {
  it("commits morning then obtains a fresh afternoon assignment", async () => {
    rpc.mockResolvedValueOnce({ data: snapshot }).mockResolvedValueOnce({ data: { id: 1 } })
      .mockResolvedValueOnce({ data: { ...snapshot, scopes: [{ ...scope, assignedUserId: "b", previousReceiptId: 1,
        checked: [{ day: snapshot.day, period: "morning" }] }] } }).mockResolvedValueOnce({ data: { id: 2 } });
    await runWorkActivityCron(env);
    expect(rpc.mock.calls.map(([name]) => name)).toEqual(["workspace_activity_checkpoint_snapshot", "workspace_commit_activity_checkpoint",
      "workspace_activity_checkpoint_snapshot", "workspace_commit_activity_checkpoint"]);
    expect(rpc.mock.calls[1][1]).toMatchObject({ p_period: "morning", p_from_user_id: "a", p_to_user_id: "b", p_outcome: "reassigned" });
    expect(rpc.mock.calls[3][1]).toMatchObject({ p_period: "afternoon", p_from_user_id: "b", p_to_user_id: "b", p_outcome: "no_candidate" });
  });
  it("refuses an outage instead of an empty successful read", async () => {
    rpc.mockResolvedValueOnce({ error: { message: "unavailable" } });
    await expect(runWorkActivityCron(env)).rejects.toThrow("snapshot failed");
    expect(rpc).toHaveBeenCalledTimes(1);
  });
  it("does not run before the cutoff", async () => {
    rpc.mockResolvedValue({ data: { ...snapshot, now: "2026-09-29T01:00:00Z" } });
    await runWorkActivityCron(env);
    expect(rpc.mock.calls.every(([name]) => name === "workspace_activity_checkpoint_snapshot")).toBe(true);
  });
  it("does not retry a stale decision after a source conflict", async () => {
    rpc.mockResolvedValueOnce({ data: snapshot }).mockResolvedValueOnce({ error: { code: "40001", message: "source changed" } })
      .mockResolvedValueOnce({ data: { ...snapshot, scopes: [] } });
    await runWorkActivityCron(env);
    expect(rpc.mock.calls.filter(([name]) => name === "workspace_commit_activity_checkpoint")).toHaveLength(1);
  });
  it("surfaces an unsuccessful commit", async () => {
    rpc.mockResolvedValueOnce({ data: snapshot }).mockResolvedValueOnce({ error: { code: "XX000", message: "database unavailable" } });
    await expect(runWorkActivityCron(env)).rejects.toThrow("commit failed");
    expect(rpc).toHaveBeenCalledTimes(2);
  });
});

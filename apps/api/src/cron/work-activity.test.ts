import { beforeEach, describe, expect, it, vi } from "vitest";
const { rpc, from } = vi.hoisted(() => ({ rpc: vi.fn(), from: vi.fn() }));
vi.mock("../lib/supabase", () => ({ adminClient: () => ({ rpc, from }) }));
import { runWorkActivityCron } from "./work-activity";
import type { Bindings } from "../types";
const env = {} as Bindings;
const scope = { type: "duty", key: "grn_duty", assignedUserId: "a", assignedPersonEligible: true,
  previousReceiptId: null, checked: [], candidateUserIds: ["b"] };
const snapshot = { day: "2026-09-29", now: "2026-09-29T07:01:00Z",
  settings: { morning: "10:30", afternoon: "15:00", revision: 1 },
  evidence: { status: "healthy", events: [{ userId: "b", observedAt: "2026-09-29T02:00:00Z" }] }, scopes: [scope] };
/** A PostgREST-ish chain answering the stored Office calendar (0669). */
function officeTables(calendar: Record<string, unknown> | null, holidays: Array<{ holiday_date: string; name: string }>) {
  from.mockImplementation((table: string) => {
    const result = table === "office_calendar" ? { data: calendar, error: null } : { data: holidays, error: null };
    const chain: Record<string, unknown> = {};
    for (const m of ["select", "eq", "order"]) chain[m] = () => chain;
    chain.maybeSingle = () => Promise.resolve(result);
    chain.then = (ok: (v: unknown) => unknown) => Promise.resolve(result).then(ok);
    return chain;
  });
}
beforeEach(() => {
  rpc.mockReset(); from.mockReset(); rpc.mockResolvedValueOnce({ data: 0 });
  // No stored calendar → the owner defaults (Mon–Fri, the built-in holidays).
  from.mockImplementation(() => { throw new Error("not installed"); });
});
describe("two-period Work scheduler", () => {
  it("commits morning then obtains a fresh afternoon assignment", async () => {
    rpc.mockResolvedValueOnce({ data: snapshot }).mockResolvedValueOnce({ data: { id: 1 } })
      .mockResolvedValueOnce({ data: { ...snapshot, scopes: [{ ...scope, assignedUserId: "b", previousReceiptId: 1,
        checked: [{ day: snapshot.day, period: "morning" }] }] } }).mockResolvedValueOnce({ data: { id: 2 } });
    await runWorkActivityCron(env);
    expect(rpc.mock.calls.map(([name]) => name)).toEqual(["workspace_process_recorded_unavailability", "workspace_activity_checkpoint_snapshot", "workspace_commit_activity_checkpoint",
      "workspace_activity_checkpoint_snapshot", "workspace_commit_activity_checkpoint"]);
    expect(rpc.mock.calls[2][1]).toMatchObject({ p_period: "morning", p_from_user_id: "a", p_to_user_id: "b", p_outcome: "reassigned" });
    expect(rpc.mock.calls[4][1]).toMatchObject({ p_period: "afternoon", p_from_user_id: "b", p_to_user_id: "b", p_outcome: "no_candidate" });
  });
  it("refuses an outage instead of an empty successful read", async () => {
    rpc.mockResolvedValueOnce({ error: { message: "unavailable" } });
    await expect(runWorkActivityCron(env)).rejects.toThrow("snapshot failed");
    expect(rpc).toHaveBeenCalledTimes(2);
  });
  it("does not run before the cutoff", async () => {
    rpc.mockResolvedValue({ data: { ...snapshot, now: "2026-09-29T01:00:00Z" } });
    await runWorkActivityCron(env);
    expect(rpc.mock.calls.slice(1).every(([name]) => name === "workspace_activity_checkpoint_snapshot")).toBe(true);
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
    expect(rpc).toHaveBeenCalledTimes(3);
  });
  it("a day the stored Office calendar records as a holiday is not checked", async () => {
    officeTables({ work_days: [1, 2, 3, 4, 5] }, [{ holiday_date: "2026-09-29", name: "Office closed" }]);
    rpc.mockResolvedValue({ data: snapshot });
    await runWorkActivityCron(env);
    expect(rpc.mock.calls.filter(([name]) => name === "workspace_commit_activity_checkpoint")).toHaveLength(0);
  });
  it("the commit door is told the stored Office holidays", async () => {
    officeTables({ work_days: [1, 2, 3, 4, 5] }, [{ holiday_date: "2026-12-31", name: "Office year end" }]);
    rpc.mockResolvedValueOnce({ data: snapshot }).mockResolvedValueOnce({ data: { id: 1 } })
      .mockResolvedValueOnce({ data: { ...snapshot, scopes: [] } });
    await runWorkActivityCron(env);
    const commit = rpc.mock.calls.find(([name]) => name === "workspace_commit_activity_checkpoint");
    expect((commit?.[1] as { p_office_holidays: string[] }).p_office_holidays).toContain("2026-12-31");
  });
});

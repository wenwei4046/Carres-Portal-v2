import { beforeEach, describe, expect, it, vi } from "vitest";
const { rpc, from } = vi.hoisted(() => ({ rpc: vi.fn(), from: vi.fn() }));
vi.mock("../lib/supabase", () => ({ adminClient: () => ({ rpc, from }) }));
import { runWorkActivityCron } from "./work-activity";
import type { Bindings } from "../types";
const env = {} as Bindings;
/* Windows are the database's answer (0677), in Office local time. */
const at = (hhmm: string) => `2026-09-29T${hhmm}:00+08:00`;
const win = (start: string, cutoff: string, lunchStart = "13:00", lunchEnd = "14:00") =>
  ({ start: at(start), cutoff: at(cutoff), lunchStart: at(lunchStart), lunchEnd: at(lunchEnd) });
const morning = win("09:00", "10:30");
const scope = { type: "duty", key: "grn_duty", assignedUserId: "a", assignedPersonEligible: true,
  previousReceiptId: null, checked: [], candidateUserIds: ["b"], window: morning };
const snapshot = { day: "2026-09-29", now: "2026-09-29T07:01:00Z",
  settings: { morning: "10:30", afternoon: "15:00", revision: 1 },
  evidence: { status: "healthy", events: [{ userId: "b", observedAt: "2026-09-29T02:00:00Z" }] }, scopes: [scope],
  windows: { a: morning, b: morning } };
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
      .mockResolvedValueOnce({ data: { ...snapshot, windows: { b: win("14:00", "15:00") }, scopes: [{ ...scope, assignedUserId: "b", previousReceiptId: 1,
        checked: [{ day: snapshot.day, period: "morning" }], window: win("14:00", "15:00") }] } }).mockResolvedValueOnce({ data: { id: 2 } });
    await runWorkActivityCron(env, snapshot.day);
    expect(rpc.mock.calls.map(([name]) => name)).toEqual(["workspace_process_recorded_unavailability", "workspace_activity_checkpoint_snapshot", "workspace_commit_activity_checkpoint",
      "workspace_activity_checkpoint_snapshot", "workspace_commit_activity_checkpoint"]);
    expect(rpc.mock.calls[2][1]).toMatchObject({ p_period: "morning", p_from_user_id: "a", p_to_user_id: "b", p_outcome: "reassigned" });
    expect(rpc.mock.calls[4][1]).toMatchObject({ p_period: "afternoon", p_from_user_id: "b", p_to_user_id: "b", p_outcome: "no_candidate" });
  });
  it("refuses an outage instead of an empty successful read", async () => {
    rpc.mockResolvedValueOnce({ error: { message: "unavailable" } });
    await expect(runWorkActivityCron(env, snapshot.day)).rejects.toThrow("snapshot failed");
    expect(rpc).toHaveBeenCalledTimes(2);
  });
  it("does not run before the cutoff", async () => {
    rpc.mockResolvedValue({ data: { ...snapshot, now: "2026-09-29T01:00:00Z" } });
    await runWorkActivityCron(env, snapshot.day);
    expect(rpc.mock.calls.slice(1).every(([name]) => name === "workspace_activity_checkpoint_snapshot")).toBe(true);
  });
  it("does not retry a stale decision after a source conflict", async () => {
    rpc.mockResolvedValueOnce({ data: snapshot }).mockResolvedValueOnce({ error: { code: "40001", message: "source changed" } })
      .mockResolvedValueOnce({ data: { ...snapshot, scopes: [] } });
    await runWorkActivityCron(env, snapshot.day);
    expect(rpc.mock.calls.filter(([name]) => name === "workspace_commit_activity_checkpoint")).toHaveLength(1);
  });
  it("surfaces an unsuccessful commit", async () => {
    rpc.mockResolvedValueOnce({ data: snapshot }).mockResolvedValueOnce({ error: { code: "XX000", message: "database unavailable" } });
    await expect(runWorkActivityCron(env, snapshot.day)).rejects.toThrow("commit failed");
    expect(rpc).toHaveBeenCalledTimes(3);
  });
  it("a day the stored Office calendar records as a holiday is not checked", async () => {
    officeTables({ work_days: [1, 2, 3, 4, 5] }, [{ holiday_date: "2026-09-29", name: "Office closed" }]);
    rpc.mockResolvedValue({ data: snapshot });
    await runWorkActivityCron(env, snapshot.day);
    expect(rpc.mock.calls.filter(([name]) => name === "workspace_commit_activity_checkpoint")).toHaveLength(0);
  });
  it("the commit door is told the stored Office holidays", async () => {
    officeTables({ work_days: [1, 2, 3, 4, 5] }, [{ holiday_date: "2026-12-31", name: "Office year end" }]);
    rpc.mockResolvedValueOnce({ data: snapshot }).mockResolvedValueOnce({ data: { id: 1 } })
      .mockResolvedValueOnce({ data: { ...snapshot, scopes: [] } });
    await runWorkActivityCron(env, snapshot.day);
    const commit = rpc.mock.calls.find(([name]) => name === "workspace_commit_activity_checkpoint");
    expect((commit?.[1] as { p_office_holidays: string[] }).p_office_holidays).toContain("2026-12-31");
  });
});

describe("each assigned person's own lunch (owner order 9 Oct 2026, 0677)", () => {
  const twoPm = win("15:00", "15:01", "14:00", "15:00");
  // The owner default check 2:01 PM: one minute after the Office lunch.
  const lateLunch = { ...snapshot, now: at("14:01"), evidence: { status: "healthy", events: [] },
    settings: { morning: "10:00", afternoon: "14:01", revision: 1 },
    scopes: [{ ...scope, window: twoPm }], windows: { a: twoPm, b: win("14:00", "14:01") } };
  it("no work moves at 2:01 PM from a person whose lunch is 2:00 to 3:00 PM", async () => {
    rpc.mockResolvedValueOnce({ data: lateLunch }).mockResolvedValueOnce({ data: { ...snapshot, scopes: [], windows: {} } });
    await runWorkActivityCron(env, snapshot.day);
    expect(rpc.mock.calls.filter(([name]) => name === "workspace_commit_activity_checkpoint")).toHaveLength(0);
  });
  it("the same person is checked at 3:01 PM, and an active colleague takes the work", async () => {
    rpc.mockResolvedValueOnce({ data: { ...lateLunch, now: at("15:01"),
      evidence: { status: "healthy", events: [{ userId: "b", observedAt: at("14:00") }] } } })
      .mockResolvedValueOnce({ data: { id: 3 } })
      .mockResolvedValueOnce({ data: { ...snapshot, scopes: [], windows: {} } });
    await runWorkActivityCron(env, snapshot.day);
    const commit = rpc.mock.calls.find(([name]) => name === "workspace_commit_activity_checkpoint");
    expect(commit?.[1]).toMatchObject({ p_from_user_id: "a", p_to_user_id: "b", p_outcome: "reassigned" });
  });
  it("a snapshot without each person's window is refused, never filled with a default", async () => {
    const { windows: _gone, ...old } = snapshot;
    rpc.mockResolvedValueOnce({ data: { ...old, scopes: [{ ...scope, window: undefined }] } });
    await expect(runWorkActivityCron(env, snapshot.day)).rejects.toThrow("snapshot unavailable");
    expect(rpc.mock.calls.filter(([name]) => name === "workspace_commit_activity_checkpoint")).toHaveLength(0);
  });  it("a day the stored Office calendar does not work does nothing at all, whatever the trigger's weekday", async () => {
    // 2026-10-10 is a Saturday; the owner-default Office week is Monday to Friday.
    await runWorkActivityCron(env, "2026-10-10");
    expect(rpc.mock.calls.filter(([name]) => name !== "office_calendar")).toEqual([]);
  });
});

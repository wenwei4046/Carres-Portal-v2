import { describe, expect, it } from "vitest";
import { evaluateWorkspaceActivityCheck as evaluate } from "./workspace-activity-check";

/* Windows are the database's answer (0677); these are written in Office local
 * time exactly as `_workspace_activity_window` returns them. */
const at = (day: string, hhmm: string) => `${day}T${hhmm}:00+08:00`;
const win = (day: string, start: string, cutoff: string, lunchStart = "13:00", lunchEnd = "14:00") => ({
  start: at(day, start), cutoff: at(day, cutoff), lunchStart: at(day, lunchStart), lunchEnd: at(day, lunchEnd),
});
const D = "2026-09-29";
const morning = win(D, "09:00", "10:30");
const base = {
  day: D, now: at(D, "10:30"), holidays: new Set<string>(),
  assignedUserId: "a" as string | null, window: morning,
  windows: { a: morning } as Record<string, ReturnType<typeof win>>,
};
const event = (userId: string, time: string) => ({ userId, observedAt: `${D}T${time}+08:00` });
const everyone = (w: ReturnType<typeof win>, ...ids: string[]) => Object.fromEntries(ids.map((id) => [id, w]));

describe("office checkpoint evidence", () => {
  it("allows a 10am start and excludes activity before office hours or after cutoff", () => {
    const windows = everyone(morning, "early", "start", "flexible", "boundary", "late");
    expect(evaluate({ ...base, assignedUserId: null, windows, evidence: { status: "healthy", events: [
      event("early", "08:59:59"), event("start", "09:00:00"),
      event("flexible", "10:00:00"), event("boundary", "10:30:00"),
      event("late", "10:30:01"), event("flexible", "10:15:00"),
    ] } })).toMatchObject({ status: "ready", activeUserIds: ["boundary", "flexible", "start"] });
  });
  it("does not count morning or lunch as afternoon evidence", () => {
    const afternoon = win(D, "14:00", "15:00");
    expect(evaluate({ ...base, now: at(D, "15:00"), assignedUserId: null, window: afternoon,
      windows: everyone(afternoon, "morning", "lunch", "afternoon"),
      evidence: { status: "healthy", events: [event("morning", "10:00:00"),
        event("lunch", "13:59:59"), event("afternoon", "14:00:00")] },
    })).toMatchObject({ status: "ready", activeUserIds: ["afternoon"] });
  });
  it("waits for the assigned person's own cutoff", () => {
    expect(evaluate({ ...base, now: at(D, "10:29"), evidence: { status: "healthy", events: [] } })).toEqual({ status: "not_due" });
  });
  it("distinguishes an outage from a healthy empty period", () => {
    expect(evaluate({ ...base, evidence: { status: "unavailable" } })).toEqual({ status: "evidence_unavailable" });
    expect(evaluate({ ...base, evidence: { status: "healthy", events: [] } })).toMatchObject({ status: "ready", activeUserIds: [] });
  });
  it.each(["2026-10-03", "2026-10-04"])("does not run on office weekends: %s", (day) => {
    const w = win(day, "09:00", "10:30");
    expect(evaluate({ ...base, day, now: at(day, "15:00"), window: w, windows: { a: w }, evidence: { status: "healthy", events: [] } })).toEqual({ status: "not_working_day" });
  });
  it("honours the supplied office holiday calendar", () => {
    expect(evaluate({ ...base, holidays: new Set([base.day]), evidence: { status: "healthy", events: [] } })).toEqual({ status: "not_working_day" });
  });
  it("rejects malformed evidence rather than labelling someone absent", () => {
    expect(evaluate({ ...base, evidence: { status: "healthy", events: [{ userId: "a", observedAt: "bad" }] } })).toEqual({ status: "evidence_unavailable" });
  });
  it("rejects an unreadable window rather than labelling someone absent", () => {
    expect(evaluate({ ...base, windows: { a: morning, b: { ...morning, start: "bad" } },
      evidence: { status: "healthy", events: [] } })).toEqual({ status: "evidence_unavailable" });
    expect(() => evaluate({ ...base, window: { ...morning, cutoff: "bad" }, evidence: { status: "healthy", events: [] } })).toThrow();
  });
  it("does not let yesterday or late activity satisfy an earlier check", () => {
    expect(evaluate({ ...base, now: at(D, "16:00"), windows: everyone(morning, "a", "late"), evidence: { status: "healthy", events: [
      { userId: "a", observedAt: "2026-09-28T10:00:00+08:00" }, event("late", "11:00:00"),
    ] } })).toMatchObject({ status: "ready", activeUserIds: [] });
  });
});

describe("each person's own lunch (owner order 9 Oct 2026, 0677)", () => {
  it("a 2:00 PM lunch: nothing is due at 2:01 PM, the check comes at 3:01 PM", () => {
    const late = win(D, "15:00", "15:01", "14:00", "15:00");
    const input = { ...base, window: late, windows: { a: late }, evidence: { status: "healthy" as const, events: [] } };
    expect(evaluate({ ...input, now: at(D, "14:01") })).toEqual({ status: "not_due" });
    expect(evaluate({ ...input, now: at(D, "15:00") })).toEqual({ status: "not_due" });
    expect(evaluate({ ...input, now: at(D, "15:01") })).toMatchObject({ status: "ready", cutoff: late.cutoff });
  });
  it("a 12:00 lunch is checked at 1:01 PM on activity after that lunch only", () => {
    const early = win(D, "13:00", "13:01", "12:00", "13:00");
    expect(evaluate({ ...base, now: at(D, "13:01"), window: early, windows: { a: early },
      evidence: { status: "healthy", events: [event("a", "12:30:00")] } })).toMatchObject({ status: "ready", activeUserIds: [] });
    expect(evaluate({ ...base, now: at(D, "13:01"), window: early, windows: { a: early },
      evidence: { status: "healthy", events: [event("a", "13:00:30")] } })).toMatchObject({ status: "ready", activeUserIds: ["a"] });
  });
  it("a colleague counts only on activity inside their OWN window", () => {
    const mine = win(D, "14:00", "14:01");
    const theirs = win(D, "13:00", "13:01", "12:00", "13:00");
    const windows = { a: mine, b: theirs };
    const at1401 = { ...base, now: at(D, "14:01"), window: mine, windows };
    expect(evaluate({ ...at1401, evidence: { status: "healthy", events: [event("b", "13:00:30")] } }))
      .toMatchObject({ status: "ready", activeUserIds: ["b"] });
    // After their own cutoff it is no longer this period's evidence for them.
    expect(evaluate({ ...at1401, evidence: { status: "healthy", events: [event("b", "13:30:00")] } }))
      .toMatchObject({ status: "ready", activeUserIds: [] });
  });
  it("work is never handed to a colleague who is at lunch now", () => {
    // The assigned person's morning ends at 12:30; the colleague lunches 12:00 to 1:00 PM.
    const mine = win(D, "09:00", "12:30");
    const theirs = win(D, "09:00", "12:00", "12:00", "13:00");
    expect(evaluate({ ...base, now: at(D, "12:30"), window: mine, windows: { a: mine, b: theirs },
      evidence: { status: "healthy", events: [event("b", "11:00:00")] } })).toMatchObject({ status: "ready", activeUserIds: [] });
    expect(evaluate({ ...base, now: at(D, "13:00"), window: mine, windows: { a: mine, b: theirs },
      evidence: { status: "healthy", events: [event("b", "11:00:00")] } })).toMatchObject({ status: "ready", activeUserIds: ["b"] });
  });
  it("the assigned person at lunch is judged on their own window, so morning work keeps the task", () => {
    const mine = win(D, "09:00", "12:00", "12:00", "13:00");
    expect(evaluate({ ...base, now: at(D, "12:05"), window: mine, windows: { a: mine },
      evidence: { status: "healthy", events: [event("a", "11:00:00")] } })).toMatchObject({ status: "ready", activeUserIds: ["a"] });
  });
  it("a colleague whose window the server did not state is never chosen", () => {
    expect(evaluate({ ...base, evidence: { status: "healthy", events: [event("stranger", "10:00:00")] } }))
      .toMatchObject({ status: "ready", activeUserIds: [] });
  });
});

describe("the stored Office calendar decides the checked days (9 Oct 2026)", () => {
  const sat = (() => { const w = win("2026-10-03", "09:00", "10:30"); return { ...base, day: "2026-10-03", now: at("2026-10-03", "10:30"), window: w, windows: { a: w } }; })();
  it("Saturday is not checked on the default Office week", () => {
    expect(evaluate({ ...sat, evidence: { status: "healthy", events: [] } }).status).toBe("not_working_day");
  });
  it("an Office calendar whose working weekdays include Saturday checks it", () => {
    expect(evaluate({ ...sat, offDays: [0], evidence: { status: "healthy", events: [] } }).status).toBe("ready");
  });
  it("an Office holiday is not checked", () => {
    expect(evaluate({ ...base, holidays: new Set(["2026-09-29"]), evidence: { status: "healthy", events: [] } }).status).toBe("not_working_day");
  });
});

import { describe, expect, it } from "vitest";
import { evaluateWorkspaceActivityCheck as evaluate } from "./workspace-activity-check";
import { INITIAL_WORKSPACE_ACTIVITY_SETTINGS } from "./workspace-activity";

const base = {
  day: "2026-09-29", period: "morning" as const,
  settings: INITIAL_WORKSPACE_ACTIVITY_SETTINGS,
  now: "2026-09-29T02:30:00Z", holidays: new Set<string>(),
};
const event = (userId: string, time: string) => ({ userId, observedAt: `2026-09-29T${time}+08:00` });

describe("office checkpoint evidence", () => {
  it("allows a 10am start and excludes activity before office hours or after cutoff", () => {
    expect(evaluate({ ...base, evidence: { status: "healthy", events: [
      event("early", "08:59:59"), event("start", "09:00:00"),
      event("flexible", "10:00:00"), event("boundary", "10:30:00"),
      event("late", "10:30:01"), event("flexible", "10:15:00"),
    ] } })).toMatchObject({ status: "ready", activeUserIds: ["boundary", "flexible", "start"] });
  });
  it("does not count morning or lunch as afternoon evidence", () => {
    expect(evaluate({ ...base, period: "afternoon", now: "2026-09-29T07:00:00Z",
      evidence: { status: "healthy", events: [event("morning", "10:00:00"),
        event("lunch", "13:59:59"), event("afternoon", "14:00:00")] },
    })).toMatchObject({ status: "ready", activeUserIds: ["afternoon"] });
  });
  it("waits for the configured checkpoint", () => {
    expect(evaluate({ ...base, settings: { morning: "11:00", afternoon: "15:00" },
      evidence: { status: "healthy", events: [] } })).toEqual({ status: "not_due" });
  });
  it("distinguishes an outage from a healthy empty period", () => {
    expect(evaluate({ ...base, evidence: { status: "unavailable" } })).toEqual({ status: "evidence_unavailable" });
    expect(evaluate({ ...base, evidence: { status: "healthy", events: [] } })).toMatchObject({ status: "ready", activeUserIds: [] });
  });
  it.each(["2026-10-03", "2026-10-04"])("does not run on office weekends: %s", (day) => {
    expect(evaluate({ ...base, day, now: `${day}T07:00:00Z`, evidence: { status: "healthy", events: [] } })).toEqual({ status: "not_working_day" });
  });
  it("honours the supplied office holiday calendar", () => {
    expect(evaluate({ ...base, holidays: new Set([base.day]), evidence: { status: "healthy", events: [] } })).toEqual({ status: "not_working_day" });
  });
  it("rejects malformed evidence rather than labelling someone absent", () => {
    expect(evaluate({ ...base, evidence: { status: "healthy", events: [{ userId: "staff", observedAt: "bad" }] } })).toEqual({ status: "evidence_unavailable" });
  });
  it("does not let yesterday or late activity satisfy an earlier check", () => {
    expect(evaluate({ ...base, now: "2026-09-29T08:00:00Z", evidence: { status: "healthy", events: [
      { userId: "yesterday", observedAt: "2026-09-28T10:00:00+08:00" }, event("late", "11:00:00"),
    ] } })).toMatchObject({ status: "ready", activeUserIds: [] });
  });
});

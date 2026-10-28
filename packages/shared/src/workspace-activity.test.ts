import { describe, expect, it } from "vitest";
import {
  INITIAL_WORKSPACE_ACTIVITY_SETTINGS as defaults,
  workspaceActivitySettingsResponseSchema,
  workspaceActivitySettingsSchema,
  workspaceActivityTimesFit,
  workspaceActivityWindowSchema,
  workspaceStaffLunchInput,
} from "./workspace-activity";

/* The owner-confirmed Office calendar (OFF-02 · OFF-04, 9 Oct 2026). */
const office = { start: "09:00", end: "18:00", lunchStart: "13:00", lunchEnd: "14:00" };

describe("the two check times follow the stored Office calendar (0677)", () => {
  it("stores the owner default 10:00 AM morning and 2:01 PM afternoon (WS-02/WS-03)", () => {
    expect(workspaceActivityTimesFit({ morning: "10:00", afternoon: "14:01" }, office)).toBe(true);
  });
  it("a morning check may start at Office start: the old fixed 10:00 floor is gone", () => {
    expect(workspaceActivityTimesFit({ morning: "09:00", afternoon: "15:00" }, office)).toBe(true);
    expect(workspaceActivityTimesFit({ morning: "09:30", afternoon: "15:00" }, office)).toBe(true);
  });
  it.each(["08:59", "13:00", "14:00"])("refuses morning check %s outside Office start to the Office lunch", (morning) => {
    expect(workspaceActivityTimesFit({ ...defaults, morning }, office)).toBe(false);
  });
  it.each(["13:30", "14:00", "18:00", "19:00"])("refuses afternoon check %s outside the Office lunch end to Office end", (afternoon) => {
    expect(workspaceActivityTimesFit({ ...defaults, afternoon }, office)).toBe(false);
  });
  it("a moved Office lunch moves the bounds with it", () => {
    const early = { ...office, lunchStart: "12:00", lunchEnd: "13:00" };
    expect(workspaceActivityTimesFit({ morning: "12:30", afternoon: "15:00" }, office)).toBe(true);
    expect(workspaceActivityTimesFit({ morning: "12:30", afternoon: "15:00" }, early)).toBe(false);
    expect(workspaceActivityTimesFit({ morning: "11:00", afternoon: "13:01" }, early)).toBe(true);
    expect(workspaceActivityTimesFit({ morning: "11:00", afternoon: "13:01" }, office)).toBe(false);
  });
  it("Office hours that start at 10:00 refuse a 9:30 morning check", () => {
    expect(workspaceActivityTimesFit({ morning: "09:30", afternoon: "15:00" }, { ...office, start: "10:00" })).toBe(false);
  });
  it.each(["25:00", "10:30:00", "3pm"])("refuses a malformed time %s", (morning) => {
    expect(workspaceActivitySettingsSchema.safeParse({ ...defaults, morning }).success).toBe(false);
  });
  it("a stored value an Office change has moved outside the range is still readable", () => {
    expect(workspaceActivitySettingsSchema.safeParse({ morning: "12:30", afternoon: "13:30" }).success).toBe(true);
  });
  it.each([{}, { morning: "10:30" }, null])("does not replace missing configuration with defaults", (value) => {
    expect(workspaceActivitySettingsSchema.safeParse(value).success).toBe(false);
  });
  it("the settings answer carries the Office hours it was checked against", () => {
    expect(workspaceActivitySettingsResponseSchema.safeParse({ ...defaults, revision: 1, canEdit: true }).success).toBe(false);
    expect(workspaceActivitySettingsResponseSchema.safeParse({ ...defaults, revision: 1, canEdit: true, office }).success).toBe(true);
  });
});

describe("an activity window is the server's answer, never recomputed here", () => {
  const w = { start: "2026-09-29T06:00:00+08:00", cutoff: "2026-09-29T06:01:00+08:00",
    lunchStart: "2026-09-29T05:00:00+08:00", lunchEnd: "2026-09-29T06:00:00+08:00" };
  it("accepts a forward window", () => {
    expect(workspaceActivityWindowSchema.safeParse(w).success).toBe(true);
  });
  it("refuses a window that runs backwards or an unreadable time", () => {
    expect(workspaceActivityWindowSchema.safeParse({ ...w, cutoff: "2026-09-29T05:59:00+08:00" }).success).toBe(false);
    expect(workspaceActivityWindowSchema.safeParse({ ...w, start: "bad" }).success).toBe(false);
  });
});

describe("a lunch time save", () => {
  it("is a whole clock time or empty for the Office lunch", () => {
    expect(workspaceStaffLunchInput.safeParse({ lunchStart: "12:00" }).success).toBe(true);
    expect(workspaceStaffLunchInput.safeParse({ lunchStart: null }).success).toBe(true);
    expect(workspaceStaffLunchInput.safeParse({ lunchStart: "12:00:30" }).success).toBe(false);
    expect(workspaceStaffLunchInput.safeParse({}).success).toBe(false);
  });
});

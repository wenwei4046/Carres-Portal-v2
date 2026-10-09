import { describe, expect, it } from "vitest";
import { INITIAL_WORKSPACE_ACTIVITY_SETTINGS as defaults, workspaceActivitySettingsSchema, workspaceActivityWindow } from "./workspace-activity";

describe("office activity windows", () => {
  it("starts morning at 9 and afternoon after the 1–2 lunch, in company time", () => {
    expect(workspaceActivityWindow("2026-09-29", "morning", defaults)).toEqual({ start: "2026-09-29T01:00:00.000Z", cutoff: "2026-09-29T02:30:00.000Z" });
    expect(workspaceActivityWindow("2026-09-29", "afternoon", defaults)).toEqual({ start: "2026-09-29T06:00:00.000Z", cutoff: "2026-09-29T07:00:00.000Z" });
  });
  it("uses changed settings without moving the lunch boundary", () => {
    expect(workspaceActivityWindow("2026-10-01", "afternoon", { morning: "11:00", afternoon: "16:15" })).toEqual({ start: "2026-10-01T06:00:00.000Z", cutoff: "2026-10-01T08:15:00.000Z" });
  });
  it("stores the owner default 10:00 AM morning and 2:01 PM afternoon (WS-02/WS-03)", () => {
    expect(workspaceActivitySettingsSchema.safeParse({ morning: "10:00", afternoon: "14:01" }).success).toBe(true);
  });
  it.each(["09:30", "09:59", "13:00", "14:00", "25:00", "10:30:00"])("refuses invalid morning cutoff %s", (morning) => {
    expect(workspaceActivitySettingsSchema.safeParse({ ...defaults, morning }).success).toBe(false);
  });
  it.each(["13:30", "14:00", "18:00", "19:00", "3pm"])("refuses invalid afternoon cutoff %s", (afternoon) => {
    expect(workspaceActivitySettingsSchema.safeParse({ ...defaults, afternoon }).success).toBe(false);
  });
  it.each([{}, { morning: "10:30" }, null])("does not replace missing configuration with defaults", (value) => {
    expect(workspaceActivitySettingsSchema.safeParse(value).success).toBe(false);
  });
  it.each(["2026-02-30", "not a date", "2026-13-01"])("refuses invalid company date %s", (day) => {
    expect(() => workspaceActivityWindow(day, "morning", defaults)).toThrow();
  });
});

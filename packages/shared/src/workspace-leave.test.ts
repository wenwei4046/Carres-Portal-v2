import { describe, expect, it } from "vitest";
import {
  leaveCancelAction,
  leaveLastDay,
  leaveState,
  leaveTypeLabel,
  staffLeaveProofSignInput,
  staffLeaveSubmitInput,
} from "./workspace-leave";
import {
  isSaturdayIso,
  saturdayOnCallSetInput,
  saturdayOnCallWindowInput,
  saturdayOnCallWindowSchema,
} from "./workspace-saturday-on-call";

const PROOF = "eeeeeeee-0000-4000-8000-000000000001/eeeeeeee-0000-4000-8000-000000000002.pdf";
const issues = (r: { success: boolean; error?: { issues: { message: string }[] } }) =>
  r.success ? [] : r.error!.issues.map((i) => i.message);

describe("Workspace → Leave submission (0670)", () => {
  it("names the three types in the governed words", () => {
    expect(["mc", "emergency", "planned"].map(leaveTypeLabel)).toEqual(["MC", "Emergency leave", "Planned leave"]);
  });
  it("MC needs proof, Emergency leave needs a reason, Planned leave needs neither", () => {
    expect(issues(staffLeaveSubmitInput.safeParse({ type: "mc", startsOn: "2026-10-12", endsOn: "2026-10-12" }))).toEqual(["proof_required"]);
    expect(staffLeaveSubmitInput.safeParse({ type: "mc", startsOn: "2026-10-12", endsOn: "2026-10-12", proofPath: PROOF }).success).toBe(true);
    expect(issues(staffLeaveSubmitInput.safeParse({ type: "emergency", startsOn: "2026-10-12", endsOn: "2026-10-12", reason: " \t" }))).toEqual(["reason_required"]);
    expect(staffLeaveSubmitInput.safeParse({ type: "emergency", startsOn: "2026-10-12", endsOn: "2026-10-12", reason: "Fever" }).success).toBe(true);
    expect(staffLeaveSubmitInput.safeParse({ type: "planned", startsOn: "2026-10-12", endsOn: "2026-10-14" }).success).toBe(true);
  });
  it("refuses an end before the start, an unknown type and a client-chosen proof path", () => {
    expect(issues(staffLeaveSubmitInput.safeParse({ type: "planned", startsOn: "2026-10-14", endsOn: "2026-10-12" }))).toEqual(["invalid_dates"]);
    expect(staffLeaveSubmitInput.safeParse({ type: "annual", startsOn: "2026-10-12", endsOn: "2026-10-12" }).success).toBe(false);
    expect(staffLeaveSubmitInput.safeParse({ type: "mc", startsOn: "2026-10-12", endsOn: "2026-10-12", proofPath: "../other/x.pdf" }).success).toBe(false);
  });
  it("signs only a photo or PDF up to 10 MB", () => {
    expect(staffLeaveProofSignInput.safeParse({ mimeType: "image/jpeg", sizeBytes: 2_000_000 }).success).toBe(true);
    expect(staffLeaveProofSignInput.safeParse({ mimeType: "video/mp4", sizeBytes: 2_000_000 }).success).toBe(false);
    expect(staffLeaveProofSignInput.safeParse({ mimeType: "application/pdf", sizeBytes: 11 * 1024 * 1024 }).success).toBe(false);
  });
});

describe("leave timing on the company date", () => {
  const row = { starts_on: "2026-10-12", ends_on: "2026-10-14", cancelled_from: null };
  it("is upcoming before it starts, current while it runs, past after", () => {
    expect(leaveState(row, "2026-10-09")).toBe("upcoming");
    expect(leaveState(row, "2026-10-12")).toBe("current");
    expect(leaveState(row, "2026-10-14")).toBe("current");
    expect(leaveState(row, "2026-10-15")).toBe("past");
  });
  it("a whole cancelled leave has no days; withdrawn days end the day before", () => {
    expect(leaveLastDay({ ...row, cancelled_from: "2026-10-12" })).toBeNull();
    expect(leaveState({ ...row, cancelled_from: "2026-10-12" }, "2026-10-09")).toBe("cancelled");
    expect(leaveLastDay({ ...row, cancelled_from: "2026-10-13" })).toBe("2026-10-12");
    expect(leaveState({ ...row, cancelled_from: "2026-10-13" }, "2026-10-13")).toBe("past");
  });
  it("cancels the whole leave before it starts, only the later days while it runs, nothing once today is the last day", () => {
    expect(leaveCancelAction(row, "2026-10-09")).toBe("whole");
    expect(leaveCancelAction(row, "2026-10-12")).toBe("remaining");
    expect(leaveCancelAction(row, "2026-10-14")).toBeNull();
    expect(leaveCancelAction({ ...row, cancelled_from: "2026-10-13" }, "2026-10-12")).toBeNull();
  });
});

describe("Saturday on-call (0671)", () => {
  it("keeps a window that starts before it ends", () => {
    expect(saturdayOnCallWindowSchema.safeParse({ startsAt: "09:00", endsAt: "18:00" }).success).toBe(true);
    expect(issues(saturdayOnCallWindowSchema.safeParse({ startsAt: "18:00", endsAt: "09:00" }))).toEqual(["invalid_window"]);
    expect(saturdayOnCallWindowSchema.safeParse({ startsAt: "9:00", endsAt: "18:00" }).success).toBe(false);
    expect(saturdayOnCallWindowInput.safeParse({ startsAt: "09:00", endsAt: "09:00", revision: 1 }).success).toBe(false);
  });
  it("knows a real Saturday", () => {
    expect(isSaturdayIso("2026-10-10")).toBe(true);
    expect(isSaturdayIso("2026-10-09")).toBe(false);
    expect(isSaturdayIso("2026-02-30")).toBe(false);
  });
  it("a cover needs the on-call person and is another person", () => {
    const a = "eeeeeeee-0000-4000-8000-00000000000a";
    const b = "eeeeeeee-0000-4000-8000-00000000000b";
    expect(saturdayOnCallSetInput.safeParse({ personId: a, coverPersonId: b }).success).toBe(true);
    expect(saturdayOnCallSetInput.safeParse({ personId: null }).success).toBe(true);
    expect(issues(saturdayOnCallSetInput.safeParse({ personId: a, coverPersonId: a }))).toEqual(["cover_is_person"]);
    expect(issues(saturdayOnCallSetInput.safeParse({ personId: null, coverPersonId: b }))).toEqual(["invalid_person"]);
  });
});

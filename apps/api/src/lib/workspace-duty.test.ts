import { describe, expect, it } from "vitest";
import {
  parseWorkspaceDutyResolution,
  workspaceDutyAssignmentInputSchema,
  workspaceDutyDateSchema,
  workspaceStaffUnavailabilityInputSchema,
} from "./workspace-duty";

const SHASHA = "11111111-1111-4111-8111-111111111111";
const YU_JUN = "22222222-2222-4222-8222-222222222222";
const ASSIGNMENT = "33333333-3333-4333-8333-333333333333";

describe("Workspace Duty API contracts", () => {
  it("accepts an explicit governed date only", () => {
    expect(workspaceDutyDateSchema.parse("2026-09-04")).toBe("2026-09-04");
    expect(() => workspaceDutyDateSchema.parse("today")).toThrow();
    expect(() => workspaceDutyDateSchema.parse("2026-02-30")).toThrow();
  });

  it("accepts IDs and dates for an assignment, never display identity", () => {
    expect(
      workspaceDutyAssignmentInputSchema.parse({
        primaryUserId: SHASHA,
        buddyUserId: YU_JUN,
        startsOn: "2026-09-04",
        endsOn: null,
      }),
    ).toMatchObject({ primaryUserId: SHASHA, buddyUserId: YU_JUN });
    expect(() =>
      workspaceDutyAssignmentInputSchema.parse({
        primaryUserId: "shasha@carres.com",
        startsOn: "2026-09-04",
      }),
    ).toThrow();
  });

  it("rejects an impossible leave window", () => {
    expect(() =>
      workspaceStaffUnavailabilityInputSchema.parse({
        startsOn: "2026-09-05",
        endsOn: "2026-09-04",
      }),
    ).toThrow();
  });

  it("maps SQL identity fields into the shared owner/cover contract", () => {
    const result = parseWorkspaceDutyResolution(
      {
        duty_key: "purchasing.po",
        on_date: "2026-09-04",
        normal_user_id: SHASHA,
        buddy_user_id: YU_JUN,
        active_cover_user_id: YU_JUN,
        acting_user_id: YU_JUN,
        state: "covered",
        assignment_id: ASSIGNMENT,
      },
      new Map([
        [SHASHA, "Shasha"],
        [YU_JUN, "Yu Jun"],
      ]),
    );

    expect(result.normalOwner).toEqual({ userId: SHASHA, name: "Shasha" });
    expect(result.activeCover).toEqual({ userId: YU_JUN, name: "Yu Jun" });
    expect(result.actingPerson).toEqual({ userId: YU_JUN, name: "Yu Jun" });
  });

  it("rejects malformed or contradictory resolver output", () => {
    expect(() => parseWorkspaceDutyResolution({ state: "primary" }, new Map())).toThrow();
  });
});

import { describe, expect, it } from "vitest";
import {
  ONBOARDING_CHECKLIST,
  OFFBOARDING_CHECKLIST,
  accessTone,
  checklistFor,
  employmentTone,
  hrEmployeePatchInput,
  hrPeopleSourceSchema,
  hrPersonRowSchema,
  hrRecordExitInput,
  needsExitRecorded,
  revocationShape,
} from "./hr-people";

/** The live CR006 row as hr_people_source returns it (verified against prod
 *  2026-07-26): access already cut, exit never written down. */
const samantha = {
  employeeId: "b92c8eca-1995-4086-97eb-0547608fa8db",
  entity: "carres",
  kind: "hq" as const,
  subjectId: "fd25c033-739e-4aec-a522-3af8627f908e",
  staffCode: "CR006",
  name: "Samantha",
  workEmail: "samantha@carres.com",
  positionName: null,
  band: null,
  staffRole: null,
  departmentName: null,
  storeName: null,
  reportsToName: null,
  access: "disabled" as const,
  employment: "not_recorded" as const,
  joinDate: null,
  confirmDate: null,
  exitDate: null,
  employmentType: null,
  filled: 0,
};

describe("hr-people payload", () => {
  it("parses the live roster shape", () => {
    const parsed = hrPeopleSourceSchema.parse({
      people: [samantha],
      accessWithoutExit: 1,
      totalFields: 8,
    });
    expect(parsed.people[0]?.staffCode).toBe("CR006");
    expect(parsed.accessWithoutExit).toBe(1);
  });

  it("keeps a floor row's staff_role raw so the client labels it once", () => {
    const mayson = hrPersonRowSchema.parse({
      ...samantha,
      kind: "floor",
      staffCode: "CR008",
      name: "Mayson",
      workEmail: null,
      staffRole: "manager",
      storeName: "Carres Kelana Jaya",
      access: "pin_only",
    });
    // NOT "Manager" — labelling in SQL would fork STAFF_TIER_LABEL.
    expect(mayson.staffRole).toBe("manager");
  });
});

describe("employment and access are separate questions", () => {
  it("tones employment by where the person is in their term", () => {
    expect(employmentTone("active")).toBe("ready");
    expect(employmentTone("probation")).toBe("waiting");
    expect(employmentTone("leaving")).toBe("waiting");
    expect(employmentTone("left")).toBe("neutral");
    expect(employmentTone("not_recorded")).toBe("neutral");
  });

  it("tones access by whether it is a problem — pin_only is not one", () => {
    expect(accessTone("can_login")).toBe("ready");
    expect(accessTone("disabled")).toBe("overdue");
    expect(accessTone("pin_only")).toBe("neutral");
  });

  it("flags the row where access is cut but no exit was written down", () => {
    expect(needsExitRecorded(samantha)).toBe(true);
    // exit on file — handled, not a worklist item
    expect(needsExitRecorded({ ...samantha, exitDate: "2026-06-30" })).toBe(false);
    // still employed — obviously not
    expect(needsExitRecorded({ ...samantha, access: "can_login" })).toBe(false);
    // a PIN-only person is not disabled
    expect(needsExitRecorded({ ...samantha, access: "pin_only" })).toBe(false);
  });
});

describe("offboarding has two shapes", () => {
  it("kills sessions for an HQ login and only the PIN for floor staff", () => {
    expect(revocationShape("hq")).toBe("login_and_sessions");
    expect(revocationShape("floor")).toBe("pin");
  });
});

describe("checklists are a constant, not config", () => {
  it("serves the right list per kind", () => {
    expect(checklistFor("onboarding")).toBe(ONBOARDING_CHECKLIST);
    expect(checklistFor("offboarding")).toBe(OFFBOARDING_CHECKLIST);
  });

  it("has unique keys within each list", () => {
    for (const list of [ONBOARDING_CHECKLIST, OFFBOARDING_CHECKLIST]) {
      expect(new Set(list.map((i) => i.key)).size).toBe(list.length);
    }
  });
});

describe("the patch input", () => {
  it("accepts a partial edit", () => {
    const r = hrEmployeePatchInput.safeParse({ nationality: "Malaysian" });
    expect(r.success).toBe(true);
  });

  it("refuses an empty patch", () => {
    expect(hrEmployeePatchInput.safeParse({}).success).toBe(false);
  });

  it("will not let an exit slip in through the profile door", () => {
    // zod strips the unknown key, leaving {} — which the refine then rejects.
    // Exits must go through recordExit so the lifecycle event is written too.
    const r = hrEmployeePatchInput.safeParse({
      exit_date: "2026-06-30",
      exit_reason: "resigned",
    });
    expect(r.success).toBe(false);
  });

  it("rejects a malformed date rather than passing it to Postgres", () => {
    expect(hrEmployeePatchInput.safeParse({ join_date: "3 Mar 25" }).success).toBe(false);
    expect(hrEmployeePatchInput.safeParse({ join_date: "2025-03-03" }).success).toBe(true);
  });
});

describe("the exit input", () => {
  it("takes the three reasons and nothing else", () => {
    expect(
      hrRecordExitInput.safeParse({ exitDate: "2026-06-30", reason: "resigned" }).success,
    ).toBe(true);
    expect(
      hrRecordExitInput.safeParse({ exitDate: "2026-06-30", reason: "fired" }).success,
    ).toBe(false);
  });
});

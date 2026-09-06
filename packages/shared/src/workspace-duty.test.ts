import { describe, expect, it } from "vitest";
import {
  workspaceActionActorEvidenceSchema,
  workspaceDutyKeySchema,
  workspaceDutyResolutionSchema,
} from "./workspace-duty";

const SHASHA = "11111111-1111-4111-8111-111111111111";
const YU_JUN = "22222222-2222-4222-8222-222222222222";
const ASSIGNMENT = "33333333-3333-4333-8333-333333333333";

describe("workspaceDutyKeySchema", () => {
  it("accepts stable owner-Duty keys", () => {
    expect(workspaceDutyKeySchema.parse("po_duty")).toBe("po_duty");
  });

  it.each(["", "   ", "person@example.com", " Shasha "])(
    "rejects blank, identity-shaped, or display-name keys: %s",
    (key) => expect(() => workspaceDutyKeySchema.parse(key)).toThrow(),
  );
});

describe("workspaceDutyResolutionSchema", () => {
  it("records normal owner and today's cover without replacing either truth", () => {
    const result = workspaceDutyResolutionSchema.parse({
      dutyKey: "customer_delivery_date",
      onDate: "2026-09-04",
      normalOwner: { userId: SHASHA, name: "Shasha" },
      buddy: { userId: YU_JUN, name: "Yu Jun" },
      activeCover: { userId: YU_JUN, name: "Yu Jun" },
      actingPerson: { userId: YU_JUN, name: "Yu Jun" },
      state: "covered",
      assignmentId: ASSIGNMENT,
    });

    expect(result.normalOwner?.userId).toBe(SHASHA);
    expect(result.activeCover?.userId).toBe(YU_JUN);
    expect(result.actingPerson?.userId).toBe(YU_JUN);
  });

  it("accepts an explicit not-assigned result", () => {
    expect(
      workspaceDutyResolutionSchema.parse({
        dutyKey: "grn_duty",
        onDate: "2026-09-04",
        normalOwner: null,
        buddy: null,
        activeCover: null,
        actingPerson: null,
        state: "not_assigned",
        assignmentId: null,
      }).state,
    ).toBe("not_assigned");
  });

  it("rejects impossible resolution state combinations", () => {
    expect(() =>
      workspaceDutyResolutionSchema.parse({
        dutyKey: "grn_duty",
        onDate: "2026-09-04",
        normalOwner: null,
        buddy: null,
        activeCover: null,
        actingPerson: null,
        state: "primary",
        assignmentId: null,
      }),
    ).toThrow();
  });
});

describe("workspaceActionActorEvidenceSchema", () => {
  it("preserves normal owner, cover, and actual actor separately", () => {
    expect(
      workspaceActionActorEvidenceSchema.parse({
        dutyKey: "po_duty",
        onDate: "2026-09-04",
        normalOwnerUserId: SHASHA,
        activeCoverUserId: YU_JUN,
        actualActorUserId: YU_JUN,
        assignmentId: ASSIGNMENT,
      }),
    ).toMatchObject({ normalOwnerUserId: SHASHA, actualActorUserId: YU_JUN });
  });

  it("requires an actual actor", () => {
    expect(() =>
      workspaceActionActorEvidenceSchema.parse({
        dutyKey: "po_duty",
        onDate: "2026-09-04",
        normalOwnerUserId: SHASHA,
        activeCoverUserId: null,
        assignmentId: ASSIGNMENT,
      }),
    ).toThrow();
  });
});

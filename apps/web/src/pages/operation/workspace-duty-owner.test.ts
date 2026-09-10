import { describe, expect, it } from "vitest";
import { workspaceDutyActor } from "./workspace-duty-owner";
import type { WorkspaceDutiesResponse } from "@/lib/queries";

function duties(
  resolution: WorkspaceDutiesResponse["duties"][number]["resolution"],
): WorkspaceDutiesResponse {
  return {
    can_assign: false,
    duties: [{
      key: "po_duty",
      label: "PO Duty",
      resolution,
      assignments: [],
      covers: [],
    }],
  };
}

describe("workspaceDutyActor", () => {
  it("shows the acting person during dated cover without rewriting the normal owner", () => {
    const result = workspaceDutyActor(duties({
      duty_key: "po_duty",
      normal_user_id: "normal-user",
      normal_user_name: "Shasha",
      acting_user_id: "cover-user",
      acting_user_name: "Yu Jun",
      actor_user_id: "cover-user",
      is_cover: true,
      is_superuser: false,
      allowed: false,
      source: "assignment",
    }), "po_duty");

    expect(result).toEqual({ userId: "cover-user", name: "Yu Jun", email: "" });
  });

  it("returns no person when the shared resolver reports no assignment", () => {
    const result = workspaceDutyActor(duties({
      duty_key: "po_duty",
      normal_user_id: null,
      normal_user_name: null,
      acting_user_id: null,
      acting_user_name: null,
      actor_user_id: null,
      is_cover: false,
      is_superuser: false,
      allowed: false,
      source: "not_assigned",
    }), "po_duty");

    expect(result).toBeNull();
  });
});

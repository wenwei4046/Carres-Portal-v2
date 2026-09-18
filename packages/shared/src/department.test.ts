import { describe, expect, it } from "vitest";
import { departmentFilterQuery } from "./department";

const id = "11111111-1111-4111-8111-111111111111";

describe("departments", () => {
  it("a filter id needs a type that takes one", () => {
    expect(departmentFilterQuery.safeParse({}).success).toBe(true);
    expect(departmentFilterQuery.safeParse({ departmentType: "OFFICE" }).success).toBe(true);
    expect(departmentFilterQuery.safeParse({ departmentType: "DEALER", departmentId: id }).success).toBe(true);
    expect(departmentFilterQuery.safeParse({ departmentId: id }).success).toBe(false);
    expect(departmentFilterQuery.safeParse({ departmentType: "OFFICE", departmentId: id }).success).toBe(false);
  });
});

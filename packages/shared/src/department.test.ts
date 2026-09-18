import { describe, expect, it } from "vitest";
import { departmentAllowedOn, departmentFilterQuery, departmentMatches } from "./department";

const id = "11111111-1111-4111-8111-111111111111";

describe("departments", () => {
  it("Office has expenses only", () => {
    expect(departmentAllowedOn("OFFICE", "INCOME")).toBe(false);
    expect(departmentAllowedOn("OFFICE", "EXPENSE")).toBe(true);
    expect(departmentAllowedOn("SHOWROOM", "INCOME")).toBe(true);
  });

  it("a filter id needs a type that takes one", () => {
    expect(departmentFilterQuery.safeParse({}).success).toBe(true);
    expect(departmentFilterQuery.safeParse({ departmentType: "OFFICE" }).success).toBe(true);
    expect(departmentFilterQuery.safeParse({ departmentType: "DEALER", departmentId: id }).success).toBe(true);
    expect(departmentFilterQuery.safeParse({ departmentId: id }).success).toBe(false);
    expect(departmentFilterQuery.safeParse({ departmentType: "OFFICE", departmentId: id }).success).toBe(false);
  });

  it("matches a line by type, then by instance", () => {
    const line = { department_type: "DEALER", department_id: id };
    expect(departmentMatches(line, {})).toBe(true);
    expect(departmentMatches(line, { departmentType: "DEALER" })).toBe(true);
    expect(departmentMatches(line, { departmentType: "DEALER", departmentId: id })).toBe(true);
    expect(departmentMatches(line, { departmentType: "SHOWROOM" })).toBe(false);
    expect(departmentMatches({ department_type: null, department_id: null }, { departmentType: "OFFICE" })).toBe(false);
  });
});

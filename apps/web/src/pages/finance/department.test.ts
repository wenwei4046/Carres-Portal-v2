import { describe, expect, it } from "vitest";
import { decodeDepartment, encodeDepartment, withDepartment } from "./department";

const ID = "11111111-1111-4111-8111-111111111111";

describe("department choice", () => {
  it("round-trips a type and an instance", () => {
    expect(decodeDepartment(encodeDepartment("SHOWROOM", ID))).toEqual({ departmentType: "SHOWROOM", departmentId: ID });
    expect(decodeDepartment(encodeDepartment("OFFICE", null))).toEqual({ departmentType: "OFFICE" });
  });
  it("reads junk and an id on Office as no department", () => {
    expect(decodeDepartment("")).toEqual({});
    expect(decodeDepartment("HR")).toEqual({});
    expect(decodeDepartment(`OFFICE:${ID}`)).toEqual({});
  });
  it("leaves an unfiltered list's key and url alone", () => {
    expect(withDepartment(["a"], "/x", "")).toEqual({ queryKey: ["a"], url: "/x" });
    expect(withDepartment(["a"], "/x", `DEALER:${ID}`)).toEqual({
      queryKey: ["a", `DEALER:${ID}`], url: `/x?departmentType=DEALER&departmentId=${ID}`,
    });
  });
});

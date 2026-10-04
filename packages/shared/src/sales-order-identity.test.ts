import { describe, expect, it } from "vitest";
import { customerOrderReferenceOf, customerOrderReferenceWord, salesOrderNumberWord, salesOrderParamOf } from "./sales-order-identity";

describe("salesOrderParamOf — 【DELIVERY】 CARD 19", () => {
  it("a UUID is the id itself, lower-cased", () => {
    expect(salesOrderParamOf("DB9C939A-EBB7-4836-A2B8-866770728822")).toEqual({
      kind: "id",
      id: "db9c939a-ebb7-4836-a2b8-866770728822",
    });
  });

  it("every spelling of the document word is the number", () => {
    for (const spelling of ["SO-1362", "so-1362", "SO1362", "1362", " SO-1362 "]) {
      expect(salesOrderParamOf(spelling)).toEqual({ kind: "number", so: 1362 });
    }
  });

  it("names the number the way the portal prints it", () => {
    expect(salesOrderNumberWord(1362)).toBe("SO-1362");
  });

  it("anything else is invalid, never a guess", () => {
    for (const raw of ["", "new", "SO-", "SO-0", "0", "1362abc", "PO-2051", "db9c939a", undefined, null]) {
      expect(salesOrderParamOf(raw).kind).toBe("invalid");
    }
  });
});


describe("customer order stored identity compatibility", () => {
  it("resolves printed revisions to the exact fixed-width base, preserving leading zeroes", () => {
    expect(customerOrderReferenceOf(" so2609-0007(12) ")).toBe("SO2609-0007");
    expect(customerOrderReferenceOf("SUB2612-00007(1)")).toBe("SUB2612-00007");
  });
  it("rejects malformed series, impossible months, widened tails and invented versions", () => {
    for (const raw of ["SO2600-4827", "SO2613-4827", "SO2609-48271", "SUB2609-4827", "SUB2609-482711", "SO2609-4827(0)", "SO2609-4827(-1)", "SO2609-4827(1)extra", "PO2609-4827", "4827", null, undefined]) {
      expect(customerOrderReferenceOf(raw)).toBeNull();
    }
  });
  it("keeps stored public identity and never substitutes the internal SO sequence", () => {
    expect(customerOrderReferenceWord({ publicReference: "SUB2609-00007", so: 1362 })).toBe("SUB2609-00007");
  });
  it("preserves legacy agreements and old SO links without renumbering", () => {
    expect(customerOrderReferenceWord({ legacyReference: "RA-1003", so: 1362 })).toBe("RA-1003");
    expect(customerOrderReferenceWord({ so: 1362 })).toBe("SO-1362");
  });
});

 it("new stored public references resolve separately from the internal SO integer", () => {
  expect(salesOrderParamOf("SO2609-0007(2)")).toEqual({ kind: "reference", reference: "SO2609-0007" });
  expect(salesOrderParamOf("SUB2609-00007")).toEqual({ kind: "reference", reference: "SUB2609-00007" });
 });

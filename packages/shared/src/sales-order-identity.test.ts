import { describe, expect, it } from "vitest";
import { salesOrderNumberWord, salesOrderParamOf } from "./sales-order-identity";

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

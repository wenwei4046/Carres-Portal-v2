import { describe, expect, it } from "vitest";
import { deliveryOrderLookup } from "./delivery-order-lookup";

describe("which column finds a Delivery Order", () => {
  it("a uuid is the row id", () => {
    expect(deliveryOrderLookup("3f0c2a1e-9b7d-4c55-8a10-2f6d1b0e7a44")).toEqual({
      column: "id",
      value: "3f0c2a1e-9b7d-4c55-8a10-2f6d1b0e7a44",
    });
  });

  /* ⭐ Found 2026-09-27: the door asked `/^do-/`, so every number minted since
     0575 (`DO2609-4827`, `SDO2609-48271`) was sent to the uuid column and the
     read failed. Anything that is not a uuid is a document number. */
  it.each([
    ["DO2609-4827", "DO2609-4827"],
    ["sdo2609-48271", "SDO2609-48271"],
    ["DO-180826-3035", "DO-180826-3035"],
    [" do2609-4827 ", "DO2609-4827"],
  ])("%s is a document number", (given, value) => {
    expect(deliveryOrderLookup(given)).toEqual({ column: "do_number", value });
  });
});

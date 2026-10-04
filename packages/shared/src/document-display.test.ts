import { describe, expect, it } from "vitest";
import { documentDisplayNumber } from "./document-display";
import { receivingDisplayNo } from "./warehouse-receipt";

describe("Carres document display, without identity mutation", () => {
  it.each([
    ["GRN-20261004-1234", "GRN-261004-1234"],
    ["SCN-20261004-0020", "SCN-261004-0020"],
    ["RO20261004-1234", "RO261004-1234"],
    ["PO-20261004-1234-V2", "PO-261004-1234-V2"],
    ["PO20261004-1234(2)", "PO261004-1234(2)"],
    ["GRN-20240229-1234", "GRN-240229-1234"],
  ])("renders only the recognised year in %s", (identity, display) => {
    expect(documentDisplayNumber(identity)).toBe(display);
    expect(documentDisplayNumber(display)).toBe(display);
  });
  it.each(["GRN-261004-1234", "GRN-20260229-1234", "GRN-20261301-1234",
    "GRN-20260001-1234", "PO-2054", "U1-20261004-1234", "SO-2020", "", "20261004"])(
    "does not reinterpret legacy, short, invalid or Unit identity %s", (identity) => {
      expect(documentDisplayNumber(identity)).toBe(identity);
    },
  );
  it("requires known monthly granularity, preserving existing six-digit dates", () => {
    expect(documentDisplayNumber("DO-202610-12345")).toBe("DO-202610-12345");
    expect(documentDisplayNumber("DO-202610-12345", "month")).toBe("DO-2610-12345");
  });
  it("uses the common presentation for a stored GRN, leaving the stored value intact", () => {
    const receipt = { id: "receipt-id", grn_no: "GRN-20261004-1234" };
    expect(receivingDisplayNo(receipt)).toBe("GRN-261004-1234");
    expect(receipt.grn_no).toBe("GRN-20261004-1234");
  });
});

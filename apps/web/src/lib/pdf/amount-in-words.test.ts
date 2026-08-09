import { describe, expect, it } from "vitest";
import { amountInWords } from "./amount-in-words";

describe("amountInWords — the Golden SO's cheque line", () => {
  it("prints the Golden's own example verbatim", () => {
    expect(amountInWords(8920)).toBe(
      "RINGGIT MALAYSIA EIGHT THOUSAND NINE HUNDRED TWENTY ONLY",
    );
  });
  it("carries sen when cents exist", () => {
    expect(amountInWords(1495.5)).toBe(
      "RINGGIT MALAYSIA ONE THOUSAND FOUR HUNDRED NINETY-FIVE AND SEN FIFTY ONLY",
    );
  });
  it("zero is still a sentence", () => {
    expect(amountInWords(0)).toBe("RINGGIT MALAYSIA ZERO ONLY");
  });
  it("hyphenates twenty-one and clears hundreds", () => {
    expect(amountInWords(121_021)).toBe(
      "RINGGIT MALAYSIA ONE HUNDRED TWENTY-ONE THOUSAND TWENTY-ONE ONLY",
    );
  });
});

import { describe, expect, it } from "vitest";
import { PARTY_CODE_MESSAGE, partyCodeInput, partyLabel } from "./finance-ap";

/* 0691 (Chew 2026-10-12, 「A 可以」): a creditor's or other debtor's code in
   AutoCount's form, made by the system and changeable by Finance. */
describe("partyCodeInput", () => {
  it("takes AutoCount's form, kept in capitals", () => {
    expect(partyCodeInput.parse({ code: " 400-a001 " })).toEqual({ code: "400-A001" });
    expect(partyCodeInput.parse({ code: "305-0123" })).toEqual({ code: "305-0123" });
  });
  it("refuses any other shape with the one sentence", () => {
    for (const code of ["", "400A001", "400-AA01", "40-A001", "400-A0001", "４００-A001"]) {
      const r = partyCodeInput.safeParse({ code });
      expect(r.success).toBe(false);
      if (!r.success) expect(r.error.issues[0]!.message).toBe(PARTY_CODE_MESSAGE);
    }
  });
});

describe("partyLabel", () => {
  it("puts the code before the name when there is one", () => {
    expect(partyLabel({ name: "Armani", code: "400-A001" })).toBe("400-A001 Armani");
    expect(partyLabel({ name: "Armani", code: null })).toBe("Armani");
    expect(partyLabel({ name: "Armani" })).toBe("Armani");
  });
});

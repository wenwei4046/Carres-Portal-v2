import { describe, expect, it } from "vitest";
import { amountCell } from "./finance-widths";

describe("the Finance look's amount cell (Chew 2026-10-13)", () => {
  it("prints a zero, to the cent, as a blank cell, and any other figure in RM", () => {
    expect(amountCell(0)).toBe("");
    expect(amountCell("0.00")).toBe("");
    expect(amountCell(0.004)).toBe("");
    expect(amountCell(-0.004)).toBe("");
    expect(amountCell(1225)).toBe("RM 1,225.00");
    expect(amountCell("1225.5")).toBe("RM 1,225.50");
    expect(amountCell(-30)).toMatch(/30\.00/);
  });

  it("prints nothing for an absent or unreadable figure, never RM 0.00", () => {
    for (const v of [null, undefined, "", "not a number"]) expect(amountCell(v)).toBe("");
  });
});

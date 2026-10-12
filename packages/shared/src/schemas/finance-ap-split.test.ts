import { describe, expect, it } from "vitest";
import { splitEqually } from "./finance-ap";

/* 0689 (Chew ruling 5, 「如果一个总数就平除」): a logistics bill that gives only a
   total is split equally over its delivery orders, in whole sen. */
describe("splitEqually", () => {
  it("splits evenly when the sen divide", () => {
    expect(splitEqually(100, 4)).toEqual([25, 25, 25, 25]);
  });
  it("gives the odd sen to the first parts, so the parts add up to the total", () => {
    expect(splitEqually(100, 3)).toEqual([33.34, 33.33, 33.33]);
    expect(splitEqually(100.01, 2)).toEqual([50.01, 50]);
    const parts = splitEqually(1234.57, 7);
    expect(Math.round(parts.reduce((s, p) => s + p, 0) * 100)).toBe(123457);
  });
  it("gives nothing for no parts or a total that is not a number", () => {
    expect(splitEqually(100, 0)).toEqual([]);
    expect(splitEqually(Number.NaN, 2)).toEqual([]);
  });
});

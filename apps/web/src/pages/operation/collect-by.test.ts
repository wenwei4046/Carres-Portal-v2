import { describe, expect, it } from "vitest";
import { collectByIso, collectByPassed } from "./collect-by";

describe("collectByIso", () => {
  it("is delivery − 7 days when the order was placed earlier", () => {
    expect(collectByIso("2026-11-20", false, "2026-10-01T02:00:00Z")).toBe("2026-11-13");
  });

  it("never lands before the order was placed (SO-1372)", () => {
    // placed 29 Oct KL (28 Oct 17:00 UTC), delivery 30 Oct → not 23 Oct
    expect(collectByIso("2026-10-30", false, "2026-10-28T17:00:00Z")).toBe("2026-10-29");
  });

  it("is null with no delivery date or TBD", () => {
    expect(collectByIso(null, false, "2026-10-29T02:00:00Z")).toBeNull();
    expect(collectByIso("2026-10-30", true, "2026-10-29T02:00:00Z")).toBeNull();
  });
});

describe("collectByPassed", () => {
  it("is not passed on the collect-by day itself, passed the day after", () => {
    expect(collectByPassed("2026-10-29", new Date("2026-10-29T10:00:00Z"))).toBe(false);
    expect(collectByPassed("2026-10-29", new Date("2026-10-29T16:30:00Z"))).toBe(true); // 30 Oct 00:30 KL
    expect(collectByPassed(null)).toBe(false);
  });
});

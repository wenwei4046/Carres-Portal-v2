import { describe, expect, it } from "vitest";
import { dutyRotaMonthsToPlan } from "./workspace-duty-rota";

describe("which months the daily rota run plans", () => {
  it("checks only this month before the 25th", () => {
    expect(dutyRotaMonthsToPlan("2026-10-09")).toEqual(["2026-10-01"]);
    expect(dutyRotaMonthsToPlan("2026-10-24")).toEqual(["2026-10-01"]);
  });
  it("adds next month from the 25th, across the year end", () => {
    expect(dutyRotaMonthsToPlan("2026-10-25")).toEqual(["2026-10-01", "2026-11-01"]);
    expect(dutyRotaMonthsToPlan("2026-12-31")).toEqual(["2026-12-01", "2027-01-01"]);
  });
  it("refuses a malformed date rather than guessing", () => {
    expect(() => dutyRotaMonthsToPlan("9 Oct")).toThrow();
  });
});

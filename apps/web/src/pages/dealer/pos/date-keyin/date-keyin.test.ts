import { describe, it, expect } from "vitest";
import {
  ageOn,
  daysInMonth,
  fmtBirthday,
  fmtChipDate,
  fmtTriggerDate,
  isoFromParts,
  partsFromIso,
} from "./date-keyin";

describe("date-keyin — ISO ↔ parts", () => {
  it("round-trips and zero-pads", () => {
    expect(partsFromIso("1990-04-01")).toEqual({ y: 1990, m: 3, d: 1 });
    expect(isoFromParts({ y: 1990, m: 3, d: 1 })).toBe("1990-04-01");
  });

  it("rejects non-ISO strings", () => {
    expect(partsFromIso("")).toBeNull();
    expect(partsFromIso("01/04/1990")).toBeNull();
    expect(partsFromIso("1990-4-1")).toBeNull();
  });

  it("knows month lengths incl. leap Feb", () => {
    expect(daysInMonth(2026, 1)).toBe(28);
    expect(daysInMonth(2024, 1)).toBe(29);
    expect(daysInMonth(2026, 6)).toBe(31);
  });
});

describe("date-keyin — age", () => {
  it("ageOn flips exactly on the birthday", () => {
    const b = { y: 1990, m: 6, d: 14 }; // 14 Jul 1990
    expect(ageOn("2026-07-14", b)).toBe(36); // birthday today
    expect(ageOn("2026-07-13", b)).toBe(35); // the day before
  });
});

describe("date-keyin — formatting", () => {
  it("formats trigger / birthday / footer readouts", () => {
    expect(fmtTriggerDate("2026-07-28")).toBe("Tue, 28 Jul 2026");
    expect(fmtBirthday("1990-04-01")).toBe("01 Apr 1990");
    expect(fmtChipDate("2026-07-28")).toBe("Tue 28 Jul");
  });
});

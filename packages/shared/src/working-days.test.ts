import { describe, it, expect } from "vitest";
import {
  isWorkingDay,
  addWorkingDays,
  subtractWorkingDays,
  countWorkingDays,
} from "./working-days";

// January 2026 reference (verified): 01 Thu · 02 Fri · 03 Sat · 04 Sun · 05 Mon
// · 06 Tue · 07 Wed · 08 Thu · 09 Fri · 10 Sat · 11 Sun · 12 Mon.
// Synthetic holidays only — deterministic, independent of the real MY calendar.

describe("isWorkingDay (Mon–Sat, Sunday off)", () => {
  it("Saturday is a working day (6-day week)", () => {
    expect(isWorkingDay("2026-01-03")).toBe(true);
  });
  it("Sunday is off", () => {
    expect(isWorkingDay("2026-01-04")).toBe(false);
  });
  it("a listed holiday is off even on a weekday", () => {
    expect(isWorkingDay("2026-01-05", { holidays: ["2026-01-05"] })).toBe(false);
  });
  it("offDays override → 5-day week makes Saturday off", () => {
    expect(isWorkingDay("2026-01-03", { offDays: [0, 6] })).toBe(false);
    expect(isWorkingDay("2026-01-05", { offDays: [0, 6] })).toBe(true);
  });
});

describe("addWorkingDays (ETA projection)", () => {
  it("+1 from Friday lands on Saturday (Sat is a working day)", () => {
    expect(addWorkingDays("2026-01-02", 1)).toBe("2026-01-03");
  });
  it("+1 from Saturday skips Sunday → Monday", () => {
    expect(addWorkingDays("2026-01-03", 1)).toBe("2026-01-05");
  });
  it("n=0 returns the date unchanged, even on a Sunday", () => {
    expect(addWorkingDays("2026-01-04", 0)).toBe("2026-01-04");
  });
  it("skips both a Sunday and a holiday", () => {
    // Sat 03 +1 wd: Sun 04 (off) → Mon 05 (holiday) → Tue 06.
    expect(addWorkingDays("2026-01-03", 1, { holidays: ["2026-01-05"] })).toBe("2026-01-06");
  });
});

describe("subtractWorkingDays (procurement raise-by)", () => {
  it("-1 from Monday skips Sunday → Saturday", () => {
    expect(subtractWorkingDays("2026-01-05", 1)).toBe("2026-01-03");
  });
  it("raise-by: deadline Mon 12, lead 3 working days → Thu 08", () => {
    // back over: Sun 11 (off) → Sat 10 (1) → Fri 09 (2) → Thu 08 (3).
    expect(subtractWorkingDays("2026-01-12", 3)).toBe("2026-01-08");
  });
  it("a holiday extends the raise-by further back", () => {
    // deadline Mon 12, lead 2, Fri 09 is a holiday:
    // Sun 11 off → Sat 10 (1) → Fri 09 holiday → Thu 08 (2).
    expect(subtractWorkingDays("2026-01-12", 2, { holidays: ["2026-01-09"] })).toBe("2026-01-08");
  });
});

describe("countWorkingDays (late / countdown badges)", () => {
  it("Fri 02 → Mon 05 = 2 working days (Sat counts, Sun skipped)", () => {
    expect(countWorkingDays("2026-01-02", "2026-01-05")).toBe(2);
  });
  it("returns 0 when end is not after start", () => {
    expect(countWorkingDays("2026-01-05", "2026-01-05")).toBe(0);
    expect(countWorkingDays("2026-01-05", "2026-01-02")).toBe(0);
  });
});

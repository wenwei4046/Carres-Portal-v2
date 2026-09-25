import { describe, expect, it } from "vitest";
import { defaultBillDueDate, setTermsDaysInput } from "./finance-ap";

describe("defaultBillDueDate", () => {
  it("uses the PO's terms when set", () => {
    expect(defaultBillDueDate("2026-09-17", 14, 30)).toBe("2026-10-01");
  });
  it("falls back to the supplier's terms", () => {
    expect(defaultBillDueDate("2026-09-17", null, 30)).toBe("2026-10-17");
  });
  it("keeps a PO's 0 days rather than falling back", () => {
    expect(defaultBillDueDate("2026-09-17", 0, 30)).toBe("2026-09-17");
  });
  it("crosses month and leap-year ends", () => {
    expect(defaultBillDueDate("2028-01-31", null, 29)).toBe("2028-02-29");
    expect(defaultBillDueDate("2026-12-20", 30, null)).toBe("2027-01-19");
  });
  it("gives no due date when no terms are set or the bill date is not a date", () => {
    expect(defaultBillDueDate("2026-09-17", null, null)).toBeNull();
    expect(defaultBillDueDate("", 30, null)).toBeNull();
    expect(defaultBillDueDate("2026-13-40", 30, null)).toBeNull();
  });
});

describe("setTermsDaysInput", () => {
  it("takes whole days 0-365 or null", () => {
    expect(setTermsDaysInput.safeParse({ days: 30 }).success).toBe(true);
    expect(setTermsDaysInput.safeParse({ days: null }).success).toBe(true);
    expect(setTermsDaysInput.safeParse({ days: -1 }).success).toBe(false);
    expect(setTermsDaysInput.safeParse({ days: 1.5 }).success).toBe(false);
    expect(setTermsDaysInput.safeParse({ days: 366 }).success).toBe(false);
  });
});

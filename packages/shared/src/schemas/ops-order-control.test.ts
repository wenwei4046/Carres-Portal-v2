import { describe, expect, it } from "vitest";
import { computeStorageFee, STORAGE_RATES } from "./ops-order-control";

/**
 * Storage-fee rules (Jess 2026-06-12): accrues from the ETA, charged per
 * commenced period — mattress/bed frame RM150 / 30 days, sofa RM200 / 14 days.
 */
describe("computeStorageFee", () => {
  it("is zero with no start date", () => {
    expect(computeStorageFee({ startDate: null, asOf: "2026-06-10", hasMsbf: true, hasSof: true }).total).toBe(0);
  });

  it("is zero before / on the ETA", () => {
    expect(
      computeStorageFee({ startDate: "2026-06-10", asOf: "2026-06-10", hasMsbf: true, hasSof: true }).total,
    ).toBe(0);
    expect(
      computeStorageFee({ startDate: "2026-06-10", asOf: "2026-06-01", hasMsbf: true, hasSof: true }).total,
    ).toBe(0);
  });

  it("charges MS/BF RM150 per commenced month", () => {
    // 1 day past → first month started → RM150
    expect(computeStorageFee({ startDate: "2026-06-01", asOf: "2026-06-02", hasMsbf: true, hasSof: false }).msbf).toBe(150);
    // exactly 30 days → still 1 month
    expect(computeStorageFee({ startDate: "2026-06-01", asOf: "2026-07-01", hasMsbf: true, hasSof: false }).msbf).toBe(150);
    // 31 days → 2nd month started → RM300
    expect(computeStorageFee({ startDate: "2026-06-01", asOf: "2026-07-02", hasMsbf: true, hasSof: false }).msbf).toBe(300);
  });

  it("charges sofa RM200 per commenced 2 weeks", () => {
    expect(computeStorageFee({ startDate: "2026-06-01", asOf: "2026-06-02", hasMsbf: false, hasSof: true }).sof).toBe(200);
    expect(computeStorageFee({ startDate: "2026-06-01", asOf: "2026-06-15", hasMsbf: false, hasSof: true }).sof).toBe(200);
    expect(computeStorageFee({ startDate: "2026-06-01", asOf: "2026-06-16", hasMsbf: false, hasSof: true }).sof).toBe(400);
  });

  it("sums both categories when an order has both", () => {
    const r = computeStorageFee({ startDate: "2026-06-01", asOf: "2026-06-16", hasMsbf: true, hasSof: true });
    expect(r.msbf).toBe(150); // 15 days → 1 month
    expect(r.sof).toBe(400); // 15 days → 2 periods
    expect(r.total).toBe(550);
  });

  it("charges nothing for a category the order doesn't have", () => {
    const r = computeStorageFee({ startDate: "2026-06-01", asOf: "2026-08-01", hasMsbf: false, hasSof: false });
    expect(r.total).toBe(0);
  });

  it("exposes the agreed rates", () => {
    expect(STORAGE_RATES.msbf.amount).toBe(150);
    expect(STORAGE_RATES.msbf.periodDays).toBe(30);
    expect(STORAGE_RATES.sof.amount).toBe(200);
    expect(STORAGE_RATES.sof.periodDays).toBe(14);
  });
});

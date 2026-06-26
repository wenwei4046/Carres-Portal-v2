import { describe, expect, it } from "vitest";
import {
  computeStorageFee,
  STORAGE_RATES,
  storageCategoryForSku,
  orderStorageScope,
  computeOrderStorage,
  requestStorageWaiverInput,
  decideStorageWaiverInput,
} from "./ops-order-control";

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

/** Storage scope — the gate categorises a SKU exactly like the Payments panel
 *  (one definition, three consumers: panel, drawer, server gate). */
describe("storageCategoryForSku", () => {
  it("maps mattress / bed frame to msbf", () => {
    expect(storageCategoryForSku("mattress:Queen")).toBe("msbf");
    expect(storageCategoryForSku("BEDFRAME:King")).toBe("msbf");
    expect(storageCategoryForSku("MS1001")).toBe("msbf");
    expect(storageCategoryForSku("bf22")).toBe("msbf");
  });
  it("maps sofa to sof", () => {
    expect(storageCategoryForSku("sofa:3-seater")).toBe("sof");
    expect(storageCategoryForSku("SOF900")).toBe("sof");
    expect(storageCategoryForSku("sf12")).toBe("sof");
  });
  it("everything else is other", () => {
    expect(storageCategoryForSku("PILLOW-01")).toBe("other");
    expect(storageCategoryForSku("SVC-DISPOSAL")).toBe("other");
  });
});

describe("orderStorageScope", () => {
  it("flags msbf and sof independently across the line set", () => {
    expect(orderStorageScope(["MS1", "PILLOW"])).toEqual({ hasMsbf: true, hasSof: false });
    expect(orderStorageScope(["sofa:x"])).toEqual({ hasMsbf: false, hasSof: true });
    expect(orderStorageScope(["MS1", "sofa:x"])).toEqual({ hasMsbf: true, hasSof: true });
    expect(orderStorageScope(["PILLOW", "SVC-X"])).toEqual({ hasMsbf: false, hasSof: false });
  });
});

/** computeOrderStorage — the single "is a storage fee owed?" gate input. Owed
 *  ONLY when the operator turned storage on (storageFrom / override) — never on
 *  the ETA alone, so a normal late dispatch isn't blocked. */
describe("computeOrderStorage", () => {
  it("not due with no storage start and no override", () => {
    const r = computeOrderStorage({
      storageFrom: null,
      override: null,
      skus: ["MS1"],
      asOf: "2026-06-26",
    });
    expect(r.due).toBe(false);
    expect(r.amount).toBe(0);
  });

  it("a past ETA does NOT auto-charge — only a manual storageFrom does", () => {
    // The order is a past-ETA mattress (panel would show a potential fee) but
    // the operator never turned storage on → the GATE must not fire.
    const r = computeOrderStorage({
      storageFrom: null,
      override: null,
      skus: ["MS1"],
      asOf: "2026-06-26",
    });
    expect(r.due).toBe(false);
    expect(r.amount).toBe(0);
  });

  it("accrues from the manual storageFrom once set", () => {
    const r = computeOrderStorage({
      storageFrom: "2026-06-25",
      override: null,
      skus: ["sofa:x"],
      asOf: "2026-06-26",
    });
    expect(r.computed).toBe(200); // 1 day past the manual start → 1 sofa period
    expect(r.due).toBe(true);
  });

  it("an override alone (no storageFrom) still charges", () => {
    const r = computeOrderStorage({
      storageFrom: null,
      override: 500,
      skus: ["MS1"],
      asOf: "2026-06-26",
    });
    expect(r.amount).toBe(500);
    expect(r.due).toBe(true);
  });

  it("a manual override wins over the computed fee (even 0 → not due)", () => {
    const r = computeOrderStorage({
      storageFrom: "2026-06-01",
      override: 0,
      skus: ["MS1"],
      asOf: "2026-08-01",
    });
    expect(r.computed).toBeGreaterThan(0);
    expect(r.amount).toBe(0);
    expect(r.due).toBe(false);
  });

  it("an order with no MS/BF or sofa line is never due", () => {
    const r = computeOrderStorage({
      storageFrom: "2026-06-01",
      override: null,
      skus: ["PILLOW", "SVC-X"],
      asOf: "2026-08-01",
    });
    expect(r.due).toBe(false);
    expect(r.amount).toBe(0);
  });
});

describe("storage waiver inputs", () => {
  it("requestStorageWaiverInput needs a non-trivial reason", () => {
    expect(requestStorageWaiverInput.safeParse({ reason: "goodwill credit" }).success).toBe(true);
    expect(requestStorageWaiverInput.safeParse({ reason: "  " }).success).toBe(false);
    expect(requestStorageWaiverInput.safeParse({ reason: "ok" }).success).toBe(false);
  });

  it("decideStorageWaiverInput only allows approved | rejected", () => {
    expect(decideStorageWaiverInput.safeParse({ decision: "approved" }).success).toBe(true);
    expect(decideStorageWaiverInput.safeParse({ decision: "rejected", note: "no" }).success).toBe(true);
    expect(decideStorageWaiverInput.safeParse({ decision: "requested" }).success).toBe(false);
    expect(decideStorageWaiverInput.safeParse({ decision: "none" }).success).toBe(false);
  });
});

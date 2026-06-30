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
 * Storage-fee rules (Jess 2026-06-30, the two Delivery-Extension Google Forms —
 * supersedes the old "from ETA, per commenced period" framing): a FREE window of
 * WORKING DAYS from the ORIGINAL delivery date, then a fee. MS/BF = 24 working
 * days free → then RM150 per commenced 30-day month. Sofa = 14 working days free
 * → then a flat one-time RM200 per order (does NOT recur).
 *
 * Reference dates below anchor on Mon 2026-06-01 (a Monday) so the working-day
 * counts are easy to verify: from Mon Jun 1, +24 working days = Fri 2026-07-03,
 * +14 working days = Fri 2026-06-19 (weekends skipped, public holidays NOT
 * excluded in v1).
 */
describe("computeStorageFee", () => {
  it("is zero with no start date", () => {
    expect(computeStorageFee({ startDate: null, asOf: "2026-06-10", hasMsbf: true, hasSof: true }).total).toBe(0);
  });

  it("is zero on / before the basis date", () => {
    expect(
      computeStorageFee({ startDate: "2026-06-01", asOf: "2026-06-01", hasMsbf: true, hasSof: true }).total,
    ).toBe(0);
    expect(
      computeStorageFee({ startDate: "2026-06-10", asOf: "2026-06-01", hasMsbf: true, hasSof: true }).total,
    ).toBe(0);
  });

  it("is zero throughout each category's free working-day window", () => {
    // MS/BF: free through Fri 2026-07-03 (24 working days from Mon Jun 1).
    expect(computeStorageFee({ startDate: "2026-06-01", asOf: "2026-07-03", hasMsbf: true, hasSof: false }).msbf).toBe(0);
    // Sofa: free through Fri 2026-06-19 (14 working days).
    expect(computeStorageFee({ startDate: "2026-06-01", asOf: "2026-06-19", hasMsbf: false, hasSof: true }).sof).toBe(0);
  });

  it("exposes the free-until date per category", () => {
    const r = computeStorageFee({ startDate: "2026-06-01", asOf: "2026-06-10", hasMsbf: true, hasSof: true });
    expect(r.freeUntilMsbf).toBe("2026-07-03");
    expect(r.freeUntilSof).toBe("2026-06-19");
  });

  it("charges MS/BF RM150 per commenced month AFTER the free window", () => {
    // 1 day past the free-until (2026-07-04) → first month started → RM150
    expect(computeStorageFee({ startDate: "2026-06-01", asOf: "2026-07-04", hasMsbf: true, hasSof: false }).msbf).toBe(150);
    // exactly 30 days past free-until (2026-08-02) → still 1 month
    expect(computeStorageFee({ startDate: "2026-06-01", asOf: "2026-08-02", hasMsbf: true, hasSof: false }).msbf).toBe(150);
    // 31 days past free-until (2026-08-03) → 2nd month started → RM300
    const r = computeStorageFee({ startDate: "2026-06-01", asOf: "2026-08-03", hasMsbf: true, hasSof: false });
    expect(r.msbf).toBe(300);
    expect(r.msbfMonths).toBe(2);
  });

  it("charges sofa a flat one-time RM200 after its free window (never recurs)", () => {
    expect(computeStorageFee({ startDate: "2026-06-01", asOf: "2026-06-20", hasMsbf: false, hasSof: true }).sof).toBe(200);
    // months later → STILL just RM200 (flat per order, not per period)
    const r = computeStorageFee({ startDate: "2026-06-01", asOf: "2026-12-01", hasMsbf: false, hasSof: true });
    expect(r.sof).toBe(200);
    expect(r.sofCharged).toBe(true);
  });

  it("sums both categories once both are past their free windows", () => {
    // 2026-08-03: MS/BF 2 months (RM300) + Sofa flat (RM200)
    const r = computeStorageFee({ startDate: "2026-06-01", asOf: "2026-08-03", hasMsbf: true, hasSof: true });
    expect(r.msbf).toBe(300);
    expect(r.sof).toBe(200);
    expect(r.total).toBe(500);
  });

  it("charges nothing for a category the order doesn't have", () => {
    const r = computeStorageFee({ startDate: "2026-06-01", asOf: "2026-08-01", hasMsbf: false, hasSof: false });
    expect(r.total).toBe(0);
  });

  it("exposes the agreed rates + free windows", () => {
    expect(STORAGE_RATES.msbf.amount).toBe(150);
    expect(STORAGE_RATES.msbf.periodDays).toBe(30);
    expect(STORAGE_RATES.msbf.freeWorkingDays).toBe(24);
    expect(STORAGE_RATES.sof.amount).toBe(200);
    expect(STORAGE_RATES.sof.freeWorkingDays).toBe(14);
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

  it("accrues from the manual storageFrom once past the free window", () => {
    const r = computeOrderStorage({
      storageFrom: "2026-06-01",
      override: null,
      skus: ["sofa:x"],
      asOf: "2026-08-01", // well past the 14-working-day sofa free window
    });
    expect(r.computed).toBe(200); // flat one-time sofa storage fee
    expect(r.due).toBe(true);
  });

  it("is not yet due while still inside the free working-day window", () => {
    const r = computeOrderStorage({
      storageFrom: "2026-06-01",
      override: null,
      skus: ["sofa:x"],
      asOf: "2026-06-10", // inside the 14-working-day free window → no fee yet
    });
    expect(r.computed).toBe(0);
    expect(r.due).toBe(false);
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

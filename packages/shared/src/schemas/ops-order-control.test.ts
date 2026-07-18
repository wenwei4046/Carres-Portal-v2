import { describe, expect, it } from "vitest";
import {
  computeStorageFee,
  defaultStorageStart,
  STORAGE_RATES,
  storageCategoryForSku,
  orderStorageScope,
  computeOrderStorage,
  requestStorageWaiverInput,
  decideStorageWaiverInput,
  recordStorageExtensionInput,
  distributeOrders,
} from "./ops-order-control";

/**
 * Storage-fee rules (Jess 2026-07-13, UI-KIT §7.5 — supersedes the 2026-06-30
 * working-day-window framing): the fee runs over an explicit START→END window.
 * START = the operator's From (auto-suggested = the next SAME WEEKDAY after the
 * delivery deadline, i.e. deadline + 7 days); END = the actual delivery /
 * collection date. MS/BF = RM150 per commenced 30-day month over the window.
 * Sofa = the window's first 14 days free, then a flat one-time RM200.
 */
describe("defaultStorageStart", () => {
  it("is the next same weekday AFTER the deadline (deadline + 7 days)", () => {
    // Thu 2026-01-01 → Thu 2026-01-08 (the kit's example shape: Mon → next Mon).
    expect(defaultStorageStart("2026-01-01")).toBe("2026-01-08");
    // Mon 2026-06-01 → Mon 2026-06-08.
    expect(defaultStorageStart("2026-06-01")).toBe("2026-06-08");
    // Month/year rollover.
    expect(defaultStorageStart("2026-12-28")).toBe("2027-01-04");
  });
  it("null / malformed in → null out", () => {
    expect(defaultStorageStart(null)).toBeNull();
    expect(defaultStorageStart("01/06/2026")).toBeNull();
  });
});

describe("computeStorageFee", () => {
  it("is zero with no start date", () => {
    expect(computeStorageFee({ startDate: null, asOf: "2026-06-10", hasMsbf: true, hasSof: true }).total).toBe(0);
  });

  it("is zero while END ≤ START (charge only START→END)", () => {
    expect(
      computeStorageFee({ startDate: "2026-06-01", asOf: "2026-06-01", hasMsbf: true, hasSof: true }).total,
    ).toBe(0);
    expect(
      computeStorageFee({ startDate: "2026-06-10", asOf: "2026-06-01", hasMsbf: true, hasSof: true }).total,
    ).toBe(0);
  });

  it("charges MS/BF RM150 per commenced month over the window", () => {
    // Any window > 0 days commences the first month.
    expect(computeStorageFee({ startDate: "2026-06-01", asOf: "2026-06-02", hasMsbf: true, hasSof: false }).msbf).toBe(150);
    // Exactly 30 days → still the first month.
    expect(computeStorageFee({ startDate: "2026-06-01", asOf: "2026-07-01", hasMsbf: true, hasSof: false }).msbf).toBe(150);
    // 31 days → 2nd month commenced → RM300.
    const r = computeStorageFee({ startDate: "2026-06-01", asOf: "2026-07-02", hasMsbf: true, hasSof: false });
    expect(r.msbf).toBe(300);
    expect(r.msbfMonths).toBe(2);
  });

  it("sofa is free for the window's first 14 days, then a flat one-time RM200", () => {
    // Day 14 of the window (2026-06-15) → still free.
    expect(computeStorageFee({ startDate: "2026-06-01", asOf: "2026-06-15", hasMsbf: false, hasSof: true }).sof).toBe(0);
    // Day 15 → charged.
    expect(computeStorageFee({ startDate: "2026-06-01", asOf: "2026-06-16", hasMsbf: false, hasSof: true }).sof).toBe(200);
    // Months later → STILL just RM200 (flat per order, never recurs).
    const r = computeStorageFee({ startDate: "2026-06-01", asOf: "2026-12-01", hasMsbf: false, hasSof: true });
    expect(r.sof).toBe(200);
    expect(r.sofCharged).toBe(true);
    expect(r.freeUntilSof).toBe("2026-06-15");
  });

  it("sums both categories", () => {
    // 2026-07-02: MS/BF 2 months (RM300) + Sofa past its 14 free days (RM200).
    const r = computeStorageFee({ startDate: "2026-06-01", asOf: "2026-07-02", hasMsbf: true, hasSof: true });
    expect(r.msbf).toBe(300);
    expect(r.sof).toBe(200);
    expect(r.total).toBe(500);
  });

  it("charges nothing for a category the order doesn't have", () => {
    const r = computeStorageFee({ startDate: "2026-06-01", asOf: "2026-08-01", hasMsbf: false, hasSof: false });
    expect(r.total).toBe(0);
  });

  it("exposes the agreed rates", () => {
    expect(STORAGE_RATES.msbf.amount).toBe(150);
    expect(STORAGE_RATES.msbf.periodDays).toBe(30);
    expect(STORAGE_RATES.sof.amount).toBe(200);
    expect(STORAGE_RATES.sof.freeDays).toBe(14);
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

describe("recordStorageExtensionInput", () => {
  const base = { newDeliveryDate: "2026-08-01", reason: "Renovation", acknowledged: true } as const;

  it("accepts a valid extension", () => {
    expect(recordStorageExtensionInput.safeParse(base).success).toBe(true);
  });

  it("requires the customer acknowledgement (must be true)", () => {
    expect(recordStorageExtensionInput.safeParse({ ...base, acknowledged: false }).success).toBe(false);
    expect(recordStorageExtensionInput.safeParse({ newDeliveryDate: "2026-08-01", reason: "Renovation" }).success).toBe(false);
  });

  it("rejects an unknown reason + a malformed date", () => {
    expect(recordStorageExtensionInput.safeParse({ ...base, reason: "Holiday" }).success).toBe(false);
    expect(recordStorageExtensionInput.safeParse({ ...base, newDeliveryDate: "01/08/2026" }).success).toBe(false);
  });

  it("requires a note when the reason is Others", () => {
    expect(recordStorageExtensionInput.safeParse({ ...base, reason: "Others" }).success).toBe(false);
    expect(recordStorageExtensionInput.safeParse({ ...base, reason: "Others", note: "moving house" }).success).toBe(true);
  });
});

describe("distributeOrders (0232 staff auto-assign)", () => {
  it("hands each order to the least-loaded staff, bumping as it goes", () => {
    const plan = distributeOrders(
      ["o1", "o2", "o3", "o4"],
      [
        { userId: "a", openCount: 2 },
        { userId: "b", openCount: 0 },
      ],
    );
    // b (0) takes o1+o2 to reach 2, then they alternate a→b.
    expect(plan).toEqual([
      { orderId: "o1", userId: "b" },
      { orderId: "o2", userId: "b" },
      { orderId: "o3", userId: "a" },
      { orderId: "o4", userId: "b" },
    ]);
  });

  it("ties break on userId so concurrent sweeps converge", () => {
    const plan = distributeOrders(
      ["o1", "o2"],
      [
        { userId: "b", openCount: 1 },
        { userId: "a", openCount: 1 },
      ],
    );
    expect(plan[0]).toEqual({ orderId: "o1", userId: "a" });
    expect(plan[1]).toEqual({ orderId: "o2", userId: "b" });
  });

  it("no staff or no orders → empty plan (sweep no-ops)", () => {
    expect(distributeOrders(["o1"], [])).toEqual([]);
    expect(distributeOrders([], [{ userId: "a", openCount: 0 }])).toEqual([]);
  });

  it("never mutates the caller's load array", () => {
    const loads = [{ userId: "a", openCount: 0 }];
    distributeOrders(["o1", "o2"], loads);
    expect(loads[0]!.openCount).toBe(0);
  });
});

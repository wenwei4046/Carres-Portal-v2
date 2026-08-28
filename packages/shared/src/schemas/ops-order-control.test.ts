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
  seenTodayMYT,
  countsAsInToday,
} from "./ops-order-control";
import { DELIVERY_REASON_KEYS } from "../delivery-reasons";

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

/**
 * CARD-2026-08-28 - THE RATE ASKS THE CATALOG.
 *
 * The prefix parser above is wrong for every real SKU. Measured 2026-08-28
 * against production shapes: B1201S-K, B1201S, MODEL-C, ESS-PILLOW, B2003-Q,
 * SF-3STR, NF-MATT-K and OH-BF-Q ALL return "other", so no rate applies and
 * the fee computes RM 0 against a live RM150/month + RM200 table. `B1201S-K`
 * is the same SKU docs/orders/MASTER.md records as a production-verified
 * MATTRESS - it reads correctly everywhere the catalog is asked.
 *
 * ERP-ARCHITECTURE 6.1 (FROZEN 2026-08-06) rules that Money In's arithmetic
 * asks the CATALOG. These lock that.
 */
describe("storageCategoryForSku - the catalog answers, the parser only fills in", () => {
  it("a catalogued mattress or bed frame bills at the MS/BF rate", () => {
    expect(storageCategoryForSku("B1201S-K", "mattress")).toBe("msbf");
    expect(storageCategoryForSku("NF-MATT-K", "mattress")).toBe("msbf");
    expect(storageCategoryForSku("OH-BF-Q", "bedframe")).toBe("msbf");
  });

  it("a catalogued sofa bills at the SOF rate", () => {
    expect(storageCategoryForSku("SF-3STR", "sofa")).toBe("sof");
    expect(storageCategoryForSku("MODEL-C", "sofa")).toBe("sof");
  });

  it("a catalogued accessory is out of scope", () => {
    expect(storageCategoryForSku("ESS-PILLOW", "pillow")).toBe("other");
  });

  it("the CATALOG wins over the SKU string, both ways", () => {
    // The prefix would say msbf; the catalog says this is an accessory.
    expect(storageCategoryForSku("MS-PROTECTOR", "accessory")).toBe("other");
    // The prefix would say other; the catalog says mattress. This is the
    // measured defect - every real SKU is this case.
    expect(storageCategoryForSku("B2003-Q", "mattress")).toBe("msbf");
  });

  it("no catalog answer falls back to the parser, and says so by behaviour", () => {
    // null = asked, catalog silent. undefined = nobody asked (version skew).
    // Both keep today's behaviour rather than dropping a line out of scope.
    expect(storageCategoryForSku("MS1001", null)).toBe("msbf");
    expect(storageCategoryForSku("MS1001", undefined)).toBe("msbf");
    expect(storageCategoryForSku("B1201S-K", null)).toBe("other");
  });
});

describe("orderStorageScope - with the catalog", () => {
  it("real production SKUs come into scope once the catalog is asked", () => {
    const skus = ["B1201S-K", "ESS-PILLOW"];
    // Today, without categories: nothing is in scope. That is the defect.
    expect(orderStorageScope(skus)).toEqual({ hasMsbf: false, hasSof: false });
    // With the catalog: the mattress is in scope and the pillow is not.
    const cats = new Map([
      ["B1201S-K", "mattress"],
      ["ESS-PILLOW", "pillow"],
    ]);
    expect(orderStorageScope(skus, cats)).toEqual({ hasMsbf: true, hasSof: false });
  });

  it("a SKU absent from the catalog still falls back to the parser", () => {
    const cats = new Map([["B1201S-K", "mattress"]]);
    expect(orderStorageScope(["B1201S-K", "MS1001"], cats)).toEqual({
      hasMsbf: true,
      hasSof: false,
    });
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

  it("decideStorageWaiverInput refuses a lifecycle word as a decision", () => {
    expect(decideStorageWaiverInput.safeParse({ decision: "rejected", note: "no" }).success).toBe(true);
    expect(decideStorageWaiverInput.safeParse({ decision: "requested" }).success).toBe(false);
    expect(decideStorageWaiverInput.safeParse({ decision: "none" }).success).toBe(false);
  });
});

describe("recordStorageExtensionInput (T4 Reason Library v1)", () => {
  const base = { newDeliveryDate: "2026-08-01", reasonKey: "customer_renovation", acknowledged: true } as const;

  it("accepts a valid extension (note optional for every reason)", () => {
    expect(recordStorageExtensionInput.safeParse(base).success).toBe(true);
    expect(recordStorageExtensionInput.safeParse({ ...base, note: "site not ready" }).success).toBe(true);
  });

  it("requires the customer acknowledgement (must be true)", () => {
    expect(recordStorageExtensionInput.safeParse({ ...base, acknowledged: false }).success).toBe(false);
    expect(recordStorageExtensionInput.safeParse({ newDeliveryDate: "2026-08-01", reasonKey: "customer_renovation" }).success).toBe(false);
  });

  it("cannot be saved without a structured reason (T4 done-when)", () => {
    const { reasonKey: _drop, ...noReason } = base;
    expect(recordStorageExtensionInput.safeParse(noReason).success).toBe(false);
    // legacy labels and free text are NOT keys
    expect(recordStorageExtensionInput.safeParse({ ...base, reasonKey: "Renovation" }).success).toBe(false);
    expect(recordStorageExtensionInput.safeParse({ ...base, reasonKey: "Holiday" }).success).toBe(false);
  });

  it("rejects a malformed date", () => {
    expect(recordStorageExtensionInput.safeParse({ ...base, newDeliveryDate: "01/08/2026" }).success).toBe(false);
  });

  it("accepts every key in the library", () => {
    for (const key of DELIVERY_REASON_KEYS) {
      expect(recordStorageExtensionInput.safeParse({ ...base, reasonKey: key }).success).toBe(true);
    }
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

describe("seenTodayMYT (0235 presence)", () => {
  // 2026-07-18 10:00 MYT = 02:00 UTC.
  const now = new Date("2026-07-18T02:00:00Z");
  it("stamped earlier today (MYT) → true", () => {
    // 00:30 MYT same day = 16:30 UTC the day before.
    expect(seenTodayMYT("2026-07-17T16:30:00Z", now)).toBe(true);
  });
  it("stamped yesterday MYT → false (even if same UTC date)", () => {
    // 23:00 MYT on 17 Jul = 15:00 UTC 17 Jul.
    expect(seenTodayMYT("2026-07-17T15:00:00Z", now)).toBe(false);
  });
  it("never stamped / garbage → false", () => {
    expect(seenTodayMYT(null, now)).toBe(false);
    expect(seenTodayMYT(undefined, now)).toBe(false);
    expect(seenTodayMYT("not-a-date", now)).toBe(false);
  });
});

describe("countsAsInToday (round-3 auto-MC cutoff)", () => {
  it("before 10:00 MYT everyone counts, logged in or not", () => {
    // 09:00 MYT = 01:00 UTC.
    const morning = new Date("2026-07-18T01:00:00Z");
    expect(countsAsInToday(null, morning)).toBe(true);
    expect(countsAsInToday("2026-07-10T00:00:00Z", morning)).toBe(true);
  });
  it("from 10:00 MYT, no heartbeat today = absent", () => {
    // 10:00 MYT = 02:00 UTC.
    const cutoff = new Date("2026-07-18T02:00:00Z");
    expect(countsAsInToday(null, cutoff)).toBe(false);
    // stamped yesterday MYT → absent
    expect(countsAsInToday("2026-07-17T15:00:00Z", cutoff)).toBe(false);
    // stamped this morning → in
    expect(countsAsInToday("2026-07-18T00:30:00Z", cutoff)).toBe(true);
  });
});

// ── C9 · the manager's release decision (Jess 2026-07-27) ────────────────────
describe("decideStorageWaiverInput", () => {
  it("takes the three outcomes Jess named", () => {
    for (const decision of ["released", "waived", "rejected"] as const) {
      expect(decideStorageWaiverInput.parse({ decision }).decision).toBe(decision);
    }
  });

  it("the old single outcome still parses, and reads as WAIVED", () => {
    // A browser left open across the deploy keeps working. `approved` did
    // exactly what waiving does — the fee stopped counting the moment it was
    // approved — so mapping it anywhere else would rewrite its meaning.
    expect(decideStorageWaiverInput.parse({ decision: "approved" }).decision).toBe(
      "waived",
    );
  });

  it("refuses anything else — a release is not a free-text field", () => {
    expect(decideStorageWaiverInput.safeParse({ decision: "maybe" }).success).toBe(false);
  });
});

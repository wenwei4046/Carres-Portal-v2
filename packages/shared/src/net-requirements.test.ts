import { describe, it, expect } from "vitest";
import {
  computeNetRequirements,
  type DemandLine,
  type NetRequirementsOptions,
} from "./net-requirements";

// January 2026 reference (verified): 01 Thu · 02 Fri · 03 Sat · 04 Sun(off)
// · 05 Mon · 06 Tue · 07 Wed · 08 Thu · 09 Fri · 10 Sat · 11 Sun(off) · 12 Mon
// · 13 Tue · 14 Wed · 15 Thu · 16 Fri · 17 Sat · 19 Mon · 21 Wed · 23 Fri
// · 30 Fri. Mon/Wed/Fri weekdays = [1,3,5]. Working week Mon–Sat, no holidays.

const line = (over: Partial<DemandLine> = {}): DemandLine => ({
  lineId: over.lineId ?? "L1",
  orderId: over.orderId ?? "O1",
  sku: over.sku ?? "SKU-A",
  category: over.category ?? "mattress",
  supplierId: over.supplierId ?? "SUP-NF",
  qty: over.qty ?? 1,
  deadline: "deadline" in over ? (over.deadline ?? null) : "2026-01-30",
  leadDays: over.leadDays ?? 0,
  placedAt: over.placedAt ?? "2026-01-01",
  committed: over.committed ?? true,
});

const opts = (over: Partial<NetRequirementsOptions> = {}): NetRequirementsOptions => ({
  today: "2026-01-06",
  ...over,
});

describe("computeNetRequirements — netting", () => {
  it("no supply → toOrder equals full demand", () => {
    const r = computeNetRequirements([line({ qty: 5 })], {}, opts());
    expect(r.bySku[0].toOrder).toBe(5);
    expect(r.bySku[0].totalDemand).toBe(5);
    expect(r.lines[0].toOrder).toBe(5);
  });

  it("nets against open PO (avoid double-order across cycles)", () => {
    const r = computeNetRequirements(
      [line({ qty: 5 })],
      { openPoBySku: { "SKU-A": 2 } },
      opts(),
    );
    expect(r.bySku[0].coveredByOpenPo).toBe(2);
    expect(r.bySku[0].toOrder).toBe(3);
  });

  it("open PO fully covering demand → covered, toOrder 0", () => {
    const r = computeNetRequirements(
      [line({ qty: 2 })],
      { openPoBySku: { "SKU-A": 5 } },
      opts(),
    );
    expect(r.bySku[0].toOrder).toBe(0);
    expect(r.bundles[0].urgency).toBe("covered");
  });
});

describe("computeNetRequirements — free stock policy (Jess: label safety)", () => {
  it("does NOT consume free stock by default (advisory only)", () => {
    const r = computeNetRequirements(
      [line({ qty: 5 })],
      { freeStockBySku: { "SKU-A": 5 } },
      opts(),
    );
    expect(r.bySku[0].toOrder).toBe(5); // still ordered
    expect(r.bySku[0].coveredByFreeStock).toBe(0);
    expect(r.bySku[0].freeStock).toBe(5); // reported for the rescue lever
    expect(r.lines[0].freeStockAvailable).toBe(5);
  });

  it("consumes free stock BEFORE open PO when explicitly enabled (WMS mode)", () => {
    const r = computeNetRequirements(
      [line({ qty: 5 })],
      { freeStockBySku: { "SKU-A": 3 }, openPoBySku: { "SKU-A": 5 } },
      opts({ consumeFreeStock: true }),
    );
    expect(r.bySku[0].coveredByFreeStock).toBe(3);
    expect(r.bySku[0].coveredByOpenPo).toBe(2);
    expect(r.bySku[0].toOrder).toBe(0);
  });
});

describe("computeNetRequirements — greedy earliest-deadline-first allocation", () => {
  it("scarce open PO covers the earliest-deadline order first", () => {
    const early = line({
      lineId: "L-early",
      orderId: "O-early",
      qty: 1,
      deadline: "2026-01-20",
    });
    const late = line({
      lineId: "L-late",
      orderId: "O-late",
      qty: 1,
      deadline: "2026-01-30",
    });
    const r = computeNetRequirements(
      [late, early], // deliberately out of order
      { openPoBySku: { "SKU-A": 1 } },
      opts(),
    );
    const byLine = Object.fromEntries(r.lines.map((l) => [l.line.lineId, l]));
    expect(byLine["L-early"].coveredByOpenPo).toBe(1);
    expect(byLine["L-early"].toOrder).toBe(0);
    expect(byLine["L-late"].coveredByOpenPo).toBe(0);
    expect(byLine["L-late"].toOrder).toBe(1);
  });

  it("aggregates demand across orders for the same SKU", () => {
    const r = computeNetRequirements(
      [
        line({ lineId: "L1", orderId: "O1", qty: 2 }),
        line({ lineId: "L2", orderId: "O2", qty: 4 }),
      ],
      { openPoBySku: { "SKU-A": 1 } },
      opts(),
    );
    expect(r.bySku).toHaveLength(1);
    expect(r.bySku[0].totalDemand).toBe(6);
    expect(r.bySku[0].toOrder).toBe(5);
  });
});

describe("computeNetRequirements — bed-set delivery bundle", () => {
  it("mattress + bedframe of one order merge into ONE bundle, raise-by = deadline − MAX(leads)", () => {
    const mattress = line({
      lineId: "L-m",
      orderId: "O1",
      sku: "SKU-MAT",
      category: "mattress",
      supplierId: "SUP-NF",
      leadDays: 5,
      deadline: "2026-01-30",
    });
    const bedframe = line({
      lineId: "L-b",
      orderId: "O1",
      sku: "SKU-BF",
      category: "bedframe",
      supplierId: "SUP-OH",
      leadDays: 8, // the slower item gates the bundle
      deadline: "2026-01-30",
    });
    const r = computeNetRequirements([mattress, bedframe], {}, opts());
    expect(r.bundles).toHaveLength(1);
    const b = r.bundles[0];
    expect(b.group).toBe("bedset");
    expect(b.lineIds.sort()).toEqual(["L-b", "L-m"]);
    expect(b.supplierIds.sort()).toEqual(["SUP-NF", "SUP-OH"]);
    expect(b.maxLeadDays).toBe(8);
    // 2026-01-30 (Fri) − 8 working days = 2026-01-21 (Wed).
    expect(b.raiseBy).toBe("2026-01-21");
  });

  it("sofa is its OWN bundle, never merged with a bed-set", () => {
    const sofa = line({
      lineId: "L-s",
      orderId: "O1",
      sku: "SKU-SOFA",
      category: "sofa",
    });
    const mattress = line({
      lineId: "L-m",
      orderId: "O1",
      sku: "SKU-MAT",
      category: "mattress",
    });
    const r = computeNetRequirements([sofa, mattress], {}, opts());
    expect(r.bundles).toHaveLength(2);
    const sofaBundle = r.bundles.find((b) => b.lineIds.includes("L-s"))!;
    expect(sofaBundle.lineIds).toEqual(["L-s"]);
    expect(sofaBundle.group).toBe("sofa");
  });

  it("promiseIfOrderedToday = today + maxLead (customer one-trip promise)", () => {
    const r = computeNetRequirements(
      [line({ leadDays: 3 })],
      {},
      opts({ today: "2026-01-06" }),
    );
    // 2026-01-06 (Tue) + 3 working days = 07 Wed, 08 Thu, 09 Fri.
    expect(r.bundles[0].promiseIfOrderedToday).toBe("2026-01-09");
  });
});

describe("computeNetRequirements — urgency buckets (Mon/Wed/Fri cadence)", () => {
  const MWF = { reviewDaysBySupplier: { "SUP-NF": [1, 3, 5] } };

  // today = 2026-01-06 (Tue, NOT a review day). nextReview = 07 Wed,
  // secondReview = 09 Fri.
  it("raise-by in the past → late", () => {
    const r = computeNetRequirements(
      [line({ leadDays: 0, deadline: "2026-01-05" })],
      {},
      opts({ today: "2026-01-06", ...MWF }),
    );
    expect(r.bundles[0].urgency).toBe("late");
  });

  it("raise-by before the next scheduled review → urgent (expedite off-cycle)", () => {
    const r = computeNetRequirements(
      [line({ leadDays: 0, deadline: "2026-01-06" })], // raise-by = today
      {},
      opts({ today: "2026-01-06", ...MWF }),
    );
    expect(r.bundles[0].urgency).toBe("urgent");
  });

  it("raise-by within the next review batch → due", () => {
    const r = computeNetRequirements(
      [line({ leadDays: 0, deadline: "2026-01-08" })], // Wed ≤ 08 < Fri
      {},
      opts({ today: "2026-01-06", ...MWF }),
    );
    expect(r.bundles[0].urgency).toBe("due");
  });

  it("raise-by beyond the next batch → scheduled", () => {
    const r = computeNetRequirements(
      [line({ leadDays: 0, deadline: "2026-01-12" })], // ≥ secondReview (09)
      {},
      opts({ today: "2026-01-06", ...MWF }),
    );
    expect(r.bundles[0].urgency).toBe("scheduled");
  });

  it("TBD deadline → no_deadline, raiseBy null", () => {
    const r = computeNetRequirements(
      [line({ deadline: null })],
      {},
      opts(),
    );
    expect(r.bundles[0].urgency).toBe("no_deadline");
    expect(r.bundles[0].raiseBy).toBeNull();
    expect(r.bundles[0].deadline).toBeNull();
  });
});

describe("computeNetRequirements — lead resolves through working days + holidays", () => {
  it("raise-by skips Sundays and injected holidays", () => {
    // deadline 2026-01-30 (Fri), lead 3. Inject 2026-01-29 (Thu) as a holiday.
    // Back 3 working days from 30: skip 29(holiday), 28 Wed(1), 27 Tue(2), 26 Mon(3).
    const r = computeNetRequirements(
      [line({ leadDays: 3, deadline: "2026-01-30" })],
      {},
      opts({ holidays: ["2026-01-29"] }),
    );
    expect(r.bundles[0].raiseBy).toBe("2026-01-26");
  });
});

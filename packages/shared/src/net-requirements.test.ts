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
  offDays: over.offDays,
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

describe("computeNetRequirements — arrival buffer + per-supplier work week", () => {
  // Jan 2026 (Mon–Sat, Sun off): 24 Sat · 25 Sun(off) · 26 Mon · 27 Tue · 28 Wed
  // · 29 Thu · 30 Fri. offDays [0,6] = 5-day week (Sat+Sun off).

  it("arrival buffer pulls raise-by earlier (arrive N working days before deadline)", () => {
    // deadline 30 Fri, buffer 2 working days (6-day wk): 29(1), 28(2) → arriveBy 28.
    // lead 0 → raiseBy = 28.
    const r = computeNetRequirements(
      [line({ leadDays: 0, deadline: "2026-01-30" })],
      {},
      opts({ arrivalBufferDays: 2 }),
    );
    expect(r.bundles[0].raiseBy).toBe("2026-01-28");
  });

  it("buffer + lead stack (arriveBy then back off the lead)", () => {
    // deadline 30, buffer 2 → arriveBy 28. lead 3 (6-day): 27(1), 26(2), 24(3) → 24.
    const r = computeNetRequirements(
      [line({ leadDays: 3, deadline: "2026-01-30" })],
      {},
      opts({ arrivalBufferDays: 2 }),
    );
    expect(r.bundles[0].raiseBy).toBe("2026-01-24");
  });

  it("per-line offDays: a 5-day supplier (Sat+Sun off) orders earlier than a 6-day one", () => {
    // deadline 30, buffer 0, lead 5.
    // 6-day (Sun off): 29,28,27,26,24 → 24.
    const sixDay = computeNetRequirements(
      [line({ leadDays: 5, deadline: "2026-01-30" })],
      {},
      opts(),
    );
    expect(sixDay.bundles[0].raiseBy).toBe("2026-01-24");
    // 5-day (Sat+Sun off): 29,28,27,26,23 → 23 (earlier — Saturday is not a work day).
    const fiveDay = computeNetRequirements(
      [line({ leadDays: 5, deadline: "2026-01-30", offDays: [0, 6] })],
      {},
      opts(),
    );
    expect(fiveDay.bundles[0].raiseBy).toBe("2026-01-23");
  });

  it("bed-set spanning two suppliers gates on the EARLIEST leg", () => {
    // One order: mattress (Nice Future, 5-day, lead 5 → 23) + bedframe (Ohana,
    // 6-day, lead 5 → 24). Bundle must be ordered by the earlier leg = 23.
    const r = computeNetRequirements(
      [
        line({ lineId: "M", sku: "MAT", category: "mattress", supplierId: "NF", leadDays: 5, deadline: "2026-01-30", offDays: [0, 6] }),
        line({ lineId: "B", sku: "BED", category: "bedframe", supplierId: "OH", leadDays: 5, deadline: "2026-01-30", offDays: [0] }),
      ],
      {},
      opts(),
    );
    const bedset = r.bundles.find((b) => b.lineIds.includes("M") && b.lineIds.includes("B"));
    expect(bedset).toBeTruthy();
    expect(bedset!.raiseBy).toBe("2026-01-23");
  });
});

/* ────────────────────────────────────────────────────────────────────────────
 * PRODUCTION LEG ONLY (owner ruling, 2026-09-29)
 *
 * The supplier transit leg was removed: `raiseBy` walks back through the
 * production leg only, and the forward arithmetic that stamps a PO's
 * `eta_date` (`expectedArrivalOf`) is production only, so the two stay exact
 * inverses.
 *
 * Calendar facts used below, all verified against `working-days.ts`:
 *   Office week  = Mon–Fri            (offDays [0,6])
 *   Ohana        = Mon–Sat            (offDays [0])      production 14
 *   Nice Future  = Mon–Fri            (offDays [0,6])    production  7
 *   2026-08-31 Mon = National Day · 2026-09-16 Wed = Malaysia Day
 * ──────────────────────────────────────────────────────────────────────────── */
describe("computeNetRequirements — production leg only (transit removed, owner 2026-09-29)", () => {
  const OFFICE = [0, 6];
  const OHANA = [0];
  const HOLIDAYS = new Set(["2026-08-31", "2026-09-16"]);

  /** The exact case put to the owner: Ohana sofa, 2 Nov customer date. */
  const ohanaSofa = (over: Partial<DemandLine> = {}) =>
    line({
      supplierId: "SUP-OHANA",
      category: "sofa",
      deadline: "2026-11-02", // Monday
      leadDays: 14,
      offDays: OHANA,
      ...over,
    });

  const planOpts = (over: Partial<NetRequirementsOptions> = {}) =>
    opts({
      today: "2026-09-09",
      offDays: OFFICE,
      arrivalBufferDays: 14, // Safety days
      bundleGroupOf: () => null,
      ...over,
    });

  it("Order By = Goods Must Arrive − production days on the factory week, nothing more", () => {
    const b = computeNetRequirements([ohanaSofa()], {}, planOpts()).bundles[0];
    // Goods Must Arrive — Safety days are subtracted once.
    expect(b.arriveBy).toBe("2026-10-13"); // Tue
    // − 14 Ohana working days (Mon to Sat) = Sat 26 Sep. With the old 1-day
    // transit leg this was Fri 25 Sep; it is now one working day later.
    expect(b.raiseBy).toBe("2026-09-26");
  });

  it("a PO issued exactly ON Order By lands ON Goods Must Arrive", () => {
    const b = computeNetRequirements(
      [ohanaSofa()],
      {},
      planOpts({ today: "2026-09-26" }), // today === Order By
    ).bundles[0];

    // promiseIfOrderedToday is today + production on the factory week, the
    // same arithmetic as `expectedArrivalOf`, so it meets Goods Must Arrive.
    expect(b.raiseBy).toBe("2026-09-26");
    expect(b.promiseIfOrderedToday).toBe(b.arriveBy);
    expect(b.promiseIfOrderedToday).toBe("2026-10-13");
  });

  it("a second identical run gives the same Order By", () => {
    const once = computeNetRequirements([ohanaSofa()], {}, planOpts()).bundles[0];
    const again = computeNetRequirements([ohanaSofa()], {}, planOpts()).bundles[0];
    expect(again.raiseBy).toBe(once.raiseBy);
  });

  it("a Mon to Fri factory walks its production leg over the weekend", () => {
    // Nice Future mattress, 7 production days, deadline Mon 2026-11-02.
    // arriveBy Tue 13 Oct → − 7 Mon–Fri days → Fri 2 Oct.
    const b = computeNetRequirements(
      [
        line({
          supplierId: "SUP-NF",
          category: "mattress",
          deadline: "2026-11-02",
          leadDays: 7,
          offDays: OFFICE,
        }),
      ],
      {},
      planOpts(),
    ).bundles[0];
    expect(b.arriveBy).toBe("2026-10-13");
    expect(b.raiseBy).toBe("2026-10-02"); // Fri
  });

  it("steps over a PUBLIC HOLIDAY on the production leg (Malaysia Day, Wed 16 Sep)", () => {
    // arriveBy Thu 17 Sep. One production day walks back over Wed 16 Sep
    // (holiday) and lands on Tue 15 Sep; without the holiday set it is the 16th.
    const nf = line({
      supplierId: "SUP-NF",
      category: "mattress",
      deadline: "2026-10-07", // 14 office working days after 17 Sep
      leadDays: 1,
      offDays: OFFICE,
    });
    const withHoliday = computeNetRequirements(
      [nf],
      {},
      planOpts({ holidays: HOLIDAYS }),
    ).bundles[0];
    expect(withHoliday.arriveBy).toBe("2026-09-17");
    expect(withHoliday.raiseBy).toBe("2026-09-15"); // Tue — 16th skipped

    const noHoliday = computeNetRequirements([nf], {}, planOpts()).bundles[0];
    expect(noHoliday.raiseBy).toBe("2026-09-16");
  });

  it("a bed-set spanning two suppliers still takes the EARLIEST member raise-by", () => {
    const r = computeNetRequirements(
      [
        line({
          lineId: "L-MAT",
          supplierId: "SUP-NF",
          category: "mattress",
          deadline: "2026-11-02",
          leadDays: 7,
          offDays: OFFICE,
        }),
        line({
          lineId: "L-BED",
          supplierId: "SUP-OHANA",
          category: "bedframe",
          deadline: "2026-11-02",
          leadDays: 14,
          offDays: OHANA,
        }),
      ],
      {},
      planOpts({ bundleGroupOf: () => "bedset" }),
    );
    expect(r.bundles).toHaveLength(1);
    // Ohana's 14-day leg gates: Sat 26 Sep, earlier than Nice Future's Fri 2 Oct.
    expect(r.bundles[0].raiseBy).toBe("2026-09-26");
  });

  it("PO days never move Order By — it is calendar arithmetic, not an unlock date", () => {
    // MASTER §9.1: "Order By is a planned date, never an unlock date."
    // Live PO days are Mon · Wed · Fri = [1,3,5]. Feeding them as review days
    // changes only the urgency BUCKET; raiseBy is identical either way, and it
    // may legitimately land on a day POs are not sent (here: Saturday).
    const noReviewDays = computeNetRequirements(
      [ohanaSofa()],
      {},
      planOpts(),
    ).bundles[0];
    const withPoDays = computeNetRequirements(
      [ohanaSofa()],
      {},
      planOpts({ reviewDaysBySupplier: { "SUP-OHANA": [1, 3, 5] } }),
    ).bundles[0];
    expect(withPoDays.raiseBy).toBe(noReviewDays.raiseBy);
    expect(withPoDays.raiseBy).toBe("2026-09-26"); // a Saturday — not a PO day
  });
});

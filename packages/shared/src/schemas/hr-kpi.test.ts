import { describe, expect, it } from "vitest";
import type { CommissionLine, CommissionStaff } from "../commission";
import {
  KPI_METRICS,
  attainment,
  computeScorecards,
  kpiKeysForMigration,
  kpiMetric,
  kpiState,
  managerViewReady,
  monthEndExclusive,
  resolveKpiTargets,
  setKpiTargetInput,
  setStoreManagerInput,
  type KpiSource,
  type KpiTargetRow,
} from "./hr-kpi";

/**
 * The fixtures mirror live prod on 2026-07-26 so the expected numbers are real:
 * Carres Kelana Jaya, Mayson (CR008) RM 30,480 over 5 orders and kaan (CR009)
 * RM 21,601 over 8 — RM 52,081 total.
 */

const STORE = "11111111-1111-1111-1111-111111111111";
const ARCHIVE = "99999999-9999-9999-9999-999999999999";
const SP_MAYSON = "22222222-2222-2222-2222-222222222222";
const SP_KAAN = "33333333-3333-3333-3333-333333333333";
const EMP_MAYSON = "44444444-4444-4444-4444-444444444444";
const EMP_KAAN = "55555555-5555-5555-5555-555555555555";
const EMP_HQ = "66666666-6666-6666-6666-666666666666";

function staffRow(id: string, name: string): CommissionStaff {
  return {
    id,
    name,
    staffRole: "salesperson",
    active: true,
    dealerId: STORE,
    outletId: null,
    storeName: "Carres Kelana Jaya",
  };
}

const STAFF: CommissionStaff[] = [
  staffRow(SP_MAYSON, "Mayson"),
  staffRow(SP_KAAN, "kaan"),
];

function line(
  orderId: string,
  salespersonId: string | null,
  qty: number,
  unitPrice: number,
  dealerId = STORE,
): CommissionLine {
  return {
    orderId,
    so: 1200,
    placedAt: "2026-07-10T02:00:00Z",
    salespersonId,
    dealerId,
    outletId: null,
    modelId: null,
    modelName: null,
    category: "mattress",
    qty,
    unitPrice,
  };
}

// 30,480 over 5 orders / 21,601 over 8 orders
const LINES: CommissionLine[] = [
  ...Array.from({ length: 5 }, (_, i) => line(`m${i}`, SP_MAYSON, 1, 6096)),
  ...Array.from({ length: 8 }, (_, i) => line(`k${i}`, SP_KAAN, 1, 2700.125)),
];

function target(
  over: Partial<KpiTargetRow> & { targetValue: number; effectiveFrom: string },
): KpiTargetRow {
  return {
    id: `t-${over.effectiveFrom}-${over.employeeId ?? over.dealerId ?? "x"}`,
    kpiKey: "sales_basis",
    scopeKind: over.employeeId ? "person" : "store",
    employeeId: over.employeeId ?? null,
    dealerId: over.dealerId ?? null,
    subjectName: null,
    staffCode: null,
    note: null,
    setByName: "Loo",
    ...over,
  } as KpiTargetRow;
}

function source(over: Partial<KpiSource> = {}): KpiSource {
  return {
    targets: [],
    people: [
      {
        employeeId: EMP_MAYSON,
        appUserId: null,
        salespersonId: SP_MAYSON,
        staffCode: "CR008",
        name: "Mayson",
        positionName: null,
        departmentName: null,
        dealerId: STORE,
        storeName: "Carres Kelana Jaya",
        staffRole: "salesperson",
        canSell: true,
      },
      {
        employeeId: EMP_KAAN,
        appUserId: null,
        salespersonId: SP_KAAN,
        staffCode: "CR009",
        name: "kaan",
        positionName: null,
        departmentName: null,
        dealerId: STORE,
        storeName: "Carres Kelana Jaya",
        staffRole: "salesperson",
        canSell: true,
      },
      {
        employeeId: EMP_HQ,
        appUserId: "77777777-7777-7777-7777-777777777777",
        salespersonId: null,
        staffCode: "CR003",
        name: "Khor Yee",
        positionName: "Admin Assistant",
        departmentName: "Operation",
        dealerId: null,
        storeName: null,
        staffRole: null,
        canSell: false,
      },
    ],
    stores: [
      {
        dealerId: STORE,
        name: "Carres Kelana Jaya",
        managerUserId: null,
        managerName: null,
        staffCount: 2,
      },
    ],
    manualActuals: [],
    managerCoverage: { hqTotal: 7, hqWithManager: 1, storesTotal: 1, storesWithManager: 0 },
    managerCandidates: [],
    ...over,
  };
}

function run(over: Partial<KpiSource> = {}, kpiKey: "sales_basis" | "units_sold" | "orders_count" = "sales_basis") {
  return computeScorecards({
    kpiKey,
    year: 2026,
    month: 7,
    staff: STAFF,
    lines: LINES,
    source: source(over),
  });
}

describe("KPI_METRICS", () => {
  it("stays in step with the kpi_key CHECK in migration 0276", () => {
    // If this fails, 0276's CHECK must be widened in the SAME change — otherwise
    // the RPC raises unknown_kpi (or the insert violates the constraint) for a
    // metric the UI happily offers.
    expect(kpiKeysForMigration()).toEqual(["sales_basis", "units_sold", "orders_count"]);
  });

  it("ships nothing manual yet, so the computed path is the only live one", () => {
    expect(KPI_METRICS.every((m) => m.source === "computed")).toBe(true);
  });

  it("throws rather than silently scoring the wrong number on an unknown key", () => {
    expect(() => kpiMetric("made_up" as never)).toThrow(/unknown kpi metric/);
  });
});

describe("monthEndExclusive", () => {
  it("rolls the year over in December", () => {
    expect(monthEndExclusive(2026, 12)).toBe("2027-01-01");
  });
  it("pads single-digit months", () => {
    expect(monthEndExclusive(2026, 8)).toBe("2026-09-01");
  });
});

describe("resolveKpiTargets", () => {
  const targets = [
    target({ dealerId: STORE, targetValue: 50000, effectiveFrom: "2026-06-01" }),
    target({ dealerId: STORE, targetValue: 60000, effectiveFrom: "2026-07-01" }),
    target({ dealerId: STORE, targetValue: 70000, effectiveFrom: "2026-08-01" }),
  ];

  it("picks the latest row in force for the month", () => {
    const got = resolveKpiTargets(targets, "sales_basis", 2026, 7);
    expect(got.get(`store:${STORE}`)?.targetValue).toBe(60000);
  });

  it("ignores a target dated after the month — next quarter can be set early", () => {
    const got = resolveKpiTargets(targets, "sales_basis", 2026, 6);
    expect(got.get(`store:${STORE}`)?.targetValue).toBe(50000);
  });

  it("keeps last month's number when a new one starts later", () => {
    // The whole point of effective dating: August's raise does not rewrite July.
    expect(resolveKpiTargets(targets, "sales_basis", 2026, 8).get(`store:${STORE}`)?.targetValue).toBe(70000);
    expect(resolveKpiTargets(targets, "sales_basis", 2026, 7).get(`store:${STORE}`)?.targetValue).toBe(60000);
  });

  it("returns nothing before the first target exists", () => {
    expect(resolveKpiTargets(targets, "sales_basis", 2026, 5).size).toBe(0);
  });

  it("does not mix metrics", () => {
    const mixed = [
      target({ dealerId: STORE, targetValue: 60000, effectiveFrom: "2026-07-01" }),
      { ...target({ dealerId: STORE, targetValue: 40, effectiveFrom: "2026-07-01" }), kpiKey: "orders_count" },
    ];
    expect(resolveKpiTargets(mixed, "orders_count", 2026, 7).get(`store:${STORE}`)?.targetValue).toBe(40);
  });
});

describe("attainment", () => {
  it("floors, so 100% never appears before the target is reached", () => {
    // Rounding would print 100% beside a "Behind" pill at 99.6%.
    expect(attainment(99.6, 100)).toBe(99);
    expect(kpiState(99.6, 100)).toBe("behind");
  });

  it("agrees with the state at the boundary", () => {
    expect(attainment(100, 100)).toBe(100);
    expect(kpiState(100, 100)).toBe("on_track");
  });

  it("is null without a target rather than 0", () => {
    expect(attainment(5000, null)).toBeNull();
    expect(kpiState(5000, null)).toBe("no_target");
  });

  it("treats a zero target as no target, never as a divide", () => {
    expect(attainment(10, 0)).toBeNull();
    expect(Number.isFinite(attainment(10, 0) ?? 0)).toBe(true);
  });
});

describe("computeScorecards — the live July numbers", () => {
  it("totals the month exactly", () => {
    const s = run();
    expect(s.totals.sold).toBe(52081);
    expect(s.totals.orderCount).toBe(13);
  });

  it("scores the store against its target", () => {
    const s = run({ targets: [target({ dealerId: STORE, targetValue: 60000, effectiveFrom: "2026-07-01" })] });
    expect(s.stores[0].sold).toBe(52081);
    expect(s.stores[0].pct).toBe(86); // floor(86.8)
    expect(s.stores[0].state).toBe("behind");
  });

  it("scores each person against their own target", () => {
    const s = run({
      targets: [
        target({ employeeId: EMP_MAYSON, targetValue: 25000, effectiveFrom: "2026-07-01" }),
        target({ employeeId: EMP_KAAN, targetValue: 30000, effectiveFrom: "2026-07-01" }),
      ],
    });
    const mayson = s.people.find((p) => p.staffCode === "CR008")!;
    const kaan = s.people.find((p) => p.staffCode === "CR009")!;
    expect(mayson.sold).toBe(30480);
    expect(mayson.pct).toBe(121); // floor(121.92)
    expect(mayson.state).toBe("on_track");
    expect(kaan.sold).toBe(21601);
    expect(kaan.pct).toBe(72);
    expect(kaan.state).toBe("behind");
    expect(s.totals.onTrack).toBe(1);
    expect(s.totals.scored).toBe(2);
  });

  it("does NOT inherit the store target as a per-head figure", () => {
    // Splitting RM 60,000 across two people would be inventing a number. "No
    // target" is the true answer and the one Loo approved.
    const s = run({ targets: [target({ dealerId: STORE, targetValue: 60000, effectiveFrom: "2026-07-01" })] });
    expect(s.people.every((p) => p.target === null)).toBe(true);
    expect(s.totals.withoutTarget).toBe(2);
  });

  it("leaves HQ staff out of a sales scoreboard entirely", () => {
    const s = run();
    expect(s.people.map((p) => p.staffCode)).toEqual(["CR008", "CR009"]);
  });

  it("drops an inactive seller from the board", () => {
    const people = source().people.map((p) =>
      p.employeeId === EMP_KAAN ? { ...p, canSell: false } : p,
    );
    const s = run({ people });
    expect(s.people.map((p) => p.staffCode)).toEqual(["CR008"]);
    // ...but the store keeps their sales: the store sold what it sold.
    expect(s.stores[0].sold).toBe(52081);
  });

  it("excludes sales booked against a non-scoreable store (the archive holder)", () => {
    const lines = [...LINES, line("archive-1", SP_MAYSON, 1, 9999, ARCHIVE)];
    const s = computeScorecards({
      kpiKey: "sales_basis",
      year: 2026,
      month: 7,
      staff: STAFF,
      lines,
      source: source(),
    });
    expect(s.totals.sold).toBe(52081);
  });

  it("ignores unattributed lines and lines from unknown staff", () => {
    const lines = [
      ...LINES,
      line("orphan", null, 1, 5000),
      line("stranger", "88888888-8888-8888-8888-888888888888", 1, 5000),
    ];
    const s = computeScorecards({
      kpiKey: "sales_basis",
      year: 2026,
      month: 7,
      staff: STAFF,
      lines,
      source: source(),
    });
    expect(s.totals.sold).toBe(52081);
  });

  it("reports sales by a coded-less salesperson instead of losing them", () => {
    // The store total comes from lines, so without unscoredSold the people rows
    // would quietly fail to add up to the store row.
    const extra = staffRow("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa", "New hire");
    const s = computeScorecards({
      kpiKey: "sales_basis",
      year: 2026,
      month: 7,
      staff: [...STAFF, extra],
      lines: [...LINES, line("new-1", extra.id, 1, 1000)],
      source: source(),
    });
    expect(s.stores[0].sold).toBe(53081);
    expect(s.unscoredSold).toBe(1000);
    const peopleSum = s.people.reduce((n, p) => n + p.sold, 0);
    expect(peopleSum + s.unscoredSold).toBe(s.stores[0].sold);
  });
});

describe("computeScorecards — other metrics", () => {
  it("scores units, not money, for units_sold", () => {
    const s = run({ targets: [{ ...target({ dealerId: STORE, targetValue: 20, effectiveFrom: "2026-07-01" }), kpiKey: "units_sold" }] }, "units_sold");
    expect(s.stores[0].units).toBe(13);
    expect(s.stores[0].actual).toBe(13);
    expect(s.stores[0].pct).toBe(65);
  });

  it("scores order count for orders_count", () => {
    const s = run({ targets: [{ ...target({ dealerId: STORE, targetValue: 10, effectiveFrom: "2026-07-01" }), kpiKey: "orders_count" }] }, "orders_count");
    expect(s.stores[0].actual).toBe(13);
    expect(s.stores[0].state).toBe("on_track");
  });

  it("a computed metric ignores a stray manual row", () => {
    const s = run({
      manualActuals: [{ kpiKey: "sales_basis", employeeId: EMP_MAYSON, dealerId: null, value: 1, note: null }],
    });
    expect(s.people.find((p) => p.staffCode === "CR008")!.actual).toBe(30480);
  });
});

describe("computeScorecards — departments", () => {
  it("shows Showrooms with the STORE number, not the sum of people", () => {
    const s = run({
      targets: [
        target({ dealerId: STORE, targetValue: 60000, effectiveFrom: "2026-07-01" }),
        target({ employeeId: EMP_MAYSON, targetValue: 25000, effectiveFrom: "2026-07-01" }),
      ],
    });
    const showrooms = s.departments.find((d) => d.name === "Showrooms")!;
    expect(showrooms.actual).toBe(52081);
    expect(showrooms.target).toBe(60000); // not 25000
    expect(showrooms.pct).toBe(s.stores[0].pct); // one answer, not two
  });

  it("marks a non-selling department as not selling rather than 0%", () => {
    const ops = run().departments.find((d) => d.name === "Operation")!;
    expect(ops.sells).toBe(false);
    expect(ops.pct).toBeNull();
    expect(ops.state).toBe("no_target");
  });
});

describe("managerViewReady", () => {
  it("is off while any store has no owner", () => {
    expect(managerViewReady({ hqTotal: 7, hqWithManager: 7, storesTotal: 1, storesWithManager: 0 })).toBe(false);
  });
  it("turns on once every store is owned", () => {
    expect(managerViewReady({ hqTotal: 7, hqWithManager: 1, storesTotal: 1, storesWithManager: 1 })).toBe(true);
  });
  it("is off with no stores at all, not vacuously on", () => {
    expect(managerViewReady({ hqTotal: 7, hqWithManager: 7, storesTotal: 0, storesWithManager: 0 })).toBe(false);
  });
});

describe("inputs", () => {
  it("refuses a target with both scopes", () => {
    const r = setKpiTargetInput.safeParse({
      kpiKey: "sales_basis",
      employeeId: EMP_MAYSON,
      dealerId: STORE,
      targetValue: 1000,
      effectiveFrom: "2026-07-01",
    });
    expect(r.success).toBe(false);
  });

  it("refuses a target with neither scope", () => {
    const r = setKpiTargetInput.safeParse({
      kpiKey: "sales_basis",
      targetValue: 1000,
      effectiveFrom: "2026-07-01",
    });
    expect(r.success).toBe(false);
  });

  it("refuses a zero or negative target", () => {
    for (const targetValue of [0, -1]) {
      expect(
        setKpiTargetInput.safeParse({
          kpiKey: "sales_basis",
          dealerId: STORE,
          targetValue,
          effectiveFrom: "2026-07-01",
        }).success,
      ).toBe(false);
    }
  });

  it("refuses a non-ISO date", () => {
    expect(
      setKpiTargetInput.safeParse({
        kpiKey: "sales_basis",
        dealerId: STORE,
        targetValue: 100,
        effectiveFrom: "1 Jul 2026",
      }).success,
    ).toBe(false);
  });

  it("accepts a null owner — clearing a store's owner is a real operation", () => {
    expect(setStoreManagerInput.safeParse({ dealerId: STORE, appUserId: null }).success).toBe(true);
  });
});

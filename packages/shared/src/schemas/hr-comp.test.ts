import { describe, expect, it } from "vitest";
import {
  MANAGEMENT_GROUP,
  SHOWROOMS_GROUP,
  compGroupOf,
  computePeopleCost,
  loadedCost,
  monthInProgress,
  resolveStaffComp,
  setStaffCompInput,
  type CompPerson,
  type PeopleCostInput,
  type StaffCompRow,
  type StaffCompSource,
} from "./hr-comp";

/**
 * Fixtures mirror live prod on 2026-07-26: 9 CR-coded people (7 HQ + 2 showroom),
 * 4 of them department-less, one scoreable store, and sales covering only
 * 21–26 Jul of a 31-day month.
 */

const STORE = "11111111-1111-1111-1111-111111111111";
const E = {
  chairman: "aaaaaaa1-0000-0000-0000-000000000001",
  coo: "aaaaaaa1-0000-0000-0000-000000000002",
  admin1: "aaaaaaa1-0000-0000-0000-000000000003",
  admin2: "aaaaaaa1-0000-0000-0000-000000000004",
  bd: "aaaaaaa1-0000-0000-0000-000000000005",
  mayson: "aaaaaaa1-0000-0000-0000-000000000008",
  kaan: "aaaaaaa1-0000-0000-0000-000000000009",
};

function hq(id: string, name: string, code: string, dept: string | null, pos: string): CompPerson {
  return {
    employeeId: id, appUserId: `u-${code}`, staffCode: code, name, kind: "hq",
    positionName: pos, departmentName: dept, dealerId: null, storeName: null,
    staffRole: null, accessActive: true,
  };
}
function floor(id: string, name: string, code: string): CompPerson {
  return {
    employeeId: id, appUserId: null, staffCode: code, name, kind: "floor",
    positionName: null, departmentName: null, dealerId: STORE,
    storeName: "Carres Kelana Jaya", staffRole: "salesperson", accessActive: true,
  };
}

const PEOPLE: CompPerson[] = [
  hq(E.chairman, "principal", "CR001", null, "Chairman"),
  hq(E.coo, "Jess", "CR002", null, "COO"),
  hq(E.admin1, "Khor Yee", "CR003", "Operation", "Admin Assistant"),
  hq(E.admin2, "Yu Jun", "CR004", "Operation", "Admin Assistant"),
  hq(E.bd, "Herng", "CR007", "Business Development", "BD Executive"),
  floor(E.mayson, "Mayson", "CR008"),
  floor(E.kaan, "kaan", "CR009"),
];

function comp(
  employeeId: string,
  baseMonthly: number,
  effectiveFrom = "2026-07-01",
  over: Partial<StaffCompRow> = {},
): StaffCompRow {
  return {
    id: `c-${employeeId}-${effectiveFrom}`,
    employeeId,
    baseMonthly,
    fixedAllowance: 0,
    employerBurdenPct: 0,
    effectiveFrom,
    note: null,
    setByName: "Loo",
    ...over,
  };
}

function source(over: Partial<StaffCompSource> = {}): StaffCompSource {
  return {
    comp: [],
    people: PEOPLE,
    stores: [
      { dealerId: STORE, name: "Carres Kelana Jaya", managerUserId: null, managerName: null },
    ],
    coverage: {
      firstOrderDate: "2026-07-21",
      lastOrderDate: "2026-07-26",
      daysWithOrders: 6,
      orderCount: 19,
      daysInMonth: 31,
    },
    ...over,
  };
}

function run(over: Partial<PeopleCostInput> = {}) {
  return computePeopleCost({
    year: 2026,
    month: 7,
    source: source(),
    storeRevenue: [{ dealerId: STORE, sold: 52081 }],
    commissionCost: 0,
    // default: July is the month in progress
    today: { year: 2026, month: 7 },
    ...over,
  });
}

describe("loadedCost", () => {
  it("applies the burden to base + allowance", () => {
    expect(loadedCost({ baseMonthly: 2500, fixedAllowance: 300, employerBurdenPct: 13.7 }))
      .toBe(3183.6);
  });
  it("is just base + allowance at 0% burden", () => {
    expect(loadedCost({ baseMonthly: 3000, fixedAllowance: 500, employerBurdenPct: 0 }))
      .toBe(3500);
  });
});

describe("commission stays structurally separate (Loo: 'separate, don't merge')", () => {
  it("exposes fixedCost and commissionCost as two fields", () => {
    const r = run({ commissionCost: 1454.43 });
    expect(r.fixedCost).toBe(0); // nothing recorded in this fixture
    expect(r.commissionCost).toBe(1454.43);
  });

  it("has NO field anywhere that sums fixed cost and commission", () => {
    // This is the guard, not a style check. If someone adds a `totalCost` /
    // `totalPeopleCost` convenience field, the ruling is quietly undone: a
    // variable cost gets folded into fixed salary and avgFixedPerPerson stops
    // meaning anything. Adding such a field must fail this test.
    //
    // Both parts must be NON-ZERO and unequal, or the check passes vacuously:
    // with fixedCost 0, commissionCost trivially equals the sum. (Caught by this
    // test failing on its own first draft.)
    const r = run({
      source: source({ comp: [comp(E.mayson, 2000)] }), // fixedCost 2000
      commissionCost: 5000,
    });
    expect(r.fixedCost).toBe(2000);
    expect(r.commissionCost).toBe(5000);

    const banned = /total.*cost|cost.*total|combined|allin|all_in|grand/i;
    expect(Object.keys(r).filter((k) => banned.test(k))).toEqual([]);

    // No field anywhere on the object carries the combined 7000.
    const sum = r.fixedCost + r.commissionCost;
    const numericKeys = Object.entries(r)
      .filter(([, v]) => typeof v === "number" && v === sum)
      .map(([k]) => k);
    expect(numericKeys).toEqual([]);
  });

  it("keeps avgFixedPerPerson free of commission", () => {
    const withComp = run({
      source: source({ comp: PEOPLE.map((p) => comp(p.employeeId, 1000)) }),
      commissionCost: 999999,
    });
    // 7 people × 1000 = 7000 fixed; average must ignore the commission entirely
    expect(withComp.fixedCost).toBe(7000);
    expect(withComp.avgFixedPerPerson).toBe(1000);
  });
});

describe("resolveStaffComp", () => {
  const rows = [
    comp(E.mayson, 2000, "2026-06-01"),
    comp(E.mayson, 2500, "2026-07-01"),
    comp(E.mayson, 3000, "2026-09-01"),
  ];

  it("takes the row in force for the month", () => {
    expect(resolveStaffComp(rows, 2026, 7).get(E.mayson)?.baseMonthly).toBe(2500);
  });
  it("ignores a raise dated later — a raise can be recorded early", () => {
    expect(resolveStaffComp(rows, 2026, 6).get(E.mayson)?.baseMonthly).toBe(2000);
  });
  it("does not rewrite an earlier month when a raise lands", () => {
    expect(resolveStaffComp(rows, 2026, 9).get(E.mayson)?.baseMonthly).toBe(3000);
    expect(resolveStaffComp(rows, 2026, 7).get(E.mayson)?.baseMonthly).toBe(2500);
  });
  it("returns nothing before the first row exists", () => {
    expect(resolveStaffComp(rows, 2026, 5).size).toBe(0);
  });
});

describe("monthInProgress", () => {
  it("is true for the current month", () => {
    expect(monthInProgress(2026, 7, { year: 2026, month: 7 })).toBe(true);
  });
  it("is false once the month is over", () => {
    expect(monthInProgress(2026, 7, { year: 2026, month: 8 })).toBe(false);
  });
  it("is false for a future month", () => {
    expect(monthInProgress(2026, 9, { year: 2026, month: 7 })).toBe(false);
  });
});

describe("the ratio is gated while the month runs", () => {
  it("withholds every ratio in the current month", () => {
    // A full month of salary over six days of sales reads as a collapse.
    const r = run({ source: source({ comp: PEOPLE.map((p) => comp(p.employeeId, 1000)) }) });
    expect(r.coverage.monthInProgress).toBe(true);
    expect(r.coverage.ratioReady).toBe(false);
    expect(r.stores[0].costPctOfRevenue).toBeNull();
    expect(r.groups.find((g) => g.name === SHOWROOMS_GROUP)?.costPctOfRevenue).toBeNull();
  });

  it("produces it once the month is over — no switch to flip", () => {
    const r = run({
      source: source({ comp: [comp(E.mayson, 2500), comp(E.kaan, 2500)] }),
      today: { year: 2026, month: 8 },
    });
    expect(r.coverage.ratioReady).toBe(true);
    // 5,000 of 52,081 -> 10%
    expect(r.stores[0].costPctOfRevenue).toBe(10);
  });

  it("says so when sales cover only part of the month", () => {
    expect(run().coverage.partial).toBe(true);
  });

  it("is not 'partial' when there were simply no sales", () => {
    // No orders at all is a different fact from partial coverage.
    const r = run({
      source: source({
        coverage: { firstOrderDate: null, lastOrderDate: null, daysWithOrders: 0, orderCount: 0, daysInMonth: 31 },
      }),
    });
    expect(r.coverage.partial).toBe(false);
  });

  it("withholds the ratio when the month is over but nothing sold", () => {
    const r = run({ storeRevenue: [{ dealerId: STORE, sold: 0 }], today: { year: 2026, month: 8 } });
    expect(r.coverage.ratioReady).toBe(false);
    expect(r.stores[0].costPctOfRevenue).toBeNull();
  });
});

describe("grouping", () => {
  it("puts floor staff in Showrooms and department-less HQ in Management", () => {
    expect(compGroupOf(PEOPLE[5])).toBe(SHOWROOMS_GROUP);
    expect(compGroupOf(PEOPLE[0])).toBe(MANAGEMENT_GROUP); // Chairman, no department
    expect(compGroupOf(PEOPLE[2])).toBe("Operation");
  });

  it("counts the four department-less people as Management, not as an error", () => {
    const r = run();
    const mgmt = r.groups.find((g) => g.name === MANAGEMENT_GROUP);
    // Chairman + COO are department-less by design (they top the chart)
    expect(mgmt?.headcount).toBe(2);
    expect(mgmt?.absence).toBe("overhead");
    expect(mgmt?.revenue).toBeNull();
  });

  it("gives a non-selling department a dash with a reason, never 0%", () => {
    const ops = run().groups.find((g) => g.name === "Operation");
    expect(ops?.revenue).toBeNull();
    expect(ops?.absence).toBe("does_not_sell");
    expect(ops?.costPctOfRevenue).toBeNull();
  });

  it("marks Business Development as not enrolled rather than as zero revenue", () => {
    const bd = run().groups.find((g) => g.name === "Business Development");
    expect(bd?.absence).toBe("not_enrolled");
    expect(bd?.revenue).toBeNull();
  });

  it("attributes revenue only to Showrooms", () => {
    const r = run();
    expect(r.groups.find((g) => g.name === SHOWROOMS_GROUP)?.revenue).toBe(52081);
    expect(r.groups.filter((g) => g.revenue !== null)).toHaveLength(1);
  });
});

describe("HQ cost is never allocated to a store", () => {
  it("counts only floor staff in a store's cost", () => {
    const r = run({
      source: source({
        comp: [
          comp(E.coo, 12000), // head office
          comp(E.mayson, 2500),
          comp(E.kaan, 2500),
        ],
      }),
    });
    expect(r.fixedCost).toBe(17000);
    // the store carries its two salespeople only — not a slice of the COO
    expect(r.stores[0].fixedCost).toBe(5000);
    expect(r.stores[0].headcount).toBe(2);
  });

  it("keeps store cost + overhead adding up to the whole, with nothing invented", () => {
    const r = run({ source: source({ comp: PEOPLE.map((p) => comp(p.employeeId, 1000)) }) });
    const groupSum = r.groups.reduce((n, g) => n + g.fixedCost, 0);
    expect(groupSum).toBe(r.fixedCost);
  });
});

describe("composition + recorded counts", () => {
  it("splits base, allowance and burden so the bar adds to the total", () => {
    const r = run({
      source: source({
        comp: [comp(E.mayson, 2500, "2026-07-01", { fixedAllowance: 300, employerBurdenPct: 13.7 })],
      }),
    });
    expect(r.breakdown.base).toBe(2500);
    expect(r.breakdown.allowance).toBe(300);
    expect(r.breakdown.burden).toBe(383.6);
    expect(round(r.breakdown.base + r.breakdown.allowance + r.breakdown.burden)).toBe(r.fixedCost);
  });

  it("reports how many people still have nothing on file", () => {
    const r = run({ source: source({ comp: [comp(E.mayson, 2500)] }) });
    expect(r.headcount).toBe(7);
    expect(r.recorded).toBe(1);
    expect(r.register.filter((x) => x.compId === null)).toHaveLength(6);
  });

  it("lists the register with recorded people first, dearest first", () => {
    const r = run({
      source: source({ comp: [comp(E.mayson, 2500), comp(E.coo, 12000)] }),
    });
    expect(r.register[0].staffCode).toBe("CR002");
    expect(r.register[1].staffCode).toBe("CR008");
    expect(r.register[2].compId).toBeNull();
  });

  it("is all zeros and no crash when nothing has ever been recorded", () => {
    const r = run();
    expect(r.fixedCost).toBe(0);
    expect(r.recorded).toBe(0);
    expect(r.avgFixedPerPerson).toBe(0);
  });
});

function round(n: number) {
  return Math.round(n * 100) / 100;
}

describe("setStaffCompInput", () => {
  const good = {
    employeeId: E.mayson,
    baseMonthly: 2500,
    fixedAllowance: 300,
    employerBurdenPct: 13.7,
    effectiveFrom: "2026-07-01",
  };

  it("accepts a normal row", () => {
    expect(setStaffCompInput.safeParse(good).success).toBe(true);
  });
  it("accepts zero base — an intern or a commission-only hire is legitimate", () => {
    expect(setStaffCompInput.safeParse({ ...good, baseMonthly: 0 }).success).toBe(true);
  });
  it("refuses a negative base", () => {
    expect(setStaffCompInput.safeParse({ ...good, baseMonthly: -1 }).success).toBe(false);
  });
  it("refuses a burden over 100%", () => {
    expect(setStaffCompInput.safeParse({ ...good, employerBurdenPct: 101 }).success).toBe(false);
  });
  it("refuses a non-ISO date", () => {
    expect(setStaffCompInput.safeParse({ ...good, effectiveFrom: "1 Jul 26" }).success).toBe(false);
  });
  it("defaults allowance and burden to zero", () => {
    const r = setStaffCompInput.safeParse({
      employeeId: E.mayson, baseMonthly: 2500, effectiveFrom: "2026-07-01",
    });
    expect(r.success && r.data.fixedAllowance).toBe(0);
    expect(r.success && r.data.employerBurdenPct).toBe(0);
  });
});

import { describe, expect, it } from "vitest";

import {
  computeCommission,
  resolveMethod,
  resolveRate,
  type CommissionConfig,
  type CommissionLine,
  type CommissionStaff,
} from "./commission";

const DEALER = "d1";
const OUTLET = "o1";

const kaan: CommissionStaff = {
  id: "sp-kaan",
  name: "Kaan",
  staffRole: "salesperson",
  active: true,
  dealerId: DEALER,
  outletId: OUTLET,
};
const mayson: CommissionStaff = {
  id: "sp-mayson",
  name: "Mayson",
  staffRole: "manager",
  active: true,
  dealerId: DEALER,
  outletId: OUTLET,
};

const emptyConfig: CommissionConfig = {
  schemes: [],
  rates: [],
  modelRates: [],
  modelTiers: [],
  milestones: [],
};

function line(partial: Partial<CommissionLine>): CommissionLine {
  return {
    orderId: "ord-1",
    so: 1001,
    placedAt: "2026-07-10T10:00:00Z",
    salespersonId: kaan.id,
    dealerId: DEALER,
    outletId: OUTLET,
    modelId: "model-a",
    modelName: "Model A Mattress",
    category: "mattress",
    qty: 1,
    unitPrice: 1000,
    ...partial,
  };
}

describe("resolveMethod", () => {
  it("outlet-specific scheme wins over the store default", () => {
    const schemes = [
      { dealerId: DEALER, outletId: null, method: "percentage" as const },
      { dealerId: DEALER, outletId: OUTLET, method: "per_model" as const },
    ];
    expect(resolveMethod(schemes, DEALER, OUTLET)).toBe("per_model");
    expect(resolveMethod(schemes, DEALER, "other-outlet")).toBe("percentage");
  });

  it("defaults to percentage when nothing is configured", () => {
    expect(resolveMethod([], DEALER, OUTLET)).toBe("percentage");
  });
});

describe("resolveRate", () => {
  const rates = [
    { salespersonId: kaan.id, pct: 3, effectiveFrom: "2026-01-01" },
    { salespersonId: kaan.id, pct: 5, effectiveFrom: "2026-07-01" },
    { salespersonId: kaan.id, pct: 7, effectiveFrom: "2026-08-01" },
  ];

  it("picks the latest rate effective on or before the sale date", () => {
    expect(resolveRate(rates, kaan.id, "2026-07-15T00:00:00Z")).toBe(5);
    expect(resolveRate(rates, kaan.id, "2026-06-15T00:00:00Z")).toBe(3);
    expect(resolveRate(rates, kaan.id, "2026-08-01T00:00:00Z")).toBe(7);
  });

  it("returns 0 with no applicable row (dormant)", () => {
    expect(resolveRate(rates, "sp-unknown", "2026-07-15")).toBe(0);
    expect(resolveRate(rates, kaan.id, "2025-01-01")).toBe(0);
  });
});

describe("computeCommission — percentage method", () => {
  const config: CommissionConfig = {
    ...emptyConfig,
    rates: [
      { salespersonId: kaan.id, pct: 5, effectiveFrom: "2026-01-01" },
      { salespersonId: mayson.id, pct: 6, effectiveFrom: "2026-01-01" },
    ],
  };

  it("pays pct of pure item revenue", () => {
    const report = computeCommission(
      [kaan],
      [line({ qty: 2, unitPrice: 1500 })],
      config,
    );
    const r = report.perStaff.find((x) => x.staff.id === kaan.id)!;
    expect(r.basis).toBe(3000);
    expect(r.directCommission).toBe(150); // 5%
    expect(r.total).toBe(150);
  });

  it("manager override = (manager pct − rep pct) on rep sales; own sales at own pct", () => {
    const report = computeCommission(
      [kaan, mayson],
      [
        line({ orderId: "ord-1", salespersonId: kaan.id, unitPrice: 1000 }),
        line({ orderId: "ord-2", salespersonId: mayson.id, unitPrice: 2000 }),
      ],
      config,
    );
    const k = report.perStaff.find((x) => x.staff.id === kaan.id)!;
    const m = report.perStaff.find((x) => x.staff.id === mayson.id)!;
    expect(k.directCommission).toBe(50); // 5% of 1000 — untouched by the override
    expect(m.directCommission).toBe(120); // 6% of own 2000
    expect(m.overrideCommission).toBe(10); // 1% of kaan's 1000
    expect(m.overrideDetail).toEqual([
      { fromStaffId: kaan.id, fromStaffName: "Kaan", amount: 10 },
    ]);
    expect(m.total).toBe(130);
    expect(report.totalCommission).toBe(180);
  });

  it("no override when the manager's rate is not higher", () => {
    const flat: CommissionConfig = {
      ...emptyConfig,
      rates: [
        { salespersonId: kaan.id, pct: 6, effectiveFrom: "2026-01-01" },
        { salespersonId: mayson.id, pct: 6, effectiveFrom: "2026-01-01" },
      ],
    };
    const report = computeCommission([kaan, mayson], [line({})], flat);
    const m = report.perStaff.find((x) => x.staff.id === mayson.id)!;
    expect(m.overrideCommission).toBe(0);
  });

  it("two managers in the outlet split the override equally", () => {
    const mgr2: CommissionStaff = { ...mayson, id: "sp-mgr2", name: "Mgr Two" };
    const cfg: CommissionConfig = {
      ...emptyConfig,
      rates: [
        { salespersonId: kaan.id, pct: 5, effectiveFrom: "2026-01-01" },
        { salespersonId: mayson.id, pct: 6, effectiveFrom: "2026-01-01" },
        { salespersonId: mgr2.id, pct: 6, effectiveFrom: "2026-01-01" },
      ],
    };
    const report = computeCommission([kaan, mayson, mgr2], [line({})], cfg);
    const m1 = report.perStaff.find((x) => x.staff.id === mayson.id)!;
    const m2 = report.perStaff.find((x) => x.staff.id === mgr2.id)!;
    expect(m1.overrideCommission).toBe(5);
    expect(m2.overrideCommission).toBe(5);
  });

  it("a manager in a DIFFERENT outlet earns no override", () => {
    const otherMgr: CommissionStaff = {
      ...mayson,
      id: "sp-other",
      outletId: "o2",
    };
    const cfg: CommissionConfig = {
      ...emptyConfig,
      rates: [
        { salespersonId: kaan.id, pct: 5, effectiveFrom: "2026-01-01" },
        { salespersonId: otherMgr.id, pct: 6, effectiveFrom: "2026-01-01" },
      ],
    };
    const report = computeCommission([kaan, otherMgr], [line({})], cfg);
    const m = report.perStaff.find((x) => x.staff.id === otherMgr.id)!;
    expect(m.overrideCommission).toBe(0);
  });

  it("an inactive manager earns no override", () => {
    const inactive: CommissionStaff = { ...mayson, active: false };
    const cfg: CommissionConfig = {
      ...emptyConfig,
      rates: [
        { salespersonId: kaan.id, pct: 5, effectiveFrom: "2026-01-01" },
        { salespersonId: inactive.id, pct: 6, effectiveFrom: "2026-01-01" },
      ],
    };
    const report = computeCommission([kaan, inactive], [line({})], cfg);
    const m = report.perStaff.find((x) => x.staff.id === inactive.id)!;
    expect(m.overrideCommission).toBe(0);
  });

  it("mid-month rate change applies per order date", () => {
    const cfg: CommissionConfig = {
      ...emptyConfig,
      rates: [
        { salespersonId: kaan.id, pct: 5, effectiveFrom: "2026-01-01" },
        { salespersonId: kaan.id, pct: 10, effectiveFrom: "2026-07-15" },
      ],
    };
    const report = computeCommission(
      [kaan],
      [
        line({ orderId: "a", placedAt: "2026-07-10T00:00:00Z", unitPrice: 1000 }),
        line({ orderId: "b", placedAt: "2026-07-20T00:00:00Z", unitPrice: 1000 }),
      ],
      cfg,
    );
    const r = report.perStaff.find((x) => x.staff.id === kaan.id)!;
    expect(r.directCommission).toBe(150); // 50 + 100
    expect(r.pctUsed).toBe(10); // rate on the latest sale
  });

  it("zero config -> RM0 for everyone (dormant)", () => {
    const report = computeCommission([kaan, mayson], [line({})], emptyConfig);
    expect(report.totalCommission).toBe(0);
    expect(report.perStaff).toHaveLength(2); // staff still listed
  });
});

describe("computeCommission — per_model method", () => {
  const perModelScheme = [
    { dealerId: DEALER, outletId: null, method: "per_model" as const },
  ];

  it("pays per-unit amount per model", () => {
    const cfg: CommissionConfig = {
      ...emptyConfig,
      schemes: perModelScheme,
      modelRates: [
        { modelId: "model-a", perUnitAmount: 50 },
        { modelId: "model-b", perUnitAmount: 60 },
      ],
    };
    const report = computeCommission(
      [kaan],
      [
        line({ orderId: "a", modelId: "model-a", qty: 2 }),
        line({ orderId: "b", modelId: "model-b", modelName: "Model B", qty: 1 }),
      ],
      cfg,
    );
    const r = report.perStaff.find((x) => x.staff.id === kaan.id)!;
    expect(r.perModelCommission).toBe(160); // 2×50 + 1×60
    expect(r.basis).toBe(0); // percentage basis untouched
    expect(r.total).toBe(160);
  });

  it("highest reached model tier pays (not cumulative)", () => {
    const cfg: CommissionConfig = {
      ...emptyConfig,
      schemes: perModelScheme,
      modelRates: [{ modelId: "model-a", perUnitAmount: 50 }],
      modelTiers: [
        { modelId: "model-a", thresholdQty: 10, bonusAmount: 100 },
        { modelId: "model-a", thresholdQty: 15, bonusAmount: 500 },
      ],
    };
    const at12 = computeCommission([kaan], [line({ qty: 12 })], cfg);
    const r12 = at12.perStaff.find((x) => x.staff.id === kaan.id)!;
    expect(r12.perModel[0].tierBonus).toBe(100);
    expect(r12.perModelCommission).toBe(700); // 12×50 + 100

    const at15 = computeCommission([kaan], [line({ qty: 15 })], cfg);
    const r15 = at15.perStaff.find((x) => x.staff.id === kaan.id)!;
    expect(r15.perModel[0].tierBonus).toBe(500); // NOT 600
    expect(r15.perModelCommission).toBe(1250);

    const at9 = computeCommission([kaan], [line({ qty: 9 })], cfg);
    const r9 = at9.perStaff.find((x) => x.staff.id === kaan.id)!;
    expect(r9.perModel[0].tierBonus).toBe(0);
  });

  it("overall milestone counts units across models, filtered by category", () => {
    const cfg: CommissionConfig = {
      ...emptyConfig,
      schemes: perModelScheme,
      milestones: [
        { category: "mattress", thresholdQty: 30, bonusAmount: 1000 },
        { category: null, thresholdQty: 40, bonusAmount: 2000 },
      ],
    };
    const lines: CommissionLine[] = [
      line({ orderId: "a", modelId: "model-a", qty: 20, category: "mattress" }),
      line({ orderId: "b", modelId: "model-b", qty: 12, category: "mattress" }),
      line({
        orderId: "c",
        modelId: "model-s",
        modelName: "Sofa S",
        qty: 9,
        category: "sofa",
      }),
    ];
    const report = computeCommission([kaan], lines, cfg);
    const r = report.perStaff.find((x) => x.staff.id === kaan.id)!;
    // 32 mattresses >= 30 -> RM1000; 41 total >= 40 -> RM2000
    expect(r.milestoneCommission).toBe(3000);
    expect(r.milestones).toHaveLength(2);
  });

  it("within one milestone category group, only the highest reached pays", () => {
    const cfg: CommissionConfig = {
      ...emptyConfig,
      schemes: perModelScheme,
      milestones: [
        { category: "mattress", thresholdQty: 10, bonusAmount: 300 },
        { category: "mattress", thresholdQty: 30, bonusAmount: 1000 },
      ],
    };
    const report = computeCommission(
      [kaan],
      [line({ qty: 32, category: "mattress" })],
      cfg,
    );
    const r = report.perStaff.find((x) => x.staff.id === kaan.id)!;
    expect(r.milestoneCommission).toBe(1000); // NOT 1300
  });

  it("no manager override under per_model", () => {
    const cfg: CommissionConfig = {
      ...emptyConfig,
      schemes: perModelScheme,
      modelRates: [{ modelId: "model-a", perUnitAmount: 50 }],
      rates: [{ salespersonId: mayson.id, pct: 6, effectiveFrom: "2026-01-01" }],
    };
    const report = computeCommission([kaan, mayson], [line({})], cfg);
    const m = report.perStaff.find((x) => x.staff.id === mayson.id)!;
    expect(m.overrideCommission).toBe(0);
  });
});

describe("computeCommission — mixed / edge cases", () => {
  it("outlet on per_model + store default percentage: each line follows ITS outlet", () => {
    const cfg: CommissionConfig = {
      ...emptyConfig,
      schemes: [
        { dealerId: DEALER, outletId: null, method: "percentage" },
        { dealerId: DEALER, outletId: "o2", method: "per_model" },
      ],
      rates: [{ salespersonId: kaan.id, pct: 5, effectiveFrom: "2026-01-01" }],
      modelRates: [{ modelId: "model-a", perUnitAmount: 50 }],
    };
    const report = computeCommission(
      [kaan],
      [
        line({ orderId: "a", outletId: OUTLET, unitPrice: 1000 }),
        line({ orderId: "b", outletId: "o2", qty: 2 }),
      ],
      cfg,
    );
    const r = report.perStaff.find((x) => x.staff.id === kaan.id)!;
    expect(r.directCommission).toBe(50);
    expect(r.perModelCommission).toBe(100);
    expect(r.total).toBe(150);
  });

  it("unattributed and unknown-staff lines are skipped", () => {
    const cfg: CommissionConfig = {
      ...emptyConfig,
      rates: [{ salespersonId: kaan.id, pct: 5, effectiveFrom: "2026-01-01" }],
    };
    const report = computeCommission(
      [kaan],
      [
        line({ salespersonId: null }),
        line({ salespersonId: "sp-ghost", orderId: "g" }),
      ],
      cfg,
    );
    expect(report.totalCommission).toBe(0);
  });

  it("orderCount counts distinct orders, not lines", () => {
    const cfg: CommissionConfig = {
      ...emptyConfig,
      rates: [{ salespersonId: kaan.id, pct: 5, effectiveFrom: "2026-01-01" }],
    };
    const report = computeCommission(
      [kaan],
      [line({ orderId: "a" }), line({ orderId: "a" }), line({ orderId: "b" })],
      cfg,
    );
    const r = report.perStaff.find((x) => x.staff.id === kaan.id)!;
    expect(r.orderCount).toBe(2);
  });

  it("rounds money to 2dp", () => {
    const cfg: CommissionConfig = {
      ...emptyConfig,
      rates: [{ salespersonId: kaan.id, pct: 3.33, effectiveFrom: "2026-01-01" }],
    };
    const report = computeCommission([kaan], [line({ unitPrice: 999.99 })], cfg);
    const r = report.perStaff.find((x) => x.staff.id === kaan.id)!;
    expect(r.directCommission).toBe(33.3); // 33.299667 -> 33.30
  });
});

// ── 0250 — BD commission ─────────────────────────────────────────────────────
import {
  computeBdCommission,
  type BdDealer,
  type BdUser,
  type DealerOrderAgg,
} from "./commission";

describe("computeBdCommission", () => {
  const herng: BdUser = { id: "bd-1", name: "Herng", email: "hugo@carres.com" };
  const hq: BdUser = { id: "bd-2", name: "BD HQ", email: "bd@carres.com" };
  const dealers: BdDealer[] = [
    { id: "dl-1", name: "Litte Mattress", bdOwnerUserId: "bd-1" },
    { id: "dl-2", name: "Другой Store", bdOwnerUserId: "bd-1" },
    { id: "dl-3", name: "Orphan Dealer", bdOwnerUserId: null },
  ];
  const rates = [{ userId: "bd-1", pct: 2, effectiveFrom: "2026-01-01" }];
  const order = (o: Partial<DealerOrderAgg>): DealerOrderAgg => ({
    orderId: "o1",
    so: 1001,
    placedAt: "2026-07-10T00:00:00Z",
    dealerId: "dl-1",
    amount: 10000,
    ...o,
  });

  it("pays pct of owned dealers' monthly sales, grouped by dealer", () => {
    const r = computeBdCommission({
      users: [herng, hq],
      dealers,
      orders: [
        order({ orderId: "a", dealerId: "dl-1", amount: 10000 }),
        order({ orderId: "b", dealerId: "dl-2", amount: 5000 }),
      ],
      rates,
    });
    const h = r.perBd.find((x) => x.user.id === "bd-1")!;
    expect(h.basis).toBe(15000);
    expect(h.commission).toBe(300); // 2%
    expect(h.dealerCount).toBe(2);
    expect(h.portfolio).toHaveLength(2);
    expect(h.portfolio[0].amount).toBe(10000);
    const other = r.perBd.find((x) => x.user.id === "bd-2")!;
    expect(other.commission).toBe(0);
    expect(r.totalCommission).toBe(300);
  });

  it("an unassigned dealer's sales pay nobody and the dealer is surfaced", () => {
    const r = computeBdCommission({
      users: [herng],
      dealers,
      orders: [order({ dealerId: "dl-3", amount: 9999 })],
      rates,
    });
    expect(r.totalCommission).toBe(0);
    expect(r.unassignedDealers.map((d) => d.id)).toEqual(["dl-3"]);
  });

  it("rate is picked as-of each order's date (effective-dated)", () => {
    const r = computeBdCommission({
      users: [herng],
      dealers,
      orders: [
        order({ orderId: "a", placedAt: "2026-07-05T00:00:00Z", amount: 1000 }),
        order({ orderId: "b", placedAt: "2026-07-20T00:00:00Z", amount: 1000 }),
      ],
      rates: [
        { userId: "bd-1", pct: 2, effectiveFrom: "2026-01-01" },
        { userId: "bd-1", pct: 4, effectiveFrom: "2026-07-15" },
      ],
    });
    const h = r.perBd.find((x) => x.user.id === "bd-1")!;
    expect(h.commission).toBe(60); // 20 + 40
    expect(h.pctUsed).toBe(4);
  });

  it("no rate row -> RM0 (dormant)", () => {
    const r = computeBdCommission({ users: [herng], dealers, orders: [order({})], rates: [] });
    expect(r.totalCommission).toBe(0);
    expect(r.perBd[0].basis).toBe(10000); // basis still visible
  });
});

describe("computeBdCommission v2 — positions + item KPI (0251)", () => {
  const exec: BdUser = { id: "bd-e", name: "Exec", email: "e@c.com", position: "executive" };
  const cbo: BdUser = { id: "bd-c", name: "CBO", email: "c@c.com", position: "cbo" };
  const dealers: BdDealer[] = [
    { id: "dl-1", name: "Dealer One", bdOwnerUserId: "bd-e" },
    { id: "dl-2", name: "CBO Own Store", bdOwnerUserId: "bd-c" },
  ];
  const rates = [
    { userId: "bd-e", pct: 2, effectiveFrom: "2026-01-01" },
    { userId: "bd-c", pct: 3, effectiveFrom: "2026-01-01" },
  ];
  const order = (o: Partial<DealerOrderAgg>): DealerOrderAgg => ({
    orderId: "o1", so: 1001, placedAt: "2026-07-10T00:00:00Z",
    dealerId: "dl-1", amount: 10000, ...o,
  });

  it("CBO earns the rate difference on an executive's dealer sales; own dealers at own rate", () => {
    const r = computeBdCommission({
      users: [exec, cbo],
      dealers,
      orders: [
        order({ orderId: "a", dealerId: "dl-1", amount: 10000 }),
        order({ orderId: "b", dealerId: "dl-2", amount: 4000 }),
      ],
      rates,
    });
    const e = r.perBd.find((x) => x.user.id === "bd-e")!;
    const c = r.perBd.find((x) => x.user.id === "bd-c")!;
    expect(e.directCommission).toBe(200); // 2% of 10000
    expect(c.directCommission).toBe(120); // 3% of own 4000
    expect(c.overrideCommission).toBe(100); // 1% diff on exec's 10000
    expect(c.overrideDetail[0].fromStaffName).toBe("Exec");
    expect(c.commission).toBe(220);
    // no override chain onto the CBO's own dealer sales
    expect(e.overrideCommission).toBe(0);
  });

  it("per_model (item KPI): per-unit + tier + milestone from program='bd' rows only", () => {
    const dealerLines = [
      {
        orderId: "a", so: 1001, placedAt: "2026-07-10T00:00:00Z", dealerId: "dl-1",
        modelId: "m-a", modelName: "Model A", category: "mattress", qty: 12, unitPrice: 1000,
      },
    ];
    const r = computeBdCommission({
      users: [exec],
      dealers,
      orders: [],
      rates,
      method: "per_model",
      dealerLines,
      modelRates: [
        { modelId: "m-a", perUnitAmount: 50, program: "bd" },
        { modelId: "m-a", perUnitAmount: 999, program: "staff" }, // staff row ignored
      ],
      modelTiers: [
        { modelId: "m-a", thresholdQty: 10, bonusAmount: 100, program: "bd" },
      ],
      milestones: [
        { category: "mattress", thresholdQty: 10, bonusAmount: 500, program: "bd" },
        { category: "mattress", thresholdQty: 10, bonusAmount: 9999, program: "staff" },
      ],
    });
    const e = r.perBd.find((x) => x.user.id === "bd-e")!;
    expect(e.perModelCommission).toBe(700); // 12×50 + 100 tier
    expect(e.milestoneCommission).toBe(500);
    expect(e.directCommission).toBe(0); // no percentage under per_model
    expect(e.commission).toBe(1200);
    expect(r.method).toBe("per_model");
  });

  it("staff engine ignores program='bd' per-model rows", () => {
    const staffKaan: CommissionStaff = {
      id: "sp-1", name: "K", staffRole: "salesperson", active: true,
      dealerId: "d1", outletId: null,
    };
    const report = computeCommission(
      [staffKaan],
      [line({ salespersonId: "sp-1", dealerId: "d1", outletId: null, qty: 5 })],
      {
        schemes: [{ dealerId: "d1", outletId: null, method: "per_model" }],
        rates: [],
        modelRates: [{ modelId: "model-a", perUnitAmount: 77, program: "bd" }],
        modelTiers: [],
        milestones: [],
      },
    );
    expect(report.perStaff[0].perModelCommission).toBe(0);
  });
});

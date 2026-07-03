import { describe, it, expect } from "vitest";
import {
  ageBandOf,
  ageOf,
  buyerDemographics,
  genderDistribution,
  monthlyRevenue,
  productRollup,
  raceDistribution,
  spendBySegment,
  summarizeOverview,
  type AnalyticsLine,
  type AnalyticsOrder,
} from "./sales-analysis";

const AT = new Date("2026-07-03T00:00:00Z");

function order(over: Partial<AnalyticsOrder> = {}): AnalyticsOrder {
  return {
    so: 1301,
    placedAt: "2026-06-15T10:00:00Z",
    channel: "dealer",
    revenue: 1000,
    deliveryFee: 0,
    paid: 0,
    cogs: null,
    race: null,
    gender: null,
    birthday: null,
    ...over,
  };
}

function line(over: Partial<AnalyticsLine> = {}): AnalyticsLine {
  return {
    so: 1301,
    placedAt: "2026-06-15T10:00:00Z",
    sku: "CLOUD-QUEEN",
    model: "Carres Cloud",
    category: "mattress",
    qty: 1,
    revenue: 1000,
    cost: null,
    race: null,
    gender: null,
    birthday: null,
    ...over,
  };
}

describe("ageOf / ageBandOf", () => {
  it("computes precise age, respecting whether the birthday has passed", () => {
    expect(ageOf("1990-07-03", AT)).toBe(36); // birthday today → already turned
    expect(ageOf("1990-07-04", AT)).toBe(35); // tomorrow → not yet
  });
  it("bands correctly and returns null for missing/garbage", () => {
    expect(ageBandOf("2005-01-01", AT)).toBe("<25");
    expect(ageBandOf("1995-01-01", AT)).toBe("25–34");
    expect(ageBandOf("1985-01-01", AT)).toBe("35–44");
    expect(ageBandOf("1975-01-01", AT)).toBe("45–54");
    expect(ageBandOf("1960-01-01", AT)).toBe("55+");
    expect(ageBandOf(null, AT)).toBeNull();
    expect(ageBandOf("not-a-date", AT)).toBeNull();
  });
});

describe("summarizeOverview", () => {
  it("computes orders / revenue / AOV / delivery / margin over cogs-complete orders only", () => {
    const kpis = summarizeOverview([
      order({ revenue: 1000, deliveryFee: 100, cogs: 600 }),
      order({ revenue: 3000, deliveryFee: 0, cogs: null }), // no cost → excluded from margin
    ]);
    expect(kpis.orders).toBe(2);
    expect(kpis.revenue).toBe(4000);
    expect(kpis.aov).toBe(2000);
    expect(kpis.avgDeliveryFee).toBe(50);
    expect(kpis.cogsCompleteOrders).toBe(1);
    expect(kpis.grossMarginPct).toBeCloseTo(40); // (1000-600)/1000
  });
  it("empty set → zeros + null margin", () => {
    const kpis = summarizeOverview([]);
    expect(kpis.orders).toBe(0);
    expect(kpis.grossMarginPct).toBeNull();
  });
});

describe("monthlyRevenue", () => {
  it("groups by placed month, sorted ascending", () => {
    const bars = monthlyRevenue([
      order({ placedAt: "2026-05-01T00:00:00Z", revenue: 100 }),
      order({ placedAt: "2026-06-15T00:00:00Z", revenue: 200 }),
      order({ placedAt: "2026-06-20T00:00:00Z", revenue: 50 }),
    ]);
    expect(bars.map((b) => b.key)).toEqual(["2026-05", "2026-06"]);
    expect(bars[1]).toMatchObject({ revenue: 250, orders: 2 });
  });
});

describe("distributions + segments", () => {
  const orders = [
    order({ race: "Chinese", gender: "Female", birthday: "1990-01-01", revenue: 1000 }),
    order({ race: "Chinese", gender: "Male", birthday: "1960-01-01", revenue: 3000 }),
    order({ race: "Malay", gender: "Female", birthday: null, revenue: 2000 }),
    order({ race: null, gender: null, birthday: null, revenue: 500 }), // pre-0200 row
  ];
  it("race distribution uses only rows that carry the field", () => {
    const d = raceDistribution(orders);
    expect(d.total).toBe(4);
    expect(d.known).toBe(3);
    expect(d.rows[0]).toMatchObject({ label: "Chinese", count: 2 });
    expect(d.rows[0].pct).toBeCloseTo((2 / 3) * 100);
  });
  it("gender distribution mirrors", () => {
    expect(genderDistribution(orders).rows[0]).toMatchObject({ label: "Female", count: 2 });
  });
  it("spendBySegment ranks by revenue with AOV", () => {
    const segs = spendBySegment(orders, "race");
    expect(segs[0]).toMatchObject({ label: "Chinese", orders: 2, revenue: 4000, aov: 2000 });
    expect(segs[1]).toMatchObject({ label: "Malay", revenue: 2000 });
  });
});

describe("productRollup + buyerDemographics", () => {
  const lines = [
    line({ model: "Carres Cloud", qty: 2, revenue: 2000, cost: 1200 }),
    line({ model: "Carres Cloud", qty: 1, revenue: 1000, cost: 600 }),
    line({ model: "Carres Breeze", category: "bedframe", qty: 1, revenue: 500, cost: null }),
  ];
  it("rolls up per model; margin only when EVERY contributing line has a cost", () => {
    const rows = productRollup(lines);
    expect(rows[0]).toMatchObject({ model: "Carres Cloud", units: 3, revenue: 3000 });
    expect(rows[0].marginPct).toBeCloseTo(40); // (3000-1800)/3000
    expect(rows[1].marginPct).toBeNull(); // Breeze has no cost
  });
  it("buyerDemographics groups distributions per category", () => {
    const demo = buyerDemographics(
      [
        line({ race: "Chinese", gender: "Female", birthday: "1990-01-01" }),
        line({ race: "Malay", gender: "Female", birthday: "1995-01-01" }),
      ],
      AT,
    );
    expect(demo).toHaveLength(1);
    expect(demo[0].category).toBe("mattress");
    expect(demo[0].gender.rows[0]).toMatchObject({ label: "Female", count: 2 });
  });
});

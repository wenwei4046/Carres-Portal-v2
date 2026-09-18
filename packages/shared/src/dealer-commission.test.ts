import { describe, expect, it } from "vitest";
import { dealerCommissionReport, orderCommission, rebateByMonth, type DcOrder, type DcSource } from "./dealer-commission";

const at25 = () => 25;
const order = (over: Partial<DcOrder>): DcOrder => ({
  orderId: "o1", so: 1, dealerId: "d1", outletId: null, addons: 0, lines: [], payments: [], ...over,
});

describe("dealer commission", () => {
  it("spreads a cashback over the lines by value before the rate", () => {
    const o = order({ cashback: 500, lines: [1499, 999, 999].map((value) => ({ modelId: null, category: "mattress", value })) });
    expect(orderCommission(o, at25, 2997).full).toBeCloseTo(2997 * 0.25, 6);
  });

  it("earns only on money collected; the rest is still to collect", () => {
    const src: DcSource = {
      settings: { defaultRate: 25 }, rates: [], quotas: [], models: [], outlets: [],
      dealers: [{ id: "d1", name: "Dealer" }],
      orders: [order({ lines: [{ modelId: null, category: "sofa", value: 1000 }], payments: [{ paidOn: "2026-09-03", amount: 500 }] })],
    };
    expect(dealerCommissionReport(src, "2026-09")[0]).toMatchObject({ earned: 125, stillToCollect: 125 });
  });

  it("transport and guarantee earn nothing", () => {
    const o = order({ addons: 100, lines: [
      { modelId: null, category: "sofa", value: 1000 },
      { modelId: null, category: "guarantee", value: 100 },
    ] });
    expect(orderCommission(o, at25, 1200)).toEqual({ earned: 250, full: 250 });
  });

  it("caps the rebate at the quota left", () => {
    // Quota left 45: a month that earns 25, then a month that earns 60, pays 25 then only the 20 left.
    expect(rebateByMonth(45, 5, [["2026-09", 500], ["2026-10", 1200]])).toEqual([
      { month: "2026-09", rebate: 25, quotaLeft: 20 },
      { month: "2026-10", rebate: 20, quotaLeft: 0 },
    ]);
  });
});

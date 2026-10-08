import { describe, expect, it } from "vitest";
import {
  dcRuleAddInput,
  dealerCommissionReport,
  orderCommission,
  rebateByMonth,
  type DcLine,
  type DcOrder,
  type DcSource,
} from "./dealer-commission";

/** A line as the database sends it (0661): its rate on the order's day. */
const line = (category: string, value: number, rate = 25): DcLine => ({ modelId: null, category, value, rate });
const order = (over: Partial<DcOrder>): DcOrder => ({
  orderId: "o1", so: 1, dealerId: "d1", outletId: null, addons: 0, lines: [], payments: [], ...over,
});

describe("dealer commission", () => {
  it("spreads a cashback over the lines by value before the rate", () => {
    const o = order({ cashback: 500, lines: [1499, 999, 999].map((value) => line("mattress", value)) });
    expect(orderCommission(o, 2997).full).toBeCloseTo(2997 * 0.25, 6);
  });

  it("earns only on money collected; the rest is still to collect", () => {
    const src: DcSource = {
      settings: { defaultRate: 25 }, rates: [], quotas: [], models: [], outlets: [],
      dealers: [{ id: "d1", name: "Dealer" }],
      orders: [order({ lines: [line("sofa", 1000)], payments: [{ paidOn: "2026-09-03", amount: 500 }] })],
    };
    expect(dealerCommissionReport(src, "2026-09")[0]).toMatchObject({ earned: 125, stillToCollect: 125 });
  });

  it("each line earns at its own rate (0661: the rate in force on the order's day)", () => {
    // A product at 20% beside one at the 25% standard: 200 + 250.
    const o = order({ lines: [line("mattress", 1000, 20), line("sofa", 1000, 25)] });
    expect(orderCommission(o, 2000)).toEqual({ earned: 450, full: 450 });
    // The database sends the rate it reads, not today's: the report never mixes them.
    const src: DcSource = {
      settings: { defaultRate: 30 }, rates: [], quotas: [], models: [], outlets: [],
      dealers: [{ id: "d1", name: "Dealer" }],
      orders: [order({ orderedOn: "2026-08-01", lines: [line("sofa", 1000, 25)], payments: [{ paidOn: "2026-09-03", amount: 1000 }] })],
    };
    expect(dealerCommissionReport(src, "2026-09")[0]).toMatchObject({ earned: 250, stillToCollect: 0 });
  });

  it("a line at rate 0 is in the bill and earns nothing", () => {
    // Service, the guarantee and a kind switched off come with rate 0.
    const o = order({ lines: [line("sofa", 1000), line("service", 1000, 0)] });
    expect(orderCommission(o, 2000)).toEqual({ earned: 250, full: 250 });
    expect(orderCommission(o, 1000)).toEqual({ earned: 125, full: 250 });
  });

  it("a line with no rate earns nothing", () => {
    const o = order({ lines: [line("sofa", 1000), { modelId: null, category: null, value: 1000, rate: null }] });
    expect(orderCommission(o, 2000)).toEqual({ earned: 250, full: 250 });
  });

  it("an order with no payments carries its whole commission in still to collect (0553)", () => {
    const src: DcSource = {
      settings: { defaultRate: 25 }, rates: [], quotas: [], models: [], outlets: [],
      dealers: [{ id: "d1", name: "Dealer" }],
      orders: [order({ lines: [line("sofa", 1000)], payments: null })],
    };
    expect(dealerCommissionReport(src, "2026-09")[0]).toMatchObject({ earned: 0, stillToCollect: 250 });
  });

  it("transport and the guarantee earn nothing", () => {
    const o = order({ addons: 100, lines: [line("sofa", 1000), line("guarantee", 100, 0)] });
    expect(orderCommission(o, 1200)).toEqual({ earned: 250, full: 250 });
  });

  it("an accessory earns at its rate (0661: accessories earn, Chew 2026-10-05)", () => {
    const o = order({ lines: [line("sofa", 1000), line("accessory", 1000)] });
    expect(orderCommission(o, 2000)).toEqual({ earned: 500, full: 500 });
    expect(orderCommission(o, 1000)).toEqual({ earned: 250, full: 500 });
  });

  // 0597: a refund HQ has paid out is money that was not kept.
  const sofa1000 = (payments: DcOrder["payments"], refunds: DcOrder["refunds"]): DcSource => ({
    settings: { defaultRate: 25 }, rates: [], models: [], outlets: [],
    dealers: [{ id: "d1", name: "Dealer" }],
    quotas: [{ dealerId: "d1", quota: 1000, rebateRate: 5, startsOn: "2026-01-01" }],
    orders: [order({ lines: [line("sofa", 1000)], payments, refunds })],
  });

  it("RM1000 paid then RM400 refunded earns on 600 at most", () => {
    const src = sofa1000([{ paidOn: "2026-09-03", amount: 1000 }], [{ paidOn: "2026-09-20", amount: 400 }]);
    expect(dealerCommissionReport(src, "2026-09")[0]).toMatchObject({ earned: 150, stillToCollect: 100, rebate: 30 });
  });

  it("a refund paid in October reduces October, not September", () => {
    const src = sofa1000([{ paidOn: "2026-09-03", amount: 1000 }], [{ paidOn: "2026-10-02", amount: 400 }]);
    expect(dealerCommissionReport(src, "2026-09")[0]).toMatchObject({ earned: 250, stillToCollect: 0, rebate: 50 });
    expect(dealerCommissionReport(src, "2026-10")[0]).toMatchObject({ earned: -100, stillToCollect: 100, rebate: -20 });
  });

  it("collected never goes below zero", () => {
    const src = sofa1000([{ paidOn: "2026-09-03", amount: 300 }], [{ paidOn: "2026-09-04", amount: 500 }]);
    expect(dealerCommissionReport(src, "2026-09")[0]).toMatchObject({ earned: 0, stillToCollect: 250, rebate: 0 });
  });

  it("a refund of money paid before the quota started takes no rebate from another order", () => {
    // Order o1 paid 1000 in September, before the quota counts, and earned no rebate.
    // Its 400 refund in October must not eat the rebate on o2's 1000 paid in October.
    const src: DcSource = {
      settings: { defaultRate: 25 }, rates: [], models: [], outlets: [],
      dealers: [{ id: "d1", name: "Dealer" }],
      quotas: [{ dealerId: "d1", quota: 1000, rebateRate: 5, startsOn: "2026-10-01" }],
      orders: [
        order({ orderId: "o1", lines: [line("sofa", 1000)],
          payments: [{ paidOn: "2026-09-03", amount: 1000 }], refunds: [{ paidOn: "2026-10-05", amount: 400 }] }),
        order({ orderId: "o2", lines: [line("sofa", 1000)],
          payments: [{ paidOn: "2026-10-10", amount: 1000 }] }),
      ],
    };
    expect(dealerCommissionReport(src, "2026-10")[0]).toMatchObject({ rebate: 50, quotaLeft: 950 });
  });

  it("a refund after the rebate hit the cap takes back only what was paid", () => {
    // 1200 collected at 5% is 60, capped at 45. A 400 refund leaves 800, worth 40: take back 5, not 20.
    expect(rebateByMonth(45, 5, [["2026-09", 1200], ["2026-10", -400]])).toEqual([
      { month: "2026-09", rebate: 45, quotaLeft: 0 },
      { month: "2026-10", rebate: -5, quotaLeft: 5 },
    ]);
  });

  it("caps the rebate at the quota left", () => {
    // Quota left 45: a month that earns 25, then a month that earns 60, pays 25 then only the 20 left.
    expect(rebateByMonth(45, 5, [["2026-09", 500], ["2026-10", 1200]])).toEqual([
      { month: "2026-09", rebate: 25, quotaLeft: 20 },
      { month: "2026-10", rebate: 20, quotaLeft: 0 },
    ]);
  });
});

describe("adding a commission rule (0661)", () => {
  const day = "2026-11-01";
  const model = "11111111-1111-4111-8111-111111111111";

  it("each kind takes only its own fields", () => {
    expect(dcRuleAddInput.safeParse({ kind: "standard", rate: 25, startsOn: day }).success).toBe(true);
    expect(dcRuleAddInput.safeParse({ kind: "product", modelId: model, rate: 20, startsOn: day, memo: "Memo 22 Jul" }).success).toBe(true);
    expect(dcRuleAddInput.safeParse({ kind: "promotion", modelId: model, isOn: true, points: 5, startsOn: day }).success).toBe(true);
    expect(dcRuleAddInput.safeParse({ kind: "promotion", modelId: model, isOn: false, startsOn: day }).success).toBe(true);
    expect(dcRuleAddInput.safeParse({ kind: "category", category: "accessory", isOn: false, startsOn: day }).success).toBe(true);
    // a standard rate names no product
    expect(dcRuleAddInput.safeParse({ kind: "standard", modelId: model, rate: 25, startsOn: day }).success).toBe(false);
  });

  it("refuses a rate over 100, a missing day and a long memo", () => {
    expect(dcRuleAddInput.safeParse({ kind: "standard", rate: 101, startsOn: day }).success).toBe(false);
    expect(dcRuleAddInput.safeParse({ kind: "standard", rate: 25 }).success).toBe(false);
    expect(dcRuleAddInput.safeParse({ kind: "standard", rate: 25, startsOn: day, memo: "x".repeat(201) }).success).toBe(false);
  });
});

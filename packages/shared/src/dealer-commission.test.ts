import { describe, expect, it } from "vitest";
import {
  dcRuleAddInput,
  dcTakeBackInput,
  dealerCommissionOrders,
  dealerCommissionReport,
  orderMonth,
  orderTerms,
  rebateByMonth,
  type DcLine,
  type DcOrder,
  type DcSource,
} from "./dealer-commission";

/** A line as the database sends it (0661): its rate on the order's day. */
const line = (category: string, value: number, rate = 25, qty = 1): DcLine =>
  ({ modelId: null, category, value, rate, qty });
const order = (over: Partial<DcOrder>): DcOrder => ({
  orderId: "o1", so: 1, dealerId: "d1", outletId: null, addons: 0, lines: [], payments: [], ...over,
});
const source = (orders: DcOrder[], over: Partial<DcSource> = {}): DcSource => ({
  settings: { defaultRate: 25 }, rates: [], quotas: [], models: [], outlets: [],
  dealers: [{ id: "d1", name: "Dealer" }], orders, ...over,
});
const paid = (paidOn: string, amount: number) => ({ paidOn, amount });

/** Chew's example (Finance MASTER §3.2, 「1 是乙」): goods RM 3,000 at 25% and service RM 300. */
const goodsAndService = (over: Partial<DcOrder> = {}) =>
  order({ orderedOn: "2026-09-02", lines: [line("mattress", 3000), line("service", 300, 0)], ...over });

describe("an order's terms", () => {
  it("service, the guarantee and add-ons earn nothing; the rest earns at its own rate", () => {
    const o = order({ addons: 150, lines: [line("mattress", 2000, 25), line("sofa", 1000, 20), line("guarantee", 100, 0), line("service", 300, 0)] });
    expect(orderTerms(o)).toEqual({ total: 3550, noEarn: 550, base: 3000, full: 700 });
  });

  it("a bundle discount is shared equally by the mattress pieces (「3张就500 除3」)", () => {
    // RM 500 over three mattresses: a line of two and a line of one, RM 1,000 each piece.
    const o = order({ bundleDiscount: 500, lines: [line("mattress", 2000, 25, 2), line("mattress", 1000, 25, 1), line("bedframe", 1000, 25)] });
    const t = orderTerms(o);
    expect(t.total).toBe(3500);
    // Each piece takes 166.67 off; the bedframe takes none.
    expect(t.base).toBeCloseTo(3500, 6);
    expect(t.full).toBeCloseTo(875, 6);
  });
});

describe("a month's commission", () => {
  it("Chew's example: RM 1,650 first earns RM 337.50, the RM 1,650 balance RM 412.50", () => {
    const o = goodsAndService({ payments: [paid("2026-09-05", 1650), paid("2026-10-07", 1650)] });
    const sep = orderMonth(o, "2026-09");
    expect(sep).toMatchObject({ earned: 337.5, stillToEarn: 412.5, halfReachedOn: "2026-09-05", group: "new" });
    const oct = orderMonth(o, "2026-10");
    expect(oct).toMatchObject({ earned: 412.5, stillToEarn: 0, keptThisMonth: 1650, group: "balance" });
  });

  it("under half paid earns nothing; the month it reaches half pays on all kept so far", () => {
    const o = goodsAndService({ payments: [paid("2026-09-05", 1000), paid("2026-10-07", 700)] });
    expect(orderMonth(o, "2026-09")).toMatchObject({ earned: 0, stillToEarn: 750, halfReachedOn: null, group: "new" });
    // 1,700 kept ≥ half of 3,300: (1,700 − 300) × 25%.
    expect(orderMonth(o, "2026-10")).toMatchObject({ earned: 350, stillToEarn: 400, halfReachedOn: "2026-10-07", group: "balance" });
  });

  it("a month with nothing paid shows the order as still waiting", () => {
    const o = goodsAndService({ payments: [paid("2026-09-05", 1000)] });
    expect(orderMonth(o, "2026-10")).toMatchObject({ earned: 0, stillToEarn: 750, group: "waiting" });
  });

  it("a refund takes its commission back in the month it is paid; half once reached stays reached", () => {
    const o = goodsAndService({ payments: [paid("2026-09-05", 3300)], refunds: [paid("2026-10-09", 2000)] });
    expect(orderMonth(o, "2026-09").earned).toBe(750);
    // 1,300 kept is under half, but half was reached in September: (1,300 − 300) × 25% = 250.
    expect(orderMonth(o, "2026-10")).toMatchObject({ earned: -500, earnedToMonthEnd: 250, group: "taken_back" });
  });

  it("a cancelled order keeps what it earned, has nothing still to earn, and gives it back only when Finance takes it back", () => {
    const o = goodsAndService({ payments: [paid("2026-09-05", 2000)], cancelledOn: "2026-10-05" });
    expect(orderMonth(o, "2026-09")).toMatchObject({ earned: 425, stillToEarn: 325, cancelled: false });
    // It shows in the month it was cancelled, where its commission can be taken back.
    expect(orderMonth(o, "2026-10")).toMatchObject({ earned: 0, stillToEarn: 0, cancelled: true, group: "cancelled" });
    expect(orderMonth(o, "2026-11").group).toBeNull();
    const back = { ...o, takeBackOn: "2026-11-03" };
    expect(orderMonth(back, "2026-10").earned).toBe(0);
    expect(orderMonth(back, "2026-11")).toMatchObject({ earned: -425, earnedToMonthEnd: 0, takenBack: true, group: "taken_back" });
  });

  it("collected never goes below zero", () => {
    const o = order({ lines: [line("sofa", 1000)], payments: [paid("2026-09-03", 300)], refunds: [paid("2026-09-04", 500)] });
    expect(orderMonth(o, "2026-09")).toMatchObject({ earned: 0, stillToEarn: 250, keptToMonthEnd: 0 });
  });
});

describe("the report", () => {
  it("one row per dealer: the month's commission and what is still to collect", () => {
    const src = source([order({ lines: [line("sofa", 1000)], payments: [paid("2026-09-03", 500)] })]);
    expect(dealerCommissionReport(src, "2026-09")[0]).toMatchObject({ earned: 125, stillToCollect: 125 });
  });

  it("an order with no payments carries its whole commission in still to collect (0553)", () => {
    const src = source([order({ lines: [line("sofa", 1000)], payments: null })]);
    expect(dealerCommissionReport(src, "2026-09")[0]).toMatchObject({ earned: 0, stillToCollect: 250 });
  });

  it("one row per order that shows in the month, with its dealer; a showroom narrows it", () => {
    const src = source([
      order({ orderId: "a", orderedOn: "2026-09-01", outletId: "s1", lines: [line("sofa", 1000)], payments: [paid("2026-09-03", 1000)] }),
      order({ orderId: "b", orderedOn: "2026-08-01", outletId: "s2", lines: [line("sofa", 1000)], payments: [paid("2026-08-03", 1000)] }),
      order({ orderId: "c", orderedOn: "2026-08-01", outletId: "s1", lines: [line("sofa", 1000)], payments: [paid("2026-08-03", 400)] }),
    ]);
    const rows = dealerCommissionOrders(src, "2026-09");
    // b is paid in full and quiet in September; c waits for its balance.
    expect(rows.map((r) => [r.order.orderId, r.group, r.dealer])).toEqual([["a", "new", "Dealer"], ["c", "waiting", "Dealer"]]);
    expect(dealerCommissionOrders(src, "2026-09", { outletId: "s2" })).toEqual([]);
  });
});

describe("the rebate", () => {
  // 0597: a refund HQ has paid out is money that was not kept.
  const sofa1000 = (payments: DcOrder["payments"], refunds: DcOrder["refunds"]): DcSource => source(
    [order({ lines: [line("sofa", 1000)], payments, refunds })],
    { quotas: [{ dealerId: "d1", quota: 1000, rebateRate: 5, startsOn: "2026-01-01" }] },
  );

  it("RM1000 paid then RM400 refunded earns on 600 at most", () => {
    const src = sofa1000([paid("2026-09-03", 1000)], [paid("2026-09-20", 400)]);
    expect(dealerCommissionReport(src, "2026-09")[0]).toMatchObject({ earned: 150, stillToCollect: 100, rebate: 30 });
  });

  it("a refund paid in October reduces October, not September", () => {
    const src = sofa1000([paid("2026-09-03", 1000)], [paid("2026-10-02", 400)]);
    expect(dealerCommissionReport(src, "2026-09")[0]).toMatchObject({ earned: 250, stillToCollect: 0, rebate: 50 });
    expect(dealerCommissionReport(src, "2026-10")[0]).toMatchObject({ earned: -100, stillToCollect: 100, rebate: -20 });
  });

  it("a refund of money paid before the quota started takes no rebate from another order", () => {
    // Order o1 paid 1000 in September, before the quota counts, and earned no rebate.
    // Its 400 refund in October must not eat the rebate on o2's 1000 paid in October.
    const src = source([
      order({ orderId: "o1", lines: [line("sofa", 1000)], payments: [paid("2026-09-03", 1000)], refunds: [paid("2026-10-05", 400)] }),
      order({ orderId: "o2", lines: [line("sofa", 1000)], payments: [paid("2026-10-10", 1000)] }),
    ], { quotas: [{ dealerId: "d1", quota: 1000, rebateRate: 5, startsOn: "2026-10-01" }] });
    expect(dealerCommissionReport(src, "2026-10")[0]).toMatchObject({ rebate: 50, quotaLeft: 950 });
  });

  it("a cancelled order's money does not count toward the rebate", () => {
    const src = source(
      [order({ lines: [line("sofa", 1000)], payments: [paid("2026-09-03", 1000)], cancelledOn: "2026-09-10" })],
      { quotas: [{ dealerId: "d1", quota: 1000, rebateRate: 5, startsOn: "2026-01-01" }] },
    );
    expect(dealerCommissionReport(src, "2026-09")[0]).toMatchObject({ earned: 250, stillToCollect: 0, rebate: 0 });
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

describe("the inputs", () => {
  const day = "2026-11-01";
  const model = "11111111-1111-4111-8111-111111111111";

  it("a commission rule takes only its own fields (0661)", () => {
    expect(dcRuleAddInput.safeParse({ kind: "standard", rate: 25, startsOn: day }).success).toBe(true);
    expect(dcRuleAddInput.safeParse({ kind: "product", modelId: model, rate: 20, startsOn: day, memo: "Memo 22 Jul" }).success).toBe(true);
    expect(dcRuleAddInput.safeParse({ kind: "promotion", modelId: model, isOn: true, points: 5, startsOn: day }).success).toBe(true);
    expect(dcRuleAddInput.safeParse({ kind: "promotion", modelId: model, isOn: false, startsOn: day }).success).toBe(true);
    expect(dcRuleAddInput.safeParse({ kind: "category", category: "accessory", isOn: false, startsOn: day }).success).toBe(true);
    expect(dcRuleAddInput.safeParse({ kind: "standard", modelId: model, rate: 25, startsOn: day }).success).toBe(false);
    expect(dcRuleAddInput.safeParse({ kind: "standard", rate: 101, startsOn: day }).success).toBe(false);
    expect(dcRuleAddInput.safeParse({ kind: "standard", rate: 25 }).success).toBe(false);
    expect(dcRuleAddInput.safeParse({ kind: "standard", rate: 25, startsOn: day, memo: "x".repeat(201) }).success).toBe(false);
  });

  it("taking a cancelled order's commission back is a yes or a no (0662)", () => {
    expect(dcTakeBackInput.safeParse({ takeBack: true }).success).toBe(true);
    expect(dcTakeBackInput.safeParse({ takeBack: "yes" }).success).toBe(false);
  });
});

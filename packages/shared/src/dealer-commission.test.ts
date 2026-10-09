import { describe, expect, it } from "vitest";
import {
  dcPaymentLinkInput,
  dcRuleAddInput,
  dcTakeBackInput,
  dealerCommissionOrders,
  dealerCommissionReport,
  dealerStatement,
  kpiAmount,
  orderMonth,
  orderTerms,
  rebateByMonth,
  statementAsSource,
  type DcKpiRule,
  type DcLine,
  type DcOrder,
  type DcSource,
  type DcStatementSource,
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

  it("a cancelled order's money still counts until Finance takes its commission back; then its rebate is given back (7.4)", () => {
    const quotas = [{ dealerId: "d1", quota: 1000, rebateRate: 5, startsOn: "2026-01-01" }];
    const cancelled = order({ lines: [line("sofa", 1000)], payments: [paid("2026-09-03", 1000)], cancelledOn: "2026-09-10" });
    expect(dealerCommissionReport(source([cancelled], { quotas }), "2026-09")[0]).toMatchObject({ earned: 250, stillToCollect: 0, rebate: 50 });
    const back = { ...cancelled, takeBackOn: "2026-10-04" };
    expect(dealerCommissionReport(source([back], { quotas }), "2026-09")[0]).toMatchObject({ rebate: 50 });
    expect(dealerCommissionReport(source([back], { quotas }), "2026-10")[0]).toMatchObject({ earned: -250, rebate: -50, quotaLeft: 1000 });
  });

  it("an order under half adds nothing to the rebate; the month it reaches half adds all it kept (7.4)", () => {
    const quotas = [{ dealerId: "d1", quota: null, rebateRate: 5, startsOn: "2026-01-01" }];
    const src = source([order({ lines: [line("sofa", 1000)], payments: [paid("2026-09-03", 400), paid("2026-10-05", 200)] })], { quotas });
    expect(dealerCommissionReport(src, "2026-09")[0]).toMatchObject({ rebate: 0, quotaLeft: null });
    expect(dealerCommissionReport(src, "2026-10")[0]).toMatchObject({ rebate: 30, quotaLeft: null });
  });

  it("the total can be filled in later: no limit until then, then what is left is the total less all given (7.3)", () => {
    // Chew's example: August receipts RM 9,855 at 5% give RM 492.75; a RM 10,000 total leaves RM 9,507.25.
    const orders = [order({ lines: [line("sofa", 9855)], payments: [paid("2026-08-10", 9855)] })];
    const noTotal = source(orders, { quotas: [{ dealerId: "d1", quota: null, rebateRate: 5, startsOn: "2026-08-01" }] });
    expect(dealerCommissionReport(noTotal, "2026-08")[0]).toMatchObject({ rebate: 492.75, quotaLeft: null });
    const total = source(orders, { quotas: [{ dealerId: "d1", quota: 10000, rebateRate: 5, startsOn: "2026-08-01" }] });
    expect(dealerCommissionReport(total, "2026-09")[0]).toMatchObject({ rebate: 0, quotaLeft: 9507.25 });
  });

  it("a total not filled in has no limit (7.3)", () => {
    expect(rebateByMonth(null, 5, [["2026-09", 60000], ["2026-10", 80000]])).toEqual([
      { month: "2026-09", rebate: 3000, quotaLeft: null },
      { month: "2026-10", rebate: 4000, quotaLeft: null },
    ]);
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

describe("the dealer's statement (0664)", () => {
  // Chew's example: RM 1,650 in September earns RM 337.50, the balance in
  // October RM 412.50; Carres paid RM 337.50 on 15 October.
  const statement = (today: string, payments: DcStatementSource["payments"] = []) => dealerStatement({
    today, dealer: { id: "d1", name: "Dealer" }, quotas: [], payments,
    orders: [goodsAndService({ payments: [paid("2026-09-05", 1650), paid("2026-10-07", 1650)] })],
  });

  it("each month's commission is owed at its end and falls due on the 15th after; payments come off", () => {
    const s = statement("2026-11-02", [{ id: "p1", voucherId: "v1", voucherNo: "PV-0001", paidOn: "2026-10-15", amount: 337.5 }]);
    expect(s.lines.map((l) => [l.day, l.kind, l.owed, l.paid, l.balance, l.due])).toEqual([
      ["2026-09-30", "commission", 337.5, 0, 337.5, "2026-10-15"],
      ["2026-10-15", "payment", 0, 337.5, 0, null],
      ["2026-10-31", "commission", 412.5, 0, 412.5, "2026-11-15"],
    ]);
    expect(s).toMatchObject({ owedNow: 412.5, stillToCome: 0, nextDue: { day: "2026-11-15", amount: 412.5 } });
  });

  it("the month in progress shows its commission so far, on today", () => {
    const s = statement("2026-10-09");
    expect(s.lines.at(-1)).toMatchObject({ day: "2026-10-09", kind: "commission", soFar: true, owed: 412.5 });
    expect(s.nextDue).toEqual({ day: "2026-10-15", amount: 337.5 });
  });

  it("what is due next: the oldest month not paid, even when its day is past, never more than is owed now", () => {
    // Nothing paid by 1 November: September's RM 337.50 was due on 15 October.
    expect(statement("2026-11-01").nextDue).toEqual({ day: "2026-10-15", amount: 337.5 });
    // All paid: nothing is due.
    const all = statement("2026-11-20", [{ id: "p1", voucherId: "v1", voucherNo: "PV-0001", paidOn: "2026-11-15", amount: 750 }]);
    expect(all).toMatchObject({ owedNow: 0, nextDue: null });
    // A November refund takes RM 500 back: RM 250 is owed, so no more than that is due.
    const back = dealerStatement({
      today: "2026-11-20", dealer: { id: "d1", name: "Dealer" }, quotas: [], payments: [],
      orders: [goodsAndService({ payments: [paid("2026-09-05", 1650), paid("2026-10-07", 1650)], refunds: [paid("2026-11-10", 2000)] })],
    });
    expect(back).toMatchObject({ owedNow: 250, nextDue: { day: "2026-10-15", amount: 250 } });
  });

  it("commission still to come is what today's orders would still earn", () => {
    const s = dealerStatement({
      today: "2026-09-20", dealer: { id: "d1", name: "Dealer" }, quotas: [], payments: [],
      orders: [goodsAndService({ payments: [paid("2026-09-05", 1650)] })],
    });
    expect(s).toMatchObject({ owedNow: 337.5, stillToCome: 412.5 });
  });

  it("a month before an order was placed neither lists it nor counts it still to come", () => {
    const src = statementAsSource({
      today: "2026-10-09", dealer: { id: "d1", name: "Dealer" }, quotas: [], payments: [],
      orders: [
        goodsAndService({ payments: [paid("2026-09-05", 1650)] }),
        goodsAndService({ orderId: "o2", so: 2, orderedOn: "2026-10-03", payments: [] }),
      ],
    });
    expect(dealerCommissionOrders(src, "2026-09").map((r) => r.order.orderId)).toEqual(["o1"]);
    expect(dealerCommissionReport(src, "2026-09")[0].stillToCollect).toBe(412.5);
    expect(dealerCommissionOrders(src, "2026-10").map((r) => [r.order.orderId, r.group])).toEqual([["o1", "waiting"], ["o2", "new"]]);
  });
});

describe("the KPI allowance (0665)", () => {
  // Made-up amounts: the memo's are Finance's and stay out of this repository.
  const GRT = "m-grt";
  const rule = (over: Partial<DcKpiRule> = {}): DcKpiRule => ({
    id: "k1", startsOn: "2026-07-22", modelId: GRT, perUnit: 10, period: "month",
    tiers: [{ units: 5, bonus: 50 }, { units: 20, bonus: 300 }], ...over,
  });
  const withGuarantees = (orderedOn: string, qty: number, over: Partial<DcOrder> = {}) =>
    order({ orderedOn, lines: [line("mattress", 1000), { modelId: GRT, category: "guarantee", value: 150, rate: 0, qty }], ...over });

  it("pays each guarantee plus the bonus of the highest tier reached; tiers do not add up (8.2)", () => {
    expect(kpiAmount(rule(), 4)).toBe(40);
    expect(kpiAmount(rule(), 21)).toBe(510);
  });

  it("counts guarantees by order day, a line of 2 as two, never a cancelled order's (8.1, 8.4)", () => {
    const src = source([
      withGuarantees("2026-09-03", 2),
      withGuarantees("2026-09-20", 3),
      withGuarantees("2026-09-25", 4, { cancelledOn: "2026-09-28" }),
      withGuarantees("2026-10-01", 1),
    ], { kpi: [rule()] });
    expect(dealerCommissionReport(src, "2026-09")[0]).toMatchObject({ kpiUnits: 5, kpi: 100 });
    expect(dealerCommissionReport(src, "2026-10")[0]).toMatchObject({ kpiUnits: 1, kpi: 10 });
  });

  it("no rule yet, no allowance; orders before the first rule's day do not count", () => {
    const src = source([withGuarantees("2026-07-10", 3), withGuarantees("2026-07-25", 2)], { kpi: [rule()] });
    expect(dealerCommissionReport(src, "2026-06")[0]).toMatchObject({ kpi: null, kpiUnits: 0 });
    expect(dealerCommissionReport(src, "2026-07")[0]).toMatchObject({ kpiUnits: 2, kpi: 20 });
  });

  it("a yearly count pays each guarantee as it comes and a tier's bonus in the month it is reached (8.3)", () => {
    const src = source([withGuarantees("2026-08-03", 3), withGuarantees("2026-09-03", 3)], { kpi: [rule({ period: "year" })] });
    expect(dealerCommissionReport(src, "2026-08")[0]).toMatchObject({ kpiUnits: 3, kpi: 30 });
    // Six by September reach the tier of 5: 30 for the guarantees and the 50 bonus.
    expect(dealerCommissionReport(src, "2026-09")[0]).toMatchObject({ kpiUnits: 3, kpi: 80 });
  });

  it("has its own line on the statement, due with the month's commission (10.4)", () => {
    const s = dealerStatement({
      today: "2026-10-09", dealer: { id: "d1", name: "Dealer" }, quotas: [], payments: [],
      kpi: [rule()], orders: [withGuarantees("2026-09-03", 2)],
    });
    expect(s.lines.map((l) => [l.kind, l.month, l.owed, l.due])).toEqual([["kpi", "2026-09", 20, "2026-10-15"]]);
    expect(s.owedNow).toBe(20);
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

  it("a payment to a dealer names its voucher and the dealer (0664)", () => {
    expect(dcPaymentLinkInput.safeParse({ voucherId: model, dealerId: model }).success).toBe(true);
    expect(dcPaymentLinkInput.safeParse({ voucherId: "PV-1", dealerId: model }).success).toBe(false);
  });
});

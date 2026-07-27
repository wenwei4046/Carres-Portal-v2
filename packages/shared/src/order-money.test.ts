import { describe, expect, it } from "vitest";
import { orderMoney } from "./order-money";

describe("orderMoney", () => {
  it("SO-1209 (live, 2026-07-27): paid in full ⇒ nothing owing", () => {
    // The order that proved the bug. Value RM 6,998 of lines + RM 250 of
    // add-ons; orders.paid RM 7,248; ops_order_control.balance NULL; the
    // order_payments ledger empty. The old readers said RM 7,248 outstanding.
    const m = orderMoney({
      lineSum: 6998,
      addonSum: 250,
      paid: 7248,
      controlBalance: null,
    });
    expect(m.total).toBe(7248);
    expect(m.paid).toBe(7248);
    expect(m.goodsOwing).toBe(0);
    expect(m.outstanding).toBe(0);
    expect(m.owing).toBe(false);
    expect(m.known).toBe(true);
    expect(m.source).toBe("lines");
  });

  it("SO-1256 (live): a 50% deposit still owes the balance", () => {
    const m = orderMoney({ lineSum: 3998, addonSum: 250, paid: 2124 });
    expect(m.total).toBe(4248);
    expect(m.goodsOwing).toBe(2124);
    expect(m.owing).toBe(true);
  });

  it("nothing paid ⇒ the whole value is owing", () => {
    const m = orderMoney({ lineSum: 1500, paid: 0 });
    expect(m.goodsOwing).toBe(1500);
    expect(m.owing).toBe(true);
  });

  it("overpayment never reads as a negative debt", () => {
    const m = orderMoney({ lineSum: 1000, paid: 1200 });
    expect(m.goodsOwing).toBe(0);
    expect(m.owing).toBe(false);
  });

  it("priced lines win over a stale keyed balance", () => {
    // A human keyed 5,000 months ago and the customer has since paid in full.
    // The computed lines are the truth; the keyed number is not consulted.
    const m = orderMoney({ lineSum: 4000, paid: 4000, controlBalance: 5000 });
    expect(m.source).toBe("lines");
    expect(m.owing).toBe(false);
  });

  it("an imported row with no prices falls back to the keyed balance AS the outstanding", () => {
    // 0165: balance = "RM the customer still owes". It is already net of what
    // was paid, so `paid` is not subtracted from it a second time.
    const m = orderMoney({ lineSum: 0, paid: 1300, controlBalance: 2000 });
    expect(m.source).toBe("keyed");
    expect(m.goodsOwing).toBe(2000);
    expect(m.total).toBe(3300);
    expect(m.owing).toBe(true);
  });

  it("a keyed zero is a real answer: settled", () => {
    const m = orderMoney({ lineSum: 0, controlBalance: 0 });
    expect(m.known).toBe(true);
    expect(m.owing).toBe(false);
  });

  it("no prices and no keyed balance ⇒ UNKNOWN, and nothing may be held", () => {
    // SO-1221 live: an AutoCount row, RM 1,300 paid, no line prices, balance
    // NULL. Nobody has said what it is worth, so it cannot owe a figure.
    const m = orderMoney({ lineSum: 0, paid: 1300, controlBalance: null });
    expect(m.known).toBe(false);
    expect(m.total).toBeNull();
    expect(m.goodsOwing).toBe(0);
    expect(m.owing).toBe(false);
    expect(m.source).toBe("unknown");
  });

  it("storage is carried, never derived — and it can owe alone", () => {
    const m = orderMoney({ lineSum: 2000, paid: 2000, storageOwing: 150 });
    expect(m.goodsOwing).toBe(0);
    expect(m.storageOwing).toBe(150);
    expect(m.outstanding).toBe(150);
    expect(m.owing).toBe(true);
  });

  it("numeric(12,2) arrives from PostgREST as a string", () => {
    const m = orderMoney({
      lineSum: 6998,
      addonSum: 250,
      paid: "7248.00",
      controlBalance: null,
    });
    expect(m.outstanding).toBe(0);
  });

  it("an absent paid (an older Worker that does not select it) reads as zero, never NaN", () => {
    const m = orderMoney({ lineSum: 1000, paid: undefined });
    expect(m.goodsOwing).toBe(1000);
    expect(Number.isNaN(m.outstanding)).toBe(false);
  });
});

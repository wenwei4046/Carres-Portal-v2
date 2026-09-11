import { describe, expect, it } from "vitest";
import { orderMoney } from "@carres/shared";
import { itemRows } from "./SalesOrderWorkspace";

/**
 * WHAT THE GOODS TABLE'S TWO MONEY COLUMNS STATE, AND WHAT THE TOTAL UNDER IT
 * MAY NEVER DOUBLE-COUNT.
 *
 * The table gained `Unit price` and `Line total` with the approved composition.
 * Two things about that are only testable here: a recorded GIFT is a real line
 * at RM 0.00 (visible, charged nothing), and an old Revision prices its OWN
 * photograph rather than borrowing today's numbers.
 */
const LINES = [
  { sku: "M1401F-K", qty: 2, unit_price: 1890, label: "Jager · King" },
  { sku: "GIFT-PILLOW", qty: 1, unit_price: 0, label: "Latex pillow" },
];

describe("the goods line money", () => {
  it("carries the agreed unit price and the line total from ONE source", () => {
    const rows = itemRows("object", null, LINES);
    expect(rows[0]).toMatchObject({ qty: 2, unitPrice: 1890, total: 3780 });
  });

  it("⭐ prices a recorded GIFT at zero — visible as goods, charged nothing", () => {
    const rows = itemRows("object", null, LINES);
    expect(rows[1]).toMatchObject({ name: "Latex pillow", qty: 1, unitPrice: 0, total: 0 });
    /* And it adds nothing to what the customer owes. */
    const lineSum = rows.reduce((s, r) => s + r.total, 0);
    expect(lineSum).toBe(3780);
  });

  it("⭐ totals an old Revision's OWN photograph, never today's price", () => {
    const rev = {
      revision: 2,
      snapshot: { lines: [{ sku: "M1401F-K", qty: 2, unit_price: 1500, description: "Jager · King" }] },
    } as unknown as Parameters<typeof itemRows>[1];
    const rows = itemRows("oldrev", rev, LINES);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ unitPrice: 1500, total: 3000 });
  });
});

describe("the ONE total under the table", () => {
  /* Law D: the total is `orderMoney`, the same function the register and the
     document call — never a re-sum of the printed rows. */
  it("adds goods and services exactly once between them", () => {
    const lineSum = itemRows("object", null, LINES).reduce((s, r) => s + r.total, 0);
    /* A delivery fee and a stamped STAIR_CARRY row are BOTH `order_addons`. */
    const addonSum = 250 + 300;
    const money = orderMoney({ lineSum, addonSum, paid: 1000, controlBalance: null });
    expect(money.total).toBe(4330);
    expect(money.outstanding).toBe(3330);
    /* The service is counted in the total ONCE — not again as its own summary. */
    expect(money.total).toBe(lineSum + addonSum);
  });

  it("says `No price yet` rather than RM 0 when nobody has priced the order", () => {
    const money = orderMoney({ lineSum: 0, addonSum: 0, paid: 0, controlBalance: null });
    expect(money.known).toBe(false);
    expect(money.total).toBeNull();
  });

  it("reconciles paid against the bill without going negative on an overpayment", () => {
    const money = orderMoney({ lineSum: 3780, addonSum: 0, paid: 4000, controlBalance: null });
    expect(money.outstanding).toBe(0);
  });
});

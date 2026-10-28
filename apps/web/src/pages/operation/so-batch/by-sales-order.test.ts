import { describe, expect, it } from "vitest";
import { isSelectableForOrder, type PurchaseDemandRow, type SoBatchOrderRow } from "@carres/shared";
import { BY_SALES_ORDER, orderRowFacts, orderShownIn, type OrderRowFacts, type OrderRowStatus } from "./by-sales-order";

/**
 * SO Batch Purchase · By sales order (owner 13 Oct 2026, round 3). One row per
 * Sales Order, counted and worded only from what the SO Batch read already
 * carries. Every name below is TEST data.
 */
const NOW = "2026-10-12T12:00";
const TODAY = "2026-10-12";

type Line = SoBatchOrderRow["lines"][number];
const line = (over: Partial<Line> & { orderLineId: string }): Line => ({
  sku: "TEST-SKU", qty: 1, stockTaken: 0, item: "TEST Model A", variant: "King", category: "mattress", pos: [], ...over,
});
const order = (over: Partial<SoBatchOrderRow> = {}): SoBatchOrderRow => ({
  orderId: "o-1", so: 1001, customer: "TEST customer A", status: "blank", proceededAt: null,
  requestedDeliveryDate: null, originalRequestedDeliveryDate: null, deliveryCity: null, deliveryState: null,
  pos: [], lines: [], outstandingSuppliers: [], ...over,
});
/** A demand line the page may tick: a timing state, something to buy, a supplier and an issue reference. */
const leaf = (over: Partial<PurchaseDemandRow> & { id: string; lineIds: string[] }): PurchaseDemandRow => ({
  state: "can_order_early", orderId: "o-1", so: 1001, customer: "TEST customer A", customerDelivery: "2026-11-20",
  item: "TEST Model A", variant: "King", category: "mattress", skus: ["TEST-SKU"], supplierId: "s-1",
  supplier: "TEST Supplier One", qtyNeeded: 1, readyStock: 0, takenFromStock: 0, onPo: 0, fullyOnPo: false,
  poNumbers: [], toBuy: 1, goodsMustArrive: "2026-11-13", issueRef: { proposalKey: "p", buildKey: "b" },
  action: null, parts: [], supplierKind: "own_logistics", ownerName: null, ownerDuty: null, ...over,
} as PurchaseDemandRow);

/** The page's own tick rule, passed in exactly as the Register passes it. */
const pageRule = (o: SoBatchOrderRow) => (row: PurchaseDemandRow) => isSelectableForOrder(row, o.status);
const facts = (o: SoBatchOrderRow, leaves: PurchaseDemandRow[], canBuy = pageRule(o), now = NOW, today: string | undefined = TODAY) =>
  orderRowFacts(o, leaves, canBuy, now, today);

describe("orderRowFacts: what one Sales Order row counts", () => {
  it("counts item lines to buy, ordered and from stock, and the customer's pieces", () => {
    const o = order({
      status: "partial",
      lines: [
        line({ orderLineId: "l-buy", qty: 2 }),
        line({ orderLineId: "l-po", qty: 1, pos: [{ poId: "PO-TEST-2", qty: 1 }] }),
        line({ orderLineId: "l-stock", qty: 3, stockTaken: 3 }),
      ],
    });
    const f = facts(o, [leaf({ id: "d-buy", lineIds: ["l-buy"], toBuy: 2 })]);
    expect([f.toBuy, f.ordered, f.stock]).toEqual([1, 1, 1]);
    /* Pieces are the customer's quantity over every line, never what is left. */
    expect(f.pieces).toBe(6);
  });

  it("a line partly on a PO is counted both to buy and ordered", () => {
    const o = order({ status: "partial", lines: [line({ orderLineId: "l-1", qty: 3, pos: [{ poId: "PO-TEST-1", qty: 2 }] })] });
    const f = facts(o, [leaf({ id: "d-1", lineIds: ["l-1"], toBuy: 1, onPo: 2 })]);
    expect([f.toBuy, f.ordered, f.stock]).toEqual([1, 1, 0]);
  });

  it("a line partly from stock is counted both to buy and from stock", () => {
    const o = order({ lines: [line({ orderLineId: "l-1", qty: 2, stockTaken: 1 })] });
    const f = facts(o, [leaf({ id: "d-1", lineIds: ["l-1"], toBuy: 1 })]);
    expect([f.toBuy, f.ordered, f.stock]).toEqual([1, 0, 1]);
  });

  it("goods reserved on a PO count as ordered; a zero quantity on a PO does not", () => {
    const o = order({
      lines: [
        line({ orderLineId: "l-res", poReserved: [{ poId: "PO-TEST-9", qty: 1 }] }),
        line({ orderLineId: "l-zero", pos: [{ poId: "PO-TEST-0", qty: 0 }] }),
      ],
    });
    const f = facts(o, [leaf({ id: "d-zero", lineIds: ["l-zero"] })]);
    expect(f.ordered).toBe(1);
    expect(f.toBuy).toBe(1);
    expect(f.poIds).toEqual(["PO-TEST-9"]);
  });

  it("a set's demand line answers for each of its item lines", () => {
    const o = order({ lines: [line({ orderLineId: "l-a", category: "sofa" }), line({ orderLineId: "l-b", category: "sofa" })] });
    const f = facts(o, [leaf({ id: "d-set", lineIds: ["l-a", "l-b"], category: "sofa", toBuy: 2 })]);
    expect(f.toBuy).toBe(2);
    expect(f.status).toBe("to_buy");
  });

  it("an order with no item lines counts nothing", () => {
    const f = facts(order(), []);
    expect([f.pieces, f.toBuy, f.ordered, f.stock]).toEqual([0, 0, 0, 0]);
    expect(f.unit).toBeNull();
    expect(f.poIds).toEqual([]);
    expect(f.orderBy).toBeNull();
  });
});

describe("orderRowFacts: the unit the pieces are counted in", () => {
  it("is the category when every line is one category", () => {
    const sofas = order({ lines: [line({ orderLineId: "l-1", category: "sofa" }), line({ orderLineId: "l-2", category: "sofa" })] });
    expect(facts(sofas, []).unit).toBe("sofa");
    const beds = order({ lines: [line({ orderLineId: "l-1", category: "bedframe" })] });
    expect(facts(beds, []).unit).toBe("bedframe");
  });

  it("is null when the lines are of several categories, or name none", () => {
    const mixed = order({ lines: [line({ orderLineId: "l-1", category: "mattress" }), line({ orderLineId: "l-2", category: "sofa" })] });
    expect(facts(mixed, []).unit).toBeNull();
    const unnamed = order({ lines: [line({ orderLineId: "l-1", category: null }), line({ orderLineId: "l-2", category: null })] });
    expect(facts(unnamed, []).unit).toBeNull();
  });
});

describe("orderRowFacts: the status", () => {
  const toBuyOrder = (over: Partial<SoBatchOrderRow> = {}) => order({ lines: [line({ orderLineId: "l-1" })], ...over });
  const partial = () => order({ status: "partial", lines: [line({ orderLineId: "l-1", qty: 2, pos: [{ poId: "PO-TEST-1", qty: 1 }] })] });
  const buyable = (over: Partial<PurchaseDemandRow> = {}) => leaf({ id: "d-1", lineIds: ["l-1"], ...over });

  it("to_buy: something to buy, a line that can be bought, no date gone by", () => {
    expect(facts(toBuyOrder(), [buyable()]).status).toBe("to_buy");
    expect(facts(toBuyOrder(), [buyable({ orderBy: "2026-10-20", poWindow: "2026-10-12T16:00" })]).status).toBe("to_buy");
  });

  it("partly_ordered: part is on a PO and the rest can still be bought", () => {
    expect(facts(partial(), [buyable()]).status).toBe("partly_ordered");
  });

  it("ordered: nothing left to buy, and a PO carries it", () => {
    const o = order({ status: "ordered", lines: [line({ orderLineId: "l-1", pos: [{ poId: "PO-TEST-1", qty: 1 }] })] });
    expect(facts(o, []).status).toBe("ordered");
    /* A leaf that still looks buyable changes nothing: the order has bought. */
    expect(facts(o, [buyable({ orderBy: "2026-10-01", poWindow: "2026-10-12T09:00" })]).status).toBe("ordered");
  });

  it("from_ready_stock: nothing left to buy and no PO at all", () => {
    const o = order({ lines: [line({ orderLineId: "l-1", qty: 2, stockTaken: 2 })] });
    const f = facts(o, []);
    expect(f.status).toBe("from_ready_stock");
    expect(f.poIds).toEqual([]);
  });

  it("stock on one line and a PO on another is ordered, never from_ready_stock", () => {
    const o = order({
      status: "ordered",
      lines: [line({ orderLineId: "l-1", stockTaken: 1 }), line({ orderLineId: "l-2", pos: [{ poId: "PO-TEST-1", qty: 1 }] })],
    });
    expect(facts(o, []).status).toBe("ordered");
  });

  it("blocked: something is left to buy and no line can be bought", () => {
    /* A missing setup fact … */
    expect(facts(toBuyOrder(), [buyable({ state: "no_production_days", toBuy: null, issueRef: null })]).status).toBe("blocked");
    /* … goods an open PO already covers … */
    expect(facts(toBuyOrder(), [buyable({ fullyOnPo: true })]).status).toBe("blocked");
    /* … or no demand line at all for goods still outstanding. */
    expect(facts(toBuyOrder(), []).status).toBe("blocked");
  });

  it("the tick rule is the one passed in: this file holds no second one", () => {
    expect(facts(toBuyOrder(), [buyable()], () => false).status).toBe("blocked");
    expect(facts(toBuyOrder(), [buyable({ fullyOnPo: true })], () => true).status).toBe("to_buy");
  });

  it("late_to_order: the earliest Order By among buyable lines has gone by", () => {
    expect(facts(toBuyOrder(), [buyable({ orderBy: "2026-10-11" })]).status).toBe("late_to_order");
    /* The day itself is not late. */
    expect(facts(toBuyOrder(), [buyable({ orderBy: TODAY })]).status).toBe("to_buy");
  });

  it("cut_off_passed: a buyable line's PO window has gone by", () => {
    expect(facts(toBuyOrder(), [buyable({ poWindow: "2026-10-12T11:30" })]).status).toBe("cut_off_passed");
    /* The minute itself has not gone by. */
    expect(facts(toBuyOrder(), [buyable({ poWindow: NOW })]).status).toBe("to_buy");
  });

  it("late_to_order comes before cut_off_passed, and both before partly_ordered", () => {
    const both = buyable({ orderBy: "2026-10-11", poWindow: "2026-10-12T11:30" });
    expect(facts(toBuyOrder(), [both]).status).toBe("late_to_order");
    expect(facts(partial(), [both]).status).toBe("late_to_order");
    expect(facts(partial(), [buyable({ orderBy: "2026-10-20", poWindow: "2026-10-12T11:30" })]).status).toBe("cut_off_passed");
  });

  it("a line that cannot be bought never makes the order late or past its cut-off", () => {
    const o = order({ lines: [line({ orderLineId: "l-1" }), line({ orderLineId: "l-2" })] });
    const covered = leaf({ id: "d-2", lineIds: ["l-2"], fullyOnPo: true, orderBy: "2026-09-01", poWindow: "2026-09-01T11:30" });
    expect(facts(o, [buyable({ orderBy: "2026-10-20" }), covered]).status).toBe("to_buy");
    /* And with nothing buyable the order is blocked, whatever those dates say. */
    expect(facts(o, [covered]).status).toBe("blocked");
  });

  it("`today` defaults to the date of the clock it is given", () => {
    const o = toBuyOrder();
    const row = buyable({ orderBy: "2026-10-12" });
    expect(orderRowFacts(o, [row], pageRule(o), "2026-10-13T08:00").status).toBe("late_to_order");
    expect(orderRowFacts(o, [row], pageRule(o), "2026-10-12T08:00").status).toBe("to_buy");
    /* The server's Malaysia date wins when it is passed. */
    expect(orderRowFacts(o, [row], pageRule(o), "2026-10-13T08:00", "2026-10-12").status).toBe("to_buy");
  });
});

describe("orderRowFacts: Order By and the PO numbers", () => {
  it("orderBy is the earliest date among the lines that can be bought", () => {
    const o = order({ lines: [line({ orderLineId: "l-1" }), line({ orderLineId: "l-2" }), line({ orderLineId: "l-3" }), line({ orderLineId: "l-4" })] });
    const f = facts(o, [
      leaf({ id: "d-1", lineIds: ["l-1"], orderBy: "2026-10-20" }),
      leaf({ id: "d-2", lineIds: ["l-2"], orderBy: "2026-10-16" }),
      leaf({ id: "d-3", lineIds: ["l-3"], orderBy: null }),
      /* Earlier, and not buyable: it is not read. */
      leaf({ id: "d-4", lineIds: ["l-4"], orderBy: "2026-10-01", fullyOnPo: true }),
    ]);
    expect(f.orderBy).toBe("2026-10-16");
    expect(f.status).toBe("to_buy");
  });

  it("orderBy is null when no buyable line carries a date, or none is buyable", () => {
    const o = order({ lines: [line({ orderLineId: "l-1" })] });
    expect(facts(o, [leaf({ id: "d-1", lineIds: ["l-1"] })]).orderBy).toBeNull();
    expect(facts(o, [leaf({ id: "d-1", lineIds: ["l-1"], orderBy: "2026-10-16", fullyOnPo: true })]).orderBy).toBeNull();
  });

  it("poIds lists every PO the order's lines are on, once, in number order", () => {
    const o = order({
      status: "ordered",
      lines: [
        line({ orderLineId: "l-1", qty: 2, pos: [{ poId: "PO-TEST-7", qty: 1 }, { poId: "PO-TEST-3", qty: 1 }] }),
        line({ orderLineId: "l-2", qty: 2, pos: [{ poId: "PO-TEST-7", qty: 1 }], poReserved: [{ poId: "PO-TEST-5", qty: 1 }] }),
        line({ orderLineId: "l-3", stockTaken: 1, pos: [{ poId: "PO-TEST-1", qty: 0 }] }),
      ],
    });
    expect(facts(o, []).poIds).toEqual(["PO-TEST-3", "PO-TEST-5", "PO-TEST-7"]);
  });
});

describe("orderShownIn: To buy · Ordered · All", () => {
  const f = (over: Partial<OrderRowFacts>): OrderRowFacts => ({
    pieces: 1, unit: "mattress", toBuy: 0, ordered: 0, stock: 0, status: "to_buy", orderBy: null, poIds: [], ...over,
  });
  const toBuy = f({ toBuy: 1 });
  const partly = f({ toBuy: 1, ordered: 1, status: "partly_ordered", poIds: ["PO-TEST-1"] });
  const ordered = f({ ordered: 1, status: "ordered", poIds: ["PO-TEST-1"] });
  const fromStock = f({ stock: 1, status: "from_ready_stock" });
  const blocked = f({ toBuy: 1, status: "blocked" });

  it("To buy lists an order with a line still to buy, blocked or not", () => {
    expect([toBuy, partly, ordered, fromStock, blocked].map((row) => orderShownIn("buy", row))).toEqual([true, true, false, false, true]);
  });

  it("Ordered lists an order with a PO, and only those", () => {
    expect([toBuy, partly, ordered, fromStock, blocked].map((row) => orderShownIn("ordered", row))).toEqual([false, true, true, false, false]);
  });

  it("All lists every order: the Register is permanent", () => {
    expect([toBuy, partly, ordered, fromStock, blocked].map((row) => orderShownIn("all", row))).toEqual([true, true, true, true, true]);
  });
});

describe("the words", () => {
  it("the five column heads and the item-row heads", () => {
    expect([BY_SALES_ORDER.colSoNo, BY_SALES_ORDER.colItems, BY_SALES_ORDER.colProceedDate, BY_SALES_ORDER.colRequestedDelivery, BY_SALES_ORDER.colStatus])
      .toEqual(["SO no.", "Items", "Proceed date", "Customer’s original requested delivery", "Status"]);
    expect([BY_SALES_ORDER.lineItem, BY_SALES_ORDER.lineQty, BY_SALES_ORDER.lineStock, BY_SALES_ORDER.lineSupplier, BY_SALES_ORDER.lineDeliverTo])
      .toEqual(["Item", "Qty", "Stock you can use", "Supplier", "Supplier delivers to"]);
  });

  it("itemsLine names item lines to buy, ordered and from stock, and drops a zero", () => {
    expect(BY_SALES_ORDER.itemsLine({ toBuy: 1, ordered: 1, stock: 1 })).toBe("1 to buy · 1 ordered · 1 stock");
    expect(BY_SALES_ORDER.itemsLine({ toBuy: 2, ordered: 0, stock: 0 })).toBe("2 to buy");
    expect(BY_SALES_ORDER.itemsLine({ toBuy: 0, ordered: 3, stock: 1 })).toBe("3 ordered · 1 stock");
    expect(BY_SALES_ORDER.itemsLine({ toBuy: 0, ordered: 0, stock: 0 })).toBe("");
  });

  it("each status has one word; a blocked order still reads To buy", () => {
    const word: Record<OrderRowStatus, string> = {
      to_buy: "To buy",
      blocked: "To buy",
      cut_off_passed: "Cut-off passed",
      late_to_order: "Late to order",
      partly_ordered: "Partly ordered",
      ordered: "Ordered",
      from_ready_stock: "From ready stock",
    };
    for (const status of Object.keys(word) as OrderRowStatus[]) expect(BY_SALES_ORDER.status(status), status).toBe(word[status]);
    expect(BY_SALES_ORDER.noPoNeeded).toBe("No PO needed");
  });

  it("the footer counts sales orders in lower case", () => {
    expect(BY_SALES_ORDER.footer(1)).toBe("1 sales order");
    expect(BY_SALES_ORDER.footer(7)).toBe("7 sales orders");
    expect(BY_SALES_ORDER.footer(0)).toBe("0 sales orders");
  });

  it("Use stock says how many lines, and afterwards how many Units", () => {
    expect(BY_SALES_ORDER.useStock(1)).toBe("Use stock · 1");
    expect(BY_SALES_ORDER.useStock(12)).toBe("Use stock · 12");
    expect(BY_SALES_ORDER.useStockDone(1)).toBe("1 Unit reserved from stock");
    expect(BY_SALES_ORDER.useStockDone(3)).toBe("3 Units reserved from stock");
    expect(BY_SALES_ORDER.useStockFailed).toBe("Not confirmed · Try again");
  });

  it("the absence words and the empty tabs", () => {
    expect(BY_SALES_ORDER.notRecorded).toBe("Not recorded");
    expect(BY_SALES_ORDER.noItems).toBe("No items on this order");
    expect(BY_SALES_ORDER.partOfSet).toBe("Part of the set above");
    expect(BY_SALES_ORDER.nothingToBuy).toBe("Nothing to buy. Every Sales Order already has its PO.");
    expect(BY_SALES_ORDER.nothingOrdered).toBe("No Sales Order has a PO yet.");
  });
});

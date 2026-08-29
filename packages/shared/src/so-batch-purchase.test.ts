import { describe, it, expect } from "vitest";
import {
  SO_BATCH_PURCHASE_WORDS as W,
  SO_BATCH_RAIL,
  SO_BATCH_RAIL_CLEAR,
  soBatchOrderSupplierNames,
  soBatchRailFacts,
  soBatchRailModel,
  type SoBatchOrderRow,
  type SoBatchRailFilter,
  SO_BATCH_ORDER_STATUS_WORDS,
  soBatchOrderStatusOf,
  soBatchCellSummary,
  soBatchOrderSelection,
  defaultAllocations,
  setDestination,
  splitAllocation,
  validateAllocations,
  documentPartitionKey,
  composeDocumentLines,
  groupSelectionsIntoDocuments,
  soBatchSelectionSummary,
  isSelectableForBuying,
  type DestinationAllocation,
  type PurchasingDestination,
  type SoBatchSelection,
} from "./so-batch-purchase";
import type { PurchaseDemandRow } from "./purchase-demands";

/**
 * SO BATCH PURCHASE — the pure arrangement contract
 * (CARD-2026-08-22-purchasing-02; `docs/purchasing/MASTER.md` §§5.1, 5.4, 9.1).
 *
 * This module is allowed to check that an ARRANGEMENT adds back to the server's
 * own `toBuy`, and to compose the document grouping KEY the server will
 * recompute. It is not allowed to know what `toBuy` is. Every test below is
 * written so that inventing demand arithmetic here would fail it.
 */

const KLANG: PurchasingDestination = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "Carres Klang",
  isDefault: true,
  active: true,
};
const SG_BULOH: PurchasingDestination = {
  id: "22222222-2222-4222-8222-222222222222",
  name: "AL Sungai Buloh",
  isDefault: false,
  active: true,
};
const CLOSED: PurchasingDestination = {
  id: "33333333-3333-4333-8333-333333333333",
  name: "Old Yard",
  isDefault: false,
  active: false,
};
const DESTINATIONS = [KLANG, SG_BULOH, CLOSED];

function row(over: Partial<PurchaseDemandRow> = {}): PurchaseDemandRow {
  return {
    id: "build::o1::b1",
    state: "can_order_early",
    lineIds: ["l1"],
    orderId: "o1",
    so: 1318,
    customer: "Kimmy",
    customerDelivery: "2026-08-28",
    item: "Booqit",
    variant: "King",
    category: "mattress",
    skus: ["B1201S-K"],
    supplierId: "s-hooka",
    supplier: "Hooka",
    qtyNeeded: 2,
    readyStock: 0,
    takenFromStock: 0,
    onPo: 0,
    poNumbers: [],
    toBuy: 2,
    goodsMustArrive: "2026-08-19",
    issueRef: { proposalKey: "s-hooka::mattress", buildKey: "b1" },
    action: null,
    parts: [{ sku: "B1201S-K", qty: 2, unitCost: 100 }],
    supplierKind: "own_logistics",
    ownerName: null,
    ownerDuty: null,
    ...over,
  };
}

const sel = (r: PurchaseDemandRow, allocations: DestinationAllocation[]): SoBatchSelection => ({
  demandId: r.id,
  allocations,
});

describe("the rail — latest Owner ruling 2026-08-29", () => {
  it("starts with the daily WORK TO DO actions, then keeps the five approved fact sections", () => {
    /* Section ORDER is the object's key order — a reader of this contract
       sees the rail top to bottom. */
    expect(Object.keys(SO_BATCH_RAIL)).toEqual([
      "work",
      "toOrder",
      "timing",
      "product",
      "supplier",
      "setup",
    ]);
    expect(SO_BATCH_RAIL.work).toEqual({
      heading: "WORK TO DO",
      actions: [
        { key: "issue_po", word: "Issue PO", states: [
          "can_order_early",
          "safety_days_full",
          "safety_days_low",
          "safety_days_none",
          "not_enough_production_time",
        ] },
        { key: "ask_customer_date", word: "Ask customer for a delivery date", states: ["no_customer_date"] },
        { key: "add_sku", word: "Add item to SKU catalog", states: ["no_sku"] },
        { key: "check_supplier", word: "Check the supplier", states: ["no_supplier"] },
        { key: "add_production_days", word: "Add production days", states: ["no_production_days"] },
      ],
    });
    expect(SO_BATCH_RAIL.toOrder.heading).toBe("TO ORDER");
    expect(SO_BATCH_RAIL.toOrder.all).toBe("All not ordered");
    expect(SO_BATCH_RAIL.timing.heading).toBe("ORDER TIMING");
    expect(SO_BATCH_RAIL.timing.states).toEqual([
      "can_order_early",
      "safety_days_full",
      "safety_days_low",
      "safety_days_none",
      "not_enough_production_time",
    ]);
    expect(SO_BATCH_RAIL.product.heading).toBe("PRODUCT");
    expect(SO_BATCH_RAIL.product.all).toBe("All products");
    /* The approved product filters, in the approved order — the CATALOG's
       categories, never SKU-text inference. */
    expect(SO_BATCH_RAIL.product.categories).toEqual([
      { category: "mattress", word: "Mattress" },
      { category: "bedframe", word: "Bedframe" },
      { category: "sofa", word: "Sofa" },
    ]);
    expect(SO_BATCH_RAIL.supplier.heading).toBe("SUPPLIER");
    expect(SO_BATCH_RAIL.supplier.all).toBe("All suppliers");
    expect(SO_BATCH_RAIL.setup.heading).toBe("SETUP TO FIX");
    expect(SO_BATCH_RAIL.setup.states).toEqual(["no_production_days"]);
  });

  it("no facet appears twice, and the Sales/Catalog blockers are not facets", () => {
    const all = [...SO_BATCH_RAIL.timing.states, ...SO_BATCH_RAIL.setup.states];
    expect(new Set(all).size).toBe(all.length);
    for (const gone of ["no_customer_date", "no_sku", "no_supplier"]) {
      expect(all).not.toContain(gone);
    }
  });

  it("the page's own words are the governed ones", () => {
    expect(W.search).toBe("Search Sales Order, customer, SKU or supplier…");
    expect(W.empty).toBe("No proceeded Sales Orders.");
    expect(W.footerUnit).toBe("Sales Orders");
    expect(W.deliverTo).toBe("Deliver To");
    expect(W.multiple).toBe("Multiple");
  });

  it("Card 02-B — the ten business column heads, in the approved order exactly", () => {
    expect([
      W.colStatus,
      W.colProceedDate,
      W.colPoNo,
      W.colSoNo,
      W.colCustomer,
      W.colDeliveryLocation,
      W.colRequestedDelivery,
      W.colSupplier,
      W.deliverTo,
      W.colPoDeliveryDate,
    ]).toEqual([
      "Status",
      "Proceed Date",
      "PO No",
      "SO No",
      "Customer",
      "Delivery Location",
      "Requested Delivery Date",
      "Supplier",
      "Deliver To",
      "PO Delivery Date",
    ]);
  });

  it("the retired column heads left the dictionary and never come back", () => {
    const words = Object.values(W).join(" | ");
    for (const gone of [
      "Source SO",
      "Required For",
      "SKU / configuration",
      "Open PO",
      "Goods Must Arrive",
    ]) {
      expect(words, gone).not.toContain(gone);
    }
    expect(W).not.toHaveProperty("buy");
    expect(W).not.toHaveProperty("colWork");
    expect(W).not.toHaveProperty("goodsMustArrive");
  });

  it("no banned or retired Purchasing word is spelt anywhere in the dictionary or the rail", () => {
    const spelt = [
      ...Object.values(W),
      SO_BATCH_RAIL.toOrder.heading,
      SO_BATCH_RAIL.toOrder.all,
      SO_BATCH_RAIL.timing.heading,
      SO_BATCH_RAIL.product.heading,
      SO_BATCH_RAIL.product.all,
      ...SO_BATCH_RAIL.product.categories.map((c) => c.word),
      SO_BATCH_RAIL.supplier.heading,
      SO_BATCH_RAIL.supplier.all,
      SO_BATCH_RAIL.setup.heading,
      SO_BATCH_RAIL.work.heading,
      ...SO_BATCH_RAIL.work.actions.map((a) => a.word),
    ].join(" ");
    for (const banned of [
      "Today",
      "Tomorrow",
      "Overdue",
      "Needs attention",
      "Follow up",
      "Pending",
      "Waiting",
      "Priority",
      "Next action",
      "Buffer",
      "buffer",
      "Ready to buy",
      "Covered",
      "BUYING RECORDS",
      "All lines",
      "No buying needed",
      "Cannot buy",
      "PO Schedule",
      "CATEGORY",
    ]) {
      expect(spelt, banned).not.toContain(banned);
    }
  });
});

/**
 * ── THE RAIL MODEL (Card 02-C §§6–8) ─────────────────────────────────────────
 *
 * One filter per section, sections combine, and every count is UNIQUE Sales
 * Orders computed under the OTHER sections' selections — the printed number
 * predicts exactly the rows a click would show.
 */
function railOrder(over: Partial<SoBatchOrderRow> & { orderId: string }): SoBatchOrderRow {
  return {
    so: null,
    customer: null,
    status: "blank",
    proceededAt: null,
    requestedDeliveryDate: null,
    deliveryCity: null,
    deliveryState: null,
    pos: [],
    lines: [],
    outstandingSuppliers: [],
    ...over,
  };
}
function line(
  over: Partial<SoBatchOrderRow["lines"][number]> & { orderLineId: string },
): SoBatchOrderRow["lines"][number] {
  return {
    sku: "B1201S-K",
    qty: 1,
    stockTaken: 0,
    item: "Booqit",
    variant: null,
    category: "mattress",
    pos: [],
    ...over,
  };
}
const po = (poId: string, supplierName: string | null): SoBatchOrderRow["pos"][number] => ({
  poId,
  status: "open",
  supplierId: supplierName,
  supplierName,
  destinationId: null,
  etaDate: null,
  sentCurrentVersion: true,
});

/* oA — outstanding mattress, Hooka, can order early. */
const RAIL_OA = railOrder({
  orderId: "oA",
  lines: [line({ orderLineId: "a1" }), line({ orderLineId: "a2" })],
  outstandingSuppliers: ["Hooka"],
});
/* oB — outstanding, MULTI-category (mattress + bedframe), Ohana, low band. */
const RAIL_OB = railOrder({
  orderId: "oB",
  lines: [
    line({ orderLineId: "b1" }),
    line({ orderLineId: "b2", sku: "BF-01", item: "Frame", category: "bedframe" }),
  ],
  outstandingSuppliers: ["Ohana"],
});
/* oC — fully Ordered sofa; its supplier comes from the PO lineage alone. */
const RAIL_OC = railOrder({
  orderId: "oC",
  status: "ordered",
  pos: [po("PO-1", "Nice Future")],
  lines: [line({ orderLineId: "c1", sku: "S9-2A", item: "Sofa", category: "sofa" })],
});
/* oD — the one setup blocker, on a sofa from Ohana. */
const RAIL_OD = railOrder({
  orderId: "oD",
  lines: [line({ orderLineId: "d1", sku: "5539-1B", item: "Chelsea", category: "sofa" })],
  outstandingSuppliers: ["Ohana"],
});
/* oE — a SKU whose TEXT screams mattress but whose Catalog category is
   absent: it must never be counted under `Mattress`. */
const RAIL_OE = railOrder({
  orderId: "oE",
  status: "ordered",
  pos: [po("PO-2", "Hooka")],
  lines: [line({ orderLineId: "e1", sku: "MATTRESS-SPECIAL-K", category: null })],
});
const RAIL_ORDERS = [RAIL_OA, RAIL_OB, RAIL_OC, RAIL_OD, RAIL_OE];
const RAIL_LEAFS = [
  row({ id: "leaf-a", orderId: "oA", state: "can_order_early" }),
  /* A second leaf in the SAME state — oA still counts ONCE. */
  row({ id: "leaf-a2", orderId: "oA", state: "can_order_early" }),
  row({ id: "leaf-b", orderId: "oB", state: "safety_days_low" }),
  row({ id: "leaf-d", orderId: "oD", state: "no_production_days", toBuy: null, issueRef: null }),
];
const model = (over: Partial<SoBatchRailFilter> = {}) =>
  soBatchRailModel(soBatchRailFacts(RAIL_ORDERS, RAIL_LEAFS), {
    ...SO_BATCH_RAIL_CLEAR,
    ...over,
  });

describe("the rail model — unique-SO counts that cross-update between sections", () => {
  it("counts and filters the daily actions by unique Sales Order", () => {
    const m = model();
    expect(m.workCounts.issue_po).toBe(2); // oA + oB; oA's duplicate leaf still counts once
    expect(m.workCounts.ask_customer_date).toBe(0);
    expect(m.workCounts.add_sku).toBe(0);
    expect(m.workCounts.check_supplier).toBe(0);
    expect(m.workCounts.add_production_days).toBe(1); // oD
    expect([...model({ work: "issue_po" }).visibleOrderIds]).toEqual(["oA", "oB"]);
    expect([...model({ work: "add_production_days" }).visibleOrderIds]).toEqual(["oD"]);
  });

  it("no filter shows the complete permanent Register, Ordered records included", () => {
    expect([...model().visibleOrderIds].sort()).toEqual(["oA", "oB", "oC", "oD", "oE"]);
  });

  it("counts are unique Sales Orders — never leafs, lines or quantities", () => {
    const m = model();
    /* oA has TWO leafs in the band and TWO mattress lines — one order. */
    expect(m.timingCounts.can_order_early).toBe(1);
    expect(m.productCounts.mattress).toBe(2); // oA + oB, not four lines
    expect(m.notOrderedCount).toBe(3); // oA · oB · oD — outstanding only
  });

  it("every timing band is present, zero included — an empty band prints 0, not silence", () => {
    const m = model();
    expect(m.timingCounts.safety_days_full).toBe(0);
    expect(m.timingCounts.safety_days_none).toBe(0);
    expect(m.timingCounts.not_enough_production_time).toBe(0);
  });

  it("product comes from the Catalog category — a mattress-shaped SKU text counts nothing", () => {
    const m = model();
    /* oE's `MATTRESS-SPECIAL-K` has no Catalog category: visible under
       `All products`, counted under none of the three. */
    expect(m.productCounts.mattress).toBe(2);
    expect(m.visibleOrderIds.has("oE")).toBe(true);
    expect(model({ product: "mattress" }).visibleOrderIds.has("oE")).toBe(false);
  });

  it("a multi-category order counts once under EVERY matching category, and appears once", () => {
    const m = model();
    expect(m.productCounts.bedframe).toBe(1); // oB
    expect(m.productCounts.mattress).toBe(2); // oA + the same oB
    expect(model({ product: "bedframe" }).visibleOrderIds.has("oB")).toBe(true);
    expect(model({ product: "mattress" }).visibleOrderIds.has("oB")).toBe(true);
  });

  it("suppliers are the Register's own projection, alphabetical, never hardcoded", () => {
    expect(soBatchOrderSupplierNames(RAIL_OC)).toEqual(["Nice Future"]);
    expect(model().suppliers).toEqual([
      { name: "Hooka", count: 2 }, // oA outstanding + oE lineage
      { name: "Nice Future", count: 1 }, // oC lineage
      { name: "Ohana", count: 2 }, // oB + oD outstanding
    ]);
  });

  it("each section's counts update under the OTHER sections' selections", () => {
    const m = model({ product: "sofa" });
    /* Only oC (ordered) and oD (setup) are sofas. */
    expect(m.timingCounts.can_order_early).toBe(0);
    expect(m.notOrderedCount).toBe(1); // oD
    expect(m.suppliers).toEqual([
      { name: "Nice Future", count: 1 },
      { name: "Ohana", count: 1 },
    ]);
    /* And the PRODUCT counts themselves ignore the product selection —
       clicking `Mattress` next must show exactly that many rows. */
    expect(m.productCounts.mattress).toBe(2);
  });

  it("a supplier with no match drops off; the SELECTED supplier stays, with 0", () => {
    const dropped = model({ product: "mattress" });
    expect(dropped.suppliers.map((s) => s.name)).toEqual(["Hooka", "Ohana"]);
    const kept = model({ product: "mattress", supplier: "Nice Future" });
    expect(kept.suppliers).toContainEqual({ name: "Nice Future", count: 0 });
    expect([...kept.visibleOrderIds]).toEqual([]);
  });

  it("filters from different sections combine — All not ordered + Mattress + Hooka", () => {
    const m = model({ notOrderedOnly: true, product: "mattress", supplier: "Hooka" });
    expect([...m.visibleOrderIds]).toEqual(["oA"]);
  });

  it("SETUP TO FIX exists only while an affected order does, and filters to it", () => {
    expect(model().setupExists).toBe(true);
    expect(model().setupCount).toBe(1);
    expect([...model({ setup: true }).visibleOrderIds]).toEqual(["oD"]);
    const without = soBatchRailModel(
      soBatchRailFacts(RAIL_ORDERS, RAIL_LEAFS.filter((l) => l.orderId !== "oD")),
      SO_BATCH_RAIL_CLEAR,
    );
    expect(without.setupExists).toBe(false);
    expect(without.setupCount).toBe(0);
  });
});

describe("every timing row stays orderable; blockers and Buy = 0 do not", () => {
  it("takes any timing state whose Buy is positive — timing risk is not `Cannot buy`", () => {
    for (const state of SO_BATCH_RAIL.timing.states) {
      expect(isSelectableForBuying(row({ state })), state).toBe(true);
    }
  });

  it("refuses every blocked state, however tempting its numbers look", () => {
    for (const state of ["no_customer_date", "no_sku", "no_supplier", "no_production_days"] as const) {
      expect(isSelectableForBuying(row({ state, toBuy: 5 })), state).toBe(false);
    }
  });

  it("refuses a row with nothing left to buy", () => {
    expect(isSelectableForBuying(row({ toBuy: 0 }))).toBe(false);
    expect(isSelectableForBuying(row({ toBuy: null }))).toBe(false);
  });

  it("refuses a row the engine gave no issue reference", () => {
    expect(isSelectableForBuying(row({ issueRef: null }))).toBe(false);
  });

  it("refuses a row with no supplier resolved", () => {
    expect(isSelectableForBuying(row({ supplierId: null, supplier: null }))).toBe(false);
  });
});

describe("defaultAllocations — everything goes to Carres Klang", () => {
  it("puts the whole server Buy on the default destination", () => {
    expect(defaultAllocations(row({ toBuy: 11 }), KLANG.id)).toEqual([
      { destinationId: KLANG.id, qty: 11 },
    ]);
  });

  it("allocates nothing at all when there is nothing to buy", () => {
    expect(defaultAllocations(row({ toBuy: 0 }), KLANG.id)).toEqual([]);
    expect(defaultAllocations(row({ toBuy: null }), KLANG.id)).toEqual([]);
  });
});

describe("setDestination — the whole row moves without a revision", () => {
  it("replaces the arrangement with one line at the new destination", () => {
    const s = sel(row({ toBuy: 11 }), [{ destinationId: KLANG.id, qty: 11 }]);
    expect(setDestination(s, SG_BULOH.id, 11).allocations).toEqual([
      { destinationId: SG_BULOH.id, qty: 11 },
    ]);
  });

  it("does not mutate the selection it was handed", () => {
    const before: DestinationAllocation[] = [{ destinationId: KLANG.id, qty: 11 }];
    const s = sel(row({ toBuy: 11 }), before);
    setDestination(s, SG_BULOH.id, 11);
    expect(before).toEqual([{ destinationId: KLANG.id, qty: 11 }]);
    expect(s.allocations).toEqual([{ destinationId: KLANG.id, qty: 11 }]);
  });
});

describe("splitAllocation — one Buy across two or three destinations", () => {
  it("balances the Card's own example: 10 Klang + 1 Sungai Buloh = 11", () => {
    const r = row({ toBuy: 11 });
    const s = splitAllocation(sel(r, defaultAllocations(r, KLANG.id)), [
      { destinationId: KLANG.id, qty: 10 },
      { destinationId: SG_BULOH.id, qty: 1 },
    ]);
    expect(validateAllocations(r, s.allocations, DESTINATIONS)).toEqual({ ok: true });
  });

  it("merges two lines aimed at the same destination rather than printing it twice", () => {
    const r = row({ toBuy: 11 });
    const s = splitAllocation(sel(r, []), [
      { destinationId: KLANG.id, qty: 4 },
      { destinationId: SG_BULOH.id, qty: 1 },
      { destinationId: KLANG.id, qty: 6 },
    ]);
    expect(s.allocations).toEqual([
      { destinationId: KLANG.id, qty: 10 },
      { destinationId: SG_BULOH.id, qty: 1 },
    ]);
  });

  it("drops a zero line instead of carrying an empty destination into a PO", () => {
    const r = row({ toBuy: 3 });
    const s = splitAllocation(sel(r, []), [
      { destinationId: KLANG.id, qty: 3 },
      { destinationId: SG_BULOH.id, qty: 0 },
    ]);
    expect(s.allocations).toEqual([{ destinationId: KLANG.id, qty: 3 }]);
  });
});

describe("validateAllocations — the arrangement must add back to the server's Buy", () => {
  const r = row({ toBuy: 11 });

  it("accepts a total that equals Buy", () => {
    expect(
      validateAllocations(r, [
        { destinationId: KLANG.id, qty: 10 },
        { destinationId: SG_BULOH.id, qty: 1 },
      ], DESTINATIONS),
    ).toEqual({ ok: true });
  });

  it("refuses a short total and says both numbers", () => {
    const v = validateAllocations(r, [{ destinationId: KLANG.id, qty: 10 }], DESTINATIONS);
    expect(v.ok).toBe(false);
    if (v.ok) return;
    expect(v.message).toContain("10");
    expect(v.message).toContain("11");
  });

  it("refuses an over-total", () => {
    const v = validateAllocations(r, [
      { destinationId: KLANG.id, qty: 10 },
      { destinationId: SG_BULOH.id, qty: 2 },
    ], DESTINATIONS);
    expect(v.ok).toBe(false);
  });

  it("refuses zero, negative and fractional quantities", () => {
    for (const qty of [0, -1, 1.5]) {
      const v = validateAllocations(row({ toBuy: qty === 0 ? 0 : 11 }), [
        { destinationId: KLANG.id, qty },
      ], DESTINATIONS);
      expect(v.ok, String(qty)).toBe(false);
    }
  });

  it("refuses a destination that is switched off", () => {
    const v = validateAllocations(r, [
      { destinationId: KLANG.id, qty: 10 },
      { destinationId: CLOSED.id, qty: 1 },
    ], DESTINATIONS);
    expect(v.ok).toBe(false);
    if (v.ok) return;
    expect(v.message).toContain(CLOSED.name);
  });

  it("refuses a destination nobody has heard of", () => {
    const v = validateAllocations(r, [
      { destinationId: "44444444-4444-4444-8444-444444444444", qty: 11 },
    ], DESTINATIONS);
    expect(v.ok).toBe(false);
  });

  it("refuses any arrangement on a row that may not be bought at all", () => {
    const blocked = row({ state: "no_supplier", toBuy: null, supplierId: null });
    const v = validateAllocations(blocked, [{ destinationId: KLANG.id, qty: 1 }], DESTINATIONS);
    expect(v.ok).toBe(false);
  });
});

describe("documents are grouped by supplier × Deliver To", () => {
  it("the key is supplier × destination × category × sofa-order, and nothing else", () => {
    const k = (over: Partial<Parameters<typeof documentPartitionKey>[0]> = {}) =>
      documentPartitionKey({
        supplierId: "s-hooka",
        destinationId: KLANG.id,
        category: "mattress",
        orderId: "o1",
        ...over,
      });
    expect(k()).toBe(`s-hooka::${KLANG.id}::mattress::`);
    // Each part moves the key.
    expect(k({ destinationId: SG_BULOH.id })).not.toBe(k());
    expect(k({ supplierId: "s-ohana" })).not.toBe(k());
    expect(k({ category: "bedframe" })).not.toBe(k());
    // ...except the order, which only matters where a sofa says it does.
    expect(k({ orderId: "o2" })).toBe(k());
  });

  it("⭐ a SOFA is one document per customer order — the locked 2026-07-27 rule", () => {
    const sofa = (orderId: string) =>
      documentPartitionKey({
        supplierId: "s-ohana", destinationId: KLANG.id, category: "sofa", orderId,
      });
    expect(sofa("o1")).not.toBe(sofa("o2"));
    expect(sofa("o1")).toBe(`s-ohana::${KLANG.id}::sofa::o1`);
  });

  it("a non-sofa category consolidates across customer orders", () => {
    const mattress = (orderId: string) =>
      documentPartitionKey({
        supplierId: "s-hooka", destinationId: KLANG.id, category: "mattress", orderId,
      });
    expect(mattress("o1")).toBe(mattress("o2"));
  });

  it("an uncatalogued line gets its own partition rather than joining one", () => {
    const key = documentPartitionKey({
      supplierId: "s-hooka", destinationId: KLANG.id, category: null, orderId: "o1",
    });
    expect(key).toContain("uncatalogued");
  });

  it("one supplier split across two destinations becomes TWO documents", () => {
    const r = row({ toBuy: 11 });
    const docs = groupSelectionsIntoDocuments(
      [sel(r, [
        { destinationId: KLANG.id, qty: 10 },
        { destinationId: SG_BULOH.id, qty: 1 },
      ])],
      new Map([[r.id, r]]),
    );
    expect(docs).toHaveLength(2);
    expect(docs.map((d) => d.destinationId).sort()).toEqual(
      [KLANG.id, SG_BULOH.id].sort(),
    );
    expect(docs.every((d) => d.supplierId === "s-hooka")).toBe(true);
  });

  it("two Sales Orders on one supplier and one destination share ONE document", () => {
    const a = row({ id: "a", so: 1318, toBuy: 2 });
    const b = row({ id: "b", so: 1321, orderId: "o2", toBuy: 3 });
    const docs = groupSelectionsIntoDocuments(
      [
        sel(a, [{ destinationId: KLANG.id, qty: 2 }]),
        sel(b, [{ destinationId: KLANG.id, qty: 3 }]),
      ],
      new Map([[a.id, a], [b.id, b]]),
    );
    expect(docs).toHaveLength(1);
    expect(docs[0]!.qty).toBe(5);
    // Every line keeps its own source SO — a shared PO never loses attribution.
    expect(docs[0]!.lines.map((l) => l.so).sort()).toEqual([1318, 1321]);
  });

  it("two suppliers never share a document, however the destination falls", () => {
    const a = row({ id: "a", supplierId: "s-hooka", supplier: "Hooka", toBuy: 2 });
    const b = row({ id: "b", supplierId: "s-ohana", supplier: "Ohana", toBuy: 2 });
    const docs = groupSelectionsIntoDocuments(
      [
        sel(a, [{ destinationId: KLANG.id, qty: 2 }]),
        sel(b, [{ destinationId: KLANG.id, qty: 2 }]),
      ],
      new Map([[a.id, a], [b.id, b]]),
    );
    expect(docs).toHaveLength(2);
  });

  it("the grouping is a HINT — it carries no price, number or arrival date", () => {
    const r = row({ toBuy: 2 });
    const [doc] = groupSelectionsIntoDocuments(
      [sel(r, [{ destinationId: KLANG.id, qty: 2 }])],
      new Map([[r.id, r]]),
    );
    expect(Object.keys(doc!).sort()).toEqual(
      [
        "destinationId", "key", "lines", "qty", "supplierId", "supplierName",
        "supplierKind", "category", "orderId",
      ].sort(),
    );
    // Still no price, no number and no arrival date on the GROUPING itself —
    // the catalog cost rides on the LINE, where the operator prices it.
    expect(doc).not.toHaveProperty("unitCost");
    expect(doc).not.toHaveProperty("etaDate");
  });
});

describe("the selection bar counts lines, units and documents", () => {
  it("says how many lines, how many units and how many POs will be created", () => {
    const a = row({ id: "a", toBuy: 2 });
    const b = row({ id: "b", supplierId: "s-ohana", supplier: "Ohana", toBuy: 5 });
    const summary = soBatchSelectionSummary(
      [
        sel(a, [{ destinationId: KLANG.id, qty: 2 }]),
        sel(b, [
          { destinationId: KLANG.id, qty: 4 },
          { destinationId: SG_BULOH.id, qty: 1 },
        ]),
      ],
      new Map([[a.id, a], [b.id, b]]),
    );
    expect(summary.lines).toBe(2);
    expect(summary.units).toBe(7);
    expect(summary.documents).toBe(3);
    expect(summary.text).toBe("2 selected · 7 units · Issue 3 POs");
  });

  it("says nothing at all when nothing is selected", () => {
    const summary = soBatchSelectionSummary([], new Map());
    expect(summary.lines).toBe(0);
    expect(summary.text).toBe("");
  });

  it("one of each reads in the singular", () => {
    const a = row({ id: "a", toBuy: 1 });
    const summary = soBatchSelectionSummary(
      [sel(a, [{ destinationId: KLANG.id, qty: 1 }])],
      new Map([[a.id, a]]),
    );
    expect(summary.text).toBe("1 selected · 1 unit · Issue 1 PO");
  });
});

// ─── The lines one document carries, and their lineage ───────────────────────

describe("composeDocumentLines", () => {
  const single = (
    key: string,
    sku: string,
    qty: number,
    cost: number | null = 100,
  ) => ({
    key,
    qty,
    lines: [{ lineId: `${key}-l1`, sku, qty, cost }],
  });

  it("scales a split allocation instead of repeating the whole build", () => {
    /* ⭐ THE REGRESSION. A build of 11 split 10 + 1 used to produce TWO
       purchase orders of 11 — 22 units bought for an 11-unit demand. */
    const build = single("b1", "B1201S-K", 11);
    const klang = composeDocumentLines([
      { build, orderId: "o1", so: 1318, qty: 10 },
    ]);
    const buloh = composeDocumentLines([
      { build, orderId: "o1", so: 1318, qty: 1 },
    ]);
    expect(klang.ok && klang.lines[0]!.qty).toBe(10);
    expect(buloh.ok && buloh.lines[0]!.qty).toBe(1);
    const total =
      (klang.ok ? klang.lines[0]!.qty : 0) + (buloh.ok ? buloh.lines[0]!.qty : 0);
    expect(total).toBe(11);
  });

  it("adds one SKU from several customer orders into one line with three sources", () => {
    const res = composeDocumentLines([
      { build: single("b1", "M-KING", 2), orderId: "o1", so: 1318, qty: 2 },
      { build: single("b2", "M-KING", 1), orderId: "o2", so: 1321, qty: 1 },
      { build: single("b3", "M-KING", 3), orderId: "o3", so: null, qty: 3 },
    ]);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.lines).toHaveLength(1);
    const line = res.lines[0]!;
    expect(line.qty).toBe(6);
    expect(line.sources.map((s) => [s.so, s.qty])).toEqual([
      [1318, 2],
      [1321, 1],
      [null, 3],
    ]);
    /* THE PARTS MUST ADD UP TO THE LINE — the rule 0382 refuses in SQL. */
    expect(line.sources.reduce((s, x) => s + x.qty, 0)).toBe(line.qty);
  });

  it("keeps every source's own order line, so SQL can validate the lineage", () => {
    const res = composeDocumentLines([
      { build: single("b1", "M-KING", 2), orderId: "o1", so: 1318, qty: 2 },
    ]);
    expect(res.ok && res.lines[0]!.sources[0]).toEqual({
      orderId: "o1",
      so: 1318,
      orderLineId: "b1-l1",
      qty: 2,
    });
  });

  it("carries a whole matched set, and every module keeps its own quantity", () => {
    const sofa = {
      key: "sofa1",
      qty: 1,
      lines: [
        { lineId: "l1", sku: "5539-1B", qty: 1, cost: 500 },
        { lineId: "l2", sku: "5539-CNR", qty: 2, cost: 300 },
      ],
    };
    const res = composeDocumentLines([
      { build: sofa, orderId: "o1", so: 1318, qty: 1 },
    ]);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.lines.map((l) => [l.sku, l.qty])).toEqual([
      ["5539-1B", 1],
      ["5539-CNR", 2],
    ]);
  });

  it("refuses to cut a matched set across two places", () => {
    const sofa = {
      key: "sofa1",
      qty: 2,
      lines: [
        { lineId: "l1", sku: "5539-1B", qty: 2, cost: 500 },
        { lineId: "l2", sku: "5539-CNR", qty: 2, cost: 300 },
      ],
    };
    expect(
      composeDocumentLines([{ build: sofa, orderId: "o1", so: 1318, qty: 1 }]),
    ).toEqual({ ok: false, code: "partial_split_not_allowed" });
  });

  it("says nothing_to_issue rather than composing an empty document", () => {
    expect(composeDocumentLines([])).toEqual({ ok: false, code: "nothing_to_issue" });
    expect(
      composeDocumentLines([
        { build: single("b1", "M-KING", 2), orderId: "o1", so: 1, qty: 0 },
      ]),
    ).toEqual({ ok: false, code: "nothing_to_issue" });
  });

  it("keeps the catalog cost the engine read, and never invents one", () => {
    const res = composeDocumentLines([
      { build: single("b1", "M-KING", 1, null), orderId: "o1", so: 1, qty: 1 },
    ]);
    expect(res.ok && res.lines[0]!.cost).toBeNull();
  });
});

// ─── Card 02-B — one row per proceeded Sales Order ───────────────────────────

describe("soBatchOrderStatusOf — blank · Partial · Ordered, derived and never stored", () => {
  it("nothing requiring purchasing is blank — a fully Ready-Stock order stays quiet", () => {
    expect(soBatchOrderStatusOf({ buyingRequiredQty: 0, sentCoveredQty: 0 })).toBe("blank");
  });

  it("no current-version confirmed-sent coverage is blank — a numbered unsent PO completes nothing", () => {
    expect(soBatchOrderStatusOf({ buyingRequiredQty: 5, sentCoveredQty: 0 })).toBe("blank");
  });

  it("some but not all covered is Partial", () => {
    expect(soBatchOrderStatusOf({ buyingRequiredQty: 5, sentCoveredQty: 2 })).toBe("partial");
  });

  it("everything covered is Ordered", () => {
    expect(soBatchOrderStatusOf({ buyingRequiredQty: 5, sentCoveredQty: 5 })).toBe("ordered");
  });

  it("the visible words are blank · Partial · Ordered — never a retired status word", () => {
    expect(SO_BATCH_ORDER_STATUS_WORDS.blank).toBe("");
    expect(SO_BATCH_ORDER_STATUS_WORDS.partial).toBe("Partial");
    expect(SO_BATCH_ORDER_STATUS_WORDS.ordered).toBe("Ordered");
    const spelt = Object.values(SO_BATCH_ORDER_STATUS_WORDS).join(" | ");
    for (const banned of [
      "Ready Stock",
      "Ready to buy",
      "Cannot buy",
      "No buying needed",
      "Posted",
      "Sent",
      "Not sent",
      "Covered",
    ]) {
      expect(spelt, banned).not.toContain(banned);
    }
  });
});

describe("soBatchCellSummary — a deterministic parent cell over many values", () => {
  it("none · one · many, deduplicated and sorted", () => {
    expect(soBatchCellSummary([])).toEqual({ kind: "none" });
    expect(soBatchCellSummary([null, ""])).toEqual({ kind: "none" });
    expect(soBatchCellSummary(["PO-1"])).toEqual({ kind: "one", value: "PO-1" });
    expect(soBatchCellSummary(["PO-2", "PO-1", "PO-2"])).toEqual({
      kind: "many",
      count: 2,
      values: ["PO-1", "PO-2"],
    });
  });

  it("two refreshes cannot summarise one order two ways — order of input is irrelevant", () => {
    expect(soBatchCellSummary(["b", "a"])).toEqual(soBatchCellSummary(["a", "b", "a"]));
  });
});

describe("soBatchOrderSelection — the parent checkbox is all eligible child demand", () => {
  it("no eligible child demand is unselectable — Ordered and fully Ready-Stock rows refuse the tick", () => {
    expect(soBatchOrderSelection({ eligibleIds: [], selectedIds: new Set() })).toEqual({
      selectable: false,
      checked: false,
      indeterminate: false,
    });
  });

  it("all eligible children selected is checked", () => {
    expect(
      soBatchOrderSelection({ eligibleIds: ["a", "b"], selectedIds: new Set(["a", "b"]) }),
    ).toEqual({ selectable: true, checked: true, indeterminate: false });
  });

  it("part of the eligible children selected is indeterminate", () => {
    expect(
      soBatchOrderSelection({ eligibleIds: ["a", "b"], selectedIds: new Set(["a"]) }),
    ).toEqual({ selectable: true, checked: false, indeterminate: true });
  });

  it("a Partial order selects only its uncovered eligible remainder — covered ids never count", () => {
    // The covered line is simply not eligible, so a tick on it cannot exist.
    const s = soBatchOrderSelection({
      eligibleIds: ["remainder"],
      selectedIds: new Set(["remainder", "covered-line"]),
    });
    expect(s).toEqual({ selectable: true, checked: true, indeterminate: false });
  });
});

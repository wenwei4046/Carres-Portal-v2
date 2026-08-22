import { describe, it, expect } from "vitest";
import {
  SO_BATCH_PURCHASE_WORDS as W,
  SO_BATCH_RAIL_GROUPS,
  defaultAllocations,
  setDestination,
  splitAllocation,
  validateAllocations,
  documentGroupKey,
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
    state: "ready_to_buy",
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
    ownerName: null,
    ownerDuty: null,
    ...over,
  };
}

const sel = (r: PurchaseDemandRow, allocations: DestinationAllocation[]): SoBatchSelection => ({
  demandId: r.id,
  allocations,
});

describe("the rail is two headings over the six governed states", () => {
  it("is BUYING RECORDS then WORK TO DO, in the approved order", () => {
    expect(SO_BATCH_RAIL_GROUPS.map((g) => g.heading)).toEqual([
      "BUYING RECORDS",
      "WORK TO DO",
    ]);
    expect(SO_BATCH_RAIL_GROUPS[0]!.states).toEqual(["ready_to_buy", "covered"]);
    expect(SO_BATCH_RAIL_GROUPS[1]!.states).toEqual([
      "no_customer_date",
      "no_sku",
      "no_supplier",
      "no_production_days",
    ]);
  });

  it("names all six states exactly once — there is no seventh", () => {
    const all = SO_BATCH_RAIL_GROUPS.flatMap((g) => g.states);
    expect(all).toHaveLength(6);
    expect(new Set(all).size).toBe(6);
  });

  it("the page's own words are the governed ones", () => {
    expect(W.search).toBe("Search Sales Order, customer, SKU or supplier…");
    expect(W.empty).toBe("Nothing needs buying.");
    expect(W.footerUnit).toBe("buying lines");
    expect(W.deliverTo).toBe("Deliver To");
    expect(W.goodsMustArrive).toBe("Goods Must Arrive");
    expect(W.buy).toBe("Buy");
  });

  it("no banned Purchasing word is spelt anywhere in the dictionary", () => {
    const spelt = Object.values(W).join(" ");
    for (const banned of [
      "Today",
      "Tomorrow",
      "Needs attention",
      "Follow up",
      "Pending",
      "Waiting",
      "Priority",
      "Next action",
      "PO Schedule",
      "CATEGORY",
    ]) {
      expect(spelt, banned).not.toContain(banned);
    }
  });
});

describe("only a ready row with something to buy may be selected", () => {
  it("takes a ready row whose Buy is positive", () => {
    expect(isSelectableForBuying(row())).toBe(true);
  });

  it("refuses every blocked state, however tempting its numbers look", () => {
    for (const state of ["no_customer_date", "no_sku", "no_supplier", "no_production_days"] as const) {
      expect(isSelectableForBuying(row({ state, toBuy: 5 })), state).toBe(false);
    }
  });

  it("refuses a covered row and a row with nothing left to buy", () => {
    expect(isSelectableForBuying(row({ state: "covered", toBuy: 0 }))).toBe(false);
    expect(isSelectableForBuying(row({ toBuy: 0 }))).toBe(false);
    expect(isSelectableForBuying(row({ toBuy: null }))).toBe(false);
  });

  it("refuses a ready row the engine gave no issue reference", () => {
    expect(isSelectableForBuying(row({ issueRef: null }))).toBe(false);
  });

  it("refuses a ready row with no supplier resolved", () => {
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
  it("the key is supplier and destination, and nothing else", () => {
    expect(documentGroupKey("s-hooka", KLANG.id)).toBe(`s-hooka::${KLANG.id}`);
    expect(documentGroupKey("s-hooka", KLANG.id)).not.toBe(
      documentGroupKey("s-hooka", SG_BULOH.id),
    );
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
      ["destinationId", "key", "lines", "qty", "supplierId", "supplierName"].sort(),
    );
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

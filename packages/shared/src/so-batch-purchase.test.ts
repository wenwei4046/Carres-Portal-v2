import { describe, it, expect } from "vitest";
import {
  SO_BATCH_PURCHASE_WORDS as W,
  SO_BATCH_RAIL_GROUPS,
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
    costs: [{ sku: "B1201S-K", unitCost: 100 }],
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

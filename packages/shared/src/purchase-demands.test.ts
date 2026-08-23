import { describe, it, expect } from "vitest";
import {
  PURCHASE_DEMAND_STATES,
  PURCHASE_DEMAND_STATE_WORDS,
  PURCHASE_DEMAND_RAIL_WORDS,
  PURCHASE_DEMAND_WORDS,
  filterPurchaseDemands,
  groupPurchaseDemands,
  purchaseDemandCoverageLine,
  purchaseDemandFooter,
  purchaseDemandHelpLine,
  purchaseDemandQuantities,
  purchaseDemandStateCounts,
  purchaseDemandStateOf,
  purchaseDemandsResponseSchema,
  soBatchAction,
  soBatchPurchaseResponseSchema,
  type PurchaseDemandRow,
  type PurchaseDemandState,
} from "./purchase-demands";

function row(over: Partial<PurchaseDemandRow> = {}): PurchaseDemandRow {
  return {
    id: "r1",
    state: "ready_to_buy",
    lineIds: ["l1"],
    orderId: "o1",
    so: 1207,
    customer: "PETER",
    customerDelivery: "2026-09-01",
    item: "Booqit",
    variant: "King",
    category: "mattress",
    skus: ["B1201S-K"],
    supplierId: "s1",
    supplier: "Ohana",
    qtyNeeded: 2,
    readyStock: 0,
    takenFromStock: 0,
    onPo: 0,
    poNumbers: [],
    toBuy: 2,
    goodsMustArrive: "2026-08-19",
    issueRef: { proposalKey: "s1::mattress", buildKey: "b1" },
    action: null,
    costs: [{ sku: "B1201S-K", unitCost: 100 }],
    supplierKind: "own_logistics",
    ownerName: null,
    ownerDuty: null,
    ...over,
  };
}

describe("purchaseDemandStateOf — one derivation, engine precedence", () => {
  const base = {
    inCatalog: true,
    hasSupplier: true,
    hasProductionDays: true,
    fullyCovered: false,
    hasCustomerDate: true,
  };

  it("names every one of the six states", () => {
    expect(purchaseDemandStateOf(base)).toBe("ready_to_buy");
    expect(purchaseDemandStateOf({ ...base, hasCustomerDate: false })).toBe(
      "no_customer_date",
    );
    expect(purchaseDemandStateOf({ ...base, inCatalog: false })).toBe("no_sku");
    expect(purchaseDemandStateOf({ ...base, hasSupplier: false })).toBe("no_supplier");
    expect(purchaseDemandStateOf({ ...base, hasProductionDays: false })).toBe(
      "no_production_days",
    );
    expect(purchaseDemandStateOf({ ...base, fullyCovered: true })).toBe("covered");
  });

  it("a SKU absent from Catalog is `SKU not found`, never silently Service", () => {
    // Catalog is the only authority able to decide what a sold SKU is, so an
    // absent one is NAMED rather than assumed away (card §3).
    expect(
      purchaseDemandStateOf({
        ...base,
        inCatalog: false,
        hasSupplier: false,
        hasProductionDays: false,
      }),
    ).toBe("no_sku");
  });

  it("covered outranks a missing customer date — nothing is left to buy", () => {
    expect(
      purchaseDemandStateOf({ ...base, fullyCovered: true, hasCustomerDate: false }),
    ).toBe("covered");
  });

  it("a supplier-less line never hides behind a missing date", () => {
    expect(
      purchaseDemandStateOf({ ...base, hasSupplier: false, hasCustomerDate: false }),
    ).toBe("no_supplier");
  });

  it("every state has a fact word and a rail word", () => {
    for (const s of PURCHASE_DEMAND_STATES) {
      expect(PURCHASE_DEMAND_STATE_WORDS[s].length).toBeGreaterThan(0);
      expect(PURCHASE_DEMAND_RAIL_WORDS[s].length).toBeGreaterThan(0);
    }
  });

  it("no rail word uses a banned generic attention word", () => {
    const banned = ["Today", "Tomorrow", "Needs attention", "Follow up", "Pending", "Waiting"];
    for (const s of PURCHASE_DEMAND_STATES) {
      for (const b of banned) {
        expect(PURCHASE_DEMAND_RAIL_WORDS[s]).not.toContain(b);
        expect(PURCHASE_DEMAND_STATE_WORDS[s]).not.toContain(b);
      }
    }
  });
});

describe("purchaseDemandQuantities — the engine's numbers, never a second count", () => {
  it("a plain line states ordered = to buy + on PO + already drawn", () => {
    const q = purchaseDemandQuantities(
      { qty: 1, freeStock: 3, takenFromStock: 1, coveredByOpenPo: 2, lines: ["a"] },
      "mattress",
    );
    expect(q).toEqual({
      qtyNeeded: 4,
      readyStock: 3,
      takenFromStock: 1,
      onPo: 2,
      toBuy: 1,
    });
  });

  it("a fully covered build buys nothing and states what the PO carries", () => {
    const q = purchaseDemandQuantities(
      {
        qty: 3,
        freeStock: 0,
        takenFromStock: 0,
        coveredByOpenPo: 3,
        fullyOnPo: true,
        lines: ["a"],
      },
      "mattress",
    );
    expect(q.toBuy).toBe(0);
    expect(q.qtyNeeded).toBe(3);
    expect(q.onPo).toBe(3);
  });

  it("a modular sofa states ONE sofa — a module count is never added to it", () => {
    const q = purchaseDemandQuantities(
      { qty: 1, freeStock: 0, takenFromStock: 0, coveredByOpenPo: 1, lines: ["a", "b", "c"] },
      "sofa",
    );
    expect(q.qtyNeeded).toBe(1);
    expect(q.toBuy).toBe(1);
    expect(q.onPo).toBe(1);
  });

  it("a lone sofa line keeps its own quantity", () => {
    const q = purchaseDemandQuantities(
      { qty: 5, freeStock: 0, takenFromStock: 0, coveredByOpenPo: 0, lines: ["a"] },
      "sofa",
    );
    expect(q.qtyNeeded).toBe(5);
  });
});

describe("the two-line treatment", () => {
  it("every blocker carries a help line; a good row carries none", () => {
    expect(purchaseDemandHelpLine(row({ state: "ready_to_buy" }))).toBeNull();
    expect(purchaseDemandHelpLine(row({ state: "covered" }))).toBeNull();
    expect(purchaseDemandHelpLine(row({ state: "no_customer_date" }))).toBe(
      "Ask customer for a delivery date",
    );
    expect(purchaseDemandHelpLine(row({ state: "no_sku" }))).toBe(
      "Add this item to the SKU catalog",
    );
    expect(purchaseDemandHelpLine(row({ state: "no_supplier", item: "B1201S" }))).toBe(
      "Check the supplier for B1201S",
    );
    expect(
      purchaseDemandHelpLine(
        row({ state: "no_production_days", supplier: "Nice Future", category: "mattress" }),
      ),
    ).toBe("Add production days for Nice Future · Mattress");
  });

  it("the help line never names a person", () => {
    for (const s of PURCHASE_DEMAND_STATES) {
      const line = purchaseDemandHelpLine(row({ state: s as PurchaseDemandState }));
      if (line) expect(line).not.toMatch(/\b(SH|YJ|JL)\b/);
    }
  });
});

describe("purchaseDemandCoverageLine", () => {
  it("names the purchase orders behind the cover", () => {
    expect(
      purchaseDemandCoverageLine({
        readyStock: 0,
        takenFromStock: 0,
        onPo: 2,
        poNumbers: ["PO-2051", "PO-2052"],
      }),
    ).toBe("2 on PO-2051 · PO-2052");
  });

  it("states free stock and an already-drawn unit", () => {
    expect(
      purchaseDemandCoverageLine({
        readyStock: 4,
        takenFromStock: 1,
        onPo: 0,
        poNumbers: [],
      }),
    ).toBe("1 from stock · 4 free in stock");
  });

  it("an uncounted row says so — it never prints a zero it does not know", () => {
    expect(
      purchaseDemandCoverageLine({
        readyStock: null,
        takenFromStock: null,
        onPo: null,
        poNumbers: [],
      }),
    ).toBe(PURCHASE_DEMAND_WORDS.coverageUnknown);
  });

  it("a counted row with nothing covering it says that instead", () => {
    expect(
      purchaseDemandCoverageLine({
        readyStock: 0,
        takenFromStock: 0,
        onPo: 0,
        poNumbers: [],
      }),
    ).toBe(PURCHASE_DEMAND_WORDS.coverageNone);
  });
});

describe("grouping, filtering, counting", () => {
  const rows = [
    row({ id: "a", item: "Booqit", variant: "King", toBuy: 2, qtyNeeded: 2 }),
    row({ id: "b", item: "Booqit", variant: "Queen", toBuy: 1, qtyNeeded: 1 }),
    row({
      id: "c",
      item: "Haven",
      variant: null,
      toBuy: 0,
      qtyNeeded: 3,
      onPo: 3,
      poNumbers: ["PO-2051"],
      state: "covered",
    }),
    row({ id: "d", item: "Transport Fees", variant: null, state: "no_sku", category: null,
      supplier: null, supplierId: null, readyStock: null, takenFromStock: null, onPo: null,
      toBuy: null, qtyNeeded: 1 }),
  ];

  it("builds item → variant → leaf, shortages first", () => {
    const groups = groupPurchaseDemands(rows);
    expect(groups.map((g) => g.item)).toEqual(["Booqit", "Haven", "Transport Fees"]);
    const booqit = groups[0]!;
    expect(booqit.variants.map((v) => v.variant)).toEqual(["King", "Queen"]);
    expect(booqit.toBuy).toBe(3);
    expect(booqit.singleVariant).toBe(false);
  });

  it("a single-variant item says so, so the tree may collapse it", () => {
    const groups = groupPurchaseDemands(rows);
    expect(groups.find((g) => g.item === "Haven")!.singleVariant).toBe(true);
  });

  it("an uncatalogued row keeps its own group and never joins a catalogued item", () => {
    const groups = groupPurchaseDemands(rows);
    const fees = groups.find((g) => g.item === "Transport Fees")!;
    expect(fees.category).toBeNull();
    expect(fees.toBuy).toBe(0);
  });

  it("an empty rail selection means every state", () => {
    expect(filterPurchaseDemands(rows, new Set()).length).toBe(4);
    expect(filterPurchaseDemands(rows, new Set(["covered"] as const)).map((r) => r.id)).toEqual([
      "c",
    ]);
    expect(
      filterPurchaseDemands(rows, new Set(["covered", "no_sku"] as const)).map((r) => r.id),
    ).toEqual(["c", "d"]);
  });

  it("counts every state, including the zeroes", () => {
    const counts = purchaseDemandStateCounts(rows);
    expect(counts).toEqual({
      ready_to_buy: 2,
      no_customer_date: 0,
      no_sku: 1,
      no_supplier: 0,
      no_production_days: 0,
      covered: 1,
    });
  });
});

describe("purchaseDemandFooter", () => {
  const rows = [row({ id: "a", qtyNeeded: 2, toBuy: 2 }), row({ id: "b", qtyNeeded: 1, toBuy: 1 })];

  it("states the listing's own units", () => {
    expect(purchaseDemandFooter(rows, rows)).toBe("2 demand lines · 3 units needed · 3 units to buy");
  });

  it("makes a narrowed listing explicit", () => {
    expect(purchaseDemandFooter([rows[0]!], rows)).toBe(
      "1 of 2 demand lines · 2 units needed · 2 units to buy",
    );
  });
});

describe("the wire", () => {
  it("accepts a complete row and refuses an invented state", () => {
    const body = { today: "2026-08-20", rows: [row()], stockWarehouse: "Carres Klang" };
    expect(purchaseDemandsResponseSchema.parse(body).rows.length).toBe(1);
    expect(
      purchaseDemandsResponseSchema.safeParse({
        ...body,
        rows: [{ ...row(), state: "needs_attention" }],
      }).success,
    ).toBe(false);
  });
});


/**
 * CARD-2026-08-22-purchasing-02 — the three facts SO Batch Purchase needs that
 * the Register alone never did: the date the goods must physically arrive, the
 * engine reference an issue is built from, and the structured Work action.
 */
describe("the buying facts the row now carries", () => {
  it("carries the arrival date the SERVER derived — the browser subtracts nothing", () => {
    const r = row({ goodsMustArrive: "2026-08-19", customerDelivery: "2026-08-28" });
    expect(r.goodsMustArrive).toBe("2026-08-19");
    // It is a carried fact, not a function of the customer date.
    expect(row({ customerDelivery: null, goodsMustArrive: null }).goodsMustArrive).toBeNull();
  });

  it("carries the engine reference a purchase order is actually built from", () => {
    expect(row().issueRef).toEqual({ proposalKey: "s1::mattress", buildKey: "b1" });
    // A refused line has no build, so it has no reference — and cannot be issued.
    expect(row({ state: "no_supplier", issueRef: null }).issueRef).toBeNull();
  });

  it("the action is STRUCTURED — trigger, owner rule, act, completion fact and source", () => {
    const action = soBatchAction({
      state: "no_customer_date",
      item: "Booqit",
      supplier: "Hooka",
      category: "mattress",
      ownerId: "u1",
      ownerName: "Shasha",
      orderId: "o1",
      so: 1318,
      dueDate: "2026-08-19",
    });
    expect(action).not.toBeNull();
    expect(action!.trigger).toBe("no_customer_date");
    expect(action!.ownerRule).toBe("Responsible Salesperson");
    expect(action!.ownerName).toBe("Shasha");
    expect(action!.action).toBe("Ask customer for a delivery date");
    expect(action!.completionFact).toBe("Customer Delivery exists");
    expect(action!.sourceObject).toEqual({ type: "sales_order", id: "o1", number: "SO-1318" });
    expect(action!.dueDate).toBe("2026-08-19");
  });

  it("every trigger names its owner rule and its completion fact", () => {
    const expected: Record<string, [string, string]> = {
      ready_to_buy: ["Current PO Duty", "Current PO version reached supplier with evidence"],
      no_customer_date: ["Responsible Salesperson", "Customer Delivery exists"],
      no_sku: ["Catalog/Master Data through Current PO Duty", "Approved SKU exists"],
      no_supplier: ["Current PO Duty", "Approved supplier relationship exists"],
      no_production_days: [
        "Purchasing Settings authority",
        "Governed supplier/category days exist",
      ],
    };
    for (const [trigger, [rule, fact]] of Object.entries(expected)) {
      const a = soBatchAction({
        state: trigger as PurchaseDemandState,
        item: "Booqit",
        supplier: "Hooka",
        category: "mattress",
        ownerId: null,
        ownerName: null,
        orderId: "o1",
        so: 1318,
        dueDate: null,
      });
      expect(a, trigger).not.toBeNull();
      expect(a!.ownerRule, trigger).toBe(rule);
      expect(a!.completionFact, trigger).toBe(fact);
    }
  });

  it("a covered line has no action — nothing is owed on it", () => {
    expect(
      soBatchAction({
        state: "covered",
        item: "Booqit",
        supplier: "Hooka",
        category: "mattress",
        ownerId: null,
        ownerName: null,
        orderId: "o1",
        so: 1318,
        dueDate: null,
      }),
    ).toBeNull();
  });

  it("the owner is METADATA — the sentence never carries the person's name", () => {
    const a = soBatchAction({
      state: "no_supplier",
      item: "Booqit",
      supplier: null,
      category: "mattress",
      ownerId: "u9",
      ownerName: "Yee Jean",
      orderId: "o1",
      so: 1318,
      dueDate: null,
    })!;
    expect(a.action).not.toContain("Yee Jean");
    expect(a.ownerName).toBe("Yee Jean");
    expect(a.ownerId).toBe("u9");
  });

  it("the ready line's act names the supplier and the document it owes", () => {
    const a = soBatchAction({
      state: "ready_to_buy",
      item: "Booqit",
      supplier: "Hooka",
      category: "mattress",
      ownerId: null,
      ownerName: null,
      orderId: "o1",
      so: 1318,
      dueDate: "2026-08-19",
    })!;
    expect(a.action).toBe("Issue PO to Hooka");
    expect(a.ownerDuty).toBe("PO duty");
  });

  it("no action sentence uses a banned generic word", () => {
    for (const state of PURCHASE_DEMAND_STATES) {
      const a = soBatchAction({
        state,
        item: "Booqit",
        supplier: "Hooka",
        category: "mattress",
        ownerId: null,
        ownerName: null,
        orderId: "o1",
        so: 1318,
        dueDate: null,
      });
      if (!a) continue;
      for (const banned of ["Follow up", "Needs attention", "Pending", "Waiting", "Today", "Priority"]) {
        expect(a.action, `${state} / ${banned}`).not.toContain(banned);
      }
    }
  });
});

describe("the SO Batch response carries destinations, duty and permission", () => {
  it("parses a whole payload", () => {
    const parsed = soBatchPurchaseResponseSchema.parse({
      today: "2026-08-22",
      rows: [],
      destinations: [
        { id: "d1", name: "Carres Klang", isDefault: true, active: true },
      ],
      defaultDestinationId: "d1",
      currentPoDuty: { userId: "u1", name: "Yee Jean" },
      mayIssue: true,
      procurementPartners: [{ id: "p1", name: "NETS" }],
    });
    expect(parsed.destinations[0]!.name).toBe("Carres Klang");
    expect(parsed.mayIssue).toBe(true);
  });

  it("a reader who is not on duty is told so honestly", () => {
    const parsed = soBatchPurchaseResponseSchema.parse({
      today: "2026-08-22",
      rows: [],
      destinations: [],
      defaultDestinationId: null,
      currentPoDuty: null,
      mayIssue: false,
      procurementPartners: [],
    });
    expect(parsed.mayIssue).toBe(false);
    expect(parsed.currentPoDuty).toBeNull();
  });
});

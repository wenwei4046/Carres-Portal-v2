import { describe, it, expect } from "vitest";
import {
  PURCHASE_DEMAND_STATES,
  PURCHASE_DEMAND_TIMING_STATES,
  PURCHASE_DEMAND_WORDS,
  filterPurchaseDemands,
  groupPurchaseDemands,
  isPurchaseDemandTimingState,
  purchaseDemandBlockerOf,
  purchaseDemandCoverageLine,
  purchaseDemandFooter,
  purchaseDemandHelpLine,
  purchaseDemandQuantities,
  purchaseDemandRailWords,
  purchaseDemandStateCounts,
  purchaseDemandStateWords,
  purchaseDemandTimingOf,
  purchaseDemandsResponseSchema,
  soBatchAction,
  type PurchaseDemandRow,
  type PurchaseDemandState,
} from "./purchase-demands";
/* The SO Batch read moved with Card 02-B: the response now carries the order
   Register rows that file defines. */
import { soBatchPurchaseResponseSchema } from "./so-batch-purchase";

function row(over: Partial<PurchaseDemandRow> = {}): PurchaseDemandRow {
  return {
    id: "r1",
    state: "can_order_early",
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
    parts: [{ sku: "B1201S-K", qty: 2, unitCost: 100 }],
    supplierKind: "own_logistics",
    ownerName: null,
    ownerDuty: null,
    ...over,
  };
}

describe("purchaseDemandBlockerOf — one derivation, engine precedence", () => {
  const base = {
    inCatalog: true,
    hasSupplier: true,
    hasProductionDays: true,
    hasCustomerDate: true,
  };

  it("names every blocker, and an unblocked line has none", () => {
    expect(purchaseDemandBlockerOf(base)).toBeNull();
    expect(purchaseDemandBlockerOf({ ...base, hasCustomerDate: false })).toBe(
      "no_customer_date",
    );
    expect(purchaseDemandBlockerOf({ ...base, inCatalog: false })).toBe("no_sku");
    expect(purchaseDemandBlockerOf({ ...base, hasSupplier: false })).toBe("no_supplier");
    expect(purchaseDemandBlockerOf({ ...base, hasProductionDays: false })).toBe(
      "no_production_days",
    );
  });

  it("a SKU absent from Catalog is `SKU not found`, never silently Service", () => {
    // Catalog is the only authority able to decide what a sold SKU is, so an
    // absent one is NAMED rather than assumed away (card §3).
    expect(
      purchaseDemandBlockerOf({
        ...base,
        inCatalog: false,
        hasSupplier: false,
        hasProductionDays: false,
      }),
    ).toBe("no_sku");
  });

  it("a supplier-less line never hides behind a missing date", () => {
    expect(
      purchaseDemandBlockerOf({ ...base, hasSupplier: false, hasCustomerDate: false }),
    ).toBe("no_supplier");
  });
});

describe("purchaseDemandTimingOf — the engine's dates, the card's classification", () => {
  const none: ReadonlySet<string> = new Set();
  const base = {
    today: "2026-09-02",
    orderBy: "2026-09-01",
    safetyDays: 14,
    holidays: none,
  };

  it("today before Order By is `Can order early`", () => {
    expect(
      purchaseDemandTimingOf({
        ...base,
        today: "2026-08-25",
        readyIfOrderedToday: "2026-09-01",
        customerDelivery: "2026-10-30",
      }),
    ).toBe("can_order_early");
  });

  it("today exactly on Order By holds the full 14 safety days", () => {
    expect(
      purchaseDemandTimingOf({
        ...base,
        today: "2026-09-01",
        readyIfOrderedToday: "2026-09-10",
        customerDelivery: "2026-09-30",
      }),
    ).toBe("safety_days_full");
  });

  it("13 office working days left is the top of the low band", () => {
    // 2026-09-01 (Tue) → 2026-09-18 (Fri) is 13 Mon–Fri working days.
    expect(
      purchaseDemandTimingOf({
        ...base,
        readyIfOrderedToday: "2026-09-01",
        customerDelivery: "2026-09-18",
      }),
    ).toBe("safety_days_low");
  });

  it("1 office working day left is the bottom of the low band", () => {
    expect(
      purchaseDemandTimingOf({
        ...base,
        readyIfOrderedToday: "2026-09-10",
        customerDelivery: "2026-09-11",
      }),
    ).toBe("safety_days_low");
  });

  it("14 working days left after Order By still reads full — never a lie downward", () => {
    // Calendar rounding can leave the full band intact one day past Order By.
    // 2026-09-01 (Tue) → 2026-09-21 (Mon) is 14 Mon–Fri working days.
    expect(
      purchaseDemandTimingOf({
        ...base,
        readyIfOrderedToday: "2026-09-01",
        customerDelivery: "2026-09-21",
      }),
    ).toBe("safety_days_full");
  });

  it("completion on the delivery day itself leaves no safety days", () => {
    expect(
      purchaseDemandTimingOf({
        ...base,
        readyIfOrderedToday: "2026-09-21",
        customerDelivery: "2026-09-21",
      }),
    ).toBe("safety_days_none");
  });

  it("a weekend between completion and delivery buys no safety days", () => {
    // Fri 18th → Sun 20th crosses no office working day.
    expect(
      purchaseDemandTimingOf({
        ...base,
        readyIfOrderedToday: "2026-09-18",
        customerDelivery: "2026-09-20",
      }),
    ).toBe("safety_days_none");
  });

  it("a public holiday is not a safety day", () => {
    // The one working day between the two dates is a holiday.
    expect(
      purchaseDemandTimingOf({
        ...base,
        readyIfOrderedToday: "2026-09-10",
        customerDelivery: "2026-09-11",
        holidays: new Set(["2026-09-11"]),
      }),
    ).toBe("safety_days_none");
  });

  it("completion after the delivery day is not enough production time", () => {
    expect(
      purchaseDemandTimingOf({
        ...base,
        readyIfOrderedToday: "2026-09-22",
        customerDelivery: "2026-09-21",
      }),
    ).toBe("not_enough_production_time");
  });

  it("without an Order By date the safety arithmetic alone still classifies", () => {
    expect(
      purchaseDemandTimingOf({
        ...base,
        orderBy: null,
        today: "2026-08-25",
        readyIfOrderedToday: "2026-09-01",
        customerDelivery: "2026-10-30",
      }),
    ).toBe("can_order_early");
  });
});

describe("the state words — every category, no banned word", () => {
  it("the timing words at the governed 14 are the approved words exactly", () => {
    const words = purchaseDemandStateWords(14);
    expect(words.can_order_early).toBe("Can order early");
    expect(words.safety_days_full).toBe("14 safety days left");
    expect(words.safety_days_low).toBe("1–13 safety days left");
    expect(words.safety_days_none).toBe("No safety days left");
    /* Card 02-C (2026-08-27): `days`, never `time` — the unit the arithmetic
       itself counts in. */
    expect(words.not_enough_production_time).toBe("Not enough production days");
  });

  it("the safety words follow the governed value, so the screen cannot lie", () => {
    const words = purchaseDemandStateWords(10);
    expect(words.safety_days_full).toBe("10 safety days left");
    expect(words.safety_days_low).toBe("1–9 safety days left");
  });

  it("every state has a fact word; the rail words are the timing rows plus the one setup row", () => {
    const words = purchaseDemandStateWords(14);
    for (const s of PURCHASE_DEMAND_STATES) {
      expect(words[s].length).toBeGreaterThan(0);
    }
    const rail = purchaseDemandRailWords(14);
    for (const s of PURCHASE_DEMAND_TIMING_STATES) {
      expect(rail[s]).toBe(words[s]);
    }
    expect(rail.no_production_days).toBe("Production days not set");
    // The Sales/Catalog blockers are row facts, never rail facets.
    expect(rail.no_customer_date).toBeUndefined();
    expect(rail.no_sku).toBeUndefined();
    expect(rail.no_supplier).toBeUndefined();
  });

  it("no word uses a banned or retired rail word", () => {
    const banned = [
      "Today",
      "Tomorrow",
      "Overdue",
      "Needs attention",
      "Follow up",
      "Pending",
      "Waiting",
      "Priority",
      "Next Action",
      "Buffer",
      "buffer",
      "Ready to buy",
      "Covered",
    ];
    const words = purchaseDemandStateWords(14);
    const rail = purchaseDemandRailWords(14);
    for (const s of PURCHASE_DEMAND_STATES) {
      for (const b of banned) {
        expect(words[s]).not.toContain(b);
        const r = rail[s];
        if (r != null) expect(r).not.toContain(b);
      }
    }
  });

  it("isPurchaseDemandTimingState separates orderable timing from blockers", () => {
    for (const s of PURCHASE_DEMAND_TIMING_STATES) {
      expect(isPurchaseDemandTimingState(s)).toBe(true);
    }
    for (const s of ["no_customer_date", "no_sku", "no_supplier", "no_production_days"]) {
      expect(isPurchaseDemandTimingState(s as PurchaseDemandState)).toBe(false);
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
  it("every blocker carries a help line; an orderable row carries none", () => {
    expect(purchaseDemandHelpLine(row({ state: "can_order_early" }))).toBeNull();
    expect(purchaseDemandHelpLine(row({ state: "not_enough_production_time" }))).toBeNull();
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
      toBuy: 1,
      qtyNeeded: 3,
      onPo: 2,
      poNumbers: ["PO-2051"],
      state: "safety_days_low",
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

  it("an empty rail selection means every state — that is `All not ordered`", () => {
    expect(filterPurchaseDemands(rows, new Set()).length).toBe(4);
    expect(
      filterPurchaseDemands(rows, new Set(["safety_days_low"] as const)).map((r) => r.id),
    ).toEqual(["c"]);
    expect(
      filterPurchaseDemands(rows, new Set(["safety_days_low", "no_sku"] as const)).map(
        (r) => r.id,
      ),
    ).toEqual(["c", "d"]);
  });

  it("counts every state, including the zeroes", () => {
    const counts = purchaseDemandStateCounts(rows);
    expect(counts).toEqual({
      can_order_early: 2,
      safety_days_full: 0,
      safety_days_low: 1,
      safety_days_none: 0,
      not_enough_production_time: 0,
      no_customer_date: 0,
      no_sku: 1,
      no_supplier: 0,
      no_cost: 0,
      no_production_days: 0,
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
    expect(action!.completionFact).toBe("Requested Delivery Date exists");
    expect(action!.sourceObject).toEqual({ type: "sales_order", id: "o1", number: "SO-1318" });
    expect(action!.dueDate).toBe("2026-08-19");
  });

  it("every trigger names its owner rule and its completion fact", () => {
    const buyRule: [string, string] = [
      "Current PO Duty",
      "Current PO version reached supplier with evidence",
    ];
    const expected: Record<string, [string, string]> = {
      can_order_early: buyRule,
      safety_days_full: buyRule,
      safety_days_low: buyRule,
      safety_days_none: buyRule,
      not_enough_production_time: buyRule,
      no_customer_date: ["Responsible Salesperson", "Requested Delivery Date exists"],
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

  it("an orderable line's act names the supplier and the document it owes", () => {
    const a = soBatchAction({
      state: "safety_days_none",
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
      registerRows: [],
      destinations: [
        { id: "d1", name: "Carres Klang", isDefault: true, active: true },
      ],
      defaultDestinationId: "d1",
      currentPoDuty: { userId: "u1", name: "Yee Jean" },
      /* 0379 — the dated buddy cover who may act TODAY. A separate fact from
         the holder: the duty stays where management put it, and the audit must
         still say who actually pressed Issue PO. */
      actingPoDuty: { userId: "u2", name: "Shasha" },
      poDutyNameUnavailable: false,
      poDutyUnavailable: false,
      mayIssue: true,
      procurementPartners: [{ id: "p1", name: "NETS" }],
      safetyDays: 14,
    });
    expect(parsed.destinations[0]!.name).toBe("Carres Klang");
    expect(parsed.mayIssue).toBe(true);
    expect(parsed.actingPoDuty).toEqual({ userId: "u2", name: "Shasha" });
    // The governed Safety days ride the payload so the rail words follow the
    // one setting instead of a hard-coded number.
    expect(parsed.safetyDays).toBe(14);
  });

  it("a reader who is not on duty is told so honestly", () => {
    const parsed = soBatchPurchaseResponseSchema.parse({
      today: "2026-08-22",
      rows: [],
      registerRows: [],
      destinations: [],
      defaultDestinationId: null,
      currentPoDuty: null,
      actingPoDuty: null,
      poDutyNameUnavailable: false,
      poDutyUnavailable: false,
      mayIssue: false,
      procurementPartners: [],
      safetyDays: 14,
    });
    expect(parsed.mayIssue).toBe(false);
    expect(parsed.currentPoDuty).toBeNull();
    expect(parsed.actingPoDuty).toBeNull();
  });
});

import { describe, expect, it } from "vitest";
import {
  MANUAL_PURCHASE_RAIL,
  MANUAL_PURCHASE_RAIL_CLEAR,
  manualPurchaseApproverLine,
  manualPurchaseRailFacts,
  manualPurchaseRailModel,
  manualPurchaseStatusOf,
  manualPurchaseToOrderMatches,
  type ManualPurchaseRailFacts,
  type ManualPurchaseStatusKind,
} from "./manual-purchase";
import { SO_BATCH_RAIL } from "./so-batch-purchase";
import { DEMAND_PURPOSES } from "./to-order";

/**
 * PURCHASING CARD 03 — the Manual Purchase rail contract (owner ruling
 * 2026-08-28). Four sections in the approved order; counts are UNIQUE
 * requests cross-computed per section; the `TO ORDER` rows are DERIVED
 * request truth; Product is the CATALOG's answer; Supplier is the demand
 * line's Catalog-derived name, dynamic and alphabetical.
 */

const facts = (
  over: Partial<ManualPurchaseRailFacts> & { requestId: string },
): ManualPurchaseRailFacts => ({
  status: "ready_to_order",
  purpose: "ready_stock",
  categories: new Set(),
  suppliers: new Set(),
  ...over,
});

describe("Card 03 · the rail words and order", () => {
  it("renders exactly the four approved sections, in the approved order", () => {
    expect(Object.keys(MANUAL_PURCHASE_RAIL)).toEqual([
      "toOrder",
      "purpose",
      "product",
      "supplier",
    ]);
    expect(MANUAL_PURCHASE_RAIL.toOrder.heading).toBe("TO ORDER");
    expect(MANUAL_PURCHASE_RAIL.purpose.heading).toBe("PURCHASE PURPOSE");
    expect(MANUAL_PURCHASE_RAIL.product.heading).toBe("PRODUCT");
    expect(MANUAL_PURCHASE_RAIL.supplier.heading).toBe("SUPPLIER");
  });

  it("TO ORDER holds the three derived rows, in order", () => {
    expect(MANUAL_PURCHASE_RAIL.toOrder.rows.map((r) => r.word)).toEqual([
      "All not ordered",
      "Need approval",
      "Ready to order",
    ]);
  });

  it("PURCHASE PURPOSE offers exactly the approved six under `All purposes`", () => {
    expect(MANUAL_PURCHASE_RAIL.purpose.all).toBe("All purposes");
    // The one creatable list — the same array the create form renders, so
    // the rail and the door cannot drift (Law D). Card 04 widened it by
    // `Other Purchase`; the rail row arrived through the same list.
    expect(MANUAL_PURCHASE_RAIL.purpose.rows).toBe(DEMAND_PURPOSES);
    expect(MANUAL_PURCHASE_RAIL.purpose.rows.map((p) => p.label)).toEqual([
      "Ready Stock",
      "Showroom Display",
      "Service Case",
      "Internal Staff Purchase",
      "Subsidiary Purchase",
      "Other Purchase",
    ]);
  });

  it("PRODUCT is SO Batch's own Catalog list — shared, not copied", () => {
    expect(MANUAL_PURCHASE_RAIL.product).toBe(SO_BATCH_RAIL.product);
    expect(MANUAL_PURCHASE_RAIL.product.all).toBe("All products");
    expect(MANUAL_PURCHASE_RAIL.product.categories.map((c) => c.word)).toEqual([
      "Mattress",
      "Bedframe",
      "Sofa",
    ]);
  });

  it("carries none of the banned rows — and no ORDER TIMING section", () => {
    const words = JSON.stringify(MANUAL_PURCHASE_RAIL);
    for (const banned of [
      "Supplier not selected",
      "No supplier",
      "Not in catalog",
      "Need price",
      "Ordered",
      "Part received",
      "Received",
      "Arrived",
      "Cancelled",
      "My drafts",
      "Need correction",
      "Queues",
      "ORDER TIMING",
      "safety days",
      "Safety days",
    ]) {
      expect(words).not.toContain(banned);
    }
  });
});

describe("Card 03 · TO ORDER is derived request truth", () => {
  const statuses: ManualPurchaseStatusKind[] = [
    "waiting_approval",
    "waiting_sku",
    "ready_to_order",
    "ordered",
    "arrived",
    "not_going_ahead",
  ];

  it("`All not ordered` = live quantity not yet fully issued to a PO", () => {
    const matches = statuses.filter((s) => manualPurchaseToOrderMatches(s, "not_ordered"));
    // Fully ordered / arrived requests leave it; a refused or fully-cancelled
    // request (`Not going ahead`) is not awaiting ordering and never counts.
    expect(matches).toEqual(["waiting_approval", "waiting_sku", "ready_to_order"]);
  });

  it("`Need approval` = submitted, awaiting the configured approver", () => {
    const matches = statuses.filter((s) => manualPurchaseToOrderMatches(s, "need_approval"));
    expect(matches).toEqual(["waiting_approval"]);
  });

  it("`Ready to order` = approved remainder for PO Duty", () => {
    const matches = statuses.filter((s) => manualPurchaseToOrderMatches(s, "ready_to_order"));
    expect(matches).toEqual(["ready_to_order"]);
  });

  it("rides the ONE status arithmetic — a fully issued request leaves, a refusal leaves", () => {
    const ordered = manualPurchaseStatusOf({
      approvalRequired: true,
      approvedAt: "2026-08-20T00:00:00Z",
      refusedAt: null,
      refuseReason: null,
      lines: [{ qty: 2, issuedQty: 2, remainingQty: 0, cancelledAt: null, poId: "PO-1" }],
    });
    expect(manualPurchaseToOrderMatches(ordered.kind, "not_ordered")).toBe(false);

    const refused = manualPurchaseStatusOf({
      approvalRequired: true,
      approvedAt: null,
      refusedAt: "2026-08-20T00:00:00Z",
      refuseReason: "duplicate",
      lines: [{ qty: 2, issuedQty: 0, remainingQty: 2, cancelledAt: null, poId: null }],
    });
    expect(manualPurchaseToOrderMatches(refused.kind, "not_ordered")).toBe(false);

    const waiting = manualPurchaseStatusOf({
      approvalRequired: true,
      approvedAt: null,
      refusedAt: null,
      refuseReason: null,
      lines: [{ qty: 2, issuedQty: 0, remainingQty: 2, cancelledAt: null, poId: null }],
    });
    expect(manualPurchaseToOrderMatches(waiting.kind, "not_ordered")).toBe(true);
    expect(manualPurchaseToOrderMatches(waiting.kind, "need_approval")).toBe(true);
  });
});

describe("Card 03 · the facts projection", () => {
  it("keeps the CATALOG's categories and actual supplier names, holes dropped", () => {
    const [f] = manualPurchaseRailFacts([
      {
        requestId: "r1",
        status: "ready_to_order",
        purpose: "ready_stock",
        // A SKU whose TEXT screams mattress but whose Catalog category is
        // absent contributes NOTHING — the projection carries only what the
        // Catalog answered; SKU text never reaches this file.
        lineCategories: ["mattress", null, undefined, "mattress"],
        lineSupplierNames: ["Hooka", null, "", "Hooka"],
      },
    ]);
    expect([...f.categories]).toEqual(["mattress"]);
    expect([...f.suppliers]).toEqual(["Hooka"]);
  });
});

describe("Card 03 · the rail model", () => {
  const base = [
    facts({
      requestId: "a",
      status: "waiting_approval",
      purpose: "ready_stock",
      categories: new Set(["mattress"]),
      suppliers: new Set(["Hooka"]),
    }),
    facts({
      requestId: "b",
      status: "ready_to_order",
      purpose: "showroom_display",
      categories: new Set(["sofa"]),
      suppliers: new Set(["Dorsettloft"]),
    }),
    facts({
      requestId: "c",
      status: "ordered",
      purpose: "ready_stock",
      categories: new Set(["mattress", "bedframe"]),
      suppliers: new Set(["Hooka", "Ohana"]),
    }),
    facts({
      requestId: "d",
      status: "ready_to_order",
      purpose: "subsidiary_purchase",
      categories: new Set(["bedframe"]),
      suppliers: new Set(["Ohana"]),
    }),
    // History under a retired purpose — visible in the Register, counted by
    // no approved purpose row, never relabelled.
    facts({
      requestId: "e",
      status: "arrived",
      purpose: "office",
      categories: new Set(),
      suppliers: new Set(["Ohana"]),
    }),
  ];

  it("the empty filter is the permanent Register — ordered history included", () => {
    const m = manualPurchaseRailModel(base, MANUAL_PURCHASE_RAIL_CLEAR);
    expect([...m.visibleRequestIds].sort()).toEqual(["a", "b", "c", "d", "e"]);
  });

  it("counts are UNIQUE requests — a multi-category request counts once per row", () => {
    const m = manualPurchaseRailModel(base, MANUAL_PURCHASE_RAIL_CLEAR);
    expect(m.toOrderCounts).toEqual({
      not_ordered: 3, // a, b, d — c is Ordered, e Arrived
      need_approval: 1, // a
      ready_to_order: 2, // b, d
    });
    expect(m.productCounts).toEqual({ mattress: 2, bedframe: 2, sofa: 1 });
    expect(m.purposeCounts).toEqual({
      ready_stock: 2,
      showroom_display: 1,
      service_case: 0,
      internal_staff_purchase: 0,
      subsidiary_purchase: 1,
      other_purchase: 0,
    });
  });

  it("a retired purpose matches no approved row and lives under `All purposes` only", () => {
    const m = manualPurchaseRailModel(base, MANUAL_PURCHASE_RAIL_CLEAR);
    const purposeTotal = Object.values(m.purposeCounts).reduce((s, n) => s + n, 0);
    // e (office) is in the Register (5 rows) but in no purpose count (4).
    expect(m.visibleRequestIds.has("e")).toBe(true);
    expect(purposeTotal).toBe(4);
  });

  it("suppliers are actual names, alphabetical, dynamic — never hardcoded", () => {
    const m = manualPurchaseRailModel(base, MANUAL_PURCHASE_RAIL_CLEAR);
    expect(m.suppliers).toEqual([
      { name: "Dorsettloft", count: 1 },
      { name: "Hooka", count: 2 },
      { name: "Ohana", count: 3 },
    ]);
  });

  it("no missing-SKU or missing-supplier placeholder becomes a facet", () => {
    const m = manualPurchaseRailModel(
      [facts({ requestId: "x", categories: new Set(), suppliers: new Set() })],
      MANUAL_PURCHASE_RAIL_CLEAR,
    );
    // The hole simply contributes nothing: no `No supplier`, no `Not in
    // catalog` row — the request is named at its owning boundary instead.
    expect(m.suppliers).toEqual([]);
    expect(m.productCounts).toEqual({ mattress: 0, bedframe: 0, sofa: 0 });
    expect(m.visibleRequestIds.has("x")).toBe(true);
  });

  it("sections combine with AND", () => {
    const m = manualPurchaseRailModel(base, {
      toOrder: "ready_to_order",
      purpose: null,
      product: "bedframe",
      supplier: "Ohana",
    });
    expect([...m.visibleRequestIds]).toEqual(["d"]);
  });

  it("each section's counts are computed under the OTHER sections' selections", () => {
    const m = manualPurchaseRailModel(base, {
      toOrder: "ready_to_order",
      purpose: null,
      product: null,
      supplier: null,
    });
    // Under `Ready to order` (b, d): the numbers predict the click.
    expect(m.productCounts).toEqual({ mattress: 0, bedframe: 1, sofa: 1 });
    expect(m.purposeCounts.showroom_display).toBe(1);
    expect(m.purposeCounts.ready_stock).toBe(0);
    expect(m.suppliers).toEqual([
      { name: "Dorsettloft", count: 1 },
      { name: "Ohana", count: 1 },
    ]);
    // ...while its OWN section counts ignore its own selection:
    expect(m.toOrderCounts.not_ordered).toBe(3);
    expect(m.toOrderCounts.need_approval).toBe(1);
  });

  it("clearing one section widens only that section (`All …` clears its own)", () => {
    const narrowed = manualPurchaseRailModel(base, {
      toOrder: null,
      purpose: "ready_stock",
      product: "mattress",
      supplier: null,
    });
    expect([...narrowed.visibleRequestIds].sort()).toEqual(["a", "c"]);
    const purposeCleared = manualPurchaseRailModel(base, {
      toOrder: null,
      purpose: null,
      product: "mattress",
      supplier: null,
    });
    expect([...purposeCleared.visibleRequestIds].sort()).toEqual(["a", "c"]);
    const allCleared = manualPurchaseRailModel(base, MANUAL_PURCHASE_RAIL_CLEAR);
    expect(allCleared.visibleRequestIds.size).toBe(5);
  });

  it("the selected supplier stays visible with its honest 0", () => {
    const m = manualPurchaseRailModel(base, {
      toOrder: "need_approval",
      purpose: null,
      product: null,
      supplier: "Dorsettloft",
    });
    // Under `Need approval` only Hooka matches — but the SELECTED name must
    // stay, or the operator is narrowed by a filter they can no longer see.
    expect(m.suppliers).toEqual([
      { name: "Dorsettloft", count: 0 },
      { name: "Hooka", count: 1 },
    ]);
  });

  it("fixed rows print zero rather than hiding it", () => {
    const m = manualPurchaseRailModel([], MANUAL_PURCHASE_RAIL_CLEAR);
    expect(m.toOrderCounts).toEqual({ not_ordered: 0, need_approval: 0, ready_to_order: 0 });
    expect(m.purposeCounts.service_case).toBe(0);
    expect(m.productCounts.sofa).toBe(0);
    expect(m.suppliers).toEqual([]);
  });
});

describe("Card 03 §3 · the approval owner's sentence", () => {
  it("names one holder, joins several with `or`, and prints nothing for nobody", () => {
    expect(manualPurchaseApproverLine(["Jess"])).toBe("Jess approves");
    expect(manualPurchaseApproverLine(["Jess", "YJ"])).toBe("Jess or YJ approves");
    expect(manualPurchaseApproverLine([])).toBeNull();
    expect(manualPurchaseApproverLine([null, "", "  "])).toBeNull();
  });
});

/**
 * PURCHASING CARD 04 — the permanent Register's own arithmetic
 * (docs/cards/CARD-2026-08-29-purchasing-04-manual-purchase-permanent-register.md).
 */
import {
  MANUAL_PURCHASE_APPROVAL_WORDS,
  MANUAL_PURCHASE_WORDS,
  manualPurchaseApprovalOf,
  manualPurchaseDeliverToSummary,
  manualPurchaseForOf,
  manualPurchaseIssueGroupCount,
  manualPurchaseIssueSentence,
  manualPurchaseItemsSummary,
  manualPurchaseLineRemainingOf,
  manualPurchasePoSummary,
  manualPurchaseSelectable,
  manualPurchaseSupplierSummary,
} from "./manual-purchase";

describe("Card 04 · the eleven column words", () => {
  it("spells the Card's exact column heads once", () => {
    expect([
      MANUAL_PURCHASE_WORDS.colRequestedDate,
      MANUAL_PURCHASE_WORDS.colApproval,
      MANUAL_PURCHASE_WORDS.colMprNo,
      MANUAL_PURCHASE_WORDS.colPoNo,
      MANUAL_PURCHASE_WORDS.colNeededBy,
      MANUAL_PURCHASE_WORDS.colFor,
      MANUAL_PURCHASE_WORDS.colItems,
      MANUAL_PURCHASE_WORDS.colQty,
      MANUAL_PURCHASE_WORDS.colSupplier,
      MANUAL_PURCHASE_WORDS.colDeliverTo,
      MANUAL_PURCHASE_WORDS.colRequestedBy,
    ]).toEqual([
      "Requested Date",
      "Approval Status",
      "Manual Purchase No",
      "PO No",
      "Needed By",
      "For",
      "Items",
      "Qty",
      "Supplier",
      "Deliver To",
      "Requested By",
    ]);
  });

  it("the toolbar's create words are COPY-STANDARD's own", () => {
    expect(MANUAL_PURCHASE_WORDS.newRequest).toBe("+ Manual Purchase");
    expect(MANUAL_PURCHASE_WORDS.createTitle).toBe("NEW MANUAL PURCHASE");
    expect(MANUAL_PURCHASE_WORDS.emptyRegister).toBe("No Manual Purchase yet.");
  });
});

describe("Card 04 · the approval fact", () => {
  it("answers the four ways, decided states winning over the switch", () => {
    expect(
      manualPurchaseApprovalOf({ approvalRequired: true, approvedAt: null, refusedAt: null })
        .label,
    ).toBe(MANUAL_PURCHASE_APPROVAL_WORDS.need_approval);
    expect(
      manualPurchaseApprovalOf({ approvalRequired: true, approvedAt: "t", refusedAt: null })
        .label,
    ).toBe("Approved");
    expect(
      manualPurchaseApprovalOf({ approvalRequired: true, approvedAt: null, refusedAt: "t" })
        .label,
    ).toBe("Refused");
    expect(
      manualPurchaseApprovalOf({ approvalRequired: false, approvedAt: null, refusedAt: null })
        .label,
    ).toBe("No approval needed");
  });
});

describe("Card 04 · the one remainder arithmetic", () => {
  it("reads the approver's number, falls back to the ask, floors at zero", () => {
    expect(manualPurchaseLineRemainingOf({ qty: 5, approvedQty: null, issuedQty: 0 })).toBe(5);
    expect(manualPurchaseLineRemainingOf({ qty: 5, approvedQty: 3, issuedQty: 1 })).toBe(2);
    expect(manualPurchaseLineRemainingOf({ qty: 5, approvedQty: 3, issuedQty: 4 })).toBe(0);
    expect(manualPurchaseLineRemainingOf({ qty: 5, approvedQty: 0, issuedQty: 0 })).toBe(0);
  });
});

describe("Card 04 · the deterministic summaries", () => {
  it("PO No: absence sentence · the one number · a count", () => {
    expect(manualPurchasePoSummary([])).toBe("Not ordered yet");
    expect(manualPurchasePoSummary(["PO-20260829-1234"])).toBe("PO-20260829-1234");
    expect(manualPurchasePoSummary(["PO-1", "PO-2", "PO-1"])).toBe("2 POs");
  });

  it("Items: the Catalog word, or `{first} + {n} more`", () => {
    expect(manualPurchaseItemsSummary([])).toBe("");
    expect(manualPurchaseItemsSummary(["Sonic Q"])).toBe("Sonic Q");
    expect(manualPurchaseItemsSummary(["Sonic Q", "Booqit", "Atlas K"])).toBe(
      "Sonic Q + 2 more",
    );
  });

  it("Supplier: the actual name, or `{n} suppliers` — never a placeholder", () => {
    expect(manualPurchaseSupplierSummary([])).toBe("");
    expect(manualPurchaseSupplierSummary(["Hooka", "Hooka"])).toBe("Hooka");
    expect(manualPurchaseSupplierSummary(["Hooka", "Dorsettloft"])).toBe("2 suppliers");
  });

  it("Deliver To: the destination, or `Multiple`", () => {
    expect(manualPurchaseDeliverToSummary(["Carres Klang", "Carres Klang"])).toBe(
      "Carres Klang",
    );
    expect(manualPurchaseDeliverToSummary(["Carres Klang", "HOUZS"])).toBe("Multiple");
  });
});

describe("Card 04 · the structured For", () => {
  it("each purpose answers with its own object; a foreign fact is never borrowed", () => {
    const base = {
      destinationName: "Carres Klang",
      serviceCaseNo: "SC-20260829-1111",
      staffName: "Li Ching",
      subsidiaryName: "Carres Living Sdn Bhd",
      why: "spare parts for the van",
    };
    expect(manualPurchaseForOf({ ...base, purpose: "ready_stock" })).toBe("Carres Klang");
    expect(manualPurchaseForOf({ ...base, purpose: "showroom_display" })).toBe("Carres Klang");
    expect(manualPurchaseForOf({ ...base, purpose: "service_case" })).toBe("SC-20260829-1111");
    expect(manualPurchaseForOf({ ...base, purpose: "internal_staff_purchase" })).toBe(
      "Li Ching",
    );
    expect(manualPurchaseForOf({ ...base, purpose: "subsidiary_purchase" })).toBe(
      "Carres Living Sdn Bhd",
    );
    expect(manualPurchaseForOf({ ...base, purpose: "other_purchase" })).toBe(
      "spare parts for the van",
    );
  });

  it("a historical row without its structured fact prints nothing — never a guess", () => {
    expect(
      manualPurchaseForOf({
        purpose: "service_case",
        destinationName: "Carres Klang",
        serviceCaseNo: null,
        staffName: null,
        subsidiaryName: null,
        why: "an old reason",
      }),
    ).toBe("");
    // A retired purpose has no structured For at all.
    expect(
      manualPurchaseForOf({
        purpose: "office",
        destinationName: "Carres Klang",
        serviceCaseNo: null,
        staffName: null,
        subsidiaryName: null,
        why: "printer ink",
      }),
    ).toBe("");
  });
});

describe("Card 04 · selection and the issue sentence", () => {
  it("only Ready to order with live remainder may be ticked", () => {
    expect(manualPurchaseSelectable("ready_to_order", 3)).toBe(true);
    expect(manualPurchaseSelectable("ready_to_order", 0)).toBe(false);
    for (const s of [
      "waiting_approval",
      "waiting_sku",
      "ordered",
      "arrived",
      "not_going_ahead",
    ] as const) {
      expect(manualPurchaseSelectable(s, 3)).toBe(false);
    }
  });

  it("PO count is the document partition — supplier × category × destination × purpose", () => {
    const line = (over: Record<string, unknown>) => ({
      supplierId: "s1",
      category: "sofa",
      destinationId: "d1",
      purpose: "ready_stock",
      remainingQty: 1,
      ...over,
    });
    expect(manualPurchaseIssueGroupCount([line({}), line({})])).toBe(1);
    expect(
      manualPurchaseIssueGroupCount([line({}), line({ supplierId: "s2" })]),
    ).toBe(2);
    expect(
      manualPurchaseIssueGroupCount([line({}), line({ category: "mattress" })]),
    ).toBe(2);
    expect(
      manualPurchaseIssueGroupCount([line({}), line({ purpose: "showroom_display" })]),
    ).toBe(2);
    // A line with nothing left to buy partitions nothing.
    expect(manualPurchaseIssueGroupCount([line({ remainingQty: 0 })])).toBe(0);
  });

  it("pluralises from facts", () => {
    expect(manualPurchaseIssueSentence(1, 1, 1)).toBe("1 selected · 1 unit · Issue 1 PO");
    expect(manualPurchaseIssueSentence(2, 5, 3)).toBe("2 selected · 5 units · Issue 3 POs");
  });
});

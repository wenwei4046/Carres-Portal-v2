import { describe, expect, it } from "vitest";
import {
  MANUAL_PURCHASE_RAIL,
  MANUAL_PURCHASE_RAIL_CLEAR,
  MANUAL_PURCHASE_HISTORY_WORDS,
  manualPurchaseApproverLine,
  manualPurchaseHistoryRecord,
  manualPurchaseLeadDayFacts,
  manualPurchaseNotOrdered,
  manualPurchaseOrderByLine,
  manualPurchaseOrderByOf,
  manualPurchaseRailFacts,
  manualPurchaseRailModel,
  manualPurchaseStatusOf,
  manualPurchaseTimingOf,
  manualPurchaseWorkItems,
  manualPurchaseWorkOrder,
  type ManualPurchaseRailFacts,
  type ManualPurchaseStatusKind,
  type ManualPurchaseWorkInput,
} from "./manual-purchase";
import { SO_BATCH_RAIL } from "./so-batch-purchase";
import { DEMAND_PURPOSES } from "./to-order";

/**
 * PURCHASING CARD 06 — the Manual Purchase date plan and rail contract
 * (owner-corrected 2026-08-29, superseding Card 03's four-section shape).
 * Seven sections in the approved order; counts are UNIQUE requests
 * cross-computed per section; `WORK TO DO` is an action lens over the same
 * server facts; `ORDER TIMING` reads the server-derived earliest Order By;
 * Product is the CATALOG's answer; Supplier is the demand line's
 * Catalog-derived name, dynamic and alphabetical.
 */

const facts = (
  over: Partial<ManualPurchaseRailFacts> & { requestId: string },
): ManualPurchaseRailFacts => ({
  status: "ready_to_order",
  purpose: "ready_stock",
  categories: new Set(),
  suppliers: new Set(),
  orderBy: null,
  timing: null,
  needsApproval: false,
  issuableRemaining: true,
  supplierGap: false,
  productionDaysMissing: false,
  transitDaysMissing: false,
  ...over,
});

describe("Card 06 · the rail words and order", () => {
  it("renders exactly the seven approved sections, in the approved order", () => {
    expect(Object.keys(MANUAL_PURCHASE_RAIL)).toEqual([
      "work",
      "toOrder",
      "timing",
      "purpose",
      "product",
      "supplier",
      "setup",
    ]);
    expect(MANUAL_PURCHASE_RAIL.work.heading).toBe("WORK TO DO");
    expect(MANUAL_PURCHASE_RAIL.toOrder.heading).toBe("TO ORDER");
    expect(MANUAL_PURCHASE_RAIL.timing.heading).toBe("ORDER TIMING");
    expect(MANUAL_PURCHASE_RAIL.purpose.heading).toBe("PURCHASE PURPOSE");
    expect(MANUAL_PURCHASE_RAIL.product.heading).toBe("PRODUCT");
    expect(MANUAL_PURCHASE_RAIL.supplier.heading).toBe("SUPPLIER");
    expect(MANUAL_PURCHASE_RAIL.setup.heading).toBe("SETUP TO FIX");
  });

  it("WORK TO DO holds the five concrete actions, in order", () => {
    expect(MANUAL_PURCHASE_RAIL.work.actions.map((a) => a.word)).toEqual([
      "Approve purchase",
      "Issue PO",
      "Check the supplier",
      "Add production days",
      "Add transit days",
    ]);
  });

  it("TO ORDER keeps only `All not ordered` — Need approval / Ready to order retired", () => {
    expect(MANUAL_PURCHASE_RAIL.toOrder.all).toBe("All not ordered");
    const words = JSON.stringify(MANUAL_PURCHASE_RAIL.toOrder);
    expect(words).not.toContain("Need approval");
    expect(words).not.toContain("Ready to order");
  });

  it("ORDER TIMING holds the three timing rows, in order", () => {
    expect(MANUAL_PURCHASE_RAIL.timing.rows.map((r) => r.word)).toEqual([
      "Can order early",
      "Order date reached",
      "Order date passed",
    ]);
  });

  it("PURCHASE PURPOSE offers exactly the approved six under `All purposes`", () => {
    expect(MANUAL_PURCHASE_RAIL.purpose.all).toBe("All purposes");
    // The one creatable list — the same array the create form renders, so
    // the rail and the door cannot drift (Law D).
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

  it("SETUP TO FIX names the two exact configuration facts", () => {
    expect(MANUAL_PURCHASE_RAIL.setup.rows.map((r) => r.word)).toEqual([
      "Production days not set",
      "Transit days not set",
    ]);
  });

  it("carries none of the banned rows — and no Safety-days arithmetic", () => {
    const words = JSON.stringify(MANUAL_PURCHASE_RAIL);
    for (const banned of [
      "Supplier not selected",
      "No supplier",
      "Not in catalog",
      "Need price",
      "Part received",
      "Received",
      "Arrived",
      "Cancelled",
      "My drafts",
      "Need correction",
      "Queues",
      "safety days",
      "Safety days",
      "Need approval",
      "Ready to order",
    ]) {
      expect(words).not.toContain(banned);
    }
  });
});

describe("Card 06 · `All not ordered` is derived request truth", () => {
  const statuses: ManualPurchaseStatusKind[] = [
    "waiting_approval",
    "waiting_sku",
    "ready_to_order",
    "ordered",
    "arrived",
    "not_going_ahead",
  ];

  it("live quantity not yet fully issued to a PO", () => {
    const matches = statuses.filter((s) => manualPurchaseNotOrdered(s));
    // Fully ordered / arrived requests leave it; a refused or fully-cancelled
    // request (`Not going ahead`) is not awaiting ordering and never counts.
    expect(matches).toEqual(["waiting_approval", "waiting_sku", "ready_to_order"]);
  });

  it("rides the ONE status arithmetic — a fully issued request leaves, a refusal leaves", () => {
    const ordered = manualPurchaseStatusOf({
      approvalRequired: true,
      approvedAt: "2026-08-20T00:00:00Z",
      refusedAt: null,
      refuseReason: null,
      lines: [{ qty: 2, issuedQty: 2, cancelledAt: null, poId: "PO-1" }],
    });
    expect(manualPurchaseNotOrdered(ordered.kind)).toBe(false);

    const refused = manualPurchaseStatusOf({
      approvalRequired: true,
      approvedAt: null,
      refusedAt: "2026-08-20T00:00:00Z",
      refuseReason: "duplicate",
      lines: [{ qty: 2, issuedQty: 0, cancelledAt: null, poId: null }],
    });
    expect(manualPurchaseNotOrdered(refused.kind)).toBe(false);

    const waiting = manualPurchaseStatusOf({
      approvalRequired: true,
      approvedAt: null,
      refusedAt: null,
      refuseReason: null,
      lines: [{ qty: 2, issuedQty: 0, cancelledAt: null, poId: null }],
    });
    expect(manualPurchaseNotOrdered(waiting.kind)).toBe(true);
  });
});

describe("Card 06 §3.3 · the earliest line date governs the request", () => {
  it("picks the earliest non-null line Order By; every-null answers null", () => {
    expect(manualPurchaseOrderByOf(["2026-09-10", "2026-09-03", null])).toBe("2026-09-03");
    expect(manualPurchaseOrderByOf([null, undefined])).toBeNull();
    expect(manualPurchaseOrderByOf([])).toBeNull();
  });
});

describe("Card 06 §5 · the timing arithmetic", () => {
  it("today before / equal / after Order By — and no Order By, no timing row", () => {
    expect(manualPurchaseTimingOf("2026-09-03", "2026-09-01")).toBe("can_order_early");
    expect(manualPurchaseTimingOf("2026-09-03", "2026-09-03")).toBe("order_date_reached");
    expect(manualPurchaseTimingOf("2026-09-03", "2026-09-04")).toBe("order_date_passed");
    expect(manualPurchaseTimingOf(null, "2026-09-04")).toBeNull();
    expect(manualPurchaseTimingOf("2026-09-03", null)).toBeNull();
  });
});

describe("Card 06 §3.4 · the missing-Settings facts", () => {
  it("names the exact supplier · category repair, in the governed two lines", () => {
    expect(
      manualPurchaseLeadDayFacts({
        kind: "production",
        supplierName: "Hooka",
        categoryLabel: "Sofa",
      }),
    ).toEqual({
      wrong: "Production days are not set",
      todo: "Add production days for Hooka · Sofa in Settings",
    });
    expect(
      manualPurchaseLeadDayFacts({ kind: "transit", supplierName: "Ohana" }),
    ).toEqual({
      wrong: "Transit days are not set",
      todo: "Add transit days for Ohana in Settings",
    });
  });

  it("the quiet timing line spells `Order by {date}` once", () => {
    expect(manualPurchaseOrderByLine("Wed, 3 Sep 2026")).toBe("Order by Wed, 3 Sep 2026");
  });
});

describe("Card 06 · the facts projection", () => {
  it("keeps the CATALOG's categories, actual supplier names and the earliest Order By", () => {
    const [f] = manualPurchaseRailFacts(
      [
        {
          requestId: "r1",
          status: "waiting_approval",
          purpose: "ready_stock",
          remainingQty: 2,
          // A SKU whose TEXT screams mattress but whose Catalog category is
          // absent contributes NOTHING — the projection carries only what the
          // Catalog answered; SKU text never reaches this file.
          lineCategories: ["mattress", null, undefined, "mattress"],
          lineSupplierNames: ["Hooka", null, "", "Hooka"],
          lineOrderBys: ["2026-09-10", "2026-09-03", null],
          supplierGap: true,
          productionDaysMissing: false,
          transitDaysMissing: true,
        },
      ],
      "2026-09-04",
    );
    expect([...f.categories]).toEqual(["mattress"]);
    expect([...f.suppliers]).toEqual(["Hooka"]);
    expect(f.orderBy).toBe("2026-09-03");
    expect(f.timing).toBe("order_date_passed");
    expect(f.needsApproval).toBe(true);
    // Waiting for approval is not issuable remainder.
    expect(f.issuableRemaining).toBe(false);
    expect(f.supplierGap).toBe(true);
    expect(f.transitDaysMissing).toBe(true);
  });
});

describe("Card 06 · the rail model", () => {
  const base = [
    facts({
      requestId: "a",
      status: "waiting_approval",
      purpose: "ready_stock",
      categories: new Set(["mattress"]),
      suppliers: new Set(["Hooka"]),
      needsApproval: true,
      issuableRemaining: false,
      orderBy: "2026-09-01",
      timing: "order_date_passed",
    }),
    facts({
      requestId: "b",
      status: "ready_to_order",
      purpose: "showroom_display",
      categories: new Set(["sofa"]),
      suppliers: new Set(["Dorsettloft"]),
      orderBy: "2026-09-10",
      timing: "can_order_early",
    }),
    facts({
      requestId: "c",
      status: "ordered",
      purpose: "ready_stock",
      categories: new Set(["mattress", "bedframe"]),
      suppliers: new Set(["Hooka", "Ohana"]),
      issuableRemaining: false,
    }),
    facts({
      requestId: "d",
      status: "ready_to_order",
      purpose: "subsidiary_purchase",
      categories: new Set(["bedframe"]),
      suppliers: new Set(["Ohana"]),
      orderBy: "2026-09-04",
      timing: "order_date_reached",
      productionDaysMissing: true,
    }),
    // History under a retired purpose — visible in the Register, counted by
    // no approved purpose row, never relabelled.
    facts({
      requestId: "e",
      status: "arrived",
      purpose: "office",
      categories: new Set(),
      suppliers: new Set(["Ohana"]),
      issuableRemaining: false,
    }),
  ];

  it("the empty filter is the permanent Register — ordered history included", () => {
    const m = manualPurchaseRailModel(base, MANUAL_PURCHASE_RAIL_CLEAR);
    expect([...m.visibleRequestIds].sort()).toEqual(["a", "b", "c", "d", "e"]);
  });

  it("counts are UNIQUE requests — work, to-order, timing, purpose and product", () => {
    const m = manualPurchaseRailModel(base, MANUAL_PURCHASE_RAIL_CLEAR);
    expect(m.workCounts).toEqual({
      approve_purchase: 1, // a
      issue_po: 2, // b, d
      check_supplier: 0,
      add_production_days: 1, // d
      add_transit_days: 0,
    });
    expect(m.notOrderedCount).toBe(3); // a, b, d — c is Ordered, e Arrived
    expect(m.timingCounts).toEqual({
      can_order_early: 1, // b
      order_date_reached: 1, // d
      order_date_passed: 1, // a
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
    expect(m.setupCounts).toEqual({
      production_days_not_set: 1, // d
      transit_days_not_set: 0,
    });
  });

  it("SETUP TO FIX exists only while an affected request exists", () => {
    expect(manualPurchaseRailModel(base, MANUAL_PURCHASE_RAIL_CLEAR).setupExists).toBe(true);
    const clean = base.map((f) => ({
      ...f,
      productionDaysMissing: false,
      transitDaysMissing: false,
    }));
    expect(manualPurchaseRailModel(clean, MANUAL_PURCHASE_RAIL_CLEAR).setupExists).toBe(
      false,
    );
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
      ...MANUAL_PURCHASE_RAIL_CLEAR,
      work: "issue_po",
      product: "bedframe",
      supplier: "Ohana",
    });
    expect([...m.visibleRequestIds]).toEqual(["d"]);
  });

  it("a timing filter is a filter and fact — never an issue permission gate", () => {
    // `Can order early` still shows the request; nothing about the filter
    // strips selection or issuance — those stay derived elsewhere.
    const m = manualPurchaseRailModel(base, {
      ...MANUAL_PURCHASE_RAIL_CLEAR,
      timing: "can_order_early",
    });
    expect([...m.visibleRequestIds]).toEqual(["b"]);
  });

  it("each section's counts are computed under the OTHER sections' selections", () => {
    const m = manualPurchaseRailModel(base, {
      ...MANUAL_PURCHASE_RAIL_CLEAR,
      work: "issue_po",
    });
    // Under `Issue PO` (b, d): the numbers predict the click.
    expect(m.productCounts).toEqual({ mattress: 0, bedframe: 1, sofa: 1 });
    expect(m.purposeCounts.showroom_display).toBe(1);
    expect(m.purposeCounts.ready_stock).toBe(0);
    expect(m.suppliers).toEqual([
      { name: "Dorsettloft", count: 1 },
      { name: "Ohana", count: 1 },
    ]);
    // ...while its OWN section counts ignore its own selection:
    expect(m.workCounts.approve_purchase).toBe(1);
    // Another section's count is narrowed by the active work filter — the
    // number predicts exactly the click (b and d are both not ordered):
    expect(m.notOrderedCount).toBe(2);
  });

  it("the selected supplier stays visible with its honest 0", () => {
    const m = manualPurchaseRailModel(base, {
      ...MANUAL_PURCHASE_RAIL_CLEAR,
      work: "approve_purchase",
      supplier: "Dorsettloft",
    });
    // Under `Approve purchase` only Hooka matches — but the SELECTED name must
    // stay, or the operator is narrowed by a filter they can no longer see.
    expect(m.suppliers).toEqual([
      { name: "Dorsettloft", count: 0 },
      { name: "Hooka", count: 1 },
    ]);
  });

  it("fixed rows print zero rather than hiding it", () => {
    const m = manualPurchaseRailModel([], MANUAL_PURCHASE_RAIL_CLEAR);
    expect(m.workCounts).toEqual({
      approve_purchase: 0,
      issue_po: 0,
      check_supplier: 0,
      add_production_days: 0,
      add_transit_days: 0,
    });
    expect(m.notOrderedCount).toBe(0);
    expect(m.timingCounts).toEqual({
      can_order_early: 0,
      order_date_reached: 0,
      order_date_passed: 0,
    });
    expect(m.suppliers).toEqual([]);
    expect(m.setupExists).toBe(false);
  });
});

describe("Card 06 §6 · the work/timing lens order", () => {
  it("sorts earliest Order By first, null-dated rows last, then newest Proceed Date", () => {
    const rows = [
      { id: "late", orderBy: "2026-09-10", proceedDate: "2026-08-01T00:00:00Z" },
      { id: "none", orderBy: null, proceedDate: "2026-08-30T00:00:00Z" },
      { id: "urgent", orderBy: "2026-09-01", proceedDate: "2026-08-02T00:00:00Z" },
      { id: "urgent-newer", orderBy: "2026-09-01", proceedDate: "2026-08-20T00:00:00Z" },
    ];
    expect(manualPurchaseWorkOrder(rows).map((r) => r.id)).toEqual([
      "urgent-newer",
      "urgent",
      "late",
      "none",
    ]);
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
 * PURCHASING CARD 06 §7 — the two Work Engine action contracts.
 */
describe("Card 06 §7 · the two Work actions", () => {
  const input = (over: Partial<ManualPurchaseWorkInput>): ManualPurchaseWorkInput => ({
    requestId: "r1",
    reqNo: "MPR-20260830-1234",
    status: "ready_to_order",
    remainingQty: 2,
    orderBy: "2026-09-03",
    hasPos: false,
    posAllSent: false,
    ...over,
  });
  const approver = { userId: "u-jess", name: "Jess" };
  const poDuty = { userId: "u-yj", name: "Yu Jun" };

  it("undecided approval emits `Approve {MPR}` for the configured approver, due Order By", () => {
    const items = manualPurchaseWorkItems(
      input({ status: "waiting_approval", remainingQty: 2 }),
      { approver, poDuty },
      "2026-09-01",
    );
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      ruleKey: "manual_purchase.approve",
      module: "purchasing",
      soRef: "MPR-20260830-1234",
      orderId: "r1",
      action: "Approve MPR-20260830-1234",
      ownerName: "Jess",
      ownerUserId: "u-jess",
      dueIso: "2026-09-03",
      workingDaysLate: 0,
    });
  });

  it("approved remaining demand emits the issue action for normal PO Duty", () => {
    const items = manualPurchaseWorkItems(input({}), { approver, poDuty }, "2026-09-01");
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      ruleKey: "manual_purchase.issue_po",
      action: "Issue the purchase order for MPR-20260830-1234",
      ownerName: "Yu Jun",
      ownerUserId: "u-yj",
      dueIso: "2026-09-03",
    });
  });

  it("a numbered PO completes nothing — the current version must be confirmed sent", () => {
    const open = manualPurchaseWorkItems(
      input({ status: "ordered", remainingQty: 0, hasPos: true, posAllSent: false }),
      { approver, poDuty },
      "2026-09-01",
    );
    expect(open.map((i) => i.ruleKey)).toEqual(["manual_purchase.issue_po"]);

    const done = manualPurchaseWorkItems(
      input({ status: "ordered", remainingQty: 0, hasPos: true, posAllSent: true }),
      { approver, poDuty },
      "2026-09-01",
    );
    expect(done).toEqual([]);
  });

  it("a refused or arrived request carries no work; late counts Office working days", () => {
    expect(
      manualPurchaseWorkItems(
        input({ status: "not_going_ahead", remainingQty: 0 }),
        { approver, poDuty },
        "2026-09-01",
      ),
    ).toEqual([]);
    expect(
      manualPurchaseWorkItems(
        input({ status: "arrived", remainingQty: 0, hasPos: true, posAllSent: true }),
        { approver, poDuty },
        "2026-09-01",
      ),
    ).toEqual([]);
    // Order By Thu 3 Sep 2026 → Mon 7 Sep is 2 Office working days late
    // (Fri counts, the weekend does not).
    const late = manualPurchaseWorkItems(input({}), { approver, poDuty }, "2026-09-07", {
      holidays: new Set(),
    });
    expect(late[0].workingDaysLate).toBe(2);
  });

  it("nobody resolved → the honest duty word stands, never a hand-picked person", () => {
    const items = manualPurchaseWorkItems(
      input({ status: "waiting_approval" }),
      { approver: null, poDuty: null },
      "2026-09-01",
    );
    expect(items[0].ownerName).toBeNull();
    expect(items[0].ownerUserId).toBeNull();
    expect(items[0].ownerDuty).toBe("Purchasing");
  });
});

/**
 * PURCHASING CARD 04 — the permanent Register's own arithmetic — with the
 * Card 06 owner correction to the column words and the document partition.
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
  manualPurchaseNotSelectableReason,
  manualPurchaseSupplierSummary,
} from "./manual-purchase";

describe("Card 06 · the eleven column words", () => {
  it("spells the Card's exact column heads once — Requested Date / Needed By retired", () => {
    expect([
      MANUAL_PURCHASE_WORDS.colProceedDate,
      MANUAL_PURCHASE_WORDS.colApproval,
      MANUAL_PURCHASE_WORDS.colMprNo,
      MANUAL_PURCHASE_WORDS.colPoNo,
      MANUAL_PURCHASE_WORDS.colDeliveryDate,
      MANUAL_PURCHASE_WORDS.colFor,
      MANUAL_PURCHASE_WORDS.colItems,
      MANUAL_PURCHASE_WORDS.colQty,
      MANUAL_PURCHASE_WORDS.colSupplier,
      MANUAL_PURCHASE_WORDS.colDeliverTo,
      MANUAL_PURCHASE_WORDS.colRequestedBy,
    ]).toEqual([
      "Proceed Date",
      "Approval Status",
      "Manual Purchase No",
      "PO No",
      "Delivery Date",
      "For",
      "Items",
      "Qty",
      "Supplier",
      "Deliver To",
      "Requested By",
    ]);
    const words = JSON.stringify(MANUAL_PURCHASE_WORDS);
    expect(words).not.toContain("Requested Date");
    expect(words).not.toContain("Needed By");
    expect(words).not.toContain("Needed by");
  });

  it("the form's date words and the lead-days Send gap are governed", () => {
    expect(MANUAL_PURCHASE_WORDS.proceedDate).toBe("Proceed Date");
    expect(MANUAL_PURCHASE_WORDS.deliveryDate).toBe("Delivery Date");
    expect(MANUAL_PURCHASE_WORDS.sendNeedsLeadDays).toBe("Send — lead days are not set");
    expect(MANUAL_PURCHASE_WORDS.notRecorded).toBe("Not recorded");
    expect(MANUAL_PURCHASE_WORDS.orderDatePassed).toBe("Order date passed");
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

describe("Card 06 · selection and the issue sentence", () => {
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

  it("a dead tick says why, from the same two facts the gate reads", () => {
    expect(manualPurchaseNotSelectableReason("ready_to_order", 3)).toBeNull();
    expect(manualPurchaseNotSelectableReason("ready_to_order", 0)).toBe(
      "Approved at 0. Nothing to order.",
    );
    // MPR-20260904-8935: every line cut to 0 derives Not going ahead while the
    // Approval Status column still says Approved — the cause, not the state.
    expect(manualPurchaseNotSelectableReason("not_going_ahead", 0, "approved")).toBe(
      "Approved at 0. Nothing to order.",
    );
    expect(manualPurchaseNotSelectableReason("not_going_ahead", 0, "refused")).toBe(
      "Not going ahead.",
    );
    expect(manualPurchaseNotSelectableReason("not_going_ahead", 0)).toBe("Not going ahead.");
    expect(manualPurchaseNotSelectableReason("waiting_approval", 3)).toBe(
      "Waiting for approval.",
    );
    expect(manualPurchaseNotSelectableReason("waiting_sku", 3)).toBe("Waiting for the SKU.");
    expect(manualPurchaseNotSelectableReason("ordered", 0)).toBe("Ordered.");
    expect(manualPurchaseNotSelectableReason("arrived", 0)).toBe("Arrived.");
  });

  it("PO count partitions supplier × category × destination × purpose × Delivery Date", () => {
    const line = (over: Record<string, unknown>) => ({
      supplierId: "s1",
      category: "sofa",
      destinationId: "d1",
      purpose: "ready_stock",
      deliveryDate: "2026-09-15",
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
    // Card 06 §7 — one PO has ONE official supplier-facing delivery date:
    // two Delivery Dates inside the same wall are two documents.
    expect(
      manualPurchaseIssueGroupCount([line({}), line({ deliveryDate: "2026-09-22" })]),
    ).toBe(2);
    expect(
      manualPurchaseIssueGroupCount([line({}), line({ deliveryDate: null })]),
    ).toBe(2);
    // A line with nothing left to buy partitions nothing.
    expect(manualPurchaseIssueGroupCount([line({ remainingQty: 0 })])).toBe(0);
  });

  it("pluralises from facts", () => {
    expect(manualPurchaseIssueSentence(1, 1, 1)).toBe("1 selected · 1 unit · Issue 1 PO");
    expect(manualPurchaseIssueSentence(2, 5, 3)).toBe("2 selected · 5 units · Issue 3 POs");
  });
});

describe("Card 05 · the History record arithmetic", () => {
  it("speaks only the five stored-event titles", () => {
    expect(Object.keys(MANUAL_PURCHASE_HISTORY_WORDS)).toEqual([
      "created",
      "approved",
      "refused",
      "line_not_going_ahead",
      "po_issued",
    ]);
  });

  it("an approval's result line counts units — the Card's own example", () => {
    const r = manualPurchaseHistoryRecord({
      kind: "approved",
      occurred_at: "2026-08-29T02:42:00Z",
      actor: "Jess",
      actor_role: "principal",
      requested_units: 2,
      approved_units: 1,
    });
    expect(r.title).toBe("Purchase approved");
    expect(r.detail).toEqual(["2 requested · 1 approved"]);
  });

  it("a refusal carries its reason verbatim; a missing reason renders no rank 3", () => {
    expect(
      manualPurchaseHistoryRecord({
        kind: "refused",
        occurred_at: "2026-08-29T02:42:00Z",
        actor: "Jess",
        actor_role: "principal",
        reason: "Shelf already covers it.",
      }).detail,
    ).toEqual(["Shelf already covers it."]);
    expect(
      manualPurchaseHistoryRecord({
        kind: "refused",
        occurred_at: "2026-08-29T02:42:00Z",
        actor: null,
        actor_role: null,
      }).detail,
    ).toEqual([]);
  });

  it("a PO issue names the exact document and its units — never an inference", () => {
    const r = manualPurchaseHistoryRecord({
      kind: "po_issued",
      occurred_at: "2026-08-29T03:00:00Z",
      actor: null,
      actor_role: null,
      po_no: "PO-2054",
      units: 3,
    });
    expect(r.title).toBe("Purchase order issued");
    expect(r.detail).toEqual(["PO-2054 · 3 units"]);
  });

  it("a cancelled remainder names the SKU and the stored reason", () => {
    expect(
      manualPurchaseHistoryRecord({
        kind: "line_not_going_ahead",
        occurred_at: "2026-08-29T03:00:00Z",
        actor: null,
        actor_role: null,
        sku: "5539-2NA",
        reason: "Found in the showroom store",
      }).detail,
    ).toEqual(["5539-2NA — Found in the showroom store"]);
  });
});

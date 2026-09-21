import { describe, expect, it } from "vitest";
import {
  MANUAL_PURCHASE_RAIL,
  MANUAL_PURCHASE_RAIL_CLEAR,
  MANUAL_PURCHASE_HISTORY_WORDS,
  compareManualPurchaseRows,
  manualPurchaseApproverLine,
  manualPurchaseGroupOf,
  manualPurchaseHistoryRecord,
  manualPurchaseLeadDayFacts,
  manualPurchaseOrderByCell,
  manualPurchaseOrderByLine,
  manualPurchaseOrderByOf,
  manualPurchaseRailFacts,
  manualPurchaseRailModel,
  manualPurchaseStatusOf,
  manualPurchaseTimingOf,
  manualPurchaseWorkItems,
  type ManualPurchaseRailFacts,
  type ManualPurchaseStatusKind,
  type ManualPurchaseWorkInput,
} from "./manual-purchase";
import { SO_BATCH_RAIL } from "./so-batch-purchase";
import { DEMAND_PURPOSES } from "./to-order";

/**
 * MANUAL PURCHASE ROUND 2 — the grouped Register and its rail (owner rulings
 * R1–R4, 2026-09-16; `docs/purchasing/MASTER.md` §9.2). Five rail sections;
 * `WORK TO DO` and `TO ORDER` retired; three mutually exclusive groups; ORDER
 * TIMING counts only requests with quantity still to buy.
 */

const facts = (
  over: Partial<ManualPurchaseRailFacts> & { requestId: string },
): ManualPurchaseRailFacts => ({
  group: "to-buy",
  purpose: "ready_stock",
  categories: new Set(),
  suppliers: new Set(),
  orderBy: null,
  timing: null,
  supplierGap: false,
  productionDaysMissing: false,
  transitDaysMissing: false,
  ...over,
});

describe("Round 2 · the rail words and order", () => {
  it("renders exactly the five approved sections, in the approved order", () => {
    expect(Object.keys(MANUAL_PURCHASE_RAIL)).toEqual([
      "timing",
      "purpose",
      "product",
      "supplier",
      "setup",
    ]);
    expect(MANUAL_PURCHASE_RAIL.timing.heading).toBe("Order timing");
    expect(MANUAL_PURCHASE_RAIL.purpose.heading).toBe("Purpose");
    expect(MANUAL_PURCHASE_RAIL.product.heading).toBe("Product");
    expect(MANUAL_PURCHASE_RAIL.supplier.heading).toBe("Supplier");
    expect(MANUAL_PURCHASE_RAIL.setup.heading).toBe("Setup to fix");
  });

  it("ORDER TIMING holds the three timing rows, in order", () => {
    expect(MANUAL_PURCHASE_RAIL.timing.rows.map((r) => r.word)).toEqual([
      "Can order early",
      "Order date reached",
      "Order date passed",
    ]);
  });

  it("PURPOSE offers exactly the approved six under `All purposes`", () => {
    expect(MANUAL_PURCHASE_RAIL.purpose.all).toBe("All purposes");
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
  });

  it("SETUP TO FIX names the three exact configuration facts", () => {
    expect(MANUAL_PURCHASE_RAIL.setup.rows.map((r) => r.word)).toEqual([
      "Supplier not set",
      "Production days not set",
      "Transit days not set",
    ]);
  });

  it("carries none of the retired or banned rows", () => {
    const words = JSON.stringify(MANUAL_PURCHASE_RAIL).toLowerCase();
    for (const banned of [
      "WORK TO DO",
      "TO ORDER",
      "All not ordered",
      "Approve purchase",
      "Supplier not selected",
      "Need price",
      "Arrived",
      "Cancelled",
      "Safety days",
      "Need approval",
      "Ready to order",
    ]) {
      expect(words).not.toContain(banned.toLowerCase());
    }
  });
});

const status = (over: Partial<Parameters<typeof manualPurchaseStatusOf>[0]> = {}) =>
  manualPurchaseStatusOf({
    approvedAt: null,
    refusedAt: null,
    refuseReason: null,
    lines: [{ qty: 2, issuedQty: 0, cancelledAt: null, poId: null }],
    ...over,
  });

describe("Round 2 · R1 — every request waits for approval", () => {
  it("a stored `approval_required = false` row with no decision still waits", () => {
    // The arithmetic no longer reads the switch at all: there is no exemption.
    expect(status().kind).toBe("waiting_approval");
  });

  it("sent back and withdrawn are their own states", () => {
    expect(status({ sentBackAt: "t" }).kind).toBe("sent_back");
    expect(status({ withdrawnAt: "t" }).kind).toBe("withdrawn");
    // A withdrawal wins over anything else stored beside it.
    expect(status({ withdrawnAt: "t", sentBackAt: "t" }).kind).toBe("withdrawn");
  });
});

describe("Round 2 · R2 — exactly one group per request", () => {
  const group = (
    approval: Parameters<typeof manualPurchaseGroupOf>[0]["approval"],
    statusKind: ManualPurchaseStatusKind,
    remainingQty: number,
    remainderKnown = true,
  ) => manualPurchaseGroupOf({ approval, status: statusKind, remainingQty, remainderKnown });

  it("waiting and sent back are Need approval, however much they ask", () => {
    expect(group("need_approval", "waiting_approval", 5)).toBe("need-approval");
    expect(group("sent_back", "sent_back", 5)).toBe("need-approval");
  });

  it("a request NOT approved is never To buy — even with an unknown remainder", () => {
    expect(group("need_approval", "waiting_approval", 0, false)).toBe("need-approval");
    expect(group("sent_back", "sent_back", 3, false)).toBe("need-approval");
  });

  it("approved with remaining quantity is To buy", () => {
    expect(group("approved", "ready_to_order", 2)).toBe("to-buy");
  });

  it("⭐ approved with an UNKNOWN remainder stays To buy — unknown is not zero", () => {
    expect(group("approved", "ready_to_order", 0, false)).toBe("to-buy");
    expect(group("approved", "ordered", 0, false)).toBe("to-buy");
  });

  it("approved with a CONFIRMED zero remainder needs no purchase", () => {
    expect(group("approved", "ready_to_order", 0)).toBe("no-purchase-needed");
    expect(group("approved", "ordered", 0)).toBe("no-purchase-needed");
    expect(group("approved", "arrived", 0)).toBe("no-purchase-needed");
    expect(group("approved", "not_going_ahead", 0)).toBe("no-purchase-needed");
  });

  it("refused and withdrawn need no purchase", () => {
    expect(group("refused", "not_going_ahead", 4)).toBe("no-purchase-needed");
    expect(group("withdrawn", "withdrawn", 4)).toBe("no-purchase-needed");
  });

  it("Order By: the date, `Not planned` while waiting or buying, blank when done", () => {
    expect(manualPurchaseOrderByCell("to-buy", "2026-09-20")).toEqual({ date: "2026-09-20", notPlanned: false });
    expect(manualPurchaseOrderByCell("to-buy", null)).toEqual({ date: null, notPlanned: true });
    expect(manualPurchaseOrderByCell("need-approval", null)).toEqual({ date: null, notPlanned: true });
    expect(manualPurchaseOrderByCell("no-purchase-needed", "2026-09-20")).toEqual({ date: null, notPlanned: false });
  });

  it("default order: Order By ascending → Not planned → newest Proceed Date; history newest first", () => {
    const rows = [
      { id: "done-old", group: "no-purchase-needed" as const, orderBy: "2026-09-01", proceedDate: "2026-08-01" },
      { id: "buy-none", group: "to-buy" as const, orderBy: null, proceedDate: "2026-09-10" },
      { id: "buy-late", group: "to-buy" as const, orderBy: "2026-09-30", proceedDate: "2026-09-01" },
      { id: "wait", group: "need-approval" as const, orderBy: "2026-09-25", proceedDate: "2026-09-02" },
      { id: "buy-early-new", group: "to-buy" as const, orderBy: "2026-09-18", proceedDate: "2026-09-05" },
      { id: "buy-early-old", group: "to-buy" as const, orderBy: "2026-09-18", proceedDate: "2026-09-01" },
      { id: "done-new", group: "no-purchase-needed" as const, orderBy: null, proceedDate: "2026-09-09" },
    ];
    expect([...rows].sort(compareManualPurchaseRows).map((r) => r.id)).toEqual([
      "wait",
      "buy-early-new",
      "buy-early-old",
      "buy-late",
      "buy-none",
      "done-new",
      "done-old",
    ]);
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

describe("Round 2 · the facts projection", () => {
  const row = (over: Partial<Parameters<typeof manualPurchaseRailFacts>[0][number]> = {}) => ({
    requestId: "r1",
    group: "to-buy" as const,
    purpose: "ready_stock",
    remainingQty: 2,
    remainderKnown: true,
    lineCategories: ["mattress", null, undefined, "mattress"] as const,
    lineSupplierNames: ["Hooka", null, "", "Hooka"],
    lineOrderBys: ["2026-09-10", "2026-09-03", null],
    supplierGap: true,
    productionDaysMissing: false,
    transitDaysMissing: true,
    ...over,
  });

  it("keeps the CATALOG's categories, actual supplier names and the earliest Order By", () => {
    const [f] = manualPurchaseRailFacts([row()], "2026-09-04");
    expect([...f!.categories]).toEqual(["mattress"]);
    expect([...f!.suppliers]).toEqual(["Hooka"]);
    expect(f!.orderBy).toBe("2026-09-03");
    expect(f!.timing).toBe("order_date_passed");
    expect(f!.supplierGap).toBe(true);
  });

  it("⭐ ORDER TIMING counts ONLY requests with quantity still to buy", () => {
    const [done] = manualPurchaseRailFacts([row({ group: "no-purchase-needed", remainingQty: 0 })], "2026-09-04");
    const [unknown] = manualPurchaseRailFacts([row({ remainderKnown: false })], "2026-09-04");
    const [zero] = manualPurchaseRailFacts([row({ remainingQty: 0 })], "2026-09-04");
    const [waiting] = manualPurchaseRailFacts([row({ group: "need-approval" })], "2026-09-04");
    expect(done!.timing).toBeNull();
    expect(unknown!.timing).toBeNull();
    expect(zero!.timing).toBeNull();
    expect(waiting!.timing).toBe("order_date_passed");
  });
});

describe("Round 2 · the rail model", () => {
  const base = [
    facts({
      requestId: "a",
      group: "need-approval",
      purpose: "ready_stock",
      categories: new Set(["mattress"]),
      suppliers: new Set(["Hooka"]),
      orderBy: "2026-09-01",
      timing: "order_date_passed",
    }),
    facts({
      requestId: "b",
      purpose: "showroom_display",
      categories: new Set(["sofa"]),
      suppliers: new Set(["Dorsettloft"]),
      orderBy: "2026-09-10",
      timing: "can_order_early",
    }),
    facts({
      requestId: "c",
      group: "no-purchase-needed",
      purpose: "ready_stock",
      categories: new Set(["mattress", "bedframe"]),
      suppliers: new Set(["Hooka", "Ohana"]),
    }),
    facts({
      requestId: "d",
      purpose: "subsidiary_purchase",
      categories: new Set(["bedframe"]),
      suppliers: new Set(["Ohana"]),
      orderBy: "2026-09-04",
      timing: "order_date_reached",
      productionDaysMissing: true,
    }),
    facts({
      requestId: "e",
      group: "no-purchase-needed",
      purpose: "office",
      suppliers: new Set(["Ohana"]),
    }),
  ];

  it("the empty filter is the permanent Register — every group included", () => {
    const m = manualPurchaseRailModel(base, MANUAL_PURCHASE_RAIL_CLEAR);
    expect([...m.visibleRequestIds].sort()).toEqual(["a", "b", "c", "d", "e"]);
  });

  it("counts are UNIQUE requests — timing, purpose, product and setup", () => {
    const m = manualPurchaseRailModel(base, MANUAL_PURCHASE_RAIL_CLEAR);
    expect(m.timingCounts).toEqual({
      can_order_early: 1,
      order_date_reached: 1,
      order_date_passed: 1,
    });
    expect(m.productCounts).toEqual({ mattress: 2, bedframe: 2, sofa: 1 });
    expect(m.purposeCounts.ready_stock).toBe(2);
    expect(m.setupCounts).toEqual({
      supplier_not_set: 0,
      production_days_not_set: 1,
      transit_days_not_set: 0,
    });
  });

  it("SETUP TO FIX draws only the rows with an affected request", () => {
    const m = manualPurchaseRailModel(base, MANUAL_PURCHASE_RAIL_CLEAR);
    expect(m.setupExists).toBe(true);
    expect(m.setupRows).toEqual(["production_days_not_set"]);
    const clean = base.map((f) => ({ ...f, productionDaysMissing: false }));
    expect(manualPurchaseRailModel(clean, MANUAL_PURCHASE_RAIL_CLEAR).setupExists).toBe(false);
    const gap = [facts({ requestId: "g", supplierGap: true })];
    expect(manualPurchaseRailModel(gap, MANUAL_PURCHASE_RAIL_CLEAR).setupRows).toEqual(["supplier_not_set"]);
  });

  it("suppliers are actual names, alphabetical", () => {
    const m = manualPurchaseRailModel(base, MANUAL_PURCHASE_RAIL_CLEAR);
    expect(m.suppliers).toEqual([
      { name: "Dorsettloft", count: 1 },
      { name: "Hooka", count: 2 },
      { name: "Ohana", count: 3 },
    ]);
  });

  it("sections combine with AND, and each count is under the OTHER sections", () => {
    const m = manualPurchaseRailModel(base, {
      ...MANUAL_PURCHASE_RAIL_CLEAR,
      product: "bedframe",
      supplier: "Ohana",
    });
    expect([...m.visibleRequestIds].sort()).toEqual(["c", "d"]);
    expect(m.timingCounts.order_date_reached).toBe(1);
    expect(m.purposeCounts.subsidiary_purchase).toBe(1);
  });

  it("the selected supplier stays visible with its honest 0", () => {
    const m = manualPurchaseRailModel(base, {
      ...MANUAL_PURCHASE_RAIL_CLEAR,
      timing: "order_date_passed",
      supplier: "Dorsettloft",
    });
    expect(m.suppliers).toEqual([
      { name: "Dorsettloft", count: 0 },
      { name: "Hooka", count: 1 },
    ]);
  });

  it("fixed rows print zero rather than hiding it", () => {
    const m = manualPurchaseRailModel([], MANUAL_PURCHASE_RAIL_CLEAR);
    expect(m.timingCounts).toEqual({
      can_order_early: 0,
      order_date_reached: 0,
      order_date_passed: 0,
    });
    expect(m.setupExists).toBe(false);
  });
});

describe("Card 03 §3 · the approval owner's sentence", () => {
  it("names one holder, joins several with `or`, and prints nothing for nobody", () => {
    expect(manualPurchaseApproverLine(["Jess"])).toBe("Jess approves");
    expect(manualPurchaseApproverLine(["Jess", "YJ"])).toBe("Jess or YJ approves");
    expect(manualPurchaseApproverLine([])).toBe("Nobody holds Purchasing Approver.");
    expect(manualPurchaseApproverLine([null, "", "  "])).toBeNull();
  });
});

/**
 * PURCHASING CARD 06 §7 — the two Work Engine action contracts.
 */
describe("Card 06 §7 · the two Work actions", () => {
  const input = (over: Partial<ManualPurchaseWorkInput>): ManualPurchaseWorkInput => ({
    requestId: "r1",
    context: "Manual Purchase \u00b7 Ready Stock \u00b7 Carres Klang \u00b7 Hooka",
    status: "ready_to_order",
    remainingQty: 2,
    orderBy: "2026-09-03",
    hasPos: false,
    posAllSent: false,
    ...over,
  });
  const approver = { userId: "u-jess", name: "Jess" };
  const poDuty = { userId: "u-yj", name: "Yu Jun" };

  it("undecided approval emits `Approve purchase` for the configured approver, due Order By", () => {
    const items = manualPurchaseWorkItems(
      input({ status: "waiting_approval", remainingQty: 2 }),
      { approver, poDuty },
      "2026-09-01",
    );
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      ruleKey: "manual_purchase.approve",
      module: "purchasing",
      soRef: "Manual Purchase \u00b7 Ready Stock \u00b7 Carres Klang \u00b7 Hooka",
      orderId: "r1",
      action: "Approve purchase",
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
      action: "Issue PO",
      ownerName: "Yu Jun",
      ownerUserId: "u-yj",
      dueIso: "2026-09-03",
    });
  });

  it("an ISSUED PO is a commitment — a missing send confirmation raises no work", () => {
    /* ⭐ OWNER RULING 2026-09-11. This used to keep `Issue PO` open on a fully
       ordered request whose purchase orders carried no confirmed-sent row.
       Measured on production the same day: 62 purchase orders exist and 3
       carry that evidence — so the rule raised an "Issue PO" task against 59
       documents that had already been issued, inviting a SECOND purchase
       order for goods already bought. Copying a PO into WhatsApp is not proof
       of sending, and the absence of proof is not a reason to buy again. */
    expect(
      manualPurchaseWorkItems(
        input({ status: "ordered", remainingQty: 0, hasPos: true, posAllSent: false }),
        { approver, poDuty },
        "2026-09-01",
      ),
    ).toEqual([]);
    expect(
      manualPurchaseWorkItems(
        input({ status: "ordered", remainingQty: 0, hasPos: true, posAllSent: true }),
        { approver, poDuty },
        "2026-09-01",
      ),
    ).toEqual([]);
    /* The evidence itself is untouched — it is still read, still stored, and
       still worth showing on the document. It simply may not make work. */
    const stillOpen = manualPurchaseWorkItems(
      input({ status: "ready_to_order", remainingQty: 2, hasPos: true, posAllSent: false }),
      { approver, poDuty },
      "2026-09-01",
    );
    expect(stillOpen.map((i) => i.ruleKey)).toEqual(["manual_purchase.issue_po"]);
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

describe("the settled nine column words", () => {
  it("spells the settled column heads once, in order — owner ruling 2026-09-11", () => {
    expect([
      MANUAL_PURCHASE_WORDS.colApproval,
      MANUAL_PURCHASE_WORDS.colRequestedBy,
      MANUAL_PURCHASE_WORDS.colProceedDate,
      MANUAL_PURCHASE_WORDS.colPoNo,
      MANUAL_PURCHASE_WORDS.colPurpose,
      MANUAL_PURCHASE_WORDS.colItems,
      MANUAL_PURCHASE_WORDS.colSupplier,
      MANUAL_PURCHASE_WORDS.colDeliverTo,
      MANUAL_PURCHASE_WORDS.colDeliveryDate,
    ]).toEqual([
      "Approval Status",
      "Requested By",
      "Proceed Date",
      "PO No",
      "Purpose",
      "Items",
      "Supplier",
      "Deliver To",
      "Delivery Date",
    ]);
    const words = JSON.stringify(MANUAL_PURCHASE_WORDS);
    expect(words).not.toContain("Requested Date");
    expect(words).not.toContain("Needed By");
    expect(words).not.toContain("Needed by");
  });

  it("`For` survives as the OBJECT's fact, and `Qty` is the GOODS table's head", () => {
    /* The structured `For` still labels the object's Request section; it is
       simply no longer a Register column.

       ⭐ `colQty` IS BACK, AND IT IS A DIFFERENT COLUMN (owner ruling
       2026-09-18). It left the dictionary in 2026-09-11 because the PARENT row
       may not carry a quantity — a request's total ask is not a buying
       decision at row level, and that is still true. The approved goods table
       carries `Qty` at the grain the quantity was actually allocated at, which
       is where a number means something. A word earns its place by being
       printed somewhere true. */
    expect(MANUAL_PURCHASE_WORDS.colFor).toBe("For");
    expect(MANUAL_PURCHASE_WORDS.colQty).toBe("Qty");
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

describe("Round 2 · the approval fact", () => {
  it("answers the five ways — no exemption, a withdrawal wins", () => {
    const of = (f: Partial<Parameters<typeof manualPurchaseApprovalOf>[0]>) =>
      manualPurchaseApprovalOf({ approvedAt: null, refusedAt: null, ...f }).label;
    expect(of({})).toBe(MANUAL_PURCHASE_APPROVAL_WORDS.need_approval);
    expect(of({ approvedAt: "t" })).toBe("Approved");
    expect(of({ refusedAt: "t" })).toBe("Refused");
    expect(of({ sentBackAt: "t" })).toBe("Sent back for changes");
    expect(of({ withdrawnAt: "t" })).toBe("Withdrawn");
    expect(Object.values(MANUAL_PURCHASE_APPROVAL_WORDS)).not.toContain("No approval needed");
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
    expect(manualPurchasePoSummary([])).toBe("\u2014");
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
    expect(manualPurchaseIssueSentence(1, 1, 1, 1)).toBe(
      "1 Manual Purchase · 1 item line · Qty 1 · Issue 1 PO",
    );
    expect(manualPurchaseIssueSentence(2, 4, 5, 3)).toBe(
      "2 Manual Purchases · 4 item lines · Qty 5 · Issue 3 POs",
    );
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
      "sent_back",
      "resubmitted",
      "withdrawn",
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

/**
 * PURCHASING CARD 08 — the MPR identity is removed. A Manual Purchase has
 * no visible document number: business facts identify it everywhere, and
 * the only purchasing document identity is the actual PO No.
 */
import {
  manualPurchaseObjectHeading,
  manualPurchaseSourceLine,
  manualPurchaseSourceSummary,
  manualPurchaseWorkContext,
} from "./manual-purchase";

describe("the document identity — MPR No, and the names still banned", () => {
  it("⭐ `MPR No` IS THE IDENTITY AGAIN, and the banned names stay banned", () => {
    /* Owner ruling 2026-09-18, which OVERWRITES Card 08 (2026-09-04): each
       Manual Purchase request carries `MPR-YYYYMMDD-RRRR`, and it opens the
       document. What Card 08 banned is still banned — a request is not a
       `Manual Purchase No`, not a `Request No`, not a `Draft PO`, and never
       `MP`, which is already the Mattress Protector SKU code. */
    expect(MANUAL_PURCHASE_WORDS.colMprNo).toBe("MPR No");
    const words = JSON.stringify(MANUAL_PURCHASE_WORDS);
    expect(words).not.toContain("Manual Purchase No");
    expect(words).not.toContain("Request No");
    expect(words).not.toContain("Draft PO");
  });

  it("the Work context speaks business facts, empty facts dropped", () => {
    expect(
      manualPurchaseWorkContext({
        purposeLabel: "Ready Stock",
        forText: "Carres Klang",
        supplierSummary: "Nice Future",
      }),
    ).toBe("Manual Purchase · Ready Stock · Carres Klang · Nice Future");
    expect(
      manualPurchaseWorkContext({
        purposeLabel: "Service Case",
        forText: "SC-2041",
        supplierSummary: "",
      }),
    ).toBe("Manual Purchase · Service Case · SC-2041");
    expect(
      manualPurchaseWorkContext({
        purposeLabel: null,
        forText: null,
        supplierSummary: null,
      }),
    ).toBe("Manual Purchase");
  });

  it("the two Work action sentences carry no number, name or UUID", () => {
    expect(MANUAL_PURCHASE_WORDS.workApprove).toBe("Approve purchase");
    expect(MANUAL_PURCHASE_WORDS.workIssuePo).toBe("Issue PO");
  });

  it("the object heading is `{Need for} · {For}`, falling back to the page word", () => {
    expect(
      manualPurchaseObjectHeading({ purposeLabel: "Ready Stock", forText: "Carres Klang" }),
    ).toBe("Ready Stock · Carres Klang");
    expect(
      manualPurchaseObjectHeading({ purposeLabel: "Service Case", forText: "" }),
    ).toBe("Service Case");
    expect(manualPurchaseObjectHeading({ purposeLabel: null, forText: null })).toBe(
      "Manual Purchase",
    );
  });

  it("PO source wording: one `Manual Purchase`, several `{n} Manual Purchases`, zero nothing", () => {
    expect(manualPurchaseSourceSummary(0)).toBeNull();
    expect(manualPurchaseSourceSummary(1)).toBe("Manual Purchase");
    expect(manualPurchaseSourceSummary(3)).toBe("3 Manual Purchases");
  });

  it("a detailed source line distinguishes by business facts, never a number", () => {
    expect(
      manualPurchaseSourceLine({ purposeLabel: "Ready Stock", proceedDateLabel: "Thu, 4 Sep" }),
    ).toBe("Manual Purchase · Ready Stock · Thu, 4 Sep");
    expect(
      manualPurchaseSourceLine({ purposeLabel: null, proceedDateLabel: null }),
    ).toBe("Manual Purchase");
  });

  it("`PO No` before issue is the bare fact `—`", () => {
    expect(manualPurchasePoSummary([])).toBe(MANUAL_PURCHASE_WORDS.poNone);
    expect(manualPurchasePoSummary(["PO-20260904-1234"])).toBe("PO-20260904-1234");
    expect(manualPurchasePoSummary(["PO-1", "PO-2", "PO-1"])).toBe("2 POs");
  });
});

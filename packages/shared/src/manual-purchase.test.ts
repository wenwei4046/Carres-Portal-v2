import { describe, expect, it } from "vitest";
import {
  MANUAL_PURCHASE_RAIL,
  MANUAL_PURCHASE_RAIL_CLEAR,
  manualPurchaseRailFactsOf,
  manualPurchaseRailModel,
  manualPurchaseStatusOf,
  type ManualPurchaseRailFacts,
  type ManualPurchaseStatusKind,
} from "./manual-purchase";

/**
 * CARD 03 — THE MANUAL PURCHASE LEFT FILTER RAIL (owner-approved 2026-08-28).
 *
 * The words and their order are LAW; the counts are unique requests under the
 * other sections' selections; the banned rows are asserted absent by name.
 */

const line = (over: Partial<Parameters<typeof manualPurchaseRailFactsOf>[0]["lines"][number]> = {}) => ({
  cancelledAt: null,
  qty: 2,
  approvedQty: null,
  issuedQty: 0,
  category: "mattress",
  supplierNames: ["Nice Future"],
  ...over,
});

function facts(over: {
  requestId?: string;
  status?: ManualPurchaseStatusKind;
  purpose?: string;
  lines?: Array<ReturnType<typeof line>>;
} = {}): ManualPurchaseRailFacts {
  return manualPurchaseRailFactsOf({
    requestId: over.requestId ?? "r1",
    status: over.status ?? "ready_to_order",
    purpose: over.purpose ?? "ready_stock",
    lines: over.lines ?? [line()],
  });
}

describe("Card 03 · the rail's words, in the approved order", () => {
  it("renders exactly four groups, in the approved order", () => {
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

  it("TO ORDER holds exactly three rows, in the approved order", () => {
    expect(MANUAL_PURCHASE_RAIL.toOrder.rows.map((r) => r.word)).toEqual([
      "All not ordered",
      "Need approval",
      "Ready to order",
    ]);
  });

  it("PURCHASE PURPOSE offers the approved five under its All row", () => {
    expect(MANUAL_PURCHASE_RAIL.purpose.all).toBe("All purposes");
    expect(MANUAL_PURCHASE_RAIL.purpose.purposes.map((p) => p.label)).toEqual([
      "Ready Stock",
      "Showroom Display",
      "Service Case",
      "Internal Staff Purchase",
      "Subsidiary Purchase",
    ]);
  });

  it("PRODUCT is the Catalog categories; SUPPLIER carries no hardcoded name", () => {
    expect(MANUAL_PURCHASE_RAIL.product.all).toBe("All products");
    expect(MANUAL_PURCHASE_RAIL.product.categories.map((c) => c.word)).toEqual([
      "Mattress",
      "Bedframe",
      "Sofa",
    ]);
    expect(MANUAL_PURCHASE_RAIL.supplier.all).toBe("All suppliers");
    expect(Object.keys(MANUAL_PURCHASE_RAIL.supplier)).toEqual(["heading", "all"]);
  });

  it("no banned row or group word appears anywhere in the rail's dictionary", () => {
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
      "Safety days",
      "safety days",
      "Management Purchase",
    ]) {
      // `All not ordered` contains the letters `ordered` — assert on the whole
      // quoted word so a substring cannot fake a hit.
      expect(words).not.toContain(`"${banned}"`);
      expect(words).not.toContain(`:"${banned}"`);
    }
  });
});

describe("Card 03 · the facts — the one status arithmetic, the /issue remainder", () => {
  it("Need approval = awaiting the configured approver's decision", () => {
    const f = facts({ status: "waiting_approval" });
    expect(f.needApproval).toBe(true);
    expect(f.readyToOrder).toBe(false);
    expect(f.notOrdered).toBe(true);
  });

  it("Ready to order = approved with remaining quantity to issue", () => {
    const f = facts({ status: "ready_to_order", lines: [line({ qty: 3, issuedQty: 1 })] });
    expect(f.readyToOrder).toBe(true);
    expect(f.notOrdered).toBe(true);
  });

  it("the remainder is the approver's number less what went out — approved_qty wins", () => {
    // Asked 5, cut to 2, issued 2: nothing left. The original ask never
    // resurrects the demand.
    const f = facts({
      status: "ready_to_order",
      lines: [line({ qty: 5, approvedQty: 2, issuedQty: 2 })],
    });
    expect(f.readyToOrder).toBe(false);
    expect(f.notOrdered).toBe(false);
  });

  it("a fully ordered request leaves all three TO ORDER rows", () => {
    const f = facts({ status: "ordered", lines: [line({ qty: 2, issuedQty: 2 })] });
    expect(f.needApproval).toBe(false);
    expect(f.readyToOrder).toBe(false);
    expect(f.notOrdered).toBe(false);
  });

  it("refused and arrived requests are not TO ORDER work", () => {
    for (const status of ["not_going_ahead", "arrived"] as const) {
      const f = facts({ status });
      expect(f.notOrdered).toBe(false);
    }
  });

  it("a cancelled line contributes nothing — no category, supplier or remainder", () => {
    const f = facts({
      status: "ready_to_order",
      lines: [
        line({ cancelledAt: "2026-08-28T00:00:00Z", category: "sofa", supplierNames: ["Dorsettloft"] }),
        line({ qty: 1, issuedQty: 1 }),
      ],
    });
    expect(f.readyToOrder).toBe(false);
    expect(f.categories.has("sofa")).toBe(false);
    expect(f.suppliers.has("Dorsettloft")).toBe(false);
  });

  it("a LEGACY purpose matches no purpose filter and lives under All purposes only", () => {
    for (const legacy of ["office", "spare_parts"]) {
      expect(facts({ purpose: legacy }).purpose).toBeNull();
    }
    expect(facts({ purpose: "internal_staff" }).purpose).toBe("internal_staff");
    expect(facts({ purpose: "subsidiary" }).purpose).toBe("subsidiary");
  });

  it("a missing SKU category or supplier becomes NO facet — never a placeholder row", () => {
    const f = facts({ lines: [line({ category: null, supplierNames: [null, ""] })] });
    expect(f.categories.size).toBe(0);
    expect(f.suppliers.size).toBe(0);
    const model = manualPurchaseRailModel([f], MANUAL_PURCHASE_RAIL_CLEAR);
    expect(model.suppliers).toEqual([]);
    // ...and the request itself stays in the default Register.
    expect(model.visibleRequestIds.has("r1")).toBe(true);
  });
});

describe("Card 03 · the model — unique requests, sections AND, All clears its own", () => {
  const population = [
    facts({
      requestId: "a",
      status: "waiting_approval",
      purpose: "ready_stock",
      lines: [line({ category: "mattress", supplierNames: ["Nice Future"] })],
    }),
    facts({
      requestId: "b",
      status: "ready_to_order",
      purpose: "display",
      lines: [
        line({ category: "sofa", supplierNames: ["Dorsettloft"] }),
        line({ category: "mattress", supplierNames: ["Nice Future"] }),
      ],
    }),
    facts({
      requestId: "c",
      status: "ordered",
      purpose: "subsidiary",
      lines: [line({ qty: 2, issuedQty: 2, category: "bedframe", supplierNames: ["Hooka"] })],
    }),
    facts({
      requestId: "d",
      status: "ready_to_order",
      purpose: "office", // LEGACY
      lines: [line({ category: "mattress", supplierNames: ["Nice Future"] })],
    }),
  ];

  it("the default no-filter Register keeps ordered history — the listing is permanent", () => {
    const m = manualPurchaseRailModel(population, MANUAL_PURCHASE_RAIL_CLEAR);
    expect(m.visibleRequestIds).toEqual(new Set(["a", "b", "c", "d"]));
  });

  it("All not ordered excludes the fully ordered request", () => {
    const m = manualPurchaseRailModel(population, {
      ...MANUAL_PURCHASE_RAIL_CLEAR,
      toOrder: "not_ordered",
    });
    expect(m.visibleRequestIds).toEqual(new Set(["a", "b", "d"]));
    expect(m.toOrderCounts.not_ordered).toBe(3);
    expect(m.toOrderCounts.need_approval).toBe(1);
    expect(m.toOrderCounts.ready_to_order).toBe(2);
  });

  it("counts are UNIQUE requests — a two-line, two-category request counts once per facet", () => {
    const m = manualPurchaseRailModel(population, MANUAL_PURCHASE_RAIL_CLEAR);
    // `b` has two lines (sofa + mattress) and one supplier twice removed —
    // it adds ONE to each matching facet, never two.
    expect(m.productCounts.mattress).toBe(3); // a, b, d
    expect(m.productCounts.sofa).toBe(1); // b
    expect(m.suppliers).toEqual([
      { name: "Dorsettloft", count: 1 },
      { name: "Hooka", count: 1 },
      { name: "Nice Future", count: 3 },
    ]);
  });

  it("supplier rows are actual names, alphabetical and dynamic", () => {
    const m = manualPurchaseRailModel(population, MANUAL_PURCHASE_RAIL_CLEAR);
    const names = m.suppliers.map((s) => s.name);
    expect(names).toEqual([...names].sort((x, y) => x.localeCompare(y)));
    expect(names).not.toContain("No supplier");
    expect(names).not.toContain("Supplier not selected");
  });

  it("sections combine with AND", () => {
    const m = manualPurchaseRailModel(population, {
      toOrder: "ready_to_order",
      purpose: "display",
      product: "mattress",
      supplier: "Nice Future",
    });
    expect(m.visibleRequestIds).toEqual(new Set(["b"]));
  });

  it("each section's counts are computed under the OTHER sections' selections", () => {
    const m = manualPurchaseRailModel(population, {
      ...MANUAL_PURCHASE_RAIL_CLEAR,
      purpose: "display",
    });
    // Under `Showroom Display`, only `b` remains for the other sections…
    expect(m.productCounts.mattress).toBe(1);
    expect(m.productCounts.bedframe).toBe(0);
    expect(m.suppliers).toEqual([
      { name: "Dorsettloft", count: 1 },
      { name: "Nice Future", count: 1 },
    ]);
    // …while the purpose section itself still counts against the others only.
    expect(m.purposeCounts.ready_stock).toBe(1);
    expect(m.purposeCounts.display).toBe(1);
    expect(m.purposeCounts.subsidiary).toBe(1);
  });

  it("a LEGACY purpose row is counted by no purpose filter", () => {
    const m = manualPurchaseRailModel(population, MANUAL_PURCHASE_RAIL_CLEAR);
    const purposeTotal = Object.values(m.purposeCounts).reduce((n, v) => n + v, 0);
    expect(purposeTotal).toBe(3); // d (office) belongs to none of the five
    const filtered = manualPurchaseRailModel(population, {
      ...MANUAL_PURCHASE_RAIL_CLEAR,
      purpose: "ready_stock",
    });
    expect(filtered.visibleRequestIds).toEqual(new Set(["a"]));
  });

  it("the selected supplier stays visible with its honest 0", () => {
    const m = manualPurchaseRailModel(population, {
      ...MANUAL_PURCHASE_RAIL_CLEAR,
      purpose: "subsidiary",
      supplier: "Dorsettloft",
    });
    expect(m.suppliers.find((s) => s.name === "Dorsettloft")).toEqual({
      name: "Dorsettloft",
      count: 0,
    });
  });

  it("the fixed rows print zero rather than hiding", () => {
    const m = manualPurchaseRailModel([], MANUAL_PURCHASE_RAIL_CLEAR);
    expect(m.toOrderCounts).toEqual({ not_ordered: 0, need_approval: 0, ready_to_order: 0 });
    expect(m.purposeCounts.ready_stock).toBe(0);
    expect(m.productCounts.sofa).toBe(0);
    expect(m.suppliers).toEqual([]);
  });
});

describe("Card 03 · the rail rides the ONE status arithmetic", () => {
  it("manualPurchaseStatusOf still decides the kinds the rail reads", () => {
    const status = manualPurchaseStatusOf({
      approvalRequired: true,
      approvedAt: null,
      refusedAt: null,
      refuseReason: null,
      lines: [{ qty: 1, issuedQty: 0, remainingQty: 1, cancelledAt: null, poId: null }],
    });
    expect(status.kind).toBe("waiting_approval");
    const f = manualPurchaseRailFactsOf({
      requestId: "x",
      status: status.kind,
      purpose: "ready_stock",
      lines: [line()],
    });
    expect(f.needApproval).toBe(true);
  });
});

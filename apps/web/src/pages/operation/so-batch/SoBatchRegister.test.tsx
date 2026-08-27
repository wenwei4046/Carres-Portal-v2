import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type {
  PurchaseDemandRow,
  SoBatchOrderRow,
  SoBatchPurchaseResponse,
} from "@carres/shared";
import { soBatchAction } from "@carres/shared";

const navigate = vi.fn();
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return { ...actual, useNavigate: () => navigate };
});
vi.mock("../components/GlobalTopBar", () => ({ TopBarIcons: () => null }));
/* The expansion's Unit IDs come through the Sales Order expansion endpoint —
   the same door the Sales Orders register asks. The suite answers it empty
   unless a test overrides. */
const apiFetch = vi.fn(async (..._a: unknown[]) => ({
  defaultDeliverTo: null,
  place: [],
  lines: [] as { lineId: string; sku: string; unitIds: string[]; deliverTo: unknown[] }[],
}));
vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return { ...actual, apiFetch: (...a: unknown[]) => apiFetch(...a) };
});

import SoBatchRegister from "./SoBatchRegister";

/**
 * SO BATCH PURCHASE — THE PERMANENT ORDER REGISTER
 * (CARD 02-B, owner ruling 2026-08-27; `docs/purchasing/MASTER.md` §9.1).
 *
 * One row per proceeded Sales Order, and the row never leaves when a purchase
 * order is issued. These tests hold the approved shape: the exact ten business
 * columns in the exact order, blank · `Partial` · `Ordered` and nothing else,
 * PO attribution drawn only from what the server's lineage sent, the parent
 * checkbox standing for ALL eligible child demand, and the expansion drawn by
 * the ONE shared child table.
 */

const KLANG = "11111111-1111-4111-8111-111111111111";
const BULOH = "22222222-2222-4222-8222-222222222222";

function leaf(over: Partial<PurchaseDemandRow> = {}): PurchaseDemandRow {
  const base: PurchaseDemandRow = {
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
  return {
    ...base,
    action:
      over.action !== undefined
        ? over.action
        : soBatchAction({
            state: base.state,
            item: base.item,
            supplier: base.supplier,
            category: base.category,
            ownerId: null,
            ownerName: base.ownerName,
            orderId: base.orderId,
            so: base.so,
            dueDate: base.goodsMustArrive,
          }),
  };
}

function orderRow(over: Partial<SoBatchOrderRow> & { orderId: string }): SoBatchOrderRow {
  return {
    so: null,
    customer: null,
    status: "blank",
    proceedDate: null,
    requestedDeliveryDate: null,
    deliveryCity: null,
    deliveryState: null,
    pos: [],
    lines: [],
    outstandingSuppliers: [],
    ...over,
  };
}

/* o1 — outstanding, one eligible leaf, the full order facts. */
const LEAF_O1 = leaf();
const ORDER_O1 = orderRow({
  orderId: "o1",
  so: 1318,
  customer: "Kimmy",
  proceedDate: "2026-08-20",
  requestedDeliveryDate: "2026-08-28",
  deliveryCity: "Petaling Jaya",
  deliveryState: "Selangor",
  lines: [
    { orderLineId: "l1", sku: "B1201S-K", qty: 2, stockTaken: 0,
      item: "Booqit", variant: "King", category: "mattress", pos: [] },
  ],
  outstandingSuppliers: ["Hooka"],
});

/* o3 — Partial: 2 of 3 on a sent PO, 1 still to buy. */
const LEAF_O3 = leaf({
  id: "build::o3::b3",
  lineIds: ["l3"],
  orderId: "o3",
  so: 1330,
  customer: "ANNE",
  qtyNeeded: 3,
  toBuy: 1,
  onPo: 2,
  poNumbers: ["PO-20260820-4827"],
});
const ORDER_O3 = orderRow({
  orderId: "o3",
  so: 1330,
  customer: "ANNE",
  status: "partial",
  requestedDeliveryDate: "2026-09-20",
  pos: [
    { poId: "PO-20260820-4827", status: "open", supplierId: "s-hooka",
      supplierName: "Hooka", destinationId: KLANG, etaDate: "2026-09-18",
      sentCurrentVersion: true },
  ],
  lines: [
    { orderLineId: "l3", sku: "B1201S-K", qty: 3, stockTaken: 0,
      item: "Booqit", variant: "King", category: "mattress",
      pos: [{ poId: "PO-20260820-4827", qty: 2 }] },
  ],
  outstandingSuppliers: ["Hooka"],
});

/* o5 — Ordered across TWO documents: 2 POs, 2 suppliers, 2 destinations,
   2 different official dates. The parent cell may only summarise. */
const ORDER_O5 = orderRow({
  orderId: "o5",
  so: 1400,
  customer: "DONE ONE",
  status: "ordered",
  pos: [
    { poId: "PO-20260820-1111", status: "received", supplierId: "s-hooka",
      supplierName: "Hooka", destinationId: KLANG, etaDate: "2026-09-10",
      sentCurrentVersion: true },
    { poId: "PO-20260821-2222", status: "open", supplierId: "s-ohana",
      supplierName: "Ohana", destinationId: BULOH, etaDate: "2026-09-12",
      sentCurrentVersion: true },
  ],
  lines: [
    { orderLineId: "l51", sku: "H1401S-K", qty: 1, stockTaken: 0,
      item: "Haven", variant: "King", category: "mattress",
      pos: [{ poId: "PO-20260820-1111", qty: 1 }] },
    { orderLineId: "l52", sku: "S9-2A", qty: 1, stockTaken: 0,
      item: "Booqit Sofa", variant: null, category: "sofa",
      pos: [{ poId: "PO-20260821-2222", qty: 1 }] },
  ],
});

/* o6 — fully Ready-Stock covered: visible, blank, unselectable. */
const ORDER_O6 = orderRow({
  orderId: "o6",
  so: 1410,
  customer: "STOCKED ONE",
  status: "blank",
  lines: [
    { orderLineId: "l61", sku: "B1201S-Q", qty: 2, stockTaken: 2,
      item: "Booqit", variant: "Queen", category: "mattress", pos: [] },
  ],
});

/* o7 — a numbered but UNSENT purchase order: PO No shows, Status blank. */
const ORDER_O7 = orderRow({
  orderId: "o7",
  so: 1355,
  customer: "UNSENT ONE",
  status: "blank",
  pos: [
    { poId: "PO-20260822-3333", status: "open", supplierId: "s-hooka",
      supplierName: "Hooka", destinationId: KLANG, etaDate: null,
      sentCurrentVersion: false },
  ],
  lines: [
    { orderLineId: "l71", sku: "B1201S-K", qty: 1, stockTaken: 0,
      item: "Booqit", variant: "King", category: "mattress",
      pos: [{ poId: "PO-20260822-3333", qty: 1 }] },
  ],
});

/* o8 — TWO eligible leafs: the parent switch and the indeterminate state. */
const LEAF_O8A = leaf({
  id: "build::o8::a", lineIds: ["l81"], orderId: "o8", so: 1360,
  customer: "TWO LINES", skus: ["B1201S-K"], toBuy: 1, qtyNeeded: 1,
  parts: [{ sku: "B1201S-K", qty: 1, unitCost: 100 }],
});
const LEAF_O8B = leaf({
  id: "build::o8::b", lineIds: ["l82"], orderId: "o8", so: 1360,
  customer: "TWO LINES", item: "Haven", skus: ["H1401S-K"], toBuy: 1, qtyNeeded: 1,
  supplier: "Ohana", supplierId: "s-ohana",
  parts: [{ sku: "H1401S-K", qty: 1, unitCost: 100 }],
});
const ORDER_O8 = orderRow({
  orderId: "o8",
  so: 1360,
  customer: "TWO LINES",
  lines: [
    { orderLineId: "l81", sku: "B1201S-K", qty: 1, stockTaken: 0,
      item: "Booqit", variant: "King", category: "mattress", pos: [] },
    { orderLineId: "l82", sku: "H1401S-K", qty: 1, stockTaken: 0,
      item: "Haven", variant: "King", category: "mattress", pos: [] },
  ],
  outstandingSuppliers: ["Hooka", "Ohana"],
});

/* o4 — the one Purchasing-owned setup blocker (`SETUP TO FIX`). */
const LEAF_O4 = leaf({
  id: "line::l77", lineIds: ["l77"], orderId: "o4", so: 1340,
  customer: "Tan", state: "no_production_days", supplier: "Ohana",
  supplierId: "s-ohana", goodsMustArrive: null, issueRef: null,
  toBuy: null, readyStock: null, onPo: null,
});
const ORDER_O4 = orderRow({
  orderId: "o4",
  so: 1340,
  customer: "Tan",
  lines: [
    { orderLineId: "l77", sku: "B1201S-K", qty: 2, stockTaken: 0,
      item: "Booqit", variant: "King", category: "mattress", pos: [] },
  ],
  outstandingSuppliers: ["Ohana"],
});

function data(over: Partial<SoBatchPurchaseResponse> = {}): SoBatchPurchaseResponse {
  return {
    today: "2026-08-22",
    rows: [LEAF_O1, LEAF_O3, LEAF_O8A, LEAF_O8B, LEAF_O4],
    registerRows: [ORDER_O5, ORDER_O6, ORDER_O8, ORDER_O7, ORDER_O4, ORDER_O3, ORDER_O1],
    destinations: [
      { id: KLANG, name: "Carres Klang", isDefault: true, active: true },
      { id: BULOH, name: "AL Sungai Buloh", isDefault: false, active: true },
    ],
    defaultDestinationId: KLANG,
    currentPoDuty: { userId: "u1", name: "Yee Jean" },
    actingPoDuty: null,
    mayIssue: true,
    procurementPartners: [],
    safetyDays: 14,
    ...over,
  };
}

const onIssue = vi.fn();

function renderRegister(over: Partial<SoBatchPurchaseResponse> = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={["/operation?tab=purchase"]}>
        <SoBatchRegister data={data(over)} isLoading={false} onIssue={onIssue} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  navigate.mockClear();
  onIssue.mockClear();
  apiFetch.mockClear();
  localStorage.clear();
});

const HERE = dirname(fileURLToPath(import.meta.url));
const source = () => readFileSync(join(HERE, "SoBatchRegister.tsx"), "utf8");

describe("the approved ten columns, in the approved order", () => {
  const APPROVED = [
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
  ];

  it("draws exactly the ten business columns, `Delivery Location` immediately after `Customer`", () => {
    const { container } = renderRegister();
    const heads = [...container.querySelectorAll("thead th")]
      .map((el) => el.textContent ?? "")
      .filter((t) => t.trim() !== "");
    expect(heads).toHaveLength(APPROVED.length);
    APPROVED.forEach((label, i) => expect(heads[i], label).toContain(label));
    expect(heads[5]).toContain("Delivery Location");
    expect(heads[4]).toContain("Customer");
  });

  it("the retired columns are gone from the Register", () => {
    const { container } = renderRegister();
    const text = [...container.querySelectorAll("thead th")].map((el) => el.textContent).join("|");
    for (const gone of [
      "Source SO",
      "Required For",
      "SKU / configuration",
      "Required",
      "Stock",
      "Open PO",
      "Buy",
      "Goods Must Arrive",
      "Work",
      "Action",
    ]) {
      expect(text, gone).not.toContain(gone);
    }
  });

  it("`goodsMustArrive` and the structured action stay INTERNAL — on the wire, never a column", () => {
    // The leaf rows still carry both facts (the rail and Work Engine read
    // them); the Register simply does not draw them.
    expect(LEAF_O1.goodsMustArrive).toBe("2026-08-19");
    expect(LEAF_O1.action).not.toBeNull();
    const { container } = renderRegister();
    expect(container.textContent).not.toContain("Goods Must Arrive");
  });

  it("the saved layout key is BUMPED so a stale leaf-grain layout cannot override the order", () => {
    expect(source()).toContain('"carres.soBatchPurchase.register.v2"');
    expect(source()).not.toContain("register.v1");
  });

  it("`SO No` is the explicit sticky identity", () => {
    expect(source()).toContain('stickyIdentity={{ columnKey: "soNo" }}');
  });
});

describe("one permanent row per proceeded Sales Order", () => {
  it("draws one parent row per order — including Ordered and fully stock-covered ones", () => {
    renderRegister();
    for (const id of ["o1", "o3", "o4", "o5", "o6", "o7", "o8"]) {
      expect(screen.getByTestId(`so-batch-row-${id}`)).toBeInTheDocument();
    }
  });

  it("Status prints blank · Partial · Ordered, and nothing else", () => {
    renderRegister();
    expect(screen.getByTestId("so-batch-status-o1").textContent).toBe("");
    expect(screen.getByTestId("so-batch-status-o3").textContent).toBe("Partial");
    expect(screen.getByTestId("so-batch-status-o5").textContent).toBe("Ordered");
    expect(screen.getByTestId("so-batch-status-o6").textContent).toBe("");
    const page = screen.getByTestId("so-batch-page").textContent ?? "";
    for (const banned of ["No buying needed", "Cannot buy", "Not sent", "Posted"]) {
      expect(page, banned).not.toContain(banned);
    }
  });

  it("a numbered but unsent PO shows under PO No while Status stays blank", () => {
    renderRegister();
    expect(screen.getByTestId("so-batch-status-o7").textContent).toBe("");
    expect(screen.getByTestId("so-batch-po-link-o7")).toHaveTextContent("PO-20260822-3333");
  });

  it("SO No and a single PO No are direct links to their objects", () => {
    renderRegister();
    fireEvent.click(screen.getByTestId("so-batch-so-link-o1"));
    expect(navigate).toHaveBeenCalledWith("/operation/orders/so/o1");
    fireEvent.click(screen.getByTestId("so-batch-po-link-o3"));
    expect(navigate).toHaveBeenCalledWith("/operation/procurement?po=PO-20260820-4827");
  });

  it("the order columns print the order's own facts — Proceed Date, request, locality", () => {
    renderRegister();
    expect(screen.getByTestId("so-batch-proceed-o1").textContent).toContain("20 Aug");
    expect(screen.getByTestId("so-batch-requested-o1").textContent).toContain("28 Aug");
    expect(screen.getByTestId("so-batch-location-o1").textContent).toBe(
      "Petaling Jaya, Selangor",
    );
    expect(screen.getByTestId("so-batch-customer-o1").textContent).toBe("Kimmy");
    /* A locality nobody recorded says the governed absence, quietly. */
    expect(screen.getByTestId("so-batch-location-o5").textContent).toBe("Not given");
  });

  it("many POs, suppliers, destinations and dates summarise deterministically", () => {
    renderRegister();
    expect(screen.getByTestId("so-batch-po-many-o5").textContent).toBe("2 POs");
    expect(screen.getByTestId("so-batch-supplier-o5").textContent).toBe("2 suppliers");
    expect(screen.getByTestId("so-batch-deliver-to-o5").textContent).toBe("Multiple");
    expect(screen.getByTestId("so-batch-po-date-o5").textContent).toBe("Multiple");
    /* One document prints its own facts, not a count. */
    expect(screen.getByTestId("so-batch-supplier-o3").textContent).toBe("Hooka");
    expect(screen.getByTestId("so-batch-po-date-o3").textContent).toContain("18 Sep");
    expect(screen.getByTestId("so-batch-deliver-to-o7").textContent).toBe("Carres Klang");
    /* A PO without a date prints the grid's own absence. */
    expect(screen.getByTestId("so-batch-po-date-o7").textContent).toBe("");
  });
});

describe("selection — the parent checkbox is ALL eligible child demand", () => {
  it("ticking the parent selects the order's eligible demand and offers the issue", () => {
    renderRegister();
    fireEvent.click(screen.getByTestId("so-batch-select-o1"));
    expect(screen.getByTestId("so-batch-selection-bar")).toHaveTextContent(
      "1 selected · 2 units · Issue 1 PO",
    );
    fireEvent.click(screen.getByTestId("so-batch-issue"));
    expect(onIssue).toHaveBeenCalledWith([
      { demandId: "build::o1::b1", allocations: [{ destinationId: KLANG, qty: 2 }] },
    ]);
  });

  it("an Ordered order and a fully stock-covered order refuse the tick", () => {
    renderRegister();
    expect(screen.getByTestId("so-batch-select-o5")).toBeDisabled();
    expect(screen.getByTestId("so-batch-select-o6")).toBeDisabled();
  });

  it("a Partial order selects only its uncovered eligible remainder", () => {
    renderRegister();
    fireEvent.click(screen.getByTestId("so-batch-select-o3"));
    /* The leaf's own remainder — 1 unit, never the 2 already on the PO. */
    expect(screen.getByTestId("so-batch-selection-bar")).toHaveTextContent(
      "1 selected · 1 unit · Issue 1 PO",
    );
  });

  it("part of the eligible children selected renders the parent indeterminate", async () => {
    renderRegister();
    /* Open the expansion and tick ONE of the two child lines. */
    fireEvent.click(screen.getByTestId("so-batch-expand-o8"));
    const box = await screen.findByTestId("so-batch-inspector-o8");
    const first = within(box).getAllByRole("checkbox")[0]!;
    fireEvent.click(first);
    const parent = screen.getByTestId("so-batch-select-o8") as HTMLInputElement;
    expect(parent.checked).toBe(false);
    expect(parent.indeterminate).toBe(true);
    /* The other child completes the set. */
    const second = within(box).getAllByRole("checkbox")[1]!;
    fireEvent.click(second);
    expect((screen.getByTestId("so-batch-select-o8") as HTMLInputElement).checked).toBe(true);
  });

  it("the header checkbox selects only VISIBLE eligible demand — a filter cannot smuggle rows in", () => {
    renderRegister();
    /* Narrow to the setup facet: only o4 is visible, and it is not eligible. */
    fireEvent.click(screen.getByTestId("so-batch-state-no_production_days"));
    expect(screen.queryByTestId("so-batch-row-o1")).not.toBeInTheDocument();
    const header = screen.getAllByRole("checkbox")[0]!;
    fireEvent.click(header);
    expect(screen.queryByTestId("so-batch-selection-bar")).not.toBeInTheDocument();
  });
});

describe("the rail — Card 02-A wording, Card 02-B counting", () => {
  it("the default no-filter view shows ALL proceeded records, Ordered included", () => {
    renderRegister();
    expect(screen.getByTestId("so-batch-row-o5")).toBeInTheDocument();
    expect(screen.getByTestId("so-batch-row-o6")).toBeInTheDocument();
  });

  it("`All not ordered` is a REAL outstanding-only filter, and it excludes Ordered records", () => {
    renderRegister();
    const all = screen.getByTestId("so-batch-all-not-ordered");
    /* The count is UNIQUE Sales Orders with outstanding eligible demand:
       o1 · o3 · o8 · o4 — never the Ordered o5, never the covered o6. */
    expect(all.textContent).toContain("4");
    fireEvent.click(all);
    expect(screen.queryByTestId("so-batch-row-o5")).not.toBeInTheDocument();
    expect(screen.queryByTestId("so-batch-row-o6")).not.toBeInTheDocument();
    expect(screen.getByTestId("so-batch-row-o1")).toBeInTheDocument();
    /* And it toggles back to the whole Register. */
    fireEvent.click(all);
    expect(screen.getByTestId("so-batch-row-o5")).toBeInTheDocument();
  });

  it("timing facets count unique Sales Orders and filter the parent rows", () => {
    renderRegister();
    /* o1 · o3 · o8 are `can_order_early` — three ORDERS, not four leafs. */
    expect(screen.getByTestId("so-batch-state-can_order_early").textContent).toContain("3");
    fireEvent.click(screen.getByTestId("so-batch-state-can_order_early"));
    expect(screen.getByTestId("so-batch-row-o1")).toBeInTheDocument();
    expect(screen.queryByTestId("so-batch-row-o5")).not.toBeInTheDocument();
    expect(screen.queryByTestId("so-batch-row-o7")).not.toBeInTheDocument();
  });

  it("`All not ordered` and a timing facet combine with AND — never a widening OR (Card 02-C)", () => {
    renderRegister();
    fireEvent.click(screen.getByTestId("so-batch-all-not-ordered"));
    /* Alone, the outstanding filter still shows the setup-blocked o4. */
    expect(screen.getByTestId("so-batch-row-o4")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("so-batch-state-can_order_early"));
    /* Both on: only rows satisfying BOTH — outstanding AND in the band. An OR
       would have quietly widened the timing facet back to all outstanding. */
    expect(screen.getByTestId("so-batch-row-o1")).toBeInTheDocument();
    expect(screen.getByTestId("so-batch-row-o3")).toBeInTheDocument();
    expect(screen.getByTestId("so-batch-row-o8")).toBeInTheDocument();
    expect(screen.queryByTestId("so-batch-row-o4")).not.toBeInTheDocument();
    expect(screen.queryByTestId("so-batch-row-o5")).not.toBeInTheDocument();
    expect(screen.queryByTestId("so-batch-row-o7")).not.toBeInTheDocument();
  });

  it("the footer counts Sales Orders by status", () => {
    renderRegister();
    expect(screen.getByTestId("so-batch-footer").textContent).toBe(
      "7 Sales Orders · 1 Partial · 1 Ordered",
    );
  });
});

describe("the expansion — the ONE shared child table", () => {
  it("uses GoodsMiniTable, with coverage, supplier and PO Delivery Date columns", async () => {
    renderRegister();
    fireEvent.click(screen.getByTestId("so-batch-expand-o5"));
    const box = await screen.findByTestId("so-batch-inspector-o5");
    expect(within(box).getByTestId("goods-mini-table")).toBeInTheDocument();
    /* The exact item-to-PO/supplier/destination/date mapping. */
    const first = within(box).getByTestId("so-batch-part-H1401S-K");
    expect(first).toHaveTextContent("PO-20260820-1111");
    expect(first).toHaveTextContent("Hooka");
    expect(first).toHaveTextContent("Carres Klang");
    expect(first).toHaveTextContent("10 Sep");
    const second = within(box).getByTestId("so-batch-part-S9-2A");
    expect(second).toHaveTextContent("PO-20260821-2222");
    expect(second).toHaveTextContent("Ohana");
    expect(second).toHaveTextContent("AL Sungai Buloh");
  });

  it("Ready Stock coverage is explained in the expansion, never as a parent Status", async () => {
    renderRegister();
    fireEvent.click(screen.getByTestId("so-batch-expand-o6"));
    const box = await screen.findByTestId("so-batch-inspector-o6");
    expect(within(box).getByTestId("so-batch-part-B1201S-Q")).toHaveTextContent("Ready Stock");
    expect(screen.getByTestId("so-batch-status-o6").textContent).toBe("");
  });

  it("an eligible line carries the existing destination editor — Split included", async () => {
    renderRegister();
    fireEvent.click(screen.getByTestId("so-batch-expand-o1"));
    const box = await screen.findByTestId("so-batch-inspector-o1");
    expect(
      within(box).getByTestId("so-batch-deliver-to-select-build::o1::b1"),
    ).toBeInTheDocument();
    expect(within(box).getByTestId("so-batch-split-build::o1::b1")).toBeInTheDocument();
  });

  it("asks the Sales Order expansion door for Unit IDs — the same read the sibling register uses", async () => {
    apiFetch.mockResolvedValueOnce({
      defaultDeliverTo: null,
      place: [],
      lines: [{ lineId: "l61", sku: "B1201S-Q", unitIds: ["U1-000-777"], deliverTo: [] }],
    });
    renderRegister();
    fireEvent.click(screen.getByTestId("so-batch-expand-o6"));
    const box = await screen.findByTestId("so-batch-inspector-o6");
    expect(await within(box).findByText("U1-000-777")).toBeInTheDocument();
    expect(String(apiFetch.mock.calls[0]![0])).toBe("/api/operation/orders/o6/expansion");
  });

  it("no second hand-drawn mini-table — the box is the shared component", () => {
    const src = source();
    expect(src).toContain('from "../components/GoodsMiniTable"');
    expect(src).not.toContain("<table");
  });
});

describe("the arrangement on the parent row", () => {
  it("one eligible line renders the existing editor in the parent cell", () => {
    renderRegister();
    const cell = screen.getByTestId("so-batch-deliver-to-o1");
    expect(
      within(cell).getByTestId("so-batch-deliver-to-select-build::o1::b1"),
    ).toBeInTheDocument();
  });

  it("several eligible lines share one whole-order select; changing it arranges every line", () => {
    renderRegister();
    const select = screen.getByTestId("so-batch-deliver-to-select-o8");
    fireEvent.change(select, { target: { value: BULOH } });
    /* Arranging TICKS — both leafs are now selected for Sungai Buloh. */
    expect(screen.getByTestId("so-batch-selection-bar")).toHaveTextContent(
      "2 selected · 2 units",
    );
    fireEvent.click(screen.getByTestId("so-batch-issue"));
    expect(onIssue).toHaveBeenCalledWith([
      { demandId: "build::o8::a", allocations: [{ destinationId: BULOH, qty: 1 }] },
      { demandId: "build::o8::b", allocations: [{ destinationId: BULOH, qty: 1 }] },
    ]);
  });

  it("a split arrangement becomes two documents in the selection bar — the leaf contract is unchanged", async () => {
    renderRegister();
    fireEvent.click(screen.getByTestId("so-batch-expand-o1"));
    const box = await screen.findByTestId("so-batch-inspector-o1");
    fireEvent.click(within(box).getByTestId("so-batch-split-build::o1::b1"));
    fireEvent.change(within(box).getByTestId(`so-batch-split-qty-build::o1::b1-${KLANG}`), {
      target: { value: "1" },
    });
    fireEvent.change(within(box).getByTestId(`so-batch-split-qty-build::o1::b1-${BULOH}`), {
      target: { value: "1" },
    });
    fireEvent.click(within(box).getByTestId("so-batch-split-apply-build::o1::b1"));
    expect(screen.getByTestId("so-batch-selection-bar")).toHaveTextContent(
      "1 selected · 2 units · Issue 2 POs",
    );
  });
});

describe("what this page refuses to be", () => {
  it("says the governed empty sentence when there are no proceeded Sales Orders", () => {
    renderRegister({ rows: [], registerRows: [] });
    expect(screen.getByText("No proceeded Sales Orders.")).toBeInTheDocument();
  });

  it("names whoever may act today instead of a silent grey button", () => {
    renderRegister({ mayIssue: false });
    fireEvent.click(screen.getByTestId("so-batch-select-o1"));
    expect(screen.getByTestId("so-batch-duty-chip")).toHaveTextContent(
      "Yee Jean holds PO duty",
    );
    expect(screen.queryByTestId("so-batch-issue")).not.toBeInTheDocument();
  });
});

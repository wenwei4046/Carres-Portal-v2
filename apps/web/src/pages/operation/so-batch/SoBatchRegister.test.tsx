import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type {
  PurchaseDemandRow,
  SoBatchOrderRow,
  SoBatchPurchaseResponse,
} from "@carres/shared";
import { soBatchAction } from "@carres/shared";
import type { SalesOrderExpansionResponse } from "@/lib/queries";

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
  lines: [] as { lineId: string; sku: string; unitIds: string[]; deliverTo: Array<{ name: string; qty: number }> }[],
} as SalesOrderExpansionResponse));
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

/* o1 — outstanding, one eligible leaf, the full order facts. */
const LEAF_O1 = leaf();
const ORDER_O1 = orderRow({
  orderId: "o1",
  so: 1318,
  customer: "Kimmy",
  proceededAt: "2026-08-20T08:15:00+08:00",
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
  deliveryCity: "Johor Bahru",
  deliveryState: "Johor",
  status: "partial",
  requestedDeliveryDate: "2026-09-20",
  pos: [
    { poId: "PO-20260820-4827", status: "open", supplierId: "s-hooka",
      supplierName: "Hooka", destinationId: KLANG, officialDeliveryDate: "2026-09-18",
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
      supplierName: "Hooka", destinationId: KLANG, officialDeliveryDate: "2026-09-10",
      sentCurrentVersion: true },
    { poId: "PO-20260821-2222", status: "open", supplierId: "s-ohana",
      supplierName: "Ohana", destinationId: BULOH, officialDeliveryDate: "2026-09-12",
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
  deliveryCity: "Kuala Lumpur",
  deliveryState: "Kuala Lumpur",
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
      supplierName: "Hooka", destinationId: KLANG, officialDeliveryDate: null,
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
    currentPoDuty: { userId: "u-duty", name: "Yu Jun" },
    actingPoDuty: null,
    poDutyNameUnavailable: false,
    poDutyUnavailable: false,
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

/**
 * ⭐ THE READING ORDER — owner correction 2026-09-11.
 *
 * `Status` is retired as a presentation: blank · `Partial` · `Ordered` was a
 * generic word for an arithmetic the row already showed in `PO No` and the
 * expansion, and an operator could not act on any of the three. The
 * ELIGIBILITY it was derived from is untouched — it still decides which rows
 * can be ticked — it simply stopped being a column.
 *
 * What remains is ordered the way the work is read: which order, whose, when
 * it arrived, when the customer wants it, where it goes, who supplies it,
 * where the goods land, and finally the documents.
 */
describe("the approved columns, in the approved reading order", () => {
  const APPROVED = [
    "SO No",
    "Customer",
    "Proceed Date",
    "Requested Delivery Date",
    "Delivery Location",
    "Supplier",
    "Deliver To",
    "PO No",
    "PO Delivery Date",
  ];

  it("draws exactly the nine business columns, identity first and documents last", () => {
    const { container } = renderRegister();
    const heads = [...container.querySelectorAll("thead th")]
      .map((el) => el.textContent ?? "")
      .filter((t) => t.trim() !== "");
    expect(heads).toHaveLength(APPROVED.length);
    APPROVED.forEach((label, i) => expect(heads[i], label).toContain(label));
  });

  it("has no Status column, and no Status cell on any row", () => {
    const { container } = renderRegister();
    const text = [...container.querySelectorAll("thead th")].map((el) => el.textContent).join("|");
    expect(text).not.toContain("Status");
    expect(screen.queryByTestId("so-batch-status-o1")).toBeNull();
    /* The FACT survives: eligibility still refuses the tick on an Ordered row. */
    expect(screen.getByTestId("so-batch-select-o5")).toBeDisabled();
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
    expect(source()).toContain('"carres.soBatchPurchase.register.v3"');
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

  it("states no generic Status anywhere — the documents and the tick carry it", () => {
    renderRegister();
    const page = screen.getByTestId("so-batch-page").textContent ?? "";
    for (const banned of [
      "Partial",
      "Ordered",
      "No buying needed",
      "Cannot buy",
      "Not sent",
      "Posted",
    ]) {
      expect(page, banned).not.toContain(banned);
    }
  });

  it("a numbered but unsent PO still shows under PO No", () => {
    renderRegister();
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
    expect(screen.getByTestId("so-batch-location-o5").textContent).toBe("Not recorded");
  });

  it("names an absent historical handoff instead of printing a blank cell", () => {
    renderRegister({ registerRows: [orderRow({ orderId: "no-handoff", so: 1200 })] });
    expect(screen.getByTestId("so-batch-proceed-no-handoff")).toHaveTextContent(
      "Not recorded",
    );
  });

  /**
   * ⭐ A SUMMARY SAYS ONE THING — owner correction 2026-09-11.
   *
   * These cells used to measure their own text against their own width and
   * print `AL Sungai Buloh +1 more`, so the visible text, the exported text
   * and the accessible name were three different answers, and a narrower
   * window silently changed what the screen said. One value prints itself;
   * several say how many there are and send the reader to the expansion.
   */
  it("many POs, suppliers, destinations and dates summarise deterministically", () => {
    renderRegister();
    const many = screen.getByTestId("so-batch-po-many-o5");
    expect(many).toHaveTextContent("2 POs");
    expect(many).not.toHaveTextContent("more");
    fireEvent.click(many);
    expect(screen.getByTestId("so-batch-expand-o5")).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByTestId("so-batch-supplier-o5").textContent).toBe("2 suppliers");
    expect(screen.getByTestId("so-batch-deliver-to-o5").textContent).toBe("Multiple");
    expect(screen.getByTestId("so-batch-po-date-o5").textContent).toBe("Multiple");
    /* One document prints its own facts, not a count. */
    expect(screen.getByTestId("so-batch-supplier-o3").textContent).toBe("Hooka");
    expect(screen.getByTestId("so-batch-po-date-o3").textContent).toContain("18 Sep");
    expect(screen.getByTestId("so-batch-deliver-to-o7").textContent).toBe("Carres Klang");
    /* A PO whose ORIGINAL date is not on file says so (owner correction
       2026-09-09). It read "" until then, which is what a row with NO purchase
       order prints — one cell, two different answers. */
    expect(screen.getByTestId("so-batch-po-date-o7").textContent).toBe("Not recorded");
  });
});

describe("a missing DEFAULT destination does not stop the buying", () => {
  /* YH, 2026-09-02: "is making it tickable, that is all i ask for".
     A tick is an allocation, so it needs a destination id - but it used to
     demand the DEFAULT one specifically, and nothing in the schema requires a
     default row to exist (`purchasing_destinations_one_default` is a partial
     index: at most one, never at least one). So a perfectly healthy list with
     nobody's `is_default` set killed every checkbox on the page, while the
     Deliver To dropdown and Split's Apply carried on ticking lines without
     ever reading the default. Three controls, one fact, two answers. */

  it("ticks a row when destinations exist but none is the default", () => {
    renderRegister({ defaultDestinationId: null });

    fireEvent.click(screen.getByTestId("so-batch-select-o1"));

    /* The selection actually happened - the bar is the page's own proof. */
    const bar = screen.getByTestId("selection-bar");
    expect(within(bar).getByText("1 selected · 2 units · Issue 1 PO")).toBeVisible();
  });

  it("opens on the first ACTIVE destination and says which, without blocking", () => {
    renderRegister({ defaultDestinationId: null });

    /* Not the blocker sentence - buying works. */
    expect(screen.queryByTestId("so-batch-no-destination")).not.toBeInTheDocument();
    const note = screen.getByTestId("so-batch-no-default-destination");
    expect(note).toHaveTextContent("ticks open on Carres Klang");
  });

  it("an EMPTY list still blocks, and still names the setting", () => {
    /* The real blocker survives: with nowhere for the goods to go there is
       nothing to allocate a tick to, and that is not a warning, it is a stop. */
    renderRegister({ destinations: [], defaultDestinationId: null });

    expect(screen.getByTestId("so-batch-no-destination")).toHaveTextContent(
      "Purchasing → Settings",
    );
    fireEvent.click(screen.getByTestId("so-batch-select-o1"));
    expect(screen.queryByTestId("selection-bar")).not.toBeInTheDocument();
  });

  it("skips an INACTIVE destination when picking the opening one", () => {
    renderRegister({
      destinations: [
        { id: KLANG, name: "Carres Klang", isDefault: false, active: false },
        { id: BULOH, name: "AL Sungai Buloh", isDefault: false, active: true },
      ],
      defaultDestinationId: null,
    });

    expect(screen.getByTestId("so-batch-no-default-destination")).toHaveTextContent(
      "ticks open on AL Sungai Buloh",
    );
    fireEvent.click(screen.getByTestId("so-batch-select-o1"));
    expect(screen.getByTestId("selection-bar")).toBeVisible();
  });
});

describe("selection — the parent checkbox is ALL eligible child demand", () => {
  it("offers the governed Operations Superuser the duty owner chip and Issue PO action", () => {
    renderRegister({
      currentPoDuty: { userId: "u-duty", name: "Yu Jun" },
      actingPoDuty: null,
      mayIssue: true,
    });

    expect(screen.queryByTestId("so-batch-po-duty")).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId("so-batch-select-o1"));

    const bar = screen.getByTestId("selection-bar");
    expect(within(bar).getByText("1 selected · 2 units · Issue 1 PO")).toBeVisible();
    expect(within(bar).getByTestId("so-batch-duty-chip")).toHaveTextContent("YJ");
    expect(within(bar).getByTestId("so-batch-duty-chip")).toHaveAttribute(
      "title",
      "Yu Jun · PO Duty",
    );
    expect(within(bar).getByTestId("so-batch-issue")).toBeEnabled();
    expect(bar).not.toHaveTextContent("Yu Jun holds PO duty");
    expect(within(bar).getAllByRole("button").map((button) => button.textContent)).toEqual([
      "Clear",
      "Issue PO",
      "Export Excel (1)",
    ]);
    expect(screen.queryByTestId("so-batch-selection-bar")).not.toBeInTheDocument();
  });

  it("shows the dated cover as the selected action owner without pretending they hold the month", () => {
    renderRegister({
      currentPoDuty: { userId: "u-duty", name: "Yu Jun" },
      actingPoDuty: { userId: "u-cover", name: "Shasha" },
      mayIssue: true,
    });

    fireEvent.click(screen.getByTestId("so-batch-select-o1"));
    const chip = screen.getByTestId("so-batch-duty-chip");
    expect(chip).toHaveTextContent("SH");
    expect(chip).toHaveAttribute("title", "Shasha · PO Duty cover for Yu Jun");
    expect(screen.getByTestId("so-batch-issue")).toBeEnabled();
  });

  it("ticking the parent selects the order's eligible demand and offers the issue", () => {
    renderRegister();
    fireEvent.click(screen.getByTestId("so-batch-select-o1"));
    expect(screen.getByTestId("selection-bar")).toHaveTextContent(
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

  it("an unselectable Catalog-cost row says why on the affected order", async () => {
    const blocked = leaf({
      id: "build::cost::b1",
      state: "no_cost",
      lineIds: ["cost-line"],
      orderId: "cost-order",
      so: 1500,
      item: "B1201S",
      issueRef: null,
      parts: [{ sku: "B1201S-K", qty: 1, unitCost: null }],
      action: soBatchAction({
        state: "no_cost",
        item: "B1201S",
        supplier: "Nice Future",
        category: "mattress",
        ownerId: null,
        ownerName: null,
        orderId: "cost-order",
        so: 1500,
        dueDate: "2026-08-19",
      }),
    });
    const order = orderRow({
      orderId: "cost-order",
      so: 1500,
      lines: [
        { orderLineId: "cost-line", sku: "B1201S-K", qty: 1, stockTaken: 0,
          item: "B1201S", variant: "King", category: "mattress", pos: [] },
      ],
      outstandingSuppliers: ["Nice Future"],
    });
    renderRegister({ rows: [blocked], registerRows: [order] });

    expect(screen.getByTestId("so-batch-select-cost-order")).toBeDisabled();
    fireEvent.click(screen.getByTestId("so-batch-expand-cost-order"));
    const box = await screen.findByTestId("so-batch-inspector-cost-order");
    expect(within(box).getByText("Catalog cost is missing")).toBeInTheDocument();
    expect(within(box).getByText("Set the cost of B1201S in Catalog")).toBeInTheDocument();
  });

  it("a Partial order selects only its uncovered eligible remainder", () => {
    renderRegister();
    fireEvent.click(screen.getByTestId("so-batch-select-o3"));
    /* The leaf's own remainder — 1 unit, never the 2 already on the PO. */
    expect(screen.getByTestId("selection-bar")).toHaveTextContent(
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
    expect(within(screen.getByTestId("selection-bar")).getByTestId("so-batch-issue")).toBeEnabled();
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
    expect(screen.queryByTestId("selection-bar")).not.toBeInTheDocument();
  });
});

describe("the rail — Card 02-A wording, Card 02-B counting", () => {
  it("the default no-filter view shows ALL proceeded records, Ordered included", () => {
    renderRegister();
    expect(screen.getByTestId("so-batch-row-o5")).toBeInTheDocument();
    expect(screen.getByTestId("so-batch-row-o6")).toBeInTheDocument();
  });

  /* ⛔ `TO ORDER / All not ordered` IS GONE — owner correction 2026-09-11. It
     was the one rail row that named the page's own DEFAULT rather than a fact
     about a Sales Order, and it sat above the section that answers what to buy
     today. Pinned here so it cannot quietly return under another spelling. */
  it("offers no `All not ordered` row, and no TO ORDER section, anywhere on the rail", () => {
    renderRegister();
    expect(screen.queryByTestId("so-batch-all-not-ordered")).not.toBeInTheDocument();
    const rail = screen.getByTestId("so-batch-rail").textContent ?? "";
    expect(rail).not.toMatch(/TO ORDER/);
    expect(rail).not.toMatch(/not ordered/i);
    /* And the whole permanent Register is what the cleared rail shows. */
    expect(screen.getByTestId("so-batch-row-o5")).toBeInTheDocument();
    expect(screen.getByTestId("so-batch-row-o6")).toBeInTheDocument();
  });

  it.each([
    "no_sku",
    "no_supplier",
    "no_cost",
    "no_production_days",
    "no_customer_date",
    "no_pickup_partner",
  ] as const)("a %s row SAYS why it cannot be ticked", (state) => {
    /* Every untickable row must answer "why not?" on the page itself. The
       amber panel is that answer, and until now nothing pinned it. */
    const blocked = leaf({
      id: `build::ob::${state}`,
      orderId: "ob",
      so: 1500,
      customer: "BLOCKED ONE",
      lineIds: ["lb1"],
      skus: ["B1201S-K"],
      state,
    });
    const order = orderRow({
      orderId: "ob",
      so: 1500,
      customer: "BLOCKED ONE",
      status: "blank",
      lines: [
        { orderLineId: "lb1", sku: "B1201S-K", qty: 1, stockTaken: 0,
          item: "Booqit", variant: "King", category: "mattress", pos: [] },
      ],
    });
    renderRegister({ rows: [blocked], registerRows: [order] });
    fireEvent.click(screen.getByTestId("so-batch-expand-ob"));

    const panel = screen.getByTestId(`so-batch-blocker-build::ob::${state}`);
    expect(panel.textContent).toBeTruthy();
    expect(screen.getByTestId("so-batch-select-ob")).toBeDisabled();
  });

  it("an Ordered record refuses the tick even when a leaf still looks buyable", () => {
    /* THE PINNING TEST THIS REPLACES WAS VACUOUS (YH, 2026-09-03 — "an
       ordered's checkbox still tickable"). `ORDER_O5` is Ordered and carries
       NO leaf, so nothing about it could ever have drawn a checkbox and the
       suite proved nothing.

       The two numbers are computed from different facts and are allowed to
       disagree: Status counts this order's OWN `po_line_sources` lineage,
       `toBuy` drains a per-SKU pool with no customer attribution. So a fully
       Ordered record CAN carry a leaf whose `toBuy` is positive — and the
       checkbox appeared beside the `Ordered` pill. Ticking it raises a second
       purchase order for units this order already sent for. */
    const stillBuyable = leaf({
      id: "build::o5::b5",
      orderId: "o5",
      so: 1400,
      customer: "DONE ONE",
      lineIds: ["l51"],
      skus: ["H1401S-K"],
      item: "Haven",
      toBuy: 1,
      qtyNeeded: 1,
    });
    renderRegister({ rows: [stillBuyable], registerRows: [ORDER_O5] });

    /* Visible and DISABLED, never absent — Card 02-B keeps the record on the
       page; what this closes is the ability to act on it. */
    expect(screen.getByTestId("so-batch-row-o5")).toBeInTheDocument();
    expect(screen.getByTestId("so-batch-select-o5")).toBeDisabled();
  });

  it("an Ordered record shows no amber `Issue PO` sentence — it is not blocked", () => {
    /* Failing the tick because buying is FINISHED is not a blocker. Printing
       "Issue PO to Hooka" in an amber panel on an order whose purchase orders
       are already sent would be an instruction to duplicate work. */
    const stillBuyable = leaf({
      id: "build::o5::b5",
      orderId: "o5",
      so: 1400,
      customer: "DONE ONE",
      lineIds: ["l51"],
      skus: ["H1401S-K"],
      item: "Haven",
      toBuy: 1,
      qtyNeeded: 1,
    });
    renderRegister({ rows: [stillBuyable], registerRows: [ORDER_O5] });
    fireEvent.click(screen.getByTestId("so-batch-expand-o5"));

    expect(screen.queryByTestId("so-batch-blocker-build::o5::b5")).not.toBeInTheDocument();
  });

  it("a blank record with the SAME leaf shape KEEPS its tick — the gate fails open", () => {
    /* `ordered` needs lineage, and lineage exists only from 0382 with no
       backfill. An order whose purchase orders predate it reads `blank` and
       must stay tickable, or this gate would hide the very demand SO-1297
       was filed about. */
    const uncovered = orderRow({
      orderId: "o9",
      so: 1297,
      customer: "Kimi",
      status: "blank",
      lines: [
        { orderLineId: "l91", sku: "H1401S-K", qty: 1, stockTaken: 0,
          item: "Haven", variant: "King", category: "mattress", pos: [] },
      ],
      outstandingSuppliers: ["Hooka"],
    });
    const buyable = leaf({
      id: "build::o9::b9",
      orderId: "o9",
      so: 1297,
      customer: "Kimi",
      lineIds: ["l91"],
      skus: ["H1401S-K"],
      item: "Haven",
      toBuy: 1,
      qtyNeeded: 1,
    });
    renderRegister({ rows: [buyable], registerRows: [uncovered] });

    expect(screen.getByTestId("so-batch-select-o9")).toBeInTheDocument();
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

  it("a timing facet and a product facet combine with AND — never a widening OR (Card 02-C)", () => {
    renderRegister();
    fireEvent.click(screen.getByTestId("so-batch-state-can_order_early"));
    expect(screen.getByTestId("so-batch-row-o1")).toBeInTheDocument();
    expect(screen.queryByTestId("so-batch-row-o4")).not.toBeInTheDocument();
    fireEvent.change(screen.getByTestId("so-batch-product-select"), {
      target: { value: "mattress" },
    });
    /* Both on: only rows satisfying BOTH. An OR would have quietly widened the
       timing facet back to every mattress. */
    expect(screen.getByTestId("so-batch-row-o1")).toBeInTheDocument();
    expect(screen.queryByTestId("so-batch-row-o5")).not.toBeInTheDocument();
    expect(screen.queryByTestId("so-batch-row-o7")).not.toBeInTheDocument();
  });

  /* The footer answers SCOPE, not status: what this view holds out of what the
     Register has. The old `1 Partial · 1 Ordered` came from the retired Status
     presentation and, inside a filtered view, read as a claim about the whole
     business. */
  it("the footer states the current result against the Register's own total", () => {
    renderRegister();
    expect(screen.getByTestId("so-batch-footer").textContent).toBe("7 Sales Orders");
    fireEvent.click(screen.getByTestId("so-batch-state-can_order_early"));
    const line = screen.getByTestId("so-batch-footer").textContent ?? "";
    expect(line).toMatch(/^\d+ of 7 Sales Orders$/);
    expect(line).not.toContain("Partial");
  });
});

describe("the rail — purchasing fact sections, navigation not selection", () => {
  const rail = () => screen.getByTestId("so-batch-rail");
  /** PRODUCT and SUPPLIER are compact dropdowns (owner ruling 2026-09-11);
   *  `""` is the section's `All …` option — the clear. */
  const pick = (testId: string, value: string) =>
    fireEvent.change(screen.getByTestId(testId), { target: { value } });
  /** The count moved into the option text (`Ohana · 4`); it did not vanish. */
  const optionText = (testId: string, value: string): string => {
    const select = screen.getByTestId(testId) as HTMLSelectElement;
    const option = [...select.options].find((o) => o.value === value);
    if (!option) throw new Error(`no option "${value}" in ${testId}`);
    return option.textContent ?? "";
  };

  it("hides completely, reopens from the Register toolbar, and remembers the choice", () => {
    const first = renderRegister();
    fireEvent.click(screen.getByRole("button", { name: "Hide filters" }));
    expect(screen.queryByTestId("so-batch-rail")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Show filters" })).toBeInTheDocument();
    expect(localStorage.getItem("carres.soBatchPurchase.filters.open")).toBe("0");

    first.unmount();
    renderRegister();
    expect(screen.queryByTestId("so-batch-rail")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Show filters" }));
    expect(screen.getByTestId("so-batch-rail")).toBeInTheDocument();
    expect(localStorage.getItem("carres.soBatchPurchase.filters.open")).toBe("1");
  });

  /* ⭐ ON A NARROW WINDOW THE RAIL FLOATS OVER THE REGISTER instead of taking
     240 of its 459 pixels — the shared purchasing responsive pattern, already
     shipped on Purchase Orders. The class is asserted rather than the computed
     layout because jsdom applies no media query; the rendered behaviour was
     walked at 459px. */
  it("leaves the flow below md so it cannot consume the table", () => {
    renderRegister();
    expect(rail().className).toContain("max-md:absolute");
    /* Its positioning context is the row it sits in, not the page. */
    expect(rail().parentElement?.className).toContain("relative");
  });

  it("renders REGION immediately after SUPPLIER", () => {
    renderRegister();
    const text = rail().textContent ?? "";
    const order = ["ORDER TIMING", "PRODUCT", "SUPPLIER", "REGION", "SETUP TO FIX"];
    const positions = order.map((h) => text.indexOf(h));
    expect(positions.every((p) => p >= 0)).toBe(true);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
    for (const word of [
      "Can order early",
      "14 safety days left",
      "1–13 safety days left",
      "No safety days left",
      "Not enough production days",
      "All products",
      "Mattress",
      "Bedframe",
      "Sofa",
      "All suppliers",
      "All regions",
      "Klang Valley",
      "Johor",
      "Others",
      "Production days not set",
    ]) {
      expect(text, word).toContain(word);
    }
    expect(text).not.toContain("WORK TO DO");
    expect(text).not.toContain("Ask customer for a delivery date");
    /* The retired wording never returns. */
    expect(text).not.toContain("Not enough production time");
    expect(text).not.toContain("Production time not set");
  });

  it("does not expose central Work actions as local rail filters", () => {
    renderRegister();
    expect(screen.queryByTestId("so-batch-work-issue_po")).not.toBeInTheDocument();
    expect(screen.queryByTestId("so-batch-work-ask_customer_date")).not.toBeInTheDocument();
  });

  it("all five timing rows stay visible, and an empty band prints 0, not silence", () => {
    renderRegister();
    /* No fixture sits in these bands — the row still shows, with its 0. */
    expect(screen.getByTestId("so-batch-state-safety_days_full").textContent).toContain("0");
    expect(screen.getByTestId("so-batch-state-safety_days_none").textContent).toContain("0");
    expect(
      screen.getByTestId("so-batch-state-not_enough_production_time"),
    ).toBeInTheDocument();
  });

  it("no rail row carries a checkbox; the Register's own selection checkboxes survive", () => {
    renderRegister();
    expect(within(rail()).queryAllByRole("checkbox")).toHaveLength(0);
    /* Every rail row is a NavRow button with a pressed state, not a tick. */
    for (const b of within(rail()).getAllByRole("button").filter((el) => el.dataset.testid)) {
      expect(b).toHaveAttribute("aria-pressed");
    }
    expect(screen.getByTestId("so-batch-select-o1")).toBeInTheDocument();
  });

  it("the rail is the 240px readable shell, and labels wrap instead of truncating", () => {
    renderRegister();
    expect(rail().className).toContain("w-[240px]");
    const long = screen.getByTestId("so-batch-state-not_enough_production_time");
    const label = long.querySelector("span.break-words");
    expect(label).not.toBeNull();
    expect(label!.textContent).toBe("Not enough production days");
    expect(label!.className).not.toContain("truncate");
  });

  it("product filters by the CATALOG category and counts unique Sales Orders", () => {
    renderRegister();
    /* o5 is the one order with a sofa line — one ORDER, though it also has a
       mattress line. The counts moved into the option text when the section
       became a dropdown (owner ruling 2026-09-11); they did not disappear. */
    expect(optionText("so-batch-product-select", "sofa")).toContain("1");
    expect(optionText("so-batch-product-select", "mattress")).toContain("7");
    expect(optionText("so-batch-product-select", "bedframe")).toContain("0");
    pick("so-batch-product-select", "sofa");
    expect(screen.getAllByTestId("so-batch-row-o5")).toHaveLength(1);
    expect(screen.queryByTestId("so-batch-row-o1")).not.toBeInTheDocument();
  });

  it("a multi-category order counts under EVERY matching category and appears once", () => {
    renderRegister();
    pick("so-batch-product-select", "mattress");
    expect(screen.getAllByTestId("so-batch-row-o5")).toHaveLength(1);
    pick("so-batch-product-select", "sofa");
    expect(screen.getAllByTestId("so-batch-row-o5")).toHaveLength(1);
  });

  it("`All products` clears the product dimension and is the value at rest", () => {
    renderRegister();
    const select = () => screen.getByTestId("so-batch-product-select") as HTMLSelectElement;
    expect(select().value).toBe("");
    /* At rest the control is quiet; narrowed, it wears the rail's own active
       treatment — a narrowed section must not read as an unset one. */
    expect(select().className).not.toContain("bg-kit-blue-3");
    pick("so-batch-product-select", "mattress");
    expect(select().className).toContain("bg-kit-blue-3");
    pick("so-batch-product-select", "");
    expect(select().value).toBe("");
    expect(screen.getByTestId("so-batch-row-o5")).toBeInTheDocument();
  });

  it("suppliers are dynamic, alphabetical, and the Register's own projection", () => {
    renderRegister();
    const select = screen.getByTestId("so-batch-supplier-select") as HTMLSelectElement;
    /* Hooka before Ohana — and nobody else, because the fixtures name nobody
       else. Ohana enters through outstanding demand (o4, o8) AND lineage
       (o5); one projection, one option. */
    const values = [...select.options].map((o) => o.value);
    expect(values).toEqual(["", "Hooka", "Ohana"]);
    expect([...select.options][0]!.textContent).toBe("All suppliers");
  });

  it("the supplier filter narrows by the same facts the Supplier column prints", () => {
    renderRegister();
    pick("so-batch-supplier-select", "Ohana");
    /* Ohana touches o4 + o8 (outstanding) and o5 (PO lineage). */
    expect(screen.getByTestId("so-batch-row-o4")).toBeInTheDocument();
    expect(screen.getByTestId("so-batch-row-o5")).toBeInTheDocument();
    expect(screen.getByTestId("so-batch-row-o8")).toBeInTheDocument();
    expect(screen.queryByTestId("so-batch-row-o1")).not.toBeInTheDocument();
    pick("so-batch-supplier-select", "");
    expect(screen.getByTestId("so-batch-row-o1")).toBeInTheDocument();
  });

  /* REGION is the third FACT list on this rail (owner correction 2026-09-11),
     so it wears the same compact dropdown as PRODUCT and SUPPLIER — same
     single-slot value, same counts in the option text, same `All …` clear. */
  it("the region filter uses Delivery State and All regions clears it", () => {
    renderRegister();
    const select = screen.getByTestId("so-batch-region-select") as HTMLSelectElement;
    const options = [...select.options].map((o) => o.textContent ?? "");
    expect(options.find((o) => o.startsWith("Klang Valley"))).toContain("2");
    expect(options.find((o) => o.startsWith("Johor"))).toContain("1");
    pick("so-batch-region-select", "Johor");
    expect(screen.getByTestId("so-batch-row-o3")).toBeInTheDocument();
    expect(screen.queryByTestId("so-batch-row-o1")).not.toBeInTheDocument();
    pick("so-batch-region-select", "");
    expect(screen.getByTestId("so-batch-row-o1")).toBeInTheDocument();
  });

  it("filters combine across sections — Mattress + Hooka", () => {
    renderRegister();
    pick("so-batch-product-select", "mattress");
    pick("so-batch-supplier-select", "Hooka");
    /* The Register is PERMANENT, so a facet narrows it and never hides an
       already-bought record: o5 and o7 both carry a Hooka mattress document. */
    for (const on of ["o1", "o3", "o5", "o7", "o8"]) {
      expect(screen.getByTestId(`so-batch-row-${on}`)).toBeInTheDocument();
    }
    for (const off of ["o4", "o6"]) {
      expect(screen.queryByTestId(`so-batch-row-${off}`)).not.toBeInTheDocument();
    }
  });

  it("counts cross-update against the other selected sections", () => {
    renderRegister();
    pick("so-batch-product-select", "sofa");
    /* Under `Sofa`, nothing can order early — the numbers say so instead of
       keeping yesterday's totals. */
    expect(screen.getByTestId("so-batch-state-can_order_early").textContent).toContain("0");
    /* A supplier with no sofa drops off; the sofa's own suppliers stay. */
    const values = [
      ...(screen.getByTestId("so-batch-supplier-select") as HTMLSelectElement).options,
    ].map((o) => o.value);
    expect(values).toContain("Ohana");
    expect(values).toContain("Hooka"); // o5 lineage
  });

  it("the SELECTED supplier stays visible with 0 when another filter empties it", () => {
    renderRegister();
    pick("so-batch-supplier-select", "Hooka");
    fireEvent.click(screen.getByTestId("so-batch-state-no_production_days"));
    /* The only setup order is Ohana's — Hooka matches nothing now, but the
       operator must still SEE the narrowing to clear it. */
    const select = screen.getByTestId("so-batch-supplier-select") as HTMLSelectElement;
    expect(select.value).toBe("Hooka");
    expect(optionText("so-batch-supplier-select", "Hooka")).toContain("0");
  });

  it("one timing filter at a time — a new pick replaces, a second click clears", () => {
    renderRegister();
    const early = screen.getByTestId("so-batch-state-can_order_early");
    fireEvent.click(early);
    expect(early).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByTestId("so-batch-state-safety_days_low"));
    expect(early).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(screen.getByTestId("so-batch-state-safety_days_low"));
    /* Cleared — the complete permanent Register returns. */
    for (const on of ["o1", "o3", "o4", "o5", "o6", "o7", "o8"]) {
      expect(screen.getByTestId(`so-batch-row-${on}`)).toBeInTheDocument();
    }
  });

  it("SETUP TO FIX leaves the rail — and drops its filter — when the last affected SO goes", () => {
    const { rerender } = renderRegister();
    fireEvent.click(screen.getByTestId("so-batch-state-no_production_days"));
    expect(screen.getByTestId("so-batch-row-o4")).toBeInTheDocument();
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    rerender(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={["/operation?tab=purchase"]}>
          <SoBatchRegister
            data={data({ rows: [LEAF_O1, LEAF_O3, LEAF_O8A, LEAF_O8B] })}
            isLoading={false}
            onIssue={onIssue}
          />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    expect(screen.queryByTestId("so-batch-state-no_production_days")).not.toBeInTheDocument();
    /* The dead filter must not survive invisibly: every record shows. */
    for (const on of ["o1", "o3", "o4", "o5", "o6", "o7", "o8"]) {
      expect(screen.getByTestId(`so-batch-row-${on}`)).toBeInTheDocument();
    }
  });
});

describe("the expansion — the ONE shared child table", () => {
  it("draws THREE connected sections, and the line ends in a curve at the last", async () => {
    renderRegister();
    fireEvent.click(screen.getByTestId("so-batch-expand-o5"));
    const box = await screen.findByTestId("so-batch-inspector-o5");
    expect(within(box).getByTestId("goods-mini-table")).toBeInTheDocument();
    const expansionCell = box.closest("td")!;
    const parentRow = expansionCell.parentElement!.previousElementSibling!;
    expect(expansionCell.colSpan).toBe(parentRow.children.length - 2);
    expect(expansionCell.parentElement!.children).toHaveLength(3);
    expect(expansionCell.previousElementSibling).toHaveAttribute("data-testid", "grid-expansion-gutter-__expand__");
    expect(expansionCell).toHaveStyle({ padding: "0px" });

    /* Demand · shelf · record, in that order — Ready Stock sits between the
       compact demand it can answer and the record, which grows without limit. */
    const sections = within(box)
      .getAllByTestId(/^connected-section-/)
      .map((s) => s.getAttribute("data-testid"));
    expect(sections).toEqual([
      "connected-section-goods",
      "connected-section-ready-stock",
      "connected-section-po-details",
    ]);

    /* ⭐ EVERY SECTION TAKES THE LINE IN ON ITS OWN ELBOW, and the LAST one
       draws no trunk — so there is structurally nothing that could run on into
       the next Sales Order. */
    for (const key of ["goods", "ready-stock", "po-details"]) {
      expect(within(box).getByTestId(`section-elbow-${key}`)).toBeInTheDocument();
    }
    expect(within(box).getByTestId("section-trunk-goods")).toBeInTheDocument();
    expect(within(box).getByTestId("section-trunk-ready-stock")).toBeInTheDocument();
    expect(within(box).queryByTestId("section-trunk-po-details")).toBeNull();
  });

  it("puts the exact item-to-PO/supplier/destination/date mapping in the details, not the item row", async () => {
    renderRegister();
    fireEvent.click(screen.getByTestId("so-batch-expand-o5"));
    const box = await screen.findByTestId("so-batch-inspector-o5");

    /* ⛔ THE ITEM ROW CARRIES NO PO REFERENCE AT ALL. It states HOW MANY units
       documents carry; a collection of them never decides its height. */
    const goods = within(box).getByTestId("goods-mini-table");
    expect(goods).not.toHaveTextContent("PO-20260820-1111");
    expect(goods).not.toHaveTextContent("PO-20260821-2222");
    expect(within(goods).getByTestId("goods-on-po-l51")).toHaveTextContent("1");

    /* And the record says everything, once, under its own heading. */
    const details = within(box).getByTestId("po-details-table");
    const first = within(details).getByTestId("po-detail-l51::PO-20260820-1111::rest");
    expect(first).toHaveTextContent("PO-20260820-1111");
    expect(first).toHaveTextContent("Hooka");
    expect(first).toHaveTextContent("Carres Klang");
    expect(first).toHaveTextContent("10 Sep");
    const second = within(details).getByTestId("po-detail-l52::PO-20260821-2222::rest");
    expect(second).toHaveTextContent("PO-20260821-2222");
    expect(second).toHaveTextContent("Ohana");
    expect(second).toHaveTextContent("AL Sungai Buloh");
    /* ⛔ A RECORD CARRIES NO CONTROL. Not a tick, not a destination editor. */
    expect(within(details).queryByRole("checkbox")).toBeNull();
    expect(within(details).queryByRole("combobox")).toBeNull();
  });

  it("a full PO number is never shortened, and stays readable in the record", async () => {
    renderRegister();
    fireEvent.click(screen.getByTestId("so-batch-expand-o5"));
    const box = await screen.findByTestId("so-batch-inspector-o5");
    const details = within(box).getByTestId("po-details-table");
    /* `PO-20260820-1111`, never `PO-260820-1111`: no numbering change is
       approved, and a shortened number names a document that does not exist. */
    expect(
      within(details).getByRole("button", { name: "PO-20260820-1111" }),
    ).toBeInTheDocument();
    /* `PO-260820-1111` is the six-digit short form a "tidier" column invents. */
    expect(details.textContent).not.toMatch(/PO-\d{6}-/);
  });

  it("an order with no purchase order has no details section at all", async () => {
    renderRegister();
    fireEvent.click(screen.getByTestId("so-batch-expand-o1"));
    const box = await screen.findByTestId("so-batch-inspector-o1");
    expect(within(box).queryByTestId("po-details-table")).toBeNull();
    expect(within(box).queryByTestId("connected-section-po-details")).toBeNull();
    /* Two sections, so the LINE still ends in a curve at Ready Stock. */
    expect(within(box).queryByTestId("section-trunk-ready-stock")).toBeNull();
    expect(within(box).getByTestId("goods-mini-table")).toHaveTextContent("Not ordered yet");
  });

  it("Ready Stock coverage is explained in the expansion, never as a parent Status", async () => {
    renderRegister();
    fireEvent.click(screen.getByTestId("so-batch-expand-o6"));
    const box = await screen.findByTestId("so-batch-inspector-o6");
    /* ⭐ THE ARITHMETIC IS EXPLICIT — `Covered by` folded three answers into
       one word. This line is fully answered off the shelf: the customer
       ordered 2, Ready Stock answered 2, no document carries any of it and
       nothing is left to buy — so the row cannot be ticked, and it says why
       without a generic Status word anywhere on the page.

       ⛔ AND THERE IS NO `Unit ID` COLUMN ON THE ACTIONABLE TABLE. It described
       a document's goods, so on every unbought line it printed an absence in
       the width of a real answer. */
    const line = within(box).getByTestId("so-batch-part-B1201S-Q");
    const cells = [...line.querySelectorAll("td")].map((c) => c.textContent);
    expect(cells).toEqual([
      "—", "B1201S-Q", "BooqitQueen", "2", "2", "—", "—", "—", "—", "Mattress",
    ]);
    expect(within(line).queryByRole("checkbox")).toBeNull();
    expect(screen.queryByTestId("so-batch-status-o6")).toBeNull();
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
      lines: [{ lineId: "l51", sku: "H1401S-K", unitIds: ["U1-000-777"], deliverTo: [] as Array<{ name: string; qty: number }> }],
      unitCoverage: { "U1-000-777": "PO-20260820-1111" },
      unitLines: { "U1-000-777": "l51" },
    } as SalesOrderExpansionResponse);
    renderRegister();
    fireEvent.click(screen.getByTestId("so-batch-expand-o5"));
    const box = await screen.findByTestId("so-batch-inspector-o5");
    const unit = await within(box).findByText("U1-000-777");
    /* ⭐ `PO No` AND `Unit ID` ARE NEIGHBOURS — the two identifiers a person
       copies. A reader who has to look across four columns to pair a document
       with its goods pairs them wrongly. */
    const row = unit.closest("tr")!;
    const cells = [...row.querySelectorAll("td")];
    expect(cells[0]).toHaveTextContent("PO-20260820-1111");
    expect(cells[1]).toHaveTextContent("U1-000-777");
    expect(row).toHaveAttribute("data-row", "record");
    expect(within(row).queryByRole("checkbox")).toBeNull();
    expect(within(row).queryByRole("combobox")).toBeNull();
    /* The exact document, never the line's other one. */
    expect(row).not.toHaveTextContent("PO-20260821-2222");
    expect(String(apiFetch.mock.calls[0]![0])).toBe("/api/operation/orders/o5/expansion");
  });

  /**
   * ⭐ AN INFERRED ASSOCIATION IS NOT EVIDENCE — 2026-09-11.
   *
   * The expansion door used to group every reserved Unit of an order by
   * normalized SKU, so two item lines of one SKU printed the SAME Unit IDs.
   * `ops_stock_items.reserved_order_line_id` is the stored binding; a Unit
   * that carries none is still SHOWN — evidence is never dropped to tidy a
   * screen — and it says that its item line was never recorded.
   */
  it("says so when a Unit's item line was never recorded, instead of implying one", async () => {
    apiFetch.mockResolvedValueOnce({
      defaultDeliverTo: null,
      place: [],
      lines: [{ lineId: "l51", sku: "H1401S-K", unitIds: ["U1-000-777"], deliverTo: [] as Array<{ name: string; qty: number }> }],
      unitCoverage: { "U1-000-777": "PO-20260820-1111" },
      unitLines: { "U1-000-777": null },
    } as SalesOrderExpansionResponse);
    renderRegister();
    fireEvent.click(screen.getByTestId("so-batch-expand-o5"));
    const box = await screen.findByTestId("so-batch-inspector-o5");
    const row = (await within(box).findByText("U1-000-777")).closest("tr")!;
    expect(row).toHaveTextContent("Item line not recorded");
  });

  /**
   * ⭐ TWO ROWS OPEN AT ONCE — the case the per-section drawing exists for.
   *
   * Nothing measures a group's height, so each Sales Order's line is drawn
   * entirely by its OWN sections. Two rows open together therefore carry two
   * independent lines, and neither can reach the other — which is the one thing
   * a connector on a register must never do.
   */
  it("draws an independent connector per expanded row, and neither reaches the other", async () => {
    renderRegister();
    fireEvent.click(screen.getByTestId("so-batch-expand-o5"));
    fireEvent.click(screen.getByTestId("so-batch-expand-o1"));
    const five = await screen.findByTestId("so-batch-inspector-o5");
    const one = await screen.findByTestId("so-batch-inspector-o1");

    /* o5 has documents, so it holds three sections and its line ends at the
       record; o1 has none, so it holds two and its line ends at Ready Stock. */
    expect(within(five).getAllByTestId(/^connected-section-/)).toHaveLength(3);
    expect(within(one).getAllByTestId(/^connected-section-/)).toHaveLength(2);

    /* THE LAST SECTION OF EACH DRAWS NO TRUNK. There is no line to leak. */
    expect(within(five).queryByTestId("section-trunk-po-details")).toBeNull();
    expect(within(one).queryByTestId("section-trunk-ready-stock")).toBeNull();

    /* And each row's elbows belong to that row, not to the register. */
    expect(within(five).getAllByTestId(/^section-elbow-/)).toHaveLength(3);
    expect(within(one).getAllByTestId(/^section-elbow-/)).toHaveLength(2);
  });

  it("no second hand-drawn mini-table — the box is the shared component", () => {
    const src = source();
    expect(src).toContain('from "../components/GoodsMiniTable"');
    expect(src).not.toContain("<table");
  });

  it("does not call pending Unit IDs unallocated", async () => {
    apiFetch.mockImplementationOnce(() => new Promise(() => {}));
    renderRegister();
    fireEvent.click(screen.getByTestId("so-batch-expand-o7"));
    const box = await screen.findByTestId("so-batch-inspector-o7");
    /* UNKNOWN is not `None`: the document carries a unit, and whether a Unit
       answers it has not been ANSWERED yet. Saying `Not allocated` here is how
       a reader concludes goods do not exist because a request was slow. */
    expect(within(box).getByText("Loading…")).toBeInTheDocument();
    expect(within(box).queryByText("Not allocated")).not.toBeInTheDocument();
  });

  it("offers retry when Unit IDs fail to load, and says the read failed meanwhile", async () => {
    apiFetch.mockRejectedValueOnce(new Error("Unavailable"));
    renderRegister();
    fireEvent.click(screen.getByTestId("so-batch-expand-o7"));
    const box = await screen.findByTestId("so-batch-inspector-o7");
    expect(await within(box).findByText("Could not be loaded")).toBeInTheDocument();
    const retry = await screen.findByRole("button", { name: "Unit IDs could not be loaded. Try again" });
    apiFetch.mockResolvedValueOnce({ defaultDeliverTo: null, place: [], lines: [
      { lineId: "l71", sku: "B1201S-K", unitIds: ["U1-000-070"], deliverTo: [] as Array<{ name: string; qty: number }> },
    ], unitCoverage: { "U1-000-070": "PO-20260822-3333" }, unitLines: { "U1-000-070": "l71" },
    } as SalesOrderExpansionResponse);
    fireEvent.click(retry);
    expect(await screen.findByText("U1-000-070")).toBeInTheDocument();
  });
});

/**
 * ⭐ THE PARENT ROW NEVER ARRANGES — owner correction 2026-09-11.
 *
 * `Deliver To` on the parent used to BE the control: one eligible demand drew
 * the full editor, several drew a `<select>` painted over with a summary. It
 * is a summary now, and the one place an unissued demand is arranged is its
 * own row in the expansion, beside `Split`.
 */
describe("the arrangement is the demand's, never the summary's", () => {
  it("the parent Deliver To cell holds no control at all", () => {
    renderRegister();
    for (const orderId of ["o1", "o8", "o3", "o5", "o7"]) {
      const cell = screen.getByTestId(`so-batch-deliver-to-${orderId}`);
      expect(within(cell).queryByRole("combobox"), orderId).toBeNull();
      expect(within(cell).queryByRole("button"), orderId).toBeNull();
    }
    expect(screen.queryByTestId("so-batch-deliver-to-select-o8")).toBeNull();
  });

  it("states the ISSUED document's destination, and never the plan as though it were one", () => {
    renderRegister();
    /* o7 carries one purchase order: its destination is a fact. */
    expect(screen.getByTestId("so-batch-deliver-to-o7").textContent).toBe("Carres Klang");
    /* o5 carries two documents to two places. */
    expect(screen.getByTestId("so-batch-deliver-to-o5").textContent).toBe("Multiple");
    /* o1 has demand and no document. The plan is not a destination, and the
       cell describes a document that does not exist — `PO No` says that once
       for the whole row rather than three cells repeating it. */
    expect(screen.getByTestId("so-batch-deliver-to-o1").textContent).toBe("");
    expect(screen.getByTestId("so-batch-po-o1")).toHaveTextContent("Not ordered yet");
  });

  it("arranges a governed line in the expansion, where Settings still wins", async () => {
    renderRegister({
      rows: [
        LEAF_O1,
        LEAF_O3,
        LEAF_O8A,
        {
          ...LEAF_O8B,
          supplierCollection: {
            procurementPartnerId: "p-eu",
            procurementPartnerName: "EU",
            fixedDestinationId: KLANG,
          },
        },
        LEAF_O4,
      ],
    });
    fireEvent.click(screen.getByTestId("so-batch-expand-o8"));
    const box = await screen.findByTestId("so-batch-inspector-o8");
    /* ONE editor per eligible demand — two demands here, so exactly two. */
    const editors = within(box).getAllByTestId(/^so-batch-deliver-to-select-build::o8/);
    expect(editors).toHaveLength(2);
    fireEvent.change(within(box).getByTestId("so-batch-deliver-to-select-build::o8::a"), {
      target: { value: BULOH },
    });
    fireEvent.change(within(box).getByTestId("so-batch-deliver-to-select-build::o8::b"), {
      target: { value: BULOH },
    });
    fireEvent.click(screen.getByTestId("so-batch-issue"));
    /* The governed line keeps the destination Settings pinned; its ungoverned
       neighbour moves. */
    expect(onIssue).toHaveBeenCalledWith([
      { demandId: "build::o8::a", allocations: [{ destinationId: BULOH, qty: 1 }] },
      { demandId: "build::o8::b", allocations: [{ destinationId: KLANG, qty: 1 }] },
    ]);
  });

  it("arranging a demand in the expansion ticks that demand, and only it", async () => {
    renderRegister();
    fireEvent.click(screen.getByTestId("so-batch-expand-o8"));
    const box = await screen.findByTestId("so-batch-inspector-o8");
    fireEvent.change(within(box).getByTestId("so-batch-deliver-to-select-build::o8::a"), {
      target: { value: BULOH },
    });
    expect(screen.getByTestId("selection-bar")).toHaveTextContent("1 selected · 1 unit");
    fireEvent.click(screen.getByTestId("so-batch-issue"));
    expect(onIssue).toHaveBeenCalledWith([
      { demandId: "build::o8::a", allocations: [{ destinationId: BULOH, qty: 1 }] },
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
    expect(screen.getByTestId("selection-bar")).toHaveTextContent(
      "1 selected · 2 units · Issue 2 POs",
    );
  });
});

describe("what this page refuses to be", () => {
  it("says the governed empty sentence when there are no proceeded Sales Orders", () => {
    renderRegister({ rows: [], registerRows: [] });
    expect(screen.getByText("No proceeded Sales Orders.")).toBeInTheDocument();
  });

  it("keeps an ordinary non-duty operator refused and shows only the owner chip", () => {
    renderRegister({ mayIssue: false });
    fireEvent.click(screen.getByTestId("so-batch-select-o1"));
    expect(screen.getByTestId("so-batch-duty-chip")).toHaveTextContent("YJ");
    expect(screen.getByTestId("so-batch-duty-chip")).toHaveAttribute(
      "title",
      "Yu Jun · PO Duty",
    );
    expect(screen.queryByTestId("so-batch-issue")).not.toBeInTheDocument();
  });

  it("does not add a permanent PO Duty block to the Register toolbar", () => {
    renderRegister({
      currentPoDuty: { userId: "real-op-1", name: "Yu Jun" },
      actingPoDuty: null,
    });
    expect(screen.queryByTestId("so-batch-po-duty")).not.toBeInTheDocument();
    expect(screen.queryByText(/holds PO duty|covering PO duty/)).not.toBeInTheDocument();
  });

  it("says the PO duty name is missing instead of saying nobody is on duty", () => {
    const unresolvedDuty = {
      /* The normal holder still has a name, but today's effective cover ID
         does not. The page must not send staff to the absent holder. */
      currentPoDuty: { userId: "normal-holder", name: "Normal Holder" },
      actingPoDuty: null,
      mayIssue: false,
      poDutyNameUnavailable: true,
    } as Partial<SoBatchPurchaseResponse> & { poDutyNameUnavailable: boolean };
    renderRegister(unresolvedDuty);

    fireEvent.click(screen.getByTestId("so-batch-select-o1"));
    expect(screen.getByTestId("so-batch-duty-chip")).toHaveTextContent(
      "PO duty name is missing.",
    );
    expect(screen.queryByText(/Normal Holder holds PO duty/)).not.toBeInTheDocument();
    expect(screen.queryByText("Nobody holds PO duty this month.")).not.toBeInTheDocument();
  });

  it("says duty could not be checked when the resolver is unavailable", () => {
    renderRegister({
      currentPoDuty: null,
      actingPoDuty: null,
      poDutyNameUnavailable: false,
      poDutyUnavailable: true,
      mayIssue: false,
    });

    fireEvent.click(screen.getByTestId("so-batch-select-o1"));
    expect(screen.getByTestId("so-batch-duty-chip")).toHaveTextContent(
      "PO duty could not be checked.",
    );
    expect(screen.queryByText("Nobody holds PO duty this month.")).not.toBeInTheDocument();
  });
});

/* PO Delivery Date reads the ORIGINAL (owner correction, 2026-09-09). */
describe("SO Batch Register — PO Delivery Date", () => {
  it("prints the original supplier-facing date, not the live planning date", () => {
    renderRegister();
    // o3 carries one PO whose original is on file.
    expect(screen.getByTestId("so-batch-po-date-o3")).toHaveTextContent("18 Sep");
  });

  it("an unknown original says so — it never looks like nothing was ordered", () => {
    renderRegister();
    // o7 HAS a purchase order; its original date is not on file (the 0428
    // recovery recorded it as unknown rather than back-filling a planning date).
    expect(screen.getByTestId("so-batch-po-date-o7")).toHaveTextContent("Not recorded");
    // o1 has no purchase order at all — a different answer. Its date cell is
    // blank because the document does not exist; the row says so under `PO No`.
    expect(screen.getByTestId("so-batch-po-date-o1")).toHaveTextContent("");
    expect(screen.getByTestId("so-batch-po-date-o1")).not.toHaveTextContent("Not recorded");
    expect(screen.getByTestId("so-batch-po-o1")).toHaveTextContent("Not ordered yet");
  });
});

/* ─── ONE DEMAND, ONE CONTROL ───────────────────────────────────────────── */

/**
 * ⭐ THE DEFECT THIS REPLACES, AND WHY IT MATTERED (owner report 2026-09-11).
 *
 * The child table expanded one item line into N Unit rows and carried the SAME
 * line key, selection state and `deliverToNode` into every one of them. So a
 * single ticked demand drew N ticked boxes, and the Deliver To / Split editor
 * appeared again beside each historical purchase order — controls offering to
 * re-arrange documents that were already sent. The toolbar said `1 selected`
 * while the screen showed four ticks, and the obvious "fix" — counting the
 * visible rows — would have turned a display bug into a double purchase.
 */
describe("a demand with several Unit records", () => {
  const withUnits = (lineId: string, unitIds: string[], coverage: Record<string, string>) => {
    apiFetch.mockResolvedValue({
      defaultDeliverTo: null,
      place: [],
      lines: [{ lineId, sku: "B1201S-K", unitIds, deliverTo: [] as Array<{ name: string; qty: number }> }],
      unitCoverage: coverage,
      unitLines: Object.fromEntries(unitIds.map((u) => [u, lineId])),
    } as unknown as SalesOrderExpansionResponse);
  };

  it("draws exactly ONE checkbox and ONE arrangement editor, however many Units it has", async () => {
    withUnits("l3", ["U1-000-101", "U1-000-102"], {
      "U1-000-101": "PO-20260820-4827",
      "U1-000-102": "PO-20260820-4827",
    });
    renderRegister();
    fireEvent.click(screen.getByTestId("so-batch-expand-o3"));
    const box = await screen.findByTestId("so-batch-inspector-o3");
    await within(box).findByText("U1-000-101");
    const table = within(box).getByTestId("goods-mini-table");
    expect(within(table).getAllByRole("checkbox")).toHaveLength(1);
    expect(within(table).getAllByTestId(/^so-batch-deliver-to-select-/)).toHaveLength(1);
    expect(within(table).getAllByTestId(/^so-batch-split-/)).toHaveLength(1);
    /* ⛔ AND NOT ONE UNIT ROW UPSTAIRS. The demand table holds exactly one row
       per item line, whatever the record below it holds. */
    expect(within(table).getAllByRole("row").filter((r) => r.getAttribute("data-row") === "demand"))
      .toHaveLength(1);
    expect(within(table).queryAllByRole("row").filter((r) => r.getAttribute("data-row") === "record"))
      .toHaveLength(0);
    /* Two records, each on its own row, in the read-only table, no control. */
    const details = within(box).getByTestId("po-details-table");
    expect(within(details).getAllByRole("row").filter((r) => r.getAttribute("data-row") === "record"))
      .toHaveLength(2);
    expect(within(details).queryByRole("checkbox")).toBeNull();
  });

  it("ticking the one demand never reports more than the demand", async () => {
    withUnits("l3", ["U1-000-101", "U1-000-102"], {});
    renderRegister();
    fireEvent.click(screen.getByTestId("so-batch-expand-o3"));
    const box = await screen.findByTestId("so-batch-inspector-o3");
    const table = within(box).getByTestId("goods-mini-table");
    fireEvent.click(within(table).getByRole("checkbox"));
    /* What the toolbar says and what the screen shows are the same number. */
    expect(screen.getByTestId("selection-bar")).toHaveTextContent("1 selected · 1 unit");
    expect(
      within(table).getAllByRole("checkbox").filter((c) => (c as HTMLInputElement).checked),
    ).toHaveLength(1);
  });

  it("a Unit record names its own document and never the line's other ones", async () => {
    withUnits("l3", ["U1-000-101"], { "U1-000-101": "PO-20260820-4827" });
    renderRegister();
    fireEvent.click(screen.getByTestId("so-batch-expand-o3"));
    const box = await screen.findByTestId("so-batch-inspector-o3");
    const first = (await within(box).findByText("U1-000-101")).closest("tr")!;
    expect(within(first).getByRole("button", { name: "PO-20260820-4827" })).toBeInTheDocument();
    expect(first).not.toHaveTextContent("PO-20260821-1190");
  });
});

/* ─── A MATCHED SET IS ONE DEMAND ───────────────────────────────────────── */

describe("a demand that covers several item lines", () => {
  /* A sofa set is made and delivered together, so it is ONE demand across
     several of the customer's item lines. It is arranged once and ticked once;
     its other lines are named on the demand row rather than offering a second
     control that moves the same number. */
  const SET_LEAF = leaf({
    id: "build::oset::s",
    orderId: "oset",
    so: 1500,
    lineIds: ["ls1", "ls2"],
    item: "Booqit Sofa",
    category: "sofa",
    skus: ["S9-2A", "S9-1A"],
    qtyNeeded: 2,
    toBuy: 2,
    parts: [
      { sku: "S9-2A", qty: 1, unitCost: 100 },
      { sku: "S9-1A", qty: 1, unitCost: 100 },
    ],
  });
  const SET_ORDER = orderRow({
    orderId: "oset",
    so: 1500,
    customer: "SET ONE",
    lines: [
      { orderLineId: "ls1", sku: "S9-2A", qty: 1, stockTaken: 0,
        item: "Booqit Sofa", variant: "2 seater", category: "sofa", pos: [] },
      { orderLineId: "ls2", sku: "S9-1A", qty: 1, stockTaken: 0,
        item: "Booqit Sofa", variant: "1 seater", category: "sofa", pos: [] },
    ],
  });

  it("carries one tick and one editor, and says what the tick covers", async () => {
    renderRegister({ rows: [SET_LEAF], registerRows: [SET_ORDER] });
    fireEvent.click(screen.getByTestId("so-batch-expand-oset"));
    const box = await screen.findByTestId("so-batch-inspector-oset");
    const table = within(box).getByTestId("goods-mini-table");
    expect(within(table).getAllByRole("checkbox")).toHaveLength(1);
    expect(within(table).getAllByTestId(/^so-batch-deliver-to-select-/)).toHaveLength(1);
    expect(table).toHaveTextContent("With 1 more lines in this set");
    /* Both of the customer's lines are still listed with their own goods. */
    expect(within(table).getByText("S9-2A")).toBeInTheDocument();
    expect(within(table).getByText("S9-1A")).toBeInTheDocument();
  });

  it("ticks the whole set once — the leaf contract is unchanged", async () => {
    renderRegister({ rows: [SET_LEAF], registerRows: [SET_ORDER] });
    fireEvent.click(screen.getByTestId("so-batch-expand-oset"));
    const box = await screen.findByTestId("so-batch-inspector-oset");
    fireEvent.click(within(within(box).getByTestId("goods-mini-table")).getByRole("checkbox"));
    expect(screen.getByTestId("selection-bar")).toHaveTextContent("1 selected · 2 units");
    fireEvent.click(screen.getByTestId("so-batch-issue"));
    expect(onIssue).toHaveBeenCalledWith([
      { demandId: "build::oset::s", allocations: [{ destinationId: KLANG, qty: 2 }] },
    ]);
  });
});

/* ─── SAME SKU, DIFFERENT CONFIGURATION ─────────────────────────────────── */

describe("two item lines of one model", () => {
  it("keeps each line's own configuration visible and separately ticked", async () => {
    const A = leaf({ id: "build::otwo::a", orderId: "otwo", so: 1501, lineIds: ["lt1"],
      item: "Jager", skus: ["1013Jager"], qtyNeeded: 1, toBuy: 1,
      parts: [{ sku: "1013Jager", qty: 1, unitCost: 100 }] });
    const B = leaf({ id: "build::otwo::b", orderId: "otwo", so: 1501, lineIds: ["lt2"],
      item: "Jager", skus: ["1013Jager"], qtyNeeded: 1, toBuy: 1,
      parts: [{ sku: "1013Jager", qty: 1, unitCost: 100 }] });
    const order = orderRow({
      orderId: "otwo",
      so: 1501,
      customer: "TWO CONFIGS",
      lines: [
        { orderLineId: "lt1", sku: "1013Jager", qty: 1, stockTaken: 0,
          item: "Jager", variant: "Queen · Fabric 3", category: "bedframe", pos: [] },
        { orderLineId: "lt2", sku: "1013Jager", qty: 1, stockTaken: 0,
          item: "Jager", variant: "King · Fabric 3", category: "bedframe", pos: [] },
      ],
    });
    renderRegister({ rows: [A, B], registerRows: [order] });
    fireEvent.click(screen.getByTestId("so-batch-expand-otwo"));
    const box = await screen.findByTestId("so-batch-inspector-otwo");
    const table = within(box).getByTestId("goods-mini-table");
    /* One SKU, two configurations, two demands — and the operator can tell
       which is which before ticking either. */
    expect(within(table).getAllByRole("checkbox")).toHaveLength(2);
    expect(table).toHaveTextContent("Queen · Fabric 3");
    expect(table).toHaveTextContent("King · Fabric 3");
  });
});

/* ─── THE DEMAND MOVES UNDER AN OPEN TICK ───────────────────────────────── */

/**
 * ⭐ A TICK IS AN ARRANGEMENT OF A NUMBER, SO IT DIES WITH THAT NUMBER.
 *
 * `To buy` is the server's remainder, and it moves while the page is open:
 * Ready Stock commits a Unit to one of the order's item lines, a colleague
 * issues a purchase order, a reservation is released. Ticking `To buy 3` and
 * then pressing `Issue PO` against a remainder of 1 sent an arrangement the
 * door refused (`allocation_mismatch`) — the law held and the operator got an
 * error instead of the recalculated quantity.
 */
describe("a tick whose To buy has changed", () => {
  function again(over: Partial<SoBatchPurchaseResponse>) {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return (
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={["/operation?tab=purchase"]}>
          <SoBatchRegister data={data(over)} isLoading={false} onIssue={onIssue} />
        </MemoryRouter>
      </QueryClientProvider>
    );
  }

  it("is dropped when the recomputed remainder is smaller", () => {
    const { rerender } = renderRegister();
    fireEvent.click(screen.getByTestId("so-batch-select-o1"));
    expect(screen.getByTestId("selection-bar")).toHaveTextContent("1 selected · 2 units");
    /* Two Units of the two were answered off the shelf. */
    rerender(
      again({
        rows: [
          leaf({ readyStock: 1, takenFromStock: 1, toBuy: 1 }),
          LEAF_O3,
          LEAF_O8A,
          LEAF_O8B,
          LEAF_O4,
        ],
      }),
    );
    expect(screen.queryByTestId("so-batch-issue")).not.toBeInTheDocument();
    expect(screen.getByTestId("so-batch-select-o1")).not.toBeChecked();
  });

  it("does not resurrect when the remainder comes back to the old number", () => {
    const { rerender } = renderRegister();
    fireEvent.click(screen.getByTestId("so-batch-select-o1"));
    rerender(again({ rows: [leaf({ toBuy: 1 }), LEAF_O3, LEAF_O8A, LEAF_O8B, LEAF_O4] }));
    rerender(again({ rows: [LEAF_O1, LEAF_O3, LEAF_O8A, LEAF_O8B, LEAF_O4] }));
    /* A decision nobody took twice may not come back on its own. */
    expect(screen.queryByTestId("so-batch-issue")).not.toBeInTheDocument();
  });

  it("leaves every OTHER tick of the same order exactly where it was", () => {
    const { rerender } = renderRegister();
    fireEvent.click(screen.getByTestId("so-batch-select-o8"));
    rerender(
      again({
        rows: [
          LEAF_O1,
          LEAF_O3,
          { ...LEAF_O8A, toBuy: 0, readyStock: 1, takenFromStock: 1 },
          LEAF_O8B,
          LEAF_O4,
        ],
      }),
    );
    fireEvent.click(screen.getByTestId("so-batch-issue"));
    expect(onIssue).toHaveBeenCalledWith([
      { demandId: "build::o8::b", allocations: [{ destinationId: KLANG, qty: 1 }] },
    ]);
  });
});

/* ─── READY STOCK'S CONSEQUENCE FOR THE PURCHASING TICK ─────────────────── */

describe("choosing a Ready Unit", () => {
  const READY = {
    orderId: "o1",
    so: 1318,
    reference: "SO-1318",
    lines: [
      {
        orderLineId: "l1",
        sku: "B1201S-K",
        item: "Booqit",
        qty: 2,
        reservedQty: 0,
        reservedUnitCodes: [],
        onPoQty: 0,
        remainingQty: 2,
      },
    ],
    units: [
      {
        itemId: "33333333-0000-0000-0000-00000000000a",
        unitCode: "U1-000-001",
        identityScope: "unit" as const,
        sku: "B1201S-K",
        condition: "new",
        siteName: "Carres Klang Warehouse",
        holderName: null,
        ownership: "carres_owned" as const,
        supplier: null,
        qty: 1,
        dateIn: "2026-08-01",
        matchingLineIds: ["l1"],
        blocked: null,
      },
    ],
  };

  /**
   * Two doors answer here: the section's read, and the one act. Everything
   * else keeps the suite's empty Sales Order expansion. The cast is the
   * suite's single `apiFetch` mock speaking three shapes, not a claim about
   * any of them — each is parsed by the component that asked for it.
   */
  function answerReadyStock() {
    apiFetch.mockImplementation(async (path: unknown) => {
      const p = String(path);
      if (p.endsWith("/ready-stock")) return READY as unknown as SalesOrderExpansionResponse;
      if (p.includes("ready-stock/reserve")) {
        return {
          reserved: 1,
          reference: "SO-1318",
          units: [{ itemId: "33333333-0000-0000-0000-00000000000a", orderLineId: "l1" }],
        } as unknown as SalesOrderExpansionResponse;
      }
      return { defaultDeliverTo: null, place: [], lines: [] } as SalesOrderExpansionResponse;
    });
  }

  /**
   * THE TICK GOES BEFORE THE NUMBERS ARRIVE. The refetch that recomputes
   * `To buy` is a round trip away and `Issue PO` is one click, so the tick on
   * the answered item line is dropped the moment the door says yes — not when
   * the new remainder turns up.
   */
  it("drops the purchasing tick standing on the item line it answered", async () => {
    answerReadyStock();
    renderRegister();
    fireEvent.click(screen.getByTestId("so-batch-select-o1"));
    expect(screen.getByTestId("so-batch-issue")).toBeInTheDocument();

    fireEvent.click(screen.getByTestId("so-batch-expand-o1"));
    fireEvent.click(await screen.findByRole("button", { name: /Ready Stock/ }));
    const row = await screen.findByTestId(
      "ready-stock-unit-33333333-0000-0000-0000-00000000000a",
    );
    fireEvent.click(within(row).getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: "Choose Ready Unit" }));

    await waitFor(() =>
      expect(screen.queryByTestId("so-batch-issue")).not.toBeInTheDocument(),
    );
    /* And the act says what it did, in Units. */
    expect(screen.getByTestId("ready-stock-act-o1")).toHaveTextContent(
      "Unit ID · U1-000-001",
    );
  });

  it("leaves another order's tick alone", async () => {
    answerReadyStock();
    renderRegister();
    fireEvent.click(screen.getByTestId("so-batch-select-o3"));
    fireEvent.click(screen.getByTestId("so-batch-expand-o1"));
    fireEvent.click(await screen.findByRole("button", { name: /Ready Stock/ }));
    const row = await screen.findByTestId(
      "ready-stock-unit-33333333-0000-0000-0000-00000000000a",
    );
    fireEvent.click(within(row).getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: "Choose Ready Unit" }));
    await screen.findByTestId("ready-stock-act-o1");
    fireEvent.click(screen.getByTestId("so-batch-issue"));
    expect(onIssue).toHaveBeenCalledWith([
      { demandId: "build::o3::b3", allocations: [{ destinationId: KLANG, qty: 1 }] },
    ]);
  });
});

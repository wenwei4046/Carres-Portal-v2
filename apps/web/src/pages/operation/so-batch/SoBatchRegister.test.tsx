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
import { soBatchAction, purchaseDemandStateWords } from "@carres/shared";
import type { SalesOrderExpansionResponse } from "@/lib/queries";

const navigate = vi.fn();
const printSalesOrdersSpy = vi.hoisted(() => vi.fn(async (_rows: ReadonlyArray<{ id: string }>) => {}));
vi.mock("../record-print", async () => {
  const actual = await vi.importActual<typeof import("../record-print")>("../record-print");
  return { ...actual, printSalesOrdersOrSay: printSalesOrdersSpy };
});
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return { ...actual, useNavigate: () => navigate };
});
vi.mock("../components/GlobalTopBar", () => ({ TopBarIcons: () => null }));
/* Export is read from the sheet the grid hands the workbook writer. */
const xlsx = vi.hoisted(() => ({ sheet: vi.fn((_data: unknown, _options?: unknown) => ({})) }));
vi.mock("xlsx", () => ({ utils: { json_to_sheet: xlsx.sheet, book_new: () => ({}), book_append_sheet: vi.fn() }, writeFile: vi.fn() }));
/* The expansion's Unit IDs come through the Sales Order expansion endpoint —
   the same door the Sales Orders register asks. The suite answers it empty
   unless a test overrides. */
/* ⭐ AND THE READY STOCK READ IS ANSWERED TOO (owner ruling 2026-09-18). The
   `Ready Stock` cell is on the item row now, so every expanded row asks this
   door; an unanswered read leaves every cell reading `Loading…` for ever,
   which is correct behaviour and useless as a fixture. The suite answers an
   EMPTY shelf unless a test overrides — the honest default for an order
   nothing is reserved against. */
const EMPTY_READY_STOCK = {
  orderId: "o1",
  so: null,
  reference: null,
  lines: [],
  units: [],
};
const apiFetch = vi.fn(async (path?: unknown, ..._a: unknown[]) => {
  if (typeof path === "string" && path.endsWith("/ready-stock")) {
    return EMPTY_READY_STOCK as unknown as SalesOrderExpansionResponse;
  }
  return {
    defaultDeliverTo: null,
    place: [],
    lines: [] as { lineId: string; sku: string; unitIds: string[]; deliverTo: Array<{ name: string; qty: number }> }[],
  } as SalesOrderExpansionResponse;
});
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
 * the ONE shared child table — with no second `Purchase order details` table
 * (owner ruling 2026-10-06).
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
    /* The carried build path ALWAYS sends this boolean, and `false` — nothing
       of this build sits on an open purchase order — is the ordinary case. A
       leaf without it is an older Worker's, which the register now reads as
       "could not be checked" rather than as permission. */
    fullyOnPo: false,
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
    requestedDeliveryDate: null, originalRequestedDeliveryDate: null,
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
  requestedDeliveryDate: "2026-08-28", originalRequestedDeliveryDate: "2026-08-28",
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
  requestedDeliveryDate: "2026-09-20", originalRequestedDeliveryDate: "2026-09-20",
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
const onOpenPurchaseOrders = vi.fn();

function renderRegister(over: Partial<SoBatchPurchaseResponse> = {}, expandHistory = true, isLoading = false) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const rendered = render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={["/operation?tab=purchase"]}>
        <SoBatchRegister sessionKey={expect.getState().currentTestName} data={data(over)} isLoading={isLoading} onIssue={onIssue} onOpenPurchaseOrders={onOpenPurchaseOrders} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  if (expandHistory) { const group = screen.queryByText("No purchase needed"); if (group) fireEvent.click(group); }
  return rendered;
}

it("shows the original request while keeping purchasing planning facts separate", () => {
  renderRegister({ registerRows: [{ ...ORDER_O1, requestedDeliveryDate: "2026-12-01", originalRequestedDeliveryDate: "2026-08-01" }] });
  expect(screen.getByTestId("so-batch-requested-o1")).toHaveTextContent("Sat, 1 Aug");
  expect(screen.getByTestId("so-batch-requested-o1")).not.toHaveTextContent("Dec");
});

it("never substitutes the current request when original-date evidence is missing", () => {
  renderRegister({ registerRows: [{ ...ORDER_O1, requestedDeliveryDate: "2026-12-01", originalRequestedDeliveryDate: null }] });
  expect(screen.getByTestId("so-batch-requested-o1")).toHaveTextContent("Not recorded");
  expect(screen.getByTestId("so-batch-requested-o1")).not.toHaveTextContent("Dec");
});

it("refuses manual whole-round matching when the persisted priority source is unavailable", () => {
  renderRegister({ readyStockPriority: null });
  expect(screen.getByRole("button", { name: "Match Ready Stock" })).toBeDisabled();
  expect(apiFetch).not.toHaveBeenCalled();
});

it("Cards shares the filtered Register and retains buying ticks when returning to Table", async () => {
  renderRegister({ registerRows: [ORDER_O1, ORDER_O3], rows: [LEAF_O1, LEAF_O3] });
  fireEvent.change(screen.getByRole("searchbox"), { target: { value: "Kimmy" } });
  await waitFor(() => expect(screen.queryByTestId("so-batch-row-o3")).not.toBeInTheDocument());
  fireEvent.click(screen.getByTestId("so-batch-select-o1"));
  fireEvent.mouseDown(screen.getByRole("tab", { name: "Cards" }));
  const card = screen.getByTestId("so-batch-card-o1");
  expect(screen.queryByTestId("so-batch-card-o3")).not.toBeInTheDocument();
  expect(within(card).getByRole("checkbox", { name: "Select SO-1318" })).toHaveAttribute("data-state", "checked");
  fireEvent.mouseDown(screen.getByRole("tab", { name: "Table" }));
  expect(screen.getByTestId("so-batch-select-o1")).toBeChecked();
  fireEvent.click(screen.getByTestId("so-batch-select-o1"));
  expect(screen.getByRole("searchbox")).toHaveValue("Kimmy");
});

it("Quick View issues only its own prepared scope while another SO stays selected", () => {
  renderRegister({ registerRows: [ORDER_O1, ORDER_O3], rows: [LEAF_O1, LEAF_O3] });
  fireEvent.click(screen.getByTestId("so-batch-select-o1"));
  fireEvent.click(screen.getByTestId("so-batch-select-o3"));
  fireEvent.click(screen.getByTestId("so-batch-so-link-o1"));
  fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Issue PO" }));
  expect(onIssue).toHaveBeenCalledTimes(1);
  expect(onIssue.mock.calls[0]![0].map((selection: { demandId: string }) => selection.demandId)).toEqual([LEAF_O1.id]);
  expect(screen.getByTestId("so-batch-select-o3")).toBeChecked();
});

it("Supplier grouping names the exact supplier set and never duplicates a multi-supplier SO", () => {
  renderRegister({ registerRows: [ORDER_O1, ORDER_O8], rows: [LEAF_O1, LEAF_O8A, LEAF_O8B] });
  fireEvent.keyDown(screen.getByRole("button", { name: "Page tools" }), { key: "Enter" });
  fireEvent.click(screen.getByRole("menuitem", { name: "Group by: Supplier" }));
  expect(screen.getByText("Hooka · Ohana")).toBeInTheDocument();
  expect(screen.getAllByTestId("so-batch-row-o8")).toHaveLength(1);
  expect(screen.getByTestId("so-batch-footer")).toHaveTextContent("2 Sales Orders");
  fireEvent.mouseDown(screen.getByRole("tab", { name: "Cards" }));
  expect(screen.getAllByTestId("so-batch-card-o8")).toHaveLength(1);
  expect(screen.getByTestId("so-batch-footer")).toHaveTextContent("2 Sales Orders");
});

it("does not match or recover POs from an unfinished Register load", () => {
  renderRegister({ readyStockPriority: "customer_delivery" }, false, true);
  const match = screen.getByRole("button", { name: "Match Ready Stock" });
  const pos = screen.getByRole("button", { name: "Purchase Orders" });
  expect(match).toBeDisabled();
  expect(pos).toBeDisabled();
  fireEvent.click(match);
  fireEvent.click(pos);
  expect(apiFetch).not.toHaveBeenCalled();
  expect(onOpenPurchaseOrders).not.toHaveBeenCalled();
});

it("keeps an empty-stock match at the readable default location and Cancel restores Listing", async () => {
  apiFetch.mockResolvedValueOnce({ orderId: "o1", so: ORDER_O1.so, reference: "SO-1318",
    lines: [{ orderLineId: "l1", sku: "A", item: "A", qty: 2, reservedQty: 0,
      reservedUnitCodes: [], onPoQty: 0, remainingQty: 2 }], units: [] } as unknown as SalesOrderExpansionResponse);
  renderRegister({ readyStockPriority: "customer_delivery", registerRows: [ORDER_O1], rows: [LEAF_O1] });
  fireEvent.click(screen.getByRole("button", { name: "Match Ready Stock" }));
  await waitFor(() => expect(screen.getByRole("combobox", { name: "Stock Location" })).toHaveTextContent("Carres Klang"));
  expect(screen.getByText("0 available")).toBeInTheDocument();
  expect(screen.queryByText("site:Carres Klang")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
  expect(screen.queryByRole("combobox", { name: "Stock Location" })).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Match Ready Stock" })).toBeEnabled();
  expect(apiFetch.mock.calls.every(([, options]) => (options as { method?: string } | undefined)?.method !== "POST")).toBe(true);
});

it("matches through actual Listing controls and ticking exposes Proceed without a reservation write", async () => {
  apiFetch.mockResolvedValueOnce({ orderId: "o1", so: ORDER_O1.so, reference: "SO-1318",
    lines: [{ orderLineId: "l1", sku: "A", item: "A", qty: 2, reservedQty: 0, reservedUnitCodes: [], onPoQty: 0, remainingQty: 2 }],
    units: [{ itemId: KLANG, unitCode: "SAMPLE-UNIT-1", identityScope: "unit", sku: "A", condition: "new",
      siteName: "Carres Klang", warehouseId: KLANG, holderName: null, ownership: "carres_owned", supplier: null,
      qty: 1, dateIn: "2026-08-01", matchingLineIds: ["l1"], blocked: null, reservedForLineId: null }] } as unknown as SalesOrderExpansionResponse);
  renderRegister({ readyStockPriority: "customer_delivery", registerRows: [ORDER_O1], rows: [LEAF_O1] });
  fireEvent.click(screen.getByRole("button", { name: "Match Ready Stock" }));
  await waitFor(() => expect(screen.getByRole("combobox", { name: "Stock Location" })).toHaveTextContent("Carres Klang"));
  expect(screen.getByText("1 available")).toBeInTheDocument();
  fireEvent.click(screen.getByTestId("so-batch-stock-select-o1"));
  expect(screen.getByRole("button", { name: "Proceed" })).toBeEnabled();
  expect(apiFetch.mock.calls.every(([, options]) => (options as { method?: string } | undefined)?.method !== "POST")).toBe(true);
});

beforeEach(() => {
  navigate.mockClear();
  xlsx.sheet.mockClear();
  onIssue.mockClear();
  onOpenPurchaseOrders.mockClear();
  apiFetch.mockClear();
  localStorage.clear();
});

it("recovers only visible linked POs for supplier preparation after a fresh mount", async () => {
  renderRegister({ registerRows: [ORDER_O3, ORDER_O5] });
  fireEvent.change(screen.getByRole("searchbox"), { target: { value: "ANNE" } });
  await waitFor(() => expect(screen.queryByTestId("so-batch-row-o5")).toBeNull());
  fireEvent.click(screen.getByRole("button", { name: /^Purchase Orders$/ }));
  expect(onOpenPurchaseOrders).toHaveBeenCalledWith(["PO-20260820-4827"]);
  expect(apiFetch.mock.calls.some(([path]) => String(path).includes("issue-batch"))).toBe(false);
});

const HERE = dirname(fileURLToPath(import.meta.url));
const source = () => readFileSync(join(HERE, "SoBatchRegister.tsx"), "utf8");

/**
 * ⭐ THE APPROVED READING ORDER — owner ruling 2026-09-18, Purchasing §9.1.
 *
 * `Status` returns, and it is a DIFFERENT column: `Need PO` / `No PO needed`,
 * the one question a buying page exists for, read from the same remaining
 * demand that puts the row under its group. What stays retired is blank ·
 * `Partial` · `Ordered` — a generic progress word nobody could act on.
 *
 * `PO Safety Days` replaces `Order By` (the date becomes an engine/detail fact
 * again), `Items` joins, and the customer's date and location say WHOSE they
 * are and rise above the customer's name. This is the owner's exact order; a
 * general ordering heuristic may not rearrange it.
 */
/* Group-local headers (Jess, 2026-09-18): a governed grouped listing has no
   `<thead>` — every OPEN group draws the same header between its heading and
   its records. One `<colgroup>` and one layout serve them all, so reading the
   first group's header reads the layout. */
const groupHeaderCells = (root: ParentNode): HTMLElement[] => [
  ...(root.querySelector<HTMLElement>('thead tr:last-child')?.querySelectorAll<HTMLElement>("th") ?? []),
];
describe("the approved columns, in the approved reading order", () => {
  const APPROVED = [
    "PO Status",
    "Proceed Date",
    "SO No",
    "PO Safety Days",
    "Customer’s original requested delivery",
    "Customer Delivery Location",
    "Customer",
    "Items",
    "Supplier",
    "Supplier Deliver To",
    "PO No",
    "PO Delivery Date",
  ];

  it("draws exactly the twelve business columns, in the owner's order", () => {
    const { container } = renderRegister();
    const heads = groupHeaderCells(container)
      .map((el) => el.textContent ?? "")
      .filter((t) => t.trim() !== "");
    expect(heads).toHaveLength(APPROVED.length);
    /* A two-line head carries no space between its lines in `textContent`, so
       the comparison is made on the letters, not on the line break. */
    const flat = (t: string) => t.replace(/\s+/g, "");
    APPROVED.forEach((label, i) =>
      expect(flat(heads[i]!), label).toContain(flat(label)),
    );
  });

  it("says `Need PO` / `No PO needed`, and nothing about progress", () => {
    const { container } = renderRegister();
    const text = groupHeaderCells(container).map((el) => el.textContent).join("|");
    expect(text).not.toContain("Partial");
    expect(text).not.toContain("Ordered");
    expect(screen.getByTestId("so-batch-status-o1")).toHaveTextContent("Pending");
    /* A word is not a permission: eligibility still refuses the tick. */
    expect(screen.getByTestId("so-batch-select-o5")).toBeDisabled();
    expect(screen.getByTestId("so-batch-status-o5")).toHaveTextContent("Done");
  });

  it("retires `Order By` as a column and keeps it on the wire", () => {
    const { container } = renderRegister();
    const text = groupHeaderCells(container).map((el) => el.textContent).join("|");
    expect(text).not.toContain("Order By");
    expect(LEAF_O1.orderBy ?? null).not.toBeUndefined();
  });

  it("the retired columns are gone from the Register", () => {
    const { container } = renderRegister();
    const text = groupHeaderCells(container).map((el) => el.textContent).join("|");
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

  it("the saved layout key is BUMPED so a stale arrangement cannot override the order", () => {
    expect(source()).toContain('"carres.soBatchPurchase.register.v7"');
    expect(source()).not.toContain('"carres.soBatchPurchase.register.v6"');
  });

  /**
   * §6.7 rule 2 fixes the ORDER of the record date and the identity; the
   * owner's page order puts `Status` ahead of them. All three lead; only the
   * PAIR pins, and `Status` scrolls under the pinned block like any other fact.
   */
  it("leads Status · Proceed Date · SO No, and pins only the pair (§6.7 rule 2)", () => {
    const { container } = renderRegister();
    const heads = groupHeaderCells(container);
    const data = heads.filter((th) => th.title);
    expect(data.slice(0, 4).map((th) => th.title)).toEqual([
      "PO Status",
      "Proceed Date",
      "SO No",
      "PO Safety Days",
    ]);
    expect(data[0]!.style.left).toBe("");
    expect(data[1]!.style.left).not.toBe("");
    expect(data[2]!.style.left).not.toBe("");
    expect(data[3]!.style.left).toBe("");
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
    expect(screen.getByTestId("so-batch-po-link-o7")).toHaveTextContent("PO-260822-3333");
  });
  it("the PO cell uses the actual version without changing the document navigation identity", () => {
    renderRegister({ registerRows: data().registerRows.map(row => row.orderId === "o7"
      ? { ...row, pos: row.pos.map(po => ({ ...po, version: 2 })) } : row) });
    const link = screen.getByTestId("so-batch-po-link-o7");
    expect(link).toHaveTextContent("PO-260822-3333-V2");
    fireEvent.click(link);
    expect(navigate).toHaveBeenCalledWith("/operation/procurement?po=PO-20260822-3333");
  });

  it("SO No opens the source Quick View and its deliberate Open leads to the full SO", () => {
    renderRegister();
    fireEvent.click(screen.getByTestId("so-batch-so-link-o1"));
    const panel = screen.getByRole("dialog");
    expect(within(panel).getByTestId("so-batch-card-o1")).toBeInTheDocument();
    expect(navigate).not.toHaveBeenCalled();
    fireEvent.click(within(panel).getByRole("button", { name: "Open full page" }));
    expect(navigate).toHaveBeenCalledWith("/operation/orders/so/o1");
    fireEvent.click(within(panel).getByRole("button", { name: "Close panel" }));
    fireEvent.click(screen.getByTestId("so-batch-po-link-o3"));
    expect(navigate).toHaveBeenCalledWith("/operation/procurement?po=PO-20260820-4827");
  });

  /* ⛔ Jess, 2026-10-06: "it should show at row listing, why we need another
     table?" The Quick View draws no `Purchase order details` table; the row
     listing carries PO No, Supplier, Supplier Deliver To, PO Delivery Date and
     PO Status, and the PO page holds each document's own detail. */
  it("the Quick View carries no `Purchase order details` table — the PO facts stay on the row", () => {
    renderRegister();
    /* The row names both documents, each its own door. */
    expect(within(screen.getByTestId("so-batch-po-o5")).getAllByRole("button")).toHaveLength(2);
    fireEvent.click(screen.getByTestId("so-batch-so-link-o5"));
    const panel = screen.getByRole("dialog");
    expect(within(panel).getByTestId("so-batch-card-o5")).toBeInTheDocument();
    expect(panel).not.toHaveTextContent("Purchase order details");
    expect(within(panel).queryByRole("table", { name: /Purchase order details/ })).toBeNull();
    expect(panel.textContent).not.toMatch(/PO-(20)?26082[01]-(1111|2222)/);
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
   * window silently changed what the screen said. Supplier, destination and
   * date summaries keep that rule. `PO No` is overwritten by the owner's
   * 2026-10-05 ruling: every number, on one line (see its own block below).
   */
  it("many POs, suppliers, destinations and dates summarise deterministically", () => {
    renderRegister();
    expect(screen.getByTestId("so-batch-po-o5").textContent).toBe("PO-260820-1111, PO-260821-2222");
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

/**
 * ⭐ PO No LISTS EVERY LINKED PO NUMBER — owner ruling 2026-10-05 (Purchasing
 * §9.1). One line, every real number from the row's `po_line_sources` lineage,
 * each once, by stored PO number ascending, in the shared display form with
 * its actual version, separated by `, `. Each number is its own door to that
 * exact PO. Default width, the standard 32px row, no count, no popover; search,
 * the column filter and Export carry the complete list.
 */
describe("PO No lists every linked PO number (owner ruling 2026-10-05)", () => {
  const SO1205_POS = ["PO-20260903-4316", "PO-20260903-4585", "PO-20260903-7907", "PO-20260903-9389"];
  const poFact = (poId: string, over: Partial<SoBatchOrderRow["pos"][number]> = {}): SoBatchOrderRow["pos"][number] => ({
    poId, status: "open", supplierId: "s-hooka", supplierName: "Hooka", destinationId: KLANG,
    officialDeliveryDate: "2026-09-20", sentCurrentVersion: true, version: 1, ...over,
  });
  /* Out of order and with a repeated document, as an older payload could send
     it; two item lines link to the same PO. The cell must still print each
     document once, in stored PO-number order. */
  const MANY = orderRow({
    orderId: "o1205",
    so: 1205,
    customer: "FOUR DOCUMENTS",
    status: "ordered",
    pos: [poFact(SO1205_POS[2]!), poFact(SO1205_POS[0]!), poFact(SO1205_POS[3]!), poFact(SO1205_POS[1]!), poFact(SO1205_POS[2]!)],
    lines: [
      { orderLineId: "l1205a", sku: "B1201S-K", qty: 1, stockTaken: 0, item: "Booqit", variant: "King", category: "mattress",
        pos: [{ poId: SO1205_POS[2]!, qty: 1 }, { poId: SO1205_POS[0]!, qty: 1 }] },
      { orderLineId: "l1205b", sku: "B1201S-Q", qty: 1, stockTaken: 0, item: "Booqit", variant: "Queen", category: "mattress",
        pos: [{ poId: SO1205_POS[2]!, qty: 1 }, { poId: SO1205_POS[1]!, qty: 1 }, { poId: SO1205_POS[3]!, qty: 1 }] },
    ],
  });
  const FOURTEEN = Array.from({ length: 14 }, (_, i) => `PO-20260904-${String(1001 + i)}`);
  const LONG = orderRow({
    orderId: "o1340",
    so: 1340,
    customer: "FOURTEEN DOCUMENTS",
    status: "ordered",
    pos: [...FOURTEEN].reverse().map((id, i) => poFact(id, { version: i === 0 ? 3 : 1 })),
    lines: [{ orderLineId: "l1340", sku: "S9-2A", qty: 14, stockTaken: 0, item: "Booqit Sofa", variant: null, category: "sofa",
      pos: FOURTEEN.map((poId) => ({ poId, qty: 1 })) }],
  });
  const render1205 = () => renderRegister({ registerRows: [ORDER_O1, ORDER_O3, MANY, LONG] }, false);

  it("prints every linked PO once, by stored number, comma-separated on one line, each with its actual version", () => {
    render1205();
    const cell = screen.getByTestId("so-batch-po-o1205");
    expect(cell.textContent).toBe("PO-260903-4316-V1, PO-260903-4585-V1, PO-260903-7907-V1, PO-260903-9389-V1");
    const links = within(cell).getAllByRole("button");
    expect(links.map((b) => b.textContent)).toEqual([
      "PO-260903-4316-V1", "PO-260903-4585-V1", "PO-260903-7907-V1", "PO-260903-9389-V1",
    ]);
    /* The commas are plain text, never part of a door. */
    for (const link of links) expect(link.textContent).not.toContain(",");
    /* The shared document-link recipe the Sales Orders register uses. */
    for (const link of links) {
      expect(link.className).toBe("font-medium text-kit-blue-11 underline-offset-2 hover:underline");
    }
  });

  it("each number opens its own exact PO and never toggles, selects or expands the row", () => {
    render1205();
    const links = within(screen.getByTestId("so-batch-po-o1205")).getAllByRole("button");
    links.forEach((link, i) => {
      fireEvent.click(link);
      expect(navigate).toHaveBeenLastCalledWith(`/operation/procurement?po=${encodeURIComponent(SO1205_POS[i]!)}`);
    });
    expect(navigate).toHaveBeenCalledTimes(4);
    expect(screen.queryByTestId("selection-bar")).not.toBeInTheDocument();
    expect(screen.getByTestId("so-batch-expand-o1205")).toHaveAttribute("aria-expanded", "false");
    fireEvent.doubleClick(links[0]!);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("no PO count and no popover remain; one PO stays a direct door; no PO keeps `Not ordered yet`", () => {
    render1205();
    const page = screen.getByTestId("so-batch-page");
    expect(page.textContent).not.toMatch(/\d+ POs\b/);
    expect(page.querySelector('[data-testid^="so-batch-po-many-"]')).toBeNull();
    for (const id of ["o1205", "o1340", "o3"]) {
      expect(screen.getByTestId(`so-batch-po-${id}`).querySelector("[aria-haspopup]")).toBeNull();
    }
    const single = within(screen.getByTestId("so-batch-po-o3")).getAllByRole("button");
    expect(single).toHaveLength(1);
    fireEvent.click(single[0]!);
    expect(navigate).toHaveBeenLastCalledWith("/operation/procurement?po=PO-20260820-4827");
    expect(screen.getByTestId("so-batch-po-o1").textContent).toBe("Not ordered yet");
    expect(within(screen.getByTestId("so-batch-po-o1")).queryByRole("button")).toBeNull();
  });

  it("a long list stays one clipped line in the standard 32px row, at the registry width", () => {
    render1205();
    const cell = screen.getByTestId("so-batch-po-o1340");
    expect(within(cell).getAllByRole("button")).toHaveLength(14);
    expect(cell.textContent).toBe(
      FOURTEEN.map((id) => `${id.replace("PO-2026", "PO-26")}-V${id === FOURTEEN[13] ? 3 : 1}`).join(", "),
    );
    /* One line: the cell never wraps, never breaks, never stacks its doors. */
    expect(cell.className.split(" ")).toEqual(expect.arrayContaining(["block", "truncate"]));
    expect(cell.querySelector("br, div, p, ul, li")).toBeNull();
    for (const link of within(cell).getAllByRole("button")) expect(link.className).not.toMatch(/\bblock\b|\bflex\b/);
    /* The row recipe is the standard one, and this column does not wrap. */
    expect(document.querySelector('[data-row-height="32"]')).not.toBeNull();
    const td = cell.closest("td")!;
    expect(td.className).not.toMatch(/wrap/i);
    const header = screen.getAllByRole("columnheader").find((th) => th.getAttribute("title") === "PO No")!;
    expect(header.style.width).toBe("170px");
  });

  it.each([
    ["PO-20260903-7907", "stored"],
    ["PO-260903-7907-V1", "display"],
    ["PO-260903-9389", "display without version"],
  ])("search finds the order by any of its numbers: %s (%s)", async (query) => {
    render1205();
    fireEvent.click(screen.getByRole("button", { name: "Search" }));
    fireEvent.change(screen.getByRole("searchbox", { name: "Search" }), { target: { value: query } });
    await waitFor(() => expect(screen.queryByTestId("so-batch-row-o3")).not.toBeInTheDocument());
    expect(screen.getByTestId("so-batch-row-o1205")).toBeInTheDocument();
    expect(screen.queryByTestId("so-batch-row-o1340")).not.toBeInTheDocument();
  });

  it("the column filter lists the complete list, never a count", () => {
    render1205();
    fireEvent.click(screen.getAllByRole("button", { name: "Filter PO No" })[0]!);
    expect(
      screen.getByText("PO-260903-4316-V1, PO-260903-4585-V1, PO-260903-7907-V1, PO-260903-9389-V1"),
    ).toBeInTheDocument();
    expect(screen.queryByText(/^\d+ POs$/)).toBeNull();
  });

  it("Export writes every number, comma-separated, in the same display form", async () => {
    render1205();
    fireEvent.keyDown(screen.getByRole("button", { name: "Page tools" }), { key: "Enter" });
    fireEvent.click(screen.getByRole("menuitem", { name: "Export" }));
    fireEvent.click(await screen.findByRole("menuitem", { name: "Excel" }));
    await waitFor(() => expect(xlsx.sheet).toHaveBeenCalledTimes(1));
    const sheet = xlsx.sheet.mock.calls[0]![0] as Array<Record<string, string>>;
    const row = (so: string) => sheet.find((r) => r["SO No"] === so)!;
    expect(row("SO-1205")["PO No"]).toBe("PO-260903-4316-V1, PO-260903-4585-V1, PO-260903-7907-V1, PO-260903-9389-V1");
    expect(row("SO-1340")["PO No"].split(", ")).toHaveLength(14);
    expect(row("SO-1330")["PO No"]).toBe("PO-260820-4827");
    expect(row("SO-1318")["PO No"]).toBe("");
  });

  /* ⛔ Jess, 2026-10-06: "it should show at row listing, why we need another
     table?" The row expansion holds the goods table only — no second
     `Purchase order details` table, no PO number, and no Unit read (Unit ID is
     a Warehouse/PO-page fact, not shown on SO Batch). */
  it("the row expansion carries no `Purchase order details` table; every number stays on the row", async () => {
    render1205();
    fireEvent.click(screen.getByTestId("so-batch-expand-o1205"));
    const box = await screen.findByTestId("so-batch-inspector-o1205");
    expect(within(box).getByTestId("goods-mini-table")).toBeInTheDocument();
    expect(within(box).getAllByTestId(/^connected-section-/).map((el) => el.dataset.testid))
      .toEqual(["connected-section-goods"]);
    expect(within(box).queryByTestId("po-details-table")).toBeNull();
    expect(box).not.toHaveTextContent("Purchase order details");
    expect(box.textContent).not.toMatch(/PO-(20)?260903-/);
    expect(apiFetch.mock.calls.some(([path]) => String(path).endsWith("/expansion"))).toBe(false);
    expect(within(screen.getByTestId("so-batch-po-o1205")).getAllByRole("button")).toHaveLength(4);
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
    expect(within(bar).getByText("1 Sales Order · 1 item · 2 units · Issue 1 PO")).toBeVisible();
  });

  it("opens on the first ACTIVE destination and says which, without blocking", () => {
    renderRegister({ defaultDestinationId: null });

    /* Not the blocker sentence - buying works. */
    expect(screen.queryByTestId("so-batch-no-destination")).not.toBeInTheDocument();
    const note = screen.getByTestId("so-batch-no-default-destination");
    expect(note).toHaveTextContent("ticks open on Carres Klang");
  });

  it("does not report absent destination settings while their read is loading", () => {
    renderRegister({ destinations: [], defaultDestinationId: null }, false, true);
    expect(screen.queryByTestId("so-batch-no-destination")).not.toBeInTheDocument();
    expect(screen.queryByTestId("so-batch-no-default-destination")).not.toBeInTheDocument();
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
    expect(within(bar).getByText("1 Sales Order · 1 item · 2 units · Issue 1 PO")).toBeVisible();
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
      "1 Sales Order · 1 item · 2 units · Issue 1 PO",
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
    const panel = within(box).getByTestId("so-batch-blocker-build::cost::b1");
    expect(within(panel).getByText("Catalog cost is missing")).toBeInTheDocument();
    expect(within(panel).getByText("Set the cost of B1201S in Catalog")).toBeInTheDocument();
    /* And the item line's own Status names the same fact (owner ruling 2026-09-28). */
    expect(within(box).getByTestId("so-batch-line-status-why-cost-line")).toHaveTextContent("Catalog cost is missing");
  });

  it("a Partial order selects only its uncovered eligible remainder", () => {
    renderRegister();
    fireEvent.click(screen.getByTestId("so-batch-select-o3"));
    /* The leaf's own remainder — 1 unit, never the 2 already on the PO. */
    expect(screen.getByTestId("selection-bar")).toHaveTextContent(
      "1 Sales Order · 1 item · 1 unit · Issue 1 PO",
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
    expect(screen.getByTestId("so-batch-select-ob")).toHaveAccessibleDescription(purchaseDemandStateWords(data().safetyDays)[state]);
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
    expect(readFileSync(join(HERE, "SoBatchRegister.module.css"), "utf8")).toContain("@container so-batch (width < 896px)");
    /* Its positioning context is the row it sits in, not the page. */
    expect(rail().parentElement?.className).toContain("relative");
  });

  it("keeps Report unavailable while its content is undecided", () => {
    renderRegister();
    expect(screen.getByRole("tab", { name: "Listing" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: "Report" })).toBeDisabled();
    expect(screen.getByTestId("so-batch-page")).toBeVisible();
  });

  it("renders Region immediately after Supplier", () => {
    renderRegister();
    const text = rail().textContent ?? "";
    const order = ["PO Safety Days", "Product", "Supplier", "Region", "Setup to fix"];
    const positions = order.map((h) => text.indexOf(h));
    expect(positions.every((p) => p >= 0)).toBe(true);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
    for (const word of [
      "Order early",
      "14 days left",
      "1–13 days left",
      "0 days left",
      "Production late",
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
    expect(text.toLowerCase()).not.toContain("work to do");
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
    expect(label!.textContent).toBe("Production late");
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
       treatment — a narrowed section must not read as an unset one. The
       active treatment is the theme's select wash since the v4 kit. */
    expect(select().className).not.toContain("bg-c-select-bg");
    pick("so-batch-product-select", "mattress");
    expect(select().className).toContain("bg-c-select-bg");
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
  it("draws ONE connected section — the goods — and the line ends in a curve at it", async () => {
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

    /* ⭐ ONE SECTION, even on an order with documents (owner ruling
       2026-10-06). Ready Stock is a cell on the item line (2026-09-18), and
       what has already been bought is on the row listing — never a second
       table here. */
    const sections = within(box)
      .getAllByTestId(/^connected-section-/)
      .map((s) => s.getAttribute("data-testid"));
    expect(sections).toEqual(["connected-section-goods"]);

    /* ⭐ THE LINE COMES FROM THE CARET (§6.9, Card 12 review 2026-09-21): the
       grid draws the drop and the curve in the caret column, the section takes
       it in as a flat run — and, being the LAST one, draws no trunk, so nothing
       can run on into the next Sales Order. */
    expect(within(box).getByTestId("section-run-goods")).toBeInTheDocument();
    expect(within(box).queryByTestId("section-elbow-goods")).toBeNull();
    expect(screen.getByTestId("expansion-connector-drop")).toBeInTheDocument();
    expect(screen.getByTestId("expansion-connector-elbow")).toBeInTheDocument();
    expect(within(box).queryByTestId("section-trunk-goods")).toBeNull();
  });

  it("the item row carries no PO reference and no document quantity; each line keeps its own Supplier and Supplier Deliver To", async () => {
    renderRegister();
    fireEvent.click(screen.getByTestId("so-batch-expand-o5"));
    const box = await screen.findByTestId("so-batch-inspector-o5");

    /* ⛔ THE ITEM ROW CARRIES NO PO REFERENCE AND NO DOCUMENT QUANTITY AT ALL
       (owner ruling 2026-09-18). The documents are named on the row's `PO No`
       (owner ruling 2026-10-06), and each opens its own PO page. */
    const goods = within(box).getByTestId("goods-mini-table");
    expect(goods.textContent).not.toMatch(/PO-(20)?26082[01]-(1111|2222)/);
    expect(within(goods).queryByTestId("goods-ordered-qty-l51")).toBeNull();

    /* Each line states its own supplier and its own issued destination. */
    const haven = within(goods).getByTestId("so-batch-part-H1401S-K");
    expect(haven).toHaveTextContent("Hooka");
    expect(haven).toHaveTextContent("Carres Klang");
    const sofa = within(goods).getByTestId("so-batch-part-S9-2A");
    expect(sofa).toHaveTextContent("Ohana");
    expect(sofa).toHaveTextContent("AL Sungai Buloh");
  });

  /**
   * ⭐ THE APPROVED GOODS TABLE — owner ruling 2026-09-18:
   * `☐ · Status · Category · Qty · Item · Ready Stock · Supplier ·
   * Supplier Deliver To`, and nothing else.
   *
   * This line is fully answered off the shelf: the customer ordered 2, Ready
   * Stock answered 2, no document carries any of it and nothing is left to buy
   * — so it cannot be ticked, and it says `No PO needed` rather than a generic
   * progress word.
   */
  it("draws the approved goods columns, and the removed ones are gone", async () => {
    renderRegister();
    fireEvent.click(screen.getByTestId("so-batch-expand-o6"));
    const box = await screen.findByTestId("so-batch-inspector-o6");
    const goods = within(box).getByTestId("goods-mini-table");
    const heads = [...goods.querySelectorAll("thead th")]
      .map((el) => (el.textContent ?? "").trim())
      .filter(Boolean);
    expect(heads).toEqual([
      "PO Status",
      "Category",
      "Qty",
      "Item",
      "Ready Stock",
      "Supplier",
      "Supplier Deliver To",
    ]);
    for (const gone of ["SKU", "Ordered Qty", "To buy", "Order By", "Unit ID", "PO Safety Days"]) {
      expect(heads, gone).not.toContain(gone);
    }
    const line = within(box).getByTestId("so-batch-part-B1201S-Q");
    expect(within(line).getByTestId("goods-status-l61")).toHaveTextContent("Done");
    expect(within(line).queryByRole("checkbox")).toBeNull();
    /* The customer's ORIGINAL quantity, never quietly rewritten. */
    expect(line).toHaveTextContent("2");
    expect(screen.getByTestId("so-batch-status-o6")).toHaveTextContent("Done");
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

    /* With documents (o5) or without (o1), each holds the one goods section,
       and its line ends at the goods. */
    for (const box of [five, one]) {
      expect(within(box).getAllByTestId(/^connected-section-/)).toHaveLength(1);
      /* THE LAST SECTION DRAWS NO TRUNK. There is no line to leak. */
      expect(within(box).queryByTestId("section-trunk-goods")).toBeNull();
      /* And each row's line belongs to that row, not to the register: its own
         run from its own caret, and no later section to elbow into. */
      expect(within(box).getAllByTestId(/^section-run-/)).toHaveLength(1);
      expect(within(box).queryAllByTestId(/^section-elbow-/)).toHaveLength(0);
    }
    expect(screen.getAllByTestId("expansion-connector-drop")).toHaveLength(2);
  });

  it("no second hand-drawn mini-table — the box is the shared component", () => {
    const src = source();
    expect(src).toContain('from "../components/GoodsMiniTable"');
    expect(src).not.toContain("<table");
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
    expect(screen.getByTestId("selection-bar")).toHaveTextContent("1 Sales Order · 1 item · 1 unit");
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
      "1 Sales Order · 1 item · 2 units · Issue 2 POs",
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
 *
 * Unit ID is a Warehouse/PO-page fact and SO Batch neither reads nor shows it
 * (owner ruling 2026-10-06), so the Sales Order expansion door below holds
 * Units this page must never draw a row or a control for.
 */
describe("a demand with several Unit records", () => {
  const withUnits = (lineId: string, unitIds: string[], coverage: Record<string, string>) => {
    apiFetch.mockImplementation(async (path?: unknown) =>
      typeof path === "string" && path.endsWith("/ready-stock")
        ? (EMPTY_READY_STOCK as unknown as SalesOrderExpansionResponse)
        : ({
            defaultDeliverTo: null,
            place: [],
            lines: [{ lineId, sku: "B1201S-K", unitIds, deliverTo: [] as Array<{ name: string; qty: number }> }],
            unitCoverage: coverage,
            unitLines: Object.fromEntries(unitIds.map((u) => [u, lineId])),
          } as unknown as SalesOrderExpansionResponse));
  };

  it("draws exactly ONE checkbox and ONE arrangement editor, however many Units it has", async () => {
    withUnits("l3", ["U1-000-101", "U1-000-102"], {
      "U1-000-101": "PO-20260820-4827",
      "U1-000-102": "PO-20260820-4827",
    });
    renderRegister();
    fireEvent.click(screen.getByTestId("so-batch-expand-o3"));
    const box = await screen.findByTestId("so-batch-inspector-o3");
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
    /* ⛔ And no Unit anywhere in the box: no Unit read, no Unit row, no second
       table to carry one (owner ruling 2026-10-06). */
    expect(box).not.toHaveTextContent("U1-000-101");
    expect(box).not.toHaveTextContent("U1-000-102");
    expect(within(box).getAllByRole("checkbox")).toHaveLength(1);
    expect(apiFetch.mock.calls.some(([path]) => String(path).endsWith("/expansion"))).toBe(false);
  });

  it("ticking the one demand never reports more than the demand", async () => {
    withUnits("l3", ["U1-000-101", "U1-000-102"], {});
    renderRegister();
    fireEvent.click(screen.getByTestId("so-batch-expand-o3"));
    const box = await screen.findByTestId("so-batch-inspector-o3");
    const table = within(box).getByTestId("goods-mini-table");
    fireEvent.click(within(table).getByRole("checkbox"));
    /* What the toolbar says and what the screen shows are the same number. */
    expect(screen.getByTestId("selection-bar")).toHaveTextContent("1 Sales Order · 1 item · 1 unit");
    expect(
      within(table).getAllByRole("checkbox").filter((c) => (c as HTMLInputElement).checked),
    ).toHaveLength(1);
  });
});

/* ─── FOURTEEN DOCUMENTS ON A QTY-1 LINE ─────────────────────────────────── */

/**
 * ⭐ THE OWNER'S SCREENSHOT, TURNED INTO FIXTURES (2026-09-11).
 *
 * `Qty 1 · On PO 14 · To buy 1` was reported as possible duplicate buying. It
 * is not ONE situation, it is four, and only the documents' own recorded state
 * tells them apart. Every one of the fourteen is named on the row's `PO No`,
 * and each document's own state is on its PO page (owner ruling 2026-10-06:
 * no second table under the row).
 *
 * ── THE TWO NUMBERS, AND THEIR DIFFERENT SCOPES ─────────────────────────────
 *
 *   `On PO`   the HISTORICAL document quantity. Every non-cancelled
 *             `po_line_sources` row whose `order_line_id` is THIS line —
 *             `Completed` documents included, never netted by `received_qty`.
 *             Customer-attributed and exact.
 *
 *   `To buy`  the ENGINE's EFFECTIVE remainder. Drawn from a per-SKU pool of
 *             `purchase_orders.status = 'open'` lines only, net of
 *             `received_qty`, allocated greedily earliest-deadline-first with
 *             NO customer attribution — so another order may drain it first.
 *
 * They are allowed to disagree, and the fixtures below state what each
 * disagreement MEANS. No third formula is derived from them anywhere.
 */
describe("fourteen documents on a one-unit line", () => {
  const FOURTEEN = Array.from({ length: 14 }, (_, i) => `PO-2026090${(i % 9) + 1}-${4665 + i}`);

  const documents = (sent: boolean, status: "open" | "received" = "open") =>
    FOURTEEN.map((poId) => ({
      poId,
      status,
      supplierId: "s-ohana",
      supplierName: "Ohana",
      destinationId: KLANG,
      officialDeliveryDate: null,
      sentCurrentVersion: sent,
    }));

  const order = (over: {
    sent: boolean;
    status: "open" | "received";
    orderStatus: "blank" | "partial" | "ordered";
  }) =>
    orderRow({
      orderId: "o14",
      so: 1442,
      customer: "FOURTEEN DOCUMENTS",
      status: over.orderStatus,
      pos: documents(over.sent, over.status),
      lines: [
        {
          orderLineId: "l14",
          sku: "B1201S-K",
          qty: 1,
          stockTaken: 0,
          item: "Booqit",
          variant: "King",
          category: "mattress",
          pos: FOURTEEN.map((poId) => ({ poId, qty: 1 })),
        },
      ],
      outstandingSuppliers: ["Ohana"],
    });

  const leaf14 = (over: Partial<PurchaseDemandRow> = {}) =>
    leaf({
      id: "build::o14::b",
      orderId: "o14",
      so: 1442,
      customer: "FOURTEEN DOCUMENTS",
      lineIds: ["l14"],
      skus: ["B1201S-K"],
      qtyNeeded: 1,
      toBuy: 1,
      parts: [{ sku: "B1201S-K", qty: 1, unitCost: 100 }],
      ...over,
    });

  /**
   * FIXTURE A — the documents were SENT and they cover what the line required.
   * Another purchase is NOT allowed: `isSelectableForOrder` reads the order's
   * OWN lineage on confirmed-sent documents, and there is no checkbox at all.
   */
  it("refuses a second purchase when the order's own sent documents cover it", async () => {
    renderRegister({
      rows: [leaf14()],
      registerRows: [order({ sent: true, status: "open", orderStatus: "ordered" })],
    });
    expect(screen.getByTestId("so-batch-select-o14")).toBeDisabled();
    fireEvent.click(screen.getByTestId("so-batch-expand-o14"));
    const box = await screen.findByTestId("so-batch-inspector-o14");
    expect(within(within(box).getByTestId("goods-mini-table")).queryByRole("checkbox")).toBeNull();
    /* And the row says WHY: all fourteen documents, each its own door. */
    expect(within(screen.getByTestId("so-batch-po-o14")).getAllByRole("button")).toHaveLength(14);
  });

  /**
   * FIXTURE B — the documents are NUMBERED and none has been sent. Nothing has
   * reached a supplier, so status stays `blank` and buying is legitimate.
   */
  it("allows the purchase when not one of the fourteen has been sent", async () => {
    renderRegister({
      rows: [leaf14()],
      registerRows: [order({ sent: false, status: "open", orderStatus: "blank" })],
    });
    expect(screen.getByTestId("so-batch-select-o14")).toBeEnabled();
    fireEvent.click(screen.getByTestId("so-batch-expand-o14"));
    const box = await screen.findByTestId("so-batch-inspector-o14");
    /* The one demand is offered once, on its item line. */
    const ticks = within(within(box).getByTestId("goods-mini-table")).getAllByRole("checkbox");
    expect(ticks).toHaveLength(1);
    expect(ticks[0]).toBeEnabled();
    /* All fourteen numbered documents are still named on the row. */
    expect(within(screen.getByTestId("so-batch-po-o14")).getAllByRole("button")).toHaveLength(14);
  });

  /**
   * FIXTURE C — the goods already ARRIVED. The lineage still names them because
   * they are this line's history; the engine's pool counts none of them,
   * because a `Completed` document supplies nothing future.
   */
  it("still names delivered documents under PO No, and the item row carries no document quantity", async () => {
    renderRegister({
      rows: [leaf14()],
      registerRows: [order({ sent: true, status: "received", orderStatus: "ordered" })],
    });
    fireEvent.click(screen.getByTestId("so-batch-expand-o14"));
    const box = await screen.findByTestId("so-batch-inspector-o14");
    /* ⭐ THE HISTORICAL QUANTITY LEFT THE ITEM ROW (owner ruling 2026-09-18).
       `Ordered Qty` is no longer a goods column; the fourteen documents are
       named on the row's `PO No` (owner ruling 2026-10-06), each opening the
       PO page that evidences its quantity and state. */
    expect(within(box).queryByTestId("goods-ordered-qty-l14")).toBeNull();
    expect(within(screen.getByTestId("so-batch-po-o14")).getAllByRole("button")).toHaveLength(14);
    /* ⛔ And the raw database word never reaches the screen. */
    expect(box.textContent).not.toMatch(/\bopen\b/);
    expect(screen.getByTestId("so-batch-row-o14").textContent).not.toMatch(/\bopen\b/);
  });

  /**
   * ⭐ FIXTURE D — the ENGINE's own `fullyOnPo`, and THE SCREEN AGREES WITH THE
   * DOOR.
   *
   * Every unit of the build was drawn from the OPEN-purchase-order pool, so
   * `To buy` is not a remainder. Since 0430 `POST /issue-batch` REFUSES such a
   * selection by name — `already_on_po`, 422, naming the covering document —
   * and creates nothing; production had minted SIX open purchase orders
   * against one 1-unit line of SO-1340 because nothing downstream of the
   * receipt refused it.
   *
   * The register offered the tick anyway, which is the trap shape
   * `isSelectableForBuying`'s own contract exists to prevent: *offering a
   * tick-box would be offering an act that fails*. So the row is not tickable
   * and states the door's own refusal beside the figure that raised the
   * question.
   */
  it("refuses the tick the issue door would refuse, and says so in its words", async () => {
    renderRegister({
      rows: [leaf14({ onPo: 1, fullyOnPo: true })],
      registerRows: [order({ sent: false, status: "open", orderStatus: "blank" })],
    });
    /* No parent tick either: the order's only eligible demand has gone. */
    expect(screen.getByTestId("so-batch-select-o14")).toBeDisabled();
    fireEvent.click(screen.getByTestId("so-batch-expand-o14"));
    const box = await screen.findByTestId("so-batch-inspector-o14");
    const demand = within(box).getByTestId("so-batch-part-B1201S-K");
    expect(within(demand).queryByRole("checkbox")).toBeNull();
    /* ⭐ REMOVING THE COLUMNS REMOVED NO SAFEGUARD (owner ruling 2026-09-18).
       `To buy` is gone from this table and the page still refuses the act the
       door would refuse: no tick on the demand, no tick on the parent, and the
       parent's `PO Safety Days` naming the covering document in the page's own
       governed word rather than printing a margin it cannot state. The
       customer's ORIGINAL `Qty 1` is untouched. */
    const cells = [...demand.querySelectorAll("td")].map((c) => c.textContent);
    expect(cells).toContain("1");
    expect(demand.textContent).not.toMatch(/To buy/);
    /* This order's own lineage already carries every unit it required, so the
       row needs no NEW document and has no margin to state — the cell is
       BLANK, which is its own meaning and is never a `0`. */
    expect(screen.getByTestId("so-batch-status-o14")).toHaveTextContent("Done");
    expect(screen.getByTestId("so-batch-safety-days-o14")).toHaveTextContent("");
  });

  /**
   * ⭐ UNKNOWN IS NOT YES (owner correction 2026-09-11).
   *
   * An older Worker carries no `fullyOnPo`, so the page cannot tell an
   * uncovered line from one it has no answer about. It used to read the gap as
   * permission and offer the tick. It now says it could not check — no
   * purchasing quantity and no tick, because both would describe an
   * eligibility nobody verified. The issue door's own refusal is untouched
   * underneath; nothing about the backend rule changed.
   */
  it("neither offers nor prices a line whose coverage it could not check", async () => {
    renderRegister({
      rows: [leaf14({ onPo: 1, fullyOnPo: undefined })],
      registerRows: [order({ sent: false, status: "open", orderStatus: "blank" })],
    });
    expect(screen.getByTestId("so-batch-select-o14")).toBeDisabled();
    expect(screen.getByTestId("so-batch-select-o14")).toHaveAccessibleDescription("Coverage not checked");
    fireEvent.click(screen.getByTestId("so-batch-expand-o14"));
    const box = await screen.findByTestId("so-batch-inspector-o14");
    const demand = within(box).getByTestId("so-batch-part-B1201S-K");
    expect(within(demand).queryByRole("checkbox")).toBeNull();
    /* UNKNOWN is stated, and it is stated as the MARGIN nobody could measure —
       never as a `0` and never as permission. The demand stays fully visible:
       the customer's original `Qty 1` is on its row. */
    const cells = [...demand.querySelectorAll("td")].map((c) => c.textContent);
    expect(cells).toContain("1");
    expect(screen.getByTestId("so-batch-safety-days-o14")).toHaveTextContent(
      "Coverage not checked",
    );
    expect(screen.getByTestId("so-batch-safety-days-o14")).not.toHaveTextContent("0");
  });

  it("says nothing of the kind when the remainder is genuine", async () => {
    renderRegister({
      rows: [leaf14({ onPo: 0, fullyOnPo: false })],
      registerRows: [order({ sent: false, status: "open", orderStatus: "blank" })],
    });
    fireEvent.click(screen.getByTestId("so-batch-expand-o14"));
    const box = await screen.findByTestId("so-batch-inspector-o14");
    expect(within(box).getByTestId("so-batch-part-B1201S-K"))
      .not.toHaveTextContent("Already on a PO");
    expect(screen.getByTestId("so-batch-safety-days-o14"))
      .not.toHaveTextContent("Already on a PO");
  });

  /* An older Worker sends no `fullyOnPo`. UNKNOWN accuses nothing and claims
     nothing: the sentence simply does not appear. */
  it("says nothing when the Worker did not carry the engine's flag", async () => {
    renderRegister({
      rows: [leaf14({ onPo: 1, fullyOnPo: undefined })],
      registerRows: [order({ sent: false, status: "open", orderStatus: "blank" })],
    });
    fireEvent.click(screen.getByTestId("so-batch-expand-o14"));
    const box = await screen.findByTestId("so-batch-inspector-o14");
    expect(within(box).getByTestId("so-batch-part-B1201S-K"))
      .not.toHaveTextContent("Already on a PO");
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
    /* Both of the customer's lines are still listed with their own goods. The
       SKU column is gone (owner ruling 2026-09-18), so what tells the two
       module lines apart is the configuration under the item — which is what
       identified them to an operator in the first place. */
    expect(table).toHaveTextContent("2 seater");
    expect(table).toHaveTextContent("1 seater");
    expect(table).not.toHaveTextContent("S9-2A");
  });

  it("ticks the whole set once — the leaf contract is unchanged", async () => {
    renderRegister({ rows: [SET_LEAF], registerRows: [SET_ORDER] });
    fireEvent.click(screen.getByTestId("so-batch-expand-oset"));
    const box = await screen.findByTestId("so-batch-inspector-oset");
    fireEvent.click(within(within(box).getByTestId("goods-mini-table")).getByRole("checkbox"));
    expect(screen.getByTestId("selection-bar")).toHaveTextContent("1 Sales Order · 2 items · 2 units");
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
    expect(screen.getByTestId("selection-bar")).toHaveTextContent("1 Sales Order · 1 item · 2 units");
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
        poNo: "PO-20260820-4827",
        matchingLineIds: ["l1"],
        lineIds: ["l1"],
        reservedForLineId: null,
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
      if (p.includes("ready-stock/save")) {
        return {
          reserved: 1,
          added: 1,
          released: 0,
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
    /* ⭐ THE SAFEGUARD SURVIVED THE MOVE TO THE ITEM ROW (2026-09-18). Ready
       Stock is a CELL now, and the path its act travels back to the Register is
       worth pinning: the picker opens under its own item, and saving still
       reaches `onSaved` and still drops the tick BEFORE the recomputed numbers
       arrive. Nothing about the reservation door itself changed. */
    fireEvent.click(await screen.findByTestId("ready-stock-toggle-l1"));
    const row = await screen.findByTestId(
      "ready-stock-unit-33333333-0000-0000-0000-00000000000a",
    );
    fireEvent.click(within(row).getByRole("checkbox"));
    fireEvent.click(screen.getByTestId("ready-stock-save-l1"));

    await waitFor(() =>
      expect(screen.queryByTestId("so-batch-issue")).not.toBeInTheDocument(),
    );
    /* And the act says what it did, in Units. */
    expect(screen.getByTestId("ready-stock-act-l1")).toHaveTextContent(
      "1 Unit on this item line",
    );
  });

  it("leaves another order's tick alone", async () => {
    answerReadyStock();
    renderRegister();
    fireEvent.click(screen.getByTestId("so-batch-select-o3"));
    fireEvent.click(screen.getByTestId("so-batch-expand-o1"));
    fireEvent.click(await screen.findByTestId("ready-stock-toggle-l1"));
    const row = await screen.findByTestId(
      "ready-stock-unit-33333333-0000-0000-0000-00000000000a",
    );
    fireEvent.click(within(row).getByRole("checkbox"));
    fireEvent.click(screen.getByTestId("ready-stock-save-l1"));
    await screen.findByTestId("ready-stock-act-l1");
    fireEvent.click(screen.getByTestId("so-batch-issue"));
    expect(onIssue).toHaveBeenCalledWith([
      { demandId: "build::o3::b3", allocations: [{ destinationId: KLANG, qty: 1 }] },
    ]);
  });
});


describe("approved PO Safety Days column", () => {
  /**
   * ⭐ THE MARGIN, NOT THE DATE — owner ruling 2026-09-18.
   *
   * The parent states the TIGHTEST margin over exactly the leaves the parent
   * checkbox would tick, and the number is the SERVER's. Nothing to buy prints
   * nothing; a margin nobody could measure prints the governed absence word,
   * never a `0`.
   */
  it("shows the tightest measured margin and ignores covered leaves", () => {
    const original = data();
    const rows: PurchaseDemandRow[] = original.rows.map((r) => ({
      ...r,
      orderBy: "2026-09-25",
      safetyDaysLeft: 9,
    }));
    rows.push(leaf({ id: "covered", orderBy: "2026-01-01", safetyDaysLeft: 1, fullyOnPo: true }));
    renderRegister({ rows });
    expect(screen.getByTestId("so-batch-safety-days-o1")).toHaveTextContent("9");
    expect(screen.getByTestId("so-batch-safety-days-o5")).toBeEmptyDOMElement();
  });

  it("never prints a `0` for a margin the engine did not measure", () => {
    const rows: PurchaseDemandRow[] = data().rows.map((r) => ({
      ...r,
      safetyDaysLeft: null,
    }));
    renderRegister({ rows });
    const cell = screen.getByTestId("so-batch-safety-days-o1");
    expect(cell).not.toHaveTextContent("0");
    expect(cell).toHaveTextContent("Not planned");
  });

  it("names a production overrun rather than a negative number", () => {
    const rows: PurchaseDemandRow[] = data().rows.map((r) => ({
      ...r,
      safetyDaysLeft: -2,
    }));
    renderRegister({ rows });
    const cell = screen.getByTestId("so-batch-safety-days-o1");
    expect(cell).toHaveTextContent("Production late");
    expect(cell).not.toHaveTextContent("-2");
  });

  it("names blocked planning and leaves the no-PO destination blank", () => {
    renderRegister();
    expect(screen.getByTestId("so-batch-safety-days-o4")).toHaveTextContent("Not planned");
    expect(screen.getByTestId("so-batch-deliver-to-o4")).toBeEmptyDOMElement();
  });

  it("explains denied Issue authority in the selected toolbar", () => {
    renderRegister({ mayIssue: false });
    fireEvent.click(screen.getByTestId("so-batch-select-o1"));
    expect(screen.getByText("Only Operation staff can issue this PO")).toBeInTheDocument();
  });
});


describe("two truthful groups on one permanent Register", () => {
  it("retains unfinished and completed records without automatic grouping", () => {
    renderRegister({}, false);
    expect(screen.queryByText("No purchase needed")).not.toBeInTheDocument();
    for (const id of ["o1", "o3", "o4", "o5", "o6", "o7", "o8"]) expect(screen.getByTestId(`so-batch-row-${id}`)).toBeInTheDocument();
    expect(screen.getByTestId("so-batch-footer")).toHaveTextContent("7 Sales Orders");
  });
});


describe("search, clear and default buying order", () => {
  it.each(["PO-20260822-3333", "PO-260822-3333"])("finds the same SO by original or displayed PO identity: %s", async query => {
    renderRegister({}, false);
    fireEvent.click(screen.getByRole("button", { name: "Search" }));
    fireEvent.change(screen.getByRole("searchbox", { name: "Search" }), { target: { value: query } });
    await waitFor(() => expect(screen.queryByTestId("so-batch-row-o1")).not.toBeInTheDocument());
    expect(screen.getByTestId("so-batch-row-o7")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("so-batch-po-link-o7"));
    expect(navigate).toHaveBeenCalledWith("/operation/procurement?po=PO-20260822-3333");
  });
  it("sorts unfinished work by Proceed Date before completed work", () => {
    const registerRows = data().registerRows.map(order => ({ ...order, proceededAt: order.orderId === "o1" ? "2026-09-01" : "2026-09-02" }));
    const { container } = renderRegister({ registerRows }, false);
    const ids = [...container.querySelectorAll('[data-testid^="so-batch-row-"]')].map(row => row.getAttribute("data-testid"));
    expect(ids.indexOf("so-batch-row-o1")).toBeLessThan(ids.indexOf("so-batch-row-o3"));
    expect(ids.indexOf("so-batch-row-o3")).toBeLessThan(ids.indexOf("so-batch-row-o5"));
  });
  it("search reveals a covered order and no match offers a complete clear", async () => {
    renderRegister({}, false);
    fireEvent.click(screen.getByRole("button", { name: "Search" }));
    fireEvent.change(screen.getByRole("searchbox", { name: "Search" }), { target: { value: "SO-1400" } });
    await waitFor(() => expect(screen.getByTestId("so-batch-row-o5")).toBeInTheDocument());
    fireEvent.change(screen.getByRole("searchbox", { name: "Search" }), { target: { value: "NOT-A-REAL-SO" } });
    await screen.findByText("No Sales Orders match these filters");
    fireEvent.click(screen.getByRole("button", { name: "Clear filters" }));
    await waitFor(() => expect(screen.getByTestId("so-batch-row-o1")).toBeInTheDocument());
    expect(screen.getByTestId("so-batch-footer")).toHaveTextContent("7 Sales Orders");
  });
});

describe("owner rulings R1–R6, 2026-09-16 — one table, two groups", () => {
  /* Group-local headers (Jess, 2026-09-18): each group is its own table, its
     heading riding in that table's `<thead>` beside its column header. Reading
     both sections keeps the document order this test is about. */
  const rowsIn = (container: HTMLElement) =>
    [...container.querySelectorAll("thead tr, tbody tr")].map((tr) =>
      tr.getAttribute("data-testid") ?? tr.textContent ?? "");

  it("R1 — Done records remain visible below unfinished records", () => {
    const { container } = renderRegister({}, false);
    expect(screen.queryByTestId("grid-group-toggle-no-purchase-needed")).not.toBeInTheDocument();
    const rows = rowsIn(container).filter(row => row.startsWith("so-batch-row-"));
    for (const id of ["o1", "o3", "o4", "o8"]) expect(rows.indexOf(`so-batch-row-${id}`)).toBeLessThan(rows.indexOf("so-batch-row-o6"));
    expect(screen.getByTestId("so-batch-status-o6")).toHaveTextContent("Done");
    expect(screen.getByTestId("so-batch-select-o6")).toBeDisabled();
  });

  it("R1 — a search match inside the collapsed group is revealed, and clearing restores all retained records", async () => {
    renderRegister({}, false);
    const input = screen.getByTestId("search-box").querySelector("input")!;
    fireEvent.change(input, { target: { value: "STOCKED" } });
    expect(await screen.findByTestId("so-batch-row-o6")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("search-clear"));
    await waitFor(() => expect(screen.getByTestId("so-batch-row-o6")).toBeInTheDocument());
    expect(input.value).toBe("");
  });

  it("R2 — planning urgency does not override Proceed Date order", () => {
    const registerRows = data().registerRows.map(order => ({ ...order, proceededAt: order.orderId === "o4" ? "2026-08-01" : "2026-08-02" }));
    const { container } = renderRegister({ registerRows }, false);
    const rows = rowsIn(container).filter(row => row.startsWith("so-batch-row-"));
    expect(rows[0]).toBe("so-batch-row-o4");
    expect(screen.getByTestId("so-batch-safety-days-o4")).toHaveTextContent("Not planned");
  });

  it("R6 — the footer carries one total, singular for one order", () => {
    renderRegister({ registerRows: [ORDER_O1], rows: [LEAF_O1] }, false);
    expect(screen.getByTestId("so-batch-footer").textContent).toBe("1 Sales Order");
  });

  it("R4 — the search box, its active query and its clear control are on the toolbar", () => {
    renderRegister({}, false);
    const box = screen.getByTestId("search-box");
    expect(screen.getByTestId("search-icon")).toBeInTheDocument();
    fireEvent.change(box.querySelector("input")!, { target: { value: "Kimmy" } });
    expect(box).toHaveAttribute("data-active", "true");
    expect(screen.getByTestId("search-icon")).toHaveAttribute("data-hidden", "true");
    expect(screen.getByRole("button", { name: "Clear search" })).toBeInTheDocument();
  });

  it("R5 — a ticked row is marked as ticked; an expanded unticked row is not", () => {
    renderRegister({}, false);
    fireEvent.click(screen.getByTestId("so-batch-expand-o3"));
    expect(screen.getByTestId("so-batch-row-o3").className).not.toMatch(/trTicked/);
    fireEvent.click(screen.getByTestId("so-batch-select-o1"));
    expect(screen.getByTestId("so-batch-row-o1").className).toMatch(/trTicked/);
    expect(source()).toContain('palette="slate"');
    expect(source()).toContain('searchPresentation="responsive"');
  });
});

describe("a PO window opens pre-ticked (Purchasing §5.6.1, owner ruling 2026-09-25)", () => {
  function renderWindow() {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const onClear = vi.fn();
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={["/operation?tab=purchase&window=2026-09-25T11:30"]}>
          <SoBatchRegister
            data={data()}
            isLoading={false}
            onIssue={onIssue}
            scope={{ label: "11:30 AM PO window · Fri, 25 Sep", onClear, preselectKey: "2026-09-25T11:30" }}
          />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    return { onClear };
  }

  it("every eligible line of the window is ticked, and the window is named with Clear filters", () => {
    onIssue.mockClear();
    const { onClear } = renderWindow();
    expect(screen.getByTestId("so-batch-window-scope")).toHaveTextContent("11:30 AM PO window · Fri, 25 Sep");
    // The server already scoped the read to the window; every eligible line in it is ticked.
    expect(screen.getByTestId("selection-bar")).toHaveTextContent("3 Sales Orders · 4 items · 5 units · Issue 2 POs");
    fireEvent.click(screen.getByTestId("so-batch-issue"));
    expect(onIssue).toHaveBeenCalledWith(expect.arrayContaining([
      { demandId: "build::o1::b1", allocations: [{ destinationId: KLANG, qty: 2 }] },
    ]));
    fireEvent.click(screen.getByRole("button", { name: "Clear filters" }));
    expect(onClear).toHaveBeenCalled();
  });

  it("a line the operator unticks stays unticked", () => {
    renderWindow();
    fireEvent.click(screen.getByTestId("so-batch-select-o1"));
    expect(screen.getByTestId("so-batch-select-o1")).not.toBeChecked();
    expect(screen.getByTestId("selection-bar")).toHaveTextContent("2 Sales Orders");
  });
});

/**
 * ⭐ THE TWO-LINE STATUS RULE — owner ruling 2026-09-28, Purchasing §9.1.
 *
 * `Status` keeps its governed first line. When a `To buy` order cannot be
 * ticked, line two says WHY in plain words — read from the same projection
 * the refused tick reads — and, where a door exists, the next step.
 */
describe("the two-line Status rule", () => {
  function blockedOrder(state: PurchaseDemandRow["state"], over: Partial<PurchaseDemandRow> = {}) {
    const blocked = leaf({
      id: `build::ob::${state}`,
      orderId: "ob",
      so: 1500,
      customer: "BLOCKED ONE",
      lineIds: ["lb1"],
      skus: ["B1201S-K"],
      state,
      ...over,
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
    return { rows: [blocked], registerRows: [order] };
  }

  /* ⭐ ONE WORD IN THE CELL, THE STRIPE ON THE ROW (owner ruling 2026-09-29,
     replacing the 2026-09-28 two-line Status). The reason is the row's hover
     title and screen-reader description; the door lives on the item line in
     the expansion. */
  const rowOf = (orderId: string) => screen.getByTestId(`so-batch-status-${orderId}`).closest("tr")!;
  async function itemLineWhy(orderId: string, lineId: string) {
    fireEvent.click(screen.getByTestId(`so-batch-expand-${orderId}`));
    const box = await screen.findByTestId(`so-batch-inspector-${orderId}`);
    return within(box).getByTestId(`so-batch-line-status-why-${lineId}`);
  }

  it("a To-buy order blocked by a missing SKU reads one word, a red stripe, and `Fix in Catalog` on the item line", async () => {
    renderRegister(blockedOrder("no_sku"));
    const cell = screen.getByTestId("so-batch-status-ob");
    expect(cell).toHaveTextContent(/^Pending$/);
    expect(screen.queryByTestId("so-batch-status-why-ob")).toBeNull();
    expect(rowOf("ob")).toHaveAttribute("data-row-highlight", "critical");
    expect(rowOf("ob").getAttribute("title")).toContain("SKU not found");
    const why = await itemLineWhy("ob", "lb1");
    expect(why).toHaveTextContent("SKU not found");
    fireEvent.click(within(why).getByRole("button", { name: "Fix in Catalog" }));
    expect(navigate).toHaveBeenCalledWith("/operation?tab=op-catalog");
  });

  it("a missing production-days setting opens Purchasing Settings from the item line", async () => {
    renderRegister(blockedOrder("no_production_days"));
    expect(rowOf("ob")).toHaveAttribute("data-row-highlight", "critical");
    const why = await itemLineWhy("ob", "lb1");
    expect(why).toHaveTextContent("Production days not set");
    fireEvent.click(within(why).getByRole("button", { name: "Open Settings" }));
    expect(navigate).toHaveBeenCalledWith("/operation/settings/purchasing");
  });

  it("a missing customer date names the fact on the row and offers no door", () => {
    renderRegister(blockedOrder("no_customer_date"));
    expect(rowOf("ob")).toHaveAttribute("data-row-highlight", "critical");
    expect(rowOf("ob").getAttribute("title")).toContain("Customer delivery date is missing");
    expect(within(screen.getByTestId("so-batch-status-ob")).queryByRole("button")).toBeNull();
  });

  it("an order already covered by an open PO says so on the row, not only in PO Safety Days", () => {
    renderRegister(blockedOrder("can_order_early", { fullyOnPo: true }));
    expect(rowOf("ob").getAttribute("title")).toContain("Already on a PO");
  });

  /* ⭐ RESERVE GOODS ALREADY ON A PO (owner ruling 2026-09-28). */
  function coveredWithOffer(line: Record<string, unknown>) {
    const base = blockedOrder("can_order_early", { fullyOnPo: true });
    const order = base.registerRows[0]!;
    return { ...base, registerRows: [{ ...order, lines: [{ ...order.lines[0]!, ...line }] }] };
  }

  it("a pool-covered line: blue stripe `{PO No} has {n} {Item} available.`, and `Use this PO` on the item line", async () => {
    renderRegister(coveredWithOffer({ poOffer: { poId: "PO260924-4827", qty: 2 } }));
    expect(screen.getByTestId("so-batch-status-ob")).toHaveTextContent(/^Pending$/);
    expect(rowOf("ob")).toHaveAttribute("data-row-highlight", "info");
    expect(rowOf("ob").getAttribute("title")).toBe("PO260924-4827 has 2 Booqit King available.");
    const why = await itemLineWhy("ob", "lb1");
    expect(why).toHaveTextContent("PO260924-4827 has 2 Booqit King available.");
    expect(why).not.toHaveTextContent("Already on a PO");
    fireEvent.click(within(why).getByRole("button", { name: "Use this PO" }));
    await waitFor(() =>
      expect(apiFetch).toHaveBeenCalledWith(
        "/api/operation/purchase/demands/ready-stock/use-po",
        expect.objectContaining({ method: "POST" }),
      ),
    );
    const call = apiFetch.mock.calls.find((c) => c[0] === "/api/operation/purchase/demands/ready-stock/use-po")!;
    expect(JSON.parse((call[1] as { body: string }).body)).toEqual({
      orderId: "ob", orderLineId: "lb1", poId: "PO260924-4827",
    });
  });

  it("the offer never blocks buying: a pool-only line stays tickable and wears the blue stripe", () => {
    const base = blockedOrder("can_order_early", { fullyOnPo: true, poolOnly: true, orderBy: "2026-10-01" });
    const order = base.registerRows[0]!;
    renderRegister({
      ...base,
      registerRows: [{ ...order, lines: [{ ...order.lines[0]!, poOffer: { poId: "PO260924-4827", qty: 2 } }] }],
    });
    expect(screen.getByTestId("so-batch-select-ob")).toBeEnabled();
    expect(rowOf("ob")).toHaveAttribute("data-row-highlight", "info");
    expect(rowOf("ob").getAttribute("title")).toBe("PO260924-4827 has 2 Booqit King available.");
  });

  it("a line covered by exact lineage (no poolOnly) stays refused", () => {
    renderRegister(coveredWithOffer({ poOffer: { poId: "PO260924-4827", qty: 2 } }));
    expect(screen.getByTestId("so-batch-select-ob")).toBeDisabled();
  });

  it("a PO balance that could not be read says `Coverage not checked`, never a number", async () => {
    renderRegister(coveredWithOffer({ poOfferUnread: true }));
    expect(rowOf("ob").getAttribute("title")).toContain("Coverage not checked");
    const why = await itemLineWhy("ob", "lb1");
    expect(why).toHaveTextContent("Coverage not checked");
    expect(within(why).queryByRole("button")).toBeNull();
  });

  it("goods reserved on a PO read `No PO needed` with a blue stripe; the item line names the PO", async () => {
    const order = orderRow({
      orderId: "or",
      so: 1501,
      customer: "RESERVED ONE",
      status: "blank",
      lines: [
        { orderLineId: "lr1", sku: "B1201S-K", qty: 1, stockTaken: 0, item: "Booqit", variant: "King",
          category: "mattress", pos: [], poReserved: [{ poId: "PO260924-4827", qty: 1 }] },
      ],
    });
    renderRegister({ rows: [], registerRows: [order] });
    expect(screen.getByTestId("so-batch-status-or")).toHaveTextContent(/^Done$/);
    expect(rowOf("or")).toHaveAttribute("data-row-highlight", "info");
    expect(rowOf("or").getAttribute("title")).toBe("1 Booqit King on PO260924-4827 is reserved for this order.");
    expect(await itemLineWhy("or", "lr1"))
      .toHaveTextContent("1 Booqit King on PO260924-4827 is reserved for this order.");
  });

  it("a tickable order carries one word and no stripe", () => {
    renderRegister();
    expect(screen.getByTestId("so-batch-status-o1")).toHaveTextContent(/^Pending$/);
    expect(rowOf("o1")).not.toHaveAttribute("data-row-highlight");
  });

  it("the item line's Status carries the same second line and door", async () => {
    renderRegister(blockedOrder("no_sku"));
    fireEvent.click(screen.getByTestId("so-batch-expand-ob"));
    const box = await screen.findByTestId("so-batch-inspector-ob");
    const status = within(box).getByTestId("goods-status-lb1").closest("td")!;
    expect(status).toHaveTextContent("Pending");
    expect(status).toHaveTextContent("SKU not found");
    expect(within(status).getByRole("button", { name: "Fix in Catalog" })).toBeInTheDocument();
  });
});

describe("Order time contains configured cutoffs, not dated occurrence records", () => {
  it("shows two times once despite repeated dates and selects the time", () => {
    const onSelect = vi.fn();
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={client}><MemoryRouter>
      <SoBatchRegister data={data({ poCutoffTimes: ["11:00", "16:00"], rows: data().rows.map(leaf => ({ ...leaf, poWindow: leaf.orderId === "o1" ? "2026-09-01T11:00" : leaf.orderId === "o3" ? "2026-09-04T11:00" : "2026-09-04T16:00" })) })} isLoading={false} onIssue={onIssue}
        roundNavigation={{ selected: null, onSelect, rounds: [
          { key: "2026-09-01T11:00", unfinishedSoCount: 1 },
          { key: "2026-09-04T11:00", unfinishedSoCount: 2 },
          { key: "2026-09-04T16:00", unfinishedSoCount: 1 },
        ] }} />
    </MemoryRouter></QueryClientProvider>);
    expect(screen.getAllByText("11:00 AM")).toHaveLength(1);
    expect(screen.getAllByText("4:00 PM")).toHaveLength(1);
    expect(screen.getByText("11:00 AM").closest("button")).toHaveTextContent("2");
    expect(screen.queryByText("Tue, 1 Sep")).not.toBeInTheDocument();
    fireEvent.click(screen.getByText("11:00 AM"));
    expect(onSelect).toHaveBeenCalledWith("11:00");
  });
});

/* ONE ROW MENU — owner ruling 2026-10-05: `View · Print`, then this register's
   own `Open {PO}` after one divider. Double-click keeps the quick card. */
describe("one row menu: View · Print", () => {
  it("reads View · Print · ─ Open {PO} on a one-PO order", () => {
    renderRegister({ registerRows: [ORDER_O3] }, false);
    fireEvent.contextMenu(screen.getByTestId("so-batch-row-o3"));
    const menu = screen.getByRole("menu", { name: "Row actions" });
    expect(within(menu).getAllByRole("menuitem").map((i) => i.textContent)).toEqual([
      "View", "Print", "Open PO-260820-4827",
    ]);
    expect(within(menu).getAllByRole("separator")).toHaveLength(1);
  });

  it("View opens the Sales Order's full read-first page; Print prints that SO", () => {
    printSalesOrdersSpy.mockClear();
    navigate.mockClear();
    renderRegister({ registerRows: [ORDER_O3] }, false);
    fireEvent.contextMenu(screen.getByTestId("so-batch-row-o3"));
    fireEvent.click(screen.getByRole("menuitem", { name: "View" }));
    expect(navigate).toHaveBeenLastCalledWith("/operation/orders/so/o3");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    fireEvent.contextMenu(screen.getByTestId("so-batch-row-o3"));
    fireEvent.click(screen.getByRole("menuitem", { name: "Print" }));
    expect(printSalesOrdersSpy).toHaveBeenCalledWith([{ id: "o3" }]);
  });

  it("double-click still opens the quick card, unchanged", () => {
    navigate.mockClear();
    renderRegister({ registerRows: [ORDER_O3] }, false);
    fireEvent.doubleClick(screen.getByTestId("so-batch-row-o3"));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(navigate).not.toHaveBeenCalled();
  });
});

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within, act } from "@testing-library/react";
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
/* `Use stock` says what it reserved in a toast; the suite reads that one call. */
const toastSuccess = vi.hoisted(() => vi.fn());
vi.mock("sonner", async () => {
  const actual = await vi.importActual<typeof import("sonner")>("sonner");
  return { ...actual, toast: Object.assign(actual.toast, { success: toastSuccess }) };
});
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
const defaultApi = async (path?: unknown, ..._a: unknown[]) => {
  if (typeof path === "string" && path.endsWith("/ready-stock")) {
    return EMPTY_READY_STOCK as unknown as SalesOrderExpansionResponse;
  }
  return {
    defaultDeliverTo: null,
    place: [],
    lines: [] as { lineId: string; sku: string; unitIds: string[]; deliverTo: Array<{ name: string; qty: number }> }[],
  } as SalesOrderExpansionResponse;
};
const apiFetch = vi.fn(defaultApi);
vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return { ...actual, apiFetch: (...a: unknown[]) => apiFetch(...a) };
});

import { ApiError } from "@/lib/api";
import SoBatchRegister from "./SoBatchRegister";

/**
 * SO BATCH PURCHASE — THE PERMANENT ORDER REGISTER
 * (CARD 02-B, owner ruling 2026-08-27; `docs/purchasing/MASTER.md` §9.1).
 *
 * One row per proceeded Sales Order, and the record never leaves the Register
 * when a purchase order is issued (`All` holds every one). These tests hold
 * the approved shape of `By sales order` since 13 Oct 2026, round 3: the five
 * columns in their order on 54 rows, the governed Status words with every PO
 * number as a link under the pill, `To buy` · `Ordered` · `All`, PO
 * attribution drawn only from what the server's lineage sent, the parent
 * checkbox standing for ALL eligible child demand, and an opened row drawn as
 * the list's own item rows — with no second `Purchase order details` table
 * (owner ruling 2026-10-06). The shared goods table lives in the quick view.
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

/** Opens the one view button and chooses a grouping (owner 13 Oct 2026). */
function pickView(name: string) {
  fireEvent.click(screen.getByTestId("so-batch-view"));
  fireEvent.click(within(screen.getByRole("menu", { name: "SO Batch Purchase view" })).getByRole("menuitemradio", { name }));
}

/**
 * `show` is the page's `To buy` · `Ordered` · `All` tab (URL `show`). The page
 * itself opens on `To buy`. By sales order is the permanent Register, and most
 * of its tests read records that are already bought, so THIS helper opens that
 * view on `All` unless a test asks for a tab by name. The other three
 * groupings keep the page's own default.
 */
type Shown = "buy" | "ordered" | "all";
function renderRegister(over: Partial<SoBatchPurchaseResponse> = {}, expandHistory = true, isLoading = false, view: "table" | "supplier" | "category" | "deadline" | "cards" = "table", show: Shown = view === "table" ? "all" : "buy") {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const query = [view === "supplier" ? "" : `&view=${view}`, show === "buy" ? "" : `&show=${show}`].join("");
  const rendered = render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[`/operation?tab=purchase${query}`]}>
        <SoBatchRegister sessionKey={expect.getState().currentTestName} data={data(over)} isLoading={isLoading} onIssue={onIssue} onOpenPurchaseOrders={onOpenPurchaseOrders} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  if (expandHistory) { const group = screen.queryByText("No purchase needed"); if (group) fireEvent.click(group); }
  return rendered;
}

/** Search is an icon on the toolbar (as on By supplier): press it, then type. */
function searchFor(query: string) {
  const open = screen.queryByRole("button", { name: "Search" });
  if (open) fireEvent.click(open);
  const box = screen.getByRole("searchbox", { name: "Search" });
  fireEvent.change(box, { target: { value: query } });
  return box;
}

/**
 * While a line is ticked the selection bar stands where the toolbar was. The
 * ticks are the same in every grouping, so the view button is on the bar too,
 * as one small button (owner 13 Oct 2026, round 3): the grouping is changed
 * there and every tick is kept.
 */
function pickViewWhileTicked(name: string) {
  expect(within(screen.getByTestId("selection-bar")).getByTestId("so-batch-view")).toBeInTheDocument();
  pickView(name);
}

/** `Purchase Orders` is in the ⋮ menu (the toolbar keeps one line at 1025). */
function purchaseOrdersItem(): HTMLElement {
  fireEvent.keyDown(screen.getByRole("button", { name: "Page tools" }), { key: "Enter" });
  return screen.getByRole("menuitem", { name: "Purchase Orders" });
}

/** The selection bar's buttons by their words; the small view button has none. */
const barButtons = () => within(screen.getByTestId("selection-bar")).getAllByRole("button")
  .filter((button) => button.getAttribute("data-testid") !== "so-batch-view").map((button) => button.textContent);

/** The words under and beside a row's Status pill, without its PO numbers. */
const statusLines = (orderId: string) =>
  [...screen.getByTestId(`so-batch-status-${orderId}`).children]
    .filter((el) => !el.querySelector(`[data-testid="so-batch-po-${orderId}"]`))
    .map((el) => el.textContent ?? "");

/** The quick view: press the row's SO number. It holds the order's own card,
 *  with the facts whose columns left the list (owner 13 Oct 2026, round 3). */
function openQuickView(orderId: string): HTMLElement {
  fireEvent.click(screen.getByTestId(`so-batch-so-link-${orderId}`));
  return screen.getByRole("dialog");
}
function closeQuickView() {
  fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Close panel" }));
}
/** One fact on the quick view's summary strip: its label and its value. */
const quickFact = (panel: HTMLElement, label: string) => within(panel).getByText(label).parentElement!;
/** The quick view's own goods table (the shared child table lives only here now). */
function quickGoods(panel: HTMLElement): HTMLElement {
  fireEvent.click(within(panel).getByRole("button", { name: "Items" }));
  return within(panel).getByTestId("goods-mini-table");
}

it("shows the original request while keeping purchasing planning facts separate", () => {
  renderRegister({ registerRows: [{ ...ORDER_O1, requestedDeliveryDate: "2026-12-01", originalRequestedDeliveryDate: "2026-08-01" }] });
  /* A two-line date cell: the day, then its weekday under it. */
  expect(screen.getByTestId("so-batch-requested-o1").textContent).toBe("1 AugSat");
  expect(screen.getByTestId("so-batch-requested-o1")).not.toHaveTextContent("Dec");
});

it("never substitutes the current request when original-date evidence is missing", () => {
  renderRegister({ registerRows: [{ ...ORDER_O1, requestedDeliveryDate: "2026-12-01", originalRequestedDeliveryDate: null }] });
  expect(screen.getByTestId("so-batch-requested-o1")).toHaveTextContent("Not recorded");
  expect(screen.getByTestId("so-batch-requested-o1")).not.toHaveTextContent("Dec");
});

/* Owner 13 Oct 2026: `Match Ready Stock` was never agreed and the Cards view
   is gone. Neither may come back on any grouping. */
it("has no Match Ready Stock button and no Cards view, in any grouping", () => {
  renderRegister({ readyStockPriority: "customer_delivery", registerRows: [ORDER_O1], rows: [LEAF_O1] });
  for (const name of ["By sales order", "By supplier", "By category", "By order deadline"]) {
    pickView(name);
    expect(screen.queryByRole("button", { name: "Match Ready Stock" })).not.toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: "Cards" })).not.toBeInTheDocument();
    expect(screen.queryByTestId("so-batch-cards")).not.toBeInTheDocument();
  }
  expect(apiFetch).not.toHaveBeenCalled();
});

it("an old Cards link opens By supplier", () => {
  renderRegister({ registerRows: [ORDER_O1], rows: [LEAF_O1] }, true, false, "cards");
  expect(screen.getByTestId("so-batch-view")).toHaveTextContent("By supplier");
  expect(screen.queryByTestId("so-batch-cards")).not.toBeInTheDocument();
  expect(screen.getAllByTestId(/^by-supplier-row-/).length).toBeGreaterThan(0);
});

it("the search and the buying ticks stay when the grouping changes", async () => {
  renderRegister({ registerRows: [ORDER_O1, ORDER_O3], rows: [LEAF_O1, LEAF_O3] });
  searchFor("Kimmy");
  await waitFor(() => expect(screen.queryByTestId("so-batch-row-o3")).not.toBeInTheDocument());
  fireEvent.click(screen.getByTestId("so-batch-select-o1"));
  /* The selection bar stands where the toolbar was, with the view button on it. */
  pickViewWhileTicked("By category");
  /* The category list is drawn, with the same tick on its row. */
  expect(screen.queryByTestId("so-batch-row-o1")).not.toBeInTheDocument();
  expect(screen.getAllByTestId(/^by-supplier-row-/).length).toBeGreaterThan(0);
  expect(screen.getByTestId("selection-bar")).toBeInTheDocument();
  pickViewWhileTicked("By sales order");
  expect(screen.getByTestId("so-batch-select-o1")).toBeChecked();
  fireEvent.click(screen.getByTestId("so-batch-select-o1")); // the selection bar gives the toolbar back
  expect(screen.getByRole("searchbox")).toHaveValue("Kimmy");
  expect(screen.queryByTestId("so-batch-row-o3")).not.toBeInTheDocument();
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

/* BY SUPPLIER (owner 12 Oct 2026; Purchasing MASTER §9.1): the same demand,
   one row per supplier and category. It replaces the earlier `Group by:
   Supplier` page tool, which only regrouped the Sales Order rows. */
describe("By supplier view", () => {
  /* ONE VIEW BUTTON (owner 13 Oct 2026, the design file's `By supplier ▾`). */
  it("is the page's first view; one button holds the four groupings and the column sets", () => {
    renderRegister({ registerRows: [ORDER_O1, ORDER_O8], rows: [LEAF_O1, LEAF_O8A, LEAF_O8B] }, true, false, "supplier");
    expect(screen.getByTestId("so-batch-view")).toHaveTextContent("By supplier");
    expect(screen.queryByTestId("so-batch-row-o8")).not.toBeInTheDocument();
    expect(screen.getByTestId("by-supplier-footer")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("so-batch-view"));
    const menu = screen.getByRole("menu", { name: "SO Batch Purchase view" });
    expect(within(menu).getByText("GROUP BY")).toBeInTheDocument();
    expect(within(menu).getByText("SHOW COLUMNS FOR")).toBeInTheDocument();
    const items = within(menu).getAllByRole("menuitemradio");
    expect(items.map((item) => item.textContent?.replace("check", "").trim())).toEqual(
      ["By supplier", "By sales order", "By category", "By order deadline", "Purchasing"]);
    expect(items[0]).toHaveAttribute("aria-checked", "true");
    expect(items[1]).toHaveAttribute("aria-checked", "false");
    /* The other modules' columns are not read by this page yet: named, and off. */
    const later = within(menu).getAllByRole("menuitem");
    expect(later.map((item) => item.textContent)).toEqual(
      ["Overview", "Sales Order", "Warehouse", "Payment", "Delivery", "Service"].map((name) => `${name}Coming soon`));
    for (const item of later) expect(item).toBeDisabled();
    fireEvent.click(within(menu).getByRole("menuitemradio", { name: /By sales order/ }));
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(screen.getByTestId("so-batch-view")).toHaveTextContent("By sales order");
    expect(screen.getByTestId("so-batch-row-o8")).toBeInTheDocument();
  });

  it("By category is one row per category, and each line names its supplier", () => {
    const sofaLeaf = { ...LEAF_O8B, id: "leaf-sofa", category: "sofa" } as typeof LEAF_O8B;
    renderRegister({ registerRows: [ORDER_O1, ORDER_O8], rows: [LEAF_O1, LEAF_O8A, sofaLeaf] }, true, false, "category");
    expect(screen.getByTestId("so-batch-view")).toHaveTextContent("By category");
    const heads = screen.getAllByRole("columnheader").map((h) => h.textContent?.replace(/\s+/g, " ").trim()).filter(Boolean);
    expect(heads.slice(-5)).toEqual(["Category", "Items", "Sales orders", "Suppliers", "Status"]);
    const rows = screen.getAllByTestId(/^by-supplier-row-/);
    expect(new Set(rows.map((row) => row.getAttribute("data-testid"))).size).toBe(rows.length);
    expect(rows.some((row) => /Sofa/.test(row.textContent ?? ""))).toBe(true);
    fireEvent.click(within(rows[0]!).getAllByRole("button")[0]!);
    const key = rows[0]!.getAttribute("data-testid")!.replace("by-supplier-row-", "");
    const lines = screen.getByTestId(`by-supplier-lines-${key}`);
    expect(within(lines).getAllByRole("columnheader").map((h) => h.textContent)).toEqual(
      expect.arrayContaining(["Item", "Sales order", "Supplier", "Supplier delivers to"]));
  });

  it("By order deadline groups by the day to order by, and never says Overdue", () => {
    renderRegister({ registerRows: [ORDER_O1, ORDER_O8], rows: [LEAF_O1, LEAF_O8A, LEAF_O8B] }, true, false, "deadline");
    expect(screen.getByTestId("so-batch-view")).toHaveTextContent("By order deadline");
    const heads = screen.getAllByRole("columnheader").map((h) => h.textContent?.replace(/\s+/g, " ").trim()).filter(Boolean);
    expect(heads.slice(-5)).toEqual(["Order PO deadline", "Items", "Sales orders", "Suppliers", "Status"]);
    expect(screen.getAllByTestId(/^by-supplier-row-/).length).toBeGreaterThan(0);
    expect(document.body.textContent).not.toMatch(/Overdue|Missed/);
  });

  it("a tick made in By category is the same tick By supplier and By sales order show", () => {
    renderRegister({ registerRows: [ORDER_O1], rows: [LEAF_O1] }, true, false, "category");
    const box = screen.getAllByRole("checkbox").find((b) => /^by-supplier-select-/.test(b.getAttribute("data-testid") ?? ""))!;
    fireEvent.click(box);
    pickViewWhileTicked("By sales order");
    expect(screen.getByTestId("so-batch-select-o1")).toBeChecked();
    pickViewWhileTicked("By order deadline");
    fireEvent.click(screen.getByTestId("so-batch-issue"));
    expect(onIssue).toHaveBeenCalledTimes(1);
    expect(onIssue.mock.calls[0]![0].map((selection: { demandId: string }) => selection.demandId)).toEqual([LEAF_O1.id]);
  });

  /* To buy · Ordered · All, the footer totals and the Today card (owner's
     12 Oct 2026 package). Ordered rows come from the Register's own PO facts. */
  const showBar = () => screen.getByRole("tablist", { name: "SO Batch Purchase shown" });
  it("To buy is the first tab; Ordered shows what is on a PO, with its PO No and no tick", () => {
    renderRegister({ registerRows: [ORDER_O1, ORDER_O3, ORDER_O8], rows: [LEAF_O1, LEAF_O8A, LEAF_O8B] }, true, false, "supplier");
    expect(within(showBar()).getAllByRole("tab").map((tab) => tab.textContent)).toEqual(["To buy", "Ordered", "All"]);
    expect(within(showBar()).getByRole("tab", { name: "To buy" })).toHaveAttribute("aria-selected", "true");
    expect(screen.queryByTestId("by-supplier-row-ordered|s-hooka|mattress")).not.toBeInTheDocument();
    fireEvent.mouseDown(within(showBar()).getByRole("tab", { name: "Ordered" }));
    const ordered = screen.getByTestId("by-supplier-row-ordered|s-hooka|mattress");
    expect(ordered).toHaveTextContent("Hooka");
    expect(ordered).toHaveTextContent("2 pcs");
    expect(within(ordered).getByTestId("by-supplier-status-ordered|s-hooka|mattress")).toHaveTextContent("OrderedPO-260820-4827");
    expect(screen.getByTestId("by-supplier-select-ordered|s-hooka|mattress")).toBeDisabled();
    expect(screen.queryAllByTestId(/^by-supplier-row-/)).toHaveLength(1);
    fireEvent.click(screen.getByTestId("by-supplier-expand-ordered|s-hooka|mattress"));
    /* Item line 1 is the model code as the data spells it, line 2 the size (owner 13 Oct 2026). */
    expect(screen.getByTestId("by-supplier-ordered-line-l3|PO-20260820-4827")).toHaveTextContent("B1201S-KKing2 pcsSO-1330PO-260820-4827");
    fireEvent.mouseDown(within(showBar()).getByRole("tab", { name: "All" }));
    expect(screen.queryAllByTestId(/^by-supplier-row-/).length).toBeGreaterThan(1);
  });

  /* Owner 13 Oct 2026: the footer is the rows' count only; Summary says what is to buy. */
  it("the footer is the rows' count only", () => {
    renderRegister({ registerRows: [ORDER_O1, ORDER_O8], rows: [LEAF_O1, LEAF_O8A, LEAF_O8B] }, true, false, "supplier");
    expect(screen.getByTestId("by-supplier-footer")).toHaveTextContent(/^\d+ groups?$/);
  });

  /* Owner 13 Oct 2026, points 2 to 4 and 9. */
  it("a supplier with rows in two categories names the category on each row", () => {
    const sofaLeaf = { ...LEAF_O8A, id: "build::o8::sofa", category: "sofa" as const, lineIds: ["l81"] };
    renderRegister({ registerRows: [ORDER_O1, ORDER_O8], rows: [LEAF_O1, sofaLeaf] }, true, false, "supplier");
    const names = screen.getAllByTestId(/^by-supplier-name-/).map((cell) => cell.firstElementChild?.textContent);
    expect(names).toEqual(expect.arrayContaining([`${LEAF_O1.supplier} · Mattress`, `${LEAF_O1.supplier} · Sofa`]));
  });

  it("an item line reads model code then size, under the owner's heads, with the list's own tick", () => {
    renderRegister({ registerRows: [ORDER_O1], rows: [LEAF_O1] }, true, false, "supplier");
    const row = screen.getAllByTestId(/^by-supplier-row-/)[0]!;
    fireEvent.click(within(row).getAllByRole("button")[0]!);
    const lines = screen.getByTestId(`by-supplier-lines-${row.getAttribute("data-testid")!.replace("by-supplier-row-", "")}`);
    expect(within(lines).getAllByRole("columnheader").map((h) => h.textContent).filter(Boolean))
      .toEqual(["Item", "To buy", "Sales order", "Order deadline", "Supplier delivers to"]);
    const line = screen.getByTestId(`by-supplier-line-${LEAF_O1.id}`);
    expect(line).toHaveTextContent(/^B1201S-KKing/);
    const tick = within(line).getByRole("checkbox");
    expect(tick.tagName).toBe("INPUT");
    expect(tick).toHaveAttribute("type", "checkbox");
    expect(tick).not.toBeDisabled();
  });

  it("a line that cannot be bought has a disabled tick that says why", () => {
    const onPo = { ...LEAF_O1, fullyOnPo: true, toBuy: 1, poNumbers: ["PO-20260820-4827"] };
    renderRegister({ registerRows: [ORDER_O1], rows: [onPo] }, true, false, "supplier");
    const row = screen.getAllByTestId(/^by-supplier-row-/)[0]!;
    fireEvent.click(within(row).getAllByRole("button")[0]!);
    const tick = within(screen.getByTestId(`by-supplier-line-${LEAF_O1.id}`)).getByRole("checkbox");
    expect(tick).toBeDisabled();
    expect(tick.closest("label")).toHaveAttribute("title");
    expect(tick.closest("label")!.getAttribute("title")!.length).toBeGreaterThan(3);
  });

  it("the Today card leads the rail with To order now and its rows", () => {
    renderRegister({ registerRows: [ORDER_O1, ORDER_O3, ORDER_O8], rows: [LEAF_O1, LEAF_O8A, LEAF_O8B] }, true, false, "supplier");
    const today = screen.getByTestId("so-batch-today");
    expect(within(today).getByTestId("so-batch-today-now")).toHaveTextContent(/^\d+ pcs?To order now$/);
    expect(within(today).getByTestId("so-batch-today-past")).toHaveTextContent(/^Past the order-by date\d+ pcs?$/);
    expect(within(today).getByTestId("so-batch-today-too-late")).toHaveTextContent(/^Too late for customer date\d+$/);
    expect(within(today).getByTestId("so-batch-today-partly")).toHaveTextContent("Partly ordered1");
  });

  it("the old Group by page tool is gone: one way to see demand by supplier", () => {
    renderRegister({ registerRows: [ORDER_O1, ORDER_O8], rows: [LEAF_O1, LEAF_O8A, LEAF_O8B] });
    fireEvent.keyDown(screen.getByRole("button", { name: "Page tools" }), { key: "Enter" });
    expect(screen.getAllByRole("menuitem").length).toBeGreaterThan(0);
    expect(screen.queryByRole("menuitem", { name: /Group by/ })).toBeNull();
  });

  it("draws the six columns in order with the kit's widths", () => {
    renderRegister({ registerRows: [ORDER_O1, ORDER_O8], rows: [LEAF_O1, LEAF_O8A, LEAF_O8B] }, true, false, "supplier");
    const heads = screen.getAllByRole("columnheader").map((h) => h.textContent?.replace(/\s+/g, " ").trim()).filter(Boolean);
    expect(heads.slice(-6)).toEqual(["Supplier", "Items", "Sales orders", "Order PO deadline", "Supplier ready by", "Status"]);
  });

  it("a row tick ticks every line of it that can be bought, and Issue PO takes them", () => {
    renderRegister({ registerRows: [ORDER_O1, ORDER_O8], rows: [LEAF_O1, LEAF_O8A, LEAF_O8B] }, true, false, "supplier");
    const boxes = screen.getAllByRole("checkbox").filter((box) => /^by-supplier-select-/.test(box.getAttribute("data-testid") ?? ""));
    expect(boxes.length).toBeGreaterThan(0);
    fireEvent.click(boxes[0]!);
    fireEvent.click(screen.getByTestId("so-batch-issue"));
    expect(onIssue).toHaveBeenCalledTimes(1);
    expect(onIssue.mock.calls[0]![0].length).toBeGreaterThan(0);
  });

  it("ticks made here are the same ticks By sales order shows", () => {
    renderRegister({ registerRows: [ORDER_O1], rows: [LEAF_O1] }, true, false, "supplier");
    const box = screen.getAllByRole("checkbox").find((b) => /^by-supplier-select-/.test(b.getAttribute("data-testid") ?? ""))!;
    fireEvent.click(box);
    pickViewWhileTicked("By sales order");
    expect(screen.getByTestId("so-batch-select-o1")).toBeChecked();
  });

  /* PARITY (owner instruction 12 Oct 2026): the first view keeps what the By
     sales order list gives a line. Nothing here is a second rule. */
  it("an opened row gives each line the same Supplier Deliver To editor", () => {
    renderRegister({ registerRows: [ORDER_O1], rows: [LEAF_O1] }, true, false, "supplier");
    const row = screen.getAllByTestId(/^by-supplier-row-/)[0]!;
    fireEvent.click(within(row).getAllByRole("button")[0]!);
    const line = screen.getByTestId(`by-supplier-line-${LEAF_O1.id}`);
    expect(within(screen.getByTestId(`by-supplier-lines-${row.getAttribute("data-testid")!.replace("by-supplier-row-", "")}`)).getByText("Supplier delivers to")).toBeInTheDocument();
    expect(within(line).getByTestId(`by-supplier-deliver-${LEAF_O1.id}`).querySelector("select, button, [role=combobox]")).not.toBeNull();
    expect(within(line).getByRole("checkbox")).not.toBeDisabled();
  });
});

it("does not recover POs from an unfinished Register load", () => {
  renderRegister({ readyStockPriority: "customer_delivery" }, false, true);
  expect(screen.queryByRole("button", { name: "Purchase Orders" })).toBeNull();
  const pos = purchaseOrdersItem();
  expect(pos).toHaveAttribute("aria-disabled", "true");
  fireEvent.click(pos);
  expect(apiFetch).not.toHaveBeenCalled();
  expect(onOpenPurchaseOrders).not.toHaveBeenCalled();
});

beforeEach(() => {
  navigate.mockClear();
  xlsx.sheet.mockClear();
  onIssue.mockClear();
  onOpenPurchaseOrders.mockClear();
  /* A test that answers a door its own way must not answer it for the next
     test: every test starts from the suite's empty shelf. */
  apiFetch.mockReset();
  apiFetch.mockImplementation(defaultApi);
  toastSuccess.mockClear();
  localStorage.clear();
});

it("recovers only visible linked POs for supplier preparation after a fresh mount", async () => {
  renderRegister({ registerRows: [ORDER_O3, ORDER_O5] });
  searchFor("ANNE");
  await waitFor(() => expect(screen.queryByTestId("so-batch-row-o5")).toBeNull());
  fireEvent.click(purchaseOrdersItem());
  expect(onOpenPurchaseOrders).toHaveBeenCalledWith(["PO-20260820-4827"]);
  expect(apiFetch.mock.calls.some(([path]) => String(path).includes("issue-batch"))).toBe(false);
});

const HERE = dirname(fileURLToPath(import.meta.url));
const source = () => readFileSync(join(HERE, "SoBatchRegister.tsx"), "utf8");
/** The By sales order view's own file: the list, its columns and its item rows. */
const bySalesOrderSource = () => readFileSync(join(HERE, "SoBatchBySalesOrder.tsx"), "utf8");

/**
 * ⭐ THE FIVE COLUMNS — owner 13 Oct 2026, round 3; Purchasing §9.1.
 *
 * By sales order is drawn on the same list the other three groupings use:
 * `SO no.` (the customer under it) · `Items` · `Proceed date` · `Customer’s
 * original requested delivery` · `Status`. Rows 54, no side scroll. The twelve
 * wide columns of 2026-09-18 are gone from this view; a line's supplier, its
 * `Supplier delivers to` and its PO numbers are on the item rows a Sales Order
 * opens to, and every PO number is on the row's `Status` cell.
 */
/* The list's own header: one `<thead>`, read in the order it is drawn. */
const groupHeaderCells = (root: ParentNode): HTMLElement[] => [
  ...(root.querySelector<HTMLElement>('thead tr:last-child')?.querySelectorAll<HTMLElement>("th") ?? []),
];
describe("the approved columns, in the approved reading order", () => {
  const APPROVED = [
    "SO no.",
    "Items",
    "Proceed date",
    "Customer’s original requested delivery",
    "Status",
  ];

  it("draws exactly the five columns, in the owner's order, on 54 rows", () => {
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
    expect(screen.getByTestId("by-sales-order").querySelector("[data-row-height]")).toHaveAttribute("data-row-height", "54");
  });

  it("the twelve wide columns of the old list are gone from this view", () => {
    const { container } = renderRegister();
    const heads = groupHeaderCells(container).map((el) => el.textContent ?? "");
    for (const gone of [
      "PO Status",
      "SO No",
      "PO Safety Days",
      "Customer Delivery Location",
      "Customer",
      "Supplier",
      "Supplier Deliver To",
      "PO No",
      "PO Delivery Date",
    ]) {
      expect(heads, gone).not.toContain(gone);
    }
    /* Nothing is pinned: five columns fit the page, so nothing scrolls sideways. */
    for (const th of groupHeaderCells(container)) expect(th.style.left).toBe("");
    /* The four fixed columns keep the kit's widths; `SO no.` takes the rest. */
    expect(groupHeaderCells(container).filter((th) => th.title).map((th) => [th.title, th.style.width]).slice(1)).toEqual([
      ["Items", "150px"],
      ["Proceed date", "104px"],
      ["Customer’s original requested delivery", "150px"],
      ["Status", "132px"],
    ]);
  });

  it("says `To buy` / `Ordered` on the row, and a word is not a permission", () => {
    const { container } = renderRegister();
    const text = groupHeaderCells(container).map((el) => el.textContent).join("|");
    expect(text).not.toContain("Partial");
    expect(text).not.toContain("Ordered");
    expect(statusLines("o1")).toEqual(["To buy"]);
    /* A word is not a permission: eligibility still refuses the tick. */
    expect(screen.getByTestId("so-batch-select-o5")).toBeDisabled();
    expect(statusLines("o5")).toEqual(["Ordered"]);
    /* The old one-word row status is gone from every row. */
    for (const id of ["o1", "o3", "o4", "o5", "o6", "o7", "o8"]) {
      expect(screen.getByTestId(`so-batch-status-${id}`).textContent, id).not.toMatch(/Pending|Partial|Done/);
    }
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
    /* The five-column list keeps its own layout under that key, so a stored
       twelve-column arrangement cannot reach it. */
    expect(source()).toContain("storageKey={`${STORAGE_KEY}.bySalesOrder`}");
  });
});

describe("one permanent row per proceeded Sales Order", () => {
  it("draws one parent row per order — including Ordered and fully stock-covered ones", () => {
    renderRegister();
    for (const id of ["o1", "o3", "o4", "o5", "o6", "o7", "o8"]) {
      expect(screen.getByTestId(`so-batch-row-${id}`)).toBeInTheDocument();
    }
  });

  /* The row's Status is one of the page's governed words (owner 13 Oct 2026,
     round 3). The words nobody could act on never return. */
  it("states one governed Status word per row, and none of the retired ones", () => {
    renderRegister();
    expect(["o1", "o3", "o4", "o5", "o6", "o7", "o8"].map((id) => statusLines(id)[0])).toEqual([
      "To buy", "Partly ordered", "To buy", "Ordered", "From ready stock", "Ordered", "To buy",
    ]);
    const page = screen.getByTestId("so-batch-page").textContent ?? "";
    for (const banned of [
      "No buying needed",
      "Cannot buy",
      "Not sent",
      "Posted",
      "Need PO",
      "Pending",
      "Partial",
      "Done",
    ]) {
      expect(page, banned).not.toContain(banned);
    }
  });

  it("a numbered but unsent PO still shows on the row", () => {
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
     carries every PO number, and the PO page holds each document's own
     detail. */
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

  it("the row prints the order's own facts — Proceed date, the original request, the customer under the SO number", () => {
    renderRegister();
    expect(screen.getByTestId("so-batch-proceed-o1").textContent).toBe("20 AugThu");
    expect(screen.getByTestId("so-batch-requested-o1").textContent).toBe("28 AugFri");
    expect(screen.getByTestId("so-batch-so-o1").textContent).toBe("SO-1318Kimmy");
    /* The delivery locality left the list with its column; the quick view
       still names it, and a locality nobody recorded says so, quietly. */
    expect(within(openQuickView("o1")).getByRole("button", { name: "Delivery address" }))
      .toHaveTextContent("Petaling Jaya, Selangor");
    closeQuickView();
    expect(within(openQuickView("o5")).getByRole("button", { name: "Delivery address" }))
      .toHaveTextContent("Not recorded");
  });

  it("names an absent historical handoff, and an absent customer, instead of printing a blank cell", () => {
    renderRegister({ registerRows: [orderRow({ orderId: "no-handoff", so: 1200 })] });
    expect(screen.getByTestId("so-batch-proceed-no-handoff")).toHaveTextContent(
      "Not recorded",
    );
    expect(screen.getByTestId("so-batch-so-no-handoff").textContent).toBe("SO-1200Not recorded");
  });

  /**
   * ⭐ A SUMMARY SAYS ONE THING — owner correction 2026-09-11.
   *
   * These cells used to measure their own text against their own width and
   * print `AL Sungai Buloh +1 more`, so the visible text, the exported text
   * and the accessible name were three different answers, and a narrower
   * window silently changed what the screen said. The row lists every PO
   * number (owner ruling 2026-10-05). Supplier and destination are a LINE's
   * facts now: an item line on several documents summarises them the same
   * deterministic way, and the quick view keeps the order's supplier summary.
   */
  it("many POs, suppliers and destinations summarise deterministically", async () => {
    const SEVERAL = orderRow({
      orderId: "odocs",
      so: 1777,
      customer: "TWO DOCUMENTS",
      status: "ordered",
      pos: ORDER_O5.pos,
      lines: [
        { orderLineId: "ldocs", sku: "S9-2A", qty: 2, stockTaken: 0, item: "Booqit Sofa", variant: null, category: "sofa",
          pos: [{ poId: "PO-20260820-1111", qty: 1 }, { poId: "PO-20260821-2222", qty: 1 }] },
      ],
    });
    renderRegister({ registerRows: [...data().registerRows, SEVERAL] });
    expect(screen.getByTestId("so-batch-po-o5").textContent).toBe("PO-260820-1111, PO-260821-2222");
    /* One document prints its own number, not a count. */
    expect(screen.getByTestId("so-batch-po-o3").textContent).toBe("PO-260820-4827");
    /* One line on two documents, from two suppliers, to two places. */
    fireEvent.click(screen.getByTestId("so-batch-expand-odocs"));
    const line = within(await screen.findByTestId("so-batch-inspector-odocs")).getByTestId("so-batch-part-S9-2A");
    expect(within(line).getAllByRole("cell")[5]!.textContent).toBe("2 suppliers");
    expect(within(line).getByTestId("by-order-deliver-ldocs").firstElementChild!.textContent).toBe("Multiple");
    expect(within(line).getByTestId("so-batch-line-po-ldocs").textContent).toBe("PO-260820-1111, PO-260821-2222");
    /* A line on one document prints that document's own facts. */
    fireEvent.click(screen.getByTestId("so-batch-expand-o7"));
    const single = within(await screen.findByTestId("so-batch-inspector-o7")).getByTestId("so-batch-part-B1201S-K");
    expect(within(single).getAllByRole("cell")[5]!.textContent).toBe("Hooka");
    expect(within(single).getByTestId("by-order-deliver-l71").firstElementChild!.textContent).toBe("Carres Klang");
    /* The quick view keeps the order's own supplier summary. */
    expect(quickFact(openQuickView("o5"), "Supplier").textContent).toBe("Supplier2 suppliers");
    closeQuickView();
    expect(quickFact(openQuickView("o3"), "Supplier").textContent).toBe("SupplierHooka");
  });
});

/**
 * ⭐ THE ROW LISTS EVERY LINKED PO NUMBER — owner ruling 2026-10-05 (Purchasing
 * §9.1). Every real number from the row's `po_line_sources` lineage, each
 * once, by stored PO number ascending, in the shared display form with its
 * actual version, separated by `, `. Each number is its own door to that exact
 * PO. No count, no popover; search and Export carry the complete list.
 *
 * Since 13 Oct 2026 (round 3) the list sits under the pill in the `Status`
 * cell of a 54 row and wraps inside its column; the `PO No` column, its
 * one-line clip and its own column filter went with the wide list.
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

  it("prints every linked PO once, by stored number, comma-separated, each with its actual version, in the Status cell", () => {
    render1205();
    const cell = screen.getByTestId("so-batch-po-o1205");
    expect(screen.getByTestId("so-batch-status-o1205")).toContainElement(cell);
    expect(statusLines("o1205")).toEqual(["Ordered"]);
    expect(cell.textContent).toBe("PO-260903-4316-V1, PO-260903-4585-V1, PO-260903-7907-V1, PO-260903-9389-V1");
    const links = within(cell).getAllByRole("button");
    expect(links.map((b) => b.textContent)).toEqual([
      "PO-260903-4316-V1", "PO-260903-4585-V1", "PO-260903-7907-V1", "PO-260903-9389-V1",
    ]);
    /* The commas are plain text, never part of a door. */
    for (const link of links) expect(link.textContent).not.toContain(",");
    /* The kit's record link (01 §3): ink, dotted underline, solid on hover. */
    for (const link of links) {
      expect(link.className).toBe("font-medium text-c-ink underline decoration-c-secondary decoration-dotted underline-offset-[3px] hover:decoration-solid");
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

  it("no PO count and no popover remain; one PO stays a direct door; an order with no PO draws no PO line", () => {
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
    /* Nothing ordered yet: the pill says `To buy`, and there is no PO line and
       no door under it (the old `Not ordered yet` cell went with its column). */
    expect(screen.queryByTestId("so-batch-po-o1")).toBeNull();
    expect(screen.getByTestId("so-batch-status-o1").textContent).toBe("To buy");
    expect(within(screen.getByTestId("so-batch-status-o1")).queryByRole("button")).toBeNull();
  });

  it("a long list wraps inside the Status cell of a 54 row; nothing is cut and no door is stacked", () => {
    render1205();
    const cell = screen.getByTestId("so-batch-po-o1340");
    expect(within(cell).getAllByRole("button")).toHaveLength(14);
    expect(cell.textContent).toBe(
      FOURTEEN.map((id) => `${id.replace("PO-2026", "PO-26")}-V${id === FOURTEEN[13] ? 3 : 1}`).join(", "),
    );
    /* A two-line cell (01 §5): the list wraps inside its column, never clipped. */
    expect(cell.className.split(" ")).toEqual(expect.arrayContaining(["block", "break-words"]));
    expect(cell.className.split(" ")).not.toContain("truncate");
    expect(cell.querySelector("br, div, p, ul, li")).toBeNull();
    for (const link of within(cell).getAllByRole("button")) expect(link.className).not.toMatch(/\bblock\b|\bflex\b/);
    /* The list's own row recipe (54), in the `Status` column at the kit's width. */
    expect(document.querySelector('[data-row-height="54"]')).not.toBeNull();
    expect(document.querySelector('[data-row-height="32"]')).toBeNull();
    const header = screen.getAllByRole("columnheader").find((th) => th.getAttribute("title") === "Status")!;
    expect(header.style.width).toBe("132px");
    expect(screen.getAllByRole("columnheader").some((th) => th.getAttribute("title") === "PO No")).toBe(false);
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

  /* The `PO No` column and its filter went with the wide list. `Status` is the
     column now, and it filters by its own word, never by a PO count. */
  it("the Status column filter lists the status words, never a PO count", () => {
    render1205();
    expect(screen.queryByRole("button", { name: "Filter PO No" })).toBeNull();
    fireEvent.click(screen.getAllByRole("button", { name: "Filter Status" })[0]!);
    const menu = screen.getByTestId("column-filter-menu");
    for (const word of ["To buy", "Partly ordered", "Ordered"]) {
      expect(within(menu).getByText(word), word).toBeInTheDocument();
    }
    expect(screen.queryByText(/^\d+ POs$/)).toBeNull();
  });

  it("Export writes every number, comma-separated, in the same display form", async () => {
    render1205();
    fireEvent.keyDown(screen.getByRole("button", { name: "Page tools" }), { key: "Enter" });
    fireEvent.click(screen.getByRole("menuitem", { name: "Export" }));
    fireEvent.click(await screen.findByRole("menuitem", { name: "Excel" }));
    await waitFor(() => expect(xlsx.sheet).toHaveBeenCalledTimes(1));
    const sheet = xlsx.sheet.mock.calls[0]![0] as Array<Record<string, string>>;
    const row = (so: string) => sheet.find((r) => r["SO no."] === so)!;
    /* The Status cell as one string: its word, then every PO number. */
    expect(row("SO-1205")["Status"]).toBe("Ordered · PO-260903-4316-V1, PO-260903-4585-V1, PO-260903-7907-V1, PO-260903-9389-V1");
    expect(row("SO-1340")["Status"].replace("Ordered · ", "").split(", ")).toHaveLength(14);
    expect(row("SO-1330")["Status"]).toBe("Partly ordered · PO-260820-4827");
    expect(row("SO-1318")["Status"]).toBe("To buy");
    expect(Object.keys(row("SO-1205"))).toEqual(["SO no.", "Items", "Proceed date", "Customer’s original requested delivery", "Status"]);
  });

  /* ⛔ Jess, 2026-10-06: "it should show at row listing, why we need another
     table?" An opened row holds its item rows only — no second `Purchase order
     details` table and no Unit read (Unit ID is a Warehouse/PO-page fact, not
     shown on SO Batch). Each item line names its OWN PO numbers as links
     (owner 13 Oct 2026, round 3); the row keeps every number. */
  it("an opened row carries no `Purchase order details` table; each line names its own PO numbers and the row keeps them all", async () => {
    render1205();
    fireEvent.click(screen.getByTestId("so-batch-expand-o1205"));
    const box = await screen.findByTestId("so-batch-inspector-o1205");
    expect(box).toHaveAttribute("role", "table");
    expect(within(box).queryByTestId("goods-mini-table")).toBeNull();
    expect(within(box).queryAllByTestId(/^connected-section-/)).toHaveLength(0);
    expect(within(box).queryByTestId("po-details-table")).toBeNull();
    expect(box).not.toHaveTextContent("Purchase order details");
    expect(within(within(box).getByTestId("so-batch-line-po-l1205a")).getAllByRole("button").map((b) => b.textContent))
      .toEqual(["PO-260903-4316-V1", "PO-260903-7907-V1"]);
    expect(within(within(box).getByTestId("so-batch-line-po-l1205b")).getAllByRole("button").map((b) => b.textContent))
      .toEqual(["PO-260903-4585-V1", "PO-260903-7907-V1", "PO-260903-9389-V1"]);
    /* A line's number opens that exact PO and leaves the row open. */
    fireEvent.click(within(within(box).getByTestId("so-batch-line-po-l1205a")).getAllByRole("button")[0]!);
    expect(navigate).toHaveBeenLastCalledWith(`/operation/procurement?po=${encodeURIComponent(SO1205_POS[0]!)}`);
    expect(screen.getByTestId("so-batch-expand-o1205")).toHaveAttribute("aria-expanded", "true");
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
    /* The bar holds the selection's own acts (owner 13 Oct 2026, round 3);
       `Use stock` joins only while a ticked line has a free Unit. The view
       button is there once, small, after the acts: the ticks are the same in
       every grouping, so the grouping can still be changed. */
    expect(barButtons()).toEqual(["Clear", "Issue PO", "Export Excel (1)"]);
    expect(screen.getAllByTestId("so-batch-view")).toHaveLength(1);
    expect(within(bar).getByTestId("so-batch-view")).toHaveAccessibleName("View: By sales order");
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
  it("with no rail filter, `All` shows every proceeded record, Ordered included", () => {
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
    expect(screen.getByTestId("so-batch-footer").textContent).toBe("7 sales orders");
    fireEvent.click(screen.getByTestId("so-batch-state-can_order_early"));
    const line = screen.getByTestId("so-batch-footer").textContent ?? "";
    /* o1 · o3 · o8 can order early: three of the Register's seven. */
    expect(line).toBe("3 of 7 sales orders");
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
    const positioningRow = rail().parentElement?.closest(".relative");
    expect(positioningRow).toHaveClass("overflow-hidden");
    expect(positioningRow).toContainElement(rail());
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

  it("the supplier filter narrows by the Register's own supplier facts", () => {
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

describe("the opened row — the list's own item rows", () => {
  /* Owner 13 Oct 2026, round 3: a Sales Order opens to item rows drawn on the
     list's own columns (01 §5: group rows 54, item rows 44). The shared goods
     table and its connector lines are not drawn in the list any more; that
     table lives in the quick view only. */
  it("draws ONE item-rows block, flush under its row, with the owner's five heads", async () => {
    renderRegister();
    fireEvent.click(screen.getByTestId("so-batch-expand-o5"));
    const box = await screen.findByTestId("so-batch-inspector-o5");
    expect(box).toHaveAttribute("role", "table");
    expect(box).toHaveAccessibleName("Goods on SO-1400");
    expect(box).toHaveAttribute("data-carres-table", "item-rows");
    expect(within(box).getAllByRole("columnheader").map((h) => h.textContent).filter(Boolean))
      .toEqual(["Item", "Qty", "Stock you can use", "Supplier", "Supplier delivers to"]);
    const expansionCell = box.closest("td")!;
    const parentRow = expansionCell.parentElement!.previousElementSibling!;
    expect(expansionCell.colSpan).toBe(parentRow.children.length - 2);
    expect(expansionCell.parentElement!.children).toHaveLength(3);
    expect(expansionCell.previousElementSibling).toHaveAttribute("data-testid", "grid-expansion-gutter-__select__");
    expect(expansionCell).toHaveStyle({ padding: "0px" });
    /* One row per item line, and nothing else under the row. */
    expect(within(box).getAllByTestId(/^so-batch-part-/).map((row) => row.getAttribute("data-testid")))
      .toEqual(["so-batch-part-H1401S-K", "so-batch-part-S9-2A"]);
    expect(within(box).queryByTestId("goods-mini-table")).toBeNull();
    expect(within(box).queryAllByTestId(/^(connected-section|section-run|section-elbow|section-trunk)-/)).toHaveLength(0);
  });

  it("each item line keeps its own Supplier, Supplier delivers to and PO number, and carries no document quantity", async () => {
    renderRegister();
    fireEvent.click(screen.getByTestId("so-batch-expand-o5"));
    const box = await screen.findByTestId("so-batch-inspector-o5");

    /* Each line states its own supplier, its own issued destination and its
       own document, each document its own door (owner 13 Oct 2026, round 3). */
    const haven = within(box).getByTestId("so-batch-part-H1401S-K");
    expect(within(haven).getAllByRole("cell")[5]!.textContent).toBe("Hooka");
    expect(within(haven).getByTestId("by-order-deliver-l51").firstElementChild!.textContent).toBe("Carres Klang");
    expect(within(haven).getByTestId("so-batch-line-po-l51").textContent).toBe("PO-260820-1111");
    const sofa = within(box).getByTestId("so-batch-part-S9-2A");
    expect(within(sofa).getAllByRole("cell")[5]!.textContent).toBe("Ohana");
    expect(within(sofa).getByTestId("by-order-deliver-l52").firstElementChild!.textContent).toBe("AL Sungai Buloh");
    expect(within(sofa).getByTestId("so-batch-line-po-l52").textContent).toBe("PO-260821-2222");
    /* A line never names its neighbour's document. */
    expect(haven.textContent).not.toContain("2222");
    expect(sofa.textContent).not.toContain("1111");
    fireEvent.click(within(sofa).getByTestId("so-batch-line-po-link-l52"));
    expect(navigate).toHaveBeenLastCalledWith("/operation/procurement?po=PO-20260821-2222");

    /* ⛔ NO DOCUMENT QUANTITY (owner ruling 2026-09-18): `Qty` is the
       customer's, in the goods' own unit; each PO page holds its quantities. */
    expect(within(haven).getAllByRole("cell")[3]!.textContent).toBe("1 pc");
    expect(within(sofa).getAllByRole("cell")[3]!.textContent).toBe("1 set");
    expect(within(box).queryByTestId("goods-ordered-qty-l51")).toBeNull();
  });

  /**
   * ⭐ THE ITEM ROWS — owner 13 Oct 2026, round 3:
   * `☐ · Item · Qty · Stock you can use · Supplier · Supplier delivers to`,
   * and nothing else.
   *
   * This line is fully answered off the shelf: the customer ordered 2, Ready
   * Stock answered 2, no document carries any of it and nothing is left to buy
   * — so it has no tick, and the row says `From ready stock` · `No PO needed`
   * rather than a generic progress word.
   */
  it("draws the approved item-row heads, and the removed ones are gone", async () => {
    renderRegister();
    fireEvent.click(screen.getByTestId("so-batch-expand-o6"));
    const box = await screen.findByTestId("so-batch-inspector-o6");
    const heads = within(box).getAllByRole("columnheader")
      .map((el) => (el.textContent ?? "").trim())
      .filter(Boolean);
    expect(heads).toEqual([
      "Item",
      "Qty",
      "Stock you can use",
      "Supplier",
      "Supplier delivers to",
    ]);
    for (const gone of ["PO Status", "Category", "Ready Stock", "Supplier Deliver To", "SKU", "Ordered Qty", "To buy", "Order By", "Unit ID", "PO Safety Days"]) {
      expect(heads, gone).not.toContain(gone);
    }
    const line = within(box).getByTestId("so-batch-part-B1201S-Q");
    expect(within(line).queryByRole("checkbox")).toBeNull();
    expect(within(box).queryByTestId("goods-status-l61")).toBeNull();
    /* Model code, then the size; and the customer's ORIGINAL quantity, never
       quietly rewritten. */
    expect(within(line).getAllByRole("cell")[2]!.textContent).toBe("B1201S-QQueen");
    expect(within(line).getAllByRole("cell")[3]!.textContent).toBe("2 pcs");
    expect(statusLines("o6")).toEqual(["From ready stock", "No PO needed"]);
  });

  it("an eligible line carries the existing destination editor — Split included", async () => {
    renderRegister();
    fireEvent.click(screen.getByTestId("so-batch-expand-o1"));
    const box = await screen.findByTestId("so-batch-inspector-o1");
    expect(
      within(box).getByTestId("so-batch-deliver-to-select-build::o1::b1"),
    ).toBeInTheDocument();
    expect(within(box).getByTestId("so-batch-split-build::o1::b1")).toBeInTheDocument();
    /* The editor sits in the line's own `Supplier delivers to` cell. */
    expect(within(box).getByTestId("by-order-deliver-l1")).toContainElement(
      within(box).getByTestId("so-batch-deliver-to-select-build::o1::b1"),
    );
  });

  /**
   * ⭐ TWO ROWS OPEN AT ONCE. Each Sales Order's item rows are drawn inside its
   * own opened row, so two rows open together hold two independent blocks and
   * neither carries a line of the other.
   */
  it("draws an independent item-rows block per opened row, and neither holds the other's lines", async () => {
    renderRegister();
    fireEvent.click(screen.getByTestId("so-batch-expand-o5"));
    fireEvent.click(screen.getByTestId("so-batch-expand-o1"));
    const five = await screen.findByTestId("so-batch-inspector-o5");
    const one = await screen.findByTestId("so-batch-inspector-o1");

    expect(five).not.toContainElement(one);
    expect(one).not.toContainElement(five);
    expect(five.closest("td")).not.toBe(one.closest("td"));
    expect(within(five).getAllByTestId(/^so-batch-part-/)).toHaveLength(2);
    expect(within(one).getAllByTestId(/^so-batch-part-/)).toHaveLength(1);
    /* With documents (o5) or without (o1), each is ONE block with its own heads. */
    for (const box of [five, one]) {
      expect(within(box).getAllByRole("columnheader").filter((h) => h.textContent)).toHaveLength(5);
      expect(within(box).queryAllByTestId(/^(connected-section|section-run|section-elbow|section-trunk)-/)).toHaveLength(0);
    }
    expect(screen.getAllByRole("table", { name: /^Goods on SO-/ })).toHaveLength(2);
  });

  it("no hand-drawn table — the quick view keeps the shared goods table, the list draws the shared item rows", () => {
    const src = source();
    expect(src).toContain('from "../components/GoodsMiniTable"');
    expect(src).not.toContain("<table");
    const list = bySalesOrderSource();
    expect(list).toContain('from "@/components/register/ItemRows"');
    expect(list).toContain('from "@/components/register/RowTick"');
    expect(list).not.toContain("<table");
    expect(list).not.toContain("GoodsMiniTable");
    expect(list).not.toContain("ConnectedSections");
  });
});

/**
 * ⭐ THE PARENT ROW NEVER ARRANGES — owner correction 2026-09-11.
 *
 * `Deliver To` on the parent used to BE the control: one eligible demand drew
 * the full editor, several drew a `<select>` painted over with a summary. The
 * parent row holds no destination at all now (owner 13 Oct 2026, round 3), and
 * the one place an unissued demand is arranged is its own item row, beside
 * `Split`.
 */
describe("the arrangement is the demand's, never the summary's", () => {
  it("a closed parent row holds no arrangement control at all", () => {
    renderRegister();
    for (const orderId of ["o1", "o8", "o3", "o5", "o7"]) {
      const row = screen.getByTestId(`so-batch-row-${orderId}`);
      expect(within(row).queryByRole("combobox"), orderId).toBeNull();
      expect(within(row).queryAllByTestId(/^so-batch-(deliver-to-select|split)-/), orderId).toHaveLength(0);
      /* Its only doors are the arrow, the SO number and the PO numbers. */
      for (const button of within(row).getAllByRole("button")) {
        expect(button.getAttribute("data-testid"), orderId).toMatch(/^so-batch-(expand|so-link|po-link)-/);
      }
    }
    expect(screen.queryByTestId("so-batch-deliver-to-select-o8")).toBeNull();
  });

  it("states the ISSUED document's destination on its item line, and never the plan as though it were one", async () => {
    renderRegister();
    /* o7 carries one purchase order: its destination is a fact, printed as
       words beside the document, with nothing to arrange. */
    fireEvent.click(screen.getByTestId("so-batch-expand-o7"));
    const issued = within(await screen.findByTestId("so-batch-inspector-o7")).getByTestId("by-order-deliver-l71");
    expect(issued.firstElementChild!.textContent).toBe("Carres Klang");
    expect(within(issued).queryByRole("combobox")).toBeNull();
    expect(within(issued).getByTestId("so-batch-line-po-l71").textContent).toBe("PO-260822-3333");
    /* o1 has demand and no document. The plan is an arrangement the operator
       can still change, so it is the editor, never a stated destination; and
       neither the line nor the row names a document that does not exist. */
    fireEvent.click(screen.getByTestId("so-batch-expand-o1"));
    const plan = within(await screen.findByTestId("so-batch-inspector-o1")).getByTestId("by-order-deliver-l1");
    expect(within(plan).getByRole("combobox")).toHaveValue(KLANG);
    expect(within(plan).queryByTestId("so-batch-line-po-l1")).toBeNull();
    expect(screen.queryByTestId("so-batch-po-o1")).toBeNull();
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

/* ⛔ `PO Delivery Date` left this view with the wide list (owner 13 Oct 2026,
   round 3): neither the row nor its item rows print a PO's date, so the two
   tests that read the parent date cell went with the column. Each document's
   own dates are on its PO page, one press from the PO number on the row. */

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
    /* The opened row IS the item rows: one `role="table"` block. */
    const table = box;
    expect(table).toHaveAttribute("role", "table");
    expect(within(table).getAllByRole("checkbox")).toHaveLength(1);
    expect(within(table).getAllByTestId(/^so-batch-deliver-to-select-/)).toHaveLength(1);
    expect(within(table).getAllByTestId(/^so-batch-split-/)).toHaveLength(1);
    /* ⛔ AND NOT ONE UNIT ROW. The block holds its heads and exactly one row
       per item line, whatever the record below it holds. */
    expect(within(table).getAllByTestId(/^so-batch-part-/)).toHaveLength(1);
    expect(within(table).getAllByRole("row")).toHaveLength(2);
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
    const table = await screen.findByTestId("so-batch-inspector-o3");
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
    expect(within(box).queryByRole("checkbox")).toBeNull();
    /* And the row says WHY: `Ordered`, and all fourteen documents, each its own door. */
    expect(statusLines("o14")).toEqual(["Ordered"]);
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
    const ticks = within(box).getAllByRole("checkbox");
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
  it("still names delivered documents on the row, and the item row carries no document quantity", async () => {
    renderRegister({
      rows: [leaf14()],
      registerRows: [order({ sent: true, status: "received", orderStatus: "ordered" })],
    });
    fireEvent.click(screen.getByTestId("so-batch-expand-o14"));
    const box = await screen.findByTestId("so-batch-inspector-o14");
    /* ⭐ THE HISTORICAL QUANTITY LEFT THE ITEM ROW (owner ruling 2026-09-18).
       `Ordered Qty` is not an item-row column; the fourteen documents are
       named on the row (owner ruling 2026-10-06) and on their own item line,
       each opening the PO page that evidences its quantity and state. */
    expect(within(box).queryByTestId("goods-ordered-qty-l14")).toBeNull();
    expect(within(box).getAllByRole("columnheader").map((h) => h.textContent)).not.toContain("Ordered Qty");
    expect(within(within(box).getByTestId("so-batch-part-B1201S-K")).getAllByRole("cell")[3]!.textContent).toBe("1 pc");
    expect(within(screen.getByTestId("so-batch-po-o14")).getAllByRole("button")).toHaveLength(14);
    expect(within(within(box).getByTestId("so-batch-line-po-l14")).getAllByRole("button")).toHaveLength(14);
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
       `To buy` is not an item-row column and the page still refuses the act
       the door would refuse: no tick on the demand, no tick on the parent.
       The customer's ORIGINAL `Qty 1` is untouched. */
    expect(within(demand).getAllByRole("cell")[3]!.textContent).toBe("1 pc");
    expect(demand.textContent).not.toMatch(/To buy/);
    /* This order's own lineage already carries every unit it required, so the
       row needs no NEW document: it reads `Ordered`, with no second line and
       no count of days. */
    expect(statusLines("o14")).toEqual(["Ordered"]);
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
    /* UNKNOWN is stated under the row's `To buy`, in the page's governed word —
       never as a number and never as permission. The demand stays fully
       visible: the customer's original `Qty 1` is on its row. */
    expect(within(demand).getAllByRole("cell")[3]!.textContent).toBe("1 pc");
    expect(statusLines("o14")).toEqual(["To buy", "Coverage not checked"]);
    expect(statusLines("o14").join(" ")).not.toMatch(/\d/);
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
    expect(screen.getByTestId("so-batch-status-o14"))
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
    const table = await screen.findByTestId("so-batch-inspector-oset");
    expect(within(table).getAllByRole("checkbox")).toHaveLength(1);
    expect(within(table).getAllByTestId(/^so-batch-deliver-to-select-/)).toHaveLength(1);
    expect(table).toHaveTextContent("With 1 more lines in this set");
    /* Both of the customer's lines are still listed with their own goods:
       the model code as the data spells it, then the configuration under it
       (owner 13 Oct 2026). The tick and the editor are on the first line; the
       second says it belongs to the set above. */
    const [first, second] = within(table).getAllByTestId(/^so-batch-part-/);
    expect(within(first!).getAllByRole("cell")[2]!.textContent).toBe("S9-2A2 seater · With 1 more lines in this set");
    expect(within(first!).getAllByRole("checkbox")).toHaveLength(1);
    expect(within(second!).getAllByRole("cell")[2]!.textContent).toBe("S9-1A1 seater");
    expect(within(second!).queryByRole("checkbox")).toBeNull();
    expect(within(second!).queryByRole("combobox")).toBeNull();
    expect(within(table).getByTestId("by-order-deliver-ls2").textContent).toBe("Part of the set above");
  });

  it("ticks the whole set once — the leaf contract is unchanged", async () => {
    renderRegister({ rows: [SET_LEAF], registerRows: [SET_ORDER] });
    fireEvent.click(screen.getByTestId("so-batch-expand-oset"));
    const box = await screen.findByTestId("so-batch-inspector-oset");
    fireEvent.click(within(box).getByRole("checkbox"));
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
    const table = await screen.findByTestId("so-batch-inspector-otwo");
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
    const toggle = await screen.findByTestId("ready-stock-toggle-l1");
    /* The cell is the item line's own `Stock you can use` … */
    expect(screen.getByTestId("by-order-stock-l1")).toContainElement(screen.getByTestId("ready-stock-cell-l1"));
    expect(screen.getByTestId("by-order-stock-l1")).toContainElement(toggle);
    expect(screen.queryByTestId("by-order-stock-detail-l1")).toBeNull();
    fireEvent.click(toggle);
    const row = await screen.findByTestId(
      "ready-stock-unit-33333333-0000-0000-0000-00000000000a",
    );
    /* … and the picker opens under that very line, inside its own row. */
    const picker = screen.getByTestId("by-order-stock-detail-l1");
    expect(picker).toContainElement(row);
    expect(within(screen.getByTestId("so-batch-inspector-o1")).getByTestId("so-batch-part-B1201S-K")).toContainElement(picker);
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

  /* ⭐ A PURCHASE MAY NOT BE ISSUED OVER AN UNDECIDED STOCK CHANGE (owner ruling
     2026-09-18). The pending edit changes the very quantity `Issue PO` would
     buy, so the act waits and the band above the list says why. */
  it("an undecided stock change holds `Issue PO` until it is cancelled, and the band says why", async () => {
    answerReadyStock();
    renderRegister();
    fireEvent.click(screen.getByTestId("so-batch-select-o1"));
    expect(screen.getByTestId("so-batch-issue")).toBeEnabled();
    expect(screen.queryByTestId("grid-warning")).toBeNull();
    fireEvent.click(screen.getByTestId("so-batch-expand-o1"));
    fireEvent.click(await screen.findByTestId("ready-stock-toggle-l1"));
    const row = await screen.findByTestId("ready-stock-unit-33333333-0000-0000-0000-00000000000a");
    fireEvent.click(within(row).getByRole("checkbox"));
    await waitFor(() => expect(screen.getByTestId("so-batch-issue")).toBeDisabled());
    expect(screen.getByTestId("grid-warning")).toHaveTextContent("Save or cancel the Ready Stock changes before issuing a PO.");
    fireEvent.click(screen.getByTestId("ready-stock-cancel-l1"));
    await waitFor(() => expect(screen.getByTestId("so-batch-issue")).toBeEnabled());
    expect(screen.queryByTestId("grid-warning")).toBeNull();
    expect(onIssue).not.toHaveBeenCalled();
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


describe("PO Safety Days: off the list, still on the quick view", () => {
  /**
   * ⭐ THE MARGIN, NOT THE DATE — owner ruling 2026-09-18.
   *
   * `PO Safety Days` is not a column of the five-column list (owner 13 Oct
   * 2026, round 3). The quick view still states it: the TIGHTEST margin over
   * exactly the leaves the parent checkbox would tick, the SERVER's number.
   * Nothing to buy prints nothing; a margin nobody could measure prints the
   * governed absence word, never a `0`.
   *
   * What the ROW says under its Status is a different fact: the days left to
   * the earliest Order By among the lines that can be bought.
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
    /* The row counts to the Order By of the leaf that can be bought (34 days
       from 22 Aug to 25 Sep); the covered leaf's long-gone date is not read. */
    expect(statusLines("o1")).toEqual(["To buy", "34 days left"]);
    expect(quickFact(openQuickView("o1"), "PO Safety Days").textContent).toBe("PO Safety Days9");
    closeQuickView();
    /* Nothing to buy: no margin on the card, and no second line on the row. */
    expect(within(openQuickView("o5")).queryByText("PO Safety Days")).toBeNull();
    expect(statusLines("o5")).toEqual(["Ordered"]);
  });

  it("never prints a `0` for a margin the engine did not measure", () => {
    const rows: PurchaseDemandRow[] = data().rows.map((r) => ({
      ...r,
      safetyDaysLeft: null,
    }));
    renderRegister({ rows });
    /* No Order By on the wire: the row prints its word and no count at all. */
    expect(statusLines("o1")).toEqual(["To buy"]);
    const cell = quickFact(openQuickView("o1"), "PO Safety Days");
    expect(cell).not.toHaveTextContent("0");
    expect(cell.textContent).toBe("PO Safety DaysNot planned");
  });

  it("names a production overrun rather than a negative number", () => {
    const rows: PurchaseDemandRow[] = data().rows.map((r) => ({
      ...r,
      safetyDaysLeft: -2,
    }));
    renderRegister({ rows });
    const cell = quickFact(openQuickView("o1"), "PO Safety Days");
    expect(cell.textContent).toBe("PO Safety DaysProduction late");
    expect(cell).not.toHaveTextContent("-2");
  });

  it("names blocked planning under `To buy`, and states no destination for goods nobody can buy yet", async () => {
    renderRegister();
    expect(statusLines("o4")).toEqual(["To buy", "Production days not set"]);
    expect(screen.getByTestId("so-batch-select-o4")).toBeDisabled();
    expect(screen.getByTestId("so-batch-select-o4")).toHaveAccessibleDescription("Production days not set");
    fireEvent.click(screen.getByTestId("so-batch-expand-o4"));
    const deliver = within(await screen.findByTestId("so-batch-inspector-o4")).getByTestId("by-order-deliver-l77");
    /* No document and no plan: the cell holds the reason and its door only. */
    expect(deliver.textContent).toBe("Production days not setOpen Settings");
    expect(within(deliver).queryByRole("combobox")).toBeNull();
    expect(quickFact(openQuickView("o4"), "PO Safety Days").textContent).toBe("PO Safety DaysNot planned");
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
    expect(screen.getByTestId("so-batch-footer").textContent).toBe("7 sales orders");
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
  it("search finds a covered order under `All`, and a search with no match offers a complete clear", async () => {
    renderRegister({}, false);
    searchFor("SO-1400");
    await waitFor(() => expect(screen.queryByTestId("so-batch-row-o1")).not.toBeInTheDocument());
    expect(screen.getByTestId("so-batch-row-o5")).toBeInTheDocument();
    expect(screen.getByTestId("so-batch-footer").textContent).toBe("1 of 7 sales orders");
    searchFor("NOT-A-REAL-SO");
    await waitFor(() => expect(screen.queryByTestId("so-batch-row-o5")).not.toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "Clear filters" }));
    await waitFor(() => expect(screen.getByTestId("so-batch-row-o1")).toBeInTheDocument());
    expect(screen.getByTestId("so-batch-footer").textContent).toBe("7 sales orders");
  });
  /* A search that finds nothing is a NO-MATCH, and says so. It is never the
     page's `Nothing to buy` sentence: Sales Orders are still there to buy. */
  it("a search that matches nothing says the governed no-match sentence", async () => {
    renderRegister({}, false);
    searchFor("NOT-A-REAL-SO");
    await waitFor(() => expect(screen.queryByTestId("so-batch-row-o1")).not.toBeInTheDocument());
    expect(screen.queryByText("Nothing to buy. Every Sales Order already has its PO.")).not.toBeInTheDocument();
    expect(screen.getByText("No Sales Orders match these filters")).toBeInTheDocument();
  });
  /* `Clear filters` is complete: it clears what the rail narrowed by too, or
     it would be a button that changes nothing. */
  it("a rail filter that empties the list says so, and `Clear filters` clears the rail", async () => {
    renderRegister({}, false);
    fireEvent.change(screen.getByTestId("so-batch-product-select"), { target: { value: "bedframe" } });
    expect(screen.queryAllByTestId(/^so-batch-row-/)).toHaveLength(0);
    expect(screen.getByText("No Sales Orders match these filters")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Clear filters" }));
    await waitFor(() => expect(screen.getByTestId("so-batch-row-o1")).toBeInTheDocument());
    expect((screen.getByTestId("so-batch-product-select") as HTMLSelectElement).value).toBe("");
    expect(screen.getByTestId("so-batch-footer").textContent).toBe("7 sales orders");
  });
  /* A tab with nothing in it is not a no-match: it says its own sentence and
     offers nothing to clear. */
  it("an empty tab says its own sentence and offers no `Clear filters`", () => {
    renderRegister({ registerRows: [ORDER_O5], rows: [] }, false, false, "table", "buy");
    expect(screen.getByText("Nothing to buy. Every Sales Order already has its PO.")).toBeInTheDocument();
    expect(screen.queryByText("No Sales Orders match these filters")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Clear filters" })).not.toBeInTheDocument();
  });
});

describe("owner rulings R1–R6, 2026-09-16 — one table, two groups", () => {
  /* One list, read in document order. */
  const rowsIn = (container: HTMLElement) =>
    [...container.querySelectorAll("thead tr, tbody tr")].map((tr) =>
      tr.getAttribute("data-testid") ?? tr.textContent ?? "");

  it("R1 — Done records remain visible below unfinished records", () => {
    const { container } = renderRegister({}, false);
    expect(screen.queryByTestId("grid-group-toggle-no-purchase-needed")).not.toBeInTheDocument();
    const rows = rowsIn(container).filter(row => row.startsWith("so-batch-row-"));
    for (const id of ["o1", "o3", "o4", "o8"]) expect(rows.indexOf(`so-batch-row-${id}`)).toBeLessThan(rows.indexOf("so-batch-row-o6"));
    expect(statusLines("o6")).toEqual(["From ready stock", "No PO needed"]);
    expect(screen.getByTestId("so-batch-select-o6")).toBeDisabled();
  });

  it("R1 — a search finds a record that needs no purchase, and clearing restores all retained records", async () => {
    renderRegister({}, false);
    const input = searchFor("STOCKED");
    await waitFor(() => expect(screen.queryByTestId("so-batch-row-o1")).not.toBeInTheDocument());
    expect(screen.getByTestId("so-batch-row-o6")).toBeInTheDocument();
    /* Escape clears the query and puts the search icon back. */
    fireEvent.keyDown(input, { key: "Escape" });
    await waitFor(() => expect(screen.getByTestId("so-batch-row-o1")).toBeInTheDocument());
    expect(screen.getByTestId("so-batch-row-o6")).toBeInTheDocument();
    expect(screen.queryByRole("searchbox")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Search" })).toBeInTheDocument();
  });

  it("R2 — planning urgency does not override Proceed Date order", () => {
    const registerRows = data().registerRows.map(order => ({ ...order, proceededAt: order.orderId === "o4" ? "2026-08-01" : "2026-08-02" }));
    const { container } = renderRegister({ registerRows }, false);
    const rows = rowsIn(container).filter(row => row.startsWith("so-batch-row-"));
    expect(rows[0]).toBe("so-batch-row-o4");
    expect(statusLines("o4")).toEqual(["To buy", "Production days not set"]);
  });

  it("R6 — the footer carries one total, singular for one order", () => {
    renderRegister({ registerRows: [ORDER_O1], rows: [LEAF_O1] }, false);
    expect(screen.getByTestId("so-batch-footer").textContent).toBe("1 sales order");
  });

  /* Owner 13 Oct 2026, round 3: search is an icon on the toolbar, exactly as
     on By supplier. Pressing it opens the box; an active query keeps the box. */
  it("R4 — search is an icon on the toolbar; pressing it opens the box, and a query keeps it open", async () => {
    renderRegister({}, false);
    const toolbar = screen.getByTestId("work-toolbar");
    expect(within(toolbar).getByTestId("search-icon")).toHaveAccessibleName("Search");
    expect(screen.queryByRole("searchbox")).not.toBeInTheDocument();
    /* The always-open responsive box of the wide list is gone. */
    expect(screen.queryByTestId("search-box")).not.toBeInTheDocument();
    fireEvent.click(within(toolbar).getByTestId("search-icon"));
    const box = within(toolbar).getByRole("searchbox", { name: "Search" });
    expect(box).toHaveAttribute("placeholder", "Search Sales Order, customer, SKU or supplier…");
    expect(within(toolbar).queryByTestId("search-icon")).not.toBeInTheDocument();
    fireEvent.change(box, { target: { value: "Kimmy" } });
    await waitFor(() => expect(screen.queryByTestId("so-batch-row-o3")).not.toBeInTheDocument());
    expect(screen.getByTestId("so-batch-row-o1")).toBeInTheDocument();
    fireEvent.blur(box);
    expect(within(toolbar).getByRole("searchbox", { name: "Search" })).toHaveValue("Kimmy");
  });

  it("R5 — a ticked row is marked as ticked; an expanded unticked row is not", () => {
    renderRegister({}, false);
    fireEvent.click(screen.getByTestId("so-batch-expand-o3"));
    expect(screen.getByTestId("so-batch-row-o3").className).not.toMatch(/trTicked/);
    fireEvent.click(screen.getByTestId("so-batch-select-o1"));
    expect(screen.getByTestId("so-batch-row-o1").className).toMatch(/trTicked/);
    expect(bySalesOrderSource()).toContain('palette="slate"');
    expect(bySalesOrderSource()).toContain('searchPresentation="icon"');
    expect(bySalesOrderSource()).not.toContain('searchPresentation="responsive"');
  });
});

describe("a PO window opens pre-ticked (Purchasing §5.6.1, owner ruling 2026-09-25)", () => {
  function renderWindow() {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const onClear = vi.fn();
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={["/operation?tab=purchase&view=table&window=2026-09-25T11:30"]}>
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
 * ⭐ THE TWO-LINE STATUS RULE — owner ruling 2026-09-28, Purchasing §9.1;
 * redrawn 13 Oct 2026 (round 3).
 *
 * `Status` is a pill with one governed word. When a `To buy` order cannot be
 * ticked, the line under the pill says WHY in plain words — read from the
 * same projection the refused tick reads — and the door that fixes it is on
 * the item line. The stripe on the row edge (2026-09-29) is gone, and so is
 * the one-word `Pending` · `Partial` · `Done`.
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

  /* ⭐ THE WORD, THEN THE REASON UNDER IT (owner 13 Oct 2026, round 3). No row
     wears a stripe or a hover title any more: what the stripe used to say is
     printed under the pill, and the door lives on the item line. */
  const expectNoStripe = () => {
    expect(document.querySelector("[data-row-highlight]")).toBeNull();
    for (const row of screen.getAllByTestId(/^so-batch-row-/)) expect(row).not.toHaveAttribute("title");
  };
  /** The line under the pill: amber when something must be fixed, else grey. */
  const reasonLine = (orderId: string) => screen.getByTestId(`so-batch-status-${orderId}`).children[1] as HTMLElement;
  async function itemLineWhy(orderId: string, lineId: string) {
    fireEvent.click(screen.getByTestId(`so-batch-expand-${orderId}`));
    const box = await screen.findByTestId(`so-batch-inspector-${orderId}`);
    return within(box).getByTestId(`so-batch-line-status-why-${lineId}`);
  }
  /* A blocked order is still to buy, so the page's own first tab lists it. */
  const renderToBuy = (over: Partial<SoBatchPurchaseResponse>) => renderRegister(over, true, false, "table", "buy");

  it("a To-buy order blocked by a missing SKU reads `To buy`, the reason under it, and `Fix in Catalog` on the item line", async () => {
    renderToBuy(blockedOrder("no_sku"));
    expect(statusLines("ob")).toEqual(["To buy", "SKU not found"]);
    expect(reasonLine("ob")).toHaveClass("text-c-warn-fg");
    expect(screen.queryByTestId("so-batch-status-why-ob")).toBeNull();
    expectNoStripe();
    /* The refused tick says the same words to a screen reader. */
    expect(screen.getByTestId("so-batch-select-ob")).toBeDisabled();
    expect(screen.getByTestId("so-batch-select-ob")).toHaveAccessibleDescription("SKU not found");
    const why = await itemLineWhy("ob", "lb1");
    expect(why).toHaveTextContent("SKU not found");
    /* The line's own tick is drawn, refused, and says why. */
    const tick = screen.getByTestId("so-batch-line-tick-build::ob::no_sku");
    expect(tick).toBeDisabled();
    expect(tick).toHaveAccessibleName("Select B1201S-K for SO-1500. SKU not found");
    expect(tick.closest("label")).toHaveAttribute("title", "SKU not found");
    fireEvent.click(within(why).getByRole("button", { name: "Fix in Catalog" }));
    expect(navigate).toHaveBeenCalledWith("/operation?tab=op-catalog");
    /* The door never toggles the row. */
    expect(screen.getByTestId("so-batch-expand-ob")).toHaveAttribute("aria-expanded", "true");
  });

  it("a missing production-days setting opens Purchasing Settings from the item line", async () => {
    renderToBuy(blockedOrder("no_production_days"));
    expect(statusLines("ob")).toEqual(["To buy", "Production days not set"]);
    expect(reasonLine("ob")).toHaveClass("text-c-warn-fg");
    expectNoStripe();
    const why = await itemLineWhy("ob", "lb1");
    expect(why).toHaveTextContent("Production days not set");
    fireEvent.click(within(why).getByRole("button", { name: "Open Settings" }));
    expect(navigate).toHaveBeenCalledWith("/operation/settings/purchasing");
  });

  it("a missing customer date names the fact on the row and offers no door", async () => {
    renderToBuy(blockedOrder("no_customer_date"));
    expect(statusLines("ob")).toEqual(["To buy", "Customer delivery date is missing"]);
    expectNoStripe();
    expect(within(screen.getByTestId("so-batch-status-ob")).queryByRole("button")).toBeNull();
    const why = await itemLineWhy("ob", "lb1");
    expect(why).toHaveTextContent("Customer delivery date is missing");
    expect(within(why).queryByRole("button")).toBeNull();
  });

  it("an order already covered by an open PO says so on the row, in grey: nothing is missing", () => {
    renderToBuy(blockedOrder("can_order_early", { fullyOnPo: true }));
    expect(statusLines("ob")).toEqual(["To buy", "Already on a PO"]);
    expect(reasonLine("ob")).toHaveClass("text-c-secondary");
    expect(reasonLine("ob")).not.toHaveClass("text-c-warn-fg");
    expect(screen.getByTestId("so-batch-select-ob")).toHaveAccessibleDescription("Already on a PO");
  });

  /* Amber is for what someone must do before the order can be bought. */
  it("coverage nobody could check, and goods with no plan, are said in amber", () => {
    const unchecked = blockedOrder("can_order_early", { fullyOnPo: undefined });
    const unplanned = orderRow({
      orderId: "on", so: 1502, customer: "NO PLAN ONE",
      lines: [{ orderLineId: "ln1", sku: "B1201S-K", qty: 1, stockTaken: 0, item: "Booqit", variant: "King", category: "mattress", pos: [] }],
    });
    renderToBuy({ rows: unchecked.rows, registerRows: [...unchecked.registerRows, unplanned] });
    expect(statusLines("ob")).toEqual(["To buy", "Coverage not checked"]);
    expect(reasonLine("ob")).toHaveClass("text-c-warn-fg");
    expect(screen.getByTestId("so-batch-select-ob")).toHaveAccessibleDescription("Coverage not checked");
    /* Goods still outstanding and no demand line to buy them by. */
    expect(statusLines("on")).toEqual(["To buy", "Not planned"]);
    expect(reasonLine("on")).toHaveClass("text-c-warn-fg");
    expect(screen.getByTestId("so-batch-select-on")).toBeDisabled();
  });

  /* ⭐ RESERVE GOODS ALREADY ON A PO (owner ruling 2026-09-28). */
  function coveredWithOffer(line: Record<string, unknown>) {
    const base = blockedOrder("can_order_early", { fullyOnPo: true });
    const order = base.registerRows[0]!;
    return { ...base, registerRows: [{ ...order, lines: [{ ...order.lines[0]!, ...line }] }] };
  }

  it("a pool-covered line: `{PO No} has {n} {Item} available.`, and `Use this PO` on the item line", async () => {
    renderToBuy(coveredWithOffer({ poOffer: { poId: "PO260924-4827", qty: 2 } }));
    expect(statusLines("ob")[0]).toBe("To buy");
    expectNoStripe();
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
    /* The door never toggles the row. */
    expect(screen.getByTestId("so-batch-expand-ob")).toHaveAttribute("aria-expanded", "true");
  });

  /* The row and its item line read ONE projection (owner ruling 2026-09-28:
     with an offer the line reads the offer, never the retired `Already on a
     PO`; a balance nobody could read is `Coverage not checked`). The stripe
     used to say these words on the row; the line under the pill says them now. */
  it.each([
    /* Goods another PO already holds need nothing done: grey. */
    ["a PO with free goods", { poOffer: { poId: "PO260924-4827", qty: 2 } }, "PO260924-4827 has 2 Booqit King available.", "text-c-secondary"],
    /* A balance nobody could read must be checked before the order is bought: amber. */
    ["a PO balance that could not be read", { poOfferUnread: true }, "Coverage not checked", "text-c-warn-fg"],
  ])("the row's second Status line says what its item line says: %s", async (_name, line, words, tone) => {
    renderToBuy(coveredWithOffer(line));
    expect(statusLines("ob")).toEqual(["To buy", words]);
    expect(reasonLine("ob")).toHaveClass(tone);
    expect(await itemLineWhy("ob", "lb1")).toHaveTextContent(words);
  });

  it("the offer never blocks buying: a pool-only line stays tickable, on the row and on its item line", async () => {
    const base = blockedOrder("can_order_early", { fullyOnPo: true, poolOnly: true, orderBy: "2026-10-01" });
    const order = base.registerRows[0]!;
    renderToBuy({
      ...base,
      registerRows: [{ ...order, lines: [{ ...order.lines[0]!, poOffer: { poId: "PO260924-4827", qty: 2 } }] }],
    });
    expect(screen.getByTestId("so-batch-select-ob")).toBeEnabled();
    /* 22 Aug to 1 Oct: the row counts to the line's own Order By. */
    expect(statusLines("ob")).toEqual(["To buy", "40 days left"]);
    expectNoStripe();
    fireEvent.click(screen.getByTestId("so-batch-expand-ob"));
    const box = await screen.findByTestId("so-batch-inspector-ob");
    expect(within(box).getByTestId("so-batch-line-tick-build::ob::can_order_early")).toBeEnabled();
    expect(within(box).getByTestId("so-batch-deliver-to-select-build::ob::can_order_early")).toBeInTheDocument();
  });

  /* The second half of the same ruling: the tickable line still CARRIES the
     offer. The stripe used to announce it on the row; with the stripe gone the
     item line is the one place left that can. */
  it("a pool-only line that can be bought still offers `Use this PO` on its item line", async () => {
    const base = blockedOrder("can_order_early", { fullyOnPo: true, poolOnly: true, orderBy: "2026-10-01" });
    const order = base.registerRows[0]!;
    renderToBuy({
      ...base,
      registerRows: [{ ...order, lines: [{ ...order.lines[0]!, poOffer: { poId: "PO260924-4827", qty: 2 } }] }],
    });
    const why = await itemLineWhy("ob", "lb1");
    expect(why).toHaveTextContent("PO260924-4827 has 2 Booqit King available.");
    expect(within(why).getByRole("button", { name: "Use this PO" })).toBeEnabled();
  });

  it("a line covered by exact lineage (no poolOnly) stays refused", () => {
    renderToBuy(coveredWithOffer({ poOffer: { poId: "PO260924-4827", qty: 2 } }));
    expect(screen.getByTestId("so-batch-select-ob")).toBeDisabled();
  });

  it("a PO balance that could not be read says `Coverage not checked` on the item line, never a number", async () => {
    renderToBuy(coveredWithOffer({ poOfferUnread: true }));
    const why = await itemLineWhy("ob", "lb1");
    expect(why).toHaveTextContent("Coverage not checked");
    expect(why.textContent).not.toMatch(/\d/);
    expect(within(why).queryByRole("button")).toBeNull();
  });

  it("goods reserved on a PO read `Ordered`; the item line names the PO they are on", async () => {
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
    expect(statusLines("or")).toEqual(["Ordered"]);
    expect(screen.getByTestId("so-batch-items-or").textContent).toBe("1 pc1 ordered");
    expect(screen.getByTestId("so-batch-select-or")).toBeDisabled();
    expectNoStripe();
    expect(await itemLineWhy("or", "lr1"))
      .toHaveTextContent("1 Booqit King on PO260924-4827 is reserved for this order.");
    /* Nothing is left to buy on the line, so it has no tick. */
    expect(within(screen.getByTestId("so-batch-inspector-or")).queryByRole("checkbox")).toBeNull();
  });

  it("a tickable order carries one word and no second line, and no row wears a stripe", () => {
    renderRegister();
    expect(statusLines("o1")).toEqual(["To buy"]);
    expect(screen.getByTestId("so-batch-status-o1").textContent).toBe("To buy");
    expectNoStripe();
  });

  /* The shared goods table (`PO Status` · its second line · its door) is drawn
     only in the quick view now; there it still carries the same line and door. */
  it("the quick view's goods table carries the same second line and door", () => {
    renderToBuy(blockedOrder("no_sku"));
    expect(screen.queryByTestId("goods-mini-table")).toBeNull();
    const goods = quickGoods(openQuickView("ob"));
    const status = within(goods).getByTestId("goods-status-lb1").closest("td")!;
    expect(status).toHaveTextContent("Pending");
    expect(status).toHaveTextContent("SKU not found");
    fireEvent.click(within(status).getByRole("button", { name: "Fix in Catalog" }));
    expect(navigate).toHaveBeenCalledWith("/operation?tab=op-catalog");
  });

  /* Double-click opens the same quick view, and the list itself never draws
     the goods table: one opened row, one item-rows block. */
  it("the goods table is drawn only inside the quick view", async () => {
    renderRegister();
    fireEvent.click(screen.getByTestId("so-batch-expand-o1"));
    await screen.findByTestId("so-batch-inspector-o1");
    expect(screen.queryByTestId("goods-mini-table")).toBeNull();
    fireEvent.doubleClick(screen.getByTestId("so-batch-row-o1"));
    const panel = screen.getByRole("dialog");
    expect(within(panel).getByTestId("so-batch-card-o1")).toBeInTheDocument();
    expect(quickGoods(panel)).toBeInTheDocument();
    expect(screen.getAllByTestId("goods-mini-table")).toHaveLength(1);
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

/* ─── BY SALES ORDER: THE TABS, THE FOOTER AND THE ROW'S WORDS ───────────── */

/**
 * ⭐ `To buy` · `Ordered` · `All` ON BY SALES ORDER — owner 13 Oct 2026, round 3.
 *
 * The view reads the same three tabs as the other groupings (URL `show`). The
 * page opens on `To buy`: only Sales Orders with something still to buy. An
 * Ordered or stock-covered order is under `All`, an order with a PO under
 * `Ordered`. The Register stays permanent: `All` is every proceeded record.
 */
describe("By sales order — To buy · Ordered · All (owner 13 Oct 2026, round 3)", () => {
  const showBar = () => screen.getByRole("tablist", { name: "SO Batch Purchase shown" });
  const press = (name: string) => fireEvent.mouseDown(within(showBar()).getByRole("tab", { name }));
  const listed = () => screen.queryAllByTestId(/^so-batch-row-/)
    .map((row) => row.getAttribute("data-testid")!.replace("so-batch-row-", "")).sort();
  const footer = () => screen.getByTestId("so-batch-footer").textContent;
  const renderOn = (show: Shown, over: Partial<SoBatchPurchaseResponse> = {}) => renderRegister(over, true, false, "table", show);

  it("opens on `To buy`: only Sales Orders with something still to buy", () => {
    renderOn("buy");
    expect(within(showBar()).getAllByRole("tab").map((tab) => tab.textContent)).toEqual(["To buy", "Ordered", "All"]);
    expect(within(showBar()).getByRole("tab", { name: "To buy" })).toHaveAttribute("aria-selected", "true");
    /* o5 and o7 are Ordered and o6 is covered from Ready Stock: none is listed.
       o3 is partly ordered, so it still is. */
    expect(listed()).toEqual(["o1", "o3", "o4", "o8"]);
    expect(footer()).toBe("4 of 7 sales orders");
  });

  it("`All` shows the Ordered and stock-covered orders too; `Ordered` shows only orders with a PO", () => {
    renderOn("buy");
    expect(screen.queryByTestId("so-batch-row-o5")).not.toBeInTheDocument();
    press("All");
    expect(listed()).toEqual(["o1", "o3", "o4", "o5", "o6", "o7", "o8"]);
    expect(footer()).toBe("7 sales orders");
    press("Ordered");
    expect(listed()).toEqual(["o3", "o5", "o7"]);
    expect(footer()).toBe("3 of 7 sales orders");
    for (const id of listed()) {
      expect(within(screen.getByTestId(`so-batch-status-${id}`)).getAllByTestId(`so-batch-po-link-${id}`).length, id).toBeGreaterThan(0);
    }
    press("To buy");
    expect(listed()).toEqual(["o1", "o3", "o4", "o8"]);
  });

  it("the tab is read from the link (`show=ordered`, `show=all`)", () => {
    const ordered = renderOn("ordered");
    expect(within(showBar()).getByRole("tab", { name: "Ordered" })).toHaveAttribute("aria-selected", "true");
    expect(listed()).toEqual(["o3", "o5", "o7"]);
    ordered.unmount();
    renderOn("all");
    expect(within(showBar()).getByRole("tab", { name: "All" })).toHaveAttribute("aria-selected", "true");
    expect(listed()).toHaveLength(7);
  });

  it("an empty tab says why in the page's own words", () => {
    const bought = renderOn("buy", { registerRows: [ORDER_O5], rows: [] });
    expect(screen.getByText("Nothing to buy. Every Sales Order already has its PO.")).toBeInTheDocument();
    press("All");
    expect(listed()).toEqual(["o5"]);
    bought.unmount();
    renderOn("ordered", { registerRows: [ORDER_O1], rows: [LEAF_O1] });
    expect(screen.getByText("No Sales Order has a PO yet.")).toBeInTheDocument();
    press("To buy");
    expect(listed()).toEqual(["o1"]);
  });

  it("the footer counts sales orders in lower case: one, all, or shown of all", async () => {
    const one = renderOn("all", { registerRows: [ORDER_O1], rows: [LEAF_O1] });
    expect(footer()).toBe("1 sales order");
    one.unmount();
    renderOn("all");
    expect(footer()).toBe("7 sales orders");
    /* A search narrows the first number; the Register's total stays. */
    searchFor("Kimmy");
    await waitFor(() => expect(footer()).toBe("1 of 7 sales orders"));
    expect(footer()).not.toMatch(/Sales Order/);
  });

  it("every PO number is a link in the Status cell, under the pill", () => {
    renderOn("all");
    const cell = screen.getByTestId("so-batch-status-o5");
    expect(cell.firstElementChild).toHaveAttribute("data-kit", "status-pill");
    expect(cell.firstElementChild!.textContent).toBe("Ordered");
    const links = within(cell).getAllByTestId("so-batch-po-link-o5");
    expect(links.map((link) => [link.tagName, link.textContent])).toEqual([
      ["BUTTON", "PO-260820-1111"],
      ["BUTTON", "PO-260821-2222"],
    ]);
    fireEvent.click(links[1]!);
    expect(navigate).toHaveBeenLastCalledWith("/operation/procurement?po=PO-20260821-2222");
    expect(screen.getByTestId("so-batch-expand-o5")).toHaveAttribute("aria-expanded", "false");
    /* A partly ordered order keeps its one number under what is still to buy. */
    expect(statusLines("o3")).toEqual(["Partly ordered"]);
    expect(within(screen.getByTestId("so-batch-status-o3")).getAllByRole("button").map((b) => b.textContent)).toEqual(["PO-260820-4827"]);
    /* Nothing ordered: the pill, and no door under it. */
    expect(within(screen.getByTestId("so-batch-status-o1")).queryByRole("button")).toBeNull();
  });

  it("Items reads the pieces, then how many item lines are to buy, ordered and from stock", () => {
    const MIXED = orderRow({
      orderId: "omix", so: 1600, customer: "MIXED ONE", status: "partial", pos: [ORDER_O3.pos[0]!],
      lines: [
        { orderLineId: "lm1", sku: "B1201S-K", qty: 2, stockTaken: 0, item: "Booqit", variant: "King", category: "mattress", pos: [] },
        { orderLineId: "lm2", sku: "H1401S-K", qty: 1, stockTaken: 0, item: "Haven", variant: "King", category: "mattress",
          pos: [{ poId: "PO-20260820-4827", qty: 1 }] },
        { orderLineId: "lm3", sku: "B1201S-Q", qty: 1, stockTaken: 1, item: "Booqit", variant: "Queen", category: "mattress", pos: [] },
      ],
    });
    const SOFAS = orderRow({
      orderId: "osofa", so: 1601, customer: "SOFA ONE",
      lines: [{ orderLineId: "ls9", sku: "S9-2A", qty: 2, stockTaken: 0, item: "Booqit Sofa", variant: null, category: "sofa", pos: [] }],
    });
    const mixedLeaf = leaf({ id: "build::omix::a", orderId: "omix", so: 1600, lineIds: ["lm1"], toBuy: 2, qtyNeeded: 2 });
    renderOn("all", { registerRows: [MIXED, SOFAS, ORDER_O5, ORDER_O6], rows: [mixedLeaf] });
    /* Item lines, never pieces, after the dot-separated words. */
    expect(screen.getByTestId("so-batch-items-omix").textContent).toBe("4 pcs1 to buy · 1 ordered · 1 stock");
    expect(statusLines("omix")).toEqual(["Partly ordered"]);
    /* A sofa-only order counts sets; a mixed order counts pieces. */
    expect(screen.getByTestId("so-batch-items-osofa").textContent).toBe("2 sets1 to buy");
    expect(screen.getByTestId("so-batch-items-o5").textContent).toBe("2 pcs2 ordered");
    expect(screen.getByTestId("so-batch-items-o6").textContent).toBe("2 pcs1 stock");
  });

  it("the Status word follows the dates: Late to order, Cut-off passed, Today", () => {
    const rows: PurchaseDemandRow[] = [
      { ...LEAF_O1, orderBy: "2026-08-20" },
      { ...LEAF_O3, orderBy: "2026-08-22" },
      /* The earliest Order By of the two lines; one PO window has gone by. */
      { ...LEAF_O8A, orderBy: "2026-08-30" },
      { ...LEAF_O8B, orderBy: "2026-08-25", poWindow: "2026-08-22T09:00" },
      LEAF_O4,
    ];
    renderOn("buy", { rows });
    expect(statusLines("o1")).toEqual(["Late to order", "2 days late"]);
    expect(statusLines("o3")).toEqual(["Partly ordered", "Today"]);
    expect(statusLines("o8")).toEqual(["Cut-off passed", "3 days left"]);
    /* Amber is for what needs doing now; a count of days never goes negative. */
    for (const id of ["o1", "o8"]) {
      expect(screen.getByTestId(`so-batch-status-${id}`).firstElementChild).toHaveAttribute("data-tone", "warning");
      expect(screen.getByTestId(`so-batch-status-${id}`).children[1]).toHaveClass("text-c-warn-fg");
    }
    expect(screen.getByTestId("so-batch-status-o3").children[1]).toHaveClass("text-c-secondary");
    expect(screen.getByTestId("by-sales-order").textContent).not.toMatch(/-\d+ days|Overdue|Missed/);
  });

  it("`Purchase Orders` opens the POs of the orders the tab is showing", () => {
    renderOn("buy");
    const opened = () => [...(onOpenPurchaseOrders.mock.calls.at(-1)![0] as string[])].sort();
    fireEvent.click(purchaseOrdersItem());
    /* `To buy`: o3 is the one listed order with a PO. */
    expect(opened()).toEqual(["PO-20260820-4827"]);
    press("All");
    fireEvent.click(purchaseOrdersItem());
    expect(opened()).toEqual(["PO-20260820-1111", "PO-20260820-4827", "PO-20260821-2222", "PO-20260822-3333"]);
    /* The rail narrows the same scope. */
    fireEvent.change(screen.getByTestId("so-batch-supplier-select"), { target: { value: "Ohana" } });
    fireEvent.click(purchaseOrdersItem());
    expect(opened()).toEqual(["PO-20260820-1111", "PO-20260821-2222"]);
    expect(onOpenPurchaseOrders).toHaveBeenCalledTimes(3);
  });
});

/* ─── USE STOCK ─────────────────────────────────────────────────────────── */

/**
 * ⭐ `Use stock · {n}` — owner 13 Oct 2026, round 3 (Purchasing §9.1).
 *
 * While item lines are ticked, Ready Stock is read for THEIR Sales Orders only,
 * and the selection bar offers one act: reserve the suggested free Unit for
 * each ticked line that has one. `n` counts those lines. The button stands
 * before the PO Duty chip and is absent while no ticked line has a free Unit.
 * Reading reserves nothing; the press goes through the existing reservation
 * door, drops the ticks it answered and says how many Units it reserved.
 */
describe("Use stock on the selection bar (owner 13 Oct 2026, round 3)", () => {
  const UNIT_O1 = "33333333-0000-0000-0000-00000000000a";
  const UNIT_O8 = "33333333-0000-0000-0000-00000000000b";
  const RESERVE = "/api/operation/purchase/demands/ready-stock/reserve";
  const stockLine = (orderLineId: string, sku: string, qty: number) => ({
    orderLineId, sku, item: sku, qty, reservedQty: 0, reservedUnitCodes: [], onPoQty: 0, remainingQty: qty,
  });
  const unit = (itemId: string, unitCode: string, lineId: string, over: Record<string, unknown> = {}) => ({
    itemId, unitCode, identityScope: "unit", sku: "B1201S-K", condition: "new", siteName: "Carres Klang Warehouse",
    holderName: null, ownership: "carres_owned", supplier: null, qty: 1, dateIn: "2026-08-01", poNo: null,
    matchingLineIds: [lineId], lineIds: [lineId], reservedForLineId: null, blocked: null, ...over,
  });
  /* o1's one line has a free Unit; of o8's two lines only the first has. */
  const SHELF: Record<string, unknown> = {
    o1: { orderId: "o1", so: 1318, reference: "SO-1318", lines: [stockLine("l1", "B1201S-K", 2)], units: [unit(UNIT_O1, "U1-000-001", "l1")] },
    o8: { orderId: "o8", so: 1360, reference: "SO-1360",
      lines: [stockLine("l81", "B1201S-K", 1), stockLine("l82", "H1401S-K", 1)], units: [unit(UNIT_O8, "U1-000-002", "l81")] },
  };
  type ReserveBody = { orderId: string; picks: Array<{ itemId: string; orderLineId: string }> };
  /** Answers each Sales Order's Ready Stock read, and the one reservation door. */
  function answerShelf(shelf: Record<string, unknown>, reserve: (body: ReserveBody) => unknown = (body) => ({
    reserved: body.picks.length, reference: "SO", units: body.picks,
  })) {
    apiFetch.mockImplementation(async (path?: unknown, ...rest: unknown[]) => {
      const read = /\/demands\/([^/]+)\/ready-stock$/.exec(String(path));
      if (read) {
        const orderId = decodeURIComponent(read[1]!);
        return (shelf[orderId] ?? { orderId, so: null, reference: null, lines: [], units: [] }) as unknown as SalesOrderExpansionResponse;
      }
      if (String(path) === RESERVE) {
        return reserve(JSON.parse((rest[0] as { body: string }).body) as ReserveBody) as SalesOrderExpansionResponse;
      }
      return { defaultDeliverTo: null, place: [], lines: [] } as SalesOrderExpansionResponse;
    });
  }
  const reads = () => apiFetch.mock.calls.map(([path]) => String(path)).filter((path) => path.endsWith("/ready-stock")).sort();
  const posts = () => apiFetch.mock.calls
    .filter(([, options]) => (options as { method?: string } | undefined)?.method === "POST")
    .map(([path, options]) => [String(path), JSON.parse((options as { body: string }).body)] as const);
  /** Lets the Ready Stock reads land: React Query tells its observers on a timer. */
  const settle = () => act(async () => { await new Promise((resolve) => setTimeout(resolve, 25)); });
  const useStock = () => screen.getByTestId("so-batch-use-stock");

  it("is absent with nothing ticked, and no Ready Stock is read", async () => {
    answerShelf(SHELF);
    renderRegister();
    await settle();
    expect(screen.queryByTestId("so-batch-use-stock")).toBeNull();
    expect(reads()).toEqual([]);
  });

  it.each([
    ["the shelf is empty", {}],
    ["its only Unit is already reserved", { o1: { ...(SHELF.o1 as object), units: [unit(UNIT_O1, "U1-000-001", "l1", { reservedForLineId: "l1" })] } }],
    ["its only Unit is the supplier's", { o1: { ...(SHELF.o1 as object), units: [unit(UNIT_O1, "U1-000-001", "l1", { ownership: "supplier_consignment", blocked: "supplier_owned" })] } }],
  ])("is absent when the ticked line has no free Unit: %s", async (_name, shelf) => {
    answerShelf(shelf);
    renderRegister();
    fireEvent.click(screen.getByTestId("so-batch-select-o1"));
    await waitFor(() => expect(reads()).toEqual(["/api/operation/purchase/demands/o1/ready-stock"]));
    await settle();
    /* The selection bar is there, with its usual acts and nothing more. */
    expect(barButtons()).toEqual(["Clear", "Issue PO", "Export Excel (1)"]);
    expect(screen.queryByTestId("so-batch-use-stock")).toBeNull();
    expect(posts()).toEqual([]);
  });

  it("reads `Use stock · n` for the ticked lines that have a free Unit, before the PO Duty chip", async () => {
    answerShelf(SHELF);
    renderRegister();
    fireEvent.click(screen.getByTestId("so-batch-select-o1"));
    await waitFor(() => expect(useStock()).toHaveTextContent("Use stock · 1"));
    /* o8 has two ticked lines; only one has a Unit. Three ticked, two counted. */
    fireEvent.click(screen.getByTestId("so-batch-select-o8"));
    await waitFor(() => expect(useStock()).toHaveTextContent("Use stock · 2"));
    expect(useStock().textContent).toBe("Use stock · 2");
    expect([...screen.getByTestId("so-batch-selection-actions").children].map((el) => el.getAttribute("data-testid")))
      .toEqual(["so-batch-use-stock", "so-batch-duty-chip", "so-batch-issue"]);
    expect(barButtons()).toEqual(["Clear", "Use stock · 2", "Issue PO", "Export Excel (2)"]);
    /* Only the ticked Sales Orders were read, and reading reserved nothing. */
    expect([...new Set(reads())]).toEqual([
      "/api/operation/purchase/demands/o1/ready-stock",
      "/api/operation/purchase/demands/o8/ready-stock",
    ]);
    expect(posts()).toEqual([]);
    /* Unticking the last line with stock takes the button away again. */
    fireEvent.click(screen.getByTestId("so-batch-select-o1"));
    fireEvent.click(screen.getByTestId("so-batch-select-o8"));
    expect(screen.queryByTestId("so-batch-use-stock")).toBeNull();
  });

  it("pressing it reserves the suggested Units through the reservation door, drops those ticks and says how many", async () => {
    answerShelf(SHELF);
    renderRegister();
    fireEvent.click(screen.getByTestId("so-batch-select-o1"));
    fireEvent.click(screen.getByTestId("so-batch-select-o8"));
    await waitFor(() => expect(useStock()).toHaveTextContent("Use stock · 2"));
    fireEvent.click(useStock());
    await waitFor(() => expect(toastSuccess).toHaveBeenCalledWith("2 Units reserved from stock"));
    /* Exact Units for exact item lines, one Sales Order at a time, once. */
    expect(posts()).toEqual([
      [RESERVE, { orderId: "o1", picks: [{ itemId: UNIT_O1, orderLineId: "l1" }] }],
      [RESERVE, { orderId: "o8", picks: [{ itemId: UNIT_O8, orderLineId: "l81" }] }],
    ]);
    /* The answered lines are no longer ticked to buy; the line with no stock
       stays ticked, so `Issue PO` takes only it. */
    expect(screen.getByTestId("so-batch-select-o1")).not.toBeChecked();
    expect((screen.getByTestId("so-batch-select-o8") as HTMLInputElement).indeterminate).toBe(true);
    await waitFor(() => expect(screen.queryByTestId("so-batch-use-stock")).toBeNull());
    expect(screen.getByTestId("selection-bar")).toHaveTextContent("1 Sales Order · 1 item · 1 unit · Issue 1 PO");
    fireEvent.click(screen.getByTestId("so-batch-issue"));
    expect(onIssue).toHaveBeenCalledWith([
      { demandId: "build::o8::b", allocations: [{ destinationId: KLANG, qty: 1 }] },
    ]);
  });

  it("one reserved Unit is said in the singular", async () => {
    answerShelf(SHELF);
    renderRegister();
    fireEvent.click(screen.getByTestId("so-batch-select-o1"));
    await waitFor(() => expect(useStock()).toHaveTextContent("Use stock · 1"));
    fireEvent.click(useStock());
    await waitFor(() => expect(toastSuccess).toHaveBeenCalledWith("1 Unit reserved from stock"));
    expect(screen.queryByTestId("selection-bar")).not.toBeInTheDocument();
  });

  it("a refused press writes nothing more and says `Not confirmed · Try again`", async () => {
    answerShelf(SHELF, () => { throw new ApiError(409, "unit_no_longer_free", { code: "unit_no_longer_free" }); });
    renderRegister();
    fireEvent.click(screen.getByTestId("so-batch-select-o1"));
    fireEvent.click(screen.getByTestId("so-batch-select-o8"));
    await waitFor(() => expect(useStock()).toHaveTextContent("Use stock · 2"));
    expect(screen.queryByTestId("grid-warning")).toBeNull();
    fireEvent.click(useStock());
    await waitFor(() => expect(screen.getByTestId("grid-warning")).toHaveTextContent("Not confirmed · Try again"));
    /* The refusal stops the run: the second Sales Order is never sent. */
    expect(posts()).toEqual([[RESERVE, { orderId: "o1", picks: [{ itemId: UNIT_O1, orderLineId: "l1" }] }]]);
    expect(toastSuccess).not.toHaveBeenCalled();
  });

  it("stands on the selection bar of the other groupings too", async () => {
    answerShelf(SHELF);
    renderRegister({ registerRows: [ORDER_O1], rows: [LEAF_O1] }, true, false, "supplier");
    expect(screen.queryByTestId("so-batch-use-stock")).toBeNull();
    fireEvent.click(screen.getAllByRole("checkbox").find((box) => /^by-supplier-select-/.test(box.getAttribute("data-testid") ?? ""))!);
    await waitFor(() => expect(useStock()).toHaveTextContent("Use stock · 1"));
    /* The view button is on the bar as one small button, named for a screen reader. */
    expect(within(screen.getByTestId("selection-bar")).getByTestId("so-batch-view")).toHaveAccessibleName("View: By supplier");
  });
});


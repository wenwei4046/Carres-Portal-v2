/**
 * The embedded `Sales Order` tab (UI MASTER §4.3, owner 2026-10-05): the same
 * kit card and SO builder as the Register's quick view, in embedded
 * presentation, with truthful read states. Read-only: no write is ever sent.
 */
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { operationOrderListRow } from "@/lib/queries";
import type { SalesOrderTemplateData } from "@/lib/pdf/types";

const navigate = vi.fn();
vi.mock("react-router-dom", async () => ({
  ...(await vi.importActual<typeof import("react-router-dom")>("react-router-dom")),
  useNavigate: () => navigate,
}));
vi.mock("@/lib/api", () => {
  class ApiError extends Error {
    constructor(public status: number, message: string, public body?: unknown) { super(message); }
  }
  return { ApiError, apiFetch: vi.fn() };
});
vi.mock("./SalesOrderCardDocument", () => ({
  default: ({ reference, onClose }: { reference: string; onClose: () => void }) => <div>Saved document {reference}<button onClick={onClose}>Close PDF</button></div>,
}));

import { ApiError, apiFetch } from "@/lib/api";
import EmbeddedSalesOrders, { linkedSalesOrderIds } from "./EmbeddedSalesOrders";

const fetchMock = vi.mocked(apiFetch);

function order(id: string, so: number, extra: Partial<operationOrderListRow> = {}): operationOrderListRow {
  return {
    id, so, status: "proceed_order", operation_stage: "confirmed", warehouse_id: null,
    customer_name: `Customer ${so}`, customer_phone: "0191234567", customer_address: `Recorded address ${so}`,
    placed_at: "2026-09-30T08:00:00Z", proceeded_at: "2026-10-01T08:00:00Z", proceed_date: "2026-10-02",
    delivery_date: "2026-12-31", original_request: [{ revision: 1, snapshot: { header: { delivery_date: "2026-10-31" } } }],
    outlets: { name: "Recorded location" }, salespersons: { name: "Recorded salesperson" },
    building_type: "Condo", delivery_floor: 1, delivery_has_lift: false, delivery_stair_items: 0,
    order_lines: [{ sku: "M", qty: 1, unit_price: 2499 }], order_addons: [{ addon_key: "DISPOSAL", qty: 2, unit_price: 80 }], paid: 1380,
    ...extra,
  } as operationOrderListRow;
}
const DOCUMENT: Pick<SalesOrderTemplateData, "lines" | "addons"> = {
  lines: [{ sku: "M", description: "Recorded mattress", qty: 1, unit_price: 2499, line_total: 2499, attrs: null }],
  addons: [{ label: "Dispose old mattress", sku: "SVC-DISPOSAL", qty: 2, unit_price: 80, line_total: 160, attrs: { size: "King ×2" } }],
};

type Answer = (url: string) => unknown;
let answer: Answer;
beforeEach(() => {
  navigate.mockReset();
  fetchMock.mockReset();
  answer = (url) => url.includes("sales-order-data") ? DOCUMENT : { orders: [] };
  fetchMock.mockImplementation(async (url: string) => {
    const result = answer(url);
    if (result instanceof Error) throw result;
    return result;
  });
});
afterEach(cleanup);

function mount(orderIds: string[]) {
  const client = new QueryClient({ defaultOptions: { queries: { retryDelay: 0 } } });
  return render(<QueryClientProvider client={client}><MemoryRouter><EmbeddedSalesOrders orderIds={orderIds} /></MemoryRouter></QueryClientProvider>);
}
const rowsAnswer = (rows: Record<string, operationOrderListRow>): Answer => (url) => {
  if (url.includes("sales-order-data")) return DOCUMENT;
  const id = decodeURIComponent(url.split("orderId=")[1] ?? "");
  return { orders: rows[id] ? [rows[id]] : [] };
};

describe("EmbeddedSalesOrders — one embedded block per linked SO", () => {
  it("draws each SO once, in source order, through the embedded card", async () => {
    answer = rowsAnswer({ a: order("a", 1368), b: order("b", 1303) });
    mount(["a", "b", "a"]);
    await screen.findByText("Customer 1368");
    await screen.findByText("Customer 1303");
    const blocks = screen.getByTestId("embedded-sales-orders").children;
    expect([...blocks].map((block) => block.getAttribute("data-order-id"))).toEqual(["a", "b"]);
    expect(fetchMock.mock.calls.filter(([url]) => String(url).startsWith("/api/operation/orders?orderId=")).map(([url]) => url)).toEqual([
      "/api/operation/orders?orderId=a", "/api/operation/orders?orderId=b",
    ]);
  });

  it("shows the confirmed embedded composition: identity, address first, four sales facts, money, five-column items", async () => {
    answer = rowsAnswer({ a: order("a", 1368, { delivery_stair_items: 4 }) });
    mount(["a"]);
    const block = within(await screen.findByTestId("embedded-sales-orders"));
    await block.findByRole("table", { name: "Items · SO-1368" });
    expect(block.queryByRole("button", { name: "Close panel" })).toBeNull();
    expect(block.queryByRole("button", { name: "Items" })).toBeNull();
    expect(block.queryByRole("navigation")).toBeNull();
    expect(block.getByRole("button", { name: "Sales Order SO-1368" }).textContent).toBe("SO-1368");
    expect(block.getByText("0191234567")).toBeTruthy();
    expect(block.getByText("Customer’s original")).toBeTruthy();
    expect(block.getByText("requested delivery")).toBeTruthy();
    expect(block.getByText("29d")).toBeTruthy();
    expect(block.getByText("Sat, 31 Oct")).toBeTruthy();
    expect(block.getByText("Condo · Floor 1")).toBeTruthy();
    expect(block.getByText("No lift · Stair carry: 4 items")).toBeTruthy();
    const address = block.getByText("Recorded address 1368");
    const labels = ["SO Doc Date", "Planned production start", "Sales Location", "Salesperson"].map((label) => block.getByText(label));
    for (const [before, after] of [[address, labels[0]], ...labels.slice(1).map((label, i) => [labels[i], label])] as const) {
      expect(before.compareDocumentPosition(after) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    }
    expect(block.getByText("Fri, 2 Oct")).toBeTruthy();
    expect(block.getByText("Recorded location")).toBeTruthy();
    for (const label of ["Total payable", "Paid to date", "Balance due"]) expect(block.getByText(label)).toBeTruthy();
    const table = block.getByRole("table", { name: "Items · SO-1368" });
    expect(within(table).getAllByRole("columnheader").map((cell) => cell.textContent)).toEqual(["Item", "Qty", "Unit (RM)", "Disc (RM)", "Amount (RM)"]);
    /* Services are items: the disposal line prints with its configuration. */
    expect(within(table).getByText("Dispose old mattress")).toBeTruthy();
    expect(within(table).getByText("King ×2")).toBeTruthy();
    expect(within(table).getByText("160.00")).toBeTruthy();
    expect(within(table).getAllByText("0.00")).toHaveLength(2);
  });

  it("the SO No opens the saved PDF; closing it keeps the address and sales facts open; ↗ opens the full SO page", async () => {
    answer = rowsAnswer({ a: order("a", 1368) });
    mount(["a"]);
    const number = await screen.findByRole("button", { name: "Sales Order SO-1368" });
    fireEvent.click(number);
    expect(screen.getByText("Saved document SO-1368")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Close PDF" }));
    expect(screen.queryByText("Saved document SO-1368")).toBeNull();
    expect(number).toHaveFocus();
    expect(screen.getByText("Recorded address 1368")).toBeTruthy();
    expect(screen.getByText("Recorded location")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Open full page" }));
    expect(navigate).toHaveBeenCalledWith("/operation/orders/so/a");
  });

  it("an empty list draws nothing — the host hides the tab", () => {
    const { container } = mount([]);
    expect(container.textContent).toBe("");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("EmbeddedSalesOrders — truthful read states", () => {
  it("loading reads Loading…", () => {
    fetchMock.mockImplementation(() => new Promise(() => {}));
    mount(["a"]);
    expect(screen.getByRole("status").textContent).toBe("Loading…");
  });

  it("an SO the Operation list does not return is `Order details unavailable`, never a read failure", async () => {
    answer = rowsAnswer({ a: order("a", 1368) });
    mount(["a", "gone"]);
    expect(await screen.findByText("Order details unavailable")).toBeTruthy();
    await screen.findByText("Customer 1368");
    expect(screen.queryByText("Could not be loaded")).toBeNull();
  });

  it("a refused read is `You cannot view this record`", async () => {
    answer = () => new ApiError(403, "operation or Principal only", null);
    mount(["a"]);
    expect(await screen.findByText("You cannot view this record")).toBeTruthy();
    expect(screen.queryByText("Could not be loaded")).toBeNull();
  });

  it("a failed read says so with Try again, and Try again reads again", async () => {
    answer = () => new ApiError(500, "boom", null);
    mount(["a"]);
    expect(await screen.findByText("Could not be loaded")).toBeTruthy();
    answer = rowsAnswer({ a: order("a", 1368) });
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("Customer 1368")).toBeTruthy();
  });

  it("a failed items read keeps the order facts and offers Try again for the items", async () => {
    const rows = rowsAnswer({ a: order("a", 1368) });
    answer = (url) => url.includes("sales-order-data") ? new ApiError(500, "boom", null) : rows(url);
    mount(["a"]);
    await screen.findByText("Customer 1368");
    expect(await screen.findByText("Could not be loaded")).toBeTruthy();
    expect(screen.getByText("Total payable")).toBeTruthy();
    answer = rows;
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(screen.getByRole("table", { name: "Items · SO-1368" })).toBeTruthy());
  });

  it("never sends anything but GET reads", async () => {
    answer = rowsAnswer({ a: order("a", 1368) });
    mount(["a"]);
    await screen.findByRole("table", { name: "Items · SO-1368" });
    for (const call of fetchMock.mock.calls) expect(call[1]?.method ?? "GET").toBe("GET");
  });
});

describe("linkedSalesOrderIds", () => {
  it("keeps Sales Order sources with an id, once each, in source order", () => {
    expect(linkedSalesOrderIds([
      { kind: "sales_order", orderId: "b" }, { kind: "manual_purchase", orderId: null },
      { kind: "sales_order", orderId: null }, { kind: "sales_order", orderId: "a" }, { kind: "sales_order", orderId: "b" },
    ])).toEqual(["b", "a"]);
  });
});

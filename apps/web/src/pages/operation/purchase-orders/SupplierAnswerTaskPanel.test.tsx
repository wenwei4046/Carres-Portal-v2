import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const api = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api", async () => ({ ...await vi.importActual<typeof import("@/lib/api")>("@/lib/api"), apiFetch: api }));
vi.mock("@/lib/queries", async () => ({
  ...await vi.importActual<typeof import("@/lib/queries")>("@/lib/queries"),
  useOperationSuppliers: () => ({ data: { suppliers: [{ id: "nf", name: "Nice Future" }] } }),
}));
/* The existing form is its own door; here it only proves it is opened and saves. */
vi.mock("./SupplierReplySection", () => ({
  stillToDeliver: (line: { qty: number; receivedQty: number }) => Math.max(0, line.qty - line.receivedQty),
  default: ({ onSaved, onCancel }: { onSaved: () => void; onCancel?: () => void }) => (
    <div data-testid="reply-form">Record supplier answer form
      <button type="button" onClick={onSaved}>Save</button><button type="button" onClick={onCancel}>Cancel</button></div>
  ),
}));
vi.mock("../components/EmbeddedSalesOrders", () => ({
  default: ({ orderIds }: { orderIds: string[] }) => <div data-testid="embedded">{orderIds.join(",")}</div>,
  linkedSalesOrderIds: (sources: Array<{ orderId: string | null }>) => [...new Set(sources.map((s) => s.orderId).filter(Boolean))],
}));

import SupplierAnswerTaskPanel from "./SupplierAnswerTaskPanel";
import type { WorkPanelHost } from "../tasks/tasks-host";

afterEach(() => { cleanup(); api.mockReset(); });

function po(sent: boolean) {
  return {
    id: "PO-260910-3301", supplier_id: "nf", version: 1, official_delivery_date: "2026-09-23", destination_id: "w1",
    sends: sent ? [{ kind: "confirmed_sent", po_version: 1, channel: "whatsapp", recipient: "group" }] : [],
    purchase_order_lines: [{ id: "l1", sku: "M1401F-K", model_name: "Mattress M1401F", size: "183X190CM", qty: 2, received_qty: 1 }],
    sources: [{ kind: "sales_order", order_id: "o-1206" }], promises: [],
  };
}

function mount(sent = true) {
  api.mockImplementation(async () => ({ pos: [po(sent)], destinations: [{ id: "w1", name: "Carres Klang" }] }));
  const host = { close: vi.fn(), back: vi.fn(), result: vi.fn(), openReview: vi.fn(), simulated: true } as unknown as WorkPanelHost & { result: ReturnType<typeof vi.fn> };
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}><MemoryRouter>
    <SupplierAnswerTaskPanel item={{ id: "t1", ruleKey: "purchasing.supplier_date_passed", timingBucket: "overdue", source: { object: { id: "PO-260910-3301" } } }} host={host} />
  </MemoryRouter></QueryClientProvider>);
  return host;
}
const panel = () => screen.getByTestId("supplier-answer-panel-PO-260910-3301");

describe("SupplierAnswerTaskPanel — PO Duty asks the supplier, on the exact PO", () => {
  it("shows the goods once (Order · Received · Pending Delivery) and opens the existing form from one button", async () => {
    const host = mount();
    await waitFor(() => expect(panel()).toBeInTheDocument());
    expect(within(panel()).getByText("Nice Future")).toBeInTheDocument();
    expect(within(panel()).getByText("Missed")).toBeInTheDocument();
    const table = within(panel()).getByRole("table", { name: "Goods lines" });
    expect(within(table).getAllByRole("columnheader").map((h) => h.textContent)).toEqual(["Item", "Order Qty", "Received Qty", "Pending Delivery Qty"]);
    expect(within(table).getAllByRole("cell").map((c) => c.textContent)).toEqual(["Mattress M1401F183X190CM", "2", "1", "1"]);
    expect(within(panel()).queryByTestId("reply-form")).toBeNull();
    fireEvent.click(within(panel()).getByTestId("supplier-answer-record"));
    fireEvent.click(within(panel()).getByRole("button", { name: "Save" }));
    expect(host.result).toHaveBeenCalledWith("Supplier answer recorded · Nice Future · PO-260910-3301-V1");
  });

  it("cannot record before the current version was sent", async () => {
    mount(false);
    await waitFor(() => expect(within(panel()).getByTestId("supplier-answer-record")).toBeDisabled());
  });
});

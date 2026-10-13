import type { ReactNode } from "react";
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
    sources: [{ kind: "sales_order", reference: "SO-1206", order_id: "o-1206" }], promises: [],
  };
}

function mount(sent = true) {
  api.mockImplementation(async () => ({ pos: [po(sent)], destinations: [{ id: "w1", name: "Carres Klang" }] }));
  const host = { close: vi.fn(), back: vi.fn(), result: vi.fn(), openReview: vi.fn(), simulated: true } as unknown as WorkPanelHost & { result: ReturnType<typeof vi.fn>; openReview: ReturnType<typeof vi.fn> };
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}><MemoryRouter>
    <SupplierAnswerTaskPanel item={{ id: "t1", ruleKey: "purchasing.supplier_date_passed", timingBucket: "overdue", source: { object: { id: "PO-260910-3301" } } }} host={host} />
  </MemoryRouter></QueryClientProvider>);
  return host;
}
const panel = () => screen.getByTestId("supplier-answer-panel-PO-260910-3301");

describe("SupplierAnswerTaskPanel — PO Duty asks the supplier, on the exact PO", () => {
  it("shows the task, the goods once (Order · Received · Pending Delivery) and opens the existing form from one button", async () => {
    const host = mount();
    await waitFor(() => expect(panel()).toBeInTheDocument());
    /* The one task view: the task, its page and record, then the PO's own facts. */
    expect(within(panel()).getByTestId("task-view-title")).toHaveTextContent("Ask Nice Future when the goods will arrive");
    expect(within(panel()).getByTestId("task-view-head")).toHaveTextContent("Purchasing/PO-260910-3301");
    expect(within(panel()).getByTestId("task-view-fact-deliver-to")).toHaveTextContent("Supplier Deliver ToCarres Klang");
    expect(within(panel()).getByTestId("task-view-fact-po-date")).toHaveTextContent("PO Delivery Date");
    const goods = within(panel()).getByRole("list", { name: "Goods lines" });
    expect(within(goods).getAllByRole("listitem").map((li) => li.textContent)).toEqual(["Mattress M1401F183X190CMOrder Qty2Received Qty1Pending Delivery Qty1"]);
    expect(screen.queryByTestId("reply-form")).toBeNull();
    /* The form's line table is wider than the panel: it opens on the host's
       full surface (the door Issue PO's review uses), never inside the panel. */
    fireEvent.click(within(panel()).getByTestId("supplier-answer-record"));
    expect(host.openReview).toHaveBeenCalledTimes(1);
    expect(within(panel()).queryByTestId("reply-form")).toBeNull();
    const close = vi.fn();
    render((host.openReview.mock.calls[0]![0] as (close: () => void) => ReactNode)(close));
    const surface = screen.getByTestId("task-wide-surface");
    expect(within(surface).getByRole("heading", { name: "Record supplier answer" })).toBeInTheDocument();
    expect(surface).toHaveTextContent("Nice Future · PO-260910-3301-V1");
    /* Cancel only closes the surface: nothing is recorded. */
    fireEvent.click(within(surface).getByRole("button", { name: "Cancel" }));
    expect(close).toHaveBeenCalledTimes(1);
    expect(host.result).not.toHaveBeenCalled();
    fireEvent.click(within(surface).getByRole("button", { name: "Save" }));
    expect(close).toHaveBeenCalledTimes(2);
    expect(host.result).toHaveBeenCalledWith("Supplier answer recorded · Nice Future · PO-260910-3301-V1");
  });

  it("cannot record before the current version was sent", async () => {
    mount(false);
    await waitFor(() => expect(within(panel()).getByTestId("supplier-answer-record")).toBeDisabled());
  });
});

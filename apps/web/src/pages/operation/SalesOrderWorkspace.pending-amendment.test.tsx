/**
 * A Sales Order with a pending amendment that cancels a line must still open.
 *
 * SO-1375 on production (30 Oct 2026): the request view's consequences read
 * `protectedLine` before the component had declared it, so every load of an
 * order whose waiting request removes a line threw a ReferenceError.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import SalesOrderWorkspace from "./SalesOrderWorkspace";

const apiFetch = vi.fn();
vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return { ...actual, apiFetch: (...args: unknown[]) => apiFetch(...args) };
});
vi.mock("@/lib/pdf/render", async () => {
  const actual = await vi.importActual<typeof import("@/lib/pdf/render")>("@/lib/pdf/render");
  return { ...actual, renderSalesOrderPdf: () => new Promise(() => {}) };
});

const ID = "22222222-2222-2222-2222-222222222222";
const ORDER = {
  id: ID, so: 1375, status: "proceed_order", operation_stage: "proceed_order",
  customer_name: "Customer", customer_phone: "019-0000 0075", customer_email: null,
  customer_address_line1: null, customer_address_line2: null, customer_address_city: null,
  customer_address_state: null, customer_address_postcode: null, customer_address_unknown: true,
  customer_billing: null, customer_billing_same: true, customer_emergency: null,
  customer_race: null, customer_gender: null, customer_birthday: null, entry_data: null,
  delivery_floor: null, delivery_has_lift: null, delivery_stair_items: null,
  placed_at: "2026-10-28T02:00:00Z", delivery_date: null, delivery_date_tbd: true, proceed_date: "2026-10-29",
  source_ref: null, source_system: null, paid: 0, dealer_id: null, outlet_id: null, salesperson_id: null,
  dealers: null, outlets: null, salespersons: null, installment_months: null, payment_method: null,
  do_number: null, invoice_no: null, invoiced_at: null, delivered_at: null, dispatched_at: null,
  warehouse_id: null, delivery_partner_id: null,
};
const LINES = [
  { id: "l1", sku: "SOFA-1", description: "Sofa", qty: 1, unit_price: 1000, attrs: null },
  { id: "l4", sku: "SVC-DELIVERY", description: "Delivery", qty: 1, unit_price: 100, attrs: null },
];
/* The waiting request keeps line 1 and leaves line 4 out — it cancels it. */
const AMENDMENT = {
  id: "a1", status: "submitted", stale: false, base_revision: 1,
  submitted_at: "2026-10-30T02:00:00Z", submitted_by_name: "Sales",
  proposed_snapshot: { lines: [{ id: "l1", sku: "SOFA-1", qty: 1, unit_price: 1000, attrs: null }] },
};

describe("Sales Order page with a pending amendment", () => {
  it("opens when the waiting request cancels a line", async () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    apiFetch.mockImplementation((path: unknown) => {
      if (path === `/api/operation/orders/${ID}`)
        return Promise.resolve({ order: ORDER, lines: LINES, addons: [], total: 1100, warehouse: null, stockBalances: [], freeUnits: [], pos: [], history: [], threads: [] });
      if (path === `/api/operation/orders/${ID}/amendment`) return Promise.resolve({ amendment: AMENDMENT });
      if (path === `/api/operation/orders/${ID}/revisions`) return Promise.resolve({ revisions: [] });
      return new Promise(() => {});
    });
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <MemoryRouter initialEntries={[`/operation/orders/so/${ID}`]}>
          <Routes>
            <Route path="/operation/orders/so/:orderId" element={<SalesOrderWorkspace />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );
    await screen.findByTestId("customer-type-chip", {}, { timeout: 4000 });
    /* Let the amendment read land and the request view compute. */
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.getByTestId("customer-type-chip")).toBeTruthy();
    const tdz = errors.mock.calls.flat().map(String).filter((m) => m.includes("before initialization"));
    expect(tdz).toEqual([]);
    errors.mockRestore();
  });
});

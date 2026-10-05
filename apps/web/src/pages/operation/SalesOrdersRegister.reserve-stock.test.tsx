/**
 * ⭐ `Reserve stock` on the quick view's Items — owner rulings 2026-10-05.
 *
 * A MANUAL line action, never a status. It follows the line's UNCOVERED
 * quantity — the existing door's own remainder (`so_line_remaining_requirement`)
 * — and opens the EXISTING Ready Stock door under the line. Having a PO never
 * hides it by itself; a fully covered line gets no action; viewing reserves
 * nothing; only a confirmed save, through the existing door, writes.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, within, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { operationOrderListRow } from "@/lib/queries";

const apiFetch = vi.fn();
vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return { ...actual, apiFetch: (...a: unknown[]) => apiFetch(...a) };
});
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const ORDER = "00000000-0000-0000-0000-00000000cafe";
const L1 = "11111111-1111-4111-8111-111111111111";
const L2 = "22222222-2222-4222-8222-222222222222";
const L3 = "33333333-3333-4333-8333-333333333333";
const lineFact = (lineId: string, status: string) => ({ lineId, sku: "B1201S-K", status, requiredQty: 3, usableQty: 0, purchasedQty: 0, issueQty: 0, arrivedUnallocatedQty: 0 });
const order = {
  id: ORDER, so: 1303, status: "proceed_order", operation_stage: "confirmed", warehouse_id: null, customer_name: "Kimmy",
  customer_phone: "019-3478913", placed_at: "2026-08-09T02:00:00Z", proceeded_at: "2026-08-10T02:00:00Z",
  delivery_date: "2026-08-30", delivery_date_tbd: false, delivery_partner_id: null, request_for_delivery_at: null,
  partner_accepted_at: null, partner_rejected_at: null, partner_rejected_reason: null, delivery_partners: null,
  do_number: null, dispatched_at: null, delivered_at: null, outlet_id: null, dealer_id: "d-1", dealers: { name: "Carres Kelana Jaya" },
  order_supplier_threads: [], order_annotations: [], paid: 0,
  order_lines: [
    { id: L1, sku: "B1201S-K", qty: 3, unit_price: 100 },
    { id: L2, sku: "B1201S-K", qty: 3, unit_price: 100 },
    { id: L3, sku: "B1201S-K", qty: 1, unit_price: 100 },
  ],
  order_addons: [], original_request: [{ revision: 1, snapshot: { header: { delivery_date: "2026-08-30", delivery_date_tbd: false } } }],
} as unknown as operationOrderListRow;

vi.mock("@/lib/queries", async () => {
  const actual = await vi.importActual<typeof import("@/lib/queries")>("@/lib/queries");
  return {
    ...actual,
    useOperationOrders: () => ({ data: { orders: [order], salesOrderTotal: 1 }, isLoading: false, isError: false, error: null, refetch: vi.fn() }),
    useSalesOrderRegisterFacts: () => ({
      data: {
        facts: { [ORDER]: { obligations: null, cases: null, stock: { status: "to_purchase", requiredQty: 7, usableQty: 0, purchasedQty: 3, issueQty: 0, arrivedUnallocatedQty: 0, lines: [lineFact(L1, "to_purchase"), lineFact(L2, "to_purchase"), lineFact(L3, "awaiting_goods")] } } },
        failed: { obligations: false, cases: false, stock: false },
      },
    }),
    useMonthlyDemandFacts: () => ({ data: { orders: [] }, isLoading: false, isError: false }),
    useCatalog: () => ({ data: { addons: [] } }),
    useCatalogNames: () => new Map(),
    useSalesOrderExpansion: () => ({ data: { lines: [] }, isLoading: false, isError: false, refetch: vi.fn() }),
  };
});

import SalesOrdersRegister from "./SalesOrdersRegister";

const unit = (n: number) => ({
  itemId: `00000000-0000-4000-8000-00000000000${n}`, unitCode: `U1-000-90${n}`, identityScope: "unit", sku: "B1201S-K",
  condition: "new", siteName: "Carres Klang", warehouseId: "wh", holderName: null, ownership: "carres_owned", supplier: null,
  qty: 1, dateIn: "2026-09-20", poNo: null, matchingLineIds: [L1, L2], lineIds: [L1, L2, L3], reservedForLineId: null, blocked: null,
});
const read = {
  orderId: ORDER, so: 1303, reference: "SO-1303",
  /* none covered 3 · a PO covers 2 of 3 → 1 · a PO covers it all → 0 */
  lines: [
    { orderLineId: L1, sku: "B1201S-K", item: "B1201S-K", qty: 3, reservedQty: 0, reservedUnitCodes: [], onPoQty: 0, remainingQty: 3 },
    { orderLineId: L2, sku: "B1201S-K", item: "B1201S-K", qty: 3, reservedQty: 0, reservedUnitCodes: [], onPoQty: 2, remainingQty: 1 },
    { orderLineId: L3, sku: "B1201S-K", item: "B1201S-K", qty: 1, reservedQty: 0, reservedUnitCodes: [], onPoQty: 1, remainingQty: 0 },
  ],
  units: [unit(1), unit(2), unit(3), unit(4)],
};

beforeEach(() => {
  apiFetch.mockReset();
  apiFetch.mockImplementation(async (path: string) => {
    if (path.endsWith("/ready-stock")) return read;
    return path.endsWith("/timeline") ? [] : {};
  });
});

const openItems = async () => {
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter initialEntries={["/operation/orders"]}><SalesOrdersRegister /></MemoryRouter>
    </QueryClientProvider>,
  );
  fireEvent.click(screen.getByRole("button", { name: "SO-1303" }));
  const drawer = screen.getByRole("dialog", { name: "SO-1303 · Kimmy" });
  fireEvent.click(within(drawer).getByRole("button", { name: "Items" }));
  return drawer;
};

describe("Reserve stock follows the line's uncovered quantity", () => {
  it("none covered and partly covered lines are offered it; a fully covered line is not — having a PO never hides it by itself", async () => {
    const drawer = await openItems();
    await waitFor(() => expect(within(drawer).getByTestId(`reserve-stock-offer-${L1}`)).toBeInTheDocument());
    expect(within(drawer).getByTestId(`reserve-stock-offer-${L1}`)).toHaveTextContent("4 in stock. Reserve for this order.");
    /* L2 has a PO for 2 of 3 and is still offered the remaining 1. */
    expect(within(drawer).getByTestId(`reserve-stock-offer-${L2}`)).toBeInTheDocument();
    expect(within(drawer).queryByTestId(`reserve-stock-offer-${L3}`)).toBeNull();
  });

  it("opening it shows the existing door under the line and reserves nothing", async () => {
    const drawer = await openItems();
    const offer = await within(drawer).findByTestId(`reserve-stock-offer-${L1}`);
    fireEvent.click(within(offer).getByRole("button", { name: "Reserve stock" }));
    const door = within(drawer).getByTestId(`reserve-stock-door-${L1}`);
    expect(within(door).getByRole("button", { name: "Choose Ready Unit" })).toBeDisabled();
    expect(apiFetch.mock.calls.filter(([path]) => String(path).includes("/ready-stock/save"))).toHaveLength(0);
  });

  it("a confirmed save goes through the existing door with this exact line", async () => {
    apiFetch.mockImplementation(async (path: string) => {
      if (path.endsWith("/ready-stock")) return read;
      if (path.endsWith("/ready-stock/save")) return { reserved: 1, added: 1, released: 0, reference: "SO-1303", units: [] };
      return path.endsWith("/timeline") ? [] : {};
    });
    const drawer = await openItems();
    const offer = await within(drawer).findByTestId(`reserve-stock-offer-${L2}`);
    fireEvent.click(within(offer).getByRole("button", { name: "Reserve stock" }));
    const door = within(drawer).getByTestId(`reserve-stock-door-${L2}`);
    fireEvent.click(within(door).getByRole("checkbox", { name: "Choose U1-000-901" }));
    fireEvent.click(within(door).getByRole("button", { name: "Choose Ready Unit" }));
    await waitFor(() => expect(apiFetch.mock.calls.some(([path]) => String(path).endsWith("/ready-stock/save"))).toBe(true));
    const [, init] = apiFetch.mock.calls.find(([path]) => String(path).endsWith("/ready-stock/save"))!;
    expect(JSON.parse((init as { body: string }).body)).toEqual({ orderId: ORDER, orderLineId: L2, itemIds: [unit(1).itemId] });
  });
});

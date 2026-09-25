/**
 * THE ORDER ROUTE survives a failed Purchasing read (Workspace §5.10): PO and
 * GRN read `Unavailable`, every other point still prints, and `Try again`
 * re-reads Purchasing.
 */
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const refetch = vi.fn();
vi.mock("./LogisticsCard", () => ({
  useLogisticsModel: () => ({
    scope: { loading: false, failed: false },
    card: { confirmedDate: null, scope: { customerDeliveryIso: "2026-10-27" }, stock: { ready: false } },
    o: { proceeded_at: "2026-09-18T02:00:00Z", delivered_at: null, order_finance_exceptions: [], ops_sofa_loans: [], order_lines: [], order_addons: [], paid: 0 },
    facts: { partner: { kvDefault: true }, answer: null },
    partnerName: "AL Logistics",
    model: { rows: [{}, { dueIso: "2026-10-24", state: "not_open", fact: null }, {}], exception: null },
  }),
}));
vi.mock("./SupplierCard", () => ({
  useSupplierCard: () => ({ model: null, factsQ: { isError: true, isLoading: false, refetch } }),
}));
vi.mock("./CustomerCard", () => ({ useCustomerCard: () => ({ model: null }) }));
vi.mock("@/lib/queries", () => ({ useLoanOffers: () => ({ data: { offers: [] } }) }));
vi.mock("../sales-order-facts", () => ({ moneyOfOrder: () => ({ known: true, outstanding: 0 }) }));

import WorkOrderRoute from "./WorkOrderRoute";

describe("WorkOrderRoute — a failed Purchasing read", () => {
  it("keeps Proceed, Contact and Delivery, says Unavailable for PO and GRN, and Try again re-reads", () => {
    render(<MemoryRouter><WorkOrderRoute orderId="order-1" onOpenParty={() => {}} /></MemoryRouter>);
    expect(screen.getByTestId("work-route-point-proceed")).toHaveTextContent("Done");
    expect(screen.getByTestId("work-route-point-po")).toHaveTextContent("Unavailable");
    expect(screen.getByTestId("work-route-point-grn")).toHaveTextContent("Unavailable");
    expect(screen.getByTestId("work-route-point-delivery")).toHaveTextContent("Requested");
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(refetch).toHaveBeenCalled();
  });
});

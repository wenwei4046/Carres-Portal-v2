/**
 * THE ORDER ROUTE survives a failed Purchasing read (Workspace §5.10): PO and
 * GRN read `Unavailable`, every other point still prints, and `Try again`
 * re-reads Purchasing.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const refetch = vi.fn();
const PROCEEDED = { proceeded_at: "2026-09-18T02:00:00Z" as string | null, proceed_date: null as string | null };
const order: { proceeded_at: string | null; proceed_date: string | null } = { ...PROCEEDED };
vi.mock("./LogisticsCard", () => ({
  useLogisticsModel: () => ({
    scope: { loading: false, failed: false },
    card: { confirmedDate: null, scope: { customerDeliveryIso: "2026-10-27" }, stock: { ready: false } },
    o: { ...order, delivered_at: null, order_finance_exceptions: [], ops_sofa_loans: [], order_lines: [], order_addons: [], paid: 0 },
    facts: { partner: { kvDefault: true }, answer: null },
    partnerName: "AL Logistics",
    model: { rows: [{}, { dueIso: "2026-10-24", state: "not_open", fact: null }, {}], exception: null },
    /* The stored settings the card read (9 Oct 2026): the defaults. */
    deliveryDays: { holidays: new Set<string>() },
    collectionTiming: undefined,
  }),
}));
vi.mock("./SupplierCard", () => ({
  useSupplierCard: () => ({ model: null, factsQ: { isError: true, isLoading: false, refetch } }),
}));
vi.mock("./CustomerCard", () => ({ useCustomerCard: () => ({ model: null }) }));
vi.mock("@/lib/queries", () => ({ useLoanOffers: () => ({ data: { offers: [] } }) }));
vi.mock("../sales-order-facts", () => ({ moneyOfOrder: () => ({ known: true, outstanding: 0 }) }));

import WorkOrderRoute from "./WorkOrderRoute";

beforeEach(() => Object.assign(order, PROCEEDED));

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

/* Owner ruling 2026-10-06: two facts, two names. `Proceed` is the hand-off
   (`proceeded_at`); the Planned production start (`proceed_date`) never
   stands in for it. */
describe("WorkOrderRoute — Proceed is proceeded_at only", () => {
  it("prints the hand-off day as the Kuala Lumpur day", () => {
    render(<MemoryRouter><WorkOrderRoute orderId="order-1" onOpenParty={() => {}} /></MemoryRouter>);
    expect(screen.getByTestId("work-route-point-proceed")).toHaveTextContent("18 Sep");
  });

  it("never prints the Planned production start when no hand-off is recorded", () => {
    Object.assign(order, { proceeded_at: null, proceed_date: "2026-09-20" });
    render(<MemoryRouter><WorkOrderRoute orderId="order-1" onOpenParty={() => {}} /></MemoryRouter>);
    const proceed = screen.getByTestId("work-route-point-proceed");
    expect(proceed).not.toHaveTextContent("20 Sep");
    expect(proceed).toHaveTextContent("Not proceeded");
  });
});

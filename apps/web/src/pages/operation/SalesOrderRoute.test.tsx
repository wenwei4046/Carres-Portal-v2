import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import type { SalesOrderRoute as Route } from "@carres/shared";
import SalesOrderRoute from "./SalesOrderRoute";

const route: Route = {
  orderId: "order-1",
  soNumber: "SO-1318",
  currentPositions: ["Bed · Delivered", "Sofa · At Carres / In production at supplier"],
  noActionRequired: false,
  documents: [
    { id: "so", kind: "Sales Order", number: "SO-1318", href: "/operation/orders/so/order-1" },
    { id: "po", kind: "Purchase Order", number: "PO-8002", href: "/operation/procurement?po=PO-8002", detail: "In production at supplier" },
  ],
  lanes: [
    {
      key: "goods",
      title: "Goods",
      groups: [{
        id: "sofa",
        title: "Sofa · 2",
        facts: [
          { id: "unit", title: "At Carres · Unit id-sofa00001", detail: "From PO-8002", state: "current", owner: "Stock", href: "/operation?tab=stock-onhand", occurredAt: "2026-08-12" },
          { id: "po", title: "In production at supplier · PO-8002", detail: "1 unit · Expected 2026-08-18", state: "current", owner: "Purchasing", href: "/operation/procurement?po=PO-8002", occurredAt: null },
        ],
      }],
    },
    { key: "delivery", title: "Delivery", groups: [{ id: "delivery", title: "Delivery", facts: [{ id: "d", title: "Delivery 1 · Not Delivered", detail: "Customer unavailable", state: "attention", owner: "Delivery", href: "/operation?tab=delivery", occurredAt: "2026-08-13" }] }] },
    { key: "money", title: "Money", groups: [{ id: "money", title: "Customer to Carres", facts: [{ id: "m", title: "RM 1,500.00 owed by customer", detail: null, state: "attention", owner: "Finance", href: "/finance/ar", occurredAt: null }] }] },
    { key: "loan", title: "Loan", groups: [{ id: "loan", title: "Loan", facts: [{ id: "l", title: "No loan obligation", detail: null, state: "clear", owner: "Loan", href: null, occurredAt: null }] }] },
    { key: "other", title: "Other Commitments", groups: [{ id: "work", title: "Work", facts: [{ id: "w", title: "Review PO quantity · Open", detail: null, state: "attention", owner: "Purchasing", href: "/operation?tab=work", occurredAt: null }] }] },
  ],
};

describe("SalesOrderRoute", () => {
  it("renders five independent lanes and simultaneous positions", () => {
    render(<MemoryRouter><SalesOrderRoute route={route} /></MemoryRouter>);
    for (const title of ["Goods", "Delivery", "Money", "Loan", "Other Commitments"])
      expect(screen.getByRole("heading", { level: 2, name: title })).toBeTruthy();
    expect(screen.getByText("Bed · Delivered")).toBeTruthy();
    expect(screen.getByText("Sofa · At Carres / In production at supplier")).toBeTruthy();
    expect(screen.queryByText(/You are here/i)).toBeNull();
  });

  it("links documents and facts to their owning surfaces", () => {
    render(<MemoryRouter><SalesOrderRoute route={route} /></MemoryRouter>);
    expect(screen.getByRole("link", { name: /PO-8002/ })).toHaveAttribute("href", "/operation/procurement?po=PO-8002");
    const goods = screen.getByTestId("route-lane-goods");
    expect(within(goods).getByRole("link", { name: "Open in Stock" })).toHaveAttribute("href", "/operation?tab=stock-onhand");
    expect(within(goods).getByRole("link", { name: "Open in Purchasing" })).toHaveAttribute("href", "/operation/procurement?po=PO-8002");
  });

  it("never renders an editable checklist or an overall status", () => {
    render(<MemoryRouter><SalesOrderRoute route={route} /></MemoryRouter>);
    expect(screen.queryByRole("checkbox")).toBeNull();
    expect(screen.queryByText(/^Status$/i)).toBeNull();
    expect(screen.getByText("Open obligations remain in their owning modules.")).toBeTruthy();
  });
});

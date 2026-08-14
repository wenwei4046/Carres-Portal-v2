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
  it("renders a readable route per goods group and simultaneous positions", () => {
    render(<MemoryRouter><SalesOrderRoute route={route} /></MemoryRouter>);
    expect(screen.getByRole("heading", { name: "Goods routes" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Sofa · 2" })).toBeTruthy();
    expect(screen.getAllByText("CURRENT")).toHaveLength(2);
    expect(screen.queryByText("Document lineage")).toBeNull();
    expect(screen.queryByText("Current goods positions")).toBeNull();
    expect(screen.queryByText(/You are here/i)).toBeNull();
  });

  it("marks an unresolved goods position as CURRENT when no later stage exists", () => {
    const waitingRoute: Route = {
      ...route,
      lanes: route.lanes.map((lane) => lane.key === "goods" ? {
        ...lane,
        groups: [{
          id: "bed",
          title: "Bed · 1",
          facts: [{
            id: "unassigned",
            title: "Waiting for Purchasing · 1 item",
            detail: null,
            state: "attention",
            owner: "Purchasing",
            href: "/operation?tab=purchase",
            occurredAt: null,
          }],
        }],
      } : lane),
    };

    render(<MemoryRouter><SalesOrderRoute route={waitingRoute} /></MemoryRouter>);
    const goods = screen.getByTestId("goods-routes");
    expect(within(goods).getByText("CURRENT")).toBeInTheDocument();
  });

  it("marks the terminal delivered fact as CURRENT when the route has no explicit current fact", () => {
    const deliveredRoute: Route = {
      ...route,
      lanes: route.lanes.map((lane) => lane.key === "goods" ? {
        ...lane,
        groups: [{
          id: "bed",
          title: "Bed · 1",
          facts: [{
            id: "delivered",
            title: "Delivered · Unit id-bed00001",
            detail: "DO-9001",
            state: "complete",
            owner: "Delivery",
            href: "/operation?tab=delivery",
            occurredAt: "2026-08-14",
          }],
        }],
      } : lane),
    };

    render(<MemoryRouter><SalesOrderRoute route={deliveredRoute} /></MemoryRouter>);
    const goods = screen.getByTestId("goods-routes");
    expect(within(goods).getByText("CURRENT")).toBeInTheDocument();
  });

  it("links documents and facts to their owning surfaces", () => {
    render(<MemoryRouter><SalesOrderRoute route={route} /></MemoryRouter>);
    expect(screen.getByRole("link", { name: /PO-8002/ })).toHaveAttribute("href", "/operation/procurement?po=PO-8002");
    const goods = screen.getByTestId("goods-routes");
    expect(within(goods).getByRole("link", { name: /Open in Stock/ })).toHaveAttribute("href", "/operation?tab=stock-onhand");
    expect(within(goods).getByRole("link", { name: /PO-8002.*Open in Purchasing/ })).toHaveAttribute("href", "/operation/procurement?po=PO-8002");
  });

  it("shows only meaningful obligations in a secondary Still owed checklist", () => {
    render(<MemoryRouter><SalesOrderRoute route={route} /></MemoryRouter>);
    expect(screen.queryByRole("checkbox")).toBeNull();
    expect(screen.queryByText(/^Status$/i)).toBeNull();
    expect(screen.getByRole("heading", { name: "Still owed" })).toBeTruthy();
    expect(screen.getByText("RM 1,500.00 owed by customer")).toBeTruthy();
    expect(screen.queryByText("No loan obligation")).toBeNull();
  });
});

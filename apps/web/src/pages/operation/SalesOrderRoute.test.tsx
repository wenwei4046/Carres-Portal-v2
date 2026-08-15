import { describe, expect, it } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { SalesOrderRoute as Route } from "@carres/shared";
import SalesOrderRoute, { type RouteActionOwners } from "./SalesOrderRoute";

const owners: RouteActionOwners = {
  purchasing: { userId: "u-yj", name: "Yu Jun", email: "yujun@carres.my" },
  receiving: { userId: "u-sh", name: "Shasha", email: "shasha@carres.my" },
};

function route(over: Partial<Route> = {}): Route {
  return {
    orderId: "order-1",
    soNumber: "SO-1319",
    customerName: "Lim Kuan Yang",
    tracks: [
      { key: "goods", title: "GOODS", mark: "current", status: "1 item waiting for Purchasing", door: null },
      { key: "stock", title: "STOCK", mark: "current", status: "1 of 3 Units ready", door: null },
      { key: "delivery", title: "DELIVERY", mark: "current", status: "Appointment not confirmed", door: null },
      {
        key: "money",
        title: "MONEY",
        mark: "current",
        status: "RM 1,249.00 still to collect",
        door: { label: "Open Payments →", href: "/operation?tab=payments&so=1319" },
      },
    ],
    linkedProblems: [],
    goodsRoutes: [
      {
        id: "B1201S",
        title: "B1201S · King · Qty 3",
        qty: 3,
        cancelled: false,
        cancelledWord: null,
        origin: {
          id: "origin",
          title: "SALES ORDER",
          mark: "complete",
          evidence: "SO-1319 · Ordered: 2026-08-12",
          status: null,
          action: null,
          door: { label: "Open SO-1319 →", href: "/operation/orders/so/order-1" },
          current: false,
        },
        forked: true,
        lanes: [
          {
            id: "ready",
            title: "Qty 1 · READY STOCK",
            qty: 1,
            source: "ready-stock",
            destination: "Carres Klang",
            stations: [
              {
                id: "ready:stock",
                title: "STOCK",
                mark: "complete",
                evidence: "UNT-8821 · Carres Klang",
                status: null,
                action: null,
                door: { label: "Open Stock →", href: "/operation?tab=stock-onhand" },
                current: false,
              },
            ],
          },
          {
            id: "purchase",
            title: "Qty 2 · PURCHASE",
            qty: 2,
            source: "purchase",
            destination: null,
            stations: [
              {
                id: "p:purchasing",
                title: "PURCHASING",
                mark: "complete",
                evidence: "PO-2048 · Issued: 2026-08-13",
                status: null,
                action: null,
                door: { label: "Open PO-2048 →", href: "/operation/procurement?po=PO-2048" },
                current: false,
              },
              {
                id: "p:supplier",
                title: "SUPPLIER",
                mark: "current",
                evidence: null,
                status: "Ready date not confirmed",
                action: { ownerKey: "purchasing", label: "Confirm the ready date" },
                door: { label: "Open PO-2048 →", href: "/operation/procurement?po=PO-2048" },
                current: true,
              },
              {
                id: "p:receiving",
                title: "RECEIVING",
                mark: "waiting",
                evidence: null,
                status: "Not received yet",
                action: null,
                door: null,
                current: false,
              },
            ],
          },
        ],
      },
    ],
    release: {
      ready: false,
      headline: "NOT READY FOR DELIVERY",
      summary: "3 requirements still open",
      openCount: 3,
      requirements: [
        { id: "goods", mark: "waiting", title: "Goods not ready", details: ["1 of 3 ready"] },
        {
          id: "money",
          mark: "blocked",
          title: "Money release not cleared",
          details: ["RM 1,249.00 still to collect"],
        },
        {
          id: "appointment",
          mark: "waiting",
          title: "Appointment not confirmed",
          details: ["Customer requested: 2026-09-24"],
        },
      ],
      door: { label: "Open Delivery →", href: "/operation?tab=delivery&order=order-1" },
    },
    ...over,
  };
}

const draw = (r: Route = route()) =>
  render(
    <MemoryRouter>
      <SalesOrderRoute route={r} owners={owners} />
    </MemoryRouter>,
  );

describe("Order Route — layer 1", () => {
  it("renders the four tracks as four rows and never as one status", () => {
    draw();
    const tracks = screen.getByTestId("order-tracks");
    for (const word of ["GOODS", "STOCK", "DELIVERY", "MONEY"]) {
      expect(within(tracks).getByText(word)).toBeInTheDocument();
    }
    expect(within(tracks).getByText("1 of 3 Units ready")).toBeInTheDocument();
    expect(within(tracks).getByText("RM 1,249.00 still to collect")).toBeInTheDocument();
  });

  it("hides LINKED PROBLEMS when nothing is linked", () => {
    draw();
    expect(screen.queryByTestId("linked-problems")).not.toBeInTheDocument();
  });

  it("shows LINKED PROBLEMS with its door when a case exists", () => {
    draw(
      route({
        linkedProblems: [
          {
            id: "case:1",
            title: "SC-1031 · Investigation in progress",
            door: { label: "Open SC-1031 →", href: "/operation?tab=service-notes&case=1" },
          },
        ],
      }),
    );
    const panel = screen.getByTestId("linked-problems");
    expect(within(panel).getByText("SC-1031 · Investigation in progress")).toBeInTheDocument();
    expect(within(panel).getByRole("link", { name: "Open SC-1031 →" })).toHaveAttribute(
      "href",
      "/operation?tab=service-notes&case=1",
    );
  });
});

describe("Order Route — goods routes", () => {
  it("draws one sub-lane per fork, each with its count", () => {
    draw();
    expect(screen.getByText("Qty 1 · READY STOCK")).toBeInTheDocument();
    expect(screen.getByText("Qty 2 · PURCHASE")).toBeInTheDocument();
  });

  it("spells every date through the one date format, with its meaning label", () => {
    draw();
    expect(screen.getByText("SO-1319 · Ordered: Wed, 12 Aug")).toBeInTheDocument();
    expect(screen.getByText("PO-2048 · Issued: Thu, 13 Aug")).toBeInTheDocument();
    expect(screen.queryByText(/2026-08-13/)).not.toBeInTheDocument();
  });

  it("marks CURRENT on the station that holds it and nowhere else", () => {
    draw();
    expect(screen.getAllByText("CURRENT")).toHaveLength(1);
    const supplier = screen.getByTestId("station-p:supplier");
    expect(within(supplier).getByText("CURRENT")).toBeInTheDocument();
  });

  it("carries the action with the resolved owner as a chip, not a name in the sentence", () => {
    draw();
    const supplier = screen.getByTestId("station-p:supplier");
    expect(within(supplier).getByText("Confirm the ready date")).toBeInTheDocument();
    expect(within(supplier).getByLabelText("Yu Jun")).toHaveTextContent("YJ");
    expect(within(supplier).queryByText(/Yu Jun Confirm/)).not.toBeInTheDocument();
  });

  it("says a not-started station in words, never a dash", () => {
    draw();
    const receiving = screen.getByTestId("station-p:receiving");
    expect(within(receiving).getByText("Not received yet")).toBeInTheDocument();
    expect(receiving.textContent).not.toContain("—");
  });

  it("opens a ✓ station's door onto the object that owns it", () => {
    draw();
    expect(screen.getAllByRole("link", { name: "Open PO-2048 →" })[0]).toHaveAttribute(
      "href",
      "/operation/procurement?po=PO-2048",
    );
  });

  it("collapses and reopens a goods block", () => {
    draw();
    const toggle = screen.getByRole("button", { name: /B1201S · King · Qty 3/ });
    expect(screen.getByText("Qty 2 · PURCHASE")).toBeInTheDocument();
    fireEvent.click(toggle);
    expect(screen.queryByText("Qty 2 · PURCHASE")).not.toBeInTheDocument();
    fireEvent.click(toggle);
    expect(screen.getByText("Qty 2 · PURCHASE")).toBeInTheDocument();
  });

  it("renders a cancelled line as one grey line with no stations", () => {
    draw(
      route({
        goodsRoutes: [
          {
            id: "cancelled:SOFA-X",
            title: "Haven Sofa · Qty 1",
            qty: 1,
            cancelled: true,
            cancelledWord: "Cancelled · Rev 3",
            origin: null,
            lanes: [],
            forked: false,
          },
        ],
      }),
    );
    const block = screen.getByTestId("goods-route-cancelled:SOFA-X");
    expect(block).toHaveTextContent("Haven Sofa · Qty 1 · Cancelled · Rev 3");
    expect(within(block).queryByRole("button")).not.toBeInTheDocument();
  });
});

describe("Order Route — delivery release", () => {
  it("renders the derived headline, the open count and every requirement", () => {
    draw();
    const release = screen.getByTestId("delivery-release");
    expect(within(release).getByText("NOT READY FOR DELIVERY")).toBeInTheDocument();
    expect(within(release).getByText("3 requirements still open")).toBeInTheDocument();
    expect(within(release).getByText("Goods not ready")).toBeInTheDocument();
    expect(within(release).getByText("1 of 3 ready")).toBeInTheDocument();
    expect(within(release).getByText("Customer requested: Thu, 24 Sep")).toBeInTheDocument();
  });

  it("offers the Delivery door and NO release button", () => {
    draw();
    const release = screen.getByTestId("delivery-release");
    expect(within(release).getByRole("link", { name: "Open Delivery →" })).toBeInTheDocument();
    expect(within(release).queryAllByRole("button")).toHaveLength(0);
  });

  it("keeps the released-but-still-owed amount on screen", () => {
    draw(
      route({
        release: {
          ready: true,
          headline: "READY FOR DELIVERY",
          summary: "All release requirements are complete.",
          openCount: 0,
          requirements: [
            {
              id: "money",
              mark: "complete",
              title: "Money release cleared",
              details: ["RM 1,249.00 remains to collect", "Manager release recorded"],
            },
          ],
          door: { label: "Open Delivery →", href: "/operation?tab=delivery&order=order-1" },
        },
      }),
    );
    const release = screen.getByTestId("delivery-release");
    expect(within(release).getByText("Money release cleared")).toBeInTheDocument();
    expect(within(release).getByText("RM 1,249.00 remains to collect")).toBeInTheDocument();
    expect(within(release).getByText("Manager release recorded")).toBeInTheDocument();
  });
});

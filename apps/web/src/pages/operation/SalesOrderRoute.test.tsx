import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import {
  resolveSalesOrderRoute,
  type SalesOrderRouteInput,
  type SalesOrderRouteMap,
} from "@carres/shared";
import SalesOrderRoute, { type RouteActionOwners } from "./SalesOrderRoute";

const owners: RouteActionOwners = {
  purchasing: { userId: "u-yj", name: "Yu Jun", email: "yujun@carres.my" },
  receiving: { userId: "u-sh", name: "Shasha", email: "shasha@carres.my" },
};

/* The fixture is the REAL resolver, so the page can never be asserted against a
   map shape the shared module no longer produces. */
function input(over: Partial<SalesOrderRouteInput> = {}): SalesOrderRouteInput {
  return {
    order: {
      id: "order-1",
      so: 1319,
      customerName: "Lim Kuan Yang",
      placedAt: "2026-08-12",
      deliveryDate: "2026-09-24",
      deliveredAt: null,
    },
    lineLabels: { B1201S: "B1201S · King" },
    lineDestinations: {},
    cancelledLines: [],
    allocation: {
      orderId: "order-1",
      soRef: "SO-1319",
      lines: [
        {
          sku: "B1201S",
          committedQty: 3,
          reservedUnits: [],
          soldUnits: [],
          reservedQty: 0,
          soldQty: 0,
          outstandingQty: 3,
        },
      ],
      unmatchedUnits: [],
      totals: { committedQty: 3, reservedQty: 0, soldQty: 0, outstandingQty: 3 },
    },
    purchaseOrders: [
      {
        id: "PO-2048",
        issuedAt: "2026-08-13",
        expectedReadyDate: null,
        lines: [{ sku: "B1201S", qty: 3, receivedQty: 0 }],
      },
    ],
    receivingRecords: [],
    delivery: { logistics: null, booking: null, attempts: [] },
    money: { known: true, outstanding: 1249 },
    financeExceptions: [],
    paymentApprovals: [],
    loans: [],
    cases: [],
    claims: [],
    ...over,
  };
}

const map = (over: Partial<SalesOrderRouteInput> = {}): SalesOrderRouteMap =>
  resolveSalesOrderRoute(input(over));

function Where() {
  return <span data-testid="where">{useLocation().pathname + useLocation().search}</span>;
}

const draw = (r: SalesOrderRouteMap = map()) =>
  render(
    <MemoryRouter>
      <SalesOrderRoute route={r} owners={owners} />
      <Where />
    </MemoryRouter>,
  );

const nodeEl = (id: string) => screen.getByTestId(`route-node-${id}`);

/* ─────────────────────────────────────────────────────────────────────────────
 * ONE CANVAS — the three stacked section cards are gone.
 * ──────────────────────────────────────────────────────────────────────────── */

describe("Order Route — one canvas", () => {
  it("renders one connected map surface and none of the retired section cards", () => {
    const { container } = draw();
    expect(screen.getAllByTestId("route-canvas")).toHaveLength(1);
    expect(screen.queryByTestId("order-tracks")).not.toBeInTheDocument();
    expect(screen.queryByTestId("goods-routes")).not.toBeInTheDocument();
    expect(screen.queryByTestId("delivery-release")).not.toBeInTheDocument();
    expect(container.querySelector("table")).toBeNull();
  });

  it("does not repeat the identity the Object Header already shows", () => {
    draw();
    expect(screen.queryByRole("heading", { level: 1, name: "Order Route" })).not.toBeInTheDocument();
    expect(screen.queryByText("SO-1319 · Lim Kuan Yang")).not.toBeInTheDocument();
  });

  it("stacks many goods as disclosure groups and opens the line holding current work", () => {
    const resolved = map({
      lineLabels: { B1201S: "B1201S · King", SOFA9: "SOFA9 · Three-seater" },
      allocation: {
        orderId: "order-1",
        soRef: "SO-1319",
        lines: [
          { sku: "B1201S", committedQty: 3, reservedUnits: [], soldUnits: [], reservedQty: 0, soldQty: 0, outstandingQty: 3 },
          { sku: "SOFA9", committedQty: 1, reservedUnits: [], soldUnits: [], reservedQty: 0, soldQty: 0, outstandingQty: 1 },
        ],
        unmatchedUnits: [],
        totals: { committedQty: 4, reservedQty: 0, soldQty: 0, outstandingQty: 4 },
      },
      purchaseOrders: [
        { id: "PO-2048", issuedAt: "2026-08-13", expectedReadyDate: null, lines: [{ sku: "B1201S", qty: 3, receivedQty: 0 }] },
        { id: "PO-2050", issuedAt: "2026-08-13", expectedReadyDate: null, lines: [{ sku: "SOFA9", qty: 1, receivedQty: 0 }] },
      ],
    });
    draw(resolved);
    expect(nodeEl("B1201S:goods-line")).toHaveAttribute("aria-expanded", "true");
    expect(nodeEl("SOFA9:goods-line")).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByTestId("route-node-PO-2050:supplier")).not.toBeInTheDocument();
    fireEvent.click(nodeEl("SOFA9:goods-line"));
    expect(nodeEl("SOFA9:goods-line")).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByTestId("route-node-PO-2050:supplier")).toBeInTheDocument();
    expect(screen.queryByTestId("route-node-PO-2048:supplier")).not.toBeInTheDocument();
  });

  it("draws one connector for every edge in the map", () => {
    const m = map();
    draw(m);
    /* Scoped to the edge layer — a zoom-control icon is drawn from polylines too. */
    expect(screen.getByTestId("route-edges").querySelectorAll("polyline")).toHaveLength(
      m.edges.length,
    );
  });

  it("marks a future segment dashed and a walked one solid", () => {
    draw();
    expect(
      screen.getByTestId("route-edge-PO-2048:purchasing--PO-2048:supplier"),
    ).toHaveAttribute("data-style", "solid");
    expect(
      screen.getByTestId("route-edge-PO-2048:supplier--PO-2048:receiving"),
    ).toHaveAttribute("data-style", "dashed");
  });

  it("names the routes on group bands and the goods line on its plate — never on a connector", () => {
    draw();
    expect(screen.getByTestId("route-band-goods")).toHaveTextContent("GOODS");
    expect(screen.getByTestId("route-band-delivery")).toHaveTextContent("DELIVERY");
    expect(screen.getByTestId("route-band-money")).toHaveTextContent("MONEY");
    const plate = nodeEl("B1201S:goods-line");
    expect(plate).toHaveTextContent("B1201S · King");
    expect(plate).toHaveTextContent("Qty 3 · 3 to buy from factory");
    /* The edge layer draws no caption text at all. */
    expect(screen.getByTestId("route-edges").querySelectorAll("text")).toHaveLength(0);
  });

  it("fits the whole map with a control the operator can always reach", () => {
    draw();
    expect(screen.getByTestId("route-zoom-out")).toBeInTheDocument();
    expect(screen.getByTestId("route-zoom-in")).toBeInTheDocument();
    expect(screen.getByTestId("route-fit")).toBeInTheDocument();
  });

  it("zooms the surface without reflowing it", () => {
    draw();
    const surface = screen.getByTestId("route-surface");
    const before = surface.getAttribute("style");
    fireEvent.click(screen.getByTestId("route-zoom-in"));
    expect(surface.getAttribute("style")).not.toBe(before);
    /* Same surface, same map — a zoom is not a re-layout. */
    expect(screen.getByTestId("route-node-money")).toBeInTheDocument();
  });
});

/* ─────────────────────────────────────────────────────────────────────────────
 * NODE ANATOMY.
 * ──────────────────────────────────────────────────────────────────────────── */

describe("Order Route — the nodes", () => {
  it("names each node, states its fact and shows its door", () => {
    draw();
    const purchasing = nodeEl("PO-2048:purchasing");
    expect(purchasing).toHaveTextContent("PURCHASING");
    expect(purchasing).toHaveTextContent("PO-2048");
    expect(purchasing).toHaveTextContent("Open PO-2048 →");
  });

  it("spells a date through the one date format and never ships a bare ISO string", () => {
    draw();
    expect(nodeEl("sales-order")).toHaveTextContent("SO Date: Wed, 12 Aug");
    expect(nodeEl("sales-order")).not.toHaveTextContent("2026-08-12");
  });

  it("gives CURRENT its own mark and puts the owner beside the instruction", () => {
    draw();
    const supplier = nodeEl("PO-2048:supplier");
    expect(supplier).toHaveAttribute("data-current", "true");
    expect(supplier).toHaveAttribute("data-mark", "current");
    expect(supplier).toHaveTextContent("Confirm ready date");
    /* Initials on the node; the sentence never repeats the name. */
    expect(supplier).toHaveTextContent("YJ");
    expect(supplier).not.toHaveTextContent("Yu Jun: Confirm");
  });

  it("keeps fact, owner action and document due context on three separate rows", () => {
    draw();
    const supplier = nodeEl("PO-2048:supplier");
    const fact = screen.getByTestId("route-fact-PO-2048:supplier-0");
    const action = screen.getByTestId("route-action-PO-2048:supplier");
    const context = screen.getByTestId("route-context-PO-2048:supplier");

    expect(fact).toHaveTextContent("Ready date not confirmed");
    expect(fact).toHaveClass("text-body", "font-semibold");
    expect(action).toHaveTextContent("YJ");
    expect(action).toHaveTextContent("Confirm ready date");
    expect(action).toHaveClass("text-label");
    expect(context).toHaveTextContent(
      "PO-2048 · 3 Units · Carres Warehouse · Requested Delivery Date: Thu, 24 Sep",
    );
    expect(context).not.toHaveTextContent(/Due:|No due date|Next Action|Priority/i);
    expect(context).toHaveClass("text-label", "text-base-600");
    expect(fact.parentElement).toBe(supplier);
    expect(action.parentElement).toBe(supplier);
    expect(context.parentElement).toBe(supplier);
    expect(within(supplier).queryByText("Open PO-2048 →")).not.toBeInTheDocument();
  });

  it("shows at most three CURRENT nodes, one per route", () => {
    const { container } = draw();
    expect(container.querySelectorAll('[data-current="true"]')).toHaveLength(3);
  });

  it("marks a step nobody has reached as a future path", () => {
    draw();
    expect(nodeEl("PO-2048:receiving")).toHaveAttribute("data-mark", "future");
  });

  it("says what is missing, why and who does what next — never a banned empty word", () => {
    const { container } = draw();
    expect(nodeEl("delivery-photo")).toHaveTextContent("No delivery photo yet");
    for (const banned of ["No data", "No results", "Not available"]) {
      expect(container.textContent).not.toContain(banned);
    }
  });
});

/* ─────────────────────────────────────────────────────────────────────────────
 * THE GATE — read-only in every state.
 * ──────────────────────────────────────────────────────────────────────────── */

describe("Order Route — the gate", () => {
  it("lists the missing requirements with the met count", () => {
    draw();
    const gate = nodeEl("delivery-order");
    expect(gate).toHaveTextContent("NOT READY FOR DELIVERY");
    /* Owner ruling 2026-08-19 — the order owes RM 1,249 and the gate COUNTS
       it again: money in full, or an approved payment approval. The balance
       also stays on the MONEY branch with its open collect. */
    expect(gate).toHaveTextContent("1 of 5 requirements met");
    expect(gate).toHaveTextContent("Goods not ready (0 of 3)");
    expect(gate).toHaveTextContent("No logistics chosen");
    expect(gate).toHaveTextContent("Date + slot not confirmed");
    expect(gate).toHaveTextContent(
      "RM 1,249.00 still outstanding — collect, or request a payment approval",
    );
    expect(gate).toHaveTextContent("No Finance hold");
  });

  it("renders no Release, Approve or any other control inside the map", () => {
    draw();
    /* The only page controls are goods disclosure plus the three zoom controls. */
    const labels = screen.getAllByRole("button").map((b) => b.getAttribute("aria-label"));
    expect(labels).toEqual([
      "B1201S · King — Qty 3 · 3 to buy from factory",
      "Zoom out",
      "Zoom in",
      "Fit the whole route",
    ]);
    expect(screen.queryByRole("button", { name: /release/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /approve/i })).not.toBeInTheDocument();
  });

  it("shows the refused day on the gate when the confirmed date is a Sunday", () => {
    draw(
      map({
        delivery: {
          logistics: { partnerName: "NETS" },
          booking: { confirmedDate: "2026-09-06", slot: "12pm–3pm", scope: null },
          attempts: [],
        },
      }),
    );
    expect(nodeEl("delivery-order")).toHaveTextContent(
      "Date falls on a Sunday — pick another day",
    );
  });
});

/* ─────────────────────────────────────────────────────────────────────────────
 * LOAN.
 * ──────────────────────────────────────────────────────────────────────────── */

describe("Order Route — the loan", () => {
  it("draws no loan node on a clean order", () => {
    draw();
    expect(screen.queryByTestId("route-node-loan:L1")).not.toBeInTheDocument();
  });

  it("draws an amber loan node and its `collect back` line when an item is out", () => {
    draw(map({ loans: [{ id: "L1", label: "sofa", qty: 1, returned: false }] }));
    const loan = nodeEl("loan:L1");
    expect(loan).toHaveAttribute("data-mark", "blocked");
    expect(loan).toHaveTextContent("1 sofa on loan to customer");
    expect(screen.getByTestId("route-edge-loan:L1--deliver")).toHaveAttribute(
      "data-style",
      "dashed",
    );
  });
});

/* ─────────────────────────────────────────────────────────────────────────────
 * ACCESSIBILITY — card §12.
 * ──────────────────────────────────────────────────────────────────────────── */

describe("Order Route — accessibility", () => {
  it("makes every node focusable and reads its lines in order", () => {
    draw();
    const supplier = nodeEl("PO-2048:supplier");
    expect(supplier).toHaveAttribute("tabindex", "0");
    expect(supplier.getAttribute("aria-label")).toBe(
      "SUPPLIER — Ready date not confirmed — Yu Jun: Confirm ready date — PO-2048 · 3 Units · Carres Warehouse · Requested Delivery Date: Thu, 24 Sep",
    );
    expect(supplier).toHaveAttribute("aria-current", "step");
  });

  it("puts the tab order in reading order — SO, goods, delivery, money, gate, tail", () => {
    const m = map();
    const { container } = draw(m);
    const drawn = [...container.querySelectorAll("[data-testid^='route-node-']")].map((el) =>
      el.getAttribute("data-testid")!.replace("route-node-", ""),
    );
    expect(drawn).toEqual(m.nodes.map((n) => n.id));
    expect(drawn[0]).toBe("sales-order");
    expect(drawn.slice(-3)).toEqual(["delivery-order", "deliver", "delivery-photo"]);
  });

  it("opens the node's door on Enter and on Space", () => {
    draw();
    fireEvent.keyDown(nodeEl("money"), { key: "Enter" });
    expect(screen.getByTestId("where")).toHaveTextContent("/operation?tab=payments&so=1319");
  });

  it("never carries state in colour alone", () => {
    draw();
    /* complete carries the tick glyph, future carries the dashed border, the
       exception carries its words — each readable without the hue. */
    expect(nodeEl("PO-2048:purchasing")).toHaveAttribute("data-mark", "complete");
    expect(nodeEl("PO-2048:receiving").className).toContain("border-dashed");
    expect(nodeEl("PO-2048:supplier")).toHaveTextContent("Current");
  });

  it("⭐ pans a focused off-frame node into view — the browser cannot scroll a transformed canvas", () => {
    /* Slice 4. The surface is positioned by CSS transform, so tabbing to a
       node below the frame would otherwise leave a keyboard user working
       blind. jsdom has no layout, so the frame is given a real box here; the
       map is taller than it, which puts the tail nodes outside. */
    const rect = vi
      .spyOn(HTMLElement.prototype, "getBoundingClientRect")
      .mockReturnValue({
        width: 400,
        height: 300,
        top: 0,
        left: 0,
        right: 400,
        bottom: 300,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      } as DOMRect);
    try {
      draw();
      const surface = screen.getByTestId("route-surface");
      const ty = () =>
        Number(/translate\([-\d.]+px, ([-\d.]+)px\)/.exec(surface.getAttribute("style") ?? "")?.[1]);
      const before = ty();
      fireEvent.focus(nodeEl("delivery-photo")); // the map's bottom-most node
      const after = ty();
      /* The view moved UP (content translated negative-ward) just enough to
         show the node — never a re-zoom, never a re-centre. */
      expect(after).toBeLessThan(before);
      /* And a node already in view moves nothing: reveal is minimal. */
      const settled = ty();
      fireEvent.focus(nodeEl("delivery-photo"));
      expect(ty()).toBe(settled);
    } finally {
      rect.mockRestore();
    }
  });
});

/* ─────────────────────────────────────────────────────────────────────────────
 * LINKED PROBLEMS — conditional, and beside the map.
 * ──────────────────────────────────────────────────────────────────────────── */

describe("Order Route — linked problems", () => {
  it("stays silent on an order with no open exception", () => {
    draw();
    expect(screen.queryByTestId("linked-problems")).not.toBeInTheDocument();
  });

  it("shows an open case beside the map, never as a node on it", () => {
    draw(
      map({
        cases: [
          { id: "c1", caseNo: "SC-1031", statusLabel: "Investigation in progress", closed: false },
        ],
      }),
    );
    const strip = screen.getByTestId("linked-problems");
    expect(strip).toHaveTextContent("SC-1031 · Investigation in progress");
    expect(screen.queryByTestId("route-node-case:c1")).not.toBeInTheDocument();
  });
});

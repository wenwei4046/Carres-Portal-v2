import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import {
  resolveSalesOrderRoute,
  type SalesOrderRouteInput,
  type SalesOrderRouteMap,
} from "@carres/shared";
import SalesOrderRoute, { compactOrderRoute, type RouteActionOwners } from "./SalesOrderRoute";

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
    expect(screen.getByTestId("route-band-money")).toHaveTextContent("PAYMENT");
    const plate = nodeEl("B1201S:goods-line");
    expect(plate).toHaveTextContent("B1201S · King");
    expect(plate).toHaveTextContent("Customer ordered 3");
    expect(plate).toHaveTextContent("Carres ordered 3 from supplier");
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
    expect(nodeEl("sales-order")).toHaveTextContent("SO Doc Date: Wed, 12 Aug");
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

    expect(fact).toHaveTextContent("Supplier has not confirmed");
    expect(screen.getByTestId("route-fact-PO-2048:supplier-1")).toHaveTextContent("the ready date");
    expect(fact).toHaveClass("text-body", "font-semibold");
    expect(action).toHaveTextContent("YJ");
    expect(action).toHaveTextContent("Confirm ready date");
    expect(action).toHaveClass("text-label");
    /* Three rows, broken at the separators — never one row ending in "…". */
    expect(context).toHaveTextContent(
      "PO-2048 · 3 Units Carres Warehouse Customer requested: Thu, 24 Sep",
    );
    expect(context.querySelectorAll("span")).toHaveLength(3);
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
    expect(nodeEl("delivery-photo")).toHaveTextContent("Logistics has not uploaded the delivery photo");
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
       also stays on the PAYMENT branch with its open collect. */
    expect(gate).toHaveTextContent("1 of 5 requirements met");
    expect(gate).toHaveTextContent("Warehouse has 0 of 3 Units ready");
    expect(gate).toHaveTextContent("Logistics not assigned");
    expect(gate).toHaveTextContent("Logistics has not scheduled the delivery");
    /* The row breaks at the separator; the requirement is still one item. */
    expect(screen.getByTestId("route-requirement-money")).toHaveTextContent("Customer has not paid RM 1,249.00");
    expect(gate).toHaveTextContent("No Finance hold");
  });

  it("renders no Release, Approve or any other control inside the map", () => {
    draw();
    /* The only page controls are goods disclosure plus the three zoom controls. */
    const labels = screen.getAllByRole("button").map((b) => b.getAttribute("aria-label"));
    expect(labels).toEqual([
      "B1201S · King — Customer ordered 3 — Carres ordered 3 from supplier",
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
      "SUPPLIER — Supplier has not confirmed the ready date — Yu Jun: Confirm ready date — PO-2048 · 3 Units · Carres Warehouse · Customer requested: Thu, 24 Sep",
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
    expect(screen.getByTestId("where")).toHaveTextContent("/finance/payments?order=1319");
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


/* ─────────────────────────────────────────────────────────────────────────────
 * SCOPE A · owner rulings 2026-09-25 / 2026-09-26.
 * ──────────────────────────────────────────────────────────────────────────── */

describe("PAYMENT, a failed read and a waiting change on the canvas", () => {
  it("prints the PAYMENT node in two lines with the spelled deadline", () => {
    draw();
    const payment = nodeEl("money");
    expect(payment).toHaveTextContent("PAYMENT");
    expect(payment).toHaveTextContent("Hold delivery");
    expect(payment).toHaveTextContent("Customer has not paid RM 1,249.00 Customer must pay by Tue, 22 Sep");
    expect(payment.getAttribute("aria-label")).toContain("Customer has not paid RM 1,249.00 · Customer must pay by Tue, 22 Sep");
    /* Collect tells the operator what to do; the door is where. */
    expect(within(payment).getByRole("link", { name: "Open Payments →" })).toBeInTheDocument();
    expect(payment).not.toHaveTextContent("still to collect");
  });

  it("an unreadable node carries its own mark, its warning glyph and both sentences whole", () => {
    draw(map({ unreadable: { delivery: true } }));
    const logistics = nodeEl("logistics");
    expect(logistics).toHaveAttribute("data-mark", "unreadable");
    expect(logistics).toHaveAttribute("data-current", "false");
    expect(logistics.getAttribute("aria-label")).toContain(
      "Could not read Delivery for this order. — This does not mean nothing is arranged.",
    );
    expect(logistics).toHaveTextContent(
      "Could not read Delivery for this order. This does not mean nothing is arranged.",
    );
    expect(within(logistics).getByRole("button", { name: "Try again →" })).toBeInTheDocument();
    expect(logistics).not.toHaveTextContent("Logistics not assigned");
    /* The other groups draw from their own reads. */
    expect(nodeEl("money")).toHaveAttribute("data-mark", "current");
  });

  it("Try again asks the page to read that owner again and never navigates", () => {
    const onRetry = vi.fn();
    render(
      <MemoryRouter initialEntries={["/operation/orders/so/order-1?route=1"]}>
        <SalesOrderRoute route={map({ unreadable: { payments: true } })} owners={owners} onRetry={onRetry} />
        <Where />
      </MemoryRouter>,
    );
    fireEvent.click(within(nodeEl("money")).getByRole("button", { name: "Try again →" }));
    expect(onRetry).toHaveBeenCalledWith("payments");
    expect(screen.getByTestId("where")).toHaveTextContent("/operation/orders/so/order-1?route=1");
  });

  it("announces a waiting change above the canvas, with what changes and one door", () => {
    draw(map({
      amendment: {
        status: "submitted",
        submittedAt: "2026-09-24",
        submittedBy: "Mei Ling",
        approver: "Jess",
        changes: [{ what: "Customer Requested Delivery Date", before: "2026-09-24", after: "2026-10-05" }],
      },
    }));
    const banner = screen.getByTestId("route-proposed-change");
    expect(banner).toHaveAttribute("role", "alert");
    expect(banner).toHaveTextContent(
      "Mei Ling asked to change this order on Thu, 24 Sep. Jess has not approved it yet.",
    );
    /* WHAT changes — the owner could not see it (2026-09-27). */
    expect(banner).toHaveTextContent("Customer Requested Delivery Date: Thu, 24 Sep → Mon, 5 Oct");
    expect(banner.textContent).not.toMatch(/[—–]/);
    expect(banner).toHaveTextContent("The map shows the order as it stands today, not the change.");
    expect(within(banner).getByRole("link", { name: "Open the request →" })).toHaveAttribute(
      "href",
      "/operation/orders/so/order-1",
    );
    /* Above the canvas, never inside it. */
    expect(screen.getByTestId("route-canvas")).not.toContainElement(banner);
    expect(banner.compareDocumentPosition(screen.getByTestId("route-canvas")) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("draws no banner when nothing is waiting", () => {
    draw();
    expect(screen.queryByTestId("route-proposed-change")).not.toBeInTheDocument();
  });

  it("a failed read of the change requests says so and offers Try again", () => {
    const onRetry = vi.fn();
    render(
      <MemoryRouter>
        <SalesOrderRoute route={map({ unreadable: { amendment: true } })} owners={owners} onRetry={onRetry} />
      </MemoryRouter>,
    );
    const banner = screen.getByTestId("route-proposed-change");
    expect(banner).toHaveTextContent("Could not read the change requests for this order.");
    fireEvent.click(within(banner).getByRole("button", { name: "Try again →" }));
    expect(onRetry).toHaveBeenCalledWith("amendment");
  });
});

/* ─────────────────────────────────────────────────────────────────────────────
 * SCOPE A2 · one delivery scope is one lane (owner ruling 2026-09-26).
 * ──────────────────────────────────────────────────────────────────────────── */

describe("DELIVERY lanes on the canvas", () => {
  const lane = (over: Record<string, unknown>) => ({
    trip: 0,
    plate: null,
    transfer: false,
    legStop: null,
    partnerName: null,
    confirmedDate: null,
    confirmedTime: null,
    deliveryOrder: null,
    tripGroups: null,
    attempts: [],
    handoverEvents: [],
    photos: [],
    ...over,
  });
  const journey = () =>
    map({
      money: { known: true, outstanding: 0 },
      delivery: {
        logistics: null,
        booking: null,
        attempts: [],
        scopes: [
          lane({
            leg: 1,
            plate: "Leg 1 · Carres Klang → JB transit warehouse",
            transfer: true,
            legStop: "JB transit warehouse",
            partnerName: "NETS",
            confirmedDate: "2026-09-15",
            deliveryOrder: { id: "do-1", number: "DO-130926-0842" },
            attempts: [{ result: "delivered", reasonKey: null, recordedAt: "2026-09-13T04:00:00Z" }],
          }),
          lane({
            leg: 2,
            plate: "Leg 2 · JB transit warehouse → customer",
            partnerName: "AL",
            confirmedDate: "2026-09-17",
            deliveryOrder: { id: "do-2", number: "DO-130926-3223" },
            attempts: [{ result: "delivered", reasonKey: null, recordedAt: "2026-09-13T08:00:00Z" }],
          }),
        ] as never,
      },
    });

  it("draws one plate and one chain per leg, each with its own Delivery Order", () => {
    draw(journey());
    const plate = nodeEl("delivery-lane:1:0");
    expect(plate).toHaveTextContent("Leg 1");
    expect(plate).toHaveTextContent("Carres Klang → JB transit");
    expect(plate.getAttribute("aria-label")).toBe("Leg 1 · Carres Klang → JB transit warehouse");
    /* A plate is not a station: it is no button and carries no door. */
    expect(plate.tagName).toBe("DIV");
    expect(nodeEl("logistics:1:0")).toHaveTextContent("NETS");
    expect(nodeEl("logistics:2:0")).toHaveTextContent("AL");
    expect(nodeEl("delivery-order:1:0")).toHaveTextContent("DO-130926-0842");
    expect(nodeEl("delivery-order:2:0")).toHaveTextContent("DO-130926-3223");
    expect(nodeEl("deliver:1:0")).toHaveTextContent("Arrived at JB transit");
    expect(nodeEl("deliver:2:0")).toHaveTextContent("Delivered to customer");
    expect(screen.queryByTestId("route-node-delivery-photo:1:0")).not.toBeInTheDocument();
  });

  it("keeps the two lanes side by side under one DELIVERY band, and nothing overlaps", () => {
    draw(journey());
    const box = (id: string) => {
      const el = nodeEl(id) as HTMLElement;
      return {
        x: parseFloat(el.style.left),
        y: parseFloat(el.style.top),
        w: parseFloat(el.style.width),
        h: parseFloat(el.style.height),
      };
    };
    const one = box("logistics:1:0");
    const two = box("logistics:2:0");
    expect(two.x).toBe(one.x + 208 + 32);
    expect(two.y).toBe(one.y);
    const band = screen.getByTestId("route-band-delivery") as HTMLElement;
    expect(parseFloat(band.style.width)).toBe(208 * 2 + 32);
    const ids = [...document.querySelectorAll<HTMLElement>("[data-testid^='route-node-']")].map(
      (el) => el.dataset.testid!.replace("route-node-", ""),
    );
    for (const a of ids) {
      for (const b of ids) {
        if (a >= b) continue;
        const p = box(a);
        const q = box(b);
        const apart = p.x + p.w <= q.x || q.x + q.w <= p.x || p.y + p.h <= q.y || q.y + q.h <= p.y;
        expect(apart, `${a} overlaps ${b}`).toBe(true);
      }
    }
  });

  it("opens a Delivery Order by its row id", () => {
    draw(journey());
    expect(within(nodeEl("delivery-order:2:0")).getByRole("link", { name: "Open DO-130926-3223 →" })).toHaveAttribute(
      "href",
      "/operation/delivery-orders/do-2",
    );
  });
});

/* ─────────────────────────────────────────────────────────────────────────────
 * SCOPE A3 · found on the rendered goods chain (2026-09-28).
 * ──────────────────────────────────────────────────────────────────────────── */

describe("stacked goods lines", () => {
  const line = (over: Record<string, unknown>) => ({
    sku: "B1201S",
    label: "B1201S · King",
    qty: 1,
    sources: [],
    onOrderQty: 0,
    readyQty: 0,
    unitCodes: [],
    uncoveredQty: 1,
    shortBecause: "not-ordered",
    readyStockQty: 0,
    ...over,
  });
  const three = () =>
    map({
      goods: [
        line({
          lineId: "L1",
          sources: [
            {
              poId: "PO-1", qty: 1, issuedAt: "2026-09-03", poDeliveryDate: "2026-09-18", expectedArrival: null,
              confirmed: false, dayBeforeCheckOpen: true, receivedQty: 0, pendingQty: 1, damagedOrWrongQty: 0, latestGrn: null,
            },
          ],
          onOrderQty: 1,
          uncoveredQty: 0,
          shortBecause: "not-received",
        }),
        line({ lineId: "L2", label: "Pillow" }),
        line({ lineId: "L3", label: "Sofa" }),
      ] as never,
      unreadable: { purchasing: ["L3"] },
    });

  it("a stacked line hangs from the node above it — no line from the Sales Order runs behind a node", () => {
    const route = compactOrderRoute(three(), "L1:goods-line");
    const into = (id: string) => route.edges.filter((e) => e.to === id);
    expect(into("L1:goods-line").map((e) => e.from)).toEqual(["sales-order"]);
    expect(into("L2:goods-line").map((e) => e.from)).toEqual(["L1:stock"]);
    expect(into("L3:goods-line").map((e) => e.from)).toEqual(["L2:goods-line"]);
    for (const e of [...into("L2:goods-line"), ...into("L3:goods-line")]) {
      expect(new Set(e.points.map((p) => p.x)).size).toBe(1);
    }
  });

  it("a collapsed line whose read failed still says so", () => {
    draw(three());
    const plate = nodeEl("L3:goods-line");
    expect(plate).toHaveAttribute("data-mark", "unreadable");
    expect(plate.getAttribute("aria-label")).toContain("Could not read Purchasing for this line.");
    expect(nodeEl("L2:goods-line")).not.toHaveAttribute("data-mark", "unreadable");
  });
});

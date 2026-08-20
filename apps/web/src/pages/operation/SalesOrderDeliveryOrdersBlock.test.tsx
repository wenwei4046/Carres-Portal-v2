import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { DeliveryOrdersRegisterPayload } from "@/lib/queries";
import SalesOrderDeliveryOrdersBlock from "./SalesOrderDeliveryOrdersBlock";

const row = (doNumber: string, issuedAt: string) => ({
  id: `id-${doNumber}`,
  order_id: "order-1",
  do_number: doNumber,
  issued_at: issuedAt,
  trip_groups: null,
  delivery_date: "2026-08-24",
  time_slot: "Afternoon",
  logistics_partner: "NETS",
  voided_at: null,
  void_reason: null,
  orders: { id: "order-1", so: 1319, customer_name: "Lim Kuan Yang" },
});

function draw(payload: DeliveryOrdersRegisterPayload) {
  return render(
    <MemoryRouter>
      <SalesOrderDeliveryOrdersBlock payload={payload} />
    </MemoryRouter>,
  );
}

describe("Sales Order · Delivery Orders relationship", () => {
  it("teaches why the list is empty", () => {
    draw({ deliveryOrders: [], attempts: [], handoverEvents: [] });
    expect(screen.getByText("No delivery order yet")).toBeInTheDocument();
    expect(screen.getByText("The system creates one when the delivery requirements are met.")).toBeInTheDocument();
  });

  it("lists every Delivery Order newest first and opens the document object", () => {
    draw({
      deliveryOrders: [
        row("DO-190826-0001", "2026-08-19T02:00:00Z"),
        row("DO-200826-0002", "2026-08-20T02:00:00Z"),
      ],
      attempts: [],
      handoverEvents: [],
    });
    const links = screen.getAllByRole("link", { name: /DO-/ });
    expect(links.map((link) => link.textContent)).toEqual([
      "DO-200826-0002",
      "DO-190826-0001",
    ]);
    expect(links[0]).toHaveAttribute("href", "/operation/delivery-orders/DO-200826-0002");
    expect(screen.getAllByText("Created")).toHaveLength(2);
  });

  it("keeps a failed Delivery Order visible with its governed exception status", () => {
    draw({
      deliveryOrders: [row("DO-200826-0002", "2026-08-20T02:00:00Z")],
      attempts: [{
        do_number: "DO-200826-0002",
        result: "failed",
        reason_key: "customer_not_home",
        recorded_at: "2026-08-24T08:00:00Z",
      }],
      handoverEvents: [],
    });
    expect(screen.getByText("Delivery exception")).toBeInTheDocument();
  });
});

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import OrderActionList, { type OrderActionRow } from "./OrderActionList";

/**
 * C2 — the drawer's dynamic checklist.
 *
 * The card's DONE WHEN is "an order with three open actions shows three rows;
 * no action can be hidden by another; the drawer and the row can never
 * disagree". The first two are asserted here; the third is structural — the
 * list arrives computed by the same engine that produced the row's pill, so
 * these tests also guard that this component derives NOTHING of its own.
 */

const THREE: OrderActionRow[] = [
  { key: "send_po", line: "Send PO to Ohana", tone: "danger" },
  { key: "assign_logistics", line: "Assign logistics", tone: "info" },
  {
    key: "collect",
    line: "Collect RM 2,455 from John Tan",
    tone: "warning",
  },
];

describe("OrderActionList", () => {
  it("an order with three open actions shows three rows", () => {
    render(<OrderActionList actions={THREE} />);
    expect(screen.getAllByTestId("order-action")).toHaveLength(3);
  });

  it("renders them in the order handed over — it never re-sorts", () => {
    render(<OrderActionList actions={THREE} />);
    expect(
      screen.getAllByTestId("order-action").map((n) => n.dataset.action),
    ).toEqual(["send_po", "assign_logistics", "collect"]);
  });

  it("every row names its party and its measurable object (COPY-STANDARD)", () => {
    render(<OrderActionList actions={THREE} />);
    expect(screen.getByText("Send PO to Ohana")).toBeInTheDocument();
    expect(screen.getByText("Collect RM 2,455 from John Tan")).toBeInTheDocument();
  });

  it("the money action is present even though it displays last — nothing is hidden", () => {
    render(<OrderActionList actions={THREE} />);
    expect(screen.getByText(/Collect RM 2,455/)).toBeInTheDocument();
  });

  it("a held action carries the lock the ladder already shows", () => {
    // C3 — the 🔒 rides `Collect` now: the resting `Confirm delivery` it used to
    // ride was retired, and the lock belongs on the action that CLEARS it.
    const { container } = render(
      <OrderActionList
        actions={[
          {
            key: "collect",
            line: "Collect RM 2,455 from John Tan",
            tone: "warning",
            locked: true,
          },
        ]}
      />,
    );
    expect(container.querySelector("svg")).toBeTruthy();
  });

  it("empty state teaches what happens next, never 'No data'", () => {
    render(<OrderActionList actions={[]} />);
    const empty = screen.getByTestId("order-action-none").textContent ?? "";
    expect(empty).toMatch(/Nothing to do on this order/);
    expect(empty).toMatch(/by itself/);
  });

  it("carries NO control — staff never add, reorder or tick an action", () => {
    const { container } = render(<OrderActionList actions={THREE} />);
    expect(container.querySelectorAll("button")).toHaveLength(0);
    expect(container.querySelectorAll("input")).toHaveLength(0);
  });

  it("says no banned word (COPY-STANDARD)", () => {
    const { container } = render(<OrderActionList actions={THREE} />);
    const text = container.textContent ?? "";
    for (const banned of [
      "Chase",
      "POD",
      "Proof of Delivery",
      "Unscheduled",
      "Not booked",
      "need booking",
      "Pending",
      "In Progress",
      "At Risk",
      "Attention",
    ])
      expect(text).not.toContain(banned);
  });
});

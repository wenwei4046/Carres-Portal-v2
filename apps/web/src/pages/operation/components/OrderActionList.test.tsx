import { fireEvent, render, screen } from "@testing-library/react";
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
  { key: "issue_po", line: "Issue PO to Ohana", tone: "danger" },
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
    ).toEqual(["issue_po", "assign_logistics", "collect"]);
  });

  it("every row names its party and its measurable object (COPY-STANDARD)", () => {
    render(<OrderActionList actions={THREE} />);
    expect(screen.getByText("Issue PO to Ohana")).toBeInTheDocument();
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

  it("an action with no steps carries no disclosure at all", () => {
    // `Deliver today` is the ruled case: nobody records "goods loaded" or
    // "driver departed", so there is nothing to open.
    render(
      <OrderActionList
        actions={[{ key: "deliver_today", line: "Deliver today", tone: "info" }]}
      />,
    );
    expect(screen.queryByTestId("order-action-toggle")).toBeNull();
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

/**
 * C6 — every action opens its checklist.
 *
 * The card's DONE WHEN: "every built action closes itself from a real signal;
 * no tick-box in the portal records only an assertion". The second half is what
 * these guard on the SCREEN — the steps are read-only by construction, and the
 * only control in the component is a disclosure.
 */
const WITH_STEPS: OrderActionRow[] = [
  {
    key: "confirm_delivery_date",
    line: "Call NETS — confirm delivery date",
    tone: "info",
    steps: [
      { key: "assign_logistics", label: "Assign logistics", done: true },
      { key: "confirm_delivery_date", label: "Confirm booking", done: false },
    ],
  },
];

describe("OrderActionList · C6 checklists", () => {
  it("stays collapsed until it is clicked — §1.3 is a height budget", () => {
    render(<OrderActionList actions={WITH_STEPS} />);
    expect(screen.queryByTestId("order-action-steps")).toBeNull();
    expect(screen.getByTestId("order-action-toggle")).toHaveAttribute(
      "aria-expanded",
      "false",
    );
  });

  it("clicking the action shows the steps that close it", () => {
    render(<OrderActionList actions={WITH_STEPS} />);
    fireEvent.click(screen.getByTestId("order-action-toggle"));
    const steps = screen.getAllByTestId("order-action-step");
    expect(steps.map((n) => n.dataset.step)).toEqual([
      "assign_logistics",
      "confirm_delivery_date",
    ]);
    expect(steps.map((n) => n.dataset.state)).toEqual(["done", "open"]);
  });

  it("every step is worded by the dictionary's BUTTON string", () => {
    render(<OrderActionList actions={WITH_STEPS} />);
    fireEvent.click(screen.getByTestId("order-action-toggle"));
    expect(screen.getByText("Assign logistics")).toBeInTheDocument();
    expect(screen.getByText("Confirm booking")).toBeInTheDocument();
  });

  it("clicking again closes it", () => {
    render(<OrderActionList actions={WITH_STEPS} />);
    const t = screen.getByTestId("order-action-toggle");
    fireEvent.click(t);
    fireEvent.click(t);
    expect(screen.queryByTestId("order-action-steps")).toBeNull();
  });

  it("NO tick-box: an expanded step has no control of its own", () => {
    // The no-decorative-checkbox law, on the screen rather than in a comment.
    // The ONE button in this component is the disclosure, and it is the row
    // itself — a step can never be clicked, ticked or untinked by a human.
    const { container } = render(<OrderActionList actions={WITH_STEPS} />);
    fireEvent.click(screen.getByTestId("order-action-toggle"));
    expect(container.querySelectorAll("input")).toHaveLength(0);
    expect(container.querySelectorAll("[type=checkbox]")).toHaveLength(0);
    expect(container.querySelectorAll("button")).toHaveLength(1);
    for (const step of screen.getAllByTestId("order-action-step")) {
      expect(step.querySelector("button")).toBeNull();
      expect(step.querySelector("input")).toBeNull();
    }
  });

  it("a step says no banned word either", () => {
    const { container } = render(<OrderActionList actions={WITH_STEPS} />);
    fireEvent.click(screen.getByTestId("order-action-toggle"));
    const text = container.textContent ?? "";
    for (const banned of [
      "Chase",
      "POD",
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

import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import BookingSpine from "./BookingSpine";

/**
 * BookingSpine — T5 (delivery execution queue): the read-only progress
 * checklist in the drawer's Delivery card. Pure presentation: the parent
 * derives every tick from the SAME signals the header chip reads; these
 * tests pin the row set, the tick derivation, and the T6 placeholder.
 */

const LABELS = [
  "Logistic assigned",
  "Customer confirmed",
  "Delivery order issued",
  "Delivered",
  "Delivery photo",
];

function states() {
  return screen
    .getAllByTestId("spine-row")
    .map((el) => el.getAttribute("data-state"));
}

describe("BookingSpine", () => {
  it("renders all five steps in lifecycle order, photo greyed 'later'", () => {
    render(
      <BookingSpine
        partnerAssigned={false}
        customerConfirmed={false}
        doIssued={false}
        delivered={false}
      />,
    );
    const rows = screen.getAllByTestId("spine-row");
    expect(rows.map((r) => r.textContent)).toEqual([
      ...LABELS.slice(0, 4),
      // T6 placeholder carries the greyed "later" note
      "Delivery photo· later",
    ]);
    expect(states()).toEqual(["todo", "todo", "todo", "todo", "later"]);
  });

  it("ticks exactly the steps whose signal is on", () => {
    render(
      <BookingSpine
        partnerAssigned
        customerConfirmed
        doIssued={false}
        delivered={false}
      />,
    );
    expect(states()).toEqual(["done", "done", "todo", "todo", "later"]);
  });

  it("a delivered order shows every live signal done — photo still 'later'", () => {
    render(
      <BookingSpine partnerAssigned customerConfirmed doIssued delivered />,
    );
    expect(states()).toEqual(["done", "done", "done", "done", "later"]);
  });

  it("never renders a banned status word or POD", () => {
    render(
      <BookingSpine
        partnerAssigned={false}
        customerConfirmed={false}
        doIssued={false}
        delivered={false}
      />,
    );
    for (const banned of ["POD", "Unscheduled", "Not booked"]) {
      expect(screen.queryByText(new RegExp(banned, "i"))).toBeNull();
    }
  });
});

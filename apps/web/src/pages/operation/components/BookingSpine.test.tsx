import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import BookingSpine from "./BookingSpine";

/**
 * BookingSpine — T5 (delivery execution queue): the read-only progress
 * checklist in the drawer's Delivery card. Pure presentation: the parent
 * derives every tick from the SAME signals the header chip reads; these
 * tests pin the row set and the tick derivation. T6 (0280) made the photo
 * row a real tick — ≥1 ledger entry lights it, no more greyed placeholder.
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
  it("renders all five steps in lifecycle order", () => {
    render(
      <BookingSpine
        partnerAssigned={false}
        customerConfirmed={false}
        doIssued={false}
        delivered={false}
        photoUploaded={false}
      />,
    );
    const rows = screen.getAllByTestId("spine-row");
    expect(rows.map((r) => r.textContent)).toEqual(LABELS);
    expect(states()).toEqual(["todo", "todo", "todo", "todo", "todo"]);
  });

  it("ticks exactly the steps whose signal is on", () => {
    render(
      <BookingSpine
        partnerAssigned
        customerConfirmed
        doIssued={false}
        delivered={false}
        photoUploaded={false}
      />,
    );
    expect(states()).toEqual(["done", "done", "todo", "todo", "todo"]);
  });

  it("a delivered order without a photo keeps the last tick open", () => {
    render(
      <BookingSpine
        partnerAssigned
        customerConfirmed
        doIssued
        delivered
        photoUploaded={false}
      />,
    );
    expect(states()).toEqual(["done", "done", "done", "done", "todo"]);
  });

  it("T6 — the photo ledger lights the last tick", () => {
    render(
      <BookingSpine
        partnerAssigned
        customerConfirmed
        doIssued
        delivered
        photoUploaded
      />,
    );
    expect(states()).toEqual(["done", "done", "done", "done", "done"]);
  });

  it("never renders a banned status word or POD", () => {
    render(
      <BookingSpine
        partnerAssigned={false}
        customerConfirmed={false}
        doIssued={false}
        delivered={false}
        photoUploaded={false}
      />,
    );
    for (const banned of ["POD", "Unscheduled", "Not booked", "later"]) {
      expect(screen.queryByText(new RegExp(banned, "i"))).toBeNull();
    }
  });
});

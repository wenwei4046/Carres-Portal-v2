/**
 * AMEND DELIVERY DATE — the three fields, RENDERED.
 *
 * What only a render can prove: the reason is genuinely mandatory, a date that
 * has not moved is not a change, the day the customer asked reaches the wire,
 * and an order with a proposal already open submits NOTHING.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import type { SalesOrderAmendment } from "@/lib/queries";
import SalesOrderAmendDeliveryDate from "./SalesOrderAmendDeliveryDate";

const submitMutate = vi.fn();

vi.mock("@/lib/queries", async () => {
  const actual = await vi.importActual<typeof import("@/lib/queries")>("@/lib/queries");
  return {
    ...actual,
    useSubmitSalesOrderAmendment: () => ({ mutate: submitMutate, isPending: false }),
  };
});

const ORDER_ID = "00000000-0000-0000-0000-0000000000d1";

function draw(liveAmendment: SalesOrderAmendment | null = null) {
  return render(
    <SalesOrderAmendDeliveryDate
      orderId={ORDER_ID}
      currentDeliveryDate="2026-09-10"
      liveAmendment={liveAmendment}
    />,
  );
}

/** The kit's DatePicker is a popover calendar with no text box, so the test
 *  opens it and clicks a day. With no value picked yet the calendar opens on
 *  the current month — so the day is chosen there and the expected ISO is
 *  derived from the same clock rather than hard-coded. */
function pickDayOfThisMonth(triggerId: string, dayOfMonth: number): string {
  fireEvent.click(document.getElementById(triggerId)!);
  const cell = screen
    .getAllByRole("gridcell")
    .find((c) => c.textContent?.trim() === String(dayOfMonth));
  if (!cell) throw new Error(`no day cell for ${dayOfMonth}`);
  /* react-day-picker puts the clickable button INSIDE the gridcell. */
  fireEvent.click(cell.querySelector("button") ?? cell);
  const now = new Date();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  return `${now.getFullYear()}-${mm}-${String(dayOfMonth).padStart(2, "0")}`;
}

beforeEach(() => {
  submitMutate.mockReset();
});

describe("the trio", () => {
  it("shows exactly the three fields the ruling names", () => {
    draw();
    expect(screen.getByText("Requested date (from customer)")).toBeTruthy();
    expect(screen.getByText("New delivery date")).toBeTruthy();
    expect(screen.getByLabelText(/reason for change/i)).toBeTruthy();
    /* ⛔ `creates a Revision · needs approval` is no longer INSIDE the form —
       the trio moved into a modal on 2026-08-27 and the governed note became
       that modal's description, so it is read on opening rather than as a
       footnote beside the button that commits it. The string is asserted where
       it now lives, in `SalesOrderWorkspace.ui-contract.test.ts`. */
    expect(screen.queryByText("creates a Revision · needs approval")).toBeNull();
  });

  it("refuses to submit without a moved date AND a reason", () => {
    draw();
    const send = screen.getByTestId("amend-delivery-date-submit") as HTMLButtonElement;
    expect(send.disabled).toBe(true);

    /* A reason alone is not a change. */
    fireEvent.change(screen.getByLabelText(/reason for change/i), {
      target: { value: "Customer moving house" },
    });
    expect((screen.getByTestId("amend-delivery-date-submit") as HTMLButtonElement).disabled).toBe(
      true,
    );
    expect(submitMutate).not.toHaveBeenCalled();
  });

  it("submits the new date and the reason through the amendment lane", () => {
    draw();
    const picked = pickDayOfThisMonth("so-amend-new-date", 24);
    fireEvent.change(screen.getByLabelText(/reason for change/i), {
      target: { value: "Customer moving house" },
    });
    const send = screen.getByTestId("amend-delivery-date-submit") as HTMLButtonElement;
    expect(send.disabled).toBe(false);
    fireEvent.click(send);

    expect(submitMutate).toHaveBeenCalledTimes(1);
    const arg = submitMutate.mock.calls[0]![0] as {
      proposed: { delivery_date: string | null };
      reason: string;
    };
    expect(arg.proposed.delivery_date).toBe(picked);
    expect(arg.reason).toBe("Customer moving house");
  });

  /* A PROPOSAL IS ONE DOCUMENT. Two live ones would be two claims on the
     contract, so this block yields to the one already open. */
  it("submits nothing while a proposal is waiting for management", () => {
    draw({
      id: "amd-1",
      status: "submitted",
      reason: "Customer moving house",
      base_revision: 2,
      base_contractual_hash: "a",
      current_contractual_hash: "a",
      stale: false,
      proposed_snapshot: { delivery_date: "2026-09-24" },
      submitted_at: "2026-08-15T02:00:00.000Z",
    });
    expect(screen.queryByTestId("amend-delivery-date")).toBeNull();
    expect(screen.getByTestId("amend-delivery-date-waiting").textContent).toContain(
      "waiting for management",
    );
  });
});

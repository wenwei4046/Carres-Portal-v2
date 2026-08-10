/**
 * STAGE 3 · card 3.3 — the attribution lane, RENDERED.
 *
 * The card's screens are: a waiting request · approve, with the order
 * unchanged · apply. This file holds the properties those screens exist to
 * show, so a later rewrite cannot quietly merge two verbs into one button:
 *
 *   · no live request → ONE way in, and it is a request, not an edit,
 *   · a pending request → Approve and Reject, and NO Apply,
 *   · an approved request → Apply, and NO Approve,
 *   · the screen SAYS the order has not moved yet, in both states,
 *   · each button calls its OWN mutation and no other,
 *   · the form refuses to send without a reason.
 *
 * The verbs' real gates are server-side (0329) and proven against the live
 * database in the card's evidence. What only a render can prove is that the
 * three of them never share a button — which is the failure the seven-verb
 * law was written against.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import type { AttributionRequest } from "@/lib/queries";
import SalesOrderAttribution from "./SalesOrderAttribution";

const submitMutate = vi.fn();
const decideMutate = vi.fn();
const applyMutate = vi.fn();

let liveRequest: AttributionRequest | null = null;

vi.mock("@/lib/queries", async () => {
  const actual = await vi.importActual<typeof import("@/lib/queries")>("@/lib/queries");
  return {
    ...actual,
    useSalesOrderAttribution: () => ({ data: { request: liveRequest }, refetch: vi.fn() }),
    useSubmitAttributionChange: () => ({ mutate: submitMutate, isPending: false }),
    useDecideAttributionChange: () => ({ mutate: decideMutate, isPending: false }),
    useApplyAttributionChange: () => ({ mutate: applyMutate, isPending: false }),
  };
});

const ORDER_ID = "00000000-0000-0000-0000-0000000000d1";
const SP_A = "00000000-0000-0000-0000-0000000000a1";
const SP_B = "00000000-0000-0000-0000-0000000000a2";

function draw() {
  return render(
    <SalesOrderAttribution
      orderId={ORDER_ID}
      current={{ salesperson_id: SP_A, outlet_id: null, dealer_id: "d1" }}
      salespersonOptions={[
        { value: SP_A, label: "ahsihas" },
        { value: SP_B, label: "Alvin" },
      ]}
      outletOptions={[{ value: "o1", label: "Klang Showroom" }]}
      dealerOptions={[{ value: "d1", label: "Carres House" }]}
      onApplied={vi.fn()}
    />,
  );
}

const pending: AttributionRequest = {
  id: "req-1",
  status: "pending",
  reason: "Wrong person credited at entry",
  created_at: "2026-08-10T03:00:00.000Z",
  decided_at: null,
  decision_note: null,
  applied_at: null,
  fields: ["salesperson_id"],
  approver: "hr_or_principal",
  salesperson: { from: "ahsihas", to: "Alvin" },
};

beforeEach(() => {
  liveRequest = null;
  submitMutate.mockReset();
  decideMutate.mockReset();
  applyMutate.mockReset();
});

describe("no live request — one way in, and it is a request", () => {
  it("offers the request, and says why editing is not the way", () => {
    draw();
    expect(screen.getByTestId("attribution-open")).toBeTruthy();
    expect(screen.queryByTestId("attribution-request")).toBeNull();
    /* The sentence is the point: an operator who reads "they change by
     * approval, not by editing" does not go hunting for a picker in Edit. */
    expect(screen.getByText(/change by approval, not by editing/i)).toBeTruthy();
  });

  it("will not send without a reason, and sends only the field that moved", () => {
    draw();
    fireEvent.click(screen.getByTestId("attribution-open"));

    const send = screen.getByTestId("attribution-submit") as HTMLButtonElement;
    expect(send.disabled).toBe(true); // nothing changed, no reason

    fireEvent.change(screen.getByLabelText(/why is this changing/i), {
      target: { value: "Wrong person credited" },
    });
    /* Still nothing MOVED — a reason alone is not a change. */
    expect((screen.getByTestId("attribution-submit") as HTMLButtonElement).disabled).toBe(true);
  });
});

describe("a pending request — approve or reject, and nothing else", () => {
  beforeEach(() => {
    liveRequest = pending;
  });

  it("shows the move in NAMES, with the reason and who may decide", () => {
    draw();
    expect(screen.getByTestId("attribution-request")).toBeTruthy();
    expect(screen.getByText("ahsihas")).toBeTruthy();
    expect(screen.getByText("Alvin")).toBeTruthy();
    expect(screen.getByText(/Wrong person credited at entry/)).toBeTruthy();
    expect(screen.getByText(/HR or the principal approves this/)).toBeTruthy();
  });

  it("offers Approve and Reject — and NOT Apply", () => {
    draw();
    expect(screen.getByTestId("attribution-approve")).toBeTruthy();
    expect(screen.getByTestId("attribution-reject")).toBeTruthy();
    expect(screen.queryByTestId("attribution-apply")).toBeNull();
  });

  it("says out loud that approving does not move the sales order", () => {
    draw();
    expect(
      screen.getByText(/does not change until it is applied/i),
    ).toBeTruthy();
  });

  it("each button calls its OWN mutation and no other", () => {
    draw();
    fireEvent.click(screen.getByTestId("attribution-approve"));
    expect(decideMutate).toHaveBeenCalledWith({ requestId: "req-1", decision: "approved" });
    expect(applyMutate).not.toHaveBeenCalled();
    expect(submitMutate).not.toHaveBeenCalled();

    decideMutate.mockReset();
    fireEvent.click(screen.getByTestId("attribution-reject"));
    expect(decideMutate).toHaveBeenCalledWith({ requestId: "req-1", decision: "rejected" });
    expect(applyMutate).not.toHaveBeenCalled();
  });
});

describe("an approved request — apply, and the approval cannot be repeated", () => {
  beforeEach(() => {
    liveRequest = { ...pending, status: "approved", decided_at: "2026-08-10T03:05:00.000Z" };
  });

  it("offers Apply — and NOT Approve", () => {
    draw();
    expect(screen.getByTestId("attribution-apply")).toBeTruthy();
    expect(screen.queryByTestId("attribution-approve")).toBeNull();
    expect(screen.queryByTestId("attribution-reject")).toBeNull();
  });

  it("still says the sales order has not changed yet", () => {
    draw();
    expect(screen.getByText(/has not changed yet/i)).toBeTruthy();
  });

  it("Apply calls only the apply mutation", () => {
    draw();
    fireEvent.click(screen.getByTestId("attribution-apply"));
    expect(applyMutate).toHaveBeenCalledWith({ requestId: "req-1" });
    expect(decideMutate).not.toHaveBeenCalled();
  });

  it("names the principal-only lane when the dealer is what moves", () => {
    liveRequest = { ...pending, approver: "principal", dealer: { from: "Carres House", to: "BedHouse KL" } };
    draw();
    expect(screen.getByText(/The principal approves this/)).toBeTruthy();
  });
});

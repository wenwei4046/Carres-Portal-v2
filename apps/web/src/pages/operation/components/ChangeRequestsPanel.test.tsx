/**
 * ChangeRequestsPanel (0233 add-product P3) — pins the pending-only render,
 * the approve/reject dispatch, and the auto-hide.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const h = vi.hoisted(() => ({
  requests: [] as unknown[],
  decideMutateAsync: vi.fn(async () => ({})),
}));

vi.mock("@/lib/queries", () => ({
  useOrderChangeRequests: () => ({ data: { requests: h.requests }, isLoading: false }),
  useDecideOrderChangeRequest: () => ({ mutateAsync: h.decideMutateAsync, isPending: false }),
}));

import ChangeRequestsPanel from "./ChangeRequestsPanel";

const REQ = {
  id: "22222222-2222-2222-2222-222222222222",
  orderId: "11111111-1111-1111-1111-111111111111",
  kind: "add_lines",
  payload: { lines: [{ sku: "PILLOW-1", qty: 2, unitPrice: 220, label: "Memory Foam Pillow" }] },
  status: "pending",
  requestedBy: null,
  requestedAt: "2026-07-18T00:00:00Z",
  decidedBy: null,
  decidedAt: null,
  decisionNote: null,
  appliedAt: null,
};

beforeEach(() => {
  h.decideMutateAsync.mockClear();
  h.requests = [];
});

describe("ChangeRequestsPanel", () => {
  it("auto-hides when no pending request exists", () => {
    h.requests = [{ ...REQ, status: "rejected" }];
    render(<ChangeRequestsPanel orderId={REQ.orderId} />);
    expect(screen.queryByTestId("ops-change-requests")).toBeNull();
  });

  it("renders the pending lines and dispatches APPROVE", async () => {
    h.requests = [REQ];
    render(<ChangeRequestsPanel orderId={REQ.orderId} />);
    expect(screen.getByTestId("ops-change-requests").textContent).toContain("Memory Foam Pillow");
    fireEvent.click(screen.getByTestId("ops-cr-approve"));
    await waitFor(() =>
      expect(h.decideMutateAsync).toHaveBeenCalledWith({
        requestId: REQ.id,
        approve: true,
        note: null,
      }),
    );
  });

  it("dispatches REJECT with the note", async () => {
    h.requests = [REQ];
    render(<ChangeRequestsPanel orderId={REQ.orderId} />);
    fireEvent.change(screen.getByTestId("ops-cr-note"), { target: { value: "no stock" } });
    fireEvent.click(screen.getByTestId("ops-cr-reject"));
    await waitFor(() =>
      expect(h.decideMutateAsync).toHaveBeenCalledWith({
        requestId: REQ.id,
        approve: false,
        note: "no stock",
      }),
    );
  });
});

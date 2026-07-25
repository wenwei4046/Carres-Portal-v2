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

  // 0257 — service add-ons ride the add_lines payload.
  it("renders payload addons alongside lines", () => {
    h.requests = [
      {
        ...REQ,
        payload: {
          lines: [{ sku: "PILLOW-1", qty: 1, unitPrice: 220, label: "Memory Foam Pillow" }],
          addons: [{ addonKey: "dispose-mattress", qty: 2, unitPrice: 80, label: "Dispose old mattress" }],
        },
      },
    ];
    render(<ChangeRequestsPanel orderId={REQ.orderId} />);
    const panel = screen.getByTestId("ops-change-requests");
    expect(panel.textContent).toContain("Memory Foam Pillow");
    expect(panel.textContent).toContain("Dispose old mattress");
  });

  // 0258 — edit_addon renders the qty/size change + the apply verb.
  it("renders an edit_addon request as old → new qty/size", () => {
    h.requests = [
      {
        ...REQ,
        kind: "edit_addon",
        payload: {
          targetAddonId: "aaaaaaaa-aaaa-4aaa-8aaa-0000000000a1",
          qty: 2,
          attrs: { sizes: ["King", "Queen"], size: "King + Queen" },
          label: "Dispose old mattress",
          oldQty: 1,
          oldSize: "King",
        },
      },
    ];
    render(<ChangeRequestsPanel orderId={REQ.orderId} />);
    const panel = screen.getByTestId("ops-change-requests");
    expect(panel.textContent).toContain("Add-on change");
    const swap = screen.getByTestId("ops-cr-editaddon");
    expect(swap.textContent).toContain("Dispose old mattress ×1 · King");
    expect(swap.textContent).toContain("→ ×2 · King + Queen");
    expect(screen.getByTestId("ops-cr-approve").textContent).toContain("Approve & apply");
  });

  // 0257 — replace_lines renders the old→new swap + the apply verb.
  it("renders a replace_lines request as old → new", () => {
    h.requests = [
      {
        ...REQ,
        kind: "replace_lines",
        payload: {
          targetLineIds: ["33333333-3333-3333-3333-333333333301"],
          targetLines: [{ sku: "FENRIR-K", qty: 1, unitPrice: 1999, label: "Fenrir · King" }],
          line: { sku: "FENRIR-Q", qty: 1, unitPrice: 2499, label: "Fenrir · Queen" },
        },
      },
    ];
    render(<ChangeRequestsPanel orderId={REQ.orderId} />);
    const panel = screen.getByTestId("ops-change-requests");
    expect(panel.textContent).toContain("Item change");
    const swap = screen.getByTestId("ops-cr-replace");
    expect(swap.textContent).toContain("Fenrir · King");
    expect(swap.textContent).toContain("Fenrir · Queen");
    expect(screen.getByTestId("ops-cr-approve").textContent).toContain("Approve & apply");
  });
});

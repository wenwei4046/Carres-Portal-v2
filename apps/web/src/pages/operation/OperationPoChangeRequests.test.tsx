/**
 * PO Amendments and Cancellation Requests (0717) — Weisiang's decision (Mr Lim,
 * WhatsApp 2026-10-22; Jess was not part of this decision): a PO change or
 * cancellation waits for approval, the Houzs way.
 */
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import OperationPoChangeRequests from "./OperationPoChangeRequests";
import type { PoChangeRequestRow } from "@/lib/queries";

vi.mock("./PurchasingTabs", () => ({ default: () => <header>Cancellation Requests</header> }));
const rows: PoChangeRequestRow[] = [];
const mutate = vi.fn();
vi.mock("@/lib/queries", () => ({
  usePoChangeRequests: () => ({ data: { requests: rows }, isLoading: false, isError: false }),
  useDecidePoChange: () => ({ mutate, isPending: false }),
}));

const row = (over: Partial<PoChangeRequestRow>): PoChangeRequestRow => ({
  id: "r1", po_id: "PO-TEST-1", reason: "TEST supplier cannot supply", summary: "TEST-SKU: cancel 2",
  status: "requested", requested_at: "2026-10-22T02:00:00Z", first_approved_at: null, decided_at: null, decision_note: null,
  supplier_name: "TEST Supplier", requested_by_name: "TEST Office", first_approved_by_name: null, decided_by_name: null, ...over,
});

describe("Cancellation Requests", () => {
  it("names each level, approves without a reason and rejects only with one", () => {
    rows.splice(0, rows.length, row({}), row({ id: "r2", po_id: "PO-TEST-2", status: "first_approved", first_approved_by_name: "TEST Duty" }));
    render(<OperationPoChangeRequests kind="cancellation" />);
    expect(screen.getByText("Waiting for PO Duty")).toBeInTheDocument();
    expect(screen.getByText("Waiting for Purchasing Approver")).toBeInTheDocument();
    expect(screen.getByTestId("po-change-summary")).toHaveTextContent("2 requests · 2 waiting");

    fireEvent.click(screen.getByTestId("po-change-row-r1"));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByRole("button", { name: "Reject" })).toBeDisabled();
    fireEvent.click(within(dialog).getByRole("button", { name: "Approve" }));
    expect(mutate.mock.calls[0][0]).toEqual({ id: "r1", approve: true, note: undefined });

    fireEvent.change(within(dialog).getByLabelText("Decision reason"), { target: { value: "TEST supplier will ship" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Reject" }));
    expect(mutate.mock.calls[1][0]).toEqual({ id: "r1", approve: false, note: "TEST supplier will ship" });
  });
});

/**
 * PO Amendments and Cancellation Requests (0717) — Weisiang's decision (Mr Lim,
 * WhatsApp 2026-10-22; Jess was not part of this decision): a PO change or
 * cancellation waits for approval, the Houzs way.
 */
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
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
  supplier_name: "TEST Supplier", requested_by_name: "TEST Office", first_approved_by_name: null, decided_by_name: null,
  mine: false, supplier_facts: null, ...over,
});

describe("Cancellation Requests", () => {
  it("names each level, approves without a reason and rejects only with one", () => {
    rows.splice(0, rows.length, row({}), row({ id: "r2", po_id: "PO-TEST-2", status: "first_approved", first_approved_by_name: "TEST Duty" }));
    render(<MemoryRouter><OperationPoChangeRequests kind="cancellation" /></MemoryRouter>);
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

  it("shows the whole request with Approve / Reject on the row, and the requester waits for another approver (YH 2026-10-26)", () => {
    rows.splice(0, rows.length,
      row({ supplier_facts: { supplierStatement: "agreed", fee: "no", shipped: false, evidence: ["a.pdf", "b.jpg"] } }),
      row({ id: "r2", po_id: "PO-TEST-2", mine: true }));
    render(<MemoryRouter initialEntries={["/operation?tab=po-cancellation-requests&request=r2"]}><OperationPoChangeRequests kind="cancellation" /></MemoryRouter>);
    const first = screen.getByTestId("po-change-row-r1");
    for (const text of ["PO-TEST-1", "TEST-SKU: cancel 2", "TEST supplier cannot supply", "TEST Office", "Supplier agrees", "2 files"]) expect(first).toHaveTextContent(text);
    expect(within(first).getByText("Approve")).toBeInTheDocument();
    expect(within(first).getByText("Reject")).toBeInTheDocument();

    const mine = screen.getByTestId("po-change-row-r2");
    expect(mine).toHaveTextContent("Waiting for another approver");
    expect(within(mine).queryByText("Approve")).not.toBeInTheDocument();
    // The PO page's flag opened r2; its requester gets no Approve / Reject.
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveTextContent("Waiting for another approver");
    expect(within(dialog).queryByRole("button", { name: "Approve" })).not.toBeInTheDocument();
    expect(within(dialog).getByRole("link", { name: "Open PO-TEST-2" })).toHaveAttribute("href", "/operation?tab=purchase-orders&po=PO-TEST-2");
  });
});

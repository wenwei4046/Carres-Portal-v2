import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReceivingSessionDetail, WarehouseReceiptQueueRow } from "@/lib/queries";
import ReceivingCompactView from "./ReceivingCompactView";
const state = vi.hoisted(() => ({ data: undefined as ReceivingSessionDetail | undefined, error: false, retry: vi.fn() }));
vi.mock("@/lib/queries", () => ({
  useReceivingSessionDetail: () => ({ data: state.data, isError: state.error, refetch: state.retry }),
  fetchReceivingSessionDetail: vi.fn(),
}));
const row = {
  id: "r1", grn_no: "GRN-20261004-1234", status: "posted", po_id: "PO-20261001-4567",
  supplier_name: "Recorded supplier", do_number: "SUPPLIER-20261004-1234", do_file_path: "saved-do.pdf",
  goods_received_at: "2026-10-04", actual_site_name: "Recorded site", source_refs: [],
  lines: [{ id: "line1", sku: "SKU", received_now: 2, damaged_qty: 1, wrong_item_qty: 0 }],
} as unknown as WarehouseReceiptQueueRow;
function mount(source = row) {
  const open = vi.fn(); const close = vi.fn();
  const items = vi.fn((receipt: WarehouseReceiptQueueRow) => <div>Receipt items: {receipt.lines[0].received_now}</div>);
  render(<MemoryRouter><ReceivingCompactView row={source} items={items} onOpen={open} onClose={close} /></MemoryRouter>);
  return { open, close, items };
}
beforeEach(() => { state.data = undefined; state.error = false; state.retry.mockReset(); });
describe("Receiving shared working panel", () => {
  it("opens the existing full record without inventing completed PO progress", () => {
    const { open, close } = mount();
    expect(screen.getByText("GRN-261004-1234")).toBeInTheDocument();
    expect(screen.queryByText(/completed|all received/i)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Open full page" }));
    expect(open).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole("button", { name: "Close panel" }));
    expect(close).toHaveBeenCalledOnce();
  });
  it("keeps an unposted report distinct from an issued GRN", () => {
    mount({ ...row, status: "submitted", grn_no: null });
    expect(screen.queryByText(/GRN-/)).not.toBeInTheDocument();
    expect(screen.getByText("Not issued")).toBeInTheDocument();
  });
  it("retains cancellation instead of presenting a normal receipt", () => {
    mount({ ...row, status: "voided" });
    expect(screen.getByText("Cancelled")).toBeInTheDocument();
  });
  it("distinguishes unreadable evidence from no recorded evidence and preserves supplier numbers", () => {
    state.data = { receipt: { ...row, unit_results: [], arrival_evidence: [], do_file_url: null }, events: [], po: null };
    mount();
    fireEvent.click(screen.getByRole("button", { name: "Receipt details" }));
    expect(screen.getByText("SUPPLIER-20261004-1234")).toBeInTheDocument();
    expect(screen.getByText("Evidence could not be loaded")).toBeInTheDocument();
    expect(screen.queryByText("Supplier DO · Not recorded")).not.toBeInTheDocument();
    expect(screen.getByText(/Time not recorded/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "PO-261001-4567" })).toHaveAttribute("href", "/operation/procurement?po=PO-20261001-4567");
  });
  it("does not show another receipt's detail while a query changes", () => {
    state.data = { receipt: { ...row, id: "other", supplier_name: "Another supplier", unit_results: [] }, events: [], po: null };
    mount();
    expect(screen.queryByText("Another supplier")).not.toBeInTheDocument();
    expect(screen.getByText("Recorded supplier")).toBeInTheDocument();
  });
  it("uses refreshed receipt goods and exact line-linked units together", () => {
    state.data = { receipt: { ...row, lines: [{ ...row.lines[0], received_now: 3 }], unit_results: [{ stock_item_id: "u", unit_code: "U1-000-001", po_line_id: "line1", outcome: "received", issue_kind: null, note: null }] }, events: [], po: null };
    const { items } = mount();
    expect(items.mock.calls[0][0].lines[0].received_now).toBe(3);
    expect(items.mock.calls[0][0].unit_ids_by_line).toEqual({ line1: ["U1-000-001"] });
  });
  it("does not call an unrequested party or receiver absent while details load", () => {
    mount({ ...row, supplier_name: null });
    fireEvent.click(screen.getByRole("button", { name: "Receipt details" }));
    expect(screen.getAllByText("Loading…").length).toBeGreaterThan(0);
    expect(screen.queryByText("Not recorded")).not.toBeInTheDocument();
  });
  it("links only returned related identities and retains stored IDs in the destinations", () => {
    state.data = { receipt: { ...row, unit_results: [] }, events: [], po: null,
      related_records: { claims: [{ id: "claim-exact", claim_no: "SC-20261004-0001" }], returns: [{ id: "return-exact", pr_no: "PR-20261004-0002" }] } };
    mount();
    fireEvent.click(screen.getByRole("button", { name: "Receipt details" }));
    expect(screen.getByRole("link", { name: "SC-261004-0001" })).toHaveAttribute("href", "/operation?tab=claims&claim=claim-exact");
    expect(screen.getByRole("link", { name: "PR-261004-0002" })).toHaveAttribute("href", "/operation?tab=purchase-returns&pr=return-exact");
  });
  it("shows unavailable and retry when relationships fail instead of pretending none exist", () => {
    state.data = { receipt: { ...row, unit_results: [] }, events: [], po: null, related_records: null };
    mount();
    fireEvent.click(screen.getByRole("button", { name: "Receipt details" }));
    expect(screen.getByText("Unavailable")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(state.retry).toHaveBeenCalledOnce();
  });
  it("shows the actual missing Unit outcome and recorded report reason", () => {
    state.data = { receipt: { ...row, return_reason: "Recount the second pallet", unit_results: [{ stock_item_id: "unit", unit_code: "U1-000-099", po_line_id: "line1", outcome: "not_received", issue_kind: null, note: null }] }, events: [], po: null };
    mount();
    fireEvent.click(screen.getByRole("button", { name: "Items" }));
    expect(screen.getByText("U1-000-099")).toBeInTheDocument();
    expect(screen.getByText("Not received")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Receipt details" }));
    expect(screen.getByText("Recount the second pallet")).toBeInTheDocument();
  });
  it("offers retry when details cannot be read", () => {
    state.error = true;
    mount();
    fireEvent.click(screen.getByRole("button", { name: "Receipt details" }));
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(state.retry).toHaveBeenCalledOnce();
  });
});

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ReceivingRegisterParent } from "@carres/shared";
import ReceivingWorkspace from "./ReceivingWorkspace";

const save = vi.fn();
const submit = vi.fn();
const review = vi.fn();
let status: "draft" | "posted" = "draft";

const parent = {
  id: "PO-20260831-0001",
  sourceKind: "purchase_order",
  sourceNumber: "PO-20260831-0001",
  sourceVersion: 3,
  grnNumber: null,
  poIssuedAt: "2026-08-20T02:00:00Z",
  supplier: "Hooka",
  deliverTo: "Carres Klang",
  poDeliveryDate: "2026-08-30",
  supplierDeliveryDate: "2026-09-02",
  sameAsPo: false,
  receivingDate: "2026-09-02",
  goodsReceivedAt: null,
  orderQty: 2,
  receivedQty: 0,
  damagedQty: 0,
  wrongItemQty: 0,
  extraQty: 0,
  pendingDeliveryQty: 2,
  supplierDoNo: null,
  unitIds: [],
  lines: [{ id: "11111111-1111-1111-1111-111111111111", sku: "MAT-K-001", orderQty: 2, receivedQty: 0 }],
  children: [],
} satisfies ReceivingRegisterParent;

vi.mock("@/lib/queries", () => ({
  usePoReceiving: () => ({
    data: {
      sessions: [{
        id: "receipt-1",
        po_id: parent.id,
        source_version: 3,
        do_number: status === "posted" ? "DO-7788" : null,
        do_file_path: status === "posted" ? "PO-20260831-0001/do.jpg" : null,
        note: null,
        lines: status === "posted"
          ? [{ poLineId: parent.lines[0].id, sku: "MAT-K-001", receivedQty: 2, damagedQty: 0, wrongItemQty: 0, extraQty: 0, unitIds: ["UNIT-1", "UNIT-2"] }]
          : [{ poLineId: parent.lines[0].id, sku: "MAT-K-001", receivedQty: 0, damagedQty: 0, wrongItemQty: 0, extraQty: 0, unitIds: [] }],
        status,
        lock_version: 1,
        submitted_from: "office",
        goods_received_at: status === "posted" ? "2026-08-31" : "",
        goods_received_timestamp: status === "posted" ? "2026-08-31T03:00:00Z" : null,
        grn_number: status === "posted" ? "GRN-20260831-0042" : null,
        grn_posting_date: status === "posted" ? "2026-08-31" : null,
        submitted_at: null,
        posted_at: status === "posted" ? "2026-08-31T04:00:00Z" : null,
        posted_by_name: status === "posted" ? "Jess" : null,
        submitted_by_name: null,
        normal_grn_duty_name: "Yee Jean",
        grn_cover_name: null,
        post_authority: status === "posted" ? "operations_superuser" : null,
        return_reason: null,
      }],
      events: [],
    },
    isLoading: false,
  }),
  useSaveReceivingSessionMutation: () => ({ mutate: save, isPending: false, error: null }),
  useSubmitReceivingSessionMutation: () => ({ mutate: submit, isPending: false, error: null }),
  useWarehouseReceiptReviewMutation: () => ({ mutate: review, isPending: false, error: null }),
}));

vi.mock("@/components/DOFileUploadField", () => ({
  default: ({ onUploaded }: { onUploaded: (path: string) => void }) => (
    <button type="button" onClick={() => onUploaded("PO-20260831-0001/do.jpg")}>Upload signed DO photo</button>
  ),
}));

vi.mock("@/components/ClaimPhotoUploadField", () => ({ default: () => <div>Exception evidence upload</div> }));

describe("ReceivingWorkspace", () => {
  it("keeps all four dates and six quantities distinct in the full-width session", () => {
    status = "draft";
    render(<ReceivingWorkspace parent={parent} receiptId="receipt-1" onBack={vi.fn()} />);
    for (const label of ["PO Issued", "PO Delivery Date", "Supplier Delivery Date", "Goods Received At"])
      expect(screen.getByText(label)).toBeInTheDocument();
    for (const label of ["Order Qty", "Received Qty", "Damaged Qty", "Wrong Item Qty", "Extra Qty", "Pending Delivery Qty"])
      expect(screen.getByText(label)).toBeInTheDocument();
    expect(screen.getByTestId("receiving-session-workspace")).toHaveClass("w-full");
  });

  it("saves the same persistent Draft and names the first posting gap", () => {
    status = "draft";
    render(<ReceivingWorkspace parent={parent} receiptId="receipt-1" onBack={vi.fn()} />);
    expect(screen.getByText("Supplier DO is missing")).toBeInTheDocument();
    expect(screen.getByText("Add the Supplier DO before you finish receiving")).toBeInTheDocument();
    const toolbar = screen.getByTestId("receiving-work-toolbar");
    expect(toolbar.compareDocumentPosition(screen.getByText("Order Qty"))).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    fireEvent.change(screen.getByLabelText("Supplier DO No."), { target: { value: "DO-7788" } });
    fireEvent.change(screen.getByLabelText("Received Qty for MAT-K-001"), { target: { value: "2" } });
    fireEvent.change(screen.getByLabelText("Unit ID for MAT-K-001"), { target: { value: "UNIT-1\nUNIT-2" } });
    fireEvent.click(screen.getByRole("button", { name: "Save Receiving" }));
    expect(save).toHaveBeenCalledWith(expect.objectContaining({
      expectedVersion: 1,
      session: expect.objectContaining({
        sourceId: parent.id,
        supplierDoNo: "DO-7788",
        lines: [expect.objectContaining({ receivedQty: 2, unitIds: ["UNIT-1", "UNIT-2"] })],
      }),
    }));
  });

  it("seals a posted session and shows the official GRN beside its facts", () => {
    status = "posted";
    render(<ReceivingWorkspace parent={parent} receiptId="receipt-1" onBack={vi.fn()} />);
    expect(screen.getByText("GOODS RECEIPT NOTE")).toBeInTheDocument();
    expect(screen.getByText("GRN-20260831-0042")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Save Receiving" })).not.toBeInTheDocument();
    expect(screen.getByTestId("posted-receiving-layout")).toHaveClass("min-[1130px]:grid-cols-2");
  });
});

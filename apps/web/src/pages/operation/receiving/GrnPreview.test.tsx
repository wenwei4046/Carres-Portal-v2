import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { ReceivingRegisterParent } from "@carres/shared";
import type { ReceivingSession } from "@/lib/queries";
import GrnPreview from "./GrnPreview";

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
  goodsReceivedAt: "2026-08-31T03:00:00Z",
  orderQty: 2,
  receivedQty: 2,
  damagedQty: 0,
  wrongItemQty: 0,
  extraQty: 0,
  pendingDeliveryQty: 0,
  supplierDoNo: null,
  unitIds: [],
  lines: [{ id: "11111111-1111-1111-1111-111111111111", sku: "MAT-K-001", orderQty: 2, receivedQty: 0 }],
  children: [],
} satisfies ReceivingRegisterParent;

const session = {
  id: "receipt-1",
  po_id: parent.id,
  source_version: 3,
  do_number: "DO-7788",
  do_file_path: "PO-20260831-0001/do.jpg",
  note: null,
  lines: [{ poLineId: parent.lines[0].id, sku: "MAT-K-001", receivedQty: 2, damagedQty: 0, wrongItemQty: 0, extraQty: 0, unitIds: ["UNIT-1", "UNIT-2"] }],
  status: "posted",
  lock_version: 2,
  submitted_from: "office",
  goods_received_at: "2026-08-31",
  goods_received_timestamp: "2026-08-31T03:00:00Z",
  grn_number: "GRN-20260831-0042",
  grn_posting_date: "2026-08-31",
  submitted_at: "2026-08-31T03:30:00Z",
  posted_at: "2026-08-31T04:00:00Z",
  posted_by_name: "Jess",
  submitted_by_name: "Shasha",
  normal_grn_duty_name: "Yee Jean",
  grn_cover_name: null,
  post_authority: "operations_superuser",
  return_reason: null,
} satisfies ReceivingSession;

describe("GrnPreview", () => {
  it("prints one stored official GRN with immutable source and physical facts", () => {
    render(<GrnPreview parent={parent} session={session} />);
    expect(screen.getByText("GOODS RECEIPT NOTE")).toBeInTheDocument();
    expect(screen.getByText("GRN-20260831-0042")).toBeInTheDocument();
    expect(screen.getByText("PO-20260831-0001 · Rev 3")).toBeInTheDocument();
    expect(screen.getByText("DO-7788")).toBeInTheDocument();
    expect(screen.getByText("UNIT-1, UNIT-2")).toBeInTheDocument();
    expect(screen.getByText("Jess")).toBeInTheDocument();
    expect(screen.getByText("Yee Jean")).toBeInTheDocument();
    expect(screen.getByText("Operations Superuser")).toBeInTheDocument();
  });
});

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { WarehouseReceiptRow } from "@carres/shared";
import ReceivingRecord from "./ReceivingRecord";

function record(grnNumber: string | null): WarehouseReceiptRow {
  return {
    id: "receipt-20260831",
    po_id: "PO-20260831-0001",
    warehouse_id: "warehouse-1",
    supplier_name: "Hooka",
    do_number: "DO-7788",
    status: "posted",
    lines: [],
    note: null,
    submitted_at: "2026-08-31T10:00:00+08:00",
    reviewed_at: null,
    return_reason: null,
    goods_received_at: "2026-08-30",
    grn_number: grnNumber,
  };
}

describe("ReceivingRecord formal identity", () => {
  it("shows only the GRN number stored at posting", () => {
    render(<ReceivingRecord record={record("GRN-20260831-0042")} />);
    expect(screen.getByTestId("receiving-record-no")).toHaveTextContent("GRN-20260831-0042");
    expect(screen.queryByText(/GRN-300826-/)).not.toBeInTheDocument();
  });

  it("names an unmigrated row without fabricating a formal number", () => {
    render(<ReceivingRecord record={record(null)} />);
    expect(screen.getByTestId("receiving-record-no")).toHaveTextContent("Legacy receipt");
    expect(screen.queryByText(/^GRN-/)).not.toBeInTheDocument();
  });
});

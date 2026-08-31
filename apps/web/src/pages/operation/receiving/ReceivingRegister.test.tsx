import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ReceivingRegisterParent } from "@carres/shared";
import ReceivingRegister from "./ReceivingRegister";

vi.mock("@/components/register/DataGrid", () => ({
  DataGrid: ({ rows, columns, expandable, toolbarStart, statusSummary, appearance, stickyIdentity }: any) => (
    <div data-testid="receiving-data-grid" data-appearance={appearance} data-sticky={String(Boolean(stickyIdentity))}>
      <div data-testid="receiving-toolbar">{toolbarStart}</div>
      <div data-testid="receiving-columns">{columns.filter((c: any) => !c.defaultHidden).map((c: any) => c.label).join(" | ")}</div>
      {rows.map((row: any) => (
        <div key={row.id} data-testid={`receiving-parent-${row.id}`}>
          {columns.map((column: any) => <div key={column.key}>{column.accessor(row)}</div>)}
          {expandable?.renderExpansion(row)}
        </div>
      ))}
      <div data-testid="receiving-footer">{statusSummary?.(rows, [])}</div>
    </div>
  ),
}));

const parents: ReceivingRegisterParent[] = [
  {
    id: "PO-20260831-0001",
    sourceKind: "purchase_order",
    sourceNumber: "PO-20260831-0001",
    sourceVersion: 2,
    grnNumber: null,
    poIssuedAt: "2026-08-28T08:00:00Z",
    supplier: "Hooka",
    deliverTo: "Carres Klang",
    poDeliveryDate: "2026-09-01",
    supplierDeliveryDate: "2026-09-03",
    sameAsPo: false,
    receivingDate: "2026-09-03",
    goodsReceivedAt: "2026-08-31T10:20:00+08:00",
    orderQty: 5,
    receivedQty: 2,
    damagedQty: 1,
    wrongItemQty: 1,
    extraQty: 1,
    pendingDeliveryQty: 3,
    supplierDoNo: null,
    unitIds: [],
    children: [
      {
        id: "receipt-1",
        grnNumber: "GRN-20260831-0001",
        sourceNumber: "PO-20260831-0001",
        poIssuedAt: "2026-08-28T08:00:00Z",
        supplier: "Hooka",
        deliverTo: "Carres Klang",
        poDeliveryDate: "2026-09-01",
        supplierDeliveryDate: "2026-09-03",
        sameAsPo: false,
        goodsReceivedAt: "2026-08-31T10:20:00+08:00",
        orderQty: 5,
        receivedQty: 2,
        damagedQty: 1,
        wrongItemQty: 1,
        extraQty: 1,
        pendingDeliveryQty: 3,
        supplierDoNo: "DO-7788",
        unitIds: ["UNIT-001", "UNIT-002"],
      },
    ],
  },
  {
    id: "PO-20260831-0002",
    sourceKind: "purchase_order",
    sourceNumber: "PO-20260831-0002",
    sourceVersion: 1,
    grnNumber: null,
    poIssuedAt: "2026-08-29T08:00:00Z",
    supplier: "Nice Future",
    deliverTo: "Carres Klang",
    poDeliveryDate: "2026-09-04",
    supplierDeliveryDate: "2026-09-04",
    sameAsPo: true,
    receivingDate: "2026-09-04",
    goodsReceivedAt: null,
    orderQty: 3,
    receivedQty: 0,
    damagedQty: 0,
    wrongItemQty: 0,
    extraQty: 0,
    pendingDeliveryQty: 3,
    supplierDoNo: null,
    unitIds: [],
    children: [],
  },
];

describe("ReceivingRegister", () => {
  it("renders the approved facts in the shared register with no outer frame", () => {
    render(<ReceivingRegister parents={parents} loading={false} onOpenSession={vi.fn()} onStartReceiving={vi.fn()} />);

    const root = screen.getByTestId("receiving-register");
    expect(root.className).not.toMatch(/\bborder\b/);
    expect(screen.getByTestId("receiving-data-grid")).toHaveAttribute("data-appearance", "reference");
    expect(screen.getByTestId("receiving-data-grid")).toHaveAttribute("data-sticky", "true");
    expect(screen.getByTestId("receiving-columns")).toHaveTextContent(
      "GRN No. | PO No. | PO Issued | Supplier | Deliver To | PO Delivery Date | Supplier Delivery Date | Goods Received At | Order Qty | Received Qty | Damaged Qty | Wrong Item Qty | Extra Qty | Pending Delivery Qty | Supplier DO No. | Unit ID",
    );
    expect(screen.getByText("Same as PO")).toBeInTheDocument();
  });

  it("discloses stored GRN evidence and opens that exact session", () => {
    const onOpenSession = vi.fn();
    render(<ReceivingRegister parents={parents} loading={false} onOpenSession={onOpenSession} onStartReceiving={vi.fn()} />);

    const first = within(screen.getByTestId("receiving-parent-PO-20260831-0001"));
    const children = within(screen.getByTestId("receiving-children-PO-20260831-0001"));
    expect(children.getByText("GRN-20260831-0001")).toBeInTheDocument();
    expect(children.getByText("DO-7788")).toBeInTheDocument();
    expect(children.getByText("UNIT-001, UNIT-002")).toBeInTheDocument();
    expect(children.getByText("Pending Delivery Qty 3")).toBeInTheDocument();
    fireEvent.click(first.getByRole("button", { name: "Open GRN-20260831-0001" }));
    expect(onOpenSession).toHaveBeenCalledWith("receipt-1", "PO-20260831-0001");
  });

  it("starts a new session only when no unposted session exists", () => {
    const onStartReceiving = vi.fn();
    render(<ReceivingRegister parents={parents} loading={false} onOpenSession={vi.fn()} onStartReceiving={onStartReceiving} />);

    fireEvent.click(within(screen.getByTestId("receiving-parent-PO-20260831-0002")).getByRole("button", { name: "Start Receiving" }));
    expect(onStartReceiving).toHaveBeenCalledWith("PO-20260831-0002", 1);
  });
});

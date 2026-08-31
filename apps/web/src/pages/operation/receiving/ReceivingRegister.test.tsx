import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ReceivingRegisterParent } from "@carres/shared";
import ReceivingRegister from "./ReceivingRegister";

vi.mock("@/components/register/DataGrid", () => ({
  DataGrid: ({ rows, columns, expandable, toolbarStart, statusSummary, appearance, stickyIdentity, selectable, selectionSummary, selectionPrimary }: any) => (
    <div data-testid="receiving-data-grid" data-appearance={appearance} data-sticky={String(Boolean(stickyIdentity))}>
      <div data-testid="receiving-toolbar">
        {selectable.selectedKeys.size > 0 ? <><span>{selectionSummary(selectable.selectedKeys.size)}</span>{selectionPrimary}</> : toolbarStart}
      </div>
      <div data-testid="receiving-columns">{columns.filter((c: any) => !c.defaultHidden).map((c: any) => c.label).join(" | ")}</div>
      {rows.map((row: any) => (
        <div key={row.id} data-testid={`receiving-parent-${row.id}`}>
          <button type="button" aria-label={`Select ${row.sourceNumber}`} onClick={() => selectable.onToggle(row.id)}>Select</button>
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
    lines: [{ id: "11111111-1111-1111-1111-111111111111", sku: "MAT-K-001", orderQty: 5, receivedQty: 2 }],
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
        status: "posted",
        signedDoPath: "PO-20260831-0001/do.jpg",
        returnReason: null,
        lines: [{
          poLineId: "11111111-1111-1111-1111-111111111111",
          sku: "MAT-K-001",
          receivedQty: 2,
          damagedQty: 1,
          wrongItemQty: 1,
          extraQty: 1,
          unitIds: ["UNIT-001", "UNIT-002"],
          damagedPhotos: ["damage.jpg"],
          wrongItemPhotos: ["wrong.jpg"],
          extraEvidence: ["extra.jpg"],
          wrongItemReason: "Different model",
        }],
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
    lines: [{ id: "22222222-2222-2222-2222-222222222222", sku: "SOFA-001", orderQty: 3, receivedQty: 0 }],
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

    expect(within(screen.getByTestId("receiving-parent-PO-20260831-0002")).queryByRole("button", { name: "Start Receiving" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Select PO-20260831-0002" }));
    expect(screen.getByTestId("receiving-toolbar")).toHaveTextContent("1 delivery balance selected");
    fireEvent.click(within(screen.getByTestId("receiving-toolbar")).getByRole("button", { name: "Start Receiving" }));
    expect(onStartReceiving).toHaveBeenCalledWith("PO-20260831-0002", 1);
  });

  it("opens an existing Draft from the same selected Work Toolbar state", () => {
    const onOpenSession = vi.fn();
    const withDraft: ReceivingRegisterParent[] = [{
      ...parents[1],
      children: [{
        ...parents[0].children[0],
        id: "receipt-draft",
        grnNumber: null,
        sourceNumber: parents[1].sourceNumber,
      }],
    }];
    render(<ReceivingRegister parents={withDraft} loading={false} onOpenSession={onOpenSession} onStartReceiving={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "Select PO-20260831-0002" }));
    fireEvent.click(within(screen.getByTestId("receiving-toolbar")).getByRole("button", { name: "Open Receiving" }));
    expect(onOpenSession).toHaveBeenCalledWith("receipt-draft", "PO-20260831-0002");
  });
});

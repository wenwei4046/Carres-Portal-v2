import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import type { ReceivingRegisterResult } from "@carres/shared";
import OperationReceiving from "./OperationReceiving";

let requestedFilter: string | null | undefined;
const createSession = vi.fn();

const result: ReceivingRegisterResult = {
  authority: null,
  rail: [
    { key: "late", label: "Late", count: 1 },
    { key: "2026-08-31", label: "2026-08-31", count: 0 },
    { key: "2026-09-01", label: "2026-09-01", count: 1 },
    { key: "2026-09-02", label: "2026-09-02", count: 0 },
    { key: "2026-09-03", label: "2026-09-03", count: 0 },
    { key: "2026-09-04", label: "2026-09-04", count: 0 },
    { key: "2026-09-05", label: "2026-09-05", count: 0 },
    { key: "later", label: "Later", count: 0 },
    { key: "none", label: "No delivery date", count: 0 },
  ],
  parents: [{
    id: "PO-20260831-0001",
    sourceKind: "purchase_order",
    sourceNumber: "PO-20260831-0001",
    sourceVersion: 3,
    grnNumber: null,
    poIssuedAt: "2026-08-28T08:00:00Z",
    supplier: "Hooka",
    deliverTo: "Carres Klang",
    poDeliveryDate: "2026-09-01",
    supplierDeliveryDate: "2026-09-03",
    sameAsPo: false,
    receivingDate: "2026-09-03",
    goodsReceivedAt: null,
    orderQty: 4,
    receivedQty: 1,
    damagedQty: 0,
    wrongItemQty: 0,
    extraQty: 0,
    pendingDeliveryQty: 3,
    supplierDoNo: null,
    unitIds: [],
    lines: [{ id: "11111111-1111-1111-1111-111111111111", sku: "MAT-K-001", orderQty: 4, receivedQty: 1 }],
    children: [],
  }],
};

vi.mock("@/lib/queries", () => ({
  useReceivingRegister: (filter: string | null | undefined) => {
    requestedFilter = filter;
    return { data: result, isLoading: false, isError: false, error: null, refetch: vi.fn() };
  },
  useCreateReceivingSessionMutation: () => ({
    mutate: (input: unknown, options: { onSuccess?: (result: unknown) => void }) => {
      createSession(input);
      options.onSuccess?.({ receipt_id: "receipt-created", status: "draft", lock_version: 1 });
    },
    isPending: false,
    error: null,
  }),
}));

vi.mock("@/components/register/DataGrid", () => ({
  DataGrid: ({ rows, columns, expandable, toolbarStart, statusSummary, selectable, selectionPrimary, selectionSummary }: any) => (
    <div data-testid="work-toolbar">
      {selectable.selectedKeys.size > 0 ? <><span>{selectionSummary(selectable.selectedKeys.size)}</span>{selectionPrimary}</> : toolbarStart}
      <div>{columns.map((column: any) => column.label).join(" | ")}</div>
      {rows.map((row: any) => (
        <div key={row.id}>
          <button type="button" aria-label={`Select ${row.sourceNumber}`} onClick={() => selectable.onToggle(row.id)}>Select</button>
          {columns.map((column: any) => <div key={column.key}>{column.accessor(row)}</div>)}
          {expandable.renderExpansion(row)}
        </div>
      ))}
      {statusSummary(rows, [])}
    </div>
  ),
}));

vi.mock("./PurchasingTabs", () => ({
  default: ({ right }: { right?: React.ReactNode }) => (
    <header><span>Receiving</span>{right}</header>
  ),
}));

vi.mock("./components/ReceivingWorkspace", () => ({
  default: ({ receiptId }: { receiptId: string }) => <div data-testid="session-workspace">{receiptId}</div>,
}));

function LocationProbe() {
  const location = useLocation();
  return <output data-testid="location">{location.pathname}{location.search}</output>;
}

function wrap() {
  requestedFilter = undefined;
  createSession.mockReset();
  return render(
    <MemoryRouter initialEntries={["/operation?tab=receiving"]}>
      <OperationReceiving />
      <LocationProbe />
    </MemoryRouter>,
  );
}

describe("OperationReceiving — approved one-register page", () => {
  it("states the staff outcome once and renders one dated Register", () => {
    wrap();
    expect(screen.getByText("Receiving")).toBeInTheDocument();
    expect(screen.getByText("See what should arrive and record what actually arrived.")).toBeInTheDocument();
    expect(screen.getByTestId("receiving-date-rail")).toBeInTheDocument();
    expect(screen.getByTestId("receiving-register")).toBeInTheDocument();
    expect(screen.getAllByTestId("work-toolbar")).toHaveLength(1);
  });

  it("retires the old competing queues, progress facets, Source and 400px pane", () => {
    wrap();
    for (const word of ["To receive", "Goods Received", "Receiving Progress", "Source", "Accepted", "Rejected"])
      expect(screen.queryByText(word)).not.toBeInTheDocument();
    expect(screen.queryByTestId("receiving-workspace-pane")).not.toBeInTheDocument();
  });

  it("keeps every Warehouse date row visible even when its count is zero", () => {
    wrap();
    expect(screen.getByTestId("receiving-date-2026-08-31")).toHaveTextContent("0");
    expect(screen.getByTestId("receiving-date-none")).toHaveTextContent("0");
    expect(screen.getAllByTestId(/^receiving-date-/)).toHaveLength(10);
  });

  it("asks the server for the selected governed date and toggles it back to all", async () => {
    wrap();
    fireEvent.click(screen.getByTestId("receiving-date-late"));
    await waitFor(() => expect(requestedFilter).toBe("late"));
    expect(screen.getByTestId("location")).toHaveTextContent("date=late");
    fireEvent.click(screen.getByTestId("receiving-date-late"));
    await waitFor(() => expect(requestedFilter).toBeNull());
    expect(screen.getByTestId("location")).not.toHaveTextContent("date=");
  });

  it("Start Receiving creates one persistent Draft then opens its exact identity", async () => {
    wrap();
    fireEvent.click(screen.getByRole("button", { name: "Select PO-20260831-0001" }));
    fireEvent.click(screen.getByRole("button", { name: "Start Receiving" }));
    await waitFor(() => {
      expect(screen.getByTestId("location")).toHaveTextContent("po=PO-20260831-0001");
      expect(screen.getByTestId("location")).toHaveTextContent("receipt=receipt-created");
    });
    expect(createSession).toHaveBeenCalledWith(expect.objectContaining({
      sourceId: "PO-20260831-0001",
      expectedVersion: 3,
      supplierDoNo: "",
      signedDoPath: "",
      goodsReceivedAt: "",
    }));
  });

  it("the narrow-width door restores the same date rail", () => {
    wrap();
    fireEvent.click(screen.getByRole("button", { name: "Hide filters" }));
    expect(screen.queryByTestId("receiving-date-rail")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Show filters" }));
    expect(screen.getByTestId("receiving-date-rail")).toBeInTheDocument();
  });
});

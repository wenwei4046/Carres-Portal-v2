import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const navigate = vi.fn();
const refetch = vi.fn();
const reviseMutate = vi.fn();
const recordAnswerMutate = vi.fn();
const uploadEvidence = vi.fn();
let auditError = false;
let connectionError = false;
let requiredLoading = false;
let connectionLoading = false;
let connectionEmpty = false;
let receivingReturnReason: string | null = null;
type TestPromise = {
  kind: string;
  answer: string;
  about_date: string | null;
  previous_date: string | null;
  new_date: string | null;
  reason: string | null;
  recorded_at: string;
};
const queryData = {
  pos: [
    {
      id: "PO-20260828-4827",
      supplier_id: "supplier-1",
      warehouse_id: "warehouse-1",
      destination_id: "destination-1",
      status: "open" as const,
      sup_status: "pending",
      so: null,
      so_refs: null,
      eta_date: "2026-09-10",
      po_delivery_date: "2026-09-10",
      expected_ready_date: null,
      purpose: "customer_sales",
      version: 2,
      revised_at: "2026-08-28T09:00:00Z",
      placed_at: "2026-08-28T08:00:00Z",
      sources: [
        { kind: "sales_order" as const, reference: "SO-4001" },
        { kind: "manual_purchase" as const, reference: "MPR-20260828-0042" },
      ],
      sends: [
        {
          channel: "whatsapp",
          note: null,
          sent_at: "2026-08-27T09:00:00Z",
          kind: "confirmed_sent" as const,
          recipient: "Hooka Purchasing Group",
          po_version: 1,
          sent_by_name: "Yee Jean",
          duty_name: "Yee Jean",
          acting_name: null,
          po_revisions: null,
        },
      ],
      promises: [{
        kind: "tomorrow_delivery",
        answer: "shipping",
        about_date: "2026-09-10",
        previous_date: null,
        new_date: null,
        reason: null,
        recorded_at: "2026-09-09T09:00:00Z",
      }] as TestPromise[],
      purchase_order_lines: [
        {
          id: "line-1",
          sku: "MAT-K-001",
          qty: 3,
          received_qty: 1,
          model_name: "Cody",
          size: "King",
          destination_id: "destination-1" as string | null,
          sources: [
            {
              po_id: "PO-20260828-4827",
              po_line_id: "line-1",
              order_id: "order-1",
              order_line_id: "order-line-1",
              so: 4001,
              qty: 3,
            },
          ],
          governed_sources: [
            { kind: "sales_order" as const, reference: "SO-4001", qty: 1 },
            { kind: "manual_purchase" as const, reference: "MPR-20260828-0042", qty: 2 },
          ],
        },
      ],
    },
    {
      id: "PO-LEGACY",
      supplier_id: "supplier-1",
      warehouse_id: "warehouse-1",
      status: "cancelled" as const,
      sup_status: "pending",
      so: null,
      so_refs: null,
      eta_date: null,
      po_delivery_date: null,
      version: 1,
      placed_at: "2025-01-01T08:00:00Z",
      sources: [],
      sends: [],
      promises: [] as TestPromise[],
      purchase_order_lines: [],
    },
  ],
  destinations: [
    { id: "destination-1", name: "Carres Klang", is_default: true },
    { id: "destination-2", name: "Carres Penang", is_default: false },
  ],
  referencedDestinations: [
    { id: "destination-1", name: "Carres Klang", is_default: true },
    { id: "destination-2", name: "Carres Penang", is_default: false },
  ],
  messageTemplate: "Please build this purchase order.",
};

vi.mock("@/components/register/DataGrid", () => ({
  DataGrid: ({ rows, columns, onRowDoubleClick, statusSummary, expandable }: any) => (
    <div data-testid="register-grid">
      <div>{columns.filter((c: any) => !c.defaultHidden).map((c: any) => c.label).join(" | ")}</div>
      <div data-testid="register-search-index">{rows.flatMap((row: any) => columns.map((column: any) => column.searchValue?.(row) ?? "")).join(" ")}</div>
      {rows.map((row: any) => (
        <div key={row.id} data-testid={`grid-row-${row.id}`} onDoubleClick={() => onRowDoubleClick?.(row)}>
          {columns.filter((c: any) => !c.defaultHidden).map((column: any) => (
            <div key={column.key}>{column.accessor?.(row)}</div>
          ))}
          {expandable?.renderExpansion(row)}
        </div>
      ))}
      {statusSummary?.(rows, [])}
    </div>
  ),
}));

vi.mock("../PurchasingTabs", () => ({
  default: () => <div data-testid="purchasing-tabs">Purchasing · Purchase Orders</div>,
}));

vi.mock("@/lib/queries", () => ({
  useOperationPos: () => ({ data: queryData, isLoading: requiredLoading, isError: false, refetch }),
  useOperationSuppliers: () => ({
    data: {
      suppliers: [
        {
          id: "supplier-1",
          name: "Hooka",
          kind: "own_logistics",
          cat_covered: [],
          lead_time: null,
          contact: "+60123456789",
          whatsapp_group_url: "https://chat.whatsapp.com/hooka",
          contact_email: "buy@hooka.my",
        },
      ],
    },
    isLoading: false,
    isError: false,
    refetch,
  }),
  useOperationWarehouse: () => ({
    data: { warehouses: [{ id: "warehouse-1", name: "Carres Klang", address: "Klang" }] },
    isLoading: false,
    isError: false,
    refetch,
  }),
  useOperationPoDuty: () => ({
    data: { month: "2026-08", holder: { userId: "user-duty", name: "Yee Jean", email: "yj@carres.com", assignedBy: null } },
    isLoading: false,
    isError: false,
    refetch,
  }),
  useOperationPoUnits: () => ({ isLoading: connectionLoading, isError: false, refetch, data: connectionLoading ? undefined : { units: connectionEmpty ? [] : [{ unit_code: "U1-000-001", sku: "MAT-K-001", status: "incoming" }] } }),
  usePoReceiving: () => ({ isLoading: connectionLoading, isError: connectionError, refetch, data: connectionError || connectionLoading ? undefined : { sessions: connectionEmpty ? [] : [{ id: "receipt-1", do_number: "DO-SUP-9", status: "posted", goods_received_at: "2026-08-28", return_reason: receivingReturnReason }], events: [] } }),
  useOperationSupplierClaims: () => ({ isLoading: connectionLoading, isError: connectionError, refetch, data: connectionError || connectionLoading ? undefined : { claims: connectionEmpty ? [] : [{ id: "claim-1", claim_no: "SC-1001", requested_action: "return", status: "open" }], counts: { open: connectionEmpty ? 0 : 1, closed: 0, all: connectionEmpty ? 0 : 1 } } }),
  useOperationPoAudit: () => ({ isError: auditError, refetch, data: auditError ? undefined : { revisions: [{ id: "rev-1", rev_no: 1, reason: "Deliver To changed", created_at: "2026-08-28T09:00:00Z", actor_name: "Yee Jean" }], history: [{ id: "hist-1", text: "Purchase order revised", occurred_at: "2026-08-28T09:00:00Z", actor_name: "Yee Jean", by_role: "operation" }] } }),
  useRecordSend: () => ({ mutate: vi.fn() }),
  useRevisePo: () => ({ mutate: reviseMutate, isPending: false }),
  useRecordSupplierAnswer: () => ({ mutateAsync: recordAnswerMutate, isPending: false }),
  useOperationStaff: () => ({ data: { staff: [{ user_id: "user-duty", email: "yj@carres.com", name: "Yee Jean" }], myDuties: [] }, isLoading: false }),
}));

vi.mock("../components/PoIssueEvidence", () => ({
  default: () => <div data-testid="po-issue-evidence">Issue evidence</div>,
  doorsForIssuedPo: () => ({}),
}));

vi.mock("@/lib/api", () => ({ apiFetch: vi.fn().mockResolvedValue({}) }));
vi.mock("@/lib/pdf/render", () => ({ renderPoPdf: vi.fn() }));
vi.mock("@/lib/po-evidence-upload", () => ({
  uploadPurchaseOrderEvidence: (...args: unknown[]) => uploadEvidence(...args),
  openPurchaseOrderEvidence: vi.fn(),
}));

import PurchaseOrdersPage from "./PurchaseOrdersPage";
import { apiFetch } from "@/lib/api";

function renderPage(path = "/operation/procurement") {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <PurchaseOrdersPage />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  navigate.mockReset();
  auditError = false;
  connectionError = false;
  requiredLoading = false;
  connectionLoading = false;
  connectionEmpty = false;
  receivingReturnReason = null;
  reviseMutate.mockReset();
  recordAnswerMutate.mockReset();
  recordAnswerMutate.mockResolvedValue({ ok: true });
  uploadEvidence.mockReset();
  uploadEvidence.mockResolvedValue("PO-20260828-4827/answer.png");
  queryData.pos[0]!.sends[0]!.po_version = 1;
  queryData.destinations.splice(
    0,
    queryData.destinations.length,
    { id: "destination-1", name: "Carres Klang", is_default: true },
    { id: "destination-2", name: "Carres Penang", is_default: false },
  );
  queryData.pos[0]!.purchase_order_lines[0]!.destination_id = "destination-1";
  queryData.pos[0]!.eta_date = "2026-09-10";
  queryData.pos[0]!.promises.splice(0, queryData.pos[0]!.promises.length, {
    kind: "tomorrow_delivery",
    answer: "shipping",
    about_date: "2026-09-10",
    previous_date: null,
    new_date: null,
    reason: null,
    recorded_at: "2026-09-09T09:00:00Z",
  });
  vi.mocked(apiFetch).mockResolvedValue({});
});

describe("Purchase Orders Register", () => {
  it("uses the governed columns and filter rail, and does not hide old or cancelled POs", () => {
    renderPage();
    expect(screen.getByTestId("register-grid")).toHaveTextContent(
      "PO No | PO Issued | Supplier | Items | Related To | Deliver To | PO Delivery Date | Supplier Delivery Date | Order Qty | Received Qty | Pending Delivery Qty | Status | Work",
    );
    for (const word of [
      "PDF not sent",
      "Supplier Delivery Date missing",
      "Supplier Delivery Date passed",
      "Version changed — supplier update required",
      "Partly received",
      "Completed",
    ]) expect(screen.getByRole("button", { name: new RegExp(word) })).toBeInTheDocument();
    expect(screen.getByTestId("grid-row-PO-20260828-4827")).toBeInTheDocument();
    expect(screen.getByTestId("grid-row-PO-LEGACY")).toHaveTextContent("Not recorded");
  });

  it("uses the Purchasing UI Dictionary and does not revive the retired labels", () => {
    renderPage();
    const page = screen.getByTestId("purchase-orders-register");
    expect(page).not.toHaveTextContent(/PO Date|Supplier Date|Current Version|Supplier Has|Open Balance/);
    expect(page).not.toHaveTextContent(/Goods Receipts|Arrival Date|Accepted Qty|Rejected Qty/);
  });

  it("keeps the official PO Delivery Date and shows only a changed supplier date", () => {
    renderPage();
    expect(screen.getByTestId("grid-row-PO-20260828-4827")).toHaveTextContent("Same as PO");

    queryData.pos[0]!.promises.push({
      kind: "tomorrow_delivery",
      answer: "delayed",
      about_date: "2026-09-10",
      previous_date: "2026-09-10",
      new_date: "2026-09-14",
      reason: "Production Delay",
      recorded_at: "2026-09-09T10:00:00Z",
    });
    const changed = renderPage();
    expect(screen.getAllByTestId("grid-row-PO-20260828-4827").at(-1)).toHaveTextContent("Mon, 14 Sep");
    changed.unmount();
  });

  it("shows two-line work copy with structured real-roster owner metadata", () => {
    renderPage();
    const row = screen.getByTestId("grid-row-PO-20260828-4827");
    expect(row).toHaveTextContent("Version 2 has not been sent");
    expect(row).toHaveTextContent("Issue Version 2");
    expect(row.querySelector('[data-owner-id="user-duty"]')).toHaveAttribute("data-owner-duty", "PO Duty");
  });

  it("expands the governed goods facts without opening a second workspace", () => {
    renderPage();
    const row = screen.getByTestId("grid-row-PO-20260828-4827");
    for (const heading of [
      "Item", "SKU", "Unit ID", "Related To", "Deliver To", "Order Qty",
      "Received Qty", "Damaged Qty", "Wrong Item Qty", "Pending Delivery Qty",
    ]) expect(row).toHaveTextContent(heading);
  });

  it("keeps every governed source searchable while the register cell stays compact", () => {
    renderPage();
    expect(screen.getByTestId("grid-row-PO-20260828-4827")).toHaveTextContent("SO-4001 +1");
    expect(screen.getByTestId("register-search-index")).toHaveTextContent("MPR-20260828-0042");
  });

  it("opens an object from the live register without changing the page's Hook order", () => {
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: /PO-20260828-4827/ }));
    expect(screen.getByTestId("purchase-order-object")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /PO-20260828-4827/ })).toBeInTheDocument();
  });

  it("does not report empty facts while the required register reads are loading", () => {
    requiredLoading = true;
    renderPage();
    expect(screen.getByText("Loading purchase orders…")).toBeInTheDocument();
    expect(screen.queryByTestId("register-grid")).not.toBeInTheDocument();
  });
});

describe("Purchase Order object", () => {
  it("opens the governed object views and preserves document connections", () => {
    renderPage("/operation/procurement?po=PO-20260828-4827");
    expect(screen.getByRole("heading", { name: /PO-20260828-4827/ })).toBeInTheDocument();
    for (const view of ["Document", "Revisions", "History", "Order Route"]) {
      expect(screen.getByRole("button", { name: view })).toBeInTheDocument();
    }
    expect(screen.getByText("U1-000-001")).toBeInTheDocument();
    expect(screen.getByText("DO-SUP-9")).toBeInTheDocument();
    expect(screen.getByText("SC-1001")).toBeInTheDocument();
  });

  it("shows each goods line's effective Deliver To from the destination registry", () => {
    queryData.pos[0]!.purchase_order_lines[0]!.destination_id = "destination-2";
    renderPage("/operation/procurement?po=PO-20260828-4827");
    expect(screen.getByText("Carres Penang")).toBeInTheDocument();
  });

  it("does not call loading connections empty", () => {
    connectionLoading = true;
    renderPage("/operation/procurement?po=PO-20260828-4827");
    expect(screen.getAllByText("Loading…")).toHaveLength(3);
    expect(screen.queryByText("No Unit ID is recorded for this PO.")).not.toBeInTheDocument();
  });

  it("states successful empty connections instead of leaving blank panels", () => {
    connectionEmpty = true;
    renderPage("/operation/procurement?po=PO-20260828-4827");
    expect(screen.getByText("No Unit ID is recorded for this PO.")).toBeInTheDocument();
    expect(screen.getByText("No receiving session is connected to this PO.")).toBeInTheDocument();
    expect(screen.getByText("No claim or return is connected to this PO.")).toBeInTheDocument();
  });

  it("includes a receiving-derived return in the Order Route problem connection", () => {
    receivingReturnReason = "Wrong item returned to supplier";
    renderPage("/operation/procurement?po=PO-20260828-4827");
    fireEvent.click(screen.getByRole("button", { name: "Order Route" }));
    expect(screen.getByText("2 connected")).toBeInTheDocument();
    expect(screen.getByText("SC-1001 · Receiving return")).toBeInTheDocument();
  });

  it("uses the 50/50 official-document layout only for issue or revision work", () => {
    renderPage("/operation/procurement?po=PO-20260828-4827");
    expect(screen.queryByTestId("po-document-split")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Issue current PDF" }));
    expect(screen.getByTestId("po-document-split")).toHaveAttribute("data-layout", "50-50");
    expect(screen.getByTestId("po-issue-evidence")).toBeInTheDocument();
    expect(screen.getByText("Official PO")).toBeInTheDocument();
    expect(screen.getByLabelText("Official purchase order preview")).toBeInTheDocument();
  });

  it("records a supplier date only with channel, file evidence, reporter and both times", async () => {
    queryData.pos[0]!.sends[0]!.po_version = 2;
    queryData.pos[0]!.promises.splice(0, queryData.pos[0]!.promises.length);
    renderPage("/operation/procurement?po=PO-20260828-4827");
    fireEvent.click(screen.getByRole("button", { name: "Record supplier date" }));
    fireEvent.change(screen.getByLabelText("Reported by"), { target: { value: "user-duty" } });
    const file = new File(["proof"], "answer.png", { type: "image/png" });
    fireEvent.change(screen.getByLabelText("Supplier answer evidence"), { target: { files: [file] } });
    fireEvent.click(screen.getByRole("button", { name: "Record supplier answer" }));
    await waitFor(() => expect(uploadEvidence).toHaveBeenCalledWith("PO-20260828-4827", file));
    expect(recordAnswerMutate).toHaveBeenCalledWith(expect.objectContaining({
      answer: "same_as_po",
      poDeliveryDate: "2026-09-10",
      supplierDeliveryDate: "2026-09-10",
      channel: "whatsapp",
      evidencePath: "PO-20260828-4827/answer.png",
      reportedByUserId: "user-duty",
    }));
  });

  it("does not call a failed audit read an empty revision history", () => {
    auditError = true;
    renderPage("/operation/procurement?po=PO-20260828-4827");
    fireEvent.click(screen.getByRole("button", { name: "Revisions" }));
    expect(screen.getByText("The PO revisions could not be loaded")).toBeInTheDocument();
    expect(screen.getByText("Try again. If it still fails, ask the system owner to check the PO history.")).toBeInTheDocument();
    expect(screen.queryByText("No revised version is recorded.")).not.toBeInTheDocument();
  });

  it("does not call failed receiving and claim reads 'None recorded' in Order Route", () => {
    connectionError = true;
    renderPage("/operation/procurement?po=PO-20260828-4827");
    fireEvent.click(screen.getByRole("button", { name: "Order Route" }));
    expect(screen.getByText("The Receiving connection could not be loaded")).toBeInTheDocument();
    expect(screen.getByText("The claims and returns connection could not be loaded")).toBeInTheDocument();
    expect(screen.queryByText("None recorded")).not.toBeInTheDocument();
  });

  it("revises one goods line to another governed Deliver To", () => {
    renderPage("/operation/procurement?po=PO-20260828-4827");
    fireEvent.click(screen.getByRole("button", { name: "Revise" }));
    expect(screen.getByLabelText("Qty for MAT-K-001")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Deliver To for MAT-K-001"), {
      target: { value: "destination-2" },
    });
    fireEvent.change(screen.getByLabelText("Why"), {
      target: { value: "Send this line to Penang" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save Version 3" }));
    expect(reviseMutate).toHaveBeenCalledWith(
      {
        reason: "Send this line to Penang",
        poDeliveryDate: "2026-09-10",
        lines: [{ lineId: "line-1", qty: 3, destinationId: "destination-2" }],
      },
      expect.any(Object),
    );
  });

  it("shows a closed historical Deliver To but does not offer it for new work", () => {
    queryData.destinations.splice(1, 1);
    queryData.pos[0]!.purchase_order_lines[0]!.destination_id = "destination-2";
    renderPage("/operation/procurement?po=PO-20260828-4827");
    fireEvent.click(screen.getByRole("button", { name: "Revise" }));
    expect(screen.getByRole("option", { name: "Carres Penang (closed)" })).toBeDisabled();
  });

  it("keeps a PO-level destination out of a quantity-only line revision", () => {
    queryData.pos[0]!.purchase_order_lines[0]!.destination_id = null;
    renderPage("/operation/procurement?po=PO-20260828-4827");
    fireEvent.click(screen.getByRole("button", { name: "Revise" }));
    fireEvent.change(screen.getByLabelText("Qty for MAT-K-001"), { target: { value: "4" } });
    fireEvent.change(screen.getByLabelText("Why"), { target: { value: "Customer quantity changed" } });
    fireEvent.click(screen.getByRole("button", { name: "Save Version 3" }));
    expect(reviseMutate).toHaveBeenCalledWith(
      {
        reason: "Customer quantity changed",
        poDeliveryDate: "2026-09-10",
        lines: [{ lineId: "line-1", qty: 4, destinationId: null }],
      },
      expect.any(Object),
    );
  });

  it("explains a failed official PDF download in two lines", async () => {
    vi.mocked(apiFetch).mockRejectedValue(new Error("document read failed"));
    renderPage("/operation/procurement?po=PO-20260828-4827");
    fireEvent.click(screen.getByRole("button", { name: "Download PDF" }));
    expect(await screen.findByText("The official PDF could not be downloaded")).toBeInTheDocument();
    expect(screen.getByText("Use Download PDF again. If it still fails, ask the system owner to check the PO document.")).toBeInTheDocument();
  });
});

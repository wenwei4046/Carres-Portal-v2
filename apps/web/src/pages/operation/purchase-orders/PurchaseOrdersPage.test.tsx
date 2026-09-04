import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const navigate = vi.fn();
const refetch = vi.fn();
const reviseMutate = vi.fn();
const supplierDateMutate = vi.fn();
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
      expected_ready_date: null,
      purpose: "customer_sales",
      version: 2,
      revised_at: "2026-08-28T09:00:00Z",
      placed_at: "2026-08-28T08:00:00Z",
      sources: [
        { kind: "sales_order" as const, reference: "SO-4001" },
        {
          kind: "manual_purchase" as const,
          reference: "Manual Purchase",
          request_id: "request-1",
          purpose: "showroom_display",
          proceed_date: "2026-08-28",
        },
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
            {
              kind: "manual_purchase" as const,
              reference: "Manual Purchase",
              qty: 2,
              request_id: "request-1",
              purpose: "showroom_display",
              proceed_date: "2026-08-28",
            },
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
  DataGrid: ({ rows, columns, onRowDoubleClick, statusSummary }: any) => (
    <div data-testid="register-grid">
      <div>{columns.filter((c: any) => !c.defaultHidden).map((c: any) => c.label).join(" | ")}</div>
      <div data-testid="register-search-index">{rows.flatMap((row: any) => columns.map((column: any) => column.searchValue?.(row) ?? "")).join(" ")}</div>
      {rows.map((row: any) => (
        <div key={row.id} data-testid={`grid-row-${row.id}`} onDoubleClick={() => onRowDoubleClick?.(row)}>
          {columns.filter((c: any) => !c.defaultHidden).map((column: any) => (
            <div key={column.key}>{column.accessor?.(row)}</div>
          ))}
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
  useRecordSupplierDate: () => ({ mutate: supplierDateMutate, isPending: false }),
  useRevisePo: () => ({ mutate: reviseMutate, isPending: false }),
}));

vi.mock("../components/PoIssueEvidence", () => ({
  default: () => <div data-testid="po-issue-evidence">Issue evidence</div>,
  doorsForIssuedPo: () => ({}),
  CHANNEL_WORD: { whatsapp: "WhatsApp", email: "Email", print: "Printed" },
}));

vi.mock("@/lib/api", () => ({ apiFetch: vi.fn().mockResolvedValue({}) }));
vi.mock("@/lib/pdf/render", () => ({ renderPoPdf: vi.fn() }));

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
    const grid = screen.getByTestId("register-grid");
    expect(grid).toHaveTextContent(
      "PO No | PO Issued | Supplier | Source | Deliver To | PO Delivery Date | Supplier Delivery Date | Order Qty | Received Qty | Pending Delivery Qty | PO Version | Sent to Supplier",
    );
    /* The retired words may not come back: ERP jargon (`Open Balance` reads as
       money) and the Work column (a Register lists facts; actions live in
       My Work, Team Work, the PO detail and Order Route). */
    for (const retired of ["Ordered |", "Open Balance", "Current Version", "Supplier Has", "| Work"]) {
      expect(grid).not.toHaveTextContent(retired);
    }
    const rail = within(screen.getByTestId("po-filter-rail"));
    for (const word of [
      "All purchase orders",
      "PDF not sent",
      "Supplier date missing",
      "Supplier date passed",
      "Partly received",
      "Completed",
    ]) expect(rail.getByRole("button", { name: new RegExp(word) })).toBeInTheDocument();
    expect(screen.getByTestId("grid-row-PO-20260828-4827")).toBeInTheDocument();
    expect(screen.getByTestId("grid-row-PO-LEGACY")).toHaveTextContent("Not recorded");
  });

  // Card 07 (owner correction 2026-08-31): business groups, no `Filters`
  // heading, and the version row's deliberate two-line fact/action copy.
  it("groups the rail by business dimension without a generic Filters heading", () => {
    renderPage();
    const railEl = screen.getByTestId("po-filter-rail");
    expect(railEl.textContent).not.toContain("Filters");
    expect(railEl.textContent).not.toContain("—");
    expect(railEl.textContent).not.toContain("supplier update required");
    const headings = ["PURCHASE ORDERS", "DOCUMENT", "DELIVERY DATE", "RECEIVING"];
    for (const heading of headings) expect(within(railEl).getByText(heading)).toBeInTheDocument();
    const order = headings.map((heading) => railEl.textContent!.indexOf(heading));
    expect(order).toEqual([...order].sort((a, b) => a - b));
  });

  it("keeps the version row as one button with a fact line, an action line and one count", () => {
    renderPage();
    const rail = within(screen.getByTestId("po-filter-rail"));
    const row = rail.getByRole("button", { name: /Version changed Send the new version to supplier/ });
    expect(within(row).getByText("Version changed")).toBeInTheDocument();
    expect(within(row).getByText("Send the new version to supplier")).toBeInTheDocument();
    expect(within(row).getByText("1")).toBeInTheDocument();

    fireEvent.click(row);
    expect(screen.getByTestId("grid-row-PO-20260828-4827")).toBeInTheDocument();
    expect(screen.queryByTestId("grid-row-PO-LEGACY")).not.toBeInTheDocument();

    fireEvent.click(row);
    expect(screen.getByTestId("grid-row-PO-LEGACY")).toBeInTheDocument();
  });

  it("filters from any grouped row and restores the full register from All purchase orders", () => {
    renderPage();
    const rail = within(screen.getByTestId("po-filter-rail"));
    fireEvent.click(rail.getByRole("button", { name: /Partly received/ }));
    expect(screen.queryByTestId("grid-row-PO-LEGACY")).not.toBeInTheDocument();

    fireEvent.click(rail.getByRole("button", { name: /All purchase orders/ }));
    expect(screen.getByTestId("grid-row-PO-LEGACY")).toBeInTheDocument();
    expect(screen.getByTestId("grid-row-PO-20260828-4827")).toBeInTheDocument();
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

  it("lists facts only: no action sentence and no owner avatar in any register cell", () => {
    renderPage();
    const row = screen.getByTestId("grid-row-PO-20260828-4827");
    expect(row).not.toHaveTextContent("has not been sent");
    expect(row).not.toHaveTextContent("Issue");
    expect(row.querySelector("[data-owner-id]")).toBeNull();
  });

  it("shows the current official version as PO V{n} and the latest confirmed-sent version beside it", () => {
    renderPage();
    const row = screen.getByTestId("grid-row-PO-20260828-4827");
    /* The official document is V2; only V1 was ever confirmed sent — the
       mismatch is two visibly different values, `PO V2` against `PO V1`,
       with the send evidence (channel · date) on the second line. */
    expect(row).toHaveTextContent("PO V2");
    expect(row).toHaveTextContent("PO V1");
    expect(row).toHaveTextContent("WhatsApp · Thu, 27 Aug");
    expect(row).not.toHaveTextContent("Version 2");
  });

  it("keeps missing send evidence visibly missing instead of fabricating it", () => {
    renderPage();
    /* PO-LEGACY has no confirmed-send record; it reads `Not sent` forever. */
    expect(screen.getByTestId("grid-row-PO-LEGACY")).toHaveTextContent("Not sent");
  });

  it("totals the footer with the approved quantity words", () => {
    renderPage();
    expect(screen.getByTestId("register-grid")).toHaveTextContent(
      "2 purchase orders · Order Qty 3 · Received Qty 1 · Pending Delivery Qty 2",
    );
  });

  it("keeps the work copy in the PO detail, where actions live", () => {
    renderPage("/operation/procurement?po=PO-20260828-4827");
    const work = screen.getByTestId("po-object-work");
    expect(work).toHaveTextContent("PO V2 has not been sent");
    expect(work).toHaveTextContent("Issue PO V2 to Hooka");
    expect(work.querySelector('[data-owner-id="user-duty"]')).toHaveAttribute("data-owner-duty", "PO Duty");
  });

  it("keeps every governed source searchable while the register cell stays compact", () => {
    /* Card 08 §3.5 — the manual source's visible token is the label, never
       an MPR number; the SO keeps its real number. */
    renderPage();
    expect(screen.getByTestId("grid-row-PO-20260828-4827")).toHaveTextContent("SO-4001 +1");
    expect(screen.getByTestId("register-search-index")).toHaveTextContent("Manual Purchase");
    expect(screen.getByTestId("register-search-index")).not.toHaveTextContent("MPR-");
  });

  it("opens an object from the live register without changing the page's Hook order", () => {
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "PO-20260828-4827" }));
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

describe("the supplier delivery date has a door (defect 5)", () => {
  /* The register counted this work in two rail rows and two Work sentences -
     "Ask {supplier} for the delivery date" - and there was nowhere on the live
     surface to record the answer. The only writer was called from a form inside
     the retired legacy tree, below that file's live re-export, so it rendered
     nowhere and made the door look wired. These tests replace the six that used
     to drive that unreachable form. */

  it("offers the block on the Document view and names the supplier", () => {
    renderPage("/operation/procurement?po=PO-20260828-4827");
    const block = screen.getByTestId("po-supplier-date");
    expect(block).toBeInTheDocument();
    expect(block).toHaveTextContent("Supplier delivery date");
  });

  it("a dead button names what is missing, which is this page's own rule", () => {
    renderPage("/operation/procurement?po=PO-20260828-4827");
    const save = screen.getByTestId("po-supplier-date-save");
    expect(save).toBeDisabled();
    expect(save).toHaveTextContent("Record - pick a date");
  });

  it("moving a date already on file posts `delayed` and carries its category", async () => {
    /* This PO holds a supplier promise, so a different date is a DELAY, not a
       first confirmation. Getting that pair wrong records the supplier's real
       date as a promise about our own estimate and then drops it. */
    renderPage("/operation/procurement?po=PO-20260828-4827");
    fireEvent.change(screen.getByTestId("po-supplier-date-input"), {
      target: { value: "2099-12-31" },
    });

    /* A moved promise must say why, and the category is a locked list. */
    const reason = screen.getByTestId("po-supplier-date-reason") as HTMLSelectElement;
    expect(reason.tagName).toBe("SELECT");
    expect(reason.value).toBe("Production Delay");

    const save = screen.getByTestId("po-supplier-date-save");
    expect(save).toBeEnabled();
    expect(save).toHaveTextContent("Record the new date");
    fireEvent.click(save);

    await waitFor(() => expect(supplierDateMutate).toHaveBeenCalled());
    expect(supplierDateMutate.mock.calls[0]![0]).toMatchObject({
      answer: "delayed",
      newDate: "2099-12-31",
      reason: "Production Delay",
    });
  });

  it("the reason is the locked CATEGORY, never free text", () => {
    /* Jess locked the list on 2026-08-02 so the ledger can be counted; the
       story goes in Remarks, never inside the category. */
    renderPage("/operation/procurement?po=PO-20260828-4827");
    expect(screen.getByTestId("po-supplier-date-remarks")).toBeInTheDocument();
  });
});

describe("Purchase Order object", () => {
  it("opens the governed object views and preserves document connections", () => {
    renderPage("/operation/procurement?po=PO-20260828-4827");
    expect(screen.getByRole("heading", { name: /PO-20260828-4827/ })).toBeInTheDocument();
    for (const view of ["Document", "Revisions", "History", "Order Route"]) {
      expect(screen.getByRole("button", { name: view })).toBeInTheDocument();
    }
    /* The unit sits on its own Goods line, keyed by SKU, not in a card of its own. */
    expect(within(screen.getByTestId("po-line-units-line-1")).getByText("U1-000-001")).toBeInTheDocument();
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
    expect(screen.queryByText("No Unit ID")).not.toBeInTheDocument();
  });

  it("states successful empty connections instead of leaving blank panels", () => {
    connectionEmpty = true;
    renderPage("/operation/procurement?po=PO-20260828-4827");
    expect(within(screen.getByTestId("po-line-units-line-1")).getByText("No Unit ID")).toBeInTheDocument();
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

  /* ⭐ THE FACTS AND THE DOCUMENT ARE READ TOGETHER (YH, 2026-09-03).
     The preview used to sit BELOW every block, so checking a goods line against
     what the supplier actually received meant scrolling the two apart. They are
     now two panes that each scroll on their own — the Sales Order's shape —
     and the document is paper, not a framed PDF viewer. */
  it("shows the official document beside the facts as two self-scrolling panes", () => {
    renderPage("/operation/procurement?po=PO-20260828-4827");
    const column = screen.getByTestId("po-document-column");
    expect(within(column).getByLabelText("Official purchase order preview")).toBeInTheDocument();
    expect(within(column).queryByTitle("Official purchase order preview")).toBeNull();
    const panes = column.parentElement!;
    expect(panes.className).toContain("lg:flex-row");
    /* Each pane scrolls on its own, and the page does not. */
    expect(panes.firstElementChild?.className).toContain("lg:overflow-auto");
    expect(column.className).toContain("lg:overflow-auto");
    /* The Goods lines table sets `min-w-[900px]`. Without `min-w-0` the flex
       item sizes to it and the document pane collapses — the one failure this
       layout has, and the reason the class is asserted rather than eyeballed. */
    expect(panes.firstElementChild?.className).toContain("min-w-0");
  });

  it("wears the Sales Order's card heading and keeps the long Unit ID list last (2026-09-04)", () => {
    renderPage("/operation/procurement?po=PO-20260828-4827");
    const facts = screen.getByTestId("po-document-panes").firstElementChild!;
    const heads = within(facts as HTMLElement).getAllByRole("heading", { level: 2 }).map((h) => h.textContent);
    /* Same card as the Sales Order: the mono, tracked heading face. */
    const po = within(facts as HTMLElement).getByRole("heading", { level: 2, name: "Purchase order" });
    expect(po.className).toContain("font-mono");
    /* Receiving, then Claims and returns, each a row of its own. No Unit IDs
       card: a unit is a row of its Goods line. */
    const order = ["Receiving", "Claims and returns"].map((t) => heads.indexOf(t));
    expect(order.every((i) => i >= 0)).toBe(true);
    expect(order).toEqual([...order].sort((a, b) => a - b));
    expect(heads).not.toContain("Unit IDs");
    const cards = screen.getByRole("heading", { level: 2, name: "Receiving" }).closest("section")!.parentElement!;
    expect(cards.className).toContain("flex-col");
    expect(cards.className).not.toContain("sm:grid-cols-2");
  });

  it("uses the 50/50 official-document layout only for issue or revision work", () => {
    renderPage("/operation/procurement?po=PO-20260828-4827");
    expect(screen.queryByTestId("po-document-split")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Issue current PDF" }));
    expect(screen.getByTestId("po-document-split")).toHaveAttribute("data-layout", "50-50");
    expect(screen.getByTestId("po-issue-evidence")).toBeInTheDocument();
    expect(screen.getByLabelText("Official purchase order preview")).toBeInTheDocument();
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
    fireEvent.click(screen.getByRole("button", { name: "Save PO V3" }));
    expect(reviseMutate).toHaveBeenCalledWith(
      {
        reason: "Send this line to Penang",
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
    fireEvent.click(screen.getByRole("button", { name: "Save PO V3" }));
    expect(reviseMutate).toHaveBeenCalledWith(
      {
        reason: "Customer quantity changed",
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

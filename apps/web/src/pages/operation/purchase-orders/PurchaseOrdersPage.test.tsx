import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const navigate = vi.fn();
/* The page's own doors are asserted, not React Router's: `useNavigate` is the
   one thing stubbed so a click can be read as the destination it asks for. */
vi.mock("react-router-dom", async () => ({
  ...(await vi.importActual<typeof import("react-router-dom")>("react-router-dom")),
  useNavigate: () => navigate,
}));
const refetch = vi.fn();
const reviseMutate = vi.fn();
const termsMutate = vi.fn();
const supplierDateMutate = vi.fn();
let auditError = false;
let connectionError = false;
let requiredLoading = false;
let connectionLoading = false;
let connectionEmpty = false;
let receivingReturnReason: string | null = null;
type TestPromise = {
  po_version?: number; channel?: string; recipient?: string; evidence?: string;
  reported_by?: string; reported_at?: string; recorded_by?: string;
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
      official_delivery_date: "2026-09-10",
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
          reference: "Manual Purchase Request",
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
      po_version: 2, channel: "whatsapp", recipient: "Factory", evidence: "PO-20260828-4827/reply.png",
      reported_by: "Supplier staff", reported_at: "2026-09-09T09:00:00Z", recorded_by: "user-duty",
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
          identity_mode: null as "exact_unit" | "quantity" | null,
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
              reference: "Manual Purchase Request",
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
  DataGrid: ({ rows, columns, onRowDoubleClick, statusSummary, fixedGroups, leadingColumns, personalLayouts, activeConditions, expandable }: any) => (
    <div
      data-testid="register-grid"
      data-groups={fixedGroups?.groups.map((g: any) => g.key).join(",")}
      data-group-labels={fixedGroups?.groups.map((g: any) => g.label).join(" | ")}
      data-leading={leadingColumns ? `${leadingColumns.date},${leadingColumns.identity}` : undefined}
      data-personal-layouts={personalLayouts ? "1" : undefined}
    >
      <div data-testid="register-conditions">{(activeConditions ?? []).map((c: any) => c.label).join(" | ")}</div>
      <div data-testid="register-columns">{columns.filter((c: any) => !c.defaultHidden).map((c: any) => c.label).join(" | ")}</div>
      <div data-testid="register-search-index">{rows.flatMap((row: any) => columns.map((column: any) => column.searchValue?.(row) ?? "")).join(" ")}</div>
      {rows.map((row: any) => (
        <div key={row.id} data-testid={`grid-row-${row.id}`} data-group={fixedGroups?.groupOf(row)} onDoubleClick={() => onRowDoubleClick?.(row)}>
          {columns.filter((c: any) => !c.defaultHidden).map((column: any) => (
            <div key={column.key}>{column.accessor?.(row)}</div>
          ))}
          {/* The real engine draws this behind the goods disclosure; the stub
              draws it always, so the expansion's own contract is testable. */}
          {expandable?.renderExpansion?.(row)}
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
  useWorkspaceDuties: () => ({
    data: {
      can_assign: false,
      duties: [{
        key: "po_duty",
        label: "PO Duty",
        resolution: {
          duty_key: "po_duty",
          normal_user_id: "user-duty",
          normal_user_name: "Yee Jean",
          acting_user_id: null,
          acting_user_name: null,
          actor_user_id: "user-duty",
          is_cover: false,
          is_superuser: false,
          allowed: false,
          source: "assignment",
        },
        assignments: [],
        covers: [],
      }],
    },
    isLoading: false,
    isError: false,
    refetch,
  }),
  useOperationPoUnits: () => ({ isLoading: connectionLoading, isError: false, refetch, data: connectionLoading ? undefined : { units: connectionEmpty ? [] : [{ unit_code: "U1-000-001", sku: "MAT-K-001", status: "incoming", po_line_id: "line-1" }, { unit_code: "U1-000-002", sku: "MAT-K-001", status: "incoming", po_line_id: "line-1" }] } }),
  usePoReceiving: () => ({ isLoading: connectionLoading, isError: connectionError, refetch, data: connectionError || connectionLoading ? undefined : { sessions: connectionEmpty ? [] : [{ id: "receipt-1", do_number: "DO-SUP-9", status: "posted", goods_received_at: "2026-08-28", return_reason: receivingReturnReason }], events: [] } }),
  useOperationSupplierClaims: () => ({ isLoading: connectionLoading, isError: connectionError, refetch, data: connectionError || connectionLoading ? undefined : { claims: connectionEmpty ? [] : [{ id: "claim-1", claim_no: "SC-1001", requested_action: "return", status: "open" }], counts: { open: connectionEmpty ? 0 : 1, closed: 0, all: connectionEmpty ? 0 : 1 } } }),
  useOperationPoAudit: () => ({ isError: auditError, refetch, data: auditError ? undefined : { revisions: [{ id: "rev-1", rev_no: 1, reason: "Deliver To changed", created_at: "2026-08-28T09:00:00Z", actor_name: "Yee Jean" }], history: [{ id: "hist-1", text: "Purchase order revised", occurred_at: "2026-08-28T09:00:00Z", actor_name: "Yee Jean", by_role: "operation" }] } }),
  useRecordSend: () => ({ mutate: vi.fn() }),
  useRegisterLayouts: () => ({ data: { layouts: [], limit: 10 }, isLoading: false, isError: false }),
  useSaveRegisterLayout: () => ({ mutateAsync: vi.fn() }),
  useSetDefaultRegisterLayout: () => ({ mutateAsync: vi.fn() }),
  useRecordSupplierDate: () => ({ mutate: supplierDateMutate, isPending: false }),
  useRevisePo: () => ({ mutate: reviseMutate, isPending: false }),
  useSetPoTermsDays: () => ({ mutate: termsMutate, isPending: false }),
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
  supplierDateMutate.mockReset();
  auditError = false;
  connectionError = false;
  requiredLoading = false;
  connectionLoading = false;
  connectionEmpty = false;
  receivingReturnReason = null;
  reviseMutate.mockReset();
  termsMutate.mockReset();
  queryData.destinations.splice(
    0,
    queryData.destinations.length,
    { id: "destination-1", name: "Carres Klang", is_default: true },
    { id: "destination-2", name: "Carres Penang", is_default: false },
  );
  queryData.pos[0]!.purchase_order_lines[0]!.destination_id = "destination-1";
  queryData.pos[0]!.purchase_order_lines[0]!.identity_mode = null;
  queryData.pos[0]!.eta_date = "2026-09-10";
  queryData.pos[0]!.official_delivery_date = "2026-09-10";
  queryData.pos[0]!.sends[0]!.po_version = 1;
  queryData.pos[0]!.version = 2;
  queryData.pos[0]!.promises.splice(0, queryData.pos[0]!.promises.length, {
    po_version: 2, channel: "whatsapp", recipient: "Factory", evidence: "PO-20260828-4827/reply.png",
    reported_by: "Supplier staff", reported_at: "2026-09-09T09:00:00Z", recorded_by: "user-duty",
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

/* ⭐ Purchasing MASTER §9.3 (Jess, 2026-09-17): nine columns, four groups,
   the SUPPLIER REPLY / RECEIVING / SUPPLIER / DELIVER TO rail and a footer
   without quantity totals. */
describe("Purchase Orders Register", () => {
  it("draws exactly the eleven approved columns, date first, and none of the retired ones", () => {
    renderPage();
    const grid = screen.getByTestId("register-grid");
    expect(screen.getByTestId("register-columns")).toHaveTextContent(
      /^PO Doc Date \| PO No \| SO No \/ MPR No \| Supplier \| Items \| Supplier Deliver To \| PO Delivery Date \| Supplier Confirmed Delivery Date \| Goods Received Date \| GRN No \| PO Version$/,
    );
    /* `Expected Delivery Date` is retired BY NAME: what we planned and what
       the factory promised are two facts, and one cell holding whichever it
       had could never be compared, sorted or filtered against the other. */
    for (const retired of ["PO Issued", "Expected Delivery Date", "Order Qty", "Received Qty", "Pending Delivery Qty", "Sent to Supplier", "Source"]) {
      expect(screen.getByTestId("register-columns")).not.toHaveTextContent(retired);
    }
    expect(grid).toHaveAttribute("data-leading", "po_date,po");
    expect(screen.getByTestId("grid-row-PO-20260828-4827")).toHaveTextContent("Fri, 28 Aug");
    expect(screen.getByTestId("grid-row-PO-LEGACY")).toBeInTheDocument();
  });

  it("puts each PO in exactly one governed group, and a cancelled one is never lost", () => {
    renderPage();
    expect(screen.getByTestId("register-grid")).toHaveAttribute("data-groups", "not_marked_as_sent,issued,completed,cancelled");
    expect(screen.getByTestId("register-grid")).toHaveAttribute(
      "data-group-labels",
      "Confirm PO sent to supplier | Waiting for goods from supplier | Completed | Cancelled",
    );
    // The current V2 has no mark (only V1 was marked): Confirm PO sent to supplier.
    expect(screen.getByTestId("grid-row-PO-20260828-4827")).toHaveAttribute("data-group", "not_marked_as_sent");
    expect(screen.getByTestId("grid-row-PO-LEGACY")).toHaveAttribute("data-group", "cancelled");
    queryData.pos[0]!.sends[0]!.po_version = 2;
    const marked = renderPage();
    expect(screen.getAllByTestId("grid-row-PO-20260828-4827").at(-1)).toHaveAttribute("data-group", "issued");
    marked.unmount();
  });

  it("the rail is Supplier reply · Receiving · Supplier · Supplier Deliver To, with complete labels and its four kit icons", () => {
    renderPage();
    const railEl = screen.getByTestId("po-filter-rail");
    const headings = ["Supplier reply", "Receiving", "Supplier", "Supplier Deliver To"];
    for (const heading of headings) expect(within(railEl).getByText(heading)).toBeInTheDocument();
    for (const gone of ["All purchase orders", "PDF not sent", "Version changed", "DOCUMENT STATE", "Completed", "Cancelled", "Clear filters"]) {
      expect(railEl).not.toHaveTextContent(gone);
    }
    const rail = within(railEl);
    /* ⭐ THE COMPLETE SENTENCE, IN THE ROW ITSELF (owner correction
       2026-09-18). The page carries three different dates; a row that says
       only `Date changed` names none of them, and the group heading that was
       meant to qualify it scrolls away. */
    for (const label of [
      "Supplier has not confirmed the PO date",
      "Supplier Confirmed Delivery Date changed",
      "Supplier delivery date passed",
      "Partly received",
    ]) {
      expect(rail.getByRole("button", { name: new RegExp(label) })).toBeInTheDocument();
    }
    for (const shortened of ["Date not confirmed", "Date changed", "Date passed"]) {
      expect(railEl).not.toHaveTextContent(new RegExp(`(^|[^ ])${shortened}`));
    }
    expect(rail.getByRole("combobox", { name: "Supplier" })).toBeInTheDocument();
    expect(rail.getByRole("combobox", { name: "Supplier Deliver To" })).toBeInTheDocument();
    /* Supplier reply → message · Receiving → goods · Supplier → supplier ·
       Supplier Deliver To → warehouse, from the shared kit. */
    expect([...railEl.querySelectorAll("[data-icon]")].map((el) => el.getAttribute("data-icon")))
      .toEqual(expect.arrayContaining(["message", "goods", "supplier", "warehouse"]));
  });

  it("a chosen facet clears by clicking it again, and the rail has no Clear filters control", () => {
    renderPage();
    const rail = within(screen.getByTestId("po-filter-rail"));
    const facet = rail.getByTestId("po-filter-partly_received");
    fireEvent.click(facet);
    expect(screen.getByTestId("po-footer")).toHaveTextContent(/^1 of 2 purchase orders$/);
    fireEvent.click(facet);
    expect(screen.getByTestId("po-footer")).toHaveTextContent(/^2 purchase orders$/);
  });

  it("SUPPLIER REPLY counts only the current version marked as sent with goods pending", () => {
    renderPage();
    // V2 is not marked: it is nobody's supplier chase yet.
    const rail = within(screen.getByTestId("po-filter-rail"));
    expect(within(rail.getByRole("button", { name: /Supplier has not confirmed the PO date/ })).getByText("0")).toBeInTheDocument();
  });

  it("the row's label and its active-condition chip are one sentence, written once", () => {
    renderPage();
    const railEl = screen.getByTestId("po-filter-rail");
    fireEvent.click(within(railEl).getByRole("button", { name: /Supplier delivery date passed/ }));
    expect(screen.getByTestId("register-conditions")).toHaveTextContent(/^Supplier delivery date passed$/);
  });

  it("a rail row or select narrows the list; the footer states n of m, never quantities", () => {
    renderPage();
    expect(screen.getByTestId("po-footer")).toHaveTextContent(/^2 purchase orders$/);
    const rail = within(screen.getByTestId("po-filter-rail"));
    fireEvent.click(rail.getByTestId("po-filter-partly_received"));
    expect(screen.queryByTestId("grid-row-PO-LEGACY")).not.toBeInTheDocument();
    expect(screen.getByTestId("po-footer")).toHaveTextContent(/^1 of 2 purchase orders$/);
    fireEvent.click(rail.getByTestId("po-filter-partly_received"));
    expect(screen.getByTestId("grid-row-PO-LEGACY")).toBeInTheDocument();
    // Both POs deliver to Carres Klang: the facet says so, and choosing it keeps both.
    const deliverTo = rail.getByRole("combobox", { name: "Supplier Deliver To" });
    expect(within(deliverTo).getByRole("option", { name: "Carres Klang · 2" })).toBeInTheDocument();
    fireEvent.change(deliverTo, { target: { value: "Carres Klang" } });
    expect(screen.getByTestId("po-footer")).toHaveTextContent(/^2 purchase orders$/);
    fireEvent.change(rail.getByRole("combobox", { name: "Supplier" }), { target: { value: "Hooka" } });
    fireEvent.click(rail.getByTestId("po-filter-partly_received"));
    expect(screen.getByTestId("po-footer")).toHaveTextContent(/^1 of 2 purchase orders$/);
    expect(screen.getByTestId("register-grid")).not.toHaveTextContent("Order Qty");
  });

  it("⭐ three dates, three columns — and one is NEVER filled in from another", () => {
    renderPage();
    const row = screen.getByTestId("grid-row-PO-20260828-4827");
    /* What WE planned, preserved whatever the supplier later answers. */
    expect(row).toHaveTextContent("Thu, 10 Sep");
    /* What the FACTORY confirmed, for the current version. */
    expect(screen.getByTestId("po-supplier-date-PO-20260828-4827")).toHaveTextContent("Thu, 10 Sep");
    /* No answer is an absence, never the PO default wearing the supplier's
       name — that substitution is the reason these are two columns. */
    expect(screen.getByTestId("po-supplier-date-PO-LEGACY")).toHaveTextContent("Not confirmed");
    expect(screen.getByTestId("po-supplier-date-PO-LEGACY")).not.toHaveTextContent("Sep");

    queryData.pos[0]!.promises.push({
      po_version: 2, channel: "whatsapp", recipient: "Factory", evidence: "PO-20260828-4827/reply.png",
      reported_by: "Supplier staff", reported_at: "2026-09-09T09:00:00Z", recorded_by: "user-duty",
      kind: "tomorrow_delivery",
      answer: "delayed",
      about_date: "2026-09-10",
      previous_date: "2026-09-10",
      new_date: "2026-09-14",
      reason: "Production Delay",
      recorded_at: "2026-09-09T10:00:00Z",
    });
    const changed = renderPage();
    const moved = screen.getAllByTestId("grid-row-PO-20260828-4827").at(-1)!;
    expect(screen.getAllByTestId("po-supplier-date-PO-20260828-4827").at(-1))
      .toHaveTextContent("Mon, 14 SepSupplier changed from Thu, 10 Sep");
    /* The original stays exactly where it was. A supplier moving a date does
       not rewrite what Carres planned. */
    expect(moved).toHaveTextContent("Thu, 10 Sep");
    changed.unmount();
  });

  it("Goods Received Date and GRN No: one receipt each, several a count link into every receipt", () => {
    const po = queryData.pos[0]! as typeof queryData.pos[0] & { grns?: unknown };
    po.grns = [{ id: "r1", grn_no: "GRN-20260910-1001", goods_received_at: "2026-09-09", received_qty: 2 }];
    const one = renderPage();
    const oneRow = screen.getAllByTestId("grid-row-PO-20260828-4827").at(-1)!;
    /* The receipt record carries a date and no clock (0314): the time is
       stated as missing, never guessed from when the paperwork was filed. */
    expect(within(oneRow).getByTestId("po-received-PO-20260828-4827")).toHaveTextContent("Wed, 9 SepTime not recorded");
    expect(within(oneRow).getByRole("button", { name: "GRN-20260910-1001" })).toBeInTheDocument();
    one.unmount();

    po.grns = [
      { id: "r1", grn_no: "GRN-20260910-1001", goods_received_at: "2026-09-09", received_qty: 2 },
      { id: "r2", grn_no: "GRN-20260912-1002", goods_received_at: "2026-09-12", received_qty: 1 },
    ];
    const many = renderPage();
    const manyRow = screen.getAllByTestId("grid-row-PO-20260828-4827").at(-1)!;
    /* ⭐ NEVER ONE DATE FOR TWO TRUCKS. */
    fireEvent.click(within(manyRow).getByRole("button", { name: "2 receipt dates" }));
    const dialog = screen.getByTestId("po-receipts-dialog");
    expect(within(dialog).getByTestId("po-receipt-GRN-20260910-1001")).toHaveTextContent("Wed, 9 Sep");
    expect(within(dialog).getByTestId("po-receipt-GRN-20260910-1001")).toHaveTextContent("2");
    expect(within(dialog).getByTestId("po-receipt-GRN-20260912-1002")).toHaveTextContent("Sat, 12 Sep");
    expect(within(dialog).getByTestId("po-receipt-GRN-20260912-1002")).toHaveTextContent("1");
    /* Each row keeps the door to the actual receipt. */
    fireEvent.click(within(dialog).getByRole("button", { name: "GRN-20260912-1002" }));
    expect(navigate).toHaveBeenCalledWith("/operation?tab=receiving&session=r2");
    many.unmount();
    delete po.grns;
  });

  it("PO Version reads the CURRENT version and its sent mark only", () => {
    renderPage();
    expect(screen.getByTestId("po-version-PO-20260828-4827")).toHaveTextContent("PO V2Sending not confirmed");
    expect(screen.getByTestId("po-version-PO-20260828-4827")).not.toHaveTextContent("PO V1");
    queryData.pos[0]!.sends[0]!.po_version = 2;
    const marked = renderPage();
    expect(screen.getAllByTestId("po-version-PO-20260828-4827").at(-1)).toHaveTextContent("PO V2PO sent to supplier · WhatsApp · Thu, 27 Aug");
    marked.unmount();
  });

  it("SO No / MPR No names the REAL documents behind the PO, each one reachable", () => {
    const po = queryData.pos[0]! as typeof queryData.pos[0] & { grns?: unknown };
    const sources = po.sources;

    /* One Sales Order: its own number, its own door. */
    po.sources = [{ kind: "sales_order", reference: "SO-4001", order_id: "order-1" }] as typeof sources;
    const single = renderPage();
    const singleRow = screen.getAllByTestId("grid-row-PO-20260828-4827").at(-1)!;
    expect(within(singleRow).getByRole("button", { name: "SO-4001" })).toBeInTheDocument();
    expect(singleRow).toHaveTextContent("Cody · King");
    fireEvent.click(within(singleRow).getByRole("button", { name: "SO-4001" }));
    expect(navigate).toHaveBeenCalledWith("/operation/orders/so/order-1");
    single.unmount();

    /* ⭐ MPR IS THE MANUAL PURCHASE'S VISIBLE IDENTITY AGAIN (owner ruling
       2026-09-18). The number comes from the request; it is never minted here
       and a UUID never stands in for it. */
    po.sources = [{ kind: "manual_purchase", reference: "MPR-20260828-0533", req_no: "MPR-20260828-0533", request_id: "request-1" }] as typeof sources;
    const mpr = renderPage();
    const mprRow = screen.getAllByTestId("grid-row-PO-20260828-4827").at(-1)!;
    expect(within(mprRow).getByRole("button", { name: "MPR-20260828-0533" })).toBeInTheDocument();
    expect(mprRow).not.toHaveTextContent("request-1");
    mpr.unmount();

    /* A request with no stored number keeps the governed label — and, having
       nothing to open, is a fact rather than a dead control. */
    po.sources = [{ kind: "manual_purchase", reference: "Manual Purchase Request", req_no: null, request_id: null }] as typeof sources;
    const unnumbered = renderPage();
    const unnumberedRow = screen.getAllByTestId("grid-row-PO-20260828-4827").at(-1)!;
    expect(unnumberedRow).toHaveTextContent("Manual Purchase Request");
    expect(within(unnumberedRow).queryByRole("button", { name: "Manual Purchase Request" })).toBeNull();
    unnumbered.unmount();

    /* Several: the approved count, and the PO's Order Route, where each one is
       a row — the listing never picks one to stand for the rest. */
    po.sources = [
      { kind: "sales_order", reference: "SO-4001", order_id: "order-1" },
      { kind: "sales_order", reference: "SO-4002", order_id: "order-2" },
    ] as typeof sources;
    const many = renderPage();
    const manyRow = screen.getAllByTestId("grid-row-PO-20260828-4827").at(-1)!;
    expect(manyRow).toHaveTextContent("2 SOs");
    expect(screen.getByTestId("register-search-index")).toHaveTextContent("SO-4002");
    many.unmount();

    po.sources = sources;
    delete po.grns;
  });

  it("the goods expansion reads Category · Supplier · Supplier Deliver To · PO No / Unit ID · Qty · Items · Supplier Confirmed Delivery Date, read-only", () => {
    renderPage();
    const goods = screen.getByTestId("po-goods-PO-20260828-4827");
    const heads = [...goods.querySelectorAll("th")].map((th) => th.textContent);
    /* The seventh column — owner-approved 2026-09-25 (Purchasing §9.3): the
       line's NEWEST supplier answer, read-only; the only write door is
       `Record supplier answer` on the PO. */
    expect(heads).toEqual(["Category", "Supplier", "Supplier Deliver To", "PO No / Unit ID", "Qty", "Items", "Supplier Confirmed Delivery Date"]);
    /* No answer yet reads the dictionary's word for THIS column. */
    expect(goods).toHaveTextContent("Not confirmed");
    /* A TRUTH table: nothing here can commit a unit or buy anything. */
    expect(goods.querySelectorAll('input[type="checkbox"]')).toHaveLength(0);
    expect(goods).not.toHaveTextContent("Ready Stock");
    expect(goods).not.toHaveTextContent("To buy");
  });

  it("the PO No / Unit ID cell carries the document, then its REAL line-bound Unit IDs", () => {
    renderPage();
    const goods = screen.getByTestId("po-goods-PO-20260828-4827");
    expect(goods).toHaveTextContent("PO-20260828-4827");
    /* Minted at official PO issue, bound to this line (§6.2, 0442–0444) —
       never generated for a screen and never copied from a sample. */
    expect(goods).toHaveTextContent("U1-000-001");
    expect(goods).toHaveTextContent("U1-000-002");
  });

  it("a quantity line has no Unit IDs by law; an exact-unit line with none is an integrity failure", () => {
    const line = queryData.pos[0]!.purchase_order_lines[0]!;
    connectionEmpty = true;

    line.identity_mode = "quantity";
    const counted = renderPage();
    expect(screen.getAllByTestId("po-goods-PO-20260828-4827").at(-1)).toHaveTextContent("—");
    expect(screen.getAllByTestId("po-goods-PO-20260828-4827").at(-1)).not.toHaveTextContent("do not send this PO");
    counted.unmount();

    line.identity_mode = "exact_unit";
    const missing = renderPage();
    expect(screen.getAllByTestId("po-goods-PO-20260828-4827").at(-1))
      .toHaveTextContent("Unit IDs missing on this line — do not send this PO");
    missing.unmount();

    /* A read that has not answered is not the same fact as a Unit that is
       missing, and it may never be printed as one. */
    connectionLoading = true;
    const reading = renderPage();
    expect(screen.getAllByTestId("po-goods-PO-20260828-4827").at(-1)).toHaveTextContent("Reading Unit IDs…");
    expect(screen.getAllByTestId("po-goods-PO-20260828-4827").at(-1)).not.toHaveTextContent("do not send this PO");
    reading.unmount();

    connectionLoading = false;
    connectionEmpty = false;
    line.identity_mode = null;
  });

  it("offers the personal saved layouts on this listing", () => {
    renderPage();
    expect(screen.getByTestId("register-grid")).toHaveAttribute("data-personal-layouts", "1");
  });

  it("lists facts only: no action sentence and no owner avatar in any register cell", () => {
    renderPage();
    const row = screen.getByTestId("grid-row-PO-20260828-4827");
    expect(row).not.toHaveTextContent("has not been sent");
    expect(row).not.toHaveTextContent("Issue");
    expect(row.querySelector("[data-owner-id]")).toBeNull();
  });

  it("keeps the work copy in the PO detail, where actions live", () => {
    renderPage("/operation/procurement?po=PO-20260828-4827");
    const work = screen.getByTestId("po-object-work");
    expect(work).toHaveTextContent("PO V2 has not been sent");
    expect(work).toHaveTextContent("Issue PO V2 to Hooka");
    expect(work.querySelector('[data-owner-id="user-duty"]')).toHaveAttribute("data-owner-duty", "PO Duty");
  });

  it("saves the PO's payment terms, and blank clears them (0530)", () => {
    renderPage("/operation/procurement?po=PO-20260828-4827");
    const field = screen.getByLabelText("Terms (days)");
    const save = screen.getByTestId("po-terms-save");
    expect(save).toBeDisabled();
    fireEvent.change(field, { target: { value: "-1" } });
    expect(save).toBeDisabled();
    fireEvent.change(field, { target: { value: "45" } });
    fireEvent.click(save);
    expect(termsMutate).toHaveBeenCalledWith(45, expect.anything());
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

vi.mock("@/components/ClaimPhotoUploadField", () => ({
  default: ({ onChange }: { onChange: (paths: string[]) => void }) =>
    <button onClick={() => onChange(["PO-20260828-4827/reply.png"])}>Upload reply evidence</button>,
}));

describe("the evidenced supplier reply door", () => {
  function sent() { queryData.pos[0]!.sends[0]!.po_version = 2; }
  function evidence() {
    fireEvent.change(screen.getByLabelText("Recipient"), { target: { value: "Factory group" } });
    fireEvent.change(screen.getByLabelText("Reported by"), { target: { value: "Factory staff" } });
    fireEvent.change(screen.getByLabelText("Reported at"), { target: { value: "2026-08-28T10:00" } });
    fireEvent.click(screen.getByText("Upload reply evidence"));
  }
  it("never offers RECORDING before this version was sent — history stays readable", () => {
    /* 0430 — the record form still needs the current version's confirmed
       send; but a recorded reply may never disappear behind a revision, so
       the block itself renders as read-only history. */
    renderPage("/operation/procurement?po=PO-20260828-4827");
    expect(screen.queryByTestId("po-supplier-date-input")).not.toBeInTheDocument();
    expect(screen.queryByTestId("po-supplier-date-save")).not.toBeInTheDocument();
    expect(screen.getByTestId("po-supplier-reply-history")).toBeInTheDocument();
  });
  it("asks WHY only for a later date, pre-selects nothing, and sends one date for the server to classify", () => {
    /* 0430 — the browser used to submit `answer: "delayed"` with a
       pre-selected "Production Delay" the operator never chose. Now a later
       date blocks the save until a reason is CHOSEN, and the wire carries the
       date alone — classification is the server's. */
    sent(); queryData.pos[0]!.promises = [];
    renderPage("/operation/procurement?po=PO-20260828-4827");
    /* The input is LABELLED with whose date it is, not a bare "Date". */
    expect(screen.getByTestId("po-supplier-date-input").closest("label")).toHaveTextContent("Supplier Confirmed Delivery Date");
    fireEvent.change(screen.getByTestId("po-supplier-date-input"), { target: { value: "2026-09-15" } });
    expect(screen.getByTestId("po-supplier-date-compare")).toHaveTextContent("Later than the PO date");
    evidence();
    /* Evidence complete, reason NOT chosen — the save must stay closed. */
    expect(screen.getByTestId("po-supplier-date-reason")).toHaveValue("");
    expect(screen.getByTestId("po-supplier-date-save")).toBeDisabled();
    /* 0585 · the eight governed reasons (owner ruling 2026-09-24). */
    fireEvent.change(screen.getByTestId("po-supplier-date-reason"), { target: { value: "Material unavailable" } });
    fireEvent.click(screen.getByTestId("po-supplier-date-save"));
    expect(supplierDateMutate.mock.calls[0]![0]).toMatchObject({
      poVersion: 2, supplierDate: "2026-09-15", reason: "Material unavailable",
      channel: "whatsapp", recipient: "Factory group", evidence: "PO-20260828-4827/reply.png",
      reportedBy: "Factory staff",
    });
    expect(supplierDateMutate.mock.calls[0]![0]).not.toHaveProperty("answer");
  });
  it("records an EARLIER date without any delay reason", () => {
    /* An earlier date is not a delay: the reason question never appears and
       nothing reason-shaped reaches the wire. */
    sent(); queryData.pos[0]!.promises = [];
    renderPage("/operation/procurement?po=PO-20260828-4827");
    fireEvent.change(screen.getByTestId("po-supplier-date-input"), { target: { value: "2026-09-05" } });
    expect(screen.getByTestId("po-supplier-date-compare")).toHaveTextContent("Earlier than the PO date");
    expect(screen.queryByTestId("po-supplier-date-reason")).not.toBeInTheDocument();
    evidence();
    fireEvent.click(screen.getByTestId("po-supplier-date-save"));
    expect(supplierDateMutate.mock.calls[0]![0]).toMatchObject({ poVersion: 2, supplierDate: "2026-09-05" });
    expect(supplierDateMutate.mock.calls[0]![0]).not.toHaveProperty("reason");
  });
  it("discards an unfinished reply when the official version changes", () => {
    sent(); queryData.pos[0]!.promises = [];
    const view = renderPage("/operation/procurement?po=PO-20260828-4827");
    fireEvent.change(screen.getByTestId("po-supplier-date-input"), { target: { value: "2026-09-15" } });
    evidence();
    queryData.pos[0]!.version = 3;
    queryData.pos[0]!.sends[0]!.po_version = 3;
    view.rerender(<MemoryRouter initialEntries={["/operation/procurement?po=PO-20260828-4827"]}><PurchaseOrdersPage /></MemoryRouter>);
    expect(screen.getByTestId("po-supplier-date-input")).toHaveValue("");
    expect(screen.getByTestId("po-supplier-date-save")).toBeDisabled();
  });
  it("can confirm the original PO date without changing it", () => {
    sent(); queryData.pos[0]!.promises = [];
    renderPage("/operation/procurement?po=PO-20260828-4827");
    fireEvent.change(screen.getByTestId("po-supplier-date-input"), { target: { value: "2026-09-10" } });
    expect(screen.getByTestId("po-supplier-date-compare")).toHaveTextContent("Same as PO");
    evidence(); fireEvent.click(screen.getByTestId("po-supplier-date-save"));
    expect(supplierDateMutate.mock.calls[0]![0]).toMatchObject({ supplierDate: "2026-09-10", poVersion: 2 });
  });
  it("shows a reply recorded without evidence instead of claiming a proven absence", () => {
    /* 0430 — a pre-evidence reply linked to this version is a recorded fact.
       It never qualifies as the governed Supplier Confirmed Delivery Date, but the block
       must say what exists rather than 'the supplier has said nothing'. */
    sent();
    queryData.pos[0]!.promises = [{
      kind: "tomorrow_delivery", answer: "shipping", about_date: "2026-09-10",
      previous_date: null, new_date: null, reason: null, po_version: 2,
      channel: null, recipient: null, evidence: null, reported_by: null,
      reported_at: null, recorded_by: null, recorded_at: "2026-08-27T08:00:00Z",
    } as never];
    renderPage("/operation/procurement?po=PO-20260828-4827");
    const block = screen.getByTestId("po-supplier-date");
    expect(block).toHaveTextContent("Supplier reply recorded without evidence");
    expect(screen.getByTestId("po-supplier-reply-history")).toHaveTextContent("PO V2");
    expect(screen.getByTestId("po-supplier-reply-history")).toHaveTextContent("Confirms the PO date");
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

  /* ⭐ UNIT ID BORN WITH OFFICIAL PO (owner ruling 2026-09-07, Card 10). */
  it("heads the goods-line column `Unit ID` and lists the line's own IDs, without a database status word", () => {
    renderPage("/operation/procurement?po=PO-20260828-4827");
    expect(screen.getByText("Unit ID")).toBeInTheDocument();
    expect(screen.queryByText("Unit IDs")).not.toBeInTheDocument();
    expect(screen.queryByText("Item ID")).not.toBeInTheDocument();
    const cell = within(screen.getByTestId("po-line-units-line-1"));
    expect(cell.getByText("U1-000-001")).toBeInTheDocument();
    expect(cell.queryByText("incoming")).not.toBeInTheDocument();
  });

  it("prints `—` for a quantity-scoped line — intentional, never `Not allocated`", () => {
    queryData.pos[0]!.purchase_order_lines[0]!.identity_mode = "quantity";
    connectionEmpty = true;
    renderPage("/operation/procurement?po=PO-20260828-4827");
    const cell = within(screen.getByTestId("po-line-units-line-1"));
    expect(cell.getByText("—")).toBeInTheDocument();
    expect(cell.queryByText("Not allocated")).not.toBeInTheDocument();
    expect(cell.queryByText("No Unit ID")).not.toBeInTheDocument();
    expect(cell.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("names an exact-unit line with no Unit IDs as an integrity failure, not an empty state", () => {
    queryData.pos[0]!.purchase_order_lines[0]!.identity_mode = "exact_unit";
    connectionEmpty = true;
    renderPage("/operation/procurement?po=PO-20260828-4827");
    const cell = within(screen.getByTestId("po-line-units-line-1"));
    expect(cell.getByRole("alert")).toHaveTextContent("Unit IDs missing on this line — do not send this PO");
    expect(cell.queryByText("No Unit ID")).not.toBeInTheDocument();
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

  it("shows the print-data refusal and corrective action instead of a generic PDF error", async () => {
    vi.mocked(apiFetch).mockRejectedValue({
      body: { code: "destination_address_missing", message: "No address on file for this PO's destination" },
    });
    try {
      renderPage("/operation/procurement?po=PO-20260828-4827");
      expect(await screen.findByText("No address on file for this PO's destination")).toBeInTheDocument();
      expect(screen.getByText(/Ask Purchasing to add the address/)).toBeInTheDocument();
      expect(screen.queryByText("The official PDF could not be opened")).toBeNull();
    } finally {
      vi.mocked(apiFetch).mockResolvedValue({});
    }
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

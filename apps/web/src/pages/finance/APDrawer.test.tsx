import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { Toaster } from "sonner";
import APDrawer, { billForPo } from "./APDrawer";
import type { FinanceApAgingRow } from "@/lib/queries";
import type { SupplierBillRegisterRow } from "@carres/shared/schemas/finance-ap";

vi.mock("@/lib/api", () => ({
  apiFetch: vi.fn(),
  ApiError: class ApiError extends Error {
    status: number;
    body: unknown;
    constructor(status: number, message: string, body: unknown) {
      super(message);
      this.status = status;
      this.body = body;
      this.name = "ApiError";
    }
  },
}));
import { apiFetch } from "@/lib/api";

function wrap(ui: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <MemoryRouter>
      <QueryClientProvider client={qc}>
        {ui}
        <Toaster />
      </QueryClientProvider>
    </MemoryRouter>
  );
}

const SUPPLIER_ID = "11111111-1111-4111-8111-111111111111";

const BASE: FinanceApAgingRow = {
  po_id:               "PO-2050",
  so:                  1240,
  supplier_id:         SUPPLIER_ID,
  supplier_name:       "Acme Bedworks",
  warehouse_id:        "w1",
  placed_at:           "2026-04-29T00:00:00Z",
  expected_ready_date: "2026-05-10",
  eta_date:            "2026-05-12",
  pickup_date:         null,
  status:              "received",
  sup_status:          "delivered",
  pay_status:          "unpaid",
  pay_status_ui:       "matched",
  qty:                 10,
  total:               12500,
  do_number:           "DO-44128",
  has_do:              true,
  due_in:              4,
  lines: [
    { sku: "SKU-A", sku_name: "Bed Frame · Queen", qty: 10, received_qty: 10, unit_cost: 1250, line_total: 12500 },
  ],
  history: [
    { text: "PO created", occurred_at: "2026-04-29T08:00:00Z", by_role: "operation" },
  ],
};

function bill(over: Partial<SupplierBillRegisterRow>): SupplierBillRegisterRow {
  return {
    id: "22222222-2222-4222-8222-222222222222",
    bill_no: "BILL-7Q2K",
    status: "confirmed",
    supplier_id: SUPPLIER_ID,
    supplier_name: "Acme Bedworks",
    supplier_kind: "supplier",
    supplier_invoice_no: "INV-ACME-88",
    bill_date: "2026-09-10",
    due_date: null,
    po_id: "PO-2050",
    grn_nos: "GRN-1",
    ap_account_code: "2110",
    total_amount: 12500,
    paid_total: 0,
    unpaid: 12500,
    price_flags: 0,
    file_count: 0,
    created_at: "2026-09-10T00:00:00Z",
    ...over,
  };
}

describe("APDrawer", () => {
  beforeEach(() => vi.mocked(apiFetch).mockReset());

  it("renders the 3-way match card with the DO number", async () => {
    vi.mocked(apiFetch).mockResolvedValue({ rows: [] });
    render(wrap(<APDrawer row={BASE} onClose={() => {}} />));

    expect(screen.getByText("Three-way match")).toBeInTheDocument();
    expect(screen.getByText("Purchase Order")).toBeInTheDocument();
    expect(screen.getByText("Delivery Order")).toBeInTheDocument();
    expect(screen.getByText("Supplier Invoice")).toBeInTheDocument();
    expect(screen.getByText("DO-44128")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText("No bill entered")).toBeInTheDocument());
  });

  it("no longer pays: the schedule and pay buttons are gone", async () => {
    vi.mocked(apiFetch).mockResolvedValue({ rows: [] });
    render(wrap(<APDrawer row={BASE} onClose={() => {}} />));

    expect(screen.queryByRole("button", { name: "Schedule payment" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Mark as paid" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Release payment" })).not.toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: "Amount" })).not.toBeInTheDocument();
    // …and never calls the retired routes.
    await waitFor(() => expect(apiFetch).toHaveBeenCalled());
    for (const call of vi.mocked(apiFetch).mock.calls) {
      expect(String(call[0])).not.toMatch(/po-pay|po-schedule/);
    }
  });

  it("with no bill, offers Convert GRN to bill and a New Payment Voucher for the supplier", async () => {
    vi.mocked(apiFetch).mockResolvedValue({ rows: [] });
    render(wrap(<APDrawer row={BASE} onClose={() => {}} />));

    const convert = await screen.findByRole("link", { name: "Convert GRN to bill" });
    expect(convert.getAttribute("href")).toBe(`/finance/bills/new?po=PO-2050&supplier=${SUPPLIER_ID}`);
    const pv = screen.getByRole("link", { name: "New Payment Voucher" });
    expect(pv.getAttribute("href")).toBe(`/finance/payment-vouchers/new?supplier=${SUPPLIER_ID}`);
  });

  it("shows the real confirmed bill and links to it — never a made-up SI number", async () => {
    vi.mocked(apiFetch).mockResolvedValue({ rows: [bill({})] });
    render(wrap(<APDrawer row={BASE} onClose={() => {}} />));

    await waitFor(() => expect(screen.getByText("BILL-7Q2K")).toBeInTheDocument());
    expect(screen.queryByText(/^SI-/)).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open bill" }).getAttribute("href"))
      .toBe("/finance/bills/22222222-2222-4222-8222-222222222222");
    expect(screen.getByRole("link", { name: "New Payment Voucher" }).getAttribute("href"))
      .toBe(`/finance/payment-vouchers/new?supplier=${SUPPLIER_ID}&bill=22222222-2222-4222-8222-222222222222`);
  });
});

describe("billForPo", () => {
  it("prefers a confirmed bill, ignores cancelled ones and rows that are not bills", () => {
    const draft = bill({ id: "d", status: "draft", bill_no: null });
    const cancelled = bill({ id: "c", status: "cancelled" });
    const confirmed = bill({ id: "k" });
    expect(billForPo([draft, cancelled, confirmed], "PO-2050")?.id).toBe("k");
    expect(billForPo([draft, cancelled], "PO-2050")?.id).toBe("d");
    expect(billForPo([cancelled], "PO-2050")).toBeNull();
    expect(billForPo([confirmed], "PO-9999")).toBeNull();
    expect(billForPo(undefined, "PO-2050")).toBeNull();
    // An aging row that lands here by mistake is not a bill.
    expect(billForPo([{ po_id: "PO-2050", status: "received" } as unknown as SupplierBillRegisterRow], "PO-2050")).toBeNull();
  });
});

import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { InvoiceRegisterRow } from "@carres/shared/payment-invoice-register";
import type { PaymentTemplateRow } from "@carres/shared/payment-templates";
import InvoiceSendReceipt from "./InvoiceSendReceipt";

const state = vi.hoisted(() => ({
  fetch: vi.fn(async () => ({})),
  upload: vi.fn(async () => ({ error: null })),
}));
vi.mock("@/lib/api", () => ({ apiFetch: state.fetch }));
vi.mock("@/lib/queries", () => ({
  qk: { finance: { invoiceRegister: () => ["finance", "invoice-register"] } },
}));
vi.mock("@/lib/supabase", () => ({
  supabase: { storage: { from: () => ({ upload: state.upload }) } },
}));

const TEMPLATE: PaymentTemplateRow = {
  id: "v1", template_key: "k9", purpose: "payment_received",
  name: "Thank you", body: "Hi {customer}, received RM {amount}. Receipt {receipt_no}. Still needed: RM {still_needed}.",
  version: 1, active: true, is_default: true, is_head: true,
  created_at: "2026-09-06T02:00:00Z",
};

const INVOICE: InvoiceRegisterRow = {
  id: "i1", invoice_no: "INV-060926-0001", status: "issued", kind: "sales",
  amount: 1000, tax_amount: 0, issued_at: "2026-09-06", voided_at: null,
  void_reason: null, replaces_invoice_id: null, created_at: "2026-09-06T00:00:00Z",
  order_id: "o1",
  orders: {
    id: "o1", so: 1300, customer_name: "LIM KUAN YANG", customer_phone: "0123456789",
    source_ref: ["CR12345"], status: "proceed_order", paid: 1000,
    delivery_date: null, delivery_date_tbd: false, delivered_at: null,
    order_lines: [{ sku: "MS01-K", qty: 1, unit_price: 1000 }], order_addons: [],
    ops_order_control: [{ balance: null, confirmed_date: null, line_etas: null, line_stock_status: null }],
  },
};

function show() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <InvoiceSendReceipt invoice={INVOICE} templates={[TEMPLATE]}
        receiptNo="RC-060926-0042" amount={600} stillNeeded={0} onClose={vi.fn()} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  state.fetch.mockClear();
  state.upload.mockClear();
  Object.assign(navigator, { clipboard: { writeText: vi.fn(async () => {}) } });
});

describe("Send receipt (§16)", () => {
  it("renders the manager's template with the receipt facts — RM0 stays honest", () => {
    show();
    const preview = screen.getByTestId("receipt-message-preview");
    expect(preview).toHaveTextContent("received RM 600");
    expect(preview).toHaveTextContent("Receipt RC-060926-0042");
    expect(preview).toHaveTextContent("Still needed: RM 0");
  });
  it("records only with the sent screenshot, into the ledger as a receipt", async () => {
    show();
    expect(screen.getByRole("button", { name: "Record message sent" })).toBeDisabled();
    const file = new File(["shot"], "sent.png", { type: "image/png" });
    fireEvent.change(screen.getByLabelText("Sent screenshot"), { target: { files: [file] } });
    fireEvent.click(screen.getByRole("button", { name: "Record message sent" }));
    await waitFor(() => expect(state.fetch).toHaveBeenCalledTimes(1));
    const [url, init] = state.fetch.mock.calls[0] as unknown as [string, { body: string }];
    expect(url).toBe("/api/finance/invoices/i1/record-message");
    const body = JSON.parse(init.body);
    expect(body.kind).toBe("receipt");
    expect(body.templateKey).toBe("payment_received:k9:v1");
    expect(body.messageText).toContain("RC-060926-0042");
  });
});

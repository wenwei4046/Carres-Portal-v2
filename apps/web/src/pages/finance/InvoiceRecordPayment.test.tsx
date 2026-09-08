import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { InvoiceRegisterRow } from "@carres/shared/payment-invoice-register";
import InvoiceRecordPayment from "./InvoiceRecordPayment";

const state = vi.hoisted(() => ({
  mutate: vi.fn(),
  upload: vi.fn(async () => ({ error: null })),
}));
vi.mock("@/lib/queries", () => ({
  qk: { finance: {
    invoiceRegister: () => ["finance", "invoice-register"],
    paymentRegister: () => ["finance", "payment-register"],
  } },
  useRecordPayment: () => ({ mutate: state.mutate, isPending: false }),
}));
vi.mock("@/lib/supabase", () => ({
  supabase: { storage: { from: () => ({ upload: state.upload }) } },
}));

const INVOICE: InvoiceRegisterRow = {
  id: "i1", invoice_no: "INV-060926-0001", status: "issued", kind: "sales",
  amount: 1000, tax_amount: 0, issued_at: "2026-09-06", voided_at: null,
  void_reason: null, replaces_invoice_id: null, created_at: "2026-09-06T00:00:00Z",
  order_id: "o1",
  orders: {
    id: "o1", so: 1300, customer_name: "LIM KUAN YANG", status: "proceed_order",
    paid: 400, delivery_date: "2026-09-18", delivery_date_tbd: false, delivered_at: null,
    order_lines: [{ qty: 1, unit_price: 1000 }], order_addons: [],
    ops_order_control: [{ balance: null, confirmed_date: null, line_etas: null, line_stock_status: null }],
  },
};

function show() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <InvoiceRecordPayment invoice={INVOICE} rows={[INVOICE]} onClose={vi.fn()} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  state.mutate.mockReset();
  state.upload.mockClear();
});

describe("Record payment (§16)", () => {
  it("pre-fills the outstanding amount and blocks Review until evidence is attached", () => {
    show();
    expect(screen.getByLabelText("Payment amount")).toHaveValue(600);
    expect(screen.getByRole("button", { name: "Review payment" })).toBeDisabled();
    const file = new File(["slip"], "slip.jpg", { type: "image/jpeg" });
    fireEvent.change(screen.getByLabelText("Transfer slip"), { target: { files: [file] } });
    expect(screen.getByRole("button", { name: "Review payment" })).toBeEnabled();
  });
  it("review states the two governed sentences before any money moves", () => {
    show();
    const file = new File(["slip"], "slip.jpg", { type: "image/jpeg" });
    fireEvent.change(screen.getByLabelText("Transfer slip"), { target: { files: [file] } });
    fireEvent.click(screen.getByRole("button", { name: "Review payment" }));
    expect(screen.getByText("This records customer money.")).toBeInTheDocument();
    expect(screen.getByText("This does not confirm the bank account.")).toBeInTheDocument();
    expect(state.mutate).not.toHaveBeenCalled();
  });
  it("posts once through the canonical door with the evidence and one idempotency key", async () => {
    show();
    const file = new File(["slip"], "slip.jpg", { type: "image/jpeg" });
    fireEvent.change(screen.getByLabelText("Transfer slip"), { target: { files: [file] } });
    fireEvent.click(screen.getByRole("button", { name: "Review payment" }));
    fireEvent.click(screen.getByRole("button", { name: "Record payment" }));
    await waitFor(() => expect(state.mutate).toHaveBeenCalledTimes(1));
    expect(state.upload).toHaveBeenCalled();
    const input = state.mutate.mock.calls[0][0];
    expect(input).toMatchObject({ amount: 600, method: "bank", kind: "payment" });
    expect(input.receiptUrl).toMatch(/^orders-attachments\/orders\/o1\/payments\//);
    expect(input.idempotencyKey).toMatch(/^[0-9a-f-]{36}$/);
  });
  it("a cheque needs its number and the cheque photo word", () => {
    show();
    fireEvent.change(screen.getByLabelText("Payment method"), { target: { value: "cheque" } });
    const file = new File(["p"], "cheque.jpg", { type: "image/jpeg" });
    fireEvent.change(screen.getByLabelText("Cheque photo"), { target: { files: [file] } });
    expect(screen.getByRole("button", { name: "Review payment" })).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Cheque number"), { target: { value: "882211" } });
    expect(screen.getByRole("button", { name: "Review payment" })).toBeEnabled();
  });
  it("a failed upload posts nothing and keeps the typed input", async () => {
    state.upload.mockResolvedValueOnce({ error: { message: "bucket down" } } as never);
    show();
    const file = new File(["slip"], "slip.jpg", { type: "image/jpeg" });
    fireEvent.change(screen.getByLabelText("Transfer slip"), { target: { files: [file] } });
    fireEvent.click(screen.getByRole("button", { name: "Review payment" }));
    fireEvent.click(screen.getByRole("button", { name: "Record payment" }));
    await waitFor(() => expect(state.upload).toHaveBeenCalled());
    expect(state.mutate).not.toHaveBeenCalled();
    // The review screen survives with the entered facts.
    expect(screen.getByText("This records customer money.")).toBeInTheDocument();
  });
  it("online is never a manual choice", () => {
    show();
    const options = Array.from(screen.getByLabelText("Payment method").querySelectorAll("option"))
      .map((o) => o.getAttribute("value"));
    expect(options).not.toContain("online");
    expect(options).toEqual(["bank", "duitnow_qr", "cheque", "cash", "credit_card", "debit_card"]);
  });
});

describe("§5 — a likely duplicate must be inspected before the money is recorded", () => {
  const withEarlier = {
    ...INVOICE,
    orders: {
      ...INVOICE.orders!,
      order_payments: [{
        id: "p-old", receipt_no: "RC-080926-0001", amount: 500,
        paid_on: "2026-09-08", voided_at: null, reference: "MBB-1", method: "bank",
      }],
    },
  } as typeof INVOICE;

  function showWith(inv: typeof INVOICE) {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <InvoiceRecordPayment invoice={inv} rows={[inv]} onClose={vi.fn()} />
      </QueryClientProvider>,
    );
  }

  it("names the earlier payment and keeps the door shut until it is inspected", async () => {
    showWith(withEarlier);
    fireEvent.change(screen.getByLabelText("Payment amount"), { target: { value: "500" } });
    fireEvent.change(screen.getByLabelText("Paid date"), { target: { value: "2026-09-08" } });
    // The evidence is what opens Review (the §16 upload-first rule).
    fireEvent.change(screen.getByLabelText("Transfer slip"),
      { target: { files: [new File(["slip"], "slip.jpg", { type: "image/jpeg" })] } });
    fireEvent.click(screen.getByRole("button", { name: "Review payment" }));
    const warn = await screen.findByTestId("likely-duplicate-warning");
    expect(warn).toHaveTextContent("RC-080926-0001");
    expect(warn).toHaveTextContent("This order already has a payment that looks the same.");
    expect(screen.getByRole("button", { name: "Record payment" })).toBeDisabled();
    fireEvent.click(screen.getByLabelText("I checked the earlier payment"));
    expect(screen.getByRole("button", { name: "Record payment" })).toBeEnabled();
  });

  it("an ordinary payment sees no warning and no extra step", async () => {
    showWith(withEarlier);
    fireEvent.change(screen.getByLabelText("Payment amount"), { target: { value: "123" } });
    fireEvent.change(screen.getByLabelText("Paid date"), { target: { value: "2026-09-01" } });
    fireEvent.change(screen.getByLabelText("Transfer slip"),
      { target: { files: [new File(["slip"], "slip.jpg", { type: "image/jpeg" })] } });
    fireEvent.click(screen.getByRole("button", { name: "Review payment" }));
    await screen.findByTestId("invoice-record-review");
    expect(screen.queryByTestId("likely-duplicate-warning")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Record payment" })).toBeEnabled();
  });
});

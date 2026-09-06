import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { InvoiceRegisterRow } from "@carres/shared/payment-invoice-register";
import InvoiceAskToPay from "./InvoiceAskToPay";

const state = vi.hoisted(() => ({
  fetch: vi.fn(async () => ({})),
  upload: vi.fn(async () => ({ error: null })),
  open: vi.fn(),
}));
vi.mock("@/lib/api", () => ({ apiFetch: state.fetch }));
vi.mock("@/lib/queries", () => ({
  qk: { finance: { invoiceRegister: () => ["finance", "invoice-register"] } },
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
    id: "o1", so: 1300, customer_name: "LIM KUAN YANG", customer_phone: "012-345 6789",
    source_ref: ["CR12345"], status: "proceed_order", paid: 400,
    delivery_date: "2026-09-18", delivery_date_tbd: false, delivered_at: null,
    order_lines: [{ sku: "MS01-K King Mattress", qty: 1, unit_price: 1000 }],
    order_addons: [],
    ops_order_control: [{ balance: null, confirmed_date: null, line_etas: null, line_stock_status: null }],
  },
};

function show(tone: "reminder" | "chase" = "reminder") {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <InvoiceAskToPay invoice={INVOICE} tone={tone} onClose={vi.fn()} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  state.fetch.mockClear();
  state.upload.mockClear();
  window.open = state.open as never;
  Object.assign(navigator, { clipboard: { writeText: vi.fn(async () => {}) } });
});

describe("Ask the customer to pay (§16)", () => {
  it("prepares the locked customer message with the REF, never the SO number", () => {
    show();
    const preview = screen.getByTestId("ask-message-preview");
    expect(preview).toHaveTextContent("REF: CR12345");
    expect(preview).not.toHaveTextContent("SO-1300");
    expect(preview).toHaveTextContent("Outstanding: RM 600");
  });
  it("opening WhatsApp records nothing — the record needs the screenshot", () => {
    show();
    fireEvent.click(screen.getByRole("button", { name: "Open WhatsApp" }));
    expect(state.open).toHaveBeenCalled();
    expect(state.fetch).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Record message sent" })).toBeDisabled();
  });
  it("record uploads the proof first, then posts the exact sent text", async () => {
    show("chase");
    const file = new File(["shot"], "sent.png", { type: "image/png" });
    fireEvent.change(screen.getByLabelText("Sent screenshot"), { target: { files: [file] } });
    fireEvent.click(screen.getByRole("button", { name: "Record message sent" }));
    await waitFor(() => expect(state.fetch).toHaveBeenCalledTimes(1));
    expect(state.upload).toHaveBeenCalled();
    const [url, init] = state.fetch.mock.calls[0] as unknown as [string, { body: string }];
    expect(url).toBe("/api/finance/invoices/i1/record-message");
    const body = JSON.parse(init.body);
    expect(body.kind).toBe("payment_request");
    expect(body.templateKey).toBe("customer_chase");
    expect(body.messageText).toContain("REF: CR12345");
    expect(body.screenshotUrl).toMatch(/^orders-attachments\/orders\/o1\/communications\//);
  });
  it("edited ordinary wording is what gets recorded", async () => {
    show();
    fireEvent.change(screen.getByLabelText("Message"), { target: { value: "Hi, custom words. REF: CR12345" } });
    const file = new File(["shot"], "sent.png", { type: "image/png" });
    fireEvent.change(screen.getByLabelText("Sent screenshot"), { target: { files: [file] } });
    fireEvent.click(screen.getByRole("button", { name: "Record message sent" }));
    await waitFor(() => expect(state.fetch).toHaveBeenCalled());
    const body = JSON.parse((state.fetch.mock.calls[0] as unknown as [string, { body: string }])[1].body);
    expect(body.messageText).toBe("Hi, custom words. REF: CR12345");
    expect(body.kind).toBe("reminder");
  });
});

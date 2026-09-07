import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { InvoiceRegisterRow } from "@carres/shared/payment-invoice-register";
import FinancePaymentReport, {
  customerBalanceRows,
  moneyReceivedLine,
} from "./FinancePaymentReport";

const state = vi.hoisted(() => ({
  payments: { data: [] as unknown[], isLoading: false, isError: false },
  invoices: { data: [] as unknown[], isLoading: false, isError: false },
}));
vi.mock("@/lib/queries", () => ({
  usePaymentRegister: () => state.payments,
  useInvoiceRegister: () => state.invoices,
}));

const payment = {
  id: "p1", order_id: "o1", receipt_no: "RC-060926-0001", paid_on: "2026-09-06",
  amount: 400, method: "bank", kind: "payment", reference: null,
  created_at: "2026-09-06T01:00:00Z", recorded_by: null, receipt_url: null,
  voided_at: null, void_reason: null,
  orders: { id: "o1", so: 1319, customer_name: "LIM KUAN YANG" },
  payment_allocations: [],
};
const voided = {
  ...payment, id: "p2", receipt_no: "RC-050926-0002", paid_on: "2026-09-05",
  amount: 250, voided_at: "2026-09-06T02:00:00Z", void_reason: "Recorded twice",
};

function invoice(over: Partial<InvoiceRegisterRow> & { paid?: number; lines?: number }): InvoiceRegisterRow {
  return {
    id: over.id ?? "i1", invoice_no: over.invoice_no ?? "INV-1",
    status: over.status ?? "issued",
    kind: over.kind ?? "sales",
    amount: over.amount ?? 1000, tax_amount: over.tax_amount ?? 0,
    issued_at: over.issued_at ?? "2026-09-06", voided_at: over.voided_at ?? null,
    void_reason: null, replaces_invoice_id: null, created_at: "2026-09-06T00:00:00Z",
    order_id: over.order_id ?? "o1",
    orders: {
      id: over.order_id ?? "o1", so: 1319, customer_name: "LIM KUAN YANG",
      status: "proceed_order", paid: over.paid ?? 400,
      delivery_date: null, delivery_date_tbd: false, delivered_at: null,
      order_lines: [{ qty: 1, unit_price: over.lines ?? 1000 }], order_addons: [],
      ops_order_control: [{ balance: null, confirmed_date: null,
        line_etas: null, line_stock_status: null }],
    },
  };
}

beforeEach(() => {
  state.payments = { data: [payment, voided], isLoading: false, isError: false };
  state.invoices = {
    data: [
      invoice({ id: "i-sales" }),
      invoice({ id: "i-storage", kind: "storage", amount: 150, tax_amount: 8 }),
      invoice({ id: "i-void", kind: "additional_storage", amount: 100, status: "voided",
        voided_at: "2026-09-06" }),
    ],
    isLoading: false, isError: false,
  };
});

function show() {
  return render(<MemoryRouter><FinancePaymentReport /></MemoryRouter>);
}

describe("the report derivations", () => {
  it("moneyReceivedLine says the count and the sum", () => {
    expect(moneyReceivedLine([payment, { ...payment, id: "px", amount: 100 }] as never))
      .toBe("2 payments · RM 500.00 received");
    expect(moneyReceivedLine([])).toBe("0 payments · RM 0.00 received");
  });
  it("customerBalanceRows dedupes to one SO through the shared soRemaining", () => {
    const rows = customerBalanceRows(state.invoices.data as InvoiceRegisterRow[]);
    // Goods 1000 + live storage 158 − paid 400 = 758; the voided obligation dead.
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      so: 1319, outstanding: 758, storageOwing: 158, overpaid: 0, doorId: "i-sales",
    });
  });
});

describe("Reports → Payment", () => {
  it("shows the six approved sections and never a rejected one", () => {
    show();
    for (const head of [
      "Money received", "Customer balances", "Storage charged and collected",
      "Storage waived", "Payment corrections", "Money needing review",
    ]) expect(screen.getByText(head)).toBeInTheDocument();
    expect(screen.queryByText(/Refund/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Bank Matching/)).not.toBeInTheDocument();
  });
  it("Money received counts live payments of the month, and the exclusion is on screen", () => {
    show();
    const card = screen.getByTestId("report-money-received");
    expect(card).toHaveTextContent("1 payment · RM 400.00 received");
    expect(card).toHaveTextContent("Voided payments are not money received");
    expect(within(card).queryByText("RC-050926-0002")).not.toBeInTheDocument();
    // Every row is a door into the Payments Register.
    expect(within(card).getByRole("link", { name: /RC-060926-0001/ }))
      .toHaveAttribute("href", "/finance/payments?payment=p1");
  });
  it("Customer balances says the SO across kinds with its storage named", () => {
    show();
    const card = screen.getByTestId("report-customer-balances");
    expect(card).toHaveTextContent("SO-1319");
    expect(card).toHaveTextContent("RM 758.00 still needed");
    expect(card).toHaveTextContent("includes storage RM 158.00");
    expect(within(card).getByRole("link", { name: /SO-1319/ }))
      .toHaveAttribute("href", "/finance/invoices?invoice=i-sales");
  });
  it("Storage lists the storage papers with the voided one marked, drafts excluded and said", () => {
    show();
    const card = screen.getByTestId("report-storage");
    expect(card).toHaveTextContent("Storage Invoice");
    expect(card).toHaveTextContent("Additional Storage Invoice");
    expect(card).toHaveTextContent("VOIDED");
    expect(card).toHaveTextContent("Drafts ask for nothing yet and are excluded.");
  });
  it("Payment corrections carries the void with its reason", () => {
    show();
    const card = screen.getByTestId("report-corrections");
    expect(card).toHaveTextContent("RC-050926-0002 · VOIDED");
    expect(card).toHaveTextContent("Recorded twice");
  });
  it("overpaid money appears under Money needing review with the §5 sentence", () => {
    state.invoices.data = [invoice({ id: "i-over", paid: 1300 }),
      invoice({ id: "i-over-storage", kind: "storage", amount: 150, tax_amount: 8, paid: 1300 })];
    show();
    const card = screen.getByTestId("report-needs-review");
    // 1300 − (1000 + 158) = 142 past every obligation.
    expect(card).toHaveTextContent("RM 142.00 needs review");
  });
  it("the storage waiver section says honestly that the journey is not built", () => {
    show();
    expect(screen.getByTestId("report-storage-waived"))
      .toHaveTextContent("No storage waiver is recorded yet.");
  });
});

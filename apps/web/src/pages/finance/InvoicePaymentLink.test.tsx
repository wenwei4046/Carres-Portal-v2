import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { InvoiceRegisterRow } from "@carres/shared/payment-invoice-register";
import InvoicePaymentLink, {
  expiryWord,
  sessionDisplayStatus,
  type CheckoutSession,
} from "./InvoicePaymentLink";

const calls = vi.hoisted(() => ({ list: [] as unknown[], posts: [] as Array<{ url: string; body: unknown }> }));
const state = vi.hoisted(() => ({
  sessions: [] as unknown[],
  templates: [] as unknown[],
}));
vi.mock("@/lib/api", () => ({
  apiFetch: vi.fn(async (url: string, init?: { method?: string; body?: string }) => {
    if (init?.method === "POST") {
      calls.posts.push({ url, body: JSON.parse(init.body ?? "{}") });
      if (url.includes("/stripe/checkout")) return { session: state.sessions[0] };
      return {};
    }
    if (/\/stripe\/checkout$/.test(url)) return { sessions: state.sessions };
    if (url.includes("payment-settings/templates")) return { templates: state.templates };
    if (url.includes("/stripe/checkout/")) return { session: state.sessions[0] };
    throw new Error(`unexpected ${url}`);
  }),
}));
vi.mock("@/lib/supabase", () => ({
  supabase: { storage: { from: () => ({ upload: vi.fn(async () => ({ error: null })) }) } },
}));

const openSession: CheckoutSession = {
  sessionId: "cs_test_1", url: "https://checkout.stripe.com/pay/cs_test_1",
  amount: 2200, status: "open", paidAt: null,
  expiresAt: "2099-01-01T00:00:00.000Z", paymentMethodDetail: null, receiptUrl: null,
};

const invoice: InvoiceRegisterRow = {
  id: "i1", invoice_no: "INV-1", status: "issued", kind: "sales",
  amount: 5400, tax_amount: 0, issued_at: "2026-09-06", voided_at: null,
  void_reason: null, replaces_invoice_id: null, created_at: "2026-09-06T00:00:00Z",
  order_id: "o1",
  orders: {
    id: "o1", so: 1319, customer_name: "LIM KUAN YANG", customer_phone: "0123456789",
    status: "proceed_order", paid: 3200,
    delivery_date: null, delivery_date_tbd: false, delivered_at: null,
    order_lines: [{ qty: 1, unit_price: 5400 }], order_addons: [],
    ops_order_control: [{ balance: null, confirmed_date: null, line_etas: null, line_stock_status: null }],
  },
};

function show() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const onClose = vi.fn();
  render(<QueryClientProvider client={qc}>
    <InvoicePaymentLink invoice={invoice} rows={[invoice]} onClose={onClose} />
  </QueryClientProvider>);
  return { onClose };
}

beforeEach(() => {
  state.sessions = [];
  state.templates = [];
  calls.posts = [];
});

describe("link derivations", () => {
  it("an open session past its expiry already reads expired", () => {
    const s = { ...openSession, expiresAt: "2026-01-01T00:00:00.000Z" };
    expect(sessionDisplayStatus(s, "2026-09-07T00:00:00.000Z")).toBe("expired");
    expect(sessionDisplayStatus(openSession, "2026-09-07T00:00:00.000Z")).toBe("open");
    expect(sessionDisplayStatus({ ...openSession, status: "paid" }, "2099-02-01T00:00:00.000Z")).toBe("paid");
  });
  it("the expiry is said exactly, and an absent one honestly", () => {
    expect(expiryWord("2026-09-12T07:45:00.000Z")).toMatch(/Sep/);
    expect(expiryWord(null)).toBe("Expiry not recorded");
  });
});

describe("Create payment link", () => {
  it("creates a link for the outstanding amount by default", async () => {
    show();
    await waitFor(() => expect(screen.getByLabelText("Amount to collect")).toBeInTheDocument());
    // Goods 5400 − paid 3200 = 2200 prefilled through the shared arithmetic.
    expect(screen.getByLabelText("Amount to collect")).toHaveValue("2200.00");
    state.sessions = [openSession];
    fireEvent.click(screen.getByRole("button", { name: "Create payment link" }));
    await waitFor(() => expect(calls.posts).toHaveLength(1));
    expect(calls.posts[0]).toMatchObject({ body: { amount: 2200 } });
  });
  it("an open link says Waiting for payment with the exact expiry, and created is not payment", async () => {
    state.sessions = [openSession];
    show();
    await waitFor(() => expect(screen.getByTestId("link-open")).toBeInTheDocument());
    const card = screen.getByTestId("link-open");
    expect(card).toHaveTextContent("Waiting for payment");
    expect(card).toHaveTextContent("RM 2,200.00");
    expect(card).toHaveTextContent(/expires/);
    expect(card).toHaveTextContent("Created or sent is not payment.");
  });
  it("with no Active template nothing invents customer wording — only the bare link copies", async () => {
    state.sessions = [openSession];
    show();
    await waitFor(() => expect(screen.getByTestId("link-no-template")).toBeInTheDocument());
    expect(screen.getByTestId("link-no-template"))
      .toHaveTextContent("No payment link template yet. The approved wording must come from its owner");
    expect(screen.queryByRole("button", { name: "Copy payment message" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Copy payment link" })).toBeInTheDocument();
    // Record link sent stays closed without wording.
    expect(screen.getByRole("button", { name: "Record link sent" })).toBeDisabled();
  });
  it("an Active template renders the message with the link and expiry facts", async () => {
    state.sessions = [openSession];
    state.templates = [{
      id: "t1", template_key: "11111111-1111-1111-1111-111111111111",
      purpose: "standard_payment_link", name: "Standard", version: 1,
      active: true, is_default: true, is_head: true, created_at: "2026-09-06",
      body: "Hi {customer}, pay {amount} here: {link} (works until {expiry})",
    }];
    show();
    await waitFor(() => expect(screen.getByTestId("link-message-preview"))
      .toHaveTextContent("https://checkout.stripe.com/pay/cs_test_1"));
    expect(screen.getByTestId("link-message-preview")).toHaveTextContent("pay 2,200 here");
    expect(screen.getByTestId("link-message-preview")).toHaveTextContent("works until");
    expect(screen.getByRole("button", { name: "Copy payment message" })).toBeInTheDocument();
  });
  it("an expired link says the governed three sentences", async () => {
    state.sessions = [{ ...openSession, status: "expired" }];
    show();
    await waitFor(() => expect(screen.getByTestId("link-expired")).toBeInTheDocument());
    expect(screen.getByTestId("link-expired")).toHaveTextContent("Payment link expired");
    expect(screen.getByTestId("link-expired")).toHaveTextContent("Amount needed remains unchanged.");
    expect(screen.getByRole("button", { name: "Create a new payment link" })).toBeInTheDocument();
  });
  it("a paid link says Payment recorded and the remainder", async () => {
    state.sessions = [{ ...openSession, status: "paid", paidAt: "2026-09-07T01:00:00Z" }];
    show();
    await waitFor(() => expect(screen.getByTestId("link-paid")).toBeInTheDocument());
    expect(screen.getByTestId("link-paid")).toHaveTextContent("Payment recorded");
    expect(screen.getByTestId("link-paid")).toHaveTextContent("RM 2,200.00 received through the payment link.");
  });
});

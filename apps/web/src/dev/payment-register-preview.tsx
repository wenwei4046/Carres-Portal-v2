/**
 * PAYMENT REGISTER PREVIEW — DEV ONLY (walk aid for the Payment UI delivery).
 *
 * Same contract as the other `src/dev/*-preview.tsx` entries: the REAL
 * FinanceApp shell and Payments Register, the REAL stylesheet, only the
 * session seeded and the API stubbed with a fixture. A separate vite entry —
 * cannot reach production.
 */
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import FinanceApp from "@/pages/finance/FinanceApp";
import "@/index.css";

/** ?role=operation walks the collection staff view (Record payment door);
 *  default finance walks the read-only money view. */
const ROLE = new URLSearchParams(window.location.search).get("role") ?? "finance";
useAuth.setState({
  role: ROLE as never,
  user: { email: `${ROLE}@carres.co` } as never,
});

const ORDER = { id: "o-1319", so: 1319, customer_name: "LIM KUAN YANG" };
const ORDER_2 = { id: "o-1204", so: 1204, customer_name: "NURUL AIN" };

const LIVE = {
  id: "p-1",
  order_id: ORDER.id,
  amount: 3200,
  paid_on: "2026-09-04",
  method: "bank",
  kind: "payment",
  reference: "MBB-4471",
  receipt_no: "RC-040926-1207",
  receipt_url: "evidence/rc-040926-1207.jpg",
  note: null,
  recorded_by: "u-sha",
  recorded_by_name: "Shasha",
  created_at: "2026-09-04T03:12:00Z",
  voided_at: null,
  voided_by: null,
  void_reason: null,
  orders: ORDER,
  payment_allocations: [
    { id: "a-1", order_id: ORDER.id, amount: 3200, allocated_at: "2026-09-04T03:12:00Z", voided_at: null },
  ],
};

const PARTIAL = {
  ...LIVE,
  id: "p-2",
  order_id: ORDER_2.id,
  amount: 500,
  paid_on: "2026-09-05",
  method: "cash",
  reference: null,
  receipt_no: "RC-050926-0031",
  receipt_url: null,
  orders: ORDER_2,
  payment_allocations: [
    { id: "a-2", order_id: ORDER_2.id, amount: 500, allocated_at: "2026-09-05T06:40:00Z", voided_at: null },
  ],
};

const VOIDED = {
  ...LIVE,
  id: "p-3",
  amount: 3200,
  paid_on: "2026-09-03",
  receipt_no: "RC-030926-0980",
  voided_at: "2026-09-04T01:00:00Z",
  voided_by: "u-sha",
  void_reason: "Recorded twice for the same transfer",
  payment_allocations: [
    { id: "a-3", order_id: ORDER.id, amount: 3200, allocated_at: "2026-09-03T02:00:00Z", voided_at: "2026-09-04T01:00:00Z" },
  ],
};

function soon(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toLocaleDateString("en-CA", { timeZone: "Asia/Kuala_Lumpur" });
}

const INVOICE_BASE = {
  kind: "sales", amount: 5400, tax_amount: 0, void_reason: null,
  replaces_invoice_id: null, created_at: "2026-09-06T00:00:00Z",
};
const INVOICE_ORDER = {
  id: ORDER.id, so: ORDER.so, customer_name: ORDER.customer_name,
  status: "proceed_order", paid: 3200,
  delivery_date: soon(12), delivery_date_tbd: false, delivered_at: null,
  ops_assigned_logistic: null,
  delivery_partners: { name: "NETS", contact: null },
  order_payments: [{ id: "p-1", receipt_no: "RC-040926-1207", amount: 3200,
    paid_on: "2026-09-04", voided_at: null }],
  order_lines: [{ qty: 1, unit_price: 5400 }],
  order_addons: [],
  ops_order_control: [{ balance: null, confirmed_date: null,
    line_etas: { "MS01-K": soon(3) }, line_stock_status: { "MS01-K": "awaiting" } }],
};
const INVOICES = [
  { ...INVOICE_BASE, id: "i-1", invoice_no: "INV-060926-4101", status: "issued",
    issued_at: "2026-09-06", voided_at: null, order_id: ORDER.id,
    orders: { ...INVOICE_ORDER,
      ops_order_control: [{ balance: null, confirmed_date: soon(10),
        line_etas: null, line_stock_status: { "MS01-K": "ready" } }] } },
  { ...INVOICE_BASE, id: "i-2", invoice_no: null, status: "draft", amount: 2100,
    issued_at: null, voided_at: null, order_id: ORDER_2.id,
    orders: { ...INVOICE_ORDER, id: ORDER_2.id, so: ORDER_2.so,
      customer_name: ORDER_2.customer_name, paid: 500,
      order_lines: [{ qty: 1, unit_price: 2100 }],
      delivery_partners: null,
      order_payments: [{ id: "p-2", receipt_no: "RC-050926-0031", amount: 500,
        paid_on: "2026-09-05", voided_at: null }] } },
  { ...INVOICE_BASE, id: "i-3", invoice_no: "INV-030926-2208", status: "voided",
    issued_at: "2026-09-03", voided_at: "2026-09-04",
    void_reason: "Wrong amount on the paper", order_id: ORDER.id,
    orders: INVOICE_ORDER },
  // The dedupe walk: a Storage invoice on the SAME order as i-1 — the
  // calendar must still show ONE delivery and ONE arrival for that SO.
  { ...INVOICE_BASE, id: "i-4", invoice_no: "INV-060926-7710", status: "issued",
    kind: "storage", amount: 150, issued_at: "2026-09-06", voided_at: null,
    order_id: ORDER.id,
    orders: { ...INVOICE_ORDER,
      ops_order_control: [{ balance: null, confirmed_date: soon(10),
        line_etas: null, line_stock_status: { "MS01-K": "ready" } }] } },
];

const realFetch = window.fetch.bind(window);
window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  const url =
    typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  const json = (body: unknown) =>
    new Response(JSON.stringify(body), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  if (url.includes("/api/finance/payments/register"))
    return json({ rows: [PARTIAL, LIVE, VOIDED], total: 3 });
  if (url.includes("/api/finance/invoices/register"))
    return json({ rows: INVOICES, total: INVOICES.length });
  // The §16 Online link walk: one standing open link on the walk order.
  if (/\/stripe\/checkout$/.test(url) && (!init || init.method !== "POST"))
    return json({ sessions: [{
      sessionId: "cs_test_walk", url: "https://checkout.stripe.com/pay/cs_test_walk",
      amount: 2200, status: "open", paidAt: null,
      expiresAt: new Date(Date.now() + 86_000_000).toISOString(),
      paymentMethodDetail: null, receiptUrl: null,
    }] });
  if (url.includes("/stripe/checkout/"))
    return json({ session: { sessionId: "cs_test_walk", status: "open" } });
  if (url.includes("/api/finance/payment-settings/templates"))
    return json({ templates: [] });
  // The §6 storage walk: one mattress case on day 21 (one period commenced).
  if (url.includes("/api/finance/payment-storage") && (!init || init.method !== "POST"))
    return json({ cases: [{
      id: "sc-1", order_id: ORDER.id, product_group: "mattress_bedframe",
      readiness_witnessed_on: soon(-20), customer_delay_witnessed_on: soon(-20),
      delay_witness_note: "Customer asked to hold the delivery",
      storage_start: soon(-20), rule_free_days: 14, rule_charge_amount: 150,
      rule_cycle_days: 30, rule_extra_free_allowed: true,
      approved_free_until: null, approval_reason: null, status: "open",
    }] });
  if (url.includes("/api/finance/payment-storage") )
    return json({ case: {} });
  if (url.startsWith("/api/")) {
    return new Response(JSON.stringify({}), { status: 404 });
  }
  return realFetch(input, init);
};

const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });

window.history.replaceState(null, "", "/finance/payments");

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={qc}>
      <BrowserRouter>
        <Routes>
          <Route path="/finance/*" element={<FinanceApp />} />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);

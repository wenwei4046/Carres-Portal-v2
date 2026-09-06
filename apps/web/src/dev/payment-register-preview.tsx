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

useAuth.setState({
  role: "finance",
  user: { email: "finance@carres.co" } as never,
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
  kind: "sales", tax_amount: 0, void_reason: null, replaces_invoice_id: null,
  created_at: "2026-09-06T00:00:00Z",
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
  { ...INVOICE_BASE, id: "i-2", invoice_no: null, status: "draft",
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
    return json({ rows: INVOICES, total: 3 });
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

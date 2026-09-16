/**
 * PAYMENT MONITOR PREVIEW — DEV ONLY (walk aid for Payments CARD 02, the
 * owner-approved listing, 2026-09-16).
 *
 * Same contract as every `src/dev/*-preview.tsx` entry: the REAL FinanceApp
 * shell and Payment Monitor, the REAL stylesheet, only the session seeded and
 * the API answered by a fixture. A separate vite entry — it cannot reach
 * production, write money or contact a customer.
 *
 * Production holds almost none of these states (every live row is test data),
 * so the acceptance states are walked here: ready · part ready with a reliable
 * arrival · arrival unknown · delivered; not confirmed · day only · day and
 * time · rescheduled; part paid · promised today · overdue; every storage
 * state; a normal owner · today's cover · nobody assigned; a long name with
 * two references. `?role=finance` walks the Finance reader.
 */
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import FinanceApp from "@/pages/finance/FinanceApp";
import { appTodayIso } from "@/lib/fmt-date";
import "@/index.css";

const ROLE = new URLSearchParams(window.location.search).get("role") ?? "operation";
useAuth.setState({ role: ROLE as never, user: { email: `${ROLE}@carres.co` } as never });

const TODAY = appTodayIso();
function soon(days: number): string {
  const [y, m, d] = TODAY.split("-").map(Number);
  return new Date(Date.UTC(y!, m! - 1, d! + days)).toISOString().slice(0, 10);
}
/** The next Mon–Fri non-holiday on or after `days` out (16 Sep is a holiday). */
const PLAN = TODAY === "2026-09-16" ? "2026-09-17" : TODAY;
const SKU = "mattress:M1401F-K";
const FRAME = "bedframe:B2201-Q";

type Spec = {
  so: number; name: string; phone?: string; refs?: string[];
  total: number; paid: number; requested: string | null; tbd?: boolean;
  lines: Array<{ sku: string; qty: number; label: string }>;
  units: Array<{ sku: string; qty: number }>;
  arrivals?: unknown[];
  arrangement?: { date: string | null; time: string | null };
  docs?: Array<{ date: string; slot: string; voided: boolean }>;
  delivered?: boolean;
  promise?: string;
  storageInvoice?: number;
};

const SPECS: Spec[] = [
  { so: 1401, name: "TAN SRI DATO' SERI MUHAMMAD HAFIZUDDIN BIN ABDUL RAHMAN", phone: "0123456789",
    refs: ["TCF0541", "CR1122"], total: 3200, paid: 1500, requested: soon(4),
    lines: [{ sku: SKU, qty: 1, label: "Serena · King" }], units: [{ sku: SKU, qty: 1 }],
    arrangement: { date: soon(4), time: "2 PM to 5 PM" } },
  { so: 1402, name: "NURUL AIN BINTI ISMAIL", phone: "0198887766", refs: ["CR0854"],
    total: 2400, paid: 800, requested: soon(12), promise: TODAY,
    lines: [{ sku: SKU, qty: 2, label: "Serena · King" }, { sku: FRAME, qty: 1, label: "Aria · Queen" }],
    units: [{ sku: SKU, qty: 2 }],
    arrivals: [{ poId: "PO-2201", status: "issued", owedSkus: [FRAME], plannedIso: soon(6), originalIso: soon(6),
      reply: { answer: "confirmed", aboutIso: soon(6), previousIso: null, newIso: soon(6), recordedAt: `${soon(-2)}T03:00:00Z` } }],
    arrangement: { date: soon(12), time: null } },
  { so: 1403, name: "LIM KUAN YANG", phone: "0162389000", total: 1800, paid: 0, requested: soon(9),
    lines: [{ sku: SKU, qty: 1, label: "Serena · King" }], units: [] },
  { so: 1404, name: "WONG MEI LING", phone: "0127775544", refs: ["TCF0612"], total: 2600, paid: 1000,
    requested: soon(-4), lines: [{ sku: SKU, qty: 1, label: "Serena · King" }], units: [{ sku: SKU, qty: 1 }],
    arrangement: { date: soon(-2), time: "9 AM to 12 PM" }, storageInvoice: 200 },
  { so: 1405, name: "SITI AMINAH", phone: "0133332211", total: 4100, paid: 2000, requested: soon(5),
    lines: [{ sku: "sofa:S3301-3S", qty: 1, label: "Luna · 3 Seater" }], units: [{ sku: "sofa:S3301-3S", qty: 1 }],
    arrangement: { date: soon(8), time: "10 AM to 1 PM" },
    docs: [{ date: soon(3), slot: "2 PM to 5 PM", voided: true }, { date: soon(8), slot: "10 AM to 1 PM", voided: false }] },
  { so: 1406, name: "CHONG WEI JIE", phone: "0171234567", total: 1500, paid: 500, requested: null, tbd: true,
    lines: [{ sku: SKU, qty: 1, label: "Serena · King" }], units: [{ sku: SKU, qty: 1 }] },
  { so: 1407, name: "RAJESH KUMAR", phone: "0145556677", total: 2200, paid: 1200, requested: soon(-10),
    lines: [{ sku: SKU, qty: 1, label: "Serena · King" }], units: [], delivered: true,
    arrangement: { date: soon(-10), time: "2 PM to 5 PM" } },
];

const oid = (so: number) => `o-${so}`;
const INVOICES = SPECS.flatMap((s) => {
  const order = {
    id: oid(s.so), so: s.so, customer_name: s.name, customer_phone: s.phone ?? null, source_ref: s.refs ?? [],
    status: s.delivered ? "delivered" : "proceed_order", paid: s.paid,
    delivery_date: s.requested, delivery_date_tbd: !!s.tbd, delivered_at: s.delivered ? `${soon(-10)}T08:00:00Z` : null,
    ops_assigned_logistic: null, delivery_partners: { name: "NETS", contact: "0123000000" },
    order_payments: s.paid ? [{ id: `p-${s.so}`, receipt_no: `RCP-${s.so}`, amount: s.paid, paid_on: soon(-7), voided_at: null }] : [],
    payment_communications: [],
    latest_promise: s.promise ? { promised_date: s.promise, recorded_at: `${soon(-1)}T04:00:00Z` } : null,
    order_lines: s.lines.map((l) => ({ sku: l.sku, qty: l.qty, unit_price: s.total / s.lines.reduce((n, x) => n + x.qty, 0) })),
    order_addons: [],
    ops_order_control: [{ balance: null, confirmed_date: null, booking_stage: null, confirmed_time_slot: null,
      line_etas: null, line_stock_status: Object.fromEntries(s.lines.map((l) => [l.sku, "ready"])) }],
    ops_delivery_arrangements: s.arrangement ? [{ leg: 0, confirmed_date: s.arrangement.date, confirmed_time: s.arrangement.time }] : [],
    ops_delivery_orders: (s.docs ?? []).map((d, i) => ({ leg: 0, delivery_date: d.date, time_slot: d.slot,
      voided_at: d.voided ? `${soon(-1)}T00:00:00Z` : null, issued_at: `${soon(-3 + i)}T00:00:00Z` })),
  };
  const sales = { id: `i-${s.so}`, invoice_no: `INV-${s.so}`, status: "issued", kind: "sales", amount: s.total, tax_amount: 0,
    issued_at: `${soon(-20)}T00:00:00Z`, voided_at: null, void_reason: null, replaces_invoice_id: null,
    created_at: `${soon(-20)}T00:00:00Z`, order_id: oid(s.so), orders: order };
  return s.storageInvoice
    ? [sales, { ...sales, id: `is-${s.so}`, invoice_no: `SINV-${s.so}`, kind: "storage", amount: s.storageInvoice }]
    : [sales];
});

const ORDERS = SPECS.map((s) => ({
  id: oid(s.so), so: s.so, status: s.delivered ? "delivered" : "proceed_order", customer_name: s.name,
  source_ref: s.refs ?? [], delivery_date: s.requested, delivery_date_tbd: !!s.tbd,
  order_lines: s.lines.map((l, i) => ({ id: `${oid(s.so)}-l${i}`, sku: l.sku, qty: l.qty, label: l.label })),
  order_addons: [], allocated_units: s.units.map((u) => ({ ...u, status: "reserved" })),
  po_arrivals: s.arrivals ?? [], ops_sofa_loans: [],
}));

const person = (userId: string, name: string) => ({ userId, name });
function item(so: number, dueOn: string, owner: Record<string, unknown>, ruleKey = "payment.collect_customer_balance", action = "Ask customer to pay") {
  return {
    id: `payment:i-${so}:${ruleKey}`, module: "payment", ruleKey,
    object: { kind: "invoice", id: ruleKey === "payment.send_storage_invoice" ? `is-${so}` : `i-${so}`, label: `INV-${so}` },
    problem: "Customer balance due", action, recipient: "Customer", requiredResult: "Outstanding balance reduced to RM 0",
    completionFact: "outstanding = RM 0", owner,
    timing: { dueOn, workingDaysLate: dueOn < TODAY ? 2 : 0, bucket: dueOn < TODAY ? "overdue" : "today" },
    destination: `/finance/monitor?invoice=i-${so}`, tone: "warning", locked: false, broken: false,
  };
}
const SHASHA = { rule: "collection_owner", dutyKey: "delivery_duty", normal: person("u-sha", "Shasha Tan"),
  activeCover: null, acting: person("u-sha", "Shasha Tan"), state: "primary" };
const COVERED = { rule: "collection_owner", dutyKey: "delivery_duty", normal: person("u-sha", "Shasha Tan"),
  activeCover: person("u-yj", "Yu Jun"), acting: person("u-yj", "Yu Jun"), state: "covered" };
const NOBODY = { rule: "collection_owner", dutyKey: "delivery_duty", normal: null, activeCover: null, acting: null, state: "not_assigned" };
const WORK = [
  item(1401, PLAN, SHASHA),
  item(1402, PLAN, COVERED, "payment.missed_promise"),
  item(1404, soon(-2), NOBODY),
  item(1404, soon(-2), NOBODY, "payment.send_storage_invoice", "Send the invoice and collect payment"),
];

const CASES = [
  { id: "sc-1402", order_id: oid(1402), product_group: "mattress_bedframe", storage_start: soon(-2), rule_free_days: 7,
    rule_charge_amount: 150, rule_cycle_days: 30, approved_free_until: null, approved_at: null, billed_through_period: 0, status: "open" },
  { id: "sc-1403", order_id: oid(1403), product_group: "mattress_bedframe", storage_start: soon(-20), rule_free_days: 7,
    rule_charge_amount: 150, rule_cycle_days: 30, approved_free_until: null, approved_at: null, billed_through_period: 0, status: "open" },
  { id: "sc-1405", order_id: oid(1405), product_group: "sofa", storage_start: soon(-28), rule_free_days: 14,
    rule_charge_amount: 200, rule_cycle_days: 14, approved_free_until: null, approved_at: null, billed_through_period: 0, status: "open" },
  { id: "sc-1406", order_id: oid(1406), product_group: "mattress_bedframe", storage_start: soon(-10), rule_free_days: 7,
    rule_charge_amount: 150, rule_cycle_days: 30, approved_free_until: soon(11), approved_at: `${soon(-3)}T00:00:00Z`,
    billed_through_period: 0, status: "open" },
];

const realFetch = window.fetch.bind(window);
window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
  if (url.includes("/api/finance/invoices/register")) return json({ rows: INVOICES, total: INVOICES.length });
  if (url.includes("/api/finance/payment-settings/templates")) return json({ templates: [] });
  if (url.includes("/api/finance/payment-settings"))
    return json({ bank_accounts: [], manual_methods: [], storage_rules: [],
      collection_timing: [{ id: "t-1", ask_days_before: 3, deadline_days_before: 2, effective_from: "2026-08-19",
        reason: "Owner ruling", created_at: "2026-09-12T00:00:00Z" }],
      setting_changes: [], online_provider: { name: "Stripe", configured: false } });
  const orderId = new URL(url, window.location.origin).searchParams.get("orderId");
  if (url.includes("/later-delivery-requests"))
    return json({ requests: [{ order_id: oid(1403), free_storage_requested: true, recorded_at: `${soon(-1)}T00:00:00Z` }]
      .filter((r) => !orderId || r.order_id === orderId) });
  if (url.includes("/payment-storage/inspections")) return json({ inspections: [] });
  if (url.includes("/api/operation/work")) return json({ items: WORK, staff: [], generatedOn: TODAY });
  if (/\/api\/operation\/orders\/[^/?]+\/expansion/.test(url))
    return json({ lines: [], unitCoverage: {}, unitScopes: {}, place: [] });
  if (url.includes("/api/operation/orders")) return json({ orders: ORDERS });
  if (url.includes("/api/catalog"))
    return json({ models: [], skus: [], sofaFabrics: [], addons: [], floorConfig: {} });
  if (url.includes("/api/finance/payment-storage") && (!init || init.method !== "POST"))
    return json({ cases: CASES.filter((c) => !orderId || c.order_id === orderId) });
  if (url.startsWith("/api/") || url.includes("/api/")) return new Response(JSON.stringify({}), { status: 404 });
  return realFetch(input, init);
};

const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
if (!window.location.pathname.startsWith("/finance/")) window.history.replaceState(null, "", "/finance/monitor?day=all");

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

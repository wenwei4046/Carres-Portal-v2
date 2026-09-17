/**
 * SALES ORDERS · REAL SHELL PREVIEW — DEV ONLY (date-first listing, Jess
 * 2026-09-17).
 *
 * The REAL `OperationApp` — portal sidebar, destination header and the Sales
 * Orders Register — at `/operation/orders`, so `SO Date · SO No` is measured
 * with the chrome production puts beside it. Only the network is seeded: every
 * API call is answered locally and nothing leaves the browser. A separate vite
 * entry (`sales-orders-shell-preview.html`), so it cannot reach production.
 * Fixture evidence is not authenticated production evidence.
 */
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import OperationApp from "@/pages/operation/OperationApp";
import "@/index.css";

const CUSTOMERS = [
  "Kimmy", "LIM KUAN YANG", "Nurul Aisyah binti Abdul Rahman", "PETER", "ANNE", "Tan Ah Kow",
  "Mohd Hafiz", "CHONG WEI MING & FAMILY", "Siti", "Rajesh Kumar a/l Subramaniam",
];
const CITIES: Array<[string, string]> = [
  ["Petaling Jaya", "Selangor"], ["Johor Bahru", "Johor"], ["Kuala Lumpur", "Kuala Lumpur"],
  ["Port Dickson", "Negeri Sembilan"], ["Kota Kinabalu", "Sabah"],
];

const orders = Array.from({ length: 24 }, (_, n) => {
  const i = n + 1;
  const [city, state] = CITIES[i % CITIES.length]!;
  return {
    id: `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`,
    so: 1340 - i,
    status: "proceed_order",
    operation_stage: "confirmed",
    warehouse_id: null,
    customer_name: CUSTOMERS[i % CUSTOMERS.length],
    customer_phone: `01${i % 10}-34789${String(10 + i).slice(-2)}`,
    customer_address_city: city,
    customer_address_state: state,
    // One order from an earlier year: the widest date the column must hold.
    placed_at: i === 7 ? "2025-05-28T02:00:00Z" : `2026-09-${String(1 + (i % 16)).padStart(2, "0")}T02:00:00Z`,
    delivery_date: i % 4 ? `2026-10-${String(1 + (i % 27)).padStart(2, "0")}` : null,
    delivery_date_tbd: i % 8 === 0,
    delivery_partner_id: null,
    request_for_delivery_at: null,
    partner_accepted_at: null,
    partner_rejected_at: null,
    partner_rejected_reason: null,
    delivery_partners: null,
    do_number: null,
    dispatched_at: null,
    delivered_at: null,
    outlet_id: "outlet-1",
    outlets: { name: i % 2 ? "Carres Kota Damansara" : "Carres Maluri Cheras" },
    dealer_id: null,
    dealers: null,
    order_supplier_threads: [],
    order_annotations: [],
    paid: 1250,
    po_numbers: i % 7 === 0 ? [`PO-20260910-${4000 + i}`, `PO-20260911-${5000 + i}`] : i % 3 ? [`PO-20260910-${4000 + i}`] : [],
    ops_delivery_orders: i % 5 === 0 ? [{ do_number: `DO-20260915-${7000 + i}` }] : [],
    order_lines: [{ sku: "B1201S-K", qty: 1, unit_price: 2499, label: "B1201S · King" }],
    order_addons: [],
  };
});

const realFetch = window.fetch.bind(window);
window.fetch = async (input, init) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  if (!url.includes("127.0.0.1:88") && !url.includes("localhost:88")) return realFetch(input, init);
  const body = /\/api\/operation\/orders(\?|$)/.test(url)
    ? { orders, salesOrderTotal: 612 }
    : url.includes("/rest/") ? [] : {};
  return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
};

useAuth.setState({
  role: "operation", hydrated: true, loading: false,
  user: { id: "u-op", email: "preview@carres.local" } as never,
  session: { access_token: "preview", user: { id: "u-op", email: "preview@carres.local" } } as never,
});

const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={["/operation/orders"]}>
        <Routes>
          <Route path="/operation/*" element={<OperationApp />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  </StrictMode>,
);

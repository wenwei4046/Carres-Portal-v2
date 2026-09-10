/**
 * DELIVERY MONITOR PREVIEW — DEV ONLY (walk aid for CARD-2026-09-04-delivery-01).
 *
 * Same contract as the other previews: the REAL OperationDelivery page, the
 * REAL stylesheet, only the session seeded and the four canonical reads
 * answered by fixtures. A separate vite entry — cannot reach production.
 *
 * The fixture walks the Card's own example week (Fri 4 Sep 2026): cards with
 * and without a DO, a failed delivery, a delivered-with-no-proof, a scope with
 * no confirmed date, an overdue one, a Singapore Journey, and three partners.
 */
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import OperationDelivery from "@/pages/operation/OperationDelivery";
import DeliveryOrdersRegister from "@/pages/operation/DeliveryOrdersRegister";
import "@/index.css";

useAuth.setState({
  role: "operation",
  user: { email: "sha@carres.co" } as never,
});

function order(over: Record<string, unknown> & { id: string; so: number }) {
  return {
    status: "proceed_order",
    operation_stage: "ready_to_dispatch",
    warehouse_id: null,
    customer_name: "kong chai yin",
    customer_phone: "0162389000",
    customer_address: "12 Jalan Damai, Klang",
    customer_address_city: "Klang",
    customer_address_state: "Selangor",
    building_type: "Landed",
    placed_at: "2026-08-01T00:00:00Z",
    delivery_date: null,
    delivery_date_tbd: false,
    source_system: null,
    source_ref: ["CR0854"],
    ops_assigned_logistic: null,
    order_lines: [{ id: "l-1", sku: "mattress:M1401F-K", qty: 1, label: "Serena · King" }],
    delivery_partner_id: null,
    request_for_delivery_at: null,
    partner_accepted_at: null,
    partner_rejected_at: null,
    partner_rejected_reason: null,
    delivery_partners: null,
    do_number: null,
    dispatched_at: null,
    delivered_at: null,
    outlet_id: null,
    dealer_id: "d-1",
    dealers: { name: "Carres KL" },
    order_supplier_threads: [],
    order_annotations: [],
    ...over,
  };
}

function arrangement(over: Record<string, unknown> & { order_id: string }) {
  return {
    id: `arr-${over.order_id}`,
    leg: 0,
    partner_id: null,
    partner_name: null,
    confirmed_date: null,
    confirmed_time: null,
    expected_arrival: null,
    logistics_note: null,
    reply_proof_path: null,
    driver_name: null,
    vehicle: null,
    updated_at: "2026-09-01T00:00:00Z",
    updated_by: null,
    ...over,
  };
}

const ORDERS = [
  order({ id: "a", so: 1322, do_number: "DO-030926-0001", customer_name: "kong chai yin" }),
  order({
    id: "b",
    so: 1323,
    customer_name: "aida rahim",
    customer_address: "8 Jalan Ampang, Kuala Lumpur",
    customer_address_city: "Kuala Lumpur",
    customer_address_state: "Kuala Lumpur",
    building_type: "Condominium",
  }),
  order({ id: "c", so: 1324, customer_name: "tan siew mei" }),
  order({
    id: "d",
    so: 1325,
    customer_name: "lim wei jie",
    do_number: "DO-020926-0007",
    ops_order_control: { delivery_photos: [] },
  }),
  order({
    id: "e",
    so: 1326,
    customer_name: "farah binti azman",
    do_number: "DO-010926-0004",
  }),
  /* THE CHASE (2026-09-09) — three deliveries with no confirmed date: one
     nobody carries yet, one a partner carries and has not answered on, and
     one whose customer has asked for a day still being settled. */
  order({ id: "f", so: 1327, customer_name: "chong kah wai", delivery_date: "2026-09-18" }),
  order({ id: "h", so: 1329, customer_name: "siti nurhaliza", delivery_date: "2026-09-11" }),
  order({
    id: "i",
    so: 1330,
    customer_name: "ravi kumar",
    delivery_date: null,
    delivery_date_tbd: true,
  }),
  order({
    id: "g",
    so: 1328,
    customer_name: "nurul huda",
    customer_address: "3 Jalan Tebrau, Johor Bahru",
    customer_address_city: "Johor Bahru",
    customer_address_state: "Johor",
    delivery_stops: [
      { leg: 1, partner_id: "p-teow", partner_name: "TEOW", from_loc: "Klang WH", to_loc: "JB transit", scheduled_at: "2026-09-08T04:00:00.000Z", status: "pending" },
      { leg: 2, partner_id: "p-ssy", partner_name: "SSY", from_loc: "JB transit", to_loc: "Singapore customer", scheduled_at: "2026-09-09T04:00:00.000Z", status: "pending" },
    ],
  }),
];

const ROUTES: [ (url: string) => boolean, () => unknown ][] = [
  [(url) => url.includes("/api/operation/orders"), () => ({ orders: ORDERS })],
  [(url) => url.includes("/api/operation/partners"), () => ({
    partners: [
      { id: "p-nets", name: "NETS" },
      { id: "p-al", name: "AL" },
      { id: "p-teow", name: "TEOW" },
      { id: "p-houzs", name: "HOUZS", contact: "011-11108855" },
    ],
  })],
  [(url) => url.includes("/api/operation/delivery-arrangements"), () => ({
    arrangements: [
      arrangement({
        order_id: "b",
        partner_id: "p-nets",
        partner_name: "NETS",
        confirmed_date: "2026-09-04",
        confirmed_time: "11:00–13:00",
        expected_arrival: "12:00",
      }),
      arrangement({
        order_id: "c",
        partner_id: "p-al",
        partner_name: "AL",
        confirmed_date: "2026-09-05",
        confirmed_time: "14:00–16:00",
      }),
      arrangement({
        order_id: "d",
        partner_id: "p-nets",
        partner_name: "NETS",
        confirmed_date: "2026-09-03",
        confirmed_time: "10:00–12:00",
      }),
      arrangement({
        order_id: "e",
        partner_id: "p-houzs",
        partner_name: "HOUZS",
        confirmed_date: "2026-09-01",
      }),
      /* A partner carries these two and has not given a day back yet. */
      arrangement({ order_id: "h", partner_id: "p-al", partner_name: "AL" }),
      arrangement({ order_id: "i", partner_id: "p-nets", partner_name: "NETS" }),
    ],
  })],
  [(url) => url.includes("/api/operation/delivery-orders"), () => ({
    deliveryOrders: [
      {
        id: "do-row-1",
        do_number: "DO-030926-0001",
        issued_at: "2026-09-01T00:00:00Z",
        trip_groups: null,
        delivery_date: "2026-09-03",
        time_slot: "09:00–11:00",
        logistics_partner: "NETS",
        voided_at: null,
        void_reason: null,
        orders: { id: "a", so: 1322, customer_name: "kong chai yin", customer_address_city: "Klang", customer_address_state: "Selangor", delivery_date: "2026-09-04", delivery_date_tbd: false, do_file_path: null, order_lines: [{ id: "l-1", sku: "mattress:M1401F-K", qty: 1 }], ops_order_control: null },
      },
      {
        id: "do-row-2",
        do_number: "DO-020926-0007",
        issued_at: "2026-09-01T00:00:00Z",
        trip_groups: null,
        delivery_date: null,
        time_slot: null,
        logistics_partner: "NETS",
        voided_at: null,
        void_reason: null,
        orders: { id: "d", so: 1325, customer_name: "lim wei jie", customer_address_city: "Klang", customer_address_state: "Selangor", delivery_date: "2026-09-02", delivery_date_tbd: false, do_file_path: null, order_lines: [{ id: "l-4", sku: "mattress:M1401F-K", qty: 1 }], ops_order_control: { delivery_photos: [] } },
      },
      {
        id: "do-row-3",
        do_number: "DO-010926-0004",
        issued_at: "2026-08-30T00:00:00Z",
        trip_groups: null,
        delivery_date: null,
        time_slot: null,
        logistics_partner: "HOUZS",
        voided_at: null,
        void_reason: null,
        orders: { id: "e", so: 1326, customer_name: "farah binti azman", customer_address_city: "Kota Kinabalu", customer_address_state: "Sabah", delivery_date: null, delivery_date_tbd: true, do_file_path: null, order_lines: [{ id: "l-5", sku: "sofa:S200-3", qty: 1 }], ops_order_control: null },
      },
    ],
    attempts: [
      { do_number: "DO-020926-0007", result: "delivered", reason_key: null, recorded_at: "2026-09-03T12:00:00Z" },
      { do_number: "DO-010926-0004", result: "failed", reason_key: "customer_not_home", recorded_at: "2026-09-01T15:00:00Z" },
    ],
    handoverEvents: [],
  })],
];

const realFetch = window.fetch.bind(window);
window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  const url =
    typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  const route = ROUTES.find(([test]) => test(url));
  if (route) {
    return new Response(JSON.stringify(route[1]()), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }
  if (url.includes("/api/")) {
    return new Response(JSON.stringify({}), { status: 404 });
  }
  return realFetch(input, init);
};

const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={qc}>
      <BrowserRouter>
        <Routes>
          <Route path="/operation/delivery-orders" element={<DeliveryOrdersRegister />} />
          <Route path="*" element={<OperationDelivery />} />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);

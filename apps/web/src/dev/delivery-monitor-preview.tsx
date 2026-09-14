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
 *
 * ⭐ EXTENDED 2026-09-11 for the owner's Monitor corrections. Production holds
 * no order in most of these states, so they cannot be walked on live data and
 * must not be waited for:
 *
 *   every ARRIVAL state, including the three the correction insists on keeping
 *   apart — no calculation · an unanswered enquiry · a supplier who answered
 *   and named no day — plus a confirmed date with NO agreed time, a trip whose
 *   result is already recorded, and readiness scoped to THIS trip's goods.
 *
 * The Delivery Orders register has its own fixture next door
 * (`delivery-orders-preview`); this one stays the Monitor's.
 */
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import OperationDelivery from "@/pages/operation/OperationDelivery";
import OperationApp from "@/pages/operation/OperationApp";
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
    order_addons: [],
    /* DELIVERY MONITOR (2026-09-11) — the ARRIVAL and ALLOCATION facts the
       work list now reads. Empty by default so a fixture states what it
       means rather than inheriting a supplier date it never set. */
    po_arrivals: [],
    allocated_units: [],
    delivery_floor: 1,
    delivery_has_lift: true,
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

/* The seven ARRIVAL states, one fixture each — so the walk sees every one of
   them rather than the one the live data happened to hold that morning. */
function arrival(over: Record<string, unknown> = {}) {
  return {
    poId: "PO-2100",
    status: "open",
    owedSkus: ["mattress:M1401F-K"],
    plannedIso: null,
    originalIso: null,
    reply: null,
    ...over,
  };
}

const ORDERS = [
  order({
    id: "a", so: 1322, do_number: "DO-030926-0001", customer_name: "kong chai yin",
    // Visual fixture: repeat a category without merging the product lines.
    // Each receipt belongs to its line; an unbound accessory stays unknown.
    order_lines: [
      { id: "a-m1", sku: "mattress:M1401F-K", qty: 1, label: "Serena · King" },
      { id: "a-m2", sku: "mattress:M1401F-Q", qty: 2, label: "Serena · Queen" },
      { id: "a-p1", sku: "Pillow soft", qty: 2, label: "Pillow soft" },
    ],
    allocated_units: [
      { sku: "mattress:M1401F-K", status: "reserved", qty: 1, orderLineId: "a-m1" },
      { sku: "mattress:M1401F-Q", status: "reserved", qty: 1, orderLineId: "a-m2" },
    ],
  }),
  order({
    id: "b",
    so: 1323,
    // Explicit fixture evidence: this whole line is still incoming.
    incoming_units: [{ unitCode: "U-PREVIEW-B", orderLineId: "l-1", qty: 1 }],
    customer_name: "aida rahim",
    customer_address: "8 Jalan Ampang, Kuala Lumpur",
    customer_address_city: "Kuala Lumpur",
    customer_address_state: "Kuala Lumpur",
    building_type: "Condominium",
    /* THE ONE ORDER WITH NO CUSTOMER REFERENCE (2026-09-14). Every other
       fixture carries `CR0854`, so nothing in the walk showed what COLUMN 4
       does when there is nothing to put under the number: the answer is
       nothing — no second line, no placeholder, no dash. */
    source_ref: null,
  }),
  order({
    id: "c",
    so: 1324,
    customer_name: "tan siew mei",
    /* A supplier date already behind us — the amber exception. */
    po_arrivals: [arrival({ poId: "PO-2103", originalIso: "2026-08-20", plannedIso: "2026-08-20" })],
  }),
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
  order({
    id: "f",
    so: 1327,
    customer_name: "chong kah wai",
    delivery_date: "2026-09-18",
    delivery_floor: 3,
    delivery_has_lift: false,
    order_lines: [
      { id: "l-f1", sku: "mattress:M1401F-K", qty: 2, label: "Serena · King" },
      { id: "l-f2", sku: "Pillow soft", qty: 2 },
    ],
    order_addons: [{ addon_key: "dispose-mattress", qty: 1 }],
    allocated_units: [{ sku: "mattress:M1401F-K", status: "reserved", qty: 1 }],
    /* A supplier who MOVED the date: the new day leads, the original stays. */
    po_arrivals: [
      arrival({
        poId: "PO-2101",
        originalIso: "2026-09-14",
        plannedIso: "2026-09-14",
        reply: {
          answer: "delayed",
          aboutIso: "2026-09-14",
          previousIso: null,
          newIso: "2026-09-22",
          recordedAt: "2026-09-05T00:00:00Z",
        },
      }),
    ],
  }),
  order({
    id: "h",
    so: 1329,
    customer_name: "siti nurhaliza",
    delivery_date: "2026-09-11",
    order_addons: [{ addon_key: "STAIR_CARRY", qty: 2 }],
    /* NO CALCULATION — an open purchase order the arithmetic cannot date at
       all. Distinct from the two below, which the correction insists must not
       share one word (2026-09-11). */
    po_arrivals: [arrival({ poId: "PO-2102" })],
  }),
  /* ⭐ AN UNANSWERED ENQUIRY. The arithmetic HAS a date and the supplier has
     been asked about it; nobody has answered yet. That is not the same fact as
     "no date exists", and it is not the same as a supplier saying it is late. */
  order({
    id: "j",
    so: 1331,
    customer_name: "goh mei ling",
    delivery_date: "2026-09-16",
    po_arrivals: [
      arrival({ poId: "PO-2104", plannedIso: "2026-09-12", originalIso: "2026-09-12" }),
    ],
  }),
  /* ⭐ LATE, AND NO NEW DATE. The supplier answered — the evidence exists —
     and the answer contained no day. The row must say that rather than show
     the old date as if it still stood. */
  order({
    id: "k",
    so: 1332,
    customer_name: "sharifah aziz",
    delivery_date: "2026-09-17",
    po_arrivals: [
      arrival({
        poId: "PO-2105",
        originalIso: "2026-09-08",
        plannedIso: "2026-09-08",
        reply: {
          answer: "delayed",
          aboutIso: "2026-09-08",
          previousIso: null,
          newIso: null,
          recordedAt: "2026-09-06T00:00:00Z",
        },
      }),
    ],
  }),
  /* A supplier who CONFIRMED the date, and one who reported shipping. */
  order({
    id: "l",
    so: 1333,
    customer_name: "abdul rahman",
    delivery_date: "2026-09-19",
    po_arrivals: [
      arrival({
        poId: "PO-2106",
        originalIso: "2026-09-15",
        plannedIso: "2026-09-15",
        reply: {
          answer: "confirmed",
          aboutIso: "2026-09-15",
          previousIso: null,
          newIso: "2026-09-15",
          recordedAt: "2026-09-07T00:00:00Z",
        },
      }),
    ],
  }),
  /* ON HAND — every piece already allocated, so no supplier question is open
     and readiness is complete for THIS trip. */
  order({
    id: "m",
    so: 1334,
    customer_name: "yeoh chin huat",
    delivery_date: "2026-09-15",
    order_lines: [
      { id: "l-m1", sku: "mattress:M1401F-K", qty: 1, label: "Serena · King" },
      { id: "l-m2", sku: "sofa:S200-3", qty: 1, label: "Pisa · 3 seater" },
    ],
    allocated_units: [
      { sku: "mattress:M1401F-K", status: "reserved", qty: 1 },
      { sku: "sofa:S200-3", status: "reserved", qty: 1 },
    ],
  }),
  /* ⭐ A DATE WITH NO AGREED TIME. The correction's own case: a confirmed day
     is NOT a confirmed appointment, so the work stays open and the row says
     which half is missing. */
  order({
    id: "n",
    so: 1335,
    customer_name: "leong sook yee",
    delivery_date: "2026-09-14",
  }),
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
  /* ⭐ THE ADDRESS CORRECTION'S OWN ROW (2026-09-14) — production SO-1217 /
     TCF0541 exactly as the database holds it: a written AutoCount address,
     every structured column empty, no building type, floor 1, no lift. It is
     the shape 46 of the 89 addressed open scopes are in, and the shape that
     printed `Not recorded`, `Selangor` and `State not recorded` at once. */
  order({
    id: "tcf0541",
    so: 1217,
    customer_name: "lim wei sheng",
    source_system: "autocount",
    source_ref: ["TCF0541"],
    customer_address:
      "31,JALAN BK8/2B,ANGGUN, RESIDENCE,BANDAR KINRARA,, 43300 PUCHONG,SELANGOR, Puchong, Selangor",
    customer_address_line1: null,
    customer_address_city: null,
    customer_address_state: null,
    customer_address_postcode: null,
    building_type: null,
    delivery_floor: 1,
    delivery_has_lift: false,
    delivery_date: "2026-09-16",
  }),
  /* Its counterpart: an address nothing can be read out of. The warning has
     to survive, and the cell still may not call the address absent. */
  order({
    id: "ambiguous",
    so: 1246,
    customer_name: "tan mei ling",
    source_system: "autocount",
    customer_address: "Tuai Timur, Setia Alam",
    customer_address_line1: null,
    customer_address_city: null,
    customer_address_state: null,
    delivery_date: "2026-09-17",
  }),
];

const ROUTES: [ (url: string) => boolean, () => unknown ][] = [
  [(url) => url.includes("/api/operation/orders"), () => ({ orders: ORDERS })],
  /* The contact deadline's own working-day lead, and the catalog that NAMES
     an add-on — both shared reads the Monitor now makes. */
  [(url) => url.includes("/api/operation/purchasing/settings"), () => ({
    logisticsCallWorkingDays: 3,
    suppliers: [],
    productionDays: [],
  })],
  [(url) => url.includes("/api/catalog"), () => ({
    models: [],
    skus: [],
    fabrics: [],
    addons: [
      { key: "dispose-mattress", name: "Dispose old mattress", price: 80, active: true },
      { key: "STAIR_CARRY", name: "Stair carry", price: 0, active: true },
    ],
  })],
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
      /* ⭐ A DAY, AND NO TIME. Booked is BOTH — this one is half-answered, so
         it keeps its follow-up and never counts as a confirmed appointment. */
      arrangement({
        order_id: "n",
        partner_id: "p-nets",
        partner_name: "NETS",
        confirmed_date: "2026-09-14",
      }),
      arrangement({
        order_id: "m",
        partner_id: "p-nets",
        partner_name: "NETS",
        confirmed_date: "2026-09-15",
        confirmed_time: "09:00–11:00",
      }),
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
          <Route path="*" element={new URLSearchParams(window.location.search).has("shell") ? <OperationApp /> : <OperationDelivery />} />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);

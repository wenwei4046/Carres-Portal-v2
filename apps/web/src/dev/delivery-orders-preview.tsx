/**
 * DELIVERY ORDERS REGISTER PREVIEW — DEV ONLY (walk aid for the owner ruling
 * of 2026-09-11).
 *
 * Same contract as every other preview in this folder: the REAL
 * `DeliveryOrdersRegister`, the REAL stylesheet, the REAL DataGrid — only the
 * session is seeded and the canonical reads are answered by fixtures. A
 * separate vite entry that cannot reach production.
 *
 * THE FIXTURE WALKS THE CASES THE RULING HAS TO SURVIVE:
 *
 *   DO-A  delivered, 2 photos + 1 video of ITS OWN trip, signed DO on file
 *   DO-B  SAME Sales Order as DO-A, delivered, 1 photo of its own trip, no
 *         signed paper — the multi-document binding, which is the whole point
 *   DO-C  PARTIALLY delivered — the status line must name the outcome
 *   DO-D  FAILED — outcome + reason on the status line, no proof owed
 *   DO-E  out for delivery, no result recorded yet
 *   DO-F  cancelled (rescheduled)
 *   DO-G  an UNKNOWN ledger — no overlay row at all, so the cell says so
 *   DO-H  a file whose signed url cannot be minted, and a legacy entry that
 *         names no document at all
 */
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import DeliveryOrdersRegister from "@/pages/operation/DeliveryOrdersRegister";
import "@/index.css";

useAuth.setState({
  role: "operation",
  user: { email: "sha@carres.co" } as never,
});

const ORDER_1 = "00000000-0000-0000-0000-0000000a0001";
const ORDER_2 = "00000000-0000-0000-0000-0000000a0002";
const ORDER_3 = "00000000-0000-0000-0000-0000000a0003";
const ORDER_4 = "00000000-0000-0000-0000-0000000a0004";

/** One Sales Order, TWO delivery orders, ONE ledger — the defect's home. */
const SPLIT_LEDGER = [
  { path: "order/a1/a.jpg", at: "2026-09-05T10:00:00Z", by: null, doNumber: "DO-050926-0001", kind: "photo" },
  { path: "order/a1/b.jpg", at: "2026-09-05T10:01:00Z", by: null, doNumber: "DO-050926-0001", kind: "photo" },
  { path: "order/a1/c.mp4", at: "2026-09-05T10:02:00Z", by: null, doNumber: "DO-050926-0001", kind: "video" },
  { path: "order/a1/d.jpg", at: "2026-09-08T09:30:00Z", by: null, doNumber: "DO-080926-0002", kind: "photo" },
];

function orderEmbed(over: Record<string, unknown>) {
  return {
    id: ORDER_1,
    so: 1322,
    customer_name: "kong chai yin",
    customer_address_city: "Klang",
    customer_address_state: "Selangor",
    delivery_date: "2026-09-05",
    delivery_date_tbd: false,
    do_file_path: null,
    order_lines: [
      { id: "l-1", sku: "mattress:M1401F-K", qty: 1 },
      { id: "l-2", sku: "sofa:S200-3", qty: 2 },
    ],
    ops_order_control: null,
    ...over,
  };
}

const DELIVERY_ORDERS = [
  {
    id: "do-a",
    order_id: ORDER_1,
    do_number: "DO-050926-0001",
    issued_at: "2026-09-03T02:00:00Z",
    trip_groups: null,
    delivery_date: "2026-09-05",
    time_slot: "Afternoon (12pm–3pm)",
    logistics_partner: "NETS",
    voided_at: null,
    void_reason: null,
    orders: orderEmbed({
      do_file_path: "order-a1/signed.pdf",
      ops_order_control: { delivery_photos: SPLIT_LEDGER },
    }),
  },
  {
    id: "do-b",
    order_id: ORDER_1,
    do_number: "DO-080926-0002",
    issued_at: "2026-09-06T02:00:00Z",
    trip_groups: ["sofa"],
    delivery_date: "2026-09-08",
    time_slot: "Morning (9am–12pm)",
    logistics_partner: "NETS",
    voided_at: null,
    void_reason: null,
    orders: orderEmbed({
      do_file_path: null,
      ops_order_control: { delivery_photos: SPLIT_LEDGER },
    }),
  },
  {
    id: "do-c",
    order_id: ORDER_2,
    do_number: "DO-070926-0003",
    issued_at: "2026-09-04T02:00:00Z",
    trip_groups: null,
    delivery_date: "2026-09-07",
    time_slot: "Afternoon (12pm–3pm)",
    logistics_partner: "HOUZS",
    voided_at: null,
    void_reason: null,
    orders: orderEmbed({
      id: ORDER_2,
      so: 1325,
      customer_name: "lim wei jie",
      customer_address_city: "Petaling Jaya",
      delivery_date: "2026-09-07",
      ops_order_control: { delivery_photos: [] },
    }),
  },
  {
    id: "do-d",
    order_id: ORDER_3,
    do_number: "DO-060926-0004",
    issued_at: "2026-09-02T02:00:00Z",
    trip_groups: null,
    delivery_date: "2026-09-06",
    time_slot: null,
    logistics_partner: "HOUZS",
    voided_at: null,
    void_reason: null,
    orders: orderEmbed({
      id: ORDER_3,
      so: 1326,
      customer_name: "farah binti azman",
      customer_address_city: "Kota Kinabalu",
      customer_address_state: "Sabah",
      delivery_date: null,
      delivery_date_tbd: true,
      ops_order_control: { delivery_photos: [] },
    }),
  },
  {
    id: "do-e",
    order_id: ORDER_4,
    do_number: "DO-090926-0005",
    issued_at: "2026-09-07T02:00:00Z",
    trip_groups: null,
    delivery_date: "2026-09-09",
    time_slot: "Morning (9am–12pm)",
    logistics_partner: "NETS",
    voided_at: null,
    void_reason: null,
    orders: orderEmbed({
      id: ORDER_4,
      so: 1327,
      customer_name: "ng siew lan",
      customer_address_city: "Shah Alam",
      delivery_date: "2026-09-09",
      ops_order_control: { delivery_photos: [] },
    }),
  },
  {
    id: "do-f",
    order_id: ORDER_4,
    do_number: "DO-040926-0006",
    issued_at: "2026-09-01T02:00:00Z",
    trip_groups: null,
    delivery_date: null,
    time_slot: null,
    logistics_partner: null,
    voided_at: "2026-09-02T02:00:00Z",
    void_reason: "rescheduled",
    orders: orderEmbed({
      id: ORDER_4,
      so: 1327,
      customer_name: "ng siew lan",
      customer_address_city: "Shah Alam",
      delivery_date: "2026-09-09",
      ops_order_control: { delivery_photos: [] },
    }),
  },
  {
    id: "do-g",
    order_id: ORDER_2,
    do_number: "DO-020926-0007",
    issued_at: "2026-08-31T02:00:00Z",
    trip_groups: null,
    delivery_date: "2026-09-02",
    time_slot: "Afternoon (12pm–3pm)",
    logistics_partner: "NETS",
    voided_at: null,
    void_reason: null,
    /* No overlay row at all — the ledger never reached the screen. */
    orders: orderEmbed({
      id: ORDER_2,
      so: 1325,
      customer_name: "lim wei jie",
      customer_address_city: "Petaling Jaya",
      delivery_date: "2026-09-02",
      ops_order_control: null,
    }),
  },
  {
    id: "do-h",
    order_id: ORDER_3,
    do_number: "DO-010926-0008",
    issued_at: "2026-08-29T02:00:00Z",
    trip_groups: null,
    delivery_date: "2026-09-01",
    time_slot: "Morning (9am–12pm)",
    logistics_partner: "HOUZS",
    voided_at: null,
    void_reason: null,
    orders: orderEmbed({
      id: ORDER_3,
      so: 1326,
      customer_name: "farah binti azman",
      customer_address_city: "Kota Kinabalu",
      customer_address_state: "Sabah",
      delivery_date: "2026-09-01",
      do_file_path: "order-a3/signed.pdf",
      ops_order_control: {
        delivery_photos: [
          /* A file this document owns whose signed url cannot be minted. */
          { path: "order/a3/broken.jpg", at: "2026-09-01T12:00:00Z", by: null, doNumber: "DO-010926-0008", kind: "photo" },
          /* A legacy file that names NO document — counted for none. */
          { path: "order/a3/legacy.jpg", at: "2026-07-01T12:00:00Z", by: null },
        ],
      },
    }),
  },
];

const ATTEMPTS = [
  { do_number: "DO-050926-0001", result: "delivered", reason_key: null, recorded_at: "2026-09-05T14:00:00Z" },
  { do_number: "DO-080926-0002", result: "delivered", reason_key: null, recorded_at: "2026-09-08T11:00:00Z" },
  { do_number: "DO-070926-0003", result: "partial", reason_key: "lift_unavailable", recorded_at: "2026-09-07T15:00:00Z" },
  { do_number: "DO-060926-0004", result: "failed", reason_key: "customer_unreachable", recorded_at: "2026-09-06T15:00:00Z" },
  { do_number: "DO-020926-0007", result: "delivered", reason_key: null, recorded_at: "2026-09-02T15:00:00Z" },
  { do_number: "DO-010926-0008", result: "delivered", reason_key: null, recorded_at: "2026-09-01T15:00:00Z" },
];

const HANDOVER_EVENTS = [
  { delivery_order_id: "do-e", kind: "ready_for_handover" },
  { delivery_order_id: "do-e", kind: "handed_over" },
  { delivery_order_id: "do-e", kind: "received_by_logistics" },
];

/** A placeholder image so the gallery renders real elements rather than broken
 *  icons. DEV FIXTURE ONLY - it stands in for a driver's photo and is not a
 *  design surface, so it carries no kit token and no brand colour. */
const PIXEL =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="320"><rect width="320" height="320" fill="rgb(217,212,199)"/><text x="50%" y="50%" font-family="sans-serif" font-size="22" fill="rgb(90,83,71)" text-anchor="middle">delivery photo</text></svg>`,
  );

function signedLedger(orderId: string) {
  const ledger =
    orderId === ORDER_1
      ? SPLIT_LEDGER
      : orderId === ORDER_3
        ? [
            { path: "order/a3/broken.jpg", at: "2026-09-01T12:00:00Z", by: null, doNumber: "DO-010926-0008", kind: "photo" },
            { path: "order/a3/legacy.jpg", at: "2026-07-01T12:00:00Z", by: null },
          ]
        : [];
  return {
    photos: ledger.map((entry) => ({
      ...entry,
      /* The broken one deliberately fails to sign — a recorded fact whose
         url could not be minted is NAMED, never hidden. */
      url: entry.path.includes("broken") ? null : entry.kind === "video" ? "" : PIXEL,
    })),
  };
}

const ROUTES: Array<[(url: string) => boolean, (url: string) => unknown]> = [
  [
    (u) => u.includes("/api/operation/delivery-orders") && u.includes("signed-document"),
    () => ({ url: PIXEL, uploadedAt: "2026-09-05T16:00:00Z" }),
  ],
  [
    (u) => /\/api\/operation\/delivery-orders(\?|$)/.test(u),
    () => ({ deliveryOrders: DELIVERY_ORDERS, attempts: ATTEMPTS, handoverEvents: HANDOVER_EVENTS }),
  ],
  [
    (u) => u.includes("/delivery-photos"),
    (u) => signedLedger(u.split("/orders/")[1]?.split("/")[0] ?? ""),
  ],
  [(u) => u.includes("/expansion"), () => ({ lines: [] })],
];

const realFetch = window.fetch.bind(window);
window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  const url =
    typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  const route = ROUTES.find(([test]) => test(url));
  if (route) {
    return new Response(JSON.stringify(route[1](url)), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }
  if (url.includes("/api/")) return new Response(JSON.stringify({}), { status: 404 });
  return realFetch(input, init);
};

const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={qc}>
      <BrowserRouter>
        <Routes>
          <Route path="*" element={<DeliveryOrdersRegister />} />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);

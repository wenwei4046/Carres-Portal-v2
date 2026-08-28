/**
 * WORK · ACTION OWNER ENGINE PREVIEW — DEV ONLY.
 *
 * The same contract as `so-batch-preview.tsx`: the REAL component, the REAL
 * stylesheet, only the inputs seeded instead of fetched. It exists to walk the
 * §0.1 Action Owner Engine resolution (built 2026-08-27) without a login:
 *
 *   · `Issue PO` under the PO-duty holder (Yu Jun), never the PIC
 *   · the never-asked missing date under the SALESPERSON'S NAME (Mei Ling)
 *   · the PIC (Shasha) keeping delivery/collect work — collect as governed
 *     cover for the roster-less payment duty
 *   · the loan collection under the duty word `Delivery staff`
 *
 * A separate vite entry (`work-preview.html`), not a route: `vite build` only
 * emits `index.html`'s graph, so this cannot reach production. The fetch stub
 * answers ONLY the API reads the page performs; every unmatched path 404s.
 */
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import OperationWork from "@/pages/operation/OperationWork";
import "@/index.css";

const OP_UID = "00000000-0000-0000-0000-0000000000aa"; // Shasha — the PIC
const DUTY_UID = "00000000-0000-0000-0000-0000000000bb"; // Yu Jun — PO duty

const STAFF = {
  staff: [
    {
      user_id: OP_UID,
      email: "sha@carres.co",
      name: "Shasha",
      pooled: true,
      available: true,
      note: null,
      last_seen_at: null,
      duties: [],
    },
    {
      user_id: DUTY_UID,
      email: "yj@carres.co",
      name: "Yu Jun",
      pooled: true,
      available: true,
      note: null,
      last_seen_at: null,
      duties: [],
    },
  ],
  myDuties: [],
};

const baseRow = {
  status: "proceed_order",
  operation_stage: "ready_to_dispatch",
  warehouse_id: null,
  customer_phone: null,
  customer_address: null,
  placed_at: "2026-08-20T00:00:00Z",
  delivery_date: "2026-09-05",
  delivery_date_tbd: false,
  source_system: null,
  source_ref: null,
  ops_assigned_logistic: null,
  order_lines: [],
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
  ops_order_control: [{ assigned_staff: OP_UID }],
};

const ORDERS = {
  orders: [
    // Unordered goods + money owing: Issue PO → Yu Jun (PO duty);
    // Assign logistics + Collect → Shasha (PIC / governed cover).
    {
      ...baseRow,
      id: "o-1318",
      so: 1318,
      customer_name: "kong chai yin",
      operation_stage: "placed",
      order_lines: [{ sku: "B1201S-K", qty: 1, unit_price: 2499 }],
      paid: 500,
    },
    // Never asked for a date: Ask for the delivery date → Mei Ling
    // (salesperson — a name, not an ops account).
    {
      ...baseRow,
      id: "o-1319",
      so: 1319,
      customer_name: "lim kuan yang",
      delivery_date: null,
      delivery_date_tbd: false,
      salespersons: { name: "Mei Ling" },
    },
    // Delivered with the loan still out: Collect the loan item →
    // `Delivery staff` (duty word — no roster fact exists).
    {
      ...baseRow,
      id: "o-1320",
      so: 1320,
      customer_name: "tan siew mei",
      status: "delivered",
      operation_stage: "delivered",
      delivered_at: "2026-08-25T04:00:00Z",
      ops_sofa_loans: [{ status: "on_loan" }],
    },
  ],
};

const PO_DUTY = {
  month: "2026-08",
  holder: { userId: DUTY_UID, email: "yj@carres.co", name: "Yu Jun", assignedBy: null },
};

const FIXTURES: [RegExp, unknown][] = [
  [/\/api\/operation\/orders(\?|$)/, ORDERS],
  [/\/api\/operation\/staff$/, STAFF],
  [/\/api\/operation\/stock$/, { skus: [] }],
  [/\/api\/operation\/partners$/, { partners: [] }],
  [/\/api\/operation\/po-duty$/, PO_DUTY],
];

const realFetch = globalThis.fetch.bind(globalThis);
globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  for (const [re, body] of FIXTURES) {
    if (re.test(url)) {
      return new Response(JSON.stringify(body), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
  }
  if (url.includes("/api/")) {
    return new Response(JSON.stringify({ message: "not seeded" }), { status: 404 });
  }
  return realFetch(input, init);
};

// The page reads only role + user.email from the store; a signed-in operation
// account is seeded directly — no Supabase session exists in this preview.
useAuth.setState({
  role: "operation",
  user: { email: "sha@carres.co" } as never,
});

const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={["/operation?tab=work&scope=team"]}>
        <div className="flex h-screen flex-col">
          <OperationWork />
        </div>
      </MemoryRouter>
    </QueryClientProvider>
  </StrictMode>,
);

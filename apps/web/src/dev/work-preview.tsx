/**
 * WORK PREVIEW — DEV ONLY.
 *
 * The REAL Work page and stylesheet over a seeded v2 Work feed
 * (`/api/operation/work`), so the left rail can be walked and measured without
 * a login: Thu 17 Sep is today, Wed 16 Sep is Malaysia Day, and the opening
 * URL chooses Wed so today's blue badge and the chosen pale-blue row can be
 * seen apart. Every party, date and number here is invented.
 *
 * A separate vite entry (`work-preview.html`), not a route: `vite build` only
 * emits `index.html`'s graph, so this cannot reach production. The fetch stub
 * answers ONLY the Work read; every other API path 404s.
 */
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { OperationWorkItem, OperationWorkModule, OperationWorkResponse } from "@carres/shared";
import { addWorkingDays, myHolidaySet } from "@carres/shared";
import { useAuth } from "@/lib/auth";
import { appTodayIso } from "@/lib/fmt-date";
import OperationWork from "@/pages/operation/OperationWork";
import PreviewFrame from "./preview-frame";
import "@/index.css";

const ME = "00000000-0000-4000-8000-0000000000aa";
const TODAY = "2026-09-17";

let seq = 0;
type Words = { problem: string; action: string; recipient: string | null; ref?: string };
const WORDS: Record<OperationWorkModule, Words[]> = {
  orders: [
    { problem: "No delivery date", action: "Ask customer for a delivery date", recipient: "Tan Qu Qu" },
    { problem: "Customer asked to change the sofa colour after the order was confirmed", action: "Confirm the new colour with the customer", recipient: "Lim Mei Ling" },
  ],
  purchasing: [
    { problem: "Supplier has not confirmed the PO", action: "Chase the supplier for PO confirmation", recipient: "Dreamland Factory", ref: "PO2609-1042" },
    { problem: "Production date not set", action: "Ask the factory for a production date", recipient: "Sleepwell Sdn Bhd", ref: "PO2609-1057" },
  ],
  receiving: [{ problem: "Goods arrived without a GRN", action: "Record the goods received", recipient: "Warehouse Klang", ref: "PO2609-1031" }],
  delivery: [
    { problem: "Not delivered", action: "Arrange a new delivery date", recipient: "NETS" },
    { problem: "Delivery proof needs review", action: "Review the delivery proof", recipient: "AL Logistic", ref: "DO2609-20411" },
  ],
  payment: [{ problem: "Customer balance due", action: "Ask customer to pay", recipient: "Wong Kah Wai" }],
  issue_tracker: [{ problem: "Issue waiting for a reply", action: "Reply to the issue", recipient: null }],
};
const used: Partial<Record<OperationWorkModule, number>> = {};

function item(module: OperationWorkModule, actionOn: string | null, missedDays = 0): OperationWorkItem {
  const n = used[module] ?? 0;
  used[module] = n + 1;
  const words = WORDS[module][n % WORDS[module].length];
  seq += 1;
  const id = `obj-${seq}`;
  return {
    contractVersion: 2,
    id: `${module}:${id}:follow`,
    module,
    ruleKey: "follow",
    ruleVersion: 1,
    object: { kind: module === "purchasing" || module === "receiving" ? "purchase_order" : "sales_order", id, label: words.ref ?? `SO2609-${4800 + seq}` },
    problem: words.problem,
    action: words.action,
    recipient: words.recipient,
    requiredResult: "Customer Delivery exists",
    completionPredicate: "orders.delivery_date exists",
    completionStatement: "Customer Delivery exists",
    owner: {
      rule: "salesperson",
      dutyKey: null,
      normal: { userId: ME, name: "Shasha" },
      activeCover: null,
      coverEvidence: null,
      acting: { userId: ME, name: "Shasha" },
      state: "primary",
    },
    timing: {
      businessDueOn: actionOn,
      actionOn,
      placement: actionOn === null ? "no_working_date" : missedDays > 0 ? "missed" : "on_day",
      missedAge: {
        state: "counted",
        workingDays: missedDays,
        basis: { calendarKey: "module+person", from: actionOn ?? TODAY, to: TODAY },
      },
      eligibility: "eligible",
      noDateReason: actionOn === null ? "The owning rule has no working date" : null,
      calendar: {
        module: { key: module, source: module, state: "ready" },
        actor: { key: "person:shasha", source: "people", state: "ready" },
        holidayName: null,
      },
    },
    communication: null,
    blocker: null,
    nextConsequence: null,
    interaction: { mode: "open_module", fallbackDestination: `/operation/orders/so/${id}` },
    destination: `/operation/orders/so/${id}`,
    observedAt: `${TODAY}T01:00:00.000Z`,
    sourceVersion: `${TODAY}T01:00:00.000Z`,
    tone: "warning",
    locked: false,
    broken: false,
  };
}

const FEED: OperationWorkResponse = {
  contractVersion: 2,
  complete: true,
  generatedOn: TODAY,
  closureReceipt: null,
  staff: [{ userId: ME, name: "Shasha", email: "sha@carres.co" }],
  sources: (["orders", "purchasing", "receiving", "delivery", "payment", "issue_tracker"] as const).map((key) => ({
    key,
    state: "healthy" as const,
    observedAt: `${TODAY}T01:00:00.000Z`,
    lastSuccessfulAt: `${TODAY}T01:00:00.000Z`,
    errorLabel: null,
  })),
  items: [
    item("purchasing", "2026-09-10", 5),
    item("delivery", "2026-09-11", 4),
    item("payment", "2026-09-09", 6),
    item("orders", "2026-09-15"),
    item("receiving", "2026-09-15"),
    item("purchasing", "2026-09-16"),
    item("delivery", "2026-09-16"),
    item("delivery", "2026-09-16"),
    item("orders", "2026-09-16"),
    item("payment", TODAY),
    item("delivery", "2026-09-18"),
    item("purchasing", "2026-09-18"),
    item("orders", null),
    item("payment", null),
  ],
};

// One covered job (Wed 16 Sep, Delivery · NETS): Shasha acts for Li Ching
// today, so the card footer carries `Covered for Li Ching` beside its number.
const coveredItem = FEED.items.find((i) => i.module === "delivery" && i.timing.actionOn === "2026-09-16" && i.recipient === "NETS");
if (coveredItem) {
  coveredItem.owner = {
    ...coveredItem.owner,
    normal: { userId: "00000000-0000-4000-8000-0000000000bb", name: "Li Ching" },
    activeCover: { userId: ME, name: "Shasha" },
    coverEvidence: { id: "cover-1", startsOn: TODAY, endsOn: TODAY },
    acting: { userId: ME, name: "Shasha" },
    state: "covered",
  };
}

/* ── THE LOGISTICS CARD SEED (owner rulings 2026-09-24) ─────────────────────
   The first missed Delivery job names ONE Sales Order, so the right panel draws
   its party cards. `?lc=` picks the state: `none` (no company), `link`
   (AL Logistics, active link, details received, scheduled Mon 21 Sep), or the
   default — AL Logistics, no link yet, the 3-day check due today and money
   owed on an outstation delivery. Every name, date and number is invented. */
const ORDER = "00000000-0000-4000-8000-00000000c001";
/* Dated from the machine's own today so the checks read true on any day the
   preview is opened: the requested date is 3 working days out. */
const REAL_TODAY = appTodayIso();
const REQUESTED = addWorkingDays(REAL_TODAY, 3, { holidays: myHolidaySet() });
const lc = new URLSearchParams(window.location.search).get("lc") ?? "due";
const firstDelivery = FEED.items.find((i) => i.module === "delivery");
if (firstDelivery) {
  firstDelivery.object = { kind: "delivery_scope", id: ORDER, label: "SO-1362" };
  firstDelivery.id = "delivery:SO-1362:confirm_delivery_date";
  firstDelivery.ruleKey = "confirm_delivery_date";
  firstDelivery.problem = "The delivery is not scheduled";
  firstDelivery.action = "Call AL Logistics";
  firstDelivery.recipient = "AL Logistics";
}
const AL = "00000000-0000-4000-8000-00000000d001";
const withPartner = lc !== "none";
const scheduled = lc === "link";
const ORDERS = {
  orders: [
    {
      id: ORDER, so: 1362, status: "proceed_order", operation_stage: "ready_to_dispatch", warehouse_id: null,
      customer_name: "LIM KUAN YANG", customer_phone: "012-345 6789", customer_email: "kuanyang.lim@example.com",
      customer_address: "12 Jalan Sekolah, 41000 Klang, Selangor", customer_address_city: "Klang", customer_address_state: "Selangor",
      building_type: "Condo", delivery_floor: 7, delivery_has_lift: true,
      placed_at: "2026-09-01T02:00:00Z", proceeded_at: "2026-09-01T02:00:00Z",
      delivery_date: REQUESTED, delivery_date_tbd: false, source_system: null, source_ref: ["TCF0541"],
      ops_assigned_logistic: null,
      order_lines: [{ id: "l-1", sku: "mattress:M1401F-K", qty: 1, unit_price: 2450 }, { id: "l-2", sku: "bedframe:B1201S-K", qty: 1, unit_price: 1800 }],
      order_addons: [], paid: 3000, delivery_partner_id: null, request_for_delivery_at: null, partner_accepted_at: null,
      partner_rejected_at: null, partner_rejected_reason: null, delivery_partners: null, do_number: null, dispatched_at: null,
      delivered_at: null, outlet_id: null, dealer_id: "d-1", dealers: { name: "Carres KL" }, order_supplier_threads: [],
      order_annotations: [], order_finance_exceptions: [], ops_delivery_orders: [],
    },
  ],
};
const ARRANGEMENTS = {
  arrangements: withPartner
    ? [{
        id: "arr-1", order_id: ORDER, leg: 0, partner_id: AL, partner_name: "AL Logistics",
        confirmed_date: scheduled ? REQUESTED : null, confirmed_time: null, expected_arrival: null, logistics_note: null,
        reply_proof_path: null, driver_name: scheduled ? "Ali" : null, vehicle: scheduled ? "VBA 1234" : null,
        condo_registration: null, updated_at: "2026-09-15T02:00:00Z", updated_by: null,
      }]
    : [],
  events: [],
  contacts: [] as Array<Record<string, unknown>>,
};

/* ── THE REST OF THE RIGHT PANEL (owner approval 2026-09-25, §5.10) ──────────
   `?cm=` — the Customer: `operation` (Carres calls; default), `waiting`
   (Record as sent yesterday), `partner` (the company calls).
   `?sp=` — the Suppliers: `three` (default: one delayed, one expected, one
   not issued), `none` (no PO), `received`. `?loan=1` adds a loan offer. */
const cm = new URLSearchParams(window.location.search).get("cm") ?? "operation";
const sp = new URLSearchParams(window.location.search).get("sp") ?? "three";
const loanOn = new URLSearchParams(window.location.search).get("loan") === "1";
if (cm === "waiting") {
  ARRANGEMENTS.contacts.push({
    id: "c-1", order_id: ORDER, leg: 0, purpose_key: "confirm_delivery_date", channel: "whatsapp", contacted_person: "customer",
    contact_owner_user_id: ME, acting_user_id: ME, contacted_at: `${REAL_TODAY}T02:42:00Z`, result_key: "waiting_for_customer_reply",
    reply_evidence_path: null, next_action: null, note: "Template: Confirm delivery date", on_behalf_of_partner_id: null, recorded_by: ME, recorded_at: `${REAL_TODAY}T02:42:00Z`,
  });
}
const plusDays = (n: number) => addWorkingDays(REAL_TODAY, n, { holidays: myHolidaySet() });
/* The feed's Waiting fact — what the server derives from that contact. */
if (cm === "waiting" && firstDelivery) {
  firstDelivery.timing = { ...firstDelivery.timing, actionOn: TODAY, businessDueOn: TODAY, placement: "on_day", missedAge: { state: "counted", workingDays: 0, basis: { calendarKey: "module+person", from: TODAY, to: TODAY } } };
  firstDelivery.communication = { channel: "whatsapp", recipient: "Lim Kuan Yang", sentAt: `${REAL_TODAY}T02:42:00.000Z`, replyState: "waiting", replyDueOn: plusDays(1) };
}
const SUPPLIERS = sp === "none"
  ? []
  : sp === "received"
    ? [{ poNo: "PO260910-4827", supplier: "Hookka Industries", issued: true, originalIso: plusDays(-2), effectiveIso: plusDays(-2), reply: null, supplierDo: { number: "DO-5531", atIso: `${plusDays(-3)}T02:00:00Z` }, deliverTo: "Carres Klang Warehouse", grnIso: plusDays(-2), orderedQty: 2, receivedQty: 2, lines: [{ sku: "mattress:M1401F-K", qty: 1 }] }]
    : [
        { poNo: "PO260910-4827", supplier: "Sleepwell", issued: true, originalIso: plusDays(1), effectiveIso: plusDays(6), reply: { answer: "delayed", reason: "Production Delay", evidence: "arrangement/wa-1.jpg", recordedAtIso: `${REAL_TODAY}T01:00:00Z` }, supplierDo: null, deliverTo: "Carres Klang Warehouse", grnIso: null, orderedQty: 1, receivedQty: 0, lines: [{ sku: "mattress:M1401F-K", qty: 1 }] },
        { poNo: "PO260911-1188", supplier: "ABC Furniture", issued: true, originalIso: plusDays(2), effectiveIso: plusDays(2), reply: null, supplierDo: null, deliverTo: "Carres Klang Warehouse", grnIso: null, orderedQty: 1, receivedQty: 0, lines: [{ sku: "bedframe:B1201S-K", qty: 1 }] },
        { poNo: "PO260912-2044", supplier: "XYZ Bedding", issued: false, originalIso: null, effectiveIso: null, reply: null, supplierDo: null, deliverTo: "Carres Klang Warehouse", grnIso: null, orderedQty: 2, receivedQty: 0, lines: [{ sku: "pillow:P01", qty: 2 }] },
      ];
let linkActive = lc === "link";
const facts = () => ({
  partner: withPartner ? { id: AL, name: "AL Logistics", hasPortal: false, kvDefault: false } : null,
  routes: [{
    key: "supplier_to_logistics", place: "AL Sungai Buloh",
    purchaseOrders: [{ poNo: "PO260910-4827", supplier: "Hookka Industries", poDeliveryDate: "2026-09-18", receivedDate: scheduled ? "2026-09-17" : null }],
    readyUnits: 0,
  }],
  link: linkActive
    ? { id: "link-1", token: "q4lB6xN2c8Yd0VhS7pZ1tR5mWfK3aJ9eUgL0oHnC2vE", createdAt: "2026-09-15T03:00:00Z", createdByName: "Shasha", firstOpenedAt: "2026-09-15T06:10:00Z", lastOpenedAt: "2026-09-16T01:40:00Z" }
    : null,
  lastRevokedAt: null,
  detailsReceivedAt: linkActive ? "2026-09-15T06:10:00Z" : null,
  answer: null,
  history: withPartner
    ? [
        ...(scheduled ? [{ event: "arrangement_saved", at: "2026-09-16T01:42:00Z", source: "external_link", who: "AL Logistics via external link", detail: REQUESTED }] : []),
        { event: "assigned", at: "2026-09-15T02:00:00Z", source: "operation", who: "Shasha", detail: "AL Logistics" },
      ]
    : [],
});
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

const realFetch = globalThis.fetch.bind(globalThis);
globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  if (/\/api\/operation\/work(\?|$)/.test(url)) {
    return new Response(JSON.stringify(FEED), { status: 200, headers: { "Content-Type": "application/json" } });
  }
  if (/\/api\/operation\/orders(\?|$)/.test(url)) return json(ORDERS);
  if (/\/api\/operation\/partners(\?|$)/.test(url)) return json({ partners: [{ id: AL, name: "AL Logistics", whatsapp_group_url: "https://chat.whatsapp.com/example", customer_contact_by: cm === "partner" ? "partner" : "operation" }] });
  if (/\/api\/operation\/pos\/for-order\//.test(url)) return json({ purchaseOrders: SUPPLIERS });
  if (/\/loan-offers/.test(url)) return json({ offers: loanOn ? [{ id: "lo-1", seq: 1, order_id: ORDER, event: "offered", item_id: null, label: "Loan sofa", reason: null, recorded_by: ME, recorded_at: `${REAL_TODAY}T01:00:00Z`, unit_id: null }] : [] });
  if (/\/api\/operation\/staff(\?|$)/.test(url)) return json({ staff: [{ user_id: ME, email: "sha@carres.co", name: "Shasha", pooled: true, available: true, note: null, last_seen_at: null, duties: [] }], myDuties: [] });
  if (/\/api\/operation\/suppliers(\?|$)/.test(url)) return json({ suppliers: [{ id: "s-1", name: "Sleepwell", kind: "own_logistics", cat_covered: [], lead_time: null, contact: null, whatsapp_group_url: "https://chat.whatsapp.com/sleepwell" }] });
  if (/\/contacts\?/.test(url) && init?.method === "POST") {
    const body = JSON.parse(String(init.body ?? "{}")) as Record<string, unknown>;
    ARRANGEMENTS.contacts.push({
      id: `c-${ARRANGEMENTS.contacts.length + 2}`, order_id: ORDER, leg: 0, purpose_key: body.purpose, channel: body.channel, contacted_person: body.contactedPerson,
      contact_owner_user_id: ME, acting_user_id: ME, contacted_at: new Date().toISOString(), result_key: body.result,
      reply_evidence_path: body.replyEvidencePath ?? null, next_action: null, note: body.note ?? null, on_behalf_of_partner_id: null, recorded_by: ME, recorded_at: new Date().toISOString(),
    });
    return json({ contact: { id: "c-new" } });
  }
  if (/\/api\/operation\/delivery-arrangements(\?|$)/.test(url)) return json(ARRANGEMENTS);
  if (/\/api\/operation\/delivery-orders(\?|$)/.test(url)) return json({ deliveryOrders: [], attempts: [], handoverEvents: [], proofReviews: [], attemptEvidence: [] });
  if (/\/logistics-card/.test(url)) return json(facts());
  if (/\/link\/revoke/.test(url)) { linkActive = false; return json({ revoked: true }); }
  if (/\/link(\?|$)/.test(url)) { linkActive = true; return json({ link: { id: "link-1" } }, 201); }
  if (url.includes("/api/")) return new Response(JSON.stringify({ message: "not seeded" }), { status: 404 });
  return realFetch(input, init);
};

useAuth.setState({ role: "operation", user: { id: ME, email: "sha@carres.co" } as never });

const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
const start = new URLSearchParams(window.location.search).get("at")
  ?? "/operation?tab=work&day=missed&selected=delivery%3ASO-1362%3Aconfirm_delivery_date";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[start]}>
        <PreviewFrame label="Work shell and middle cards (illustrative data)">
          <div className="flex h-full flex-col">
            <OperationWork />
          </div>
        </PreviewFrame>
      </MemoryRouter>
    </QueryClientProvider>
  </StrictMode>,
);

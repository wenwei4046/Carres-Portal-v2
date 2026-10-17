/** DEV ENTRY ONLY; absent from index.html/build graph. Same owning Workspace and
 * object, explicit default-off props. In-memory TEST transport, no SQL/provider;
 * this proves actual page/PDF/keyboard rendering, not production or DB lifecycle. */
import { useState } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { PurchaseRequestContext } from "@carres/shared";
import { useAuth } from "@/lib/auth";
import { CreateRequestWorkspace, ManualPurchaseObject } from "@/pages/operation/OperationManualPurchase";
import "@/index.css";
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12,"0")}`;
const purpose = new URLSearchParams(location.search).get("purpose") === "rs" ? "ready_stock" : "general_purchase";
const initial: PurchaseRequestContext = { version: 1, origin: purpose === "ready_stock" ? "stock_request" : "manual", purpose, proceedDate: "2026-10-18", stockDeliveryDate: purpose === "ready_stock" ? "2026-12-01" : null,
  serviceCaseId: null, reason: purpose === "general_purchase" ? "company_use" : null, companyPersonName: "", projectReference: "", explanation: "", forecastChangeReason: "",
  recipients: purpose === "ready_stock" ? [] : [{ id: id(1), name: "TEST recipient", company: "TEST organisation", phone: "TEST phone", method: "self_pickup", deliveryDate: "2026-12-01", addressLine1: "", addressLine2: "", city: "", state: "", postcode: "", buildingType: "", floor: "", lift: null, pickupLocationId: id(3), collectedBy: "TEST collector" }],
  lines: [{ id: id(4), sku: "TEST-SKU", qty: purpose === "ready_stock" ? 500 : 5, attrs: null,
    recipientNeeds: purpose === "ready_stock" ? [] : [{ recipientId: id(1), qty: 5 }], stockProposals: [],
    allocations: [{ id: id(5), destinationId: id(3), supplierDeliveryDate: "2026-11-20", qty: purpose === "ready_stock" ? 500 : 5, recipients: purpose === "ready_stock" ? [] : [{ recipientId: id(1), qty: 5 }] }] }] };
let stored = structuredClone(initial); let approved = false; let version = 1;
const destinations = [{ id: id(3), name: "TEST Carres Klang", address: "TEST warehouse address" }];
const offers = [{ lineId: id(4), locationId: id(20), destinationId: id(3), name: "TEST Carres Klang", available: 2,
  units: [21,22].map(n => ({ id: id(n), qty: 1, warehouse_id: id(20), condition: "new" })) }];
const realFetch = window.fetch.bind(window);
let submissions = 0;
(window as unknown as { __mprContext: unknown }).__mprContext = { snapshot: () => ({ stored, approved, version, submissions }) };
window.fetch = async (input, init) => {
  const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url, location.origin);
  if (!url.pathname.startsWith("/api/")) return realFetch(input, init);
  const path = url.pathname;
  let result: unknown = {};
  if (path.endsWith("/demand/pick-items")) result = { items: [{ sku: "TEST-SKU", label: "TEST mattress", supplier: "TEST supplier", category: "mattress", free: 2 }] };
  else if (path.startsWith("/api/catalog")) result = { skus: [], models: [], sofaFabrics: [] };
  else if (path.startsWith("/api/ops/service-cases")) result = { items: [] };
  else if (path.endsWith("/stock-offers")) result = { offers };
  else if (path.endsWith("/plan")) result = { proceedDate: "2026-10-18", recipientEarliest: "2026-11-17", recipientPlanUnavailable: false, planUnavailable: false,
    deliveryDateDefault: "2026-11-01", lines: [{ sku: "TEST-SKU", supplierId: id(7), supplierName: "TEST supplier", category: "mattress", productionDays: 7, arrival: "2026-11-01" }] };
  else if (path.endsWith("/purchasing/requests") && init?.method === "POST") {
    stored = JSON.parse(String(init.body)).context; submissions++; result = { id: id(10), req_no: "TEST-GP", request_version: version, approval_required: true };
  } else if (path.endsWith("/context-review")) result = { available: true, review: { request_version: version, state: { context: stored }, stock_source: [], stock_offers: offers }, events: [], coverage: approved ? [] : null, approval: approved ? { request_version: version, approval_version: version, token: "a".repeat(32) } : null };
  else if (path.endsWith("/decide")) { const body = JSON.parse(String(init?.body)); if (JSON.stringify(stored) !== JSON.stringify(body.contextReview.context)) version++; stored = body.contextReview.context; approved = true; result = { id: id(10), decision: "approved", request_version: version }; }
  else if (path.includes("/requests/detail/")) result = {
    request: { id: id(10), req_no: "TEST-GP", purpose: stored.purpose, destination_id: id(3), required_by: "2026-12-01", approval_required: true,
      approved_at: approved ? "2026-10-18T00:00:00Z" : null, approved_by: approved ? id(99) : null, refused_at: null, refused_by: null, refuse_reason: null,
      created_by: id(98), created_at: "2026-10-17T00:00:00Z", for_service_case_id: null, for_staff_user_id: null, for_subsidiary_name: null,
      fulfilment_intent: "concrete_need", request_context: stored, request_version: version, proceed_date: stored.proceedDate },
    requested_by_name: "TEST requester", requested_by_user_id: id(98), canWithdraw: false, canEditAndSendAgain: false,
    lines: [{ id: id(6), request_id: id(10), request_line_id: id(4), supplier_allocation_id: id(5), sku: "TEST-SKU", supplier_id: id(7), destination_id: id(3), qty: stored.lines[0].qty,
      approved_qty: approved ? stored.lines[0].qty : null, issued_qty: 0, remaining_qty: stored.lines[0].qty, required_by: "2026-11-20", attrs: null, po_id: null, cancelled_at: null, received: false }],
    pos: [], history: [], destinations, suppliers: [{ id: id(7), name: "TEST supplier" }], users: [], approvers: [{ id: id(99), name: "TEST approver" }], canApprove: false, context_can_approve: true, todayIso: "2026-10-18",
  };
  return new Response(JSON.stringify(result), { status: 200, headers: { "content-type": "application/json" } });
};
useAuth.setState({ role: "operation", hydrated: true, loading: false, user: { id: id(98), email: "test@example.test" } as never,
  session: { access_token: "TEST-memory-only", user: { id: id(98) } } as never });
function Preview() {
  const [context, setContext] = useState(initial); const [object, setObject] = useState(false);
  return <div className="flex h-screen min-h-0 flex-col bg-base-100">{object ? <ManualPurchaseObject id={id(10)} contextFlow
    registerHeading={null} position={null} onStep={() => {}} onBack={() => setObject(false)} onEditAndSendAgain={() => {}} /> : <CreateRequestWorkspace editId={null}
    destinations={destinations} defaultDestinationId={null} supplierCollections={[]} suppliers={[{ name: "TEST supplier", address: "TEST supplier address" }]}
    staff={[{ id: id(98), name: "TEST requester" }]} minDeliveryDays={30} todayIso="2026-10-18" onDone={request => { if (request) setObject(true); }}
    contextDraft={{ value: context, onChange: setContext, pickupLocations: destinations }} />}</div>;
}
createRoot(document.getElementById("root")!).render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })}><MemoryRouter initialEntries={["/operation?tab=manual-purchase"]}><Preview /></MemoryRouter></QueryClientProvider>);

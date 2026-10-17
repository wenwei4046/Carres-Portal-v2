/** DEV ENTRY ONLY; absent from index.html/build graph. Same owning Workspace and
 * object, explicit default-off props. In-memory TEST transport, no SQL/provider;
 * this proves actual page/PDF/keyboard rendering, not production or DB lifecycle. */
import { useState } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { PurchaseRequestContext } from "@carres/shared";
import { useAuth } from "@/lib/auth";
import PurchaseOrdersPage from "@/pages/operation/purchase-orders/PurchaseOrdersPage";
import OperationManualPurchase, { CreateRequestWorkspace, ManualPurchaseObject } from "@/pages/operation/OperationManualPurchase";
import "@/index.css";
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12,"0")}`;
const localSeed = (window as unknown as { __mprLocalSeed?: { context: PurchaseRequestContext; destinations: Array<{ id: string; name: string; address?: string | null }>; suppliers: Array<{ name: string; address?: string | null }>; users: Array<{ id: string; name: string | null }>; actor: { id: string; role: "operation" | "principal"; email: string } } }).__mprLocalSeed;
const localTransport = new URLSearchParams(location.search).get("transport") === "local";
const purpose = localSeed?.context.purpose ?? (new URLSearchParams(location.search).get("purpose") === "rs" ? "ready_stock" : "general_purchase");
const initial: PurchaseRequestContext = localSeed?.context ?? { version: 1, origin: purpose === "ready_stock" ? "stock_request" : "manual", purpose, proceedDate: "2026-10-18", stockDeliveryDate: purpose === "ready_stock" ? "2026-12-01" : null,
  serviceCaseId: null, reason: purpose === "general_purchase" ? "company_use" : null, companyPersonName: "", projectReference: "", explanation: "", forecastChangeReason: "",
  recipients: purpose === "ready_stock" ? [] : [{ id: id(1), name: "TEST recipient", company: "TEST organisation", phone: "TEST phone", method: "self_pickup", deliveryDate: "2026-12-01", addressLine1: "", addressLine2: "", city: "", state: "", postcode: "", buildingType: "", floor: "", lift: null, pickupLocationId: id(3), collectedBy: "TEST collector" }],
  lines: [{ id: id(4), sku: "TEST-SKU", qty: purpose === "ready_stock" ? 500 : 5, attrs: null,
    recipientNeeds: purpose === "ready_stock" ? [] : [{ recipientId: id(1), qty: 5 }], stockProposals: [],
    allocations: [{ id: id(5), destinationId: id(3), supplierDeliveryDate: "2026-11-20", qty: purpose === "ready_stock" ? 500 : 5, recipients: purpose === "ready_stock" ? [] : [{ recipientId: id(1), qty: 5 }] }] }] };
let stored = structuredClone(initial); let approved = false; let version = 1;
const destinations = localSeed?.destinations ?? [{ id: id(3), name: "TEST Carres Klang", address: "TEST warehouse address" }];
const offers = [{ lineId: id(4), locationId: id(20), destinationId: id(3), name: "TEST Carres Klang", available: 2,
  units: [21,22].map(n => ({ id: id(n), qty: 1, warehouse_id: id(20), condition: "new" })) }];
const realFetch = window.fetch.bind(window);
const poEntry=new URLSearchParams(location.search).get("entry")==="po";
const poEntryId=new URLSearchParams(location.search).get("po")??"";
const registerEntry = new URLSearchParams(location.search).get("entry") === "register";
let issuedQty = 0; let lastIssue: unknown = null;
let submissions = registerEntry ? 1 : 0;
if (registerEntry) approved = true;
(window as unknown as { __mprContext: unknown }).__mprContext = { snapshot: () => ({ stored, approved, version, submissions, issuedQty, lastIssue }) };
const detailFacts = () => ({
    request: { id: id(10), req_no: "TEST-GP", purpose: stored.purpose, destination_id: id(3), required_by: "2026-12-01", approval_required: true,
      approved_at: approved ? "2026-10-18T00:00:00Z" : null, approved_by: approved ? id(99) : null, refused_at: null, refused_by: null, refuse_reason: null,
      created_by: id(98), created_at: "2026-10-17T00:00:00Z", for_service_case_id: null, for_staff_user_id: null, for_subsidiary_name: null,
      fulfilment_intent: "concrete_need", request_context: stored, request_version: version, approval_version: approved ? version : null, proceed_date: stored.proceedDate },
    requested_by_name: "TEST requester", requested_by_user_id: id(98), canWithdraw: false, canEditAndSendAgain: false,
    lines: [{ id: id(6), request_id: id(10), request_line_id: id(4), supplier_allocation_id: id(5), fulfilment_kind: "purchase", sku: "TEST-SKU", supplier_id: id(7), destination_id: id(3), qty: stored.lines[0].qty,
      approved_qty: approved ? stored.lines[0].qty : null, issued_qty: issuedQty, remaining_qty: stored.lines[0].qty - issuedQty, context_read_available: approved, context_admission_current: approved, context_to_buy: stored.lines[0].qty - issuedQty,
      po_date: "2026-10-18", po_delivery_date: "2026-10-27", po_delivery_working_days: 7, category: "mattress", item_label: "TEST mattress", required_by: "2026-11-20", attrs: null, po_id: null, cancelled_at: null, received: false }],
    pos: [], history: [], destinations, suppliers: [{ id: id(7), name: "TEST supplier" }], users: [], approvers: [{ id: id(99), name: "TEST approver" }], canApprove: false, context_can_approve: true, todayIso: "2026-10-18",
  });
window.fetch = async (input, init) => {
  const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url, location.origin);
  if (!url.pathname.startsWith("/api/") || localTransport) return realFetch(input, init);
  const path = url.pathname;
  let result: unknown = {};
  if (path.endsWith("/demand/pick-items")) result = { items: [{ sku: "TEST-SKU", label: "TEST mattress", supplier: "TEST supplier", category: "mattress", free: 2 }] };
  else if (path.startsWith("/api/catalog")) result = { skus: [], models: [], sofaFabrics: [] };
  else if (path.startsWith("/api/ops/service-cases")) result = { items: [] };
  else if (path.endsWith("/purchasing/requests") && !init?.method) {
    const detail = detailFacts(); result = { ...detail, requests: submissions ? [detail.request] : [], lines: submissions ? detail.lines : [], serviceCases: [],
      currentPoDuty: { userId: id(99), name: "TEST PO Duty" }, actingPoDuty: null, poDutyUnavailable: false, mayIssue: true, minDeliveryDays: 30, defaultDestinationId: id(3), supplierCollections: [] };
  }
  else if (path.endsWith("/issue")) {
    const body = JSON.parse(String(init?.body)); lastIssue = body;
    issuedQty += body.contextIssue.allocations.reduce((total: number, source: { qty: number }) => total + source.qty,0);
    result = { poIds: ["TEST-LOCAL-PO"], documents: 1, pos: [{ id: "TEST-LOCAL-PO", supplierId: id(7), supplierName: "TEST supplier", destinationId: id(3), destination: "TEST Carres Klang", version: 1 }] };
  }
  else if (path.endsWith("/sends")) result = { sends: [] };
  else if (path.endsWith("/stock-offers")) result = { offers };
  else if (path.endsWith("/plan")) result = { proceedDate: "2026-10-18", recipientEarliest: "2026-11-17", recipientPlanUnavailable: false, planUnavailable: false,
    deliveryDateDefault: "2026-11-01", lines: [{ sku: "TEST-SKU", supplierId: id(7), supplierName: "TEST supplier", category: "mattress", productionDays: 7, arrival: "2026-11-01" }] };
  else if (path.endsWith("/purchasing/requests") && init?.method === "POST") {
    stored = JSON.parse(String(init.body)).context; submissions++; result = { id: id(10), req_no: "TEST-GP", request_version: version, approval_required: true };
  } else if (path.endsWith("/context-review")) result = { available: true, review: { request_version: version, state: { context: stored }, stock_source: [], stock_offers: offers }, events: [], coverage: approved ? [{ demand_id: id(6), kind: "purchase", approved_qty: stored.lines[0].qty, issued_qty: issuedQty, stock_qty: 0, to_buy: stored.lines[0].qty-issuedQty, recipients: purpose === "ready_stock" ? [] : [{ recipientId: id(1), qty: stored.lines[0].qty-issuedQty }] }] : null, approval: approved ? { request_version: version, approval_version: version, token: "a".repeat(32) } : null };
  else if (path.endsWith("/decide")) { const body = JSON.parse(String(init?.body)); if (JSON.stringify(stored) !== JSON.stringify(body.contextReview.context)) version++; stored = body.contextReview.context; approved = true; result = { id: id(10), decision: "approved", request_version: version }; }
  else if (path.includes("/requests/detail/")) result = detailFacts();

  return new Response(JSON.stringify(result), { status: 200, headers: { "content-type": "application/json" } });
};
useAuth.setState({ role: localSeed?.actor.role ?? "operation", hydrated: true, loading: false, user: { id: localSeed?.actor.id ?? id(98), email: localSeed?.actor.email ?? "test@example.test" } as never,
  session: { access_token: "TEST-memory-only", user: { id: localSeed?.actor.id ?? id(98) } } as never });
function Preview() {
  const [context, setContext] = useState(initial); const [object, setObject] = useState(false);
  const [actualId,setActualId] = useState(id(10)); const [localRegister,setLocalRegister] = useState(false);
  return <div className="flex h-screen min-h-0 flex-col bg-base-100">{poEntry ? <PurchaseOrdersPage/> : registerEntry || localRegister ? <OperationManualPurchase contextFlow /> : object ? <ManualPurchaseObject id={actualId} contextFlow
    registerHeading={null} position={null} onStep={() => {}} onBack={() => { setObject(false); if (localTransport) setLocalRegister(true); }} onEditAndSendAgain={() => {}} /> : <CreateRequestWorkspace editId={null}
    destinations={destinations} defaultDestinationId={null} supplierCollections={[]} suppliers={localSeed?.suppliers ?? [{ name: "TEST supplier", address: "TEST supplier address" }]}
    staff={localSeed?.users ?? [{ id: id(98), name: "TEST requester" }]} minDeliveryDays={30} todayIso="2026-10-18" onDone={request => { if (request) { setActualId(request); setObject(true); } }}
    contextDraft={{ value: context, onChange: setContext, pickupLocations: destinations }} />}</div>;
}
const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
(window as unknown as { __mprLocalSetActor: (actor: { id: string; role: "operation" | "principal"; email: string }) => Promise<void> }).__mprLocalSetActor = actor => {
  useAuth.setState({role: actor.role, user: { id:actor.id,email:actor.email } as never,session:{access_token:"TEST-memory-only",user:{id:actor.id,email:actor.email}} as never});
  return client.invalidateQueries();
};
(window as unknown as { __mprLocalRefresh: () => Promise<void> }).__mprLocalRefresh = () => client.invalidateQueries();
createRoot(document.getElementById("root")!).render(<QueryClientProvider client={client}><MemoryRouter initialEntries={[poEntry?`/operation/procurement?po=${encodeURIComponent(poEntryId)}`:"/operation?tab=manual-purchase"]}><Preview /></MemoryRouter></QueryClientProvider>);

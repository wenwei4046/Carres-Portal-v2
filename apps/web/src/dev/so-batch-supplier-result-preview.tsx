import type { IssuedPo } from "../pages/operation/components/PoIssueEvidence";
/** Isolated sample fixture for the actual issued-result composition. No production requests/writes. */
import { StrictMode, useState } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { PurchaseDemandRow, SoBatchOrderRow, SoBatchPurchaseResponse } from "@carres/shared";
import type { PoTemplateData } from "@/lib/pdf/types";
import ModuleHeader from "@/pages/operation/components/ModuleHeader";
import SoBatchRegister from "@/pages/operation/so-batch/SoBatchRegister";
import PoSupplierResultPanel from "@/pages/operation/so-batch/PoSupplierResultPanel";
import "@/index.css";
const destination = "11111111-1111-4111-8111-111111111111";
const lanes = [
  { key: "early", label: "Order early", state: "can_order_early", safety: 20 },
  { key: "full", label: "14 days left", state: "safety_days_full", safety: 14 },
  { key: "low", label: "1–13 days left", state: "safety_days_low", safety: 7 },
  { key: "none", label: "0 days left", state: "safety_days_none", safety: 0 },
  { key: "production", label: "Production late", state: "not_enough_production_time", safety: -2 },
] as const;
const leaves: PurchaseDemandRow[] = lanes.map((lane, i) => ({
  id: `sample-demand-${i}`, orderId: `sample-so-${i}`, so: 1001 + i, lineIds: [`sample-line-${i}`],
  state: lane.state, safetyDaysLeft: lane.safety, customer: `Sample customer ${i + 1}`, customerDelivery: "2026-11-10",
  item: "Sample mattress", variant: "King", category: "mattress", skus: ["SAMPLE-K"], supplierId: "sample-supplier", supplier: "Sample supplier",
  qtyNeeded: i === 2 ? 2 : 1, readyStock: 0, takenFromStock: 0, onPo: i === 2 ? 1 : 0,
  poNumbers: i === 2 ? ["Sample PO A"] : [], toBuy: 1, fullyOnPo: false,
  goodsMustArrive: "2026-11-09", issueRef: { proposalKey: "sample", buildKey: `sample-${i}` },
  action: null, parts: [{ sku: "SAMPLE-K", qty: 1, unitCost: null }], supplierKind: "own_logistics", ownerName: null, ownerDuty: null,
}));
const orders: SoBatchOrderRow[] = leaves.map((leaf, i) => ({
  orderId: leaf.orderId, so: leaf.so, customer: leaf.customer, status: i === 2 ? "partial" : "blank",
  proceededAt: "2026-10-05T08:00:00+08:00", requestedDeliveryDate: leaf.customerDelivery,
  deliveryCity: "Klang", deliveryState: "Selangor", outstandingSuppliers: ["Sample supplier"],
  pos: i === 2 ? [{ poId: "Sample PO A", status: "open", supplierId: leaf.supplierId, supplierName: leaf.supplier, destinationId: destination, officialDeliveryDate: "2026-11-09", sentCurrentVersion: false }] : [],
  lines: [{ orderLineId: leaf.lineIds[0]!, sku: "SAMPLE-K", item: leaf.item, variant: leaf.variant, category: leaf.category, qty: leaf.qtyNeeded, stockTaken: 0, pos: i === 2 ? [{ poId: "Sample PO A", qty: 1 }] : [] }],
}));
orders.push({ orderId: "sample-done", so: 1006, customer: "Sample customer 6", status: "ordered", proceededAt: "2026-10-05T09:00:00+08:00", requestedDeliveryDate: "2026-11-10", deliveryCity: "Klang", deliveryState: "Selangor", outstandingSuppliers: [], pos: [], lines: [{ orderLineId: "sample-done-line", sku: "SAMPLE-K", item: "Sample mattress", variant: "King", category: "mattress", qty: 1, stockTaken: 1, pos: [] }] });
const base: SoBatchPurchaseResponse = { today: "2026-10-05", rows: leaves, registerRows: orders, destinations: [{ id: destination, name: "Carres Klang", isDefault: true, active: true }], defaultDestinationId: destination, currentPoDuty: null, actingPoDuty: null, poDutyNameUnavailable: false, poDutyUnavailable: false, mayIssue: false, procurementPartners: [], safetyDays: 14 };

const supplierOne = "11111111-2222-4333-8444-555555555555";
const supplierTwo = "22222222-2222-4333-8444-555555555555";
const samplePos: Array<IssuedPo & { version: number }> = [
  { id: "SAMPLE-PO-001", supplierId: supplierOne, supplierName: "Sample Ohana", destinationId: destination, destination: "Carres Klang", poSendChannel: "email", contactEmail: "orders@ohana.example", contact: "Sample WhatsApp contact", version: 1 },
  { id: "SAMPLE-PO-002", supplierId: supplierOne, supplierName: "Sample Ohana", destinationId: destination, destination: "Carres Shah Alam", poSendChannel: "email", contactEmail: "orders@ohana.example", contact: "Sample WhatsApp contact", version: 2 },
  { id: "SAMPLE-PO-003", supplierId: supplierTwo, supplierName: "Sample Laveo", destinationId: destination, destination: "Carres Klang", poSendChannel: "whatsapp", contactEmail: "orders@laveo.example", contact: "Sample WhatsApp contact", version: 1 },
];
const sampleDocuments = new Map(samplePos.map((po, index) => [po.id, {
  po_id: po.id, po_number: po.id, version: po.version, issue_date: "2026-10-05",
  supplier: { name: po.supplierName ?? "Sample supplier", address: "Sample supplier address", contact: "Sample contact" },
  destination: { name: po.destination ?? "Sample warehouse", address: "Sample warehouse address" },
  delivery_instructions: "Sample data only. Do not send this document.", eta_date: "2026-11-09",
  so_refs: index === 0 ? [1001, 1002] : [1003 + index], issued_by: "Sample staff",
  lines: [{ sku: "SAMPLE", description: "Sample mattress · King", qty: 1, unit: "pcs", identity_mode: "quantity" as const }],
  terms: "LOCAL SAMPLE — no purchase was placed.",
} satisfies PoTemplateData]));
const realFetch = window.fetch.bind(window);
window.fetch = async (input, init) => {
  const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url, window.location.href);
  if (!url.pathname.startsWith("/api/")) return realFetch(input, init);
  if ((init?.method ?? "GET") !== "GET") return Response.json({ message: "Sample data · Local preview only" }, { status: 403 });
  if (url.pathname.endsWith("email-capability")) return Response.json({ configured: false });
  if (url.pathname.endsWith("issued-round")) return Response.json({ poIds: samplePos.map(po => po.id) });
  if (url.pathname.endsWith("issued-today")) return Response.json({ today: "2026-10-05", pos: samplePos });
  const id = decodeURIComponent(url.pathname.split("/").at(-2) ?? "");
  if (url.pathname.endsWith("issue-context")) return Response.json(samplePos.find(po => po.id === id));
  if (url.pathname.endsWith("print-data")) return Response.json(sampleDocuments.get(id));
  if (url.pathname.endsWith("sends")) return Response.json({ sends: id === "SAMPLE-PO-002" ? [{ kind: "confirmed_sent", channel: "email", po_version: 1, recipient: "orders@ohana.example", sent_at: "2026-10-05T02:20:00Z", sent_by_name: "Sample staff" }] : [] });
  return Response.json({ message: "Sample data · Local preview only" }, { status: 503 });
};
const client = new QueryClient({ defaultOptions: { queries: { enabled: false, retry: false } } });
function Preview() {
  const [open, setOpen] = useState(true);
  return <div className="flex h-screen min-w-0 flex-col bg-kit-canvas">
    <ModuleHeader testId="so-batch-result-preview" word="SO Batch Purchase" docTitle="SO Batch Purchase · Supplier result preview" destinationHeader />
    <p className="border-b border-kit-slate-5 bg-white px-3 py-2 text-meta text-kit-slate-11">Sample data · Local preview only · No purchase was placed</p>
    <SoBatchRegister data={base} isLoading={false} onIssue={() => {}} onOpenPurchaseOrders={() => setOpen(true)} />
    <PoSupplierResultPanel open={open} onOpenChange={setOpen} pos={samplePos} roundWindow="2026-10-05T10:15" onChanged={() => {}} />
  </div>;
}
createRoot(document.getElementById("root")!).render(<StrictMode><QueryClientProvider client={client}><MemoryRouter><Preview /></MemoryRouter></QueryClientProvider></StrictMode>);

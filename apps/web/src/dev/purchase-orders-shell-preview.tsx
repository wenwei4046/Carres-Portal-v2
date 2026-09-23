/**
 * PURCHASE ORDERS · REAL SHELL PREVIEW — DEV ONLY (Purchasing MASTER §9.3,
 * Jess 2026-09-17).
 *
 * The REAL `OperationApp` at `/operation/procurement`: portal sidebar, rail and
 * the nine-column register with its four groups, measured with the chrome
 * production puts beside it. Only the network is seeded — the saved-layout
 * doors keep an in-memory list so Save / Load / Set as my default can be
 * walked. Nothing leaves the browser. A separate vite entry
 * (`purchase-orders-shell-preview.html`), so it cannot reach production.
 * Fixture evidence is not authenticated production evidence.
 */
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import OperationApp from "@/pages/operation/OperationApp";
import "@/index.css";

const SUPPLIERS = [
  { id: "s1", name: "Hooka", whatsapp_group_url: "https://chat.whatsapp.com/hooka", contact_email: "buy@hooka.my", contact: "+60123456789" },
  { id: "s2", name: "Ohana Furniture Sdn Bhd", whatsapp_group_url: null, contact_email: null, contact: null },
  { id: "s3", name: "Nice Future", whatsapp_group_url: null, contact_email: "po@nicefuture.my", contact: null },
];
const MODELS = [["Booqit", "King"], ["Ohana 2 Seater Fabric Sofa with Chaise", "Left"], ["Cody", "Queen"], ["Jager", "Single"]];

const pos = Array.from({ length: 26 }, (_, n) => {
  const i = n + 1;
  const day = String(1 + (i % 16)).padStart(2, "0");
  const supplier = SUPPLIERS[i % SUPPLIERS.length]!;
  const kind = i <= 7 ? "unmarked" : i <= 18 ? "issued" : i <= 23 ? "completed" : "cancelled";
  const version = i % 6 === 0 ? 2 : 1;
  const original = i === 9 ? null : `2026-10-${String(1 + (i % 27)).padStart(2, "0")}`;
  const lines = Array.from({ length: 1 + (i % 3) }, (_, l) => {
    const [model, size] = MODELS[(i + l) % MODELS.length]!;
    const qty = 2 + l;
    const received = kind === "completed" ? qty : i % 5 === 0 ? 1 : 0;
    return {
      id: `l${i}-${l}`, sku: `SKU-${i}-${l}`, qty, received_qty: received, model_name: model, size,
      destination_id: i % 4 ? "d1" : "d2", identity_mode: "quantity",
      attrs: l === 0 && i % 2 ? { color: "Sand", fabric_name: "CG-012" } : null,
      governed_sources: [], sources: [],
    };
  });
  const marked = kind !== "unmarked" && !(kind === "completed" && i === 22);
  return {
    id: i === 25 ? "PO-LEGACY-0007" : `PO-202609${day}-${4000 + i}`,
    supplier_id: supplier.id, warehouse_id: "w1", destination_id: i % 4 ? "d1" : "d2",
    status: kind === "cancelled" ? "cancelled" : kind === "completed" ? "received" : "open",
    sup_status: "pending", so: null, so_refs: null,
    eta_date: original, official_delivery_date: original, expected_ready_date: null,
    purpose: "customer_sales", version, placed_at: `2026-09-${day}T02:00:00Z`,
    sources: i % 7 === 0
      ? [{ kind: "manual_purchase", reference: "Manual Purchase Request", request_id: `r${i}` }]
      : i % 5 === 0
        ? [{ kind: "sales_order", reference: `SO-${1300 + i}`, order_id: `o${i}` }, { kind: "sales_order", reference: `SO-${1400 + i}`, order_id: `p${i}` }]
        : [{ kind: "sales_order", reference: `SO-${1300 + i}`, order_id: `o${i}` }],
    grns: kind === "completed" ? [{ id: `g${i}`, grn_no: `GRN-202609${day}-${7000 + i}` }] : i % 5 === 0 ? [{ id: `g${i}a`, grn_no: `GRN-202609${day}-${7100 + i}` }, { id: `g${i}b`, grn_no: `GRN-202609${day}-${7200 + i}` }] : [],
    sends: marked
      ? [{ channel: i % 2 ? "whatsapp" : "email", note: null, sent_at: `2026-09-${day}T06:00:00Z`, kind: "confirmed_sent", recipient: supplier.whatsapp_group_url ?? "po@nicefuture.my", po_version: version, sent_by_name: "Yu Jun", duty_name: "Yu Jun", acting_name: null, po_revisions: null }]
      : [],
    promises: kind === "issued" && i % 3 === 0 && original
      ? [{ kind: "tomorrow_delivery", answer: i % 2 ? "delayed" : "shipping", about_date: original, previous_date: original, new_date: i % 2 ? `2026-11-${String(1 + (i % 20)).padStart(2, "0")}` : null, reason: i % 2 ? "Production Delay" : null, po_version: version, channel: "whatsapp", recipient: "Factory", evidence: "x/reply.png", reported_by: "Factory staff", reported_at: "2026-09-10T03:00:00Z", recorded_by: "u", recorded_by_name: "Yu Jun", recorded_at: "2026-09-10T03:10:00Z" }]
      : [],
    purchase_order_lines: lines,
  };
});

let layouts: Array<{ id: string; name: string; layout: unknown; is_default: boolean }> = [];

const realFetch = window.fetch.bind(window);
window.fetch = async (input, init) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  if (!url.includes("127.0.0.1:88") && !url.includes("localhost:88")) return realFetch(input, init);
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  if (url.includes("/api/operation/register-layouts")) {
    const method = (init?.method ?? "GET").toUpperCase();
    if (method === "GET") return json({ layouts, limit: 10 });
    const def = /register-layouts\/([^/]+)\/default/.exec(url);
    if (def) {
      layouts = layouts.map((l) => ({ ...l, is_default: l.id === def[1] }));
      return json({ layout: layouts.find((l) => l.id === def[1]) });
    }
    const body = JSON.parse(String(init?.body ?? "{}")) as { name: string; layout: unknown };
    const existing = layouts.find((l) => l.name === body.name);
    if (existing) existing.layout = body.layout;
    else if (layouts.length >= 10) return json({ code: "register_layout_limit", message: "You can keep 10 layouts" }, 422);
    else layouts.push({ id: crypto.randomUUID(), name: body.name, layout: body.layout, is_default: false });
    return json({ layout: layouts.find((l) => l.name === body.name) });
  }
  if (/\/api\/operation\/pos(\?|$)/.test(url)) {
    return json({
      pos,
      destinations: [{ id: "d1", name: "Carres Klang", is_default: true }, { id: "d2", name: "AL Sungai Buloh", is_default: false }],
      referencedDestinations: [{ id: "d1", name: "Carres Klang", is_default: true }, { id: "d2", name: "AL Sungai Buloh", is_default: false }],
      messageTemplate: "Please build this purchase order.",
    });
  }
  if (url.includes("/api/operation/suppliers")) return json({ suppliers: SUPPLIERS.map((s) => ({ ...s, kind: "own_logistics", cat_covered: [], lead_time: null })) });
  if (url.includes("/api/operation/warehouse")) return json({ warehouses: [{ id: "w1", name: "Carres Klang", address: "Klang" }] });
  if (url.includes("/api/operation/workspace-duties")) {
    return json({ can_assign: false, duties: [{ key: "po_duty", label: "PO Duty", resolution: { duty_key: "po_duty", normal_user_id: "u-duty", normal_user_name: "Yu Jun", acting_user_id: null, acting_user_name: null, actor_user_id: "u-duty", is_cover: false, source: "assignment" }, assignments: [], covers: [] }] });
  }
  if (url.includes("/api/operation/supplier-claims")) return json({ claims: [], counts: { open: 0, closed: 0, all: 0 } });
  return json(url.includes("/rest/") ? [] : {});
};

useAuth.setState({
  role: "operation", hydrated: true, loading: false,
  user: { id: "u-duty", email: "preview@carres.local" } as never,
  session: { access_token: "preview", user: { id: "u-duty", email: "preview@carres.local" } } as never,
});

const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={["/operation/procurement"]}>
        <Routes>
          <Route path="/operation/*" element={<OperationApp />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  </StrictMode>,
);

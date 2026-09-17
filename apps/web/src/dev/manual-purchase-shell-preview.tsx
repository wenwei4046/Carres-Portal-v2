/**
 * MANUAL PURCHASE · REAL SHELL PREVIEW — DEV ONLY (Round 2, owner rulings
 * R1–R4 2026-09-16).
 *
 * The REAL `OperationApp` — portal sidebar, destination header, Register and
 * right rail — at `/operation?tab=manual-purchase`, so the grid is measured
 * with the chrome production puts beside it. Only the network is seeded, by an
 * IN-MEMORY copy of the round-2 doors: send back, edit and send again, approve,
 * refuse, withdraw and issue move the fixture exactly as the SQL doors would,
 * refusing the race loser by name. Nothing leaves the browser. Fixture
 * evidence is not authenticated production evidence.
 *
 *   ?as=requester  the caller raised every request (withdraw / edit shown)
 *   ?as=approver   the caller holds the Purchasing Approver gate
 *   ?as=other      neither (default)
 *   ?state=empty · ?state=unknown (the lines read failed)
 *   ?seedAs=requester  seed every request as raised by the caller, then walk
 *                      both roles in one page with `window.__mp.setAs(role)`
 */
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { purchasingRefusal } from "@carres/shared";
import { useAuth } from "@/lib/auth";
import OperationApp from "@/pages/operation/OperationApp";
import "@/index.css";

const params = new URLSearchParams(window.location.search);
let as = params.get("as") ?? "other";
const state = params.get("state");

const KLANG = "11111111-1111-4111-8111-111111111111";
const BULOH = "22222222-2222-4222-8222-222222222222";
const ME = "ddddddd0-0000-4000-8000-000000000000";
const SITI = "ddddddd1-0000-4000-8000-000000000001";
const JESS = "ddddddd9-0000-4000-8000-000000000009";
const SHARED = "ddddddd8-0000-4000-8000-000000000008";
const SUPPLIERS = [
  { id: "s1", name: "Hooka" },
  { id: "s2", name: "Ohana Furniture Manufacturing Sdn Bhd" },
  { id: "s3", name: "Nice Future" },
];
const ITEMS = [
  { sku: "B1201S-K", label: "Booqit King", supplier: "s1", category: "mattress" },
  { sku: "5539-2NA", label: "Ohana 2 Seater Fabric Sofa with Chaise (Left)", supplier: "s2", category: "sofa" },
  { sku: "BF-ATLAS-Q", label: "Atlas Queen", supplier: "s3", category: "bedframe" },
];
const PURPOSES = ["ready_stock", "showroom_display", "internal_staff_purchase", "subsidiary_purchase", "other_purchase", "service_case"];

type Req = Record<string, unknown> & { id: string };
type Line = Record<string, unknown> & { id: string; request_id: string };
const requests: Req[] = [];
const lines: Line[] = [];
const events: Array<Record<string, unknown>> = [];
const pos: Array<{ id: string; po_no: string; sent: boolean; official_delivery_date: string; supplier_id: string }> = [];

const day = (d: number) => `2026-09-${String(d).padStart(2, "0")}`;
let seq = 0;
function add(kind: string, i: number) {
  seq += 1;
  const id = `eeee${String(seq).padStart(4, "0")}-0000-4000-8000-${String(seq).padStart(12, "0")}`;
  const item = ITEMS[i % ITEMS.length]!;
  const creator = kind === "shared" || kind === "sentback-shared" ? SHARED : as === "requester" || params.get("seedAs") === "requester" ? ME : SITI;
  const r: Req = {
    id, req_no: null, purpose: PURPOSES[i % PURPOSES.length]!, destination_id: i % 3 ? KLANG : BULOH,
    required_by: `2026-10-${String(5 + (i % 20)).padStart(2, "0")}`,
    why: PURPOSES[i % PURPOSES.length] === "other_purchase" ? "Replacement legs for the Balakong showroom sofa" : null,
    approval_required: true, approved_at: null, approved_by: null, refused_at: null, refused_by: null,
    refuse_reason: null, withdrawn_at: null, sent_back_at: null, sent_back_reason: null, submitted_at: null, round: 1,
    for_service_case_id: null, for_staff_user_id: PURPOSES[i % PURPOSES.length] === "internal_staff_purchase" ? SITI : null,
    for_subsidiary_name: PURPOSES[i % PURPOSES.length] === "subsidiary_purchase" ? "HOUZS Furniture Trading Sdn Bhd" : null,
    created_by: creator, created_at: `${day(1 + (i % 16))}T0${i % 9}:00:00Z`,
  };
  if (r.purpose === "service_case") r.purpose = "ready_stock";
  const qty = 1 + (i % 4);
  const l: Line = {
    id: `ffff${String(seq).padStart(4, "0")}-0000-4000-8000-${String(seq).padStart(12, "0")}`,
    request_id: id, sku: item.sku, supplier_id: kind === "nosupplier" ? null : item.supplier,
    destination_id: r.destination_id, qty, approved_qty: null, issued_qty: 0, remaining_qty: qty,
    required_by: r.required_by, remark: i % 5 ? null : "grey, not beige", po_id: null, cancelled_at: null,
    cancel_reason: null, received: false, category: item.category, item_label: item.label, po_ids: [], allocations: [],
    delivery_date: r.required_by, order_by: kind === "notplanned" || kind === "nosupplier" ? null : day(14 + (i % 14)),
    production_days_missing: kind === "notplanned", transit_days_missing: false,
  };
  if (["approved", "notplanned", "nosupplier", "partial", "ordered", "zero"].includes(kind)) {
    r.approved_at = `${day(2 + (i % 14))}T03:00:00Z`;
    r.approved_by = JESS;
  }
  if (kind === "refused") Object.assign(r, { refused_at: `${day(5)}T03:00:00Z`, refused_by: JESS, refuse_reason: "A unit in Klang can move instead." });
  if (kind === "withdrawn") Object.assign(r, { withdrawn_at: `${day(6)}T03:00:00Z` });
  if (kind === "sentback" || kind === "sentback-shared") {
    Object.assign(r, { sent_back_at: `${day(7)}T03:00:00Z`, sent_back_reason: "Wrong size — the showroom needs Queen" });
    events.push({ request_id: id, round: 1, kind: "sent_back", actor_id: JESS, occurred_at: `${day(7)}T03:00:00Z`, reason: r.sent_back_reason, changes: [] });
  }
  if (kind === "zero") l.approved_qty = 0;
  if (kind === "ordered" || kind === "partial") {
    const po = `PO-202609${String(10 + i).padStart(2, "0")}-${4400 + i}`;
    const issued = kind === "ordered" ? qty : 1;
    pos.push({ id: po, po_no: po, sent: true, official_delivery_date: "2026-10-12", supplier_id: item.supplier });
    Object.assign(l, { issued_qty: issued, remaining_qty: qty - issued, po_id: po, po_ids: [po], allocations: [{ poId: po, qty: issued, destinationId: r.destination_id }] });
  }
  requests.push(r);
  lines.push(l);
}

if (state !== "empty") {
  const plan = ["waiting", "waiting", "sentback", "sentback-shared", "approved", "approved", "approved", "notplanned",
    "nosupplier", "partial", "ordered", "ordered", "zero", "refused", "withdrawn", "waiting", "approved", "shared"];
  plan.forEach((k, i) => add(k, i));
}

const users = [
  { id: ME, name: "Aisyah binti Mohamad Rahman", email: "aisyah@carres.com" },
  { id: SITI, name: "Siti", email: "siti@carres.com" },
  { id: JESS, name: "Jess", email: "jess@carres.com" },
  { id: SHARED, name: "Operations", email: "operation@carres.com" },
];
const nameOf = (id: unknown) => {
  const u = users.find((x) => x.id === id);
  return !u || u.email === "operation@carres.com" ? null : u.name;
};

function register() {
  return {
    todayIso: "2026-09-17", planUnavailable: false, minDeliveryDays: 0,
    requests: requests.map((r) => ({ ...r, requested_by_name: nameOf(r.created_by), requested_by_user_id: nameOf(r.created_by) ? r.created_by : null })),
    lines: state === "unknown" ? [] : lines, linesUnavailable: state === "unknown", pos,
    serviceCases: [], destinations: [{ id: KLANG, name: "Carres Klang" }, { id: BULOH, name: "AL Sungai Buloh" }],
    defaultDestinationId: KLANG, supplierCollections: [], suppliers: SUPPLIERS, users,
    approvers: [{ id: JESS, name: "Jess" }], canApprove: as === "approver",
    currentPoDuty: { userId: "u-duty", name: "Yu Jun" }, actingPoDuty: null, poDutyUnavailable: false, mayIssue: true,
  };
}

function detail(id: string) {
  const r = requests.find((x) => x.id === id)!;
  const ls = lines.filter((l) => l.request_id === id);
  const undecided = r.approved_at == null && r.refused_at == null && r.withdrawn_at == null;
  const history: Array<Record<string, unknown>> = [
    { kind: "created", occurred_at: r.created_at, actor: nameOf(r.created_by), actor_role: "operation", units: ls.reduce((n, l) => n + Number(l.qty), 0) },
    ...events.filter((e) => e.request_id === id).map((e) => ({ ...e, actor: nameOf(e.actor_id), actor_role: "operation" })),
  ];
  if (r.approved_at) history.push({ kind: "approved", occurred_at: r.approved_at, actor: "Jess", actor_role: "principal", requested_units: 1, approved_units: 1 });
  if (r.refused_at) history.push({ kind: "refused", occurred_at: r.refused_at, actor: "Jess", actor_role: "principal", reason: r.refuse_reason });
  const mine = r.created_by === ME;
  return {
    request: r, serviceCaseNo: null, requested_by_name: nameOf(r.created_by),
    requested_by_user_id: nameOf(r.created_by) ? r.created_by : null,
    canWithdraw: mine && undecided && ls.every((l) => l.po_id == null),
    canEditAndSendAgain: mine && undecided && r.sent_back_at != null,
    lines: ls.map((l) => (as === "approver" ? { ...l, unit_cost: 850 } : l)),
    pos: pos.filter((p) => ls.some((l) => (l.po_ids as string[]).includes(p.id))).map((p, i) => ({
      id: p.id, po_no: p.po_no, placed_at: `${day(10)}T01:00:00Z`, marked_sent_at: i === 0 ? `${day(11)}T06:30:00Z` : null,
      po_delivery_date: p.official_delivery_date, supplier_delivery_date: null, ordered_qty: 1,
    })),
    history, destinations: [{ id: KLANG, name: "Carres Klang", active: true }, { id: BULOH, name: "AL Sungai Buloh", active: true }],
    supplierCollections: [], suppliers: SUPPLIERS, users, approvers: [{ id: JESS, name: "Jess" }],
    canApprove: as === "approver", todayIso: "2026-09-17", planUnavailable: false,
  };
}

const refuse = (code: string, status = 409) =>
  new Response(JSON.stringify({ code, error: code, message: purchasingRefusal(code).wrong, action: purchasingRefusal(code).todo }), {
    status, headers: { "content-type": "application/json" },
  });

async function answer(url: string, init?: RequestInit): Promise<unknown | Response> {
  const path = url.replace(/^https?:\/\/[^/]+/, "");
  const method = init?.method ?? "GET";
  const body = init?.body ? JSON.parse(String(init.body)) : {};
  const m = path.match(/\/purchasing\/requests\/([0-9a-f-]{36})\/(decide|withdraw|resubmit|ready-stock)/);
  if (m) {
    const r = requests.find((x) => x.id === m[1])!;
    if (m[2] === "ready-stock") return { groups: [] };
    if (m[2] === "decide") {
      if (r.withdrawn_at) return refuse("request_withdrawn");
      if (r.approved_at || r.refused_at) return refuse("already_decided");
      if (r.sent_back_at) return refuse("request_sent_back");
      const now = new Date().toISOString();
      if (body.decision === "approve") Object.assign(r, { approved_at: now, approved_by: JESS });
      if (body.decision === "refuse") Object.assign(r, { refused_at: now, refused_by: JESS, refuse_reason: body.reason });
      if (body.decision === "send_back") {
        Object.assign(r, { sent_back_at: now, sent_back_reason: body.reason });
        events.push({ request_id: r.id, round: r.round, kind: "sent_back", actor_id: JESS, occurred_at: now, reason: body.reason, changes: [] });
      }
      return { id: r.id, decision: body.decision };
    }
    if (m[2] === "withdraw") {
      if (r.approved_at || r.refused_at) return refuse("already_decided");
      if (r.withdrawn_at) return refuse("request_withdrawn");
      const now = new Date().toISOString();
      r.withdrawn_at = now;
      events.push({ request_id: r.id, round: r.round, kind: "withdrawn", actor_id: ME, occurred_at: now });
      return { id: r.id, withdrawn: true };
    }
    if (m[2] === "resubmit") {
      if (!r.sent_back_at) return refuse("not_sent_back");
      const now = new Date().toISOString();
      const changes: unknown[] = [];
      if (r.required_by !== body.requiredBy) changes.push({ field: "required_by", from: r.required_by, to: body.requiredBy });
      for (const bl of body.lines as Array<{ id: string | null; sku: string; qty: number }>) {
        const l = lines.find((x) => x.id === bl.id);
        if (l && Number(l.qty) !== bl.qty) {
          changes.push({ field: "line", sku: l.sku, from: l.qty, to: bl.qty });
          Object.assign(l, { qty: bl.qty, remaining_qty: bl.qty });
        }
      }
      Object.assign(r, { required_by: body.requiredBy, sent_back_at: null, sent_back_reason: null, round: Number(r.round) + 1, submitted_at: now });
      events.push({ request_id: r.id, round: r.round, kind: "resubmitted", actor_id: ME, occurred_at: now, changes });
      return { id: r.id, round: r.round };
    }
  }
  if (path.includes("/purchasing/requests/detail/")) return detail(path.split("/detail/")[1]!.split("?")[0]!);
  if (path.includes("/purchasing/requests/plan")) {
    return { proceedDate: "2026-09-17", deliveryDateDefault: "2026-10-15", planUnavailable: false,
      lines: ((body.skus ?? []) as string[]).map((sku) => ({ sku, supplierId: "s1", supplierName: "Hooka", category: "mattress", productionDays: 14, transitDays: 3, arrival: "2026-10-15" })) };
  }
  if (path.includes("/purchasing/requests/already-have")) return { sku: "B1201S-K", alreadyOnPo: 0, firstPo: null };
  if (path.includes("/purchasing/requests/issue") && method === "POST") {
    for (const id of body.requestIds as string[]) {
      const r = requests.find((x) => x.id === id)!;
      if (r.withdrawn_at) return refuse("request_withdrawn");
      if (!r.approved_at || r.sent_back_at) return refuse("not_ready_to_order");
      for (const l of lines.filter((x) => x.request_id === id && x.cancelled_at == null)) {
        const po = `PO-20260917-${5000 + pos.length}`;
        const qty = Number(l.approved_qty ?? l.qty) - Number(l.issued_qty);
        if (qty <= 0) continue;
        pos.push({ id: po, po_no: po, sent: false, official_delivery_date: String(l.required_by), supplier_id: String(l.supplier_id) });
        Object.assign(l, { issued_qty: Number(l.issued_qty) + qty, remaining_qty: 0, po_id: l.po_id ?? po, po_ids: [...(l.po_ids as string[]), po], allocations: [...(l.allocations as unknown[]), { poId: po, qty, destinationId: l.destination_id }] });
      }
    }
    return { po_ids: [] };
  }
  if (path.includes("/purchasing/requests") && method === "POST") return { id: requests[0]?.id };
  if (path.includes("/purchasing/requests")) return register();
  if (path.includes("pick-items")) {
    return { items: ITEMS.map((it) => ({ sku: it.sku, label: it.label, supplier: SUPPLIERS.find((s) => s.id === it.supplier)!.name, onHand: 3, reserved: 1, free: 2 })) };
  }
  if (path.includes("/rest/")) return [];
  return {};
}

const realFetch = window.fetch.bind(window);
window.fetch = async (input, init) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  if (!url.includes("127.0.0.1:88")) return realFetch(input, init);
  const out = await answer(url, init);
  if (out instanceof Response) return out;
  return new Response(JSON.stringify(out), { status: 200, headers: { "content-type": "application/json" } });
};

useAuth.setState({
  role: "operation", hydrated: true, loading: false,
  user: { id: ME, email: "aisyah@carres.com" } as never,
  session: { access_token: "preview", user: { id: ME, email: "aisyah@carres.com" } } as never,
});

const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
/* A loop walk plays requester and approver in ONE page, so the in-memory
   doors keep their state between the two roles. */
(window as unknown as { __mp: unknown }).__mp = {
  setAs(role: string) {
    as = role;
    void client.invalidateQueries();
  },
};
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={["/operation?tab=manual-purchase"]}>
        <Routes>
          <Route path="/operation/*" element={<OperationApp />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  </StrictMode>,
);

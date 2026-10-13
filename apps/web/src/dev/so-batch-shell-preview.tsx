/**
 * SO BATCH PURCHASE · REAL SHELL PREVIEW — DEV ONLY (owner rulings R1–R8,
 * 2026-09-16).
 *
 * The REAL `OperationApp` — portal sidebar, destination header, Register and
 * right rail — at `/operation?tab=purchase`, so the grid is measured with the
 * chrome production puts beside it. Only the network is seeded: every API call
 * is answered locally and nothing leaves the browser. Fixture evidence is not
 * authenticated production evidence.
 *
 * `?state=empty` · `?state=nothing` (everything needs no purchase) ·
 * default: 27 orders with long names, blocked, pool-covered, partly bought,
 * Ready-Stock-only and fully ordered records.
 *
 * Ready Stock is answered too: SO-1301 and SO-1302 each have TEST Units free
 * at Carres Klang, so `Use stock` shows on the selection bar when their lines
 * are ticked, and pressing it takes the Units here in the page (nothing is
 * written anywhere).
 */
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { PurchaseDemandRow, ReadyStockResponse, SoBatchOrderRow, SoBatchPurchaseResponse } from "@carres/shared";
import { useAuth } from "@/lib/auth";
import OperationApp from "@/pages/operation/OperationApp";
import { testTasksFeed } from "./tasks-feed-fixture";
import { appTodayIso } from "@/lib/fmt-date";
import "@/index.css";

/* The preview person. A UUID, as every account id is: the Tasks panel
   matches work to the signed-in person by it. */
const ME = "00000000-0000-4000-8000-0000000000aa";
const KLANG = "11111111-1111-4111-8111-111111111111";
const BULOH = "22222222-2222-4222-8222-222222222222";
const params = new URLSearchParams(window.location.search);
const state = params.get("state");

const CUSTOMERS = [
  "Kimmy", "LIM KUAN YANG", "Nurul Aisyah binti Abdul Rahman", "PETER", "ANNE", "Tan Ah Kow",
  "Mohd Hafiz", "CHONG WEI MING & FAMILY", "Siti", "Rajesh Kumar a/l Subramaniam",
];
const SUPPLIERS = ["Hooka", "Ohana Furniture Sdn Bhd", "Nice Future"];
const CITIES: Array<[string, string]> = [
  ["Petaling Jaya", "Selangor"], ["Johor Bahru", "Johor"], ["Kuala Lumpur", "Kuala Lumpur"],
  ["Seberang Perai", "Pulau Pinang"], ["Kota Kinabalu", "Sabah"],
];

const rows: PurchaseDemandRow[] = [];
const registerRows: SoBatchOrderRow[] = [];

function leaf(i: number, over: Partial<PurchaseDemandRow>): PurchaseDemandRow {
  return {
    id: `build::o${i}::b${i}`, state: "can_order_early", lineIds: [`l${i}`], orderId: `o${i}`,
    so: 1300 + i, customer: CUSTOMERS[i % CUSTOMERS.length]!, customerDelivery: "2026-10-28",
    item: "Booqit", variant: "King", category: "mattress", skus: ["B1201S-K"],
    supplierId: "s1", supplier: SUPPLIERS[i % SUPPLIERS.length]!, qtyNeeded: 2, readyStock: 0,
    takenFromStock: 0, onPo: 0, fullyOnPo: false, poNumbers: [], toBuy: 2,
    goodsMustArrive: "2026-10-08", issueRef: { proposalKey: "s1::mattress", buildKey: `b${i}` },
    action: null, parts: [{ sku: "B1201S-K", qty: 2, unitCost: 100 }], supplierKind: "own_logistics",
    // Fictional server projection, confined to this dev-only entry.
    supplierAddress: "18 Example Factory Road, Selangor",
    poDate: "2026-09-24", poDeliveryDate: "2026-10-02", poDeliveryWorkingDays: 7,
    ownerName: null, ownerDuty: null, ...over,
  } as PurchaseDemandRow;
}

if (state !== "empty") {
  for (let i = 1; i <= 27; i += 1) {
    const [city, st] = CITIES[i % CITIES.length]!;
    const kind = state === "nothing" ? (i % 2 ? "stock" : "ordered")
      : i <= 12 ? "buy" : i <= 14 ? "blocked" : i === 15 ? "pool" : i <= 17 ? "partial" : i <= 21 ? "stock" : "ordered";
    const po = { poId: `PO-202609${String(10 + (i % 18)).padStart(2, "0")}-${4000 + i}`, status: "open" as const,
      supplierId: "s1", supplierName: SUPPLIERS[i % SUPPLIERS.length]!, destinationId: i % 3 ? KLANG : BULOH,
      officialDeliveryDate: `2026-10-${String(1 + (i % 27)).padStart(2, "0")}`, sentCurrentVersion: true };
    const qty = 2;
    const linked = kind === "ordered" ? 2 : kind === "partial" ? 1 : 0;
    registerRows.push({
      orderId: `o${i}`, so: 1300 + i, customer: CUSTOMERS[i % CUSTOMERS.length]!,
      status: kind === "ordered" ? "ordered" : kind === "partial" ? "partial" : "blank",
      proceededAt: `2026-09-${String(1 + (i % 15)).padStart(2, "0")}T09:00:00+08:00`,
      requestedDeliveryDate: i % 5 ? `2026-${i % 4 ? "10" : "12"}-${String(1 + (i % 27)).padStart(2, "0")}` : null,
      originalRequestedDeliveryDate: i % 5 ? `2026-${i % 4 ? "10" : "12"}-${String(1 + (i % 27)).padStart(2, "0")}` : null,
      deliveryCity: city, deliveryState: st,
      pos: linked ? [po] : [],
      lines: [{ orderLineId: `l${i}`, sku: "B1201S-K", qty, stockTaken: kind === "stock" ? 2 : 0,
        item: "Booqit", variant: "King", category: "mattress",
        pos: linked ? [{ poId: po.poId, qty: linked }] : [] }],
      outstandingSuppliers: kind === "buy" || kind === "blocked" || kind === "partial" || kind === "pool" ? [SUPPLIERS[i % SUPPLIERS.length]!] : [],
    });
    const orderBy = `2026-09-${String(16 + (i % 14)).padStart(2, "0")}`;
    if (kind === "buy") rows.push(leaf(i, { orderBy, state: i % 4 ? "can_order_early" : "safety_days_low" }));
    if (kind === "partial") rows.push(leaf(i, { orderBy, toBuy: 1, onPo: 1, poNumbers: [po.poId] }));
    if (kind === "blocked") rows.push(leaf(i, { state: "no_production_days", toBuy: null, issueRef: null, goodsMustArrive: null }));
    if (kind === "pool") rows.push(leaf(i, { orderBy, fullyOnPo: true }));
  }
}

const payload: SoBatchPurchaseResponse = {
  today: "2026-09-16", rows, registerRows,
  destinations: [
    { id: KLANG, name: "Carres Klang", address: "10 Example Warehouse Road, Klang", isDefault: true, active: true },
    { id: BULOH, name: "AL Sungai Buloh", address: "20 Example Warehouse Road, Sungai Buloh", isDefault: false, active: true },
  ],
  defaultDestinationId: KLANG,
  currentPoDuty: { userId: ME, name: "Yu Jun" }, actingPoDuty: null,
  poDutyNameUnavailable: false, poDutyUnavailable: false, mayIssue: true,
  procurementPartners: [], safetyDays: 14,
};

/* TEST Units on the shelf: two for SO-1301's line, one for SO-1302's. */
const shelf: Array<{ itemId: string; unitCode: string; lineId: string; heldFor: string | null }> = [
  { itemId: "aaaaaaaa-0000-4000-8000-000000000001", unitCode: "TEST-B1201S-K-001", lineId: "l1", heldFor: null },
  { itemId: "aaaaaaaa-0000-4000-8000-000000000002", unitCode: "TEST-B1201S-K-002", lineId: "l1", heldFor: null },
  { itemId: "aaaaaaaa-0000-4000-8000-000000000003", unitCode: "TEST-B1201S-K-003", lineId: "l2", heldFor: null },
];
function readyStockOf(orderId: string): ReadyStockResponse {
  const order = registerRows.find((row) => row.orderId === orderId);
  const lines = (order?.lines ?? []).map((line) => {
    const held = shelf.filter((unit) => unit.heldFor === line.orderLineId);
    const onPo = line.pos.reduce((sum, po) => sum + po.qty, 0);
    return { orderLineId: line.orderLineId, sku: line.sku, item: line.item, qty: line.qty, reservedQty: held.length,
      reservedUnitCodes: held.map((unit) => unit.unitCode), onPoQty: onPo, remainingQty: Math.max(0, line.qty - line.stockTaken - onPo) };
  });
  const lineIds = new Set(lines.map((line) => line.orderLineId));
  return {
    orderId, so: order?.so ?? null, reference: order?.so == null ? null : `SO-${order.so}`, lines,
    units: shelf.filter((unit) => lineIds.has(unit.lineId)).map((unit) => ({
      itemId: unit.itemId, unitCode: unit.unitCode, identityScope: "unit", sku: "B1201S-K", condition: "new",
      siteName: "Carres Klang", warehouseId: KLANG, holderName: null, ownership: "carres_owned", supplier: null,
      qty: 1, dateIn: "2026-09-01", matchingLineIds: unit.heldFor ? [] : [unit.lineId], lineIds: [unit.lineId],
      blocked: null, reservedForLineId: unit.heldFor,
    })),
  } as ReadyStockResponse;
}
/* `Use stock`: the picked Units are held for their line, and the line has
   that much less to buy, as the real door would answer on the next read. */
function reserve(body: { orderId: string; picks: Array<{ itemId: string; orderLineId: string }> }) {
  for (const pick of body.picks) {
    const unit = shelf.find((candidate) => candidate.itemId === pick.itemId);
    if (unit) unit.heldFor = pick.orderLineId;
    const line = registerRows.find((row) => row.orderId === body.orderId)?.lines.find((candidate) => candidate.orderLineId === pick.orderLineId);
    if (line) line.stockTaken += 1;
    const demand = rows.find((row) => row.orderId === body.orderId && row.lineIds.includes(pick.orderLineId));
    if (demand) { demand.toBuy = Math.max(0, (demand.toBuy ?? 0) - 1); demand.takenFromStock = (demand.takenFromStock ?? 0) + 1; }
  }
  const order = registerRows.find((row) => row.orderId === body.orderId);
  return { reserved: body.picks.length, reference: `SO-${order?.so}`, units: body.picks };
}

const realFetch = window.fetch.bind(window);
window.fetch = async (input, init) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  if (!url.includes("127.0.0.1:88")) return realFetch(input, init);
  const stock = /\/purchase\/demands\/([^/]+)\/ready-stock$/.exec(url.split("?")[0]!);
  const body = url.includes("/ready-stock/reserve") ? reserve(JSON.parse(String(init?.body ?? "{}")))
    : stock ? readyStockOf(decodeURIComponent(stock[1]!))
    : url.includes("/api/operation/purchase/demands") ? { ...payload, rows: rows.filter((row) => row.toBuy == null || row.toBuy > 0) }
    /* The shell's Tasks panel reads the one Work feed: TEST work for the preview person. */
    : /\/api\/operation\/work(\?|$)/.test(url) ? testTasksFeed({ id: ME, name: "Yu Jun", email: "preview@carres.local" })
    : url.includes("/rest/") ? [] : {};
  return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
};

useAuth.setState({
  role: "operation", hydrated: true, loading: false,
  user: { id: ME, email: "preview@carres.local" } as never,
  session: { access_token: "preview", user: { id: ME, email: "preview@carres.local" } } as never,
});

/* The first-entry `Pending work` reminder is its own surface: it shows here
   only when asked for (`?reminder=1`), so the page under it can be walked. */
if (params.get("reminder") !== "1") {
  try { window.localStorage.setItem(`carres.pendingWork.shownOn.${ME}`, appTodayIso()); } catch { /* a private window: the reminder shows */ }
}

const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[`/operation?tab=purchase${params.get("so") ? `&so=${params.get("so")}` : ""}${params.get("view") ? `&view=${params.get("view")}` : ""}`]}>
        <Routes>
          <Route path="/operation/*" element={<OperationApp />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  </StrictMode>,
);

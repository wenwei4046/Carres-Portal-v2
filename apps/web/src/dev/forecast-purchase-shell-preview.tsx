/**
 * FORECAST PURCHASE · REAL SHELL PREVIEW — DEV ONLY (owner 13 Oct 2026).
 *
 * The REAL `OperationApp` (portal sidebar, header, the page and the Tasks
 * panel) at `/operation?tab=forecast-purchase`, so the list is measured with
 * the chrome production puts beside it. Only the network is seeded: every API
 * call is answered here and nothing leaves the browser. Every model, supplier
 * and number below is TEST data; it is not evidence about the business.
 *
 * `?state=empty` (nothing sold) · `?state=error` (the read fails) ·
 * `?state=nolead` (production days not set for one supplier) ·
 * `?state=nodest` (no default Deliver To) · `?show=suggested` · `?show=ordered` ·
 * default: eight TEST models, one with no supplier, one size already asked
 * for and one already approved.
 *
 * `Send for approval` works here: the TEST requests are kept in the page and
 * the sizes then read `Waiting for approval`. Nothing is written anywhere.
 */
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { forecastPurchaseAddDays, forecastPurchaseWindow, type ForecastPurchaseResponse, type ForecastPurchaseSize } from "@carres/shared";
import { useAuth } from "@/lib/auth";
import OperationApp from "@/pages/operation/OperationApp";
import { testTasksFeed } from "./tasks-feed-fixture";
import { appTodayIso } from "@/lib/fmt-date";
import "@/index.css";

const ME = "00000000-0000-4000-8000-0000000000aa";
const params = new URLSearchParams(window.location.search);
const state = params.get("state");

const SIZES = ["King", "Queen", "Super Single", "Single"] as const;
/* [model, supplier, per size: sold two months ago · last month · this month · last 14 days · free · on PO] */
const MODELS: Array<[string, string | null, string, number[][]]> = [
  ["TEST Mattress Alpha", "TEST Supplier One", "mattress", [[6, 9, 5, 5, 2, 0], [8, 12, 7, 7, 3, 0], [1, 2, 1, 1, 1, 0], [0, 1, 0, 0, 2, 0]]],
  ["TEST Mattress Bravo with a long model name that wraps", "TEST Supplier One", "mattress", [[3, 5, 4, 4, 0, 2], [4, 6, 3, 3, 3, 0], [0, 0, 1, 1, 0, 0], [0, 0, 0, 0, 0, 0]]],
  ["TEST Mattress Charlie", "TEST Supplier One", "mattress", [[2, 3, 2, 2, 4, 0], [2, 4, 2, 2, 5, 0], [0, 1, 0, 0, 0, 0], [1, 0, 0, 0, 1, 0]]],
  ["TEST Mattress Delta", "TEST Supplier One", "mattress", [[1, 2, 3, 3, 0, 0], [0, 3, 2, 2, 0, 0], [0, 0, 0, 0, 0, 0], [0, 0, 0, 0, 0, 0]]],
  ["TEST Mattress Echo", null, "mattress", [[1, 1, 2, 2, 0, 0], [0, 2, 1, 1, 0, 0], [0, 0, 0, 0, 0, 0], [0, 0, 0, 0, 0, 0]]],
  ["TEST Mattress Foxtrot", "TEST Supplier One", "mattress", [[0, 1, 0, 0, 3, 0], [1, 1, 0, 0, 2, 0], [0, 0, 0, 0, 0, 0], [0, 0, 0, 0, 0, 0]]],
  ["TEST Mattress Golf", "TEST Supplier One", "mattress", [[0, 0, 0, 0, 1, 0], [0, 0, 0, 0, 0, 0], [0, 0, 0, 0, 0, 0], [0, 0, 0, 0, 0, 0]]],
  ["TEST Bedframe Hotel", "TEST Supplier Two", "bedframe", [[2, 3, 2, 2, 0, 0], [3, 4, 3, 3, 1, 0], [0, 0, 0, 0, 0, 0], [0, 1, 0, 0, 0, 0]]],
];

const sizes: ForecastPurchaseSize[] = state === "empty" ? [] : MODELS.flatMap(([model, supplier, category, rows], m) =>
  rows.map(([a, b, c, last14, free, onPo], s) => ({
    sku: `TEST-${m + 1}-${SIZES[s]!.replace(/[a-z ]/g, "")}`,
    modelId: `test-model-${m + 1}`, model, category, size: SIZES[s]!,
    supplierId: supplier ? `test-supplier-${supplier}` : null, supplier,
    sold: [a!, b!, c!] as [number, number, number], sold14: last14!, free: free!, onPo: onPo!,
    requested: 0, requests: [],
  })));
/* Stock on its way: Charlie · King is asked for and waits for the approver;
   Foxtrot · Queen is approved and waits for PO Duty. */
const ask = (sku: string, id: string, no: string, qty: number, state: "waiting" | "ready") => {
  const size = sizes.find((candidate) => candidate.sku === sku);
  if (!size) return;
  size.requested += qty;
  size.requests.push({ id, no, qty, state });
};
ask("TEST-3-K", "bbbbbbbb-0000-4000-8000-000000000001", "MPR-TEST-0001", 2, "waiting");
ask("TEST-6-Q", "bbbbbbbb-0000-4000-8000-000000000002", "MPR-TEST-0002", 1, "ready");

const today = appTodayIso();
const window_ = forecastPurchaseWindow(today);
const payload: ForecastPurchaseResponse = {
  today, months: window_.months, mondays: window_.mondays, sizes,
  deliverTo: state === "nodest" ? null : { id: "cccccccc-0000-4000-8000-000000000001", name: "TEST Warehouse" },
  minDeliveryDays: 0,
  approver: { id: "dddddddd-0000-4000-8000-000000000001", name: "TEST · Approver" },
  poDuty: { id: ME, name: "TEST · Staff A" },
};
/* The plan's answer: seven days of production for Supplier One, ten for Two. */
const planOf = (skus: string[]) => {
  const lines = skus.map((sku) => {
    const size = sizes.find((candidate) => candidate.sku === sku);
    const days = !size?.supplierId ? null : state === "nolead" && size.supplier === "TEST Supplier Two" ? null : size.supplier === "TEST Supplier Two" ? 10 : 7;
    return { sku, supplierId: size?.supplierId ?? null, supplierName: size?.supplier ?? null, category: size?.category ?? null, productionDays: days, arrival: days == null ? null : forecastPurchaseAddDays(today, days) };
  });
  const complete = lines.every((line) => line.arrival != null);
  return { proceedDate: today, lines, planUnavailable: false, deliveryDateDefault: complete ? lines.map((line) => line.arrival!).sort().pop() ?? null : null };
};
let created = 0;
const createRequest = (body: { lines?: Array<{ sku: string; qty: number }> }) => {
  created += 1;
  const id = `eeeeeeee-0000-4000-8000-${String(created).padStart(12, "0")}`;
  for (const line of body.lines ?? []) ask(line.sku, id, `MPR-TEST-${String(100 + created)}`, line.qty, "waiting");
  return { id, approval_required: true };
};

const realFetch = window.fetch.bind(window);
window.fetch = async (input, init) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  if (!url.includes("127.0.0.1:88")) return realFetch(input, init);
  if (url.includes("/api/operation/purchase/forecast") && state === "error") {
    return new Response(JSON.stringify({ error: "rpc_failed" }), { status: 500, headers: { "content-type": "application/json" } });
  }
  const method = (init?.method ?? "GET").toUpperCase();
  const sent = method === "POST" ? JSON.parse(String(init?.body ?? "{}")) : null;
  const body = url.includes("/api/operation/purchase/forecast") ? payload
    : url.includes("/api/operation/purchasing/requests/plan") ? planOf((sent as { skus?: string[] })?.skus ?? [])
    : url.includes("/api/operation/purchasing/requests") && method === "POST" ? createRequest(sent)
    /* The shell's Tasks panel reads the one Work feed: TEST work for the preview person. */
    : /\/api\/operation\/work(\?|$)/.test(url) ? testTasksFeed({ id: ME, name: "TEST · Staff A", email: "preview@carres.local" })
    : url.includes("/api/operation/orders?") ? { orders: [] }
    : url.includes("/rest/") ? [] : {};
  return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
};

useAuth.setState({
  role: "operation", hydrated: true, loading: false,
  user: { id: ME, email: "preview@carres.local" } as never,
  session: { access_token: "preview", user: { id: ME, email: "preview@carres.local" } } as never,
});

if (params.get("reminder") !== "1") {
  try { window.localStorage.setItem(`carres.pendingWork.shownOn.${ME}`, appTodayIso()); } catch { /* a private window: the reminder shows */ }
}

const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[`/operation?tab=forecast-purchase${params.get("show") ? `&show=${params.get("show")}` : ""}`]}>
        <Routes>
          <Route path="/operation/*" element={<OperationApp />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  </StrictMode>,
);

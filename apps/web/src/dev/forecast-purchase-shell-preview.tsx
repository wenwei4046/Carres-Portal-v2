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
 * `?show=suggested` · default: eight TEST models, one with no supplier.
 */
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { forecastPurchaseWindow, type ForecastPurchaseResponse, type ForecastPurchaseSize } from "@carres/shared";
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
  })));

const today = appTodayIso();
const window_ = forecastPurchaseWindow(today);
const payload: ForecastPurchaseResponse = { today, months: window_.months, mondays: window_.mondays, sizes };

const realFetch = window.fetch.bind(window);
window.fetch = async (input, init) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  if (!url.includes("127.0.0.1:88")) return realFetch(input, init);
  if (url.includes("/api/operation/purchase/forecast") && state === "error") {
    return new Response(JSON.stringify({ error: "rpc_failed" }), { status: 500, headers: { "content-type": "application/json" } });
  }
  const body = url.includes("/api/operation/purchase/forecast") ? payload
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

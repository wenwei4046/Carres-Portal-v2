/**
 * DEALER COMMISSION PREVIEW — DEV ONLY (dealer commission step 3, 0664).
 *
 * The store's own Commission page, the POS overlay its store owner opens from
 * the `Commission` pill, over a seeded statement (dealer-commission-fixture),
 * with the real stylesheets. A separate vite entry: it cannot reach
 * production, and nothing leaves the browser. `?state=failed` shows the page
 * when the read fails. Fixture evidence is not production evidence.
 */
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import CommissionPage from "@/pages/dealer/commission/CommissionPage";
import { STATEMENT } from "./dealer-commission-fixture";
import "@/index.css";
import "@/styles/pos-prototype.css";

const FAILED = new URLSearchParams(window.location.search).get("state") === "failed";

useAuth.setState({
  role: "dealer" as never, hydrated: true, loading: false,
  user: { id: "u-dealer", email: "store@example.com" } as never,
  session: { access_token: "preview", user: { id: "u-dealer", email: "store@example.com" } } as never,
});

const realFetch = window.fetch.bind(window);
window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  if (!url.includes("/api/")) return realFetch(input, init);
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
  if (url.includes("/api/dealer-commission/statement")) {
    return FAILED ? json({ message: "Store owner only" }, 403) : json(STATEMENT);
  }
  return json({}, 404);
};

const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={qc}>
      <CommissionPage onClose={() => console.info("Back to the POS")} />
    </QueryClientProvider>
  </StrictMode>,
);

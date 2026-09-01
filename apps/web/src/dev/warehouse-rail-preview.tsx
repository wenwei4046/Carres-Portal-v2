/**
 * WAREHOUSE RAIL PREVIEW — DEV ONLY.
 *
 * The same contract as `work-preview.tsx`: the REAL PortalSidebar, the REAL
 * stylesheet, only the session seeded instead of fetched. It exists to walk
 * CARD-2026-09-01-warehouse-01-sidebar without a login: the four approved
 * destinations (`Dashboard · Inbound · Inventory · Outbound`), the three
 * `Coming soon` non-controls, the one live Inventory door, and the absence of
 * the superseded `Stock · Ready stock · In & out · Transfers · Counts` rows.
 *
 * A separate vite entry (`warehouse-rail-preview.html`), not a route:
 * `vite build` only emits `index.html`'s graph, so this cannot reach
 * production. The fetch stub 404s everything — badge counts render nothing,
 * which is the zero-prints-nothing law anyway.
 */
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import PortalSidebar from "@/pages/portal/PortalSidebar";
import "@/index.css";

// The rail reads only role (+ user email in the footer); a signed-in
// operation account is seeded directly — no Supabase session exists here.
useAuth.setState({
  role: "operation",
  user: { email: "sha@carres.co" } as never,
});

const realFetch = window.fetch.bind(window);
window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  if (url.startsWith("/api/")) {
    return new Response(JSON.stringify({}), { status: 404 });
  }
  return realFetch(input, init);
};

const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={["/operation?tab=stock-onhand"]}>
        <div className="flex h-screen bg-base-100">
          <PortalSidebar />
          <div className="flex-1 p-6 text-body text-base-600">
            (page body — not part of this walk)
          </div>
        </div>
      </MemoryRouter>
    </QueryClientProvider>
  </StrictMode>,
);

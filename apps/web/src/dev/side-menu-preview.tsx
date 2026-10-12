/**
 * SIDE MENU PREVIEW — DEV ONLY (walk aid, 12 Oct 2026).
 *
 * The REAL `PortalSidebar` with the REAL stylesheet beside an empty page
 * ground, so the menu can be measured against 01 §4 "Side menu" at any width
 * and in any theme. Only the session is seeded and every `/api/` call is
 * answered empty. A separate vite entry, so it cannot reach production.
 *
 * `?theme=teal` picks a theme (default blue), `?role=principal` a role and
 * `?at=` the page to stand on, exactly as the app addresses it, for example
 * `side-menu-preview.html?at=/operation%3Ftab%3Dpurchase`.
 */
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, useLocation } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import PortalSidebar from "@/pages/portal/PortalSidebar";
import "@/index.css";

const params = new URLSearchParams(window.location.search);
window.history.replaceState(null, "", params.get("at") ?? "/operation?tab=purchase");
document.documentElement.setAttribute("data-theme", params.get("theme") ?? "blue");
useAuth.setState({
  role: (params.get("role") ?? "operation") as never,
  session: { user: { id: "test-staff-a", email: "test.staff.a@carres.test", user_metadata: { name: "TEST · Staff A" } } } as never,
});

const realFetch = window.fetch.bind(window);
window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  if (url.includes("/api/")) {
    return new Response(JSON.stringify({}), { status: 200, headers: { "Content-Type": "application/json" } });
  }
  return realFetch(input, init);
};

function Where() {
  const location = useLocation();
  return (
    <main className="min-w-0 flex-1 p-6 text-body text-c-secondary" data-testid="where">
      {location.pathname}
      {location.search}
    </main>
  );
}

const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={qc}>
      <BrowserRouter>
        <div className="flex min-h-screen bg-c-ground">
          <PortalSidebar />
          <Where />
        </div>
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);

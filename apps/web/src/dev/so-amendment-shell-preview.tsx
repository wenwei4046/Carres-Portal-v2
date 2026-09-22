/**
 * SALES ORDER AMENDMENT · REAL PORTAL SHELL PREVIEW — DEV ONLY (Jess 2026-09-22).
 *
 * The REAL `OperationApp` — PortalSidebar, the right rail, the route table — at
 * `/operation/orders/so/:id`. Only two things are not production:
 *   · vite.so-shell.config.ts answers OperationApp's `./SalesOrderWorkspace` import with
 *     the approved amendment page (so-amendment-page.tsx); nothing in the app changes;
 *   · every network call is answered locally — nothing leaves the browser.
 * So the content width the page gets is the width production's chrome leaves it.
 * Cases: masked real orders SO-1363 (default) and ?so=1206; ?case=sim is simulated.
 * Fixture evidence is not authenticated production evidence.
 */
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "sonner";
import { useAuth } from "@/lib/auth";
import OperationApp from "@/pages/operation/OperationApp";
import PreviewFrame from "./preview-frame";
import "@/index.css";

const realFetch = window.fetch.bind(window);
window.fetch = async (input, init) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  const abs = new URL(url, window.location.href);
  /* Same-origin static files (fonts, PDF worker, logo) load normally; every API call is local. */
  /* data:/blob: (the PDF engine's wasm) and same-origin static files load normally. */
  if (!abs.protocol.startsWith("http")) return realFetch(input, init);
  if (abs.origin === window.location.origin && !abs.pathname.startsWith("/api/") && !abs.pathname.includes("/rest/")) return realFetch(input, init);
  const body = abs.pathname.includes("/rest/") ? [] : {};
  return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
};

useAuth.setState({
  role: "operation", hydrated: true, loading: false,
  user: { id: "u-op", email: "preview@carres.local" } as never,
  session: { access_token: "preview", user: { id: "u-op", email: "preview@carres.local" } } as never,
});

const q = new URLSearchParams(window.location.search);
const label = q.get("case") === "sim"
  ? "Sales Order amendment · SIMULATED edge case"
  : `Sales Order amendment · masked real order SO-${q.get("so") === "1206" ? "1206" : "1363"}`;
const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    {/* OperationApp draws itself h-screen; inside the frame it takes the frame's height. */}
    <style>{".so-shell-fit > .h-screen { height: 100%; }"}</style>
    <QueryClientProvider client={client}>
      <PreviewFrame label={label}>
        <div className="so-shell-fit h-full">
          <MemoryRouter initialEntries={["/operation/orders/so/preview"]}>
            <Routes>
              <Route path="/operation/*" element={<OperationApp />} />
            </Routes>
          </MemoryRouter>
        </div>
      </PreviewFrame>
      <Toaster position="top-right" richColors closeButton />
    </QueryClientProvider>
  </StrictMode>,
);

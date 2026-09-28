/**
 * WORK · SO-1333 REPLAY PREVIEW — DEV ONLY (Workspace MASTER §5.10 acceptance).
 *
 * The REAL Work page over read responses REPLAYED from this browser's own
 * storage (`localStorage["work-so1333"]`, never in git): each key is an API
 * path with its query, each value the response the owning door returned for
 * SO-1333 (test data, Constitution §6). The recording arrives once in the
 * URL hash (`#fx=` + JSON, never sent to a server) from a signed-in portal
 * tab and is kept in this origin's storage; nothing is invented. A path with
 * no recorded response answers 404 and is listed on `window.__missing`.
 * Writes answer 200 and change nothing.
 */
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import OperationWork from "@/pages/operation/OperationWork";
import PreviewFrame from "./preview-frame";
import "@/index.css";

const STORE = "work-so1333";
const read = (): Record<string, unknown> & { __me?: string } => {
  try {
    return JSON.parse(localStorage.getItem(STORE) ?? "{}");
  } catch {
    return {};
  }
};
if (window.location.hash.startsWith("#fx=")) {
  try {
    const arrived = JSON.parse(decodeURIComponent(window.location.hash.slice(4))) as Record<string, unknown>;
    localStorage.setItem(STORE, JSON.stringify({ ...read(), ...arrived }));
  } catch {
    /* a broken recording leaves the stored one as it was */
  }
  history.replaceState(null, "", window.location.pathname + window.location.search);
}
const RECORDED = read();
const missing = new Set<string>();
(window as unknown as { __missing: Set<string> }).__missing = missing;

const realFetch = globalThis.fetch.bind(globalThis);
globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  if (!url.includes("/api/")) return realFetch(input, init);
  const at = new URL(url, window.location.origin);
  const key = `${at.pathname}${at.search}`;
  if ((init?.method ?? "GET").toUpperCase() !== "GET") return new Response("{}", { status: 200, headers: { "Content-Type": "application/json" } });
  if (key in RECORDED) return new Response(JSON.stringify(RECORDED[key]), { status: 200, headers: { "Content-Type": "application/json" } });
  missing.add(key);
  return new Response(JSON.stringify({ message: "not recorded" }), { status: 404 });
};

useAuth.setState({ role: "operation", user: { id: RECORDED.__me ?? "me", email: "preview@carres.test" } as never });

const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
const start = new URLSearchParams(window.location.search).get("at") ?? "/operation?tab=work";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[start]}>
        <PreviewFrame label="Work · SO-1333 replayed reads (test data)">
          <div className="flex h-full flex-col">
            <OperationWork />
          </div>
        </PreviewFrame>
      </MemoryRouter>
    </QueryClientProvider>
  </StrictMode>,
);

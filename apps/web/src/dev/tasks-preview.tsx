/**
 * TASKS · LOCAL WALK — DEV ONLY (owner direction 2026-10-05; storyboard
 * `output/purchasing-plan-2026-10-05/tasks-complete-ux.html`, layout B).
 *
 * The REAL `OperationApp` — portal sidebar, the page on the left, the Quick
 * Rail and the right area — with every API call answered by the fixtures in
 * `tasks-fixtures.ts` (imported FIRST, so it owns `fetch` before anything
 * captures it). Every write is SIMULATED and changes only those fixtures.
 * A separate vite entry: `vite build` emits `index.html` only, so this can
 * never reach production.
 *
 *   ?scenario=default | loading | failed | failed-no-data | nothing
 *   ?at=<path>         the page on the left (kept while walking)
 */
import { SCENARIO, SCENARIOS, type Scenario } from "./tasks-fixtures";
import { StrictMode, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import OperationApp from "@/pages/operation/OperationApp";
import "@/index.css";

const ME = "00000000-0000-4000-8000-0000000000aa";
const params = new URLSearchParams(window.location.search);

useAuth.setState({
  role: "operation", hydrated: true, loading: false,
  user: { id: ME, email: "sha@carres.example" } as never,
  session: { access_token: "preview", user: { id: ME, email: "sha@carres.example" } } as never,
});

/** Keep the page in the address bar (`?at=`) so a reload returns to it. */
function LocationInAddressBar() {
  const location = useLocation();
  useEffect(() => {
    const next = new URLSearchParams(window.location.search);
    next.set("at", `${location.pathname}${location.search}`);
    window.history.replaceState(null, "", `${window.location.pathname}?${next}`);
  }, [location.pathname, location.search]);
  return null;
}

const SCENARIO_WORDS: Record<Scenario, string> = {
  default: "Full week (Missed, today, later days, no due date)",
  loading: "Loading",
  failed: "Failed read (last numbers kept, Delivery named)",
  "failed-no-data": "Failed read, nothing held yet",
  nothing: "Nothing assigned",
};

function Banner() {
  return (
    /* Floating, so the real shell keeps its own full-height layout. */
    <div className="fixed bottom-2 left-2 z-50 flex max-w-[min(720px,calc(100vw-16px))] flex-wrap items-center gap-x-3 gap-y-1 rounded-card bg-kit-slate-12 px-3 py-1.5 text-label text-white shadow-lg" data-testid="walk-banner">
      <span className="font-semibold">Local walk · Tasks · SIMULATED</span>
      <span className="text-kit-slate-6">Invented data. Every save is simulated here; nothing is issued, sent, saved or messaged.</span>
      <label className="ml-auto flex items-center gap-1.5">
        <span>Scenario</span>
        <select
          className="h-6 rounded-control border border-kit-slate-9 bg-kit-slate-12 px-1 text-label text-white"
          value={SCENARIO}
          data-testid="walk-scenario"
          onChange={(e) => {
            const next = new URLSearchParams(window.location.search);
            next.set("scenario", e.target.value);
            window.location.search = next.toString();
          }}
        >
          {SCENARIOS.map((s) => <option key={s} value={s}>{SCENARIO_WORDS[s]}</option>)}
        </select>
      </label>
      <button
        type="button"
        className="rounded-control border border-kit-slate-9 px-2 text-label"
        data-testid="walk-reset"
        onClick={() => {
          try { window.sessionStorage.clear(); } catch { /* blocked storage */ }
          const next = new URLSearchParams();
          next.set("scenario", SCENARIO);
          window.location.search = next.toString();
        }}
      >
        Reset walk
      </button>
    </div>
  );
}

const start = params.get("at") ?? "/operation?tab=purchase";
const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[start]}>
        <LocationInAddressBar />
        <Routes>
          <Route path="/operation/*" element={<OperationApp />} />
        </Routes>
      </MemoryRouter>
      <Banner />
    </QueryClientProvider>
  </StrictMode>,
);

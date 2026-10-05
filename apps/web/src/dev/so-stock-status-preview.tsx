/**
 * STOCK STATUS · LOCAL WALK — DEV ONLY, every write SIMULATED.
 *
 * The REAL `OperationApp` on the Sales Orders register. `so-stock-status-base`
 * owns `fetch` first (quiet shell reads), then the scenario wraps it. To walk
 * the same scenario inside the Tasks walk instead, import
 * `./so-stock-status-scenario` right AFTER `./tasks-fixtures` in
 * `tasks-preview.tsx` and render `<StockStatusWalkPanel />` beside its Banner.
 */
import "./so-stock-status-base";
import { StockStatusWalkPanel } from "./so-stock-status-scenario";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import OperationApp from "@/pages/operation/OperationApp";
import "@/index.css";

useAuth.setState({
  role: "operation", hydrated: true, loading: false,
  user: { id: "u-walk", email: "walk@carres.example" } as never,
  session: { access_token: "preview", user: { id: "u-walk", email: "walk@carres.example" } } as never,
});

const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={["/operation/orders"]}>
        <Routes>
          <Route path="/operation/*" element={<OperationApp />} />
        </Routes>
      </MemoryRouter>
      <StockStatusWalkPanel />
    </QueryClientProvider>
  </StrictMode>,
);

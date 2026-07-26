import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { QueryClientProvider } from "@tanstack/react-query";
import App from "./App.tsx";
import ErrorBoundary from "./components/ErrorBoundary";
import { queryClient } from "./lib/query-client";
import "./index.css";
// POS prototype skin — scoped under .pos-proto (Loo's Claude Design, 2026-07-04).
import "./styles/pos-prototype.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    {/* Outermost net: below this there is nothing left to render but a blank
        document, which is what the app used to do on any render error. */}
    <ErrorBoundary variant="root">
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </QueryClientProvider>
    </ErrorBoundary>
  </React.StrictMode>,
);

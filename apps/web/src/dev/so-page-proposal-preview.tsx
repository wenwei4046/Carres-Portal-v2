/** Standalone entry (no shell) for the amendment page — kept for the document checks. */
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "sonner";
import SoAmendmentPage from "./so-amendment-page";
import "@/index.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter>
        <div className="h-screen"><SoAmendmentPage /></div>
      </MemoryRouter>
      <Toaster position="top-right" />
    </QueryClientProvider>
  </StrictMode>,
);

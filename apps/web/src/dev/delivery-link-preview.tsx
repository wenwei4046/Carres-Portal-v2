/**
 * DELIVERY LINK PREVIEW — DEV ONLY (0581).
 *
 * The REAL external link page over a seeded fetch stub, so the phone layout
 * can be measured without a token. A separate vite entry: `vite build` only
 * emits `index.html`'s graph, so this cannot reach production. Every party,
 * date and number here is invented.
 */
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { addWorkingDays, myHolidaySet } from "@carres/shared";
import { appTodayIso } from "@/lib/fmt-date";
import DeliveryLinkPage from "@/pages/public/DeliveryLinkPage";
import "@/index.css";

const view = {
  company: "AL Logistics",
  reference: "TCF0541",
  customerName: "LIM KUAN YANG",
  customerPhone: "012-345 6789",
  address: "12 Jalan Sekolah, 41000 Klang, Selangor",
  building: "Condo",
  requestedDate: addWorkingDays(appTodayIso(), 3, { holidays: myHolidaySet() }),
  goods: [
    { name: "Mattress M1401F · King", qty: 1 },
    { name: "Bedframe B1201S · King", qty: 1 },
  ],
  pickup: ["Supplier sends directly to logistics · AL Sungai Buloh"],
  scheduledDate: null,
  scheduledTime: null,
};
const dead = new URLSearchParams(window.location.search).get("dead") === "1";

const realFetch = globalThis.fetch.bind(globalThis);
globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  if (url.includes("/public/delivery-link/")) {
    if (dead) return new Response(JSON.stringify({ message: "This link no longer works. Ask Carres for a new link." }), { status: 404 });
    if (!init?.method || init.method === "GET") return new Response(JSON.stringify(view), { status: 200, headers: { "Content-Type": "application/json" } });
    return new Response(JSON.stringify({ saved: true }), { status: 200, headers: { "Content-Type": "application/json" } });
  }
  return realFetch(input, init);
};

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <MemoryRouter initialEntries={[`/delivery-link/${"q".repeat(43)}`]}>
      <Routes>
        <Route path="/delivery-link/:token" element={<DeliveryLinkPage />} />
      </Routes>
    </MemoryRouter>
  </StrictMode>,
);

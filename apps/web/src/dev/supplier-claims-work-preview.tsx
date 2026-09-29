/**
 * SUPPLIER CLAIM WORK PREVIEW — DEV ONLY (Purchasing §9.5 slice C1).
 *
 * The REAL Work page over a feed whose items are produced by the REAL
 * projector (`projectSupplierClaimWork`, the one the API feed runs) from
 * three fixture claims at three stops. Claim numbers are `{Supplier Claim No}`
 * placeholders; suppliers are test suppliers. A separate vite entry: it
 * cannot reach production.
 */
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { myHolidaySet, projectSupplierClaimWork, type OperationWorkResponse, type SupplierClaimFacts } from "@carres/shared";
import { useAuth } from "@/lib/auth";
import { appTodayIso } from "@/lib/fmt-date";
import OperationWork from "@/pages/operation/OperationWork";
import PreviewFrame from "./preview-frame";
import "@/index.css";

const ME = "00000000-0000-4000-8000-0000000000aa";
const JESS = "00000000-0000-4000-8000-0000000000bb";
const TODAY = appTodayIso();
const HOLS = myHolidaySet();
function back(n: number): string {
  let cur = TODAY;
  let left = n;
  while (left > 0) {
    const d = new Date(`${cur}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() - 1);
    cur = d.toISOString().slice(0, 10);
    if (d.getUTCDay() !== 0 && d.getUTCDay() !== 6 && !HOLS.has(cur)) left--;
  }
  return cur;
}
const claim = (over: Partial<SupplierClaimFacts>): SupplierClaimFacts => ({
  id: "c", claim_no: "{Supplier Claim No}", status: "open", supplier_name: "Hookka Industries",
  requested_action: "replace", requested_at: `${TODAY}T01:00:00Z`, supplier_response: null, sent: false, ...over,
});
const CLAIMS = [
  claim({ id: "c-a", claim_no: "{Supplier Claim No A}", requested_at: `${back(1)}T02:00:00Z` }),
  claim({ id: "c-b", claim_no: "{Supplier Claim No B}", supplier_name: "Laveo", requested_at: `${back(3)}T02:00:00Z`, sent: true }),
  claim({ id: "c-c", claim_no: "{Supplier Claim No C}", supplier_name: "Nice Future", requested_at: `${back(5)}T02:00:00Z`, sent: true }),
];
const duty = (userId: string, name: string, key: string) => ({ dutyKey: key, onDate: TODAY, normalOwner: { userId, name }, buddy: null, activeCover: null, actingPerson: { userId, name }, state: "primary" as const, assignmentId: null });
const items = projectSupplierClaimWork({ claims: CLAIMS, poDuty: duty(ME, "Shasha", "po_duty") as never, approver: duty(JESS, "Jess", "purchasing_approver") as never, today: TODAY, observedAt: `${TODAY}T01:00:00.000Z` });
const FEED: OperationWorkResponse = {
  contractVersion: 2,
  complete: true,
  generatedOn: TODAY,
  closureReceipt: null,
  staff: [{ userId: ME, name: "Shasha", email: "sha@carres.co" }, { userId: JESS, name: "Jess", email: "jess@carres.co" }],
  sources: (["orders", "purchasing", "receiving", "delivery", "payment", "issue_tracker"] as const).map((key) => ({
    key, state: "healthy" as const, observedAt: `${TODAY}T01:00:00.000Z`, lastSuccessfulAt: `${TODAY}T01:00:00.000Z`, errorLabel: null,
  })),
  items,
};

const json = (body: unknown) => new Response(JSON.stringify(body), { headers: { "Content-Type": "application/json" } });
const realFetch = window.fetch.bind(window);
window.fetch = async (input, init) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  if (/\/api\/operation\/work(\?|$)/.test(url)) return json(FEED);
  if (/\/api\/operation\/staff(\?|$)/.test(url)) return json({ staff: [{ user_id: ME, email: "sha@carres.co", name: "Shasha", pooled: true, available: true, note: null, last_seen_at: null, duties: [] }], myDuties: [] });
  if (url.includes("/api/")) return new Response(JSON.stringify({ message: "not seeded" }), { status: 404 });
  return realFetch(input, init);
};

useAuth.setState({ role: "operation", user: { id: ME, email: "sha@carres.co" } as never });
const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
const start = new URLSearchParams(window.location.search).get("at") ?? "/operation?tab=work&day=missed";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[start]}>
        <PreviewFrame label="Work · Supplier Claim items (fixture claims, real projector)">
          <div className="flex h-full flex-col">
            <OperationWork />
          </div>
        </PreviewFrame>
      </MemoryRouter>
    </QueryClientProvider>
  </StrictMode>,
);

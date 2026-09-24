/**
 * WORK PREVIEW — DEV ONLY.
 *
 * The REAL Work page and stylesheet over a seeded v2 Work feed
 * (`/api/operation/work`), so the left rail can be walked and measured without
 * a login: Thu 17 Sep is today, Wed 16 Sep is Malaysia Day, and the opening
 * URL chooses Wed so today's blue badge and the chosen pale-blue row can be
 * seen apart. Every party, date and number here is invented.
 *
 * A separate vite entry (`work-preview.html`), not a route: `vite build` only
 * emits `index.html`'s graph, so this cannot reach production. The fetch stub
 * answers ONLY the Work read; every other API path 404s.
 */
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { OperationWorkItem, OperationWorkModule, OperationWorkResponse } from "@carres/shared";
import { useAuth } from "@/lib/auth";
import OperationWork from "@/pages/operation/OperationWork";
import PreviewFrame from "./preview-frame";
import "@/index.css";

const ME = "00000000-0000-4000-8000-0000000000aa";
const TODAY = "2026-09-17";

let seq = 0;
type Words = { problem: string; action: string; recipient: string | null; ref?: string };
const WORDS: Record<OperationWorkModule, Words[]> = {
  orders: [
    { problem: "No delivery date", action: "Ask customer for a delivery date", recipient: "Tan Qu Qu" },
    { problem: "Customer asked to change the sofa colour after the order was confirmed", action: "Confirm the new colour with the customer", recipient: "Lim Mei Ling" },
  ],
  purchasing: [
    { problem: "Supplier has not confirmed the PO", action: "Chase the supplier for PO confirmation", recipient: "Dreamland Factory", ref: "PO2609-1042" },
    { problem: "Production date not set", action: "Ask the factory for a production date", recipient: "Sleepwell Sdn Bhd", ref: "PO2609-1057" },
  ],
  receiving: [{ problem: "Goods arrived without a GRN", action: "Record the goods received", recipient: "Warehouse Klang", ref: "PO2609-1031" }],
  delivery: [
    { problem: "Not delivered", action: "Arrange a new delivery date", recipient: "NETS" },
    { problem: "Delivery proof needs review", action: "Review the delivery proof", recipient: "AL Logistic", ref: "DO2609-20411" },
  ],
  payment: [{ problem: "Customer balance due", action: "Ask customer to pay", recipient: "Wong Kah Wai" }],
  issue_tracker: [{ problem: "Issue waiting for a reply", action: "Reply to the issue", recipient: null }],
};
const used: Partial<Record<OperationWorkModule, number>> = {};

function item(module: OperationWorkModule, actionOn: string | null, missedDays = 0): OperationWorkItem {
  const n = used[module] ?? 0;
  used[module] = n + 1;
  const words = WORDS[module][n % WORDS[module].length];
  seq += 1;
  const id = `obj-${seq}`;
  return {
    contractVersion: 2,
    id: `${module}:${id}:follow`,
    module,
    ruleKey: "follow",
    ruleVersion: 1,
    object: { kind: "sales_order", id, label: words.ref ?? `SO2609-${4800 + seq}` },
    problem: words.problem,
    action: words.action,
    recipient: words.recipient,
    requiredResult: "Customer Delivery exists",
    completionPredicate: "orders.delivery_date exists",
    completionStatement: "Customer Delivery exists",
    owner: {
      rule: "salesperson",
      dutyKey: null,
      normal: { userId: ME, name: "Shasha" },
      activeCover: null,
      coverEvidence: null,
      acting: { userId: ME, name: "Shasha" },
      state: "primary",
    },
    timing: {
      businessDueOn: actionOn,
      actionOn,
      placement: actionOn === null ? "no_working_date" : missedDays > 0 ? "missed" : "on_day",
      missedAge: {
        state: "counted",
        workingDays: missedDays,
        basis: { calendarKey: "module+person", from: actionOn ?? TODAY, to: TODAY },
      },
      eligibility: "eligible",
      noDateReason: actionOn === null ? "The owning rule has no working date" : null,
      calendar: {
        module: { key: module, source: module, state: "ready" },
        actor: { key: "person:shasha", source: "people", state: "ready" },
        holidayName: null,
      },
    },
    communication: null,
    blocker: null,
    nextConsequence: null,
    interaction: { mode: "open_module", fallbackDestination: `/operation/orders/so/${id}` },
    destination: `/operation/orders/so/${id}`,
    observedAt: `${TODAY}T01:00:00.000Z`,
    sourceVersion: `${TODAY}T01:00:00.000Z`,
    tone: "warning",
    locked: false,
    broken: false,
  };
}

const FEED: OperationWorkResponse = {
  contractVersion: 2,
  complete: true,
  generatedOn: TODAY,
  closureReceipt: null,
  staff: [{ userId: ME, name: "Shasha", email: "sha@carres.co" }],
  sources: (["orders", "purchasing", "receiving", "delivery", "payment", "issue_tracker"] as const).map((key) => ({
    key,
    state: "healthy" as const,
    observedAt: `${TODAY}T01:00:00.000Z`,
    lastSuccessfulAt: `${TODAY}T01:00:00.000Z`,
    errorLabel: null,
  })),
  items: [
    item("purchasing", "2026-09-10", 5),
    item("delivery", "2026-09-11", 4),
    item("payment", "2026-09-09", 6),
    item("orders", "2026-09-15"),
    item("receiving", "2026-09-15"),
    item("purchasing", "2026-09-16"),
    item("delivery", "2026-09-16"),
    item("delivery", "2026-09-16"),
    item("orders", "2026-09-16"),
    item("payment", TODAY),
    item("delivery", "2026-09-18"),
    item("purchasing", "2026-09-18"),
    item("orders", null),
    item("payment", null),
  ],
};

const realFetch = globalThis.fetch.bind(globalThis);
globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  if (/\/api\/operation\/work(\?|$)/.test(url)) {
    return new Response(JSON.stringify(FEED), { status: 200, headers: { "Content-Type": "application/json" } });
  }
  if (url.includes("/api/")) return new Response(JSON.stringify({ message: "not seeded" }), { status: 404 });
  return realFetch(input, init);
};

useAuth.setState({ role: "operation", user: { id: ME, email: "sha@carres.co" } as never });

const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
const start = new URLSearchParams(window.location.search).get("at") ?? "/operation?tab=work&day=2026-09-16";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[start]}>
        <PreviewFrame label="Work shell and middle cards (illustrative data)">
          <div className="flex h-full flex-col">
            <OperationWork />
          </div>
        </PreviewFrame>
      </MemoryRouter>
    </QueryClientProvider>
  </StrictMode>,
);

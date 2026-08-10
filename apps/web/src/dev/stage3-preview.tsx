/**
 * STAGE 3 · the three surfaces, rendered for review — DEV ONLY.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THIS EXISTS, AND WHAT IT IS NOT
 *
 * Every card in the queue owes the owner 1440 and 1130 screenshots. Reaching
 * the live screens means signing in, and typing a password is not an action I
 * take — so the evidence would otherwise have been a promise.
 *
 * This is the REAL components, the REAL stylesheet and the REAL markup, with
 * their react-query cache PRE-SEEDED instead of fetched. What it shows is
 * exactly what the operator will see. What it does NOT show is the wiring to
 * live data — and that is not a gap, because the wiring was proven against the
 * production database directly (every verb, every floor, every refusal), which
 * is a stronger claim than a screenshot could make.
 *
 * It is a SEPARATE vite entry (`stage3-preview.html`), not a route:
 *   · the app's router is untouched — no dev branch inside shipping code,
 *   · `vite build` only emits `index.html`'s graph, so this cannot reach
 *     production even by accident.
 *
 * The seeded keys are the components' own (`qk.operation.order(id)` + the
 * suffix each hook appends). If a hook's key changes, its panel renders its
 * empty state here — visibly wrong rather than quietly stale.
 * ──────────────────────────────────────────────────────────────────────────── */
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import CorrectionWorkList from "@/pages/operation/CorrectionWorkList";
import SalesOrderAmendment from "@/pages/operation/SalesOrderAmendment";
import SalesOrderAttribution from "@/pages/operation/SalesOrderAttribution";
import { qk, type CorrectionWorkRow } from "@/lib/queries";
import "@/index.css";

const ORDER_ID = "b5a516eb-6963-4e20-9afe-95cbc5172808"; // SO-1308

/* The fixtures are the SHAPES the live rows had during the evidence run —
 * PO-2036 / PO-2037 really do both serve SO-1206. */
const WORK: CorrectionWorkRow[] = [
  {
    id: "w1",
    order_id: ORDER_ID,
    revision: 2,
    module: "purchasing",
    consequence: "purchase_orders",
    fields_changed: ["order_lines"],
    classification: "B",
    potentially_affected: { po_id: "PO-2037", state: "open" },
    shared: true,
    evidence:
      "PO PO-2037 covers SO-1256, SO-1206, SO-1216, SO-1214, SO-1255 — POTENTIALLY AFFECTED · SHARED, human resolution required. Never auto-revised.",
    state: "open",
    raised_at: "2026-08-10T03:10:00.000Z",
    closed_at: null,
    closed_note: null,
    orders: { so: 1206, customer_name: "Tan Ah Kow" },
  },
  {
    id: "w2",
    order_id: ORDER_ID,
    revision: 2,
    module: "purchasing",
    consequence: "purchase_orders",
    fields_changed: ["order_lines"],
    classification: "B",
    potentially_affected: { po_id: "PO-2036", state: "open" },
    shared: true,
    evidence:
      "PO PO-2036 covers SO-1206, SO-1216, SO-1213, SO-1255 — POTENTIALLY AFFECTED · SHARED, human resolution required. Never auto-revised.",
    state: "closed",
    raised_at: "2026-08-10T03:10:00.000Z",
    closed_at: "2026-08-10T03:20:00.000Z",
    closed_note: "PO-2036 checked — the extra pillow is covered by the existing quantity",
    orders: { so: 1206, customer_name: "Tan Ah Kow" },
  },
];

function seed(state: "pending" | "approved" | "none", amendment: "none" | "fresh" | "stale") {
  const qc = new QueryClient({
    defaultOptions: { queries: { staleTime: Infinity, retry: false, refetchOnMount: false } },
  });
  qc.setQueryData(
    [...qk.operation.order(ORDER_ID), "attribution"],
    state === "none"
      ? { request: null }
      : {
          request: {
            id: "req-1",
            status: state,
            reason: "Wrong person credited at entry",
            created_at: "2026-08-10T03:15:19.000Z",
            decided_at: state === "approved" ? "2026-08-10T03:15:54.000Z" : null,
            decision_note: null,
            applied_at: null,
            fields: ["salesperson_id"],
            approver: "hr_or_principal",
            salesperson: { from: "ahsihas", to: "Alvin" },
          },
        },
  );
  qc.setQueryData(
    [...qk.operation.order(ORDER_ID), "amendment"],
    amendment === "none"
      ? { amendment: null }
      : {
          amendment: {
            id: "amd-1",
            status: "submitted",
            reason: "Customer wants one more",
            base_revision: 4,
            base_contractual_hash: "347fc81f4ce022d698228c6be2f6959e",
            current_contractual_hash:
              amendment === "stale" ? "c15d566c19086f1f02f331add8c920c6" : "347fc81f4ce022d698228c6be2f6959e",
            stale: amendment === "stale",
            proposed_snapshot: { lines: [{ sku: "B1201S-K", qty: 3, unit_price: 2499 }] },
            submitted_at: "2026-08-10T03:36:33.000Z",
          },
        },
  );
  return qc;
}

function Panel({
  n,
  title,
  note,
  children,
}: {
  n: string;
  title: string;
  note: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-card border border-kit-slate-5 bg-white px-4 py-3">
      <div className="text-label font-semibold tracking-wide text-base-500 uppercase">
        {n} · {title}
      </div>
      <p className="text-meta text-base-500 mt-0.5">{note}</p>
      <div className="mt-3">{children}</div>
    </section>
  );
}

const SP = [
  { value: "sp-a", label: "ahsihas" },
  { value: "sp-b", label: "Alvin" },
];
const OUT = [{ value: "o1", label: "Klang Showroom" }];
const DEAL = [{ value: "d1", label: "Carres House" }];
const CURRENT = { salesperson_id: "sp-a", outlet_id: null, dealer_id: "d1" };
const LINES = [{ sku: "B1201S-K", qty: 2, unit_price: 2499 }];

/** One seeded cache, showing ONE lane — a panel about the amendment must not
 *  also draw the attribution lane, or the screenshot stops being an answer. */
function Section({
  label,
  show,
  seedArgs,
}: {
  label: string;
  show: "attribution" | "amendment";
  seedArgs: Parameters<typeof seed>;
}) {
  return (
    <QueryClientProvider client={seed(...seedArgs)}>
      <div className="text-meta text-base-700 mb-1.5 font-semibold">{label}</div>
      {show === "attribution" ? (
        <SalesOrderAttribution
          orderId={ORDER_ID}
          current={CURRENT}
          salespersonOptions={SP}
          outletOptions={OUT}
          dealerOptions={DEAL}
          onApplied={() => {}}
        />
      ) : (
        <SalesOrderAmendment orderId={ORDER_ID} currentLines={LINES} />
      )}
    </QueryClientProvider>
  );
}

/* CorrectionWorkList's row owns a close MUTATION, so it needs a client even
 * where nothing is being fetched. One outer provider covers the panels that
 * render it directly; the per-state Sections nest their own seeded clients
 * inside, which react-query allows. */
const outer = new QueryClient({ defaultOptions: { queries: { retry: false } } });

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={outer}>
    <MemoryRouter>
      <div className="bg-kit-canvas min-h-screen px-6 py-6">
        <h1 className="text-page text-base-900">Stage 3 · the three surfaces</h1>
        <p className="text-meta text-base-500 mt-1 mb-4">
          Real components, real stylesheet, seeded data. The live wiring is proven separately,
          against the database.
        </p>

        <div className="flex flex-col gap-4">
          <Panel
            n="①"
            title="Sales Order · Source — who this order belongs to"
            note="3.3 · nothing waiting: one way in, and it is a request rather than an edit."
          >
            <Section label="No request open" show="attribution" seedArgs={["none", "none"]} />
          </Panel>

          <Panel
            n="②"
            title="Waiting for approval"
            note="3.3 · Approve and Reject, and NO Apply. The screen says the order has not moved."
          >
            <Section label="Pending" show="attribution" seedArgs={["pending", "none"]} />
          </Panel>

          <Panel
            n="③"
            title="Approved — not applied yet"
            note="3.3 · Apply appears only now, and Approve is gone. Approval is permission to try."
          >
            <Section label="Approved" show="attribution" seedArgs={["approved", "none"]} />
          </Panel>

          <Panel
            n="④"
            title="An amendment waiting, and one gone out of date"
            note="3.5 · corrections stay free while it waits; STALE reads as 'propose again'."
          >
            <div className="flex flex-col gap-3">
              <Section label="Fresh" show="amendment" seedArgs={["none", "fresh"]} />
              <Section label="Stale" show="amendment" seedArgs={["none", "stale"]} />
            </div>
          </Panel>

          <Panel
            n="⑤"
            title="Purchase Orders · Sales order changes to check"
            note="3.4 · the receiving module's own list — this is the ONLY surface with a close button."
          >
            <CorrectionWorkList work={WORK} canClose emptyWord="Nothing to check" />
          </Panel>

          <Panel
            n="⑥"
            title="Sales Order · What this change started elsewhere"
            note="3.4 · the SAME rows on the raising side — read-only, and it says who closes them."
          >
            <CorrectionWorkList work={WORK} canClose={false} emptyWord="Nothing raised" />
          </Panel>
        </div>
      </div>
    </MemoryRouter>
    </QueryClientProvider>
  </StrictMode>,
);

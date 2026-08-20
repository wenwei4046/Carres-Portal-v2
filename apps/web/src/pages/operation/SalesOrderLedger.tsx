import { COMMITMENT_CHANGE_WORDS } from "@carres/shared";
import type { SalesOrderRevisionRow } from "@/lib/queries";
import { fmtDate } from "@/lib/fmt-date";
import { describeRevisionChanges } from "./sales-order-revisions";

interface HistoryEvent { text: string; occurred_at: string }

/**
 * History is an operator ledger, not a database log. Older records contain
 * column keys because the writer stored the changed field verbatim. Translate
 * those keys at the read boundary so the immutable event stays untouched while
 * staff see the same words as the Sales Order page.
 */
const HISTORY_FIELD_WORDS: Record<string, string> = {
  customer_name: "Customer name",
  customer_phone: "Phone",
  customer_email: "Email",
  customer_address: "Delivery address",
  customer_address_line1: "Address line 1",
  customer_address_line2: "Address line 2",
  customer_address_city: "City",
  customer_address_state: "State",
  customer_address_postcode: "Postcode",
  customer_billing: "Billing address",
  customer_emergency: "Emergency contact",
  delivery_date: "Customer Delivery",
  delivery_date_tbd: "Customer Delivery date",
  proceed_date: "Proceed date",
  salesperson_id: "Salesperson",
  outlet_id: "Showroom",
  dealer_id: "Dealer",
  installment_months: "Instalment months",
  delivery_floor: "Delivery floor",
  delivery_has_lift: "Lift available",
  delivery_stair_items: "Stair-carry items",
  lines: "Goods",
  addons: "Services",
};

export function historyWords(text: string): string {
  let result = text;
  for (const [key, word] of Object.entries(HISTORY_FIELD_WORDS)) {
    result = result.replace(new RegExp(`\\b${key}\\b`, "g"), word);
  }
  return result.replace(/\s+-\s+/g, " · ");
}

export default function SalesOrderLedger({
  revisions,
  history,
  currentRevision,
  viewedRevision,
  onViewRevision,
  onProposeRevision,
  view: controlledView,
  onViewChange,
  showViewTabs = true,
}: {
  revisions: SalesOrderRevisionRow[];
  history: HistoryEvent[];
  currentRevision: number | null;
  viewedRevision: number | null;
  onViewRevision: (revision: number | null) => void;
  onProposeRevision?: (revision: SalesOrderRevisionRow) => void;
  view?: "revisions" | "history";
  onViewChange?: (view: "revisions" | "history") => void;
  showViewTabs?: boolean;
}) {
  const [internalView, setInternalView] = useState<"revisions" | "history">("revisions");
  const view = controlledView ?? internalView;
  const changeView = (next: "revisions" | "history") => {
    setInternalView(next);
    onViewChange?.(next);
  };
  return (
    <div>
      {showViewTabs && <div role="tablist" aria-label="Sales Order record" className="mb-3 flex gap-1">
        {(["revisions", "history"] as const).map((key) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={view === key}
            onClick={() => changeView(key)}
            className={`rounded-full px-3 py-1 text-meta font-medium ${view === key ? "bg-kit-blue-9 text-white" : "border border-base-200 bg-white text-base-700"}`}
          >
            {key === "revisions" ? "Revisions" : "History"}
          </button>
        ))}
      </div>}
      {view === "revisions" ? (
        revisions.length === 0 ? (
          <p className="text-body text-base-500">No revisions recorded</p>
        ) : (
          <div className="flex flex-col gap-2" data-testid="revision-list">
            <div className="flex flex-wrap gap-1.5">
              {revisions.map((r) => {
                const current = r.revision === currentRevision;
                const selected = viewedRevision == null ? current : viewedRevision === r.revision;
                return (
                  <button key={r.revision} type="button" onClick={() => onViewRevision(current ? null : r.revision)}
                    className={`rounded-full border px-2.5 py-0.5 text-meta font-medium ${selected ? "border-kit-blue-9 bg-kit-blue-3 text-kit-blue-11" : "border-base-200 bg-white text-base-700"}`}>
                    Rev {r.revision}{current ? " · current" : ""}
                  </button>
                );
              })}
            </div>
            <ul className="flex flex-col gap-1.5">
              {[...revisions].reverse().map((r, idx, arr) => {
                const previous = arr[idx + 1] ?? null;
                return (
                  <li key={r.revision} className="text-body">
                    <span className="text-meta font-semibold text-base-700">Rev {r.revision}</span>
                    <span className="text-meta text-base-500"> · {fmtDate(r.created_at, { time: true })}</span>
                    {r.change_type && <span className="ml-1.5 rounded-full border border-base-200 bg-base-50 px-1.5 py-px text-label text-base-700">{COMMITMENT_CHANGE_WORDS[r.change_type]}</span>}
                    {r.note && <span className="ml-1.5 text-meta text-base-500">“{r.note}”</span>}
                    <ul className="mt-0.5 flex flex-col gap-0.5 pl-3">
                      {describeRevisionChanges(previous?.snapshot ?? null, r.snapshot).map((change, i) => <li key={i} className="text-meta text-base-700">{change}</li>)}
                    </ul>
                    {r.revision !== currentRevision && onProposeRevision && (
                      <button type="button" className="mt-1 text-meta font-medium text-kit-blue-9 underline underline-offset-2" onClick={() => onProposeRevision(r)}>
                        Propose this version again
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        )
      ) : history.length === 0 ? (
        <p className="text-body text-base-500">No history recorded</p>
      ) : (
        <ul className="flex flex-col gap-1.5" data-testid="doc-history">
          {history.map((event, i) => (
            <li key={i} className="flex gap-3 text-body">
              <span className="shrink-0 text-meta text-base-500 tabular-nums">{fmtDate(event.occurred_at, { time: true })}</span>
              <span className="min-w-0 break-words">{historyWords(event.text)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
import { useState } from "react";

import { COMMITMENT_CHANGE_WORDS } from "@carres/shared";
import type { SalesOrderRevisionRow } from "@/lib/queries";
import { fmtDate } from "@/lib/fmt-date";
import { describeRevisionChanges } from "./sales-order-revisions";

/**
 * ⭐ AN EVENT NAMES ITS ACTOR (2026-08-24).
 *
 * `by_role` says "Salesperson"; it never says WHICH salesperson, and a ledger
 * that cannot name its actor is an audit trail with the audit removed
 * (MASTER.md:146 — History is "the append-only event ledger").
 *
 * `actor` is the resolved display name, `null` when the id could not be
 * resolved — a cron, a database trigger, a deleted account, or a row written
 * before the column carried anyone. Both fields are OPTIONAL so a browser on
 * this build against an older Worker renders exactly as it did before.
 */
interface HistoryEvent {
  text: string;
  occurred_at: string;
  by_role?: string | null;
  actor?: string | null;
}

/**
 * Who to print for an event. NEVER invents a person: an unresolved actor says
 * `Unknown user` rather than borrowing the role as if it were a name, and the
 * role rides alongside so "Unknown user · Salesperson" still tells the reader
 * what KIND of actor it was even when the account is gone.
 */
export function historyActorWords(event: HistoryEvent): string {
  const who = (event.actor ?? "").trim();
  const role = (event.by_role ?? "").trim();
  const roleWord = role ? role.charAt(0).toUpperCase() + role.slice(1) : "";
  if (who && roleWord) return `${who} · ${roleWord}`;
  if (who) return who;
  // An event with neither is older than the column — say so plainly rather
  // than printing an empty gap the reader has to interpret.
  return roleWord ? `Unknown user · ${roleWord}` : "Unknown user";
}

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
              <span className="min-w-0 break-words">
                <span className="text-meta font-medium text-base-700" data-testid={`history-actor-${i}`}>
                  {historyActorWords(event)}
                </span>
                <span className="text-base-400"> · </span>
                {historyWords(event.text)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
import { useState } from "react";

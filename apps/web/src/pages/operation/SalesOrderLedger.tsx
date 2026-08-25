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
  /** ⭐ THE STRUCTURED HALF OF THE EVENT (2026-08-25).
   *
   *  `docs/orders/MASTER.md:1142` asks History for
   *  `actor/time/reason/Before/After`. Every governed writer has been STORING
   *  that all along — `reason` on a cancellation, `note` and `changed` on an
   *  edit, `revision` naming the version the edit minted — and the read
   *  selected four scalar columns and left it in the database. OPTIONAL, so a
   *  browser on this build against an older Worker renders as it did before. */
  metadata?: unknown;
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

/**
 * ⭐ WHO CHANGED **WHAT** (2026-08-25).
 *
 * `docs/orders/MASTER.md:1142` asks History for `actor/time/reason/Before/After`
 * and records the coverage as *"partial"*. It was partial in a specific way:
 * the event said WHICH FIELDS moved (`Staff correction · Rev 2 · Customer name`)
 * and never what they moved FROM and TO. A reader could see that a promise had
 * been changed and had to open two revisions to learn what it changed to.
 *
 * ⛔ THE BEFORE/AFTER IS NOT COMPUTED HERE. `describeRevisionChanges` already
 * derives it for the Revisions tab, and Architecture Law D says a derived fact
 * has ONE arithmetic — not two that currently agree. An edit event carries
 * `metadata.revision`, which names the version it minted; that version and the
 * one before it are the Before and the After, and the SAME function that
 * renders them under Revisions renders them here. Two implementations of
 * "what changed" would drift the first time one of them learned a new field.
 *
 * The reason is repeated verbatim in the quotation marks the Revisions list
 * already uses for a note — no new word is minted for a thing already on screen
 * three lines away.
 */
export function historyDetailLines(
  event: HistoryEvent,
  revisions: ReadonlyArray<SalesOrderRevisionRow>,
): string[] {
  const meta = (event.metadata ?? null) as Record<string, unknown> | null;
  if (!meta || typeof meta !== "object") return [];
  const out: string[] = [];

  /* `reason` is the cancel/amend lane's word, `note` the correction lane's.
     Both are the operator's own sentence about WHY, so both print the same. */
  const said = [meta.reason, meta.note].find(
    (v): v is string => typeof v === "string" && v.trim().length > 0,
  );
  if (said) out.push(`“${said.trim()}”`);

  const revision = typeof meta.revision === "number" ? meta.revision : null;
  if (revision != null) {
    const at = revisions.findIndex((r) => r.revision === revision);
    /* A revision this page has not loaded yields NOTHING rather than a guess —
       an event may name a version an older/filtered fetch never returned, and
       inventing a diff for it would be worse than the silence it replaces. */
    if (at >= 0) {
      out.push(
        ...describeRevisionChanges(revisions[at - 1]?.snapshot ?? null, revisions[at].snapshot),
      );
    }
  }
  return out;
}

/**
 * One heading per DAY, in the order the events happened.
 *
 * A flat list of timestamps is readable at five events and unreadable at forty:
 * every row carries a full date, so the reader re-parses the same string on
 * every line to find the one boundary that matters — where yesterday ended.
 * Grouping pays that cost once per day.
 */
export function groupHistoryByDay<T extends { occurred_at: string }>(
  events: ReadonlyArray<T>,
): { day: string; events: T[] }[] {
  const out: { day: string; events: T[] }[] = [];
  for (const event of events) {
    /* Keyed by the ISO date, NOT the formatted words: two days can format alike
       across a year boundary, and the key is what decides the grouping. */
    const day = (event.occurred_at ?? "").slice(0, 10);
    const last = out[out.length - 1];
    if (last && last.day === day) last.events.push(event);
    else out.push({ day, events: [event] });
  }
  return out;
}

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
        <div className="flex flex-col gap-4" data-testid="doc-history">
          {groupHistoryByDay(history).map((group) => (
            <section key={group.day}>
              {/* The date is said ONCE per day; the rows below keep only the
                  clock, which is the part that differs between them. */}
              <h3
                className="mb-1.5 text-label font-semibold text-base-500"
                data-testid={`history-day-${group.day}`}
              >
                {fmtDate(group.events[0].occurred_at)}
              </h3>
              <ul className="flex flex-col gap-2">
                {group.events.map((event) => {
                  const index = history.indexOf(event);
                  const details = historyDetailLines(event, revisions);
                  return (
                    <li key={index} className="flex gap-3 text-body">
                      <span className="shrink-0 text-meta text-base-500 tabular-nums">
                        {fmtDate(event.occurred_at, { time: true, timeOnly: true })}
                      </span>
                      <span className="min-w-0 break-words">
                        <span
                          className="text-meta font-medium text-base-700"
                          data-testid={`history-actor-${index}`}
                        >
                          {historyActorWords(event)}
                        </span>
                        <span className="text-base-400"> · </span>
                        {historyWords(event.text)}
                        {details.length > 0 && (
                          <ul
                            className="mt-0.5 flex flex-col gap-0.5 pl-3"
                            data-testid={`history-detail-${index}`}
                          >
                            {details.map((line, d) => (
                              <li key={d} className="text-meta text-base-700">
                                {line}
                              </li>
                            ))}
                          </ul>
                        )}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
import { useState } from "react";

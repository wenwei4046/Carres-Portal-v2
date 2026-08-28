import { useState } from "react";
import { COMMITMENT_CHANGE_WORDS } from "@carres/shared";
import type { SalesOrderRevisionRow } from "@/lib/queries";
import { fmtDate } from "@/lib/fmt-date";
import { isToday, isYesterday } from "./components/activity-display";
import { describeRevisionChanges } from "./sales-order-revisions";

/**
 * ⭐ THE THREE-RANK RECORD GRAMMAR (CARD 2026-08-27, owner-approved).
 *
 * History and Revisions are employee-facing records, not database dumps. Each
 * record answers, in five seconds: what happened · who did it · when · what
 * important result was recorded — as UP TO THREE visual lines
 * (`ui/MASTER.md` § HISTORY + REVISION THREE-RANK RECORD GRAMMAR):
 *
 *   1  what happened          text-body (13) · semibold · primary
 *   2  who and when           text-meta (12) · regular  · secondary
 *   3  important result       text-label (11) · font-normal · quieter
 *
 * The ranks are never concatenated back into one dot-separated sentence, and
 * an inapplicable third rank is omitted, never rendered empty.
 */
export interface LedgerRecordWords {
  title: string;
  identity: string;
  /** Rank-3 lines — the important result/detail. Empty = the rank is omitted.
   *  Structured lines, never one pre-concatenated sentence. */
  detail: string[];
}

/**
 * The event as the API returns it. `actor` is the display name resolved
 * SERVER-SIDE from the authoritative identity tables; `actor_kind` is the
 * server's truthful classification — the browser renders it and never
 * re-derives it, so `System` can never be inferred from a null id here.
 * Every new field is OPTIONAL so a browser on this build against an older
 * Worker still renders the event.
 */
export interface HistoryEvent {
  text: string;
  occurred_at: string;
  by_role?: string | null;
  by_user_id?: string | null;
  actor?: string | null;
  actor_kind?: "human" | "system" | "missing";
  /** The structured half of the event — `reason` on a cancellation, `note` +
   *  `changed` + `revision` on an edit. The read boundary translates these;
   *  the stored event is never rewritten. */
  metadata?: unknown;
}

/** The governed role words. A role is a hat, not a name — it may ride beside
 *  the actor but never impersonate one. */
function roleWord(role: string | null | undefined): string {
  const r = (role ?? "").trim();
  if (!r) return "";
  if (r === "bd") return "BD";
  if (r === "hr") return "HR";
  return r.charAt(0).toUpperCase() + r.slice(1);
}

/**
 * Rank 2 — who and when. The real staff name when a person acted; `System`
 * only when the server proved automation; and the governed audit-data defect
 * sentence when neither can be established. The retired unknown-user copy is
 * deleted from this surface (owner ruling 2026-08-27), and a person is NEVER
 * invented — a missing actor is stated as the defect it is.
 */
export function historyActorWords(event: HistoryEvent): string {
  const when = fmtDate(event.occurred_at, { time: true });
  const role = roleWord(event.by_role);
  const name = (event.actor ?? "").trim();
  /* An older Worker sends no actor_kind; a resolved name is a human and
     anything else is a missing actor. The browser never promotes to System. */
  const kind = event.actor_kind ?? (name ? "human" : "missing");
  if (kind === "human" && name) {
    return [name, role, when].filter(Boolean).join(" · ");
  }
  if (kind === "system") {
    return `System · ${when}`;
  }
  return ["Staff identity not recorded", role, when].filter(Boolean).join(" · ");
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
  delivery_date: "Requested Delivery Date",
  delivery_date_tbd: "Delivery date to be confirmed",
  proceed_date: "Proceed date",
  salesperson_id: "Salesperson",
  outlet_id: "Showroom",
  dealer_id: "Dealer",
  installment_months: "Instalment months",
  customer_address_unknown: "Address not given yet",
  customer_billing_same: "Billing address same as delivery",
  delivery_floor: "Delivery floor",
  delivery_has_lift: "Lift available?",
  delivery_stair_items: "Items needing stair carry",
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

/**
 * Raw stored VALUES become employee words at the presentation boundary
 * (owner ruling 2026-08-27): `0% deposit` is a database fact and `No deposit`
 * is what it means; `online` is a stored payment-method value and
 * `Online order` is the authoritative source fact it records. The stored
 * event text is never rewritten — only read.
 */
function historyValueWords(segment: string): string {
  const s = segment.trim();
  if (/^0% deposit$/i.test(s)) return "No deposit";
  if (/^online$/i.test(s)) return "Online order";
  if (/^credit$/i.test(s)) return "Credit";
  const instalment = s.match(/^installment (\d+) mo$/i);
  if (instalment) return `Instalment · ${instalment[1]} months`;
  return historyWords(s);
}

/**
 * ⭐ WHO CHANGED **WHAT** (2026-08-25).
 *
 * ⛔ THE BEFORE/AFTER IS NOT COMPUTED HERE. `describeRevisionChanges` already
 * derives it for the complete-version view, and Architecture Law D says a
 * derived fact has ONE arithmetic — not two that currently agree. An edit
 * event carries `metadata.revision`, which names the version it minted; that
 * version and the one before it are the Before and the After, and the SAME
 * function renders both surfaces. The operator's own reason/note prints
 * verbatim — readable words, no raw field keys.
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
  if (said) out.push(said.trim());

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
 * One History event → the three ranks. The stored text's FIRST segment names
 * the event (rank 1); the remaining segments are raw stored values that become
 * ONE governed result line (rank 3) — unless the event's structured metadata
 * says the same thing better, in which case the structured facts win and the
 * raw tail is dropped rather than printed twice.
 */
export function historyRecordWords(
  event: HistoryEvent,
  revisions: ReadonlyArray<SalesOrderRevisionRow>,
): LedgerRecordWords {
  const segments = (event.text ?? "").split(/\s+·\s+|\s+-\s+/).filter((s) => s.trim().length > 0);
  const title = historyWords(segments[0] ?? "");
  const identity = historyActorWords(event);

  const metaLines = historyDetailLines(event, revisions);
  const meta = (event.metadata ?? null) as Record<string, unknown> | null;
  const editDiffResolved =
    !!meta &&
    typeof meta === "object" &&
    typeof meta.revision === "number" &&
    revisions.some((r) => r.revision === meta.revision);

  let tail = segments.slice(1);
  if (editDiffResolved) {
    /* The Before → After lines already say WHICH fields moved and to what;
       the raw `Rev n · field_key` tail would repeat it worse. */
    tail = [];
  }
  /* A reason the metadata already carries verbatim is not printed twice. */
  const said = metaLines[0]?.toLowerCase() ?? null;
  tail = tail.filter((t) => !said || !said.includes(t.trim().toLowerCase()));

  const detail: string[] = [];
  if (tail.length > 0) detail.push(tail.map(historyValueWords).join(" · "));
  detail.push(...metaLines);
  return { title, identity, detail };
}

/**
 * One Revision row → the three ranks. A Revision is a complete-version DOOR,
 * not an event: Rev 1 is permanently `Original order`; a later version names
 * the governed applied change word from `change_type` — never the enum, never
 * a raw field key. `Rev n` is identity, not the title, and the current
 * version says so in text, never by colour alone.
 */
export function revisionRecordWords(
  r: SalesOrderRevisionRow,
  currentRevision: number | null,
): LedgerRecordWords {
  const title =
    r.revision === 1
      ? "Original order"
      : r.change_type
        ? COMMITMENT_CHANGE_WORDS[r.change_type]
        : "Order changed";
  const identity = `Rev ${r.revision}${r.revision === currentRevision ? " · Current" : ""}`;
  const when = fmtDate(r.created_at, { time: true });
  const name = (r.created_by_name ?? "").trim();
  const kind = r.actor_kind ?? (name ? "human" : "missing");
  const recorded =
    kind === "human" && name
      ? `Recorded by ${name} · ${when}`
      : kind === "system"
        ? `Recorded by System · ${when}`
        : `Staff identity not recorded · ${when}`;
  const detail = [recorded];
  if (r.note && r.note.trim()) detail.push(r.note.trim());
  return { title, identity, detail };
}

/**
 * The governed History chronology — `Today · Yesterday · Earlier`
 * (`ui/MASTER.md` §6.4 ⑦), newest first. The heading never hides the date:
 * every record's rank 2 carries its actual weekday + date + time.
 */
export function groupHistoryChronology<T extends { occurred_at: string }>(
  events: ReadonlyArray<T>,
): { heading: "Today" | "Yesterday" | "Earlier"; events: T[] }[] {
  const newestFirst = [...events].sort((a, b) =>
    a.occurred_at < b.occurred_at ? 1 : a.occurred_at > b.occurred_at ? -1 : 0,
  );
  const today: T[] = [];
  const yesterday: T[] = [];
  const earlier: T[] = [];
  for (const event of newestFirst) {
    if (isToday(event.occurred_at)) today.push(event);
    else if (isYesterday(event.occurred_at)) yesterday.push(event);
    else earlier.push(event);
  }
  return [
    { heading: "Today" as const, events: today },
    { heading: "Yesterday" as const, events: yesterday },
    { heading: "Earlier" as const, events: earlier },
  ].filter((g) => g.events.length > 0);
}

/** The three ranks, rendered. Rank 3 may hold several structured lines (a
 *  Before → After list); an empty rank renders nothing at all. */
function RecordRanks({ words, index }: { words: LedgerRecordWords; index?: number }) {
  return (
    <>
      <span
        className="text-body font-semibold text-base-900 break-words"
        {...(index != null ? { "data-testid": `history-title-${index}` } : {})}
      >
        {words.title}
      </span>
      <span
        className="text-meta font-normal text-base-600 break-words"
        {...(index != null ? { "data-testid": `history-identity-${index}` } : {})}
      >
        {words.identity}
      </span>
      {words.detail.length > 0 && (
        <span
          className="flex flex-col gap-0.5"
          {...(index != null ? { "data-testid": `history-detail-${index}` } : {})}
        >
          {words.detail.map((line, d) => (
            <span key={d} className="text-label font-normal text-base-600 break-words">
              {line}
            </span>
          ))}
        </span>
      )}
    </>
  );
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
          /* One revision record is ONE clickable door — the duplicate chip
             row above a second list is retired (CARD 2026-08-27). Selecting a
             record opens the complete read-only Sales Order version; quiet
             dividers separate records, never nested cards. */
          <ul className="flex flex-col divide-y divide-base-200" data-testid="revision-list">
            {[...revisions].reverse().map((r) => {
              const current = r.revision === currentRevision;
              const selected = viewedRevision == null ? current : viewedRevision === r.revision;
              const words = revisionRecordWords(r, currentRevision);
              return (
                <li key={r.revision} className="py-1 first:pt-0 last:pb-0">
                  <button
                    type="button"
                    onClick={() => onViewRevision(current ? null : r.revision)}
                    aria-current={selected ? "true" : undefined}
                    data-testid={`revision-record-${r.revision}`}
                    className={`flex w-full min-w-0 flex-col items-start gap-0.5 rounded-control px-2 py-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-kit-blue-9 focus-visible:ring-offset-1 ${selected ? "bg-kit-blue-3" : "hover:bg-hovertint"}`}
                  >
                    <RecordRanks words={words} />
                  </button>
                  {!current && onProposeRevision && (
                    <button
                      type="button"
                      className="ml-2 mt-0.5 text-meta font-medium text-kit-blue-9 underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-kit-blue-9 focus-visible:ring-offset-1"
                      onClick={() => onProposeRevision(r)}
                    >
                      Propose this version again
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )
      ) : history.length === 0 ? (
        <p className="text-body text-base-500">No history recorded</p>
      ) : (
        <div className="flex flex-col gap-4" data-testid="doc-history">
          {groupHistoryChronology(history).map((group) => (
            <section key={group.heading}>
              {/* The governed chronology heading. It hides no date — every
                  record's second rank carries its weekday + date + time. */}
              <h3
                className="mb-1.5 text-label font-semibold text-base-500"
                data-testid={`history-group-${group.heading}`}
              >
                {group.heading}
              </h3>
              <ul className="flex flex-col divide-y divide-base-200">
                {group.events.map((event) => {
                  const index = history.indexOf(event);
                  const words = historyRecordWords(event, revisions);
                  return (
                    <li key={index} className="flex min-w-0 flex-col gap-0.5 py-2 first:pt-0 last:pb-0">
                      <RecordRanks words={words} index={index} />
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

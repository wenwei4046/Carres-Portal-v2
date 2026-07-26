import { ExternalLink } from "lucide-react";
import type { GuaranteeStatus } from "@carres/shared";

/**
 * J2 — Related cases (Order Journey execution queue).
 *
 * "Has anything gone wrong on this order, and where do I go to read it?"
 * Every case record that points at THIS order, one row each, each click landing
 * in the module that owns it. Read-only: this panel never opens, edits or
 * closes a case, it only says one exists.
 *
 * WHAT COUNTS AS A CASE HERE:
 *   - a service case (`service_cases.order_id`) — the 病历 record;
 *   - a CLAIMED guarantee — the swap actually happened, so it is an incident.
 * An ACTIVE guarantee is not a case, it is cover, and the Customer block's
 * GuaranteeCoverStrip already states it. Listing live guarantees here would
 * make every guaranteed order look like it had a problem.
 *
 * SILENCE IS THE DEFAULT (the card's own DONE WHEN): an order with no case
 * renders no rows at all and the drawer hides the tab entirely — not an empty
 * box, not a reassuring "no issues" line. Today that is EVERY order: prod holds
 * 56 orders, 1 service case (linked to no order) and 0 claimed guarantees, so a
 * panel that always rendered would add a permanently empty tab to all 56.
 *
 * ONE EVENT, ONE ROW: claiming a guarantee can open a service case
 * (`guarantee_entitlements.claim_case_id`), in which case the case and the
 * claim are the SAME incident recorded twice. The claim is folded into the
 * service-case row instead of listing both — two rows would read as two
 * separate problems.
 *
 * Supplier claims / receiving issues join this list when the R-series ships
 * them. Nothing is stubbed for them here: a placeholder row would be a promise
 * the data cannot keep.
 */

export type RelatedCaseKind = "service_case" | "guarantee_claim";

/** A service case that names this order. Dates arrive pre-formatted so this
 *  module carries no date dependency (same rule as J1's OrderDocuments). */
export interface RelatedServiceCaseInput {
  id: string;
  caseNo: string;
  caseTypeLabel: string | null;
  statusLabel: string | null;
  statusIsClosed: boolean;
  openedLabel: string;
}

/** One guarantee sold on this order. Only the claimed ones become rows. */
export interface RelatedGuaranteeInput {
  id: string;
  /** The `ABCD123456` handle — the retired one once claimed. Used as the
   *  search term that lands the desk on this exact guarantee. */
  displayId: string | null;
  coversLabel: string | null;
  guaranteeLabel: string | null;
  /** The service case this claim opened, when it opened one. */
  claimCaseId: string | null;
  claimedLabel: string;
  /** `status` with date-based expiry applied — never the raw column. */
  effectiveStatus: GuaranteeStatus;
}

export interface RelatedCaseRow {
  /** Stable react key, unique across the list. */
  id: string;
  kind: RelatedCaseKind;
  /** The record's own number — SC2607-01, or the guarantee handle. */
  ref: string;
  /** What it is about, in plain words. */
  title: string;
  /** The status word to show. */
  status: string;
  /** Settled/closed — drives the pill tone only. */
  settled: boolean;
  /** When it opened. Pre-formatted by the caller. */
  dateLabel: string;
  /** Set when a guarantee claim was folded into this service-case row. */
  guaranteeNote?: string;
  /** Open payloads — exactly one is set per row. */
  caseId?: string;
  guaranteeSearch?: string;
}

/**
 * Build the related-case list for one order. Pure — same input, same rows.
 * Service cases keep the order they arrive in (the API sorts newest-first);
 * standalone guarantee claims follow them.
 */
export function deriveRelatedCases(input: {
  serviceCases: RelatedServiceCaseInput[];
  guarantees: RelatedGuaranteeInput[];
}): RelatedCaseRow[] {
  const rows: RelatedCaseRow[] = [];
  const rowByCaseId = new Map<string, RelatedCaseRow>();

  for (const c of input.serviceCases) {
    const row: RelatedCaseRow = {
      id: `case:${c.id}`,
      kind: "service_case",
      ref: c.caseNo,
      title: c.caseTypeLabel ?? "Service case",
      // A case may be opened before it is classified, so the status word can be
      // genuinely absent. Say so rather than inventing "Open".
      status: c.statusLabel ?? "Not set",
      settled: c.statusIsClosed,
      dateLabel: c.openedLabel,
      caseId: c.id,
    };
    rows.push(row);
    rowByCaseId.set(c.id, row);
  }

  for (const g of input.guarantees) {
    // Cover, not an incident — the Customer block already shows it.
    if (g.effectiveStatus !== "claimed") continue;

    // Same incident as a case already listed → fold in, never a second row.
    const parent = g.claimCaseId ? rowByCaseId.get(g.claimCaseId) : undefined;
    if (parent) {
      parent.guaranteeNote = g.coversLabel
        ? `Guarantee claimed on ${g.coversLabel}`
        : "Guarantee claimed";
      continue;
    }

    rows.push({
      id: `guarantee:${g.id}`,
      kind: "guarantee_claim",
      ref: g.displayId ?? "Guarantee",
      title: g.coversLabel
        ? `Guarantee claim — ${g.coversLabel}`
        : g.guaranteeLabel
          ? `Guarantee claim — ${g.guaranteeLabel}`
          : "Guarantee claim",
      // A claim is one-shot and terminal (0267 retires the ID on use), so a
      // claimed guarantee is always a settled record.
      status: "Claimed",
      settled: true,
      dateLabel: g.claimedLabel,
      guaranteeSearch: g.displayId ?? undefined,
    });
  }

  return rows;
}

/** How many cases this order has — the rail tab's count badge. */
export function countRelatedCases(rows: RelatedCaseRow[]): number {
  return rows.length;
}

/** How many are still open — the rail tab's amber dot. A closed case is
 *  history; an open one is somebody's job today. */
export function countOpenCases(rows: RelatedCaseRow[]): number {
  return rows.filter((r) => !r.settled).length;
}

export default function RelatedCases({
  rows,
  onOpen,
}: {
  rows: RelatedCaseRow[];
  onOpen: (row: RelatedCaseRow) => void;
}) {
  return (
    <div>
      {rows.map((r) => (
        <div
          key={r.id}
          data-testid="related-case-row"
          data-kind={r.kind}
          data-settled={r.settled ? "1" : "0"}
          className="px-3 py-2 border-b border-base-100 last:border-b-0 flex items-start justify-between gap-x-3 gap-y-1 flex-wrap"
        >
          <span className="min-w-0">
            <span className="block text-[13px] font-semibold text-base-900 truncate">
              {r.ref}
            </span>
            <span className="block text-[12px] text-base-600 truncate">
              {r.title}
            </span>
            {r.guaranteeNote && (
              <span className="block text-[12px] text-base-500 truncate">
                {r.guaranteeNote}
              </span>
            )}
          </span>
          <span className="shrink-0 flex items-center gap-2.5">
            <span className="text-[12px] text-base-500">{r.dateLabel}</span>
            <span className={`pill ${r.settled ? "pill-confirmed" : "pill-neutral"}`}>
              {r.status}
            </span>
            <button
              type="button"
              onClick={() => onOpen(r)}
              className="inline-flex items-center gap-1 text-[12px] text-info hover:underline"
            >
              Open
              <ExternalLink size={12} aria-hidden />
            </button>
          </span>
        </div>
      ))}
    </div>
  );
}

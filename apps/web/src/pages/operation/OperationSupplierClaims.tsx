// design-standard: not-a-list-page — Claims sits UNDER the Purchasing module
// tab bar, and UI-KIT §A0's Module-tab law (locked 2026-07-22) says a
// module-tabbed page must NOT render ListPageShell's breadcrumb + big title:
// they duplicate the active tab and burn ~80px Jess does not have. Same shape
// as its sibling Receiving. Stand-alone list pages still use the shell.
import { Fragment, useState } from "react";
import {
  supplierClaimTypeLabel,
  supplierClaimStatusLabel,
  SUPPLIER_CLAIM_LATE,
} from "@carres/shared";
import {
  useOperationSupplierClaims,
  useOperationSupplierClaimPhotos,
} from "@/lib/queries";
import { fmtDate } from "@/lib/fmt-date";
import PurchasingTabs from "./PurchasingTabs";

/**
 * OperationSupplierClaims — R2 of the receiving & claim queue
 * (docs/receiving-claim-execution-queue.md, Jess 2026-07-27).
 *
 * The card's test is "a receiving problem cannot exist without a case row
 * chasing it". Migration 0288 makes the case unavoidable; THIS page is where
 * the case is visible — one row per problem, with the supplier who owes us, the
 * PO it came off, how many units, and the photo that proves it.
 *
 * Sidebar home: none. Claims is a fourth tab under the existing Purchasing
 * module (the queue doc's rule: "no new menu item"), sitting beside Receiving
 * because a claim is what a receiving produces.
 *
 * What this page deliberately does NOT do: resolve anything. What we asked
 * versus what the supplier answered, the WhatsApp follow-up and the close are
 * R3's card — shipping half of R3 here would mean R3 has to unpick it. So the
 * row states facts and nothing more.
 */

type Tab = "open" | "closed" | "all";

const TABS: { key: Tab; label: string }[] = [
  { key: "open", label: "Open" },
  { key: "closed", label: "Closed" },
  { key: "all", label: "All" },
];

/** Claim type → v17 pill. A late delivery is amber (waiting on somebody), an
 *  arrived-but-wrong unit is red (something is already broken). Colour lives
 *  here; the words live in the shared module. */
function claimPill(type: string): string {
  return type === SUPPLIER_CLAIM_LATE ? "pill-warning" : "pill-overdue";
}

export default function OperationSupplierClaims() {
  const [tab, setTab] = useState<Tab>("open");
  const [openClaimId, setOpenClaimId] = useState<string | null>(null);

  const { data, isLoading, isError, error, refetch } =
    useOperationSupplierClaims(tab);
  const photosQ = useOperationSupplierClaimPhotos(openClaimId);

  const claims = data?.claims ?? [];
  const counts = data?.counts ?? { open: 0, closed: 0, all: 0 };

  return (
    <>
      <PurchasingTabs />
      <div className="px-9 py-8 pb-14" data-testid="operation-supplier-claims">
        {/* No big title: the active Purchasing tab already says "Claims"
            (UI-KIT §A0 Module-tab law). One line of what the page is for, then
            straight into the work. */}
        <div className="text-[13px] text-base-600 mb-[18px]">
          What the supplier still owes us. Opened by receiving — damaged or wrong
          items — and by an ETA that passed with goods still pending delivery.
        </div>

        <div
          className="flex gap-1 p-1 bg-base-100 rounded mb-3.5 w-fit max-w-full overflow-auto"
          role="tablist"
          aria-label="Claim status"
        >
          {TABS.map((t) => {
            const active = tab === t.key;
            return (
              <button
                key={t.key}
                role="tab"
                aria-selected={active}
                onClick={() => setTab(t.key)}
                className={`px-3 py-1.5 text-[12px] rounded cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
                  active
                    ? "bg-white text-base-900 font-semibold shadow-sm"
                    : "text-base-600 font-medium hover:text-base-900"
                }`}
              >
                <span>{t.label}</span>
                <span
                  className={`text-[10px] font-mono px-1.5 py-px rounded-full ${
                    active ? "bg-base-100 text-base-700" : "bg-base-200 text-base-500"
                  }`}
                >
                  {counts[t.key]}
                </span>
              </button>
            );
          })}
        </div>

        {isLoading && (
          <div
            className="bg-white border border-base-200 rounded"
            data-testid="supplier-claims-skeleton"
          >
            {Array.from({ length: 5 }).map((_, i) => (
              <div
                key={i}
                className="h-14 border-b border-base-100 animate-pulse bg-base-50/40"
              />
            ))}
          </div>
        )}

        {isError && (
          <div className="rounded-md bg-destructive/10 border border-destructive/30 p-4 text-sm">
            <div className="text-destructive font-semibold mb-2">
              Couldn&rsquo;t load claims
            </div>
            <div className="text-[12px] text-base-700 mb-3">
              {(error as Error | undefined)?.message ?? "Unknown error"}
            </div>
            <button
              type="button"
              onClick={() => void refetch()}
              className="btn-secondary text-[11px] py-1.5 px-3"
            >
              Retry
            </button>
          </div>
        )}

        {!isLoading && !isError && (
          <div className="bg-white border border-base-200 rounded overflow-auto">
            <table
              className="w-full border-collapse text-[13px] [&_tbody_tr:nth-child(even)]:bg-base-100/70"
              style={{ minWidth: 940 }}
            >
              <thead className="bg-base-700 border-b-2 border-primary text-white">
                <tr>
                  <Th>Claim</Th>
                  <Th>Supplier</Th>
                  <Th>Item</Th>
                  <Th>Problem</Th>
                  <Th>PO</Th>
                  <Th>Reported</Th>
                  <Th>Evidence</Th>
                </tr>
              </thead>
              <tbody>
                {claims.length === 0 && (
                  <tr>
                    <td
                      colSpan={7}
                      className="p-12 text-center text-[12px] text-base-500"
                    >
                      {/* An empty state that is a real answer, not a shrug. */}
                      {tab === "open"
                        ? "No open claims — every delivery so far arrived complete and on time."
                        : "Nothing in this tab."}
                    </td>
                  </tr>
                )}
                {claims.map((c) => {
                  const expanded = openClaimId === c.id;
                  return (
                    <Fragment key={c.id}>
                      <tr
                        className="border-t border-base-100 align-top hover:bg-primary/5"
                        data-testid="supplier-claim-row"
                      >
                        <td className="px-4 py-3 whitespace-nowrap font-mono font-semibold text-base-900">
                          {c.claim_no}
                          {c.status !== "open" && (
                            <div className="mt-1">
                              <span className="pill pill-neutral">
                                {supplierClaimStatusLabel(c.status)}
                              </span>
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3 text-base-800">
                          {c.supplier_name ?? "—"}
                        </td>
                        <td className="px-4 py-3 text-base-800">
                          <div>{c.sku}</div>
                          <div className="font-mono text-[10.5px] text-base-500 mt-0.5">
                            {c.qty} unit{c.qty === 1 ? "" : "s"}
                          </div>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <span
                            className={`pill ${claimPill(c.claim_type)}`}
                            data-testid={`claim-type-${c.claim_no}`}
                          >
                            {supplierClaimTypeLabel(c.claim_type)}
                          </span>
                          {c.note && (
                            <div className="text-[11px] text-base-600 mt-1">
                              {c.note}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap font-mono text-base-700">
                          {c.po_id}
                          {c.do_number && (
                            <div className="text-[10.5px] text-base-500 mt-0.5">
                              DO {c.do_number}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-base-700">
                          {fmtDate(c.reported_at)}
                          <div className="text-[10.5px] text-base-500 mt-0.5">
                            {/* A late-delivery claim is raised by the nightly
                                sweep, so there is no human to name. Say so
                                rather than printing a blank. */}
                            {c.reported_by_name ?? "System"}
                          </div>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-right">
                          {c.photo_count > 0 ? (
                            <button
                              type="button"
                              onClick={() =>
                                setOpenClaimId(expanded ? null : c.id)
                              }
                              className="btn-secondary text-[11px] py-1.5 px-3"
                              data-testid={`claim-photos-${c.claim_no}`}
                            >
                              {expanded ? "Hide" : `${c.photo_count} photo${c.photo_count === 1 ? "" : "s"}`}
                            </button>
                          ) : (
                            <span className="text-[11px] text-base-500">—</span>
                          )}
                        </td>
                      </tr>
                      {expanded && (
                        <tr className="bg-base-50">
                          <td colSpan={7} className="px-4 py-3">
                            {photosQ.isLoading && (
                              <div className="text-[12px] text-base-500">
                                Loading photos…
                              </div>
                            )}
                            {photosQ.isError && (
                              <div className="text-[12px] text-danger">
                                Couldn&rsquo;t load the photos.
                              </div>
                            )}
                            <div className="flex gap-3 flex-wrap">
                              {(photosQ.data?.photos ?? []).map((p) =>
                                p.url ? (
                                  <a
                                    key={p.path}
                                    href={p.url}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="block"
                                  >
                                    <img
                                      src={p.url}
                                      alt={`Claim evidence ${p.path}`}
                                      className="h-28 w-auto rounded border border-base-200"
                                    />
                                  </a>
                                ) : (
                                  <span
                                    key={p.path}
                                    className="text-[11px] text-base-500"
                                  >
                                    {p.path} (unavailable)
                                  </span>
                                ),
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th className="px-4 py-2.5 text-[11px] font-bold uppercase tracking-[0.02em] text-white text-left">
      {children}
    </th>
  );
}

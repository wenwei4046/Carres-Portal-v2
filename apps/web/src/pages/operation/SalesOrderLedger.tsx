import { useState } from "react";
import { COMMITMENT_CHANGE_WORDS } from "@carres/shared";
import type { SalesOrderRevisionRow } from "@/lib/queries";
import { fmtDate } from "@/lib/fmt-date";
import { describeRevisionChanges } from "./sales-order-revisions";

interface HistoryEvent { text: string; occurred_at: string }

export default function SalesOrderLedger({
  revisions,
  history,
  currentRevision,
  viewedRevision,
  onViewRevision,
  onProposeRevision,
}: {
  revisions: SalesOrderRevisionRow[];
  history: HistoryEvent[];
  currentRevision: number | null;
  viewedRevision: number | null;
  onViewRevision: (revision: number | null) => void;
  onProposeRevision?: (revision: SalesOrderRevisionRow) => void;
}) {
  const [view, setView] = useState<"revisions" | "history">("revisions");
  return (
    <div>
      <div role="tablist" aria-label="Sales Order record" className="mb-3 flex gap-1">
        {(["revisions", "history"] as const).map((key) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={view === key}
            onClick={() => setView(key)}
            className={`rounded-pill px-3 py-1 text-meta font-medium ${view === key ? "bg-base-900 text-white" : "border border-base-200 bg-white text-base-700"}`}
          >
            {key === "revisions" ? "Revisions" : "History"}
          </button>
        ))}
      </div>
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
                    className={`rounded-pill border px-2.5 py-0.5 text-meta font-medium ${selected ? "border-base-900 bg-base-900 text-white" : "border-base-200 bg-white text-base-700"}`}>
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
                    {r.change_type && <span className="ml-1.5 rounded-pill border border-base-200 bg-base-50 px-1.5 py-px text-label text-base-700">{COMMITMENT_CHANGE_WORDS[r.change_type]}</span>}
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
              <span className="min-w-0 break-words">{event.text}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

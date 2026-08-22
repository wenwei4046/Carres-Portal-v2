// design-standard: not-a-list-page — this is the 50/50 ISSUE surface
// (CARD-2026-08-22-purchasing-02 §5), not a Register. Its table is the lines of
// ONE purchase order being checked before it is sent, sitting beside that
// document's own preview; a ListPageShell would wrap a second page chrome
// around a surface whose whole point is document + work, side by side.
import { useCallback, useMemo, useState } from "react";
import {
  SO_BATCH_PURCHASE_WORDS as W,
  type PurchasingDestination,
  type SoBatchDocument,
} from "@carres/shared";
import { apiFetch } from "@/lib/api";
import { fmtDate } from "@/lib/fmt-date";
import PoIssueEvidence, { type IssuedPo } from "../components/PoIssueEvidence";

/**
 * REVIEW PURCHASE ORDERS — the guided issue journey
 * (CARD-2026-08-22-purchasing-02 §5; `docs/purchasing/MASTER.md` §8.2).
 *
 * 50% work, 50% the actual document. It is a SURFACE, not a modal: a supplier
 * order is an outside-readable document, and checking one behind a dialog that
 * dims the page it came from is how a wrong quantity gets sent.
 *
 * ── THE THREE STATES, AND WHY THE LAST ONE EXISTS ───────────────────────────
 *
 *   REVIEW    one supplier × destination at a time, `1 of N`, nothing created.
 *             The preview is visibly NOT SENDABLE and says why: the number is
 *             minted by Issue PO, so a preview that looked official would be a
 *             document with no identity.
 *   CREATING  one request for every document (§7.3). All or none.
 *   EVIDENCE  the numbers exist and the supplier still has nothing. Issue PO
 *             stays OPEN here — the act that closes it is somebody recording
 *             that the PDF actually arrived, not this screen deciding it did.
 *
 * ── LEAVING IS SAFE, AND DELIBERATELY SO ────────────────────────────────────
 *
 * A numbered purchase order is never deleted by walking away. It waits in
 * Purchase Orders as `Not sent to supplier`, and SO Batch does not offer the
 * same remainder again because the open PO now covers it (§5.2).
 */
export interface SoBatchIssueWorkspaceProps {
  documents: readonly SoBatchDocument[];
  destinations: readonly PurchasingDestination[];
  onBack: () => void;
  /** Every document confirmed — the Register refetches and the journey ends. */
  onDone: () => void;
}

type Mode = "review" | "evidence";

export default function SoBatchIssueWorkspace({
  documents,
  destinations,
  onBack,
  onDone,
}: SoBatchIssueWorkspaceProps) {
  const [at, setAt] = useState(0);
  const [mode, setMode] = useState<Mode>("review");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pos, setPos] = useState<IssuedPo[]>([]);
  const [confirmed, setConfirmed] = useState<Set<string>>(new Set());

  const destinationName = useCallback(
    (id: string) => destinations.find((d) => d.id === id)?.name ?? "",
    [destinations],
  );

  const current = documents[Math.min(at, Math.max(documents.length - 1, 0))];

  /**
   * ONE REQUEST FOR EVERY DOCUMENT (§7.3). The selections are rebuilt from the
   * documents rather than carried through the screen: the grouping the operator
   * saw and the allocation the server will check must come from the same place,
   * and the server regroups it all anyway.
   */
  const selections = useMemo(() => {
    const byDemand = new Map<string, { destinationId: string; qty: number }[]>();
    for (const d of documents) {
      for (const line of d.lines) {
        const list = byDemand.get(line.demandId) ?? [];
        list.push({ destinationId: d.destinationId, qty: line.qty });
        byDemand.set(line.demandId, list);
      }
    }
    return [...byDemand].map(([demandId, allocations]) => ({ demandId, allocations }));
  }, [documents]);

  async function issue() {
    if (creating) return;
    setCreating(true);
    setError(null);
    try {
      const res = await apiFetch<{ pos: IssuedPo[] }>(
        "/api/operation/purchase/to-order/issue-batch",
        {
          method: "POST",
          body: JSON.stringify({ selections, documentDecisions: [] }),
        },
      );
      setPos(res.pos ?? []);
      setMode("evidence");
      setAt(0);
    } catch (e) {
      /* The request is atomic, so a failure created NOTHING. The operator stays
         exactly where they were, with the selection intact, and can fix the
         line the server named. */
      setError(e instanceof Error ? e.message : "Issue PO failed");
    } finally {
      setCreating(false);
    }
  }

  const onConfirmed = useCallback(
    (poId: string) => {
      setConfirmed((prev) => {
        const next = new Set(prev).add(poId);
        if (next.size >= pos.length && pos.length > 0) onDone();
        else {
          /* Move to the next document the supplier has not received. */
          const nextIdx = pos.findIndex((p) => !next.has(p.id));
          if (nextIdx >= 0) setAt(nextIdx);
        }
        return next;
      });
    },
    [pos, onDone],
  );

  const total = mode === "evidence" ? pos.length : documents.length;
  const idx = Math.min(at, Math.max(total - 1, 0));
  const currentPo = mode === "evidence" ? pos[idx] : undefined;

  return (
    <div
      className="flex h-full min-h-0 flex-col bg-kit-canvas"
      data-testid="so-batch-issue-workspace"
    >
      <div className="flex h-[50px] shrink-0 items-center justify-between gap-3 border-b border-kit-slate-5 bg-white px-4">
        <span className="flex items-baseline gap-3">
          <span className="text-page font-semibold">{W.reviewTitle}</span>
          <span className="text-meta text-kit-slate-11" data-testid="so-batch-issue-count">
            {idx + 1} of {total}
          </span>
        </span>
        <span className="flex items-center gap-2">
          {total > 1 ? (
            <>
              <button
                type="button"
                data-testid="so-batch-issue-prev"
                className="h-7 rounded-control border border-kit-slate-6 px-2 text-meta disabled:opacity-40"
                disabled={idx === 0}
                onClick={() => setAt((i) => Math.max(0, i - 1))}
              >
                Previous
              </button>
              <button
                type="button"
                data-testid="so-batch-issue-next"
                className="h-7 rounded-control border border-kit-slate-6 px-2 text-meta disabled:opacity-40"
                disabled={idx >= total - 1}
                onClick={() => setAt((i) => Math.min(total - 1, i + 1))}
              >
                Next
              </button>
            </>
          ) : null}
        </span>
      </div>

      <div
        className="grid min-h-0 flex-1 grid-cols-2 overflow-hidden"
        data-testid="so-batch-issue-split"
      >
        {/* ── 50% · the only editable side ──────────────────────────────── */}
        <div
          className="flex min-h-0 flex-col overflow-y-auto border-r border-kit-slate-5 bg-white p-4"
          data-testid="so-batch-issue-work"
        >
          {mode === "review" && current ? (
            <>
              <h2
                className="text-body font-semibold uppercase tracking-wide"
                data-testid="so-batch-issue-title"
              >
                {current.supplierName ?? "Supplier"} → {destinationName(current.destinationId)}
              </h2>
              <table className="mt-3 w-full text-body">
                <thead>
                  <tr className="border-b border-kit-slate-5 text-label uppercase text-kit-slate-11">
                    <th className="py-1 text-left">Item</th>
                    <th className="py-1 text-left">Source</th>
                    <th className="py-1 text-right">Qty</th>
                    <th className="py-1 text-left">Goods must arrive</th>
                  </tr>
                </thead>
                <tbody>
                  {current.lines.map((l) => (
                    <tr key={l.demandId} className="border-b border-kit-slate-4">
                      <td className="py-1">
                        <span className="flex flex-col leading-tight">
                          <span>{l.item}</span>
                          <span className="text-meta text-kit-slate-11">
                            {[l.variant, l.skus.join(" · ")].filter(Boolean).join(" · ")}
                          </span>
                        </span>
                      </td>
                      <td className="py-1 font-mono text-meta">
                        {l.so == null ? "" : `SO-${l.so}`}
                      </td>
                      <td className="py-1 text-right tabular-nums">{l.qty}</td>
                      <td className="py-1 text-meta">
                        {l.goodsMustArrive ? fmtDate(l.goodsMustArrive) : ""}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {error ? (
                <p className="mt-3 text-meta text-kit-red-11" data-testid="so-batch-issue-error">
                  {error}
                </p>
              ) : null}
              <div className="mt-auto flex items-center justify-between gap-3 pt-4">
                <button
                  type="button"
                  data-testid="so-batch-issue-back"
                  className="h-8 rounded-control border border-kit-slate-6 px-3 text-meta font-medium"
                  onClick={onBack}
                >
                  {W.backToBuying}
                </button>
                <button
                  type="button"
                  data-testid="so-batch-issue-create"
                  className="h-8 rounded-control bg-kit-blue-9 px-3 text-meta font-medium text-white disabled:bg-kit-slate-6"
                  disabled={creating || documents.length === 0}
                  onClick={() => void issue()}
                >
                  {W.issuePo}
                </button>
              </div>
            </>
          ) : currentPo ? (
            <PoIssueEvidence
              po={currentPo}
              confirmed={confirmed.has(currentPo.id)}
              onConfirmed={() => onConfirmed(currentPo.id)}
            />
          ) : null}
        </div>

        {/* ── 50% · the document itself ─────────────────────────────────── */}
        <div
          className="flex min-h-0 flex-col overflow-y-auto bg-kit-canvas p-4"
          data-testid="so-batch-issue-preview"
        >
          {mode === "review" ? (
            /* NOT SENDABLE, AND IT SAYS SO. A preview that looked official
               would be a purchase order with no number — the one thing a
               supplier cannot act on. */
            <div className="flex h-full flex-col items-center justify-center gap-2 rounded-control border border-dashed border-kit-slate-6 bg-white p-6 text-center">
              <p className="text-body font-medium">{W.previewNotSendable}</p>
              <p className="text-meta text-kit-slate-11">
                {current?.supplierName ?? ""} · {destinationName(current?.destinationId ?? "")} ·{" "}
                {current?.qty ?? 0} {current?.qty === 1 ? "unit" : "units"}
              </p>
            </div>
          ) : currentPo ? (
            <iframe
              title={`${currentPo.id} PDF`}
              data-testid={`so-batch-pdf-${currentPo.id}`}
              className="h-full w-full rounded-control border border-kit-slate-6 bg-white"
              src={`/api/operation/pos/${encodeURIComponent(currentPo.id)}/print-data`}
            />
          ) : null}
        </div>
      </div>
    </div>
  );
}

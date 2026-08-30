// design-standard: not-a-list-page — this is the 50/50 ISSUE surface
// (CARD-2026-08-22-purchasing-02 §5), not a Register. Its table is the lines of
// ONE purchase order being checked before it is sent, sitting beside that
// document's own preview; a ListPageShell would wrap a second page chrome
// around a surface whose whole point is document + work, side by side.
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  purchasingRefusal,
  SO_BATCH_PURCHASE_WORDS as W,
  type PurchasingDestination,
  type SoBatchDocument,
} from "@carres/shared";
import { apiFetch } from "@/lib/api";
import { fmtDate } from "@/lib/fmt-date";
import { renderPoPdf } from "@/lib/pdf/render";
import type { PoTemplateData } from "@/lib/pdf/types";
import PoIssueEvidence, {
  doorsForIssuedPo,
  type IssuedPo,
  type PoSendEvidence,
} from "../components/PoIssueEvidence";

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

/**
 * THE COMMERCIAL DECISION AN OPERATOR MAKES PER SKU.
 *
 * `cost` is a STRING because it is what somebody typed. Parsing it early would
 * turn a half-typed `4` into a price of four ringgit; it becomes a number only
 * at the boundary, and only after it is valid.
 */
export default function SoBatchIssueWorkspace({
  documents,
  destinations,
  onBack,
  onDone,
}: SoBatchIssueWorkspaceProps) {
  const [at, setAt] = useState(0);
  const [mode, setMode] = useState<Mode>("review");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<{ wrong: string; todo: string } | null>(null);
  const [pos, setPos] = useState<IssuedPo[]>([]);
  /** Which documents THIS visit has confirmed — the journey's own progress, not
   *  the evidence. The evidence is read from the server (closure §8). */
  const [, setConfirmed] = useState<Set<string>>(new Set());


  /**
   * THE OFFICIAL PDF, RENDERED.
   *
   * Not the `/print-data` JSON in an iframe — that would show a payload and
   * call it a purchase order. The endpoint returns the money-free document
   * payload (`purchasing_po_document`, 0307) and `renderPoPdf` is the SAME
   * template Purchase Orders and the print path already use, so the operator
   * checks the exact bytes the supplier will receive: real number, real
   * version, real Unit IDs.
   *
   * The blob URL is revoked when it is replaced or the surface closes — an
   * un-revoked object URL holds the whole PDF in memory for the tab's life.
   */
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [pdfError, setPdfError] = useState<string | null>(null);
  /* ⭐ THE VERSION THAT WAS ACTUALLY RENDERED, off the official document data
     (0378). The confirmation declares this number, so what Carres records is by
     construction what the operator looked at. Reading it from anywhere else —
     a list row, a second fetch — would reintroduce the race. */
  const [pdfVersion, setPdfVersion] = useState<number | null>(null);

  const destinationName = useCallback(
    (id: string) => destinations.find((d) => d.id === id)?.name ?? "",
    [destinations],
  );

  const current = documents[Math.min(at, Math.max(documents.length - 1, 0))];

  /**
   * WHAT IS STOPPING THE WHOLE BATCH, named.
   *
   * It is computed across EVERY document, not the one on screen: the request is
   * atomic, so a missing price on document 3 stops document 1 too, and an
   * operator staring at a dead button on page 1 needs to be told that. The
   * first blocker wins — a list of five would be read as five problems when
   * fixing them is one pass.
   */
  const blocker = useMemo<{ wrong: string; todo: string } | null>(() => {
    for (const doc of documents) {
      if (doc.supplierKind === "factory_pickup" && !doc.supplierCollection) {
        return purchasingRefusal("pickup_partner_required", {
          supplier: doc.supplierName ?? null,
        });
      }
      if (
        doc.supplierCollection?.fixedDestinationId &&
        doc.supplierCollection.fixedDestinationId !== doc.destinationId
      ) {
        return purchasingRefusal("supplier_collection_destination_mismatch", {
          supplier: doc.supplierName ?? null,
        });
      }
    }
    return null;
  }, [documents]);

  /**
   * ONE REQUEST FOR EVERY DOCUMENT (§7.3), carrying selections only. The
   * selections are rebuilt from the
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
          body: JSON.stringify({ selections }),
        },
      );
      setPos(res.pos ?? []);
      setMode("evidence");
      setAt(0);
    } catch (e) {
      /* The request is atomic, so a failure created NOTHING. The operator stays
         exactly where they were, with the selection intact, and can fix the
         line the server named — in the approved two lines (closure §9), never
         as a code or a raw database sentence. */
      const body = (e as { body?: { message?: string; action?: string; code?: string; sku?: string } })
        .body;
      const fallback = purchasingRefusal(body?.code, { sku: body?.sku ?? null });
      setError({
        wrong: body?.message ?? fallback.wrong,
        todo: body?.action ?? fallback.todo,
      });
    } finally {
      setCreating(false);
    }
  }

  /**
   * ⭐ THE PERSISTED EVIDENCE, READ BACK (closure §8).
   *
   * This surface used to hand the evidence panel a row it had MADE UP after a
   * successful confirmation — right version, invented channel, no recipient, no
   * actor, no time from the server. It read as evidence and was a memory. A
   * reload showed nothing at all.
   *
   * `po_sends` is now read for the document on screen and re-read after each
   * confirmation, so what the operator sees is what a second operator, a
   * reload and the audit trail see.
   */
  const [evidence, setEvidence] = useState<Record<string, PoSendEvidence[]>>({});
  const loadEvidence = useCallback(async (poId: string) => {
    try {
      const res = await apiFetch<{ sends: PoSendEvidence[] }>(
        `/api/operation/pos/${encodeURIComponent(poId)}/sends`,
      );
      setEvidence((prev) => ({ ...prev, [poId]: res.sends ?? [] }));
    } catch {
      /* Unreadable history is not history that says something else. The panel
         shows none, the act stays open, and SQL refuses a second confirmation
         of the same version anyway. */
    }
  }, []);

  const onConfirmed = useCallback(
    (poId: string) => {
      void loadEvidence(poId);
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
    [pos, onDone, loadEvidence],
  );

  const total = mode === "evidence" ? pos.length : documents.length;
  const idx = Math.min(at, Math.max(total - 1, 0));
  const currentPo = mode === "evidence" ? pos[idx] : undefined;

  const currentPoId = currentPo?.id ?? null;
  /* The document on screen brings its own history with it. */
  useEffect(() => {
    if (!currentPoId) return;
    void loadEvidence(currentPoId);
  }, [currentPoId, loadEvidence]);
  useEffect(() => {
    if (!currentPoId) return;
    let dead = false;
    let url: string | null = null;
    setPdfError(null);
    void (async () => {
      try {
        const data = await apiFetch<PoTemplateData>(
          `/api/operation/pos/${encodeURIComponent(currentPoId)}/print-data`,
        );
        const blob = await renderPoPdf(data);
        if (dead) return;
        setPdfVersion(data.version ?? 1);
        url = URL.createObjectURL(blob);
        setPdfUrl(url);
      } catch (e) {
        if (!dead) setPdfError(e instanceof Error ? e.message : "Could not render the PDF");
      }
    })();
    return () => {
      dead = true;
      if (url) URL.revokeObjectURL(url);
      setPdfUrl(null);
      setPdfVersion(null);
    };
  }, [currentPoId]);

  return (
    <div
      className="flex h-full min-h-0 w-full flex-1 flex-col bg-kit-canvas"
      data-testid="so-batch-issue-workspace"
    >
      {/* The 50px destination header keeps its height at every width. Walked at
          375px on 2026-08-24: the title WRAPPED and its second line was cut off
          by the fixed row. A long name now truncates — the row is the law, and a
          clipped word is worse than a shortened one. */}
      <div className="flex h-[50px] shrink-0 items-center justify-between gap-3 border-b border-kit-slate-5 bg-white px-4">
        <span className="flex min-w-0 items-baseline gap-3">
          <span className="truncate text-page font-semibold">{W.reviewTitle}</span>
          <span
            className="shrink-0 whitespace-nowrap text-meta text-kit-slate-11"
            data-testid="so-batch-issue-count"
          >
            {idx + 1} of {total}
          </span>
        </span>
        <span className="flex shrink-0 items-center gap-2">
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

      {/* ⭐ 50 / 50 AT 1130px AND WIDER; STACKED BELOW IT (closure §10).
          The split was unconditional, so on a narrower window each half got
          under 565px and the PDF page became unreadable while the decision
          controls clipped. Below the breakpoint the work comes FIRST and the
          document follows it, because the operator's next act is on the left
          and a page they cannot read is not worth the top half.

          Stacked it is a flex COLUMN, not a one-column grid: walked at 1129px,
          a grid compressed the work row and clipped every control in it. A flex
          column with `shrink-0` panes is as tall as its content and scrolls. */}
      <div
        className="flex min-h-0 flex-1 flex-col overflow-y-auto min-[1130px]:grid min-[1130px]:grid-cols-2 min-[1130px]:overflow-hidden"
        data-testid="so-batch-issue-split"
      >
        {/* ── 50% · the only editable side ──────────────────────────────── */}
        <div
          /* ⭐ `shrink-0` UNTIL THE BREAKPOINT, and that is not cosmetic.
             Walked at 1129px on 2026-08-24: a two-row GRID compressed this pane
             to 208px and CLIPPED it — the PO facts, blocker and both buttons
             were cut off with no scrollbar, because the row
             reported that it fitted. Stacked, the surface is a flex COLUMN and
             this pane is as tall as its content; the split scrolls. Side by side
             it is a grid item and `min-h-0` again, so the pane scrolls inside a
             fixed split. */
          className="flex shrink-0 flex-col border-b border-kit-slate-5 bg-white p-4 min-[1130px]:min-h-0 min-[1130px]:shrink min-[1130px]:overflow-y-auto min-[1130px]:border-b-0 min-[1130px]:border-r"
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
                    <th className="w-24 py-1 text-left">Source</th>
                    <th className="w-14 py-1 pr-3 text-right">Qty</th>
                    <th className="w-40 py-1 text-left">Goods must arrive</th>
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
                      <td className="py-1 pr-3 text-right tabular-nums">{l.qty}</td>
                      <td className="py-1 text-meta">
                        {l.goodsMustArrive ? fmtDate(l.goodsMustArrive) : ""}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {current.supplierKind === "factory_pickup" && current.supplierCollection ? (
                <p className="mt-4 border-t border-kit-slate-5 pt-3 text-meta text-kit-slate-12">
                  {current.supplierCollection.procurementPartnerName} collects from{" "}
                  {current.supplierName ?? "the supplier"} and delivers to{" "}
                  {destinationName(current.destinationId)}.
                </p>
              ) : null}

              {/* ⭐ FAIL CLOSED, AND SAY WHAT TO DO (closure §9). LINE 1 is the
                  fact, LINE 2 the act — never `Needs attention`, never a code,
                  and never a Postgres sentence. */}
              {blocker ? (
                <span
                  className="mt-3 flex flex-col"
                  data-testid="so-batch-issue-blocker"
                >
                  <span className="text-meta text-kit-slate-12">{blocker.wrong}</span>
                  <span className="text-meta text-kit-slate-11">{blocker.todo}</span>
                </span>
              ) : null}
              {error ? (
                <span className="mt-3 flex flex-col" data-testid="so-batch-issue-error">
                  <span className="text-meta text-kit-red-11">{error.wrong}</span>
                  <span className="text-meta text-kit-slate-11">{error.todo}</span>
                </span>
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
                  disabled={creating || documents.length === 0 || blocker !== null}
                  onClick={() => void issue()}
                >
                  {W.issuePo}
                </button>
              </div>
            </>
          ) : currentPo ? (
            /* The form appears only once the official document has rendered:
               until then there is no version to declare, and a confirmation
               without one is the defect 0378 closes. */
            pdfVersion != null ? (
              <PoIssueEvidence
                po={currentPo}
                version={pdfVersion}
                /* PERSISTED rows, never this tab's memory (closure §8). */
                evidence={evidence[currentPo.id] ?? []}
                /* The supplier's real group and address, from the issue
                   response — the ONE communication area asks for them. */
                doors={doorsForIssuedPo(currentPo)}
                onOpened={() => {
                  /* An OPEN is history. SO Batch Purchase does not write it:
                     `purchasing_record_send` belongs to the Purchase Order
                     object, and a second writer of the same row is a second
                     truth about the same document. */
                }}
                onConfirmed={() => onConfirmed(currentPo.id)}
              />
            ) : (
              <p className="text-meta text-kit-slate-11" data-testid="so-batch-evidence-waiting">
                {pdfError ?? `Opening ${currentPo.id}…`}
              </p>
            )
          ) : null}
        </div>

        {/* ── 50% · the document itself ─────────────────────────────────── */}
        <div
          /* Stacked, the document keeps a readable height rather than
             collapsing to the height of an iframe nobody can read. */
          className="flex min-h-[70vh] shrink-0 flex-col bg-kit-canvas p-4 min-[1130px]:min-h-0 min-[1130px]:shrink min-[1130px]:overflow-y-auto"
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
            pdfUrl ? (
              <iframe
                title={`${currentPo.id} purchase order`}
                data-testid={`so-batch-pdf-${currentPo.id}`}
                className="h-full w-full rounded-control border border-kit-slate-6 bg-white"
                src={pdfUrl}
              />
            ) : (
              <div
                className="flex h-full items-center justify-center rounded-control border border-kit-slate-6 bg-white text-meta text-kit-slate-11"
                data-testid={`so-batch-pdf-placeholder-${currentPo.id}`}
              >
                {pdfError ?? `Rendering ${currentPo.id}…`}
              </div>
            )
          ) : null}
        </div>
      </div>
    </div>
  );
}

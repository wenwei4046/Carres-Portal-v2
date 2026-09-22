// design-standard: not-a-list-page — this is the 50/50 ISSUE surface for
// Manual Purchase (`docs/purchasing/MASTER.md` §9.2, owner 2026-09-22), the
// same journey SO Batch Purchase already runs, not a Register.
import layoutStyles from "./so-batch/SoBatchRegister.module.css";
import { useEffect, useMemo, useState } from "react";
import {
  MANUAL_PURCHASE_WORDS as MW,
  SO_BATCH_PURCHASE_WORDS as SW,
  manualPurchaseIssueDocuments,
  manualPurchaseIssueSentence,
  purchasingRefusal,
} from "@carres/shared";
import Button from "@/components/kit/Button";
import { fmtDate } from "@/lib/fmt-date";
import { renderPoPdf } from "@/lib/pdf/render";
import type { PoTemplateData } from "@/lib/pdf/types";

/**
 * REVIEW PURCHASE ORDERS — MANUAL PURCHASE'S OWN ISSUE JOURNEY
 * (owner ruling 2026-09-22; `docs/purchasing/MASTER.md` §9.2).
 *
 * ── THE DEFECT THIS CLOSES ────────────────────────────────────────────────
 *
 * `Issue PO` on the Manual Purchase register called the issue door DIRECTLY.
 * An operator pressed one button and purchase orders existed — numbered, with
 * Unit IDs born under them — without ever seeing the documents, how many there
 * would be, or which supplier got which goods. SO Batch Purchase has had the
 * 50/50 review since Card 02; this is the same surface, fed by MPR facts.
 *
 * ── WHAT IT SHOWS, AND WHAT IT REFUSES TO INVENT ──────────────────────────
 *
 * One draft per ACTUAL purchase order, grouped by the five facts the issue
 * door itself partitions on — `Supplier × Category × Deliver To × Purpose ×
 * MPR Delivery Date` — through `manualPurchaseIssueDocuments`, the same
 * arithmetic behind the toolbar's `Issue {n} PO(s)` (Law D: one derived fact,
 * one spelling). The server recomputes the partition from its own read, which
 * is agreement rather than trust.
 *
 * ⛔ THE DRAFT CREATES NOTHING. No PO number, no version, no issue date, no
 * Unit IDs — those are born inside the issue transaction (0442 · 0443). The
 * preview says so in the same words SO Batch uses.
 *
 * ⛔ AND THE PO's DELIVERY DATE IS NOT DRAWN HERE. The paper's date is
 * computed on the server from Settings working days at issue time (owner
 * correction 2026-09-22); a browser that guessed it would print a promise the
 * database never made, so the draft leaves it empty.
 *
 * ── ISSUE IS NOT SEND ─────────────────────────────────────────────────────
 *
 * Issuing creates the documents. The supplier still has nothing: the sending
 * evidence lives on the Purchase Orders object, and nothing on this screen
 * records that a supplier received anything.
 */
export interface ManualPurchaseIssueLineView {
  demandId: string;
  supplierId: string | null;
  supplierName: string | null;
  category: string | null;
  destinationId: string;
  destinationName: string;
  purpose: string;
  purposeLabel: string;
  deliveryDate: string | null;
  sku: string;
  item: string;
  remainingQty: number;
}

export interface ManualPurchaseIssueWorkspaceProps {
  lines: readonly ManualPurchaseIssueLineView[];
  /** The operator's own selection, exactly as the register built it. */
  requestCount: number;
  /** Back to the register with nothing created. */
  onBack: () => void;
  /** Issue the whole selection — ONE request, all or nothing. The register
   *  refetches and shows each request's real `PO No`; this surface invents no
   *  number of its own. */
  onIssue: () => Promise<void>;
}

export default function ManualPurchaseIssueWorkspace({
  lines,
  requestCount,
  onBack,
  onIssue,
}: ManualPurchaseIssueWorkspaceProps) {
  const [at, setAt] = useState(0);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<{ wrong: string; todo: string } | null>(null);

  const documents = useMemo(() => manualPurchaseIssueDocuments(lines), [lines]);
  /* ⭐ THE THREE NUMBERS, WORKED OUT FOR THE OPERATOR (owner 2026-09-22): how
     many requests, how many units and how many purchase orders this will
     create. The same shared sentence the Register's selection bar prints, from
     the same partition — the operator never counts anything themselves. */
  const units = lines.reduce((n, l) => n + (l.remainingQty > 0 ? l.remainingQty : 0), 0);
  const total = documents.length;
  const idx = Math.min(at, Math.max(total - 1, 0));
  const current = documents[idx];

  /* ── THE DRAFT PAPER ─────────────────────────────────────────────────────
     The SAME template the supplier's real purchase order is rendered from, so
     what the operator checks is the document's own layout rather than a
     summary of it. Everything the document does not know yet stays empty. */
  const draftData = useMemo<PoTemplateData | null>(() => {
    if (!current) return null;
    const first = current.lines[0]!;
    return {
      draft: true,
      po_number: "DRAFT",
      po_id: "",
      version: 0,
      issue_date: "",
      supplier: { name: first.supplierName ?? "", address: null, contact: null },
      destination: { name: first.destinationName, address: "" },
      delivery_instructions: null,
      /* Computed on the server at issue, from Settings working days. */
      eta_date: null,
      terms: null,
      /* A Manual Purchase serves no customer order: the paper's SO NO column
         is empty by fact, never filled with the MPR's own identity. */
      so_refs: [],
      lines: current.lines.map((l) => ({
        sku: l.sku,
        description: l.item,
        qty: l.remainingQty,
        unit: "unit",
        sources: [],
      })),
    };
  }, [current]);

  const [draftPdf, setDraftPdf] = useState<{
    data: PoTemplateData;
    url?: string;
    error?: string;
  } | null>(null);
  const [draftAttempt, setDraftAttempt] = useState(0);
  useEffect(() => {
    if (!draftData) return;
    let dead = false;
    let url: string | undefined;
    setDraftPdf(null);
    void renderPoPdf(draftData)
      .then((blob) => {
        if (dead) return;
        url = URL.createObjectURL(blob);
        setDraftPdf({ data: draftData, url });
      })
      .catch(() => {
        if (!dead) setDraftPdf({ data: draftData, error: "Could not load the preview." });
      });
    return () => {
      dead = true;
      if (url) URL.revokeObjectURL(url);
    };
    /* `draftAttempt` re-runs the render after a failure. */
  }, [draftData, draftAttempt]);

  async function issue() {
    if (creating) return;
    setCreating(true);
    setError(null);
    try {
      await onIssue();
    } catch (e) {
      /* The door is atomic, so a refusal created NOTHING and the operator
         stays exactly where they were, on the document they were reading. */
      const body = (
        e as {
          body?: {
            message?: string;
            action?: string;
            code?: string;
            sku?: string | null;
            supplier?: string | null;
            destination?: string | null;
          };
        }
      ).body;
      const fallback = purchasingRefusal(body?.code, {
        sku: body?.sku ?? null,
        supplier: body?.supplier ?? null,
        destination: body?.destination ?? null,
      });
      setError({
        wrong: body?.message ?? fallback.wrong,
        todo: body?.action ?? fallback.todo,
      });
    } finally {
      setCreating(false);
    }
  }

  return (
    <div
      className={`${layoutStyles.issue} absolute inset-0 flex flex-col bg-kit-slate-3`}
      data-testid="mp-issue-review"
    >
      <div className="flex h-[50px] shrink-0 items-center justify-between gap-3 border-b border-kit-slate-5 bg-white px-4">
        <span className="flex min-w-0 items-baseline gap-3">
          <span className="truncate text-page font-semibold">{SW.reviewTitle}</span>
          <span
            className="shrink-0 whitespace-nowrap text-meta text-kit-slate-11"
            data-testid="mp-issue-count"
          >
            {idx + 1} of {total}
          </span>
        </span>
        <span className="flex shrink-0 items-center gap-2">
          {total > 1 ? (
            <>
              <button
                type="button"
                data-testid="mp-issue-prev"
                className="h-7 rounded-control border border-kit-slate-6 px-2 text-meta disabled:opacity-40"
                disabled={idx === 0}
                onClick={() => setAt((i) => Math.max(0, i - 1))}
              >
                Previous
              </button>
              <button
                type="button"
                data-testid="mp-issue-next"
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

      <div className={`${layoutStyles.issueBody} min-h-0 flex-1`} data-testid="mp-issue-split">
        <div
          className={`${layoutStyles.issueWork} flex shrink-0 flex-col border-b border-kit-slate-5 bg-white p-4`}
          data-testid="mp-issue-work"
        >
          {current ? (
            <>
              <h2
                className="text-body font-semibold uppercase tracking-wide"
                data-testid="mp-issue-title"
              >
                {current.lines[0]!.supplierName ?? ""} → {current.lines[0]!.destinationName}
              </h2>
              {/* The two facts that SPLIT this document from the next one and
                  are not otherwise visible on the paper. */}
              <p className="mt-1 text-meta text-kit-slate-11" data-testid="mp-issue-selection">
                {manualPurchaseIssueSentence(requestCount, units, documents.length)}
              </p>
              <p className="mt-1 text-meta text-kit-slate-11" data-testid="mp-issue-facts">
                {[
                  current.lines[0]!.purposeLabel,
                  current.lines[0]!.deliveryDate
                    ? `${MW.deliveryDate}: ${fmtDate(current.lines[0]!.deliveryDate)}`
                    : null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
              <table className="mt-3 w-full text-body">
                <thead>
                  <tr className="border-b border-kit-slate-5 text-label uppercase text-kit-slate-11">
                    <th className="py-1 text-left">{MW.colItem}</th>
                    <th className="w-14 py-1 pr-3 text-right">{MW.colQty}</th>
                  </tr>
                </thead>
                <tbody>
                  {current.lines.map((l) => (
                    <tr key={l.demandId} className="border-b border-kit-slate-4">
                      <td className="py-1">
                        <span className="flex flex-col leading-tight">
                          <span>{l.item}</span>
                          <span className="font-mono text-meta text-kit-slate-11">{l.sku}</span>
                        </span>
                      </td>
                      <td className="py-1 pr-3 text-right tabular-nums">{l.remainingQty}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {error ? (
                <span className="mt-3 flex flex-col" data-testid="mp-issue-error">
                  <span className="text-meta text-kit-red-11">{error.wrong}</span>
                  <span className="text-meta text-kit-slate-11">{error.todo}</span>
                </span>
              ) : null}

              <div className="mt-auto flex items-center justify-between gap-3 pt-4">
                <Button variant="neutral" size="md" data-testid="mp-issue-back" onClick={onBack}>
                  {MW.cancel}
                </Button>
                <Button
                  variant="primary"
                  size="md"
                  data-testid="mp-issue-create"
                  loading={creating}
                  disabled={total === 0}
                  onClick={() => void issue()}
                >
                  {MW.workIssuePo}
                </Button>
              </div>
            </>
          ) : null}
        </div>

        <div
          className={`${layoutStyles.issuePreview} flex min-h-[70vh] shrink-0 flex-col bg-kit-canvas p-4`}
          data-testid="mp-issue-preview"
        >
          <>
              <p className="mb-2 shrink-0 text-meta text-kit-slate-11">
                {SW.previewNotSendable}
              </p>
              {draftPdf?.data === draftData && draftPdf?.url ? (
                <iframe
                  title="Draft purchase order preview"
                  data-testid="mp-issue-draft-pdf"
                  className="min-h-0 w-full flex-1 rounded-control border border-kit-slate-6 bg-white"
                  src={draftPdf.url}
                />
              ) : (
                <div
                  className="flex flex-1 flex-col items-center justify-center gap-2 bg-white text-meta text-kit-slate-11"
                  role="status"
                >
                  {draftPdf?.data === draftData && draftPdf?.error ? (
                    <>
                      <p>{draftPdf.error}</p>
                      <button
                        type="button"
                        className="h-7 rounded-control border border-kit-slate-6 px-2 text-meta"
                        onClick={() => setDraftAttempt((n) => n + 1)}
                      >
                        Try again
                      </button>
                    </>
                  ) : (
                    "Rendering preview…"
                  )}
                </div>
              )}
          </>
        </div>
      </div>

    </div>
  );
}

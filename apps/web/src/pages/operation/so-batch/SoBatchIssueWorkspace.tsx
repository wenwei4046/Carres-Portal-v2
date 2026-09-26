import layoutStyles from "./SoBatchRegister.module.css";
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
import Button from "@/components/kit/Button";
import { Block, Fact } from "../SalesOrderWorkspace";
import PdfPreview from "@/components/kit/PdfPreview";
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
 * Purchase Orders under `Confirm PO sent to supplier`, and SO Batch does not offer the
 * same remainder again because the open PO now covers it (§5.2).
 */
export interface SoBatchIssueWorkspaceProps {
  documents: readonly SoBatchDocument[];
  destinations: readonly Pick<PurchasingDestination, "id" | "name">[];
  onBack: () => void;
  /** Every document confirmed — the Register refetches and the journey ends. */
  onDone: () => void;
  /**
   * ⭐ THE LANE'S OWN ISSUE DOOR (owner instruction 2026-09-23). This surface
   * is shared by the two buying lanes, and they do NOT share an authority: SO
   * Batch posts its selections to `to-order/issue-batch`, Manual Purchase
   * posts its request and demand ids to its own door, which enforces the MPR
   * approval. Absent, the SO Batch call it has always made.
   *
   * It resolves with the same `pos` the SO door returns, so the evidence step
   * that follows is the same one for both lanes.
   */
  onIssue?: () => Promise<{ pos: IssuedPo[] }>;
  /** The way back to the list this journey started from. Absent: SO Batch's. */
  backLabel?: string;
}

type Mode = "review" | "evidence";

export default function SoBatchIssueWorkspace({
  documents,
  destinations,
  onBack,
  onDone,
  onIssue,
  backLabel,
}: SoBatchIssueWorkspaceProps) {
  const [at, setAt] = useState(0);
  const [mode, setMode] = useState<Mode>("review");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<{ wrong: string; todo: string } | null>(null);
  const [pos, setPos] = useState<IssuedPo[]>([]);
  const [coveringPo, setCoveringPo] = useState<string | null>(null);
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
  const totalGoodsQty = documents.reduce((sum, document) => sum + document.lines.reduce(
    (qty, line) => qty + line.parts.reduce((n, part) => n + part.qty, 0), 0), 0);
  const draftData = useMemo<PoTemplateData | null>(() => {
    if (!current) return null;
    const destination = destinations.find((d) => d.id === current.destinationId);
    return {
      draft: true,
      po_number: "DRAFT",
      po_id: "",
      version: 0,
      issue_date: current.poDate ?? "",
      /* ⭐ THE PREVIEW IS THE DOCUMENT (owner instruction 2026-09-23). The
         two addresses and the delivery date used to ride as empty strings, so
         the operator checked a paper that was missing the three facts the
         supplier reads first. They come from the document, which carries what
         the SERVER resolved — a browser neither invents an address nor
         computes a governed date. A lane that does not carry them yet draws
         exactly what it drew before. */
      supplier: {
        name: current.supplierName ?? "",
        address: current.supplierAddress ?? null,
        contact: null,
      },
      destination: {
        name: current.destinationName ?? destination?.name ?? "",
        address: current.destinationAddress ?? "",
      },
      delivery_instructions: null,
      /* The selected goods deadline is NOT the issued PO's promise: the PO's
         own date is `PO Date + n Settings working days`, and the document
         carries the server's answer or nothing at all. */
      eta_date: current.poDeliveryDate ?? null,
      delivery_working_days: current.poDeliveryWorkingDays ?? null,
      delivery_method: current.deliveryMethod ?? (current.supplierKind === "factory_pickup" ? "we_collect" : current.supplierKind === "own_logistics" ? "supplier_delivers" : null),
      terms: null,
      so_refs: [...new Set(current.lines.flatMap((line) => line.so == null ? [] : [line.so]))],
      lines: current.lines.flatMap((line) => line.parts.map((part) => ({
        sku: part.sku,
        description: [line.item, line.variant].filter(Boolean).join(" · "),
        qty: part.qty,
        unit: "unit",
        sources: [{ so: line.so, qty: part.qty }],
      }))),
    };
  }, [current, destinations]);
  const [draftPdf, setDraftPdf] = useState<{ data: PoTemplateData; url?: string; error?: string } | null>(null);
  const [draftAttempt, setDraftAttempt] = useState(0);
  const [paintedUrl, setPaintedUrl] = useState<string | null>(null);
  const draftUrl = draftPdf?.data === draftData ? draftPdf.url : undefined;
  const previewReady = Boolean(draftUrl && paintedUrl === draftUrl);
  useEffect(() => {
    if (mode !== "review" || !draftData) return;
    let dead = false;
    let url: string | undefined;
    setDraftPdf(null);
    void renderPoPdf(draftData).then((blob) => {
      if (dead) return;
      url = URL.createObjectURL(blob);
      setDraftPdf({ data: draftData, url });
    }).catch(() => {
      if (!dead) setDraftPdf({ data: draftData, error: "Could not load the preview." });
    });
    return () => { dead = true; if (url) URL.revokeObjectURL(url); };
  }, [draftData, mode, draftAttempt]);

  /**
   * WHAT IS STOPPING THE WHOLE BATCH, named.
   *
   * It is computed across EVERY document, not the one on screen: the request is
   * atomic, so a missing collection rule on document 3 stops document 1 too, and an
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
      /* ⭐ FACTORY PICKUP ONLY — the same gate the server applies.
         `supplierCollection` is carried for ANY supplier that has a collector
         in Purchasing Settings (`purchase-demands.ts`, which stops only at a
         missing partner), not just the ones Carres collects from. Without the
         kind gate this line refused an `own_logistics` supplier that happened
         to have a fixed destination configured — a greyed-out Issue PO with no
         way past it, for a document the server (`to-order.ts`, which gates on
         `needsPartner`) would have accepted. A blocker the server does not
         share is not a rule; it is a dead button. */
      if (
        doc.supplierKind === "factory_pickup" &&
        doc.supplierCollection?.fixedDestinationId &&
        doc.supplierCollection.fixedDestinationId !== doc.destinationId
      ) {
        return purchasingRefusal("supplier_collection_destination_mismatch", {
          supplier: doc.supplierName ?? null,
          destination: destinationName(doc.supplierCollection.fixedDestinationId),
        });
      }
    }
    return null;
  }, [documents, destinationName]);

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
    if (creating || (!coveringPo && (!previewReady || blocker || !documents.length))) return;
    setCreating(true);
    setError(null);
    try {
      if (coveringPo) {
        await openCoveringPo(coveringPo);
        return;
      }
      const res = onIssue
        ? await onIssue()
        : await apiFetch<{ pos: IssuedPo[] }>(
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
      const body = (e as {
        body?: {
          message?: string;
          action?: string;
          code?: string;
          po?: string;
          sku?: string;
          supplier?: string;
          destination?: string;
        };
      }).body;
      if (body?.code === "already_on_po" && body.po) {
        setCoveringPo(body.po);
        await openCoveringPo(body.po);
        return;
      }
      /* Every fact the server sent, not just the SKU. `refuse()` echoes its
         facts alongside `message`, so a refusal that names a supplier or a
         destination keeps them here — and the fallback stops degrading to
         `the supplier` on the day a server sends a code without a message. */
      const fallback = purchasingRefusal(body?.code, {
        sku: body?.sku ?? null,
        supplier: body?.supplier ?? null,
        destination: body?.destination ?? null,
        po: body?.po ?? null,
      });
      setError({
        wrong: body?.message ?? fallback.wrong,
        todo: body?.action ?? fallback.todo,
      });
    } finally {
      setCreating(false);
    }
  }

  async function openCoveringPo(poId: string) {
    try {
      const po = await apiFetch<IssuedPo>(
        `/api/operation/pos/${encodeURIComponent(poId)}/issue-context`,
      );
      setPos([po]);
      setConfirmed(new Set());
      setAt(0);
      setError(null);
      setMode("evidence");
    } catch {
      setError({ wrong: `Could not open ${poId}.`, todo: "Try again." });
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
  const [officialAttempt, setOfficialAttempt] = useState(0);
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
  }, [currentPoId, officialAttempt]);

  return (
    <div
      className={`${layoutStyles.issue} flex h-full min-h-0 w-full flex-1 flex-col bg-kit-canvas`}
      data-testid="so-batch-issue-workspace"
    >
      <div className="flex min-h-[50px] shrink-0 flex-wrap items-center justify-between gap-3 border-b border-kit-slate-5 bg-white px-4 py-2">
        <span className="flex min-w-0 flex-wrap items-baseline gap-3">
          <span className="text-page font-semibold">{W.reviewTitle}</span>
          <span
            className="shrink-0 whitespace-nowrap text-meta text-kit-slate-11"
            data-testid="so-batch-issue-count"
          >
            {total ? idx + 1 : 0} of {total} · {totalGoodsQty} {totalGoodsQty === 1 ? "unit" : "units"}
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

      {/* Approved desktop composition; only narrow canvases stack. */}
      <div
        className={`${layoutStyles.issueBody} min-h-0 flex-1`}
        data-testid="so-batch-issue-split"
      >
        {/* ── 50% · the only editable side ──────────────────────────────── */}
        <div
          className={`${layoutStyles.issueWork} flex shrink-0 flex-col border-b border-kit-slate-5 bg-kit-slate-3 p-4`}
          data-testid="so-batch-issue-work"
        >
          {mode === "review" && current ? (
            <>
              <h2
                className="text-body font-semibold"
                data-testid="so-batch-issue-title"
              >
                {current.supplierName ?? "Supplier"} → {destinationName(current.destinationId)}
              </h2>
              {/* The Sales Order card grammar (owner, 2026-09-26: "follow
                  sales order ui kit"): one `Purchase order` card of facts —
                  label over value, two to a row inside this half-width pane —
                  then the goods. Nothing here is edited on this surface
                  (addresses live in Suppliers / Purchasing Settings), so
                  every fact prints PLAIN; a grey box means "changed with
                  Edit" and nothing else. */}
              <div className="mt-3">
              <Block title="Purchase order">
                <div className="grid grid-cols-1 gap-3 min-[560px]:grid-cols-2" data-testid="so-batch-issue-facts">
                  <Fact idPrefix="po-review-fact" own={false} label="Supplier" value={
                    <span className="flex flex-col">
                      <span>{current.supplierName ?? "Not recorded"}</span>
                      <span className="whitespace-pre-wrap break-words text-meta text-kit-slate-11">{current.supplierAddress || <a className="text-kit-blue-11 underline" href="/operation?tab=suppliers">Address not recorded. Check Suppliers.</a>}</span>
                    </span>
                  } />
                  <Fact idPrefix="po-review-fact" own={false} label="Supplier Deliver To" value={
                    <span className="flex flex-col">
                      <span>{current.destinationName || destinationName(current.destinationId) || "Not recorded"}</span>
                      <span className="whitespace-pre-wrap break-words text-meta text-kit-slate-11">{current.destinationAddress || <a className="text-kit-blue-11 underline" href="/operation/settings/purchasing">Address not recorded. Check Purchasing Settings.</a>}</span>
                    </span>
                  } />
                  <Fact idPrefix="po-review-fact" own={false} label="Delivery Method" value={
                    draftData?.delivery_method === "we_collect" ? "We collect" : draftData?.delivery_method === "supplier_delivers" ? "Supplier delivers" : <a className="text-kit-blue-11 underline" href="/operation?tab=suppliers">Not recorded. Check Suppliers.</a>
                  } />
                  <Fact idPrefix="po-review-fact" own={false} label="PO Doc Date" hint="Provisional. The date is recorded when issued." value={
                    current.poDate ? fmtDate(current.poDate) : "Not available. Go back and reload."
                  } />
                  <Fact idPrefix="po-review-fact" own={false} testId="po-review-fact-po-delivery-date" label={current.poDeliveryWorkingDays != null ? `PO ${current.poDeliveryWorkingDays}-Day Delivery Date` : "PO Delivery Date"} value={
                    current.poDeliveryDate ? fmtDate(current.poDeliveryDate) : <a className="text-kit-blue-11 underline" href="/operation/settings/purchasing">Not available. Check production days in Purchasing Settings.</a>
                  } />
                </div>
              </Block>
              </div>
              <div className="mt-3">
              <Block title="Goods lines">
              <div className="overflow-x-auto">
              <table className="w-full text-body">
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
                          {/* What the goods must satisfy, in the requester's
                              own words (0562) — read-only, and only when one
                              was recorded. */}
                          {l.purchaseRequirement ? (
                            <span
                              className="text-meta text-kit-slate-11"
                              data-testid={`so-batch-issue-requirement-${l.demandId}`}
                            >
                              {l.purchaseRequirement}
                            </span>
                          ) : null}
                        </span>
                      </td>
                      {/* SO Batch's lines carry a Sales Order; a Manual
                          Purchase line carries its `MPR No`. One column, one
                          meaning: where this line came from. */}
                      <td className="py-1 font-mono text-meta">
                        {l.sourceLabel ?? (l.so == null ? "" : `SO-${l.so}`)}
                      </td>
                      <td className="py-1 pr-3 text-right tabular-nums">{l.qty}</td>
                      <td className="py-1 text-meta">
                        {l.goodsMustArrive ? fmtDate(l.goodsMustArrive) : ""}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
              </Block>
              </div>

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
              <div className="mt-auto flex flex-wrap items-center justify-between gap-3 pt-4">
                <Button variant="neutral" size="md" data-testid="so-batch-issue-back" onClick={onBack}>
                  {backLabel ?? W.backToBuying}
                </Button>
                <Button
                  variant="primary"
                  size="md"
                  data-testid="so-batch-issue-create"
                  loading={creating}
                  disabled={!coveringPo && (documents.length === 0 || blocker !== null || !previewReady)}
                  onClick={() => void issue()}
                >
                  Issue {documents.length} {documents.length === 1 ? "PO" : "POs"}
                </Button>
              </div>
            </>
          ) : currentPo ? (
            <>
              {/* The form appears only once the official document has rendered:
                 until then there is no version to declare, and a confirmation
                 without one is the defect 0378 closes. */}
              {pdfVersion != null && pdfUrl != null && paintedUrl === pdfUrl ? (
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
                  {pdfError ? "Could not load the preview. Try again on the document." : `Opening ${currentPo.id}…`}
                </p>
              )}
              {/* LEAVING IS SAFE (file header): a numbered PO is never deleted
                  by walking away, so the same door out of THIS journey stays
                  open after Issue PO — same label, same destination
                  (`SO Batch Purchase`'s own buying list), never `Purchase
                  Orders`, which is a different module's register. */}
              <div className="mt-4 flex items-center border-t border-kit-slate-5 pt-3">
                <Button variant="neutral" size="md" data-testid="so-batch-issue-back" onClick={onBack}>
                  {backLabel ?? W.backToBuying}
                </Button>
              </div>
            </>
          ) : null}
        </div>

        {/* ── 50% · the document itself ─────────────────────────────────── */}
        <div
          /* Stacked, the document keeps a readable height rather than
             collapsing while the pages are loading. */
          className={`${layoutStyles.issuePreview} flex min-h-[70vh] shrink-0 flex-col bg-kit-canvas p-4`}
          data-testid="so-batch-issue-preview"
        >
          {mode === "review" ? (
            /* NOT SENDABLE, AND IT SAYS SO. A preview that looked official
               would be a purchase order with no number — the one thing a
               supplier cannot act on. */
            <>
              <p className="mb-2 shrink-0 text-meta text-kit-slate-11">{W.previewNotSendable}</p>
              {draftPdf?.data === draftData && draftPdf?.url ? (
                <PdfPreview key={draftPdf.url} title="Draft purchase order preview" data-testid="so-batch-draft-pdf"
                  src={draftPdf.url} onReady={(ready) => setPaintedUrl(ready ? draftPdf.url! : null)} />
              ) : (
                <div className="flex flex-1 flex-col items-center justify-center gap-2 bg-white text-meta text-kit-slate-11" role="status">
                  {draftPdf?.data === draftData && draftPdf?.error ? (
                    <><p>{draftPdf.error}</p><Button size="sm" onClick={() => setDraftAttempt((n) => n + 1)}>Try again</Button></>
                  ) : "Rendering preview…"}
                </div>
              )}
            </>
          ) : currentPo ? (
            pdfUrl ? (
              <PdfPreview key={pdfUrl} title={`${currentPo.id} purchase order`}
                data-testid={`so-batch-pdf-${currentPo.id}`} src={pdfUrl}
                onReady={(ready) => setPaintedUrl(ready ? pdfUrl : null)} />
            ) : (
              <div
                className="flex h-full items-center justify-center rounded-control border border-kit-slate-6 bg-white text-meta text-kit-slate-11"
                data-testid={`so-batch-pdf-placeholder-${currentPo.id}`}
              >
                {pdfError ? <div role="status" className="flex flex-col items-center gap-2">
                  <p>Could not load the preview.</p>
                  <Button size="sm" onClick={() => setOfficialAttempt((n) => n + 1)}>Try again</Button>
                </div> : `Rendering ${currentPo.id}…`}
              </div>
            )
          ) : null}
        </div>
      </div>
    </div>
  );
}

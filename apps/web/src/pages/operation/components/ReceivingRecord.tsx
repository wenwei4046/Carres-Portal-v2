import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Download, Printer } from "lucide-react";
import {
  grnExceptionFacts,
  grnLineName,
  receivingDisplayNo,
  receivingExtraQty,
  receivingSummaryOf,
  supplierClaimStatusLabel,
  RECEIVING_AUTHORITY_LABEL,
  RECEIVING_UNIT_OUTCOME_LABEL,
  GRN_EXCEPTION_WORD,
  UNIT_AVAILABILITY_LABEL,
  UNIT_LIFECYCLE_OUTCOME_LABEL,
  unitAvailability,
  unitLifecycleOutcome,
  warehouseReceiptStatusLabel,
  warehouseReceiptTotals,
  type GrnExceptionFact,
  type GrnExceptionType,
  type GrnMediaKind,
  type ReceivingArrivalEvidence,
  type ReceivingExtraLine,
  type WarehouseReceiptLine,
} from "@carres/shared";
import { apiFetch } from "@/lib/api";
import { fmtDate } from "@/lib/fmt-date";
import {
  useOperationWarehouse,
  useReceivingAmendMutation,
  useReceivingDuty,
  useReceivingSessionDetail,
  useReceivingVoidMutation,
  useWarehouseReceiptReviewMutation,
  type ReceivingSessionDetail,
} from "@/lib/queries";
import { renderGrnPdf } from "@/lib/pdf/render";
import { usePdfCanvases } from "@/lib/pdf/use-pdf-canvases";
import DropdownMenu from "@/components/kit/DropdownMenu";
import DOFileUploadField from "@/components/DOFileUploadField";
import ArrivalEvidenceUploadField from "@/components/ArrivalEvidenceUploadField";
import EvidenceUploadField, { type EvidenceEntry } from "@/components/EvidenceUploadField";
import { DOC_BTN, DocSection as Section, Prop } from "./workspace-doc";
import GoodsMiniTable, { type GoodsMiniLine } from "./GoodsMiniTable";
import {
  ExceptionEvidenceDoors,
  ExceptionEvidenceViewer,
  type EvidenceScope,
} from "./ExceptionEvidence";
import { grnTemplateDataOf, type GrnAmendDraft } from "./grn-template-data";

/**
 * ReceivingRecord — one Receiving Session / formal GRN object
 * (owner instruction 2026-09-13 §7; owner correction 2026-09-06 §5/§6).
 *
 *   submitted / →  the count review, full width: [Return count to
 *   returned       {warehouse}] · [Save Receiving]. Before Carres saves
 *                  there is NO GRN, no stock movement — and no document.
 *
 *   posted /    →  THE GRN OBJECT, 50/50 at the governed desktop breakpoint:
 *   voided         left = the Receiving Record; right = the OFFICIAL GRN
 *                  PREVIEW through the real renderer, with [Print] and
 *                  [Download PDF]. Below lg the panes stack, record first.
 *
 * THE RECORD SEPARATES SIX QUESTIONS, in this order, so a reader never takes
 * one answer for another:
 *   This receipt            what THIS delivery counted — its own lines, its own
 *                           totals, its own evidence doors.
 *   Current PO balance      the source's cumulative position AS OF NOW, across
 *                           every receipt — labelled current, never "at the
 *                           time of this receipt".
 *   Related receipts        the other GRNs on the same source.
 *   Exception follow-up     the exact Claim(s) this receipt opened, by number
 *                           and state — Outstanding 0 does not close a claim.
 *   Inventory Result        what the register holds for the named Units NOW,
 *                           read from the register; never inferred.
 *   Evidence and audit history    the papers, the files, the append-only events.
 *
 * `Void Receiving` lives in `More ▾` — it is not a normal primary action.
 * One Object Header carries the GRN number, supplier/source and status;
 * nothing repeats it.
 */

export const RECORD_WORDS = {
  thisReceipt: "This receipt",
  currentBalance: "Current PO balance",
  currentBalanceNote:
    "As of now, across every receipt on this source — not the balance at the time of this receipt.",
  relatedReceipts: "Related receipts",
  noRelated: "No other receiving on this source.",
  followUp: "Exception follow-up",
  noClaims: "No Claim is linked to this receiving.",
  noExceptions: "No exceptions recorded on this receipt.",
  claimNote: "A closed source balance does not close a Claim — the Claim's own state rules.",
  inventory: "Inventory Result",
  inventoryNotRecorded:
    "Unit outcomes were not recorded on this receiving — it was posted before Unit tracking.",
  inventoryCounted: (n: number, site: string) =>
    `${n} received ${n === 1 ? "piece" : "pieces"} posted as counted stock at ${site}.`,
  inventoryReversed: "This receiving is cancelled — its stock consequences were reversed.",
  inventoryUnknown: "Current register state not available",
  evidence: "Evidence and audit history",
  exceptionEvidence: "Exception evidence",
  exceptionEvidenceNotVerified:
    "Exception evidence records could not be verified — the evidence store did not answer.",
  catalogName: "name from the current catalog",
  itemsNotResolved: "no catalog name",
  ordered: "Ordered",
  receivedCumulative: "Received (all receipts)",
  outstanding: "Outstanding",
  grnDate: "GRN Date",
  addEvidence: "Add exception evidence",
} as const;

export default function ReceivingRecord({
  sessionId,
  onBack,
  onOpenReceipt,
}: {
  sessionId: string;
  onBack: () => void;
  /** Opens another GRN of the same source (the page owns the URL). */
  onOpenReceipt?: (id: string) => void;
}) {
  const q = useReceivingSessionDetail(sessionId);
  const dutyQ = useReceivingDuty();
  const [amending, setAmending] = useState(false);
  const [voiding, setVoiding] = useState(false);
  const [draft, setDraft] = useState<AmendFormDraft | null>(null);
  const [viewer, setViewer] = useState<EvidenceScope | null>(null);

  const detail = q.data ?? null;
  const r = detail?.receipt ?? null;
  const isGrn = r?.status === "posted" || r?.status === "voided";

  // ── the live document — ONE arithmetic feeds preview, Print and Download ──
  const todayIso = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const previewDraft: GrnAmendDraft | null = useMemo(() => {
    if (!amending || !draft || !r) return null;
    return {
      reason: draft.reason,
      ...(draft.goodsReceivedAt !== (r.goods_received_at ?? "") ? { goodsReceivedAt: draft.goodsReceivedAt } : {}),
      ...(draft.doNumber.trim() !== r.do_number ? { doNumber: draft.doNumber.trim() } : {}),
      ...(draft.arrivedAtName ? { goodsArrivedAt: draft.arrivedAtName } : {}),
      lines: draft.lineEdits,
      byName: dutyQ.data?.acting_user_name ?? dutyQ.data?.normal_user_name ?? null,
      todayIso,
    };
  }, [amending, draft, r, dutyQ.data, todayIso]);
  const debouncedDraft = useDebounced(previewDraft, 300);
  const templateData = useMemo(
    () => (detail && isGrn ? grnTemplateDataOf(detail, debouncedDraft) : null),
    [detail, isGrn, debouncedDraft],
  );
  const previewKey = templateData ? `${sessionId}:${debouncedDraft ? JSON.stringify(debouncedDraft) : "saved"}` : null;
  const { pdfError, setPane, retry } = usePdfCanvases(previewKey, () => renderGrnPdf(templateData!));

  if (q.isLoading) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center bg-white" data-testid="receiving-record-loading">
        <p className="text-meta text-base-500">Opening the receiving record…</p>
      </div>
    );
  }
  if (q.isError || !detail || !r) {
    return (
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 bg-white" data-testid="receiving-record-error">
        <p className="text-body text-base-700">This receiving record could not be opened</p>
        <button
          type="button"
          className="rounded-control border border-base-200 bg-white px-3 py-1.5 text-meta font-medium text-base-700 hover:bg-hovertint"
          onClick={() => void q.refetch()}
        >
          Try again
        </button>
        <button type="button" onClick={onBack} className="text-body text-kit-blue-11 hover:underline">
          ‹ Receiving
        </button>
      </div>
    );
  }

  const events = detail.events;
  const po = detail.po;
  const lines = (r.lines ?? []) as WarehouseReceiptLine[];
  const extras = (r.extra_lines ?? []) as ReceivingExtraLine[];
  const totals = warehouseReceiptTotals(lines);
  const extraQty = receivingExtraQty(extras);
  const cumulative = po ? receivingSummaryOf(po.purchase_order_lines) : null;
  const dutyAllowed = dutyQ.data?.allowed ?? false;
  const displayNo = receivingDisplayNo(r);
  const facts = grnExceptionFacts(lines, extras);
  const hasIssue = totals.issue > 0;
  const lineInfo = detail.line_info ?? {};
  const sourceWord = po?.is_consignment ? "CO" : "PO";

  /**
   * ONE name ladder for every surface of this record (`grnLineName`), and the
   * name is the WHOLE identity.
   *
   * ⭐ OWNER CORRECTION 2026-09-14. The goods used to carry the PO line's
   * configuration words joined to the resolved name — `Quinn · King · BF-03` in
   * the evidence doors and viewer, and `BF-03 · name from the current catalog`
   * on the line beneath the name. The reviewer read that code as a second
   * identity for goods the name had already named, in two places at once.
   * Receiving now prints the resolved NAME and, beneath it, only the
   * PROVENANCE caveat — one fact per line, each said once. The configuration
   * still belongs to the PURCHASE ORDER and still prints on the PO paper,
   * which is the document that ordered that exact fabric.
   */
  const nameOfLine = (l: { id: string; sku: string; item_label?: string | null }) => {
    const named = grnLineName({ sku: l.sku, item_label: l.item_label, catalogLabel: lineInfo[l.sku]?.label ?? null });
    return {
      ...named,
      words: named.name,
      note:
        named.source === "catalog" ? RECORD_WORDS.catalogName : named.source === "sku" ? RECORD_WORDS.itemsNotResolved : null,
    };
  };
  const nameOfKey = (key: string, sku: string) => {
    const line = lines.find((l) => l.id === key);
    if (line) return nameOfLine(line).words;
    return nameOfLine({ id: key, sku }).words;
  };
  /** Verified counts by (type, line, kind) from the evidence rows; undefined
   *  while the rows are not verified. */
  const evidenceCounts = detail.line_evidence
    ? Object.values(
        detail.line_evidence.reduce<Record<string, { exception_type: GrnExceptionType; line_key: string; media_kind: GrnMediaKind; count: number }>>(
          (acc, e) => {
            const k = `${e.exception_type}|${e.line_key}|${e.media_kind}`;
            acc[k] = acc[k]
              ? { ...acc[k], count: acc[k].count + 1 }
              : { exception_type: e.exception_type, line_key: e.line_key, media_kind: e.media_kind, count: 1 };
            return acc;
          },
          {},
        ),
      )
    : undefined;
  const doorsFor = (facts: GrnExceptionFact[], type: GrnExceptionType, testId: string) => (
    <ExceptionEvidenceDoors
      receiptId={r.id}
      grnNo={displayNo}
      type={type}
      facts={facts}
      nameOf={nameOfKey}
      counts={evidenceCounts}
      onOpen={setViewer}
      testId={testId}
    />
  );
  const miniLines: GoodsMiniLine[] = [
    ...lines.map((l): GoodsMiniLine => {
      const named = nameOfLine(l);
      return {
        key: l.id,
        testId: `record-line-${l.id}`,
        category: "",
        unitIds: [],
        unitAbsence: "",
        deliverTo: [],
        deliverToAbsence: "",
        sku: l.sku,
        qty: l.received_now,
        item: named.name,
        itemDetail: named.note ?? undefined,
        received: Math.max(0, l.received_now),
        damaged: Math.max(0, l.damaged_qty),
        wrongItem: Math.max(0, l.wrong_item_qty),
        extra: 0,
        damagedNode: doorsFor(facts.filter((f) => f.lineKey === l.id), "damaged", `record-evidence-${l.id}`),
        wrongItemNode: doorsFor(facts.filter((f) => f.lineKey === l.id), "wrong_item", `record-evidence-${l.id}`),
        selectable: false,
      };
    }),
    ...extras.map((x, i): GoodsMiniLine => {
      const key = (x.id ?? "").trim();
      const named = nameOfLine({ id: key, sku: x.sku });
      return {
        key: key || `extra-${i}`,
        testId: `record-extra-${key || i}`,
        category: "",
        unitIds: [],
        unitAbsence: "",
        deliverTo: [],
        deliverToAbsence: "",
        sku: x.sku,
        qty: x.qty,
        item: named.name,
        itemDetail: named.note ?? undefined,
        damaged: 0,
        wrongItem: 0,
        extra: Math.max(0, x.qty),
        extraNode: key ? doorsFor(facts.filter((f) => f.lineKey === key), "extra", `record-evidence-${key}`) : undefined,
        selectable: false,
      };
    }),
  ];

  const openDocument = async (mode: "print" | "download") => {
    // Print/Download render from the SAVED record — never the amend draft.
    const blob = await renderGrnPdf(grnTemplateDataOf(detail));
    const url = URL.createObjectURL(blob);
    if (mode === "print") {
      window.open(url, "_blank");
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } else {
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `${displayNo}.pdf`;
      anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    }
  };

  const startAmend = () => {
    if (!r.po_id) return;
    setDraft({
      reason: "",
      goodsReceivedAt: r.goods_received_at ?? "",
      doNumber: r.do_number,
      actualSiteId: r.actual_site_id ?? r.warehouse_id,
      arrivedAtName: null,
      doFilePath: null,
      evidenceAdd: [],
      lineEvidenceAdd: [],
      lineEdits: Object.fromEntries(lines.map((l) => [l.id, l.received_now])),
    });
    setAmending(true);
  };
  const stopAmend = () => {
    setAmending(false);
    setDraft(null);
  };

  const unitResults = r.unit_results ?? [];
  const siteWord = r.actual_site_name ?? r.warehouse_name ?? "the warehouse";

  /* ── the LEFT half — the Receiving Record, or the correction form ──────── */
  const record = (
    <div className="mx-auto w-full max-w-4xl px-4 py-3">
      {/* ── ONE Object Header — back, the identity, the state ── */}
      <button type="button" onClick={onBack} data-testid="receiving-record-back" className="text-body text-kit-blue-11 hover:underline">
        ‹ Receiving
      </button>
      <div className="mt-1 flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <h2 className="text-page font-semibold font-mono text-kit-slate-12">{isGrn ? displayNo : "Receiving"}</h2>
          <div className="text-meta text-base-500">
            {r.supplier_name ?? ""} · <span className="font-mono">{r.po_id}</span>
            {po?.is_consignment ? <span data-testid="record-source-co"> · CO</span> : null}
          </div>
        </div>
        <span
          data-testid="receiving-record-state"
          className={[
            "shrink-0 rounded-full px-2.5 py-0.5 text-label font-medium",
            r.status === "posted"
              ? "bg-kit-green-3 text-kit-green-11"
              : r.status === "voided"
                ? "bg-kit-slate-3 text-kit-slate-11"
                : "bg-kit-amber-3 text-kit-amber-11",
          ].join(" ")}
        >
          {warehouseReceiptStatusLabel(r.status)}
        </span>
      </div>

      {r.status === "voided" && (
        <div className="mt-2 rounded-card border border-kit-slate-5 bg-kit-slate-3 px-3 py-2 text-body text-kit-slate-12" data-testid="void-banner">
          Cancelled {r.void_at ? fmtDate(r.void_at.slice(0, 10)) : ""}
          {r.void_by_name ? ` by ${r.void_by_name}` : ""} — {r.void_reason ?? ""}. The record and its evidence are preserved; its stock
          consequences were reversed.
        </div>
      )}

      {amending && draft && r.po_id ? (
        <AmendPanel
          receipt={{ ...r, po_id: r.po_id }}
          lines={lines}
          extras={extras}
          facts={facts}
          nameOfKey={nameOfKey}
          draft={draft}
          onDraft={setDraft}
          onClose={stopAmend}
        />
      ) : (
        <>
          {/* ── 1 · THIS RECEIPT ────────────────────────────────────────── */}
          <Section title={RECORD_WORDS.thisReceipt}>
            <Prop label={`Linked ${sourceWord}`}>
              <span className="font-mono">{r.po_id}</span>
            </Prop>
            <Prop label="Supplier">{r.supplier_name ?? ""}</Prop>
            <Prop label="Deliver To">{r.warehouse_name ?? ""}</Prop>
            <Prop label="Goods arrived at">{r.actual_site_name ?? r.warehouse_name ?? ""}</Prop>
            <Prop label="Goods received on">
              <span className="tabular-nums">{r.goods_received_at ? fmtDate(r.goods_received_at) : ""}</span>
            </Prop>
            {isGrn && r.grn_date ? (
              <Prop label={RECORD_WORDS.grnDate}>
                <span className="tabular-nums" data-testid="record-grn-date">
                  {fmtDate(r.grn_date)}
                </span>
              </Prop>
            ) : null}
            {r.submitted_from === "warehouse" && r.submitted_at ? (
              <Prop label="Count submitted">
                <span className="tabular-nums">
                  {fmtDate(r.submitted_at.slice(0, 10))}
                  {r.submitted_by_name ? ` · ${r.submitted_by_name}` : ""}
                </span>
              </Prop>
            ) : null}
            <Prop label="Supplier DO No.">
              <span className="font-mono">{r.do_number}</span>
              {r.do_file_url ? (
                <a href={r.do_file_url} target="_blank" rel="noreferrer" className="ml-2 text-body text-kit-blue-11 hover:underline">
                  View
                </a>
              ) : null}
            </Prop>
            {isGrn ? (
              <Prop label="Saved under">
                <span className="text-body text-kit-slate-12" data-testid="duty-trio">
                  {r.posted_duty_holder_name ? `${r.posted_duty_holder_name} · GRN Duty` : "No GRN duty holder recorded"}
                  {r.posted_duty_cover_name ? ` · cover ${r.posted_duty_cover_name}` : ""}
                  {r.posted_authority && r.posted_authority !== "grn_duty"
                    ? ` · saved by ${r.posted_by_name ?? "Staff identity not recorded"} (${RECEIVING_AUTHORITY_LABEL[r.posted_authority]})`
                    : ""}
                </span>
              </Prop>
            ) : null}
            <div className="mt-2" data-testid="record-lines">
              <GoodsMiniTable label={`Goods on ${displayNo}`} lines={miniLines} receivingLayout />
            </div>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-body" data-testid="record-totals">
              <span>
                Received Qty <span className="tabular-nums font-medium">{totals.received}</span>
              </span>
              <span className={totals.damaged > 0 ? "text-kit-red-11" : "text-kit-slate-9"}>
                Damaged Qty <span className="tabular-nums font-medium">{totals.damaged}</span>
              </span>
              <span className={totals.wrongItem > 0 ? "text-kit-red-11" : "text-kit-slate-9"}>
                Wrong Item Qty <span className="tabular-nums font-medium">{totals.wrongItem}</span>
              </span>
              <span className={extraQty > 0 ? "text-kit-amber-11" : "text-kit-slate-9"}>
                Extra Qty <span className="tabular-nums font-medium">{extraQty}</span>
              </span>
            </div>
          </Section>

          {/* ── 2 · CURRENT PO BALANCE — as of now, never "at that time" ── */}
          {cumulative && (
            <Section title={RECORD_WORDS.currentBalance}>
              <p className="text-label text-kit-slate-9">{RECORD_WORDS.currentBalanceNote}</p>
              <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-body" data-testid="record-balance">
                <span>
                  {RECORD_WORDS.ordered} <span className="tabular-nums font-medium">{cumulative.orderQty}</span>
                </span>
                <span>
                  {RECORD_WORDS.receivedCumulative} <span className="tabular-nums font-medium">{cumulative.receivedQty}</span>
                </span>
                <span>
                  {RECORD_WORDS.outstanding} <span className="tabular-nums font-medium">{cumulative.pendingDeliveryQty}</span>
                </span>
                {cumulative.damagedQty > 0 || cumulative.wrongItemQty > 0 ? (
                  <span className="text-kit-slate-11">
                    Damaged Qty <span className="tabular-nums">{cumulative.damagedQty}</span> · Wrong Item Qty{" "}
                    <span className="tabular-nums">{cumulative.wrongItemQty}</span> (all receipts)
                  </span>
                ) : null}
              </div>
            </Section>
          )}

          {/* ── 3 · RELATED RECEIPTS ────────────────────────────────────── */}
          {isGrn && (
            <Section title={RECORD_WORDS.relatedReceipts}>
              {(detail.related_receipts ?? []).length === 0 ? (
                <div className="text-label text-kit-slate-9" data-testid="related-empty">
                  {RECORD_WORDS.noRelated}
                </div>
              ) : (
                <ul className="flex flex-col divide-y divide-kit-slate-4" data-testid="related-receipts">
                  {(detail.related_receipts ?? []).map((x) => (
                    <li key={x.id} className="flex flex-wrap items-center gap-x-3 gap-y-0.5 py-1 text-body">
                      {onOpenReceipt ? (
                        <button
                          type="button"
                          onClick={() => onOpenReceipt(x.id)}
                          className="font-mono text-meta text-kit-blue-11 hover:underline"
                          data-testid={`related-open-${x.id}`}
                        >
                          {x.grn_no}
                        </button>
                      ) : (
                        <span className="font-mono text-meta">{x.grn_no}</span>
                      )}
                      <span className="tabular-nums text-kit-slate-11">{x.grn_date ? fmtDate(x.grn_date) : x.goods_received_at ? fmtDate(x.goods_received_at) : ""}</span>
                      <span className="font-mono text-meta text-kit-slate-11">{x.do_number}</span>
                      <span className="tabular-nums">Received {x.received_qty}</span>
                      {x.damaged_qty > 0 ? <span className="tabular-nums text-kit-red-11">Damaged {x.damaged_qty}</span> : null}
                      {x.wrong_item_qty > 0 ? <span className="tabular-nums text-kit-red-11">Wrong Item {x.wrong_item_qty}</span> : null}
                      {x.extra_qty > 0 ? <span className="tabular-nums text-kit-amber-11">Extra {x.extra_qty}</span> : null}
                      <span className={x.status === "voided" ? "text-kit-slate-9 line-through" : "text-kit-slate-11"}>
                        {warehouseReceiptStatusLabel(x.status)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Section>
          )}

          {/* ── 4 · EXCEPTION FOLLOW-UP — the exact Claim, by number ─────── */}
          {isGrn && (
            <Section title={RECORD_WORDS.followUp}>
              {facts.length === 0 ? (
                <div className="text-label text-kit-slate-9" data-testid="followup-none">
                  {RECORD_WORDS.noExceptions}
                </div>
              ) : (detail.claims ?? []).length === 0 ? (
                <div className="text-label text-kit-slate-9" data-testid="followup-no-claim">
                  {RECORD_WORDS.noClaims}
                </div>
              ) : (
                <>
                  <ul className="flex flex-col gap-1" data-testid="followup-claims">
                    {(detail.claims ?? []).map((cl) => (
                      <li key={cl.id} className="flex flex-wrap items-center gap-x-3 text-body">
                        <Link
                          to={`/operation?tab=claims&claim=${encodeURIComponent(cl.id)}`}
                          className="font-mono text-meta text-kit-blue-11 hover:underline"
                          data-testid={`claim-link-${cl.id}`}
                        >
                          {cl.claim_no ?? "Not issued"}
                        </Link>
                        <span>{cl.claim_type === "damaged" ? GRN_EXCEPTION_WORD.damaged : GRN_EXCEPTION_WORD.wrong_item}</span>
                        <span>{nameOfKey(cl.po_line_id ?? "", cl.sku)}</span>
                        <span className="tabular-nums">× {cl.qty}</span>
                        <span className={cl.status === "closed" ? "text-kit-slate-11" : "text-kit-amber-11"}>
                          {supplierClaimStatusLabel(cl.status)}
                        </span>
                      </li>
                    ))}
                  </ul>
                  <p className="mt-1 text-label text-kit-slate-9">{RECORD_WORDS.claimNote}</p>
                </>
              )}
            </Section>
          )}

          {/* ── 5 · INVENTORY RESULT — the register's own answer ─────────── */}
          {isGrn && (
            <Section title={RECORD_WORDS.inventory}>
              {r.status === "voided" ? (
                <p className="text-body text-kit-slate-12" data-testid="inventory-reversed">
                  {RECORD_WORDS.inventoryReversed}
                </p>
              ) : unitResults.length > 0 ? (
                <ul className="flex flex-col" data-testid="inventory-units">
                  {unitResults.map((u) => {
                    const now = u.current_status ?? null;
                    const word = now
                      ? unitLifecycleOutcome(now) !== "active"
                        ? UNIT_LIFECYCLE_OUTCOME_LABEL[unitLifecycleOutcome(now)]
                        : UNIT_AVAILABILITY_LABEL[unitAvailability({ status: now })]
                      : RECORD_WORDS.inventoryUnknown;
                    return (
                      <li key={u.stock_item_id} className="flex flex-wrap items-center gap-2 py-0.5 text-body" data-testid={`unit-result-${u.unit_code}`}>
                        <span className="w-36 shrink-0 font-mono text-meta text-kit-slate-11">{u.unit_code}</span>
                        <span
                          className={
                            u.outcome === "received" ? "text-kit-green-11" : u.outcome === "received_with_issue" ? "text-kit-red-11" : "text-kit-slate-9"
                          }
                        >
                          {RECEIVING_UNIT_OUTCOME_LABEL[u.outcome]}
                          {u.issue_kind === "wrong_item" ? " · wrong item" : ""}
                          {u.issue_kind === "damaged" ? " · damaged" : ""}
                        </span>
                        <span className={now ? "text-kit-slate-11" : "text-kit-slate-9"}>
                          · now {word}
                          {u.current_site_name ? ` at ${u.current_site_name}` : ""}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              ) : totals.received > 0 ? (
                <p className="text-body text-kit-slate-12" data-testid="inventory-counted">
                  {RECORD_WORDS.inventoryCounted(totals.received, siteWord)}
                  {r.posted_at && new Date(r.posted_at) < new Date("2026-09-04") ? ` ${RECORD_WORDS.inventoryNotRecorded}` : ""}
                </p>
              ) : (
                <p className="text-body text-kit-slate-9" data-testid="inventory-none">
                  Nothing entered Inventory from this receiving.
                </p>
              )}
              {hasIssue ? (
                <p className="mt-1 text-label text-kit-slate-9">Damaged and wrong goods never became available stock.</p>
              ) : null}
            </Section>
          )}

          {r.status === "submitted" && (
            <SubmittedReview
              receiptId={r.id}
              warehouseName={r.warehouse_name ?? "the warehouse"}
              bookedWarehouseId={r.warehouse_id}
              dutyAllowed={dutyAllowed}
              opensClaims={hasIssue}
              onDone={onBack}
            />
          )}

          {/* ── The governed doors — Amend is primary; Void hides in More ▾ ── */}
          {r.po_id && r.status === "posted" && dutyAllowed && !voiding && (
            <div className="mt-4 flex items-center gap-3">
              <button
                type="button"
                onClick={startAmend}
                data-testid="amend-receiving-door"
                className="rounded-control border border-kit-slate-5 bg-white px-3 py-1.5 text-body text-kit-slate-12 hover:bg-kit-slate-3"
              >
                Amend Receiving
              </button>
              <DropdownMenu
                label="More actions"
                trigger={
                  <button
                    type="button"
                    data-testid="grn-more-menu"
                    className="rounded-control border border-kit-slate-5 bg-white px-3 py-1.5 text-body text-kit-slate-12 hover:bg-kit-slate-3"
                  >
                    More ▾
                  </button>
                }
                items={[{ key: "void", label: "Void Receiving", onSelect: () => setVoiding(true) }]}
              />
            </div>
          )}

          {voiding && <VoidPanel receipt={r} totals={totals} onClose={() => setVoiding(false)} />}

          {/* ── 6 · EVIDENCE AND HISTORY ────────────────────────────────── */}
          <Section title={RECORD_WORDS.evidence}>
            {(r.arrival_evidence ?? []).length > 0 && (
              <Prop label="Arrival evidence">
                <span className="text-body text-kit-slate-12">{evidenceSentence(r.arrival_evidence ?? [])}</span>
                {(r.arrival_evidence_files ?? []).map((f, i) =>
                  f.url ? (
                    <a key={f.path} href={f.url} target="_blank" rel="noreferrer" className="ml-2 text-body text-kit-blue-11 hover:underline" data-testid="arrival-evidence-view">
                      {f.kind === "video" ? "Video" : "Photo"} {i + 1}
                    </a>
                  ) : null,
                )}
              </Prop>
            )}
            {facts.length > 0 ? (
              <Prop label={RECORD_WORDS.exceptionEvidence}>
                {detail.line_evidence === null ? (
                  <span className="text-body text-kit-amber-11" data-testid="record-evidence-not-verified">
                    {RECORD_WORDS.exceptionEvidenceNotVerified}
                  </span>
                ) : (
                  <span className="flex flex-wrap gap-2" data-testid="record-evidence-doors">
                    {(["damaged", "wrong_item", "extra"] as const).map((type) =>
                      facts.some((f) => f.type === type && f.lineKey !== "") ? (
                        <span key={type} className="inline-flex items-center gap-1 text-body">
                          <span>{GRN_EXCEPTION_WORD[type]}</span>
                          {doorsFor(facts, type, "record-summary-evidence")}
                        </span>
                      ) : null,
                    )}
                  </span>
                )}
              </Prop>
            ) : null}
            {events.length === 0 ? (
              <div className="text-label text-kit-slate-9">No receiving activity yet.</div>
            ) : (
              <ul className="mt-1 flex flex-col gap-2" data-testid="record-history">
                {events.map((e) => (
                  <li key={e.id}>
                    <div className="text-body font-semibold text-kit-slate-12">
                      {e.event === "posted"
                        ? "Receiving saved"
                        : e.event === "submitted"
                          ? "Count submitted"
                          : e.event === "resubmitted"
                            ? "Count submitted again"
                            : e.event === "returned"
                              ? "Count returned"
                              : e.event === "amended"
                                ? (e.payload as { kind?: string })?.kind === "line_evidence"
                                  ? "Exception evidence added"
                                  : "Receiving amended"
                                : e.event === "voided"
                                  ? "Receiving voided"
                                  : "Activity"}
                    </div>
                    <div className="text-meta text-kit-slate-11">
                      {e.actor_name ?? "Staff identity not recorded"} · {fmtDate(e.event_at.slice(0, 10))}
                    </div>
                    {e.payload?.reason ? (
                      <div className="text-label font-normal text-kit-slate-11">{e.payload.reason}</div>
                    ) : e.payload?.grn_no ? (
                      <div className="text-label font-normal text-kit-slate-11">
                        {e.payload.grn_no}
                        {e.payload.units_counted != null ? ` · ${e.payload.units_counted} unit(s)` : ""}
                      </div>
                    ) : null}
                    {e.event === "amended" && e.payload?.before ? (
                      <div className="mt-1 grid max-w-md grid-cols-2 gap-2 rounded-card border border-kit-slate-5 p-2 text-label">
                        <div>
                          <div className="uppercase tracking-wide text-kit-slate-9">Original</div>
                          {Object.entries(e.payload.before).map(([k, v]) => (
                            <div key={k} className="text-kit-slate-11">
                              {comparisonValue(v)}
                            </div>
                          ))}
                        </div>
                        <div>
                          <div className="uppercase tracking-wide text-kit-slate-9">Correction</div>
                          {Object.entries((e.payload.after ?? {}) as Record<string, unknown>).map(([k, v]) => (
                            <div key={k} className="text-kit-slate-12">
                              {comparisonValue(v)}
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </Section>
        </>
      )}
    </div>
  );

  /* ── A count under review has no document yet — full width, one scroll ── */
  if (!isGrn) {
    return (
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto bg-white" data-testid="receiving-record">
        {record}
        {viewer ? <ExceptionEvidenceViewer scope={viewer} onClose={() => setViewer(null)} /> : null}
      </div>
    );
  }

  /* ── THE GRN OBJECT — 50/50 at the governed desktop breakpoint; below it
        the panes stack, Receiving Record first (owner correction §5). ───── */
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-auto bg-kit-slate-3 lg:flex-row lg:overflow-hidden" data-testid="receiving-record">
      <div className="flex min-h-0 min-w-0 flex-col bg-white lg:w-1/2 lg:overflow-auto" data-testid="grn-record-pane">
        {record}
      </div>
      <aside
        className="min-h-0 min-w-0 border-t border-kit-slate-5 bg-kit-slate-3 px-4 py-4 lg:w-1/2 lg:border-l lg:border-t-0 lg:overflow-auto"
        aria-label="Official GRN preview"
        data-testid="grn-preview-pane"
      >
        <div className="mx-auto mb-3 flex max-w-[700px] items-center justify-end gap-2">
          <button
            type="button"
            data-testid="grn-print"
            onClick={() => void openDocument("print")}
            className="inline-flex h-7 items-center gap-1.5 rounded-control border border-kit-slate-5 bg-white px-2.5 text-meta font-medium text-kit-slate-12 hover:bg-kit-slate-3"
            title="A reprint carries the same number"
          >
            <Printer size={14} /> Print
          </button>
          <button
            type="button"
            data-testid="grn-download"
            onClick={() => void openDocument("download")}
            className="inline-flex h-7 items-center gap-1.5 rounded-control border border-kit-slate-5 bg-white px-2.5 text-meta font-medium text-kit-slate-12 hover:bg-kit-slate-3"
          >
            <Download size={14} /> Download PDF
          </button>
        </div>
        <div className="relative mx-auto max-w-[700px]">
          <div ref={setPane} data-testid="grn-pdf-pane" />
          {pdfError ? (
            <div className="rounded-card border border-kit-slate-5 bg-white px-3 py-2 text-body text-kit-slate-12">
              The GRN preview could not be drawn — {pdfError}{" "}
              <button type="button" onClick={retry} className="text-kit-blue-11 hover:underline">
                Try again
              </button>
            </div>
          ) : null}
          {amending && (
            <div aria-hidden="true" data-testid="unsaved-watermark" className="pointer-events-none absolute inset-0 grid select-none place-items-center overflow-hidden">
              <span className="rotate-[-24deg] scale-[2.4] text-page tracking-[0.3em] text-base-900/10">UNSAVED</span>
            </div>
          )}
        </div>
      </aside>
      {viewer ? <ExceptionEvidenceViewer scope={viewer} onClose={() => setViewer(null)} /> : null}
    </div>
  );
}

/** 300ms debounce for the LIVE amend preview (the SO card's own number). */
function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

function evidenceSentence(entries: ReadonlyArray<{ kind: "photo" | "video" }>): string {
  const photos = entries.filter((e) => e.kind === "photo").length;
  const videos = entries.filter((e) => e.kind === "video").length;
  return [photos > 0 ? `${photos} photo${photos === 1 ? "" : "s"}` : null, videos > 0 ? `${videos} video${videos === 1 ? "" : "s"}` : null]
    .filter(Boolean)
    .join(" · ");
}

/** A bare ISO date never ships (THE YEAR RULE). */
function comparisonValue(v: unknown): string {
  if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v)) return fmtDate(v);
  if (v !== null && typeof v === "object") return JSON.stringify(v);
  return String(v);
}

/* ── The submitted count's review — the two-step flow's Carres half ──────── */

function SubmittedReview({
  receiptId,
  warehouseName,
  bookedWarehouseId,
  dutyAllowed,
  opensClaims,
  onDone,
}: {
  receiptId: string;
  warehouseName: string;
  bookedWarehouseId: string;
  dutyAllowed: boolean;
  opensClaims: boolean;
  onDone: () => void;
}) {
  const [reason, setReason] = useState("");
  const [returning, setReturning] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [actualSiteId, setActualSiteId] = useState(bookedWarehouseId);
  const warehousesQ = useOperationWarehouse();
  const warehouses = warehousesQ.data?.warehouses ?? [];
  const checkIn = useWarehouseReceiptReviewMutation("check-in", { onSuccess: onDone, onError: (e) => setErr(e.message) });
  const sendBack = useWarehouseReceiptReviewMutation("send-back", { onSuccess: onDone, onError: (e) => setErr(e.message) });

  return (
    <Section title="Check the count">
      <p className="text-body text-kit-slate-12">
        {warehouseName} returned this count to Carres. Before Carres saves, there is no GRN and no stock moves.
        {opensClaims ? " Saving will open supplier claims for the recorded issues." : ""}
      </p>
      {dutyAllowed && warehouses.length > 0 ? (
        <div className="mt-2 flex items-center gap-2 text-body leading-6">
          <span className="w-32 shrink-0 text-label text-kit-slate-9">Goods arrived at</span>
          <select
            value={actualSiteId}
            onChange={(e) => setActualSiteId(e.target.value)}
            aria-label="Goods arrived at"
            data-testid="review-actual-site"
            className="h-8 rounded-control border border-kit-slate-5 bg-white px-2 text-body text-kit-slate-12"
          >
            {warehouses.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </select>
        </div>
      ) : null}
      {!dutyAllowed ? (
        <p className="mt-1 text-label text-kit-slate-9" data-testid="review-duty-refusal">
          Only GRN duty may save a receiving.
        </p>
      ) : returning ? (
        <div className="mt-2">
          <input
            type="text"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            aria-label="What must the warehouse fix?"
            placeholder="What must the warehouse fix?"
            data-testid="return-reason"
            className="h-8 w-full max-w-md rounded-control border border-kit-slate-5 bg-white px-2 text-body"
          />
          <div className="mt-2 flex items-center gap-2">
            <button type="button" onClick={() => setReturning(false)} className="text-label text-kit-slate-9 hover:text-kit-slate-12">
              Cancel
            </button>
            <button
              type="button"
              disabled={reason.trim() === "" || sendBack.isPending}
              onClick={() => sendBack.mutate({ receiptId, reason: reason.trim() })}
              data-testid="confirm-return-count"
              className={`${DOC_BTN} disabled:opacity-40`}
            >
              Return count to {warehouseName}
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-2 flex items-center gap-3">
          <button
            type="button"
            onClick={() => setReturning(true)}
            data-testid="return-count-door"
            className="rounded-control border border-kit-slate-5 bg-white px-3 py-1.5 text-body text-kit-slate-12 hover:bg-kit-slate-3"
          >
            Return count to {warehouseName}
          </button>
          <button
            type="button"
            disabled={checkIn.isPending}
            onClick={() => checkIn.mutate({ receiptId, ...(actualSiteId !== bookedWarehouseId ? { actualSiteId } : {}) })}
            data-testid="save-receiving-review"
            className={`${DOC_BTN} disabled:opacity-40`}
          >
            {checkIn.isPending ? "Saving…" : "Save Receiving"}
          </button>
        </div>
      )}
      {err && (
        <p className="mt-1 text-label text-kit-red-11" data-testid="review-error">
          {err}
        </p>
      )}
    </Section>
  );
}

/* ── Amend Receiving — Original → Corrected, live-previewed (owner §6) ───── */

export interface AmendLineEvidenceEntry {
  lineKey: string;
  exceptionType: GrnExceptionType;
  kind: GrnMediaKind;
  path: string;
}

export interface AmendFormDraft {
  reason: string;
  goodsReceivedAt: string;
  doNumber: string;
  actualSiteId: string;
  arrivedAtName: string | null;
  doFilePath: string | null;
  evidenceAdd: ReceivingArrivalEvidence[];
  /** 0493 — exception evidence to APPEND, scoped by line + type + kind. */
  lineEvidenceAdd: AmendLineEvidenceEntry[];
  lineEdits: Record<string, number>;
}

const CLAIM_IMAGE_MIMES = ["image/jpeg", "image/png", "image/webp"] as const;
const CLAIM_VIDEO_MIMES = ["video/mp4", "video/quicktime", "video/webm"] as const;
const EVIDENCE_MAX = 10 * 1024 * 1024;

/** The exception-evidence picker for ONE exception on ONE line — the shared
 *  multi-file field behind the `claim` signing kind. */
export function ExceptionEvidencePicker({
  poId,
  doNumber,
  lineKey,
  exceptionType,
  entries,
  onChange,
  label,
  testId,
}: {
  poId: string;
  doNumber: string;
  lineKey: string;
  exceptionType: GrnExceptionType;
  entries: AmendLineEvidenceEntry[];
  onChange: (entries: AmendLineEvidenceEntry[]) => void;
  label: string;
  testId?: string;
}) {
  const sign = useCallback(
    (file: File) =>
      apiFetch<{ token: string; path: string }>("/api/storage/dos/sign-upload", {
        method: "POST",
        body: JSON.stringify({ po_id: poId, do_number: doNumber, mime_type: file.type, size_bytes: file.size, kind: "claim" }),
      }),
    [poId, doNumber],
  );
  const mine = entries.filter((e) => e.lineKey === lineKey && e.exceptionType === exceptionType);
  return (
    <div data-testid={testId}>
      <span className="text-label text-kit-slate-9">{label}</span>
      <EvidenceUploadField
        entries={mine.map((e): EvidenceEntry => ({ path: e.path, kind: e.kind }))}
        onChange={(next) =>
          onChange([
            ...entries.filter((e) => !(e.lineKey === lineKey && e.exceptionType === exceptionType)),
            ...next.map((n) => ({ lineKey, exceptionType, kind: n.kind, path: n.path })),
          ])
        }
        sign={sign}
        bucket="delivery-orders"
        imageMimes={CLAIM_IMAGE_MIMES}
        videoMimes={CLAIM_VIDEO_MIMES}
        imageMaxBytes={EVIDENCE_MAX}
        videoMaxBytes={EVIDENCE_MAX}
        maxFiles={12}
        ariaLabel={label}
        disabled={doNumber.trim().length < 3}
        testId={testId ? `${testId}-field` : undefined}
      />
    </div>
  );
}

function AmendPanel({
  receipt,
  lines,
  extras,
  facts,
  nameOfKey,
  draft,
  onDraft,
  onClose,
}: {
  receipt: {
    id: string;
    po_id: string;
    goods_received_at?: string;
    do_number: string;
    grn_no?: string | null;
    warehouse_id: string;
    actual_site_id?: string | null;
  };
  lines: WarehouseReceiptLine[];
  extras: ReceivingExtraLine[];
  facts: GrnExceptionFact[];
  nameOfKey: (key: string, sku: string) => string;
  draft: AmendFormDraft;
  onDraft: (d: AmendFormDraft) => void;
  onClose: () => void;
}) {
  const [err, setErr] = useState<string | null>(null);
  const [saveKey] = useState(() => crypto.randomUUID());
  const warehousesQ = useOperationWarehouse();
  const warehouses = warehousesQ.data?.warehouses ?? [];
  const amend = useReceivingAmendMutation(receipt.id, { onSuccess: onClose, onError: (e) => setErr(e.message) });

  const set = (patch: Partial<AmendFormDraft>) => onDraft({ ...draft, ...patch });

  const originalSiteId = receipt.actual_site_id ?? receipt.warehouse_id;
  const changedLines = lines.filter((l) => (draft.lineEdits[l.id] ?? l.received_now) !== l.received_now);
  const changedHeader =
    draft.goodsReceivedAt !== (receipt.goods_received_at ?? "") ||
    draft.doNumber.trim() !== receipt.do_number ||
    draft.actualSiteId !== originalSiteId ||
    draft.doFilePath !== null ||
    draft.evidenceAdd.length > 0 ||
    draft.lineEvidenceAdd.length > 0;
  const nothingChanged = changedLines.length === 0 && !changedHeader;

  const FIELD = "h-8 rounded-control border border-kit-slate-5 bg-white px-2 text-body text-kit-slate-12";
  /* Only a POSITIVE exception may take evidence — the doors mirror the SQL
     door's own refusal (`evidence_exception_zero`). */
  const evidenceSlots = facts.filter((f) => f.lineKey !== "");

  return (
    <Section title="Amend Receiving">
      <p className="text-label text-kit-slate-9">
        The original record is preserved; the correction and its reason join History, and the preview beside this form shows the
        corrected GRN with its amendment marked — the number never changes. The GRN number, the source PO/CO and the supplier cannot
        be amended: if those identities are wrong, use Void Receiving and start Receiving from the correct source. Damaged and wrong
        quantities are corrected through their claims, not here; their evidence may be added below.
      </p>
      <div className="mt-2 flex items-center gap-2 text-body leading-6">
        <span className="w-32 shrink-0 text-label text-kit-slate-9">Correction reason</span>
        <input
          type="text"
          value={draft.reason}
          onChange={(e) => set({ reason: e.target.value })}
          aria-label="Correction reason"
          data-testid="amend-reason"
          className={`${FIELD} flex-1`}
        />
      </div>
      <div className="mt-1 flex items-center gap-2 text-body leading-6">
        <span className="w-32 shrink-0 text-label text-kit-slate-9">Goods received on</span>
        <span className="tabular-nums text-kit-slate-9">{receipt.goods_received_at ? fmtDate(receipt.goods_received_at) : "—"}</span>
        <span className="text-kit-slate-9">→</span>
        <input
          type="date"
          value={draft.goodsReceivedAt}
          onChange={(e) => set({ goodsReceivedAt: e.target.value })}
          aria-label="Goods received on"
          data-testid="amend-received-at"
          className={FIELD}
        />
      </div>
      <div className="mt-1 flex items-center gap-2 text-body leading-6">
        <span className="w-32 shrink-0 text-label text-kit-slate-9">Goods arrived at</span>
        <select
          value={draft.actualSiteId}
          onChange={(e) => {
            const id = e.target.value;
            set({ actualSiteId: id, arrivedAtName: id === originalSiteId ? null : (warehouses.find((w) => w.id === id)?.name ?? null) });
          }}
          aria-label="Goods arrived at"
          data-testid="amend-arrived-at"
          className={FIELD}
        >
          {warehouses.map((w) => (
            <option key={w.id} value={w.id}>
              {w.name}
            </option>
          ))}
        </select>
      </div>
      <div className="mt-1 flex items-center gap-2 text-body leading-6">
        <span className="w-32 shrink-0 text-label text-kit-slate-9">Supplier DO No.</span>
        <span className="font-mono text-kit-slate-9">{receipt.do_number}</span>
        <span className="text-kit-slate-9">→</span>
        <input
          type="text"
          value={draft.doNumber}
          onChange={(e) => set({ doNumber: e.target.value })}
          aria-label="Supplier DO No."
          data-testid="amend-do-number"
          className={`${FIELD} flex-1`}
        />
      </div>
      <div className="mt-2">
        <span className="text-label text-kit-slate-9">Corrected signed DO (optional)</span>
        <DOFileUploadField poId={receipt.po_id} doNumber={draft.doNumber || receipt.do_number} onUploaded={(filePath) => set({ doFilePath: filePath })} />
        {draft.doFilePath ? (
          <p className="text-label text-kit-slate-11" data-testid="amend-do-file-ready">
            Corrected DO ready — it replaces the paper on record when the amendment is saved.
          </p>
        ) : null}
      </div>
      <div className="mt-2">
        <span className="text-label text-kit-slate-9">Additional arrival evidence (optional)</span>
        <ArrivalEvidenceUploadField
          poId={receipt.po_id}
          doNumber={draft.doNumber || receipt.do_number}
          entries={draft.evidenceAdd}
          onChange={(entries) => set({ evidenceAdd: entries })}
          testId="amend-evidence-add"
        />
      </div>
      {evidenceSlots.length > 0 ? (
        <div className="mt-2 flex flex-col gap-2" data-testid="amend-line-evidence">
          <span className="text-label text-kit-slate-9">{RECORD_WORDS.addEvidence} (optional, append-only)</span>
          {evidenceSlots.map((f) => (
            <ExceptionEvidencePicker
              key={`${f.type}-${f.lineKey}`}
              poId={receipt.po_id}
              doNumber={draft.doNumber || receipt.do_number}
              lineKey={f.lineKey}
              exceptionType={f.type}
              entries={draft.lineEvidenceAdd}
              onChange={(entries) => set({ lineEvidenceAdd: entries })}
              label={`${GRN_EXCEPTION_WORD[f.type]} · ${nameOfKey(f.lineKey, f.sku)} (${f.qty})`}
              testId={`amend-line-evidence-${f.type}-${f.lineKey}`}
            />
          ))}
        </div>
      ) : null}
      {lines.map((l) => (
        <div key={l.id} className="mt-1 flex items-center gap-2 text-body leading-6">
          <span className="w-32 shrink-0 truncate text-label text-kit-slate-9" title={nameOfKey(l.id, l.sku)}>
            {nameOfKey(l.id, l.sku)}
          </span>
          <span className="w-24 tabular-nums text-kit-slate-9">{l.received_now} received</span>
          <span className="text-kit-slate-9">→</span>
          <input
            type="number"
            min={0}
            value={draft.lineEdits[l.id] ?? l.received_now}
            onChange={(e) => set({ lineEdits: { ...draft.lineEdits, [l.id]: Math.max(0, Number(e.target.value) || 0) } })}
            aria-label={`Received now ${l.sku}`}
            data-testid={`amend-line-${l.id}`}
            className={`${FIELD} w-16 text-right tabular-nums`}
          />
        </div>
      ))}
      {extras.length > 0 ? (
        <p className="mt-1 text-label text-kit-slate-9">
          Extra goods ({extras.map((x) => `${x.sku} × ${x.qty}`).join(" · ")}) are recorded separately and are not amended here.
        </p>
      ) : null}
      {err && (
        <p className="mt-1 text-label text-kit-red-11" data-testid="amend-error">
          {err}
        </p>
      )}
      <div className="mt-2 flex items-center gap-2">
        <button type="button" onClick={onClose} data-testid="amend-cancel" className="text-label text-kit-slate-9 hover:text-kit-slate-12">
          Cancel
        </button>
        <button
          type="button"
          disabled={draft.reason.trim().length < 3 || nothingChanged || amend.isPending}
          onClick={() =>
            amend.mutate({
              reason: draft.reason.trim(),
              saveKey,
              ...(draft.goodsReceivedAt !== (receipt.goods_received_at ?? "") ? { goodsReceivedAt: draft.goodsReceivedAt } : {}),
              ...(draft.doNumber.trim() !== receipt.do_number ? { doNumber: draft.doNumber.trim() } : {}),
              ...(draft.actualSiteId !== originalSiteId ? { actualSiteId: draft.actualSiteId } : {}),
              ...(draft.doFilePath ? { doFilePath: draft.doFilePath } : {}),
              ...(draft.evidenceAdd.length > 0 ? { arrivalEvidenceAdd: draft.evidenceAdd } : {}),
              ...(draft.lineEvidenceAdd.length > 0 ? { lineEvidenceAdd: draft.lineEvidenceAdd } : {}),
              ...(changedLines.length
                ? { lines: changedLines.map((l) => ({ id: l.id, receivedNow: draft.lineEdits[l.id] ?? l.received_now })) }
                : {}),
            })
          }
          data-testid="amend-save"
          className={`${DOC_BTN} ml-auto disabled:opacity-40`}
        >
          {amend.isPending
            ? "Saving…"
            : draft.reason.trim().length < 3
              ? "Save — add a correction reason"
              : nothingChanged
                ? "Save — nothing changed yet"
                : "Save Amendment"}
        </button>
      </div>
    </Section>
  );
}

/* ── Void Receiving — only for a GRN that should never have existed ──────── */

function VoidPanel({
  receipt,
  totals,
  onClose,
}: {
  receipt: { id: string; grn_no?: string | null };
  totals: { received: number; issue: number };
  onClose: () => void;
}) {
  const [reason, setReason] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const voidM = useReceivingVoidMutation(receipt.id, { onSuccess: onClose, onError: (e) => setErr(e.message) });
  return (
    <Section title="Void Receiving">
      <p className="text-body text-kit-slate-12" data-testid="void-impact">
        Voiding reverses this receiving completely: {totals.received} received unit(s) go back to Incoming, the PO's Received Qty goes
        back down, and the stock movement is reversed. The GRN number and every piece of evidence stay on file, and the document is
        marked Cancelled. If goods already moved on, or claims were opened, the void is refused with the exact blocker.
      </p>
      <div className="mt-2 flex items-center gap-2 text-body leading-6">
        <span className="w-32 shrink-0 text-label text-kit-slate-9">Void reason</span>
        <input
          type="text"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          aria-label="Void reason"
          data-testid="void-reason"
          className="h-8 flex-1 rounded-control border border-kit-slate-5 bg-white px-2 text-body"
        />
      </div>
      {err && (
        <p className="mt-1 text-label text-kit-red-11" data-testid="void-error">
          {err}
        </p>
      )}
      <div className="mt-2 flex items-center gap-2">
        <button type="button" onClick={onClose} className="text-label text-kit-slate-9 hover:text-kit-slate-12">
          Cancel
        </button>
        <button
          type="button"
          disabled={reason.trim().length < 3 || voidM.isPending}
          onClick={() => voidM.mutate({ reason: reason.trim() })}
          data-testid="void-save"
          className={`${DOC_BTN} ml-auto disabled:opacity-40`}
        >
          {voidM.isPending ? "Voiding…" : reason.trim().length < 3 ? "Void — add a reason" : "Void Receiving"}
        </button>
      </div>
    </Section>
  );
}

export type { ReceivingSessionDetail };

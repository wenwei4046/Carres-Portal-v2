import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Download, Printer } from "lucide-react";
import {
  receivingDisplayNo,
  receivingExtraQty,
  receivingSummaryOf,
  RECEIVING_AUTHORITY_LABEL,
  RECEIVING_UNIT_OUTCOME_LABEL,
  warehouseReceiptStatusLabel,
  warehouseReceiptTotals,
  type ReceivingArrivalEvidence,
  type WarehouseReceiptLine,
} from "@carres/shared";
import { fmtDate } from "@/lib/fmt-date";
import {
  useOperationWarehouse,
  useReceivingAmendMutation,
  useReceivingDuty,
  useReceivingSessionDetail,
  useReceivingVoidMutation,
  useWarehouseReceiptReviewMutation,
} from "@/lib/queries";
import { renderGrnPdf } from "@/lib/pdf/render";
import { usePdfCanvases } from "@/lib/pdf/use-pdf-canvases";
import DropdownMenu from "@/components/kit/DropdownMenu";
import DOFileUploadField from "@/components/DOFileUploadField";
import ArrivalEvidenceUploadField from "@/components/ArrivalEvidenceUploadField";
import { DOC_BTN, DocSection as Section, Prop } from "./workspace-doc";
import { grnTemplateDataOf, type GrnAmendDraft } from "./grn-template-data";

/**
 * ReceivingRecord — one Receiving Session / formal GRN object
 * (owner correction 2026-09-06 §5/§6; the shared Sales Order formal-object
 * grammar, adapted for GRN facts).
 *
 *   submitted / →  the count review, full width: [Return count to
 *   returned       {warehouse}] · [Save Receiving]. Before Carres saves
 *                  there is NO GRN, no stock movement — and no document.
 *
 *   posted /    →  THE GRN OBJECT, 50/50 at the governed desktop breakpoint:
 *   voided         left = the Receiving Record (facts · Unit results ·
 *                  Receiving Summary · Evidence · History · [Amend
 *                  Receiving] [More ▾]); right = the OFFICIAL GRN PREVIEW —
 *                  the real A4 renderer painted as paper, with [Print] and
 *                  [Download PDF]. Below lg the panes stack, record first.
 *
 *   Amend       →  the LEFT half becomes the governed correction form
 *                  (Original → Corrected · Reason · Evidence) while the
 *                  right half stays a LIVE preview reflecting the proposed
 *                  correction — same GRN number, amendment clearly marked.
 *
 * `Void Receiving` lives in `More ▾` — it is not a normal primary action.
 * One Object Header carries the GRN number, supplier/source and status;
 * nothing repeats it.
 */
export default function ReceivingRecord({
  sessionId,
  onBack,
}: {
  sessionId: string;
  onBack: () => void;
}) {
  const q = useReceivingSessionDetail(sessionId);
  const dutyQ = useReceivingDuty();
  const [amending, setAmending] = useState(false);
  const [voiding, setVoiding] = useState(false);
  const [draft, setDraft] = useState<AmendFormDraft | null>(null);

  const detail = q.data ?? null;
  const r = detail?.receipt ?? null;
  const isGrn = r?.status === "posted" || r?.status === "voided";

  // ── the live document — ONE arithmetic feeds preview, Print and Download ──
  const todayIso = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const previewDraft: GrnAmendDraft | null = useMemo(() => {
    if (!amending || !draft || !r) return null;
    return {
      reason: draft.reason,
      ...(draft.goodsReceivedAt !== (r.goods_received_at ?? "")
        ? { goodsReceivedAt: draft.goodsReceivedAt }
        : {}),
      ...(draft.doNumber.trim() !== r.do_number
        ? { doNumber: draft.doNumber.trim() }
        : {}),
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
  const previewKey = templateData
    ? `${sessionId}:${debouncedDraft ? JSON.stringify(debouncedDraft) : "saved"}`
    : null;
  const { pdfError, setPane, retry } = usePdfCanvases(previewKey, () =>
    renderGrnPdf(templateData!),
  );

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
        <p className="text-body text-base-700">
          This receiving record could not be opened
        </p>
        <button
          type="button"
          className="rounded-control border border-base-200 bg-white px-3 py-1.5 text-meta font-medium text-base-700 hover:bg-hovertint"
          onClick={() => void q.refetch()}
        >
          Try again
        </button>
        <button
          type="button"
          onClick={onBack}
          className="text-body text-kit-blue-11 hover:underline"
        >
          ‹ Receiving
        </button>
      </div>
    );
  }

  const events = detail.events;
  const po = detail.po;
  const lines = (r.lines ?? []) as WarehouseReceiptLine[];
  const totals = warehouseReceiptTotals(lines);
  const extraQty = receivingExtraQty(r.extra_lines);
  const cumulative = po ? receivingSummaryOf(po.purchase_order_lines) : null;
  const dutyAllowed = dutyQ.data?.allowed ?? false;
  const displayNo = receivingDisplayNo(r);
  const hasIssue = totals.issue > 0;

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
    setDraft({
      reason: "",
      goodsReceivedAt: r.goods_received_at ?? "",
      doNumber: r.do_number,
      actualSiteId: r.actual_site_id ?? r.warehouse_id,
      arrivedAtName: null,
      doFilePath: null,
      evidenceAdd: [],
      lineEdits: Object.fromEntries(lines.map((l) => [l.id, l.received_now])),
    });
    setAmending(true);
  };
  const stopAmend = () => {
    setAmending(false);
    setDraft(null);
  };

  /* ── the LEFT half — the Receiving Record, or the correction form ──────── */
  const record = (
    <div className="mx-auto w-full max-w-4xl px-4 py-3">
      {/* ── ONE Object Header — back, the identity, the state ── */}
      <button
        type="button"
        onClick={onBack}
        data-testid="receiving-record-back"
        className="text-body text-kit-blue-11 hover:underline"
      >
        ‹ Receiving
      </button>
      <div className="mt-1 flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <h2 className="text-page font-semibold font-mono text-kit-slate-12">
            {isGrn ? displayNo : "Receiving"}
          </h2>
          <div className="text-meta text-base-500">
            {r.supplier_name ?? ""} · <span className="font-mono">{r.po_id}</span>
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
          {r.void_by_name ? ` by ${r.void_by_name}` : ""} —{" "}
          {r.void_reason ?? ""}. The record and its evidence are preserved;
          its stock consequences were reversed.
        </div>
      )}

      {amending && draft ? (
        <AmendPanel
          receipt={r}
          lines={lines}
          draft={draft}
          onDraft={setDraft}
          onClose={stopAmend}
        />
      ) : (
        <>
          {/* ── The facts ─────────────────────────────────────────────── */}
          <Section title="Receiving Details">
            <Prop label={isGrn ? "Linked PO" : "Linked PO"}>
              <span className="font-mono">{r.po_id}</span>
            </Prop>
            <Prop label="Supplier">{r.supplier_name ?? ""}</Prop>
            <Prop label="Deliver To">{r.warehouse_name ?? ""}</Prop>
            <Prop label="Goods arrived at">
              {r.actual_site_name ?? r.warehouse_name ?? ""}
            </Prop>
            <Prop label="Goods received on">
              <span className="tabular-nums">
                {r.goods_received_at ? fmtDate(r.goods_received_at) : ""}
              </span>
            </Prop>
            {r.submitted_from === "warehouse" && r.submitted_at ? (
              <Prop label="Count submitted">
                <span className="tabular-nums">
                  {fmtDate(r.submitted_at.slice(0, 10))}
                  {r.submitted_by_name ? ` · ${r.submitted_by_name}` : ""}
                </span>
              </Prop>
            ) : null}
            {r.posted_at ? (
              <Prop label="Saved">
                <span className="tabular-nums">
                  {fmtDate(r.posted_at.slice(0, 10))}
                  {r.posted_by_name ? ` · ${r.posted_by_name}` : ""}
                </span>
              </Prop>
            ) : null}
            <Prop label="Supplier DO No.">
              <span className="font-mono">{r.do_number}</span>
              {r.do_file_url ? (
                <a
                  href={r.do_file_url}
                  target="_blank"
                  rel="noreferrer"
                  className="ml-2 text-body text-kit-blue-11 hover:underline"
                >
                  View
                </a>
              ) : null}
            </Prop>
            {(r.arrival_evidence ?? []).length > 0 && (
              <Prop label="Arrival evidence">
                <span className="text-body text-kit-slate-12">
                  {evidenceSentence(r.arrival_evidence ?? [])}
                </span>
              </Prop>
            )}
            {isGrn ? (
              /* The duty-evidence trio — three facts, never one overwritten
                 name (owner ruling 2026-09-03). */
              <Prop label="Saved under">
                <span className="text-body text-kit-slate-12" data-testid="duty-trio">
                  {r.posted_duty_holder_name
                    ? `${r.posted_duty_holder_name} · GRN Duty`
                    : "No GRN duty holder recorded"}
                  {r.posted_duty_cover_name
                    ? ` · cover ${r.posted_duty_cover_name}`
                    : ""}
                  {r.posted_authority && r.posted_authority !== "grn_duty"
                    ? ` · saved by ${r.posted_by_name ?? "Staff identity not recorded"} (${RECEIVING_AUTHORITY_LABEL[r.posted_authority]})`
                    : ""}
                </span>
              </Prop>
            ) : null}
          </Section>

          {/* ── Unit results — Expected = Received + Not received ──────── */}
          {(r.unit_results ?? []).length > 0 && (
            <Section title="Unit results">
              {(r.unit_results ?? []).map((u) => (
                <div
                  key={u.stock_item_id}
                  className="flex items-center gap-2 py-0.5 text-body"
                  data-testid={`unit-result-${u.unit_code}`}
                >
                  <span className="w-36 shrink-0 font-mono text-meta text-kit-slate-11">
                    {u.unit_code}
                  </span>
                  <span
                    className={
                      u.outcome === "received"
                        ? "text-kit-green-11"
                        : u.outcome === "received_with_issue"
                          ? "text-kit-red-11"
                          : "text-kit-slate-9"
                    }
                  >
                    {RECEIVING_UNIT_OUTCOME_LABEL[u.outcome]}
                    {u.issue_kind === "wrong_item" ? " · wrong item" : ""}
                    {u.issue_kind === "damaged" ? " · damaged" : ""}
                  </span>
                </div>
              ))}
            </Section>
          )}

          {/* ── Receiving Summary — this session, then the source's cumulative ── */}
          <Section title="Receiving Summary">
            <Prop label="Received Qty">
              <span className="tabular-nums">{totals.received}</span>
            </Prop>
            <Prop label="Damaged Qty">
              <span className={totals.damaged > 0 ? "tabular-nums text-kit-red-11" : "tabular-nums text-kit-slate-9"}>
                {totals.damaged}
              </span>
            </Prop>
            <Prop label="Wrong Item Qty">
              <span className={totals.wrongItem > 0 ? "tabular-nums text-kit-red-11" : "tabular-nums text-kit-slate-9"}>
                {totals.wrongItem}
              </span>
            </Prop>
            {extraQty > 0 && (
              <Prop label="Extra Qty">
                <span className="tabular-nums text-kit-amber-11">{extraQty}</span>
              </Prop>
            )}
            {cumulative && (
              <>
                <Prop label="Order Qty">
                  <span className="tabular-nums">{cumulative.orderQty}</span>
                </Prop>
                <Prop label="Pending Delivery Qty">
                  <span className="tabular-nums">
                    {cumulative.pendingDeliveryQty}
                  </span>
                </Prop>
              </>
            )}
          </Section>

          {/* ── Lines ─────────────────────────────────────────────────── */}
          <Section title="Items">
            {lines.map((l) => (
              <div key={l.id} className="flex gap-2 py-1 text-body border-b border-kit-slate-4">
                <span className="flex-1 min-w-0 font-mono text-kit-slate-12 truncate">
                  {l.sku}
                </span>
                <span className="w-24 text-right tabular-nums">
                  {l.received_now} received
                </span>
                {l.damaged_qty > 0 ? (
                  <span className="w-24 text-right tabular-nums text-kit-red-11">
                    {l.damaged_qty} damaged
                  </span>
                ) : null}
                {l.wrong_item_qty > 0 ? (
                  <span className="w-24 text-right tabular-nums text-kit-red-11">
                    {l.wrong_item_qty} wrong
                  </span>
                ) : null}
              </div>
            ))}
            {(r.extra_lines ?? []).map((x, i) => (
              <div key={`x${i}`} className="flex gap-2 py-1 text-body border-b border-kit-slate-4">
                <span className="flex-1 min-w-0 font-mono text-kit-slate-12 truncate">
                  {x.sku}
                </span>
                <span className="w-40 text-right tabular-nums text-kit-amber-11">
                  {x.qty} extra — not Inventory
                </span>
              </div>
            ))}
          </Section>

          {/* ── Consequences ──────────────────────────────────────────── */}
          {r.status === "posted" && (
            <Section title="What this saving did">
              <p className="text-body text-kit-slate-12">
                Valid received Units entered Inventory at{" "}
                {r.actual_site_name ?? r.warehouse_name ?? "the warehouse"}.
                {cumulative && cumulative.pendingDeliveryQty > 0
                  ? ` ${cumulative.pendingDeliveryQty} unit(s) stay Incoming on this PO.`
                  : ""}
                {hasIssue
                  ? " Damaged and wrong goods are controlled and never became available stock."
                  : ""}
              </p>
              {hasIssue ? (
                <Link
                  to="/operation?tab=claims"
                  className="mt-1.5 inline-block text-body text-kit-blue-11 hover:underline"
                  data-testid="record-open-claims"
                >
                  Open in Claims
                </Link>
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

          {/* ── The governed doors — Amend is primary; Void hides in
                 More ▾ (owner correction §5: not a normal action). ──────── */}
          {r.status === "posted" && dutyAllowed && !voiding && (
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
                items={[
                  {
                    key: "void",
                    label: "Void Receiving",
                    onSelect: () => setVoiding(true),
                  },
                ]}
              />
            </div>
          )}

          {voiding && (
            <VoidPanel
              receipt={r}
              totals={totals}
              onClose={() => setVoiding(false)}
            />
          )}

          {/* ── History — the three-rank record grammar, append-only ──── */}
          <Section title="History">
            {events.length === 0 ? (
              <div className="text-label text-kit-slate-9">
                No receiving activity yet.
              </div>
            ) : (
              <ul className="flex flex-col gap-2" data-testid="record-history">
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
                                ? "Receiving amended"
                                : e.event === "voided"
                                  ? "Receiving voided"
                                  : "Activity"}
                    </div>
                    <div className="text-meta text-kit-slate-11">
                      {e.actor_name ?? "Staff identity not recorded"} ·{" "}
                      {fmtDate(e.event_at.slice(0, 10))}
                    </div>
                    {e.payload?.reason ? (
                      <div className="text-label font-normal text-kit-slate-11">
                        {e.payload.reason}
                      </div>
                    ) : e.payload?.grn_no ? (
                      <div className="text-label font-normal text-kit-slate-11">
                        {e.payload.grn_no}
                        {e.payload.units_counted != null
                          ? ` · ${e.payload.units_counted} unit(s)`
                          : ""}
                      </div>
                    ) : null}
                    {e.event === "amended" && e.payload?.before ? (
                      /* Only the AFFECTED facts compare side by side. */
                      <div className="mt-1 grid max-w-md grid-cols-2 gap-2 rounded-card border border-kit-slate-5 p-2 text-label">
                        <div>
                          <div className="uppercase tracking-wide text-kit-slate-9">
                            Original
                          </div>
                          {Object.entries(e.payload.before).map(([k, v]) => (
                            <div key={k} className="text-kit-slate-11">
                              {comparisonValue(v)}
                            </div>
                          ))}
                        </div>
                        <div>
                          <div className="uppercase tracking-wide text-kit-slate-9">
                            Correction
                          </div>
                          {Object.entries(
                            (e.payload.after ?? {}) as Record<string, unknown>,
                          ).map(([k, v]) => (
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
      </div>
    );
  }

  /* ── THE GRN OBJECT — 50/50 at the governed desktop breakpoint; below it
        the panes stack, Receiving Record first (owner correction §5). ───── */
  return (
    <div
      className="flex min-h-0 flex-1 flex-col overflow-auto bg-kit-slate-3 lg:flex-row lg:overflow-hidden"
      data-testid="receiving-record"
    >
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
              <button
                type="button"
                onClick={retry}
                className="text-kit-blue-11 hover:underline"
              >
                Try again
              </button>
            </div>
          ) : null}
          {/* The watermark is PREVIEW chrome, painted over the paper and
              never into it — Print produces the SAVED document. */}
          {amending && (
            <div
              aria-hidden="true"
              data-testid="unsaved-watermark"
              className="pointer-events-none absolute inset-0 grid select-none place-items-center overflow-hidden"
            >
              <span className="rotate-[-24deg] scale-[2.4] text-page tracking-[0.3em] text-base-900/10">
                UNSAVED
              </span>
            </div>
          )}
        </div>
      </aside>
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

function evidenceSentence(
  entries: ReadonlyArray<{ kind: "photo" | "video" }>,
): string {
  const photos = entries.filter((e) => e.kind === "photo").length;
  const videos = entries.filter((e) => e.kind === "video").length;
  return [
    photos > 0 ? `${photos} photo${photos === 1 ? "" : "s"}` : null,
    videos > 0 ? `${videos} video${videos === 1 ? "" : "s"}` : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

/** A bare ISO date never ships (THE YEAR RULE) — the comparison speaks the
 *  same date words as every other cell. */
function comparisonValue(v: unknown): string {
  if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v)) return fmtDate(v);
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
  /** GRN Duty verifies/corrects where the goods PHYSICALLY landed before
   *  saving. `Deliver To` is never overwritten — both facts are preserved
   *  (owner correction 2026-09-06 §3). */
  const [actualSiteId, setActualSiteId] = useState(bookedWarehouseId);
  const warehousesQ = useOperationWarehouse();
  const warehouses = warehousesQ.data?.warehouses ?? [];
  const checkIn = useWarehouseReceiptReviewMutation("check-in", {
    onSuccess: onDone,
    onError: (e) => setErr(e.message),
  });
  const sendBack = useWarehouseReceiptReviewMutation("send-back", {
    onSuccess: onDone,
    onError: (e) => setErr(e.message),
  });

  return (
    <Section title="Check the count">
      <p className="text-body text-kit-slate-12">
        {warehouseName} returned this count to Carres. Before Carres saves,
        there is no GRN and no stock moves.
        {opensClaims
          ? " Saving will open supplier claims for the recorded issues."
          : ""}
      </p>
      {dutyAllowed && warehouses.length > 0 ? (
        <div className="mt-2 flex items-center gap-2 text-body leading-6">
          <span className="w-32 shrink-0 text-label text-kit-slate-9">
            Goods arrived at
          </span>
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
            <button
              type="button"
              onClick={() => setReturning(false)}
              className="text-label text-kit-slate-9 hover:text-kit-slate-12"
            >
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
            onClick={() =>
              checkIn.mutate({
                receiptId,
                ...(actualSiteId !== bookedWarehouseId
                  ? { actualSiteId }
                  : {}),
              })
            }
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

/** The correction as the form holds it. Lifted to the object so the RIGHT
 *  half can preview the proposed document live. */
export interface AmendFormDraft {
  reason: string;
  goodsReceivedAt: string;
  doNumber: string;
  actualSiteId: string;
  /** The chosen site's NAME — resolved by the select for the preview. */
  arrivedAtName: string | null;
  /** A corrected signed-DO upload (0427); null = unchanged. */
  doFilePath: string | null;
  /** Additional arrival evidence (0427); append-only. */
  evidenceAdd: ReceivingArrivalEvidence[];
  lineEdits: Record<string, number>;
}

function AmendPanel({
  receipt,
  lines,
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
  draft: AmendFormDraft;
  onDraft: (d: AmendFormDraft) => void;
  onClose: () => void;
}) {
  const [err, setErr] = useState<string | null>(null);
  const [saveKey] = useState(() => crypto.randomUUID());
  const warehousesQ = useOperationWarehouse();
  const warehouses = warehousesQ.data?.warehouses ?? [];
  const amend = useReceivingAmendMutation(receipt.id, {
    onSuccess: onClose,
    onError: (e) => setErr(e.message),
  });

  const set = (patch: Partial<AmendFormDraft>) => onDraft({ ...draft, ...patch });

  const originalSiteId = receipt.actual_site_id ?? receipt.warehouse_id;
  const changedLines = lines.filter(
    (l) => (draft.lineEdits[l.id] ?? l.received_now) !== l.received_now,
  );
  const changedHeader =
    draft.goodsReceivedAt !== (receipt.goods_received_at ?? "") ||
    draft.doNumber.trim() !== receipt.do_number ||
    draft.actualSiteId !== originalSiteId ||
    draft.doFilePath !== null ||
    draft.evidenceAdd.length > 0;
  const nothingChanged = changedLines.length === 0 && !changedHeader;

  const FIELD =
    "h-8 rounded-control border border-kit-slate-5 bg-white px-2 text-body text-kit-slate-12";

  return (
    <Section title="Amend Receiving">
      <p className="text-label text-kit-slate-9">
        The original record is preserved; the correction and its reason join
        History, and the preview beside this form shows the corrected GRN with
        its amendment marked — the number never changes. The GRN number, the
        source PO/CO and the supplier cannot be amended: if those identities
        are wrong, use Void Receiving and start Receiving from the correct
        source. Damaged and wrong quantities are corrected through their
        claims, not here.
      </p>
      <div className="mt-2 flex items-center gap-2 text-body leading-6">
        <span className="w-32 shrink-0 text-label text-kit-slate-9">
          Correction reason
        </span>
        <input
          type="text"
          value={draft.reason}
          onChange={(e) => set({ reason: e.target.value })}
          aria-label="Correction reason"
          data-testid="amend-reason"
          className={`${FIELD} flex-1`}
        />
      </div>
      {/* Original → Corrected, per fact. */}
      <div className="mt-1 flex items-center gap-2 text-body leading-6">
        <span className="w-32 shrink-0 text-label text-kit-slate-9">
          Goods received on
        </span>
        <span className="tabular-nums text-kit-slate-9">
          {receipt.goods_received_at ? fmtDate(receipt.goods_received_at) : "—"}
        </span>
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
        <span className="w-32 shrink-0 text-label text-kit-slate-9">
          Goods arrived at
        </span>
        <select
          value={draft.actualSiteId}
          onChange={(e) => {
            const id = e.target.value;
            set({
              actualSiteId: id,
              arrivedAtName:
                id === originalSiteId
                  ? null
                  : (warehouses.find((w) => w.id === id)?.name ?? null),
            });
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
        <span className="w-32 shrink-0 text-label text-kit-slate-9">
          Supplier DO No.
        </span>
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
      {/* Evidence corrections (0427): a corrected signed DO replaces the
          paper on record (the old file survives in History); arrival
          evidence only ever GROWS. */}
      <div className="mt-2">
        <span className="text-label text-kit-slate-9">
          Corrected signed DO (optional)
        </span>
        <DOFileUploadField
          poId={receipt.po_id}
          doNumber={draft.doNumber || receipt.do_number}
          onUploaded={(filePath) => set({ doFilePath: filePath })}
        />
        {draft.doFilePath ? (
          <p className="text-label text-kit-slate-11" data-testid="amend-do-file-ready">
            Corrected DO ready — it replaces the paper on record when the
            amendment is saved.
          </p>
        ) : null}
      </div>
      <div className="mt-2">
        <span className="text-label text-kit-slate-9">
          Additional arrival evidence (optional)
        </span>
        <ArrivalEvidenceUploadField
          poId={receipt.po_id}
          doNumber={draft.doNumber || receipt.do_number}
          entries={draft.evidenceAdd}
          onChange={(entries) => set({ evidenceAdd: entries })}
          testId="amend-evidence-add"
        />
      </div>
      {lines.map((l) => (
        <div key={l.id} className="mt-1 flex items-center gap-2 text-body leading-6">
          <span className="w-32 shrink-0 truncate font-mono text-label text-kit-slate-9">
            {l.sku}
          </span>
          {/* Original → Corrected. */}
          <span className="w-24 tabular-nums text-kit-slate-9">
            {l.received_now} received
          </span>
          <span className="text-kit-slate-9">→</span>
          <input
            type="number"
            min={0}
            value={draft.lineEdits[l.id] ?? l.received_now}
            onChange={(e) =>
              set({
                lineEdits: {
                  ...draft.lineEdits,
                  [l.id]: Math.max(0, Number(e.target.value) || 0),
                },
              })
            }
            aria-label={`Received now ${l.sku}`}
            data-testid={`amend-line-${l.id}`}
            className={`${FIELD} w-16 text-right tabular-nums`}
          />
        </div>
      ))}
      {err && (
        <p className="mt-1 text-label text-kit-red-11" data-testid="amend-error">
          {err}
        </p>
      )}
      <div className="mt-2 flex items-center gap-2">
        <button
          type="button"
          onClick={onClose}
          data-testid="amend-cancel"
          className="text-label text-kit-slate-9 hover:text-kit-slate-12"
        >
          Cancel
        </button>
        <button
          type="button"
          disabled={
            draft.reason.trim().length < 3 || nothingChanged || amend.isPending
          }
          onClick={() =>
            amend.mutate({
              reason: draft.reason.trim(),
              saveKey,
              ...(draft.goodsReceivedAt !== (receipt.goods_received_at ?? "")
                ? { goodsReceivedAt: draft.goodsReceivedAt }
                : {}),
              ...(draft.doNumber.trim() !== receipt.do_number
                ? { doNumber: draft.doNumber.trim() }
                : {}),
              ...(draft.actualSiteId !== originalSiteId
                ? { actualSiteId: draft.actualSiteId }
                : {}),
              ...(draft.doFilePath ? { doFilePath: draft.doFilePath } : {}),
              ...(draft.evidenceAdd.length > 0
                ? { arrivalEvidenceAdd: draft.evidenceAdd }
                : {}),
              ...(changedLines.length
                ? {
                    lines: changedLines.map((l) => ({
                      id: l.id,
                      receivedNow: draft.lineEdits[l.id] ?? l.received_now,
                    })),
                  }
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
  const voidM = useReceivingVoidMutation(receipt.id, {
    onSuccess: onClose,
    onError: (e) => setErr(e.message),
  });
  return (
    <Section title="Void Receiving">
      {/* The impact review, BEFORE the act. */}
      <p className="text-body text-kit-slate-12" data-testid="void-impact">
        Voiding reverses this receiving completely: {totals.received} received
        unit(s) go back to Incoming, the PO's Received Qty goes back down, and
        the stock movement is reversed. The GRN number and every piece of
        evidence stay on file, and the document is marked Cancelled. If goods
        already moved on, or claims were opened, the void is refused with the
        exact blocker.
      </p>
      <div className="mt-2 flex items-center gap-2 text-body leading-6">
        <span className="w-32 shrink-0 text-label text-kit-slate-9">
          Void reason
        </span>
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
        <button
          type="button"
          onClick={onClose}
          className="text-label text-kit-slate-9 hover:text-kit-slate-12"
        >
          Cancel
        </button>
        <button
          type="button"
          disabled={reason.trim().length < 3 || voidM.isPending}
          onClick={() => voidM.mutate({ reason: reason.trim() })}
          data-testid="void-save"
          className={`${DOC_BTN} ml-auto disabled:opacity-40`}
        >
          {voidM.isPending
            ? "Voiding…"
            : reason.trim().length < 3
              ? "Void — add a reason"
              : "Void Receiving"}
        </button>
      </div>
    </Section>
  );
}

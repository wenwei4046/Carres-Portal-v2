import { useState } from "react";
import { Link } from "react-router-dom";
import {
  receivingDisplayNo,
  receivingExtraQty,
  receivingSummaryOf,
  RECEIVING_AUTHORITY_LABEL,
  RECEIVING_UNIT_OUTCOME_LABEL,
  warehouseReceiptStatusLabel,
  warehouseReceiptTotals,
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
import { DOC_BTN, DocSection as Section, Prop } from "./workspace-doc";

/**
 * ReceivingRecord — one Receiving Session / formal GRN, full width, ONE
 * SCROLL (UI MASTER §4.1: a Goods Receipt never splits; owner instruction
 * 2026-09-04 §5D).
 *
 *   submitted  →  the count review: [Return count to {warehouse}] ·
 *                 [Save Receiving] — the two-step external Warehouse flow's
 *                 Carres half. Before Carres saves there is NO GRN and NO
 *                 stock movement.
 *   posted     →  the read-only formal GRN: number · source · both site
 *                 facts · three times · evidence · Unit results · summary ·
 *                 consequences · the duty-evidence trio · History. No
 *                 ordinary Edit — `Amend Receiving` and `Void Receiving` are
 *                 the only doors, each with its reason.
 *   voided     →  the preserved record, plainly marked. Nothing is deleted.
 *
 * Only the AFFECTED facts use a local before/after comparison inside Amend —
 * the page itself never becomes 50/50.
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

  if (q.isLoading) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center bg-white" data-testid="receiving-record-loading">
        <p className="text-meta text-base-500">Opening the receiving record…</p>
      </div>
    );
  }
  if (q.isError || !q.data?.receipt) {
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

  const r = q.data.receipt;
  const events = q.data.events;
  const po = q.data.po;
  const lines = (r.lines ?? []) as WarehouseReceiptLine[];
  const totals = warehouseReceiptTotals(lines);
  const extraQty = receivingExtraQty(r.extra_lines);
  const cumulative = po ? receivingSummaryOf(po.purchase_order_lines) : null;
  const dutyAllowed = dutyQ.data?.allowed ?? false;
  const displayNo = receivingDisplayNo(r);
  const hasIssue = totals.issue > 0;

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto bg-white" data-testid="receiving-record">
      <div className="mx-auto w-full max-w-4xl px-4 py-3">
        {/* ── Object Header — one back destination, the identity, the state ── */}
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
              {r.status === "posted" || r.status === "voided"
                ? displayNo
                : "Receiving"}
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
            Voided {r.void_at ? fmtDate(r.void_at.slice(0, 10)) : ""}
            {r.void_by_name ? ` by ${r.void_by_name}` : ""} —{" "}
            {r.void_reason ?? ""}. The record and its evidence are preserved;
            its stock consequences were reversed.
          </div>
        )}

        {/* ── The facts ─────────────────────────────────────────────────── */}
        <Section title="Receiving Details">
          <Prop label="Linked PO">
            <span className="font-mono">{r.po_id}</span>
          </Prop>
          <Prop label="Supplier">{r.supplier_name ?? ""}</Prop>
          <Prop label="Deliver To">{r.warehouse_name ?? ""}</Prop>
          <Prop label="Actual Site">
            {r.actual_site_name ?? "Same as Deliver To"}
          </Prop>
          <Prop label="Goods Received At">
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
            <Prop label="Posted">
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
          {r.status === "posted" || r.status === "voided" ? (
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

        {/* ── Unit results — Expected = Received + Not received ──────────── */}
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

        {/* ── Lines ───────────────────────────────────────────────────────── */}
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

        {/* ── Consequences ────────────────────────────────────────────────── */}
        {r.status === "posted" && (
          <Section title="What this posting did">
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

        {/* ── The two governed doors — no ordinary Edit ───────────────────── */}
        {r.status === "posted" && dutyAllowed && !amending && !voiding && (
          <div className="mt-4 flex items-center gap-3">
            <button
              type="button"
              onClick={() => setAmending(true)}
              data-testid="amend-receiving-door"
              className="rounded-control border border-kit-slate-5 bg-white px-3 py-1.5 text-body text-kit-slate-12 hover:bg-kit-slate-3"
            >
              Amend Receiving
            </button>
            <button
              type="button"
              onClick={() => setVoiding(true)}
              data-testid="void-receiving-door"
              className="rounded-control border border-kit-slate-5 bg-white px-3 py-1.5 text-body text-kit-slate-12 hover:bg-kit-slate-3"
            >
              Void Receiving
            </button>
          </div>
        )}

        {amending && (
          <AmendPanel
            receipt={r}
            lines={lines}
            onClose={() => setAmending(false)}
          />
        )}
        {voiding && (
          <VoidPanel
            receipt={r}
            totals={totals}
            onClose={() => setVoiding(false)}
          />
        )}

        {/* ── History — the three-rank record grammar, append-only ────────── */}
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
                      ? "Receiving posted"
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
                    /* Only the AFFECTED facts compare side by side — the page
                       never becomes 50/50 (owner instruction §9). */
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
      </div>
    </div>
  );
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
   *  (owner instruction §6). */
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
            Actual Site
          </span>
          <select
            value={actualSiteId}
            onChange={(e) => setActualSiteId(e.target.value)}
            aria-label="Actual Site"
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

/* ── Amend Receiving — reason + only the named facts move ────────────────── */

function AmendPanel({
  receipt,
  lines,
  onClose,
}: {
  receipt: { id: string; goods_received_at?: string; do_number: string; grn_no?: string | null };
  lines: WarehouseReceiptLine[];
  onClose: () => void;
}) {
  const [reason, setReason] = useState("");
  const [goodsReceivedAt, setGoodsReceivedAt] = useState(
    receipt.goods_received_at ?? "",
  );
  const [doNumber, setDoNumber] = useState(receipt.do_number);
  const [lineEdits, setLineEdits] = useState<Record<string, number>>(() =>
    Object.fromEntries(lines.map((l) => [l.id, l.received_now])),
  );
  const [err, setErr] = useState<string | null>(null);
  const [saveKey] = useState(() => crypto.randomUUID());
  const amend = useReceivingAmendMutation(receipt.id, {
    onSuccess: onClose,
    onError: (e) => setErr(e.message),
  });

  const changedLines = lines.filter(
    (l) => (lineEdits[l.id] ?? l.received_now) !== l.received_now,
  );
  const changedHeader =
    goodsReceivedAt !== (receipt.goods_received_at ?? "") ||
    doNumber.trim() !== receipt.do_number;
  const nothingChanged = changedLines.length === 0 && !changedHeader;

  const FIELD =
    "h-8 rounded-control border border-kit-slate-5 bg-white px-2 text-body text-kit-slate-12";

  return (
    <Section title="Amend Receiving">
      <p className="text-label text-kit-slate-9">
        The original record is preserved; the correction and its reason join
        History. Damaged and wrong quantities are corrected through their
        claims, not here.
      </p>
      <div className="mt-2 flex items-center gap-2 text-body leading-6">
        <span className="w-32 shrink-0 text-label text-kit-slate-9">
          Correction reason
        </span>
        <input
          type="text"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          aria-label="Correction reason"
          data-testid="amend-reason"
          className={`${FIELD} flex-1`}
        />
      </div>
      <div className="mt-1 flex items-center gap-2 text-body leading-6">
        <span className="w-32 shrink-0 text-label text-kit-slate-9">
          Goods Received At
        </span>
        <input
          type="date"
          value={goodsReceivedAt}
          onChange={(e) => setGoodsReceivedAt(e.target.value)}
          aria-label="Goods Received At"
          data-testid="amend-received-at"
          className={FIELD}
        />
      </div>
      <div className="mt-1 flex items-center gap-2 text-body leading-6">
        <span className="w-32 shrink-0 text-label text-kit-slate-9">
          Supplier DO No.
        </span>
        <input
          type="text"
          value={doNumber}
          onChange={(e) => setDoNumber(e.target.value)}
          aria-label="Supplier DO No."
          data-testid="amend-do-number"
          className={`${FIELD} flex-1`}
        />
      </div>
      {lines.map((l) => (
        <div key={l.id} className="mt-1 flex items-center gap-2 text-body leading-6">
          <span className="w-32 shrink-0 truncate font-mono text-label text-kit-slate-9">
            {l.sku}
          </span>
          {/* Only the affected fact compares side by side. */}
          <span className="w-24 tabular-nums text-kit-slate-9">
            {l.received_now} received
          </span>
          <span className="text-kit-slate-9">→</span>
          <input
            type="number"
            min={0}
            value={lineEdits[l.id] ?? l.received_now}
            onChange={(e) =>
              setLineEdits((m) => ({
                ...m,
                [l.id]: Math.max(0, Number(e.target.value) || 0),
              }))
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
          className="text-label text-kit-slate-9 hover:text-kit-slate-12"
        >
          Cancel
        </button>
        <button
          type="button"
          disabled={
            reason.trim().length < 3 || nothingChanged || amend.isPending
          }
          onClick={() =>
            amend.mutate({
              reason: reason.trim(),
              saveKey,
              ...(goodsReceivedAt !== (receipt.goods_received_at ?? "")
                ? { goodsReceivedAt }
                : {}),
              ...(doNumber.trim() !== receipt.do_number
                ? { doNumber: doNumber.trim() }
                : {}),
              ...(changedLines.length
                ? {
                    lines: changedLines.map((l) => ({
                      id: l.id,
                      receivedNow: lineEdits[l.id] ?? l.received_now,
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
            : reason.trim().length < 3
              ? "Save — add a correction reason"
              : nothingChanged
                ? "Save — nothing changed yet"
                : "Save the correction"}
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
        evidence stay on file. If goods already moved on, or claims were
        opened, the void is refused with the exact blocker.
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

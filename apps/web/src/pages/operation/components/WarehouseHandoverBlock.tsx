import { useCallback, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import {
  DELIVERY_PHOTO_MAX_BYTES,
  DELIVERY_PHOTO_MIMES,
  HANDOVER_EVIDENCE_MAX_FILES,
  HANDOVER_EVIDENCE_VIDEO_MAX_BYTES,
  HANDOVER_EVIDENCE_VIDEO_MIMES,
  deliveryGroupOf,
  isOutsideTheTrip,
  type DeliveryHandoverKind,
  type HandoverGoodsLine,
} from "@carres/shared";
import { apiFetch } from "@/lib/api";
import EvidenceUploadField, { type EvidenceEntry } from "@/components/EvidenceUploadField";
import { fmtDate } from "@/lib/fmt-date";
import {
  useDeliveryOrder,
  useRecordHandoverEvent,
  type DeliveryHandoverEventRow,
} from "@/lib/queries";
import { Modal, ModalActions } from "./Modal";

/**
 * WAREHOUSE → LOGISTICS HANDOVER — the §4 chain's acts, on the work surface
 * (delivery MASTER §4; card CARD-2026-08-19-warehouse-handover-chain).
 *
 *   Ready for Handover → Handed Over → Received by Logistics
 *
 * The Warehouse acts live elsewhere: scan / check / pack / `Record {n} Units
 * loaded to {person}` (the 2026-09-06 replacement Card's act name) belong to
 * the approved Outbound work page, and this block is their DOOR. The one act that stays is the counterparty's own:
 *
 *   · `Confirm logistics receipt` — logistics' own count, editable: a receipt
 *     with a different quantity is a DISCREPANCY — both facts stay visible and
 *     neither is overwritten.
 *
 * Received by Logistics is what turns the document `Out for delivery` (the
 * ONE arithmetic derives it; nothing here writes a status). Every fact goes
 * through the governed door — this block never writes a table.
 */

const CHAIN: Array<{ kind: DeliveryHandoverKind; label: string }> = [
  { kind: "ready_for_handover", label: "Ready for handover" },
  { kind: "handed_over", label: "Handed over" },
  { kind: "received_by_logistics", label: "Received by logistics" },
];

export default function WarehouseHandoverBlock({
  doNumber,
  logisticsName,
  headerAction = false,
  onDone,
}: {
  doNumber: string;
  logisticsName: string | null;
  /** The object header owns the one primary operational action. Detailed
   *  receiver/proof/count fields open from that action in a modal. */
  headerAction?: boolean;
  onDone?: () => void;
}) {
  const detailQ = useDeliveryOrder(doNumber);
  const d = detailQ.data?.deliveryOrder;
  const events = useMemo(
    () => detailQ.data?.handoverEvents ?? [],
    [detailQ.data?.handoverEvents],
  );
  const byKind = useMemo(() => {
    const m = new Map<DeliveryHandoverKind, DeliveryHandoverEventRow>();
    for (const e of events) m.set(e.kind, e);
    return m;
  }, [events]);

  // THIS TRIP's lines — the same derivation the DO page and print path use.
  const tripGoods = useMemo<HandoverGoodsLine[]>(() => {
    const lines = detailQ.data?.deliveryOrder.orders.order_lines ?? [];
    const groups = detailQ.data?.deliveryOrder.trip_groups ?? null;
    const all = lines.map((l) => ({ sku: l.sku, qty: Number(l.qty) }));
    if (!groups || groups.length === 0) return all;
    const scope = new Set(groups);
    return all.filter((l) => {
      const g = deliveryGroupOf(l.sku);
      return g !== null && scope.has(g);
    });
  }, [detailQ.data?.deliveryOrder]);

  const record = useRecordHandoverEvent(d?.id ?? "");

  // ── Confirm receipt form state (logistics' OWN count) ─────────────────────
  const [receiptQty, setReceiptQty] = useState<Record<string, string>>({});
  const [receiptNote, setReceiptNote] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [loadOpen, setLoadOpen] = useState(false);

  if (!detailQ.data || !d) return null;
  // A cancelled document has no handover; a resulted trip's chain is history.
  const closed =
    Boolean(d.voided_at) || (detailQ.data.attempts ?? []).length > 0;

  /* WAREHOUSE CARD 03 — the Warehouse acts (ready / check / pack / handover)
     moved to the approved Outbound work page: this block keeps the DO object
     read-only, renders the recorded chain, offers a DOOR to Outbound for the
     physical work, and keeps only the LOGISTICS receipt — the counterparty's
     own act, which never lived on the Warehouse surface. */
  const next: DeliveryHandoverKind | null = !byKind.has("handed_over")
    ? "handed_over"
    : !byKind.has("received_by_logistics")
      ? "received_by_logistics"
      : null;
  const outboundHref = `/operation?tab=warehouse-outbound&do=${encodeURIComponent(doNumber)}`;
  /* 0737 · a whole-order DO of accessories only (pillows, protectors) has no
     Unit list, so Outbound has nothing to scan: the handover is recorded here.
     The SKU word is a display hint; the server decides by Catalog's
     stock_identity_mode and refuses if any line is Unit-tracked. */
  const countedOnly =
    detailQ.data.scopeUnits?.length === 0 &&
    !d.trip_groups?.length &&
    tripGoods.length > 0 &&
    tripGoods.every((g) => isOutsideTheTrip(g.sku));
  const loadModal = loadOpen ? (
    <GoodsLoadedModal
      doId={d.id}
      doNumber={doNumber}
      logisticsName={logisticsName}
      onClose={() => setLoadOpen(false)}
      onDone={onDone}
    />
  ) : null;
  const loadButton = (testId: string, className: string) => (
    <button type="button" data-testid={testId} className={className} onClick={() => setLoadOpen(true)}>
      {`Record goods loaded to ${logisticsName ?? "logistics"}`}
    </button>
  );

  const handedGoods = byKind.get("handed_over")?.goods ?? null;
  const receiptBase: HandoverGoodsLine[] =
    handedGoods && handedGoods.length > 0 ? handedGoods : tripGoods;

  const recordFact = (input: Parameters<typeof record.mutate>[0], done: string) =>
    record.mutate(input, {
      onSuccess: () => {
        toast.success(done);
        setReceiptQty({});
        setReceiptNote("");
        onDone?.();
      },
      onError: (err) => toast.error(err.message),
    });

  if (headerAction) {
    if (closed || !next) return null;
    if (next === "handed_over") {
      if (countedOnly) {
        return (
          <>
            {loadButton("do-object-primary-action", "btn-primary inline-flex h-7 items-center px-2.5 text-body font-medium")}
            {loadModal}
          </>
        );
      }
      /* The Warehouse act belongs to Outbound — this is a DOOR, not a form. */
      return (
        <Link
          to={outboundHref}
          data-testid="do-object-primary-action"
          className="btn-primary inline-flex h-7 items-center px-2.5 text-body font-medium"
        >
          Open Outbound
        </Link>
      );
    }
    return (
      <>
        <button
          type="button"
          data-testid="do-object-primary-action"
          className="btn-primary inline-flex h-7 items-center px-2.5 text-body font-medium"
          disabled={record.isPending}
          onClick={() => setFormOpen(true)}
        >
          Confirm logistics receipt
        </button>
        {formOpen ? (
          <Modal title="Confirm logistics receipt" onClose={() => setFormOpen(false)}>
            <WarehouseHandoverBlock
              doNumber={doNumber}
              logisticsName={logisticsName}
              onDone={() => setFormOpen(false)}
            />
          </Modal>
        ) : null}
      </>
    );
  }

  return (
    <div className="px-4 py-3 border-t border-base-100" data-testid="handover-block">
      <div className="text-label uppercase tracking-[0.06em] text-base-500 mb-1.5">
        Warehouse handover
      </div>

      {/* The chain so far — each recorded fact with its recorder. */}
      <ul className="flex flex-col gap-1 mb-2">
        {CHAIN.map((step) => {
          const e = byKind.get(step.kind);
          return (
            <li key={step.kind} className="flex items-baseline gap-2">
              <span
                aria-hidden="true"
                className={`shrink-0 text-meta ${e ? "text-success" : "text-base-300"}`}
              >
                {e ? "✓" : "○"}
              </span>
              <span className="min-w-0">
                <span
                  className={`block text-meta ${
                    e ? "text-base-800 font-medium" : "text-base-500"
                  }`}
                >
                  {step.label}
                  {e?.kind === "handed_over" && e.receiver_name
                    ? ` · received by ${e.receiver_name}`
                    : ""}
                </span>
                {e && (
                  <span className="block text-meta text-base-500">
                    {e.recorded_by_name || "Recorded"} · {fmtDate(e.recorded_at)}
                    {e.company ? ` · ${e.company}` : ""}
                  </span>
                )}
              </span>
            </li>
          );
        })}
      </ul>

      {closed ? null : next === "handed_over" && countedOnly ? (
        <div data-testid="handover-counted-goods">
          {loadButton("handover-record-goods-loaded", "btn-primary inline-block text-body font-medium py-1.5 px-3")}
          {loadModal}
        </div>
      ) : next === "handed_over" ? (
        <div data-testid="handover-outbound-door">
          <Link to={outboundHref} className="btn-primary inline-block text-body font-medium py-1.5 px-3">
            Open Outbound
          </Link>
          <p className="text-meta text-base-500 mt-1">
            Scan, check, pack and hand over the exact Units in Outbound.
          </p>
        </div>
      ) : next === "received_by_logistics" ? (
        <div className="flex flex-col gap-2" data-testid="handover-receipt-form">
          <span className="text-meta text-base-500">
            Logistics&rsquo; own count. Correct any quantity that differs; both
            counts stay on record.
          </span>
          <ul className="flex flex-col gap-1">
            {receiptBase.map((g) => (
              <li key={g.sku} className="flex items-center gap-2">
                <span className="min-w-0 flex-1 truncate font-mono text-meta text-base-700">
                  {g.sku}
                </span>
                <input
                  type="number"
                  min={0}
                  value={receiptQty[g.sku] ?? String(g.qty)}
                  onChange={(e) =>
                    setReceiptQty((q) => ({ ...q, [g.sku]: e.target.value }))
                  }
                  aria-label={`Quantity received — ${g.sku}`}
                  className="h-7 w-16 rounded-md border border-base-300 px-1.5 text-right text-body tabular-nums"
                />
              </li>
            ))}
          </ul>
          <input
            type="text"
            value={receiptNote}
            onChange={(e) => setReceiptNote(e.target.value)}
            className="h-8 rounded-md border border-base-300 px-2 text-body"
            placeholder="Note (optional, say what differs and why)"
          />
          <div>
            <button
              type="button"
              data-testid="handover-confirm-receipt"
              className="btn-primary text-body font-medium py-1.5 px-3"
              disabled={record.isPending}
              onClick={() =>
                recordFact(
                  {
                    kind: "received_by_logistics",
                    goods: receiptBase.map((g) => ({
                      sku: g.sku,
                      qty: Math.max(0, Number(receiptQty[g.sku] ?? g.qty) || 0),
                    })),
                    ...(receiptNote.trim() ? { note: receiptNote.trim() } : {}),
                  },
                  "Received by logistics. Out for delivery",
                )
              }
            >
              Confirm logistics receipt
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

/** 0737 · the loading record for a DO of accessories only: no Unit IDs to
 *  pick, the same receiver and proof as Outbound's `RecordLoadedModal`. The
 *  goods count defaults on the server to the document's own lines. */
function GoodsLoadedModal({
  doId,
  doNumber,
  logisticsName,
  onClose,
  onDone,
}: {
  doId: string;
  doNumber: string;
  logisticsName: string | null;
  onClose: () => void;
  onDone?: () => void;
}) {
  const record = useRecordHandoverEvent(doId);
  const [receiver, setReceiver] = useState("");
  const [vehicle, setVehicle] = useState("");
  const [evidence, setEvidence] = useState<Array<EvidenceEntry & { kind: "photo" | "video" }>>([]);
  const signEvidence = useCallback(
    (file: File) =>
      apiFetch<{ token: string; path: string }>(
        `/api/operation/delivery-orders/${encodeURIComponent(doId)}/handover-proof/sign-upload`,
        { method: "POST", body: JSON.stringify({ mimeType: file.type, sizeBytes: file.size }) },
      ),
    [doId],
  );
  const canSubmit = receiver.trim().length > 0 && evidence.length > 0 && !record.isPending;

  return (
    <Modal title={`Handed over: ${doNumber}`} onClose={onClose}>
      <div className="space-y-3 text-[13px]">
        <label className="block">
          <span className="text-label uppercase tracking-[0.06em] text-base-500">
            Loaded to ({logisticsName ?? "logistics"})
          </span>
          <input
            value={receiver}
            onChange={(e) => setReceiver(e.target.value)}
            className="mt-0.5 h-8 w-full rounded border border-kit-slate-5 px-2"
            placeholder="The person who actually received the goods"
            data-testid="handover-receiver"
          />
        </label>
        <label className="block">
          <span className="text-label uppercase tracking-[0.06em] text-base-500">
            Vehicle (when known)
          </span>
          <input
            value={vehicle}
            onChange={(e) => setVehicle(e.target.value)}
            className="mt-0.5 h-8 w-full rounded border border-kit-slate-5 px-2"
            data-testid="handover-vehicle"
          />
        </label>
        <div>
          <span className="text-label uppercase tracking-[0.06em] text-base-500">
            Proof: photos and videos of the loaded goods
          </span>
          <div className="mt-0.5">
            <EvidenceUploadField
              entries={evidence}
              onChange={setEvidence}
              sign={signEvidence}
              bucket="proof-of-delivery"
              imageMimes={DELIVERY_PHOTO_MIMES}
              videoMimes={HANDOVER_EVIDENCE_VIDEO_MIMES}
              imageMaxBytes={DELIVERY_PHOTO_MAX_BYTES}
              videoMaxBytes={HANDOVER_EVIDENCE_VIDEO_MAX_BYTES}
              maxFiles={HANDOVER_EVIDENCE_MAX_FILES}
              ariaLabel="Loading evidence"
              testId="handover-evidence"
            />
          </div>
        </div>
      </div>
      <ModalActions
        onCancel={onClose}
        primary={`Record goods loaded to ${receiver.trim() || logisticsName || "logistics"}`}
        primaryDisabled={!canSubmit}
        primaryPending={record.isPending}
        onPrimary={() =>
          record.mutate(
            {
              kind: "handed_over",
              receiverName: receiver.trim(),
              vehicle: vehicle.trim() || undefined,
              evidence,
            },
            {
              onSuccess: () => {
                toast.success("Handed over");
                onClose();
                onDone?.();
              },
              onError: (e) => toast.error(e.message),
            },
          )
        }
      />
    </Modal>
  );
}

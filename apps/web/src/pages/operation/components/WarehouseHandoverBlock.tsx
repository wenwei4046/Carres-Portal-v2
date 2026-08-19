import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  deliveryGroupOf,
  type DeliveryHandoverKind,
  type HandoverGoodsLine,
} from "@carres/shared";
import { apiFetch, ApiError } from "@/lib/api";
import { supabase } from "@/lib/supabase";
import { fmtDate } from "@/lib/fmt-date";
import {
  useDeliveryOrder,
  useRecordHandoverEvent,
  type DeliveryHandoverEventRow,
} from "@/lib/queries";

/**
 * WAREHOUSE → LOGISTICS HANDOVER — the §4 chain's acts, on the work surface
 * (delivery MASTER §4; card CARD-2026-08-19-warehouse-handover-chain).
 *
 *   Ready for Handover → Handed Over → Received by Logistics
 *
 * The DO object page renders these facts read-only; THIS block is where the
 * acts live, because the Delivery page is where delivery work happens. One
 * obvious button at a time — the next fact in the chain, never a menu:
 *
 *   · `Mark ready for handover` — goods picked, checked, packed. NOT handover.
 *   · `Record handover` — the physical handover: the actual receiver and the
 *     proof are REQUIRED (§4: signature/photo/reply proof); vehicle when known.
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

const ALLOWED_MIMES = ["image/jpeg", "image/png", "image/webp"] as const;
const MAX_SIZE = 10 * 1024 * 1024;

export default function WarehouseHandoverBlock({
  doNumber,
  logisticsName,
}: {
  doNumber: string;
  logisticsName: string | null;
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

  // ── Record handover form state ─────────────────────────────────────────────
  const [receiver, setReceiver] = useState("");
  const [vehicle, setVehicle] = useState("");
  const [proofPath, setProofPath] = useState<string | null>(null);
  const [uploadBusy, setUploadBusy] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  // ── Confirm receipt form state (logistics' OWN count) ─────────────────────
  const [receiptQty, setReceiptQty] = useState<Record<string, string>>({});
  const [receiptNote, setReceiptNote] = useState("");

  if (!detailQ.data || !d) return null;
  // A cancelled document has no handover; a resulted trip's chain is history.
  const closed =
    Boolean(d.voided_at) || (detailQ.data.attempts ?? []).length > 0;

  const next: DeliveryHandoverKind | null = !byKind.has("ready_for_handover")
    ? "ready_for_handover"
    : !byKind.has("handed_over")
      ? "handed_over"
      : !byKind.has("received_by_logistics")
        ? "received_by_logistics"
        : null;

  const handedGoods = byKind.get("handed_over")?.goods ?? null;
  const receiptBase: HandoverGoodsLine[] =
    handedGoods && handedGoods.length > 0 ? handedGoods : tripGoods;

  async function uploadProof(e: React.ChangeEvent<HTMLInputElement>) {
    setUploadError(null);
    const file = e.target.files?.[0];
    if (!file || !d) return;
    if (!(ALLOWED_MIMES as readonly string[]).includes(file.type)) {
      setUploadError(`${file.name}: use a JPG, PNG or WEBP photo.`);
      return;
    }
    if (file.size > MAX_SIZE) {
      setUploadError(`${file.name} is too large (max 10 MB).`);
      return;
    }
    setUploadBusy(true);
    try {
      const sign = await apiFetch<{ token: string; path: string }>(
        `/api/operation/delivery-orders/${encodeURIComponent(d.id)}/handover-proof/sign-upload`,
        {
          method: "POST",
          body: JSON.stringify({ mimeType: file.type, sizeBytes: file.size }),
        },
      );
      const { error } = await supabase.storage
        .from("proof-of-delivery")
        .uploadToSignedUrl(sign.path, sign.token, file);
      if (error) throw error;
      setProofPath(sign.path);
    } catch (err) {
      setUploadError(
        err instanceof ApiError || err instanceof Error ? err.message : "Upload failed",
      );
    } finally {
      setUploadBusy(false);
      e.target.value = "";
    }
  }

  const recordFact = (input: Parameters<typeof record.mutate>[0], done: string) =>
    record.mutate(input, {
      onSuccess: () => {
        toast.success(done);
        setReceiver("");
        setVehicle("");
        setProofPath(null);
        setReceiptQty({});
        setReceiptNote("");
      },
      onError: (err) => toast.error(err.message),
    });

  return (
    <div className="px-4 py-3 border-t border-base-100" data-testid="handover-block">
      <div className="text-label uppercase tracking-[0.05em] text-base-500 mb-1.5">
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
                    ? ` — received by ${e.receiver_name}`
                    : ""}
                </span>
                {e && (
                  <span className="block text-label text-base-500">
                    {e.recorded_by_name || "Recorded"} · {fmtDate(e.recorded_at)}
                    {e.company ? ` · ${e.company}` : ""}
                  </span>
                )}
              </span>
            </li>
          );
        })}
      </ul>

      {closed ? null : next === "ready_for_handover" ? (
        <button
          type="button"
          data-testid="handover-mark-ready"
          className="btn-primary text-meta py-1.5 px-3"
          disabled={record.isPending}
          onClick={() =>
            recordFact({ kind: "ready_for_handover" }, "Ready for handover recorded")
          }
        >
          Mark ready for handover
        </button>
      ) : next === "handed_over" ? (
        <div className="flex flex-col gap-2" data-testid="handover-record-form">
          <label className="flex flex-col gap-0.5">
            <span className="text-label text-base-600">Received by (the actual person)</span>
            <input
              type="text"
              value={receiver}
              onChange={(e) => setReceiver(e.target.value)}
              className="h-8 rounded-md border border-base-300 px-2 text-body"
              placeholder={logisticsName ? `${logisticsName} staff name` : "Receiver name"}
            />
          </label>
          <label className="flex flex-col gap-0.5">
            <span className="text-label text-base-600">Vehicle (when known)</span>
            <input
              type="text"
              value={vehicle}
              onChange={(e) => setVehicle(e.target.value)}
              className="h-8 rounded-md border border-base-300 px-2 text-body"
              placeholder="Plate number"
            />
          </label>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-label text-base-600">Handover proof</span>
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={(e) => void uploadProof(e)}
              disabled={uploadBusy}
              aria-label="Handover proof"
              className="text-label"
            />
            {proofPath && (
              <span className="text-label text-success">Proof attached</span>
            )}
          </div>
          {uploadError && <p className="text-danger text-label">{uploadError}</p>}
          <div>
            <button
              type="button"
              data-testid="handover-record"
              className="btn-primary text-meta py-1.5 px-3"
              disabled={
                record.isPending || uploadBusy || !receiver.trim() || !proofPath
              }
              onClick={() =>
                recordFact(
                  {
                    kind: "handed_over",
                    receiverName: receiver.trim(),
                    ...(vehicle.trim() ? { vehicle: vehicle.trim() } : {}),
                    ...(proofPath ? { proofPath } : {}),
                  },
                  `Handed over to ${logisticsName ?? "logistics"}`,
                )
              }
            >
              Record handover
            </button>
            {(!receiver.trim() || !proofPath) && (
              <p className="text-label text-base-500 mt-1">
                Name the person who received the goods and attach the proof first.
              </p>
            )}
          </div>
        </div>
      ) : next === "received_by_logistics" ? (
        <div className="flex flex-col gap-2" data-testid="handover-receipt-form">
          <span className="text-label text-base-600">
            Logistics&rsquo; own count — correct any quantity that differs; both
            counts stay on record.
          </span>
          <ul className="flex flex-col gap-1">
            {receiptBase.map((g) => (
              <li key={g.sku} className="flex items-center gap-2">
                <span className="min-w-0 flex-1 truncate font-mono text-label text-base-700">
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
            placeholder="Note (optional — say what differs and why)"
          />
          <div>
            <button
              type="button"
              data-testid="handover-confirm-receipt"
              className="btn-primary text-meta py-1.5 px-3"
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
                  "Received by logistics — out for delivery",
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

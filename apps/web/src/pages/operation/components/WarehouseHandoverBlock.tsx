import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import {
  deliveryGroupOf,
  type DeliveryHandoverKind,
  type HandoverGoodsLine,
} from "@carres/shared";
import { fmtDate } from "@/lib/fmt-date";
import {
  useDeliveryOrder,
  useRecordHandoverEvent,
  type DeliveryHandoverEventRow,
} from "@/lib/queries";
import { Modal } from "./Modal";

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
      /* The Warehouse act belongs to Outbound — this is a DOOR, not a form. */
      return (
        <Link
          to={outboundHref}
          data-testid="do-object-primary-action"
          className="btn-primary inline-flex h-7 items-center px-2.5 text-meta"
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
          className="btn-primary inline-flex h-7 items-center px-2.5 text-meta"
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

      {closed ? null : next === "handed_over" ? (
        <div data-testid="handover-outbound-door">
          <Link to={outboundHref} className="btn-primary inline-block text-meta py-1.5 px-3">
            Open Outbound
          </Link>
          <p className="text-label text-base-500 mt-1">
            Scan, check, pack and hand over the exact Units in Outbound.
          </p>
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

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { ApiError } from "@/lib/api";
import {
  useReceivePoLineMutation,
  type LogisticsPoListRow,
  type SupplierRow,
} from "@/lib/queries";
import DOFileUploadField from "../../../components/DOFileUploadField";
import { INPUT_CLS, Modal, ModalActions } from "./Modal";

/**
 * ReceivePOModal — per spec §18.4 F5 (rich receive-PO dialog).
 *
 * Mirrors `reference/proto/logistics-screens.jsx` `POReceiveDialog` (lines
 * 693-789):
 *   - Title: "Receive {po.id} · attach Supplier DO"
 *   - Intro: "Booking goods from {supplier} into {warehouse}. Tick or set the
 *     quantity for each SKU on this delivery — anything unreceived stays open
 *     on the PO."
 *   - Per-line table: checkbox + SKU name + ordered/already-received summary +
 *     pending qty + receive-now qty input
 *   - "Receive all pending" + "Clear" ghost buttons + Σ total footer
 *   - Required Supplier DO number input + optional receiving note textarea
 *   - Real DO file upload (PDF/JPG/PNG ≤ 10 MB) via DOFileUploadField, which
 *     hits POST /api/storage/dos/sign-upload and streams to the
 *     `delivery-orders` Supabase Storage bucket. The Phase-4-era
 *     "simulated DO PDF placeholder" was retired by Phase 4.5 Chunk 1
 *     Task 38 (spec §8.6 + §0.1).
 *   - Required "Goods inspected and DO signed by warehouse" checkbox
 *   - Primary CTA: "Mark received" (when all pending) / "Receive partial"
 *     (when only some) — disabled until DO# ≥ 3 chars + signed + total > 0
 *     + a real DO file path is captured from the upload field
 *
 * Wires to `POST /api/logistics/pos/:id/receive` per checked line — the
 * `useReceivePoLineMutation` operates per (sku, receivedQty) so we loop. Errors
 * mid-loop surface as a toast and stop the loop (the partial state is already
 * reflected on the server; the modal closes either way and the cache is
 * refetched on success).
 */
interface Props {
  po: LogisticsPoListRow;
  supplier: SupplierRow | undefined;
  warehouse: { id: string; name: string; address: string | null } | undefined;
  onClose: () => void;
}

function suggestDoNumber(): string {
  return "DO-" + (5200 + Math.floor(Math.random() * 800));
}

export default function ReceivePOModal({
  po,
  supplier,
  warehouse,
  onClose,
}: Props) {
  const lines = useMemo(() => po.purchase_order_lines ?? [], [po]);

  // Per-sku desired qty to receive on this DO. Default = pending qty.
  const [recv, setRecv] = useState<Record<string, number>>(() => {
    const o: Record<string, number> = {};
    for (const l of lines) {
      o[l.sku] = Math.max(0, Number(l.qty || 0) - Number(l.received_qty || 0));
    }
    return o;
  });
  const [doNumber, setDoNumber] = useState(suggestDoNumber);
  const [doNote, setDoNote] = useState("");
  const [signed, setSigned] = useState(false);
  // Task 38 — real DO file path captured from DOFileUploadField. The previous
  // "simulated" UI placeholder showed a hard-coded `.pdf · 184 KB` mock and
  // submitted nothing about the file. Now the field uploads to Supabase
  // Storage first; the canonical path comes back here and the receive
  // mutation can be flipped to the v3 RPC (logistics_receive_po_with_do)
  // by a follow-up task without touching the UI again.
  const [doFilePath, setDoFilePath] = useState<string | null>(null);

  const receive = useReceivePoLineMutation(po.id);

  const totalReceiving = Object.values(recv).reduce((s, n) => s + (n || 0), 0);
  const totalPending = lines.reduce(
    (s, l) => s + Math.max(0, Number(l.qty || 0) - Number(l.received_qty || 0)),
    0,
  );
  const valid =
    doNumber.trim().length >= 3 &&
    signed &&
    totalReceiving > 0 &&
    !!doFilePath &&
    !receive.isPending;

  function setLine(sku: string, val: number, max: number) {
    setRecv((prev) => ({ ...prev, [sku]: Math.max(0, Math.min(max, val)) }));
  }
  function receiveAllPending() {
    const o: Record<string, number> = {};
    for (const l of lines) {
      o[l.sku] = Math.max(0, Number(l.qty || 0) - Number(l.received_qty || 0));
    }
    setRecv(o);
  }
  function clearAll() {
    setRecv(Object.fromEntries(lines.map((l) => [l.sku, 0])));
  }

  async function submit() {
    if (!valid) return;
    try {
      // The mutation hook accepts one (sku, receivedQty) per call; loop over
      // ticked lines. Server is idempotent per receive_po_line RPC — partial
      // success state still ends up reflected. Errors mid-loop surface a
      // toast and stop further calls.
      const ticked = lines
        .map((l) => ({ sku: l.sku, qty: recv[l.sku] || 0 }))
        .filter((x) => x.qty > 0);
      for (const { sku, qty } of ticked) {
        await receive.mutateAsync({ sku, receivedQty: qty });
      }
      const allReceived = totalReceiving === totalPending;
      toast.success(
        allReceived
          ? `${po.id} received · DO ${doNumber.trim()} · ${totalReceiving} unit${totalReceiving === 1 ? "" : "s"}`
          : `${po.id} partial · DO ${doNumber.trim()} · ${totalReceiving} unit${totalReceiving === 1 ? "" : "s"} booked`,
      );
      onClose();
    } catch (e: unknown) {
      if (e instanceof ApiError) toast.error(e.message || "Receive failed");
      else toast.error(e instanceof Error ? e.message : "Receive failed");
    }
  }

  return (
    <Modal
      title={`Receive ${po.id} · attach Supplier DO`}
      onClose={onClose}
      size="lg"
    >
      <div className="text-[12px] text-base-600 mb-3.5 font-body">
        Booking goods from <strong>{supplier?.name ?? "supplier"}</strong> into{" "}
        <strong>{warehouse?.name ?? "warehouse"}</strong>. Tick or set the
        quantity for each SKU on this delivery — anything unreceived stays open
        on the PO.
      </div>

      {/* Per-line receive grid */}
      <div className="card p-0 mb-3.5" data-testid="receive-po-lines-table">
        <div
          className="grid items-center gap-2 px-3.5 py-2.5 bg-base-50 border-b border-base-100"
          style={{ gridTemplateColumns: "32px 1fr 80px 90px" }}
        >
          <div></div>
          <div className="label">SKU</div>
          <div className="label text-right">Pending</div>
          <div className="label text-right">Receive now</div>
        </div>
        {lines.map((l) => {
          const pending = Math.max(
            0,
            Number(l.qty || 0) - Number(l.received_qty || 0),
          );
          const checked = (recv[l.sku] || 0) > 0;
          const disabled = pending === 0;
          return (
            <label
              key={l.sku}
              className={`grid items-center gap-2 px-3.5 py-2.5 border-t border-base-100 ${disabled ? "opacity-50" : "cursor-pointer"}`}
              style={{ gridTemplateColumns: "32px 1fr 80px 90px" }}
            >
              <input
                type="checkbox"
                checked={checked}
                disabled={disabled}
                onChange={(e) =>
                  setLine(l.sku, e.target.checked ? pending : 0, pending)
                }
                className="accent-primary"
                aria-label={`Tick ${l.sku} to receive`}
              />
              <div>
                <div className="text-[12px] font-body">{l.sku}</div>
                <div className="font-mono text-[10px] text-base-500 mt-0.5">
                  Ordered {l.qty} · already received {l.received_qty}
                </div>
              </div>
              <div className="font-mono text-[12px] text-right font-semibold">
                {pending}
              </div>
              <input
                type="number"
                min={0}
                max={pending}
                value={recv[l.sku] || 0}
                disabled={disabled}
                onChange={(e) =>
                  setLine(l.sku, parseInt(e.target.value, 10) || 0, pending)
                }
                aria-label={`Receive qty for ${l.sku}`}
                className="px-2 py-1.5 border border-base-300 rounded-[4px] text-[12px] text-right bg-white outline-none focus:border-base-500"
              />
            </label>
          );
        })}
        <div className="flex justify-between items-center px-3.5 py-2 bg-base-50 border-t border-base-100">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={receiveAllPending}
              className="btn-ghost text-[11px] py-0.5 px-2"
            >
              Receive all pending
            </button>
            <button
              type="button"
              onClick={clearAll}
              className="btn-ghost text-[11px] py-0.5 px-2"
            >
              Clear
            </button>
          </div>
          <div className="font-mono text-[11px] font-semibold">
            Σ {totalReceiving} unit{totalReceiving === 1 ? "" : "s"} this DO
          </div>
        </div>
      </div>

      <div className="grid gap-3 mb-4">
        <div>
          <label className="label mb-1.5 block" htmlFor="receive-do-number">
            Supplier DO number *
          </label>
          <input
            id="receive-do-number"
            value={doNumber}
            onChange={(e) => setDoNumber(e.target.value)}
            className={INPUT_CLS}
          />
          <div className="text-[10px] text-base-500 mt-1 font-body">
            From the signed delivery order accompanying the goods.
          </div>
        </div>
        <div>
          <label className="label mb-1.5 block" htmlFor="receive-do-note">
            Receiving note (optional)
          </label>
          <textarea
            id="receive-do-note"
            rows={2}
            value={doNote}
            onChange={(e) => setDoNote(e.target.value)}
            placeholder="e.g. 2 cartons short · damage to packaging on unit 4"
            className={`${INPUT_CLS} resize-y`}
          />
        </div>
        <div className="px-3 py-2.5 border border-dashed border-base-300 rounded-[4px] bg-white">
          <div className="text-[11px] text-base-600 mb-2 font-body">
            Attach signed DO file{" "}
            <span className="text-base-400">(PDF/JPG/PNG · ≤10 MB)</span>
          </div>
          <DOFileUploadField
            poId={po.id}
            doNumber={doNumber}
            onUploaded={(path) => setDoFilePath(path)}
          />
        </div>
        <label className="flex gap-2 items-center px-3 py-2.5 border border-dashed border-base-300 rounded-[4px] cursor-pointer">
          <input
            type="checkbox"
            checked={signed}
            onChange={(e) => setSigned(e.target.checked)}
            className="accent-primary"
          />
          <span className="text-[12px] font-body">
            Goods inspected and DO signed by warehouse
          </span>
        </label>
      </div>

      <ModalActions
        onCancel={onClose}
        onPrimary={submit}
        primary={
          totalReceiving === totalPending ? "Mark received" : "Receive partial"
        }
        primaryDisabled={!valid}
        primaryPending={receive.isPending}
      />
    </Modal>
  );
}

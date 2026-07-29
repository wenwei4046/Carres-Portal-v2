import { useMemo, useState } from "react";
import { toast } from "sonner";
import { ApiError } from "@/lib/api";
import { useReceivePoAsPartnerMutation } from "@/lib/queries";
import DOFileUploadField from "../../../components/DOFileUploadField";
import { INPUT_CLS, Modal, ModalActions } from "../../operation/components/Modal";

/**
 * PartnerReceiveAtWhModal — Loo 2026-05-11.
 *
 * Replaces the simple "Arrived at WH" button on the Partner factory pickup
 * kanban with a full receive-with-DO flow. Submitting flips the PO atomically
 * to status='received' (sup_status='delivered') — operation no longer needs
 * a separate Receive step.
 *
 * Forked from `ReceivePOModal` because:
 *   - The partner's row shape (`PickupRow`) differs from `operationPoListRow`
 *     (no top-level `purchase_order_lines`; lines come back aliased as `lines`)
 *   - The mutation hook + API endpoint differ (/api/partner/pickups/:id/receive
 *     vs /api/operation/pos/:id/receive — different auth gate, different cache
 *     invalidation)
 *   - Title + intro reflect the partner-driver POV ("you're delivering goods
 *     to the warehouse") instead of warehouse-staff POV ("you're booking goods
 *     into the warehouse")
 *
 * Same per-line / DO upload / signed-checkbox UX as the operation modal so
 * a partner who's used the warehouse-side flow has zero re-learning.
 */
type PickupLine = {
  id: string;
  sku: string;
  qty: number;
  received_qty?: number | null;
  attrs: Record<string, unknown> | null;
};

interface Props {
  po: {
    id: string;
    lines: PickupLine[];
    suppliers: { name: string; contact: string | null } | null;
    warehouses: { name: string; address: string | null } | null;
  };
  onClose: () => void;
}

function suggestDoNumber(): string {
  return "DO-" + (5200 + Math.floor(Math.random() * 800));
}

export default function PartnerReceiveAtWhModal({ po, onClose }: Props) {
  const lines = useMemo(() => po.lines ?? [], [po]);

  const [recv, setRecv] = useState<Record<string, number>>(() => {
    const o: Record<string, number> = {};
    for (const l of lines) {
      o[l.id] = Math.max(0, Number(l.qty || 0) - Number(l.received_qty || 0));
    }
    return o;
  });
  const [doNumber, setDoNumber] = useState(suggestDoNumber);
  const [doNote, setDoNote] = useState("");
  const [signed, setSigned] = useState(false);
  const [doFilePath, setDoFilePath] = useState<string | null>(null);

  const receive = useReceivePoAsPartnerMutation(po.id);

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

  function setLine(id: string, val: number, max: number) {
    setRecv((prev) => ({ ...prev, [id]: Math.max(0, Math.min(max, val)) }));
  }
  function receiveAllPending() {
    const o: Record<string, number> = {};
    for (const l of lines) {
      o[l.id] = Math.max(0, Number(l.qty || 0) - Number(l.received_qty || 0));
    }
    setRecv(o);
  }
  function clearAll() {
    setRecv(Object.fromEntries(lines.map((l) => [l.id, 0])));
  }

  async function submit() {
    if (!valid || !doFilePath) return;
    try {
      const tickedLines = lines
        .map((l) => ({
          id: l.id,
          receivedQty: Number(l.received_qty || 0) + (recv[l.id] || 0),
          delta: recv[l.id] || 0,
        }))
        .filter((x) => x.delta > 0)
        .map(({ id, receivedQty }) => ({ id, receivedQty }));
      await receive.mutateAsync({
        doNumber: doNumber.trim(),
        doFilePath,
        lines: tickedLines,
      });
      const allReceived = totalReceiving === totalPending;
      toast.success(
        allReceived
          ? `${po.id} delivered + received · DO ${doNumber.trim()} · ${totalReceiving} unit${totalReceiving === 1 ? "" : "s"}`
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
      title={`Mark arrived at WH · ${po.id} · attach DO`}
      onClose={onClose}
      size="lg"
    >
      <div className="text-meta text-base-600 mb-3.5 font-body">
        You&rsquo;re delivering{" "}
        <strong>{po.suppliers?.name ?? "supplier"}</strong>&rsquo;s goods to{" "}
        <strong>{po.warehouses?.name ?? "warehouse"}</strong>. Upload the signed
        DO and tick received qty per SKU. The PO flips straight to{" "}
        <strong>received</strong> when you submit — operation doesn&rsquo;t
        need to re-confirm.
      </div>

      <div className="card p-0 mb-3.5" data-testid="partner-receive-lines-table">
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
          const checked = (recv[l.id] || 0) > 0;
          const disabled = pending === 0;
          const attrs = l.attrs as Record<string, unknown> | null | undefined;
          const variantBits: string[] = [];
          if (attrs) {
            if (typeof attrs.color === "string") variantBits.push(attrs.color);
            if (typeof attrs.gap === "string") variantBits.push(attrs.gap);
            if (typeof attrs.fabric_name === "string") variantBits.push(attrs.fabric_name);
          }
          const variantLabel = variantBits.length > 0 ? variantBits.join(" · ") : null;
          return (
            <label
              key={l.id}
              className={`grid items-center gap-2 px-3.5 py-2.5 border-t border-base-100 ${disabled ? "opacity-50" : "cursor-pointer"}`}
              style={{ gridTemplateColumns: "32px 1fr 80px 90px" }}
            >
              <input
                type="checkbox"
                checked={checked}
                disabled={disabled}
                onChange={(e) =>
                  setLine(l.id, e.target.checked ? pending : 0, pending)
                }
                className="accent-primary"
                aria-label={`Tick ${l.sku} to receive`}
              />
              <div>
                <div className="text-meta font-body">{l.sku}</div>
                {variantLabel && (
                  <div className="text-label text-base-700 font-body">
                    {variantLabel}
                  </div>
                )}
                <div className="font-mono text-label text-base-500 mt-0.5">
                  Ordered {l.qty} · already received {l.received_qty ?? 0}
                </div>
              </div>
              <div className="font-mono text-meta text-right font-semibold">
                {pending}
              </div>
              <input
                type="number"
                min={0}
                max={pending}
                value={recv[l.id] || 0}
                disabled={disabled}
                onChange={(e) =>
                  setLine(l.id, parseInt(e.target.value, 10) || 0, pending)
                }
                aria-label={`Receive qty for ${l.sku}`}
                className="px-2 py-1.5 border border-base-300 rounded-[4px] text-meta text-right bg-white outline-none focus:border-base-500"
              />
            </label>
          );
        })}
        <div className="flex justify-between items-center px-3.5 py-2 bg-base-50 border-t border-base-100">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={receiveAllPending}
              className="btn-ghost text-label py-0.5 px-2"
            >
              Receive all pending
            </button>
            <button
              type="button"
              onClick={clearAll}
              className="btn-ghost text-label py-0.5 px-2"
            >
              Clear
            </button>
          </div>
          <div className="font-mono text-label font-semibold">
            Σ {totalReceiving} unit{totalReceiving === 1 ? "" : "s"} this DO
          </div>
        </div>
      </div>

      <div className="grid gap-3 mb-4">
        <div>
          <label className="label mb-1.5 block" htmlFor="partner-do-number">
            Supplier DO number *
          </label>
          <input
            id="partner-do-number"
            value={doNumber}
            onChange={(e) => setDoNumber(e.target.value)}
            className={INPUT_CLS}
          />
          <div className="text-label text-base-500 mt-1 font-body">
            From the signed delivery order accompanying the goods.
          </div>
        </div>
        <div>
          <label className="label mb-1.5 block" htmlFor="partner-do-note">
            Receiving note (optional)
          </label>
          <textarea
            id="partner-do-note"
            rows={2}
            value={doNote}
            onChange={(e) => setDoNote(e.target.value)}
            placeholder="e.g. 2 cartons short · damage to packaging on unit 4"
            className={`${INPUT_CLS} resize-y`}
          />
        </div>
        <div className="px-3 py-2.5 border border-dashed border-base-300 rounded-[4px] bg-white">
          <div className="text-label text-base-600 mb-2 font-body">
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
          <span className="text-meta font-body">
            Goods delivered + DO signed by warehouse staff
          </span>
        </label>
      </div>

      <ModalActions
        onCancel={onClose}
        onPrimary={submit}
        primary={
          totalReceiving === totalPending ? "Submit & receive" : "Submit partial"
        }
        primaryDisabled={!valid}
        primaryPending={receive.isPending}
      />
    </Modal>
  );
}

import { useState } from "react";
import { toast } from "sonner";
import { usePartnerPickupBatch } from "@/lib/queries";

/**
 * PickupBatchDialog — Task 11 (2026-05-15) of the Supplier Per-Thread Readiness plan.
 *
 * Partner-side modal that wraps `partner_pickup_threads`. One pickup trip =
 * one `po_pickup_events` row covering N supplier-ready threads on a single
 * factory_pickup PO.
 *
 * 2026-05-16 (migration 0117 + Loo screenshot) — DO# auto-generated server-side
 * as `DO-{poId}-{seq}`. Partner doesn't issue the DO so they shouldn't type
 * the number; the legacy supplier paper-DO flow doesn't apply in a single
 * digital workflow. Modal is now a one-click confirmation with an optional
 * note. Future polish can add a receipt-photo upload but isn't required.
 */
export default function PickupBatchDialog({
  poId,
  selectedThreadIds,
  onClose,
}: {
  poId: string;
  selectedThreadIds: string[];
  onClose: () => void;
}) {
  const [doNote, setDoNote] = useState("");
  const pickup = usePartnerPickupBatch();

  async function handleSubmit() {
    try {
      const res = await pickup.mutateAsync({
        poId,
        threadIds: selectedThreadIds,
        doNote: doNote.trim() || undefined,
      });
      const doStr = (res as { do_number?: string })?.do_number ?? "DO";
      toast.success(
        `Picked up ${res.thread_count} thread(s) · ${doStr}`,
      );
      onClose();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Pickup failed";
      toast.error(`Pickup failed: ${msg}`);
    }
  }

  return (
    <div
      className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Pickup threads"
    >
      <div className="bg-card border border-base-200 rounded-md p-6 max-w-md w-full space-y-4">
        <div>
          <h2 className="font-display text-title leading-tight">
            Pickup {selectedThreadIds.length} thread(s)
          </h2>
          <p className="text-meta text-base-500 font-mono mt-0.5">
            PO {poId}
          </p>
          <p className="text-label text-base-500 mt-2">
            Carres will auto-generate the DO number for this pickup. Click
            Pickup to confirm — no need to enter a number.
          </p>
        </div>

        <div>
          <label
            htmlFor="pickup-do-note"
            className="block text-label uppercase tracking-[0.06em] text-base-500 mb-1"
          >
            Note (optional)
          </label>
          <textarea
            id="pickup-do-note"
            value={doNote}
            onChange={(e) => setDoNote(e.target.value)}
            placeholder="e.g. driver name, plate, condition"
            className="w-full border border-base-300 rounded px-3 py-2 text-body h-20 bg-white outline-none focus:border-primary resize-y"
          />
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-body border border-base-300 rounded bg-white text-base-700"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={selectedThreadIds.length === 0 || pickup.isPending}
            onClick={handleSubmit}
            className="px-4 py-2 text-body bg-primary text-primary-foreground rounded disabled:opacity-50"
            data-testid="pickup-batch-submit"
          >
            {pickup.isPending ? "Submitting…" : "Pickup"}
          </button>
        </div>
      </div>
    </div>
  );
}

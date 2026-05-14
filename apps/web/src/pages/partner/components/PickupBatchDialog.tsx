import { useState } from "react";
import { toast } from "sonner";
import { usePartnerPickupBatch } from "@/lib/queries";
import DOFileUploadField from "@/components/DOFileUploadField";

/**
 * PickupBatchDialog — Task 11 (2026-05-15) of the Supplier Per-Thread Readiness plan.
 *
 * Partner-side modal that wraps `partner_pickup_threads` (migration 0107).
 * One DO paper = one physical trip = one `po_pickup_events` row covering N
 * supplier-ready threads on a single factory_pickup PO. Caller supplies:
 *
 *   - poId           — the PO whose threads are being picked up
 *   - selectedThreadIds — at least one thread, all in supplier_ready state
 *                         with no prior pickup_event_id (RPC re-validates)
 *   - onClose        — invoked after a successful submit OR Cancel
 *
 * UX gates the Submit button on the same triple the partner-side POD upload
 * dialog uses: DO# ≥ 3 chars, signed checkbox ticked, and a `doFilePath` from
 * `DOFileUploadField` (which streams to the `delivery-orders` Storage bucket
 * via the existing `/api/storage/dos/sign-upload` endpoint).
 *
 * Note on `DOFileUploadField` props: the real component takes
 * `{ poId, doNumber, onUploaded }` — different from the placeholder shape
 * in the plan doc (`{ bucket, signUploadUrl, signUploadBody, onChange }`).
 * The component is reused as-is to keep the Storage RLS / signed-URL flow
 * consistent with every other DO upload site in the app.
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
  const [doNumber, setDoNumber] = useState("");
  const [doNote, setDoNote] = useState("");
  const [signed, setSigned] = useState(false);
  const [doFilePath, setDoFilePath] = useState<string | null>(null);
  const pickup = usePartnerPickupBatch();

  const doNumberOk = doNumber.trim().length >= 3;
  const canSubmit =
    doNumberOk && signed && !!doFilePath && selectedThreadIds.length > 0;

  async function handleSubmit() {
    try {
      const res = await pickup.mutateAsync({
        poId,
        threadIds: selectedThreadIds,
        doNumber: doNumber.trim(),
        doFilePath: doFilePath!,
        doNote: doNote.trim() || undefined,
      });
      toast.success(
        `Picked up ${res.thread_count} thread(s) · DO ${doNumber.trim()}`,
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
          <h2 className="font-display text-[22px] leading-tight">
            Pickup {selectedThreadIds.length} thread(s)
          </h2>
          <p className="text-[12px] text-base-500 font-mono mt-0.5">
            PO {poId}
          </p>
        </div>

        <div>
          <label
            htmlFor="pickup-do-number"
            className="block text-[10px] uppercase tracking-[0.06em] text-base-500 mb-1"
          >
            DO number *
          </label>
          <input
            id="pickup-do-number"
            type="text"
            value={doNumber}
            onChange={(e) => setDoNumber(e.target.value)}
            className="w-full border border-base-300 rounded px-3 py-2 text-sm bg-white outline-none focus:border-primary"
            placeholder="e.g. DO-PO9999-A"
          />
          {!doNumberOk && doNumber.length > 0 && (
            <p className="text-[10px] text-destructive mt-1">
              Min 3 characters
            </p>
          )}
        </div>

        {doNumberOk && (
          <div className="px-3 py-2.5 border border-dashed border-base-300 rounded-[4px] bg-white">
            <div className="text-[11px] text-base-600 mb-2 font-body">
              Attach signed DO file{" "}
              <span className="text-base-400">(PDF/JPG/PNG · ≤10 MB)</span>
            </div>
            <DOFileUploadField
              poId={poId}
              doNumber={doNumber.trim()}
              onUploaded={setDoFilePath}
            />
          </div>
        )}

        <div>
          <label
            htmlFor="pickup-do-note"
            className="block text-[10px] uppercase tracking-[0.06em] text-base-500 mb-1"
          >
            Note (optional)
          </label>
          <textarea
            id="pickup-do-note"
            value={doNote}
            onChange={(e) => setDoNote(e.target.value)}
            className="w-full border border-base-300 rounded px-3 py-2 text-sm h-20 bg-white outline-none focus:border-primary resize-y"
          />
        </div>

        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={signed}
            onChange={(e) => setSigned(e.target.checked)}
            className="accent-primary"
            aria-label="Signed receipt confirmed"
          />
          <span className="text-sm font-body">Signed receipt confirmed</span>
        </label>

        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm border border-base-300 rounded bg-white text-base-700"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!canSubmit || pickup.isPending}
            onClick={handleSubmit}
            className="px-4 py-2 text-sm bg-primary text-primary-foreground rounded disabled:opacity-50"
            data-testid="pickup-batch-submit"
          >
            {pickup.isPending ? "Submitting…" : "Pickup"}
          </button>
        </div>
      </div>
    </div>
  );
}

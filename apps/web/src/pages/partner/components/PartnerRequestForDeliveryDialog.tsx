import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "../../../lib/api";
import { qk } from "../../../lib/queries";

/**
 * PartnerRequestForDeliveryDialog — LP-side Accept / Reject for an RFD-pending
 * pickup. Replaces the Task 26 stub.
 *
 * Wired against Task 27 endpoints:
 *   - POST /api/partner/pickups/:po/accept-rfd  (optional confirm_delivery_date)
 *   - POST /api/partner/pickups/:po/reject-rfd  (no body fields per C1.9 — the
 *     RPC writes the audit_log entry without a free-text reason)
 *
 * Visual conventions:
 *   - Modal panel uses `bg-card` (HSL 40 53% 97% — Loo's three-layer cream
 *     intentional offset from proto white). See Modal.tsx for the canonical
 *     overlay/panel pattern; this dialog is intentionally simpler because the
 *     Partner pages don't share the logistics Modal primitive yet.
 *   - Raw HTML inputs styled with warm-linen Tailwind tokens (no shadcn).
 */
export default function PartnerRequestForDeliveryDialog({
  poId,
  onClose,
}: {
  poId: string;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [date, setDate] = useState("");
  const [error, setError] = useState<string | null>(null);

  const accept = useMutation({
    mutationFn: async () => {
      const body = date ? { confirm_delivery_date: date } : {};
      return apiFetch(`/api/partner/pickups/${poId}/accept-rfd`, {
        method: "POST",
        body: JSON.stringify(body),
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.partner.pickups() });
      qc.invalidateQueries({ queryKey: qk.partner.dashboard() });
      onClose();
    },
    onError: (e: Error) => setError(e.message),
  });

  const reject = useMutation({
    mutationFn: () =>
      apiFetch(`/api/partner/pickups/${poId}/reject-rfd`, {
        method: "POST",
        body: JSON.stringify({}), // no reason per C1.9 — audit_log captures intent
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.partner.pickups() });
      onClose();
    },
    onError: (e: Error) => setError(e.message),
  });

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-card rounded-lg p-6 max-w-md w-full">
        <h2 className="text-lg font-semibold mb-4">Request for Delivery — {poId}</h2>
        <div className="mb-4">
          <label htmlFor="confirmDate" className="block text-sm font-medium mb-1">
            Confirm delivery date
          </label>
          <input
            id="confirmDate"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="w-full border border-base-200 rounded px-3 py-2 text-sm"
          />
        </div>
        {error && <p className="text-red-600 text-sm mb-2">{error}</p>}
        <div className="flex gap-2 justify-end">
          <button onClick={onClose} className="px-4 py-2 border border-base-200 rounded">Cancel</button>
          <button
            onClick={() => reject.mutate()}
            disabled={reject.isPending}
            className="px-4 py-2 bg-red-600 text-white rounded disabled:opacity-50"
          >
            Reject
          </button>
          <button
            onClick={() => accept.mutate()}
            disabled={accept.isPending}
            className="px-4 py-2 bg-accent text-white rounded disabled:opacity-50"
          >
            Accept
          </button>
        </div>
      </div>
    </div>
  );
}

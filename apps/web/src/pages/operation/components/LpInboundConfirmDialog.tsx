import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "../../../lib/api";
import { qk } from "../../../lib/queries";

/**
 * LpInboundConfirmDialog — operation-side 代按 (proxy) for Ohana Sofa
 * pre-flight inbound confirmation. Mirrors the Sofa SOP v2 (sops.ts):
 * supplier marks PO `ready_confirm_sent`, and operation-Procurement (LP)
 * stands in for the customer to either Accept the inbound delivery or
 * Reject (which in Task 31 will branch to a Relocate-warehouse dialog).
 *
 * Wired against:
 *   - POST /api/operation/pos/:id/lp-accept-inbound  (Task 29 — landed)
 *   - POST /api/operation/pos/:id/lp-reject-inbound  (Task 31 — pending)
 *
 * Per C1.9: no free-text reason field — the RPC writes the audit_log entry
 * automatically. Matches PartnerRequestForDeliveryDialog (Task 28) pattern.
 *
 * Visual conventions:
 *   - Modal panel uses `bg-card` (HSL 40 53% 97% — Loo's three-layer cream
 *     intentional offset from proto white).
 *   - Raw HTML buttons styled with warm-linen Tailwind tokens (no shadcn).
 *
 * Cache invalidation uses `qk.operation.pos()` so the procurement list and
 * any nested PO caches (`reservedDrilldown`, `awaitingStockShortage`) all
 * refresh on success.
 */
export default function LpInboundConfirmDialog({
  poId,
  onClose,
}: {
  poId: string;
  onClose: () => void;
}) {
  const qc = useQueryClient();

  const accept = useMutation({
    mutationFn: () =>
      apiFetch(`/api/operation/pos/${poId}/lp-accept-inbound`, {
        method: "POST",
        body: JSON.stringify({}),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.operation.pos() });
      qc.invalidateQueries({ queryKey: qk.operation.dashboard() });
      onClose();
    },
  });

  const reject = useMutation({
    mutationFn: () =>
      apiFetch(`/api/operation/pos/${poId}/lp-reject-inbound`, {
        method: "POST",
        body: JSON.stringify({}),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.operation.pos() });
      qc.invalidateQueries({ queryKey: qk.operation.dashboard() });
      onClose();
    },
  });

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-card rounded-lg p-6 max-w-md w-full">
        <h2 className="text-lg font-semibold mb-4">LP Pre-flight — {poId}</h2>
        <p className="text-sm text-base-600 mb-4">
          Proxy LP confirm/reject for Ohana Sofa inbound delivery. Reason not stored (per C1.9).
        </p>
        <div className="flex gap-2 justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 border border-base-200 rounded"
          >
            Cancel
          </button>
          <button
            onClick={() => reject.mutate()}
            disabled={reject.isPending}
            className="px-4 py-2 bg-red-600 text-white rounded disabled:opacity-50"
          >
            Reject Receive
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

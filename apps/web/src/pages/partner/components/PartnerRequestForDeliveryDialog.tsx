import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "../../../lib/api";
import { qk } from "../../../lib/queries";

/**
 * PartnerRequestForDeliveryDialog — LP-side Accept / Reject for an RFD-pending
 * pickup. Replaces the Task 26 stub; rewired for Chunk 2 Sprint B threading
 * (migration 0051).
 *
 * Wired against:
 *   - POST /api/partner/pickups/accept-rfd  body: { threadId }
 *   - POST /api/partner/pickups/reject-rfd  body: { threadId }
 *     (No reason field per C1.9 — audit_log captures intent. Schema accepts
 *     optional `reason` (max 500) for future expansion if Loo reverses C1.9.)
 *
 * Pivoted in Chunk 2 Sprint B from PO-scoped (`:po` path param + optional
 * snake_case `confirm_delivery_date`) to thread-scoped (no path param +
 * camelCase body with `threadId`). Customer-leg state (request_for_delivery_at,
 * partner_accepted_at, partner_rejected_at) now lives on
 * `order_supplier_threads`, not `purchase_orders`.
 *
 * The accept-rfd RPC takes `threadId` only — there is no longer a
 * partner-supplied confirm-delivery-date on the accept path. operation sets
 * the date on the RFD origin (DispatchPartnerDialog), not the partner reply.
 *
 * Props:
 *   - threadId: required, the supplier thread to accept/reject the RFD for.
 *   - poLabel: optional display-only string for the title (e.g. "PO-001").
 *     Falls back to the first 8 chars of threadId when omitted.
 *
 * Visual conventions:
 *   - Modal panel uses `bg-card` (HSL 40 53% 97% — Loo's three-layer cream
 *     intentional offset from proto white). See Modal.tsx for the canonical
 *     overlay/panel pattern; this dialog is intentionally simpler because the
 *     Partner pages don't share the operation Modal primitive yet.
 *   - Raw HTML buttons styled with warm-linen Tailwind tokens (no shadcn).
 */
export default function PartnerRequestForDeliveryDialog({
  threadId,
  poLabel,
  onClose,
}: {
  threadId: string;
  poLabel?: string;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [error, setError] = useState<string | null>(null);

  const accept = useMutation({
    mutationFn: () =>
      apiFetch("/api/partner/pickups/accept-rfd", {
        method: "POST",
        body: JSON.stringify({ threadId }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.partner.pickups() });
      qc.invalidateQueries({ queryKey: qk.partner.dashboard() });
      onClose();
    },
    onError: (e: Error) => setError(e.message),
  });

  const reject = useMutation({
    mutationFn: () =>
      apiFetch("/api/partner/pickups/reject-rfd", {
        method: "POST",
        body: JSON.stringify({ threadId }), // no reason per C1.9 — audit_log captures intent
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
        <h2 className="text-lg font-semibold mb-4">
          Request for Delivery — {poLabel ?? threadId.slice(0, 8)}
        </h2>
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

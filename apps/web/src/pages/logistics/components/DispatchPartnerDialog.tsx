import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "../../../lib/api";
import { qk } from "../../../lib/queries";

/**
 * DispatchPartnerDialog — Phase 4.5 Chunk 1 (Task 34).
 *
 * Customer-leg dispatch surface. The logistics user picks a delivery partner,
 * sets the confirm-delivery-date, and chooses between two paths:
 *   - RFD (default): partner gets a "Request For Delivery" prompt, must accept
 *     before goods leave the warehouse. Default per Codex F8 (least surprise).
 *   - Force: skip the RFD round-trip, dispatch immediately. Used when the
 *     partner is already on-site / pre-arranged. Audit log records `mode=force`.
 *
 * Wired against:
 *   - GET  /api/logistics/partners                  — flat partner list
 *   - POST /api/logistics/pos/:id/dispatch-customer-leg
 *     body: { partner_id, confirm_delivery_date, force_dispatch }
 *
 * Visual conventions match `WarehouseRelocateDialog` (Task 32):
 *   - Modal panel uses `bg-card` (HSL 40 53% 97% — Loo's three-layer cream
 *     intentional offset from proto white).
 *   - Raw HTML radio + checkbox + buttons styled with warm-linen Tailwind
 *     tokens (no shadcn primitives).
 *
 * Cache invalidation uses `qk.logistics.pos()` so the procurement list and
 * `qk.logistics.dashboard()` so kanban counts both refresh once dispatch lands.
 *
 * Carry-forward: there's an existing `phase-4-warehouse-picker-dedupe` TODO
 * to consolidate sibling pickers (AssignPickupDialog, ReassignWarehouseDialog,
 * WarehouseRelocateDialog, this one). For Chunk 1 we mirror the simple
 * raw-HTML pattern of `WarehouseRelocateDialog` — the test fixture mocks
 * `apiFetch` directly and expects a flat array shape, not the composed
 * `DeliveryPartnersListResponse` envelope used by the M5 `useDeliveryPartners`
 * hook. The dedupe will reconcile both patterns post-Chunk 1.
 */
type Partner = { id: string; name: string };

export default function DispatchPartnerDialog({
  poId,
  onClose,
}: {
  poId: string;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [partnerId, setPartnerId] = useState<string | null>(null);
  const [date, setDate] = useState("");
  const [force, setForce] = useState(false);

  const { data: partners } = useQuery({
    queryKey: qk.logistics.partners(),
    queryFn: () => apiFetch<Partner[]>("/api/logistics/partners"),
  });

  const dispatch = useMutation({
    mutationFn: () =>
      apiFetch(`/api/logistics/pos/${poId}/dispatch-customer-leg`, {
        method: "POST",
        body: JSON.stringify({
          partner_id: partnerId!,
          confirm_delivery_date: date,
          force_dispatch: force,
        }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.logistics.pos() });
      qc.invalidateQueries({ queryKey: qk.logistics.dashboard() });
      onClose();
    },
  });

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-card rounded-lg p-6 max-w-md w-full">
        <h2 className="text-lg font-semibold mb-4">Dispatch — {poId}</h2>

        <div className="mb-3">
          <label className="block text-sm font-medium mb-1">Logistics Partner</label>
          <ul className="space-y-1">
            {(partners ?? []).map((p) => (
              <li key={p.id}>
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="lp"
                    checked={partnerId === p.id}
                    onChange={() => setPartnerId(p.id)}
                  />
                  {p.name}
                </label>
              </li>
            ))}
          </ul>
        </div>

        <div className="mb-3">
          <label htmlFor="cdd" className="block text-sm font-medium mb-1">
            Confirm delivery date
          </label>
          <input
            id="cdd"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="w-full border border-base-200 rounded px-3 py-2 text-sm"
          />
        </div>

        <div className="mb-4">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={force}
              onChange={(e) => setForce(e.target.checked)}
            />
            Force Dispatch (skip RFD)
          </label>
        </div>

        <div className="flex gap-2 justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 border border-base-200 rounded"
          >
            Cancel
          </button>
          <button
            onClick={() => dispatch.mutate()}
            disabled={!partnerId || !date || dispatch.isPending}
            className="px-4 py-2 bg-accent text-white rounded disabled:opacity-50"
          >
            {force ? "Force Dispatch" : "Send RFD / Dispatch"}
          </button>
        </div>
      </div>
    </div>
  );
}

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "../../../lib/api";
import { qk } from "../../../lib/queries";

/**
 * DispatchPartnerDialog — Phase 4.5 Chunk 1 (Task 34), rewired for Chunk 2
 * Sprint B threading (migration 0051).
 *
 * Customer-leg dispatch surface. The operation user picks a delivery partner,
 * sets the confirm-delivery-date, and chooses between two paths:
 *   - RFD (default): partner gets a "Request For Delivery" prompt, must accept
 *     before goods leave the warehouse. Default per Codex F8 (least surprise).
 *   - Force: skip the RFD round-trip, dispatch immediately. Used when the
 *     partner is already on-site / pre-arranged. Audit log records `mode=force`.
 *
 * Wired against:
 *   - GET  /api/operation/partners                  — flat partner list
 *   - POST /api/operation/pos/dispatch-customer-leg
 *     body: { threadId, partnerId, confirmDeliveryDate, forceDispatch }
 *
 * Pivoted in Chunk 2 Sprint B from PO-scoped (`:id` path param + snake_case
 * body) to thread-scoped (no path param + camelCase body with `threadId`).
 * Customer-leg state now lives on `order_supplier_threads`, not
 * `purchase_orders`.
 *
 * Props:
 *   - threadId: required, the supplier thread to dispatch.
 *   - poLabel: optional display-only string for the title (e.g. "PO-200").
 *     Falls back to the first 8 chars of threadId when omitted.
 *
 * Visual conventions match `WarehouseRelocateDialog` (Task 32):
 *   - Modal panel uses `bg-card` (HSL 40 53% 97% — Loo's three-layer cream
 *     intentional offset from proto white).
 *   - Raw HTML radio + checkbox + buttons styled with warm-linen Tailwind
 *     tokens (no shadcn primitives).
 *
 * Cache invalidation uses `qk.operation.pos()` so the procurement list and
 * `qk.operation.dashboard()` so kanban counts both refresh once dispatch lands.
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
  threadId,
  poLabel,
  onClose,
}: {
  threadId: string;
  poLabel?: string;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [partnerId, setPartnerId] = useState<string | null>(null);
  const [date, setDate] = useState("");
  const [force, setForce] = useState(false);

  const { data: partners } = useQuery({
    queryKey: qk.operation.partners(),
    queryFn: () => apiFetch<Partner[]>("/api/operation/partners"),
  });

  const dispatch = useMutation({
    mutationFn: () =>
      apiFetch("/api/operation/pos/dispatch-customer-leg", {
        method: "POST",
        body: JSON.stringify({
          threadId,
          partnerId: partnerId!,
          confirmDeliveryDate: date,
          forceDispatch: force,
        }),
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
        <h2 className="t-h3 mb-4">Dispatch — {poLabel ?? threadId.slice(0, 8)}</h2>

        <div className="mb-3">
          <label className="block text-sm font-medium mb-1">operation Partner</label>
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
          <button onClick={onClose} className="btn-secondary">
            Cancel
          </button>
          <button
            onClick={() => dispatch.mutate()}
            disabled={!partnerId || !date || dispatch.isPending}
            className="btn-primary"
          >
            {force ? "Force Dispatch" : "Send RFD / Dispatch"}
          </button>
        </div>
      </div>
    </div>
  );
}

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "../../../lib/api";
import { qk } from "../../../lib/queries";

/**
 * WarehouseRelocateDialog — Phase 4.5 Chunk 1 (Task 32).
 *
 * Sofa Reject path. Surfaces immediately after `LpInboundConfirmDialog`'s
 * Reject branch lands the PO in `customer_rejected` sup_status. Logistics
 * picks an alternate warehouse; the wrapped RPC `logistics_relocate_warehouse`
 * resets the inbound leg so the supplier (or partner) can re-route the goods.
 *
 * Wired against:
 *   - GET  /api/logistics/warehouse              — flat list for the picker
 *   - POST /api/logistics/pos/:id/relocate-inbound — { new_warehouse_id }
 *
 * Visual conventions match `LpInboundConfirmDialog` (Task 30):
 *   - Modal panel uses `bg-card` (HSL 40 53% 97% — Loo's three-layer cream
 *     intentional offset from proto white).
 *   - Raw HTML radio + buttons styled with warm-linen Tailwind tokens
 *     (no shadcn primitives).
 *
 * Cache invalidation uses `qk.logistics.pos()` so the procurement list and
 * any nested PO caches refresh once the relocate succeeds.
 *
 * Carry-forward: there's an existing `phase-4-warehouse-picker-dedupe` TODO
 * to consolidate the four sibling warehouse pickers (AssignPickupDialog,
 * ReassignWarehouseDialog, this one, and the M5 reassign-warehouse path).
 * For Chunk 1 we mirror the simple raw-HTML pattern of `LpInboundConfirmDialog`
 * rather than fold this into the more elaborate `Modal`+`useLogisticsWarehouse`
 * version — the test fixture mocks `apiFetch` directly and expects a flat
 * array shape, not the composed `WarehouseListResponse` envelope.
 */
type Warehouse = { id: string; name: string; kind: string };

export default function WarehouseRelocateDialog({
  poId,
  onClose,
}: {
  poId: string;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [selected, setSelected] = useState<string | null>(null);

  const { data: warehouses } = useQuery({
    queryKey: qk.logistics.warehouse(),
    queryFn: () => apiFetch<Warehouse[]>("/api/logistics/warehouse"),
  });

  const relocate = useMutation({
    mutationFn: () =>
      apiFetch(`/api/logistics/pos/${poId}/relocate-inbound`, {
        method: "POST",
        body: JSON.stringify({ new_warehouse_id: selected }),
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
        <h2 className="text-lg font-semibold mb-4">Relocate PO {poId}</h2>
        <ul className="space-y-2 mb-4">
          {(warehouses ?? []).map((wh) => (
            <li key={wh.id}>
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name="wh"
                  value={wh.id}
                  checked={selected === wh.id}
                  onChange={() => setSelected(wh.id)}
                />
                {wh.name}{" "}
                <span className="text-xs text-base-500">({wh.kind})</span>
              </label>
            </li>
          ))}
        </ul>
        <div className="flex gap-2 justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 border border-base-200 rounded"
          >
            Cancel
          </button>
          <button
            onClick={() => relocate.mutate()}
            disabled={!selected || relocate.isPending}
            className="px-4 py-2 bg-accent text-white rounded disabled:opacity-50"
          >
            Relocate
          </button>
        </div>
      </div>
    </div>
  );
}

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ApiError } from "@/lib/api";
import {
  useOperationWarehouse,
  useReassignPoWarehouseMutation,
  type operationPoListRow,
  type SupplierRow,
} from "@/lib/queries";
import { INPUT_CLS, Modal, ModalActions } from "./Modal";

/**
 * ReassignWarehouseDialog — F1.A customer-rejection flow (DEAD UI per Loo's
 * D3=A decision).
 *
 * Mirrors `reference/proto/operation-screens.jsx` `ReassignWarehouseDialog`
 * (lines 596-643). Resets a PO's destination warehouse after a customer
 * rejected the goods at the original WH. The supplier is notified, sup_status
 * resets to `ready_for_pickup`, and partner reassignment follows.
 *
 * IMPORTANT — DEAD UI:
 * Per Loo's Phase 4 D3=A decision: in MVP no PO can reach the
 * `reassign_needed` sup_status because that requires partner-side rejection
 * reporting (Phase 7). The modal renders + the mutation works end-to-end, but
 * the trigger to open it (a "Reassign warehouse" button) does NOT exist on the
 * procurement page — there are zero POs in `reassign_needed` state. This file
 * exists so Phase 7 can wire the button without rebuilding the dialog.
 *
 *   TODO phase-7-reassign-warehouse-wire — input state never fires until
 *   Phase 7 partner rejection ships. Build the trigger then.
 *
 * The component itself is fully functional and tested; only the page-level
 * action button is suppressed in M5.
 */
interface Props {
  po: operationPoListRow;
  supplier: SupplierRow | undefined;
  onClose: () => void;
}

export default function ReassignWarehouseDialog({
  po,
  supplier,
  onClose,
}: Props) {
  const warehousesQ = useOperationWarehouse();
  const allWarehouses = warehousesQ.data?.warehouses ?? [];
  // Eligible alternates: anything other than the current warehouse.
  const altWarehouses = allWarehouses.filter((w) => w.id !== po.warehouse_id);
  const currentWh = allWarehouses.find((w) => w.id === po.warehouse_id);

  const [newWhId, setNewWhId] = useState<string>("");
  useEffect(() => {
    if (!newWhId && altWarehouses.length > 0) setNewWhId(altWarehouses[0].id);
  }, [newWhId, altWarehouses]);

  const newWh = allWarehouses.find((w) => w.id === newWhId);
  const reassign = useReassignPoWarehouseMutation(po.id);

  const lines = po.purchase_order_lines ?? [];
  const totalUnits = lines.reduce((s, l) => s + Number(l.qty || 0), 0);
  const valid = !!newWhId && !reassign.isPending;

  async function submit() {
    if (!valid) return;
    try {
      await reassign.mutateAsync({ newWarehouseId: newWhId });
      toast.success(
        `${po.id} routed to ${newWh?.name ?? "warehouse"} · supplier notified`,
      );
      onClose();
    } catch (e: unknown) {
      if (e instanceof ApiError) toast.error(e.message || "Reassign failed");
      else toast.error(e instanceof Error ? e.message : "Reassign failed");
    }
  }

  return (
    <Modal title={`Reassign warehouse · ${po.id}`} onClose={onClose}>
      <div
        className="text-label px-3 py-2.5 rounded-[4px] mb-3.5 font-body"
        style={{
          color: "var(--brand-signature)",
          background: "rgba(217, 119, 87, 0.08)",
        }}
      >
        <strong className="block mb-1">Customer cannot receive</strong>
        Reason not specified
      </div>

      <div
        className="card mb-3.5 px-3.5 py-2.5"
        style={{ background: "var(--base-50)" }}
      >
        <div className="label mb-1.5">Goods staged at supplier</div>
        <div className="text-meta font-body">
          <strong>{supplier?.name ?? "Supplier"}</strong> · {totalUnits} unit
          {totalUnits === 1 ? "" : "s"}
        </div>
        <div className="font-mono text-label text-base-500 mt-1.5">
          {lines.map((l) => `${l.sku} ×${l.qty}`).join(" · ") || "—"}
        </div>
        <div className="text-meta mt-2 text-base-600 font-body">
          Originally bound for{" "}
          <strong className="text-base-900">
            {currentWh?.name ?? po.warehouse_id}
          </strong>
        </div>
      </div>

      <div className="label mb-1.5">New destination warehouse *</div>
      {warehousesQ.isLoading ? (
        <div className="text-meta text-base-500 mb-3.5">
          Loading warehouses…
        </div>
      ) : altWarehouses.length === 0 ? (
        <div className="text-meta text-warning mb-3.5">
          No alternate warehouse available.
        </div>
      ) : (
        <select
          value={newWhId}
          onChange={(e) => setNewWhId(e.target.value)}
          aria-label="New destination warehouse"
          className={`${INPUT_CLS} mb-3.5`}
        >
          {altWarehouses.map((w) => (
            <option key={w.id} value={w.id}>
              {w.name}
            </option>
          ))}
        </select>
      )}

      {newWh && (
        <div
          className="text-meta text-base-600 px-3 py-2.5 rounded-[4px] mb-3.5 font-body"
          style={{ background: "var(--base-50)" }}
        >
          <div>
            <strong>{newWh.name}</strong>
          </div>
          <div className="font-mono text-label mt-1">
            {newWh.address ?? "—"}
          </div>
          <div className="text-label text-base-500 mt-1.5">
            Supplier will be notified · status returns to{" "}
            <strong>Ready · awaiting partner</strong> · partner reassignment
            follows.
          </div>
        </div>
      )}

      <ModalActions
        onCancel={onClose}
        onPrimary={submit}
        primary="Reassign + notify supplier"
        primaryDisabled={!valid || altWarehouses.length === 0}
        primaryPending={reassign.isPending}
      />
    </Modal>
  );
}

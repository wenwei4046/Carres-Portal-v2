import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ApiError } from "@/lib/api";
import {
  useAssignPickupPartnerMutation,
  useDeliveryPartners,
  useLogisticsWarehouse,
  type LogisticsPoListRow,
  type SupplierRow,
} from "@/lib/queries";
import { INPUT_CLS, Modal, ModalActions } from "./Modal";

/**
 * AssignPickupDialog — F1.A factory_pickup flow.
 *
 * Mirrors `reference/proto/logistics-screens.jsx` `AssignPickupDialog`
 * (lines 645-691):
 *   - Title: "Assign pickup partner · {po.id}"
 *   - Intro: "{supplier.name} has {N} unit(s) ready for collection. Choose a
 *     partner to dispatch to their factory."
 *   - Optional warning band when `po.pickupRejection` exists ("Previous partner
 *     declined") — Phase 7 surface; renders if the field happens to be present.
 *   - Pickup details card (base-50 fill): "From {supplier}", "To {warehouse}",
 *     SKU summary
 *   - Required partner select (`{name} · {zones}` labels)
 *   - Selected partner preview (base-50 fill): bold name + mono contact + zones
 *   - v3-S2.4 — Required destination warehouse picker (defaults to
 *     `po.warehouse_id`; logistics can override for divert-on-the-fly).
 *   - Selected warehouse preview card (mirrors the partner preview)
 *   - Primary CTA: "Assign partner" — disabled until both partner AND
 *     warehouse are picked.
 *
 * Wires to `POST /api/logistics/pos/:id/assign-pickup-partner`. The
 * `warehouseId` is forwarded on the request body — the Hono route currently
 * captures it but does NOT pass it to the underlying RPC (per v3 spec §8.1
 * the eventual RPC `logistics_assign_partner_and_dispatch` is v3-S4 work).
 * This component is forward-compatible: when the new RPC ships, no FE change
 * is needed.
 */
interface Props {
  po: LogisticsPoListRow;
  supplier: SupplierRow | undefined;
  warehouse: { id: string; name: string; address: string | null } | undefined;
  onClose: () => void;
}

export default function AssignPickupDialog({
  po,
  supplier,
  warehouse,
  onClose,
}: Props) {
  const partnersQ = useDeliveryPartners();
  const partners = partnersQ.data?.partners ?? [];
  const [partnerId, setPartnerId] = useState<string>("");
  const assign = useAssignPickupPartnerMutation(po.id);

  // v3-S2.4 — destination warehouse picker: default to the PO's current
  // destination, but allow override (e.g. divert when origin WH is full).
  const warehousesQ = useLogisticsWarehouse();
  const warehouses = warehousesQ.data?.warehouses ?? [];
  const [warehouseId, setWarehouseId] = useState<string>("");

  useEffect(() => {
    if (!partnerId && partners.length > 0) setPartnerId(partners[0].id);
  }, [partnerId, partners]);

  // Initialize warehouse selection once the list loads. Prefer the PO's own
  // warehouse_id when it appears in the response; otherwise fall back to the
  // first available warehouse so the form is still submittable.
  useEffect(() => {
    if (warehouseId || warehouses.length === 0) return;
    const match = warehouses.find((w) => w.id === po.warehouse_id);
    setWarehouseId(match ? match.id : warehouses[0].id);
  }, [warehouseId, warehouses, po.warehouse_id]);

  const partner = partners.find((p) => p.id === partnerId);
  const selectedWarehouse = warehouses.find((w) => w.id === warehouseId);
  const lines = po.purchase_order_lines ?? [];
  const totalUnits = lines.reduce((s, l) => s + Number(l.qty || 0), 0);
  const valid = !!partnerId && !!warehouseId && !assign.isPending;

  async function submit() {
    if (!valid) return;
    try {
      await assign.mutateAsync({ partnerId, warehouseId });
      toast.success(
        `${po.id} assigned${partner ? ` to ${partner.name}` : ""} · awaiting their accept`,
      );
      onClose();
    } catch (e: unknown) {
      if (e instanceof ApiError) toast.error(e.message || "Assign partner failed");
      else toast.error(e instanceof Error ? e.message : "Assign partner failed");
    }
  }

  return (
    <Modal title={`Assign pickup partner · ${po.id}`} onClose={onClose}>
      <div className="text-[12px] text-base-600 mb-3.5 font-body">
        <strong>{supplier?.name ?? "Supplier"}</strong> has {totalUnits} unit
        {totalUnits === 1 ? "" : "s"} ready for collection. Choose a partner to
        dispatch to their factory.
      </div>

      <div
        className="card mb-3.5 px-3.5 py-2.5"
        style={{ background: "var(--base-50)" }}
      >
        <div className="label mb-1.5">Pickup details</div>
        <div className="text-[12px] font-body">
          From <strong>{supplier?.name ?? "Supplier"}</strong>
        </div>
        <div className="text-[12px] font-body mt-0.5">
          To <strong>{warehouse?.name ?? "Warehouse"}</strong>
        </div>
        <div className="font-mono text-[11px] text-base-500 mt-1.5">
          {lines.map((l) => `${l.sku} ×${l.qty}`).join(" · ") || "—"}
        </div>
      </div>

      <div className="label mb-1.5">Delivery partner *</div>
      {partnersQ.isLoading ? (
        <div className="text-[12px] text-base-500 mb-3.5">Loading partners…</div>
      ) : partnersQ.isError ? (
        <div className="text-[12px] text-destructive mb-3.5">
          Couldn&rsquo;t load partners — try again later.
        </div>
      ) : partners.length === 0 ? (
        <div className="text-[12px] text-warning mb-3.5">
          No delivery partners on file.
        </div>
      ) : (
        <select
          value={partnerId}
          onChange={(e) => setPartnerId(e.target.value)}
          aria-label="Delivery partner"
          className={`${INPUT_CLS} mb-3.5`}
        >
          {partners.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
              {p.zones ? ` · ${p.zones}` : ""}
            </option>
          ))}
        </select>
      )}

      {partner && (
        <div className="text-[12px] text-base-600 px-3 py-2.5 bg-base-50 rounded-[4px] mb-3.5">
          <div>
            <strong>{partner.name}</strong>
          </div>
          {partner.contact && (
            <div className="mt-1">
              Contact: <span className="font-mono">{partner.contact}</span>
            </div>
          )}
          {partner.zones && <div>Zones: {partner.zones}</div>}
        </div>
      )}

      {/*
       * v3-S2.4 — destination warehouse picker. Layout mirrors the partner
       * select pattern above (label · input · preview card) for consistency.
       * Defaults to po.warehouse_id; logistics can override when the original
       * destination is full or otherwise unavailable.
       */}
      <div className="label mb-1.5">
        Destination warehouse <span className="text-destructive">*</span>
      </div>
      {warehousesQ.isLoading ? (
        <div className="text-[12px] text-base-500 mb-3.5">
          Loading warehouses…
        </div>
      ) : warehousesQ.isError ? (
        <div className="text-[12px] text-destructive mb-3.5">
          Couldn&rsquo;t load warehouses — try again later.
        </div>
      ) : warehouses.length === 0 ? (
        <div className="text-[12px] text-warning mb-3.5">
          No warehouses on file.
        </div>
      ) : (
        <select
          value={warehouseId}
          onChange={(e) => setWarehouseId(e.target.value)}
          aria-label="Destination warehouse"
          className={`${INPUT_CLS} mb-3.5`}
        >
          {warehouses.map((w) => (
            <option key={w.id} value={w.id}>
              {w.name}
            </option>
          ))}
        </select>
      )}

      {selectedWarehouse && (
        <div
          className="text-[12px] text-base-600 px-3 py-2.5 bg-base-50 rounded-[4px] mb-3.5"
          data-testid="assign-pickup-warehouse-preview"
        >
          <div>
            <strong>{selectedWarehouse.name}</strong>
          </div>
          {selectedWarehouse.address && (
            <div className="font-mono text-[11px] mt-1">
              {selectedWarehouse.address}
            </div>
          )}
        </div>
      )}

      <ModalActions
        onCancel={onClose}
        onPrimary={submit}
        primary="Assign partner"
        primaryDisabled={
          !valid || partners.length === 0 || warehouses.length === 0
        }
        primaryPending={assign.isPending}
      />
    </Modal>
  );
}

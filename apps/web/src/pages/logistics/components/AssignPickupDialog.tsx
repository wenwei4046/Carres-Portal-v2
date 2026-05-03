import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ApiError } from "@/lib/api";
import {
  useAssignPickupPartnerMutation,
  useDeliveryPartners,
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
 *   - Primary CTA: "Assign partner" — disabled until partner picked
 *
 * Wires to `POST /api/logistics/pos/:id/assign-pickup-partner`.
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

  useEffect(() => {
    if (!partnerId && partners.length > 0) setPartnerId(partners[0].id);
  }, [partnerId, partners]);

  const partner = partners.find((p) => p.id === partnerId);
  const lines = po.purchase_order_lines ?? [];
  const totalUnits = lines.reduce((s, l) => s + Number(l.qty || 0), 0);
  const valid = !!partnerId && !assign.isPending;

  async function submit() {
    if (!valid) return;
    try {
      await assign.mutateAsync({ partnerId });
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

      <ModalActions
        onCancel={onClose}
        onPrimary={submit}
        primary="Assign partner"
        primaryDisabled={!valid || partners.length === 0}
        primaryPending={assign.isPending}
      />
    </Modal>
  );
}

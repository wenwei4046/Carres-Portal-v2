import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ApiError } from "@/lib/api";
import {
  useAssignPartnerMutation,
  useDeliveryPartners,
  type LogisticsOrderDetailOrder,
  type LogisticsOrderDetailWarehouse,
} from "@/lib/queries";
import { INPUT_CLS, Modal, ModalActions } from "./Modal";

/**
 * DispatchModal — picks a delivery partner for a `ready_to_dispatch` order.
 *
 * Mirrors `reference/proto/logistics-orders.jsx` `DispatchDialog`
 * (lines 463-490):
 *   - Title: "Assign delivery partner · #{dl}"
 *   - Body intro: explains stock allocation + names the source warehouse
 *   - Required <select> with all delivery partners ("name · zones" labels)
 *   - Preview panel below: bold name + mono contact + zones (base-50 fill)
 *   - Primary CTA: "Dispatch"
 *
 * On success, calls the parent's `onClose` so the drawer can stay open and
 * show the freshly-dispatched stage.
 */
interface Props {
  order: LogisticsOrderDetailOrder;
  warehouse: LogisticsOrderDetailWarehouse | null;
  onClose: () => void;
}

export default function DispatchModal({ order, warehouse, onClose }: Props) {
  const partnersQ = useDeliveryPartners();
  const partners = partnersQ.data?.partners ?? [];
  const [partnerId, setPartnerId] = useState<string>("");
  const assign = useAssignPartnerMutation(order.id);

  // Default the dropdown to the first partner once they load.
  useEffect(() => {
    if (!partnerId && partners.length > 0) {
      setPartnerId(partners[0].id);
    }
  }, [partnerId, partners]);

  const partner = partners.find((p) => p.id === partnerId);
  const valid = !!partnerId && !assign.isPending;

  async function submit() {
    if (!valid) return;
    try {
      await assign.mutateAsync({ partnerId });
      toast.success(
        `#${order.dl} dispatched${partner ? ` to ${partner.name}` : ""}`,
      );
      onClose();
    } catch (e: unknown) {
      if (e instanceof ApiError) toast.error(e.message || "Dispatch failed");
      else toast.error(e instanceof Error ? e.message : "Dispatch failed");
    }
  }

  return (
    <Modal
      title={`Assign delivery partner · #${order.dl}`}
      onClose={onClose}
    >
      <div className="text-[12px] text-base-600 mb-3.5 font-body">
        Stock has been allocated. Pick a delivery partner — they&rsquo;ll be
        notified to collect from{" "}
        <strong>{warehouse?.name ?? "the source warehouse"}</strong>.
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
        primary="Dispatch"
        primaryDisabled={!valid || partners.length === 0}
        primaryPending={assign.isPending}
      />
    </Modal>
  );
}

import { useState } from "react";
import { toast } from "sonner";
import { ApiError } from "@/lib/api";
import {
  useAbandonOrderMutation,
  type operationOrderDetailOrder,
} from "@/lib/queries";
import { INPUT_CLS, Modal, ModalActions } from "./Modal";

/**
 * AbandonOrderModal — A6 post-Proceed cancel. Sets the order to
 * `cancelled` and releases reserved stock. Refund handling is a Phase 5
 * Finance concern, NOT this modal.
 *
 * Loo's spec: A reason is required (audit trail). The proto doesn't ship a
 * dedicated abandon dialog — proto leaves abandon as a simple confirm in the
 * order timeline. We render a lean modal with a textarea + warning copy that
 * matches the visual conventions of the other three modals.
 */
interface Props {
  order: operationOrderDetailOrder;
  onClose: () => void;
}

export default function AbandonOrderModal({ order, onClose }: Props) {
  const [reason, setReason] = useState("");
  const abandon = useAbandonOrderMutation(order.id);
  const valid = reason.trim().length >= 3 && !abandon.isPending;

  // Mirror operation_abandon_order RPC: stock reserve only exists at
  // ready_to_dispatch + dispatched, so a release only happens there.
  // Earlier copy claimed "stock released" unconditionally, which lied for
  // confirmed + in_production abandons (Loo 2026-05-12).
  const hadReserve =
    order.operation_stage === "ready_to_dispatch" ||
    order.operation_stage === "dispatched";

  async function submit() {
    if (!valid) return;
    try {
      await abandon.mutateAsync({ reason: reason.trim() });
      toast.success(
        hadReserve
          ? `#${order.so} abandoned · stock released`
          : `#${order.so} abandoned`,
      );
      onClose();
    } catch (e: unknown) {
      if (e instanceof ApiError) toast.error(e.message || "Abandon failed");
      else toast.error(e instanceof Error ? e.message : "Abandon failed");
    }
  }

  return (
    <Modal title={`Abandon order · #${order.so}`} onClose={onClose}>
      <div className="text-meta text-base-600 mb-3.5 font-body">
        This will set the order to <strong>cancelled</strong>.
        {hadReserve ? (
          <> Reserved stock will be released back to the warehouse.</>
        ) : (
          <> No stock has been reserved yet, so nothing to release.</>
        )}{" "}
        Refund handling, if any, is a Finance concern (Phase 5).
      </div>
      <div className="mb-4">
        <label className="label mb-1.5 block" htmlFor="abandon-reason-input">
          Reason *
        </label>
        <textarea
          id="abandon-reason-input"
          rows={3}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="e.g. Customer changed mind · stock unavailable from supplier"
          className={`${INPUT_CLS} resize-y`}
        />
        {reason.trim().length > 0 && reason.trim().length < 3 && (
          <div className="text-label text-warning mt-1">
            Reason must be at least 3 characters.
          </div>
        )}
      </div>
      <ModalActions
        onCancel={onClose}
        onPrimary={submit}
        primary="Abandon order"
        primaryDisabled={!valid}
        primaryPending={abandon.isPending}
        danger
      />
    </Modal>
  );
}

import { useState } from "react";
import { toast } from "sonner";
import type { Order } from "@carres/shared";
import { ApiError } from "@/lib/api";
import { useCancelOrder } from "@/lib/queries";
import { ModalShell } from "./TopUpDepositModal";

interface Props {
  order: Order;
  onClose: () => void;
}

/**
 * CancelOrderDialog — Phase 2C.3. Small confirm dialog with optional reason
 * textarea. Only renders for Place orders (parent gates the button visibility).
 *
 * Reason is optional but encouraged — captured in `order_history.metadata`
 * so principal/finance can later audit why dealers cancel orders.
 */
export default function CancelOrderDialog({ order, onClose }: Props) {
  const [reason, setReason] = useState("");
  const cancelMut = useCancelOrder(order.id, {
    onSuccess: () => {
      toast.success(`Order #${order.so} cancelled`);
      onClose();
    },
    onError: (err) => {
      if (err instanceof ApiError && err.status === 422) {
        const code = (err.body as { code?: unknown } | null)?.code;
        if (code === "wrong_status") {
          toast.error("Order is no longer in Place — refresh and retry");
          return;
        }
      }
      toast.error(err.message || "Could not cancel order");
    },
  });

  function handleSubmit() {
    if (cancelMut.isPending) return;
    cancelMut.mutate({ reason: reason.trim() || null });
  }

  return (
    <ModalShell onClose={onClose}>
      <header className="px-7 pt-5 pb-3.5 border-b border-base-100">
        <p className="kicker text-warning">Cancel order · #{order.so}</p>
        <h2 className="font-display text-[22px] mt-0.5 tracking-[-0.02em] leading-[1.2] font-semibold">
          Cancel this order?
        </h2>
        <p className="text-xs text-base-600 mt-1">
          The order will move to <strong>Cancelled</strong> and stop appearing in your active
          tabs. This cannot be undone from the dealer side.
        </p>
      </header>

      <div className="px-7 py-6 overflow-auto flex-1 flex flex-col gap-3">
        <div className="rounded p-3 bg-warning-soft border border-warning text-xs text-base-800">
          <p className="font-semibold text-warning mb-0.5">⚠ Cancellation is final for dealers</p>
          <p>
            Re-opening a cancelled order requires Principal or Finance approval. Make sure the
            customer actually backed out before clicking Cancel.
          </p>
        </div>

        <label className="block">
          <span className="label block mb-1.5">
            Reason{" "}
            <span className="text-base-400 font-medium normal-case tracking-normal">(optional)</span>
          </span>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. Customer changed mind / found cheaper / decided to wait"
            rows={3}
            className="w-full px-3 py-2.5 border border-base-300 rounded text-sm bg-white outline-none focus:border-primary resize-vertical"
          />
        </label>

        <p className="text-[11px] text-base-500">
          Order summary: <strong>{order.customer.name}</strong>
          {order.customer.phone && <span className="font-mono"> · {order.customer.phone}</span>}
          {typeof order.totalAmount === "number" && (
            <span className="font-mono"> · RM {order.totalAmount.toLocaleString()}</span>
          )}
        </p>
      </div>

      <footer className="px-7 py-3.5 border-t border-base-100 bg-base-50 flex justify-end items-center gap-2">
        <button type="button" onClick={onClose} className="btn-ghost">
          Keep order
        </button>
        <button
          type="button"
          onClick={handleSubmit}
          disabled={cancelMut.isPending}
          className="btn-primary bg-destructive hover:bg-destructive/90"
        >
          {cancelMut.isPending ? "Cancelling…" : "Cancel order"}
        </button>
      </footer>
    </ModalShell>
  );
}

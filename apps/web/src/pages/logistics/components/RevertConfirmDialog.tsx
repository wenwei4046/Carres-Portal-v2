import { toast } from "sonner";
import {
  useRevertOrderProceedMutation,
  useRevertOrderDispatchMutation,
} from "@/lib/queries";

/**
 * 2026-05-12 (Loo) — confirm dialog for the kanban back-arrow on Proceed
 * Request + Dispatched cards. Two reverts share the dialog because the
 * button shape + copy + mutation pattern is identical; the only thing that
 * differs is the target column name and the hook called underneath.
 *
 * Wired to `/api/logistics/orders/:id/revert-proceed` and
 * `/api/logistics/orders/:id/revert-dispatch`. Server gates on
 * logistics+principal; RPC also rechecks state so a stale UI can't force a
 * bad transition.
 */

type Props = {
  orderId: string;
  dl: number;
  kind: "proceed" | "dispatch";
  onClose: () => void;
};

const COPY = {
  proceed: {
    fromLabel: "Proceed Request",
    toLabel: "Placed",
    sideEffect: "The order goes back to the dealer side as if Proceed was never pressed.",
  },
  dispatch: {
    fromLabel: "Dispatched",
    toLabel: "Ready to Dispatch",
    sideEffect:
      "Every dispatched thread is unlinked from its LP — partner, ETA, and acceptance time all cleared. You can re-assign right away.",
  },
} as const;

export default function RevertConfirmDialog({ orderId, dl, kind, onClose }: Props) {
  // Call BOTH hooks unconditionally so React keeps the same hook order across
  // renders. We pick which mutation to fire on confirm based on `kind`.
  const revertProceed = useRevertOrderProceedMutation(orderId);
  const revertDispatch = useRevertOrderDispatchMutation(orderId);
  const active = kind === "proceed" ? revertProceed : revertDispatch;
  const c = COPY[kind];

  function onConfirm() {
    active.mutate(undefined, {
      onSuccess: () => {
        toast.success(`Order #${dl} reverted to ${c.toLabel}`);
        onClose();
      },
      onError: (err) => {
        toast.error(err.message);
      },
    });
  }

  return (
    <div
      className="fixed inset-0 bg-black/40 flex items-center justify-center z-50"
      onClick={onClose}
      data-testid="revert-confirm-dialog"
    >
      <div
        className="bg-card rounded-md shadow-xl w-[440px] max-w-full p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground mb-1.5">
          Revert order
        </div>
        <div className="font-display text-[18px] text-foreground mb-3 leading-tight">
          Revert order #{dl} from {c.fromLabel} to {c.toLabel}?
        </div>
        <div className="text-[12.5px] text-base-700 mb-5 leading-relaxed">
          {c.sideEffect}
        </div>
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={active.isPending}
            className="px-3.5 py-2 border border-border rounded text-[12.5px] text-foreground disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={active.isPending}
            className="px-3.5 py-2 bg-primary text-primary-foreground font-semibold rounded text-[12.5px] disabled:opacity-50"
            data-testid="revert-confirm-button"
          >
            {active.isPending ? "Reverting…" : `Revert to ${c.toLabel}`}
          </button>
        </div>
      </div>
    </div>
  );
}

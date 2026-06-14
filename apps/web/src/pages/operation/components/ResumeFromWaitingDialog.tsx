import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "../../../lib/api";
import { qk } from "../../../lib/queries";

/**
 * ResumeFromWaitingDialog — Phase 4.5 Chunk 1 (Task 36).
 *
 * Surfaces the "Resume to Dispatch" entry-point for an order whose supplier
 * threads are parked at `at_warehouse_waiting` (PO-level `sup_status`) after a
 * partner-rejection ⇢ relocate flow. Confirming POSTs to
 * `/api/operation/orders/:so/resume-dispatch` (Task 35), which invokes RPC
 * `operation_resume_from_waiting` (migration 0045) to revive threads
 * (`waiting` → `ready_to_dispatch`) and bring the order back into the active
 * dispatch flow.
 *
 * Per Task 36 brief: customer date confirmation lives off-system (LP rings the
 * customer); this dialog is a deliberate "click only after the customer has
 * confirmed" gate. No form fields — pure confirm.
 *
 * Visual conventions match LpInboundConfirmDialog (Task 30):
 *   - Modal panel uses `bg-card` (HSL 40 53% 97% — Loo's three-layer cream
 *     intentional offset from proto white).
 *   - Raw HTML buttons styled with warm-linen Tailwind tokens (no shadcn).
 *
 * Cache invalidation: blunts `qk.operation.orders()` + `qk.operation.dashboard()`
 * so the kanban + dashboard counts refresh on success.
 */
export default function ResumeFromWaitingDialog({
  so,
  onClose,
}: {
  so: number;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const resume = useMutation({
    mutationFn: () =>
      apiFetch(`/api/operation/orders/${so}/resume-dispatch`, {
        method: "POST",
        body: JSON.stringify({}),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.operation.orders() });
      qc.invalidateQueries({ queryKey: qk.operation.dashboard() });
      onClose();
    },
  });

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-card rounded-lg p-6 max-w-md w-full">
        <h2 className="t-h3 mb-4">Resume from at_warehouse_waiting</h2>
        <p className="text-sm text-base-600 mb-4">
          Order #{so} threads will be advanced from <code>waiting</code> →{" "}
          <code>ready_to_dispatch</code>. Customer date confirmation is off-system;
          click only after customer has confirmed.
        </p>
        <div className="flex gap-2 justify-end">
          <button onClick={onClose} className="btn-secondary">
            Cancel
          </button>
          <button
            onClick={() => resume.mutate()}
            disabled={resume.isPending}
            className="btn-primary"
          >
            Resume to Dispatch
          </button>
        </div>
      </div>
    </div>
  );
}

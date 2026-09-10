import { useMemo, useState } from "react";
import type { PaymentRegisterRow } from "@carres/shared/payment-register";
import { SectionCard } from "@/components/SectionPanel";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { qk } from "@/lib/queries";
import { rm } from "@/lib/format-currency";
import { toast } from "sonner";

/**
 * Correct allocation — §5's "Wrong allocation" remedy (0450).
 *
 * The payment STANDS. Only where its money sits changes, and the change is
 * evidence: before, after, actor, time and a required reason. That is the
 * whole point — the old remedy was to void the receipt the customer is
 * holding, which destroys a document to fix a bookkeeping mistake.
 *
 * ⛔ THE ARITHMETIC IS CONSERVED. The lines must add up to exactly what was
 * received; the page says so continuously and keeps the button shut until they
 * do. The database refuses it anyway — this is the operator being told early,
 * not the guard.
 *
 * The Payment Approver is the only authority (§12), and the SERVER decides
 * that. This form is only offered to that holder, so nobody types a correction
 * they cannot make.
 */
export default function PaymentCorrectAllocation({ payment, onClose }: {
  payment: PaymentRegisterRow;
  onClose: () => void;
}) {
  const live = useMemo(
    () => (payment.payment_allocations ?? []).filter((a) => a.voided_at == null),
    [payment.payment_allocations],
  );
  const [lines, setLines] = useState<Array<{ orderId: string; amount: string }>>(
    () => live.length
      ? live.map((a) => ({ orderId: a.order_id, amount: String(a.amount) }))
      : [{ orderId: payment.order_id, amount: String(payment.amount) }],
  );
  const [reason, setReason] = useState("");
  const qc = useQueryClient();

  const total = lines.reduce((sum, l) => {
    const n = Number(l.amount);
    return sum + (Number.isFinite(n) ? n : 0);
  }, 0);
  const balanced = Math.abs(total - Number(payment.amount)) < 0.005;
  const complete = lines.every((l) => l.orderId.trim() !== "" && Number(l.amount) > 0);
  const ready = balanced && complete && reason.trim() !== "";

  const correct = useMutation({
    mutationFn: () => apiFetch(`/api/finance/payments/${payment.id}/correct-allocation`, {
      method: "POST",
      body: JSON.stringify({
        reason: reason.trim(),
        allocations: lines.map((l) => ({ orderId: l.orderId.trim(), amount: Number(l.amount) })),
      }),
    }),
    onSuccess: () => {
      toast.success("Allocation corrected");
      void qc.invalidateQueries({ queryKey: qk.finance.paymentRegister(), exact: true });
      void qc.invalidateQueries({ queryKey: qk.finance.invoiceRegister(), exact: true });
      onClose();
    },
    onError: (e: Error) => toast.error(`The allocation was not corrected — ${e.message}`),
  });

  const setLine = (i: number, patch: Partial<{ orderId: string; amount: string }>) =>
    setLines((before) => before.map((l, n) => (n === i ? { ...l, ...patch } : l)));

  return <div className="flex-1 overflow-auto p-4" data-testid="payment-correct-allocation">
    <SectionCard><div className="p-4">
      <h2 className="text-strong mb-2">Correct allocation</h2>
      <div className="space-y-2 text-body">
        <p>{payment.receipt_no ?? "Receipt number missing"} · {rm(payment.amount)} received.</p>
        <p className="font-semibold">This moves the money. It does not change how much was received.</p>

        {lines.map((line, i) => <div key={i} className="flex gap-2">
          <label className="flex-1">
            <span className="text-label">Sales Order</span>
            <input value={line.orderId} onChange={(e) => setLine(i, { orderId: e.target.value })}
              aria-label={`Sales Order ${i + 1}`}
              className="mt-0.5 w-full rounded-md border border-base-200 px-2 py-1.5 text-body" />
          </label>
          <label className="w-40">
            <span className="text-label">Amount</span>
            <input type="number" step="0.01" value={line.amount}
              onChange={(e) => setLine(i, { amount: e.target.value })}
              aria-label={`Amount ${i + 1}`}
              className="mt-0.5 w-full rounded-md border border-base-200 px-2 py-1.5 text-body" />
          </label>
          {lines.length > 1 && <button className="btn-secondary mt-4 h-8"
            onClick={() => setLines((before) => before.filter((_, n) => n !== i))}
            aria-label={`Remove line ${i + 1}`}>Remove</button>}
        </div>)}

        <button className="btn-secondary"
          onClick={() => setLines((before) => [...before, { orderId: "", amount: "" }])}>
          Add a Sales Order</button>

        <p data-testid="correct-allocation-total">
          {rm(total)} of {rm(payment.amount)} placed.
          {balanced ? "" : ` ${rm(Math.abs(Number(payment.amount) - total))} still to place.`}
        </p>

        <label className="block">
          <span className="text-label">Why is this being corrected</span>
          <input value={reason} onChange={(e) => setReason(e.target.value)}
            aria-label="Why is this being corrected"
            className="mt-0.5 w-full rounded-md border border-base-200 px-2 py-1.5 text-body" />
        </label>

        <div className="flex gap-2 pt-1">
          <button className="btn-primary" disabled={!ready || correct.isPending}
            onClick={() => correct.mutate()}>Correct allocation</button>
          <button className="btn-secondary" onClick={onClose}>Back</button>
        </div>
      </div>
    </div></SectionCard>
  </div>;
}

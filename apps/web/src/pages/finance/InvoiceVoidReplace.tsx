import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import Button from "@/components/kit/Button";
import Textarea from "@/components/kit/Textarea";
import { apiFetch } from "@/lib/api";
import { qk } from "@/lib/queries";

/**
 * Void and replace — the one correction door for an ISSUED invoice
 * (payment/MASTER.md: "Issued Invoice has no ordinary Edit; correction voids the
 * old Invoice and creates a linked replacement").
 *
 * POST /api/finance/invoices/:id/void-replace → payment_invoice_void_replace:
 * Payment Approver duty or principal (the SQL is the gate), a reason is
 * required, the old invoice is VOIDED (0476: its ledger entry is reversed) and
 * a linked replacement DRAFT is created with the same lines. The replacement
 * is issued from the order's Generate invoice, which picks up that draft and
 * draws a NEW number — a voided number is never reused.
 */
export default function InvoiceVoidReplace({ invoiceId, invoiceNo }: {
  invoiceId: string;
  invoiceNo: string;
}) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const correct = useMutation({
    mutationFn: () => apiFetch(`/api/finance/invoices/${invoiceId}/void-replace`, {
      method: "POST", body: JSON.stringify({ reason: reason.trim() }),
    }),
    onSuccess: () => {
      toast.success(`${invoiceNo} voided — the replacement draft is ready. Issue it from the order: Generate invoice.`);
      setOpen(false);
      setReason("");
      void qc.invalidateQueries({ queryKey: qk.finance.invoiceRegister() });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!open) {
    return <div className="mt-2">
      <Button variant="neutral" onClick={() => setOpen(true)}>Void and replace</Button>
    </div>;
  }
  const gap = reason.trim() ? null : "say why this invoice is wrong";
  return <div className="mt-2 space-y-2" data-testid="invoice-void-replace">
    <Textarea id="void-replace-reason" label="Why is this invoice wrong?" rows={2} maxLength={500}
      value={reason} onChange={(e) => setReason(e.target.value)} />
    <p className="text-label font-normal">
      {invoiceNo} is voided and keeps its paper. A replacement draft with the same lines is
      created; issue it from the order with Generate invoice. It gets a new number.
    </p>
    <div className="flex gap-2">
      <Button variant="primary" loading={correct.isPending} disabled={gap !== null}
        onClick={() => correct.mutate()}>
        {gap ? `Void and replace — ${gap}` : "Void and replace"}
      </Button>
      <Button variant="neutral" onClick={() => { setOpen(false); setReason(""); }}>Cancel</Button>
    </div>
  </div>;
}

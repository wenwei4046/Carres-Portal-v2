import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { CreditNoteRow } from "@carres/shared/schemas/finance-credit-note";
import type { CreditNotePrintData } from "@carres/shared/schemas/finance-credit-note";
import ListPageShell from "@/components/ListPageShell";
import Button from "@/components/kit/Button";
import Loading from "@/components/kit/Loading";
import Input from "@/components/kit/Input";
import Modal from "@/components/kit/Modal";
import { apiFetch } from "@/lib/api";
import { rm } from "@/lib/format-currency";
import { renderCreditNotePdf } from "@/lib/pdf/render";
import { LoadFailed } from "./other-money-in/parts";

/**
 * Finance · Credit Notes (migration 0730).
 *
 * A credit note is issued against ONE Sales Invoice, posts its own journal
 * (Dr the income the invoice credited / Cr receivables) and comes off what the
 * order still owes. Carres does not refund, so there is no payout here
 * (payment/MASTER.md §13): the old Refunds & Credit Notes history stays
 * read-only and this page is the only door that makes a credit note.
 */
export const CREDIT_NOTES_KEY = ["finance", "credit-notes"] as const;

export default function FinanceCreditNotes() {
  const qc = useQueryClient();
  const list = useQuery({
    queryKey: CREDIT_NOTES_KEY,
    queryFn: () => apiFetch<CreditNoteRow[]>("/api/finance/credit-notes"),
    staleTime: 30_000,
  });
  const [issuing, setIssuing] = useState(false);
  const [voiding, setVoiding] = useState<CreditNoteRow | null>(null);

  const open = async (row: CreditNoteRow) => {
    try {
      const data = await apiFetch<CreditNotePrintData>(`/api/finance/credit-notes/${row.id}/print-data`);
      window.open(URL.createObjectURL(await renderCreditNotePdf(data)), "_blank", "noopener");
    } catch (e) {
      toast.error(`The credit note could not be opened: ${(e as Error).message}`);
    }
  };

  const rows = list.data ?? [];
  return (
    <ListPageShell
      register
      title="Customer Credit Notes"
      actions={<Button variant="primary" onClick={() => setIssuing(true)}>Issue credit note</Button>}
    >
      <div className="bg-card rounded-md border border-border overflow-auto">
        <table className="w-full text-meta">
          <thead>
            <tr className="bg-muted/40 text-label uppercase tracking-[0.06em] text-muted-foreground text-left">
              <th className="px-4 py-2.5">Credit Note</th>
              <th className="px-4 py-2.5">Date</th>
              <th className="px-4 py-2.5">Invoice</th>
              <th className="px-4 py-2.5">SO</th>
              <th className="px-4 py-2.5">Customer</th>
              <th className="px-4 py-2.5">Reason</th>
              <th className="px-4 py-2.5 text-right">Amount</th>
              <th className="px-4 py-2.5">Status</th>
              <th className="px-4 py-2.5" />
            </tr>
          </thead>
          <tbody>
            {list.isLoading ? (
              <tr><td colSpan={9} className="p-10"><Loading variant="skeleton" label="Loading credit notes" /></td></tr>
            ) : list.isError && !list.data ? (
              <tr><td colSpan={9}><LoadFailed what="The credit notes" onRetry={() => void list.refetch()} /></td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={9} className="p-10 text-center text-muted-foreground">No credit notes yet.</td></tr>
            ) : rows.map((r) => (
              <tr key={r.id} className="border-t border-border">
                <td className="px-4 py-2.5 font-mono font-semibold">{r.credit_note_no}</td>
                <td className="px-4 py-2.5">{r.note_date}</td>
                <td className="px-4 py-2.5 font-mono">{r.invoice_no ?? ""}</td>
                <td className="px-4 py-2.5">{r.so != null ? `SO-${r.so}` : ""}</td>
                <td className="px-4 py-2.5">{r.customer_name ?? ""}</td>
                <td className="px-4 py-2.5 max-w-[240px] truncate" title={r.reason}>{r.reason}</td>
                <td className="px-4 py-2.5 text-right font-mono font-semibold">{rm(r.amount)}</td>
                <td className="px-4 py-2.5">{r.status === "voided" ? "Voided" : "Issued"}</td>
                <td className="px-4 py-2.5 text-right whitespace-nowrap">
                  <Button size="sm" onClick={() => open(r)}>Open</Button>{" "}
                  {r.status === "issued" ? <Button size="sm" onClick={() => setVoiding(r)}>Void</Button> : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <IssueModal
        open={issuing}
        onClose={() => setIssuing(false)}
        onDone={() => { setIssuing(false); qc.invalidateQueries({ queryKey: CREDIT_NOTES_KEY }); }}
      />
      <VoidModal
        row={voiding}
        onClose={() => setVoiding(null)}
        onDone={() => { setVoiding(null); qc.invalidateQueries({ queryKey: CREDIT_NOTES_KEY }); }}
      />
    </ListPageShell>
  );
}

function IssueModal({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: () => void }) {
  const [invoiceNo, setInvoiceNo] = useState("");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const issue = useMutation({
    mutationFn: () =>
      apiFetch<{ credit_note_no: string }>("/api/finance/credit-notes", {
        method: "POST",
        body: JSON.stringify({ invoiceNo: invoiceNo.trim(), amount: Number(amount), reason: reason.trim() }),
      }),
    onSuccess: (note) => {
      toast.success(`${note.credit_note_no} issued`);
      setInvoiceNo(""); setAmount(""); setReason("");
      onDone();
    },
    onError: (e) => toast.error((e as Error).message),
  });
  const ready = invoiceNo.trim() !== "" && Number(amount) > 0 && reason.trim() !== "";
  return (
    <Modal
      open={open}
      onOpenChange={(o) => { if (!o) onClose(); }}
      title="Issue credit note"
      description="It comes off what the customer owes on this invoice."
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" disabled={!ready} loading={issue.isPending} onClick={() => issue.mutate()}>
            Issue credit note
          </Button>
        </>
      }
    >
      <div className="grid gap-3">
        <Input id="cn-invoice" label="Invoice" required value={invoiceNo} onChange={(e) => setInvoiceNo(e.target.value)} />
        <Input id="cn-amount" label="Amount (RM)" required type="number" inputMode="decimal" min={0} step="0.01"
          value={amount} onChange={(e) => setAmount(e.target.value)} />
        <Input id="cn-reason" label="Reason" required value={reason} onChange={(e) => setReason(e.target.value)} />
      </div>
    </Modal>
  );
}

function VoidModal({ row, onClose, onDone }: { row: CreditNoteRow | null; onClose: () => void; onDone: () => void }) {
  const [reason, setReason] = useState("");
  const void_ = useMutation({
    mutationFn: () =>
      apiFetch(`/api/finance/credit-notes/${row!.id}/void`, { method: "POST", body: JSON.stringify({ reason: reason.trim() }) }),
    onSuccess: () => { toast.success(`${row!.credit_note_no} voided`); setReason(""); onDone(); },
    onError: (e) => toast.error((e as Error).message),
  });
  return (
    <Modal
      open={row !== null}
      onOpenChange={(o) => { if (!o) onClose(); }}
      title={row ? `Void ${row.credit_note_no}` : "Void credit note"}
      description="The customer owes the amount again."
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" disabled={reason.trim() === ""} loading={void_.isPending} onClick={() => void_.mutate()}>
            Void credit note
          </Button>
        </>
      }
    >
      <Input id="cn-void-reason" label="Reason" required value={reason} onChange={(e) => setReason(e.target.value)} />
    </Modal>
  );
}

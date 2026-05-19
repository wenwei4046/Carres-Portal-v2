import { useState } from "react";
import { toast } from "sonner";
import {
  useIssueInvoice,
  useRecordReceipt,
  useFinancePayments,
  type FinanceArAgingRow,
  type FinancePaymentRow,
} from "@/lib/queries";
import { apiFetch, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { renderInvoicePdf } from "@/lib/pdf/render";
import type { InvoiceTemplateData } from "@/lib/pdf/types";
import DownloadSalesOrderButton from "@/components/DownloadSalesOrderButton";
import { rm } from "@/lib/format-currency";
import type { PaymentMethod } from "@carres/shared";

const METHODS: { value: PaymentMethod; label: string }[] = [
  { value: "bank_transfer", label: "Bank transfer" },
  { value: "duitnow_qr",    label: "DuitNow QR" },
  { value: "cheque",        label: "Cheque" },
  { value: "cash",          label: "Cash" },
  { value: "credit_card",   label: "Credit card" },
  { value: "debit_card",    label: "Debit card" },
];

/**
 * AR Drawer — slides in from the right when a receivable row is clicked.
 *
 * Visual reference: `reference/proto/finance-ar.jsx:111-226`. Wires:
 *   - Record receipt: useRecordReceipt(orderId, amount, method, reference)
 *     → POST /api/finance/payments/order-receipt → finance_record_receipt
 *     RPC. Closes A1 partial: orders.paid bumps + payments(direction=in).
 *   - Issue invoice: useIssueInvoice(orderId, amount, taxAmount?) → POST
 *     /api/finance/invoices/issue → invoice_issue RPC. Q2=A locked: route
 *     gates on order.status='delivered'; this UI also pre-checks
 *     row.outstanding === 0 (full paid) before showing the button so the
 *     finance person doesn't get a 422 from the server.
 *   - Payment history: useFinancePayments({ orderId }) → GET
 *     /api/finance/payments?orderId=... — list of inbound payments
 *     against this order.
 *   - Download invoice PDF (post-issue): closes phase-5-ardrawer-download-button
 *     carry-forward. After successful issue, captures the new invoice id from
 *     the RPC response (returns the full `invoices` row per 0003:289) and
 *     swaps the Issue button for a Download button that streams the
 *     server-rendered PDF (Q7=A) via apiFetchBlob → ObjectURL → window.open.
 *
 * Closes on overlay click, X button, or Escape.
 */
export default function ARDrawer({
  row,
  onClose,
}: {
  row: FinanceArAgingRow;
  onClose: () => void;
}) {
  const [recPanelOpen, setRecPanelOpen] = useState(false);
  const [recAmt, setRecAmt]             = useState(String(row.outstanding || ""));
  const [recRef, setRecRef]             = useState("");
  const [recMethod, setRecMethod]       = useState<PaymentMethod>("bank_transfer");
  const [issuedInvoiceId, setIssuedInvoiceId] = useState<string | null>(null);
  const role = useAuth((s) => s.role);

  const payments = useFinancePayments({ orderId: row.order_id });
  const recordReceipt = useRecordReceipt({
    onSuccess: () => {
      toast.success(`Recorded RM ${parseFloat(recAmt || "0").toFixed(2)} for ${row.invoice_no}`);
      setRecAmt("");
      setRecRef("");
      setRecPanelOpen(false);
    },
    onError: (e) => toast.error(`Receipt failed: ${e.message}`),
  });
  const issueInvoice = useIssueInvoice({
    onSuccess: (data) => {
      // invoice_issue RPC (0003:289) returns the full invoices row; capture
      // the id so the Download button can hit /api/finance/invoices/:id/pdf
      // without a follow-up list refetch.
      const inv = data as { id?: string; invoice_no?: string } | null;
      if (inv?.id) setIssuedInvoiceId(inv.id);
      toast.success(`Invoice issued for ${inv?.invoice_no ?? row.invoice_no}`);
      // Note: deliberately NOT onClose() — user should be able to click
      // Download next without re-opening the drawer.
    },
    onError: (e) => toast.error(`Issue failed: ${e.message}`),
  });

  async function downloadInvoicePdf() {
    if (!issuedInvoiceId) return;
    try {
      // Server returns JSON; @react-pdf renders client-side (Workers WASM ban).
      const data = await apiFetch<InvoiceTemplateData>(
        `/api/finance/invoices/${issuedInvoiceId}/pdf-data`,
      );
      const blob = await renderInvoicePdf(data);
      const url  = URL.createObjectURL(blob);
      window.open(url, "_blank");
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : String(e);
      toast.error(`PDF download failed: ${msg}`);
    }
  }

  function submitReceipt() {
    const amt = parseFloat(recAmt);
    if (!amt || amt <= 0) {
      toast.error("Amount must be positive");
      return;
    }
    recordReceipt.mutate({
      orderId:   row.order_id,
      amount:    amt,
      method:    recMethod,
      reference: recRef || null,
    });
  }

  function submitIssue() {
    if (row.status !== "delivered") {
      toast.warning("Order must be delivered before invoice can issue");
      return;
    }
    if (row.outstanding > 0.01) {
      toast.warning("Customer must be fully paid before invoice can issue");
      return;
    }
    // SST 8% inclusive: tax = total * 0.08 / 1.08
    const tax = +(row.total * 0.08 / 1.08).toFixed(2);
    issueInvoice.mutate({
      orderId:   row.order_id,
      amount:    row.total,
      taxAmount: tax,
    });
  }

  const canIssue = row.status === "delivered" && row.outstanding <= 0.01;

  return (
    <div className="fixed inset-0 z-[100] flex justify-end">
      <div
        onClick={onClose}
        className="absolute inset-0 bg-black/40"
        aria-hidden="true"
      />
      <div
        role="dialog"
        aria-label={`Receivable ${row.invoice_no}`}
        className="relative w-[480px] max-w-[92vw] h-full bg-card shadow-2xl flex flex-col overflow-auto"
      >
        <div className="px-6 py-5 border-b border-border flex items-start justify-between">
          <div>
            <div className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
              Receivable
            </div>
            <div className="font-display text-[22px] mt-1">{row.invoice_no}</div>
            <div className="text-[12.5px] text-muted-foreground mt-0.5">
              {row.customer_name} · {row.dealer_name ?? "—"}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="text-[18px] text-muted-foreground hover:text-foreground"
          >
            ×
          </button>
        </div>

        <div className="px-6 py-5 flex flex-col gap-[18px]">
          <div className="grid grid-cols-2 gap-2.5">
            <Mini label="Total"       value={rm(row.total)}                                        tone="neutral" />
            <Mini label="Outstanding" value={rm(row.outstanding)} tone={row.outstanding > 0 ? "warn" : "ok"} />
          </div>

          <div>
            <div className="text-[10px] uppercase tracking-[0.06em] font-semibold text-muted-foreground mb-1.5">
              Order summary
            </div>
            <div className="bg-background/60 rounded-md border border-border px-3 py-2 text-[12.5px] flex justify-between">
              <span>SO-{row.so} · {row.status}</span>
              <span className="font-mono">{rm(row.total)}</span>
            </div>
            {/* 2026-05-12 (Loo) — reprint the customer Sales Order from AR. */}
            {role && (
              <div className="mt-2">
                <DownloadSalesOrderButton
                  orderId={row.order_id}
                  so={row.so}
                  role={role}
                  variant="secondary"
                  className="w-full"
                />
              </div>
            )}
          </div>

          {row.outstanding > 0 && (
            <div>
              {!recPanelOpen ? (
                <button
                  type="button"
                  onClick={() => {
                    setRecPanelOpen(true);
                    setRecAmt(String(row.outstanding));
                  }}
                  className="w-full py-2.5 rounded-md bg-primary text-primary-foreground font-semibold text-[13px]"
                >
                  Record receipt
                </button>
              ) : (
                <div className="bg-background/60 rounded-md border border-border p-3.5">
                  <div className="text-[10px] uppercase tracking-[0.06em] font-semibold text-muted-foreground mb-2">
                    Record payment received
                  </div>
                  <input
                    aria-label="Amount"
                    value={recAmt}
                    onChange={(e) => setRecAmt(e.target.value)}
                    placeholder="Amount (RM)"
                    inputMode="decimal"
                    className="w-full px-2.5 py-1.5 border border-border rounded text-[12.5px] mb-2 bg-card"
                  />
                  <select
                    aria-label="Method"
                    value={recMethod}
                    onChange={(e) => setRecMethod(e.target.value as PaymentMethod)}
                    className="w-full px-2.5 py-1.5 border border-border rounded text-[12.5px] mb-2 bg-card"
                  >
                    {METHODS.map((m) => (
                      <option key={m.value} value={m.value}>{m.label}</option>
                    ))}
                  </select>
                  <input
                    aria-label="Reference"
                    value={recRef}
                    onChange={(e) => setRecRef(e.target.value)}
                    placeholder="Bank ref / FPX ref (optional)"
                    className="w-full px-2.5 py-1.5 border border-border rounded text-[12.5px] mb-2.5 bg-card"
                  />
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={submitReceipt}
                      disabled={recordReceipt.isPending}
                      className="flex-1 py-2 rounded-md bg-primary text-primary-foreground font-semibold text-[12.5px] disabled:opacity-60"
                    >
                      {recordReceipt.isPending ? "Recording…" : "Confirm"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setRecPanelOpen(false)}
                      className="px-3 py-2 rounded-md border border-border text-[12.5px]"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          <div>
            <div className="text-[10px] uppercase tracking-[0.06em] font-semibold text-muted-foreground mb-1.5">
              Payment history
            </div>
            <div className="bg-background/60 rounded-md border border-border px-3 py-2">
              {payments.isLoading ? (
                <div className="py-1 text-[11.5px] text-muted-foreground">Loading…</div>
              ) : (payments.data ?? []).length === 0 ? (
                <div className="py-1.5 text-[11.5px] text-muted-foreground">
                  No receipts recorded yet.
                </div>
              ) : (
                (payments.data ?? []).map((p: FinancePaymentRow) => (
                  <div
                    key={p.id}
                    className="flex justify-between py-1 text-[12px] border-b border-dashed border-border last:border-0"
                  >
                    <span>
                      {p.direction === "in" ? "Receipt" : "Outbound"} · {p.method}
                      {p.reference ? ` · ${p.reference}` : ""}
                    </span>
                    <span className="text-muted-foreground font-mono">
                      {rm(p.amount)} · {p.paid_at}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="flex gap-2">
            {issuedInvoiceId ? (
              <button
                type="button"
                onClick={downloadInvoicePdf}
                title="Download tax invoice PDF"
                className="flex-1 py-2 rounded-md bg-primary text-primary-foreground font-semibold text-[12.5px]"
              >
                Download invoice (PDF)
              </button>
            ) : (
              <button
                type="button"
                onClick={submitIssue}
                disabled={!canIssue || issueInvoice.isPending}
                title={
                  !canIssue
                    ? "Issue available only after delivery + full payment"
                    : "Issue tax invoice"
                }
                className="flex-1 py-2 rounded-md border border-border text-[12.5px] disabled:opacity-60"
              >
                {issueInvoice.isPending ? "Issuing…" : "Issue invoice"}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Mini({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "warn" | "ok" | "neutral";
}) {
  const valTone = tone === "warn" ? "text-primary" : tone === "ok" ? "text-success" : "text-foreground";
  return (
    <div className="bg-background/60 rounded-md border border-border px-3.5 py-2.5">
      <div className="text-[10px] uppercase tracking-[0.06em] font-semibold text-muted-foreground">
        {label}
      </div>
      <div className={`font-display text-[20px] mt-0.5 leading-none tabular-nums ${valTone}`}>
        {value}
      </div>
    </div>
  );
}


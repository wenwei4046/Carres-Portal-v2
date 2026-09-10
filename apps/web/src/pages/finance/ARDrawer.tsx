import { useState } from "react";
import { toast } from "sonner";
import {
  useRecordReceipt,
  useFinancePayments,
  type FinanceArAgingRow,
  type FinancePaymentRow,
} from "@/lib/queries";
import { useAuth } from "@/lib/auth";
import DownloadSalesOrderButton from "@/components/DownloadSalesOrderButton";
import { rm } from "@/lib/format-currency";
import { useManualMethods } from "@/lib/payment-methods";

/**
 * AR Drawer — slides in from the right when a receivable row is clicked.
 *
 * Visual reference: `reference/proto/finance-ar.jsx:111-226`. Wires:
 *   - Record receipt: useRecordReceipt(orderId, amount, method, reference)
 *     → POST /api/finance/payments/order-receipt → finance_record_receipt
 *     RPC. The methods are the Active rows of Settings → Payment → Payment
 *     methods (0476), so `bank` lands in the bank account — the old
 *     `bank_transfer` word was coerced to `other`, which the ledger refused.
 *   - Payment history: useFinancePayments({ orderId }) → GET
 *     /api/finance/payments?orderId=... — list of inbound payments
 *     against this order.
 *
 * No Issue invoice button (0476 — one invoice door per act). It called the
 * legacy `invoice_issue`: a number outside the governed series and no journal
 * entry. A Sales Invoice is issued from the order (Balance → Generate invoice)
 * or when the order is dispatched; both post to the ledger.
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
  const [chosenMethod, setRecMethod]    = useState<string>("bank");
  const role = useAuth((s) => s.role);
  const { methods, label: methodLabel } = useManualMethods();
  const recMethod = methods.some((m) => m.value === chosenMethod)
    ? chosenMethod : methods[0]?.value ?? chosenMethod;

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
      idempotencyKey: crypto.randomUUID(),
    });
  }

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
            <div className="text-label uppercase tracking-[0.12em] text-muted-foreground">
              Receivable
            </div>
            <div className="font-display text-title mt-1">{row.invoice_no}</div>
            <div className="text-meta text-muted-foreground mt-0.5">
              {row.customer_name} · {row.dealer_name ?? "—"}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="text-strong text-muted-foreground hover:text-foreground"
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
            <div className="text-label uppercase tracking-[0.06em] font-semibold text-muted-foreground mb-1.5">
              Order summary
            </div>
            <div className="bg-background/60 rounded-md border border-border px-3 py-2 text-meta flex justify-between">
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
                  className="w-full py-2.5 rounded-md bg-primary text-primary-foreground font-semibold text-body"
                >
                  Record receipt
                </button>
              ) : (
                <div className="bg-background/60 rounded-md border border-border p-3.5">
                  <div className="text-label uppercase tracking-[0.06em] font-semibold text-muted-foreground mb-2">
                    Record payment received
                  </div>
                  <input
                    aria-label="Amount"
                    value={recAmt}
                    onChange={(e) => setRecAmt(e.target.value)}
                    placeholder="Amount (RM)"
                    inputMode="decimal"
                    className="w-full px-2.5 py-1.5 border border-border rounded text-meta mb-2 bg-card"
                  />
                  <select
                    aria-label="Method"
                    value={recMethod}
                    onChange={(e) => setRecMethod(e.target.value)}
                    className="w-full px-2.5 py-1.5 border border-border rounded text-meta mb-2 bg-card"
                  >
                    {methods.map((m) => (
                      <option key={m.value} value={m.value}>{m.label}</option>
                    ))}
                  </select>
                  <input
                    aria-label="Reference"
                    value={recRef}
                    onChange={(e) => setRecRef(e.target.value)}
                    placeholder="Bank ref / FPX ref (optional)"
                    className="w-full px-2.5 py-1.5 border border-border rounded text-meta mb-2.5 bg-card"
                  />
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={submitReceipt}
                      disabled={recordReceipt.isPending}
                      className="flex-1 py-2 rounded-md bg-primary text-primary-foreground font-semibold text-meta disabled:opacity-60"
                    >
                      {recordReceipt.isPending ? "Recording…" : "Confirm"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setRecPanelOpen(false)}
                      className="px-3 py-2 rounded-md border border-border text-meta"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          <div>
            <div className="text-label uppercase tracking-[0.06em] font-semibold text-muted-foreground mb-1.5">
              Payment history
            </div>
            <div className="bg-background/60 rounded-md border border-border px-3 py-2">
              {payments.isLoading ? (
                <div className="py-1 text-label text-muted-foreground">Loading…</div>
              ) : (payments.data ?? []).length === 0 ? (
                <div className="py-1.5 text-label text-muted-foreground">
                  No receipts recorded yet.
                </div>
              ) : (
                (payments.data ?? []).map((p: FinancePaymentRow) => (
                  <div
                    key={p.id}
                    className="flex justify-between py-1 text-meta border-b border-dashed border-border last:border-0"
                  >
                    <span>
                      {p.direction === "in" ? "Receipt" : "Outbound"} · {methodLabel(p.method)}
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
      <div className="text-label uppercase tracking-[0.06em] font-semibold text-muted-foreground">
        {label}
      </div>
      <div className={`font-display text-title mt-0.5 leading-none tabular-nums ${valTone}`}>
        {value}
      </div>
    </div>
  );
}

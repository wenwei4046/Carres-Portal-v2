import { useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import type { InvoiceRegisterRow } from "@carres/shared/payment-invoice-register";
import Button from "@/components/kit/Button";
import Drawer from "@/components/kit/Drawer";
import { fieldCls } from "@/components/Field";
import DownloadSalesOrderButton from "@/components/DownloadSalesOrderButton";
import { useRecordReceipt } from "@/lib/queries";
import { useAuth } from "@/lib/auth";
import { fmtDate } from "@/lib/fmt-date";
import { rm } from "@/lib/format-currency";
import { useManualMethods } from "@/lib/payment-methods";
import { requiredPaymentReference } from "@carres/shared";
import type { CustomerOwingRow } from "./money-owed";

/** One receipt on the order, as the invoice register returns it. */
export type OrderPaymentRow = NonNullable<NonNullable<InvoiceRegisterRow["orders"]>["order_payments"]>[number];

/**
 * AR drawer — one order a customer still owes money on, opened beside the
 * AR list.
 *
 *   - Outstanding is the row's own figure (`customerOwingRows`, the shared
 *     `soRemaining`), never recomputed here.
 *   - Record receipt: useRecordReceipt → POST /api/finance/payments/order-receipt
 *     → finance_record_receipt, which writes an `order_payments` row. The
 *     methods are the Active rows of Settings → Payment → Payment methods (0476).
 *   - Payment history is that same `order_payments` list, read from the
 *     invoice register — so a receipt recorded here shows here. (It used to
 *     read the legacy `payments` table, where this door never writes.)
 *
 * No Issue invoice button (0476 — one invoice door per act): a Sales Invoice
 * is issued from the order (Generate invoice) or at dispatch. `Open invoice`
 * goes to the order's collection object in the Invoices Register.
 */
export default function ARDrawer({
  balance,
  payments,
  open,
  onOpenChange,
  startRecording = false,
}: {
  balance: CustomerOwingRow;
  payments: readonly OrderPaymentRow[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Open with the Record receipt form already showing (the row's Record receipt button). */
  startRecording?: boolean;
}) {
  const [recPanelOpen, setRecPanelOpen] = useState(startRecording);
  const [recAmt, setRecAmt]             = useState(String(balance.outstanding || ""));
  const [recRef, setRecRef]             = useState("");
  const [chosenMethod, setRecMethod]    = useState<string>("bank");
  const role = useAuth((s) => s.role);
  const { methods, label: methodLabel } = useManualMethods();
  const recMethod = methods.some((m) => m.value === chosenMethod)
    ? chosenMethod : methods[0]?.value ?? chosenMethod;
  const refWord = requiredPaymentReference(recMethod); // §16 (0535)
  const soWord = balance.so !== null ? `SO-${balance.so}` : "SO not available";

  const recordReceipt = useRecordReceipt({
    onSuccess: () => {
      toast.success(`Recorded ${rm(parseFloat(recAmt || "0"))} for ${soWord}`);
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
    if (refWord && !recRef.trim()) {
      toast.error(`Enter the ${refWord.toLowerCase()}`);
      return;
    }
    recordReceipt.mutate({
      orderId:   balance.orderId,
      amount:    amt,
      method:    recMethod,
      reference: recRef || null,
      idempotencyKey: crypto.randomUUID(),
    });
  }

  return (
    <Drawer open={open} onOpenChange={onOpenChange} title={`${soWord} · ${balance.customer}`}>
      <div className="flex flex-col gap-4 text-body" data-testid="ar-drawer">
        <div>
          <div className="text-label">Outstanding</div>
          <div className="text-title font-semibold tabular-nums" data-testid="ar-drawer-outstanding">
            {rm(balance.outstanding)}
          </div>
          {balance.storageOwing > 0 && (
            <div className="text-label font-normal">includes storage {rm(balance.storageOwing)}</div>
          )}
        </div>

        <div className="flex flex-col gap-2">
          <Link className="btn-secondary text-center" to={`/finance/invoices?invoice=${balance.doorId}`}>
            Open invoice
          </Link>
          {/* 2026-05-12 (Loo) — reprint the customer Sales Order from AR. */}
          {role && balance.so !== null && (
            <DownloadSalesOrderButton
              orderId={balance.orderId}
              so={balance.so}
              role={role}
              variant="secondary"
              className="w-full"
            />
          )}
        </div>

        {balance.outstanding > 0 && (
          <div>
            {!recPanelOpen ? (
              <Button variant="primary" onClick={() => {
                setRecPanelOpen(true);
                setRecAmt(String(balance.outstanding));
              }}>
                Record receipt
              </Button>
            ) : (
              <div className="flex flex-col gap-2 rounded-control border border-kit-slate-5 p-3">
                <h3 className="text-strong">Record payment received</h3>
                <label className="block">
                  <span className="text-label">Amount (RM)</span>
                  <input aria-label="Amount" value={recAmt} inputMode="decimal"
                    onChange={(e) => setRecAmt(e.target.value)} className={fieldCls} />
                </label>
                <label className="block">
                  <span className="text-label">Method</span>
                  <select aria-label="Method" value={recMethod}
                    onChange={(e) => setRecMethod(e.target.value)} className={fieldCls}>
                    {methods.map((m) => (
                      <option key={m.value} value={m.value}>{m.label}</option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="text-label">{refWord ?? "Reference"}</span>
                  <input aria-label="Reference" value={recRef}
                    placeholder={refWord ?? "Bank ref / FPX ref (optional)"}
                    onChange={(e) => setRecRef(e.target.value)} className={fieldCls} />
                </label>
                <div className="flex gap-2">
                  <Button variant="primary" onClick={submitReceipt} loading={recordReceipt.isPending}>
                    {recordReceipt.isPending ? "Recording…" : "Confirm"}
                  </Button>
                  <Button variant="ghost" onClick={() => setRecPanelOpen(false)}>Cancel</Button>
                </div>
              </div>
            )}
          </div>
        )}

        <div>
          <h3 className="text-strong mb-1">Payment history</h3>
          {payments.length === 0 ? (
            <p className="text-label font-normal">No receipts recorded yet.</p>
          ) : (
            <ul className="flex flex-col" data-testid="ar-drawer-history">
              {payments.map((p) => (
                <li key={p.id} className="flex justify-between gap-3 border-b border-dashed border-kit-slate-5 py-1 last:border-0">
                  <span className="min-w-0">
                    <span className="block font-semibold">
                      {p.receipt_no ?? "Receipt number missing"}{p.voided_at ? " · VOIDED" : ""}
                    </span>
                    <span className="block text-label font-normal">
                      {fmtDate(p.paid_on)} · {p.method ? methodLabel(p.method) : "Method not recorded"}
                      {p.reference ? ` · ${p.reference}` : ""}
                    </span>
                  </span>
                  <span className="shrink-0 tabular-nums">{rm(Number(p.amount))}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </Drawer>
  );
}

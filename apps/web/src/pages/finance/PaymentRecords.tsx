import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { isLivePayment } from "@carres/shared";
import type { PaymentRegisterRow } from "@carres/shared/payment-register";
import { paymentExceptionWord, paymentInvoiceNumbers, paymentSourceWord } from "@carres/shared/payment-register";
import { soRemaining } from "@carres/shared/payment-invoice-register";
import { inOrderScope, orderScopeOf } from "@carres/shared/payment-register-scope";
import type { PaymentTemplateRow } from "@carres/shared/payment-templates";
import { MoreHorizontal } from "lucide-react";
import ListPageShell from "@/components/ListPageShell";
import Button from "@/components/kit/Button";
import DropdownMenu from "@/components/kit/DropdownMenu";
import { DataGrid, type DataGridColumn } from "@/components/register/DataGrid";
import {
  qk,
  useInvoiceRegister,
  usePaymentRegister,
  usePaymentSettings,
  useVoidPayment,
  useWorkspaceDuties,
} from "@/lib/queries";
import { usePaymentMethodRegistry } from "@/lib/payment-methods";
import { useAuth } from "@/lib/auth";
import { viewSlip } from "@/lib/payment-display";
import PaymentCorrectAllocation from "./PaymentCorrectAllocation";
import InvoiceSendReceipt from "./InvoiceSendReceipt";
import { Facts } from "./PaymentCollectionWorkspace";
import { fmtDate } from "@/lib/fmt-date";
import { rm } from "@/lib/format-currency";
import ModuleHeader from "@/pages/operation/components/ModuleHeader";
import SalesOrderTabs from "@/pages/operation/SalesOrderTabs";
import { apiFetch } from "@/lib/api";
import { renderReceiptPdf } from "@/lib/pdf/render";
import type { ReceiptTemplateData } from "@/lib/pdf/types";
import { toast } from "sonner";

/**
 * PAYMENT RECORDS — the only permanent incoming-customer-money listing
 * (owner ruling 2026-09-12; payment/MASTER.md §3 · §16).
 *
 *   Receipt No · Paid date · Customer · SO No · Amount received · Method
 *
 * One row is one actual Payment transaction. No Goods, arrival, Storage,
 * delivery or timing here — that is the Monitor's job. No `New Payment`:
 * money is recorded from the collection workspace. A genuine exception
 * (`VOIDED` · `RM {amount} needs review`) sits beside the Receipt No; a
 * normal row wears no redundant `Recorded`. The row opens the exact Payment
 * Record — a full-width, one-scroll object with no tabs.
 */

const METHODS: Record<string, string> = {
  bank: "Bank transfer", bank_transfer: "Bank transfer", cash: "Cash", card: "Card",
  cheque: "Cheque", online: "Online payment", other: "Other",
  duitnow_qr: "DuitNow QR", credit_card: "Credit card", debit_card: "Debit card",
};

function methodWord(method: string): string {
  return METHODS[method] ?? method;
}

/** `RM {amount} needs review` — the row's SO holds more money than its live
 *  obligations ask for (§5). Read through the same `soRemaining` the Monitor
 *  and the Work feed use. */
function needsReviewOf(row: PaymentRegisterRow, invoices: ReturnType<typeof useInvoiceRegister>["data"]): number {
  if (!invoices || !isLivePayment(row)) return 0;
  const m = soRemaining(invoices, row.order_id);
  return m.known ? m.overpaid : 0;
}

export default function PaymentRecords() {
  const query = usePaymentRegister();
  const invoicesQ = useInvoiceRegister();
  const [selectedKeys, setSelectedKeys] = useState(new Set<string>());
  const [params, setParams] = useSearchParams();
  const orderScope = orderScopeOf(params.get("order"));
  const leaveScope = () => setParams((before) => {
    const next = new URLSearchParams(before); next.delete("order"); return next;
  });
  const open = (r: PaymentRegisterRow) => setParams((before) => {
    const next = new URLSearchParams(before); next.set("payment", r.id); return next;
  });
  const close = () => setParams((before) => {
    const next = new URLSearchParams(before); next.delete("payment"); return next;
  });
  // §4 — the reprint reads the receipt's own immutable snapshot (0449), never
  // live order data. A voided payment still prints, saying so.
  const [printing, setPrinting] = useState(false);
  const printReceipt = async (row: PaymentRegisterRow) => {
    if (printing) return;
    setPrinting(true);
    try {
      const res = await apiFetch<{
        document: ReceiptTemplateData; voided: boolean; void_reason: string | null;
      }>(`/api/finance/payments/${row.id}/receipt-document`);
      const blob = await renderReceiptPdf({
        ...res.document, voided: res.voided, void_reason: res.void_reason,
      });
      window.open(URL.createObjectURL(blob), "_blank", "noopener");
    } catch (e) {
      toast.error(`The receipt could not be opened — ${(e as Error).message}`);
    } finally {
      setPrinting(false);
    }
  };
  const printMany = async (rows: PaymentRegisterRow[]) => {
    for (const r of rows) {
      if (r.receipt_no) await printReceipt(r);
    }
  };
  const invoices = invoicesQ.data;
  const columns = useMemo<DataGridColumn<PaymentRegisterRow>[]>(() => [
    { key: "receipt", label: "Receipt No", width: 220, accessor: (r) => {
      const review = needsReviewOf(r, invoices);
      return <button type="button" className="text-left hover:underline" onClick={() => open(r)}>
        {r.receipt_no ?? "Receipt number missing"}
        {!isLivePayment(r) && <span className="ml-2 text-label">VOIDED</span>}
        {isLivePayment(r) && review > 0 && <span className="ml-2 text-label" data-testid="payment-needs-review">{rm(review)} needs review</span>}
      </button>;
    }, searchValue: (r) => r.receipt_no ?? "", filterValue: (r) => r.receipt_no ?? "", filterType: "numbering",
      exportValue: (r) => `${r.receipt_no ?? "Receipt number missing"}${isLivePayment(r) ? "" : " · VOIDED"}` },
    { key: "paid", label: "Paid date", width: 150, accessor: (r) => fmtDate(r.paid_on),
      dateValue: (r) => r.paid_on, filterType: "date", exportValue: (r) => fmtDate(r.paid_on) },
    { key: "customer", label: "Customer", width: 220,
      accessor: (r) => <button type="button" className="text-left hover:underline" onClick={() => open(r)}>
        {r.orders?.customer_name ?? "Customer not available"}</button>,
      searchValue: (r) => r.orders?.customer_name ?? "",
      exportValue: (r) => r.orders?.customer_name ?? "Customer not available" },
    { key: "so", label: "SO No", width: 110, accessor: (r) => r.orders ? `SO-${r.orders.so}` : "SO not available",
      searchValue: (r) => r.orders ? `SO-${r.orders.so}` : "" },
    { key: "amount", label: "Amount received", width: 150, align: "right", accessor: (r) => rm(r.amount),
      numberValue: (r) => r.amount, filterType: "number", exportValue: (r) => r.amount },
    { key: "method", label: "Method", width: 160, accessor: (r) => methodWord(r.method),
      searchValue: (r) => methodWord(r.method), filterType: "enum" },
    // §11 — the optional Columns chooser fields. One payment may cover several
    // invoices (§4), so Invoice is a list and never a required default.
    { key: "invoice", label: "Invoice", width: 200, defaultHidden: true,
      accessor: (r) => paymentInvoiceNumbers(r).join(", ") || "Not allocated to an invoice",
      searchValue: (r) => paymentInvoiceNumbers(r).join(" ") },
    { key: "reference", label: "Reference", width: 160, defaultHidden: true,
      accessor: (r) => r.reference ?? "No reference", searchValue: (r) => r.reference ?? "" },
    { key: "actor", label: "Recorded by", width: 160, defaultHidden: true,
      accessor: (r) => r.recorded_by_name ?? "Recorder name not available",
      searchValue: (r) => r.recorded_by_name ?? "", filterType: "enum" },
    { key: "recorded", label: "Recorded at", width: 170, defaultHidden: true,
      accessor: (r) => fmtDate(r.created_at, { time: true }), dateValue: (r) => r.created_at, filterType: "date",
      exportValue: (r) => fmtDate(r.created_at, { time: true }) },
    { key: "source", label: "Source", width: 160, defaultHidden: true,
      accessor: (r) => paymentSourceWord(r), searchValue: (r) => paymentSourceWord(r), filterType: "enum" },
    { key: "evidence", label: "Evidence", width: 140, defaultHidden: true,
      accessor: (r) => r.receipt_url ? "On file" : "None", filterType: "enum",
      filterValue: (r) => r.receipt_url ? "On file" : "None" },
    { key: "void_reason", label: "Void reason", width: 200, defaultHidden: true,
      accessor: (r) => r.void_reason ?? "", searchValue: (r) => r.void_reason ?? "" },
    { key: "exception", label: "Exception", width: 160, defaultHidden: true,
      accessor: (r) => paymentExceptionWord(r),
      searchValue: (r) => paymentExceptionWord(r), filterType: "enum" },
    // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [invoices]);
  const selected = params.get("payment");
  const payment = query.data?.find((r) => r.id === selected);
  const rows = useMemo(
    () => (query.data ?? []).filter((r) => inOrderScope(r, orderScope)),
    [query.data, orderScope],
  );
  return <div className="flex h-full min-h-0 flex-col">
    {query.isError ? <>
      <ModuleHeader destinationHeader testId="payment-records-destination-header" word="Payment Records" docTitle="Payment Records — Payments — Carres" />
      <div role="alert" className="p-6 text-body">
        <p>Payment Records could not be loaded. Try again.</p>
        <button className="btn-secondary mt-3" onClick={() => void query.refetch()}>Try again</button>
      </div>
    </>
    : selected ? payment
      ? <PaymentRecordObject payment={payment} onClose={close} printing={printing}
          onPrint={() => void printReceipt(payment)} />
      : <>
        <ModuleHeader destinationHeader testId="payment-records-destination-header" word="Payment Records" docTitle="Payment Records — Payments — Carres" />
        <div className="p-6 text-body"><p>{query.isLoading ? "Loading payment…" : "Payment not available."}</p>
          <button className="btn-secondary mt-3" onClick={close}>Back to Payment Records</button></div>
      </>
    : <>
      <ModuleHeader destinationHeader testId="payment-records-destination-header" word="Payment Records" docTitle="Payment Records — Payments — Carres" />
      <ListPageShell register>
        <DataGrid rows={rows} columns={columns} rowKey={(r) => r.id}
          storageKey="carres.payment.records.v1" appearance="reference" exportName="Payment Records"
          /* No confirmed answer is not an empty list: a PAUSED query leaves
             `isLoading` false and `data` undefined, and the grid would assert
             `No payments yet`. `!isSuccess` is the honest test. */
          groupBanner={false} stickyIdentity isLoading={!query.isSuccess} searchPlaceholder="Search payments…"
          toolbarStart={orderScope !== null ? <span className="flex items-center gap-2 text-body" data-testid="payment-records-order-scope">
            <span>SO-{orderScope} only</span>
            <button type="button" className="underline underline-offset-2" onClick={leaveScope}>Show all payments</button>
          </span> : undefined}
          selectable={{ selectedKeys, onToggle: (key) => setSelectedKeys((before) => {
            const next = new Set(before); if (next.has(key)) next.delete(key); else next.add(key); return next;
          }), onToggleAll: (keys, all) => setSelectedKeys((before) => {
            const next = new Set(before); keys.forEach((key) => { if (all) next.delete(key); else next.add(key); }); return next;
          }) }}
          /* Actual customer documents are named as such: `Print 3 receipts`.
             The listing export stays the shared Excel output and is never
             called a Receipt. */
          selectionActions={[{
            kind: "output",
            label: (n) => `Print ${n} ${n === 1 ? "receipt" : "receipts"}`,
            onClick: (selectedRows) => void printMany(selectedRows as unknown as PaymentRegisterRow[]),
          }]}
          emptyMessage={orderScope !== null
            ? `No payment is recorded on SO-${orderScope} yet.`
            : "No payments yet. Recorded customer money will appear here."}
          expandTitle="Inspect payment" onRowDoubleClick={open}
          expandable={{ renderExpansion: (r) => <Inspect row={r} onOpen={() => open(r)} /> }}
          statusSummary={(visible) => <span data-testid="payment-records-summary">{visible.length} {visible.length === 1 ? "payment" : "payments"} · {rm(visible.filter(isLivePayment).reduce((sum, r) => sum + r.amount, 0))} received</span>}
        />
      </ListPageShell>
    </>}
  </div>;
}

/** The one-row Inspect — read-only: Receipt/customer/amount once, the
 *  allocated invoices and amounts, Evidence View, paid date and time, the
 *  actual recorder, `Open payment`. No Record, Edit, Correct, Void or
 *  WhatsApp control. */
function Inspect({ row, onOpen }: { row: PaymentRegisterRow; onOpen: () => void }) {
  return <div className="p-4 text-body" data-testid="payment-inspect">
    <p>{row.receipt_no ?? "Receipt number missing"} · {row.orders?.customer_name ?? "Customer not available"} · {rm(row.amount)}
      {!isLivePayment(row) && " · VOIDED"}</p>
    <Allocation payment={row} />
    <p className="mt-1 flex items-center gap-2">
      <span>{row.receipt_url ? "Payment proof is on file." : "No payment proof on file."}</span>
      {row.receipt_url && <button type="button" className="underline underline-offset-2" onClick={() => void viewSlip(row)}>View</button>}
    </p>
    <p>Paid {fmtDate(row.paid_on)} · Recorded {fmtDate(row.created_at, { time: true })}</p>
    <p>{row.recorded_by_name ? `Recorded by ${row.recorded_by_name}` : "Recorder name not available."}</p>
    <button className="btn-secondary mt-3" onClick={onOpen}>Open payment</button>
  </div>;
}

/**
 * THE PAYMENT RECORD OBJECT — full-width, one scroll, no tabs.
 *
 *   Header   Receipt No · Customer / SO No / Payment recorded (or VOIDED)
 *   Direct   Print
 *   Overflow Correct allocation · Void payment — authorised users only
 *   Sections Payment facts → Allocated to → Evidence → Actions → Receipt → History
 */
function PaymentRecordObject({ payment, onClose, onPrint, printing }: {
  payment: PaymentRegisterRow;
  onClose: () => void;
  onPrint: () => void;
  printing: boolean;
}) {
  const qc = useQueryClient();
  const invoicesQ = useInvoiceRegister();
  const settingsQ = usePaymentSettings();
  const registry = usePaymentMethodRegistry();
  const templatesQ = useQuery<{ templates: PaymentTemplateRow[] }>({
    queryKey: ["finance", "payment-templates"],
    queryFn: () => apiFetch("/api/finance/payment-settings/templates"),
  });
  // §5 · §12 — reallocation and void are the Payment Approver's; the SERVER
  // decides. This only keeps the doors out of sight of someone who cannot
  // use them, which is what "unauthorised staff never see them" asks for.
  const me = useAuth((s) => s.user?.id ?? null);
  const myRole = useAuth((s) => s.role);
  const duties = useWorkspaceDuties();
  const mayCorrect = myRole === "principal" || (me != null && (duties.data?.duties ?? [])
    .some((d) => d.key === "payment_approver" && d.resolution?.actor_user_id === me));
  const [correcting, setCorrecting] = useState(false);
  const [voiding, setVoiding] = useState(false);
  const [sending, setSending] = useState(false);
  const live = isLivePayment(payment);
  const invoiceRows = invoicesQ.data ?? [];
  const allocatedInvoiceId = (payment.payment_allocations ?? []).find((a) => a.voided_at == null && a.invoice_id)?.invoice_id
    ?? (payment.payment_allocations ?? []).find((a) => a.invoice_id)?.invoice_id ?? null;
  const invoice = invoiceRows.find((r) => r.id === allocatedInvoiceId)
    ?? invoiceRows.find((r) => r.order_id === payment.order_id && r.kind === "sales")
    ?? invoiceRows.find((r) => r.order_id === payment.order_id);
  const remaining = invoicesQ.isSuccess ? soRemaining(invoiceRows, payment.order_id) : null;
  const stillNeeded = remaining?.known ? remaining.outstanding : null;
  const heads = (templatesQ.data?.templates ?? []).filter((t) => t.is_head && t.active);
  const wanted = (stillNeeded ?? 0) <= 0 ? "payment_received" : "partial_payment_received";
  const receiptTemplates = [
    ...heads.filter((t) => t.purpose === wanted && t.is_default),
    ...heads.filter((t) => t.purpose === wanted && !t.is_default),
    ...heads.filter((t) => (t.purpose === "payment_received" || t.purpose === "partial_payment_received") && t.purpose !== wanted),
  ];
  const canSendReceipt = live && !!payment.receipt_no && !!invoice && receiptTemplates.length > 0
    && (myRole === "operation" || myRole === "principal");
  // The money account the method lands in (0476) and, for a bank method, the
  // configured receiving account's masked ending — never a full number.
  const methodRow = (registry.data?.methods ?? []).find((m) => m.method === payment.method);
  const banks = settingsQ.data?.bank_accounts ?? [];
  const bankEndings = banks.filter((b) => b.account_no).map((b) => `${b.bank_name} ····${b.account_no!.slice(-4)}`);
  const voidPayment = useVoidPayment(payment.order_id, {
    onSuccess: () => {
      toast.success("Payment voided");
      setVoiding(false);
      void qc.invalidateQueries({ queryKey: qk.finance.paymentRegister(), exact: true });
      void qc.invalidateQueries({ queryKey: qk.finance.invoiceRegister(), exact: true });
    },
    onError: (e) => toast.error(`The payment was not voided — ${e.message}`),
  });
  const overflow = [
    ...(mayCorrect && live && payment.kind !== "storage"
      ? [{ key: "correct", label: "Correct allocation", onSelect: () => setCorrecting(true) }] : []),
    ...(mayCorrect && live
      ? [{ key: "void", label: "Void payment", onSelect: () => setVoiding(true) }] : []),
  ];
  const composing = correcting || voiding || sending;
  return <>
    <SalesOrderTabs identity={payment.receipt_no ?? "Payment"}
      customer={payment.orders?.customer_name} backLabel="Payment Records" backTo="?"
      onBack={(event) => { event.preventDefault(); setCorrecting(false); setVoiding(false); setSending(false); onClose(); }}
      status={<span data-testid="payment-record-state">{live ? "Payment recorded" : "VOIDED"}</span>}
      navigation={<span className="text-body">{payment.orders ? `SO-${payment.orders.so}` : "SO not available"}</span>}
      right={!composing ? <span className="flex items-center gap-2">
        {payment.receipt_no && <Button variant="neutral" disabled={printing} onClick={onPrint}>Print</Button>}
        {overflow.length > 0 && <DropdownMenu label="More actions" items={overflow}
          trigger={<Button variant="ghost" aria-label="More actions" data-testid="payment-record-overflow">
            <MoreHorizontal size={16} aria-hidden /></Button>} />}
      </span> : undefined}
    />
    {correcting
      ? <PaymentCorrectAllocation payment={payment} onClose={() => setCorrecting(false)} />
      : voiding
      ? <VoidPaymentForm payment={payment} pending={voidPayment.isPending}
          onCancel={() => setVoiding(false)}
          onConfirm={(reason) => voidPayment.mutate({ paymentId: payment.id, reason })} />
      : sending && invoice && canSendReceipt
      ? <InvoiceSendReceipt invoice={invoice} templates={receiptTemplates}
          receiptNo={payment.receipt_no} amount={payment.amount} stillNeeded={stillNeeded ?? 0}
          onClose={() => setSending(false)} />
      : <div className="flex-1 overflow-auto p-4" data-testid="payment-object-scroll">
      <div className="flex flex-col gap-4">
        <Facts title="Payment facts">
          <p>Amount received {rm(payment.amount)}</p>
          <p>Paid date {fmtDate(payment.paid_on)}</p>
          <p>Payment method {methodWord(payment.method)}</p>
          <p>{payment.method === "online"
            ? "Money account settled by the payment provider"
            : methodRow?.account_name
            ? `Money account ${methodRow.account_name}${bankEndings.length && (payment.method === "bank" || payment.method === "bank_transfer") ? ` · ${bankEndings.join(" · ")}` : ""}`
            : registry.isSuccess ? "Money account not configured" : "Money account not available"}</p>
          {payment.reference && <p>Reference {payment.reference}</p>}
          <p>{payment.recorded_by_name ? `Recorded by ${payment.recorded_by_name}` : "Recorder name not available"}</p>
          <p>Recorded {fmtDate(payment.created_at, { time: true })}</p>
          <p>Source {paymentSourceWord(payment)}</p>
          {!live && <p>VOIDED · {payment.void_reason ?? "Reason not available"}</p>}
        </Facts>
        <Facts title="Allocated to">
          <Allocation payment={payment} />
          <p className="mt-1">{stillNeeded != null ? `Amount still needed ${rm(stillNeeded)}`
            : invoicesQ.isSuccess && !invoiceRows.some((r) => r.order_id === payment.order_id)
              ? "No Invoice issued for this order yet, so there is no amount still needed to show."
              : "Amount still needed not available"}</p>
        </Facts>
        <Facts title="Evidence">
          <p className="flex items-center gap-2">
            <span>{payment.receipt_url ? "Payment proof is on file." : "No payment proof on file."}</span>
            {payment.receipt_url && <button type="button" className="underline underline-offset-2"
              onClick={() => void viewSlip(payment)}>View</button>}
          </p>
        </Facts>
        <Facts title="Actions">
          {canSendReceipt
            ? <button className="btn-primary" onClick={() => setSending(true)}>Send receipt</button>
            : <p className="text-label font-normal">{!live ? "A voided Receipt cannot be sent as a valid Receipt."
              : !payment.receipt_no ? "This payment has no receipt number, so there is no Receipt to send."
              : receiptTemplates.length === 0 ? "No receipt template yet. Ask a manager to add the approved wording in Settings."
              : "Sending a Receipt is done by Operation."}</p>}
        </Facts>
        <Facts title="Receipt">
          <p>{payment.receipt_no ?? "Receipt number missing"}</p>
          {!live && <p>VOIDED · {payment.void_reason ?? "Reason not available"}</p>}
          {payment.receipt_no
            ? <button className="btn-secondary mt-2" disabled={printing} onClick={onPrint}>Print receipt</button>
            : <p>This payment has no receipt number, so it has no receipt.</p>}
        </Facts>
        <Facts title="History">
          <p>Payment recorded · {fmtDate(payment.created_at, { time: true })}</p>
          <p>{payment.recorded_by_name ?? "Recorder name not available."}</p>
          {payment.voided_at && <p>Payment voided · {fmtDate(payment.voided_at)} · {payment.void_reason}</p>}
        </Facts>
      </div>
    </div>}
  </>;
}

/** `Void payment` — a wrong or duplicate Payment. There is no delete and no
 *  silent amount edit: the row stays, stops being money, keeps its Receipt
 *  marked VOIDED, and carries the reason, actor and time. */
function VoidPaymentForm({ payment, pending, onCancel, onConfirm }: {
  payment: PaymentRegisterRow;
  pending: boolean;
  onCancel: () => void;
  onConfirm: (reason: string) => void;
}) {
  const [reason, setReason] = useState("");
  return <div className="flex-1 overflow-auto p-4" data-testid="payment-void-form">
    <Facts title="Void payment">
      <p>{payment.receipt_no ?? "This payment"} · {rm(payment.amount)} will stop counting as money. The Receipt stays and is marked VOIDED.</p>
      <label className="mt-2 block">
        <span className="text-label">Why is this payment being voided</span>
        <textarea className="mt-0.5 w-full rounded-md border border-base-200 px-2 py-1.5 text-body"
          rows={3} value={reason} maxLength={500} onChange={(e) => setReason(e.target.value)}
          aria-label="Why is this payment being voided" />
      </label>
      <span className="mt-3 flex flex-wrap gap-2">
        <button className="btn-primary" disabled={pending || !reason.trim()} onClick={() => onConfirm(reason.trim())}>Void payment</button>
        <button className="btn-secondary" onClick={onCancel}>Cancel</button>
      </span>
    </Facts>
  </div>;
}

function Allocation({ payment }: { payment: PaymentRegisterRow }) {
  const allocations = payment.payment_allocations ?? [];
  return allocations.length ? <div>{allocations.map((a) => {
    const inv = Array.isArray(a.invoices) ? a.invoices[0] : a.invoices;
    return <p key={a.id}>
      {inv?.invoice_no ?? (a.order_id === payment.order_id && payment.orders ? `SO-${payment.orders.so}` : "Sales Order")} · {rm(a.amount)}
      {a.voided_at ? " · VOIDED" : ""}
    </p>;
  })}</div> : <p>No allocation on file.</p>;
}

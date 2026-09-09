import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { isLivePayment } from "@carres/shared";
import type { PaymentRegisterRow } from "@carres/shared/payment-register";
import { paymentExceptionWord, paymentInvoiceNumbers } from "@carres/shared/payment-register";
import { inOrderScope, orderScopeOf, scopedRegisterHref } from "@carres/shared/payment-register-scope";
import ListPageShell from "@/components/ListPageShell";
import { SectionCard } from "@/components/SectionPanel";
import { DataGrid, type DataGridColumn } from "@/components/register/DataGrid";
import { usePaymentRegister, useWorkspaceDuties } from "@/lib/queries";
import { useAuth } from "@/lib/auth";
import PaymentCorrectAllocation from "./PaymentCorrectAllocation";
import { fmtDate } from "@/lib/fmt-date";
import { rm } from "@/lib/format-currency";
import ModuleHeader from "@/pages/operation/components/ModuleHeader";
import SalesOrderTabs from "@/pages/operation/SalesOrderTabs";
import { apiFetch } from "@/lib/api";
import { renderReceiptPdf } from "@/lib/pdf/render";
import type { ReceiptTemplateData } from "@/lib/pdf/types";
import { toast } from "sonner";

const METHODS: Record<string, string> = {
  bank: "Bank transfer", bank_transfer: "Bank transfer", cash: "Cash", card: "Card",
  cheque: "Cheque", online: "Online payment", other: "Other",
  duitnow_qr: "DuitNow QR", credit_card: "Credit card", debit_card: "Debit card",
};

/** The canonical read-only register. Writes remain in the Invoice action context. */
export default function PaymentRegister() {
  const query = usePaymentRegister();
  const [selectedKeys, setSelectedKeys] = useState(new Set<string>());
  const [params, setParams] = useSearchParams();
  /* THE ORDER SCOPE (entry-point correction, 2026-09-09) — the Sales Order's
     `Open this order in Payment` door and every old `?tab=payments&so=` link
     arrive here asking about ONE order, so the listing answers about that
     order and says so. Leaving the scope is one control, never a back button. */
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
  // live order data, so the paper in the customer's hand can never be rewritten
  // by a later rename or correction. A voided payment still prints, saying so.
  const [printing, setPrinting] = useState(false);
  // §5 · §12 — reallocation is the Payment Approver's. The SERVER decides it;
  // this only stops the form being offered to someone who cannot use it, which
  // is what "unauthorised staff never see them" asks for.
  const [correcting, setCorrecting] = useState(false);
  const me = useAuth((s) => s.user?.id ?? null);
  const myRole = useAuth((s) => s.role);
  const duties = useWorkspaceDuties();
  const mayCorrect = myRole === "principal" || (me != null && (duties.data?.duties ?? [])
    .some((d) => d.key === "payment_approver" && d.resolution?.actor_user_id === me));
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
  const columns = useMemo<DataGridColumn<PaymentRegisterRow>[]>(() => [
    { key: "receipt", label: "Receipt No", width: 200, accessor: (r) => <span>
      {r.receipt_no ?? "Receipt number missing"}
      {!isLivePayment(r) && <span className="ml-2 text-label">VOIDED</span>}
    </span>, searchValue: (r) => r.receipt_no ?? "", filterValue: (r) => r.receipt_no ?? "", filterType: "numbering",
      exportValue: (r) => `${r.receipt_no ?? "Receipt number missing"}${isLivePayment(r) ? "" : " · VOIDED"}` },
    { key: "paid", label: "Paid Date", width: 150, accessor: (r) => fmtDate(r.paid_on),
      dateValue: (r) => r.paid_on, filterType: "date", exportValue: (r) => fmtDate(r.paid_on) },
    { key: "customer", label: "Customer", width: 220, accessor: (r) => r.orders?.customer_name ?? "Customer not available",
      searchValue: (r) => r.orders?.customer_name ?? "" },
    { key: "so", label: "SO No", width: 110, accessor: (r) => r.orders ? `SO-${r.orders.so}` : "SO not available",
      searchValue: (r) => r.orders ? `SO-${r.orders.so}` : "" },
    { key: "amount", label: "Amount", width: 140, align: "right", accessor: (r) => rm(r.amount),
      numberValue: (r) => r.amount, filterType: "number", exportValue: (r) => r.amount },
    { key: "method", label: "Method", width: 160, accessor: (r) => METHODS[r.method] ?? r.method,
      searchValue: (r) => METHODS[r.method] ?? r.method, filterType: "enum" },
    // §11 — history is filterable by INVOICE, ACTOR and EXCEPTION too. One
    // payment may cover several invoices (§4), so the invoice cell is a list
    // and says so honestly when there is none.
    { key: "invoice", label: "Invoice", width: 200,
      accessor: (r) => paymentInvoiceNumbers(r).join(", ") || "Not allocated to an invoice",
      searchValue: (r) => paymentInvoiceNumbers(r).join(" ") },
    { key: "actor", label: "Recorded by", width: 160,
      accessor: (r) => r.recorded_by_name ?? "Recorder name not available",
      searchValue: (r) => r.recorded_by_name ?? "", filterType: "enum" },
    { key: "exception", label: "Exception", width: 160,
      accessor: (r) => paymentExceptionWord(r),
      searchValue: (r) => paymentExceptionWord(r), filterType: "enum" },
  ], []);
  const selected = params.get("payment");
  const payment = query.data?.find((r) => r.id === selected);
  // The complete set is already in hand (the hook pages until `total`), so
  // this narrows an exact list — it never hides a row from an unfetched page.
  const rows = useMemo(
    () => (query.data ?? []).filter((r) => inOrderScope(r, orderScope)),
    [query.data, orderScope],
  );
  return <div className="flex h-full min-h-0 flex-col">
    {payment ? <SalesOrderTabs identity={payment.receipt_no ?? "Payment"}
      customer={payment.orders?.customer_name} backLabel="Payments" backTo="?"
      onBack={(event) => { event.preventDefault(); close(); }}
      status={!isLivePayment(payment) ? <span>VOIDED</span> : undefined}
      navigation={<span className="text-body">{payment.orders ? `SO-${payment.orders.so}` : "SO not available"}</span>}
    /> : <ModuleHeader destinationHeader testId="payments-destination-header" word="Payments" docTitle="Payments — Carres" />}
    {query.isError ? <div role="alert" className="p-6 text-body">
      <p>Payments could not be loaded. Try again.</p>
      <button className="btn-secondary mt-3" onClick={() => void query.refetch()}>Try again</button>
    </div> : selected ? payment ? correcting
      ? <PaymentCorrectAllocation payment={payment} onClose={() => setCorrecting(false)} />
      : <div className="flex-1 overflow-auto p-4" data-testid="payment-object-scroll">
      <div className="flex flex-col gap-4">
        <Facts title="Payment facts"><p>{rm(payment.amount)} · {METHODS[payment.method] ?? payment.method} · {fmtDate(payment.paid_on)}</p>
          <p>{payment.orders ? `SO-${payment.orders.so}` : "SO not available"}</p>
          {!isLivePayment(payment) && <p>VOIDED · {payment.void_reason ?? "Reason not available"}</p>}
        </Facts>
        <Facts title="Allocated to"><Allocation payment={payment} />
          {mayCorrect && isLivePayment(payment) && payment.kind !== "storage"
            && <button className="btn-secondary mt-2"
                 onClick={() => setCorrecting(true)}>Correct allocation</button>}</Facts>
        <Facts title="Evidence"><p>{payment.receipt_url ? "Payment proof is on file." : "No payment proof on file."}</p>
          {payment.reference && <p>Reference: {payment.reference}</p>}</Facts>
        <Facts title="Receipt"><p>{payment.receipt_no ?? "Receipt number missing"}</p>
          {!isLivePayment(payment) && <p>VOIDED · {payment.void_reason ?? "Reason not available"}</p>}
          {payment.receipt_no
            ? <button className="btn-secondary mt-2" disabled={printing}
                onClick={() => void printReceipt(payment)}>Print receipt</button>
            : <p>This payment has no receipt number, so it has no receipt.</p>}</Facts>
        <Facts title="History"><p>Payment recorded · {fmtDate(payment.created_at, { time: true })}</p>
          <p>{payment.recorded_by_name ?? "Recorder name not available."}</p>
          {payment.voided_at && <p>Payment voided · {fmtDate(payment.voided_at)} · {payment.void_reason}</p>}</Facts>
      </div>
    </div> : <div className="p-6 text-body"><p>{query.isLoading ? "Loading payment…" : "Payment not available."}</p>
      <button className="btn-secondary mt-3" onClick={close}>Back to Payments</button></div>
    : <ListPageShell register>
      <DataGrid rows={rows} columns={columns} rowKey={(r) => r.id}
        storageKey="carres.payment.register.v1" appearance="reference" exportName="Payments"
        groupBanner={false} stickyIdentity isLoading={query.isLoading} searchPlaceholder="Search payments…"
        toolbarStart={<span className="flex items-center gap-3 text-body">
          <span aria-current="page" className="font-semibold">Payments</span>
          <Link to={scopedRegisterHref("/finance/invoices", orderScope)}>Invoices</Link>
          {orderScope !== null && <span className="flex items-center gap-2" data-testid="payment-register-order-scope">
            <span>SO-{orderScope} only</span>
            <button type="button" className="underline underline-offset-2"
              onClick={leaveScope}>Show all payments</button>
          </span>}
        </span>}
        selectable={{ selectedKeys, onToggle: (key) => setSelectedKeys((before) => {
          const next = new Set(before); if (next.has(key)) next.delete(key); else next.add(key); return next;
        }), onToggleAll: (keys, all) => setSelectedKeys((before) => {
          const next = new Set(before); keys.forEach((key) => { if (all) next.delete(key); else next.add(key); }); return next;
        }) }}
        emptyMessage={orderScope !== null
          ? `No payment is recorded on SO-${orderScope} yet.`
          : "No payments yet. Recorded customer money will appear here."}
        expandTitle="Inspect payment" onRowDoubleClick={open}
        expandable={{ renderExpansion: (r) => <div className="p-4 text-body">
          <Allocation payment={r} /><p>{r.receipt_url ? "Payment proof is on file." : "No payment proof on file."}</p>
          <p>Payment recorded · {fmtDate(r.created_at, { time: true })}</p>
          <p>{r.recorded_by_name ?? "Recorder name not available."}</p>
          <button className="btn-secondary mt-3" onClick={() => open(r)}>Open payment</button>
        </div> }}
        statusSummary={(visible) => <span data-testid="payment-register-summary">{visible.length} {visible.length === 1 ? "payment" : "payments"} · {rm(visible.filter(isLivePayment).reduce((sum, r) => sum + r.amount, 0))} received</span>}
      />
    </ListPageShell>}
  </div>;
}

function Facts({ title, children }: { title: string; children: React.ReactNode }) {
  return <SectionCard><div className="p-3"><h2 className="text-strong mb-2">{title}</h2>
    <div className="text-body">{children}</div></div></SectionCard>;
}
function Allocation({ payment }: { payment: PaymentRegisterRow }) {
  const allocations = payment.payment_allocations ?? [];
  return allocations.length ? <div>{allocations.map((a) => <p key={a.id}>
    {a.order_id === payment.order_id && payment.orders ? `SO-${payment.orders.so}` : "Sales Order"} · {rm(a.amount)}
    {a.voided_at ? " · VOIDED" : ""}
  </p>)}</div> : <p>No allocation on file.</p>;
}

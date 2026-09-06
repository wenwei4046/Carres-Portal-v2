import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { isLivePayment } from "@carres/shared";
import type { PaymentRegisterRow } from "@carres/shared/payment-register";
import ListPageShell from "@/components/ListPageShell";
import { SectionCard } from "@/components/SectionPanel";
import { DataGrid, type DataGridColumn } from "@/components/register/DataGrid";
import { usePaymentRegister } from "@/lib/queries";
import { fmtDate } from "@/lib/fmt-date";
import { rm } from "@/lib/format-currency";
import ModuleHeader from "@/pages/operation/components/ModuleHeader";
import SalesOrderTabs from "@/pages/operation/SalesOrderTabs";

const METHODS: Record<string, string> = {
  bank: "Bank transfer", bank_transfer: "Bank transfer", cash: "Cash", card: "Card",
  cheque: "Cheque", online: "Online payment", other: "Other",
};

/** The canonical read-only register. Writes remain in the Invoice action context. */
export default function PaymentRegister() {
  const query = usePaymentRegister();
  const [selectedKeys, setSelectedKeys] = useState(new Set<string>());
  const [params, setParams] = useSearchParams();
  const open = (r: PaymentRegisterRow) => setParams((before) => {
    const next = new URLSearchParams(before); next.set("payment", r.id); return next;
  });
  const close = () => setParams((before) => {
    const next = new URLSearchParams(before); next.delete("payment"); return next;
  });
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
      searchValue: (r) => METHODS[r.method] ?? r.method },
  ], []);
  const selected = params.get("payment");
  const payment = query.data?.find((r) => r.id === selected);
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
    </div> : selected ? payment ? <div className="flex-1 overflow-auto p-4" data-testid="payment-object-scroll">
      <div className="flex flex-col gap-4">
        <Facts title="Payment facts"><p>{rm(payment.amount)} · {METHODS[payment.method] ?? payment.method} · {fmtDate(payment.paid_on)}</p>
          <p>{payment.orders ? `SO-${payment.orders.so}` : "SO not available"}</p>
          {!isLivePayment(payment) && <p>VOIDED · {payment.void_reason ?? "Reason not available"}</p>}
        </Facts>
        <Facts title="Allocated to"><Allocation payment={payment} /></Facts>
        <Facts title="Evidence"><p>{payment.receipt_url ? "Payment proof is on file." : "No payment proof on file."}</p>
          {payment.reference && <p>Reference: {payment.reference}</p>}</Facts>
        <Facts title="Receipt"><p>{payment.receipt_no ?? "Receipt number missing"}</p>
          {!isLivePayment(payment) && <p>VOIDED · {payment.void_reason ?? "Reason not available"}</p>}
          <p>Receipt document is not available.</p></Facts>
        <Facts title="History"><p>Payment recorded · {fmtDate(payment.created_at, { time: true })}</p>
          <p>{payment.recorded_by_name ?? "Recorder name not available."}</p>
          {payment.voided_at && <p>Payment voided · {fmtDate(payment.voided_at)} · {payment.void_reason}</p>}</Facts>
      </div>
    </div> : <div className="p-6 text-body"><p>{query.isLoading ? "Loading payment…" : "Payment not available."}</p>
      <button className="btn-secondary mt-3" onClick={close}>Back to Payments</button></div>
    : <ListPageShell register>
      <DataGrid rows={query.data ?? []} columns={columns} rowKey={(r) => r.id}
        storageKey="carres.payment.register.v1" appearance="reference" exportName="Payments"
        groupBanner={false} stickyIdentity isLoading={query.isLoading} searchPlaceholder="Search payments…"
        toolbarStart={<span className="flex gap-3 text-body"><span aria-current="page" className="font-semibold">Payments</span><Link to="/finance/invoices">Invoices</Link></span>}
        selectable={{ selectedKeys, onToggle: (key) => setSelectedKeys((before) => {
          const next = new Set(before); if (next.has(key)) next.delete(key); else next.add(key); return next;
        }), onToggleAll: (keys, all) => setSelectedKeys((before) => {
          const next = new Set(before); keys.forEach((key) => { if (all) next.delete(key); else next.add(key); }); return next;
        }) }}
        emptyMessage="No payments yet. Recorded customer money will appear here."
        expandTitle="Inspect payment" onRowDoubleClick={open}
        expandable={{ renderExpansion: (r) => <div className="p-4 text-body">
          <Allocation payment={r} /><p>{r.receipt_url ? "Payment proof is on file." : "No payment proof on file."}</p>
          <p>Payment recorded · {fmtDate(r.created_at, { time: true })}</p>
          <p>{r.recorded_by_name ?? "Recorder name not available."}</p>
          <button className="btn-secondary mt-3" onClick={() => open(r)}>Open payment</button>
        </div> }}
        statusSummary={(visible) => <span data-testid="payment-register-summary">{visible.length} payments · {rm(visible.filter(isLivePayment).reduce((sum, r) => sum + r.amount, 0))} received</span>}
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

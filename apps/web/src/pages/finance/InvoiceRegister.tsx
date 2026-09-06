import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import type { InvoiceRegisterRow } from "@carres/shared/payment-invoice-register";
import {
  invoiceCustomerDelivery,
  invoiceGoodsFacts,
  invoiceGoodsWord,
  invoiceNeeded,
  invoicePaymentTiming,
} from "@carres/shared/payment-invoice-register";
import { myHolidaySet } from "@carres/shared/my-holidays";
import ListPageShell from "@/components/ListPageShell";
import { SectionCard } from "@/components/SectionPanel";
import { DataGrid, type DataGridColumn } from "@/components/register/DataGrid";
import { useInvoiceRegister } from "@/lib/queries";
import { fmtDate } from "@/lib/fmt-date";
import { rm } from "@/lib/format-currency";
import ModuleHeader from "@/pages/operation/components/ModuleHeader";
import SalesOrderTabs from "@/pages/operation/SalesOrderTabs";

function todayIso() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kuala_Lumpur" });
}

/** The §16 Invoices Register cells, derived once per row through the shared
 *  arithmetic (Law D) so screen, export and object cannot disagree. */
function factsOf(row: InvoiceRegisterRow, today: string, opts: { holidays?: Set<string> }) {
  const money = invoiceNeeded(row);
  const goods = invoiceGoodsFacts(row);
  const delivery = invoiceCustomerDelivery(row);
  const { timing } = invoicePaymentTiming(row, today, opts);
  const neededWord = money.known ? rm(money.outstanding) : "Value not recorded";
  const arrivalWord = goods.completed || goods.goodsReady
    ? "Goods ready"
    : goods.arrivalIso
      ? fmtDate(goods.arrivalIso)
      : "Not confirmed";
  const deliveryWord =
    delivery.word === "customer_not_sure" ? "Customer not sure"
    : delivery.word === "no_date" ? "No delivery date"
    : fmtDate(delivery.dateIso!);
  const timingWord =
    timing.kind === "paid" ? "Paid"
    : timing.kind === "wait" ? "Wait"
    : timing.kind === "no_date" ? "No delivery date"
    : timing.kind === "late" ? "Should have been paid"
    : `Due ${fmtDate(timing.dueIso)}`;
  return { money, goods, delivery, timing, neededWord, arrivalWord, deliveryWord, timingWord };
}

function identityOf(row: InvoiceRegisterRow): string {
  return row.invoice_no ?? "Draft";
}

// A draft's identity already says Draft; only a void needs a second mark.
const STATUS_MARK: Record<string, string | null> = {
  draft: null, issued: null, voided: "VOIDED",
};

/** The canonical read-only Invoices Register. Writes stay behind the governed
 *  lifecycle doors; no Record, Edit, Void or WhatsApp control lives here. */
export default function InvoiceRegister() {
  const query = useInvoiceRegister();
  const [selectedKeys, setSelectedKeys] = useState(new Set<string>());
  const [params, setParams] = useSearchParams();
  const today = todayIso();
  const opts = useMemo(() => ({ holidays: myHolidaySet() }), []);
  const open = (r: InvoiceRegisterRow) => setParams((before) => {
    const next = new URLSearchParams(before); next.set("invoice", r.id); return next;
  });
  const close = () => setParams((before) => {
    const next = new URLSearchParams(before); next.delete("invoice"); return next;
  });
  const columns = useMemo<DataGridColumn<InvoiceRegisterRow>[]>(() => [
    { key: "invoice", label: "Invoice No", width: 190, accessor: (r) => <span>
      {identityOf(r)}
      {STATUS_MARK[r.status] && <span className="ml-2 text-label">{STATUS_MARK[r.status]}</span>}
    </span>, searchValue: (r) => r.invoice_no ?? "Draft", filterValue: (r) => r.invoice_no ?? "Draft",
      filterType: "numbering",
      exportValue: (r) => `${identityOf(r)}${STATUS_MARK[r.status] ? ` · ${STATUS_MARK[r.status]}` : ""}` },
    { key: "customer", label: "Customer", width: 210,
      accessor: (r) => r.orders?.customer_name ?? "Customer not available",
      searchValue: (r) => r.orders?.customer_name ?? "" },
    { key: "so", label: "SO No", width: 100,
      accessor: (r) => r.orders ? `SO-${r.orders.so}` : "SO not available",
      searchValue: (r) => r.orders ? `SO-${r.orders.so}` : "" },
    { key: "needed", label: "Needed", width: 130, align: "right",
      accessor: (r) => factsOf(r, today, opts).neededWord,
      numberValue: (r) => invoiceNeeded(r).outstanding, filterType: "number",
      exportValue: (r) => factsOf(r, today, opts).neededWord },
    { key: "goods", label: "Goods", width: 190, accessor: (r) => invoiceGoodsWord(r),
      searchValue: (r) => invoiceGoodsWord(r) },
    { key: "arrival", label: "Expected arrival", width: 150,
      accessor: (r) => factsOf(r, today, opts).arrivalWord,
      dateValue: (r) => invoiceGoodsFacts(r).arrivalIso, filterType: "date",
      exportValue: (r) => factsOf(r, today, opts).arrivalWord },
    { key: "delivery", label: "Customer Delivery", width: 160,
      accessor: (r) => factsOf(r, today, opts).deliveryWord,
      dateValue: (r) => invoiceCustomerDelivery(r).dateIso, filterType: "date",
      exportValue: (r) => factsOf(r, today, opts).deliveryWord },
    { key: "timing", label: "Payment Timing", width: 180,
      accessor: (r) => factsOf(r, today, opts).timingWord,
      searchValue: (r) => factsOf(r, today, opts).timingWord,
      exportValue: (r) => factsOf(r, today, opts).timingWord },
  ], [today, opts]);
  const selected = params.get("invoice");
  const invoice = query.data?.find((r) => r.id === selected);
  return <div className="flex h-full min-h-0 flex-col">
    {invoice ? <SalesOrderTabs identity={identityOf(invoice)}
      customer={invoice.orders?.customer_name} backLabel="Invoices" backTo="?"
      onBack={(event) => { event.preventDefault(); close(); }}
      status={STATUS_MARK[invoice.status] ? <span>{STATUS_MARK[invoice.status]}</span> : undefined}
      navigation={<span className="text-body">{invoice.orders ? `SO-${invoice.orders.so}` : "SO not available"}</span>}
    /> : <ModuleHeader destinationHeader testId="invoices-destination-header" word="Invoices" docTitle="Invoices — Carres" />}
    {query.isError ? <div role="alert" className="p-6 text-body">
      <p>Invoices could not be loaded. Try again.</p>
      <button className="btn-secondary mt-3" onClick={() => void query.refetch()}>Try again</button>
    </div> : selected ? invoice ? <InvoiceObject invoice={invoice} today={today} opts={opts} />
    : <div className="p-6 text-body"><p>{query.isLoading ? "Loading invoice…" : "Invoice not available."}</p>
      <button className="btn-secondary mt-3" onClick={close}>Back to Invoices</button></div>
    : <ListPageShell register>
      <DataGrid rows={query.data ?? []} columns={columns} rowKey={(r) => r.id}
        storageKey="carres.invoice.register.v1" appearance="reference" exportName="Invoices"
        groupBanner={false} stickyIdentity isLoading={query.isLoading} searchPlaceholder="Search invoices…"
        toolbarStart={<span className="flex gap-3 text-body"><Link to="/finance/payments">Payments</Link><span aria-current="page" className="font-semibold">Invoices</span></span>}
        selectable={{ selectedKeys, onToggle: (key) => setSelectedKeys((before) => {
          const next = new Set(before); if (next.has(key)) next.delete(key); else next.add(key); return next;
        }), onToggleAll: (keys, all) => setSelectedKeys((before) => {
          const next = new Set(before); keys.forEach((key) => { if (all) next.delete(key); else next.add(key); }); return next;
        }) }}
        emptyMessage="No invoices yet. A prepared or issued invoice will appear here."
        expandTitle="Inspect invoice" onRowDoubleClick={open}
        expandable={{ renderExpansion: (r) => <Inspect row={r} today={today} opts={opts} onOpen={() => open(r)} /> }}
        statusSummary={(visible) => {
          const live = visible.filter((r) => r.status !== "voided");
          const needed = live.reduce((sum, r) => {
            const m = invoiceNeeded(r); return sum + (m.known ? m.outstanding : 0);
          }, 0);
          return <span data-testid="invoice-register-summary">{visible.length} invoices · {rm(needed)} still needed</span>;
        }}
      />
    </ListPageShell>}
  </div>;
}

function Inspect({ row, today, opts, onOpen }: {
  row: InvoiceRegisterRow; today: string; opts: { holidays?: Set<string> };
  onOpen: () => void;
}) {
  const f = factsOf(row, today, opts);
  const partner = row.orders?.delivery_partners?.name ?? row.orders?.ops_assigned_logistic ?? null;
  const contact = row.orders?.delivery_partners?.contact ?? null;
  return <div className="p-4 text-body">
    <p>{f.neededWord === "Value not recorded" ? "Value not recorded" : `${f.neededWord} still needed`} · {rm(row.amount)} on this invoice</p>
    <p>{invoiceGoodsWord(row)} · Customer Delivery: {f.deliveryWord}</p>
    <p>{partner ? `Logistics Partner: ${partner}${contact ? ` · ${contact}` : " · No customer contact on file yet."}` : "No Logistics Partner assigned yet."}</p>
    <p>No messages recorded yet.</p>
    <button className="btn-secondary mt-3" onClick={onOpen}>Open invoice</button>
  </div>;
}

/** One continuous scroll — Money → Goods and Delivery → What to do → Invoice
 *  → Related Payments → Communication History (payment/MASTER.md §16). */
function InvoiceObject({ invoice, today, opts }: {
  invoice: InvoiceRegisterRow; today: string; opts: { holidays?: Set<string> };
}) {
  const f = factsOf(invoice, today, opts);
  const partner = invoice.orders?.delivery_partners?.name ?? invoice.orders?.ops_assigned_logistic ?? null;
  const contact = invoice.orders?.delivery_partners?.contact ?? null;
  const payments = (invoice.orders?.order_payments ?? [])
    .slice()
    .sort((a, b) => (a.paid_on < b.paid_on ? 1 : -1));
  return <div className="flex-1 overflow-auto p-4" data-testid="invoice-object-scroll">
    <div className="flex flex-col gap-4">
      <Facts title="Money">
        <p>{f.money.known ? `${rm(f.money.outstanding)} still needed` : "Value not recorded"}</p>
        <p>{f.money.total != null ? `Order value ${rm(f.money.total)} · Paid ${rm(f.money.paid)}` : "This order has no value on record."}</p>
      </Facts>
      <Facts title="Goods and Delivery">
        <p>{invoiceGoodsWord(invoice)}</p>
        <p>Customer Delivery: {f.deliveryWord}</p>
        <p>{partner ? `Logistics Partner: ${partner}${contact ? ` · ${contact}` : " · No customer contact on file yet."}` : "No Logistics Partner assigned yet."}</p>
      </Facts>
      <Facts title="What to do">
        {f.timing.kind === "paid" ? <p>The money is in. Nothing to do.</p>
        : f.timing.kind === "wait" ? <>
          <p>Wait</p>
          <p className="text-label font-normal">Goods are not ready and arrival is not confirmed. Do not ask the customer to pay yet.</p>
        </> : f.timing.kind === "no_date" ? <>
          <p>No delivery date</p>
          <p className="text-label font-normal">The clock starts when the customer has a delivery date.</p>
        </> : f.timing.kind === "late" ? <>
          <p>{rm(f.money.outstanding)} should have been paid</p>
          <p className="text-label font-normal">Ask the customer to pay · Record the result.</p>
        </> : <>
          <p>{rm(f.money.outstanding)} needed by {fmtDate(f.timing.dueIso)}</p>
          <p className="text-label font-normal">Ask the customer to pay · Record the result.</p>
        </>}
      </Facts>
      <Facts title="Invoice">
        <p>{invoice.invoice_no ?? "No invoice number yet — this is a draft."}</p>
        <p>{invoice.status === "issued" && invoice.issued_at ? `Issued · ${fmtDate(invoice.issued_at)}`
          : invoice.status === "voided" ? `VOIDED · ${invoice.void_reason ?? "Reason not available"}`
          : "Draft — it can still be edited and issued."}</p>
        <p>{rm(invoice.amount)}{Number(invoice.tax_amount) > 0 ? ` · Tax ${rm(Number(invoice.tax_amount))}` : ""}</p>
        {invoice.replaces_invoice_id && <p>This invoice replaces a voided invoice.</p>}
        <p>Invoice document is not available yet.</p>
      </Facts>
      <Facts title="Related Payments">
        {payments.length ? payments.map((p) => <p key={p.id}>
          {p.receipt_no ?? "Receipt number missing"} · {rm(p.amount)} · {fmtDate(p.paid_on)}
          {p.voided_at ? " · VOIDED" : ""}
        </p>) : <p>No payments recorded for this order yet.</p>}
      </Facts>
      <Facts title="Communication History">
        <p>No messages recorded yet.</p>
      </Facts>
    </div>
  </div>;
}

function Facts({ title, children }: { title: string; children: React.ReactNode }) {
  return <SectionCard><div className="p-3"><h2 className="text-strong mb-2">{title}</h2>
    <div className="text-body">{children}</div></div></SectionCard>;
}

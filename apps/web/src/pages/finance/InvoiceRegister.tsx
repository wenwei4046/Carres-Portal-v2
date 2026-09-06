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
import InvoiceRecordPayment from "./InvoiceRecordPayment";
import InvoiceAskToPay from "./InvoiceAskToPay";
import InvoiceCalendar, { type CalendarEntryKind } from "./InvoiceCalendar";
import { useAuth } from "@/lib/auth";
import { apiFetch } from "@/lib/api";
import { renderInvoicePdf } from "@/lib/pdf/render";
import type { InvoiceTemplateData } from "@/lib/pdf/types";
import { toast } from "sonner";
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
  // §17 — a date cell is a door into the Calendar view at that date's fixed
  // workweek, carrying the exact SO to highlight. A record without a usable
  // date stays in the listing with its honest words and no door.
  const openCalendar = (r: InvoiceRegisterRow, dateIso: string, from: CalendarEntryKind) =>
    setParams((before) => {
      const next = new URLSearchParams(before);
      next.set("view", "calendar");
      next.set("date", dateIso);
      next.set("so", r.order_id);
      next.set("from", from);
      return next;
    });
  const closeCalendar = () => setParams((before) => {
    const next = new URLSearchParams(before);
    next.delete("view"); next.delete("date"); next.delete("so"); next.delete("from");
    return next;
  });
  const columns = useMemo<DataGridColumn<InvoiceRegisterRow>[]>(() => [
    // §17 — Customer / SO / Invoice open the collection details (never an
    // automatic switch to Calendar); the exact row keeps the exact SO.
    { key: "invoice", label: "Invoice No", width: 190, accessor: (r) => <button type="button"
      className="text-left hover:underline" onClick={() => open(r)}>
      {identityOf(r)}
      {STATUS_MARK[r.status] && <span className="ml-2 text-label">{STATUS_MARK[r.status]}</span>}
    </button>, searchValue: (r) => r.invoice_no ?? "Draft", filterValue: (r) => r.invoice_no ?? "Draft",
      filterType: "numbering",
      exportValue: (r) => `${identityOf(r)}${STATUS_MARK[r.status] ? ` · ${STATUS_MARK[r.status]}` : ""}` },
    { key: "customer", label: "Customer", width: 210,
      accessor: (r) => <button type="button" className="text-left hover:underline"
        onClick={() => open(r)}>{r.orders?.customer_name ?? "Customer not available"}</button>,
      searchValue: (r) => r.orders?.customer_name ?? "",
      exportValue: (r) => r.orders?.customer_name ?? "Customer not available" },
    { key: "so", label: "SO No", width: 100,
      accessor: (r) => <button type="button" className="text-left hover:underline"
        onClick={() => open(r)}>{r.orders ? `SO-${r.orders.so}` : "SO not available"}</button>,
      searchValue: (r) => r.orders ? `SO-${r.orders.so}` : "",
      exportValue: (r) => r.orders ? `SO-${r.orders.so}` : "SO not available" },
    { key: "needed", label: "Needed", width: 130, align: "right",
      accessor: (r) => factsOf(r, today, opts).neededWord,
      numberValue: (r) => invoiceNeeded(r).outstanding, filterType: "number",
      exportValue: (r) => factsOf(r, today, opts).neededWord },
    { key: "goods", label: "Goods", width: 190, accessor: (r) => invoiceGoodsWord(r),
      searchValue: (r) => invoiceGoodsWord(r) },
    { key: "arrival", label: "Expected arrival", width: 150,
      accessor: (r) => {
        const iso = invoiceGoodsFacts(r).arrivalIso;
        const word = factsOf(r, today, opts).arrivalWord;
        return iso ? <button type="button" className="text-left hover:underline"
          aria-label={`Open Calendar · Expected arrival ${word}`}
          onClick={() => openCalendar(r, iso, "arrival")}>{word}</button> : word;
      },
      dateValue: (r) => invoiceGoodsFacts(r).arrivalIso, filterType: "date",
      exportValue: (r) => factsOf(r, today, opts).arrivalWord },
    { key: "delivery", label: "Customer Delivery", width: 160,
      accessor: (r) => {
        const iso = invoiceCustomerDelivery(r).dateIso;
        const word = factsOf(r, today, opts).deliveryWord;
        return iso ? <button type="button" className="text-left hover:underline"
          aria-label={`Open Calendar · Customer Delivery ${word}`}
          onClick={() => openCalendar(r, iso, "delivery")}>{word}</button> : word;
      },
      dateValue: (r) => invoiceCustomerDelivery(r).dateIso, filterType: "date",
      exportValue: (r) => factsOf(r, today, opts).deliveryWord },
    { key: "timing", label: "Payment Timing", width: 180,
      accessor: (r) => factsOf(r, today, opts).timingWord,
      searchValue: (r) => factsOf(r, today, opts).timingWord,
      exportValue: (r) => factsOf(r, today, opts).timingWord },
  ], [today, opts]);
  const selected = params.get("invoice");
  const invoice = query.data?.find((r) => r.id === selected);
  // §16 — 50/50 exists only while recording Payment; ordinary View stays one
  // full-width scroll. The door shows only for staff the posting door admits.
  const role = useAuth((s) => s.role);
  const [recording, setRecording] = useState(false);
  const [asking, setAsking] = useState(false);
  // §17 — the Calendar view's business filter; the month always stays visible.
  const [calendarFilter, setCalendarFilter] = useState<"all" | CalendarEntryKind>("all");
  const canRecord = (role === "operation" || role === "principal")
    && !!invoice && invoice.status !== "voided"
    && invoiceNeeded(invoice).known && invoiceNeeded(invoice).outstanding > 0;
  const invoiceTiming = invoice ? invoicePaymentTiming(invoice, today, opts).timing : null;
  // §16 — Print is a DIRECT output action: an issued invoice prints from its
  // immutable snapshot; a voided one keeps its paper and says VOIDED.
  const [printing, setPrinting] = useState(false);
  const printInvoice = async (row: InvoiceRegisterRow) => {
    if (printing) return;
    setPrinting(true);
    try {
      const res = await apiFetch<{ document: InvoiceTemplateData }>(
        `/api/finance/invoices/${row.id}/document`);
      const blob = await renderInvoicePdf(res.document);
      window.open(URL.createObjectURL(blob), "_blank", "noopener");
    } catch (e) {
      toast.error(`The invoice document could not be opened — ${(e as Error).message}`);
    } finally {
      setPrinting(false);
    }
  };
  // §16 — the chase door exists only when the shared clock says the money is
  // genuinely askable: never while Wait, never with no anchor, never when paid.
  const canAsk = canRecord && !!invoiceTiming
    && (invoiceTiming.kind === "due" || invoiceTiming.kind === "late");
  return <div className="flex h-full min-h-0 flex-col">
    {invoice ? <SalesOrderTabs identity={identityOf(invoice)}
      customer={invoice.orders?.customer_name} backLabel="Invoices" backTo="?"
      onBack={(event) => { event.preventDefault(); setRecording(false); close(); }}
      status={STATUS_MARK[invoice.status] ? <span>{STATUS_MARK[invoice.status]}</span> : undefined}
      navigation={<span className="text-body">{invoice.orders ? `SO-${invoice.orders.so}` : "SO not available"}</span>}
      right={<span className="flex items-center gap-2">
        {invoice.invoice_no && !recording && !asking &&
          <button className="btn-secondary" disabled={printing}
            onClick={() => void printInvoice(invoice)}>Print</button>}
        {canRecord && !recording && !asking &&
          <button className="btn-primary" onClick={() => setRecording(true)}>Record payment</button>}
      </span>}
    /> : <ModuleHeader destinationHeader testId="invoices-destination-header" word="Invoices" docTitle="Invoices — Carres" />}
    {query.isError ? <div role="alert" className="p-6 text-body">
      <p>Invoices could not be loaded. Try again.</p>
      <button className="btn-secondary mt-3" onClick={() => void query.refetch()}>Try again</button>
    </div> : selected ? invoice ? recording && canRecord
      ? <InvoiceRecordPayment invoice={invoice} onClose={() => setRecording(false)} />
      : asking && canAsk
        ? <InvoiceAskToPay invoice={invoice}
            tone={invoiceTiming?.kind === "late" ? "chase" : "reminder"}
            onClose={() => setAsking(false)} />
        : <InvoiceObject invoice={invoice} today={today} opts={opts}
            onAsk={canAsk ? () => setAsking(true) : undefined} />
    : <div className="p-6 text-body"><p>{query.isLoading ? "Loading invoice…" : "Invoice not available."}</p>
      <button className="btn-secondary mt-3" onClick={close}>Back to Invoices</button></div>
    : params.get("view") === "calendar"
    ? <InvoiceCalendar rows={query.data ?? []}
        selectedDateIso={params.get("date") ?? today}
        highlightOrderId={params.get("so")}
        highlightKind={(params.get("from") === "arrival" || params.get("from") === "delivery")
          ? params.get("from") as CalendarEntryKind : null}
        filter={calendarFilter}
        onPickDate={(iso) => setParams((before) => {
          const next = new URLSearchParams(before); next.set("date", iso); return next;
        })}
        onFilter={setCalendarFilter}
        onOpenInvoice={(r) => { closeCalendar(); open(r); }}
        onBack={closeCalendar} />
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
function InvoiceObject({ invoice, today, opts, onAsk }: {
  invoice: InvoiceRegisterRow; today: string; opts: { holidays?: Set<string> };
  onAsk?: () => void;
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
          {onAsk && <button className="btn-primary mt-2" onClick={onAsk}>Ask the customer to pay</button>}
        </> : <>
          <p>{rm(f.money.outstanding)} needed by {fmtDate(f.timing.dueIso)}</p>
          <p className="text-label font-normal">Ask the customer to pay · Record the result.</p>
          {onAsk && <button className="btn-primary mt-2" onClick={onAsk}>Ask the customer to pay</button>}
        </>}
      </Facts>
      <Facts title="Invoice">
        <p>{invoice.invoice_no ?? "No invoice number yet — this is a draft."}</p>
        <p>{invoice.status === "issued" && invoice.issued_at ? `Issued · ${fmtDate(invoice.issued_at)}`
          : invoice.status === "voided" ? `VOIDED · ${invoice.void_reason ?? "Reason not available"}`
          : "Draft — it can still be edited and issued."}</p>
        <p>{rm(invoice.amount)}{Number(invoice.tax_amount) > 0 ? ` · Tax ${rm(Number(invoice.tax_amount))}` : ""}</p>
        {invoice.replaces_invoice_id && <p>This invoice replaces a voided invoice.</p>}
        {invoice.invoice_no
          ? <p>Print opens the invoice document.</p>
          : <p>A draft has no document yet. Issue the invoice first.</p>}
      </Facts>
      <Facts title="Related Payments">
        {payments.length ? payments.map((p) => <p key={p.id}>
          {p.receipt_no ?? "Receipt number missing"} · {rm(p.amount)} · {fmtDate(p.paid_on)}
          {p.voided_at ? " · VOIDED" : ""}
        </p>) : <p>No payments recorded for this order yet.</p>}
      </Facts>
      <Facts title="Communication History">
        <Communications invoice={invoice} />
      </Facts>
    </div>
  </div>;
}

const MESSAGE_KIND_WORD: Record<string, string> = {
  payment_request: "Payment message sent",
  reminder: "Reminder sent",
  receipt: "Receipt sent",
  storage: "Storage message sent",
  other: "Message sent",
};

/** The immutable sent-message ledger (0434), newest first — the three-rank
 *  record grammar: what happened · when · the message that actually went. */
function Communications({ invoice }: { invoice: InvoiceRegisterRow }) {
  const rows = (invoice.orders?.payment_communications ?? [])
    .slice()
    .sort((a, b) => (a.recorded_at < b.recorded_at ? 1 : -1));
  if (!rows.length) return <p>No messages recorded yet.</p>;
  return <div className="space-y-2">
    {rows.map((m) => <details key={m.id}>
      <summary className="cursor-pointer">
        <span className="font-semibold">{MESSAGE_KIND_WORD[m.kind] ?? "Message sent"}</span>
        <span className="ml-2 text-meta font-normal">{fmtDate(m.recorded_at, { time: true })}</span>
      </summary>
      <pre className="mt-1 whitespace-pre-wrap font-sans text-label font-normal">{m.message_text}</pre>
    </details>)}
  </div>;
}

function Facts({ title, children }: { title: string; children: React.ReactNode }) {
  return <SectionCard><div className="p-3"><h2 className="text-strong mb-2">{title}</h2>
    <div className="text-body">{children}</div></div></SectionCard>;
}

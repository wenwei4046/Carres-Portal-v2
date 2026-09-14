import { useMemo, useState } from "react";
import type { InvoiceRegisterRow } from "@carres/shared/payment-invoice-register";
import {
  deliveryWords,
  invoiceCustomerDelivery,
  invoiceGoodsFacts,
  invoiceGoodsWord,
  invoiceNeeded,
  invoicePaymentTiming,
  soRemaining,
} from "@carres/shared/payment-invoice-register";
import { collectionTimingFor, type CollectionTimingRule } from "@carres/shared/collection-clock";
import { COLLECTION_OUTCOME_NEXT, COLLECTION_OUTCOME_WORD } from "@carres/shared/payment-collection-outcome";
import { myHolidaySet } from "@carres/shared/my-holidays";
import InvoiceRecordPayment from "./InvoiceRecordPayment";
import InvoiceAskToPay from "./InvoiceAskToPay";
import InvoicePaymentLink from "./InvoicePaymentLink";
import InvoiceStorage from "./InvoiceStorage";
import InvoiceCollectionResult from "./InvoiceCollectionResult";
import InvoiceVoidReplace from "./InvoiceVoidReplace";
import InvoiceCollectionOwner from "./InvoiceCollectionOwner";
import CustomerStatement from "./CustomerStatement";
import { useAuth } from "@/lib/auth";
import { useCollectionOutcomes } from "@/lib/queries";
import { apiFetch } from "@/lib/api";
import { renderInvoicePdf } from "@/lib/pdf/render";
import type { InvoiceTemplateData } from "@/lib/pdf/types";
import { toast } from "sonner";
import { SectionCard } from "@/components/SectionPanel";
import { fmtDate } from "@/lib/fmt-date";
import { rm } from "@/lib/format-currency";
import SalesOrderTabs from "@/pages/operation/SalesOrderTabs";

/**
 * THE COLLECTION WORKSPACE — one Sales Order's money, opened from the Payment
 * Monitor row and from shared Work (owner ruling 2026-09-12; payment/MASTER.md
 * §3 · §16).
 *
 * Ordinary View is full-width, one continuous scroll: Money → Goods and
 * Delivery → Storage → What to do → Invoice → Related Payments →
 * Communication History. The 50/50 composition exists only while recording
 * Payment, asking the customer to pay, creating a payment link or recording
 * the customer's answer. The Invoice document belongs to the Sales Order —
 * this workspace displays and opens it; it never lists invoices.
 */

function todayIso() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kuala_Lumpur" });
}

/** The cells derived once per row through the shared arithmetic (Law D). */
export function collectionFactsOf(
  row: InvoiceRegisterRow,
  rows: InvoiceRegisterRow[],
  today: string,
  opts: { holidays?: Set<string> },
  timingRules?: readonly CollectionTimingRule[] | null,
) {
  const money = soRemaining(rows, row.order_id);
  const goodsMoney = invoiceNeeded(row);
  const goods = invoiceGoodsFacts(row);
  const delivery = invoiceCustomerDelivery(row);
  const timingRule = collectionTimingFor(timingRules, row.issued_at?.slice(0, 10) ?? today);
  const { timing } = invoicePaymentTiming(row, today, opts, rows, timingRule);
  const neededWord = money.known ? rm(money.outstanding) : "Value not recorded";
  /* The SAME words the Monitor row prints (Law D). This used to throw the
     status away and print a bare date, so a day the customer had NOT confirmed
     was indistinguishable from one they had. */
  const { word: deliveryWord, note: deliveryNote } = deliveryWords(delivery);
  return { money, goodsMoney, goods, delivery, timing, neededWord, deliveryWord, deliveryNote };
}

export function invoiceIdentityOf(row: InvoiceRegisterRow): string {
  return row.invoice_no ?? "Draft";
}

// A draft's identity already says Draft; only a void needs a second mark.
export const INVOICE_STATUS_MARK: Record<string, string | null> = {
  draft: null, issued: null, voided: "VOIDED",
};

export default function PaymentCollectionWorkspace({ invoice, rows, timingRules, backLabel, onClose }: {
  invoice: InvoiceRegisterRow;
  /** The COMPLETE register set — the object derives one customer's money
   *  across their Sales Orders; a scoped input would change that arithmetic. */
  rows: InvoiceRegisterRow[];
  timingRules?: readonly CollectionTimingRule[] | null;
  backLabel: string;
  onClose: () => void;
}) {
  const today = todayIso();
  const opts = useMemo(() => ({ holidays: myHolidaySet() }), []);
  const role = useAuth((s) => s.role);
  const [recording, setRecording] = useState(false);
  const [asking, setAsking] = useState(false);
  const [linking, setLinking] = useState(false);
  const [resulting, setResulting] = useState(false);
  const [statement, setStatement] = useState(false);
  const [printing, setPrinting] = useState(false);
  const money = soRemaining(rows, invoice.order_id);
  const canRecord = (role === "operation" || role === "principal")
    && invoice.status !== "voided" && money.known && money.outstanding > 0;
  const facts = collectionFactsOf(invoice, rows, today, opts, timingRules);
  // The ask door exists only when the shared clock says the money is
  // genuinely askable: never while Wait, never with no anchor, never when paid.
  const canAsk = canRecord && (facts.timing.kind === "due" || facts.timing.kind === "late");
  const composing = recording || asking || linking || resulting || statement;
  const printInvoice = async () => {
    if (printing) return;
    setPrinting(true);
    try {
      const res = await apiFetch<{ document: InvoiceTemplateData }>(
        `/api/finance/invoices/${invoice.id}/document`);
      const blob = await renderInvoicePdf(res.document);
      window.open(URL.createObjectURL(blob), "_blank", "noopener");
    } catch (e) {
      toast.error(`The invoice document could not be opened — ${(e as Error).message}`);
    } finally {
      setPrinting(false);
    }
  };
  const closeAll = () => {
    setRecording(false); setAsking(false); setLinking(false); setResulting(false); setStatement(false);
  };
  return <>
    <SalesOrderTabs identity={invoiceIdentityOf(invoice)}
      customer={invoice.orders?.customer_name} backLabel={backLabel} backTo="?"
      onBack={(event) => { event.preventDefault(); closeAll(); onClose(); }}
      status={INVOICE_STATUS_MARK[invoice.status] ? <span>{INVOICE_STATUS_MARK[invoice.status]}</span> : undefined}
      navigation={<span className="text-body">{invoice.orders ? `SO-${invoice.orders.so}` : "SO not available"}</span>}
      right={<span className="flex items-center gap-2">
        {invoice.orders && !composing &&
          <button className="btn-secondary" onClick={() => setStatement(true)}>Statement</button>}
        {invoice.invoice_no && !composing &&
          <button className="btn-secondary" disabled={printing} onClick={() => void printInvoice()}>Print</button>}
        {canRecord && !composing &&
          <button className="btn-secondary" onClick={() => setLinking(true)}>Create payment link</button>}
        {canRecord && !composing &&
          <button className="btn-primary" onClick={() => setRecording(true)}>Record payment</button>}
      </span>}
    />
    {statement
      ? <CustomerStatement orderId={invoice.order_id} onClose={() => setStatement(false)} />
      : recording && canRecord
      ? <InvoiceRecordPayment invoice={invoice} rows={rows} onClose={() => setRecording(false)} />
      : linking && canRecord
        ? <InvoicePaymentLink invoice={invoice} rows={rows} onClose={() => setLinking(false)} />
      : resulting && canAsk
        ? <InvoiceCollectionResult invoice={invoice} onClose={() => setResulting(false)} />
      : asking && canAsk
        ? <InvoiceAskToPay invoice={invoice} rows={rows}
            tone={facts.timing.kind === "late" ? "chase" : "reminder"}
            onClose={() => setAsking(false)} />
        : <InvoiceObject invoice={invoice} facts={facts}
            onAsk={canAsk ? () => setAsking(true) : undefined}
            onResult={canAsk ? () => setResulting(true) : undefined}
            correctionInFlight={rows.some((r) => r.order_id === invoice.order_id
              && r.kind !== "sales" && r.status === "draft" && r.replaces_invoice_id != null)}
            canStorage={role === "operation" || role === "principal"}
            canReadOwner={role === "operation" || role === "principal"}
            canCorrect={role === "principal"} />}
  </>;
}

/** One continuous scroll — Money → Goods and Delivery → Storage → What to do
 *  → Collection owner → Invoice → Related Payments → Communication History. */
function InvoiceObject({ invoice, facts: f, onAsk, onResult, correctionInFlight, canStorage = false, canReadOwner = false, canCorrect = false }: {
  invoice: InvoiceRegisterRow;
  facts: ReturnType<typeof collectionFactsOf>;
  onAsk?: () => void;
  onResult?: () => void;
  correctionInFlight: boolean;
  canStorage?: boolean;
  /** 0489 — Operation/principal see the collection owner facts. */
  canReadOwner?: boolean;
  /** 0476 — Void and replace. Shown to the principal only: the SQL admits the
   *  Payment Approver duty too, but the screen cannot resolve a duty, and an
   *  unauthorised person must never see the door. */
  canCorrect?: boolean;
}) {
  const partner = invoice.orders?.delivery_partners?.name ?? invoice.orders?.ops_assigned_logistic ?? null;
  const contact = invoice.orders?.delivery_partners?.contact ?? null;
  const payments = (invoice.orders?.order_payments ?? [])
    .slice()
    .sort((a, b) => (a.paid_on < b.paid_on ? 1 : -1));
  return <div className="flex-1 overflow-auto p-4" data-testid="invoice-object-scroll">
    <div className="flex flex-col gap-4">
      <Facts title="Money">
        <p>{f.money.known ? `${rm(f.money.outstanding)} still needed` : "Value not recorded"}</p>
        {f.money.storageOwing > 0 && <p>includes storage {rm(f.money.storageOwing)}</p>}
        <p>{f.goodsMoney.total != null ? `Order value ${rm(f.goodsMoney.total)} · Paid ${rm(f.goodsMoney.paid)}` : "This order has no value on record."}</p>
      </Facts>
      <Facts title="Goods and Delivery">
        <p>{invoiceGoodsWord(invoice)}</p>
        <p>Customer Delivery: {f.deliveryWord}
          {f.deliveryNote && <span className="text-kit-amber-11"> · {f.deliveryNote}</span>}</p>
        <p>{partner ? `Logistics Partner: ${partner}${contact ? ` · ${contact}` : " · No customer contact on file yet."}` : "No Logistics Partner assigned yet."}</p>
      </Facts>
      {/* §6/§7 — the storage case lives between the goods facts and the
          money action: it is a goods-side fact that becomes money. */}
      <InvoiceStorage orderId={invoice.order_id} canAct={canStorage} correctionInFlight={correctionInFlight} />
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
          <p className="text-label font-normal">Ask customer to pay · Record the result.</p>
          <span className="mt-2 flex flex-wrap gap-2">
            {onAsk && <button className="btn-primary" onClick={onAsk}>Ask customer to pay</button>}
            {onResult && <button className="btn-secondary" onClick={onResult}>Record the result</button>}
          </span>
        </> : <>
          <p>{rm(f.money.outstanding)} needed by {fmtDate(f.timing.dueIso)}</p>
          <p className="text-label font-normal">Ask customer to pay · Record the result.</p>
          <span className="mt-2 flex flex-wrap gap-2">
            {onAsk && <button className="btn-primary" onClick={onAsk}>Ask customer to pay</button>}
            {onResult && <button className="btn-secondary" onClick={onResult}>Record the result</button>}
          </span>
        </>}
      </Facts>
      {/* 0489 — who owns this collection: normal owner · today's cover ·
          acting person, from the Work feed's own read; the formal handover
          door for a principal or manager. */}
      <InvoiceCollectionOwner orderId={invoice.order_id} canRead={canReadOwner} />
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
        {canCorrect && invoice.status === "issued" && invoice.invoice_no &&
          <InvoiceVoidReplace invoiceId={invoice.id} invoiceNo={invoice.invoice_no} />}
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

/** Communication History — ONE continuous record, newest first: the sent
 *  messages (0434) and the customer's recorded answers (0446 — promises,
 *  disputes, no-answers, with the next-contact fact), so today's cover or a
 *  new owner sees every earlier conversation and the customer is never
 *  contacted twice by different staff (owner ruling 2026-09-13). */
function Communications({ invoice }: { invoice: InvoiceRegisterRow }) {
  const outcomesQ = useCollectionOutcomes(invoice.id);
  const messages = (invoice.orders?.payment_communications ?? []).map((m) => ({
    key: `m-${m.id}`, at: m.recorded_at, kind: "message" as const, m,
  }));
  const outcomes = (outcomesQ.data?.outcomes ?? []).map((o) => ({
    key: `o-${o.id}`, at: o.recorded_at, kind: "outcome" as const, o,
  }));
  const rows = [...messages, ...outcomes].sort((a, b) => (a.at < b.at ? 1 : -1));
  if (!rows.length) return <p>{outcomesQ.isLoading ? "Loading…" : "No messages or results recorded yet."}</p>;
  return <div className="space-y-2" data-testid="communication-history">
    {rows.map((row) => row.kind === "message"
      ? <details key={row.key}>
          <summary className="cursor-pointer">
            <span className="font-semibold">{MESSAGE_KIND_WORD[row.m.kind] ?? "Message sent"}</span>
            <span className="ml-2 text-meta font-normal">{fmtDate(row.m.recorded_at, { time: true })}</span>
          </summary>
          <pre className="mt-1 whitespace-pre-wrap font-sans text-label font-normal">{row.m.message_text}</pre>
        </details>
      : <div key={row.key} data-testid="communication-outcome">
          <p>
            <span className="font-semibold">{COLLECTION_OUTCOME_WORD[row.o.outcome] ?? "Result recorded"}</span>
            {row.o.promised_date && <span> · promised {fmtDate(row.o.promised_date)}</span>}
            <span className="ml-2 text-meta font-normal">{fmtDate(row.o.recorded_at, { time: true })}{row.o.recorded_by_user?.name ? ` · ${row.o.recorded_by_user.name}` : ""}</span>
          </p>
          {row.o.note && <p className="text-label font-normal">{row.o.note}</p>}
          <p className="text-label font-normal">Next: {COLLECTION_OUTCOME_NEXT[row.o.outcome] ?? "Ask again."}</p>
        </div>)}
  </div>;
}

export function Facts({ title, children }: { title: string; children: React.ReactNode }) {
  return <SectionCard><div className="p-3"><h2 className="text-strong mb-2">{title}</h2>
    <div className="text-body">{children}</div></div></SectionCard>;
}

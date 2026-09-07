import { useMemo, useRef, useState } from "react";
import type { InvoiceRegisterRow } from "@carres/shared/payment-invoice-register";
import { invoiceNeeded } from "@carres/shared/payment-invoice-register";
import type { OrderPaymentMethod } from "@carres/shared";
import { SectionCard } from "@/components/SectionPanel";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { qk, useRecordPayment } from "@/lib/queries";
import { apiFetch } from "@/lib/api";
import InvoiceSendReceipt from "./InvoiceSendReceipt";
import type { PaymentTemplateRow } from "@carres/shared/payment-templates";
import { supabase } from "@/lib/supabase";
import { ATTACHMENTS_BUCKET } from "@/lib/storage";
import { fmtDate } from "@/lib/fmt-date";
import { rm } from "@/lib/format-currency";
import { toast } from "sonner";

/** The §16 manual methods and their required evidence words. `online` is
 *  provider-recorded and never manually selectable — a link cannot be
 *  pretended into a success. */
const MANUAL_METHODS: Array<{
  value: OrderPaymentMethod;
  label: string;
  evidence: string;
  reference: { label: string; required: boolean } | null;
}> = [
  { value: "bank", label: "Bank transfer", evidence: "Transfer slip",
    reference: { label: "Reference", required: false } },
  { value: "duitnow_qr", label: "DuitNow QR", evidence: "Payment screenshot",
    reference: null },
  { value: "cheque", label: "Cheque", evidence: "Cheque photo",
    reference: { label: "Cheque number", required: true } },
  { value: "cash", label: "Cash", evidence: "Cash collection proof",
    reference: null },
  { value: "credit_card", label: "Credit card", evidence: "Card terminal receipt",
    reference: { label: "Approval code", required: true } },
  { value: "debit_card", label: "Debit card", evidence: "Card terminal receipt",
    reference: { label: "Approval code", required: true } },
];

function todayIso() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kuala_Lumpur" });
}

const inputCls =
  "mt-0.5 w-full rounded-md border border-base-200 px-2 py-1.5 text-body";

/** Record payment — the §16 work composition. The action/form stands first
 *  and the customer receipt preview beside it (stacked first at narrow
 *  widths). One idempotency key per opening: a double press cannot post the
 *  money twice. A failed post retains everything typed. */
export default function InvoiceRecordPayment({ invoice, onClose }: {
  invoice: InvoiceRegisterRow;
  onClose: () => void;
}) {
  const money = invoiceNeeded(invoice);
  const orderId = invoice.order_id;
  const qc = useQueryClient();
  const [amount, setAmount] = useState(
    money.known && money.outstanding > 0 ? String(money.outstanding) : "");
  const [paidOn, setPaidOn] = useState(todayIso());
  const [method, setMethod] = useState<OrderPaymentMethod>("bank");
  const [reference, setReference] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [step, setStep] = useState<"edit" | "review" | "done">("edit");
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<{ receiptNo: string | null; stillNeeded: number } | null>(null);
  const [sendingReceipt, setSendingReceipt] = useState(false);
  const templatesQuery = useQuery<{ templates: PaymentTemplateRow[] }>({
    queryKey: ["finance", "payment-templates"],
    queryFn: () => apiFetch("/api/finance/payment-settings/templates"),
    staleTime: 60_000,
  });
  const idempotencyKey = useRef(crypto.randomUUID());
  const record = useRecordPayment(orderId, {
    onError: (e) => toast.error(`Payment was not recorded — ${e.message}`),
  });
  // §16 — only Active manual methods are selectable. Until the settings read
  // answers (or if it fails), the full governed six stand in: a settings
  // hiccup must not stop money from being recorded.
  const settings = useQuery<{ manual_methods: Array<{ method: string; active: boolean }> }>({
    queryKey: ["finance", "payment-settings"],
    queryFn: () => apiFetch("/api/finance/payment-settings"),
    staleTime: 60_000,
  });
  const methods = useMemo(() => {
    const rows = settings.data?.manual_methods;
    if (!rows?.length) return MANUAL_METHODS;
    const active = new Set(rows.filter((r) => r.active).map((r) => r.method));
    const filtered = MANUAL_METHODS.filter((m) => active.has(m.value));
    return filtered.length ? filtered : MANUAL_METHODS;
  }, [settings.data]);

  const spec = useMemo(() => MANUAL_METHODS.find((m) => m.value === method)!, [method]);
  const amt = Number(amount);
  const amtOk = amount.trim() !== "" && Number.isFinite(amt) && amt > 0;
  const refOk = !spec.reference?.required || reference.trim() !== "";
  const ready = amtOk && refOk && !!file && /^\d{4}-\d{2}-\d{2}$/.test(paidOn);

  const acceptFile = (f: File | undefined | null) => {
    if (!f) return;
    if (!/^image\/|^application\/pdf$/.test(f.type)) {
      toast.error(`${spec.evidence} must be a photo or a PDF.`);
      return;
    }
    if (f.size > 10 * 1024 * 1024) {
      toast.error(`${spec.evidence} is too large — 10 MB at most.`);
      return;
    }
    setFile(f);
  };

  async function post() {
    if (!ready || saving || record.isPending) return;
    setSaving(true);
    // The evidence uploads first; a failed upload stops the posting so the
    // proof is never silently dropped. Nothing typed is lost on failure.
    let receiptUrl: string | null = null;
    if (file) {
      const safeName = file.name.replace(/[^\w.-]+/g, "_").slice(-60);
      const path = `orders/${orderId}/payments/${Date.now()}-${safeName}`;
      const { error } = await supabase.storage
        .from(ATTACHMENTS_BUCKET)
        .upload(path, file, {
          contentType: file.type || "application/octet-stream",
          upsert: false,
        });
      if (error) {
        setSaving(false);
        toast.error(`${spec.evidence} upload failed — ${error.message}`);
        return;
      }
      receiptUrl = `${ATTACHMENTS_BUCKET}/${path}`;
    }
    record.mutate(
      {
        amount: amt,
        paidOn,
        method,
        kind: "payment",
        reference: reference.trim() || null,
        receiptUrl,
        idempotencyKey: idempotencyKey.current,
      },
      {
        onSuccess: (out) => {
          const receiptNo = (out.payment as { receipt_no?: string | null } | undefined)?.receipt_no ?? null;
          setResult({
            receiptNo,
            stillNeeded: Math.max(0, (money.known ? money.outstanding : 0) - amt),
          });
          setStep("done");
          void qc.invalidateQueries({ queryKey: qk.finance.invoiceRegister(), exact: true });
          void qc.invalidateQueries({ queryKey: qk.finance.paymentRegister(), exact: true });
        },
        onSettled: () => setSaving(false),
      },
    );
  }

  if (step === "done" && result) {
    // §16 — after successful posting: Payment recorded · Receipt number ·
    // Amount still needed · Send receipt. The receipt wording is the
    // manager's template; a full payment recommends `Payment received`, a
    // partial one `Partial payment received`. No template = the honest
    // sentence, never invented copy.
    const heads = (templatesQuery.data?.templates ?? []).filter((t) => t.is_head && t.active);
    const wanted = result.stillNeeded <= 0 ? "payment_received" : "partial_payment_received";
    const receiptTemplates = [
      ...heads.filter((t) => t.purpose === wanted && t.is_default),
      ...heads.filter((t) => t.purpose === wanted && !t.is_default),
      ...heads.filter((t) => (t.purpose === "payment_received" || t.purpose === "partial_payment_received")
        && t.purpose !== wanted),
    ];
    if (sendingReceipt && receiptTemplates.length > 0) {
      return <InvoiceSendReceipt invoice={invoice} templates={receiptTemplates}
        receiptNo={result.receiptNo} amount={amt} stillNeeded={result.stillNeeded}
        onClose={onClose} />;
    }
    return <div className="flex-1 overflow-auto p-4" data-testid="invoice-record-done">
      <SectionCard><div className="p-4 text-body">
        <h2 className="text-strong mb-2">Payment recorded</h2>
        <p>{result.receiptNo ?? "Receipt number missing"}</p>
        <p>Amount still needed: {rm(result.stillNeeded)}</p>
        {receiptTemplates.length > 0
          ? <button className="btn-primary mt-3 mr-2"
              onClick={() => setSendingReceipt(true)}>Send receipt</button>
          : <p className="text-label font-normal mt-1">
              No receipt template yet. Ask a manager to add the approved wording in Settings.
            </p>}
        <button className="btn-secondary mt-3" onClick={onClose}>Back to invoice</button>
      </div></SectionCard>
    </div>;
  }

  return <div className="flex-1 overflow-auto p-4" data-testid="invoice-record-payment">
    <div className="grid gap-4 md:grid-cols-2">
      <SectionCard><div className="p-4">
        <h2 className="text-strong mb-2">Record payment</h2>
        {step === "edit" ? <div className="space-y-2 text-body">
          <label className="block">
            <span className="text-label">Amount (RM)</span>
            <input type="number" min={0} step="0.01" value={amount} autoFocus
              onChange={(e) => setAmount(e.target.value)}
              aria-label="Payment amount" className={inputCls} />
          </label>
          <label className="block">
            <span className="text-label">Paid date</span>
            <input type="date" value={paidOn}
              onChange={(e) => setPaidOn(e.target.value)}
              aria-label="Paid date" className={inputCls} />
          </label>
          <label className="block">
            <span className="text-label">Method</span>
            <select value={method}
              onChange={(e) => { setMethod(e.target.value as OrderPaymentMethod); setFile(null); }}
              aria-label="Payment method" className={inputCls}>
              {methods.map((m) => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </select>
          </label>
          {spec.reference && <label className="block">
            <span className="text-label">{spec.reference.label}</span>
            <input type="text" value={reference}
              onChange={(e) => setReference(e.target.value)}
              aria-label={spec.reference.label} className={inputCls} />
          </label>}
          <label className="block">
            <span className="text-label">{spec.evidence}</span>
            <input type="file" accept="image/*,application/pdf"
              onChange={(e) => acceptFile(e.target.files?.[0])}
              aria-label={spec.evidence} className="mt-0.5 block w-full text-meta" />
            <span className="text-label font-normal">
              {file ? file.name : `Add the ${spec.evidence.toLowerCase()} before Review.`}
            </span>
          </label>
          <div className="flex gap-2 pt-1">
            <button className="btn-primary" disabled={!ready}
              onClick={() => setStep("review")}>Review payment</button>
            <button className="btn-secondary" onClick={onClose}>Back</button>
          </div>
        </div> : <div className="space-y-2 text-body" data-testid="invoice-record-review">
          <p>{rm(amt)} · {spec.label} · {fmtDate(paidOn)}</p>
          {reference.trim() && <p>{spec.reference?.label ?? "Reference"}: {reference.trim()}</p>}
          <p>{file ? `${spec.evidence} attached.` : `No ${spec.evidence.toLowerCase()}.`}</p>
          <p className="font-semibold">This records customer money.</p>
          <p className="font-semibold">This does not confirm the bank account.</p>
          <div className="flex gap-2 pt-1">
            <button className="btn-primary" disabled={saving || record.isPending}
              onClick={() => void post()}>Record payment</button>
            <button className="btn-secondary" disabled={saving || record.isPending}
              onClick={() => setStep("edit")}>Back</button>
          </div>
        </div>}
      </div></SectionCard>
      <SectionCard><div className="p-4 text-body" data-testid="invoice-receipt-preview">
        <h2 className="text-strong mb-2">Receipt preview</h2>
        <p>{invoice.orders?.customer_name ?? "Customer not available"}</p>
        <p>{invoice.orders ? `SO-${invoice.orders.so}` : "SO not available"}
          {invoice.invoice_no ? ` · ${invoice.invoice_no}` : ""}</p>
        <p>Amount received: {amtOk ? rm(amt) : "RM 0.00"}</p>
        <p>Paid date: {fmtDate(paidOn)}</p>
        <p>Method: {spec.label}</p>
        <p>Amount still needed after this payment: {money.known
          ? rm(Math.max(0, money.outstanding - (amtOk ? amt : 0)))
          : "Value not recorded"}</p>
      </div></SectionCard>
    </div>
  </div>;
}

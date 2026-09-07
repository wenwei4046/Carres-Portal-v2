import { useMemo, useState } from "react";
import type { InvoiceRegisterRow } from "@carres/shared/payment-invoice-register";
import { SectionCard } from "@/components/SectionPanel";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { qk } from "@/lib/queries";
import { supabase } from "@/lib/supabase";
import { ATTACHMENTS_BUCKET } from "@/lib/storage";
import { salutationOf, rmAmount } from "@/lib/wa-templates";
import {
  PAYMENT_TEMPLATE_PURPOSE_WORD,
  renderPaymentTemplate,
  type PaymentTemplateRow,
} from "@carres/shared/payment-templates";
import { waLink } from "@/lib/wa-link";
import { toast } from "sonner";

/** Send receipt — the §16 step after a successful posting.
 *
 *  Template-driven ONLY: the receipt wording comes from the manager's
 *  `Payment received` / `Partial payment received` templates. The caller
 *  opens this door only when an Active template exists — no wording is
 *  invented here. The governed sequence holds: Copy message → Open WhatsApp
 *  → Upload sent screenshot → Record message sent; opening WhatsApp records
 *  nothing, and the recorded message joins the immutable ledger as
 *  kind `receipt`.
 */
export default function InvoiceSendReceipt({ invoice, templates, receiptNo, amount, stillNeeded, onClose }: {
  invoice: InvoiceRegisterRow;
  /** Active heads of the two receipt purposes, recommended first. */
  templates: PaymentTemplateRow[];
  receiptNo: string | null;
  amount: number;
  stillNeeded: number;
  onClose: () => void;
}) {
  const order = invoice.orders;
  const facts = useMemo(() => {
    const refs = order?.source_ref;
    return {
      customer: salutationOf(null, order?.customer_name),
      ref: (Array.isArray(refs) ? refs[0] : refs) ?? null,
      receipt_no: receiptNo,
      amount: rmAmount(amount),
      outstanding: rmAmount(stillNeeded),
      still_needed: rmAmount(stillNeeded),
      items: (order?.order_lines ?? [])
        .filter((l): l is { sku: string; qty: number; unit_price: number | string | null } => !!l.sku)
        .map((l) => `${Number(l.qty)}× ${l.sku}`).join("\n") || null,
    };
  }, [order, receiptNo, amount, stillNeeded]);
  const [chosenKey, setChosenKey] = useState<string | null>(null);
  const chosen = (chosenKey && templates.find((t) => t.template_key === chosenKey)) || templates[0] || null;
  const prepared = chosen ? renderPaymentTemplate(chosen.body, facts) : "";
  const [text, setText] = useState<string | null>(null);
  const shown = text ?? prepared;
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const qc = useQueryClient();
  const record = useMutation({
    mutationFn: (input: { kind: string; messageText: string; templateKey: string; screenshotUrl: string }) =>
      apiFetch(`/api/finance/invoices/${invoice.id}/record-message`, {
        method: "POST", body: JSON.stringify(input),
      }),
    onSuccess: () => {
      toast.success("Receipt message recorded");
      void qc.invalidateQueries({ queryKey: qk.finance.invoiceRegister(), exact: true });
      onClose();
    },
    onError: (e: Error) => toast.error(`The message was not recorded — ${e.message}`),
  });
  const copy = () => {
    void navigator.clipboard?.writeText(shown);
    toast.success("Message copied");
  };
  const openWa = () => {
    void navigator.clipboard?.writeText(shown);
    const wa = waLink(order?.customer_phone ?? null);
    if (wa) {
      window.open(`${wa}?text=${encodeURIComponent(shown)}`, "_blank", "noopener");
      toast.success("WhatsApp opened — sending is not recorded yet");
    } else {
      toast.success("No phone on file — message copied, paste it into WhatsApp");
    }
  };
  const acceptFile = (f: File | undefined | null) => {
    if (!f) return;
    if (!/^image\//.test(f.type)) {
      toast.error("The sent screenshot must be a photo.");
      return;
    }
    if (f.size > 10 * 1024 * 1024) {
      toast.error("The screenshot is too large — 10 MB at most.");
      return;
    }
    setFile(f);
  };
  async function recordSent() {
    if (!file || saving || record.isPending || !shown.trim() || !chosen) return;
    setSaving(true);
    const safeName = file.name.replace(/[^\w.-]+/g, "_").slice(-60);
    const path = `orders/${invoice.order_id}/communications/${Date.now()}-${safeName}`;
    const { error } = await supabase.storage
      .from(ATTACHMENTS_BUCKET)
      .upload(path, file, { contentType: file.type || "image/jpeg", upsert: false });
    setSaving(false);
    if (error) {
      toast.error(`Screenshot upload failed — ${error.message}`);
      return;
    }
    record.mutate({
      kind: "receipt",
      messageText: shown.trim(),
      templateKey: `${chosen.purpose}:${chosen.template_key}:v${chosen.version}`,
      screenshotUrl: `${ATTACHMENTS_BUCKET}/${path}`,
    });
  }

  return <div className="flex-1 overflow-auto p-4" data-testid="invoice-send-receipt">
    <div className="grid gap-4 md:grid-cols-2">
      <SectionCard><div className="p-4">
        <h2 className="text-strong mb-2">Send receipt</h2>
        <div className="space-y-2 text-body">
          {templates.length > 1 && <label className="block">
            <span className="text-label">Template</span>
            <select value={chosen?.template_key ?? ""} aria-label="Change template"
              onChange={(e) => { setChosenKey(e.target.value || null); setText(null); }}
              className="mt-0.5 w-full rounded-md border border-base-200 px-2 py-1.5 text-body">
              {templates.map((t) => <option key={t.template_key} value={t.template_key}>
                {PAYMENT_TEMPLATE_PURPOSE_WORD[t.purpose]} · {t.name}
              </option>)}
            </select>
          </label>}
          <label className="block">
            <span className="text-label">Message</span>
            <textarea value={shown} onChange={(e) => setText(e.target.value)}
              rows={9} aria-label="Message"
              className="mt-0.5 w-full rounded-md border border-base-200 px-2 py-1.5 text-body" />
          </label>
          <div className="flex flex-wrap gap-2">
            <button className="btn-secondary" onClick={copy}>Copy message</button>
            <button className="btn-secondary" onClick={openWa}>Open WhatsApp</button>
          </div>
          <label className="block">
            <span className="text-label">Sent screenshot</span>
            <input type="file" accept="image/*"
              onChange={(e) => acceptFile(e.target.files?.[0])}
              aria-label="Sent screenshot" className="mt-0.5 block w-full text-meta" />
            <span className="text-label font-normal">
              {file ? file.name : "Opening WhatsApp is not sent. Add the sent screenshot to record it."}
            </span>
          </label>
          <div className="flex gap-2 pt-1">
            <button className="btn-primary" disabled={!file || !shown.trim() || saving || record.isPending}
              onClick={() => void recordSent()}>Record message sent</button>
            <button className="btn-secondary" onClick={onClose}>Back</button>
          </div>
        </div>
      </div></SectionCard>
      <SectionCard><div className="p-4" data-testid="receipt-message-preview">
        <h2 className="text-strong mb-2">What the customer receives</h2>
        <pre className="whitespace-pre-wrap font-sans text-body">{shown}</pre>
      </div></SectionCard>
    </div>
  </div>;
}

import { useMemo, useState } from "react";
import type { InvoiceRegisterRow } from "@carres/shared/payment-invoice-register";
import { invoiceNeeded } from "@carres/shared/payment-invoice-register";
import { SectionCard } from "@/components/SectionPanel";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { qk } from "@/lib/queries";
import { supabase } from "@/lib/supabase";
import { ATTACHMENTS_BUCKET } from "@/lib/storage";
import {
  buildCustomerChase,
  buildCustomerReminder,
  rmAmount,
  salutationOf,
} from "@/lib/wa-templates";
import { waLink } from "@/lib/wa-link";
import { toast } from "sonner";

/** Ask the customer to pay — the §16 message composition on the Invoice.
 *
 *  50/50: editable ordinary wording first, the real message the customer
 *  receives beside it (stacked action-first at narrow widths). The sending
 *  sequence is governed: Copy message → Open WhatsApp → Upload sent
 *  screenshot → Record message sent. Opening WhatsApp alone records nothing.
 *
 *  The message body is the CURRENT locked customer template (Jess
 *  2026-07-13, two-tone). The complete §16 payment message — Delivery
 *  date/range, bank from the routing source, Partner contact and the
 *  approved Important Notes — swaps in once its owner-approved wording
 *  arrives; the bottom rules are never invented or shortened here.
 */
export default function InvoiceAskToPay({ invoice, tone, onClose }: {
  invoice: InvoiceRegisterRow;
  /** reminder before the deadline · chase once late (the shared clock decides). */
  tone: "reminder" | "chase";
  onClose: () => void;
}) {
  const money = invoiceNeeded(invoice);
  const order = invoice.orders;
  const prepared = useMemo(() => {
    const refs = order?.source_ref;
    const input = {
      salutation: salutationOf(null, order?.customer_name),
      ref: (Array.isArray(refs) ? refs[0] : refs) ?? null,
      outstanding: rmAmount(money.known ? money.outstanding : 0),
      lines: (order?.order_lines ?? [])
        .filter((l): l is { sku: string; qty: number; unit_price: number | string | null } => !!l.sku)
        .map((l) => ({ sku: l.sku, qty: Number(l.qty) })),
    };
    return tone === "chase" ? buildCustomerChase(input) : buildCustomerReminder(input);
  }, [order, money, tone]);
  const [text, setText] = useState(prepared);
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const qc = useQueryClient();
  const record = useMutation({
    mutationFn: (input: { kind: string; messageText: string; templateKey: string; screenshotUrl: string }) =>
      apiFetch(`/api/finance/invoices/${invoice.id}/record-message`, {
        method: "POST", body: JSON.stringify(input),
      }),
    onSuccess: () => {
      toast.success("Message recorded");
      void qc.invalidateQueries({ queryKey: qk.finance.invoiceRegister(), exact: true });
      onClose();
    },
    onError: (e: Error) => toast.error(`The message was not recorded — ${e.message}`),
  });

  const copy = () => {
    void navigator.clipboard?.writeText(text);
    toast.success("Message copied");
  };
  const openWa = () => {
    void navigator.clipboard?.writeText(text);
    const wa = waLink(order?.customer_phone ?? null);
    if (wa) {
      window.open(`${wa}?text=${encodeURIComponent(text)}`, "_blank", "noopener");
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
    if (!file || saving || record.isPending || !text.trim()) return;
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
      kind: tone === "chase" ? "payment_request" : "reminder",
      messageText: text.trim(),
      templateKey: tone === "chase" ? "customer_chase" : "customer_reminder",
      screenshotUrl: `${ATTACHMENTS_BUCKET}/${path}`,
    });
  }

  return <div className="flex-1 overflow-auto p-4" data-testid="invoice-ask-to-pay">
    <div className="grid gap-4 md:grid-cols-2">
      <SectionCard><div className="p-4">
        <h2 className="text-strong mb-2">Ask the customer to pay</h2>
        <div className="space-y-2 text-body">
          <label className="block">
            <span className="text-label">Message</span>
            <textarea value={text} onChange={(e) => setText(e.target.value)}
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
            <button className="btn-primary" disabled={!file || !text.trim() || saving || record.isPending}
              onClick={() => void recordSent()}>Record message sent</button>
            <button className="btn-secondary" onClick={onClose}>Back</button>
          </div>
        </div>
      </div></SectionCard>
      <SectionCard><div className="p-4" data-testid="ask-message-preview">
        <h2 className="text-strong mb-2">What the customer receives</h2>
        <pre className="whitespace-pre-wrap font-sans text-body">{text}</pre>
      </div></SectionCard>
    </div>
  </div>;
}

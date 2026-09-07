import { useMemo, useState } from "react";
import type { InvoiceRegisterRow } from "@carres/shared/payment-invoice-register";
import { invoiceNeeded } from "@carres/shared/payment-invoice-register";
import {
  PAYMENT_TEMPLATE_PURPOSE_WORD,
  renderPaymentTemplate,
  type PaymentTemplatePurpose,
  type PaymentTemplateRow,
} from "@carres/shared/payment-templates";
import { SectionCard } from "@/components/SectionPanel";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { qk } from "@/lib/queries";
import { supabase } from "@/lib/supabase";
import { ATTACHMENTS_BUCKET } from "@/lib/storage";
import { rmAmount, salutationOf } from "@/lib/wa-templates";
import { waLink } from "@/lib/wa-link";
import { rm } from "@/lib/format-currency";
import { toast } from "sonner";

/**
 * Create payment link — the §16 Online link journey on the Invoice
 * (payment/MASTER.md "Online link and Receipt").
 *
 * The Stripe-hosted checkout is ALREADY converged through the canonical
 * posting service (0223 → 0351): only a successful provider callback/poll
 * posts Payment and Receipt atomically. This composition adds the governed
 * operator journey around it: Create payment link shows the amount,
 * `Waiting for payment` and the exact expiry → Copy payment message →
 * Open WhatsApp → Upload sent screenshot → Record link sent. Created, sent
 * or opened is NOT Payment. An unpaid expiry says `Payment link expired` ·
 * `Amount needed remains unchanged.` · `Create a new payment link`.
 *
 * The customer message is TEMPLATE-DRIVEN ONLY (`Standard payment link`,
 * or `New link after expiry` after one expired) — with no Active template
 * nothing invents customer wording: the page says so, and only the bare
 * link URL (a fact, not wording) can be copied.
 */

export interface CheckoutSession {
  sessionId: string;
  url: string;
  amount: number;
  status: "open" | "paid" | "expired";
  paidAt: string | null;
  expiresAt: string | null;
  paymentMethodDetail: string | null;
  receiptUrl: string | null;
}

/** An `open` row past its expiry is already dead for the operator — say so
 *  without waiting for the poll to flip the store. */
export function sessionDisplayStatus(s: CheckoutSession, nowIso: string): "open" | "paid" | "expired" {
  if (s.status === "open" && s.expiresAt && s.expiresAt <= nowIso) return "expired";
  return s.status;
}

/** `Fri, 12 Sep · 3:45 pm` — the exact expiry, in the operator's words. */
export function expiryWord(iso: string | null): string {
  if (!iso) return "Expiry not recorded";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "Expiry not recorded";
  const day = d.toLocaleDateString("en-GB", {
    weekday: "short", day: "numeric", month: "short", timeZone: "Asia/Kuala_Lumpur",
  });
  const time = d.toLocaleTimeString("en-GB", {
    hour: "numeric", minute: "2-digit", hour12: true, timeZone: "Asia/Kuala_Lumpur",
  });
  return `${day} · ${time}`;
}

export default function InvoicePaymentLink({ invoice, onClose }: {
  invoice: InvoiceRegisterRow;
  onClose: () => void;
}) {
  const order = invoice.orders;
  const money = invoiceNeeded(invoice);
  const qc = useQueryClient();
  const nowIso = new Date().toISOString();

  const sessionsQ = useQuery<{ sessions: CheckoutSession[] }>({
    queryKey: ["finance", "stripe-links", invoice.order_id],
    queryFn: () => apiFetch(`/api/orders/${invoice.order_id}/stripe/checkout`),
    refetchInterval: (q) => {
      const open = (q.state.data?.sessions ?? []).some(
        (s) => sessionDisplayStatus(s, new Date().toISOString()) === "open");
      return open ? 5000 : false;
    },
  });
  const sessions = sessionsQ.data?.sessions ?? [];
  const current = sessions[0] ?? null;
  const currentStatus = current ? sessionDisplayStatus(current, nowIso) : null;
  const hadExpired = sessions.some((s) => sessionDisplayStatus(s, nowIso) === "expired");

  // While an open link stands, keep polling ITS reconcile route so a
  // counter payment records within one poll even before the webhook.
  useQuery({
    queryKey: ["finance", "stripe-link-poll", current?.sessionId ?? "none"],
    queryFn: () => apiFetch(
      `/api/orders/${invoice.order_id}/stripe/checkout/${current!.sessionId}`),
    enabled: !!current && currentStatus === "open",
    refetchInterval: 5000,
    // A flip to paid/expired lands in the list on its next poll.
    select: () => null,
  });

  const [amountText, setAmountText] = useState(
    money.known && money.outstanding > 0 ? String(money.outstanding.toFixed(2)) : "");
  const create = useMutation({
    mutationFn: (amount: number) =>
      apiFetch<{ session: CheckoutSession }>(
        `/api/orders/${invoice.order_id}/stripe/checkout`,
        { method: "POST", body: JSON.stringify({ amount }) }),
    onSuccess: () => {
      toast.success("Payment link created — waiting for payment");
      void qc.invalidateQueries({ queryKey: ["finance", "stripe-links", invoice.order_id] });
    },
    onError: (e: Error) => toast.error(`The payment link was not created — ${e.message}`),
  });

  // §16 — the message is template-driven ONLY. New link after expiry is
  // recommended once a previous link has died; otherwise Standard payment link.
  const recommendedPurpose: PaymentTemplatePurpose =
    hadExpired && currentStatus === "open" ? "new_link_after_expiry" : "standard_payment_link";
  const templatesQ = useQuery<{ templates: PaymentTemplateRow[] }>({
    queryKey: ["finance", "payment-templates"],
    queryFn: () => apiFetch("/api/finance/payment-settings/templates"),
    staleTime: 60_000,
  });
  const activeHeads = useMemo(() =>
    (templatesQ.data?.templates ?? []).filter((t) => t.is_head && t.active
      && (t.purpose === "standard_payment_link" || t.purpose === "new_link_after_expiry")),
  [templatesQ.data]);
  const recommended = activeHeads.find((t) => t.purpose === recommendedPurpose && t.is_default)
    ?? activeHeads.find((t) => t.purpose === recommendedPurpose)
    ?? activeHeads[0] ?? null;
  const [chosenKey, setChosenKey] = useState<string | null>(null);
  const chosen = (chosenKey && activeHeads.find((t) => t.template_key === chosenKey)) || recommended;
  const facts = useMemo(() => {
    const refs = order?.source_ref;
    return {
      customer: salutationOf(null, order?.customer_name),
      ref: (Array.isArray(refs) ? refs[0] : refs) ?? null,
      outstanding: rmAmount(money.known ? money.outstanding : 0),
      amount: current ? rmAmount(current.amount) : null,
      link: current?.url ?? null,
      expiry: current ? expiryWord(current.expiresAt) : null,
    };
  }, [order, money, current]);
  const prepared = chosen ? renderPaymentTemplate(chosen.body, facts) : "";
  const [text, setText] = useState("");
  const [editedByHand, setEditedByHand] = useState(false);
  const shown = editedByHand ? text : prepared;

  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const record = useMutation({
    mutationFn: (input: { kind: string; messageText: string; templateKey: string; screenshotUrl: string }) =>
      apiFetch(`/api/finance/invoices/${invoice.id}/record-message`, {
        method: "POST", body: JSON.stringify(input),
      }),
    onSuccess: () => {
      toast.success("Link message recorded");
      void qc.invalidateQueries({ queryKey: qk.finance.invoiceRegister(), exact: true });
      onClose();
    },
    onError: (e: Error) => toast.error(`The message was not recorded — ${e.message}`),
  });
  const acceptFile = (f: File | undefined | null) => {
    if (!f) return;
    if (!/^image\//.test(f.type)) { toast.error("The sent screenshot must be a photo."); return; }
    if (f.size > 10 * 1024 * 1024) { toast.error("The screenshot is too large — 10 MB at most."); return; }
    setFile(f);
  };
  async function recordSent() {
    if (!file || saving || record.isPending || !shown.trim()) return;
    setSaving(true);
    const safeName = file.name.replace(/[^\w.-]+/g, "_").slice(-60);
    const path = `orders/${invoice.order_id}/communications/${Date.now()}-${safeName}`;
    const { error } = await supabase.storage
      .from(ATTACHMENTS_BUCKET)
      .upload(path, file, { contentType: file.type || "image/jpeg", upsert: false });
    setSaving(false);
    if (error) { toast.error(`Screenshot upload failed — ${error.message}`); return; }
    record.mutate({
      kind: "payment_request",
      messageText: shown.trim(),
      templateKey: chosen ? `${chosen.purpose}:${chosen.template_key}:v${chosen.version}` : "payment_link",
      screenshotUrl: `${ATTACHMENTS_BUCKET}/${path}`,
    });
  }

  const copyMessage = () => {
    void navigator.clipboard?.writeText(shown);
    toast.success("Message copied");
  };
  const copyLink = () => {
    if (!current?.url) return;
    void navigator.clipboard?.writeText(current.url);
    toast.success("Payment link copied");
  };
  const openWa = () => {
    const body = shown.trim() || current?.url || "";
    void navigator.clipboard?.writeText(body);
    const wa = waLink(order?.customer_phone ?? null);
    if (wa) {
      window.open(`${wa}?text=${encodeURIComponent(body)}`, "_blank", "noopener");
      toast.success("WhatsApp opened — sending is not recorded yet");
    } else {
      toast.success("No phone on file — message copied, paste it into WhatsApp");
    }
  };

  const createLink = () => {
    const amount = Number(amountText);
    if (!Number.isFinite(amount) || amount <= 0) {
      toast.error("Enter the amount to collect.");
      return;
    }
    create.mutate(Number(amount.toFixed(2)));
  };

  return <div className="flex-1 overflow-auto p-4" data-testid="invoice-payment-link">
    <div className="grid gap-4 md:grid-cols-2">
      <SectionCard><div className="p-4">
        <h2 className="text-strong mb-2">Create payment link</h2>
        <div className="space-y-3 text-body">
          {sessionsQ.isError && <p role="alert">
            Payment links could not be loaded. Try again.</p>}

          {currentStatus === "paid" && current && <div data-testid="link-paid">
            <p className="font-semibold">Payment recorded</p>
            <p>{rm(current.amount)} received through the payment link.</p>
            <p>{money.known ? `${rm(money.outstanding)} still needed` : "Value not recorded"}</p>
          </div>}

          {currentStatus === "expired" && current && <div data-testid="link-expired">
            <p className="font-semibold">Payment link expired</p>
            <p>Amount needed remains unchanged.</p>
          </div>}

          {currentStatus === "open" && current && <div data-testid="link-open">
            <p className="font-semibold">Waiting for payment</p>
            <p>{rm(current.amount)} · expires {expiryWord(current.expiresAt)}</p>
            <p className="text-label font-normal break-all">{current.url}</p>
            <p className="text-label font-normal">
              Created or sent is not payment. The receipt appears only when the customer pays.</p>
          </div>}

          {currentStatus !== "open" && <div>
            <label className="block">
              <span className="text-label">Amount to collect (RM)</span>
              <input value={amountText} onChange={(e) => setAmountText(e.target.value)}
                inputMode="decimal" aria-label="Amount to collect"
                className="mt-0.5 w-full rounded-md border border-base-200 px-2 py-1.5 text-body" />
            </label>
            <button className="btn-primary mt-2" disabled={create.isPending}
              onClick={createLink}>
              {currentStatus === "expired" ? "Create a new payment link" : "Create payment link"}
            </button>
          </div>}

          {currentStatus === "open" && <>
            {activeHeads.length > 0 ? <label className="block">
              <span className="text-label">Template</span>
              <select value={chosen?.template_key ?? ""} aria-label="Change template"
                onChange={(e) => { setChosenKey(e.target.value || null); setEditedByHand(false); }}
                className="mt-0.5 w-full rounded-md border border-base-200 px-2 py-1.5 text-body">
                {activeHeads.map((t) => <option key={t.template_key} value={t.template_key}>
                  {PAYMENT_TEMPLATE_PURPOSE_WORD[t.purpose]} · {t.name}
                  {recommended?.template_key === t.template_key ? " (recommended)" : ""}
                </option>)}
              </select>
            </label> : <p className="text-label font-normal" data-testid="link-no-template">
              No payment link template yet. The approved wording must come from its owner —
              a manager can add it in Settings. The bare link can still be copied.</p>}
            {activeHeads.length > 0 && <label className="block">
              <span className="text-label">Message</span>
              <textarea value={shown}
                onChange={(e) => { setText(e.target.value); setEditedByHand(true); }}
                rows={7} aria-label="Message"
                className="mt-0.5 w-full rounded-md border border-base-200 px-2 py-1.5 text-body" />
            </label>}
            <div className="flex flex-wrap gap-2">
              {activeHeads.length > 0 &&
                <button className="btn-secondary" onClick={copyMessage}>Copy payment message</button>}
              <button className="btn-secondary" onClick={copyLink}>Copy payment link</button>
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
            <button className="btn-primary" disabled={!file || !shown.trim() || saving || record.isPending}
              onClick={() => void recordSent()}>Record link sent</button>
          </>}

          <div><button className="btn-secondary" onClick={onClose}>Back</button></div>
        </div>
      </div></SectionCard>

      <SectionCard><div className="p-4" data-testid="link-message-preview">
        <h2 className="text-strong mb-2">What the customer receives</h2>
        {currentStatus === "open" && activeHeads.length > 0
          ? <pre className="whitespace-pre-wrap font-sans text-body">{shown}</pre>
          : currentStatus === "open"
            ? <pre className="whitespace-pre-wrap break-all font-sans text-body">{current?.url}</pre>
            : <p className="text-body text-base-500">Create the payment link first.</p>}
      </div></SectionCard>
    </div>
  </div>;
}

import { useState } from "react";
import { apiFetch } from "@/lib/api";

/**
 * WHAT ACTUALLY REACHED THE SUPPLIER
 * (CARD-2026-08-22-purchasing-02 §5.3; `docs/purchasing/MASTER.md` §5.6;
 * migration 0376).
 *
 * ── THE ONE DISTINCTION THIS COMPONENT EXISTS TO HOLD ───────────────────────
 *
 * `Open WhatsApp`, `Open email`, `Copy message` and `Download PDF` are TOOLS.
 * They open something. They record nothing, they complete nothing, and pressing
 * all four still leaves Issue PO open — because the operator can open the group,
 * be interrupted, and never paste the file. That exact sequence is how a
 * purchase order used to go missing while the Portal said it was sent.
 *
 * `Record the PDF sent` is the ACT. It stores channel, recipient, actor,
 * Malaysia time and the exact document version, through the one governed door
 * (`purchasing_confirm_po_sent`), and only then is Issue PO closed.
 *
 * It is deliberately not a tick-box. A tick-box says "I say so"; this asks WHO
 * received it, which is the fact anybody can check against the supplier later.
 */
export interface IssuedPo {
  id: string;
  supplierId: string;
  supplierName: string | null;
  destinationId: string;
  destination: string | null;
}

export type SendChannel = "whatsapp" | "email" | "print";

const CHANNEL_WORD: Record<SendChannel, string> = {
  whatsapp: "WhatsApp",
  email: "Email",
  print: "Printed",
};

export default function PoIssueEvidence({
  po,
  confirmed,
  onConfirmed,
}: {
  po: IssuedPo;
  confirmed: boolean;
  onConfirmed: () => void;
}) {
  const [channel, setChannel] = useState<SendChannel>("whatsapp");
  const [recipient, setRecipient] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const supplier = po.supplierName ?? "the supplier";
  const ready = recipient.trim().length > 0 && !saving && !confirmed;

  async function confirm() {
    if (!ready) return;
    setSaving(true);
    setError(null);
    try {
      await apiFetch(`/api/operation/pos/${encodeURIComponent(po.id)}/confirm-sent`, {
        method: "POST",
        body: JSON.stringify({ channel, recipient: recipient.trim() }),
      });
      onConfirmed();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not record the send");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex h-full flex-col" data-testid={`so-batch-evidence-${po.id}`}>
      <h2 className="text-body font-semibold">
        {confirmed ? `${po.id} reached ${supplier}` : `${po.id} has not reached ${supplier}`}
      </h2>
      <p className="mt-0.5 text-meta text-kit-slate-11">
        {confirmed
          ? `Recorded as sent by ${CHANNEL_WORD[channel]} to ${recipient.trim()}`
          : `Open the ${CHANNEL_WORD[channel]} group and send this PDF`}
      </p>

      {/* THE TOOLS. They open things. They record nothing. */}
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          data-testid="so-batch-evidence-whatsapp"
          className="h-7 rounded-control border border-kit-slate-6 px-2.5 text-meta"
          onClick={() => window.open("https://web.whatsapp.com", "_blank", "noopener")}
        >
          Open WhatsApp group
        </button>
        <button
          type="button"
          data-testid="so-batch-evidence-email"
          className="h-7 rounded-control border border-kit-slate-6 px-2.5 text-meta"
          onClick={() => window.open("mailto:", "_blank", "noopener")}
        >
          Open email
        </button>
        <a
          data-testid="so-batch-evidence-download"
          className="inline-flex h-7 items-center rounded-control border border-kit-slate-6 px-2.5 text-meta"
          href={`/api/operation/pos/${encodeURIComponent(po.id)}/print-data`}
          target="_blank"
          rel="noreferrer"
        >
          Download PDF
        </a>
      </div>

      {/* THE ACT. */}
      <div className="mt-5 flex flex-col gap-2 border-t border-kit-slate-5 pt-4">
        <label className="flex items-center justify-between gap-3 text-meta">
          <span className="text-kit-slate-11">Channel</span>
          <select
            className="h-7 min-w-[140px] rounded-control border border-kit-slate-6 px-1.5 text-meta"
            data-testid="so-batch-evidence-channel"
            value={channel}
            disabled={confirmed}
            onChange={(e) => setChannel(e.target.value as SendChannel)}
          >
            <option value="whatsapp">WhatsApp</option>
            <option value="email">Email</option>
            <option value="print">Printed</option>
          </select>
        </label>
        <label className="flex items-center justify-between gap-3 text-meta">
          <span className="text-kit-slate-11">Recipient</span>
          <input
            className="h-7 min-w-[200px] rounded-control border border-kit-slate-6 px-1.5 text-meta"
            data-testid="so-batch-evidence-recipient"
            placeholder="Hooka Purchasing Group"
            value={recipient}
            disabled={confirmed}
            onChange={(e) => setRecipient(e.target.value)}
          />
        </label>
        {error ? (
          <p className="text-meta text-kit-red-11" data-testid="so-batch-evidence-error">
            {error}
          </p>
        ) : null}
        <button
          type="button"
          data-testid="so-batch-evidence-confirm"
          className="mt-1 h-8 self-end rounded-control bg-kit-blue-9 px-3 text-meta font-medium text-white disabled:bg-kit-slate-6"
          disabled={!ready}
          onClick={() => void confirm()}
        >
          Record the PDF sent
        </button>
      </div>
    </div>
  );
}

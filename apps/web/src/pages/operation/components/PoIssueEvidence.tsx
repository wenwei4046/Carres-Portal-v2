import { useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";
import { fmtDate } from "@/lib/fmt-date";

/**
 * WHAT ACTUALLY REACHED THE SUPPLIER
 * (CARD-2026-08-22-purchasing-02 §5.3; `docs/purchasing/MASTER.md` §5.6;
 * migrations 0376 · 0377).
 *
 * ── THE ONE DISTINCTION THIS COMPONENT EXISTS TO HOLD ───────────────────────
 *
 * `Open WhatsApp`, `Open email` and `Download PDF` are TOOLS. They open
 * something. They record nothing, they complete nothing, and pressing all three
 * still leaves Issue PO open — because the operator can open the group, be
 * interrupted, and never paste the file. That exact sequence is how a purchase
 * order used to go missing while the Portal said it was sent.
 *
 * `Record the PDF sent` is the ACT. It is deliberately not a tick-box: a
 * tick-box says "I say so", while a recipient is a fact anybody can check
 * against the supplier later.
 *
 * ── AND IT IS BOUND TO THE VERSION THE OPERATOR ACTUALLY SAW ────────────────
 *
 * `version` is the version of the document that was RENDERED beside this form.
 * It rides the confirmation, SQL locks the row and compares, and a mismatch is
 * refused with `Purchase order changed`. Without that, a revise landing between
 * looking and confirming would record the NEW version as sent while the
 * supplier holds the old one — and the work to send the new document would
 * never appear (0377).
 *
 * ── IT READS PERSISTED EVIDENCE, NOT ITS OWN MEMORY ─────────────────────────
 *
 * `evidence` is the `po_sends` history. Whether this PO is shared is derived
 * from it — a `confirmed_sent` row FOR THE CURRENT VERSION — so a page reload,
 * a second operator and a revision all agree. Local state is only what the
 * operator is typing right now.
 */
export interface IssuedPo {
  id: string;
  supplierId: string;
  supplierName: string | null;
  destinationId: string;
  destination: string | null;
}

export type SendChannel = "whatsapp" | "email" | "print";

/** One `po_sends` row, as the API projects it. */
export interface PoSendEvidence {
  channel: string;
  note?: string | null;
  sent_at: string;
  kind?: "external_open" | "confirmed_sent" | null;
  recipient?: string | null;
  po_version?: number | null;
  sent_by?: string | null;
}

const CHANNEL_WORD: Record<string, string> = {
  whatsapp: "WhatsApp",
  email: "Email",
  print: "Printed",
};

/**
 * THE ONE DERIVATION: is the CURRENT version of this document with the
 * supplier?
 *
 * A `confirmed_sent` row for an EARLIER version stays in history and does not
 * count — that is the whole point of a revision. An `external_open` never
 * counts at any version.
 */
export function confirmedSendFor(
  evidence: readonly PoSendEvidence[],
  version: number,
): PoSendEvidence | null {
  return (
    evidence.find((e) => e.kind === "confirmed_sent" && (e.po_version ?? 0) === version) ?? null
  );
}

export default function PoIssueEvidence({
  po,
  version,
  evidence = [],
  onConfirmed,
}: {
  po: IssuedPo;
  /** The version of the document rendered beside this form. */
  version: number;
  /** Persisted `po_sends` history for this PO, newest first. */
  evidence?: readonly PoSendEvidence[];
  onConfirmed: () => void;
}) {
  const [channel, setChannel] = useState<SendChannel>("whatsapp");
  const [recipient, setRecipient] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [action, setAction] = useState<string | null>(null);

  const supplier = po.supplierName ?? "the supplier";
  const confirmed = useMemo(
    () => confirmedSendFor(evidence, version),
    [evidence, version],
  );
  /* Communication history — every open, and every confirmed send of an EARLIER
     version. It is shown because it is true, and it completes nothing. */
  const history = useMemo(
    () => evidence.filter((e) => e !== confirmed),
    [evidence, confirmed],
  );
  const ready = recipient.trim().length > 0 && !saving && !confirmed;

  async function confirm() {
    if (!ready) return;
    setSaving(true);
    setError(null);
    setAction(null);
    try {
      await apiFetch(`/api/operation/pos/${encodeURIComponent(po.id)}/confirm-sent`, {
        method: "POST",
        body: JSON.stringify({ channel, recipient: recipient.trim(), poVersion: version }),
      });
      onConfirmed();
    } catch (e) {
      const body = (e as { body?: { message?: string; action?: string } }).body;
      setError(body?.message ?? (e instanceof Error ? e.message : "Could not record the send"));
      setAction(body?.action ?? null);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex h-full flex-col" data-testid={`so-batch-evidence-${po.id}`}>
      <h2 className="text-body font-semibold">
        {confirmed
          ? `${po.id} · Version ${version} reached ${supplier}`
          : `${po.id} · Version ${version} has not reached ${supplier}`}
      </h2>
      <p className="mt-0.5 text-meta text-kit-slate-11">
        {confirmed
          ? `Recorded as sent by ${CHANNEL_WORD[confirmed.channel] ?? confirmed.channel}${
              confirmed.recipient ? ` to ${confirmed.recipient}` : ""
            } · ${fmtDate(confirmed.sent_at, { time: true })}`
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
            value={confirmed ? (confirmed.channel as SendChannel) : channel}
            disabled={!!confirmed}
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
            value={confirmed ? (confirmed.recipient ?? "") : recipient}
            disabled={!!confirmed}
            onChange={(e) => setRecipient(e.target.value)}
          />
        </label>
        {error ? (
          /* The approved two-line treatment: the FACT, then the FIX. */
          <span className="flex flex-col" data-testid="so-batch-evidence-error">
            <span className="text-meta text-kit-red-11">{error}</span>
            {action ? <span className="text-meta text-kit-slate-11">{action}</span> : null}
          </span>
        ) : null}
        {confirmed ? null : (
          <button
            type="button"
            data-testid="so-batch-evidence-confirm"
            className="mt-1 h-8 self-end rounded-control bg-kit-blue-9 px-3 text-meta font-medium text-white disabled:bg-kit-slate-6"
            disabled={!ready}
            onClick={() => void confirm()}
          >
            Record the PDF sent
          </button>
        )}
      </div>

      {history.length > 0 ? (
        <div
          className="mt-5 flex flex-col gap-1 border-t border-kit-slate-5 pt-3"
          data-testid={`so-batch-evidence-history-${po.id}`}
        >
          <span className="text-label uppercase tracking-wide text-kit-slate-11">
            Communication history
          </span>
          {history.map((e, i) => (
            <span key={`${e.sent_at}-${i}`} className="text-meta text-kit-slate-11">
              {e.kind === "confirmed_sent"
                ? `Version ${e.po_version ?? "?"} sent to ${e.recipient ?? "supplier"} by ${
                    CHANNEL_WORD[e.channel] ?? e.channel
                  }`
                : `${CHANNEL_WORD[e.channel] ?? e.channel} opened`}
              {" · "}
              {fmtDate(e.sent_at, { time: true })}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}

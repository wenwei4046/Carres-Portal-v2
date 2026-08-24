import { useMemo, useState } from "react";
import { purchasingRefusal } from "@carres/shared";
import { apiFetch } from "@/lib/api";
import { fmtDate } from "@/lib/fmt-date";
import { renderPoPdf } from "@/lib/pdf/render";
import type { PoTemplateData } from "@/lib/pdf/types";

/**
 * WHAT ACTUALLY REACHED THE SUPPLIER
 * (CARD-2026-08-22-purchasing-02 §5.3; `docs/purchasing/MASTER.md` §5.6;
 * migrations 0377 · 0378).
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
 * never appear (0378).
 *
 * ── IT READS PERSISTED EVIDENCE, NOT ITS OWN MEMORY ─────────────────────────
 *
 * `evidence` is the `po_sends` history. Whether this PO is shared is derived
 * from it — a `confirmed_sent` row FOR THE CURRENT VERSION — so a page reload,
 * a second operator and a revision all agree. Local state is only what the
 * operator is typing right now.
 *
 * ── AND IT IS THE ONE COMMUNICATION AREA (closure §7) ───────────────────────
 *
 * The Purchase Order page used to carry its own `Copy message`, `Open WhatsApp
 * group` and `Open email` beside this component, so one document had two sets of
 * send controls and two accounts of what had happened to it. The supplier's real
 * doors — the saved group link, the email address, the drafted message — are
 * PASSED IN and rendered here, once. A surface with no doors on file says so
 * instead of offering a button that opens nothing.
 */
export interface IssuedPo {
  id: string;
  supplierId: string;
  supplierName: string | null;
  destinationId: string;
  destination: string | null;
  /** The supplier's own doors, as `issue-batch` returns them (closure §7). */
  whatsappGroupUrl?: string | null;
  contactEmail?: string | null;
  contact?: string | null;
}

/**
 * THE SUPPLIER'S DOORS, RESOLVED FROM WHAT IS ON FILE.
 *
 * `docs/COPY-STANDARD.md` (Loo, 2026-07-28) gives the WhatsApp control two
 * labels, not one: `Open WhatsApp group` for a saved group link and
 * `Open WhatsApp` for a `wa.me/` chat with one named party. The word follows the
 * BEHAVIOUR — a label naming a door the click does not open is worse than a
 * vague one, because the operator learns to stop reading it.
 */
export function doorsForIssuedPo(po: IssuedPo, message?: string | null): PoOutboundDoors {
  const group = po.whatsappGroupUrl ?? null;
  const digits = (po.contact ?? "").replace(/\D/g, "");
  return {
    whatsapp: group
      ? { url: group, isGroup: true }
      : digits
        ? { url: `https://wa.me/${digits}`, isGroup: false }
        : null,
    mailto: po.contactEmail
      ? `mailto:${encodeURIComponent(po.contactEmail)}?subject=${encodeURIComponent(
          `${po.id} — Carres Purchase Order`,
        )}`
      : null,
    message: message ?? null,
    supplierName: po.supplierName,
  };
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
  /**
   * ⭐ WHO (0379; closure §8). Three separate facts: who actually pressed it,
   * who holds PO duty for the month, and the authorised cover when one acted.
   * `Team Work` groups by the holder; the audit must name the actor. A UUID is
   * not an actor, so the API resolves the names.
   */
  sent_by_name?: string | null;
  duty_name?: string | null;
  acting_name?: string | null;
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

/**
 * The supplier's real doors out of the Portal. They are facts about the
 * supplier, so they are resolved by whoever knows the supplier and handed here
 * — this component owns the LAW, not the address book.
 */
export interface PoOutboundDoors {
  /** The saved group link, or a `wa.me/` chat with one named party. */
  whatsapp?: { url: string; isGroup: boolean } | null;
  /** A `mailto:` with the subject and body already filled. */
  mailto?: string | null;
  /** The drafted supplier message, when the caller has one to copy. */
  message?: string | null;
  supplierName?: string | null;
}

export default function PoIssueEvidence({
  po,
  version,
  evidence = [],
  doors,
  onOpened,
  onConfirmed,
}: {
  po: IssuedPo;
  /** The version of the document rendered beside this form. */
  version: number;
  /** Persisted `po_sends` history for this PO, newest first. */
  evidence?: readonly PoSendEvidence[];
  /** The supplier's own doors; absent means none are on file. */
  doors?: PoOutboundDoors;
  /** An external app was OPENED. It records history and completes nothing. */
  onOpened?: (channel: "whatsapp" | "email") => void;
  onConfirmed: () => void;
}) {
  const [channel, setChannel] = useState<SendChannel>("whatsapp");
  const [recipient, setRecipient] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [action, setAction] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [downloading, setDownloading] = useState(false);

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
  const wa = doors?.whatsapp ?? null;

  async function copyMessage() {
    if (!doors?.message) return;
    try {
      await navigator.clipboard.writeText(doors.message);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      /* The clipboard refused. The draft is still selectable where it is
         written, so nothing is lost and nothing is claimed. */
    }
  }

  /**
   * RENDER THE DOCUMENT AND HAND IT OVER.
   *
   * `renderPoPdf` is the same template the printed paper uses, over the same
   * money-free payload, so the file the operator forwards is byte-for-byte the
   * one the supplier is meant to receive. It still records NOTHING: taking a
   * copy of a document is not sending it.
   */
  async function downloadPdf() {
    if (downloading) return;
    setDownloading(true);
    setError(null);
    setAction(null);
    let url: string | null = null;
    try {
      const data = await apiFetch<PoTemplateData>(
        `/api/operation/pos/${encodeURIComponent(po.id)}/print-data`,
      );
      const blob = await renderPoPdf(data);
      url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${po.id}.pdf`;
      a.rel = "noopener";
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch (e) {
      const body = (e as { body?: { message?: string; action?: string; code?: string } }).body;
      const fallback = purchasingRefusal(body?.code, { po: po.id, supplier: po.supplierName });
      setError(body?.message ?? fallback.wrong);
      setAction(body?.action ?? fallback.todo);
    } finally {
      /* An un-revoked object URL holds the whole PDF for the tab's life. */
      if (url) setTimeout(() => URL.revokeObjectURL(url!), 30_000);
      setDownloading(false);
    }
  }

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
      /* ⭐ THE TWO LINES, WHEREVER THEY COME FROM (closure §9). The API sends
         them; a refusal that arrives with only a code is turned into the same
         words here rather than shown as a code. */
      const body = (e as { body?: { message?: string; action?: string; code?: string } }).body;
      const fallback = purchasingRefusal(body?.code, {
        po: po.id,
        supplier: po.supplierName,
        version,
      });
      setError(body?.message ?? fallback.wrong);
      setAction(body?.action ?? fallback.todo);
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
          ? `${CHANNEL_WORD[confirmed.channel] ?? confirmed.channel}${
              confirmed.recipient ? ` to ${confirmed.recipient}` : ""
            }${confirmed.sent_by_name ? ` by ${confirmed.sent_by_name}` : ""}${
              confirmed.acting_name && confirmed.acting_name !== confirmed.sent_by_name
                ? ` (covering ${confirmed.duty_name ?? "PO duty"})`
                : ""
            } · ${fmtDate(confirmed.sent_at, { time: true })}`
          : `Open the ${CHANNEL_WORD[channel]} group and send this PDF`}
      </p>

      {/* ── THE ONE COMMUNICATION AREA (closure §7) ─────────────────────
          Every door out of the Portal for this document lives here. They OPEN
          things; they record nothing and they complete nothing. */}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {wa ? (
          <a
            data-testid="po-open-whatsapp"
            className="inline-flex h-7 items-center rounded-control border border-kit-slate-6 px-2.5 text-meta font-medium"
            href={wa.url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => onOpened?.("whatsapp")}
          >
            {wa.isGroup ? "Open WhatsApp group" : "Open WhatsApp"}
          </a>
        ) : (
          /* A button that opens nothing teaches the operator to stop reading
             the labels. The gap is named instead. */
          <span className="text-meta text-kit-slate-11" data-testid="po-no-whatsapp">
            No WhatsApp on file for {supplier}
          </span>
        )}
        {doors?.mailto ? (
          <a
            data-testid="po-open-email"
            className="inline-flex h-7 items-center rounded-control border border-kit-slate-6 px-2.5 text-meta font-medium"
            href={doors.mailto}
            onClick={() => onOpened?.("email")}
          >
            Open email
          </a>
        ) : (
          <span className="text-meta text-kit-slate-11" data-testid="po-no-email">
            No email on file for {supplier}
          </span>
        )}
        {doors?.message ? (
          <button
            type="button"
            data-testid="po-copy-message"
            className="h-7 rounded-control border border-kit-slate-6 px-2.5 text-meta"
            onClick={() => void copyMessage()}
          >
            Copy message
          </button>
        ) : null}
        {/* ⭐ A REAL PDF, NOT THE PAYLOAD BEHIND IT (closure §6). This link used
            to point at `/print-data`, so `Download PDF` handed the operator —
            and any supplier they forwarded it to — a JSON response. The same
            template the paper uses is rendered here and the file that lands is
            the document. */}
        <button
          type="button"
          data-testid="so-batch-evidence-download"
          className="h-7 rounded-control border border-kit-slate-6 px-2.5 text-meta disabled:opacity-40"
          disabled={downloading}
          onClick={() => void downloadPdf()}
        >
          {downloading ? "Opening PDF…" : "Download PDF"}
        </button>
        {copied ? (
          <span className="text-meta font-medium text-kit-green-11" data-testid="po-copied">
            Copied
          </span>
        ) : null}
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
              {/* ⭐ A CONFIRMED SEND OF AN EARLIER VERSION STAYS HISTORY.
                  It names its own version, so an old send can never be read as
                  proof that the current document reached the supplier — which
                  is the whole point of a revision (0378; closure §8). */}
              {e.kind === "confirmed_sent"
                ? `Version ${e.po_version ?? "?"} sent to ${e.recipient ?? "supplier"} by ${
                    CHANNEL_WORD[e.channel] ?? e.channel
                  }${e.sent_by_name ? ` · ${e.sent_by_name}` : ""}`
                : `${CHANNEL_WORD[e.channel] ?? e.channel} opened${
                    e.sent_by_name ? ` · ${e.sent_by_name}` : ""
                  }`}
              {" · "}
              {fmtDate(e.sent_at, { time: true })}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}

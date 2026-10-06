import { useMemo, useState } from "react";
import { purchasingRefusal, poSendChannelOf } from "@carres/shared";
import { apiFetch } from "@/lib/api";
import { queryClient } from "@/lib/query-client";
import { fmtDate } from "@/lib/fmt-date";
import { renderPoPdf } from "@/lib/pdf/render";
import type { PoTemplateData } from "@/lib/pdf/types";
import Button from "@/components/kit/Button";
import FieldFrame from "@/components/kit/FieldFrame";
import Select from "@/components/kit/Select";

/**
 * WHAT A PERSON MARKED AS SENT
 * (CARD-2026-08-22-purchasing-02 §5.3; `docs/purchasing/MASTER.md` §5.6 / §9.3;
 * migrations 0377 · 0378; send wording Jess 2026-09-16/17).
 *
 * Without a WhatsApp API the Portal cannot see a PDF leave. Staff send it
 * externally, then press `PO sent to supplier`. The mark is that person's statement
 * of sending — never proof the supplier received, read or accepted it.
 *
 * ── THE ONE DISTINCTION THIS COMPONENT EXISTS TO HOLD ───────────────────────
 *
 * `Open WhatsApp`, `Open email` and `Download PDF` are TOOLS. They open
 * something. They record nothing, they complete nothing, and pressing all three
 * still leaves Issue PO open — because the operator can open the group, be
 * interrupted, and never paste the file. That exact sequence is how a purchase
 * order used to go missing while the Portal said it was sent.
 *
 * `PO sent to supplier` is the ACT. It is deliberately not a tick-box: a
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
  version?: number;
  placedAt?: string;
  id: string;
  supplierId: string;
  supplierName: string | null;
  destinationId: string;
  destination: string | null;
  /** The supplier's own doors, as `issue-batch` returns them (closure §7). */
  whatsappGroupUrl?: string | null;
  contactEmail?: string | null;
  poSendChannel?: string | null;
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
          `Carres Purchase Order ${po.id}`,
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
   * who holds PO duty for the month, and the dated cover in force. The cover
   * context does not claim the cover pressed the action: `sent_by` alone names
   * the actual actor. A UUID is not an actor, so the API resolves the names.
   */
  sent_by_name?: string | null;
  duty_name?: string | null;
  acting_name?: string | null;
}

/* The one channel dictionary — the Register's `Sent to Supplier` evidence line
   reads it too, so the same channel never earns two spellings (Law D). */
export const CHANNEL_WORD: Record<string, string> = {
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

export function refreshPurchasingReads() {
  void queryClient.invalidateQueries({ queryKey: ["operation", "pos"] });
  void queryClient.invalidateQueries({ queryKey: ["operation", "work"] });
  void queryClient.invalidateQueries({ queryKey: ["operation", "purchase", "today"] });
}

function sendActorContext(evidence: PoSendEvidence): string {
  const actor = evidence.sent_by_name ? ` by ${evidence.sent_by_name}` : "";
  const assigned = evidence.acting_name ?? evidence.duty_name;
  return assigned ? `${actor} · Assigned to ${assigned}` : actor;
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
  layout = "panel",
  documentNo,
  onCancel,
  hidePreparationTools = false,
  mayConfirm = true,
  recordedRecipient = false,
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
  /**
   * `card` — the Work route card (Workspace MASTER §5.10, Jess 2026-09-28:
   * "what is recipient? no free text"). The same act and the same write, laid
   * out as the kit field grid: `PO` · `Channel` · `Recipient`. Channel lists
   * ONLY the channels the Supplier Master records; Recipient is the fact that
   * follows from it, never typed. With no recorded channel the form names the
   * missing contact and cannot save. The doors (WhatsApp, email, message)
   * live in Work's Communication pane, so the card draws none.
   */
  layout?: "panel" | "card";
  /** The ruled document number (`PO260903-4316`), for the card's PO fact. */
  documentNo?: string;
  onCancel?: () => void;
  /** A supplier bundle owns the one channel-preparation area; keep individual PDF and evidence. */
  hidePreparationTools?: boolean;
  /** Current document must have been reviewed; history remains readable beforehand. */
  mayConfirm?: boolean;
  /** Supplier result scope uses saved contacts; it cannot invent a recipient. */
  recordedRecipient?: boolean;
}) {
  /* The supplier's RECORDED channel is the default — the Work send line says
     `Click Email, send …` for an email-only supplier, so the form must not
     open on an empty WhatsApp recipient (Jess's send lines, 2026-09-25). */
  const [channel, setChannel] = useState<SendChannel>(() =>
    poSendChannelOf(po) ?? "whatsapp",
  );
  /* `null` until the person types: the recipient then prefills from the
     Supplier Master record for the chosen channel (group link or chat number
     for WhatsApp, address for email). It is never the supplier's name. */
  const [typedRecipient, setTypedRecipient] = useState<string | null>(null);
  const [opened, setOpened] = useState(false);
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
  const prefill =
    channel === "whatsapp"
      ? po.whatsappGroupUrl?.trim() || po.contact?.trim() || ""
      : channel === "email"
        ? po.contactEmail?.trim() || ""
        : "";
  const recipient = recordedRecipient ? prefill : typedRecipient ?? prefill;
  const ready = mayConfirm && recipient.trim().length > 0 && !saving && !confirmed;
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
      refreshPurchasingReads();
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

  if (layout === "card") {
    const group = po.whatsappGroupUrl?.trim() || null;
    const chat = (po.contact ?? "").trim() || null;
    const mail = po.contactEmail?.trim() || null;
    const recorded: Array<{ value: SendChannel; label: string; recipient: string; shown: string }> = [
      ...(group
        ? [{ value: "whatsapp" as const, label: "WhatsApp group", recipient: group, shown: `${supplier} WhatsApp group` }]
        : chat
          ? [{ value: "whatsapp" as const, label: "WhatsApp", recipient: chat, shown: chat }]
          : []),
      ...(mail ? [{ value: "email" as const, label: "Email", recipient: mail, shown: mail }] : []),
    ];
    const chosen = recorded.find((c) => c.value === channel) ?? recorded[0] ?? null;
    const canSave = mayConfirm && Boolean(chosen) && !saving && !confirmed;
    const confirmRecorded = async () => {
      if (!chosen || !canSave) return;
      setSaving(true);
      setError(null);
      setAction(null);
      try {
        await apiFetch(`/api/operation/pos/${encodeURIComponent(po.id)}/confirm-sent`, {
          method: "POST",
          body: JSON.stringify({ channel: chosen.value, recipient: chosen.recipient, poVersion: version }),
        });
        refreshPurchasingReads();
        onConfirmed();
      } catch (e) {
        const body = (e as { body?: { message?: string; action?: string; code?: string } }).body;
        const fallback = purchasingRefusal(body?.code, { po: po.id, supplier: po.supplierName, version });
        setError(body?.message ?? fallback.wrong);
        setAction(body?.action ?? fallback.todo);
      } finally {
        setSaving(false);
      }
    };
    return (
      <div className="flex flex-col gap-3" data-testid={`po-send-card-${po.id}`}>
        <div className="grid grid-cols-3 gap-3">
          <FieldFrame id={`po-send-po-${po.id}`} label="PO">
            <span id={`po-send-po-${po.id}`} className="flex min-h-8 items-center text-body text-kit-slate-12">{`${documentNo ?? po.id} V${version}`}</span>
          </FieldFrame>
          {recorded.length > 0 ? (
            <Select
              id={`po-send-channel-${po.id}`}
              label="Channel"
              value={chosen?.value}
              onValueChange={(v) => setChannel(v as SendChannel)}
              options={recorded.map((c) => ({ value: c.value, label: c.label }))}
            />
          ) : (
            <FieldFrame id={`po-send-channel-${po.id}`} label="Channel">
              <span id={`po-send-channel-${po.id}`} className="flex min-h-8 items-center text-body text-kit-red-11" data-testid="po-send-no-channel">
                {`No WhatsApp on file for ${supplier}`}
              </span>
            </FieldFrame>
          )}
          <FieldFrame id={`po-send-recipient-${po.id}`} label="Recipient">
            <span id={`po-send-recipient-${po.id}`} className="flex min-h-8 min-w-0 items-center break-all text-body text-kit-slate-12" data-testid="po-send-recipient">
              {chosen ? chosen.shown : `No email on file for ${supplier}`}
            </span>
          </FieldFrame>
        </div>
        {error ? (
          <span className="flex flex-col" data-testid="so-batch-evidence-error">
            <span className="text-meta text-kit-red-11">{error}</span>
            {action ? <span className="text-meta text-kit-slate-11">{action}</span> : null}
          </span>
        ) : null}
        <div className="flex items-center gap-2">
          <Button variant="primary" size="touch" disabled={!canSave} loading={saving} onClick={() => void confirmRecorded()} data-testid="so-batch-evidence-confirm">
            PO sent to supplier
          </Button>
          {onCancel ? <Button size="touch" onClick={onCancel}>Cancel</Button> : null}
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col" data-testid={`so-batch-evidence-${po.id}`}>
      <h2 className="text-body font-semibold">
        {confirmed
          ? `${po.id} · PO V${version} · PO sent to supplier`
          : `${po.id} · PO V${version} · Sending not confirmed`}
      </h2>
      {confirmed ? (
        <p className="mt-0.5 text-meta text-kit-slate-11">
          {`${CHANNEL_WORD[confirmed.channel] ?? confirmed.channel}${
            confirmed.recipient ? ` to ${confirmed.recipient}` : ""
          }${sendActorContext(confirmed)} · ${fmtDate(confirmed.sent_at, { time: true })}`}
        </p>
      ) : opened ? (
        /* Opening a channel records nothing; it only earns the reminder. */
        <p className="mt-0.5 text-meta text-kit-slate-11" role="status" data-testid="po-send-prompt">
          Send the PDF, then press PO sent to supplier.
        </p>
      ) : null}

      {/* ── THE ONE COMMUNICATION AREA (closure §7) ─────────────────────
          Every door out of the Portal for this document lives here. They OPEN
          things; they record nothing and they complete nothing. */}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {!hidePreparationTools && <>
        {wa ? (
          <a
            data-testid="po-open-whatsapp"
            className="inline-flex h-7 items-center rounded-control border border-kit-slate-6 px-2.5 text-meta font-medium"
            href={wa.url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => { setOpened(true); setChannel("whatsapp"); onOpened?.("whatsapp"); }}
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
            onClick={() => { setOpened(true); setChannel("email"); onOpened?.("email"); }}
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
        </>}
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
            {!recordedRecipient && <option value="print">Printed</option>}
          </select>
        </label>
        <label className="flex items-center justify-between gap-3 text-meta">
          <span className="text-kit-slate-11">Recipient</span>
          <input
            className="h-7 min-w-[200px] rounded-control border border-kit-slate-6 px-1.5 text-meta"
            data-testid="so-batch-evidence-recipient"
            readOnly={recordedRecipient}
            value={confirmed ? (confirmed.recipient ?? "") : recipient}
            disabled={!!confirmed}
            onChange={(e) => setTypedRecipient(e.target.value)}
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
            PO sent to supplier
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
                ? `PO V${e.po_version ?? "?"} marked as sent · ${CHANNEL_WORD[e.channel] ?? e.channel}${
                    e.recipient ? ` · ${e.recipient}` : ""
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

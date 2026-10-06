import { useEffect, useMemo, useRef, useState } from "react";
import { documentDisplayNumber } from "@carres/shared";
import Button from "@/components/kit/Button";
import Checkbox from "@/components/kit/Checkbox";
import Select from "@/components/kit/Select";
import Input from "@/components/kit/Input";
import Textarea from "@/components/kit/Textarea";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { fmtDate } from "@/lib/fmt-date";
import { renderPoPdf } from "@/lib/pdf/render";
import type { PoTemplateData } from "@/lib/pdf/types";
import { preparePoBundle, poBundleDocumentList, zipPoBundle } from "@/lib/purchasing/po-bundle";
import { Block } from "../SalesOrderWorkspace";
import { CHANNEL_WORD, confirmedSendFor, doorsForIssuedPo, refreshPurchasingReads, type IssuedPo, type PoSendEvidence } from "../components/PoIssueEvidence";

import {
  dispatchSupplierEmail, documentFailureOf, emailAttemptsKeyOf, loadPoDocument, loadPoSendFacts, mergeEmailAttempts,
  readEmailAttempts, recordEmailEvidence, SupplierEmailFailure, type EmailAttempt,
} from "./po-supplier-send";

/** Presentation only. Fresh owning reads still supply every document/version and send fact. */
export type PoSupplierPreparation = {
  supplierId: string; selectedIds: string[]; channel: "email" | "whatsapp";
  subject: string; messageIntroduction: string; scope: "round" | "today"; roundWindow?: string;
};
export function readPoSupplierPreparation(value: unknown): PoSupplierPreparation | undefined {
  if (!value || typeof value !== "object") return;
  const state = value as Partial<PoSupplierPreparation>;
  if (typeof state.supplierId !== "string" || !Array.isArray(state.selectedIds) || !state.selectedIds.every(id => typeof id === "string")
    || (state.channel !== "email" && state.channel !== "whatsapp") || (state.scope !== "round" && state.scope !== "today")
    || typeof state.subject !== "string" || typeof state.messageIntroduction !== "string"
    || (state.roundWindow !== undefined && typeof state.roundWindow !== "string")) return;
  return { supplierId: state.supplierId, selectedIds: [...new Set(state.selectedIds)], channel: state.channel,
    subject: state.subject, messageIntroduction: state.messageIntroduction, scope: state.scope, roundWindow: state.roundWindow };
}

/** Same issued POs, grouped for supplier preparation and human-triggered dispatch. */
export default function PoSupplierBundle({ pos, onPreview, roundWindow, onEvidenceChanged, onOpenObject, initialPreparation, title = "Purchase orders", onOpenSettings }: {
  pos: readonly IssuedPo[];
  /** The Purchasing Settings door for a PDF blocked by a missing Supplier Deliver To address. */
  onOpenSettings?: () => void;
  /** The containing step's name (the round panel's `Send PDFs`). */
  title?: string;
  roundWindow?: string;
  onPreview: (id: string, po: IssuedPo) => void;
  onEvidenceChanged?: () => void;
  onOpenObject?: (id: string, preparation: PoSupplierPreparation, sourcePos: readonly IssuedPo[]) => void;
  initialPreparation?: PoSupplierPreparation;
}) {
  const userId = useAuth(state => state.user?.id ?? "unidentified");
  const attemptsKey = emailAttemptsKeyOf(userId);
  const attemptsStorageKey = useRef(attemptsKey);
  const [scope, setScope] = useState(initialPreparation?.scope ?? "round");
  const [roundPos, setRoundPos] = useState<readonly IssuedPo[] | null>(null);
  const [todayPos, setTodayPos] = useState<readonly IssuedPo[]>(initialPreparation?.scope === "today" ? pos : []);
  const [todayLoading, setScopeLoading] = useState(initialPreparation?.scope === "today");
  const [roundLoading, setRoundLoading] = useState(false);
  const [returnedPos, setReturnedPos] = useState<readonly IssuedPo[] | null>(null);
  const [returnedLoading, setReturnedLoading] = useState(initialPreparation?.scope === "round" && !roundWindow);
  const [returnedUnavailable, setReturnedUnavailable] = useState(false);
  const [returnedRefresh, setReturnedRefresh] = useState(0);
  const scopeLoading = todayLoading || roundLoading || returnedLoading;
  const [scopeUnavailable, setScopeUnavailable] = useState(false);
  const [roundUnavailable, setRoundUnavailable] = useState(false);
  const [roundRefresh, setRoundRefresh] = useState(0);
  const activePos = scope === "today" ? todayPos : roundPos ?? returnedPos ?? pos;
  const groups = useMemo(() => [...new Map(activePos.map(po => [po.supplierId, po.supplierName ?? "Supplier"])).entries()], [activePos]);
  const [supplier, setSupplier] = useState(initialPreparation?.supplierId ?? pos[0]?.supplierId ?? "");
  const [selected, setSelected] = useState<Set<string>>(() => new Set(initialPreparation
    ? initialPreparation.selectedIds.filter(id => pos.some(po => po.id === id && po.supplierId === supplier))
    : pos.filter(po => po.supplierId === supplier).map(po => po.id)));
  const [documents, setDocuments] = useState<Record<string, PoTemplateData>>({});
  const [documentsLoading, setDocumentsLoading] = useState(true);
  const [documentFailures, setDocumentFailures] = useState<Array<{ id: string; message: string; settings?: boolean }>>([]);
  const [documentRefresh, setDocumentRefresh] = useState(0);
  const [sendHistory, setSendHistory] = useState<Record<string, PoSendEvidence[]>>({});
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyRefresh, setHistoryRefresh] = useState(0);
  const [historyFailed, setHistoryFailed] = useState<string[]>([]);
  const [channel, setChannel] = useState(initialPreparation?.channel ?? (pos[0]?.poSendChannel === "email" ? "email" : "whatsapp"));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [resend, setResend] = useState(false);
  const [emailConfigured, setEmailConfigured] = useState(false);
  const [subject, setSubject] = useState(initialPreparation?.subject ?? "Carres · Purchase Orders");
  const [messageIntroduction, setMessageIntroduction] = useState(initialPreparation?.messageIntroduction ?? "");
  const [emailAttempts, setEmailAttempts] = useState<EmailAttempt[]>(() => readEmailAttempts(attemptsKey));
  const supplierPos = useMemo(() => activePos.filter(po => po.supplierId === supplier), [activePos, supplier]);
  const picked = supplierPos.filter(po => selected.has(po.id));
  const contact = supplierPos[0];
  const message = picked.filter(po => documents[po.id]).map(po => `${documents[po.id].po_number} · V${documents[po.id].version}`).join("\n");
  const preparedMessage = [messageIntroduction.trim(), message].filter(Boolean).join("\n\n");
  const doors = contact ? doorsForIssuedPo(contact, preparedMessage) : null;
  const ready = picked.length > 0 && picked.every(po => documents[po.id]) && !documentsLoading && !busy && !scopeLoading && !scopeUnavailable && !(scope === "round" && (roundUnavailable || returnedUnavailable));
  const selectedAttempts = emailAttempts.filter(attempt => attempt.documents.some(document => picked.some(po => po.id === document.id && documents[po.id]?.version === document.version)));
  const emailOutcome = selectedAttempts.some(attempt => attempt.status === "unknown") ? "unknown" : selectedAttempts.length ? "dispatched" : null;
  const alreadySent = emailOutcome === "dispatched" || picked.some(po => documents[po.id] && confirmedSendFor(sendHistory[po.id] ?? [], documents[po.id].version));
  const sendBlocked = emailOutcome === "unknown" || (alreadySent && !resend);
  useEffect(() => { setResend(false); }, [supplier, scope, [...selected].sort().join("|")]);

  useEffect(() => {
    if (attemptsStorageKey.current !== attemptsKey) {
      attemptsStorageKey.current = attemptsKey;
      setEmailAttempts(readEmailAttempts(attemptsKey));
      return;
    }
    try { sessionStorage.setItem(attemptsKey, JSON.stringify(emailAttempts)); }
    catch { /* The pre-dispatch write below is mandatory; an outcome already known stays visible. */ }
  }, [attemptsKey, emailAttempts]);

  useEffect(() => {
    let cancelled = false;
    apiFetch<{ configured: boolean }>("/api/operation/pos/email-capability")
      .then(result => { if (!cancelled) setEmailConfigured(result.configured === true); })
      .catch(() => { if (!cancelled) setEmailConfigured(false); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    setDocuments({});
    setDocumentsLoading(true);
    setDocumentFailures([]);
    setError(null);
    Promise.allSettled(supplierPos.map(async po => [po.id, await loadPoDocument(po)] as const)).then(results => {
      if (cancelled) return;
      setDocuments(Object.fromEntries(results.flatMap(result => result.status === "fulfilled" ? [result.value] : [])));
      /* ⭐ A MISSING ADDRESS BLOCKS ONLY THIS PO's PDF, AND SAYS WHICH ONE
         (owner correction 2026-10-05); the supplier can still be sent its
         other POs by WhatsApp or Email. */
      setDocumentFailures(results.flatMap((result, index) => result.status === "rejected" ? [documentFailureOf(supplierPos[index], result.reason)] : []));
      setDocumentsLoading(false);
    });
    return () => { cancelled = true; };
  }, [supplierPos, documentRefresh]);

  useEffect(() => {
    let cancelled = false;
    setHistoryLoading(true);
    setSendHistory({});
    setHistoryFailed([]);
    void Promise.allSettled(supplierPos.map(async po => {
      const facts = await loadPoSendFacts(po, emailConfigured);
      return [po.id, facts.sends, facts.attempts, facts.failed] as const;
    })).then(results => {
      if (cancelled) return;
      setSendHistory(Object.fromEntries(results.flatMap(result => result.status === "fulfilled" ? [[result.value[0], result.value[1]]] : [])));
      const restored = results.flatMap(result => result.status === "fulfilled" ? result.value[2] : []);
      const failed = new Set(results.flatMap(result => result.status === "fulfilled" ? result.value[3] : []));
      setEmailAttempts(previous => mergeEmailAttempts(previous, restored, failed));
      setHistoryLoading(false);
      setHistoryFailed(results.flatMap((result, index) => result.status === "rejected" ? [supplierPos[index].id] : []));
    });
    return () => { cancelled = true; };
  }, [supplierPos, historyRefresh, emailConfigured]);

  useEffect(() => {
    if (initialPreparation?.scope !== "round" || roundWindow) return;
    let cancelled = false;
    setReturnedLoading(true);
    setReturnedUnavailable(false);
    void Promise.all([...new Set(pos.map(po => po.id))].map(async id => {
      const po = await apiFetch<IssuedPo>(`/api/operation/pos/${encodeURIComponent(id)}/issue-context`);
      if (po.id !== id || typeof po.supplierId !== "string" || !po.supplierId) throw new Error("invalid_po_context");
      return po;
    })).then(rows => {
      if (cancelled) return;
      setReturnedPos(rows);
      setSelected(previous => new Set([...previous].filter(id => rows.some(po => po.id === id && po.supplierId === initialPreparation.supplierId))));
    }).catch(() => { if (!cancelled) setReturnedUnavailable(true); })
      .finally(() => { if (!cancelled) setReturnedLoading(false); });
    return () => { cancelled = true; };
  }, [initialPreparation, pos, roundWindow, returnedRefresh]);

  useEffect(() => {
    if (initialPreparation?.scope !== "today") return;
    let cancelled = false;
    apiFetch<{ pos: IssuedPo[] }>("/api/operation/pos/issued-today").then(result => {
      if (cancelled) return;
      if (!Array.isArray(result.pos) || result.pos.some(po => !po || typeof po.id !== "string" || typeof po.supplierId !== "string")) throw new Error("invalid_po_scope");
      setTodayPos(result.pos);
      setSelected(previous => new Set([...previous].filter(id => result.pos.some(po => po.id === id && po.supplierId === initialPreparation.supplierId))));
    }).catch(() => { if (!cancelled) setScopeUnavailable(true); })
      .finally(() => { if (!cancelled) setScopeLoading(false); });
    return () => { cancelled = true; };
  }, [initialPreparation]);

  useEffect(() => {
    if (!roundWindow) return;
    let cancelled = false;
    setRoundLoading(true);
    setRoundUnavailable(false);
    apiFetch<{ poIds: string[] }>(`/api/operation/pos/issued-round?window=${encodeURIComponent(roundWindow)}`)
      .then(result => Promise.all([...new Set(result.poIds)].map(async id => {
        const po = await apiFetch<IssuedPo>(`/api/operation/pos/${encodeURIComponent(id)}/issue-context`);
        if (po.id !== id || !po.supplierId) throw new Error("invalid_po_context");
        return po;
      })))
      .then(rows => { if (!cancelled) setRoundPos(rows); })
      .catch(() => { if (!cancelled) setRoundUnavailable(true); })
      .finally(() => { if (!cancelled) setRoundLoading(false); });
    return () => { cancelled = true; };
  }, [roundWindow, roundRefresh]);

  function changeSupplier(id: string) {
    setSupplier(id);
    setSelected(new Set(activePos.filter(po => po.supplierId === id).map(po => po.id)));
    setChannel(activePos.find(po => po.supplierId === id)?.poSendChannel === "email" ? "email" : "whatsapp");
    setCopied(false);
    setError(null);
  }

  async function changeScope(next: "round" | "today", preservePreparation = false) {
    if (busy || scopeLoading) return;
    setScopeLoading(true);
    setError(null);
    setScopeUnavailable(false);
    try {
      const rows = next === "today"
        ? (await apiFetch<{ pos: IssuedPo[] }>("/api/operation/pos/issued-today")).pos : roundPos ?? returnedPos ?? pos;
      if (!Array.isArray(rows) || rows.some(po => !po || typeof po.id !== "string" || typeof po.supplierId !== "string")) throw new Error("invalid_po_scope");
      if (next === "today") setTodayPos(rows);
      setScope(next);
      if (preservePreparation) {
        setSelected(previous => new Set([...previous].filter(id => rows.some(po => po.id === id && po.supplierId === supplier))));
        return;
      }
      const first = rows[0];
      setSupplier(first?.supplierId ?? "");
      setSelected(new Set(rows.filter(po => po.supplierId === first?.supplierId).map(po => po.id)));
      setChannel(first?.poSendChannel === "email" ? "email" : "whatsapp");
      setCopied(false);
    } catch {
      if (scope === "today") setScopeUnavailable(true);
      setError("Could not load the preview. Try again on the document.");
    }
    finally { setScopeLoading(false); }
  }

  async function download() {
    if (!ready) return;
    setBusy(true);
    setError(null);
    let url: string | undefined;
    try {
      const prepared = await preparePoBundle(supplier, picked.map(po => ({ id: po.id, supplierId: po.supplierId, version: documents[po.id].version })),
        id => apiFetch<PoTemplateData>(`/api/operation/pos/${encodeURIComponent(id)}/print-data`), renderPoPdf);
      // Message and archive must describe the same set/version; no stale download succeeds.
      if (poBundleDocumentList(prepared) !== message) throw new Error("Purchase order changed");
      url = URL.createObjectURL(await zipPoBundle(prepared));
      const link = document.createElement("a");
      link.href = url;
      link.download = `Purchase-orders-${(contact?.supplierName ?? "Supplier").replace(/[^a-zA-Z0-9._-]/g, "_")}.zip`;
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (failure) {
      setError(failure instanceof Error && (failure.message === "stale_po_version" || failure.message === "Purchase order changed")
        ? "Purchase order changed. Open the latest PDF and send it again."
        : "Could not load the preview. Try again on the document.");
    } finally {
      if (url) URL.revokeObjectURL(url);
      setBusy(false);
    }
  }

  async function sendEmail() {
    if (!ready || !emailConfigured || !contact?.contactEmail || sendBlocked || historyLoading || historyFailed.length) return;
    setBusy(true);
    setError(null);
    try {
      // Once dispatch begins, an ambiguous response blocks another send in this visit.
      // No automatic retry; known dispatch failures retry the evidence writer only.
      const result = await dispatchSupplierEmail({ supplierId: supplier,
        picked: picked.map(po => ({ id: po.id, supplierId: po.supplierId, version: documents[po.id].version })), expectedMessage: message,
        recipient: contact.contactEmail.trim(), subject, message: messageIntroduction, resend, attemptsKey, attempts: emailAttempts,
        onReserved: setEmailAttempts });
      setResend(false);
      setEmailAttempts(previous => previous.map(attempt => attempt.id === result.attemptId ? { ...attempt, status: "dispatched", providerId: result.providerId, documents: result.documents } : attempt));
      if (result.documents.some(document => document.recorded)) { setHistoryRefresh(previous => previous + 1); refreshPurchasingReads(); onEvidenceChanged?.(); }
    } catch (failure) {
      const attemptId = (failure as { attemptId?: string }).attemptId;
      if (failure instanceof SupplierEmailFailure && failure.definite) setEmailAttempts(previous => previous.filter(attempt => attempt.id !== attemptId));
      setError(failure instanceof SupplierEmailFailure && failure.stale
        ? "Purchase order changed. Open the latest PDF and send it again."
        : "Sending not confirmed");
    } finally { setBusy(false); }
  }

  async function recordDispatchedEmail(emailEvidence: EmailAttempt) {
    if (!emailEvidence.providerId || busy) return;
    setBusy(true);
    setError(null);
    const results = await recordEmailEvidence(emailEvidence);
    setEmailAttempts(previous => previous.map(attempt => attempt.id === emailEvidence.id ? { ...attempt, documents: results } : attempt));
    if (results.some(document => document.recorded)) { setHistoryRefresh(previous => previous + 1); refreshPurchasingReads(); onEvidenceChanged?.(); }
    setBusy(false);
  }

  return <Block title={title}>
    <div className="flex flex-col gap-3" data-testid="po-supplier-bundle">
      <Select id="po-bundle-scope" label="Purchase orders" value={scope} disabled={busy || scopeLoading} onValueChange={value => void changeScope(value === "today" ? "today" : "round")} options={[{ value: "round", label: roundWindow ? "This round" : "Purchase orders" }, { value: "today", label: "Today" }]} />
      <Select id="po-bundle-supplier" label="Supplier" value={supplier} onValueChange={changeSupplier}
        disabled={busy || scopeLoading} options={groups.map(([value, label]) => ({ value, label }))} />
      {scope === "round" && roundUnavailable && <div role="alert" className="flex flex-col gap-2">
        <div className="text-meta text-kit-red-11">Evidence could not be loaded</div>
        <Button disabled={scopeLoading} onClick={() => setRoundRefresh(value => value + 1)}>Try again</Button>
      </div>}
      {scope === "round" && returnedUnavailable && <div role="alert" className="flex flex-col gap-2">
        <div className="text-meta text-kit-red-11">Evidence could not be loaded</div>
        <Button disabled={scopeLoading || busy} onClick={() => setReturnedRefresh(value => value + 1)}>Try again</Button>
      </div>}
      {scopeUnavailable && <div role="alert" className="flex flex-col gap-2">
        <div className="text-meta text-kit-red-11">Evidence could not be loaded</div>
        <Button disabled={scopeLoading || busy} onClick={() => void changeScope("today", true)}>Try again</Button>
      </div>}
      <Checkbox id="po-bundle-all" label="Select all" disabled={busy || scopeLoading || !supplierPos.length} checked={supplierPos.length > 0 && picked.length === supplierPos.length ? true : picked.length ? "indeterminate" : false}
        onCheckedChange={checked => { setSelected(new Set(checked ? supplierPos.map(po => po.id) : [])); setCopied(false); }} />
      {supplierPos.map(po => <div key={po.id} className="flex flex-col gap-2 border-t border-kit-slate-5 pt-3">
        <div className="flex items-center justify-between gap-2">
        <Checkbox id={`po-bundle-${po.id}`} label={documents[po.id] ? documentDisplayNumber(`${documents[po.id].po_number}-V${documents[po.id].version}`) : documentDisplayNumber(po.id)}
          disabled={busy} checked={selected.has(po.id)} onCheckedChange={checked => {
            setSelected(previous => { const next = new Set(previous); if (checked) next.add(po.id); else next.delete(po.id); return next; }); setCopied(false);
          }} />
        <div className="flex items-center gap-2"><Button variant="neutral" size="sm" onClick={() => onPreview(po.id, po)}>Open PDF</Button>
        {onOpenObject && <Button variant="neutral" size="sm" onClick={() => onOpenObject(po.id, {
          supplierId: supplier, selectedIds: picked.map(po => po.id), channel: channel === "email" ? "email" : "whatsapp",
          subject, messageIntroduction, scope, roundWindow,
        }, activePos)}>Open full page</Button>}</div>
        </div>
        <div className="text-body">{documents[po.id]?.destination?.name ?? po.destination}</div>
        {documents[po.id]?.so_refs?.length ? <div className="text-meta text-kit-slate-11">SO {documents[po.id].so_refs!.join(", ")}</div> : null}
        {sendHistory[po.id] && documents[po.id] && <div className="text-meta text-kit-slate-11">
          {confirmedSendFor(sendHistory[po.id], documents[po.id].version) ? "PO sent to supplier" : "Sending not confirmed"}
        </div>}
      </div>)}
      {documentFailures.length > 0 && <div role="alert" className="flex flex-col gap-2">
        {documentFailures.map(failure => <div key={failure.id} className="text-meta text-kit-red-11">{documentDisplayNumber(failure.id)} · {failure.message}</div>)}
        <div className="flex flex-wrap gap-2">
          <Button disabled={documentsLoading || busy} onClick={() => setDocumentRefresh(value => value + 1)}>Try again</Button>
          {onOpenSettings && documentFailures.some(failure => failure.settings) && <Button onClick={onOpenSettings}>Open Settings</Button>}
        </div>
      </div>}
      <Select id="po-bundle-channel" label="Communication channel" value={channel} onValueChange={value => setChannel(value === "email" ? "email" : "whatsapp")}
        disabled={busy}
        options={[{ value: "whatsapp", label: "WhatsApp" }, { value: "email", label: "Email" }]} />
      <Input id="po-bundle-recipient" label="To" readOnly value={channel === "email" ? contact?.contactEmail ?? "" : contact?.whatsappGroupUrl ?? contact?.contact ?? ""} />
      {channel === "email" && <>
        <Input id="po-bundle-subject" label="Subject" value={subject} disabled={busy || sendBlocked} onChange={event => setSubject(event.target.value)} />
      </>}
      <Textarea id="po-bundle-introduction" label="Message" value={messageIntroduction} disabled={busy || sendBlocked} onChange={event => { setMessageIntroduction(event.target.value); setCopied(false); }} />
      <Textarea id="po-bundle-message" label="PO No" value={message} readOnly />
      {channel === "email" && picked.map(po => documents[po.id] && <div key={po.id} className="text-meta text-kit-slate-11">{documents[po.id].po_number.replace(/[^a-zA-Z0-9._-]/g, "_")}-V{documents[po.id].version}.pdf</div>)}
      {channel === "email" && alreadySent && <Checkbox id="po-bundle-resend" label="Send again" checked={resend}
        disabled={busy || historyLoading || historyFailed.length > 0 || emailOutcome === "unknown"}
        onCheckedChange={checked => setResend(checked === true)} />}
      <div className="flex flex-wrap gap-2">
        <Button variant="neutral" size="sm" disabled={!ready} loading={busy} onClick={() => void download()}>Download PDFs</Button>
        <Button variant="neutral" size="sm" disabled={!ready} onClick={() => {
          void navigator.clipboard.writeText(preparedMessage).then(() => setCopied(true)).catch(() => setError("Select the message and copy it."));
        }}>Copy message</Button>
        {channel === "whatsapp" ? <Button variant="neutral" size="sm" disabled={!ready || !doors?.whatsapp}
          onClick={() => { if (doors?.whatsapp) window.open(doors.whatsapp.url, "_blank", "noopener,noreferrer"); }}>Open WhatsApp</Button>
          : <>
            {/* ⭐ EMAIL IS ALWAYS A WAY TO SEND (owner correction 2026-10-05: Ohana
                sends POs by Email today). Portal dispatch needs its provider;
                without it the operator emails from their own mail with the
                downloaded PDFs and records `PO sent to supplier` on the PO. */}
            {!emailConfigured && <Button variant="neutral" size="sm" disabled={!ready || !contact?.contactEmail}
              onClick={() => { if (contact?.contactEmail) window.location.href = `mailto:${encodeURIComponent(contact.contactEmail.trim())}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(preparedMessage)}`; }}>Open email</Button>}
            <Button variant="primary" size="sm" disabled={!ready || !emailConfigured || !contact?.contactEmail || !subject.trim() || sendBlocked || historyLoading || historyFailed.length > 0} loading={busy}
              title={!emailConfigured ? "Not available" : undefined} onClick={() => void sendEmail()}>Send Email</Button>
          </>}
      </div>
      {emailOutcome === "unknown" && <div role="status" className="text-meta text-kit-amber-11">Sending not confirmed</div>}
      {emailAttempts.filter(attempt => attempt.status === "dispatched").map(emailEvidence => <div key={emailEvidence.id} className="flex flex-col gap-2">
        <div className="text-strong">PO sent to supplier · Email</div>
        {emailEvidence.documents.map(document => <div key={document.id} className="text-meta text-kit-slate-11">{documentDisplayNumber(`${document.id}-V${document.version}`)} · {document.recorded ? "PO sent to supplier" : "Not confirmed · Try again"}</div>)}
        {emailEvidence.documents.some(document => !document.recorded) && <Button disabled={busy} onClick={() => void recordDispatchedEmail(emailEvidence)}>Save</Button>}
      </div>)}
      {copied && <div className="text-meta text-kit-slate-11">Copied. Contact result is unchanged.</div>}
      {error && <div role="alert" className="text-meta text-kit-red-11">{error}</div>}
      {historyFailed.length > 0 && <Block title="History">
        {historyFailed.map(id => <div key={id} role="alert" className="text-meta text-kit-red-11">{id} · Evidence could not be loaded</div>)}
        <Button onClick={() => setHistoryRefresh(value => value + 1)}>Try again</Button>
      </Block>}
      {supplierPos.some(po => sendHistory[po.id]?.length) && <Block title="History">
        {supplierPos.flatMap(po => (sendHistory[po.id] ?? []).map((event, index) => <div key={`${po.id}-${index}`} className="flex flex-col gap-1">
          <div className="text-strong">{event.kind === "confirmed_sent" ? "PO sent to supplier" : `${CHANNEL_WORD[event.channel] ?? event.channel} opened`}</div>
          <div className="text-body">{documentDisplayNumber(`${po.id}${event.po_version ? `-V${event.po_version}` : ""}`)} · {CHANNEL_WORD[event.channel] ?? event.channel}</div>
          <div className="text-meta text-kit-slate-11">{fmtDate(event.sent_at, { time: true })}{event.sent_by_name ? ` · ${event.sent_by_name}` : ""}</div>
        </div>))}
      </Block>}
    </div>
  </Block>;
}

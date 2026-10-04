import { useEffect, useMemo, useRef, useState } from "react";
import { documentDisplayNumber } from "@carres/shared";
import Button from "@/components/kit/Button";
import Checkbox from "@/components/kit/Checkbox";
import Select from "@/components/kit/Select";
import Input from "@/components/kit/Input";
import Textarea from "@/components/kit/Textarea";
import { ApiError, apiFetch } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { fmtDate } from "@/lib/fmt-date";
import { renderPoPdf } from "@/lib/pdf/render";
import type { PoTemplateData } from "@/lib/pdf/types";
import { preparePoBundle, poBundleDocumentList, zipPoBundle } from "@/lib/purchasing/po-bundle";
import { Block } from "../SalesOrderWorkspace";
import { CHANNEL_WORD, confirmedSendFor, doorsForIssuedPo, refreshPurchasingReads, type IssuedPo, type PoSendEvidence } from "../components/PoIssueEvidence";

type EmailAttempt = {
  id: string;
  status: "unknown" | "dispatched";
  providerId?: string;
  recipient: string;
  documents: Array<{ id: string; version: number; recorded: boolean }>;
};

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

function readEmailAttempts(key: string): EmailAttempt[] {
  try {
    const value: unknown = JSON.parse(sessionStorage.getItem(key) ?? "[]");
    if (!Array.isArray(value)) return [];
    return value.filter((attempt): attempt is EmailAttempt => Boolean(attempt) && typeof attempt.id === "string" &&
      (attempt.status === "unknown" || attempt.status === "dispatched") && typeof attempt.recipient === "string" &&
      (attempt.providerId === undefined || typeof attempt.providerId === "string") && Array.isArray(attempt.documents) &&
      attempt.documents.every((document: { id?: unknown; version?: unknown; recorded?: unknown }) =>
        typeof document.id === "string" && typeof document.version === "number" && Number.isInteger(document.version) && document.version > 0 && typeof document.recorded === "boolean"));
  } catch { return []; }
}

/** Same issued POs, grouped for supplier preparation and human-triggered dispatch. */
export default function PoSupplierBundle({ pos, onPreview, roundWindow, onEvidenceChanged, onOpenObject, initialPreparation }: {
  pos: readonly IssuedPo[];
  roundWindow?: string;
  onPreview: (id: string, po: IssuedPo) => void;
  onEvidenceChanged?: () => void;
  onOpenObject?: (id: string, preparation: PoSupplierPreparation, sourcePos: readonly IssuedPo[]) => void;
  initialPreparation?: PoSupplierPreparation;
}) {
  const userId = useAuth(state => state.user?.id ?? "unidentified");
  const attemptsKey = `carres-po-email-attempts:${userId}`;
  const attemptsStorageKey = useRef(attemptsKey);
  const [scope, setScope] = useState(initialPreparation?.scope ?? "round");
  const [roundPos, setRoundPos] = useState<readonly IssuedPo[] | null>(null);
  const [todayPos, setTodayPos] = useState<readonly IssuedPo[]>(initialPreparation?.scope === "today" ? pos : []);
  const [todayLoading, setScopeLoading] = useState(initialPreparation?.scope === "today");
  const [roundLoading, setRoundLoading] = useState(false);
  const scopeLoading = todayLoading || roundLoading;
  const [scopeUnavailable, setScopeUnavailable] = useState(false);
  const [roundUnavailable, setRoundUnavailable] = useState(false);
  const [roundRefresh, setRoundRefresh] = useState(0);
  const activePos = scope === "today" ? todayPos : roundPos ?? pos;
  const groups = useMemo(() => [...new Map(activePos.map(po => [po.supplierId, po.supplierName ?? "Supplier"])).entries()], [activePos]);
  const [supplier, setSupplier] = useState(initialPreparation?.supplierId ?? pos[0]?.supplierId ?? "");
  const [selected, setSelected] = useState<Set<string>>(() => new Set(initialPreparation
    ? initialPreparation.selectedIds.filter(id => pos.some(po => po.id === id && po.supplierId === supplier))
    : pos.filter(po => po.supplierId === supplier).map(po => po.id)));
  const [documents, setDocuments] = useState<Record<string, PoTemplateData>>({});
  const [documentsLoading, setDocumentsLoading] = useState(true);
  const [documentFailures, setDocumentFailures] = useState<Array<{ id: string; message: string }>>([]);
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
  const ready = picked.length > 0 && picked.every(po => documents[po.id]) && !documentsLoading && !busy && !scopeLoading && !scopeUnavailable && !(scope === "round" && roundUnavailable);
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
    Promise.allSettled(supplierPos.map(async po => {
      const document = await apiFetch<PoTemplateData>(`/api/operation/pos/${encodeURIComponent(po.id)}/print-data`);
      if (document.draft || document.po_id !== po.id || typeof document.po_number !== "string" || !document.po_number.trim()
        || !Number.isInteger(document.version) || document.version < 1) throw new Error("invalid_po_document");
      return [po.id, document] as const;
    })).then(results => {
      if (cancelled) return;
      setDocuments(Object.fromEntries(results.flatMap(result => result.status === "fulfilled" ? [result.value] : [])));
      setDocumentFailures(results.flatMap((result, index) => result.status === "rejected" ? [{
        id: supplierPos[index].id,
        message: result.reason instanceof ApiError && (result.reason.body as { code?: string } | null)?.code === "destination_address_missing"
          ? "Address not recorded. Check Purchasing Settings." : "Could not be loaded",
      }] : []));
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
      const result = await apiFetch<{ sends: PoSendEvidence[] }>(`/api/operation/pos/${encodeURIComponent(po.id)}/sends`);
      if (!Array.isArray(result.sends)) throw new Error("invalid_send_history");
      const recovery = emailConfigured
        ? await apiFetch<{ attempts: Array<Omit<EmailAttempt, "status"> & { status: EmailAttempt["status"] | "failed" }> }>(`/api/operation/pos/${encodeURIComponent(po.id)}/email-attempts`)
        : { attempts: [] };
      const failed = recovery.attempts.filter(attempt => attempt.status === "failed").map(attempt => attempt.id);
      const attempts = recovery.attempts.filter((attempt): attempt is EmailAttempt => attempt.status !== "failed").map(attempt => ({ ...attempt,
        documents: attempt.documents.map(document => ({ ...document,
          recorded: result.sends.some(event => event.kind === "confirmed_sent" && event.po_version === document.version && event.note?.includes(`po-email/${attempt.id}`)) })) }));
      return [po.id, result.sends, attempts, failed] as const;
    })).then(results => {
      if (cancelled) return;
      setSendHistory(Object.fromEntries(results.flatMap(result => result.status === "fulfilled" ? [[result.value[0], result.value[1]]] : [])));
      const restored = results.flatMap(result => result.status === "fulfilled" ? result.value[2] : []);
      setEmailAttempts(previous => {
        const failed = new Set(results.flatMap(result => result.status === "fulfilled" ? result.value[3] : []));
        const merged = new Map(previous.filter(attempt => !failed.has(attempt.id)).map(attempt => [attempt.id, attempt]));
        for (const attempt of restored) {
          const existing = merged.get(attempt.id);
          const documents = new Map((existing?.documents ?? []).map(document => [document.id, document]));
          for (const document of attempt.documents) documents.set(document.id, document);
          merged.set(attempt.id, { ...attempt, documents: [...documents.values()] });
        }
        return [...merged.values()];
      });
      setHistoryLoading(false);
      setHistoryFailed(results.flatMap((result, index) => result.status === "rejected" ? [supplierPos[index].id] : []));
    });
    return () => { cancelled = true; };
  }, [supplierPos, historyRefresh, emailConfigured]);

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
        ? (await apiFetch<{ pos: IssuedPo[] }>("/api/operation/pos/issued-today")).pos : roundPos ?? pos;
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
    const attemptId = crypto.randomUUID();
    try {
      const prepared = await preparePoBundle(supplier, picked.map(po => ({ id: po.id, supplierId: po.supplierId, version: documents[po.id].version })),
        id => apiFetch<PoTemplateData>(`/api/operation/pos/${encodeURIComponent(id)}/print-data`), renderPoPdf);
      if (poBundleDocumentList(prepared) !== message) throw new Error("stale_po_version");
      const files = await Promise.all(prepared.map(async po => {
        const bytes = new Uint8Array(await po.pdf.arrayBuffer());
        let binary = "";
        for (let start = 0; start < bytes.length; start += 8192) binary += String.fromCharCode(...bytes.subarray(start, start + 8192));
        return { id: po.id, version: po.version, filename: po.filename, content: btoa(binary) };
      }));
      // Once dispatch begins, an ambiguous response blocks another send in this visit.
      // No automatic retry; known dispatch failures retry the evidence writer only.
      const reserved: EmailAttempt = { id: attemptId, status: "unknown", recipient: contact.contactEmail.trim(),
        documents: files.map(({ id, version }) => ({ id, version, recorded: false })) };
      // Metadata only, no PDF bytes or credentials. A reload cannot silently forget an unknown send.
      const attempts = [...emailAttempts, reserved];
      sessionStorage.setItem(attemptsKey, JSON.stringify(attempts));
      setEmailAttempts(attempts);
      const result = await apiFetch<{ status: "dispatched"; providerId: string; documents: Array<{ id: string; version: number; recorded: boolean }> }>("/api/operation/pos/supplier-email", {
        method: "POST", body: JSON.stringify({ supplierId: supplier, recipient: contact.contactEmail.trim(), subject,
          message: messageIntroduction, attemptId, documents: files, resend }),
      });
      if (result.status !== "dispatched") throw new Error("email_unknown");
      setResend(false);
      setEmailAttempts(previous => previous.map(attempt => attempt.id === attemptId ? { ...attempt, status: "dispatched", providerId: result.providerId, documents: result.documents } : attempt));
      if (result.documents.some(document => document.recorded)) { setHistoryRefresh(previous => previous + 1); refreshPurchasingReads(); onEvidenceChanged?.(); }
    } catch (failure) {
      if (failure instanceof ApiError && ([403, 409, 422, 503].includes(failure.status) ||
        (failure.body as { code?: unknown } | null)?.code === "email_failed")) {
        setEmailAttempts(previous => previous.filter(attempt => attempt.id !== attemptId));
      }
      setError(failure instanceof Error && failure.message === "stale_po_version"
        ? "Purchase order changed. Open the latest PDF and send it again."
        : "Sending not confirmed");
    } finally { setBusy(false); }
  }

  async function recordDispatchedEmail(emailEvidence: EmailAttempt) {
    if (!emailEvidence.providerId || busy) return;
    setBusy(true);
    setError(null);
    const results = await Promise.all(emailEvidence.documents.map(async document => {
      if (document.recorded) return document;
      try {
        await apiFetch(`/api/operation/pos/${encodeURIComponent(document.id)}/confirm-sent`, { method: "POST", body: JSON.stringify({
          channel: "email", recipient: emailEvidence.recipient, poVersion: document.version, note: `Email dispatch ${emailEvidence.providerId}; po-email/${emailEvidence.id}`,
        }) });
        return { ...document, recorded: true };
      } catch { return document; }
    }));
    setEmailAttempts(previous => previous.map(attempt => attempt.id === emailEvidence.id ? { ...attempt, documents: results } : attempt));
    if (results.some(document => document.recorded)) { setHistoryRefresh(previous => previous + 1); refreshPurchasingReads(); onEvidenceChanged?.(); }
    setBusy(false);
  }

  return <Block title="Purchase orders">
    <div className="flex flex-col gap-3" data-testid="po-supplier-bundle">
      <Select id="po-bundle-scope" label="Purchase orders" value={scope} disabled={busy || scopeLoading} onValueChange={value => void changeScope(value === "today" ? "today" : "round")} options={[{ value: "round", label: roundWindow ? "This round" : "Purchase orders" }, { value: "today", label: "Today" }]} />
      <Select id="po-bundle-supplier" label="Supplier" value={supplier} onValueChange={changeSupplier}
        disabled={busy || scopeLoading} options={groups.map(([value, label]) => ({ value, label }))} />
      {scope === "round" && roundUnavailable && <div role="alert" className="flex flex-col gap-2">
        <p className="text-meta text-kit-red-11">Evidence could not be loaded</p>
        <Button disabled={scopeLoading} onClick={() => setRoundRefresh(value => value + 1)}>Try again</Button>
      </div>}
      {scopeUnavailable && <div role="alert" className="flex flex-col gap-2">
        <p className="text-meta text-kit-red-11">Evidence could not be loaded</p>
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
        <p className="text-body">{documents[po.id]?.destination?.name ?? po.destination}</p>
        {documents[po.id]?.so_refs?.length ? <p className="text-meta text-kit-slate-11">SO {documents[po.id].so_refs!.join(", ")}</p> : null}
        {sendHistory[po.id] && documents[po.id] && <p className="text-meta text-kit-slate-11">
          {confirmedSendFor(sendHistory[po.id], documents[po.id].version) ? "PO sent to supplier" : "Sending not confirmed"}
        </p>}
      </div>)}
      {documentFailures.length > 0 && <div role="alert" className="flex flex-col gap-2">
        {documentFailures.map(failure => <p key={failure.id} className="text-meta text-kit-red-11">{documentDisplayNumber(failure.id)} · {failure.message}</p>)}
        <Button disabled={documentsLoading || busy} onClick={() => setDocumentRefresh(value => value + 1)}>Try again</Button>
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
      {channel === "email" && picked.map(po => documents[po.id] && <p key={po.id} className="text-meta text-kit-slate-11">{documents[po.id].po_number.replace(/[^a-zA-Z0-9._-]/g, "_")}-V{documents[po.id].version}.pdf</p>)}
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
          : <Button variant="primary" size="sm" disabled={!ready || !emailConfigured || !contact?.contactEmail || !subject.trim() || sendBlocked || historyLoading || historyFailed.length > 0} loading={busy}
            title={!emailConfigured ? "Not available" : undefined} onClick={() => void sendEmail()}>Send Email</Button>}
      </div>
      {emailOutcome === "unknown" && <p role="status" className="text-meta text-kit-amber-11">Sending not confirmed</p>}
      {emailAttempts.filter(attempt => attempt.status === "dispatched").map(emailEvidence => <div key={emailEvidence.id} className="flex flex-col gap-2">
        <p className="text-strong">PO sent to supplier · Email</p>
        {emailEvidence.documents.map(document => <p key={document.id} className="text-meta text-kit-slate-11">{documentDisplayNumber(`${document.id}-V${document.version}`)} · {document.recorded ? "PO sent to supplier" : "Not confirmed · Try again"}</p>)}
        {emailEvidence.documents.some(document => !document.recorded) && <Button disabled={busy} onClick={() => void recordDispatchedEmail(emailEvidence)}>Save</Button>}
      </div>)}
      {copied && <p className="text-meta text-kit-slate-11">Copied. Contact result is unchanged.</p>}
      {error && <p role="alert" className="text-meta text-kit-red-11">{error}</p>}
      {historyFailed.length > 0 && <Block title="History">
        {historyFailed.map(id => <p key={id} role="alert" className="text-meta text-kit-red-11">{id} · Evidence could not be loaded</p>)}
        <Button onClick={() => setHistoryRefresh(value => value + 1)}>Try again</Button>
      </Block>}
      {supplierPos.some(po => sendHistory[po.id]?.length) && <Block title="History">
        {supplierPos.flatMap(po => (sendHistory[po.id] ?? []).map((event, index) => <div key={`${po.id}-${index}`} className="flex flex-col gap-1">
          <p className="text-strong">{event.kind === "confirmed_sent" ? "PO sent to supplier" : `${CHANNEL_WORD[event.channel] ?? event.channel} opened`}</p>
          <p className="text-body">{documentDisplayNumber(`${po.id}${event.po_version ? `-V${event.po_version}` : ""}`)} · {CHANNEL_WORD[event.channel] ?? event.channel}</p>
          <p className="text-meta text-kit-slate-11">{fmtDate(event.sent_at, { time: true })}{event.sent_by_name ? ` · ${event.sent_by_name}` : ""}</p>
        </div>))}
      </Block>}
    </div>
  </Block>;
}

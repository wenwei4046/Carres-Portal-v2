import { useEffect, useMemo, useRef, useState } from "react";
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
export default function PoSupplierBundle({ pos, onPreview, roundWindow, onEvidenceChanged }: {
  pos: readonly IssuedPo[];
  roundWindow?: string;
  onPreview: (id: string, po: IssuedPo) => void;
  onEvidenceChanged?: () => void;
}) {
  const userId = useAuth(state => state.user?.id ?? "unidentified");
  const attemptsKey = `carres-po-email-attempts:${userId}`;
  const attemptsStorageKey = useRef(attemptsKey);
  const [scope, setScope] = useState("round");
  const [roundPos, setRoundPos] = useState<readonly IssuedPo[] | null>(null);
  const [todayPos, setTodayPos] = useState<readonly IssuedPo[]>([]);
  const [scopeLoading, setScopeLoading] = useState(false);
  const activePos = scope === "today" ? todayPos : roundPos ?? pos;
  const groups = useMemo(() => [...new Map(activePos.map(po => [po.supplierId, po.supplierName ?? "Supplier"])).entries()], [activePos]);
  const [supplier, setSupplier] = useState(pos[0]?.supplierId ?? "");
  const [selected, setSelected] = useState<Set<string>>(() => new Set(pos.filter(po => po.supplierId === supplier).map(po => po.id)));
  const [documents, setDocuments] = useState<Record<string, PoTemplateData>>({});
  const [sendHistory, setSendHistory] = useState<Record<string, PoSendEvidence[]>>({});
  const [historyRefresh, setHistoryRefresh] = useState(0);
  const [historyFailed, setHistoryFailed] = useState<string[]>([]);
  const [channel, setChannel] = useState(pos[0]?.poSendChannel === "email" ? "email" : "whatsapp");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [emailConfigured, setEmailConfigured] = useState(false);
  const [subject, setSubject] = useState("Carres · Purchase Orders");
  const [messageIntroduction, setMessageIntroduction] = useState("");
  const [emailAttempts, setEmailAttempts] = useState<EmailAttempt[]>(() => readEmailAttempts(attemptsKey));
  const supplierPos = useMemo(() => activePos.filter(po => po.supplierId === supplier), [activePos, supplier]);
  const picked = supplierPos.filter(po => selected.has(po.id));
  const contact = supplierPos[0];
  const message = picked.filter(po => documents[po.id]).map(po => `${documents[po.id].po_number} · V${documents[po.id].version}`).join("\n");
  const doors = contact ? doorsForIssuedPo(contact, message) : null;
  const ready = picked.length > 0 && picked.every(po => documents[po.id]) && !busy && !scopeLoading;
  const selectedAttempts = emailAttempts.filter(attempt => attempt.documents.some(document => picked.some(po => po.id === document.id && documents[po.id]?.version === document.version)));
  const emailOutcome = selectedAttempts.some(attempt => attempt.status === "unknown") ? "unknown" : selectedAttempts.length ? "dispatched" : null;

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
    setError(null);
    Promise.all(supplierPos.map(async po => [po.id, await apiFetch<PoTemplateData>(`/api/operation/pos/${encodeURIComponent(po.id)}/print-data`)] as const))
      .then(rows => { if (!cancelled) setDocuments(Object.fromEntries(rows)); })
      .catch(() => { if (!cancelled) setError("Could not load the preview. Try again on the document."); });
    return () => { cancelled = true; };
  }, [supplierPos]);

  useEffect(() => {
    let cancelled = false;
    setSendHistory({});
    setHistoryFailed([]);
    void Promise.allSettled(supplierPos.map(async po => {
      const result = await apiFetch<{ sends: PoSendEvidence[] }>(`/api/operation/pos/${encodeURIComponent(po.id)}/sends`);
      if (!Array.isArray(result.sends)) throw new Error("invalid_send_history");
      return [po.id, result.sends] as const;
    })).then(results => {
      if (cancelled) return;
      setSendHistory(Object.fromEntries(results.flatMap(result => result.status === "fulfilled" ? [result.value] : [])));
      setHistoryFailed(results.flatMap((result, index) => result.status === "rejected" ? [supplierPos[index].id] : []));
    });
    return () => { cancelled = true; };
  }, [supplierPos, historyRefresh]);

  useEffect(() => {
    if (!roundWindow) return;
    let cancelled = false;
    setScopeLoading(true);
    apiFetch<{ poIds: string[] }>(`/api/operation/pos/issued-round?window=${encodeURIComponent(roundWindow)}`)
      .then(result => Promise.all(result.poIds.map(id => apiFetch<IssuedPo>(`/api/operation/pos/${encodeURIComponent(id)}/issue-context`))))
      .then(rows => { if (!cancelled) setRoundPos(rows); })
      .catch(() => { if (!cancelled) setError("Could not load the preview. Try again on the document."); })
      .finally(() => { if (!cancelled) setScopeLoading(false); });
    return () => { cancelled = true; };
  }, [roundWindow]);

  function changeSupplier(id: string) {
    setSupplier(id);
    setSelected(new Set(activePos.filter(po => po.supplierId === id).map(po => po.id)));
    setChannel(activePos.find(po => po.supplierId === id)?.poSendChannel === "email" ? "email" : "whatsapp");
    setCopied(false);
    setError(null);
  }

  async function changeScope(next: string) {
    if (busy || scopeLoading) return;
    setScopeLoading(true);
    setError(null);
    try {
      const rows = next === "today"
        ? (await apiFetch<{ pos: IssuedPo[] }>("/api/operation/pos/issued-today")).pos : roundPos ?? pos;
      if (next === "today") setTodayPos(rows);
      setScope(next);
      const first = rows[0];
      setSupplier(first?.supplierId ?? "");
      setSelected(new Set(rows.filter(po => po.supplierId === first?.supplierId).map(po => po.id)));
      setChannel(first?.poSendChannel === "email" ? "email" : "whatsapp");
      setCopied(false);
    } catch { setError("Could not load the preview. Try again on the document."); }
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
      link.download = `Purchase-orders-${supplier}.zip`;
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
    if (!ready || !emailConfigured || !contact?.contactEmail || emailOutcome) return;
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
          message: messageIntroduction, attemptId, documents: files }),
      });
      if (result.status !== "dispatched") throw new Error("email_unknown");
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
          channel: "email", recipient: emailEvidence.recipient, poVersion: document.version, note: `Email dispatch ${emailEvidence.providerId}`,
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
      <Select id="po-bundle-scope" label="Purchase orders" value={scope} disabled={busy || scopeLoading} onValueChange={value => void changeScope(value)} options={[{ value: "round", label: roundWindow ? "This round" : "Purchase orders" }, { value: "today", label: "Today" }]} />
      <Select id="po-bundle-supplier" label="Supplier" value={supplier} onValueChange={changeSupplier}
        disabled={busy || scopeLoading} options={groups.map(([value, label]) => ({ value, label }))} />
      <Checkbox id="po-bundle-all" label="Select all" disabled={busy || scopeLoading || !supplierPos.length} checked={supplierPos.length > 0 && picked.length === supplierPos.length ? true : picked.length ? "indeterminate" : false}
        onCheckedChange={checked => { setSelected(new Set(checked ? supplierPos.map(po => po.id) : [])); setCopied(false); }} />
      {supplierPos.map(po => <div key={po.id} className="flex flex-col gap-2 border-t border-kit-slate-5 pt-3">
        <div className="flex items-center justify-between gap-2">
        <Checkbox id={`po-bundle-${po.id}`} label={documents[po.id] ? `${documents[po.id].po_number} · V${documents[po.id].version}` : po.id}
          disabled={busy} checked={selected.has(po.id)} onCheckedChange={checked => {
            setSelected(previous => { const next = new Set(previous); if (checked) next.add(po.id); else next.delete(po.id); return next; }); setCopied(false);
          }} />
        <Button variant="neutral" size="sm" onClick={() => onPreview(po.id, po)}>Open PDF</Button>
        </div>
        <p className="text-body">{documents[po.id]?.destination?.name ?? po.destination}</p>
        {documents[po.id]?.so_refs?.length ? <p className="text-meta text-kit-slate-11">SO {documents[po.id].so_refs!.join(", ")}</p> : null}
        {sendHistory[po.id] && documents[po.id] && <p className="text-meta text-kit-slate-11">
          {confirmedSendFor(sendHistory[po.id], documents[po.id].version) ? "PO sent to supplier" : "Sending not confirmed"}
        </p>}
      </div>)}
      <Select id="po-bundle-channel" label="Communication channel" value={channel} onValueChange={setChannel}
        disabled={busy}
        options={[{ value: "whatsapp", label: "WhatsApp" }, { value: "email", label: "Email" }]} />
      <Input id="po-bundle-recipient" label="To" readOnly value={channel === "email" ? contact?.contactEmail ?? "" : contact?.whatsappGroupUrl ?? contact?.contact ?? ""} />
      {channel === "email" && <>
        <Input id="po-bundle-subject" label="Subject" value={subject} disabled={busy || Boolean(emailOutcome)} onChange={event => setSubject(event.target.value)} />
        <Textarea id="po-bundle-introduction" label="Message" value={messageIntroduction} disabled={busy || Boolean(emailOutcome)} onChange={event => setMessageIntroduction(event.target.value)} />
      </>}
      <Textarea id="po-bundle-message" label={channel === "email" ? "PO No" : "Message"} value={message} readOnly />
      {channel === "email" && picked.map(po => documents[po.id] && <p key={po.id} className="text-meta text-kit-slate-11">{documents[po.id].po_number.replace(/[^a-zA-Z0-9._-]/g, "_")}-V{documents[po.id].version}.pdf</p>)}
      <div className="flex flex-wrap gap-2">
        <Button variant="neutral" size="sm" disabled={!ready} loading={busy} onClick={() => void download()}>Download PDFs</Button>
        <Button variant="neutral" size="sm" disabled={!ready} onClick={() => {
          void navigator.clipboard.writeText(message).then(() => setCopied(true)).catch(() => setError("Select the message and copy it."));
        }}>Copy message</Button>
        {channel === "whatsapp" ? <Button variant="neutral" size="sm" disabled={!ready || !doors?.whatsapp}
          onClick={() => { if (doors?.whatsapp) window.open(doors.whatsapp.url, "_blank", "noopener,noreferrer"); }}>Open WhatsApp</Button>
          : <Button variant="primary" size="sm" disabled={!ready || !emailConfigured || !contact?.contactEmail || !subject.trim() || Boolean(emailOutcome)} loading={busy}
            title={!emailConfigured ? "Not available" : undefined} onClick={() => void sendEmail()}>Send Email</Button>}
      </div>
      {emailOutcome === "unknown" && <p role="status" className="text-meta text-kit-amber-11">Sending not confirmed</p>}
      {emailAttempts.filter(attempt => attempt.status === "dispatched").map(emailEvidence => <div key={emailEvidence.id} className="flex flex-col gap-2">
        <p className="text-strong">PO sent to supplier · Email</p>
        {emailEvidence.documents.map(document => <p key={document.id} className="text-meta text-kit-slate-11">{document.id} · V{document.version} · {document.recorded ? "PO sent to supplier" : "Not confirmed · Try again"}</p>)}
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
          <p className="text-body">{po.id}{event.po_version ? ` · V${event.po_version}` : ""} · {CHANNEL_WORD[event.channel] ?? event.channel}</p>
          <p className="text-meta text-kit-slate-11">{fmtDate(event.sent_at, { time: true })}{event.sent_by_name ? ` · ${event.sent_by_name}` : ""}</p>
        </div>))}
      </Block>}
    </div>
  </Block>;
}

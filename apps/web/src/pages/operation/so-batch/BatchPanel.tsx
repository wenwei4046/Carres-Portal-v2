/**
 * THE BATCH PANEL — the Tasks working panel for ONE batch (one dated PO
 * window): its suppliers' POs to send and its lines to buy (owner directive
 * 2026-10-06: the real Purchasing flow, through the existing doors only).
 *
 * It renders from any page: the host (the Tasks door, `tasks-host.ts`) owns the
 * right area and hands it the Work item, the window key and the host doors
 * (`close` · `back` · `result` · `openReview`). It reads the
 * same sources as SO Batch Purchase and writes only through the existing doors
 * (`issue-batch` via the approved 50/50 review, `confirm-sent`, `supplier-email`)
 * by the shared send operations — nothing new is computed in the browser.
 *
 *   Header      the supplier (one, two by name, or `{first} and {k} more`) ·
 *               `{time} · {date}` · `Missed`. Never `round` or `PO window`.
 *   Tabs        Info · SO Batch Purchase (opens first) · Sales Order.
 *   Done        every PO of the batch has `PO sent to supplier` for its
 *               current version and nothing is left to buy (§5.6.1): the
 *               host's `result` takes the success words and returns to the
 *               list; a partial send keeps the task open (`stay`).
 */
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import {
  SO_BATCH_PANEL_WORDS as R,
  SO_BATCH_TASK_WORDS as T,
  defaultAllocations,
  documentDisplayNumber,
  groupSelectionsIntoDocuments,
  isSelectableForOrder,
  parsePoWindowKey,
  poWindowTimeWord,
  soBatchPurchaseResponseSchema,
  type PurchaseDemandRow,
  type SoBatchOrderRow,
  type SoBatchPurchaseResponse,
} from "@carres/shared";
import CompactModuleCard, { type CardModule, type CardTimelineEvent } from "@/components/kit/CompactModuleCard";
import Button from "@/components/kit/Button";
import Checkbox from "@/components/kit/Checkbox";
import Icon from "@/components/kit/Icon";
import Input from "@/components/kit/Input";
import Modal from "@/components/kit/Modal";
import Select from "@/components/kit/Select";
import Tabs from "@/components/kit/Tabs";
import DocumentTable from "@/components/kit/DocumentTable";
import PdfPreview from "@/components/kit/PdfPreview";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { fmtDate } from "@/lib/fmt-date";
import { renderPoPdf } from "@/lib/pdf/render";
import type { PoTemplateData } from "@/lib/pdf/types";
import { preparePoBundle, zipPoBundle } from "@/lib/purchasing/po-bundle";
import { CHANNEL_WORD, confirmedSendFor, doorsForIssuedPo, refreshPurchasingReads, type IssuedPo, type PoSendEvidence } from "../components/PoIssueEvidence";
import EmbeddedSalesOrders from "../components/EmbeddedSalesOrders";
import SoBatchIssueWorkspace from "./SoBatchIssueWorkspace";
import type { WorkPanelHost } from "../tasks/tasks-host";
import { partiesWord } from "../tasks/tasks-model";
import {
  confirmPoSent, dispatchSupplierEmail, documentFailureOf, emailAttemptsKeyOf, loadPoDocument, loadPoSendFacts,
  mergeEmailAttempts, poListMessage, readEmailAttempts, recordEmailEvidence, SupplierEmailFailure, type EmailAttempt, type FailedEmailAttempt,
} from "./po-supplier-send";

/* ── The task: one supplier, one batch ─────────────────────────────────── */

export interface BatchTask {
  /** `2026-09-01T11:00::{supplierId}` — stable across the task's life. */
  key: string;
  windowKey: string;
  supplierId: string;
  supplierName: string;
  /** The row's action sentence: `Send 2 POs to Nice Future`, `Send PO to Nice
   *  Future`, `Issue PO to Nice Future`. */
  action: string;
  /** The row's second fact: the time, the one PO, or `SO-1368 · 1 item to buy`. */
  reference: string;
  /** The window's own instant, for the host's Missed / Today ordering. */
  dueAt: string;
}

const poLabel = (po: { poId: string; version?: number | null }) =>
  documentDisplayNumber(`${po.poId}${po.version == null ? "" : `-V${po.version}`}`);

/** POs attributed to a batch belong to its EARLIEST window, once (§5.6.1). */
function batchPos(data: SoBatchPurchaseResponse) {
  const byId = new Map<string, SoBatchOrderRow["pos"][number] & { orderIds: string[] }>();
  for (const order of data.registerRows) {
    for (const po of order.pos) {
      if (!po.poWindow) continue;
      const seen = byId.get(po.poId);
      if (!seen) byId.set(po.poId, { ...po, orderIds: [order.orderId] });
      else {
        if (po.poWindow < (seen.poWindow ?? "")) seen.poWindow = po.poWindow;
        if (!seen.orderIds.includes(order.orderId)) seen.orderIds.push(order.orderId);
      }
    }
  }
  return [...byId.values()];
}

function buyLines(data: SoBatchPurchaseResponse) {
  const status = new Map(data.registerRows.map((order) => [order.orderId, order.status]));
  return data.rows.filter((row) => row.poWindow && row.supplierId && (row.toBuy ?? 0) > 0
    && isSelectableForOrder(row, status.get(row.orderId) ?? "blank"));
}

/**
 * The open tasks of an SO Batch read: per batch and supplier, unsent POs to
 * send, else lines to buy. The same facts the panel reads; the host only orders.
 */
export function batchTasksOf(data: SoBatchPurchaseResponse): BatchTask[] {
  type Acc = { windowKey: string; supplierId: string; supplierName: string; unsent: Array<{ poId: string; version?: number | null }>; buy: PurchaseDemandRow[] };
  const tasks = new Map<string, Acc>();
  const at = (windowKey: string, supplierId: string, supplierName: string) => {
    const key = `${windowKey}::${supplierId}`;
    let acc = tasks.get(key);
    if (!acc) tasks.set(key, (acc = { windowKey, supplierId, supplierName, unsent: [], buy: [] }));
    return acc;
  };
  for (const po of batchPos(data)) {
    if (!po.supplierId || po.status === "received" || po.sentCurrentVersion) continue;
    at(po.poWindow!, po.supplierId, po.supplierName ?? "Supplier not set").unsent.push(po);
  }
  for (const row of buyLines(data)) at(row.poWindow!, row.supplierId!, row.supplier ?? "Supplier not set").buy.push(row);
  return [...tasks.entries()].map(([key, acc]) => {
    const parsed = parsePoWindowKey(acc.windowKey);
    const timeWord = parsed ? poWindowTimeWord(parsed.time) : acc.windowKey;
    const dueAt = parsed ? `${parsed.date}T${parsed.time}:00+08:00` : acc.windowKey;
    if (acc.unsent.length > 0) {
      const one = acc.unsent.length === 1;
      return { key, windowKey: acc.windowKey, supplierId: acc.supplierId, supplierName: acc.supplierName, dueAt,
        action: one ? T.sendOne(acc.supplierName) : T.sendMany(acc.unsent.length, acc.supplierName),
        reference: one ? poLabel(acc.unsent[0]!) : timeWord };
    }
    const sos = [...new Set(acc.buy.map((row) => row.so))];
    const qty = acc.buy.reduce((sum, row) => sum + (row.toBuy ?? 0), 0);
    return { key, windowKey: acc.windowKey, supplierId: acc.supplierId, supplierName: acc.supplierName, dueAt,
      action: T.issue(acc.supplierName),
      reference: `${sos.length === 1 ? (sos[0] == null ? "Not recorded" : `SO-${sos[0]}`) : T.salesOrders(sos.length)} · ${T.itemsToBuy(qty)}` };
  }).sort((a, b) => a.dueAt.localeCompare(b.dueAt) || a.supplierName.localeCompare(b.supplierName));
}

/* ── The host contract: `tasks-host.ts` (UI Tasks build) ─────────────── */

/** What the panel reads of the Tasks row: the Work item's own identity. */
export interface BatchPanelItem {
  id: string;
  timingBucket?: "overdue" | "today" | "later" | "no_date";
}

/* ── The panel ─────────────────────────────────────────────────────────── */

type PoFacts = {
  po: IssuedPo;
  document: PoTemplateData | null;
  failure: { message: string; settings?: boolean } | null;
  sends: PoSendEvidence[];
  failedRecords?: FailedEmailAttempt[];
};

const SO_BATCH_QUERY = "so-batch-purchase";
const timeOf = (iso: string) => new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Kuala_Lumpur", hour: "numeric", minute: "2-digit", hour12: true })
  .format(new Date(iso)).replace(/\s?([ap])m$/i, (_, p: string) => ` ${p.toUpperCase()}M`);
const itemsOf = (document: PoTemplateData | null) => document ? T.items(document.lines.reduce((sum, line) => sum + Number(line.qty || 0), 0)) : "";

/** The WhatsApp steps are plain numbered lines (Purchasing correction
 *  2026-10-06): the kit has no step badge, so none is drawn inline. */
const stepNumber = (n: number) => <span className="w-4 shrink-0 text-meta tabular-nums text-kit-slate-11">{n}.</span>;

export function BatchPanel({ item, windowKey, host }: { item: BatchPanelItem; windowKey: string; host: WorkPanelHost }) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const userId = useAuth((state) => state.user?.id ?? "unidentified");
  const attemptsKey = emailAttemptsKeyOf(userId);

  const batch = useQuery<SoBatchPurchaseResponse>({
    queryKey: [SO_BATCH_QUERY, windowKey],
    queryFn: async () => soBatchPurchaseResponseSchema.parse(await apiFetch<unknown>(
      `/api/operation/purchase/demands?window=${encodeURIComponent(windowKey)}`)) as SoBatchPurchaseResponse,
  });
  const data = batch.data;
  /* The whole batch: every supplier's POs and lines stamped in this window. */
  const windowPos = useMemo(() => data ? batchPos(data).filter((po) => po.poWindow === windowKey && po.status !== "received") : [], [data, windowKey]);
  const windowLines = useMemo(() => data ? buyLines(data).filter((row) => row.poWindow === windowKey) : [], [data, windowKey]);
  /* Suppliers with work first (POs to send, then lines to buy), then the rest. */
  const suppliers = useMemo(() => {
    const out = new Map<string, { id: string; name: string; work: boolean }>();
    const add = (id: string | null | undefined, name: string | null | undefined, work: boolean) => {
      if (!id) return;
      const seen = out.get(id);
      if (!seen) out.set(id, { id, name: name ?? "Supplier not set", work });
      else if (work) seen.work = true;
    };
    for (const po of windowPos) add(po.supplierId, po.supplierName, !po.sentCurrentVersion);
    for (const row of windowLines) add(row.supplierId, row.supplier, true);
    return [...out.values()].sort((a, b) => Number(b.work) - Number(a.work));
  }, [windowPos, windowLines]);
  const [supplierPick, setSupplierPick] = useState<string | null>(null);
  const picked = suppliers.find((supplier) => supplier.id === supplierPick);
  const supplierId = (picked && (picked.work || !suppliers.some((s) => s.work)) ? picked.id : suppliers.find((s) => s.work)?.id ?? picked?.id ?? suppliers[0]?.id) ?? null;
  const supplierName = suppliers.find((supplier) => supplier.id === supplierId)?.name ?? "Supplier";
  const parties = partiesWord(suppliers.filter((supplier) => supplier.work).map((supplier) => supplier.name).concat(suppliers.some((s) => s.work) ? [] : suppliers.map((s) => s.name)));
  const pos = useMemo(() => windowPos.filter((po) => po.supplierId === supplierId), [windowPos, supplierId]);
  const lines = useMemo(() => windowLines.filter((row) => row.supplierId === supplierId), [windowLines, supplierId]);

  const capability = useQuery({ queryKey: ["po-email-capability"], queryFn: () => apiFetch<{ configured: boolean }>("/api/operation/pos/email-capability"), retry: false });
  const emailConfigured = capability.data?.configured === true;

  const poKey = pos.map((po) => `${po.poId}@${po.version ?? 0}@${po.sentCurrentVersion}`).join("|");
  const facts = useQuery({
    queryKey: ["so-batch-task-pos", windowKey, supplierId, poKey, emailConfigured],
    enabled: !!data,
    /* A re-read after a send keeps the last facts on screen: the panel never
       blinks back to Loading while staff are mid-task. */
    placeholderData: (previous) => previous,
    queryFn: async () => {
      const contexts = await Promise.all(pos.map((po) => apiFetch<IssuedPo>(`/api/operation/pos/${encodeURIComponent(po.poId)}/issue-context`)));
      const settled = await Promise.all(contexts.map(async (context) => {
        const [document, history] = await Promise.allSettled([loadPoDocument(context), loadPoSendFacts(context, emailConfigured)]);
        return {
          po: context,
          document: document.status === "fulfilled" ? document.value : null,
          failure: document.status === "rejected" ? documentFailureOf(context, document.reason) : null,
          sends: history.status === "fulfilled" ? history.value.sends : [],
          attempts: history.status === "fulfilled" ? history.value.attempts : [],
          failedAttempts: history.status === "fulfilled" ? history.value.failed : [],
          failedRecords: history.status === "fulfilled" ? history.value.failedRecords : [],
        };
      }));
      return settled;
    },
  });

  /* Email attempts: reserved in this browser before dispatch, recovered from
     the server on every read (the shared rule). */
  const [attempts, setAttempts] = useState<EmailAttempt[]>(() => readEmailAttempts(attemptsKey));
  useEffect(() => {
    if (!facts.data) return;
    const restored = facts.data.flatMap((fact) => fact.attempts);
    const failed = new Set(facts.data.flatMap((fact) => fact.failedAttempts));
    setAttempts((previous) => mergeEmailAttempts(previous, restored, failed));
  }, [facts.data]);
  useEffect(() => { try { sessionStorage.setItem(attemptsKey, JSON.stringify(attempts)); } catch { /* shown already */ } }, [attemptsKey, attempts]);

  const rows: PoFacts[] = facts.data ?? [];
  const isSent = (fact: PoFacts) => !!fact.document && confirmedSendFor(fact.sends, fact.document.version);
  const sent = rows.filter(isSent);
  const unsent = rows.filter((fact) => !isSent(fact));

  /* Every unsent PO starts ticked; staff untick what they are not sending now. */
  const [unticked, setUnticked] = useState<ReadonlySet<string>>(new Set());
  const ticked = unsent.filter((fact) => !unticked.has(fact.po.id));
  const tickedReady = ticked.filter((fact) => fact.document);
  const contact = rows[0]?.po;
  const [channel, setChannel] = useState<"whatsapp" | "email" | null>(null);
  const activeChannel = channel ?? (contact?.poSendChannel === "email" ? "email" : "whatsapp");
  const [subject, setSubject] = useState("Carres · Purchase Orders");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [preview, setPreview] = useState<PoFacts | null>(null);
  const [lastEmail, setLastEmail] = useState<string | null>(null);

  /* Buying: every line to buy starts ticked too. */
  const [buyUnticked, setBuyUnticked] = useState<ReadonlySet<string>>(new Set());
  const buyTicked = lines.filter((row) => !buyUnticked.has(row.id));

  const refresh = () => {
    refreshPurchasingReads();
    /* The same reads on the client this panel is mounted under (a host may
       provide its own), so the Work list closes the row from the new facts. */
    void queryClient.invalidateQueries({ queryKey: ["operation", "work"] });
    void queryClient.invalidateQueries({ queryKey: ["operation", "pos"] });
    void queryClient.invalidateQueries({ queryKey: [SO_BATCH_QUERY] });
    void queryClient.invalidateQueries({ queryKey: ["so-batch-task-pos", windowKey] });
  };

  /* After a send: the module's own success words go to the host. The task
     stays open while anything of the batch is left; when nothing is, the host
     returns to the list (the Work item closes from the same facts). */
  const afterSend = (recorded: number, channelWord: string) => {
    const leftHere = unsent.length - recorded;
    const leftInBatch = windowPos.filter((po) => !po.sentCurrentVersion).length - recorded;
    const words = [`PO sent to supplier · ${supplierName} · ${recorded} ${recorded === 1 ? "PO" : "POs"}`, channelWord,
      ...(leftHere > 0 ? [`${leftHere} still to send`] : [])].join(" · ");
    host.result(words, { stay: leftInBatch > 0 || windowLines.length > 0 });
  };

  const message = poListMessage(tickedReady.map((fact) => fact.document!));
  const pickedEmailAttempts = attempts.filter((attempt) => attempt.documents.some((document) => rows.some((fact) => fact.po.id === document.id && fact.document?.version === document.version)));
  const unknown = pickedEmailAttempts.some((attempt) => attempt.status === "unknown");
  const missing = pickedEmailAttempts.filter((attempt) => attempt.status === "dispatched" && attempt.documents.some((document) => !document.recorded));
  /* An unknown or failed Email names who sent it and when (Timeline). Only a
     recorded actor and time are shown; without them the attempt stays off. */
  const emailEvents: CardTimelineEvent[] = (() => {
    const byId = new Map<string, { id: string; actorName?: string; at?: string; documents: EmailAttempt["documents"] }>();
    for (const attempt of pickedEmailAttempts) if (attempt.status === "unknown") byId.set(attempt.id, attempt);
    for (const attempt of rows.flatMap((fact) => fact.failedRecords ?? [])) {
      const known = byId.get(attempt.id);
      byId.set(attempt.id, { ...attempt, documents: [...(known?.documents ?? []), ...attempt.documents].filter((d, i, all) => all.findIndex((x) => x.id === d.id) === i) });
    }
    return [...byId.values()].filter((attempt) => attempt.actorName && attempt.at).map((attempt) => ({
      id: `email-${attempt.id}`, actorName: attempt.actorName!, actorInitial: attempt.actorName!.slice(0, 1).toUpperCase(),
      summary: "Email · Sending not confirmed", at: attempt.at,
      result: attempt.documents.map((d) => documentDisplayNumber(`${d.id}-V${d.version}`)).join(" · "),
    }));
  })();

  async function download() {
    if (!tickedReady.length || !contact) return;
    setBusy(true); setError(null);
    let url: string | undefined;
    try {
      const prepared = await preparePoBundle(contact.supplierId, tickedReady.map((fact) => ({ id: fact.po.id, supplierId: fact.po.supplierId, version: fact.document!.version })),
        (id) => apiFetch<PoTemplateData>(`/api/operation/pos/${encodeURIComponent(id)}/print-data`), renderPoPdf);
      url = URL.createObjectURL(await zipPoBundle(prepared));
      const link = document.createElement("a");
      link.href = url; link.download = `Purchase-orders-${supplierName.replace(/[^a-zA-Z0-9._-]/g, "_")}.zip`;
      document.body.appendChild(link); link.click(); link.remove();
    } catch {
      setError("Could not load the preview. Try again on the document.");
    } finally { if (url) URL.revokeObjectURL(url); setBusy(false); }
  }

  async function copy() {
    try { await navigator.clipboard.writeText(message); setNotice("Copied. Contact result is unchanged."); }
    catch { setError("Select the message and copy it."); }
  }

  async function recordWhatsApp() {
    if (!contact || !tickedReady.length) return;
    setBusy(true); setError(null);
    const recipient = contact.whatsappGroupUrl?.trim() || contact.contact?.trim() || "";
    try {
      for (const fact of tickedReady) await confirmPoSent(fact.po.id, fact.document!.version, "whatsapp", recipient);
      setConfirming(false);
      setUnticked(new Set());
      afterSend(tickedReady.length, "WhatsApp");
    } catch {
      setError("Result not recorded · Try again");
    } finally { setBusy(false); refresh(); }
  }

  async function sendEmail() {
    if (!contact?.contactEmail || !tickedReady.length || unknown || !emailConfigured) return;
    setBusy(true); setError(null);
    try {
      const result = await dispatchSupplierEmail({ supplierId: contact.supplierId,
        picked: tickedReady.map((fact) => ({ id: fact.po.id, supplierId: fact.po.supplierId, version: fact.document!.version })), expectedMessage: message,
        recipient: contact.contactEmail.trim(), subject, message: "", resend: false, attemptsKey, attempts, onReserved: setAttempts });
      setAttempts((previous) => previous.map((attempt) => attempt.id === result.attemptId ? { ...attempt, status: "dispatched", providerId: result.providerId, documents: result.documents } : attempt));
      setLastEmail(new Date().toISOString());
      const recorded = result.documents.filter((document) => document.recorded).length;
      /* A record still missing keeps the task here for `Save (n)`. */
      if (recorded === result.documents.length) afterSend(recorded, "Email");
    } catch (failure) {
      const attemptId = (failure as { attemptId?: string }).attemptId;
      const definite = failure instanceof SupplierEmailFailure && failure.definite;
      if (definite) setAttempts((previous) => previous.filter((attempt) => attempt.id !== attemptId));
      /* An unknown outcome is already said once, in the locked Email box. */
      if (definite) setError(failure instanceof SupplierEmailFailure && failure.stale ? "Purchase order changed. Open the latest PDF and send it again." : "Sending not confirmed");
    } finally { setBusy(false); refresh(); }
  }

  async function saveMissing() {
    setBusy(true); setError(null);
    let saved = 0;
    for (const attempt of missing) {
      const before = attempt.documents.filter((document) => !document.recorded).length;
      const documents = await recordEmailEvidence(attempt);
      saved += before - documents.filter((document) => !document.recorded).length;
      setAttempts((previous) => previous.map((current) => current.id === attempt.id ? { ...current, documents } : current));
    }
    setBusy(false); refresh();
    if (saved > 0) afterSend(saved, "Email");
  }

  function openIssue() {
    if (!data || !buyTicked.length) return;
    const destinationId = data.defaultDestinationId ?? data.destinations.find((d) => d.active)?.id;
    if (!destinationId) return;
    const leafById = new Map(data.rows.map((row) => [row.id, row]));
    const documents = groupSelectionsIntoDocuments(buyTicked.map((row) => ({ demandId: row.id, allocations: defaultAllocations(row, destinationId) })), leafById, data.destinations);
    /* The approved 50/50 review, full surface; the task stays mounted and the
       host returns to it — now with the new PO to send. */
    host.openReview((close) => (
      <SoBatchIssueWorkspace documents={documents} destinations={data.destinations} roundWindow={windowKey}
        onBack={close} onDone={close}
        onIssued={(issued) => {
          close();
          setBuyUnticked(new Set());
          refresh();
          host.result(`${issued.length === 1 ? "PO issued" : `${issued.length} POs issued`} · ${partiesWord(issued.map((po) => po.supplierName ?? ""))}`, { stay: true });
        }} />
    ));
  }

  /* ── Header facts ── */
  const parsed = parsePoWindowKey(windowKey);
  /* The date through the one date home (COPY-STANDARD): the year only when it is not this year. */
  const reference = parsed ? `${poWindowTimeWord(parsed.time)} · ${fmtDate(parsed.date)}` : windowKey;
  const status = item.timingBucket === "overdue" ? R.missed : undefined;

  /* ── SO Batch Purchase ── */
  const statusLine = lines.length > 0 && rows.length === 0 ? T.nothingIssued
    : unknown ? T.unknownPos(rows.length)
    : missing.length ? T.notRecordedYet(missing.flatMap((attempt) => attempt.documents.filter((document) => !document.recorded)).length)
    : unsent.length ? T.toSend(unsent.length) : null;
  const destinationName = (id: string | null | undefined) => data?.destinations.find((d) => d.id === id)?.name ?? "Not recorded";
  const lastSendOf = (fact: PoFacts) => [...fact.sends].reverse().find((send) => send.kind === "confirmed_sent" && send.po_version === fact.document?.version);

  const poRow = (fact: PoFacts, tickable: boolean) => (
    <div key={fact.po.id} className="flex min-w-0 items-center gap-2 border-t border-kit-slate-5 py-1.5" data-testid={`batch-po-${fact.po.id}`}>
      {tickable
        ? <Checkbox id={`batch-tick-${fact.po.id}`} label={fact.document ? documentDisplayNumber(`${fact.document.po_number}-V${fact.document.version}`) : documentDisplayNumber(fact.po.id)}
            checked={!unticked.has(fact.po.id)} disabled={busy}
            onCheckedChange={(on) => setUnticked((previous) => { const next = new Set(previous); if (on) next.delete(fact.po.id); else next.add(fact.po.id); return next; })} />
        : <span className="flex min-w-0 items-center gap-2 text-strong text-kit-green-11"><Icon name="ready" />
            <span className="whitespace-nowrap text-kit-slate-12">{fact.document ? documentDisplayNumber(`${fact.document.po_number}-V${fact.document.version}`) : documentDisplayNumber(fact.po.id)}</span></span>}
      <span className="ml-auto shrink-0 text-meta text-kit-slate-11">{itemsOf(fact.document)}</span>
      <span className={`text-meta ${tickable ? "shrink-0 text-kit-slate-11" : "min-w-0 truncate font-medium text-kit-green-11"}`}>
        {tickable ? (fact.document?.destination.name ?? fact.po.destination ?? "") : (() => {
          const send = lastSendOf(fact); return send ? T.sent(CHANNEL_WORD[send.channel] ?? send.channel, timeOf(send.sent_at)) : "";
        })()}
      </span>
      <Button iconOnly variant="ghost" icon="print" aria-label={`Open PDF ${documentDisplayNumber(fact.po.id)}`} disabled={!fact.document} onClick={() => setPreview(fact)} />
    </div>
  );

  const failures = rows.filter((fact) => fact.failure);
  const sendSection = rows.length > 0 && (
    <div className="flex flex-col gap-2" data-testid="batch-send">
      {sent.map((fact) => poRow(fact, false))}
      {unsent.length > 0 && <>
        <div className="border-t border-kit-slate-5 pt-1.5">
          <Checkbox id={`batch-select-all-${item.id}`} label={T.selectAll(ticked.length, unsent.length)} disabled={busy}
            checked={ticked.length === unsent.length ? true : ticked.length ? "indeterminate" : false}
            onCheckedChange={(on) => setUnticked(on ? new Set() : new Set(unsent.map((fact) => fact.po.id)))} />
        </div>
        {unsent.map((fact) => poRow(fact, true))}
      </>}
      {failures.length > 0 && <div role="alert" className="flex flex-col gap-1">
        {failures.map((fact) => <span key={fact.po.id} className="text-meta text-kit-red-11">{documentDisplayNumber(fact.po.id)} · {fact.failure!.message}</span>)}
        {failures.some((fact) => fact.failure!.settings) && <span><Button size="sm" onClick={() => navigate("/operation/settings/purchasing")}>Open Settings</Button></span>}
      </div>}
      {unsent.length > 0 && <>
        <Tabs variant="segmented" label="Communication channel" value={activeChannel} onValueChange={(value) => { setChannel(value === "email" ? "email" : "whatsapp"); setError(null); }}
          tabs={[{ value: "whatsapp", label: "WhatsApp", icon: "message" }, { value: "email", label: "Email", icon: "mail" }]} />
        {activeChannel === "whatsapp" ? <div className="flex flex-col gap-2" data-testid="batch-whatsapp">
          <span className="text-meta text-kit-slate-11">
            {contact?.whatsappGroupUrl ? T.toGroup(supplierName) : contact?.contact ? `To ${contact.contact}` : "To Not recorded"}
            {contact && !contact.poSendChannel ? ` · ${T.defaultNotSet} · ` : null}
            {contact && !contact.poSendChannel ? <Button variant="ghost" size="sm" onClick={() => navigate("/operation/settings/purchasing")}>{T.set}</Button> : null}
          </span>
          <ol className="flex flex-col gap-2" data-testid="batch-whatsapp-steps">
            <li className="flex items-center gap-2">{stepNumber(1)}<Button disabled={busy || !tickedReady.length} onClick={() => void download()}><Icon name="download" size={16} />{T.downloadPdfs(tickedReady.length)}</Button></li>
            <li className="flex items-center gap-2">{stepNumber(2)}<Button disabled={busy || !tickedReady.length} onClick={() => void copy()}><Icon name="copy" size={16} />{T.copyMessage}</Button></li>
            <li className="flex items-center gap-2">{stepNumber(3)}<Button disabled={busy || !contact || !doorsForIssuedPo(contact, message).whatsapp}
              onClick={() => { const door = contact ? doorsForIssuedPo(contact, message).whatsapp : null; if (door) window.open(door.url, "_blank", "noopener,noreferrer"); }}><Icon name="message" size={16} />{T.openGroup}</Button></li>
          </ol>
          <span className="text-meta text-kit-slate-11" data-testid="batch-send-hint">{T.sendHint}</span>
          <div className="flex items-center justify-end gap-2" data-testid="batch-whatsapp-step-4">
            {stepNumber(4)}<Button variant="primary" data-testid="batch-record" onClick={() => setConfirming(true)}><Icon name="confirm" size={16} />{T.recordSent(tickedReady.length)}</Button>
          </div>
        </div> : <div className="flex flex-col gap-2" data-testid="batch-email">
          <Input id={`batch-email-to-${item.id}`} label="To" readOnly value={contact?.contactEmail ?? "Not recorded"} />
          <Input id={`batch-email-subject-${item.id}`} label="Subject" value={subject} disabled={busy || unknown} onChange={(event) => setSubject(event.target.value)} />
          <span className="text-meta text-kit-slate-11">{T.attached}</span>
          {tickedReady.map((fact) => <span key={fact.po.id} className="text-meta text-kit-slate-12">{`${fact.document!.po_number.replace(/[^a-zA-Z0-9._-]/g, "_")}-V${fact.document!.version}.pdf`}</span>)}
          {unknown ? <div className="flex flex-col gap-2" data-testid="batch-email-unknown">
            <p className="rounded-control bg-kit-amber-3 px-3 py-2 text-meta text-kit-amber-11">{T.unknownBody}</p>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Button icon="history" onClick={() => setHistoryOpen(true)}>{T.openSendRecord}</Button>
              <Button variant="primary" icon="mail" disabled>Send Email</Button>
            </div>
            <span className="text-meta text-kit-slate-11">{T.unknownLock}</span>
          </div> : <div className="flex justify-end">
            <Button variant="primary" icon="mail" loading={busy} data-testid="batch-send-email"
              disabled={!emailConfigured || !contact?.contactEmail || !subject.trim() || !tickedReady.length || missing.length > 0}
              title={!emailConfigured ? "Not available" : undefined} onClick={() => void sendEmail()}>Send Email</Button>
          </div>}
        </div>}
      </>}
      {missing.length > 0 && <div className="flex flex-col gap-1 rounded-control border border-kit-slate-6 p-3" data-testid="batch-email-result">
        {missing.map((attempt) => <div key={attempt.id} className="flex flex-col gap-1">
          <span className="text-strong">{T.emailSent(attempt.documents.length, lastEmail ? timeOf(lastEmail) : "Time unavailable")}</span>
          {attempt.documents.map((document) => <span key={document.id} className={`text-meta ${document.recorded ? "text-kit-slate-12" : "text-kit-red-11"}`}>
            {documentDisplayNumber(`${document.id}-V${document.version}`)} · {document.recorded ? "PO sent to supplier" : T.notConfirmedTryAgain}
          </span>)}
        </div>)}
        <span><Button variant="primary" icon="confirm" loading={busy} onClick={() => void saveMissing()}>
          {T.saveN(missing.flatMap((attempt) => attempt.documents.filter((document) => !document.recorded)).length)}</Button></span>
        <span className="text-meta text-kit-slate-11">{T.saveHint}</span>
      </div>}
    </div>
  );

  const issueSection = lines.length > 0 && (
    <div className="flex flex-col gap-2" data-testid="batch-issue">
      {rows.length > 0 && <span className="text-meta text-kit-amber-11">{T.itemsToBuy(lines.reduce((sum, row) => sum + (row.toBuy ?? 0), 0))}</span>}
      {lines.map((row) => <div key={row.id} className="flex min-w-0 items-center gap-2 border-t border-kit-slate-5 py-1.5">
        <Checkbox id={`batch-buy-${row.id}`} label={`${row.so == null ? "Not recorded" : `SO-${row.so}`} · ${[row.item, row.variant].filter(Boolean).join(" ")}`}
          checked={!buyUnticked.has(row.id)}
          onCheckedChange={(on) => setBuyUnticked((previous) => { const next = new Set(previous); if (on) next.delete(row.id); else next.add(row.id); return next; })} />
        <span className="ml-auto shrink-0 text-meta text-kit-slate-11">× {row.toBuy}</span>
        <span className="shrink-0 text-meta text-kit-slate-11">{destinationName(data?.defaultDestinationId)}</span>
      </div>)}
      <div className="flex flex-wrap items-center gap-2">
        {data?.mayIssue
          ? <Button variant="primary" data-testid="batch-issue-po" disabled={!buyTicked.length} onClick={openIssue}>Issue PO</Button>
          : <span className="text-meta text-kit-slate-11">Only Operation staff can issue POs</span>}
        <span className="text-meta text-kit-slate-11">{T.issueOpens}</span>
      </div>
    </div>
  );

  const purchaseContent = batch.isPending || (pos.length > 0 && (facts.isPending || (facts.isPlaceholderData && rows.length !== pos.length)))
    ? <p role="status" className="px-3 py-3 text-body text-kit-slate-11">Loading…</p>
    : batch.isError || facts.isError
      ? <div role="alert" className="flex items-center gap-2 px-3 py-3 text-body text-kit-slate-11"><span>Could not be loaded</span>
          <Button size="sm" onClick={() => { void batch.refetch(); void facts.refetch(); }}>Try again</Button></div>
      : <div className="flex flex-col gap-3 px-3 py-3" data-testid={`batch-panel-purchase-${item.id}`}>
          {/* One supplier's send at a time: a message and an email go to one party. */}
          {suppliers.length > 1 && <Select id={`batch-supplier-${item.id}`} label="Supplier" value={supplierId ?? ""}
            onValueChange={(value) => { setSupplierPick(value); setUnticked(new Set()); setBuyUnticked(new Set()); setError(null); setNotice(null); }}
            options={suppliers.map((supplier) => ({ value: supplier.id, label: supplier.name }))} />}
          {statusLine && <span className="text-meta font-medium text-kit-amber-11" data-testid="batch-status">{statusLine}</span>}
          {issueSection}
          {sendSection}
          {error && <span role="alert" className="text-meta text-kit-red-11">{error}</span>}
          {notice && <span className="text-meta text-kit-slate-11">{notice}</span>}
        </div>;

  /* ── Info ── */
  const orderIds = useMemo(() => {
    if (!data) return [];
    const ids = new Set([...windowPos.flatMap((po) => po.orderIds), ...windowLines.map((row) => row.orderId)]);
    return data.registerRows.filter((order) => ids.has(order.orderId))
      .sort((a, b) => (a.proceededAt ?? "9999").localeCompare(b.proceededAt ?? "9999") || (a.so ?? 0) - (b.so ?? 0));
  }, [data, windowPos, windowLines]);
  const batchSuppliers = data ? [...new Set([...batchPos(data).filter((po) => po.poWindow === windowKey).map((po) => po.supplierName ?? ""),
    ...data.rows.filter((row) => row.poWindow === windowKey).map((row) => row.supplier ?? "")].filter(Boolean))].sort() : [];
  /* The whole batch from the same read's own window stamps (the two counts
     are never added together). */
  const batchPoCount = data ? batchPos(data).filter((po) => po.poWindow === windowKey).length : 0;
  const batchToBuy = new Set(windowLines.map((row) => row.orderId)).size;
  const infoRows: Array<[string, string]> = [
    [T.thisTask, `${windowPos.length ? T.posToSupplier(windowPos.length, parties) : T.itemsToBuy(windowLines.reduce((sum, row) => sum + (row.toBuy ?? 0), 0))} · ${T.salesOrders(orderIds.length)}`],
    [T.wholeBatch, T.wholeBatchLine(batchPoCount, batchSuppliers, batchToBuy)],
    [T.thisTaskDoneWhen, windowPos.length ? T.taskDoneRule(windowPos.length, parties) : T.taskDoneIssueRule(parties)],
    [T.batchDoneWhen, T.batchDoneRule],
  ];
  const infoContent = <dl className="flex flex-col px-3 py-2" data-testid="batch-info">
    {infoRows.map(([label, value]) => <div key={label} className="flex flex-col gap-0.5 border-t border-kit-slate-5 py-2 first:border-t-0">
      <dt className="text-meta text-kit-slate-11">{label}</dt><dd className="text-strong text-kit-slate-12">{value}</dd>
    </div>)}
  </dl>;

  /* ── Sales Order: a list first, then one (shared EmbeddedSalesOrders) ── */
  const [soPick, setSoPick] = useState<string | null>(null);
  const salesContent = orderIds.length === 1 || soPick
    ? <div className="flex flex-col gap-2 px-3 py-3">
        {orderIds.length > 1 && <span><Button variant="ghost" size="sm" icon="back" onClick={() => setSoPick(null)}>{R.allSalesOrders}</Button></span>}
        <EmbeddedSalesOrders orderIds={[soPick ?? orderIds[0]!.orderId]} />
      </div>
    : <div className="flex flex-col gap-1 px-3 py-3" data-testid="batch-so-list">
        <span className="text-strong">{T.sosOnPos(orderIds.length)}</span>
        <span className="text-meta text-kit-slate-11">{T.pickOne}</span>
        <DocumentTable label="Sales Orders" columns={[{ key: "so", label: "SO No" }, { key: "customer", label: "Customer" }]}
          rows={orderIds.map((order) => ({ key: order.orderId, onOpen: () => setSoPick(order.orderId), openLabel: `Open ${order.so == null ? "Not recorded" : `SO-${order.so}`}`,
            cells: { so: order.so == null ? "Not recorded" : `SO-${order.so}`, customer: order.customer ?? "Not recorded" } }))} />
      </div>;

  const modules: CardModule[] = [
    { key: "info", label: R.info, communication: null, content: infoContent },
    { key: "purchasing", label: R.purchasing, communication: null, content: purchaseContent },
    /* The contract shows `Sales Order` only when one is linked; loading never reads as none. */
    ...(batch.isPending ? [{ key: "sales", label: R.salesOrder, communication: null, content: <p role="status" className="px-3 py-3 text-body text-kit-slate-11">Loading…</p> }]
      : orderIds.length ? [{ key: "sales", label: R.salesOrder, communication: null, content: salesContent }] : []),
  ];

  return <div data-testid={`batch-panel-${item.id}`}>
    <CompactModuleCard name={parties} reference={reference} referenceStatus={status}
      closeLabel="Close task" onClose={host.close} modulesLabel="SO Batch Purchase" initialModule="purchasing" modules={modules}
      timeline={emailEvents.length ? emailEvents : undefined} />
    <Modal open={confirming} onOpenChange={setConfirming} title={T.confirmTitle}
      footer={<><Button onClick={() => setConfirming(false)}>Cancel</Button>
        <Button variant="primary" loading={busy} disabled={!tickedReady.length} data-testid="batch-record-confirm" onClick={() => void recordWhatsApp()}>{T.recordN(tickedReady.length)}</Button></>}>
      <div className="flex flex-col gap-1" data-testid="batch-record-list">
        {tickedReady.map((fact) => <span key={fact.po.id} className="text-body">{documentDisplayNumber(`${fact.document!.po_number}-V${fact.document!.version}`)}</span>)}
        {ticked.length < unsent.length && <span className="text-meta text-kit-slate-11">{T.notTicked}</span>}
      </div>
    </Modal>
    <Modal open={historyOpen} onOpenChange={setHistoryOpen} title="History">
      <div className="flex flex-col gap-2">
        {rows.flatMap((fact) => fact.sends.map((send, index) => <span key={`${fact.po.id}-${index}`} className="text-meta">
          {documentDisplayNumber(`${fact.po.id}${send.po_version ? `-V${send.po_version}` : ""}`)} · {send.kind === "confirmed_sent" ? "PO sent to supplier" : `${CHANNEL_WORD[send.channel] ?? send.channel} opened`} · {timeOf(send.sent_at)}
        </span>))}
        {pickedEmailAttempts.map((attempt) => <span key={attempt.id} className="text-meta">{attempt.documents.map((document) => documentDisplayNumber(`${document.id}-V${document.version}`)).join(", ")} · Email · {attempt.status === "unknown" ? "Sending not confirmed" : "PO sent to supplier"}</span>)}
      </div>
    </Modal>
    <PdfModal fact={preview} onClose={() => setPreview(null)} />
  </div>;
}

/** The existing PDF preview; the panel's ticks stay as they were. */
function PdfModal({ fact, onClose }: { fact: PoFacts | null; onClose: () => void }) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!fact?.document) return;
    let cancelled = false; let made: string | undefined;
    setUrl(null); setFailed(false);
    renderPoPdf(fact.document).then((blob) => { if (cancelled) return; made = URL.createObjectURL(blob); setUrl(made); }).catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; if (made) URL.revokeObjectURL(made); };
  }, [fact]);
  const title = fact?.document ? documentDisplayNumber(`${fact.document.po_number}-V${fact.document.version}`) : "Purchase Orders";
  return <Modal open={!!fact} onOpenChange={(open) => { if (!open) onClose(); }} title={title} width="viewer">
    {url ? <PdfPreview src={url} title={title} /> : <p className="text-body">{failed ? "Could not load the preview." : "Loading PDF…"}</p>}
  </Modal>;
}

export default BatchPanel;

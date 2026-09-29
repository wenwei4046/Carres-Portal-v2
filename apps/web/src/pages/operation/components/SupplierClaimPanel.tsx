// design-standard: not-a-list-page — full-width Claim record content.
/**
 * ⭐ THE SUPPLIER CLAIM RECORD — where the work happens (Purchasing MASTER
 * §9.5, owner-confirmed 2026-09-18; supplier reply recording approved
 * 2026-09-25). One full-width working scroll, in the approved order:
 *
 * ```text
 * Current action  fact line · instruction line · working date · ONE primary button
 * The Item        Items · SKU · reported Qty · affected Units · PO No / Unit ID · GRN No
 * Problem         type · note · evidence (the ONE shared viewer) · reported date and reporter
 * Supplier        what we asked · sending evidence · the reply state · the recorded answers
 *                 `Record what we asked` then `Record supplier reply`
 * Result          Authorised Outcome · Item Outcome · RO / PRTN doors (read-only)
 * Related         Service Case (hidden when none)
 * Documents       Claim sent to supplier · channel · recipient · actor · time
 * History         three-rank records
 * ```
 *
 * The reply form: ≥1180px a 560px right panel; below that full width under
 * Supplier; at 390 one Unit tick per row and 40px bottom actions. Every write
 * is the claim's own door; the page never prints a refusal it did not receive.
 */
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import {
  SUPPLIER_CLAIM_ABSENT,
  SUPPLIER_CLAIM_REPLY_SCOPE_WORD,
  SUPPLIER_CLAIM_RESPONSES,
  heldUnitsLine,
  requestedActionsFor,
  supplierClaimAnswerParts,
  supplierClaimCurrentAction,
  supplierClaimReplyMissing,
  supplierClaimReplyState,
  supplierClaimRequestLabel,
  supplierClaimTypeLabel,
  supplierClaimUnitLine,
  type SupplierClaimReplyScope,
} from "@carres/shared";
import {
  fetchOperationSupplierClaimPhotos,
  useOperationSupplierClaimPhotos,
  useSupplierClaimDoor,
  useSupplierClaimRecord,
  type SupplierClaimListRow,
  type SupplierClaimRecord,
  type SupplierClaimReplyRow,
} from "@/lib/queries";
import { ApiError, apiFetch } from "@/lib/api";
import { appTodayIso, fmtDate } from "@/lib/fmt-date";
import Block from "@/components/kit/Block";
import Button from "@/components/kit/Button";
import Checkbox from "@/components/kit/Checkbox";
import DatePicker from "@/components/kit/DatePicker";
import Input from "@/components/kit/Input";
import Modal from "@/components/kit/Modal";
import Select from "@/components/kit/Select";
import Textarea from "@/components/kit/Textarea";
import SavedEvidenceViewer from "@/components/kit/SavedEvidenceViewer";
import EvidenceUploadField from "@/components/EvidenceUploadField";
import { Fact } from "../SalesOrderWorkspace";
import { RecordRanks } from "../SalesOrderLedger";

const absent = SUPPLIER_CLAIM_ABSENT;
const IMAGE_MIMES = ["image/jpeg", "image/png", "image/webp"] as const;
const VIDEO_MIMES = ["video/mp4", "video/quicktime"] as const;
const PDF_MIMES = ["application/pdf"] as const;
const CHANNELS = [
  { value: "whatsapp", label: "WhatsApp" },
  { value: "email", label: "Email" },
  { value: "print", label: "Print" },
];
const CHANNEL_WORD: Record<string, string> = { whatsapp: "WhatsApp", email: "Email", print: "Print" };
/** The approved validation sentences (COPY, Supplier Claim reply form). */
const MISSING_SENTENCE: Record<string, string> = {
  "Supplier's answer": "Choose the supplier's answer.",
  "Applies to": "Choose what the answer applies to.",
  "These Units": "Tick the Units this answer applies to.",
  Evidence: "Add the evidence: a file, or who spoke and when.",
  Note: "Write the note: why the supplier refused, or what was agreed.",
};

function refusal(error: unknown): string {
  if (error instanceof ApiError) return error.message || "Not saved · Try again";
  return "Not saved · Try again";
}

/** The canvas decides: ≥1180px the reply form is a right panel. */
function useWide(min = 1180): boolean {
  const query = `(min-width: ${min}px)`;
  const [wide, setWide] = useState(() => typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia(query).matches);
  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const list = window.matchMedia(query);
    const on = () => setWide(list.matches);
    list.addEventListener?.("change", on);
    return () => list.removeEventListener?.("change", on);
  }, [query]);
  return wide;
}

/** Short inspector: facts and one door, never a mounted editor (§9.5 row
 *  expansion is read-only). Its Unit list is where `{n} Units` lands. */
export function SupplierClaimInspector({ claim, onOpen }: { claim: SupplierClaimListRow; onOpen: () => void }) {
  const units = claim.units ?? null;
  return <div className="space-y-2 p-4 text-body" data-testid="claim-inspector">
    <p>Problem: {supplierClaimTypeLabel(claim.claim_type)}</p>
    {claim.note && <p className="whitespace-pre-wrap">{claim.note}</p>}
    {claim.photo_count > 0 && <p>{claim.photo_count === 1 ? "Photo 1" : `Photos ${claim.photo_count}`}</p>}
    <div tabIndex={-1} data-claim-units={claim.id} className="focus-visible:outline focus-visible:outline-2 focus-visible:outline-kit-blue-9">
      {units == null ? <p className="text-kit-slate-11">Units could not be loaded</p>
        : units.filter((u) => u.unit_code).map((u) => <p key={u.id} className="tabular-nums">{u.unit_code}</p>)}
    </div>
    <Button variant="neutral" onClick={onOpen}>Open Claim</Button>
  </div>;
}

type Dialog = null | "ask" | "reply" | "send";

export default function SupplierClaimPanel({ claim }: { claim: SupplierClaimListRow }) {
  const record = useSupplierClaimRecord(claim.id);
  const [dialog, setDialog] = useState<Dialog>(null);
  const wide = useWide();
  const today = appTodayIso();
  const facts = {
    id: claim.id, claim_no: claim.claim_no, status: claim.status, supplier_name: claim.supplier_name,
    requested_action: claim.requested_action, requested_at: claim.requested_at, supplier_response: claim.supplier_response,
    sent: Boolean(record.data?.sends.length ?? claim.sent),
    reply_waiting_days: claim.reply_waiting_days ?? null, escalation_extra_days: claim.escalation_extra_days ?? null,
  };
  const action = supplierClaimCurrentAction(facts);
  const open = claim.status === "open";
  const openDoor = (button: string | null) =>
    setDialog(button === "Record what we asked" ? "ask" : button === "Claim sent to supplier" ? "send" : button === "Record supplier reply" ? "reply" : null);

  const replyForm = dialog === "reply"
    ? <ReplyForm claim={claim} record={record.data ?? null} wide={wide} onClose={() => setDialog(null)} />
    : null;

  return <div className={wide && replyForm ? "flex items-start gap-4" : ""}>
    <div className="flex min-w-0 flex-1 flex-col gap-4" data-testid={`claim-panel-${claim.claim_no}`}>
      {action && <Block title="Current action">
        <div className="flex flex-wrap items-center justify-between gap-3" data-testid="claim-current-action">
          <div className="min-w-0">
            <p className="text-strong text-kit-slate-12">{action.fact}</p>
            <p className="text-body text-kit-slate-11">{action.instruction}</p>
            {action.date && <p className="text-body text-kit-slate-11">{fmtDate(action.date)}</p>}
          </div>
          {action.button && <Button variant="primary" onClick={() => openDoor(action.button)} data-testid="claim-primary">{action.button}</Button>}
        </div>
      </Block>}

      <ItemSection claim={claim} record={record.data ?? null} />
      <ProblemSection claim={claim} />
      <SupplierSection claim={claim} record={record} today={today}
        onAsk={() => setDialog("ask")} onReply={() => setDialog("reply")} open={open}
        inlineForm={!wide ? replyForm : null} />
      <ResultSection claim={claim} record={record.data ?? null} />
      <DocumentsSection record={record} open={open} onSend={() => setDialog("send")} />
      <HistorySection claim={claim} record={record.data ?? null} />
    </div>
    {wide && replyForm && <aside className="sticky top-0 w-[560px] shrink-0" data-testid="claim-reply-panel">{replyForm}</aside>}
    <AskDialog claim={claim} open={dialog === "ask"} onClose={() => setDialog(null)} />
    <SendDialog claim={claim} open={dialog === "send"} onClose={() => setDialog(null)} />
  </div>;
}

function Facts({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">{children}</div>;
}

function ItemSection({ claim, record }: { claim: SupplierClaimListRow; record: SupplierClaimRecord | null }) {
  const units = record?.units ?? claim.units ?? null;
  const tracked = (units ?? []).filter((u) => u.identity_scope === "unit" && u.unit_code);
  return <Block title="The Item">
    <Facts>
      <Fact idPrefix="claim-fact" own={false} framed label="Items" value={claim.product_description
        ? <>{claim.product_description}{claim.product_variant ? <span className="block text-meta text-kit-slate-11">{claim.product_variant}</span> : null}</>
        : <>{claim.sku}<span className="block text-meta text-kit-slate-11">Recorded SKU</span></>} />
      <Fact idPrefix="claim-fact" own={false} framed label="SKU" value={claim.sku} />
      <Fact idPrefix="claim-fact" own={false} framed label="Qty" value={claim.qty} />
      <Fact idPrefix="claim-fact" own={false} framed label="Units" value={units == null ? "Units could not be loaded" : tracked.length ? tracked.map((u) => u.unit_code).join(" · ") : supplierClaimUnitLine(units)} />
      <Fact idPrefix="claim-fact" own={false} framed label="PO No" value={claim.po_id
        ? <><Link className="text-kit-blue-11 hover:underline" to={`/operation/procurement/${encodeURIComponent(claim.po_id)}`}>{claim.po_id}</Link><span className="block text-meta text-kit-slate-11">{supplierClaimUnitLine(units)}</span></>
        : absent} />
      <Fact idPrefix="claim-fact" own={false} framed label="GRN No" value={claim.grn_no && claim.warehouse_receipt_id
        ? <Link className="text-kit-blue-11 hover:underline" to={`/operation?tab=receiving&session=${encodeURIComponent(claim.warehouse_receipt_id)}`}>{claim.grn_no}</Link>
        : claim.grn_no || absent} />
    </Facts>
  </Block>;
}

function ProblemSection({ claim }: { claim: SupplierClaimListRow }) {
  const photos = useOperationSupplierClaimPhotos(claim.photo_count ? claim.id : null);
  const [evidenceId, setEvidenceId] = useState<string | null>(null);
  return <Block title="Problem">
    <div className="space-y-2 text-body text-kit-slate-12">
      <p className="font-semibold">{supplierClaimTypeLabel(claim.claim_type)}</p>
      {claim.note && <p className="whitespace-pre-wrap">{claim.note}</p>}
      <p>{`Claim Reported ${claim.reported_at ? fmtDate(claim.reported_at) : absent} · ${claim.reported_by_name || "Staff identity not recorded"}`}</p>
      {!claim.photo_count ? null : photos.isError ? <div role="alert"><p>Evidence could not be loaded</p><Button variant="neutral" onClick={() => void photos.refetch()}>Try again</Button></div>
        : photos.isLoading ? <p>Loading…</p>
        : <div className="flex flex-wrap gap-3">{photos.data?.photos.map((photo, index) => <div key={photo.path} className="space-y-1">
          <button type="button" onClick={() => setEvidenceId(photo.path)} className="text-kit-blue-11 underline">Photo {index + 1}</button>
          {photo.at && <p className="text-label text-kit-slate-11">{fmtDate(photo.at)}</p>}
        </div>)}</div>}
      <SavedEvidenceViewer activeId={evidenceId} onClose={() => setEvidenceId(null)}
        files={(photos.data?.photos ?? []).map((photo) => ({
          id: photo.path, kind: "photo" as const, url: photo.url,
          context: `${claim.claim_no} · Evidence${photo.at ? ` · ${fmtDate(photo.at)}` : ""}`,
          // Held Units are claim scope, not evidence of a photo-to-Unit association.
        }))}
        onRetry={async (id) => {
          const refreshed = await fetchOperationSupplierClaimPhotos(claim.id);
          return refreshed.photos.find((photo) => photo.path === id)?.url ?? null;
        }} />
    </div>
  </Block>;
}

/** `{answer} · {scope} · by {date} · recorded {date} · {recorder}`. */
function answerLine(reply: SupplierClaimReplyRow, codes: Map<string, string>): string {
  const parts = supplierClaimAnswerParts({ response: reply.response, scope: reply.scope, unitCodes: reply.unit_ids.map((id) => codes.get(id) ?? id) });
  return [parts.answer, parts.scope, reply.supplier_date ? `by ${fmtDate(reply.supplier_date)}` : null, `recorded ${fmtDate(reply.recorded_at)}`, reply.recorded_by_name ?? "Staff identity not recorded"]
    .filter(Boolean).join(" · ");
}

function SupplierSection({ claim, record, today, onAsk, onReply, open, inlineForm }: {
  claim: SupplierClaimListRow;
  record: ReturnType<typeof useSupplierClaimRecord>;
  today: string;
  onAsk: () => void;
  onReply: () => void;
  open: boolean;
  inlineForm: ReactNode;
}) {
  const data = record.data;
  const codes = new Map((data?.units ?? []).map((u) => [u.id, u.unit_code ?? u.id]));
  // Dates come from the timing the ask snapshotted (0607), never the live setting.
  const state = supplierClaimReplyState(claim, today);
  const stateLine = state.kind === "not_recorded" ? `Supplier Response: ${absent}`
    : state.kind === "expected" ? `Reply expected ${fmtDate(state.date)}`
    : state.kind === "overdue" ? `Reply overdue · ${fmtDate(state.date)}`
    : state.kind === "escalated" ? `Escalated to ${data?.approver_name ?? "Purchasing Approver"}`
    : null;
  const current = data?.replies.find((r) => r.current) ?? null;
  const early = (data?.replies ?? []).filter((r) => !r.formal_at);
  // A system-written ask (the retired late sweep: no requester, no send) never
  // reads as a staff act — `What we asked: Not recorded`.
  const askedBy = claim.requested_at ? (data?.requested_by_name ?? null) : null;
  const systemAsk = Boolean(claim.requested_at && data && !askedBy && claim.claim_type === "late_delivery" && data.sends.length === 0);
  return <Block title="Supplier" headerSlot={open ? <div className="flex flex-wrap gap-2">
    {!claim.supplier_response && requestedActionsFor(claim.claim_type).length > 0 && <Button variant="neutral" onClick={onAsk} data-testid="claim-record-ask">Record what we asked</Button>}
    <Button variant="neutral" onClick={onReply} data-testid="claim-record-reply">Record supplier reply</Button>
  </div> : undefined}>
    <div className="space-y-2 text-body text-kit-slate-12" data-testid="claim-supplier">
      <p>What we asked: {claim.requested_action && !systemAsk ? supplierClaimRequestLabel(claim.requested_action) : absent}
        {claim.requested_at && !systemAsk && <span className="text-kit-slate-11">{` · ${fmtDate(claim.requested_at)} · ${askedBy ?? "Staff identity not recorded"}`}</span>}</p>
      {record.isError ? <div role="alert"><p>Some information could not be refreshed.</p><Button variant="neutral" onClick={() => void record.refetch()}>Try again</Button></div>
        : (data?.sends ?? []).map((s) => <p key={s.id} data-testid="claim-send-line">{`Claim sent · ${CHANNEL_WORD[s.channel] ?? s.channel} · ${s.recipient} · ${fmtDate(s.sent_at, { time: true })} · ${s.sent_by_name ?? "Staff identity not recorded"}`}</p>)}
      {stateLine && <p data-testid="claim-reply-state">{stateLine}</p>}
      {current ? <div data-testid="claim-answer">
        <p className="font-semibold">{answerLine(current, codes)}</p>
        {current.note && <p className="whitespace-pre-wrap">{current.note}</p>}
        <EvidenceLine reply={current} claimNo={claim.claim_no} />
      </div> : claim.supplier_response ? <p data-testid="claim-answer">{supplierClaimAnswerParts({ response: claim.supplier_response, scope: null, unitCodes: [] }).answer}</p> : null}
      {early.map((r) => <div key={r.id} className="text-kit-slate-11" data-testid="claim-early-reply">
        <p>{`${answerLine(r, codes)} · Received before the ask`}</p>
      </div>)}
      {inlineForm}
    </div>
  </Block>;
}

function EvidenceLine({ reply, claimNo }: { reply: SupplierClaimReplyRow; claimNo: string }) {
  const [active, setActive] = useState<string | null>(null);
  const media = reply.evidence.filter((e) => e.kind !== "pdf");
  const pdfs = reply.evidence.filter((e) => e.kind === "pdf");
  const count = reply.evidence.length + (reply.spoke_with ? 1 : 0);
  return <div className="space-y-1">
    <p className="text-meta text-kit-slate-11">{`Evidence ${count}`}</p>
    {reply.spoke_with && <p>{`${reply.spoke_with} · ${reply.spoken_at ? fmtDate(reply.spoken_at, { time: true }) : absent}`}</p>}
    <div className="flex flex-wrap gap-3">
      {media.map((e, i) => <button key={e.path} type="button" className="text-kit-blue-11 underline" onClick={() => setActive(e.path)}>{`${e.kind === "video" ? "Video" : "Photo"} ${i + 1}`}</button>)}
      {pdfs.map((e, i) => e.url ? <a key={e.path} href={e.url} target="_blank" rel="noreferrer" className="text-kit-blue-11 underline">{`PDF ${i + 1}`}</a> : <span key={e.path}>{`PDF ${i + 1} could not be loaded`}</span>)}
    </div>
    <SavedEvidenceViewer activeId={active} onClose={() => setActive(null)}
      files={media.map((e) => ({ id: e.path, kind: e.kind as "photo" | "video", url: e.url, context: `${claimNo} · Supplier Response · ${fmtDate(reply.recorded_at)}` }))}
      onRetry={async () => null} />
  </div>;
}

function ResultSection({ claim, record }: { claim: SupplierClaimListRow; record: SupplierClaimRecord | null }) {
  const ros = record?.repair_orders ?? [];
  const prs = record?.purchase_returns ?? [];
  const units = record?.units ?? claim.units ?? [];
  if (!units.length && !ros.length && !prs.length) return null;
  return <Block title="Result">
    <Facts>
      <Fact idPrefix="claim-fact" own={false} framed label="Authorised Outcome" value={record?.authorised_outcome ?? absent} />
      <Fact idPrefix="claim-fact" own={false} framed label="Item Outcome" value={heldUnitsLine(claim.held_units, claim.hold_reason)} />
      {ros.length > 0 && <Fact idPrefix="claim-fact" own={false} framed label="RO No" value={<span className="flex flex-wrap gap-2">{ros.map((ro) => <Link key={ro.id} className="text-kit-blue-11 hover:underline" to={`/operation?tab=repair-orders&ro=${encodeURIComponent(ro.id)}`}>{ro.ro_no}</Link>)}</span>} />}
      {prs.length > 0 && <Fact idPrefix="claim-fact" own={false} framed label="PR No" value={<span className="flex flex-wrap gap-2">{prs.map((pr) => <Link key={pr.id} className="text-kit-blue-11 hover:underline" to={`/operation?tab=purchase-returns&pr=${encodeURIComponent(pr.id)}`}>{pr.pr_no}</Link>)}</span>} />}
    </Facts>
    {/* A supplier's `Repair` is an offer: `Plan Repair` shows only when the
        server confirms Authorised Outcome = Repair, the exact Units and the
        actor's permission. Otherwise the missing fact above names itself. */}
    {record?.plan_repair.allowed && <Link className="mt-3 inline-block text-kit-blue-11 underline" to={`/operation?tab=repair-orders&create=1&claim=${encodeURIComponent(claim.id)}`} data-testid="claim-plan-repair">Plan Repair</Link>}
  </Block>;
}

function DocumentsSection({ record, open, onSend }: { record: ReturnType<typeof useSupplierClaimRecord>; open: boolean; onSend: () => void }) {
  const sends = record.data?.sends ?? [];
  return <Block title="Documents" headerSlot={open ? <Button variant="neutral" onClick={onSend} data-testid="claim-record-send">Claim sent to supplier</Button> : undefined}>
    <div className="space-y-1 text-body text-kit-slate-12">
      {record.isLoading ? <p>Loading…</p> : sends.length === 0 ? <p className="text-kit-slate-11">{`Claim sent to supplier · ${absent}`}</p>
        : sends.map((s) => <p key={s.id}>{`Claim sent to supplier · ${CHANNEL_WORD[s.channel] ?? s.channel} · ${s.recipient} · ${s.sent_by_name ?? "Staff identity not recorded"} · ${fmtDate(s.sent_at, { time: true })}`}</p>)}
    </div>
  </Block>;
}

function HistorySection({ claim, record }: { claim: SupplierClaimListRow; record: SupplierClaimRecord | null }) {
  const codes = new Map((record?.units ?? []).map((u) => [u.id, u.unit_code ?? u.id]));
  const events = useMemo(() => [
    { title: "Claim Reported", date: claim.reported_at, actor: claim.reported_by_name, detail: claim.note },
    { title: "What we asked", date: claim.requested_at, actor: record?.requested_by_name ?? null, detail: claim.requested_action ? supplierClaimRequestLabel(claim.requested_action) : null },
    ...(record?.sends ?? []).map((s) => ({ title: "Claim sent to supplier", date: s.sent_at, actor: s.sent_by_name, detail: `${CHANNEL_WORD[s.channel] ?? s.channel} · ${s.recipient}` })),
    ...(record?.replies ?? []).map((r) => ({ title: "Supplier Response", date: r.recorded_at, actor: r.recorded_by_name, detail: answerLine(r, codes) })),
    ...(record?.replies.length ? [] : [{ title: "Supplier Response", date: claim.responded_at, actor: null, detail: claim.supplier_response ? supplierClaimAnswerParts({ response: claim.supplier_response, scope: null, unitCodes: [] }).answer : null }]),
    { title: "Closed", date: claim.closed_at, actor: null, detail: claim.close_note },
  ].filter((event) => event.date).sort((a, b) => a.date!.localeCompare(b.date!)), [claim, record]); // eslint-disable-line react-hooks/exhaustive-deps
  return <Block title="History">
    {events.map((event, index) => <div key={`${event.title}-${event.date}-${index}`} className="flex flex-col gap-1 py-2">
      <RecordRanks index={index} words={{ title: event.title, identity: `${event.actor || "Staff identity not recorded"} · ${fmtDate(event.date!, { time: true })}`, detail: event.detail ? [event.detail] : [] }} />
    </div>)}
  </Block>;
}

function ErrorLine({ error }: { error: unknown }) {
  return error ? <p role="alert" className="rounded-control border border-kit-red-9 bg-kit-red-3 px-3 py-2 text-body text-kit-red-11">{refusal(error)}</p> : null;
}

function DoorDialog({ open, onClose, title, pending, error, canSave, onSave, saveWord, children }: {
  open: boolean; onClose: () => void; title: string; pending: boolean; error: unknown; canSave: boolean; onSave: () => void; saveWord: string; children: ReactNode;
}) {
  return <Modal open={open} onOpenChange={(v) => { if (!v) onClose(); }} title={title}
    footer={<div className="flex justify-end gap-2">
      <Button variant="neutral" onClick={onClose} disabled={pending}>Cancel</Button>
      <Button variant="primary" disabled={!canSave} loading={pending} onClick={onSave}>{saveWord}</Button>
    </div>}>
    <div className="grid gap-3"><ErrorLine error={error} />{children}</div>
  </Modal>;
}

function AskDialog({ claim, open, onClose }: { claim: SupplierClaimListRow; open: boolean; onClose: () => void }) {
  const door = useSupplierClaimDoor(claim.id, "request");
  const [action, setAction] = useState<string | undefined>(claim.requested_action ?? undefined);
  const [note, setNote] = useState("");
  return <DoorDialog open={open} onClose={onClose} title="Record what we asked" pending={door.isPending} error={door.error}
    canSave={Boolean(action)} saveWord="Record what we asked"
    onSave={() => door.mutate({ requested_action: action, ...(note.trim() ? { note: note.trim() } : {}) }, { onSuccess: onClose })}>
    <Select id="claim-ask" label="What we asked" value={action} onValueChange={setAction}
      options={requestedActionsFor(claim.claim_type).map((r) => ({ value: r.key, label: r.label }))} />
    <Textarea id="claim-ask-note" label="Note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
  </DoorDialog>;
}

function SendDialog({ claim, open, onClose }: { claim: SupplierClaimListRow; open: boolean; onClose: () => void }) {
  const door = useSupplierClaimDoor(claim.id, "send");
  const [channel, setChannel] = useState("whatsapp");
  const [recipient, setRecipient] = useState("");
  const [note, setNote] = useState("");
  return <DoorDialog open={open} onClose={onClose} title="Claim sent to supplier" pending={door.isPending} error={door.error}
    canSave={recipient.trim().length > 0} saveWord="Claim sent to supplier"
    onSave={() => door.mutate({ channel, recipient: recipient.trim(), ...(note.trim() ? { note: note.trim() } : {}) }, { onSuccess: onClose })}>
    <Select id="claim-send-channel" label="Channel" value={channel} onValueChange={setChannel} options={CHANNELS} />
    <Input id="claim-send-recipient" label="Recipient" value={recipient} onChange={(e) => setRecipient(e.target.value)} />
    <Textarea id="claim-send-note" label="Note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
  </DoorDialog>;
}

/**
 * The approved reply form. A whole-claim answer is stored claim-level and is
 * never spread across Units; `These Units` stores exactly the Units ticked.
 * A timeout re-reads the record and never prints a refusal it did not receive.
 */
export function ReplyForm({ claim, record, wide, onClose }: { claim: SupplierClaimListRow; record: SupplierClaimRecord | null; wide: boolean; onClose: () => void }) {
  const door = useSupplierClaimDoor(claim.id, "response");
  const [response, setResponse] = useState<string | undefined>(undefined);
  const [scope, setScope] = useState<SupplierClaimReplyScope | undefined>(undefined);
  const [unitIds, setUnitIds] = useState<string[]>([]);
  const [supplierDate, setSupplierDate] = useState<string | null>(null);
  const [evidence, setEvidence] = useState<Array<{ path: string; kind: string }>>([]);
  const [spokeWith, setSpokeWith] = useState("");
  const [spokenDate, setSpokenDate] = useState<string | null>(null);
  const [spokenTime, setSpokenTime] = useState("");
  const spokenAt = spokenDate && spokenTime ? `${spokenDate}T${spokenTime}` : "";
  const [note, setNote] = useState("");
  const [tried, setTried] = useState(false);
  const units = (record?.units ?? claim.units ?? []).filter((u) => u.identity_scope === "unit" && u.unit_code);
  const missing = supplierClaimReplyMissing({
    response: response ?? null, scope: scope ?? null, unitIds, supplierDate, note,
    evidenceCount: evidence.length, spokeWith, spokenAt: spokenAt || null,
  });
  const save = () => {
    setTried(true);
    if (missing.length) return;
    door.mutate({
      supplier_response: response, scope, unit_ids: scope === "units" ? unitIds : [],
      supplier_date: supplierDate, ...(note.trim() ? { note: note.trim() } : {}),
      evidence, spoke_with: spokeWith.trim() || null,
      spoken_at: spokenAt ? `${spokenAt}:00+08:00` : null,
    }, { onSuccess: onClose });
  };
  return <section className={`rounded-card border border-kit-slate-5 bg-white px-4 py-3 ${wide ? "" : "mt-3"}`} data-testid="claim-reply-form" aria-label="Record supplier reply">
    <h3 className="mb-3 text-strong text-kit-slate-12">Record supplier reply</h3>
    <div className="grid gap-3">
      <ErrorLine error={door.error} />
      <Select id="claim-reply-answer" label="Supplier's answer" value={response} onValueChange={setResponse}
        options={SUPPLIER_CLAIM_RESPONSES.map((r) => ({ value: r.key, label: r.label }))} />
      <Select id="claim-reply-scope" label="Applies to" value={scope} onValueChange={(v) => setScope(v as SupplierClaimReplyScope)}
        options={[
          { value: "claim", label: SUPPLIER_CLAIM_REPLY_SCOPE_WORD.claim },
          ...(units.length ? [{ value: "units", label: SUPPLIER_CLAIM_REPLY_SCOPE_WORD.units }] : []),
        ]} />
      {scope === "units" && <div className="grid gap-1" data-testid="claim-reply-units">
        {units.map((u) => <div key={u.id} className="min-h-[32px]"><Checkbox id={`claim-reply-unit-${u.id}`} label={u.unit_code ?? u.id} checked={unitIds.includes(u.id)}
          onCheckedChange={(on) => setUnitIds((prev) => (on === true ? [...prev, u.id] : prev.filter((x) => x !== u.id)))} /></div>)}
      </div>}
      <DatePicker id="claim-reply-date" label="Supplier's date" value={supplierDate} onChange={setSupplierDate} />
      <div>
        <h4 className="mb-2 text-label text-kit-slate-11">Evidence</h4>
        <EvidenceUploadField<{ path: string; kind: string }>
          entries={evidence}
          onChange={setEvidence}
          sign={(file) => apiFetch<{ token: string; path: string }>("/api/ops/issues/evidence/upload-url", {
            method: "POST", body: JSON.stringify({ mimeType: file.type, scope: { kind: "supplier_claim_reply", id: claim.id } }),
          })}
          bucket="issue-evidence"
          imageMimes={IMAGE_MIMES}
          videoMimes={VIDEO_MIMES}
          pdfMimes={PDF_MIMES}
          imageMaxBytes={10 * 1024 * 1024}
          videoMaxBytes={20 * 1024 * 1024}
          pdfMaxBytes={20 * 1024 * 1024}
          maxFiles={6}
          ariaLabel="Evidence"
          disabled={door.isPending}
        />
        <div className="mt-2 grid gap-3 sm:grid-cols-2">
          <Input id="claim-reply-spoke" label="Who spoke" value={spokeWith} onChange={(e) => setSpokeWith(e.target.value)} />
          <DatePicker id="claim-reply-spoken-date" label="When they spoke" value={spokenDate} onChange={setSpokenDate} />
          <Input id="claim-reply-spoken-time" type="time" label="Time" value={spokenTime} onChange={(e) => setSpokenTime(e.target.value)} />
        </div>
      </div>
      <Textarea id="claim-reply-note" label="Note" rows={3} value={note} onChange={(e) => setNote(e.target.value)} />
      {tried && missing.length > 0 && <ul className="text-body text-kit-red-11" data-testid="claim-reply-missing">
        {missing.map((m) => <li key={m}>{MISSING_SENTENCE[m]}</li>)}
      </ul>}
      <div className={`flex justify-end gap-2 ${wide ? "" : "sticky bottom-0 bg-white py-2 [&_button]:min-h-[40px]"}`}>
        <Button variant="neutral" onClick={onClose} disabled={door.isPending}>Cancel</Button>
        <Button variant="primary" loading={door.isPending} onClick={save} data-testid="claim-reply-save">Record supplier reply</Button>
      </div>
    </div>
  </section>;
}

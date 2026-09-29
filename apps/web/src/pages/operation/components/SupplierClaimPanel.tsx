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
 * Result          What Carres does = the Authorised Outcome (`Record what Carres
 *                 does next`: Return to supplier · Repair · Replacement, PO Duty;
 *                 owner ruling 2026-09-29) · `Issue Purchase Return` · each PR's
 *                 send and pickup state · `Plan Repair` · `Plan Supplier
 *                 replacement` · Item Outcome
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
import { Link, useNavigate } from "react-router-dom";
import {
  SUPPLIER_CLAIM_DECISIONS,
  supplierClaimDecision,
  ISSUE_PURCHASE_RETURN,
  RECORD_WHAT_CARRES_DOES_NEXT,
  carresNextWord,
  purchaseReturnNo,
  purchaseReturnPickupState,
  purchaseReturnSendLine,
  purchaseReturnSupplierReceivedDate,
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
  useOperationPurchaseReturns,
  useOperationSupplierClaimPhotos,
  usePurchaseReturnWrite,
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
import PurchaseReturnIssue from "./PurchaseReturnIssue";

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

type Dialog = null | "ask" | "reply" | "send" | "next";

export default function SupplierClaimPanel({ claim }: { claim: SupplierClaimListRow }) {
  const record = useSupplierClaimRecord(claim.id);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [issuing, setIssuing] = useState(false);
  const navigate = useNavigate();
  const wide = useWide();
  const today = appTodayIso();
  const facts = {
    id: claim.id, claim_no: claim.claim_no, status: claim.status, supplier_name: claim.supplier_name,
    requested_action: claim.requested_action, requested_at: claim.requested_at, supplier_response: claim.supplier_response,
    sent: Boolean(record.data?.sends.length ?? claim.sent),
    reply_waiting_days: claim.reply_waiting_days ?? null, escalation_extra_days: claim.escalation_extra_days ?? null,
  };
  const open = claim.status === "open";
  // The ONE decision (owner ruling 2026-09-29) — the record's server read,
  // else the same arithmetic over the row.
  const execution = record.data?.decision !== undefined ? record.data.decision : supplierClaimDecision(claim);
  // §9.6: `Return to supplier` recorded and no Purchase Return yet — the same
  // fact Work projects as `Issue the purchase return to {Supplier}`.
  const pendingReturn = open && execution === "return_to_supplier" && record.data != null && (record.data.purchase_returns ?? []).length === 0;
  const action = supplierClaimCurrentAction(facts) ?? (pendingReturn
    ? { rule: null, fact: "Not issued", instruction: `Issue the purchase return to ${claim.supplier_name ?? "the supplier"}`, date: null, button: ISSUE_PURCHASE_RETURN }
    : null);
  const openDoor = (button: string | null) => {
    if (button === ISSUE_PURCHASE_RETURN) return setIssuing(true);
    setDialog(button === "Record what we asked" ? "ask" : button === "Claim sent to supplier" ? "send" : button === "Record supplier reply" ? "reply" : null);
  };

  /* Issue is the ONE moment the paper stands beside the form: the governed
     50/50 (§9.6); the record is full width again after it. */
  if (issuing) {
    return <PurchaseReturnIssue claimId={claim.id} onClose={() => setIssuing(false)}
      onIssued={(id) => navigate(`/operation?tab=purchase-returns&pr=${encodeURIComponent(id)}`)} />;
  }

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
      <ResultSection claim={claim} record={record.data ?? null} open={open} onNext={() => setDialog("next")}
        onIssue={action?.button === ISSUE_PURCHASE_RETURN ? null : () => setIssuing(true)} />
      <DocumentsSection record={record} open={open} onSend={() => setDialog("send")} />
      <HistorySection claim={claim} record={record.data ?? null} />
    </div>
    {wide && replyForm && <aside className="sticky top-0 w-[560px] shrink-0" data-testid="claim-reply-panel">{replyForm}</aside>}
    <AskDialog claim={claim} open={dialog === "ask"} onClose={() => setDialog(null)} />
    <SendDialog claim={claim} open={dialog === "send"} onClose={() => setDialog(null)} />
    <NextDialog claim={claim} current={execution} open={dialog === "next"} onClose={() => setDialog(null)} />
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

function ResultSection({ claim, record, open, onNext, onIssue }: {
  claim: SupplierClaimListRow; record: SupplierClaimRecord | null; open: boolean; onNext: () => void;
  /** null when the record's Current action already leads with the door: one obvious button. */
  onIssue: (() => void) | null;
}) {
  const ros = record?.repair_orders ?? [];
  const prRefs = record?.purchase_returns ?? [];
  // Each PR's state is read from the register's own shape (the ledger-derived
  // send, Stock's pickup facts) — never a second arithmetic here.
  const returns = useOperationPurchaseReturns(prRefs.length ? claim.id : null, { enabled: prRefs.length > 0 });
  const prs = returns.data?.returns ?? [];
  const execution = record?.decision !== undefined ? record.decision : supplierClaimDecision(claim);
  const executionBy = record?.decision_by_name ?? null;
  const executionAt = record?.decision_at ?? null;
  const legacy = record?.legacy_words ?? [];
  const mayRecord = open && Boolean(record?.may_record_next);
  const canIssue = open && execution === "return_to_supplier" && record != null && prRefs.length === 0;
  return <Block title="Result" headerSlot={mayRecord ? <Button variant="neutral" onClick={onNext} data-testid="claim-record-next">{RECORD_WHAT_CARRES_DOES_NEXT}</Button> : undefined}>
    <div className="space-y-3" data-testid="claim-result">
      <p className="text-body text-kit-slate-12" data-testid="claim-what-carres-does">
        {execution ? `What Carres does · ${carresNextWord(execution)}` : carresNextWord(null)}
        {execution && executionAt ? <span className="text-kit-slate-11">{` · ${fmtDate(executionAt)} · ${executionBy ?? "Staff identity not recorded"}`}</span> : null}
      </p>
      {legacy.length > 0 && <p className="text-meta text-kit-slate-11" data-testid="claim-legacy-decision">{`Earlier record · ${legacy.join(" · ")}`}</p>}
      {canIssue && onIssue && <div className="flex flex-wrap items-center gap-3">
        <Button variant="neutral" onClick={onIssue} data-testid="claim-issue-return">{ISSUE_PURCHASE_RETURN}</Button>
      </div>}
      {prRefs.length > 0 && <div className="grid gap-2" data-testid="claim-purchase-returns">
        {returns.isError ? <div role="alert"><p>Some information could not be refreshed.</p><Button variant="neutral" onClick={() => void returns.refetch()}>Try again</Button></div>
          : prRefs.map((ref) => {
            const pr = prs.find((p) => p.id === ref.id);
            const send = pr ? purchaseReturnSendLine({ sends: pr.sends ?? [] }) : null;
            const received = pr ? purchaseReturnSupplierReceivedDate(pr) : null;
            return <div key={ref.id} className="rounded-control border border-kit-slate-5 px-3 py-2 text-body text-kit-slate-12">
              <Link className="font-semibold text-kit-blue-11 hover:underline" to={`/operation?tab=purchase-returns&pr=${encodeURIComponent(ref.id)}`}>{purchaseReturnNo(ref.pr_no)}</Link>
              {pr ? <>
                <p>{send?.sent ? `${send.text} · ${fmtDate(send.date)}` : "Sending not confirmed"}</p>
                <p>{pr.confirmed_pickup_date ? `Confirmed Pickup Date ${fmtDate(pr.confirmed_pickup_date)}` : "Pickup date not confirmed"}{` · ${purchaseReturnPickupState(pr)}`}</p>
                <p className="text-kit-slate-11">{`Supplier Received Date ${received ? fmtDate(received) : absent}`}</p>
              </> : <p className="text-kit-slate-11">Loading…</p>}
            </div>;
          })}
      </div>}
      <Facts>
        <Fact idPrefix="claim-fact" own={false} framed label="Item Outcome" value={heldUnitsLine(claim.held_units, claim.hold_reason)} />
        {ros.length > 0 && <Fact idPrefix="claim-fact" own={false} framed label="RO No" value={<span className="flex flex-wrap gap-2">{ros.map((ro) => <Link key={ro.id} className="text-kit-blue-11 hover:underline" to={`/operation?tab=repair-orders&ro=${encodeURIComponent(ro.id)}`}>{ro.ro_no}</Link>)}</span>} />}
      </Facts>
      {/* A supplier's `Repair` is an offer: `Plan Repair` shows only when the
          server confirms Authorised Outcome = Repair, the exact Units and the
          actor's permission. Otherwise the missing fact above names itself. */}
      {record?.plan_repair.allowed && <Link className="inline-block text-kit-blue-11 underline" to={`/operation?tab=repair-orders&create=1&claim=${encodeURIComponent(claim.id)}`} data-testid="claim-plan-repair">Plan Repair</Link>}
      {/* Replacement's owning door is the supplier-replacement arrival source;
          nothing new is invented here (owner ruling 2026-09-29). */}
      {record?.plan_replacement?.allowed && <Link className="inline-block text-kit-blue-11 underline" to={`/operation?tab=arrival-source&kind=supplier-replacement&claim=${encodeURIComponent(claim.id)}`} data-testid="claim-plan-replacement">Plan Supplier replacement</Link>}
    </div>
  </Block>;
}

/** `Record what Carres does next` — OWNER RULING 2026-09-29: the three
 *  supplier-side decisions, which are the Authorised Outcome. The four
 *  customer movements belong to the Service Case. PO Duty, dated cover or
 *  Operations Superuser (the server refuses anyone else). */
function NextDialog({ claim, current, open, onClose }: { claim: SupplierClaimListRow; current: string | null; open: boolean; onClose: () => void }) {
  const door = usePurchaseReturnWrite(`/api/operation/supplier-claims/${encodeURIComponent(claim.id)}/carres-execution`);
  const [choice, setChoice] = useState<string | undefined>(current ?? undefined);
  const [note, setNote] = useState("");
  return <DoorDialog open={open} onClose={onClose} title={RECORD_WHAT_CARRES_DOES_NEXT} pending={door.isPending} error={door.error}
    canSave={Boolean(choice)} saveWord={RECORD_WHAT_CARRES_DOES_NEXT}
    onSave={() => door.mutate({ carres_execution: choice, ...(note.trim() ? { note: note.trim() } : {}) }, { onSuccess: onClose })}>
    <Select id="claim-next" label="What Carres does" value={choice} onValueChange={setChoice}
      options={SUPPLIER_CLAIM_DECISIONS.map((c) => ({ value: c.key, label: c.label }))} />
    <Textarea id="claim-next-note" label="Note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
  </DoorDialog>;
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
  // `Whole claim` is the default: a claim-level answer is the common case,
  // and `These Units` reveals the Unit ticks only when chosen.
  const [scope, setScope] = useState<SupplierClaimReplyScope | undefined>("claim");
  const [phone, setPhone] = useState(false);
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
        {/* A phone answer records who spoke and when; its fields show only
            when the person says the answer came by phone. */}
        <button type="button" className="mt-2 text-body text-kit-blue-11 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-kit-blue-9"
          aria-expanded={phone} data-testid="claim-reply-phone"
          onClick={() => {
            if (phone) { setSpokeWith(""); setSpokenDate(null); setSpokenTime(""); }
            setPhone(!phone);
          }}>Phone call</button>
        {phone && <div className="mt-2 grid gap-3 sm:grid-cols-2" data-testid="claim-reply-phone-fields">
          <Input id="claim-reply-spoke" label="Who spoke" value={spokeWith} onChange={(e) => setSpokeWith(e.target.value)} />
          <DatePicker id="claim-reply-spoken-date" label="When they spoke" value={spokenDate} onChange={setSpokenDate} />
          <Input id="claim-reply-spoken-time" type="time" label="Time" value={spokenTime} onChange={(e) => setSpokenTime(e.target.value)} />
        </div>}
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

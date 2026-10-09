// design-standard: not-a-list-page — the full-width Purchase Return record.
/**
 * ⭐ THE PURCHASE RETURN RECORD — Purchasing MASTER §9.6 creation door
 * (owner approval 2026-09-25). Full width after issue (50/50 is the issue
 * form's alone). One working scroll, in the chain's order:
 *
 * ```text
 * ← Purchase Returns   PR-… · Hooka
 * [Current action]  fact · instruction · date · ONE primary button
 * Purchase return   Supplier Claim No · PR Doc Date · Return To · GRN No
 * Sending           `Sending not confirmed` / `Return document sent · {channel} · {date}`
 * Pickup            `Pickup date not confirmed` / Confirmed Pickup Date · Not / Partly /
 *                   Fully picked up (Stock's Outbound handover) · Supplier Received Date
 * Units             one tracked Unit per row (the register's own expansion)
 * History           issued · sends · pickup confirmations
 * ```
 *
 * `Sending not confirmed`, never `Return document not sent`: an absent ledger
 * row is the Portal having no record, not proof nobody sent it. Pickup facts
 * are Stock's; `Fully picked up` never implies `Supplier Received Date`.
 */
import { useOfficeDays } from "@/lib/deadline-queries";
import { useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import {
  PURCHASE_RETURN_CHANNEL_WORD,
  RECORD_SUPPLIER_RECEIPT,
  RETURN_DOCUMENT_SENT,
  purchaseReturnNo,
  purchaseReturnPickupState,
  purchaseReturnReceiptMissing,
  purchaseReturnReceiptUnits,
  purchaseReturnSendLine,
  purchaseReturnSupplierReceivedDate,
  purchaseReturnWorkItems,
  type PurchaseReturnDetail,
} from "@carres/shared";
import { ApiError, apiFetch } from "@/lib/api";
import { usePurchaseReturn, usePurchaseReturnWrite } from "@/lib/queries";
import { purchaseReturnPrintData, usePurchaseReturnPdfUrl } from "@/lib/pdf/purchase-return-pdf";
import { appTodayIso, fmtDate } from "@/lib/fmt-date";
import Block from "@/components/kit/Block";
import Button from "@/components/kit/Button";
import Checkbox from "@/components/kit/Checkbox";
import DatePicker from "@/components/kit/DatePicker";
import Drawer from "@/components/kit/Drawer";
import EmptyState from "@/components/kit/EmptyState";
import Input from "@/components/kit/Input";
import Modal from "@/components/kit/Modal";
import PdfPreview from "@/components/kit/PdfPreview";
import Select from "@/components/kit/Select";
import Textarea from "@/components/kit/Textarea";
import EvidenceUploadField from "@/components/EvidenceUploadField";
import SalesOrderTabs from "./SalesOrderTabs";
import { Fact } from "./SalesOrderWorkspace";
import { RecordRanks } from "./SalesOrderLedger";
import PurchaseReturnUnitsTable from "./components/PurchaseReturnUnitsTable";

const ABSENT = "Not recorded";
const CHANNELS = [
  { value: "whatsapp", label: "WhatsApp" },
  { value: "email", label: "Email" },
  { value: "print", label: "Print" },
];

type Dialog = null | "send" | "pickup" | "pdf" | "receipt";

function refusal(error: unknown): string {
  if (error instanceof ApiError) return error.message || "Not saved · Try again";
  return "Not saved · Try again";
}

export default function PurchaseReturnRecord({ id, onBack }: { id: string; onBack: () => void }) {
  const read = usePurchaseReturn(id);
  const pr = read.data?.purchaseReturn ?? null;
  return <div className="absolute inset-0 flex min-h-0 flex-col bg-background" data-testid="purchase-return-object">
    <SalesOrderTabs identity={pr ? purchaseReturnNo(pr.pr_no) : "Purchase Return"} customer={pr?.supplier_name} backLabel="Purchase Returns"
      backTo="/operation?tab=purchase-returns" onBack={(event) => { event.preventDefault(); onBack(); }} />
    <div className="min-h-0 flex-1 overflow-auto p-4" data-testid="purchase-return-object-scroll">
      {read.isError ? <div role="alert"><EmptyState title="Purchase Returns could not be loaded." action={<Button variant="neutral" onClick={() => void read.refetch()}>Try again</Button>} /></div>
        : read.isLoading ? <EmptyState title="Loading…" />
        : pr ? <PurchaseReturnPanel pr={pr} />
        : <EmptyState title="Not recorded" action={<Button variant="neutral" onClick={onBack}>Purchase Returns</Button>} />}
    </div>
  </div>;
}

export function PurchaseReturnPanel({ pr, today = appTodayIso() }: { pr: PurchaseReturnDetail; today?: string }) {
  const [dialog, setDialog] = useState<Dialog>(null);
  const send = purchaseReturnSendLine(pr);
  const pickup = purchaseReturnPickupState(pr);
  const received = purchaseReturnSupplierReceivedDate(pr);
  const supplier = pr.supplier_name ?? "the supplier";
  // The record's ONE current action is the same arithmetic Work projects —
  // on the stored Office calendar (Settings → Office), as Work counts it.
  const office = useOfficeDays().office;
  const current = purchaseReturnWorkItems(pr, null, today, office)[0] ?? null;
  const button = !current ? null
    : current.item.ruleKey === "purchase_return.send" ? { word: RETURN_DOCUMENT_SENT, open: "send" as const }
    : { word: "Confirmed Pickup", open: "pickup" as const };
  const done = pickup === "Fully picked up";
  // §9.6: `Record supplier receipt` stays offered while any Unit has no
  // supplier receipt; the door (0614) refuses a Unit Stock has not picked up.
  const receivable = pr.units.some((u) => u.stock_item_id && !u.supplier_received_date);

  return <div className="flex min-w-0 flex-col gap-4" data-testid={`purchase-return-panel-${pr.pr_no}`}>
    {current && <Block title="Current action">
      <div className="flex flex-wrap items-center justify-between gap-3" data-testid="purchase-return-current-action">
        <div className="min-w-0">
          <p className="text-strong text-kit-slate-12">{current.item.ruleKey === "purchase_return.confirm_tomorrows_pickup" && pr.confirmed_pickup_date
            ? `Confirmed Pickup Date ${fmtDate(pr.confirmed_pickup_date)}` : current.problem}</p>
          <p className="text-body text-kit-slate-11">{current.item.action === "Confirm tomorrow's pickup" ? `Confirm tomorrow's pickup · ${supplier}` : current.item.action}</p>
          {current.item.dueIso && <p className="text-body text-kit-slate-11">{fmtDate(current.item.dueIso)}</p>}
        </div>
        {button && <Button variant="primary" onClick={() => setDialog(button.open)} data-testid="purchase-return-primary">{button.word}</Button>}
      </div>
    </Block>}

    <Block title="Purchase return" headerSlot={<Button variant="neutral" onClick={() => setDialog("pdf")} data-testid="purchase-return-open-pdf">Open PDF</Button>}>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Fact idPrefix="pr-fact" own={false} framed label="Supplier Claim No" value={pr.supplier_claim_id && pr.claim_no
          ? <Link className="text-kit-blue-11 hover:underline" to={`/operation?tab=claims&claim=${encodeURIComponent(pr.supplier_claim_id)}`}>{pr.claim_no}</Link>
          : pr.claim_no ?? ABSENT} />
        <Fact idPrefix="pr-fact" own={false} framed label="PR Doc Date" value={pr.pr_doc_date ? fmtDate(pr.pr_doc_date) : ABSENT} />
        <Fact idPrefix="pr-fact" own={false} framed label="Supplier" value={pr.supplier_name ?? ABSENT} />
        <Fact idPrefix="pr-fact" own={false} framed label="Return To" value={<span className="whitespace-pre-wrap">{pr.units[0]?.return_to ?? ABSENT}</span>} />
        <Fact idPrefix="pr-fact" own={false} framed label="GRN No." value={pr.grn_no ?? ABSENT} />
      </div>
    </Block>

    <Block title="Sending" headerSlot={!done ? <Button variant="neutral" onClick={() => setDialog("send")} data-testid="purchase-return-send">{RETURN_DOCUMENT_SENT}</Button> : undefined}>
      <div className="space-y-1 text-body text-kit-slate-12" data-testid="purchase-return-send-state">
        {send.sent ? pr.sends.map((s) => <p key={s.id}>{`Return document sent · ${PURCHASE_RETURN_CHANNEL_WORD[s.channel] ?? s.channel} · ${fmtDate(s.sent_at)} · ${s.recipient} · ${s.sent_by_name ?? "Staff identity not recorded"}`}</p>)
          : <p className="text-kit-slate-11">Sending not confirmed</p>}
      </div>
    </Block>

    <Block title="Pickup" headerSlot={!done || receivable ? <div className="flex flex-wrap gap-2">
      {!done && <Button variant="neutral" onClick={() => setDialog("pickup")} data-testid="purchase-return-pickup">Confirmed Pickup</Button>}
      {receivable && <Button variant="neutral" onClick={() => setDialog("receipt")} data-testid="purchase-return-supplier-receipt">{RECORD_SUPPLIER_RECEIPT}</Button>}
    </div> : undefined}>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3" data-testid="purchase-return-pickup-state">
        <Fact idPrefix="pr-fact" own={false} framed label="Confirmed Pickup Date" value={pr.confirmed_pickup_date ? fmtDate(pr.confirmed_pickup_date) : "Pickup date not confirmed"} />
        <Fact idPrefix="pr-fact" own={false} framed label="Pickup" value={pickup} />
        <Fact idPrefix="pr-fact" own={false} framed label="Supplier Received Date" value={received ? fmtDate(received) : ABSENT} />
      </div>
    </Block>

    <Block title="Units">
      <PurchaseReturnUnitsTable units={pr.units} returnId={pr.id} />
    </Block>

    <HistorySection pr={pr} />

    <SendDialog pr={pr} open={dialog === "send"} onClose={() => setDialog(null)} />
    <PickupDialog pr={pr} open={dialog === "pickup"} onClose={() => setDialog(null)} />
    {dialog === "receipt" && <ReceiptDialog pr={pr} today={today} onClose={() => setDialog(null)} />}
    <PdfSheet pr={pr} open={dialog === "pdf"} onClose={() => setDialog(null)} />
  </div>;
}

function HistorySection({ pr }: { pr: PurchaseReturnDetail }) {
  const events = useMemo(() => [
    { title: `Purchase return issued to ${pr.supplier_name ?? ABSENT}`, date: pr.pr_doc_date, actor: null as string | null, detail: pr.claim_no },
    ...pr.sends.map((s) => ({ title: RETURN_DOCUMENT_SENT, date: s.sent_at, actor: s.sent_by_name, detail: `${PURCHASE_RETURN_CHANNEL_WORD[s.channel] ?? s.channel} · ${s.recipient}` })),
    ...pr.confirmations.map((c) => ({ title: "Confirmed Pickup", date: c.recorded_at, actor: c.recorded_by_name, detail: `${fmtDate(c.confirmed_pickup_date)} · ${c.evidence}` })),
    ...(pr.receipts ?? []).map((r) => ({ title: "Supplier receipt recorded", date: r.recorded_at, actor: r.recorded_by_name,
      detail: [fmtDate(r.received_on), ...r.unit_ids, r.files ? `Evidence ${r.files}` : null, r.confirmed_by && r.confirmed_at ? `${r.confirmed_by} · ${fmtDate(r.confirmed_at, { time: true })}` : null].filter(Boolean).join(" · ") })),
  ].filter((e) => e.date).sort((a, b) => a.date!.localeCompare(b.date!)), [pr]);
  return <Block title="History">
    {events.map((event, index) => <div key={`${event.title}-${event.date}-${index}`} className="flex flex-col gap-1 py-2">
      <RecordRanks index={index} words={{ title: event.title, identity: `${event.actor || "Staff identity not recorded"} · ${fmtDate(event.date!, { time: true })}`, detail: event.detail ? [event.detail] : [] }} />
    </div>)}
  </Block>;
}

function DoorDialog({ open, onClose, title, pending, error, canSave, onSave, children }: {
  open: boolean; onClose: () => void; title: string; pending: boolean; error: unknown; canSave: boolean; onSave: () => void; children: ReactNode;
}) {
  return <Modal open={open} onOpenChange={(v) => { if (!v) onClose(); }} title={title}
    footer={<div className="flex justify-end gap-2 [&_button]:min-h-[40px] sm:[&_button]:min-h-0">
      <Button variant="neutral" onClick={onClose} disabled={pending}>Cancel</Button>
      <Button variant="primary" disabled={!canSave} loading={pending} onClick={onSave}>{title}</Button>
    </div>}>
    <div className="grid gap-3">
      {error ? <p role="alert" className="rounded-control border border-kit-red-9 bg-kit-red-3 px-3 py-2 text-body text-kit-red-11">{refusal(error)}</p> : null}
      {children}
    </div>
  </Modal>;
}

/** `Return document sent to supplier` — the actual message staff sent,
 *  confirmed. Opening WhatsApp or downloading the PDF never reaches it. */
function SendDialog({ pr, open, onClose }: { pr: PurchaseReturnDetail; open: boolean; onClose: () => void }) {
  const door = usePurchaseReturnWrite(`/api/operation/purchase-returns/${encodeURIComponent(pr.id)}/send`);
  const [channel, setChannel] = useState("whatsapp");
  const [recipient, setRecipient] = useState("");
  const [note, setNote] = useState("");
  return <DoorDialog open={open} onClose={onClose} title={RETURN_DOCUMENT_SENT} pending={door.isPending} error={door.error}
    canSave={recipient.trim().length > 0}
    onSave={() => door.mutate({ channel, recipient: recipient.trim(), note: note.trim() || null }, { onSuccess: onClose })}>
    <Select id="pr-send-channel" label="Channel" value={channel} onValueChange={setChannel} options={CHANNELS} />
    <Input id="pr-send-recipient" label="Recipient" value={recipient} onChange={(e) => setRecipient(e.target.value)} />
    <Textarea id="pr-send-note" label="Note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
  </DoorDialog>;
}

/** `Confirmed Pickup` — the supplier's confirmation of the date, with who
 *  confirmed and how. A date with no source is a guess. */
function PickupDialog({ pr, open, onClose }: { pr: PurchaseReturnDetail; open: boolean; onClose: () => void }) {
  const door = usePurchaseReturnWrite(`/api/operation/purchase-returns/${encodeURIComponent(pr.id)}/pickup-confirmation`);
  const [date, setDate] = useState<string | null>(pr.confirmed_pickup_date);
  const [evidence, setEvidence] = useState("");
  return <DoorDialog open={open} onClose={onClose} title="Confirmed Pickup" pending={door.isPending} error={door.error}
    canSave={Boolean(date) && evidence.trim().length > 0}
    onSave={() => door.mutate({ confirmed_pickup_date: date, evidence: evidence.trim() }, { onSuccess: onClose })}>
    <DatePicker id="pr-pickup-date" label="Confirmed Pickup" value={date} onChange={setDate} minDate={appTodayIso()} />
    <Input id="pr-pickup-evidence" label="Who confirmed" value={evidence} onChange={(e) => setEvidence(e.target.value)} />
  </DoorDialog>;
}

const RECEIPT_IMAGE_MIMES = ["image/jpeg", "image/png", "image/webp"] as const;
const RECEIPT_VIDEO_MIMES = ["video/mp4", "video/quicktime"] as const;
const RECEIPT_PDF_MIMES = ["application/pdf"] as const;

/** `Record supplier receipt` (§9.6, 0614): the date the supplier received the
 *  exact Units, from supplier evidence — a file (photo, video, PDF) or who
 *  confirmed and when. Only Units Stock picked up can be ticked; the rest say
 *  why. It records no pickup and moves nothing. */
function ReceiptDialog({ pr, today, onClose }: { pr: PurchaseReturnDetail; today: string; onClose: () => void }) {
  const door = usePurchaseReturnWrite(`/api/operation/purchase-returns/${encodeURIComponent(pr.id)}/supplier-receipt`);
  const units = purchaseReturnReceiptUnits(pr);
  const [date, setDate] = useState<string | null>(today);
  const [picked, setPicked] = useState<string[]>([]);
  const [files, setFiles] = useState<Array<{ path: string; kind: string }>>([]);
  const [who, setWho] = useState("");
  const [whenDate, setWhenDate] = useState<string | null>(today);
  const [time, setTime] = useState("");
  const [note, setNote] = useState("");
  const [tried, setTried] = useState(false);
  const confirmedAt = who.trim() && whenDate && time ? `${whenDate}T${time}:00+08:00` : null;
  const missing = purchaseReturnReceiptMissing({ date, unitIds: picked, files: files.length, confirmedBy: who, confirmedAt });
  const earliest = units.filter((u) => picked.includes(u.stock_item_id) && u.pickedUpOn).map((u) => u.pickedUpOn!).sort().pop();
  const save = () => {
    setTried(true);
    if (missing.length) return;
    door.mutate({ received_on: date, stock_item_ids: picked, evidence: files, confirmed_by: who.trim() || null, confirmed_at: confirmedAt, note: note.trim() || null }, { onSuccess: onClose });
  };
  return <Modal open onOpenChange={(v) => { if (!v) onClose(); }} title={RECORD_SUPPLIER_RECEIPT}
    footer={<div className="flex justify-end gap-2 [&_button]:min-h-[40px] sm:[&_button]:min-h-0">
      <Button variant="neutral" onClick={onClose} disabled={door.isPending}>Cancel</Button>
      <Button variant="primary" loading={door.isPending} onClick={save} data-testid="purchase-return-receipt-save">{RECORD_SUPPLIER_RECEIPT}</Button>
    </div>}>
    <div className="grid gap-3" data-testid="purchase-return-receipt-form">
      {door.error ? <p role="alert" className="rounded-control border border-kit-red-9 bg-kit-red-3 px-3 py-2 text-body text-kit-red-11">{refusal(door.error)}</p> : null}
      <DatePicker id="pr-receipt-date" label="Supplier Received Date" value={date} onChange={setDate} {...(earliest ? { minDate: earliest } : {})} />
      <div className="grid gap-1" role="group" aria-label="Units">
        <h4 className="text-label text-kit-slate-11">Units</h4>
        {units.map((u) => <div key={u.stock_item_id} className="flex min-h-[32px] flex-wrap items-center gap-x-2">
          <Checkbox id={`pr-receipt-unit-${u.stock_item_id}`} label={u.unit_id} disabled={u.refusal != null} checked={picked.includes(u.stock_item_id)}
            onCheckedChange={(on) => setPicked((prev) => (on === true ? [...prev, u.stock_item_id] : prev.filter((x) => x !== u.stock_item_id)))} />
          {u.refusal && <span className="text-meta text-kit-slate-11">{u.refusal}</span>}
        </div>)}
      </div>
      <div>
        <h4 className="mb-2 text-label text-kit-slate-11">Evidence</h4>
        <EvidenceUploadField<{ path: string; kind: string }>
          entries={files}
          onChange={setFiles}
          sign={(file) => apiFetch<{ token: string; path: string }>("/api/ops/issues/evidence/upload-url", {
            method: "POST", body: JSON.stringify({ mimeType: file.type, scope: { kind: "purchase_return_receipt", id: pr.id } }),
          })}
          bucket="issue-evidence"
          imageMimes={RECEIPT_IMAGE_MIMES}
          videoMimes={RECEIPT_VIDEO_MIMES}
          pdfMimes={RECEIPT_PDF_MIMES}
          imageMaxBytes={10 * 1024 * 1024}
          videoMaxBytes={20 * 1024 * 1024}
          pdfMaxBytes={20 * 1024 * 1024}
          maxFiles={6}
          ariaLabel="Evidence"
          disabled={door.isPending}
        />
        <div className="mt-2 grid gap-3 sm:grid-cols-3">
          <Input id="pr-receipt-who" label="Who confirmed" value={who} onChange={(e) => setWho(e.target.value)} />
          <DatePicker id="pr-receipt-when" label="When they confirmed" value={whenDate} onChange={setWhenDate} />
          <Input id="pr-receipt-time" type="time" label="Time" value={time} onChange={(e) => setTime(e.target.value)} />
        </div>
      </div>
      <Textarea id="pr-receipt-note" label="Note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
      {tried && missing.length > 0 && <ul className="text-body text-kit-red-11" data-testid="purchase-return-receipt-missing">
        {missing.map((m) => <li key={m}>{m}</li>)}
      </ul>}
    </div>
  </Modal>;
}

function PdfSheet({ pr, open, onClose }: { pr: PurchaseReturnDetail; open: boolean; onClose: () => void }) {
  const { url, failed } = usePurchaseReturnPdfUrl(open ? `${pr.id}:${pr.sends.length}:${pr.confirmed_pickup_date ?? ""}` : null, () => purchaseReturnPrintData(pr.id));
  const number = purchaseReturnNo(pr.pr_no);
  const print = () => {
    if (!url) return;
    const w = window.open(url, "_blank", "noopener");
    w?.addEventListener("load", () => w.print());
  };
  const download = () => {
    if (!url) return;
    const a = document.createElement("a");
    a.href = url;
    a.download = `${number}.pdf`;
    a.click();
  };
  return <Drawer open={open} onOpenChange={(v) => (v ? null : onClose())} title={number}
    footer={<div className="flex items-center gap-2">
      <Button icon="print" disabled={!url} onClick={print}>Print</Button>
      <Button icon="download" disabled={!url} onClick={download}>Download</Button>
    </div>}>
    {url ? <PdfPreview src={url} title={number} data-testid="purchase-return-pdf" />
      : <p className="text-body text-kit-slate-11" role="status">{failed ? "Some information could not be refreshed." : "Loading…"}</p>}
  </Drawer>;
}

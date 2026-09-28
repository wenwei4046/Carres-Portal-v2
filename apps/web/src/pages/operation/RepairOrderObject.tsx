// design-standard: not-a-list-page — the Repair Order OBJECT (full-width,
// one scroll; UI MASTER §4.1 "ONE SCROLL · Repair Order").
/**
 * ⭐ THE RO OBJECT PAGE — `docs/purchasing/MASTER.md` §9.7 "RO object page —
 * owner approved 2026-09-28":
 *
 * ```
 * Repair Orders / {RO No}
 * {document state} · {Supplier}
 * ROUTE  Issue ── Supplier received RO ── Picked up ── Returned ── Inspected
 *        Carres return target: {date} | Awaiting Supplier receipt of RO
 * CURRENT ACTION   line one · line two · ONE primary button
 * Repair order · Goods · Supplier reply · Owner consent · History
 * ```
 *
 * Every stage is DERIVED (`repairOrderStage`) from a fact its owner keeps;
 * the one primary door per stop is `repairOrderCurrentAction`, whose
 * sentences are the owner-approved COPY words. The physical doors (pickup,
 * return inspection) OPEN the owning Stock / Receiving surfaces — this page
 * never writes custody.
 */
import { useMemo, useState, type ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  PO_DELAY_REASONS,
  REPAIR_COST_RESPONSIBILITY_LABEL,
  REPAIR_ORDER_ABSENT,
  REPAIR_ORDER_AWAITING_RECEIPT,
  REPAIR_ORDER_SUPPLIER_DATE_NOT_REPORTED,
  repairOrderConsentOutstanding,
  repairOrderCurrentAction,
  repairOrderDocumentState,
  repairOrderPickedUp,
  repairOrderRoute,
  type RepairOrderDetail,
} from "@carres/shared";
import { ApiError, apiFetch } from "@/lib/api";
import { useOperationRepairOrder } from "@/lib/queries";
import { fmtDate } from "@/lib/fmt-date";
import Block from "@/components/kit/Block";
import Button from "@/components/kit/Button";
import Icon from "@/components/kit/Icon";
import Checkbox from "@/components/kit/Checkbox";
import DatePicker from "@/components/kit/DatePicker";
import EmptyState from "@/components/kit/EmptyState";
import Input from "@/components/kit/Input";
import Modal from "@/components/kit/Modal";
import Select from "@/components/kit/Select";
import Textarea from "@/components/kit/Textarea";
import PurchasingTabs from "./PurchasingTabs";
import { Fact } from "./SalesOrderWorkspace";
import { RecordRanks, groupHistoryChronology } from "./SalesOrderLedger";
import RepairOrderUnitsTable from "./components/RepairOrderUnitsTable";

type Dialog = null | "issue" | "receipt" | "reply" | "consent" | "cancel";

const CHANNELS = [
  { value: "whatsapp", label: "WhatsApp" },
  { value: "email", label: "Email" },
  { value: "print", label: "Print" },
] as const;
const RECEIPT_CHANNELS = [...CHANNELS, { value: "phone", label: "Phone" }] as const;

function refusal(error: unknown): string {
  if (error instanceof ApiError) return error.message || "Not saved · Try again";
  return "Not saved · Try again";
}

export default function RepairOrderObject({ idOrNo }: { idOrNo: string }) {
  const query = useOperationRepairOrder(idOrNo);
  if (query.isLoading) {
    return (
      <div className="flex h-full min-h-0 flex-col">
        <PurchasingTabs />
        <p role="status" className="p-4 text-body text-kit-slate-11">Loading…</p>
      </div>
    );
  }
  if (query.isError || !query.data) {
    const status = (query.error as { status?: number } | null)?.status;
    return (
      <div className="flex h-full min-h-0 flex-col">
        <PurchasingTabs />
        <div role="alert">
          <EmptyState
            title={status === 404 ? "Repair Order not found" : "Repair Orders could not be loaded"}
            action={<Button variant="neutral" onClick={() => void query.refetch()}>Try again</Button>}
          />
        </div>
      </div>
    );
  }
  return <RepairOrderView ro={query.data.repairOrder} />;
}

export function RepairOrderView({ ro }: { ro: RepairOrderDetail }) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [dialog, setDialog] = useState<Dialog>(null);
  const action = repairOrderCurrentAction(ro, (d) => fmtDate(d));
  const route = repairOrderRoute(ro);
  const consentScope = ro.units.filter((u) => (u.ownership ?? "carres_owned") !== "carres_owned");
  const consentOpen = repairOrderConsentOutstanding(ro);
  const canCancel = !ro.cancelled_at && repairOrderPickedUp(ro) === 0 && !ro.pickup_source_id;

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["operation", "repair-orders"] });
  };

  const openDoor = () => {
    if (!action) return;
    switch (action.door) {
      case "issue":
        return setDialog("issue");
      case "record_receipt":
        return setDialog("receipt");
      case "record_reply":
        return setDialog("reply");
      case "open_pickup":
        // Stock's ONE custody writer: plan and record the pickup there.
        return navigate(
          ro.pickup_source_id
            ? `/operation?tab=arrival-source&arrival=${ro.pickup_source_id}`
            : `/operation?tab=arrival-source&kind=repair-return&ro=${ro.id}`,
        );
      case "open_receiving":
        return navigate("/operation?tab=warehouse-inbound");
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col" data-testid="repair-order-object">
      <PurchasingTabs />
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex w-full max-w-[1100px] flex-col gap-3 p-4">
          {/* HEADER — which record · what state */}
          <header className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-meta text-kit-slate-11">
                <Link to="/operation?tab=repair-orders" className="text-kit-blue-11 hover:underline">Repair Orders</Link>
              </p>
              <h1 className="text-page text-kit-slate-12" data-testid="repair-order-no">{ro.ro_no}</h1>
              <p className="text-body text-kit-slate-11" data-testid="repair-order-state">
                {repairOrderDocumentState(ro)} · {ro.supplier_name ?? REPAIR_ORDER_ABSENT}
              </p>
            </div>
            {canCancel ? (
              <Button variant="neutral" onClick={() => setDialog("cancel")} data-testid="repair-order-cancel">Cancel repair order</Button>
            ) : null}
          </header>

          {/* ROUTE — five stops, derived from facts */}
          <Block title="Route">
            <ol className="grid grid-cols-2 gap-2 sm:grid-cols-5" data-testid="repair-order-route">
              {route.map(({ stop, state }) => (
                <li
                  key={stop}
                  data-state={state}
                  /* Blue belongs to the primary button alone (tokens §2.2):
                     the current stop is marked by weight and a dark edge. */
                  className={`flex items-center gap-1.5 rounded-control border px-2 py-1.5 text-body ${state === "current" ? "border-kit-slate-11 font-semibold text-kit-slate-12" : state === "done" ? "border-kit-slate-5 text-kit-slate-12" : "border-kit-slate-5 text-kit-slate-11"}`}
                >
                  {state === "done" ? <Icon name="confirm" size={14} /> : null}
                  <span>{stop}</span>
                </li>
              ))}
            </ol>
            <p className="text-body text-kit-slate-12" data-testid="repair-order-target">
              {ro.return_target_date ? `Carres return target: ${fmtDate(ro.return_target_date)}` : REPAIR_ORDER_AWAITING_RECEIPT}
            </p>
          </Block>

          {/* CURRENT ACTION — line one · line two · ONE primary button */}
          <Block title="Current action">
            {action ? (
              <div className="flex flex-wrap items-center justify-between gap-3" data-testid="repair-order-current-action">
                <div className="min-w-0">
                  <p className="text-strong text-kit-slate-12">{action.lineOne}</p>
                  <p className="text-body text-kit-slate-11">{action.lineTwo}</p>
                </div>
                <Button variant="primary" onClick={openDoor} data-testid="repair-order-door">{action.button}</Button>
              </div>
            ) : (
              <p className="text-body text-kit-slate-11" data-testid="repair-order-current-action">
                {ro.cancelled_at ? `Cancelled · ${ro.cancel_reason ?? REPAIR_ORDER_ABSENT}` : "Nothing to do for this Repair Order."}
              </p>
            )}
          </Block>

          {/* REPAIR ORDER — the commission's facts (price never a column) */}
          <Block title="Repair order">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <Fact idPrefix="ro-fact" label="RO Doc Date" value={fmtDate(ro.ro_doc_date)} own={false} framed />
              <Fact idPrefix="ro-fact" label="Supplier" value={ro.supplier_name ?? REPAIR_ORDER_ABSENT} own={false} framed />
              <Fact
                idPrefix="ro-fact"
                label="Supplier Claim No"
                own={false}
                framed
                value={ro.claim_no ? <Link className="text-kit-blue-11 hover:underline" to={`/operation?tab=claims&claim=${encodeURIComponent(ro.claim_no)}`}>{ro.claim_no}</Link> : REPAIR_ORDER_ABSENT}
              />
              <Fact idPrefix="ro-fact" label="Cost Responsibility" value={REPAIR_COST_RESPONSIBILITY_LABEL[ro.cost_responsibility]} own={false} framed />
              <Fact idPrefix="ro-fact" label="Supplier Pickup Location" value={ro.pickup_site_name ?? REPAIR_ORDER_ABSENT} own={false} framed />
              <Fact idPrefix="ro-fact" label="Supplier Return Location" value={ro.return_site_name ?? REPAIR_ORDER_ABSENT} own={false} framed />
              {/* Unknown price is `Not recorded` — never RM0. */}
              <Fact idPrefix="ro-fact" label="Price" value={ro.price == null ? REPAIR_ORDER_ABSENT : `RM ${ro.price.toFixed(2)}`} own={false} framed />
              <Fact idPrefix="ro-fact" label="Repair Quotation" value={ro.quotation_path ? "Recorded" : REPAIR_ORDER_ABSENT} own={false} framed />
            </div>
          </Block>

          {/* GOODS — one row per exact Unit */}
          <Block title="Goods">
            <RepairOrderUnitsTable roId={ro.id} units={ro.units} pickupLocation={ro.pickup_site_name} returnLocation={ro.return_site_name} />
          </Block>

          {/* SUPPLIER REPLY — its own date; never the Carres target */}
          <Block
            title="Supplier reply"
            headerSlot={!ro.cancelled_at && ro.issued ? <Button variant="neutral" onClick={() => setDialog("reply")}>Record Supplier reply</Button> : null}
          >
            {ro.replies.length === 0 ? (
              <p className="text-body text-kit-slate-11">{REPAIR_ORDER_SUPPLIER_DATE_NOT_REPORTED}</p>
            ) : (
              <ul className="flex flex-col divide-y divide-kit-slate-5" data-testid="repair-order-replies">
                {[...ro.replies].reverse().map((r) => (
                  <li key={r.id} className="py-2 first:pt-0">
                    <p className="text-body text-kit-slate-12">
                      {r.expected_return_date ? `Supplier Expected Return Date ${fmtDate(r.expected_return_date)}` : REPAIR_ORDER_SUPPLIER_DATE_NOT_REPORTED} · {r.reason}
                    </p>
                    <p className="text-meta text-kit-slate-11">{[r.reference, r.note, r.recorded_by, fmtDate(r.recorded_at, { time: true })].filter(Boolean).join(" · ")}</p>
                  </li>
                ))}
              </ul>
            )}
          </Block>

          {/* OWNER CONSENT — only for non-Carres-owned Units; never an Issue gate */}
          {consentScope.length > 0 ? (
            <Block
              title="Owner consent"
              headerSlot={consentOpen.length > 0 ? <Button variant="neutral" onClick={() => setDialog("consent")}>Record owner consent</Button> : null}
            >
              <ul className="flex flex-col gap-1" data-testid="repair-order-consent">
                {consentScope.map((u) => {
                  const last = [...ro.consents].reverse().find((c) => c.stock_item_ids.includes(u.stock_item_id));
                  return (
                    <li key={u.stock_item_id} className="text-body">
                      <span className="font-semibold">{u.unit_id}</span>{" · "}
                      {last ? `${last.outcome === "given" ? "Consent given" : "Consent refused"} · ${last.evidence}` : REPAIR_ORDER_ABSENT}
                    </li>
                  );
                })}
              </ul>
            </Block>
          ) : null}

          {/* HISTORY — Today · Yesterday · Earlier */}
          <Block title="History">
            <History ro={ro} />
          </Block>
        </div>
      </div>

      <IssueDialog ro={ro} open={dialog === "issue"} onClose={() => setDialog(null)} onDone={refresh} />
      <ReceiptDialog ro={ro} open={dialog === "receipt"} onClose={() => setDialog(null)} onDone={refresh} />
      <ReplyDialog ro={ro} open={dialog === "reply"} onClose={() => setDialog(null)} onDone={refresh} />
      <ConsentDialog ro={ro} open={dialog === "consent"} onClose={() => setDialog(null)} onDone={refresh} />
      <CancelDialog ro={ro} open={dialog === "cancel"} onClose={() => setDialog(null)} onDone={refresh} />
    </div>
  );
}

// ── History: every event is a fact some owner recorded ──────────────────────
function History({ ro }: { ro: RepairOrderDetail }) {
  const events = useMemo(() => {
    const out: { occurred_at: string; title: string; identity: string; detail: string[] }[] = [];
    const who = (name: string | null, at: string) => [name, fmtDate(at, { time: true })].filter(Boolean).join(" · ");
    out.push({ occurred_at: ro.created_at, title: "Created", identity: who(ro.created_by, ro.created_at), detail: [] });
    for (const s of ro.sends) out.push({ occurred_at: s.sent_at, title: `Repair order issued to ${ro.supplier_name ?? REPAIR_ORDER_ABSENT}`, identity: who(s.sent_by, s.sent_at), detail: [`${s.recipient} · ${s.channel}`] });
    if (ro.supplier_received_at) out.push({ occurred_at: ro.supplier_received_at, title: "Supplier received RO", identity: fmtDate(ro.supplier_received_at, { time: true }), detail: [ro.supplier_received_evidence ?? ""].filter(Boolean) });
    for (const r of ro.replies) out.push({ occurred_at: r.recorded_at, title: "Supplier reply", identity: who(r.recorded_by, r.recorded_at), detail: [r.reason] });
    for (const c of ro.consents) out.push({ occurred_at: c.recorded_at, title: "Owner consent", identity: who(c.recorded_by, c.recorded_at), detail: [c.outcome === "given" ? "Consent given" : "Consent refused"] });
    for (const u of ro.units) {
      if (u.actual_pickup_date) out.push({ occurred_at: u.actual_pickup_date, title: "Picked up", identity: fmtDate(u.actual_pickup_date, { time: true }), detail: [[u.unit_id, u.collected_by].filter(Boolean).join(" · ")] });
      if (u.goods_received_date) out.push({ occurred_at: u.goods_received_date, title: "Returned", identity: fmtDate(u.goods_received_date), detail: [[u.unit_id, u.grn_no].filter(Boolean).join(" · ")] });
    }
    if (ro.cancelled_at) out.push({ occurred_at: ro.cancelled_at, title: "Cancelled", identity: fmtDate(ro.cancelled_at, { time: true }), detail: [ro.cancel_reason ?? ""].filter(Boolean) });
    return out;
  }, [ro]);
  return (
    <div className="flex flex-col gap-4" data-testid="repair-order-history">
      {groupHistoryChronology(events).map((group) => (
        <section key={group.heading}>
          <h3 className="mb-1.5 text-label font-semibold text-base-500">{group.heading}</h3>
          <ul className="flex flex-col divide-y divide-base-200">
            {group.events.map((e, i) => (
              <li key={`${e.title}-${e.occurred_at}-${i}`} className="flex min-w-0 flex-col gap-0.5 py-2 first:pt-0 last:pb-0">
                <RecordRanks words={{ title: e.title, identity: e.identity, detail: e.detail }} />
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

// ── the dialogs: each one door, each refusal printed in the door's words ────
function useDoor(ro: RepairOrderDetail, path: string, onDone: () => void, onClose: () => void) {
  return useMutation({
    mutationFn: (body: object) => apiFetch(`/api/operation/repair-orders/${ro.id}/${path}`, { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => {
      onDone();
      onClose();
    },
  });
}

function DialogShell({ open, onClose, title, description, pending, error, canSave, onSave, saveWord, children }: {
  open: boolean; onClose: () => void; title: string; description?: string; pending: boolean; error: unknown;
  canSave: boolean; onSave: () => void; saveWord: string; children: ReactNode;
}) {
  return (
    <Modal
      open={open}
      onOpenChange={(v) => { if (!v) onClose(); }}
      title={title}
      description={description}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="neutral" onClick={onClose} disabled={pending}>Cancel</Button>
          <Button variant="primary" disabled={!canSave} loading={pending} onClick={onSave}>{saveWord}</Button>
        </div>
      }
    >
      <div className="grid gap-3">
        {error ? <p role="alert" className="rounded-control border border-kit-red-9 bg-kit-red-3 px-3 py-2 text-body text-kit-red-11">{refusal(error)}</p> : null}
        {children}
      </div>
    </Modal>
  );
}

function IssueDialog({ ro, open, onClose, onDone }: { ro: RepairOrderDetail; open: boolean; onClose: () => void; onDone: () => void }) {
  const [channel, setChannel] = useState("whatsapp");
  const [recipient, setRecipient] = useState("");
  const [note, setNote] = useState("");
  const door = useDoor(ro, "issue", onDone, onClose);
  return (
    <DialogShell open={open} onClose={onClose} title={`Issue repair order to ${ro.supplier_name ?? REPAIR_ORDER_ABSENT}`} pending={door.isPending} error={door.error}
      canSave={recipient.trim().length > 0} saveWord="Record what you sent"
      onSave={() => door.mutate({ channel, recipient: recipient.trim(), note: note.trim() || null })}>
      <Select id="ro-issue-channel" label="Channel" value={channel} onValueChange={setChannel} options={CHANNELS} />
      <Input id="ro-issue-recipient" label="Recipient" value={recipient} onChange={(e) => setRecipient(e.target.value)} />
      <Textarea id="ro-issue-note" label="Note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
    </DialogShell>
  );
}

function ReceiptDialog({ ro, open, onClose, onDone }: { ro: RepairOrderDetail; open: boolean; onClose: () => void; onDone: () => void }) {
  const [date, setDate] = useState<string | null>(null);
  const [time, setTime] = useState("");
  const [channel, setChannel] = useState("whatsapp");
  const [reference, setReference] = useState("");
  const door = useDoor(ro, "supplier-receipt", onDone, onClose);
  const ready = Boolean(date) && /^\d{2}:\d{2}$/.test(time) && reference.trim().length > 0;
  return (
    <DialogShell open={open} onClose={onClose} title="Record Supplier receipt" description="Target starts when they confirm." pending={door.isPending} error={door.error}
      canSave={ready} saveWord="Record Supplier receipt"
      onSave={() => door.mutate({ received_at: `${date}T${time}:00+08:00`, source: channel, reference: reference.trim() })}>
      <DatePicker id="ro-receipt-date" label="Received at" value={date} onChange={setDate} />
      <Input id="ro-receipt-time" type="time" label="Time" value={time} onChange={(e) => setTime(e.target.value)} />
      <Select id="ro-receipt-channel" label="Channel" value={channel} onValueChange={setChannel} options={RECEIPT_CHANNELS} />
      <Input id="ro-receipt-reference" label="Reply reference" value={reference} onChange={(e) => setReference(e.target.value)} />
    </DialogShell>
  );
}

function ReplyDialog({ ro, open, onClose, onDone }: { ro: RepairOrderDetail; open: boolean; onClose: () => void; onDone: () => void }) {
  const [date, setDate] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const [reference, setReference] = useState("");
  const door = useDoor(ro, "supplier-reply", onDone, onClose);
  const ready = reason.length > 0 && reference.trim().length > 0 && (reason !== "Other" || note.trim().length > 0);
  return (
    <DialogShell open={open} onClose={onClose} title="Record Supplier reply" pending={door.isPending} error={door.error}
      canSave={ready} saveWord="Record Supplier reply"
      onSave={() => door.mutate({ expected_return_date: date, reason, note: note.trim() || null, reference: reference.trim() })}>
      <DatePicker id="ro-reply-date" label="Supplier Expected Return Date" hint={REPAIR_ORDER_SUPPLIER_DATE_NOT_REPORTED} value={date} onChange={setDate} />
      <Select id="ro-reply-reason" label="Reason" value={reason} onValueChange={setReason} options={PO_DELAY_REASONS.map((r) => ({ value: r, label: r }))} />
      <Textarea id="ro-reply-note" label="Note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
      <Input id="ro-reply-reference" label="Reply reference" value={reference} onChange={(e) => setReference(e.target.value)} />
    </DialogShell>
  );
}

function ConsentDialog({ ro, open, onClose, onDone }: { ro: RepairOrderDetail; open: boolean; onClose: () => void; onDone: () => void }) {
  const scope = repairOrderConsentOutstanding(ro);
  const [picked, setPicked] = useState<string[]>([]);
  const [outcome, setOutcome] = useState("given");
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");
  const door = useDoor(ro, "owner-consent", onDone, onClose);
  return (
    <DialogShell open={open} onClose={onClose} title="Record owner consent" pending={door.isPending} error={door.error}
      canSave={picked.length > 0 && reference.trim().length > 0} saveWord="Record owner consent"
      onSave={() => door.mutate({ stock_item_ids: picked, outcome, evidence: reference.trim(), note: note.trim() || null })}>
      <div className="grid gap-1">
        {scope.map((u) => (
          <Checkbox key={u.stock_item_id} id={`ro-consent-${u.stock_item_id}`} label={u.unit_id}
            checked={picked.includes(u.stock_item_id)}
            onCheckedChange={(v) => setPicked((p) => (v ? [...p, u.stock_item_id] : p.filter((x) => x !== u.stock_item_id)))} />
        ))}
      </div>
      <Select id="ro-consent-outcome" label="Owner consent" value={outcome} onValueChange={setOutcome}
        options={[{ value: "given", label: "Consent given" }, { value: "refused", label: "Consent refused" }]} />
      <Input id="ro-consent-reference" label="Reply reference" value={reference} onChange={(e) => setReference(e.target.value)} />
      <Textarea id="ro-consent-note" label="Note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
    </DialogShell>
  );
}

function CancelDialog({ ro, open, onClose, onDone }: { ro: RepairOrderDetail; open: boolean; onClose: () => void; onDone: () => void }) {
  const [reason, setReason] = useState("");
  const door = useDoor(ro, "cancel", onDone, onClose);
  return (
    <DialogShell open={open} onClose={onClose} title="Cancel repair order" pending={door.isPending} error={door.error}
      canSave={reason.trim().length > 0} saveWord="Cancel repair order" onSave={() => door.mutate({ reason: reason.trim() })}>
      <Textarea id="ro-cancel-reason" label="Reason" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />
    </DialogShell>
  );
}

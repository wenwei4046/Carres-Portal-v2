/**
 * THE CUSTOMER PARTY CARD — Workspace MASTER §5.10 (owner approval 2026-09-25).
 *
 * ```
 * COLLAPSED (exactly 72px)                   EXPANDED (in this order)
 *   Customer · Lim Kuan Yang        1 of 3     1 Current action (+ WhatsApp · Email · Record reply)
 *   Contact due today                          2 Delivery   Requested · Scheduled · Delivered
 *                                              3 Checklist  Customer contacted · Delivery date agreed ·
 *                                                           Address/access checked
 *                                              4 Response   the four governed answers
 *                                              5 Evidence and communication history
 * ```
 *
 * THE CARD OWNS NO FACT. Name, phone, email, address and Requested delivery
 * are the Sales Order's; Scheduled/Delivered, the contact records (0487) and
 * who calls the customer (`customer_contact_by`, 0488) are Delivery's. Every
 * write goes through Delivery: `DeliveryDatesEdit` (Accepted date) or the one
 * contact door (Record as sent · Requested another date · No answer · the
 * address check). The one arithmetic is `customerCardModel`; the contact
 * checkpoint is the Logistics card's `2 working days before` check.
 */
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import {
  CUSTOMER_CARD_COPY as C,
  CUSTOMER_REPLIES,
  CUSTOMER_REPLY_RESULT,
  CUSTOMER_RESULT_WORD,
  askedForNote,
  askedForOf,
  customerCardModel,
  customerReplyNeedsProof,
  myHolidaySet,
  type CustomerContactFact,
  type CustomerReplyKey,
  type DeliveryContactChannelKey,
} from "@carres/shared";
import Button from "@/components/kit/Button";
import DatePicker from "@/components/kit/DatePicker";
import Icon from "@/components/kit/Icon";
import { appTodayIso, fmtDate, fmtDateShort } from "@/lib/fmt-date";
import { displayCustomerName } from "@/lib/customer-name";
import { useDeliveryArrangements, useDeliveryPartners, useOperationStaff, useRecordDeliveryContact } from "@/lib/queries";
import { waLink } from "@/lib/wa-link";
import { buildCustomerDeliveryDateMessage } from "@/lib/wa-templates";
import { DeliveryDatesEdit, ReplyProofField, useReplyProofUpload } from "../components/DeliveryBrief";
import { useLogisticsModel } from "./LogisticsCard";
import { Fact, PartyCardShell, SectionTitle, ToneLine } from "./PartyCardShell";

const spell = (iso: string) => fmtDateShort(iso);
/** `25 Sep, 10:42` — the panel's one date-and-time spelling (§5.10). */
export const whenText = (iso: string) => `${fmtDateShort(iso)}, ${fmtDate(iso, { timeOnly: true })}`;

/** The Customer card's model — read by the card and by the right panel's
 *  one-blue-action priority. */
export function useCustomerCard(orderId: string, leg = 0) {
  const lm = useLogisticsModel(orderId, leg);
  const arrangementsQ = useDeliveryArrangements();
  const partnersQ = useDeliveryPartners();
  const staffQ = useOperationStaff();
  const card = lm.card;
  const o = lm.o;
  const partnerId = card?.logisticsPartnerId ?? lm.facts?.partner?.id ?? null;
  const partnerRow = (partnersQ.data?.partners ?? []).find((p) => p.id === partnerId) ?? null;
  const names = useMemo(
    () => new Map((staffQ.data?.staff ?? []).map((s) => [s.user_id, s.name ?? s.email])),
    [staffQ.data],
  );
  const contacts = useMemo<CustomerContactFact[]>(
    () =>
      (arrangementsQ.data?.contacts ?? [])
        .filter((k) => k.order_id === orderId && (k.leg ?? 0) === leg && k.contacted_person === "customer")
        .map((k) => ({
          atIso: k.contacted_at,
          purpose: k.purpose_key,
          channel: k.channel,
          result: k.result_key,
          evidencePath: k.reply_evidence_path,
          note: k.note,
          by: k.recorded_by ? names.get(k.recorded_by) ?? null : null,
        })),
    [arrangementsQ.data, orderId, leg, names],
  );
  const model = useMemo(() => {
    if (!card || !o || !lm.model) return null;
    return customerCardModel({
      todayIso: appTodayIso(),
      holidays: myHolidaySet(),
      contactBy: partnerRow?.customer_contact_by ?? (lm.partnerName ? "partner" : null),
      companyName: lm.partnerName,
      requestedIso: card.scope.customerDeliveryIso ?? null,
      scheduledIso: card.confirmedDate,
      deliveredIso: o.delivered_at ? o.delivered_at.slice(0, 10) : null,
      contactCheck: { dueIso: lm.model.rows[1].dueIso, state: lm.model.rows[1].state },
      contacts,
      condoRequired: /condo|apartment/i.test(o.building_type ?? ""),
      condoRecorded: Boolean(card.scope.arrangement?.condo_registration),
      settled: card.settled,
      spell,
    });
  }, [card, o, lm.model, lm.partnerName, partnerRow, contacts]);
  return { lm, model, partnerRow, loading: lm.scope.loading || arrangementsQ.isLoading, failed: lm.scope.failed || arrangementsQ.isError };
}

type Channel = Extract<DeliveryContactChannelKey, "whatsapp" | "call" | "email">;

export default function CustomerCard({
  orderId,
  leg = 0,
  open,
  onToggle,
  primary,
}: {
  orderId: string;
  leg?: number;
  open: boolean;
  onToggle: (open: boolean) => void;
  primary: boolean;
}) {
  const { lm, model, loading, failed } = useCustomerCard(orderId, leg);
  const record = useRecordDeliveryContact(orderId, leg);
  const proof = useReplyProofUpload(orderId, leg);
  const [mode, setMode] = useState<null | "message" | "reply" | "accepted">(null);
  const [messageChannel, setMessageChannel] = useState<"whatsapp" | "email">("whatsapp");
  const [askSent, setAskSent] = useState(false);
  const [reply, setReply] = useState<CustomerReplyKey | null>(null);
  const [channel, setChannel] = useState<Channel>("whatsapp");
  const [askedIso, setAskedIso] = useState<string | null>(null);
  const [proofPath, setProofPath] = useState<string | null>(null);
  const [addressChecked, setAddressChecked] = useState(false);

  const card = lm.card;
  const o = lm.o;

  if (loading && !model) {
    return (
      <div className="h-[72px] shrink-0 animate-pulse rounded-work border border-work-line bg-white motion-reduce:animate-none" data-testid="party-customer-loading" aria-label="Loading customer" />
    );
  }
  if (!card || !o || !model) {
    return (
      <PartyCardShell
        testId="party-customer"
        anchorId={`party-customer-${orderId}`}
        party={C.heading}
        heading={C.heading}
        status={<ToneLine tone={failed ? "attention" : "future"}>{C.unavailable}</ToneLine>}
        open={open}
        onToggle={onToggle}
      >
        <Link className="inline-flex min-h-10 items-center gap-1 self-start text-label text-kit-blue-11 hover:underline" to={`/operation/orders/so/${encodeURIComponent(orderId)}`}>
          {C.openSalesOrder}
          <Icon name="open" size={14} />
        </Link>
      </PartyCardShell>
    );
  }

  const name = displayCustomerName(o.customer_name) || null;
  const phone = (o.customer_phone ?? "").trim() || null;
  const email = (o.customer_email ?? "").trim() || null;
  const address = (o.customer_address ?? "").trim() || null;
  const reference = (o.source_ref ?? []).filter(Boolean).join(" · ") || null;
  const agreeingIso = card.confirmedDate ?? card.scope.customerDeliveryIso ?? null;
  const message = buildCustomerDeliveryDateMessage({ name, reference, dateText: agreeingIso ? spell(agreeingIso) : null });
  const wa = waLink(phone);
  const salesOrderHref = `/operation/orders/so/${encodeURIComponent(orderId)}`;
  const action = model.action;
  const actionTone = action?.timing === "missed" ? "missed" : action?.timing === "today" ? "current" : "future";
  const variant = (isPrimary: boolean) => (isPrimary && primary ? "primary" : "neutral");

  const resetReply = () => {
    setReply(null);
    setAskedIso(null);
    setProofPath(null);
    setAddressChecked(false);
    setMode(null);
  };

  async function recordSent() {
    try {
      await record.mutateAsync({
        purpose: "confirm_delivery_date",
        channel: messageChannel,
        contactedPerson: "customer",
        result: "waiting_for_customer_reply",
        note: `Template: ${C.templateConfirm}`,
      });
      toast.success(C.sentRecorded);
      setAskSent(false);
      setMode(null);
    } catch {
      toast.error(C.replyFailed);
    }
  }

  async function saveReply() {
    if (!reply) return;
    const result = CUSTOMER_REPLY_RESULT[reply];
    if (!result) return;
    if (reply === "another_date" && !askedIso) {
      toast.error(C.needsDate);
      return;
    }
    if (customerReplyNeedsProof(reply) && !proofPath) {
      toast.error(C.needsProof);
      return;
    }
    try {
      await record.mutateAsync({
        purpose: reply === "another_date" ? "confirm_new_delivery_date" : "confirm_delivery_date",
        channel,
        contactedPerson: "customer",
        result,
        replyEvidencePath: proofPath,
        note: reply === "another_date" && askedIso ? askedForNote(askedIso) : null,
      });
      if (addressChecked) {
        await record.mutateAsync({
          purpose: "confirm_delivery_address",
          channel,
          contactedPerson: "customer",
          result: "confirmed",
        });
      }
      toast.success(C.replyRecorded);
      resetReply();
    } catch {
      toast.error(C.replyFailed);
    }
  }

  const status = (() => {
    const text = model.status.text;
    const fragment = ` · ${C.contactDueToday}`;
    if (text.endsWith(fragment) && text !== C.contactDueToday) {
      /* Only the `Contact due today` fragment is blue; the date stays neutral. */
      return (
        <span className="inline-flex min-w-0 items-center gap-1 text-[12px] leading-4 text-kit-slate-12">
          <span>{text.slice(0, -fragment.length)}</span>
          <span className="text-kit-slate-11">·</span>
          <span className="text-kit-blue-11">{C.contactDueToday}</span>
        </span>
      );
    }
    return <ToneLine tone={model.status.tone} testId="party-customer-line">{text}</ToneLine>;
  })();

  return (
    <PartyCardShell
      testId="party-customer"
      anchorId={`party-customer-${orderId}`}
      party={C.heading}
      heading={`${C.heading} · ${name ?? "Name not recorded"}`}
      progress={C.progress(model.doneCount, 3)}
      status={status}
      open={open}
      onToggle={onToggle}
    >
      {/* 1 · Current action */}
      <section aria-label={C.sectionAction} className="flex flex-col gap-2">
        <SectionTitle>{C.sectionAction}</SectionTitle>
        {action ? (
          <div>
            <div className="text-[14px] font-semibold leading-5 text-kit-slate-12">{action.act}</div>
            <ToneLine tone={actionTone}>
              {[action.result, action.dueIso && action.timing !== "today" ? `due ${spell(action.dueIso)}` : null].filter(Boolean).join(" · ")}
            </ToneLine>
          </div>
        ) : model.mode === "partner" && lm.partnerName ? (
          <p className="text-body text-kit-slate-11">{C.partnerAct(lm.partnerName)}</p>
        ) : null}
        {mode === null ? (
          <div className="flex flex-wrap items-center gap-2">
            {action?.door === "contact" ? (
              <>
                {phone ? (
                  <Button size="touch" icon="message" variant={variant(true)} onClick={() => { setMessageChannel("whatsapp"); setMode("message"); }} data-testid="party-customer-whatsapp">
                    {C.whatsapp}
                  </Button>
                ) : null}
                {email ? (
                  <Button size="touch" variant={variant(!phone)} onClick={() => { setMessageChannel("email"); setMode("message"); }} data-testid="party-customer-email">
                    {C.email}
                  </Button>
                ) : null}
              </>
            ) : null}
            {action?.door === "schedule" ? (
              <Button size="touch" variant={variant(true)} onClick={() => setMode("accepted")} data-testid="party-customer-record-scheduled">
                {C.recordScheduled}
              </Button>
            ) : null}
            <Button size="touch" variant={variant(!action || action.door === "sales_order")} onClick={() => setMode("reply")} data-testid="party-customer-record-reply">
              {C.recordReply}
            </Button>
            <Link className="inline-flex min-h-10 items-center gap-1 text-label text-kit-blue-11 hover:underline" to={salesOrderHref}>
              {C.openSalesOrder}
              <Icon name="open" size={14} />
            </Link>
          </div>
        ) : null}
        {!phone ? (
          <p className="flex flex-wrap items-center gap-2 text-label text-kit-slate-11" data-testid="party-customer-no-phone">
            {C.whatsappUnavailable}
          </p>
        ) : null}

        {/* The communication preview — the governed template; opening is not sending */}
        {mode === "message" ? (
          <div className="flex flex-col gap-2 rounded-control border border-kit-slate-5 p-2.5" data-testid="party-customer-message">
            <div className="text-label text-kit-slate-11">
              {C.to(name ?? C.heading, messageChannel === "whatsapp" ? phone ?? "" : email ?? "")}
            </div>
            <Fact label={C.template}>{C.templateConfirm}</Fact>
            <pre className="whitespace-pre-wrap break-words rounded-control bg-kit-slate-2 p-2 font-sans text-body text-kit-slate-12">{message}</pre>
            {askSent ? (
              <div className="flex flex-wrap items-center gap-2" data-testid="party-customer-was-sent">
                <span className="text-body text-kit-slate-12">{C.wasSent}</span>
                <Button size="touch" variant="primary" disabled={record.isPending} onClick={() => void recordSent()} data-testid="party-customer-record-sent">
                  {C.recordSent}
                </Button>
                <Button size="touch" onClick={() => { setAskSent(false); setMode(null); }} data-testid="party-customer-not-sent">
                  {C.notSent}
                </Button>
              </div>
            ) : (
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  size="touch"
                  icon="copy"
                  onClick={() => {
                    void navigator.clipboard.writeText(message).then(
                      () => toast.success(C.messageCopied),
                      () => toast.error(C.replyFailed),
                    );
                  }}
                >
                  {C.copyMessage}
                </Button>
                {messageChannel === "whatsapp" && wa ? (
                  <a
                    className="inline-flex h-10 items-center gap-1.5 rounded-control border border-kit-slate-5 bg-white px-3 text-body text-kit-slate-12 hover:bg-kit-slate-3 min-[960px]:h-9"
                    href={`${wa}?text=${encodeURIComponent(message)}`}
                    target="_blank"
                    rel="noreferrer"
                    onClick={() => setAskSent(true)}
                    data-testid="party-customer-open-whatsapp"
                  >
                    <Icon name="message" size={14} />
                    {C.openWhatsApp}
                  </a>
                ) : null}
                {messageChannel === "email" && email ? (
                  <a
                    className="inline-flex h-10 items-center gap-1.5 rounded-control border border-kit-slate-5 bg-white px-3 text-body text-kit-slate-12 hover:bg-kit-slate-3 min-[960px]:h-9"
                    href={`mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent(`Carres · ${reference ?? C.templateConfirm}`)}&body=${encodeURIComponent(message)}`}
                    onClick={() => setAskSent(true)}
                    data-testid="party-customer-open-email"
                  >
                    {C.openEmail}
                  </a>
                ) : null}
                <Button size="touch" variant="ghost" onClick={() => setMode(null)}>{C.cancel}</Button>
              </div>
            )}
            <p className="text-label text-kit-slate-11">Copying or opening WhatsApp confirms nothing. Record the answer when it comes.</p>
          </div>
        ) : null}

        {mode === "accepted" ? (
          <div className="rounded-control border border-kit-slate-5 p-2.5" data-testid="party-customer-accepted-form">
            <DeliveryDatesEdit
              card={card}
              initialFrom="customer"
              initialDate={model.latest?.result === "requested_another_date" ? askedForOf(model.latest.note) : null}
              onDone={resetReply}
            />
          </div>
        ) : null}
      </section>

      {/* 2 · Delivery */}
      <section aria-label={C.sectionDelivery} className="flex flex-col">
        <SectionTitle>{C.sectionDelivery}</SectionTitle>
        <Fact label="Requested delivery">{card.scope.customerDeliveryIso ? spell(card.scope.customerDeliveryIso) : C.noRequested}</Fact>
        <Fact label="Scheduled delivery">
          <span className="font-semibold">{card.confirmedDate ? [spell(card.confirmedDate), card.confirmedTime].filter(Boolean).join(" · ") : "Not scheduled yet"}</span>
        </Fact>
        {o.delivered_at ? <Fact label="Delivered">{spell(o.delivered_at.slice(0, 10))}</Fact> : null}
      </section>

      {/* 3 · Checklist */}
      <section aria-label="Checklist" className="flex flex-col gap-1">
        <SectionTitle>Checklist</SectionTitle>
        <ul className="flex flex-col">
          {model.checks.map((check) => (
            <li key={check.key} className="flex items-center gap-2 py-1 text-[13px] leading-[18px] text-kit-slate-12" data-testid={`party-customer-check-${check.key}`}>
              <span className={check.done ? "text-kit-slate-12" : "text-kit-slate-9"} aria-hidden="true">
                <Icon name={check.done ? "ready" : "date"} size={14} />
              </span>
              <span>{check.label}</span>
              <span className="sr-only">{check.done ? "done" : "not done"}</span>
            </li>
          ))}
        </ul>
      </section>

      {/* 4 · Response — the four governed answers, through Delivery's door */}
      <section aria-label="Response" className="flex flex-col gap-2">
        <SectionTitle>Response</SectionTitle>
        {mode === "reply" ? (
          <form
            className="flex flex-col gap-2"
            data-testid="party-customer-reply-form"
            onSubmit={(e) => {
              e.preventDefault();
              if (reply === "accepted_date") setMode("accepted");
              else void saveReply();
            }}
          >
            <fieldset className="flex flex-wrap gap-2">
              <legend className="mb-1 text-label text-kit-slate-11">{C.channel}</legend>
              {(["whatsapp", "call", "email"] as Channel[]).map((ch) => (
                <label key={ch} className="inline-flex min-h-10 items-center gap-1.5 text-body text-kit-slate-12">
                  <input type="radio" name="customer-channel" checked={channel === ch} onChange={() => setChannel(ch)} />
                  {ch === "whatsapp" ? "WhatsApp" : ch === "call" ? "Call" : "Email"}
                </label>
              ))}
            </fieldset>
            <fieldset className="flex flex-col">
              <legend className="mb-1 text-label text-kit-slate-11">{C.reply}</legend>
              {CUSTOMER_REPLIES.filter((r) => ["accepted_date", "another_date", "no_answer", "details_changed"].includes(r.key)).map((r) => (
                <label key={r.key} className="inline-flex min-h-10 items-center gap-1.5 text-body text-kit-slate-12">
                  <input type="radio" name="customer-reply" checked={reply === r.key} onChange={() => setReply(r.key)} data-testid={`party-customer-reply-${r.key}`} />
                  {r.label}
                </label>
              ))}
            </fieldset>
            {reply === "another_date" ? (
              <DatePicker id={`customer-asked-${orderId}`} label={C.askedDate} value={askedIso} onChange={setAskedIso} required />
            ) : null}
            {reply && customerReplyNeedsProof(reply) ? (
              <ReplyProofField
                id={`customer-proof-${orderId}`}
                path={proofPath}
                busy={proof.busy}
                error={proof.error}
                onFile={(file) => {
                  void proof.upload(file).then((path) => {
                    if (path) setProofPath(path);
                  });
                }}
              />
            ) : null}
            {reply === "details_changed" ? (
              <p className="text-body text-kit-slate-12" data-testid="party-customer-details-changed">
                {C.detailsChanged}{" "}
                <Link className="text-kit-blue-11 hover:underline" to={salesOrderHref}>{C.openSalesOrder}</Link>
              </p>
            ) : null}
            {reply && reply !== "details_changed" && reply !== "accepted_date" ? (
              <label className="inline-flex min-h-10 items-center gap-1.5 text-body text-kit-slate-12">
                <input type="checkbox" checked={addressChecked} onChange={(e) => setAddressChecked(e.target.checked)} />
                {C.addressChecked}
              </label>
            ) : null}
            <div className="flex flex-wrap gap-2">
              {reply !== "details_changed" ? (
                <Button type="submit" size="touch" variant="primary" disabled={!reply || record.isPending || proof.busy} data-testid="party-customer-save-reply">
                  {C.saveReply}
                </Button>
              ) : null}
              <Button type="button" size="touch" variant="ghost" onClick={resetReply}>{C.cancel}</Button>
            </div>
          </form>
        ) : (
          <p className="text-label text-kit-slate-11">
            {model.latest ? `${CUSTOMER_RESULT_WORD[model.latest.result]} · ${whenText(model.latest.atIso)}` : C.noContacts}
            {model.waiting && model.followUpIso ? ` · ${C.replyDue(spell(model.followUpIso))}` : ""}
          </p>
        )}
      </section>

      {/* 5 · Evidence and communication history */}
      <section aria-label={C.sectionHistory} className="flex flex-col gap-1.5">
        <SectionTitle>{C.sectionHistory}</SectionTitle>
        <div className="text-label text-kit-slate-11">
          {[phone ?? C.noPhone, email ?? C.noEmail].join(" · ")}
          {address ? <div className="break-words text-kit-slate-12">{address}</div> : null}
          <div>{model.mode === "partner" && lm.partnerName ? C.companyContacts(lm.partnerName) : C.carresContacts}</div>
        </div>
        {model.history.length === 0 ? (
          <p className="text-body text-kit-slate-11">{C.noContacts}</p>
        ) : (
          <ol className="flex flex-col gap-2" data-testid="party-customer-history">
            {model.history.slice(0, 8).map((h, i) => (
              <li key={`${h.atIso}-${i}`}>
                <div className="text-[12px] leading-4 text-kit-slate-12">{CUSTOMER_RESULT_WORD[h.result]}</div>
                <div className="text-[12px] leading-4 text-kit-slate-11">
                  {[whenText(h.atIso), h.channel === "whatsapp" ? "WhatsApp" : h.channel === "email" ? "Email" : h.channel === "call" ? "Call" : "In person", h.by].filter(Boolean).join(" · ")}
                </div>
                {h.evidencePath ? <div className="text-[12px] leading-4 text-kit-slate-11">WhatsApp reply · 1 photo</div> : null}
              </li>
            ))}
          </ol>
        )}
      </section>
    </PartyCardShell>
  );
}


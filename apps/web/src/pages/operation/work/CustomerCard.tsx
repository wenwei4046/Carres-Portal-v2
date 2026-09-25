/**
 * THE CUSTOMER PARTY CARD — Workspace MASTER §5.10 (owner approval 2026-09-25,
 * OWNER CORRECTION 2026-09-25).
 *
 * ```
 * COLLAPSED (exactly 72px)                       EXPANDED (in this order)
 *   Customer · Lim Kuan Yang                       1 Current action — exceptions only
 *   AL Logistics contacts the customer · by 24 Oct 2 Delivery   Requested · Scheduled · Delivered
 *                                                  3 Partner contact (read-only; Delivery's door)
 *                                                  4 Exception — the source fact
 *                                                  5 Evidence and communication history
 * ```
 *
 * The assigned Logistics company contacts the customer and agrees the date;
 * this card is NOT a routine Carres calling queue. Normal partner scheduling
 * shows no Carres button. Carres acts only on the four source exceptions
 * (`customerCardModel`) — each through its owner's door: the Sales Order
 * (a known delay, a wrong phone number) or Delivery (another date asked, a
 * refusal). The card owns no fact and writes nothing itself.
 */
import { useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  CUSTOMER_CARD_COPY as C,
  CUSTOMER_RESULT_WORD,
  customerCardModel,
  mytDayOf,
  type CustomerContactFact,
} from "@carres/shared";
import Button from "@/components/kit/Button";
import Icon from "@/components/kit/Icon";
import { appTodayIso, fmtDate, fmtDateShort } from "@/lib/fmt-date";
import { displayCustomerName } from "@/lib/customer-name";
import { useDeliveryArrangements, useOperationStaff, useOperationWork } from "@/lib/queries";
import { useLogisticsModel } from "./LogisticsCard";
import { Fact, PartyCardShell, SectionTitle, ToneLine } from "./PartyCardShell";

/* A date never splits over two lines (§5.10). */
const spell = (iso: string) => fmtDateShort(iso).replace(" ", " ");
/** `25 Sep, 10:42` — the panel's one date-and-time spelling (§5.10). */
export const whenText = (iso: string) => `${fmtDateShort(iso)}, ${fmtDate(iso, { timeOnly: true })}`;

/** The Sales Order action engine's delay rules — read from the ONE Work feed,
 *  never re-decided here (Law D). */
const DELAY_RULES = new Set(["delay_planning", "arrange_new_delivery_date"]);

/** The Customer card's model — read by the card and by the panel's one-blue
 *  ranking. */
export function useCustomerCard(orderId: string, leg = 0) {
  const lm = useLogisticsModel(orderId, leg);
  const arrangementsQ = useDeliveryArrangements();
  const staffQ = useOperationStaff();
  const workQ = useOperationWork();
  const card = lm.card;
  const o = lm.o;
  const names = useMemo(
    () => new Map((staffQ.data?.staff ?? []).map((s) => [s.user_id, s.name ?? s.email])),
    [staffQ.data],
  );
  const contacts = useMemo<CustomerContactFact[]>(
    () =>
      (arrangementsQ.data?.contacts ?? [])
        .filter((k) => k.order_id === orderId && (k.leg ?? 0) === leg)
        .map((k) => ({
          atIso: k.contacted_at,
          purpose: k.purpose_key,
          channel: k.channel,
          result: k.result_key,
          person: k.contacted_person,
          evidencePath: k.reply_evidence_path,
          note: k.note,
          by: k.recorded_by ? names.get(k.recorded_by) ?? null : null,
        })),
    [arrangementsQ.data, orderId, leg, names],
  );
  const delayNoticeRequired = useMemo(
    () => (workQ.data?.items ?? []).some((i) => i.object.id === orderId && DELAY_RULES.has(i.ruleKey)),
    [workQ.data, orderId],
  );
  const model = useMemo(() => {
    if (!card || !o || !lm.model) return null;
    const answer = lm.facts?.answer ?? null;
    return customerCardModel({
      todayIso: appTodayIso(),
      companyName: lm.partnerName,
      requestedIso: card.scope.customerDeliveryIso ?? null,
      scheduledIso: card.confirmedDate,
      deliveredIso: o.delivered_at ? mytDayOf(o.delivered_at) : null,
      contactCheck: { dueIso: lm.model.rows[1].dueIso, state: lm.model.rows[1].state },
      contacts,
      partnerAnswer: answer ? { kind: answer.kind, proposedIso: answer.proposedDate, atIso: answer.at } : null,
      delayNoticeRequired,
      settled: card.settled,
      spell,
    });
  }, [card, o, lm.model, lm.facts, lm.partnerName, contacts, delayNoticeRequired]);
  return { lm, model, loading: lm.scope.loading || arrangementsQ.isLoading, failed: lm.scope.failed || arrangementsQ.isError };
}

const CHANNEL_WORD: Record<string, string> = { whatsapp: "WhatsApp", email: "Email", call: "Call", in_person: "In person" };

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
  const navigate = useNavigate();
  const { lm, model, loading, failed } = useCustomerCard(orderId, leg);
  const card = lm.card;
  const o = lm.o;
  const salesOrderHref = `/operation/orders/so/${encodeURIComponent(orderId)}`;
  const deliveryHref = `/operation?tab=delivery&view=all&open=${encodeURIComponent(orderId)}`;

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
        <DoorLink to={salesOrderHref}>{C.openSalesOrder}</DoorLink>
      </PartyCardShell>
    );
  }

  const name = displayCustomerName(o.customer_name) || null;
  const phone = (o.customer_phone ?? "").trim() || null;
  const email = (o.customer_email ?? "").trim() || null;
  const address = (o.customer_address ?? "").trim() || null;
  const action = model.action;
  const actionTone = action?.timing === "missed" ? "missed" : "current";
  const doorHref = action?.door === "delivery" ? deliveryHref : salesOrderHref;
  const doorWord = action?.door === "delivery" ? C.openInDelivery : C.openSalesOrder;
  const t2 = lm.model?.rows[1] ?? null;

  return (
    <PartyCardShell
      testId="party-customer"
      anchorId={`party-customer-${orderId}`}
      party={C.heading}
      heading={`${C.heading} · ${name ?? "Name not recorded"}`}
      status={<ToneLine tone={model.status.tone} testId="party-customer-line">{model.status.text}</ToneLine>}
      open={open}
      onToggle={onToggle}
    >
      {/* 1 · Current action — exceptions only; normal partner contact has no Carres button */}
      <section aria-label={C.sectionAction} className="flex flex-col gap-2">
        <SectionTitle>{C.sectionAction}</SectionTitle>
        {action ? (
          <>
            <div>
              <div className="text-[14px] font-semibold leading-5 text-kit-slate-12">{action.act}</div>
              <ToneLine tone={actionTone}>{action.result}</ToneLine>
            </div>
            <span className="self-start">
              <Button size="touch" icon="open" variant={primary ? "primary" : "neutral"} onClick={() => navigate(doorHref)} data-testid="party-customer-door">
                {doorWord}
              </Button>
            </span>
          </>
        ) : (
          <p className="text-body text-kit-slate-11" data-testid="party-customer-no-act">
            {lm.partnerName ? C.partnerAct(lm.partnerName) : C.notAssigned}
          </p>
        )}
      </section>

      {/* 2 · Delivery */}
      <section aria-label={C.sectionDelivery} className="flex flex-col">
        <SectionTitle>{C.sectionDelivery}</SectionTitle>
        <Fact label="Requested delivery">{card.scope.customerDeliveryIso ? spell(card.scope.customerDeliveryIso) : "No requested delivery date"}</Fact>
        <Fact label="Scheduled delivery">
          <span className="font-semibold">{card.confirmedDate ? [spell(card.confirmedDate), card.confirmedTime].filter(Boolean).join(" · ") : "Not scheduled yet"}</span>
        </Fact>
        {o.delivered_at ? <Fact label="Delivered">{spell(mytDayOf(o.delivered_at))}</Fact> : null}
      </section>

      {/* 3 · Partner contact — read-only; Delivery records the company's reply */}
      <section aria-label={C.sectionPartner} className="flex flex-col">
        <SectionTitle>{C.sectionPartner}</SectionTitle>
        <Fact label="Logistics">{lm.partnerName ?? C.notAssigned}</Fact>
        {t2?.dueIso ? <Fact label={C.contactBy}>{spell(t2.dueIso)}</Fact> : null}
        <Fact label={C.latestResult}>
          {model.latest ? `${CUSTOMER_RESULT_WORD[model.latest.result]} · ${whenText(model.latest.atIso)}` : C.noContacts}
        </Fact>
        <DoorLink to={deliveryHref}>{C.openInDelivery}</DoorLink>
      </section>

      {/* 4 · Exception — only when one of the four governed exceptions exists */}
      {model.exception ? (
        <section aria-label={C.sectionException} className="flex flex-col gap-1" data-testid="party-customer-exception">
          <SectionTitle>{C.sectionException}</SectionTitle>
          <ToneLine tone={model.status.tone}>{model.exception.fact}</ToneLine>
        </section>
      ) : null}

      {/* 5 · Evidence and communication history */}
      <section aria-label={C.sectionHistory} className="flex flex-col gap-1.5">
        <SectionTitle>{C.sectionHistory}</SectionTitle>
        <div className="text-label text-kit-slate-11">
          {[phone ?? C.noPhone, email ?? C.noEmail].join(" · ")}
          {address ? <div className="break-words text-kit-slate-12">{address}</div> : null}
        </div>
        {model.history.length === 0 ? (
          <p className="text-body text-kit-slate-11">{C.noContacts}</p>
        ) : (
          <ol className="flex flex-col gap-2" data-testid="party-customer-history">
            {model.history.slice(0, 8).map((h, i) => (
              <li key={`${h.atIso}-${i}`}>
                <div className="text-[12px] leading-4 text-kit-slate-12">{CUSTOMER_RESULT_WORD[h.result]}</div>
                <div className="text-[12px] leading-4 text-kit-slate-11">
                  {[whenText(h.atIso), CHANNEL_WORD[h.channel] ?? h.channel, h.by].filter(Boolean).join(" · ")}
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

function DoorLink({ to, children }: { to: string; children: string }) {
  return (
    <Link className="inline-flex min-h-10 items-center gap-1 self-start text-label text-kit-blue-11 hover:underline" to={to}>
      {children}
      <Icon name="open" size={14} />
    </Link>
  );
}

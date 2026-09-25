/**
 * THE LOGISTICS PARTY CARD — the Work right panel (owner rulings 2026-09-24,
 * docs/workspace/MASTER.md §5.9).
 *
 * ```
 * COLLAPSED (≤ 5 facts)                         EXPANDED (in this order)
 *   Logistics · AL Logistics   Checks 1 of 3      1 Current action
 *   Call AL Logistics                             2 Checks (3 · 2 · 1 working days before)
 *   Get the scheduled delivery date · 24 Oct      3 Scheduled delivery
 *   Scheduled delivery · 27 Oct                   4 Assignment
 *   RM 1,250.00 still to collect                  5 Stock route
 *                                                 6 External link
 *                                                 7 Communication
 *                                                 8 Evidence and recent history
 * ```
 *
 * THE CARD OWNS NO FACT. Every date, company, answer and route is read from
 * its owner — Delivery (the Monitor card's own builder + the Logistics facts
 * read), Purchasing/Stock (the route, read by Delivery), Payment (the money
 * figure) — and every write goes through a Delivery-owned component
 * (`LogisticsDetailsEdit`, `DeliveryDatesEdit`) or a Delivery door (link). The
 * one arithmetic is `logisticsCardModel` in @carres/shared.
 */
import { useId, useMemo, useRef, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import {
  ANOTHER_DATE_REASONS,
  CANNOT_DELIVER_REASONS,
  LINK_COPY,
  LOGISTICS_COPY,
  STOCK_ROUTE_LABEL,
  logisticsCardModel,
  moneyAffectsDelivery,
  myHolidaySet,
  type LogisticsAction,
  type LogisticsCheckRow,
  type LogisticsGap,
} from "@carres/shared";
import Button from "@/components/kit/Button";
import Icon from "@/components/kit/Icon";
import { apiFetch } from "@/lib/api";
import { appTodayIso, fmtDate, fmtDateShort } from "@/lib/fmt-date";
import { displayCustomerName } from "@/lib/customer-name";
import { useDeliveryLinkActs, useDeliveryPartners, useLogisticsCardFacts } from "@/lib/queries";
import { DeliveryDatesEdit, LogisticsDetailsEdit } from "../components/DeliveryBrief";
import { useDeliveryScopeCard } from "../delivery-scope-card";
import { chaseMessageFor } from "../delivery-chase";
import { lineName, moneyOfOrder } from "../sales-order-facts";
import { WorkSection } from "./WorkCard";

const RM = new Intl.NumberFormat("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const PARTY_COPY = {
  expand: (party: string) => `Show ${party} details`,
  collapse: (party: string) => `Hide ${party} details`,
  currentAction: "Current action",
  checks: "Checks",
  scheduledSection: "Scheduled delivery",
  assignment: "Assignment",
  stockRoute: "Stock route",
  communication: "Communication",
  history: "Evidence and recent history",
  noHistory: "No history recorded",
  recordScheduled: "Record scheduled delivery",
  assignLogistics: "Assign logistics",
  changeLogistics: "Change logistics",
  recordDetails: "Record the details",
  openInDelivery: "Open in Delivery",
  openPurchasing: "Open Purchasing",
  copyMessage: "Copy message",
  openGroup: "Open WhatsApp group",
  groupNotSet: "WhatsApp group not set",
  copied: "Message copied",
  sentIsNotConfirmed: "Copying or opening WhatsApp confirms nothing. Record the answer when it comes.",
  answersInPortal: (company: string) => `${company} answers in its own portal.`,
  answersByLink: (company: string) => `${company} answers through the external link.`,
  assignFirst: "Assign logistics first.",
  linkRevoked: (date: string) => `${LINK_COPY.revoked} · ${date}`,
  linkRevokedToast: "Link revoked",
  linkCreatedToast: "Link created",
  nothingToDo: "Nothing to do now.",
  readyUnits: (n: number, place: string | null) =>
    place ? `${n} Unit${n === 1 ? "" : "s"} reserved at ${place}` : `${n} Unit${n === 1 ? "" : "s"} reserved`,
  poLine: (po: string, supplier: string | null) => [po, supplier].filter(Boolean).join(" · "),
  poDelivery: (date: string) => `PO Delivery Date ${date}`,
  received: (date: string) => `Received ${date}`,
  notReceived: "Not received yet",
  goodsNotReady: (detail: string | null) => (detail ? `Goods not ready · ${detail}` : "Goods not ready"),
  doNotIssued: "Delivery Order not issued yet",
  driverMissing: "Driver and vehicle not recorded",
  condoMissing: "Condo registration not recorded",
  ask: (partner: string) => `Ask ${partner}`,
  recordDriver: "Record the driver and vehicle",
  recordCondo: "Record the condo registration",
  notReceivedAt: (place: string) => `Not received at ${place} yet`,
  loading: "Loading…",
  failed: "Logistics details could not be loaded.",
  tryAgain: "Try again",
} as const;

function spell(iso: string) {
  return fmtDateShort(iso);
}

/** A due date's words: `due 24 Oct` · missed keeps the day it missed. */
function dueText(action: LogisticsAction): string | null {
  if (!action.dueIso) return null;
  return action.timing === "missed" ? `Late — was due ${spell(action.dueIso)}` : `due ${spell(action.dueIso)}`;
}

function StateIcon({ row }: { row: LogisticsCheckRow }) {
  if (row.state === "done") return <span className="text-kit-green-11"><Icon name="ready" size={14} /></span>;
  if (row.state === "missed") return <span className="text-kit-red-11"><Icon name="late" size={14} /></span>;
  if (row.state === "open") return <span className="text-kit-blue-11"><Icon name="waiting" size={14} /></span>;
  return <span className="text-kit-slate-11"><Icon name="date" size={14} /></span>;
}

function SectionTitle({ children }: { children: ReactNode }) {
  return <h4 className="text-[11px] font-semibold uppercase leading-[14px] tracking-[0.04em] text-kit-slate-11">{children}</h4>;
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 py-0.5">
      <span className="text-label text-kit-slate-11">{label}</span>
      <span className="min-w-0 text-right text-body text-kit-slate-12">{children}</span>
    </div>
  );
}

/**
 * THE LOGISTICS MODEL, as one hook — the card, the Order Route's `Contact`
 * point and the Customer card all read the SAME `logisticsCardModel` answer
 * (Law D: the contact checkpoint is not a second clock).
 */
export function useLogisticsModel(orderId: string, leg = 0) {
  const scope = useDeliveryScopeCard(orderId, leg);
  const factsQ = useLogisticsCardFacts(orderId, leg);
  const card = scope.card;
  const facts = factsQ.data ?? null;
  const today = appTodayIso();
  const partnerName = card?.logisticsPartnerName ?? facts?.partner?.name ?? null;
  const o = card?.scope.o ?? null;
  const linkUrl = facts?.link ? `${window.location.origin}/delivery-link/${facts.link.token}` : null;

  const model = useMemo(() => {
    if (!card || !o) return null;
    const holidays = myHolidaySet();
    const anchor = card.confirmedDate ?? card.scope.customerDeliveryIso ?? null;
    const money = moneyOfOrder(o);
    const owed = money.known ? money.outstanding : 0;
    const affects = moneyAffectsDelivery({
      owed,
      anchorIso: anchor,
      todayIso: today,
      outstation: facts?.partner ? !facts.partner.kvDefault : false,
      holidays,
    });
    const financeHolds = (o.order_finance_exceptions ?? []).some((e) => e.status === "open");
    const arrangement = card.scope.arrangement;
    const gaps: LogisticsGap[] = [];
    if (!card.doNumber) {
      if (!card.stock.ready) gaps.push({ fact: PARTY_COPY.goodsNotReady(card.stock.line2), action: null });
      else if (!affects && !financeHolds) gaps.push({ fact: PARTY_COPY.doNotIssued, action: null });
    }
    for (const route of facts?.routes ?? []) {
      if (route.key === "supplier_to_logistics" && route.purchaseOrders.some((p) => !p.receivedDate) && route.readyUnits === 0) {
        gaps.push({ fact: PARTY_COPY.notReceivedAt(route.place ?? "the logistics site"), action: null });
      }
    }
    if (partnerName && (!arrangement?.driver_name || !arrangement?.vehicle)) {
      gaps.push({ fact: PARTY_COPY.driverMissing, action: { act: PARTY_COPY.ask(partnerName), result: PARTY_COPY.recordDriver, door: "assign" } });
    }
    if (partnerName && /condo|apartment/i.test(o.building_type ?? "") && !arrangement?.condo_registration) {
      gaps.push({ fact: PARTY_COPY.condoMissing, action: { act: PARTY_COPY.ask(partnerName), result: PARTY_COPY.recordCondo, door: "assign" } });
    }
    const answer = facts?.answer
      ? {
          kind: facts.answer.kind,
          atIso: facts.answer.at,
          proposedIso: facts.answer.proposedDate,
          reasonLabel:
            (facts.answer.kind === "another_date"
              ? ANOTHER_DATE_REASONS.find((r) => r.key === facts.answer?.reasonKey)?.label
              : CANNOT_DELIVER_REASONS.find((r) => r.key === facts.answer?.reasonKey)?.label) ?? facts.answer.reasonKey,
        }
      : null;
    return logisticsCardModel({
      todayIso: today,
      holidays,
      requestedIso: card.scope.customerDeliveryIso ?? null,
      scheduledIso: card.confirmedDate,
      partnerName,
      startedIso: (o.proceeded_at ?? o.proceed_date ?? null)?.slice(0, 10) ?? null,
      detailsReceivedIso: facts?.detailsReceivedAt?.slice(0, 10) ?? null,
      answer,
      settled: card.settled,
      dayBeforeGaps: gaps,
      moneyOwed: affects ? RM.format(owed) : null,
      financeHold: financeHolds ? "" : null,
      spell,
    });
  }, [card, o, facts, partnerName, today]);
  return { scope, factsQ, card, facts, today, partnerName, o, linkUrl, model };
}

export default function LogisticsCard({
  orderId,
  leg = 0,
  open: openProp,
  onToggle,
  primary = true,
}: {
  orderId: string;
  leg?: number;
  /** Controlled by the right panel: one party card open at a time (§5.10). */
  open?: boolean;
  onToggle?: (open: boolean) => void;
  /** Whether this card holds the panel's ONE blue action (§5.10). */
  primary?: boolean;
}) {
  const bodyId = useId();
  const toggleRef = useRef<HTMLButtonElement>(null);
  const [openLocal, setOpenLocal] = useState(false);
  const open = openProp ?? openLocal;
  const setOpen = (next: boolean | ((v: boolean) => boolean)) => {
    const value = typeof next === "function" ? next(open) : next;
    if (onToggle) onToggle(value);
    else setOpenLocal(value);
  };
  const [editing, setEditing] = useState<null | "logistics" | "schedule">(null);
  const partnersQ = useDeliveryPartners();
  const acts = useDeliveryLinkActs(orderId, leg);
  const { scope, factsQ, card, facts, today, partnerName, o, linkUrl, model } = useLogisticsModel(orderId, leg);
  void today;

  if (scope.loading && !card) {
    return <WorkSection className="p-4 text-body text-kit-slate-11" data-testid="logistics-card">{PARTY_COPY.loading}</WorkSection>;
  }
  if (!card || !model || !o) {
    return (
      <WorkSection className="flex items-center justify-between gap-3 p-4 text-body text-kit-slate-11" data-testid="logistics-card">
        <span>{scope.failed ? PARTY_COPY.failed : LOGISTICS_COPY.notAssigned}</span>
      </WorkSection>
    );
  }

  const action = model.currentAction;
  const partner = facts?.partner ?? null;
  const partnerRow = (partnersQ.data?.partners ?? []).find((p) => p.id === (partner?.id ?? card.logisticsPartnerId));
  const scheduledLine = card.confirmedDate
    ? [spell(card.confirmedDate), card.confirmedTime].filter(Boolean).join(" · ")
    : null;
  const delivered = o.delivered_at ? spell(o.delivered_at.slice(0, 10)) : null;
  const message = chaseMessageFor({
    reference: (o.source_ref ?? []).filter(Boolean).join(" · ") || null,
    customer: displayCustomerName(o.customer_name) || null,
    address: (o.customer_address ?? "").trim() || null,
    building: (o.building_type ?? "").trim() || null,
    goods: (o.order_lines ?? []).map((l) => lineName({ sku: l.sku })),
    requestedDate: card.scope.customerDeliveryIso ? fmtDate(card.scope.customerDeliveryIso) : null,
    linkUrl,
  });

  const copy = async (text: string, done: string, recordPrepared = false) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(done);
      if (recordPrepared && card.logisticsPartnerId) {
        /* A prepared message is an ACTIVITY fact (0412) — it confirms nothing. */
        void apiFetch(
          `/api/operation/delivery-arrangements/${encodeURIComponent(orderId)}/message-prepared?leg=${leg}`,
          { method: "POST", body: JSON.stringify({ partnerId: card.logisticsPartnerId }) },
        ).catch(() => undefined);
      }
    } catch {
      toast.error(PARTY_COPY.failed);
    }
  };

  const doorFor = (door: LogisticsAction["door"]): ReactNode => {
    if (door === "assign" || door === "decide") {
      return (
        <Button size="touch" variant={primary ? "primary" : "neutral"} onClick={() => setEditing("logistics")} data-testid="logistics-card-edit-logistics">
          {partnerName ? PARTY_COPY.changeLogistics : PARTY_COPY.assignLogistics}
        </Button>
      );
    }
    if (door === "schedule") {
      return (
        <Button size="touch" variant={primary ? "primary" : "neutral"} onClick={() => setEditing("schedule")} data-testid="logistics-card-edit-schedule">
          {PARTY_COPY.recordScheduled}
        </Button>
      );
    }
    if (door === "contact") {
      return partner && !partner.hasPortal && !facts?.link ? (
        <Button size="touch" variant={primary ? "primary" : "neutral"} disabled={acts.create.isPending} onClick={() => void createLink()} data-testid="logistics-card-create-link">
          {LINK_COPY.createLink}
        </Button>
      ) : (
        <Button size="touch" variant={primary ? "primary" : "neutral"} onClick={() => void copy(message, PARTY_COPY.copied, true)} data-testid="logistics-card-copy-message">
          {PARTY_COPY.copyMessage}
        </Button>
      );
    }
    return null;
  };

  async function createLink() {
    try {
      await acts.create.mutateAsync();
      toast.success(PARTY_COPY.linkCreatedToast);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : PARTY_COPY.failed);
    }
  }
  async function revokeLink() {
    try {
      await acts.revoke.mutateAsync();
      toast.success(PARTY_COPY.linkRevokedToast);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : PARTY_COPY.failed);
    }
  }

  const heading = partnerName ? `${LOGISTICS_COPY.heading} · ${partnerName}` : LOGISTICS_COPY.notAssigned;
  const timingTone = action?.timing === "missed" ? "text-kit-red-11" : action?.timing === "today" ? "text-kit-blue-11" : "text-kit-slate-11";

  return (
    <WorkSection
      className="shrink-0"
      data-testid="logistics-card"
      aria-label={LOGISTICS_COPY.heading}
      onKeyDown={(event) => {
        /* §5.10: Escape collapses the open card and returns focus to its heading. */
        if (event.key === "Escape" && open) {
          event.stopPropagation();
          setOpen(false);
          toggleRef.current?.focus();
        }
      }}
    >
      {/* ── COLLAPSED: at most five facts, one obvious control ───────────── */}
      <button
        type="button"
        ref={toggleRef}
        aria-expanded={open}
        aria-controls={bodyId}
        onClick={() => setOpen((v) => !v)}
        className="flex min-h-[72px] w-full min-[960px]:min-h-0 items-center gap-2 rounded-work px-3 py-[9px] text-left hover:bg-kit-slate-2 focus-visible:ring-2 focus-visible:ring-kit-blue-9 min-[960px]:items-start min-[960px]:gap-3 min-[960px]:px-4 min-[960px]:py-3"
        data-testid="logistics-card-toggle"
      >
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline justify-between gap-x-3">
            <span className={`text-[15px] font-semibold leading-5 ${partnerName ? "text-kit-slate-12" : "text-kit-amber-11"}`} data-testid="logistics-card-heading">
              {heading}
            </span>
            <span className="text-[12px] font-normal leading-4 text-kit-slate-11" data-testid="logistics-card-progress">{LOGISTICS_COPY.checks(model.doneCount)}</span>
          </div>
          {action ? (
            <div data-testid="logistics-card-action">
              <div className="text-[13px] font-semibold leading-[18px] text-kit-slate-12 min-[960px]:mt-1 min-[960px]:text-[14px] min-[960px]:leading-5">{action.act}</div>
              <div className={`text-[12px] font-normal leading-4 ${timingTone}`}>
                {[action.result, dueText(action)].filter(Boolean).join(" · ")}
              </div>
            </div>
          ) : null}
          {scheduledLine ? (
            <div className="text-[12px] leading-4 text-kit-slate-12 min-[960px]:mt-1 min-[960px]:text-body" data-testid="logistics-card-scheduled">
              {LOGISTICS_COPY.scheduled} · {scheduledLine}
            </div>
          ) : null}
          {model.exception ? (
            <div className="flex items-center gap-1 text-[12px] leading-4 text-kit-amber-11 min-[960px]:mt-1 min-[960px]:text-body" data-testid="logistics-card-exception">
              <Icon name="late" size={14} />
              <span>{model.exception}</span>
            </div>
          ) : null}
        </div>
        <span className="grid h-10 w-10 shrink-0 place-items-center text-kit-slate-11 min-[960px]:h-auto min-[960px]:w-auto min-[960px]:mt-0.5" data-testid="logistics-card-chevron"><Icon name={open ? "collapse" : "expand"} size={16} /></span>
      </button>

      {/* ── EXPANDED: eight sections in the owner's order ─────────────────── */}
      {open ? (
        <div id={bodyId} className="flex flex-col gap-2 border-t border-work-line px-3 py-2.5 min-[960px]:gap-4 min-[960px]:px-4 min-[960px]:py-4" data-testid="logistics-card-body">
          {/* 1 · Current action */}
          <section aria-label={PARTY_COPY.currentAction} className="flex flex-col gap-2">
            <SectionTitle>{PARTY_COPY.currentAction}</SectionTitle>
            {action ? (
              <>
                <div>
                  <div className="text-[13px] font-semibold leading-[18px] text-kit-slate-12 min-[960px]:text-[14px] min-[960px]:leading-5">{action.act}</div>
                  <div className={`text-[12px] font-normal leading-4 ${timingTone}`}>{[action.result, dueText(action)].filter(Boolean).join(" · ")}</div>
                </div>
                {editing === null ? (
                  <div className="flex flex-wrap items-center gap-2">
                    {doorFor(action.door)}
                    <Link className="inline-flex min-h-6 items-center gap-1 text-label text-kit-blue-11 hover:underline" to={`/operation?tab=delivery&view=all&open=${encodeURIComponent(orderId)}`}>
                      {PARTY_COPY.openInDelivery}
                      <Icon name="open" size={14} />
                    </Link>
                  </div>
                ) : null}
              </>
            ) : (
              <p className="text-body text-kit-slate-11">{PARTY_COPY.nothingToDo}</p>
            )}
            {editing === "logistics" ? (
              <div className="rounded-control border border-kit-slate-5 p-3" data-testid="logistics-card-logistics-form">
                <LogisticsDetailsEdit card={card} linkUrl={linkUrl} onDone={() => setEditing(null)} />
              </div>
            ) : null}
            {editing === "schedule" ? (
              <div className="rounded-control border border-kit-slate-5 p-3" data-testid="logistics-card-schedule-form">
                <DeliveryDatesEdit card={card} onDone={() => setEditing(null)} />
              </div>
            ) : null}
          </section>

          {/* 2 · Checks */}
          <section aria-label={PARTY_COPY.checks} className="flex flex-col gap-1.5">
            <SectionTitle>{PARTY_COPY.checks}</SectionTitle>
            <ol className="flex flex-col divide-y divide-kit-slate-4">
              {model.rows.map((row) => (
                <li key={row.key} className="flex flex-col gap-0.5 py-1.5" data-testid={`logistics-check-${row.key}`}>
                  <div className="flex items-start gap-2">
                    <StateIcon row={row} />
                    <div className="min-w-0 flex-1">
                      <div className="text-[12px] font-normal leading-4 text-kit-slate-11">
                        {row.label}
                        {row.dueIso ? ` · ${spell(row.dueIso)}` : ""}
                      </div>
                      <div className={`text-[13px] font-normal leading-[18px] ${row.state === "missed" ? "text-kit-red-11" : "text-kit-slate-12"}`}>
                        {row.state === "not_needed"
                          ? LOGISTICS_COPY.notNeeded
                          : row.fact ?? (row.dueIso ? LOGISTICS_COPY.opens(spell(row.dueIso)) : LOGISTICS_COPY.noRequested)}
                      </div>
                      {row.gaps.length > 0 ? (
                        <ul className="mt-0.5 flex flex-col gap-0.5">
                          {row.gaps.map((g) => (
                            <li key={g.fact} className="text-body text-kit-amber-11">{g.fact}</li>
                          ))}
                        </ul>
                      ) : null}
                    </div>
                  </div>
                </li>
              ))}
            </ol>
          </section>

          {/* 3 · Scheduled delivery */}
          <section aria-label={PARTY_COPY.scheduledSection} className="flex flex-col">
            <SectionTitle>{PARTY_COPY.scheduledSection}</SectionTitle>
            <Fact label={LOGISTICS_COPY.requested}>
              {card.scope.customerDeliveryIso ? spell(card.scope.customerDeliveryIso) : LOGISTICS_COPY.noRequested}
            </Fact>
            <Fact label={LOGISTICS_COPY.scheduled}>
              <span className="font-semibold">{scheduledLine ?? LOGISTICS_COPY.notScheduled}</span>
            </Fact>
            {delivered ? <Fact label={LOGISTICS_COPY.delivered}>{delivered}</Fact> : null}
          </section>

          {/* 4 · Assignment */}
          <section aria-label={PARTY_COPY.assignment} className="flex flex-col gap-1">
            <SectionTitle>{PARTY_COPY.assignment}</SectionTitle>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="text-body text-kit-slate-12">{partnerName ?? LOGISTICS_COPY.notAssigned}</div>
                {partner ? (
                  <div className="text-label text-kit-slate-11">
                    {partner.hasPortal ? PARTY_COPY.answersInPortal(partner.name) : PARTY_COPY.answersByLink(partner.name)}
                  </div>
                ) : null}
              </div>
              {editing === null ? (
                <Button size="touch" onClick={() => setEditing("logistics")} data-testid="logistics-card-assignment-edit">
                  {partnerName ? PARTY_COPY.changeLogistics : PARTY_COPY.assignLogistics}
                </Button>
              ) : null}
            </div>
          </section>

          {/* 5 · Stock route — read-only; Purchasing / Stock own it */}
          <section aria-label={PARTY_COPY.stockRoute} className="flex flex-col gap-1">
            <SectionTitle>{PARTY_COPY.stockRoute}</SectionTitle>
            {factsQ.isError ? (
              <p className="text-body text-kit-slate-11">{PARTY_COPY.failed}</p>
            ) : (facts?.routes ?? []).length === 0 ? (
              <p className="text-body text-kit-slate-11">{STOCK_ROUTE_LABEL.not_known}</p>
            ) : (
              (facts?.routes ?? []).map((route) => (
                <div key={`${route.key}-${route.place ?? ""}`} className="flex flex-col gap-0.5" data-testid={`logistics-route-${route.key}`}>
                  <div className="text-body font-semibold text-kit-slate-12">
                    {[STOCK_ROUTE_LABEL[route.key], route.place].filter(Boolean).join(" · ")}
                  </div>
                  {route.purchaseOrders.map((po) => (
                    <div key={po.poNo} className="text-label text-kit-slate-11">
                      {[
                        PARTY_COPY.poLine(po.poNo, po.supplier),
                        po.poDeliveryDate ? PARTY_COPY.poDelivery(spell(po.poDeliveryDate)) : null,
                        po.receivedDate ? PARTY_COPY.received(spell(po.receivedDate)) : PARTY_COPY.notReceived,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </div>
                  ))}
                  {route.readyUnits > 0 ? (
                    <div className="text-label text-kit-slate-11">{PARTY_COPY.readyUnits(route.readyUnits, route.place)}</div>
                  ) : null}
                </div>
              ))
            )}
            <Link className="inline-flex min-h-6 items-center gap-1 self-start text-label text-kit-blue-11 hover:underline" to="/operation/procurement">
              {PARTY_COPY.openPurchasing}
              <Icon name="open" size={14} />
            </Link>
          </section>

          {/* 6 · External link */}
          <section aria-label={LINK_COPY.heading} className="flex flex-col gap-1.5" data-testid="logistics-card-link">
            <SectionTitle>{LINK_COPY.heading}</SectionTitle>
            {!partner ? (
              <p className="text-body text-kit-slate-11">{PARTY_COPY.assignFirst}</p>
            ) : partner.hasPortal ? (
              <p className="text-body text-kit-slate-11">{PARTY_COPY.answersInPortal(partner.name)}</p>
            ) : facts?.link && linkUrl ? (
              <>
                <div className="text-body font-semibold text-kit-slate-12">{LINK_COPY.active}</div>
                <div className="break-all font-mono text-label text-kit-slate-11" data-testid="logistics-card-link-url">{linkUrl}</div>
                <div className="text-label text-kit-slate-11">
                  {LINK_COPY.created(spell(facts.link.createdAt.slice(0, 10)), facts.link.createdByName ?? "Staff identity not recorded")}
                </div>
                <div className="text-label text-kit-slate-11">
                  {facts.link.lastOpenedAt
                    ? LINK_COPY.opened(partner.name, fmtDate(facts.link.lastOpenedAt.slice(0, 10)))
                    : LINK_COPY.notOpened}
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button size="touch" icon="copy" onClick={() => void copy(linkUrl, LINK_COPY.linkCopied)} data-testid="logistics-card-copy-link">
                    {LINK_COPY.copyLink}
                  </Button>
                  <Button size="touch" disabled={acts.revoke.isPending} onClick={() => void revokeLink()} data-testid="logistics-card-revoke-link">
                    {LINK_COPY.revokeLink}
                  </Button>
                </div>
              </>
            ) : (
              <>
                <p className="text-body text-kit-slate-11">
                  {facts?.lastRevokedAt ? PARTY_COPY.linkRevoked(spell(facts.lastRevokedAt.slice(0, 10))) : LINK_COPY.none}
                </p>
                {/* One act, one button: while the current action already offers
                    `Create link`, this section states the fact and adds no twin. */}
                {action?.door === "contact" ? null : (
                  <span className="self-start">
                    <Button size="touch" disabled={acts.create.isPending} onClick={() => void createLink()} data-testid="logistics-card-create-link-section">
                      {LINK_COPY.createLink}
                    </Button>
                  </span>
                )}
              </>
            )}
          </section>

          {/* 7 · Communication — the prepared words; the channel is HOW, never proof */}
          <section aria-label={PARTY_COPY.communication} className="flex flex-col gap-1.5">
            <SectionTitle>{PARTY_COPY.communication}</SectionTitle>
            {partnerName ? (
              <>
                <pre className="whitespace-pre-wrap break-all rounded-control border border-kit-slate-5 bg-kit-slate-2 p-2 font-sans text-body text-kit-slate-12" data-testid="logistics-card-message">
                  {message}
                </pre>
                <div className="flex flex-wrap items-center gap-2">
                  <Button size="touch" icon="copy" onClick={() => void copy(message, PARTY_COPY.copied, true)}>
                    {PARTY_COPY.copyMessage}
                  </Button>
                  {partnerRow?.whatsapp_group_url ? (
                    <a className="inline-flex min-h-6 items-center gap-1 text-label text-kit-blue-11 hover:underline" href={partnerRow.whatsapp_group_url} target="_blank" rel="noreferrer">
                      <Icon name="message" size={14} />
                      {PARTY_COPY.openGroup}
                    </a>
                  ) : (
                    <span className="text-label text-kit-slate-11">{PARTY_COPY.groupNotSet}</span>
                  )}
                </div>
                <p className="text-label text-kit-slate-11">{PARTY_COPY.sentIsNotConfirmed}</p>
              </>
            ) : (
              <p className="text-body text-kit-slate-11">{PARTY_COPY.assignFirst}</p>
            )}
          </section>

          {/* 8 · Evidence and recent history */}
          <section aria-label={PARTY_COPY.history} className="flex flex-col gap-1.5">
            <SectionTitle>{PARTY_COPY.history}</SectionTitle>
            {(facts?.history ?? []).length === 0 ? (
              <p className="text-body text-kit-slate-11">{PARTY_COPY.noHistory}</p>
            ) : (
              <ol className="flex flex-col gap-2">
                {(facts?.history ?? []).map((h, i) => (
                  <li key={`${h.at}-${i}`}>
                    <div className="text-[12px] font-normal leading-4 text-kit-slate-12">{HISTORY_WORD[h.event] ?? "Activity"}</div>
                    <div className="text-[12px] font-normal leading-4 text-kit-slate-11">{[h.who, fmtDate(h.at)].filter(Boolean).join(" · ")}</div>
                    {h.detail ? (
                      <div className="text-[12px] font-normal leading-4 text-kit-slate-11">
                        {/* The API hands ISO days; the screen spells them (COPY: no ISO on screen). */}
                        {h.detail.replace(/\d{4}-\d{2}-\d{2}/g, (iso) => spell(iso))}
                      </div>
                    ) : null}
                  </li>
                ))}
              </ol>
            )}
          </section>
        </div>
      ) : null}
    </WorkSection>
  );
}

const HISTORY_WORD: Record<string, string> = {
  assigned: "Logistics assigned",
  changed: "Logistics changed",
  cleared: "Logistics removed",
  cannot_deliver: "Cannot deliver",
  arrangement_saved: "Scheduled delivery saved",
  another_date_requested: "Requested another date",
};

/**
 * THE WORK ORDER ROUTE — one compact line of mission health
 * (Workspace MASTER §5.10, owner approval 2026-09-25).
 *
 * ```
 * ORDER ROUTE                                        12 days left
 *  18 Sep     22–30 Oct     30 Oct      24 Oct      27 Oct
 *    ●──────────●─────────────○───────────◉──────────◎
 *  Proceed      PO           GRN        Contact    Delivery
 *   Done       2 of 3        0 of 3    Due today   Requested
 * Payment · RM 1,250.00 to collect by 23 Oct          ← exceptions only
 * ```
 *
 * A SUMMARY (Law B): every point is `missionRouteModel`'s reading of answers
 * other models already gave — the Logistics card's `2 working days before`
 * check (Contact), `supplierCardModel` (PO · GRN), the Sales Order's loan
 * offer (`loanOfferStateOf`) and loan Unit, and Payment's one deadline
 * (`paymentDeadlineOf`). It stores nothing and writes nothing. Each point is a
 * keyboard button that opens ONE compact detail row with its owner's door.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  MISSION_ROUTE_COPY as R,
  loanOfferStateOf,
  missionRouteModel,
  moneyAffectsDelivery,
  mytDayOf,
  myHolidaySet,
  paymentDeadlineOf,
  type MissionRoutePoint,
  type RoutePointKey,
  type RouteTone,
} from "@carres/shared";
import Button from "@/components/kit/Button";
import Icon from "@/components/kit/Icon";
import { appTodayIso, fmtDateShort } from "@/lib/fmt-date";
import { useLoanOffers } from "@/lib/queries";
import { moneyOfOrder } from "../sales-order-facts";
import { useCustomerCard } from "./CustomerCard";
import { useLogisticsModel } from "./LogisticsCard";
import { SectionTitle, TONE_TEXT } from "./PartyCardShell";
import { useSupplierCard } from "./SupplierCard";
import { WorkSection } from "./WorkCard";

/* A date never splits over two lines (§5.10). */
const spell = (iso: string) => fmtDateShort(iso).replace(" ", "\u00a0");
const RM = new Intl.NumberFormat("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const DOT: Record<RouteTone, string> = {
  done: "bg-kit-slate-12 border-kit-slate-12",
  current: "bg-kit-blue-9 border-kit-blue-9",
  attention: "bg-kit-amber-11 border-kit-amber-11",
  missed: "bg-kit-red-9 border-kit-red-9",
  future: "bg-white border-kit-slate-9",
};
const STATUS_TEXT: Record<RouteTone, string> = {
  done: TONE_TEXT.done,
  current: TONE_TEXT.current,
  attention: TONE_TEXT.attention,
  missed: TONE_TEXT.missed,
  future: TONE_TEXT.future,
};

export function useMissionRoute(orderId: string) {
  const lm = useLogisticsModel(orderId);
  const { model: supplier, factsQ } = useSupplierCard(orderId);
  const customer = useCustomerCard(orderId);
  const loansQ = useLoanOffers(orderId);
  const o = lm.o;
  const card = lm.card;
  const route = useMemo(() => {
    if (!card || !o || !lm.model) return null;
    /* Purchasing still loading → wait; Purchasing failed → the route prints
       without it (PO · GRN `Unavailable`), never a wiped line. */
    if (!supplier && !factsQ.isError) return null;
    const today = appTodayIso();
    const holidays = myHolidaySet();
    const money = moneyOfOrder(o);
    const owed = money.known ? money.outstanding : 0;
    const anchor = card.confirmedDate ?? card.scope.customerDeliveryIso ?? null;
    const outstation = lm.facts?.partner ? !lm.facts.partner.kvDefault : false;
    const loanUnits = o.ops_sofa_loans ?? [];
    const offer = loanOfferStateOf(loansQ.data?.offers ?? []);
    const loan = loanUnits.length
      ? { state: loanUnits.every((l) => l.status === "returned") ? ("returned" as const) : ("lent" as const), atIso: offer.at }
      : offer.state !== "none"
        ? { state: offer.state, atIso: offer.at }
        : null;
    return missionRouteModel({
      todayIso: today,
      proceededIso: o.proceeded_at ? mytDayOf(o.proceeded_at) : o.proceed_date ? o.proceed_date.slice(0, 10) : null,
      loan,
      supplier: supplier ?? null,
      fromStock: Boolean(supplier && supplier.total === 0 && card.stock.ready),
      contact: { dueIso: lm.model.rows[1].dueIso, state: lm.model.rows[1].state },
      requestedIso: card.scope.customerDeliveryIso ?? null,
      scheduledIso: card.confirmedDate,
      deliveredIso: o.delivered_at ? mytDayOf(o.delivered_at) : null,
      payment: {
        owedText: owed > 0 ? `RM ${RM.format(owed)}` : null,
        deadlineIso: paymentDeadlineOf({ anchorIso: anchor, outstation, holidays }),
        affects: moneyAffectsDelivery({ owed, anchorIso: anchor, todayIso: today, outstation, holidays }),
        financeHold: (o.order_finance_exceptions ?? []).some((e) => e.status === "open"),
      },
      spell,
    });
  }, [card, o, lm.model, lm.facts, supplier, factsQ.isError, loansQ.data]);
  return { route, lm, supplier, customer, factsQ, loading: lm.scope.loading || factsQ.isLoading, failed: lm.scope.failed };
}

export default function WorkOrderRoute({
  orderId,
  onOpenParty,
}: {
  orderId: string;
  onOpenParty: (party: "logistics" | "customer" | "supplier") => void;
}) {
  const { route, lm, supplier, customer, factsQ, loading, failed } = useMissionRoute(orderId);
  const [openPoint, setOpenPoint] = useState<RoutePointKey | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const currentRef = useRef<HTMLButtonElement>(null);

  /* Narrow screens: the line scrolls inside itself; the current point is
     brought into view, never the page. */
  useEffect(() => {
    const box = scrollRef.current;
    const cur = currentRef.current;
    if (!box || !cur || box.scrollWidth <= box.clientWidth) return;
    box.scrollLeft = Math.max(0, cur.offsetLeft - box.clientWidth / 2 + cur.offsetWidth / 2);
  }, [route]);

  if (loading && !route) {
    return <div className="h-[88px] shrink-0 animate-pulse rounded-work border border-work-line bg-white motion-reduce:animate-none" data-testid="work-route-loading" aria-label="Loading Order Route" />;
  }
  if (!route) {
    return (
      <WorkSection className="shrink-0 px-3 py-2 min-[960px]:px-4" data-testid="work-route">
        <SectionTitle>{R.heading}</SectionTitle>
        <p className="mt-1 text-body text-kit-slate-11">{failed ? "Some information could not be refreshed." : "Order details unavailable"}</p>
      </WorkSection>
    );
  }

  const firstCurrent = route.points.find((p) => p.tone === "current")?.key ?? null;
  const exceptions: Array<{ text: string; tone: RouteTone }> = [];
  if (route.paymentLine) exceptions.push(route.paymentLine);
  if (!lm.partnerName && !lm.o?.delivered_at) exceptions.push({ text: "Logistics not assigned", tone: "attention" });
  else if (lm.facts?.answer?.kind === "cannot_deliver" && lm.model?.exception) exceptions.push({ text: `Logistics · ${lm.model.exception}`, tone: "missed" });

  const detail = openPoint ? route.points.find((p) => p.key === openPoint) ?? null : null;

  return (
    <WorkSection className="shrink-0 px-3 py-1.5 min-[960px]:px-4" data-testid="work-route" aria-label={R.heading}>
      <div className="flex h-[14px] items-center justify-between">
        <SectionTitle>{R.heading}</SectionTitle>
        {route.header ? (
          <span className={`text-[11px] font-semibold leading-[14px] ${STATUS_TEXT[route.header.tone]}`} data-testid="work-route-header">
            {route.header.text}
          </span>
        ) : null}
      </div>
      <div ref={scrollRef} className="-mx-1 overflow-x-auto overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" data-testid="work-route-scroll">
        <ol className="relative flex h-[60px] w-full min-w-max items-stretch px-1" data-testid="work-route-line">
          {route.points.map((point, index) => (
            <li key={point.key} className="relative flex min-w-[60px] flex-1 justify-center">
              {index > 0 ? (
                <span aria-hidden="true" className={`absolute left-0 right-1/2 top-[22px] h-px ${route.points[index - 1].tone === "done" ? "bg-kit-slate-9" : "border-t border-dashed border-kit-slate-6"}`} />
              ) : null}
              {index < route.points.length - 1 ? (
                <span aria-hidden="true" className={`absolute left-1/2 right-0 top-[22px] h-px ${point.tone === "done" ? "bg-kit-slate-9" : "border-t border-dashed border-kit-slate-6"}`} />
              ) : null}
              <PointButton
                point={point}
                open={openPoint === point.key}
                refIfCurrent={point.key === firstCurrent ? currentRef : undefined}
                onClick={() => setOpenPoint((k) => (k === point.key ? null : point.key))}
              />
            </li>
          ))}
        </ol>
      </div>
      {factsQ.isError ? (
        <div className="flex flex-wrap items-center gap-2 text-[12px] leading-4 text-kit-amber-11" data-testid="work-route-supplier-failed" role="status">
          <span>Some information could not be refreshed.</span>
          <Button size="touch" onClick={() => void factsQ.refetch()}>Try again</Button>
        </div>
      ) : null}
      {exceptions.length > 0 ? (
        <ul className="mb-0.5 flex flex-col" data-testid="work-route-exceptions">
          {exceptions.map((e) => (
            <li key={e.text} className={`flex items-center gap-1 text-[12px] leading-4 ${STATUS_TEXT[e.tone]}`}>
              <Icon name="late" size={14} />
              <span>{e.text}</span>
            </li>
          ))}
        </ul>
      ) : null}
      {detail ? (
        <div id={`route-detail-${detail.key}`} className="mb-1 mt-1 flex flex-col gap-1 rounded-control bg-kit-slate-2 p-2.5" data-testid={`work-route-detail-${detail.key}`}>
          <div className="text-[12px] font-semibold leading-4 text-kit-slate-12">
            {detail.label} · {detail.status}
          </div>
          <RouteDetail point={detail} orderId={orderId} supplier={supplier} customerLine={customer.model?.status.text ?? null} logisticsLine={lm.partnerName ? [lm.partnerName, lm.model?.rows[1].fact].filter(Boolean).join(" · ") : "Logistics not assigned"} card={lm.card} onOpenParty={onOpenParty} />
        </div>
      ) : null}
    </WorkSection>
  );
}

function PointButton({
  point,
  open,
  refIfCurrent,
  onClick,
}: {
  point: MissionRoutePoint;
  open: boolean;
  refIfCurrent?: React.Ref<HTMLButtonElement>;
  onClick: () => void;
}) {
  const toneWord = point.tone === "done" ? "done" : point.tone === "current" ? "act now" : point.tone === "attention" ? "needs attention" : point.tone === "missed" ? "missed" : "not yet";
  return (
    <button
      ref={refIfCurrent}
      type="button"
      aria-expanded={open}
      aria-controls={`route-detail-${point.key}`}
      aria-label={`${point.label}${point.dateText ? ` · ${point.dateText}` : ""} · ${point.status} · ${toneWord}`}
      onClick={onClick}
      className={`relative z-[1] flex min-w-[56px] flex-col items-center rounded-control px-0.5 text-center hover:bg-kit-slate-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-kit-blue-9 ${open ? "bg-kit-slate-2" : ""}`}
      data-testid={`work-route-point-${point.key}`}
    >
      <span className={`h-4 whitespace-nowrap text-[11px] leading-4 tabular-nums ${point.final ? "font-semibold text-kit-slate-12" : "text-kit-slate-11"}`}>
        {point.dateText ?? " "}
      </span>
      <span className="flex h-3 items-center justify-center" aria-hidden="true">
        <span
          className={`grid place-items-center rounded-full border-2 ${DOT[point.tone]} ${point.final ? "h-3 w-3 ring-2 ring-offset-1 ring-kit-slate-6" : "h-2.5 w-2.5"}`}
        >
        </span>
      </span>
      <span className="h-4 whitespace-nowrap text-[12px] font-semibold leading-4 text-kit-slate-12">{point.label}</span>
      <span className={`h-4 whitespace-nowrap text-[11px] leading-4 ${STATUS_TEXT[point.tone]}`}>{point.status}</span>
    </button>
  );
}

function RouteDetail({
  point,
  orderId,
  supplier,
  customerLine,
  logisticsLine,
  card,
  onOpenParty,
}: {
  point: MissionRoutePoint;
  orderId: string;
  supplier: ReturnType<typeof useSupplierCard>["model"];
  customerLine: string | null;
  logisticsLine: string;
  card: ReturnType<typeof useLogisticsModel>["card"];
  onOpenParty: (party: "logistics" | "customer" | "supplier") => void;
}) {
  const link = (label: string, to: string) => (
    <Link className="inline-flex min-h-10 items-center gap-1 self-start text-label text-kit-blue-11 hover:underline" to={to}>
      {label}
      <Icon name="open" size={14} />
    </Link>
  );
  const partyButton = (label: string, party: "logistics" | "customer" | "supplier") => (
    <Button size="touch" onClick={() => onOpenParty(party)}>{label}</Button>
  );
  const row = (left: string, right: string, key?: string) => (
    <div key={key ?? left} className="flex flex-wrap items-baseline justify-between gap-x-3 text-[12px] leading-4">
      <span className="text-kit-slate-12">{left}</span>
      <span className="text-kit-slate-11">{right}</span>
    </div>
  );
  switch (point.key) {
    case "po":
      return (
        <>
          {(supplier?.rows ?? []).map((r) =>
            row(r.supplier ?? r.poNo, r.issued ? `${r.stateText}${r.effectiveIso ? ` · Expected ${spell(r.effectiveIso)}` : ""}` : r.stateText, r.poNo),
          )}
          <div className="flex flex-wrap gap-2">{partyButton("Open Supplier card", "supplier")}{link("Open Purchasing", "/operation/procurement")}</div>
        </>
      );
    case "grn":
      return (
        <>
          {(supplier?.rows ?? []).map((r) =>
            row(
              r.supplier ?? r.poNo,
              r.state === "received" && r.grnIso
                ? `Received ${spell(r.grnIso)}`
                : r.state === "shortReceived" && r.orderedQty != null && r.receivedQty != null
                  ? `${r.receivedQty} of ${r.orderedQty} received`
                  : "Not received yet",
              r.poNo,
            ),
          )}
          {link("Open Purchasing", "/operation/procurement")}
        </>
      );
    case "contact":
      return (
        <>
          {row("Customer", customerLine ?? "—")}
          {row("Logistics", logisticsLine)}
          <div className="flex flex-wrap gap-2">{partyButton("Open Customer card", "customer")}{partyButton("Open Logistics card", "logistics")}</div>
        </>
      );
    case "delivery":
      return (
        <>
          {row("Requested delivery", card?.scope.customerDeliveryIso ? spell(card.scope.customerDeliveryIso) : "No requested delivery date")}
          {row("Scheduled delivery", card?.confirmedDate ? spell(card.confirmedDate) : "Not scheduled yet")}
          {link("Open in Delivery", `/operation?tab=delivery&view=all&open=${encodeURIComponent(orderId)}`)}
        </>
      );
    default:
      return link("Open Sales Order", `/operation/orders/so/${encodeURIComponent(orderId)}`);
  }
}

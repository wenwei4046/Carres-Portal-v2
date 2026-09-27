/**
 * ⭐ THE ORDER PANEL — the right panel IS the order (Jess, 2026-09-26 night:
 * "order 就是那整个东西的核心"; Workspace MASTER §5.10).
 *
 *   header      SO-1362 · Delivery · 4 days left · open icon
 *   Order Route one line, every point dated (click a point: it explains itself)
 *   today's acts one ACTION card per open act on this order — the first act's
 *               message button is the panel's ONE blue; the rest go neutral
 *   the facts   Sales Order · Logistics · Customer · Supplier — collapsed, one
 *               open at a time; Owner, timing and source last (the page draws it)
 *
 * Work with no single order (a PO, a manual purchase) draws its acts and no
 * Route or cards. A FAILED order read says so; a refused one prints the owner's
 * permission words; an order outside the Operation list draws its acts only.
 */
import type { ReactNode } from "react";
import type { OperationWorkItem, PartyTone, RoutePointKey } from "@carres/shared";
import { displayCustomerName } from "@/lib/customer-name";
import { moneyOfOrder } from "../sales-order-facts";
import { OrderSheetContext, type CardFact } from "./PartyCardShell";
import { fmtDate } from "@/lib/fmt-date";
import GrnCard from "./GrnCard";
import Button from "@/components/kit/Button";
import Icon from "@/components/kit/Icon";
import { ApiError } from "@/lib/api";
import { useOperationOrders } from "@/lib/queries";
import { Link } from "react-router-dom";
import { useDeliveryScopeCard, useOrderIdFromRef } from "../delivery-scope-card";
import CustomerCard from "./CustomerCard";
import LogisticsCard, { useLogisticsModel, useLogisticsMessage } from "./LogisticsCard";
import { orderRefOf } from "./order-ref";
import SalesOrderCard from "./SalesOrderCard";
import SupplierCard, { useSupplierCard } from "./SupplierCard";
import WorkActionPanel from "./WorkActionPanel";
import StatusPill from "@/components/kit/StatusPill";
import { WorkSection } from "./WorkCard";
import WorkOrderRoute, { useMissionRoute } from "./WorkOrderRoute";

export { orderRefOf };

const RM = new Intl.NumberFormat("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const PARTIES_COPY = {
  unavailableTitle: "Order details unavailable",
  unavailableBody: "The work item still exists, but its Sales Order could not be loaded.",
  deniedTitle: "You cannot view this record",
  deniedBody: "Ask an authorised operation user for access.",
  tryAgain: "Try again",
} as const;

export type Party = "order" | "logistics" | "customer" | "supplier" | "grn";

export default function WorkParties({
  items,
  activeStep = null,
  openParty,
  onOpenParty,
  onOpenRecord = () => {},
}: {
  /** Every open act on the selected record, in list order. */
  items: OperationWorkItem[];
  /** The step the chosen act belongs to (it opens itself and is marked). */
  activeStep?: Party | null;
  openParty: Party | null;
  onOpenParty: (party: Party | null) => void;
  onOpenRecord?: () => void;
}) {
  const first = items[0]!;
  const ref = orderRefOf(first);
  const orderId = useOrderIdFromRef(ref ?? {});
  const scope = useDeliveryScopeCard(orderId);
  const ordersQ = useOperationOrders();
  const denied = ordersQ.error instanceof ApiError && ordersQ.error.status === 403;
  const acts = (
    <div className="flex flex-col gap-2" data-testid="work-acts">
      {items.map((item, i) => (
        <WorkActionPanel key={item.id} item={item} hasParties={Boolean(orderId)} primary={i === 0} onOpen={onOpenRecord} />
      ))}
    </div>
  );
  if (!ref || !orderId) return acts;
  if (denied) {
    return (
      <>
        {acts}
        <WorkSection className="shrink-0 p-3 min-[768px]:px-4" data-testid="work-mission-denied" role="status">
          <p className="text-[15px] font-semibold leading-5 text-kit-slate-12">{PARTIES_COPY.deniedTitle}</p>
          <p className="mt-0.5 text-body text-kit-slate-11">{PARTIES_COPY.deniedBody}</p>
        </WorkSection>
      </>
    );
  }
  if (!scope.card) {
    if (scope.loading) return acts;
    if (!scope.failed) return acts;
    return (
      <>
        {acts}
        <WorkSection className="shrink-0 p-3 min-[768px]:px-4" data-testid="work-mission-unavailable" role="status">
          <p className="text-[15px] font-semibold leading-5 text-kit-slate-12">{PARTIES_COPY.unavailableTitle}</p>
          <p className="mt-0.5 text-body text-kit-slate-11">{PARTIES_COPY.unavailableBody}</p>
          <div className="mt-2"><Button size="touch" onClick={() => void ordersQ.refetch()}>{PARTIES_COPY.tryAgain}</Button></div>
        </WorkSection>
      </>
    );
  }
  return <Order key={orderId} orderId={orderId} items={items} activeStep={activeStep} openParty={openParty} onOpenParty={onOpenParty} onOpenRecord={onOpenRecord} />;
}

/** THE ORDER'S HEADER, inside the Route's card (Jess, 2026-09-27: the order
 *  and its mission are one card): the number large, the customer, a pill when
 *  any act on it is missed; on the right the delivery day with the days left,
 *  and the record door. */
function OrderHeader({ orderId, label, customer, missed, deliveryWord, deliveryDate }: {
  orderId: string; label: string; customer: string | null; missed: boolean; deliveryWord: string; deliveryDate: string | null;
}) {
  const { route } = useMissionRoute(orderId);
  const tone = route?.header?.tone === "missed" ? "font-semibold text-danger" : "text-kit-slate-11";
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1" data-testid="work-mission-header">
      <h2 className="text-[20px] font-semibold leading-[26px] text-kit-slate-12" data-testid="work-mission-title">{label}</h2>
      {customer ? <span className="text-[14px] leading-5 text-kit-slate-11">{customer}</span> : null}
      {missed ? <StatusPill tone="danger">Missed</StatusPill> : null}
      <span className="ml-auto text-[13px] leading-[18px] text-kit-slate-12" data-testid="work-mission-status">
        {deliveryDate ? <>{deliveryWord} <span className="font-semibold">{deliveryDate}</span></> : "No delivery date"}
        {route?.header ? <span className={tone}>{` · ${route.header.text}`}</span> : null}
      </span>
      <Link
        to={`/operation/orders/so/${encodeURIComponent(orderId)}`}
        className="grid h-8 w-8 place-items-center rounded-control text-kit-slate-11 hover:bg-kit-slate-3 hover:text-kit-slate-12"
        aria-label={`Open ${label}`}
        title={`Open ${label}`}
        data-testid="work-mission-open"
      >
        <Icon name="open" size={16} />
      </Link>
    </div>
  );
}

function Order({ orderId, items, activeStep, openParty, onOpenParty, onOpenRecord }: {
  orderId: string; items: OperationWorkItem[]; activeStep: Party | null; openParty: Party | null; onOpenParty: (party: Party | null) => void; onOpenRecord: () => void;
}) {
  const lm = useLogisticsModel(orderId);
  const logisticsMessage = useLogisticsMessage(orderId);
  const supplier = useSupplierCard(orderId);
  const { route } = useMissionRoute(orderId);
  const first = items[0]!;
  const toggle = (party: Party) => (open: boolean) => onOpenParty(open ? party : null);
  const reference = (lm.o?.source_ref ?? []).filter(Boolean).join(" · ") || null;
  /* ⭐ EVERY CARD TALLIES A ROUTE STEP (Jess, 2026-09-27): the row's third
     segment repeats that step's date and status word from the Route. */
  const point = (key: RoutePointKey) => route?.points.find((p) => p.key === key) ?? null;
  const pillOf = (key: RoutePointKey) => { const pt = point(key); return pt ? { text: pt.status, tone: pt.tone as PartyTone } : null; };
  const dateOf = (key: RoutePointKey) => point(key)?.dateText ?? null;
  const o = lm.o;
  const customerName = o ? displayCustomerName(o.customer_name) || "Name not recorded" : null;
  const customerPhone = (o?.customer_phone ?? "").trim() || null;
  const customerDate = lm.card?.scope.customerDeliveryIso ? fmtDate(lm.card.scope.customerDeliveryIso) : null;
  const money = o ? moneyOfOrder(o) : null;
  const owed = Boolean(money?.known && money.outstanding > 0);
  const balanceText = !money?.known ? "Value not recorded" : owed ? `RM ${RM.format(money.outstanding)} · not paid${route?.paymentLine?.deadlineText ? ` · by ${route.paymentLine.deadlineText}` : ""}` : "RM 0.00 · paid";
  const supplierNames = [...new Set((supplier.model?.rows ?? []).map((r) => r.supplier).filter(Boolean))] as string[];
  const deliverTo = (supplier.model?.rows ?? []).map((r) => r.deliverTo).find(Boolean) ?? null;
  const fact = (icon: CardFact["icon"], text: ReactNode | null, tone?: CardFact["tone"]): CardFact[] => (text ? [{ icon, text, tone }] : []);
  /* The order's acts land on their step: delivery acts on Contact ·
     Logistics (the message button), every other act on the Sales Order row
     (its door). The FIRST act's button is the panel's ONE blue. */
  const deliveryActs = items.filter((i) => i.module === "delivery" && i.ruleKey !== "check_delivery_proof");
  const orderActs = items.filter((i) => !deliveryActs.includes(i));
  const blueOn: "logistics" | "order" = deliveryActs.includes(first) ? "logistics" : "order";
  const actLine = (i: OperationWorkItem) => ({
    text: [i.action, i.recipient && !i.action.includes(i.recipient) ? i.recipient : null, i.timing.actionOn ? `due ${fmtDate(i.timing.actionOn)}` : null].filter(Boolean).join(" · "),
    missed: i.timing.placement === "missed",
  });
  return (
    <OrderSheetContext.Provider value>
    <div className="flex flex-col divide-y divide-kit-slate-4 border-b border-kit-slate-4 bg-white [&>section]:rounded-none [&>section]:border-0" data-testid="work-parties">
      <WorkOrderRoute
        orderId={orderId}
        title={null}
        onOpenParty={(party) => onOpenParty(party)}
        header={(
          <OrderHeader
            orderId={orderId}
            label={first.object.label}
            customer={customerName}
            missed={items.some((i) => i.timing.placement === "missed")}
            deliveryWord={lm.card?.confirmedDate ? "Scheduled delivery" : "Requested delivery"}
            deliveryDate={lm.card?.confirmedDate ? fmtDate(lm.card.confirmedDate) : customerDate}
          />
        )}
      />
      <SalesOrderCard
        orderId={orderId}
        heading="Proceed · Sales Order" active={activeStep === "order"}
        pill={pillOf("proceed")}
        facts={[...fact("customer", customerName), ...fact("call", customerPhone), ...fact("date", customerDate), ...fact("money", balanceText, owed ? "danger" : undefined)]}
        act={orderActs[0] ? actLine(orderActs[0]) : null}
        trailing={orderActs[0] ? <Button size="touch" variant={blueOn === "order" ? "primary" : "neutral"} onClick={onOpenRecord} data-testid="work-order-act-door">Open {first.object.label}</Button> : null}
        open={openParty === "order"}
        onToggle={toggle("order")}
      />
      <SupplierCard orderId={orderId} reference={reference} heading="PO · Supplier" active={activeStep === "supplier"} pill={pillOf("po")} facts={[...fact("supplier", supplierNames.join(" · ") || null), ...fact("date", dateOf("po"))]} open={openParty === "supplier"} onToggle={toggle("supplier")} primary={false} />
      <GrnCard orderId={orderId} heading="GRN · Warehouse" active={activeStep === "grn"} pill={pillOf("grn")} facts={[...fact("warehouse", deliverTo), ...fact("date", dateOf("grn"))]} open={openParty === "grn"} onToggle={toggle("grn")} />
      <div id={`party-logistics-${orderId}`} className="scroll-mt-2 [&>section]:rounded-none [&>section]:border-0">
        <LogisticsCard
          orderId={orderId}
          heading="Contact · Logistics" active={activeStep === "logistics"}
          pill={pillOf("contact")}
          facts={[...fact("delivery", lm.partnerName ?? "Logistics not assigned"), ...fact("ready", lm.model ? `Checks ${lm.model.doneCount} of 3` : null), ...fact("date", dateOf("contact"))]}
          communicationInPane
          communication={logisticsMessage}
          open={openParty === "logistics"}
          onToggle={toggle("logistics")}
          primary={false}
          moneyOnBalance
        />
      </div>
      <CustomerCard orderId={orderId} heading="Delivery · Customer" active={activeStep === "customer"} pill={pillOf("delivery")} facts={[...fact("customer", customerName), ...fact("call", customerPhone), ...fact("date", dateOf("delivery"))]} open={openParty === "customer"} onToggle={toggle("customer")} primary={false} />
    </div>
    </OrderSheetContext.Provider>
  );
}

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
import type { OperationWorkItem, RoutePointKey } from "@carres/shared";
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
import { WORK_MODULE_WORD } from "./module-word";
import { orderRefOf } from "./order-ref";
import SalesOrderCard from "./SalesOrderCard";
import SupplierCard from "./SupplierCard";
import WorkActionPanel from "./WorkActionPanel";
import { WorkSection } from "./WorkCard";
import WorkOrderRoute, { useMissionRoute } from "./WorkOrderRoute";

export { orderRefOf };

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
  openParty,
  onOpenParty,
  onOpenRecord = () => {},
}: {
  /** Every open act on the selected record, in list order. */
  items: OperationWorkItem[];
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
  return <Order key={orderId} orderId={orderId} items={items} openParty={openParty} onOpenParty={onOpenParty} onOpenRecord={onOpenRecord} />;
}

/** THE ORDER'S HEADER: the number as the title, the module of its first act,
 *  the Route's status word and the record door — a Gmail subject line. */
function OrderHeader({ orderId, label, module }: { orderId: string; label: string; module: string }) {
  const { route } = useMissionRoute(orderId);
  return (
    <div className="flex items-center gap-2 px-1 pb-1" data-testid="work-mission-header">
      <h2 className="text-[15px] font-semibold leading-5 text-kit-slate-12" data-testid="work-mission-title">{label}</h2>
      <span className="text-[13px] leading-[18px] text-kit-slate-11">{module}</span>
      <span className="ml-auto text-[12px] leading-4 text-kit-slate-11" data-testid="work-mission-status">{route?.header?.text ?? ""}</span>
      <Link
        to={`/operation/orders/so/${encodeURIComponent(orderId)}`}
        className="grid h-7 w-7 place-items-center rounded-control text-kit-slate-11 hover:bg-kit-slate-3 hover:text-kit-slate-12"
        aria-label={`Open ${label}`}
        title={`Open ${label}`}
        data-testid="work-mission-open"
      >
        <Icon name="open" size={14} />
      </Link>
    </div>
  );
}

function Order({ orderId, items, openParty, onOpenParty, onOpenRecord }: {
  orderId: string; items: OperationWorkItem[]; openParty: Party | null; onOpenParty: (party: Party | null) => void; onOpenRecord: () => void;
}) {
  const lm = useLogisticsModel(orderId);
  const logisticsMessage = useLogisticsMessage(orderId);
  const { route } = useMissionRoute(orderId);
  const first = items[0]!;
  const toggle = (party: Party) => (open: boolean) => onOpenParty(open ? party : null);
  const reference = (lm.o?.source_ref ?? []).filter(Boolean).join(" · ") || null;
  /* ⭐ EVERY CARD TALLIES A ROUTE STEP (Jess, 2026-09-27): the row's third
     segment repeats that step's date and status word from the Route. */
  const step = (key: RoutePointKey): ReactNode => {
    const point = route?.points.find((p) => p.key === key);
    if (!point) return null;
    return <span className="whitespace-nowrap text-[12px] leading-4 text-kit-slate-11" data-testid={`work-step-${key}`}>{[point.dateText, point.status].filter(Boolean).join(" · ")}</span>;
  };
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
  const chat = logisticsMessage?.href ? (
    <a
      href={logisticsMessage.href}
      target="_blank"
      rel="noreferrer"
      className={`inline-flex h-9 items-center gap-1.5 whitespace-nowrap rounded-control px-3 text-[13px] font-semibold leading-[18px] ${blueOn === "logistics" && deliveryActs.length > 0 ? "bg-kit-blue-9 text-white hover:bg-kit-blue-10" : "border border-kit-slate-4 bg-white text-kit-slate-12 hover:bg-kit-slate-3"}`}
      data-testid="work-logistics-chat"
    >
      <Icon name="message" size={14} />
      Open WhatsApp group
    </a>
  ) : null;
  return (
    <div className="flex flex-col gap-2" data-testid="work-parties">
      <OrderHeader orderId={orderId} label={first.object.label} module={WORK_MODULE_WORD[first.module]} />
      <WorkOrderRoute orderId={orderId} title={null} onOpenParty={(party) => onOpenParty(party)} />
      <SalesOrderCard
        orderId={orderId}
        heading="Proceed · Sales Order"
        act={orderActs[0] ? actLine(orderActs[0]) : null}
        trailing={<>{step("proceed")}{orderActs[0] ? <Button size="touch" variant={blueOn === "order" ? "primary" : "neutral"} onClick={onOpenRecord} data-testid="work-order-act-door">Open {first.object.label}</Button> : null}</>}
        open={openParty === "order"}
        onToggle={toggle("order")}
      />
      <SupplierCard orderId={orderId} reference={reference} heading="PO · Supplier" trailing={step("po")} open={openParty === "supplier"} onToggle={toggle("supplier")} primary={false} />
      <GrnCard orderId={orderId} heading="GRN · Warehouse" trailing={step("grn")} open={openParty === "grn"} onToggle={toggle("grn")} />
      <div id={`party-logistics-${orderId}`} className="scroll-mt-2">
        <LogisticsCard
          orderId={orderId}
          heading="Contact · Logistics"
          trailing={<>{step("contact")}{chat}</>}
          communication={logisticsMessage}
          open={openParty === "logistics"}
          onToggle={toggle("logistics")}
          primary={false}
          moneyOnBalance
        />
      </div>
      <CustomerCard orderId={orderId} heading="Delivery · Customer" trailing={step("delivery")} open={openParty === "customer"} onToggle={toggle("customer")} primary={false} />
    </div>
  );
}

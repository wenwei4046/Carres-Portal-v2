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
import type { OperationWorkItem } from "@carres/shared";
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

export type Party = "order" | "logistics" | "customer" | "supplier";

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
  const first = items[0]!;
  const toggle = (party: Party) => (open: boolean) => onOpenParty(open ? party : null);
  const reference = (lm.o?.source_ref ?? []).filter(Boolean).join(" · ") || null;
  return (
    <div className="flex flex-col gap-2" data-testid="work-parties">
      <OrderHeader orderId={orderId} label={first.object.label} module={WORK_MODULE_WORD[first.module]} />
      <WorkOrderRoute orderId={orderId} title={null} onOpenParty={(party) => onOpenParty(party)} />
      <div className="flex flex-col gap-2" data-testid="work-acts">
        {items.map((item, i) => (
          <WorkActionPanel
            key={item.id}
            item={item}
            hasParties
            primary={i === 0}
            communication={item.module === "delivery" && item.ruleKey !== "check_delivery_proof" ? logisticsMessage : null}
            onOpen={onOpenRecord}
          />
        ))}
      </div>
      <SalesOrderCard orderId={orderId} open={openParty === "order"} onToggle={toggle("order")} />
      <div id={`party-logistics-${orderId}`} className="scroll-mt-2">
        <LogisticsCard orderId={orderId} open={openParty === "logistics"} onToggle={toggle("logistics")} primary={false} moneyOnBalance />
      </div>
      <CustomerCard orderId={orderId} open={openParty === "customer"} onToggle={toggle("customer")} primary={false} />
      <SupplierCard orderId={orderId} reference={reference} open={openParty === "supplier"} onToggle={toggle("supplier")} primary={false} />
    </div>
  );
}

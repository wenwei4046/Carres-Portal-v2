/**
 * THE SELECTED MISSION — the right panel below the Work summary
 * (Workspace MASTER §5.10, owner approval 2026-09-25):
 *
 *   Order Route → Logistics → Customer → Supplier
 *
 * It appears only when the selected work names exactly ONE Sales Order: a
 * purchase order that serves many orders has no single customer. A FAILED
 * read says so (`Order details unavailable`); a refused one prints the owner's
 * permission words; an order simply outside the Operation list draws nothing —
 * never a guessed `Logistics not assigned`.
 *
 * Two panel laws live here because they span the cards:
 *   · ONE card open at a time (the page holds which one, so the summary can
 *     open a card too); the open card survives a save or a refresh;
 *   · ONE visible blue — the most urgent party's act (missed → due today →
 *     the selected work's party → future). While every card is collapsed the
 *     summary carries it as a button that opens that card; once a card with an
 *     act is open, the blue sits in that card.
 */
import { useEffect, useMemo } from "react";
import type { OperationWorkItem } from "@carres/shared";
import Button from "@/components/kit/Button";
import { ApiError } from "@/lib/api";
import { useOperationOrders } from "@/lib/queries";
import { useDeliveryScopeCard, useOrderIdFromRef } from "../delivery-scope-card";
import CustomerCard, { useCustomerCard } from "./CustomerCard";
import LogisticsCard, { useLogisticsModel, useLogisticsMessage } from "./LogisticsCard";
import WorkActionPanel from "./WorkActionPanel";
import SupplierCard, { supplierActRowOf, useSupplierCard } from "./SupplierCard";
import WorkOrderRoute, { useMissionRoute } from "./WorkOrderRoute";
import { Link } from "react-router-dom";
import Icon from "@/components/kit/Icon";
import SalesOrderCard from "./SalesOrderCard";
import { WORK_MODULE_WORD } from "./module-word";
import { orderRefOf } from "./order-ref";
import { WorkSection } from "./WorkCard";

export { orderRefOf };

export const PARTIES_COPY = {
  unavailableTitle: "Order details unavailable",
  unavailableBody: "The work item still exists, but its Sales Order could not be loaded.",
  deniedTitle: "You cannot view this record",
  deniedBody: "Ask an authorised operation user for access.",
  tryAgain: "Try again",
  openSupplierCard: "Open Supplier card",
} as const;

export type Party = "order" | "logistics" | "customer" | "supplier";
/** The parties that can carry an act (the Sales Order card is facts only). */
export type ActParty = Exclude<Party, "order">;

/** What the page learns from the mission: whether party cards are showing
 *  (the summary then leaves the result to them) and the one act to offer. */
export interface MissionReport {
  shown: boolean;
  act: { party: ActParty; label: string } | null;
  /** The open card has an act of its own — it then holds the blue. */
  openCardHasAct: boolean;
}

/** Which party card the selected work itself belongs to. */
function partyOfWork(item: OperationWorkItem): ActParty | null {
  if (item.module === "purchasing" || item.module === "receiving") return "supplier";
  if (item.ruleKey === "ask_delivery_date") return "customer";
  if (item.module === "delivery") return "logistics";
  return null;
}

type Timing = "ahead" | "today" | "missed" | "no_date" | null;
const RANK: Record<string, number> = { missed: 0, today: 1, ahead: 3, no_date: 4 };

/** The ONE blue action: missed → today → the selected work's party → future. */
export function primaryPartyOf(candidates: Record<ActParty, Timing>, selected: ActParty | null): ActParty | null {
  let best: ActParty | null = null;
  let bestRank = Number.POSITIVE_INFINITY;
  for (const party of ["logistics", "customer", "supplier"] as ActParty[]) {
    const timing = candidates[party];
    if (!timing) continue;
    let rank = RANK[timing] ?? 5;
    if (rank >= 2 && party === selected) rank = 2;
    if (rank < bestRank) {
      best = party;
      bestRank = rank;
    }
  }
  return best;
}

export default function WorkParties({
  item,
  openParty,
  onOpenParty,
  onReport,
  onOpenRecord = () => {},
}: {
  item: OperationWorkItem;
  openParty: Party | null;
  onOpenParty: (party: Party | null) => void;
  onReport?: (report: MissionReport) => void;
  /** The `Open {object}` door of the ACTION card. */
  onOpenRecord?: () => void;
}) {
  const ref = orderRefOf(item);
  const orderId = useOrderIdFromRef(ref ?? {});
  const scope = useDeliveryScopeCard(orderId);
  const ordersQ = useOperationOrders();
  const denied = ordersQ.error instanceof ApiError && ordersQ.error.status === 403;
  const ready = Boolean(ref && orderId && scope.card);

  useEffect(() => {
    if (!ready) onReport?.({ shown: false, act: null, openCardHasAct: false });
  }, [ready, onReport]);

  if (!ref) return null;
  if (denied) {
    return (
      <WorkSection className="shrink-0 p-3 min-[768px]:px-4" data-testid="work-mission-denied" role="status">
        <p className="text-[15px] font-semibold leading-5 text-kit-slate-12">{PARTIES_COPY.deniedTitle}</p>
        <p className="mt-0.5 text-body text-kit-slate-11">{PARTIES_COPY.deniedBody}</p>
      </WorkSection>
    );
  }
  if (!ready) {
    if (scope.loading || (!orderId && ordersQ.isLoading)) {
      /* Skeletons at the final geometry: the 88px route and three 72px cards. */
      return (
        <div className="flex flex-col gap-2" data-testid="work-mission-loading" aria-label="Loading the mission" role="status">
          <div className="h-[88px] animate-pulse rounded-work border border-work-line bg-white motion-reduce:animate-none" />
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-[72px] animate-pulse rounded-work border border-work-line bg-white motion-reduce:animate-none" />
          ))}
        </div>
      );
    }
    if (!scope.failed) return null;
    return (
      <WorkSection className="shrink-0 p-3 min-[768px]:px-4" data-testid="work-mission-unavailable" role="status">
        <p className="text-[15px] font-semibold leading-5 text-kit-slate-12">{PARTIES_COPY.unavailableTitle}</p>
        <p className="mt-0.5 text-body text-kit-slate-11">{PARTIES_COPY.unavailableBody}</p>
        <div className="mt-2">
          <Button size="touch" onClick={() => void ordersQ.refetch()}>{PARTIES_COPY.tryAgain}</Button>
        </div>
      </WorkSection>
    );
  }
  return <Mission key={orderId as string} orderId={orderId as string} item={item} openParty={openParty} onOpenParty={onOpenParty} onReport={onReport} onOpenRecord={onOpenRecord} />;
}

/** THE RIGHT PANEL'S HEADER (Jess, 2026-09-26): the order number as the
 *  title, its module beside it, the route's status word and the record door
 *  on the right — a Gmail subject line, not a section label. */
function MissionHeader({ orderId, label, module }: { orderId: string; label: string; module: string }) {
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

function Mission({
  orderId,
  item,
  openParty,
  onOpenParty,
  onReport,
  onOpenRecord,
}: {
  orderId: string;
  item: OperationWorkItem;
  openParty: Party | null;
  onOpenParty: (party: Party | null) => void;
  onReport?: (report: MissionReport) => void;
  onOpenRecord: () => void;
}) {
  const lm = useLogisticsModel(orderId);
  /* The owning module's prepared message for the ACTION card: Delivery's
     logistics message for delivery work; other rules bring their own later. */
  const logisticsMessage = useLogisticsMessage(orderId);
  const communication = item.module === "delivery" && item.ruleKey !== "check_delivery_proof" ? logisticsMessage : null;
  const customer = useCustomerCard(orderId);
  const supplier = useSupplierCard(orderId);
  const embedded = item.interaction.mode === "embedded";

  /* The supplier competes for the blue only with a row that draws a button —
     the same predicate the card uses (`supplierActRowOf`). */
  const actRow = supplier.model ? supplierActRowOf(supplier.model.rows) : null;
  const supplierTiming: Timing = actRow
    ? actRow.tone === "missed" ? "missed" : actRow.tone === "current" ? "today" : "ahead"
    : (supplier.model?.needPoCount ?? 0) > 0 ? "ahead" : null;
  const logisticsAct = lm.model?.currentAction ?? null;
  const customerAct = customer.model?.action ?? null;
  const primary = embedded
    ? null
    : primaryPartyOf(
        {
          logistics: logisticsAct ? logisticsAct.timing : null,
          customer: customerAct ? customerAct.timing : null,
          supplier: supplierTiming,
        },
        partyOfWork(item),
      );

  const openHasAct =
    openParty === "logistics" ? Boolean(logisticsAct)
    : openParty === "customer" ? Boolean(customerAct)
    : openParty === "supplier" ? actRow !== null || (supplier.model?.needPoCount ?? 0) > 0
    : false;

  const act = useMemo<MissionReport["act"]>(() => {
    if (!primary) return null;
    const label =
      primary === "logistics" ? logisticsAct?.act
      : primary === "customer" ? customerAct?.act
      : PARTIES_COPY.openSupplierCard;
    return label ? { party: primary, label } : null;
  }, [primary, logisticsAct?.act, customerAct?.act]);

  const openCardHasAct = Boolean(openParty && openHasAct && !embedded);
  useEffect(() => {
    onReport?.({ shown: true, act, openCardHasAct });
  }, [onReport, act?.party, act?.label, openCardHasAct]); // eslint-disable-line react-hooks/exhaustive-deps

  /* Opening a card (from the Route or the summary) brings it into view. */
  useEffect(() => {
    if (!openParty) return;
    document.getElementById(`party-${openParty}-${orderId}`)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [openParty, orderId]);

  const toggle = (party: Party) => (open: boolean) => onOpenParty(open ? party : null);
  const reference = (lm.o?.source_ref ?? []).filter(Boolean).join(" · ") || null;

  return (
    <div className="flex flex-col gap-2" data-testid="work-parties">
      {/* DO, then LOOK (Jess, 2026-09-26 evening): the ACTION card first —
          buttons live only there — then the order's header, its Route, and
          the information cards, every one collapsed until clicked. */}
      <WorkActionPanel
        item={item}
        hasParties
        communication={communication}
        primaryAct={!communication && act && !embedded ? { label: act.label, onClick: () => onOpenParty(act.party) } : null}
        onOpen={onOpenRecord}
      />
      <MissionHeader orderId={orderId} label={item.object.label} module={WORK_MODULE_WORD[item.module]} />
      <WorkOrderRoute orderId={orderId} title={null} onOpenParty={(party) => onOpenParty(party)} />
      <SalesOrderCard orderId={orderId} open={openParty === "order"} onToggle={toggle("order")} />
      <div id={`party-logistics-${orderId}`} className="scroll-mt-2">
        <LogisticsCard orderId={orderId} open={openParty === "logistics"} onToggle={toggle("logistics")} primary={false} moneyOnBalance />
      </div>
      <CustomerCard orderId={orderId} open={openParty === "customer"} onToggle={toggle("customer")} primary={false} />
      <SupplierCard orderId={orderId} reference={reference} open={openParty === "supplier"} onToggle={toggle("supplier")} primary={false} />
    </div>
  );
}

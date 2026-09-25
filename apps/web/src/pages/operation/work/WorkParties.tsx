/**
 * THE SELECTED MISSION — the right panel below the Work summary
 * (Workspace MASTER §5.10, owner approval 2026-09-25):
 *
 *   Order Route → Logistics → Customer → Supplier
 *
 * It appears only when the selected work names exactly ONE Sales Order: a
 * purchase order that serves many orders has no single customer. An order the
 * panel cannot read says so (`Order details unavailable`) — never a guessed
 * `Logistics not assigned`.
 *
 * Two panel laws live here because they span the cards:
 *   · ONE card open at a time — opening one collapses the others; the open
 *     card survives a save or a refresh of the same order;
 *   · ONE blue action across the panel — missed first, then due today, then
 *     the selected work's own party, then a future follow-up.
 */
import { useEffect, useState } from "react";
import type { OperationWorkItem } from "@carres/shared";
import Button from "@/components/kit/Button";
import { useDeliveryScopeCard, useOrderIdFromRef } from "../delivery-scope-card";
import CustomerCard, { useCustomerCard } from "./CustomerCard";
import LogisticsCard, { useLogisticsModel } from "./LogisticsCard";
import SupplierCard, { useSupplierCard } from "./SupplierCard";
import WorkOrderRoute from "./WorkOrderRoute";
import { orderRefOf } from "./order-ref";

export { orderRefOf };
import { WorkSection } from "./WorkCard";

export const PARTIES_COPY = {
  unavailableTitle: "Order details unavailable",
  unavailableBody: "The work item still exists, but its Sales Order could not be loaded.",
  tryAgain: "Try again",
} as const;

type Party = "logistics" | "customer" | "supplier";

/** Which party card the selected work itself belongs to. */
function partyOfWork(item: OperationWorkItem): Party | null {
  if (item.module === "purchasing" || item.module === "receiving") return "supplier";
  if (item.ruleKey === "ask_delivery_date") return "customer";
  if (item.module === "delivery") return "logistics";
  return null;
}

type Timing = "ahead" | "today" | "missed" | "no_date" | null;
const RANK: Record<string, number> = { missed: 0, today: 1, ahead: 3, no_date: 4 };

/** The ONE blue action: missed → today → the selected work's party → future. */
export function primaryPartyOf(candidates: Record<Party, Timing>, selected: Party | null): Party | null {
  let best: Party | null = null;
  let bestRank = Number.POSITIVE_INFINITY;
  for (const party of ["logistics", "customer", "supplier"] as Party[]) {
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

export default function WorkParties({ item }: { item: OperationWorkItem }) {
  const ref = orderRefOf(item);
  const orderId = useOrderIdFromRef(ref ?? {});
  const scope = useDeliveryScopeCard(orderId);
  if (!ref) return null;
  if (!orderId || (!scope.card && !scope.loading)) {
    /* A FAILED read says so; an order simply outside the Operation list
       (the latest 500) draws nothing — never a guessed party state. */
    if (scope.loading || !scope.failed) return null;
    return (
      <WorkSection className="shrink-0 p-3 min-[960px]:px-4" data-testid="work-mission-unavailable" role="status">
        <p className="text-[15px] font-semibold leading-5 text-kit-slate-12">{PARTIES_COPY.unavailableTitle}</p>
        <p className="mt-0.5 text-body text-kit-slate-11">{PARTIES_COPY.unavailableBody}</p>
        <div className="mt-2">
          <Button size="touch" onClick={() => window.location.reload()}>{PARTIES_COPY.tryAgain}</Button>
        </div>
      </WorkSection>
    );
  }
  /* Keyed by order: a new mission starts with every card collapsed. */
  return <Mission key={orderId} orderId={orderId} item={item} />;
}

function Mission({ orderId, item }: { orderId: string; item: OperationWorkItem }) {
  const [openParty, setOpenParty] = useState<Party | null>(null);
  const lm = useLogisticsModel(orderId);
  const customer = useCustomerCard(orderId);
  const supplier = useSupplierCard(orderId);
  const embedded = item.interaction.mode === "embedded";

  const rows = supplier.model?.rows ?? [];
  const supplierTiming: Timing = rows.some((r) => r.tone === "missed")
    ? "missed"
    : rows.some((r) => r.tone === "current")
      ? "today"
      : rows.some((r) => r.tone === "attention")
        ? "ahead"
        : null;
  const primary = embedded
    ? null
    : primaryPartyOf(
        {
          logistics: lm.model?.currentAction ? lm.model.currentAction.timing : null,
          customer: customer.model?.action ? customer.model.action.timing : null,
          supplier: supplierTiming,
        },
        partyOfWork(item),
      );

  /* The ONE blue belongs to the most urgent party — unless the operator opened
     another card that has an act of its own: then the blue sits on the card
     in front of them, so exactly one blue is always visible. */
  const openHasAct =
    openParty === "logistics" ? Boolean(lm.model?.currentAction)
    : openParty === "customer" ? true // Record reply is always an act
    : openParty === "supplier" ? supplierTiming !== null
    : false;
  const visiblePrimary = !embedded && openParty && openParty !== primary && openHasAct ? openParty : primary;

  /* Opening a card from the Route brings it into view. */
  const [scrollTo, setScrollTo] = useState<Party | null>(null);
  useEffect(() => {
    if (!scrollTo) return;
    document.getElementById(`party-${scrollTo}-${orderId}`)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    setScrollTo(null);
  }, [scrollTo, orderId]);

  const toggle = (party: Party) => (open: boolean) => setOpenParty(open ? party : null);
  const reference = (lm.o?.source_ref ?? []).filter(Boolean).join(" · ") || null;

  return (
    <div className="flex flex-col gap-2" data-testid="work-parties">
      <WorkOrderRoute
        orderId={orderId}
        onOpenParty={(party) => {
          setOpenParty(party);
          setScrollTo(party);
        }}
      />
      <div id={`party-logistics-${orderId}`} className="scroll-mt-2">
        <LogisticsCard orderId={orderId} open={openParty === "logistics"} onToggle={toggle("logistics")} primary={visiblePrimary === "logistics"} />
      </div>
      <CustomerCard orderId={orderId} open={openParty === "customer"} onToggle={toggle("customer")} primary={visiblePrimary === "customer"} />
      <SupplierCard orderId={orderId} reference={reference} open={openParty === "supplier"} onToggle={toggle("supplier")} primary={visiblePrimary === "supplier"} />
    </div>
  );
}

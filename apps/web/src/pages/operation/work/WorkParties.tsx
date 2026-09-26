/**
 * THE SELECTED WORK — Work is an INBOX (owner ruling B, Jess 2026-09-26 night:
 * "Work helps me do the thing, not see the whole order").
 *
 * The right panel is the ACTION card and nothing else: what to do, why, what
 * finishes it, the owning module's prepared message with its one button, and
 * the door to the record. The whole-order view — Route, customer, supplier,
 * money, logistics — lives on the Sales Order page behind that door; Work
 * does not draw it a second time. The party-card components stay in this
 * folder for the pages that own them.
 *
 * For delivery work the message is Delivery's own logistics message
 * (`useLogisticsMessage`); other rules bring their own message when their
 * module admits one (§5.2 COMMUNICATION) — until then the card has no
 * COMMUNICATION block and `Open {object}` is the act.
 */
import type { OperationWorkItem } from "@carres/shared";
import { useOrderIdFromRef } from "../delivery-scope-card";
import { useLogisticsMessage } from "./LogisticsCard";
import WorkActionPanel from "./WorkActionPanel";
import { orderRefOf } from "./order-ref";

export { orderRefOf };

export default function WorkParties({
  item,
  onOpenRecord = () => {},
}: {
  item: OperationWorkItem;
  /** The `Open {object}` door of the ACTION card. */
  onOpenRecord?: () => void;
}) {
  const ref = orderRefOf(item);
  const orderId = useOrderIdFromRef(ref ?? {});
  if (!orderId) return <WorkActionPanel item={item} onOpen={onOpenRecord} />;
  return <Mission key={orderId} orderId={orderId} item={item} onOpenRecord={onOpenRecord} />;
}

function Mission({ orderId, item, onOpenRecord }: { orderId: string; item: OperationWorkItem; onOpenRecord: () => void }) {
  const logisticsMessage = useLogisticsMessage(orderId);
  const communication = item.module === "delivery" && item.ruleKey !== "check_delivery_proof" ? logisticsMessage : null;
  return <WorkActionPanel item={item} communication={communication} onOpen={onOpenRecord} />;
}

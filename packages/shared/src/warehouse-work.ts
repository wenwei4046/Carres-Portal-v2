import { countWorkingDays } from "./working-days";
import { operationWorkItemSchema, operationWorkStableId, type OperationWorkItem } from "./operation-work";
import { WAREHOUSE_OFF_DAYS, type WarehouseOutboundCard } from "./warehouse-outbound";

export interface WarehouseOutboundAssignment {
  deliveryOrderId: string;
  siteId: string;
  userId: string;
  name: string | null;
}

export function projectWarehouseOutboundWork(input: {
  cards: readonly WarehouseOutboundCard[];
  site: { id: string; label: string };
  assignments: readonly WarehouseOutboundAssignment[];
  today: string;
  destination?: "warehouse" | "operation";
}): OperationWorkItem[] {
  const assignmentByScope = new Map(
    input.assignments.map((a) => [`${a.deliveryOrderId}:${a.siteId}`, a]),
  );
  return input.cards.flatMap((card) => {
    if (!card.deliveryOrderId || card.warehouseSiteId !== input.site.id || card.notHandedOver === 0) return [];
    const accepted = assignmentByScope.get(`${card.deliveryOrderId}:${input.site.id}`) ?? null;
    const recipient = card.driverName || card.logisticsPartner;
    const late = card.eventDate < input.today
      ? countWorkingDays(card.eventDate, input.today, { offDays: WAREHOUSE_OFF_DAYS })
      : 0;
    const person = accepted
      ? { userId: accepted.userId, name: accepted.name }
      : null;
    return [operationWorkItemSchema.parse({
      id: operationWorkStableId("stock", `${card.deliveryOrderId}:${input.site.id}`, "warehouse.outbound_handover"),
      module: "stock",
      ruleKey: "warehouse.outbound_handover",
      object: { kind: "delivery_order", id: card.deliveryOrderId, label: card.doNumber },
      problem: `${card.notHandedOver} ${card.notHandedOver === 1 ? "Unit has" : "Units have"} not been handed over`,
      action: `Check, pack and hand over the exact ${card.notHandedOver === 1 ? "Unit" : "Units"} to ${recipient}`,
      recipient,
      requiredResult: "Every required Unit handed over with receiver and proof",
      completionFact: "Every required Unit has an accepted Warehouse handover event",
      owner: {
        rule: "warehouse_site_queue_then_operator",
        dutyKey: null,
        normal: person,
        activeCover: null,
        acting: person,
        state: accepted ? "primary" : "site_queue",
        queue: { kind: "warehouse_site", id: input.site.id, label: input.site.label },
      },
      timing: {
        dueOn: card.eventDate,
        workingDaysLate: late,
        bucket: late > 0 ? "overdue" : card.eventDate === input.today ? "today" : "later",
      },
      destination: input.destination === "operation"
        ? `/operation?tab=warehouse-outbound&site=${encodeURIComponent(input.site.id)}&do=${encodeURIComponent(card.doNumber)}`
        : `/warehouse/outbound?site=${encodeURIComponent(input.site.id)}&do=${encodeURIComponent(card.doNumber)}`,
      tone: late > 0 ? "danger" : "warning",
      locked: false,
      broken: false,
    })];
  });
}

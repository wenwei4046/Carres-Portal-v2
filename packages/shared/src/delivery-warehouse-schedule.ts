import { subtractWorkingDays, type IsoDate } from "./working-days";

const OFFICE_OFF_DAYS = [0, 6];

export type DeliveryWarehouseScheduleEventKind =
  | "customer_delivery_pickup"
  | "customer_handover";

export interface DeliveryWarehouseScheduleInput {
  unitId: string;
  orderId: string;
  leg: number;
  so: number;
  fromLocation: string;
  toCustomer: string;
  logisticsPartner: string;
  driverName: string | null;
  vehicle: string | null;
  doNumber: string;
  collectionDate: IsoDate;
  collectionWindow: string | null;
  customerHandoverDate: IsoDate | null;
  actualCollectionAt: string | null;
  actualArrivalAt: string | null;
  hasCollectionEvidence: boolean;
  hasDeliveryEvidence: boolean;
  /** Warehouse Card 03 — per-Unit facts the Outbound work reads. All
   *  optional: an absent fact is projected as null, never invented. */
  soDate?: string | null;
  sku?: string | null;
  productName?: string | null;
  unitScannedAt?: string | null;
  unitCheckedAt?: string | null;
  unitPackedAt?: string | null;
  /** The append-only accepted handover time for THIS exact Unit, or null. */
  unitHandedOverAt?: string | null;
  /** This Unit's own accepted-batch evidence (falls back to the DO's). */
  unitHasEvidence?: boolean;
}

export interface DeliveryWarehouseScheduleEvent {
  kind: DeliveryWarehouseScheduleEventKind;
  title: "Customer delivery pickup" | "Customer handover";
  calendar: "warehouse" | "delivery";
  eventDate: IsoDate;
  operationsReadyBy: IsoDate | null;
  unitId: string;
  orderId: string;
  leg: number;
  source: string;
  fromLocation: string;
  toCustomer: string;
  logisticsPartner: string;
  driverName: string | null;
  vehicle: string | null;
  doNumber: string;
  expectedCollectionDate: IsoDate;
  expectedCollectionWindow: string | null;
  actualCollectionAt: string | null;
  actualArrivalAt: string | null;
  hasEvidence: boolean;
  custody: "on_the_way" | null;
  /** Warehouse Card 03 — per-Unit facts (null when not recorded). */
  soDate: string | null;
  sku: string | null;
  productName: string | null;
  unitScannedAt: string | null;
  unitCheckedAt: string | null;
  unitPackedAt: string | null;
  unitHandedOverAt: string | null;
  deliveryHref: string;
  deliveryOrderHref: string;
  sourceHref: string;
}

/** One Office working day before the real Warehouse event day. */
export function deliveryOperationsReadyBy(
  collectionDate: IsoDate,
  holidays: IsoDate[] = [],
): IsoDate {
  return subtractWorkingDays(collectionDate, 1, {
    offDays: OFFICE_OFF_DAYS,
    holidays: new Set(holidays),
  });
}

/** A booking never moves custody. Only a confirmed collection fact can. */
export function deliveryCustodyProjection(
  actualCollectionAt: string | null,
  actualArrivalAt: string | null,
): "on_the_way" | null {
  return actualCollectionAt && !actualArrivalAt ? "on_the_way" : null;
}

/**
 * Delivery's read-only feed into Warehouse Schedule.
 *
 * It produces visibility only. No owner, Work item, writable field or derived
 * Stock status is stored here.
 */
export function deliveryWarehouseScheduleEvents(
  input: DeliveryWarehouseScheduleInput,
): DeliveryWarehouseScheduleEvent[] {
  const deliveryHref =
    `/operation/delivery/edit/${encodeURIComponent(input.orderId)}?leg=${input.leg}`;
  const deliveryOrderHref =
    `/operation/delivery-orders/${encodeURIComponent(input.doNumber)}`;
  const sourceHref =
    `/operation/orders/so/${encodeURIComponent(input.orderId)}`;
  const custody = input.hasCollectionEvidence
    ? deliveryCustodyProjection(input.actualCollectionAt, input.actualArrivalAt)
    : null;
  const common = {
    soDate: input.soDate ?? null,
    sku: input.sku ?? null,
    productName: input.productName ?? null,
    unitScannedAt: input.unitScannedAt ?? null,
    unitCheckedAt: input.unitCheckedAt ?? null,
    unitPackedAt: input.unitPackedAt ?? null,
    unitHandedOverAt: input.unitHandedOverAt ?? null,
    unitId: input.unitId,
    orderId: input.orderId,
    leg: input.leg,
    source: `SO-${input.so}`,
    fromLocation: input.fromLocation,
    toCustomer: input.toCustomer,
    logisticsPartner: input.logisticsPartner,
    driverName: input.driverName,
    vehicle: input.vehicle,
    doNumber: input.doNumber,
    expectedCollectionDate: input.collectionDate,
    expectedCollectionWindow: input.collectionWindow,
    actualCollectionAt: input.actualCollectionAt,
    actualArrivalAt: input.actualArrivalAt,
    custody,
    deliveryHref,
    deliveryOrderHref,
    sourceHref,
  };

  const events: DeliveryWarehouseScheduleEvent[] = [
    {
      ...common,
      kind: "customer_delivery_pickup",
      title: "Customer delivery pickup",
      calendar: "warehouse",
      eventDate: input.collectionDate,
      operationsReadyBy: deliveryOperationsReadyBy(input.collectionDate),
      hasEvidence: input.unitHasEvidence ?? input.hasCollectionEvidence,
    },
  ];
  if (input.customerHandoverDate) {
    events.push({
      ...common,
      kind: "customer_handover",
      title: "Customer handover",
      calendar: "delivery",
      eventDate: input.customerHandoverDate,
      operationsReadyBy: null,
      hasEvidence: input.hasDeliveryEvidence,
    });
  }
  return events;
}

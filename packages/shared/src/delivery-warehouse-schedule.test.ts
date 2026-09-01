import { describe, expect, it } from "vitest";
import {
  deliveryCustodyProjection,
  deliveryOperationsReadyBy,
  deliveryWarehouseScheduleEvents,
} from "./index";

describe("Delivery → Warehouse Schedule", () => {
  it("derives Operations ready by on the Office Mon–Fri calendar while Saturday pickup stays Saturday", () => {
    expect(deliveryOperationsReadyBy("2026-09-05")).toBe("2026-09-04");
  });

  it("never marks a future booking On the way; collection evidence opens custody and arrival closes it", () => {
    expect(deliveryCustodyProjection(null, null)).toBeNull();
    expect(deliveryCustodyProjection("2026-09-05T01:00:00Z", null)).toBe(
      "on_the_way",
    );
    expect(
      deliveryCustodyProjection(
        "2026-09-05T01:00:00Z",
        "2026-09-05T05:00:00Z",
      ),
    ).toBeNull();
  });

  it("projects the exact Unit into separate pickup and customer handover events with exact doors", () => {
    const events = deliveryWarehouseScheduleEvents({
      unitId: "CAR-000123",
      orderId: "00000000-0000-0000-0000-0000000a0001",
      leg: 0,
      so: 1322,
      fromLocation: "Carres Klang",
      toCustomer: "12 Jalan Meru, Klang",
      logisticsPartner: "NETS",
      driverName: "Ahmad",
      vehicle: "VAN-7",
      doNumber: "DO-180826-3035",
      collectionDate: "2026-09-05",
      collectionWindow: "Morning (9am–12pm)",
      customerHandoverDate: "2026-09-05",
      actualCollectionAt: null,
      actualArrivalAt: null,
      hasCollectionEvidence: false,
      hasDeliveryEvidence: false,
    });

    expect(events.map((event) => event.title)).toEqual([
      "Customer delivery pickup",
      "Customer handover",
    ]);
    expect(events[0]).toMatchObject({
      unitId: "CAR-000123",
      eventDate: "2026-09-05",
      operationsReadyBy: "2026-09-04",
      driverName: "Ahmad",
      vehicle: "VAN-7",
      custody: null,
      deliveryHref:
        "/operation/delivery/edit/00000000-0000-0000-0000-0000000a0001?leg=0",
      deliveryOrderHref: "/operation/delivery-orders/DO-180826-3035",
      sourceHref:
        "/operation/orders/so/00000000-0000-0000-0000-0000000a0001",
    });
    for (const event of events) {
      expect(event.deliveryHref).toBeTruthy();
      expect(event.deliveryOrderHref).toBeTruthy();
    }
  });
});

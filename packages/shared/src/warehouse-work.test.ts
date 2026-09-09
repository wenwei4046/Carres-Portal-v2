import { describe, expect, it } from "vitest";
import { projectWarehouseOutboundWork } from "./warehouse-work";
import type { WarehouseOutboundCard } from "./warehouse-outbound";

const card = {
  deliveryOrderId: "do-1",
  doNumber: "DO-2609-019",
  eventDate: "2026-09-09",
  fromLocation: "Carres Klang Warehouse",
  logisticsPartner: "NETS Delivery",
  driverName: "Ahmad",
  unitsRequired: 2,
  handedOver: 0,
  notHandedOver: 2,
} as WarehouseOutboundCard;

describe("Warehouse Outbound Work projection", () => {
  it("routes untouched work to the authorised Site queue", () => {
    const [item] = projectWarehouseOutboundWork({
      cards: [card],
      site: { id: "site-1", label: "Carres Klang Warehouse" },
      assignments: [],
      today: "2026-09-09",
    });

    expect(item.owner.state).toBe("site_queue");
    expect(item.owner.queue?.id).toBe("site-1");
    expect(item.action).toBe("Check, pack and hand over the exact Units to Ahmad");
    expect(item.destination).toBe("/warehouse/outbound?site=site-1&do=DO-2609-019");
  });

  it("routes accepted work to the personally signed-in operator", () => {
    const [item] = projectWarehouseOutboundWork({
      cards: [card],
      site: { id: "site-1", label: "Carres Klang Warehouse" },
      assignments: [{ deliveryOrderId: "do-1", siteId: "site-1", userId: "operator-1", name: "Nadia" }],
      today: "2026-09-09",
    });

    expect(item.owner.state).toBe("primary");
    expect(item.owner.normal).toEqual({ userId: "operator-1", name: "Nadia" });
    expect(item.owner.acting).toEqual({ userId: "operator-1", name: "Nadia" });
    expect(item.owner.queue?.label).toBe("Carres Klang Warehouse");
  });

  it("does not leak one Site's acceptance into another Site's queue for the same DO", () => {
    const [item] = projectWarehouseOutboundWork({
      cards: [card],
      site: { id: "site-2", label: "Carres Johor Warehouse" },
      assignments: [{ deliveryOrderId: "do-1", siteId: "site-1", userId: "operator-1", name: "Nadia" }],
      today: "2026-09-09",
    });

    expect(item.owner.state).toBe("site_queue");
    expect(item.owner.queue?.id).toBe("site-2");
  });

  it("closes only when every required Unit has an accepted handover", () => {
    expect(projectWarehouseOutboundWork({
      cards: [{ ...card, handedOver: 2, notHandedOver: 0 }],
      site: { id: "site-1", label: "Carres Klang Warehouse" },
      assignments: [],
      today: "2026-09-09",
    })).toEqual([]);
  });
});

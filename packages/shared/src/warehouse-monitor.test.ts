import { describe, it, expect } from "vitest";
import {
  deliveryWarehouseScheduleEvents,
  type DeliveryWarehouseScheduleInput,
} from "./delivery-warehouse-schedule";
import { warehouseOutboundCards } from "./warehouse-outbound";
import {
  driverCollectedLine,
  warehouseAssignedDriverLine,
  warehouseLoadedLine,
  warehouseMonitorArrivalEvents,
  warehouseMonitorDayEvents,
  warehouseMonitorEmptyDaySentence,
  warehouseMonitorPickupEvents,
  warehouseMonitorTimeSentence,
  warehouseRecordLoadedSentence,
  warehouseUnitNotCollectedSentence,
} from "./warehouse-monitor";

function unitInput(
  overrides: Partial<DeliveryWarehouseScheduleInput> & { unitId: string },
): DeliveryWarehouseScheduleInput {
  return {
    orderId: "order-19",
    deliveryOrderId: "do-19",
    leg: 0,
    so: 260919,
    fromLocation: "Carres Klang Warehouse",
    toCustomer: "Petaling Jaya",
    logisticsPartner: "NETS Delivery",
    driverName: null,
    vehicle: null,
    doNumber: "DO-2609-019",
    collectionDate: "2026-09-04",
    collectionWindow: null,
    customerHandoverDate: null,
    actualCollectionAt: null,
    actualArrivalAt: null,
    hasCollectionEvidence: false,
    hasDeliveryEvidence: false,
    ...overrides,
  };
}

function cardsOf(inputs: DeliveryWarehouseScheduleInput[]) {
  return warehouseOutboundCards(
    inputs.flatMap((i) => deliveryWarehouseScheduleEvents(i)),
  );
}

describe("the governed time sentence", () => {
  it("names the meaning beside the time, and never shows a bare clock", () => {
    expect(warehouseMonitorTimeSentence("Driver pickup", "14:30")).toBe(
      "Driver pickup 14:30",
    );
    expect(
      warehouseMonitorTimeSentence("Supplier arrival", "09:00–10:00"),
    ).toBe("Supplier arrival 09:00–10:00");
    expect(warehouseMonitorTimeSentence("Driver pickup", null)).toBe(
      "Time not provided",
    );
    expect(warehouseMonitorTimeSentence("Driver pickup", "  ")).toBe(
      "Time not provided",
    );
  });
});

describe("PICKUP events from the Delivery feed", () => {
  it("projects one card per DO with the arranged window as the driver-pickup time", () => {
    const cards = cardsOf([
      unitInput({ unitId: "U1-260-019", collectionWindow: "14:30" }),
      unitInput({ unitId: "U1-260-020", collectionWindow: "14:30" }),
    ]);
    const events = warehouseMonitorPickupEvents(cards);
    expect(events).toHaveLength(1);
    const e = events[0];
    expect(e.group).toBe("pickup");
    expect(e.label).toBe("Customer-delivery pickup");
    expect(e.timeSentence).toBe("Driver pickup 14:30");
    expect(e.party).toBe("NETS Delivery");
    expect(e.detail).toBe("2 Units to Petaling Jaya");
    expect(e.open).toEqual({
      tab: "warehouse-outbound",
      date: "2026-09-04",
      site: "Carres Klang Warehouse",
      do: "DO-2609-019",
    });
  });

  it("an unrecorded window reads exactly `Time not provided`", () => {
    const [e] = warehouseMonitorPickupEvents(
      cardsOf([unitInput({ unitId: "U1-260-019" })]),
    );
    expect(e.timeSentence).toBe("Time not provided");
  });
});

describe("ARRIVAL events from Purchasing's expected arrivals", () => {
  it("projects a dated PO owing goods, and drops undated or settled ones", () => {
    const events = warehouseMonitorArrivalEvents([
      {
        poId: "PO-2001",
        supplierName: "Nice Future",
        siteName: "Carres Klang Warehouse",
        siteId: "wh-1",
        etaDate: "2026-09-04",
        pendingQty: 3,
      },
      { poId: "PO-2002", supplierName: "X", siteName: null, etaDate: null, pendingQty: 5 },
      { poId: "PO-2003", supplierName: "X", siteName: null, etaDate: "2026-09-04", pendingQty: 0 },
    ]);
    expect(events).toHaveLength(1);
    const e = events[0];
    expect(e.group).toBe("arrival");
    expect(e.label).toBe("Supplier arrival");
    expect(e.timeSentence).toBe("Time not provided");
    expect(e.detail).toBe("Pending Delivery Qty 3");
    // The deep link carries the governed Site ID — the exact value the
    // Inbound `site` filter takes — never the display name.
    expect(e.open).toEqual({
      tab: "warehouse-inbound",
      date: "2026-09-04",
      site: "wh-1",
      po: "PO-2001",
    });
  });
});

describe("one day, ordered by actual time", () => {
  it("timed events lead in clock order; untimed follow, arrivals first", () => {
    const pickups = warehouseMonitorPickupEvents(
      cardsOf([
        unitInput({ unitId: "U1", doNumber: "DO-A", collectionWindow: "15:00" }),
        unitInput({ unitId: "U2", doNumber: "DO-B" }),
      ]),
    );
    const arrivals = warehouseMonitorArrivalEvents([
      {
        poId: "PO-2001",
        supplierName: "Nice Future",
        siteName: null,
        etaDate: "2026-09-04",
        pendingQty: 1,
      },
    ]);
    const day = warehouseMonitorDayEvents(
      [...pickups, ...arrivals],
      "2026-09-04",
    );
    expect(day.map((e) => e.sourceLabel)).toEqual([
      "DO-A · SO-260919",
      "PO-2001",
      "DO-B · SO-260919",
    ]);
  });
});

describe("pickup identities and the two evidence records", () => {
  it("keeps the company and the person separate, and never invents a driver", () => {
    expect(warehouseAssignedDriverLine("NETS Delivery", "Ahmad Rahman")).toBe(
      "Ahmad Rahman",
    );
    expect(warehouseAssignedDriverLine("NETS Delivery", null)).toBe(
      "Waiting for NETS Delivery to assign a driver",
    );
  });

  it("the loading act names the exact count and receiver", () => {
    expect(warehouseRecordLoadedSentence(2, "Ahmad Rahman")).toBe(
      "Record 2 Units loaded to Ahmad Rahman",
    );
    expect(warehouseRecordLoadedSentence(1, "NETS Delivery")).toBe(
      "Record 1 Unit loaded to NETS Delivery",
    );
  });

  it("Warehouse loaded and Driver collected stay two separate lines", () => {
    expect(warehouseLoadedLine({ handedOver: 2, unitsRequired: 2 })).toBe(
      "Warehouse loaded 2 of 2 Units",
    );
    expect(warehouseLoadedLine({ handedOver: 0, unitsRequired: 2 })).toBe(
      "Warehouse loaded — nothing yet",
    );
    expect(
      driverCollectedLine({
        logisticsPartner: "NETS Delivery",
        driverName: "Ahmad Rahman",
        actualCollectionAt: "2026-09-04T15:02:00+08:00",
      }),
    ).toBe("Ahmad Rahman confirmed collection");
    expect(
      driverCollectedLine({
        logisticsPartner: "NETS Delivery",
        driverName: null,
        actualCollectionAt: null,
      }),
    ).toBe("NETS Delivery has not confirmed collection yet");
  });

  it("a mismatch stays per-Unit and specific — never `Needs checking`", () => {
    expect(
      warehouseUnitNotCollectedSentence(
        "U1-000-002",
        "Ahmad Rahman",
        "Carres Klang Warehouse",
      ),
    ).toBe(
      "U1-000-002 was not confirmed by Ahmad Rahman. It remains with Carres Klang Warehouse.",
    );
  });
});

describe("the Monitor empty day", () => {
  it("covers both directions", () => {
    expect(warehouseMonitorEmptyDaySentence("Sat, 5 Sep")).toBe(
      "No arrivals or pickups on Sat, 5 Sep. Choose another date.",
    );
  });
});

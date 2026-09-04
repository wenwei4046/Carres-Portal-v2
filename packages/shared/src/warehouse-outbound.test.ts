import { describe, expect, it } from "vitest";
import {
  deliveryWarehouseScheduleEvents,
  type DeliveryWarehouseScheduleInput,
} from "./delivery-warehouse-schedule";
import {
  warehouseEmptyDaySentence,
  warehouseOperatingDates,
  warehouseOutboundCards,
  warehouseRangeShift,
  warehouseUnitPendingReason,
} from "./warehouse-outbound";

/** The Card §10 acceptance fixture — test data, never production truth. */
function unitInput(
  overrides: Partial<DeliveryWarehouseScheduleInput> & { unitId: string },
): DeliveryWarehouseScheduleInput {
  return {
    orderId: "order-19",
    leg: 0,
    so: 260919,
    fromLocation: "Carres Klang Warehouse",
    toCustomer: "Petaling Jaya",
    logisticsPartner: "NETS",
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
    soDate: "2026-09-01",
    sku: "SOFA-1",
    productName: "Sofa One",
    ...overrides,
  };
}

describe("warehouseOperatingDates", () => {
  it("prints six operating dates and omits Sunday", () => {
    // Thu 3 Sep 2026 … Wed 9 Sep 2026; Sunday 6 Sep is absent.
    expect(warehouseOperatingDates("2026-09-03")).toEqual([
      "2026-09-03",
      "2026-09-04",
      "2026-09-05",
      "2026-09-07",
      "2026-09-08",
      "2026-09-09",
    ]);
  });

  it("skips a governed closed date, never renames it", () => {
    expect(warehouseOperatingDates("2026-09-03", 6, ["2026-09-04"])).toEqual([
      "2026-09-03",
      "2026-09-05",
      "2026-09-07",
      "2026-09-08",
      "2026-09-09",
      "2026-09-10",
    ]);
  });

  it("starts on the next operating date when the anchor is a Sunday", () => {
    expect(warehouseOperatingDates("2026-09-06", 1)).toEqual(["2026-09-07"]);
  });
});

describe("warehouseRangeShift", () => {
  const range = warehouseOperatingDates("2026-09-03");

  it("forward starts the window after the last shown date", () => {
    expect(warehouseRangeShift(range, 1)).toBe("2026-09-10");
  });

  it("backward walks six operating dates back", () => {
    // Six operating dates before Thu 3 Sep: 2 Sep, 1 Sep, 31 Aug, 29 Aug,
    // 28 Aug, 27 Aug (Sunday 30 Aug omitted; Mon 31 Aug is Merdeka? —
    // holidays are injected, none here).
    expect(warehouseRangeShift(range, -1)).toBe("2026-08-27");
  });
});

describe("warehouseEmptyDaySentence", () => {
  it("is the exact governed sentence", () => {
    expect(warehouseEmptyDaySentence("Sat, 5 Sep")).toBe(
      "No outbound handovers on Sat, 5 Sep. Choose another date.",
    );
  });
});

describe("warehouseOutboundCards", () => {
  it("groups one DO scope into one card with exact-Unit drill-down", () => {
    const events = [
      ...deliveryWarehouseScheduleEvents(unitInput({ unitId: "U1-260-019" })),
      ...deliveryWarehouseScheduleEvents(unitInput({ unitId: "U1-260-020" })),
    ];
    const cards = warehouseOutboundCards(events);
    expect(cards).toHaveLength(1);
    const card = cards[0];
    expect(card.doNumber).toBe("DO-2609-019");
    expect(card.source).toBe("SO-260919");
    expect(card.unitsRequired).toBe(2);
    expect(card.handedOver).toBe(0);
    expect(card.notHandedOver).toBe(2);
    expect(card.actualHandoverAt).toBeNull();
    expect(card.units.map((u) => u.unitId)).toEqual([
      "U1-260-019",
      "U1-260-020",
    ]);
  });

  it("required = handed over + not handed over after a partial batch", () => {
    const events = [
      ...deliveryWarehouseScheduleEvents(
        unitInput({
          unitId: "U1-260-019",
          unitHandedOverAt: "2026-09-04T11:18:00+08:00",
          unitHasEvidence: true,
        }),
      ),
      ...deliveryWarehouseScheduleEvents(unitInput({ unitId: "U1-260-020" })),
    ];
    const [card] = warehouseOutboundCards(events);
    expect(card.unitsRequired).toBe(2);
    expect(card.handedOver).toBe(1);
    expect(card.notHandedOver).toBe(1);
    expect(card.actualHandoverAt).toBe("2026-09-04T11:18:00+08:00");
    expect(card.evidenceNotSubmitted).toBe(false);
    const remaining = card.units.filter((u) => !u.unitHandedOverAt);
    expect(remaining.map((u) => u.unitId)).toEqual(["U1-260-020"]);
  });

  it("a complete second batch closes the tally", () => {
    const events = [
      ...deliveryWarehouseScheduleEvents(
        unitInput({
          unitId: "U1-260-019",
          unitHandedOverAt: "2026-09-04T11:18:00+08:00",
          unitHasEvidence: true,
        }),
      ),
      ...deliveryWarehouseScheduleEvents(
        unitInput({
          unitId: "U1-260-020",
          unitHandedOverAt: "2026-09-04T15:02:00+08:00",
          unitHasEvidence: true,
        }),
      ),
    ];
    const [card] = warehouseOutboundCards(events);
    expect(card.handedOver).toBe(2);
    expect(card.notHandedOver).toBe(0);
    // The card shows the LATEST accepted physical handover.
    expect(card.actualHandoverAt).toBe("2026-09-04T15:02:00+08:00");
  });

  it("flags a handover fact whose evidence is missing", () => {
    const events = deliveryWarehouseScheduleEvents(
      unitInput({
        unitId: "U1-260-019",
        unitHandedOverAt: "2026-09-04T11:18:00+08:00",
        unitHasEvidence: false,
      }),
    );
    const [card] = warehouseOutboundCards(events);
    expect(card.evidenceNotSubmitted).toBe(true);
  });

  it("two DOs are two cards, sorted by date then number", () => {
    const events = [
      ...deliveryWarehouseScheduleEvents(
        unitInput({
          unitId: "U1-260-021",
          doNumber: "DO-2609-021",
          collectionDate: "2026-09-05",
        }),
      ),
      ...deliveryWarehouseScheduleEvents(unitInput({ unitId: "U1-260-019" })),
    ];
    const cards = warehouseOutboundCards(events);
    expect(cards.map((c) => c.doNumber)).toEqual([
      "DO-2609-019",
      "DO-2609-021",
    ]);
  });

  it("ignores customer_handover events — Delivery's calendar, not Warehouse work", () => {
    const events = deliveryWarehouseScheduleEvents(
      unitInput({ unitId: "U1-260-019", customerHandoverDate: "2026-09-04" }),
    );
    expect(events).toHaveLength(2);
    const cards = warehouseOutboundCards(events);
    expect(cards).toHaveLength(1);
    expect(cards[0].unitsRequired).toBe(1);
  });
});

describe("warehouseUnitPendingReason", () => {
  const base = {
    unitHandedOverAt: null,
    unitScannedAt: null,
    unitCheckedAt: null,
    unitPackedAt: null,
  };
  it("derives the plain reason from the recorded facts, in order", () => {
    expect(warehouseUnitPendingReason(base)).toBe("Not scanned yet");
    expect(
      warehouseUnitPendingReason({ ...base, unitScannedAt: "t" }),
    ).toBe("Not checked yet");
    expect(
      warehouseUnitPendingReason({
        ...base,
        unitScannedAt: "t",
        unitCheckedAt: "t",
      }),
    ).toBe("Not packed yet");
    expect(
      warehouseUnitPendingReason({
        ...base,
        unitScannedAt: "t",
        unitCheckedAt: "t",
        unitPackedAt: "t",
      }),
    ).toBe("Waiting for handover");
    expect(
      warehouseUnitPendingReason({ ...base, unitHandedOverAt: "t" }),
    ).toBeNull();
  });
});

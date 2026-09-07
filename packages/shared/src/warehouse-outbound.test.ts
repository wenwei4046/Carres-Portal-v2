import { describe, expect, it } from "vitest";
import {
  deliveryWarehouseScheduleEvents,
  type DeliveryWarehouseScheduleInput,
} from "./delivery-warehouse-schedule";
import {
  buildOutboundRegisterView,
  filterOutboundCards,
  outboundExceptionLines,
  outboundStatusWordOf,
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
      "No pickups on Sat, 5 Sep. Choose another date.",
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
    ).toBe("Waiting to be loaded");
    expect(
      warehouseUnitPendingReason({ ...base, unitHandedOverAt: "t" }),
    ).toBeNull();
  });
});

describe("three counts, products and exceptions (unified card 2026-09-07)", () => {
  const units = [
    unitInput({
      unitId: "U1-000-001",
      unitHandedOverAt: "2026-09-04T09:00:00Z",
      unitDriverConfirmedAt: "2026-09-04T09:30:00Z",
      unitHasEvidence: true,
    }),
    unitInput({
      unitId: "U1-000-002",
      unitHandedOverAt: "2026-09-04T09:00:00Z",
      unitHasEvidence: true,
    }),
    unitInput({
      unitId: "U1-000-003",
      sku: "BED-K",
      productName: "Oak Bedframe King",
    }),
  ].flatMap(deliveryWarehouseScheduleEvents);
  const [card] = warehouseOutboundCards(units);

  it("required, loaded and driver-confirmed stay three separate numbers", () => {
    expect([card.unitsRequired, card.handedOver, card.driverConfirmed]).toEqual([
      3, 2, 1,
    ]);
    expect(card.notHandedOver).toBe(1);
  });

  it("names every product with its own three counts", () => {
    expect(card.products).toEqual([
      { sku: "BED-K", name: "Oak Bedframe King", qty: 1, loaded: 0, driverConfirmed: 0 },
      { sku: "SOFA-1", name: "Sofa One", qty: 2, loaded: 2, driverConfirmed: 1 },
    ]);
  });

  it("speaks one loading-progress word", () => {
    expect(outboundStatusWordOf(card)).toBe("Part loaded");
    expect(outboundStatusWordOf({ handedOver: 0, notHandedOver: 3 })).toBe(
      "Not loaded yet",
    );
    expect(outboundStatusWordOf({ handedOver: 3, notHandedOver: 0 })).toBe(
      "Loaded",
    );
  });

  it("surfaces the loaded-vs-confirmed difference per exact Unit", () => {
    const lines = outboundExceptionLines(card, "2026-09-05");
    expect(lines).toContain("U1-000-002 · Loaded, not confirmed by NETS");
    expect(
      lines.some((l) => l.startsWith("Scheduled handover was 2026-09-04")),
    ).toBe(true);
    expect(lines.some((l) => l.includes("U1-000-001 ·"))).toBe(false);
  });

  it("a driver-confirmed Unit with no loading record is its own exception", () => {
    const [c] = warehouseOutboundCards(
      [
        unitInput({
          unitId: "U1-000-009",
          unitDriverConfirmedAt: "2026-09-04T10:00:00Z",
        }),
      ].flatMap(deliveryWarehouseScheduleEvents),
    );
    expect(outboundExceptionLines(c, "2026-09-04")).toContain(
      "U1-000-009 · Confirmed by NETS, no Warehouse loading record",
    );
  });
});

describe("one scope for rail counts, list and totals (§8)", () => {
  const loaded = warehouseOutboundCards(
    [
      unitInput({
        unitId: "U1-000-101",
        doNumber: "DO-2609-101",
        collectionDate: "2026-09-04",
        unitHandedOverAt: "2026-09-04T09:00:00Z",
        unitHasEvidence: true,
      }),
    ].flatMap(deliveryWarehouseScheduleEvents),
  );
  const open = warehouseOutboundCards(
    [
      unitInput({
        unitId: "U1-000-102",
        doNumber: "DO-2609-102",
        orderId: "order-20",
        collectionDate: "2026-09-05",
      }),
    ].flatMap(deliveryWarehouseScheduleEvents),
  );
  const cards = [...loaded, ...open];

  it("the default scope is every unfinished arrangement under its original date", () => {
    const rows = filterOutboundCards(cards, new URLSearchParams("view=open"));
    expect(rows.map((c) => c.doNumber)).toEqual(["DO-2609-102"]);
  });

  it("a day's Loaded count never claims work from another day", () => {
    // The screenshot bug: rail said `Loaded 1` while the day said no pickups.
    const day5 = buildOutboundRegisterView(
      cards,
      new URLSearchParams("date=2026-09-05&view=all"),
    );
    expect(day5.facets.view.loaded).toBe(0);
    const day4 = buildOutboundRegisterView(
      cards,
      new URLSearchParams("date=2026-09-04&view=loaded"),
    );
    expect(day4.facets.view.loaded).toBe(1);
    expect(day4.rows.map((c) => c.doNumber)).toEqual(["DO-2609-101"]);
  });

  it("a status pick composes with the date filter instead of cancelling it", () => {
    const view = buildOutboundRegisterView(
      cards,
      new URLSearchParams("date=2026-09-05&view=loaded"),
    );
    expect(view.rows).toHaveLength(0);
  });

  it("totals describe exactly the listed rows, in Units", () => {
    const view = buildOutboundRegisterView(cards, new URLSearchParams("view=all"));
    expect(view.totals).toEqual({ required: 2, loaded: 1, driverConfirmed: 0 });
  });

  it("searches products and exact Unit IDs and honours the `do` scope", () => {
    expect(
      filterOutboundCards(cards, new URLSearchParams("view=all&q=sofa one")),
    ).toHaveLength(2);
    expect(
      filterOutboundCards(cards, new URLSearchParams("view=all&do=DO-2609-101")),
    ).toHaveLength(1);
  });
});

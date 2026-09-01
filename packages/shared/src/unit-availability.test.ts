import { describe, expect, it } from "vitest";

import {
  UNIT_AVAILABILITY,
  UNIT_AVAILABILITY_LABEL,
  UNIT_LIFECYCLE_OUTCOMES,
  UNIT_OWNERSHIPS,
  isUnitAvailable,
  isUnitBindable,
  unitAvailability,
  unitLifecycleOutcome,
} from "./unit-availability";

/**
 * These cases are the SAME cases migration 0366's sanity block asserts against
 * `public.unit_availability()`. If one side changes, this file fails — which is
 * the point: one arithmetic, pinned in two languages.
 */
const CASES: Array<[string, boolean, string]> = [
  ["free", false, "available"],
  ["free", true, "not_available"],
  ["incoming", false, "incoming"],
  ["incoming", true, "incoming"],
  ["transferred", false, "in_transit"],
  ["reserved", false, "reserved"],
  ["on_hold", false, "not_available"],
  ["sold", false, "ended"],
  ["voided", false, "ended"],
  ["returned_to_supplier", false, "ended"],
  ["written_off", false, "ended"],
];

describe("unitAvailability — the one arithmetic", () => {
  it.each(CASES)("status %s / needsRepair %s → %s", (status, needsRepair, expected) => {
    expect(unitAvailability({ status, needsRepair })).toBe(expected);
  });

  it("has exactly six words and nothing else", () => {
    expect([...UNIT_AVAILABILITY].sort()).toEqual(
      ["available", "ended", "in_transit", "incoming", "not_available", "reserved"].sort(),
    );
    for (const word of UNIT_AVAILABILITY) {
      expect(UNIT_AVAILABILITY_LABEL[word]).toBeTruthy();
    }
  });

  it("a reserved unit stays reserved when it is flagged for repair — Warehouse protects, it never releases", () => {
    expect(unitAvailability({ status: "reserved", needsRepair: true })).toBe("reserved");
    expect(isUnitAvailable({ status: "reserved", needsRepair: true })).toBe(false);
  });

  it("only a received, complete, unreserved, uncontrolled unit can be offered", () => {
    expect(isUnitAvailable({ status: "free", needsRepair: false })).toBe(true);
    for (const [status, needsRepair] of CASES.filter(
      ([s, r]) => !(s === "free" && r === false),
    )) {
      expect(isUnitAvailable({ status, needsRepair })).toBe(false);
    }
  });

  it("incoming and in-transit units are never available — they are not here", () => {
    expect(isUnitAvailable({ status: "incoming" })).toBe(false);
    expect(isUnitAvailable({ status: "transferred" })).toBe(false);
  });

  it("a DAMAGED unit released back to free is controlled, not sellable (0371)", () => {
    // R4 releases a quarantined unit back to `free` keeping the condition it
    // was released with. The To Order engine has excluded damaged goods since
    // 2026-08; 0366's arithmetic did not ask about condition at all, so the
    // authority would have offered a unit every other reader refuses.
    expect(unitAvailability({ status: "free", needsRepair: false, condition: "damaged" }))
      .toBe("not_available");
    expect(isUnitAvailable({ status: "free", needsRepair: false, condition: "damaged" }))
      .toBe(false);
    expect(isUnitBindable({ status: "free", needsRepair: false, condition: "damaged", qty: 1 }))
      .toBe(false);
  });

  it("the four sellable conditions stay sellable", () => {
    for (const condition of ["new", "exhibition", "old", "refurbished"]) {
      expect(unitAvailability({ status: "free", needsRepair: false, condition }))
        .toBe("available");
    }
  });

  it("condition only controls a FREE unit — it never overrides a stronger fact", () => {
    // A damaged unit that is already sold is history, not "not available".
    expect(unitAvailability({ status: "sold", condition: "damaged" })).toBe("ended");
    expect(unitAvailability({ status: "reserved", condition: "damaged" })).toBe("reserved");
    expect(unitAvailability({ status: "incoming", condition: "damaged" })).toBe("incoming");
  });

  it("an unknown status is never offered — the arithmetic fails closed", () => {
    expect(unitAvailability({ status: "something_new" })).toBe("not_available");
    expect(unitAvailability({ status: null })).toBe("not_available");
    expect(unitAvailability({ status: undefined })).toBe("not_available");
  });

  it("nothing computes availability as onHand minus reserved", () => {
    // A site holding one free unit in repair and one reserved unit has
    // onHand 2 and reserved 1, so the old arithmetic would offer 1. The
    // register says 0, because the only free unit is controlled.
    const units = [
      { status: "free", needsRepair: true },
      { status: "reserved", needsRepair: false },
    ];
    const onHand = units.length;
    const reserved = units.filter((u) => unitAvailability(u) === "reserved").length;
    const available = units.filter(isUnitAvailable).length;
    expect(onHand - reserved).toBe(1);
    expect(available).toBe(0);
  });
});

describe("unitLifecycleOutcome — availability never erases how a life ended", () => {
  it("tells the four endings apart", () => {
    expect(unitLifecycleOutcome("sold")).toBe("delivered");
    expect(unitLifecycleOutcome("voided")).toBe("cancelled_before_receipt");
    expect(unitLifecycleOutcome("written_off")).toBe("written_off");
    expect(unitLifecycleOutcome("returned_to_supplier")).toBe("returned_to_supplier");
  });

  it("every ended availability still has a distinguishable outcome", () => {
    const ended = ["sold", "voided", "written_off", "returned_to_supplier"];
    const outcomes = ended.map(unitLifecycleOutcome);
    expect(new Set(outcomes).size).toBe(ended.length);
    for (const s of ended) {
      expect(unitAvailability({ status: s })).toBe("ended");
    }
  });

  it("a living unit is active whatever its availability is", () => {
    for (const s of ["free", "reserved", "incoming", "transferred", "on_hold"]) {
      expect(unitLifecycleOutcome(s)).toBe("active");
    }
  });

  it("carries no word the SQL side does not have", () => {
    expect([...UNIT_LIFECYCLE_OUTCOMES].sort()).toEqual(
      [
        "active",
        "cancelled_before_receipt",
        "delivered",
        "returned_to_supplier",
        "written_off",
      ].sort(),
    );
    expect([...UNIT_OWNERSHIPS]).toEqual(["carres_owned", "supplier_consignment"]);
  });
});

describe("isUnitBindable — a bulk record can never carry one customer's promise", () => {
  it("an exact free Unit is bindable", () => {
    expect(isUnitBindable({ status: "free", needsRepair: false, qty: 1 })).toBe(true);
    expect(isUnitBindable({ status: "free", needsRepair: false })).toBe(true);
  });

  it("a bulk record is available but NOT bindable — the gap 0368 closed", () => {
    const bulk = { status: "free", needsRepair: false, qty: 555 };
    // It is genuinely on the floor and genuinely unbroken...
    expect(unitAvailability(bulk)).toBe("available");
    expect(isUnitAvailable(bulk)).toBe(true);
    // ...and no exact-Unit promise can name one of its 555 pieces.
    expect(isUnitBindable(bulk)).toBe(false);
  });

  it("nothing unavailable is bindable, however small the record", () => {
    for (const status of ["incoming", "transferred", "reserved", "on_hold", "sold"]) {
      expect(isUnitBindable({ status, qty: 1 })).toBe(false);
    }
    expect(isUnitBindable({ status: "free", needsRepair: true, qty: 1 })).toBe(false);
  });

  it("sellable is available plus bulk, and available alone never decides a purchase", () => {
    // The production shape on 2026-08-20: 85 exact Units and 5 bulk records
    // holding 893 pieces. `available` said 978 and 85 could be promised.
    const units = [
      ...Array.from({ length: 85 }, () => ({ status: "free", needsRepair: false, qty: 1 })),
      { status: "free", needsRepair: false, qty: 555 },
      { status: "free", needsRepair: false, qty: 319 },
      { status: "free", needsRepair: false, qty: 15 },
      { status: "free", needsRepair: false, qty: 2 },
      { status: "free", needsRepair: false, qty: 2 },
    ];
    const sum = (f: (u: (typeof units)[number]) => boolean) =>
      units.filter(f).reduce((n, u) => n + u.qty, 0);

    const available = sum(isUnitBindable);
    const sellable = sum(isUnitAvailable);
    const bulkOnHand = sellable - available;

    expect(available).toBe(85);
    expect(bulkOnHand).toBe(893);
    expect(sellable).toBe(978);
    expect(available + bulkOnHand).toBe(sellable);
  });
});

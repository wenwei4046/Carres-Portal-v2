import { describe, it, expect } from "vitest";
import {
  DELIVERY_GROUPS,
  DELIVERY_GROUP_KEYS,
  deliveryGroupLabel,
  deliveryGroupOf,
  deliveryScopeSentence,
  orderDeliveryGroups,
} from "./delivery-groups";

// T8 — Jess's ruling: mattress + bed frame together (HARD) · sofa may take a
// second trip (SOFT, only if the customer says so) · accessories never block.

const MATTRESS = "mattress:FirmCare-K";
const BEDFRAME = "bedframe:Jager/Fab3-King";
const SOFA = "sofa:Glano-3Seater";
const PILLOW = "Memory Pillow";
const PROTECTOR = "Mattress Protector - Queen";
const DISPOSAL = "Disposal Service";

describe("deliveryGroupOf", () => {
  it("puts mattress AND bed frame in ONE group — the hard rule is the structure", () => {
    expect(deliveryGroupOf(MATTRESS)).toBe("bed");
    expect(deliveryGroupOf(BEDFRAME)).toBe("bed");
    // There is no way to name them apart, so no code path can split them.
    expect(deliveryGroupOf(MATTRESS)).toBe(deliveryGroupOf(BEDFRAME));
  });

  it("gives the sofa its own group — the only split the ruling allows", () => {
    expect(deliveryGroupOf(SOFA)).toBe("sofa");
    expect(deliveryGroupOf(SOFA)).not.toBe(deliveryGroupOf(MATTRESS));
  });

  it("accessories and service charges carry NO group (never block a trip)", () => {
    expect(deliveryGroupOf(PILLOW)).toBeNull();
    expect(deliveryGroupOf(PROTECTOR)).toBeNull();
    expect(deliveryGroupOf(DISPOSAL)).toBeNull();
  });

  it("reads AutoCount free-text skus, not only native prefixed ones", () => {
    expect(deliveryGroupOf("MS12 Firmcare 10inch Queen")).toBe("bed");
    expect(deliveryGroupOf("BF07 Hilton Divan King")).toBe("bed");
    expect(deliveryGroupOf("SF03 Muro 2 Seater")).toBe("sofa");
  });
});

describe("orderDeliveryGroups", () => {
  it("lists the bed set before the sofa (trip order)", () => {
    expect(
      orderDeliveryGroups([{ sku: SOFA }, { sku: MATTRESS }, { sku: BEDFRAME }]),
    ).toEqual(["bed", "sofa"]);
  });

  it("dedupes — two mattresses are still ONE bed set", () => {
    expect(
      orderDeliveryGroups([{ sku: MATTRESS }, { sku: "mattress:Lumi-Q" }]),
    ).toEqual(["bed"]);
  });

  it("an accessories-only order has NO groups (vacuously deliverable)", () => {
    expect(orderDeliveryGroups([{ sku: PILLOW }, { sku: DISPOSAL }])).toEqual([]);
  });
});

describe("deliveryScopeSentence", () => {
  it("says nothing when the trip carries everything — a normal delivery is not news", () => {
    expect(deliveryScopeSentence(["bed", "sofa"], ["bed", "sofa"])).toBeNull();
    expect(deliveryScopeSentence([], [])).toBeNull();
  });

  it("names BOTH halves on a split, so nobody forgets what is still owed", () => {
    expect(deliveryScopeSentence(["bed"], ["bed", "sofa"])).toBe(
      "Bed set only — Sofa follows on a second trip",
    );
    expect(deliveryScopeSentence(["sofa"], ["bed", "sofa"])).toBe(
      "Sofa only — Bed set follows on a second trip",
    );
  });
});

describe("group definitions", () => {
  it("exposes exactly the two groups, keys and labels in step", () => {
    expect(DELIVERY_GROUP_KEYS).toEqual(["bed", "sofa"]);
    expect(DELIVERY_GROUPS.map((g) => g.key)).toEqual(DELIVERY_GROUP_KEYS);
    expect(deliveryGroupLabel("bed")).toBe("Bed set");
    expect(deliveryGroupLabel("sofa")).toBe("Sofa");
  });

  it("speaks plain words — no jargon, no banned delivery vocabulary", () => {
    const text = JSON.stringify(DELIVERY_GROUPS).toLowerCase();
    for (const banned of ["pod", "sku", "unscheduled", "not booked", "consignment"]) {
      expect(text).not.toContain(banned);
    }
  });
});

import { describe, expect, it } from "vitest";
import {
  deliveryCharge, deliveryCost, deliveryFacts, dueFlag, formatSofaBands, parseSofaBands, postcodeRange, rateCardFor, worstFlag, zoneForPostcode,
  type RateCard,
} from "./fleet";

// Weisiang's decision (Mr Lim, WhatsApp 2026-10-22): Houzs Fleet Health, Delivery
// Zones and Rate Cards (0725). Jess was not part of this decision.

describe("zone lookup", () => {
  const zones = [
    { id: "pj", name: "PJ", postcodes: ["40", "46-47"] },
    { id: "puchong", name: "Puchong", postcodes: ["47100-47199"] },
    { id: "kl", name: "KL", postcodes: ["50-60", "68"] },
  ];
  it("reads 2- and 5-digit ranges", () => {
    expect(postcodeRange("47")).toEqual([47000, 47999]);
    expect(postcodeRange("46-47")).toEqual([46000, 47999]);
    expect(postcodeRange("58200")).toEqual([58200, 58200]);
    expect(postcodeRange("4700")).toBeNull();
    expect(postcodeRange("47-46")).toBeNull();
  });
  it("narrowest range wins, address text works, unknown is null", () => {
    expect(zoneForPostcode("47301", zones)?.name).toBe("PJ");
    expect(zoneForPostcode("47150", zones)?.name).toBe("Puchong");
    expect(zoneForPostcode("12 Jalan X, Ampang 68000, Selangor", zones)?.name).toBe("KL");
    expect(zoneForPostcode("81200", zones)).toBeNull();
    expect(zoneForPostcode("tel 0123456789", zones)).toBeNull();
  });
});

describe("rate card cost", () => {
  const card = (over: Partial<RateCard>): RateCard => ({
    id: "c", partnerId: "nets", zoneId: "pj", basis: "item", firstUnit: 60, secondUnit: 40, furtherUnit: 30, minCharge: 0,
    overageCap: null, overageEach: 0, sofaBrackets: [], serviceCharge: 0, pickupCharge: 0, disposalCharge: 0, ...over,
  });
  it("prices 1st, 2nd and each further item", () => {
    expect(deliveryCost(card({}), 0)).toBe(0);
    expect(deliveryCost(card({}), 1)).toBe(60);
    expect(deliveryCost(card({}), 2)).toBe(100);
    expect(deliveryCost(card({}), 4)).toBe(160);
  });
  it("per order is one unit; the minimum charge holds", () => {
    expect(deliveryCost(card({ basis: "order" }), 7)).toBe(60);
    expect(deliveryCost(card({ minCharge: 80 }), 1)).toBe(80);
    expect(deliveryCost(card({ minCharge: 80 }), 0)).toBe(80); // Houzs: the minimum holds with no items

  });
  it("zone card first, then the every-other-zone card, never another company's", () => {
    const cards = [card({ id: "zone" }), card({ id: "other", zoneId: null }), card({ id: "x", partnerId: "al", zoneId: null })];
    expect(rateCardFor(cards, "nets", "pj")?.id).toBe("zone");
    expect(rateCardFor(cards, "nets", "kl")?.id).toBe("other");
    expect(rateCardFor(cards, "nets", null)?.id).toBe("other");
    expect(rateCardFor(cards, "teow", "pj")).toBeNull();
  });
});

// Houzs charge maths (backend/src/scm/lib/delivery-rate-card.ts:292-437), Weisiang's ruling 2026-10-22.
describe("delivery charge, Houzs way", () => {
  const card = (over: Partial<RateCard>): RateCard => ({
    id: "c", partnerId: "nets", zoneId: null, basis: "item", firstUnit: 60, secondUnit: 40, furtherUnit: 30, minCharge: 0,
    overageCap: null, overageEach: 0, sofaBrackets: [], serviceCharge: 0, pickupCharge: 0, disposalCharge: 0, ...over,
  });
  it("past the cap each unit costs the overage, not the further rate", () => {
    const c = card({ overageCap: 3, overageEach: 50 });
    expect(deliveryCharge(c, { items: 3 }).total).toBe(130); // 60 + 40 + 30
    const five = deliveryCharge(c, { items: 5 });
    expect(five.total).toBe(230); // 130 + 2 x 50
    expect(five.lines.map((l) => [l.kind, l.amount])).toEqual([["unit", 130], ["overage", 100]]);
    expect(deliveryCharge(card({ overageCap: 1, overageEach: 25 }), { items: 2 }).total).toBe(85);
  });
  it("a sofa is priced by its compartment band, once per sofa, and is not a unit", () => {
    const c = card({ sofaBrackets: [{ min: 1, max: 3, amount: 50 }, { min: 4, max: null, amount: 80 }] });
    // Houzs worked example shape: 1st + 2nd item + a 3-compartment sofa
    expect(deliveryCharge(c, { items: 2, sofaCompartments: [3] }).total).toBe(150);
    expect(deliveryCharge(c, { items: 0, sofaCompartments: [3, 4, 7] }).total).toBe(210);
    expect(deliveryCharge(c, { items: 0, sofaCompartments: [0] }).total).toBe(0);
    expect(deliveryCharge(card({}), { items: 0, sofaCompartments: [3] }).total).toBe(0); // no band, no charge
  });
  it("service, pickup and disposal are rate x count", () => {
    const c = card({ serviceCharge: 20, pickupCharge: 35.5, disposalCharge: 15 });
    const r = deliveryCharge(c, { items: 1, services: 2, pickups: 1, disposals: 3 });
    expect(r.total).toBe(180.5); // item 60 + service 2 x 20 + pickup 35.50 + disposal 3 x 15
    expect(r.lines.map((l) => l.label)).toEqual(["1 item", "Service x2", "Pickup", "Disposal x3"]);
  });
  it("the minimum lifts the whole charge, never adds on top", () => {
    const c = card({ minCharge: 120, disposalCharge: 15 });
    expect(deliveryCharge(c, { items: 1, disposals: 1 }).total).toBe(120);
    expect(deliveryCharge(c, { items: 1, disposals: 1 }).lines.at(-1)).toEqual({ kind: "minimum", label: "Minimum", amount: 45 });
    expect(deliveryCharge(c, { items: 3 }).total).toBe(130);
  });
  it("sums in sen: no float drift", () => {
    expect(deliveryCharge(card({ firstUnit: 0.1, secondUnit: 0.2, furtherUnit: 0.1 }), { items: 3 }).total).toBe(0.4);
    expect(deliveryCost(card({ basis: "order", overageCap: 1, overageEach: 99 }), 9)).toBe(60);
  });
  it("goods to facts: sofas by build, accessories and services left out", () => {
    const f = deliveryFacts([
      { sku: "M1401F-K", qty: 2 },
      { sku: "hk55-3seater", qty: 1, attrs: { sofa_build_key: "A" } },
      { sku: "hk55-3seater", qty: 2, attrs: { sofa_build_key: "A" } },
      { sku: "hk55-3seater", qty: 1, attrs: { sofa_build_key: "B" } },
      { sku: "UNKNOWN-THING", qty: 5 },
    ]);
    expect(f).toEqual({ items: 2, sofaCompartments: [3, 1] });
  });
  it("sofa bands read and print", () => {
    expect(parseSofaBands("1-3 50, 4 60.5, 5+ 90")).toEqual([
      { min: 1, max: 3, amount: 50 }, { min: 4, max: 4, amount: 60.5 }, { min: 5, max: null, amount: 90 },
    ]);
    expect(parseSofaBands("")).toEqual([]);
    expect(parseSofaBands("3-1 50")).toBeNull();
    expect(parseSofaBands("1-3")).toBeNull();
    expect(formatSofaBands([{ min: 1, max: 3, amount: 50 }, { min: 4, max: 4, amount: 60 }, { min: 5, max: null, amount: 90 }])).toBe("1-3 50, 4 60, 5+ 90");
  });
});

describe("lorry due dates", () => {
  it("overdue, due soon within 30 days, ok, not recorded", () => {
    expect(dueFlag("2026-10-22", "2026-10-23")).toBe("overdue");
    expect(dueFlag("2026-10-23", "2026-10-23")).toBe("due_soon");
    expect(dueFlag("2026-11-22", "2026-10-23")).toBe("due_soon");
    expect(dueFlag("2026-11-23", "2026-10-23")).toBe("ok");
    expect(dueFlag(null, "2026-10-23")).toBe("not_recorded");
    expect(worstFlag(["ok", "due_soon", "overdue"])).toBe("overdue");
    expect(worstFlag(["ok", "ok"])).toBe("ok");
  });
});

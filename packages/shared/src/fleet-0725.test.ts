import { describe, expect, it } from "vitest";
import { deliveryCost, dueFlag, postcodeRange, rateCardFor, worstFlag, zoneForPostcode, type RateCard } from "./fleet";

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
    id: "c", partnerId: "nets", zoneId: "pj", basis: "item", firstUnit: 60, secondUnit: 40, furtherUnit: 30, minCharge: 0, ...over,
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

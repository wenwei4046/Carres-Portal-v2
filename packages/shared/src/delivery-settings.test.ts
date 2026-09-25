import { describe, it, expect } from "vitest";
import {
  DELIVERY_SETTINGS_SECTIONS,
  DELIVERY_TEMPLATE_PURPOSES,
  DELIVERY_TEMPLATE_PURPOSE_WORD,
  PARTNER_SECTIONS,
  partnerCoverageInput,
  partnerRulesInput,
  partnerScheduleInput,
  partnerVehicleInput,
} from "./delivery-settings";

describe("Delivery Settings — the doors' inputs and the governed words (§11)", () => {
  it("the four rows of the Delivery group and the seven partner sections are the MASTER's", () => {
    expect(DELIVERY_SETTINGS_SECTIONS.map((s) => s.label)).toEqual([
      "Logistics Partners",
      "Delivery Rules",
      "Message Templates",
      "Access",
    ]);
    expect(PARTNER_SECTIONS.map((s) => s.label)).toEqual([
      "Partner details",
      "Coverage",
      "Schedule",
      "Warehouses & handover points",
      "Drivers and Vehicles",
      "Services & charges",
      "Portal access",
    ]);
  });

  it("every template purpose carries its word, and the contact purposes ride along", () => {
    for (const p of DELIVERY_TEMPLATE_PURPOSES) {
      expect(DELIVERY_TEMPLATE_PURPOSE_WORD[p]).toBeTruthy();
    }
    expect(DELIVERY_TEMPLATE_PURPOSES).toContain("confirm_delivery_date");
    expect(DELIVERY_TEMPLATE_PURPOSE_WORD.ask_partner_for_date).toBe("Ask the partner for the delivery date");
  });

  it("coverage names its four lists; a stray key is refused", () => {
    const ok = partnerCoverageInput.safeParse({
      partnerId: "00000000-0000-0000-0000-0000000b0001",
      coverage: { states: ["Selangor"], cities: [], postcodes: ["41000"], excluded: [] },
      kvDefault: false,
    });
    expect(ok.success).toBe(true);
    const bad = partnerCoverageInput.safeParse({
      partnerId: "00000000-0000-0000-0000-0000000b0001",
      coverage: { states: ["Selangor"] },
      kvDefault: false,
    });
    expect(bad.success).toBe(false);
  });

  it("who contacts the customer is the partner or Operation — nothing else", () => {
    const base = { partnerId: "00000000-0000-0000-0000-0000000b0001", recordOnBehalfAllowed: true, proofRules: null };
    expect(partnerRulesInput.safeParse({ ...base, customerContactBy: "partner" }).success).toBe(true);
    expect(partnerRulesInput.safeParse({ ...base, customerContactBy: "operation" }).success).toBe(true);
    expect(partnerRulesInput.safeParse({ ...base, customerContactBy: "salesperson" }).success).toBe(false);
  });

  it("the cut-off is a clock time and a handover point names its kind", () => {
    const id = "00000000-0000-0000-0000-0000000b0001";
    expect(partnerScheduleInput.safeParse({ partnerId: id, cutoffTime: "14:00", handoverPoints: null }).success).toBe(true);
    expect(partnerScheduleInput.safeParse({ partnerId: id, cutoffTime: "2pm", handoverPoints: null }).success).toBe(false);
    expect(
      partnerScheduleInput.safeParse({
        partnerId: id,
        cutoffTime: null,
        handoverPoints: [{ name: "JB transit", kind: "transit", address: null }],
      }).success,
    ).toBe(true);
    expect(
      partnerScheduleInput.safeParse({ partnerId: id, cutoffTime: null, handoverPoints: [{ name: "X", kind: "airport" }] }).success,
    ).toBe(false);
  });

  it("a vehicle template needs a plate and a type, and is active unless retired", () => {
    const id = "00000000-0000-0000-0000-0000000b0001";
    const ok = partnerVehicleInput.safeParse({ partnerId: id, plate: "WXY 1234", vehicleType: "Lorry" });
    expect(ok.success && ok.data.active).toBe(true);
    expect(partnerVehicleInput.safeParse({ partnerId: id, plate: "WXY 1234", vehicleType: " " }).success).toBe(false);
  });
});

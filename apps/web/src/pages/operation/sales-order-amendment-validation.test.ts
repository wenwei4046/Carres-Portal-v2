import { describe, expect, it } from "vitest";
import { amendmentValidation } from "./sales-order-amendment-validation";

const values = {
  customer_name: "Kimi", customer_phone: "0192384732432", customer_email: "kimi@gmail.com",
  customer_race: "Chinese", customer_gender: "Female", customer_birthday: "1990-01-15",
  emergency_name: "Yui", emergency_phone: "012749873325", emergency_relationship: "Child",
  customer_address_line1: "77, Jalan oioio", customer_address_state: "Melaka",
  customer_address_city: "Asahan", customer_address_postcode: "77109", building_type: "Landed",
  customer_address_unknown: false, customer_billing_same: true, customer_billing: "",
  proceed_date: "2026-08-06", delivery_floor: 1, delivery_has_lift: false, delivery_stair_items: 0,
  custom: {},
};

describe("amendment required fields follow the existing form configuration", () => {
  it("accepts complete values, including no lift, zero stair items and billing same as delivery", () => {
    const result = amendmentValidation(values, null);
    expect(result.errors).toEqual({});
    expect(result.customErrors).toEqual({});
    expect(result.required.customer_phone).toBe(true);
    expect(result.required.customer_billing).toBe(false);
    expect(result.required).not.toHaveProperty("customer_address_line2");
  });

  it("refuses empty and whitespace-only required input, select and date values without changing them", () => {
    const draft = { ...values, customer_name: "  ", customer_race: "", customer_birthday: null };
    const before = structuredClone(draft);
    const result = amendmentValidation(draft, null);
    expect(Object.keys(result.errors)).toEqual(["customer_name", "customer_race", "customer_birthday"]);
    expect(draft).toEqual(before);
  });

  it("honours optional and disabled settings without making optional fields required", () => {
    const result = amendmentValidation({ ...values, customer_email: "", customer_race: "", emergency_name: "" }, {
      customer: { custom: [], builtins: { email: { required: false }, race: { enabled: false, required: true } } },
      emergency: { custom: [], builtins: { emergency: { required: false } } },
    });
    expect(result.errors).toEqual({});
    expect(result.required.customer_email).toBe(false);
    expect(result.required.customer_race).toBe(false);
    expect(result.required.emergency_name).toBe(false);
  });

  it("keeps the address-unknown and billing-same exemptions", () => {
    const result = amendmentValidation({ ...values, customer_address_unknown: true,
      customer_address_line1: "", customer_address_state: "", customer_address_city: "",
      customer_address_postcode: "", building_type: "", customer_billing_same: false }, null);
    expect(Object.keys(result.errors)).toEqual(["customer_billing"]);
    expect(result.required.building_type).toBe(false);
  });

  it("uses required custom fields from every configured tab and preserves the existing message", () => {
    const custom = (key: string, required: boolean) => ({ key, label: key, type: "text" as const, required, options: [] });
    const result = amendmentValidation(values, {
      customer: { builtins: {}, custom: [custom("Optional note", false)] },
      target: { builtins: {}, custom: [custom("Instructions", true)] },
    });
    expect(result.customErrors).toEqual({ Instructions: "Instructions — required" });
  });
});

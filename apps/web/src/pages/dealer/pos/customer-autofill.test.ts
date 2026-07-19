import { describe, it, expect } from "vitest";
import type { CustomerSearchHit } from "@/lib/queries";
import { composeAddress } from "@/data/malaysia-postcodes";
import { customerPatchFromHit, parseComposedAddress, parseEmergency } from "./customer-autofill";

function hit(overrides: Partial<CustomerSearchHit> = {}): CustomerSearchHit {
  return {
    name: "Jamie Tan",
    phone: "012-3456789",
    email: "jamie@example.com",
    address: "12 Jalan Besar, Petaling Jaya 46200, Selangor",
    addressUnknown: false,
    billing: null,
    billingSame: true,
    emergency: "Mei Tan · 012-9988776 · Spouse",
    race: "Chinese",
    gender: "Female",
    birthday: "1990-04-01",
    ...overrides,
  };
}

describe("parseComposedAddress", () => {
  it("round-trips composeAddress with line2", () => {
    const composed = composeAddress({
      line1: "12 Jalan Besar",
      line2: "Unit 3-A, Block B",
      state: "Selangor",
      city: "Petaling Jaya",
      postcode: "46200",
    });
    expect(parseComposedAddress(composed)).toEqual({
      addressLine1: "12 Jalan Besar",
      addressLine2: "Unit 3-A, Block B",
      addressState: "Selangor",
      addressCity: "Petaling Jaya",
      addressPostcode: "46200",
    });
  });

  it("round-trips composeAddress without line2", () => {
    const composed = composeAddress({
      line1: "12 Jalan Besar",
      state: "Selangor",
      city: "Petaling Jaya",
      postcode: "46200",
    });
    expect(parseComposedAddress(composed)).toEqual({
      addressLine1: "12 Jalan Besar",
      addressLine2: "",
      addressState: "Selangor",
      addressCity: "Petaling Jaya",
      addressPostcode: "46200",
    });
  });

  it("returns null for a free-form address that doesn't match the composed shape", () => {
    // AutoCount-imported addresses are free text — must not mis-set dropdowns.
    expect(parseComposedAddress("No 5, Jalan 1/2, Somewhere")).toBeNull();
    expect(parseComposedAddress("just a street name")).toBeNull();
    expect(parseComposedAddress("")).toBeNull();
  });

  it("rejects an unknown city even when the state matches", () => {
    expect(parseComposedAddress("12 Jalan Besar, Atlantis 46200, Selangor")).toBeNull();
  });
});

describe("parseEmergency", () => {
  it("splits name · phone · relationship and maps a known relationship", () => {
    expect(parseEmergency("Mei Tan · 012-9988776 · Spouse")).toEqual({
      emergencyName: "Mei Tan",
      emergencyPhone: "012-9988776",
      emergencyRelationship: "Spouse",
      emergencyRelationshipOther: "",
    });
  });

  it("maps a free-text relationship to __OTHER__ (mirrors the dropdown's storage)", () => {
    expect(parseEmergency("Ali · 019-1112223 · Neighbour")).toEqual({
      emergencyName: "Ali",
      emergencyPhone: "019-1112223",
      emergencyRelationship: "__OTHER__",
      emergencyRelationshipOther: "Neighbour",
    });
  });

  it("fills what exists when segments are missing", () => {
    expect(parseEmergency("Ali")).toEqual({
      emergencyName: "Ali",
      emergencyPhone: "",
      emergencyRelationship: "",
      emergencyRelationshipOther: "",
    });
    expect(parseEmergency("")).toEqual({
      emergencyName: "",
      emergencyPhone: "",
      emergencyRelationship: "",
      emergencyRelationshipOther: "",
    });
  });
});

describe("customerPatchFromHit", () => {
  it("fills the whole customer block from a parseable hit", () => {
    expect(customerPatchFromHit(hit())).toEqual({
      name: "Jamie Tan",
      phone: "012-3456789",
      email: "jamie@example.com",
      race: "Chinese",
      gender: "Female",
      birthday: "1990-04-01",
      address: "12 Jalan Besar, Petaling Jaya 46200, Selangor",
      addressUnknown: false,
      addressLine1: "12 Jalan Besar",
      addressLine2: "",
      addressState: "Selangor",
      addressCity: "Petaling Jaya",
      addressPostcode: "46200",
      billingSame: true,
      billing: "",
      billingLine1: "",
      billingLine2: "",
      billingState: "",
      billingCity: "",
      billingPostcode: "",
      emergencyName: "Mei Tan",
      emergencyPhone: "012-9988776",
      emergencyRelationship: "Spouse",
      emergencyRelationshipOther: "",
    });
  });

  it("falls back to line1-only when the address string doesn't parse", () => {
    const patch = customerPatchFromHit(hit({ address: "free-form imported address" }));
    expect(patch.addressLine1).toBe("free-form imported address");
    expect(patch.addressState).toBe("");
    expect(patch.addressCity).toBe("");
    expect(patch.addressPostcode).toBe("");
  });

  it("never inherits addressUnknown, and nulls become empty strings", () => {
    const patch = customerPatchFromHit(
      hit({
        address: null,
        addressUnknown: true,
        phone: null,
        email: null,
        race: null,
        gender: null,
        birthday: null,
        emergency: null,
      }),
    );
    expect(patch.addressUnknown).toBe(false);
    expect(patch.addressLine1).toBe("");
    expect(patch.phone).toBe("");
    expect(patch.email).toBe("");
    expect(patch.race).toBe("");
    expect(patch.birthday).toBe("");
    expect(patch.emergencyName).toBe("");
  });

  it("carries a distinct billing address when billingSame is false", () => {
    const patch = customerPatchFromHit(
      hit({ billingSame: false, billing: "88 Jalan Invoice, KL" }),
    );
    expect(patch.billingSame).toBe(false);
    expect(patch.billing).toBe("88 Jalan Invoice, KL");
    // Unparseable → line1-only fallback, same behaviour as delivery.
    expect(patch.billingLine1).toBe("88 Jalan Invoice, KL");
    expect(patch.billingState).toBe("");
    expect(patch.billingCity).toBe("");
    expect(patch.billingPostcode).toBe("");
  });

  it("parses a composed billing back into the billing cascade (2026-07-19)", () => {
    const patch = customerPatchFromHit(
      hit({
        billingSame: false,
        billing: "88 Jalan Invoice, Petaling Jaya 46200, Selangor",
      }),
    );
    expect(patch.billingLine1).toBe("88 Jalan Invoice");
    expect(patch.billingLine2).toBe("");
    expect(patch.billingState).toBe("Selangor");
    expect(patch.billingCity).toBe("Petaling Jaya");
    expect(patch.billingPostcode).toBe("46200");
  });
});

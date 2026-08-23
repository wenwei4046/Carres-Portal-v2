import { describe, expect, it } from "vitest";
import { step1FirstIssue, step1Valid, type WizardDraft } from "./draft";

/**
 * BUILDING TYPE IS DELIVERY'S FACT (Jess, 2026-08-21).
 *
 * Stairs, lift access and van parking all hang off it, and Operations was
 * chasing the shop for it after the sale. The office create door began
 * refusing without it the same day; this is the POS half, so the two doors
 * ask the same question.
 *
 * The fixture is the SAME shape draft.test.ts uses — copied rather than
 * imported so this file states the whole draft it is reasoning about.
 */
function validDraft(): WizardDraft {
  // Returns a draft that passes every step1Valid rule. Tests mutate one field
  // at a time to confirm each rule fires.
  return {
    outletId: "00000000-0000-0000-0000-00000000ee01",
    salespersonId: "00000000-0000-0000-0000-00000000ff01",
    customer: {
      name: "Tan Mei Ling",
      phone: "012-3456789",
      address: "",
      addressLine1: "123 Jalan Sample",
      addressLine2: "",
      addressState: "Kuala Lumpur",
      addressCity: "Bangsar",
      addressPostcode: "59000",
      addressUnknown: false,
      /* Required since 2026-08-21 — a "fully filled valid draft" has to carry
         one now, the same as a state or a postcode. */
      buildingType: "Condo",
      billing: "",
      billingSame: true,
      billingLine1: "",
      billingLine2: "",
      billingState: "",
      billingCity: "",
      billingPostcode: "",
      emergencyName: "Tan Junior",
      emergencyPhone: "012-9988776",
      emergencyRelationship: "Spouse",
      emergencyRelationshipOther: "",
      email: "mei.ling@example.com",
      race: "Chinese",
      gender: "Female",
      birthday: "1990-04-12",
    },
    delivery: { date: "2026-06-01", dateTbd: false, floor: 1, hasLift: false, stairItems: null, proceedDate: "" },
    lines: [],
    addons: [],
    paid: 0,
    payment: {
      method: "online",
      approvalCode: "",
      installmentMonths: 6,
      slip: null,
      // 0219 — loadDraft backfills this for pre-0219 drafts, so the roundtrip
      // fixture carries it too.
      followUps: {},
    },
    signature: null,
    termsAccepted: false,
    wizardSessionId: null,
  };
}

describe("step 1 asks for the building type", () => {
  it("refuses Continue when an address exists without one", () => {
    const d = validDraft();
    d.customer.buildingType = "";
    expect(step1Valid(d)).toBe(false);
    expect(step1FirstIssue(d)).toBe("Address — Building type, or tick 'Unknown'");
  });

  it("passes once it is picked", () => {
    expect(step1Valid(validDraft())).toBe(true);
  });

  it("does NOT ask when the address is deferred", () => {
    // An address nobody has yet cannot be asked what kind of building it is.
    // The office door makes the same exception for address_not_given_yet.
    const d = validDraft();
    d.customer.addressUnknown = true;
    d.customer.buildingType = "";
    expect(step1Valid(d)).toBe(true);
  });

  it("names the building type only AFTER the address parts", () => {
    // The gate reads top-to-bottom like the form. A draft missing both a
    // postcode and a building type must name the POSTCODE first, or the
    // dealer fixes the wrong field.
    const d = validDraft();
    d.customer.addressPostcode = "";
    d.customer.buildingType = "";
    expect(step1FirstIssue(d)).toBe("Address — Postcode, or tick 'Unknown'");
  });
});

import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DRAFT_STORAGE_KEY,
  type WizardDraft,
  clearDraft,
  composeEmergency,
  emptyDraft,
  loadDraft,
  saveDraft,
  step1Valid,
} from "./draft";

afterEach(() => {
  sessionStorage.clear();
  vi.restoreAllMocks();
});

function validDraft(): WizardDraft {
  // Returns a draft that passes every step1Valid rule. Tests mutate one field
  // at a time to confirm each rule fires.
  return {
    outletId: "00000000-0000-0000-0000-00000000ee01",
    salespersonId: "00000000-0000-0000-0000-00000000ff01",
    customer: {
      name: "Tan Mei Ling",
      phone: "012-3456789",
      address: "123 Jalan Sample, 50000 KL",
      addressUnknown: false,
      billing: "",
      billingSame: true,
      emergencyName: "Tan Junior",
      emergencyPhone: "012-9988776",
      emergencyRelationship: "Spouse",
      emergencyRelationshipOther: "",
    },
    delivery: { date: "2026-06-01", dateTbd: false, floor: 1, hasLift: false },
  };
}

describe("emptyDraft", () => {
  it("returns a fresh blank shape with all fields present", () => {
    const d = emptyDraft();
    expect(d.outletId).toBeNull();
    expect(d.salespersonId).toBeNull();
    expect(d.customer.name).toBe("");
    expect(d.customer.billingSame).toBe(true);
    expect(d.delivery.floor).toBe(1);
    expect(d.delivery.hasLift).toBe(false);
  });
});

describe("save / load / clear roundtrip", () => {
  it("saveDraft + loadDraft preserves shape", () => {
    const d = validDraft();
    saveDraft(d);
    expect(loadDraft()).toEqual(d);
  });

  it("loadDraft returns null when nothing saved", () => {
    expect(loadDraft()).toBeNull();
  });

  it("clearDraft removes the entry", () => {
    saveDraft(validDraft());
    expect(sessionStorage.getItem(DRAFT_STORAGE_KEY)).not.toBeNull();
    clearDraft();
    expect(sessionStorage.getItem(DRAFT_STORAGE_KEY)).toBeNull();
    expect(loadDraft()).toBeNull();
  });

  it("loadDraft returns null on corrupt JSON (defensive)", () => {
    sessionStorage.setItem(DRAFT_STORAGE_KEY, "not-json{");
    expect(loadDraft()).toBeNull();
  });

  it("loadDraft returns null when shape is missing required keys", () => {
    sessionStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify({ outletId: "x" }));
    expect(loadDraft()).toBeNull();
  });

  it("saveDraft swallows quota errors silently", () => {
    // Force setItem to throw — emulates Safari private mode.
    const spy = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("QuotaExceededError");
    });
    expect(() => saveDraft(validDraft())).not.toThrow();
    expect(spy).toHaveBeenCalled();
  });
});

describe("step1Valid — Continue gate", () => {
  it("a fully filled valid draft passes", () => {
    expect(step1Valid(validDraft())).toBe(true);
  });

  it("rejects when name < 2 chars", () => {
    const d = validDraft();
    d.customer.name = "X";
    expect(step1Valid(d)).toBe(false);
  });

  it("rejects when phone < 8 chars", () => {
    const d = validDraft();
    d.customer.phone = "012345";
    expect(step1Valid(d)).toBe(false);
  });

  it("rejects when phone has letters", () => {
    const d = validDraft();
    d.customer.phone = "abc-defghij";
    expect(step1Valid(d)).toBe(false);
  });

  it("rejects when emergencyName empty", () => {
    const d = validDraft();
    d.customer.emergencyName = "";
    expect(step1Valid(d)).toBe(false);
  });

  it("rejects when emergencyPhone invalid", () => {
    const d = validDraft();
    d.customer.emergencyPhone = "123";
    expect(step1Valid(d)).toBe(false);
  });

  it("rejects when emergencyRelationship empty", () => {
    const d = validDraft();
    d.customer.emergencyRelationship = "";
    expect(step1Valid(d)).toBe(false);
  });

  it("__OTHER__ relationship requires emergencyRelationshipOther filled", () => {
    const d = validDraft();
    d.customer.emergencyRelationship = "__OTHER__";
    d.customer.emergencyRelationshipOther = "";
    expect(step1Valid(d)).toBe(false);
    d.customer.emergencyRelationshipOther = "Cousin";
    expect(step1Valid(d)).toBe(true);
  });

  it("rejects when address < 5 chars and not addressUnknown", () => {
    const d = validDraft();
    d.customer.address = "ab";
    expect(step1Valid(d)).toBe(false);
  });

  it("addressUnknown = true bypasses address-length rule", () => {
    const d = validDraft();
    d.customer.address = "";
    d.customer.addressUnknown = true;
    expect(step1Valid(d)).toBe(true);
  });

  it("rejects when billing empty and not billingSame", () => {
    const d = validDraft();
    d.customer.billingSame = false;
    d.customer.billing = "";
    expect(step1Valid(d)).toBe(false);
  });

  it("rejects when delivery.date empty and not dateTbd", () => {
    const d = validDraft();
    d.delivery.date = "";
    expect(step1Valid(d)).toBe(false);
  });

  it("dateTbd = true bypasses date-required rule", () => {
    const d = validDraft();
    d.delivery.date = "";
    d.delivery.dateTbd = true;
    expect(step1Valid(d)).toBe(true);
  });

  it("rejects when outletId is null", () => {
    const d = validDraft();
    d.outletId = null;
    expect(step1Valid(d)).toBe(false);
  });

  it("rejects when salespersonId is null", () => {
    const d = validDraft();
    d.salespersonId = null;
    expect(step1Valid(d)).toBe(false);
  });
});

describe("composeEmergency", () => {
  it("joins name · phone · relationship", () => {
    const c = validDraft().customer;
    expect(composeEmergency(c)).toBe("Tan Junior · 012-9988776 · Spouse");
  });

  it("uses emergencyRelationshipOther when relationship is __OTHER__", () => {
    const c = validDraft().customer;
    c.emergencyRelationship = "__OTHER__";
    c.emergencyRelationshipOther = "Cousin";
    expect(composeEmergency(c)).toBe("Tan Junior · 012-9988776 · Cousin");
  });

  it("omits empty parts cleanly", () => {
    const c = validDraft().customer;
    c.emergencyPhone = "";
    expect(composeEmergency(c)).toBe("Tan Junior · Spouse");
  });
});

import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DRAFT_STORAGE_KEY,
  type WizardDraft,
  clearDraft,
  composeEmergency,
  dataUrlToBlob,
  emptyDraft,
  loadDraft,
  saveDraft,
  step1Valid,
  step2Valid,
  step3Valid,
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
      address: "",
      addressLine1: "123 Jalan Sample",
      addressLine2: "",
      addressState: "Kuala Lumpur",
      addressCity: "Bangsar",
      addressPostcode: "59000",
      addressUnknown: false,
      billing: "",
      billingSame: true,
      emergencyName: "Tan Junior",
      emergencyPhone: "012-9988776",
      emergencyRelationship: "Spouse",
      emergencyRelationshipOther: "",
    },
    delivery: { date: "2026-06-01", dateTbd: false, floor: 1, hasLift: false, stairItems: null },
    lines: [],
    addons: [],
    paid: 0,
    payment: {
      method: "online",
      approvalCode: "",
      installmentMonths: 6,
      slip: null,
    },
    signature: null,
    termsAccepted: false,
    wizardSessionId: null,
  };
}

/** A small valid PNG dataURL fixture — 1×1 transparent pixel. */
const TINY_PNG_DATAURL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";

function step3FilledDraft(): WizardDraft {
  // Returns a draft that passes step3Valid for method="online".
  const d = validDraft();
  d.lines = [
    {
      localId: "x1",
      sku: "mattress:cloud:queen",
      qty: 1,
      attrs: null,
      unitPrice: 2500,
      label: "Cloud · Queen",
    },
  ];
  d.signature = TINY_PNG_DATAURL;
  d.termsAccepted = true;
  d.payment.slip = {
    name: "slip.png",
    size: 1024,
    mime: "image/png",
    dataUrl: TINY_PNG_DATAURL,
  };
  // 2026-05-10 (Loo) — approval / reference code now required for every
  // payment method (including online). Mirrors the new step3Valid gate.
  d.payment.approvalCode = "FT2026050012345";
  d.wizardSessionId = "ddddddd1-dddd-dddd-dddd-dddddddddddd";
  d.paid = 1250;
  return d;
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

  it("rejects when addressLine1 < 5 chars and not addressUnknown", () => {
    const d = validDraft();
    d.customer.addressLine1 = "ab";
    expect(step1Valid(d)).toBe(false);
  });

  it("rejects when state/city/postcode missing", () => {
    const d = validDraft();
    d.customer.addressState = "";
    expect(step1Valid(d)).toBe(false);
    d.customer.addressState = "Selangor";
    d.customer.addressCity = "";
    expect(step1Valid(d)).toBe(false);
    d.customer.addressCity = "Petaling Jaya";
    d.customer.addressPostcode = "";
    expect(step1Valid(d)).toBe(false);
  });

  it("addressUnknown = true bypasses every address rule", () => {
    const d = validDraft();
    d.customer.addressLine1 = "";
    d.customer.addressState = "";
    d.customer.addressCity = "";
    d.customer.addressPostcode = "";
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

describe("step2Valid — at least one line", () => {
  it("returns false when lines empty even if addons exist", () => {
    const d = validDraft();
    d.lines = [];
    d.addons = [{ key: "warranty5", qty: 1, unitPrice: 200, name: "5-yr warranty" }];
    expect(step2Valid(d)).toBe(false);
  });

  it("returns true with one line", () => {
    const d = validDraft();
    d.lines = [
      {
        localId: "x1",
        sku: "mattress:carres-classic:queen",
        qty: 1,
        attrs: null,
        unitPrice: 1500,
        label: "Carres Classic · Queen",
      },
    ];
    expect(step2Valid(d)).toBe(true);
  });
});

describe("loadDraft backfills lines/addons for pre-2B.3 drafts", () => {
  it("returns empty arrays when an older draft (no lines/addons keys) is restored", () => {
    const oldShape = {
      outletId: "x",
      salespersonId: "y",
      customer: validDraft().customer,
      delivery: validDraft().delivery,
      // no lines/addons — saved before 2B.3
    };
    sessionStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(oldShape));
    const restored = loadDraft();
    expect(restored).not.toBeNull();
    expect(restored!.lines).toEqual([]);
    expect(restored!.addons).toEqual([]);
  });

  it("backfills Step 3 fields for drafts saved before 2B.3.c shipped", () => {
    // A 2B.3.b draft has lines/addons but no payment/signature/termsAccepted
    // /paid/wizardSessionId. Make sure loadDraft hands back a usable shape.
    const olderShape = {
      outletId: "x",
      salespersonId: "y",
      customer: validDraft().customer,
      delivery: validDraft().delivery,
      lines: [],
      addons: [],
    };
    sessionStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(olderShape));
    const restored = loadDraft();
    expect(restored).not.toBeNull();
    expect(restored!.paid).toBe(0);
    expect(restored!.payment.method).toBe("online");
    expect(restored!.payment.slip).toBeNull();
    expect(restored!.signature).toBeNull();
    expect(restored!.termsAccepted).toBe(false);
    expect(restored!.wizardSessionId).toBeNull();
  });
});

describe("step3Valid — Submit gate", () => {
  it("a fully filled Step 3 draft (online + slip) passes", () => {
    expect(step3Valid(step3FilledDraft())).toBe(true);
  });

  it("rejects when signature missing", () => {
    const d = step3FilledDraft();
    d.signature = null;
    expect(step3Valid(d)).toBe(false);
  });

  it("rejects when signature is not a PNG dataURL", () => {
    const d = step3FilledDraft();
    d.signature = "not-a-data-url";
    expect(step3Valid(d)).toBe(false);
  });

  it("rejects when termsAccepted is false", () => {
    const d = step3FilledDraft();
    d.termsAccepted = false;
    expect(step3Valid(d)).toBe(false);
  });

  it("rejects when slip missing (online)", () => {
    const d = step3FilledDraft();
    d.payment.slip = null;
    expect(step3Valid(d)).toBe(false);
  });

  // 2026-05-10 (Loo) — approval/reference code is now required for every
  // payment method, including online. Pins the gate so a future "online
  // doesn't need approval" regression doesn't slip through.
  it("rejects online method when approval / reference code is blank", () => {
    const d = step3FilledDraft();
    d.payment.method = "online";
    d.payment.approvalCode = "";
    expect(step3Valid(d)).toBe(false);
    d.payment.approvalCode = "AB";
    expect(step3Valid(d)).toBe(false);
    d.payment.approvalCode = "FT2026050012345";
    expect(step3Valid(d)).toBe(true);
  });

  it("rejects credit method when approval code < 3 chars", () => {
    const d = step3FilledDraft();
    d.payment.method = "credit";
    d.payment.approvalCode = "AB";
    expect(step3Valid(d)).toBe(false);
    d.payment.approvalCode = "ABC123";
    expect(step3Valid(d)).toBe(true);
  });

  it("rejects installment with bogus months value", () => {
    const d = step3FilledDraft();
    d.payment.method = "installment";
    d.payment.approvalCode = "INST-9981";
    // @ts-expect-error -- type is 6|12 but loadDraft can backfill anything
    d.payment.installmentMonths = 9;
    expect(step3Valid(d)).toBe(false);
    d.payment.installmentMonths = 12;
    expect(step3Valid(d)).toBe(true);
  });

  it("rejects negative paid", () => {
    const d = step3FilledDraft();
    d.paid = -50;
    expect(step3Valid(d)).toBe(false);
  });
});

describe("dataUrlToBlob", () => {
  it("converts a base64 PNG dataURL into a Blob with correct MIME", () => {
    const blob = dataUrlToBlob(TINY_PNG_DATAURL);
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.type).toBe("image/png");
    expect(blob.size).toBeGreaterThan(0);
  });

  it("throws on malformed input", () => {
    expect(() => dataUrlToBlob("garbage")).toThrow();
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

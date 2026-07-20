import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DRAFT_STORAGE_KEY,
  type WizardDraft,
  clearDraft,
  composeDisposalSizeSummary,
  composeEmergency,
  dataUrlToBlob,
  disposalUnitSizes,
  emptyDraft,
  loadDraft,
  saveDraft,
  step1Valid,
  step2FirstDisposalIssue,
  step2Valid,
  step3DateFirstIssue,
  step3DateValid,
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
      buildingType: "",
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

describe("step1Valid — 0200 demographics gate (POS-required, server-lenient)", () => {
  it("fails on missing/invalid email", () => {
    const d = validDraft();
    d.customer.email = "";
    expect(step1Valid(d)).toBe(false);
    d.customer.email = "not-an-email";
    expect(step1Valid(d)).toBe(false);
  });
  it.each([["race"], ["gender"], ["birthday"]] as const)("fails on empty %s", (field) => {
    const d = validDraft();
    d.customer[field] = "";
    expect(step1Valid(d)).toBe(false);
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

  // 2026-07-19 (Loo) — billing keys in with the SAME MY cascade as delivery,
  // so the gate requires the full cascade field-for-field.
  it("billing cascade gates like delivery when not billingSame", () => {
    const d = validDraft();
    d.customer.billingSame = false;
    d.customer.billingLine1 = "88 Jalan Invoice";
    d.customer.billingState = "Selangor";
    d.customer.billingCity = "Petaling Jaya";
    d.customer.billingPostcode = "46200";
    expect(step1Valid(d)).toBe(true);
    d.customer.billingPostcode = "";
    expect(step1Valid(d)).toBe(false);
    d.customer.billingPostcode = "46200";
    d.customer.billingState = "";
    expect(step1Valid(d)).toBe(false);
    d.customer.billingState = "Selangor";
    d.customer.billingLine1 = "88";
    expect(step1Valid(d)).toBe(false);
  });

  // 2026-05-22 (Loo) — delivery date validation moved from step 1 to step 3
  // (new dedicated step) because the min-date constraint depends on cart
  // contents. Those gating tests now live under the `step3DateValid` block
  // below. Step 1 no longer cares about delivery.date.
  it("ignores delivery.date — step 1 no longer gates on it", () => {
    const d = validDraft();
    d.delivery.date = "";
    d.delivery.dateTbd = false;
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

  it("mattress/bedframe disposal still gates on size; sofa + operator-created dispose add-ons do NOT (Loo 2026-07-12)", () => {
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
    // Size-less mattress disposal → blocked.
    d.addons = [{ key: "dispose-mattress", qty: 1, unitPrice: 80, name: "Dispose old mattress", attrs: {} }];
    expect(step2Valid(d)).toBe(false);
    // Sized → ok.
    d.addons = [{ key: "dispose-mattress", qty: 1, unitPrice: 80, name: "Dispose old mattress", attrs: { size: "Queen" } }];
    expect(step2Valid(d)).toBe(true);
    // Sofa disposal + a new operator-created dispose-* add-on: no size needed.
    d.addons = [
      { key: "dispose-sofa", qty: 1, unitPrice: 50, name: "Dispose old sofa (small size)" },
      { key: "dispose-old-sofa-big-sofa", qty: 1, unitPrice: 80, name: "Dispose old sofa (big sofa)" },
    ];
    expect(step2Valid(d)).toBe(true);
  });

  // Loo 2026-07-21 — qty > 1 may mix sizes (one Single + one Queen old
  // mattress): EVERY unit needs its own size before the gate opens.
  it("qty 2 disposal needs a size PER UNIT — one size alone no longer passes", () => {
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
    // Legacy single size on qty 2 → only unit 1 covered → blocked.
    d.addons = [{ key: "dispose-mattress", qty: 2, unitPrice: 80, name: "Dispose old mattress", attrs: { size: "Queen" } }];
    expect(step2Valid(d)).toBe(false);
    expect(step2FirstDisposalIssue(d)).toContain("each of the 2");
    // Per-unit sizes complete (mixed) → ok.
    d.addons = [
      {
        key: "dispose-mattress",
        qty: 2,
        unitPrice: 80,
        name: "Dispose old mattress",
        attrs: { sizes: ["Queen", "Single"], size: "Queen + Single" },
      },
    ];
    expect(step2Valid(d)).toBe(true);
    // A hole in the middle still blocks.
    d.addons = [
      {
        key: "dispose-mattress",
        qty: 3,
        unitPrice: 80,
        name: "Dispose old mattress",
        attrs: { sizes: ["Queen", "", "Single"] },
      },
    ];
    expect(step2Valid(d)).toBe(false);
  });

  it("disposalUnitSizes normalizes to qty length; legacy single size seeds unit 1", () => {
    const base = { key: "dispose-mattress", unitPrice: 80, name: "Dispose old mattress" };
    expect(disposalUnitSizes({ ...base, qty: 2, attrs: { size: "Queen" } })).toEqual(["Queen", ""]);
    expect(disposalUnitSizes({ ...base, qty: 1, attrs: { sizes: ["Queen", "Single"] } })).toEqual(["Queen"]);
    expect(disposalUnitSizes({ ...base, qty: 2, attrs: {} })).toEqual(["", ""]);
  });

  // 0242 — size lists are config: a staged addon carrying sizeOptions gates
  // regardless of its key; one with neither config nor a legacy list never does.
  it("config-driven sizeOptions gates any addon key; no list = no gate", () => {
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
    // Custom add-on with a configured list → size required.
    d.addons = [
      {
        key: "dispose-wardrobe",
        qty: 1,
        unitPrice: 120,
        name: "Dispose old wardrobe",
        sizeOptions: ["Small", "Large"],
        attrs: {},
      },
    ];
    expect(step2Valid(d)).toBe(false);
    d.addons[0].attrs = { sizes: ["Large"], size: "Large" };
    expect(step2Valid(d)).toBe(true);
    // Same key with NO config and no legacy entry → never gates.
    d.addons = [{ key: "dispose-wardrobe", qty: 2, unitPrice: 120, name: "Dispose old wardrobe" }];
    expect(step2Valid(d)).toBe(true);
  });

  it("composeDisposalSizeSummary groups repeats and joins mixed sizes", () => {
    expect(composeDisposalSizeSummary(["Queen"])).toBe("Queen");
    expect(composeDisposalSizeSummary(["Queen", "Queen"])).toBe("Queen ×2");
    expect(composeDisposalSizeSummary(["Queen", "Single"])).toBe("Queen + Single");
    expect(composeDisposalSizeSummary(["Queen", ""])).toBe("Queen");
    expect(composeDisposalSizeSummary(["", ""])).toBe("");
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

describe("step3DateValid — delivery date gate (2026-05-22, Loo)", () => {
  // Frozen "today" to make lead-time math deterministic. Picked an arbitrary
  // weekday in early 2026; tests below compute (today + minLeadDays) and
  // compare ISO strings.
  const TODAY = new Date("2026-06-01T00:00:00Z");

  function isoToday(plus: number): string {
    const d = new Date(TODAY);
    d.setUTCDate(d.getUTCDate() + plus);
    return d.toISOString().slice(0, 10);
  }

  it("accepts dateTbd regardless of lead time", () => {
    const d = validDraft();
    d.delivery.date = "";
    d.delivery.dateTbd = true;
    expect(step3DateValid(d, 21, TODAY)).toBe(true);
  });

  it("rejects when date empty and not TBD", () => {
    const d = validDraft();
    d.delivery.date = "";
    d.delivery.dateTbd = false;
    expect(step3DateValid(d, 14, TODAY)).toBe(false);
    expect(step3DateFirstIssue(d, 14, TODAY)).toContain("pick a date");
  });

  it("rejects mattress date < today + 14", () => {
    const d = validDraft();
    d.delivery.date = isoToday(10); // 10 days out — below 14-day floor
    expect(step3DateValid(d, 14, TODAY)).toBe(false);
  });

  it("accepts mattress date == today + 14", () => {
    const d = validDraft();
    d.delivery.date = isoToday(14);
    d.delivery.proceedDate = isoToday(0);
    expect(step3DateValid(d, 14, TODAY)).toBe(true);
  });

  it("rejects sofa date < today + 21", () => {
    const d = validDraft();
    d.delivery.date = isoToday(20);
    expect(step3DateValid(d, 21, TODAY)).toBe(false);
  });

  it("accepts sofa date == today + 21", () => {
    const d = validDraft();
    d.delivery.date = isoToday(21);
    d.delivery.proceedDate = isoToday(0);
    expect(step3DateValid(d, 21, TODAY)).toBe(true);
  });

  it("accepts any future date when minLeadDays = 0 (non-gated cart)", () => {
    const d = validDraft();
    d.delivery.date = isoToday(1);
    d.delivery.proceedDate = isoToday(0);
    expect(step3DateValid(d, 0, TODAY)).toBe(true);
  });

  // Phase 11.1 — proceed (production-start) date validation.
  it("rejects when proceed date is missing", () => {
    const d = validDraft();
    d.delivery.date = isoToday(21);
    d.delivery.proceedDate = "";
    expect(step3DateValid(d, 14, TODAY)).toBe(false);
    expect(step3DateFirstIssue(d, 14, TODAY)).toContain("Proceed date");
  });

  it("rejects when proceed date is after the delivery date", () => {
    const d = validDraft();
    d.delivery.date = isoToday(14);
    d.delivery.proceedDate = isoToday(20);
    expect(step3DateValid(d, 14, TODAY)).toBe(false);
    expect(step3DateFirstIssue(d, 14, TODAY)).toContain("on or before");
  });

  it("rejects when proceed date is in the past", () => {
    const d = validDraft();
    d.delivery.date = isoToday(14);
    d.delivery.proceedDate = isoToday(-3);
    expect(step3DateValid(d, 14, TODAY)).toBe(false);
    expect(step3DateFirstIssue(d, 14, TODAY)).toContain("past");
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

  // 0224 — Stripe online collection: proof is system-generated (PaymentIntent
  // ref + hosted receipt), so no slip / approval code; the only payment
  // requirement is an amount > 0 to mint the Checkout link with.
  it("stripe method passes WITHOUT slip or approval code when paid > 0", () => {
    const d = step3FilledDraft();
    d.payment.method = "stripe";
    d.payment.slip = null;
    d.payment.approvalCode = "";
    d.paid = 500;
    expect(step3Valid(d)).toBe(true);
  });

  it("stripe method rejects when the collect amount is 0", () => {
    const d = step3FilledDraft();
    d.payment.method = "stripe";
    d.payment.slip = null;
    d.paid = 0;
    expect(step3Valid(d)).toBe(false);
  });

  it("stripe method still requires signature + terms", () => {
    const d = step3FilledDraft();
    d.payment.method = "stripe";
    d.payment.slip = null;
    d.paid = 500;
    d.termsAccepted = false;
    expect(step3Valid(d)).toBe(false);
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

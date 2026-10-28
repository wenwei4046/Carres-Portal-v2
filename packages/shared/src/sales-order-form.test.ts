import { describe, expect, it } from "vitest";
import * as shared from "./index";
import {
  composeEmergencyContact,
  isKnownEmergencyRelationship,
  parseEmergencyContact,
} from "./sales-order-form";

describe("emergency contact — three fields, one column", () => {
  it("composes the three parts with the column's separator", () => {
    expect(
      composeEmergencyContact({ name: "Alice", phone: "012-3456789", relationship: "Spouse" }),
    ).toBe("Alice · 012-3456789 · Spouse");
  });

  it("drops a TRAILING empty part rather than leaving dangling separators", () => {
    expect(composeEmergencyContact({ name: "Alice", phone: "", relationship: "" })).toBe("Alice");
    expect(composeEmergencyContact({ name: "", phone: "", relationship: "" })).toBe("");
    expect(
      composeEmergencyContact({ name: "Alice", phone: "012-3456789", relationship: "" }),
    ).toBe("Alice · 012-3456789");
  });

  /* ⭐ AND KEEPS AN EMPTY SLOT THAT STILL HAS SOMETHING AFTER IT (YH,
     2026-09-01 — audit F-4).
     Dropping EVERY empty part loses the POSITION of the ones that remain, and
     `parseEmergencyContact` reads by position. A contact saved with no name
     came back with the PHONE in the name box and the relationship in the phone
     box — silently, on reload, with nothing failing. */
  it("keeps an empty slot when a later part is present, so nothing shifts left", () => {
    expect(
      composeEmergencyContact({ name: "", phone: "012-3456789", relationship: "Spouse" }),
    ).toBe(" · 012-3456789 · Spouse");
    expect(
      composeEmergencyContact({ name: "Alice", phone: "", relationship: "Spouse" }),
    ).toBe("Alice ·  · Spouse");
  });

  it("brings a nameless contact back as a nameless contact, not a shifted one", () => {
    const parts = { name: "", phone: "012-3456789", relationship: "Spouse" };
    expect(parseEmergencyContact(composeEmergencyContact(parts))).toEqual(parts);
    /* THE OLD BEHAVIOUR, pinned as the thing that must not return: the phone
       arriving in the name box. */
    expect(parseEmergencyContact(composeEmergencyContact(parts)).name).not.toBe("012-3456789");
  });

  it("round-trips EVERY combination of the three parts", () => {
    /* Eight shapes, and the four with a hole in them are the ones that were
       broken. A property test rather than eight assertions, because the next
       person to touch the separator needs to fail on all of them at once. */
    for (const name of ["", "Alice"]) {
      for (const phone of ["", "012-3456789"]) {
        for (const relationship of ["", "Spouse"]) {
          const parts = { name, phone, relationship };
          expect(
            parseEmergencyContact(composeEmergencyContact(parts)),
            JSON.stringify(parts),
          ).toEqual(parts);
        }
      }
    }
  });

  it("parses what it composed, part for part", () => {
    expect(parseEmergencyContact("Alice · 012-3456789 · Spouse")).toEqual({
      name: "Alice",
      phone: "012-3456789",
      relationship: "Spouse",
    });
  });

  /* THE ROUND TRIP IS THE WHOLE GUARANTEE. An operator who opens the object
     page and edits the phone number must not silently rewrite a legacy string
     they never looked at. */
  it("round-trips a legacy or hand-typed string without changing one character", () => {
    for (const stored of [
      "Alice · 012-3456789 · Spouse",
      "Alice",
      "call her mother, no number",
      "Alice · 012-3456789",
      "Alice · 012-3456789 · Sister · after 6pm",
    ]) {
      expect(composeEmergencyContact(parseEmergencyContact(stored))).toBe(stored);
    }
  });

  it("reads a null column as three empty fields", () => {
    expect(parseEmergencyContact(null)).toEqual({ name: "", phone: "", relationship: "" });
    expect(parseEmergencyContact(undefined)).toEqual({ name: "", phone: "", relationship: "" });
  });

  it("knows which relationships the picker offers", () => {
    expect(isKnownEmergencyRelationship("Spouse")).toBe(true);
    expect(isKnownEmergencyRelationship("Sister-in-law")).toBe(false);
    expect(isKnownEmergencyRelationship("")).toBe(false);
  });
});

/**
 * ⭐ TWO DATES, TWO NAMES — owner ruling 2026-10-06 (Jess; Orders MASTER
 * § Two dates, two names; COPY-STANDARD). `orders.proceed_date` is the day Sales
 * PLANS production to start and reads `Planned production start` on every
 * surface; `Proceed Date` is only the actual hand-off (`orders.proceeded_at`).
 * The expected words are written out here, not read from the constants, so the
 * old name cannot come back through a constant nobody re-read.
 */
describe("Planned production start — the shared words", () => {
  const posBody = {
    outletId: "00000000-0000-0000-0000-00000000ee01",
    salespersonId: "00000000-0000-0000-0000-00000000ff01",
    customer: { name: "Tan", phone: "012-3456789", address: "1 Jalan A, KL", addressUnknown: false, addressState: "Kuala Lumpur", billing: null, billingSame: true, emergency: "" },
    delivery: { date: "2026-10-01", proceedDate: "2026-09-15", dateTbd: false, floor: 1, hasLift: false },
    lines: [{ sku: "mattress:carres-classic:queen", qty: 1, attrs: null, unitPrice: 1500 }],
    addons: [], paid: 100, signaturePath: "orders-attachments/d1/w1/signature.png", paymentSlipPath: null,
    termsAccepted: true as const, depositPct: 10, paymentMethod: "cash", approvalCode: "ABC123",
    installmentMonths: null, entryData: { fields: { building_type: "Condo" } },
  };
  const messages = (r: { success: boolean; error?: { issues: Array<{ message: string }> } }) =>
    r.success ? [] : (r.error?.issues ?? []).map((i) => i.message);

  it("names the planned date `Planned production start` on every shared surface", () => {
    expect(shared.PLANNED_PRODUCTION_START).toBe("Planned production start");
    expect(shared.TO_ORDER_WORDS.proceedDate).toBe("Planned production start");
    expect(shared.POS_FORM_BUILTINS.find((f) => f.key === "proceedDate")?.label).toBe("Planned production start");
    expect(shared.SO_GRID_COLUMNS.find((c) => c.key === "proceed_date")?.label).toBe("Planned production start");
  });

  it("every door refuses with the governed sentences", () => {
    const missing = shared.createOrderInputSchema.safeParse({ ...posBody, delivery: { ...posBody.delivery, proceedDate: null } });
    expect(messages(missing)).toContain("Planned production start: pick the day production should start");
    const late = shared.createOrderInputSchema.safeParse({ ...posBody, delivery: { ...posBody.delivery, proceedDate: "2026-10-02" } });
    expect(messages(late)).toContain("Planned production start: must be on or before the delivery date");
    const dateLate = shared.setOrderDateInputSchema.safeParse({ date: "2026-10-01", proceedDate: "2026-10-02" });
    expect(messages(dateLate)).toEqual(["Planned production start: must be on or before the delivery date"]);
    expect(shared.plannedProductionStartInPast("2026-10-06")).toBe("Planned production start: can't be in the past (earliest 2026-10-06)");
  });

  it("maps every database refusal by its DETAIL code, and leaves other codes alone", () => {
    expect(shared.plannedProductionStartRefusal("proceed_date_required")).toBe("Planned production start: pick the day production should start");
    expect(shared.plannedProductionStartRefusal("invalid_proceed_date")).toBe("Planned production start: pick the day production should start");
    expect(shared.plannedProductionStartRefusal("proceed_after_delivery")).toBe("Planned production start: must be on or before the delivery date");
    expect(shared.plannedProductionStartRefusal("proceed_date_recorded")).toBe("The planned production start is already recorded and cannot be changed here");
    expect(shared.plannedProductionStartRefusal("proceed_date_passed")).toBe("The planned production start has passed");
    expect(shared.plannedProductionStartRefusal("proceed_locked_fields")).toBeNull();
    expect(shared.plannedProductionStartRefusal(null)).toBeNull();
  });

  it("no shared word for the planned date still says `Proceed`", () => {
    const words = [
      shared.TO_ORDER_WORDS.proceedDate,
      shared.POS_FORM_BUILTINS.find((f) => f.key === "proceedDate")?.label,
      shared.SO_GRID_COLUMNS.find((c) => c.key === "proceed_date")?.label,
      ...Object.values(shared.PLANNED_PRODUCTION_START_REFUSALS),
    ];
    for (const w of words) expect(w).not.toMatch(/proceed/i);
  });
});

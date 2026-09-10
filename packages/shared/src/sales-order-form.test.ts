import { describe, expect, it } from "vitest";
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

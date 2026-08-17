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

  it("drops empty parts rather than leaving dangling separators", () => {
    expect(composeEmergencyContact({ name: "Alice", phone: "", relationship: "" })).toBe("Alice");
    expect(composeEmergencyContact({ name: "", phone: "", relationship: "" })).toBe("");
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

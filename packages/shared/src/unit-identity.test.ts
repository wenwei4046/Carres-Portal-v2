import { describe, it, expect } from "vitest";
import {
  unitIdOf,
  isExactUnit,
  displayUnitId,
  normaliseUnitIdQuery,
  matchesUnitId,
  canonicalUnitIdFrom,
  looksLikeUnitId,
  UNIT_ID_PATTERN,
  QUANTITY_KEY_PATTERN,
  LEGACY_UNIT_ID_PATTERN,
  NO_UNIT_ID,
} from "./unit-identity";

/**
 * CARD-2026-09-07-purchasing-10 · the Unit ID correction.
 *
 * The owner-approved outcome these hold: every page, document and scan flow
 * uses the same authoritative Unit ID; new exact-unit goods are `U1-000-001`;
 * quantity-only goods NEVER display a technical database key.
 */

describe("the approved identity, and the shapes that are not one", () => {
  it("accepts the approved Unit ID and rejects the technical key", () => {
    expect(UNIT_ID_PATTERN.test("U1-000-001")).toBe(true);
    expect(UNIT_ID_PATTERN.test("U12-345-678")).toBe(true);
    expect(QUANTITY_KEY_PATTERN.test("QTY-000000001")).toBe(true);
    expect(LEGACY_UNIT_ID_PATTERN.test("id-aam135002")).toBe(true);

    // the shapes that must never pass for an identity
    expect(UNIT_ID_PATTERN.test("u1-000-001")).toBe(false);
    expect(UNIT_ID_PATTERN.test("QTY-000000001")).toBe(false);
    expect(UNIT_ID_PATTERN.test("id-aam135002")).toBe(false);
  });
});

describe("unitIdOf — the ONE resolver", () => {
  it("gives an exact unit its stored identity, unchanged", () => {
    expect(unitIdOf({ unitCode: "U1-000-082", identityScope: "unit" })).toBe(
      "U1-000-082",
    );
  });

  it("gives COUNTED GOODS no identity at all — never the technical key", () => {
    const counted = { unitCode: "QTY-000000001", identityScope: "quantity" };
    expect(unitIdOf(counted)).toBeNull();
    expect(isExactUnit(counted)).toBe(false);
    expect(displayUnitId(counted)).toBe(NO_UNIT_ID);
  });

  it("refuses a QTY key even when a caller claims the scope is 'unit'", () => {
    // Shape is the backstop: a reader that guesses wrong still cannot leak it.
    expect(unitIdOf({ unitCode: "QTY-000000009", identityScope: "unit" })).toBeNull();
  });

  it("still hides a counted key from a reader that has no scope at all", () => {
    // Every surface written before 0453 exposed `identity_scope`.
    expect(unitIdOf({ unitCode: "QTY-000000009" })).toBeNull();
    expect(unitIdOf({ unitCode: "U1-000-001" })).toBe("U1-000-001");
  });

  it("treats a missing or blank code as no identity, never as an empty label", () => {
    expect(unitIdOf({ unitCode: null })).toBeNull();
    expect(unitIdOf({ unitCode: "   " })).toBeNull();
    expect(displayUnitId({ unitCode: null })).toBe(NO_UNIT_ID);
  });
});

describe("historical identities are PRESERVED, never rewritten", () => {
  it("displays a grandfathered id- code exactly as stored", () => {
    // 140 of these are on real labels and on supplier PDFs already sent.
    // Display never upper-cases, never renumbers, never substitutes.
    const legacy = { unitCode: "id-aam135002", identityScope: "unit" };
    expect(unitIdOf(legacy)).toBe("id-aam135002");
    expect(displayUnitId(legacy)).toBe("id-aam135002");
    expect(isExactUnit(legacy)).toBe(true);
  });

  it("keeps an existing label traceable — the stored code still finds it", () => {
    const legacy = { unitCode: "id-aam135002", identityScope: "unit" };
    expect(matchesUnitId(legacy, "id-aam135002")).toBe(true);
    expect(matchesUnitId(legacy, "ID-AAM135002")).toBe(true);
    expect(matchesUnitId(legacy, "id aam135002")).toBe(true);
  });
});

describe("search accepts variation; display and printing do not", () => {
  it("normalises case and every separator on INPUT", () => {
    expect(normaliseUnitIdQuery("U1-000-001")).toBe("u1000001");
    expect(normaliseUnitIdQuery(" u1 000 001 ")).toBe("u1000001");
    expect(normaliseUnitIdQuery("u1_000/001")).toBe("u1000001");
  });

  it("finds one Unit however the operator or scanner spelled it", () => {
    const unit = { unitCode: "U1-000-001", identityScope: "unit" };
    for (const typed of [
      "U1-000-001",
      "u1-000-001",
      "U1 000 001",
      "u1000001",
      "  U1-000-001  ",
    ]) {
      expect(matchesUnitId(unit, typed)).toBe(true);
    }
  });

  it("does not confuse two different Units", () => {
    const unit = { unitCode: "U1-000-001", identityScope: "unit" };
    expect(matchesUnitId(unit, "U1-000-002")).toBe(false);
    expect(matchesUnitId(unit, "")).toBe(false);
  });

  it("makes a counted row unfindable as an identity", () => {
    const counted = { unitCode: "QTY-000000001", identityScope: "quantity" };
    expect(matchesUnitId(counted, "QTY-000000001")).toBe(false);
    expect(matchesUnitId(counted, "qty000000001")).toBe(false);
  });
});

describe("canonicalUnitIdFrom — a scan key, never a stored value", () => {
  it("rebuilds the canonical spelling from a stripped scan", () => {
    expect(canonicalUnitIdFrom("u1000001")).toBe("U1-000-001");
    expect(canonicalUnitIdFrom("U1 000 001")).toBe("U1-000-001");
    expect(canonicalUnitIdFrom("u12345678")).toBe("U12-345-678");
  });

  it("refuses anything that cannot be a Unit ID", () => {
    expect(canonicalUnitIdFrom("QTY-000000001")).toBeNull();
    expect(canonicalUnitIdFrom("id-aam135002")).toBeNull();
    expect(canonicalUnitIdFrom("u1")).toBeNull();
    expect(canonicalUnitIdFrom("")).toBeNull();
    expect(canonicalUnitIdFrom("u0000001")).toBeNull(); // a series is not padded
  });
});

describe("looksLikeUnitId", () => {
  it("admits both real identity shapes and nothing else", () => {
    expect(looksLikeUnitId("U1-000-001")).toBe(true);
    expect(looksLikeUnitId("id-aam135002")).toBe(true);
    expect(looksLikeUnitId("QTY-000000001")).toBe(false);
    expect(looksLikeUnitId("MATTRESS-PROTECTOR")).toBe(false);
  });
});

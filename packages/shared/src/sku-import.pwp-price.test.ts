import { describe, expect, it } from "vitest";
import { csvRecordToImportRow, hasPricingIntent, skuImportInput } from "./sku-import";

/**
 * THE IMPORT CARRIES pwp_price (2026-08-24) — the same journey supplier_code
 * took in 0376, for the same reason: keying a promotion's reward prices one
 * SKU at a time is the exact work the batch importer exists to avoid, and a
 * pwp_price column in the sheet was silently DISCARDED while the import
 * reported success.
 *
 * ⭐ ABSENT IS NOT BLANK, and the whole importer turns on that distinction:
 *
 *     no pwp_price column   →  key OMITTED  →  server PRESERVES what is stored
 *     column present, blank →  key OMITTED  →  same (a blank never clears here)
 *     column present, value →  key SENT     →  server writes it
 *
 * ⭐ AND 0 IS NOT A PRICE. The 0186 law is `p == null || p <= 0` means NOT SET;
 * the POS never offers it and Confirm refuses it. A literal 0 cell FAILS THE
 * ROW rather than sliding through as a value nothing can ever spend.
 *
 * ⭐ AND IT IS MONEY. pwp_price is principal-locked by the extended 0175
 * trigger, so it counts as pricing intent — a non-principal's batch carrying
 * it is refused whole, before anything runs.
 */
const BASE = {
  model: "Hookka Lounger",
  category: "sofa",
  variant: "3-Seater",
};

describe("csvRecordToImportRow — pwp_price", () => {
  it("carries the price when the column has a value", () => {
    const r = csvRecordToImportRow({ ...BASE, pwp_price: "199.50" });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.row.pwpPrice).toBe(199.5);
  });

  it("OMITS the key when the file has no such column — the preserve case", () => {
    const r = csvRecordToImportRow({ ...BASE });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.row).not.toHaveProperty("pwpPrice");
      expect(r.row.pwpPrice).toBeUndefined();
    }
  });

  it("OMITS the key for a blank cell, exactly like price and cost", () => {
    // Blank = "no value in this file", not "clear it" — the same rule that
    // keeps a blank price cell from zeroing a price on re-import.
    for (const blank of ["", "   "]) {
      const r = csvRecordToImportRow({ ...BASE, pwp_price: blank });
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.row).not.toHaveProperty("pwpPrice");
    }
  });

  it("⭐ a literal 0 FAILS THE ROW — 0 means NOT SET, never free", () => {
    // Silently dropping the cell would tell the keyer their sheet worked when
    // the system cannot mean what it says. A free reward is a 'promo' rule.
    const r = csvRecordToImportRow({ ...BASE, pwp_price: "0" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/above 0/i);
  });

  it("a negative value fails the row too", () => {
    const r = csvRecordToImportRow({ ...BASE, pwp_price: "-50" });
    expect(r.ok).toBe(false);
  });

  it("a non-number fails the row with the column named", () => {
    const r = csvRecordToImportRow({ ...BASE, pwp_price: "free" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/pwp_price/);
  });

  it("matches the header case-insensitively, like every other header", () => {
    const r = csvRecordToImportRow({ ...BASE, PWP_PRICE: "88" });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.row.pwpPrice).toBe(88);
  });

  it("does not disturb the row's other money fields", () => {
    const r = csvRecordToImportRow({ ...BASE, pwp_price: "88", price: "1950", cost: "900" });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.row.price).toBe(1950);
      expect(r.row.cost).toBe(900);
      expect(r.row.pwpPrice).toBe(88);
    }
  });
});

describe("the server mirror — schema and pricing intent", () => {
  const good = {
    model: "Hookka Lounger",
    modelKey: "hookka-lounger",
    category: "sofa" as const,
    variant: "3-Seater",
  };

  it("the strict schema admits pwpPrice — a valid row must not 422", () => {
    expect(skuImportInput.safeParse({ rows: [{ ...good, pwpPrice: 88 }] }).success).toBe(true);
  });

  it("the strict schema REFUSES 0 — the mapper's law holds for hand-built payloads too", () => {
    expect(skuImportInput.safeParse({ rows: [{ ...good, pwpPrice: 0 }] }).success).toBe(false);
  });

  it("⭐ pwpPrice IS pricing intent — a non-principal batch carrying it is refused whole", () => {
    // The route gates on this before anything runs; without it, an operation
    // user's import would fail row by row on the 0175 trigger instead.
    expect(hasPricingIntent([{ pwpPrice: 88 }])).toBe(true);
    expect(hasPricingIntent([{ price: 100 }])).toBe(true);
    expect(hasPricingIntent([{}])).toBe(false);
  });
});

import { describe, expect, it } from "vitest";

import {
  explodeBundle,
  parseBundleComponents,
  type BundleComponent,
} from "./product-bundle";

const centsTotal = (lines: { qty: number; unitPrice: number }[]): number =>
  lines.reduce((s, l) => s + Math.round(l.unitPrice * 100) * l.qty, 0);

describe("parseBundleComponents", () => {
  it("keeps well-formed entries and trims sku", () => {
    expect(
      parseBundleComponents([
        { sku: " MAT-001-K ", qty: 1 },
        { sku: "BED-201-K", qty: 2 },
      ]),
    ).toEqual([
      { sku: "MAT-001-K", qty: 1 },
      { sku: "BED-201-K", qty: 2 },
    ]);
  });

  it("drops malformed entries (bad sku / qty / non-object / non-array)", () => {
    expect(parseBundleComponents(null)).toEqual([]);
    expect(parseBundleComponents("nope")).toEqual([]);
    expect(
      parseBundleComponents([
        { sku: "", qty: 1 },
        { sku: "OK-1", qty: 0 },
        { sku: "OK-2", qty: 1.5 },
        { sku: "OK-3", qty: "2" }, // Number("2") is an integer — kept
        42,
        null,
        { qty: 3 },
        { sku: "KEEP", qty: 1 },
      ]),
    ).toEqual([
      { sku: "OK-3", qty: 2 },
      { sku: "KEEP", qty: 1 },
    ]);
  });
});

describe("explodeBundle", () => {
  // The real bundle this feature ships for: Cloud King (3490) + Lumi King
  // (1000) + Kayu King (3490) sold at RM 2,500.
  const KING: BundleComponent[] = [
    { sku: "MAT-001-K", qty: 1 },
    { sku: "LUMI-CLASSIC-K", qty: 1 },
    { sku: "BED-201-K", qty: 1 },
  ];
  const KING_PRICES: Record<string, number> = {
    "MAT-001-K": 3490,
    "LUMI-CLASSIC-K": 1000,
    "BED-201-K": 3490,
  };

  it("splits the King bundle proportionally and sums EXACTLY to 2500.00", () => {
    const r = explodeBundle(KING, 2500, (sku) => KING_PRICES[sku]);
    expect(r.ok).toBe(true);
    expect(r.missingSkus).toEqual([]);
    expect(r.catalogTotal).toBe(7980);
    expect(r.lines).toHaveLength(3);
    expect(centsTotal(r.lines)).toBe(250000);
    // Proportional shares: 3490/7980·2500 ≈ 1093.36 · 1000/7980·2500 ≈ 313.28.
    const bySku = new Map(r.lines.map((l) => [l.sku, l.unitPrice]));
    expect(bySku.get("MAT-001-K")).toBeCloseTo(1093.36, 1);
    expect(bySku.get("LUMI-CLASSIC-K")).toBeCloseTo(313.28, 1);
    expect(bySku.get("BED-201-K")).toBeCloseTo(1093.36, 1);
    // Equal-priced components stay equal (same catalog price → same split).
    expect(bySku.get("MAT-001-K")).toBe(bySku.get("BED-201-K"));
    // Every unit price is clean 2dp.
    for (const l of r.lines) {
      expect(Math.round(l.unitPrice * 100)).toBeCloseTo(l.unitPrice * 100, 6);
    }
  });

  it("keeps Σ exact for a cent-carrying bundle price", () => {
    const r = explodeBundle(KING, 2499.99, (sku) => KING_PRICES[sku]);
    expect(r.ok).toBe(true);
    expect(centsTotal(r.lines)).toBe(249999);
  });

  it("splits a qty>1 component into two lines a cent apart when needed", () => {
    // 3 units of a 100-catalog SKU sold at 100 → 33.33/33.33/33.34.
    const r = explodeBundle([{ sku: "A", qty: 3 }], 100, () => 100);
    expect(r.ok).toBe(true);
    expect(centsTotal(r.lines)).toBe(10000);
    expect(r.lines).toHaveLength(2);
    // Higher-price slot first; slots are emit-ordered.
    expect(r.lines[0]).toMatchObject({ slot: 0, sku: "A", qty: 1, unitPrice: 33.34 });
    expect(r.lines[1]).toMatchObject({ slot: 1, sku: "A", qty: 2, unitPrice: 33.33 });
  });

  it("falls back to an equal per-unit split when every catalog price is 0", () => {
    const r = explodeBundle(
      [
        { sku: "A", qty: 1 },
        { sku: "B", qty: 2 },
      ],
      90,
      () => 0,
    );
    expect(r.ok).toBe(true);
    expect(centsTotal(r.lines)).toBe(9000);
    expect(r.lines).toEqual([
      { slot: 0, sku: "A", qty: 1, unitPrice: 30 },
      { slot: 1, sku: "B", qty: 2, unitPrice: 30 },
    ]);
  });

  it("refuses when a component's catalog price is unknown", () => {
    const r = explodeBundle(KING, 2500, (sku) =>
      sku === "BED-201-K" ? null : KING_PRICES[sku],
    );
    expect(r.ok).toBe(false);
    expect(r.lines).toEqual([]);
    expect(r.missingSkus).toEqual(["BED-201-K"]);
  });

  it("refuses an empty component list or a bad bundle price", () => {
    expect(explodeBundle([], 2500, () => 100).ok).toBe(false);
    expect(explodeBundle(KING, -1, () => 100).ok).toBe(false);
    expect(explodeBundle(KING, Number.NaN, () => 100).ok).toBe(false);
  });

  it("stays Σ-exact across awkward weight mixes (largest-remainder)", () => {
    const cases: Array<{ comps: BundleComponent[]; price: number; prices: Record<string, number> }> = [
      {
        comps: [
          { sku: "A", qty: 1 },
          { sku: "B", qty: 1 },
          { sku: "C", qty: 1 },
        ],
        price: 100,
        prices: { A: 1, B: 1, C: 1 }, // 33.33/33.33/33.34
      },
      {
        comps: [
          { sku: "A", qty: 3 },
          { sku: "B", qty: 2 },
        ],
        price: 999.97,
        prices: { A: 123.45, B: 678.9 },
      },
      {
        comps: [
          { sku: "A", qty: 7 },
          { sku: "B", qty: 1 },
        ],
        price: 0.05, // fewer cents than units — only 5 of 8 units get a cent
        prices: { A: 10, B: 10 },
      },
    ];
    for (const c of cases) {
      const r = explodeBundle(c.comps, c.price, (sku) => c.prices[sku]);
      expect(r.ok).toBe(true);
      expect(centsTotal(r.lines)).toBe(Math.round(c.price * 100));
      // Per-component qty is conserved.
      for (const comp of c.comps) {
        const q = r.lines.filter((l) => l.sku === comp.sku).reduce((s, l) => s + l.qty, 0);
        expect(q).toBe(comp.qty);
      }
    }
  });

  it("a zero bundle price explodes to all-zero lines (still ok, Σ 0)", () => {
    const r = explodeBundle(KING, 0, (sku) => KING_PRICES[sku]);
    expect(r.ok).toBe(true);
    expect(centsTotal(r.lines)).toBe(0);
    expect(r.lines.every((l) => l.unitPrice === 0)).toBe(true);
  });
});

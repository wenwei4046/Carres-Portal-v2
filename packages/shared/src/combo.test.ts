import { describe, expect, it } from "vitest";
import { explodeCombo } from "./combo";
import type { ComboComponent } from "./domain";

/** Helper: round to 2 dp the way money is compared in the tests. */
const round2 = (n: number) => Math.round(n * 100) / 100;

/** Helper: sum of unitPrice × qty across exploded lines, rounded to 2 dp. */
const sumLines = (lines: { qty: number; unitPrice: number }[]) =>
  round2(lines.reduce((acc, l) => acc + l.unitPrice * l.qty, 0));

/** Build a price lookup from a {sku: catalogPrice} map (missing → 0). */
const priceMap =
  (m: Record<string, number>) =>
  (sku: string): number =>
    m[sku] ?? 0;

const comp = (sku: string, qty: number, sortOrder: number): ComboComponent => ({
  sku,
  qty,
  sortOrder,
});

describe("explodeCombo", () => {
  it("1. plan example: 2000 across A(1200,q1)+B(1000,q1) splits proportionally, residue on last, Σ exact", () => {
    const lines = explodeCombo(
      {
        comboKey: "demo-combo",
        name: "Demo Combo",
        comboPrice: 2000,
        components: [comp("A", 1, 0), comp("B", 1, 1)],
      },
      priceMap({ A: 1200, B: 1000 }),
    );

    expect(lines).toHaveLength(2);
    // A weight 1200, B weight 1000, W=2200.
    // A (not last): rawCents = 200000*1200/2200 = 109090.909 -> /q1 -> round 109091 -> 1090.91
    expect(lines[0].sku).toBe("A");
    expect(lines[0].unitPrice).toBe(1090.91);
    // B (last) absorbs residue: 200000 - 109091 = 90909 -> /q1 -> 909.09
    expect(lines[1].sku).toBe("B");
    expect(lines[1].unitPrice).toBe(909.09);
    // every unitPrice is clean 2-dp
    for (const l of lines) expect(round2(l.unitPrice)).toBe(l.unitPrice);
    // Σ exact
    expect(sumLines(lines)).toBe(2000.0);
  });

  it("2. qty>1 with last qty1: 1000 across A(300,q2)+B(100,q1) → Σ exactly 1000.00 (residue absorbs on B)", () => {
    const lines = explodeCombo(
      {
        comboKey: "c2",
        name: "Combo 2",
        comboPrice: 1000,
        components: [comp("A", 2, 0), comp("B", 1, 1)],
      },
      priceMap({ A: 300, B: 100 }),
    );

    expect(lines).toHaveLength(2);
    // last component qty1 -> residue always fully absorbable -> Σ exact
    expect(sumLines(lines)).toBe(1000.0);
    // A line total > 0, B carries the remainder
    expect(lines[0].sku).toBe("A");
    expect(lines[1].sku).toBe("B");
  });

  it("3. all-zero catalog: 600 across A(0,q1)+B(0,q2) → equal split by unit count, Σ 600.00", () => {
    const lines = explodeCombo(
      {
        comboKey: "c3",
        name: "Combo 3",
        comboPrice: 600,
        components: [comp("A", 1, 0), comp("B", 2, 1)],
      },
      priceMap({ A: 0, B: 0 }),
    );

    expect(lines).toHaveLength(2);
    // W collapses to total unit count = 1 + 2 = 3. comboCents 60000.
    // A (not last): weight 1 -> raw 60000*1/3 = 20000 -> /q1 -> 200.00
    expect(lines[0].sku).toBe("A");
    expect(lines[0].unitPrice).toBe(200.0);
    // B (last): residue 60000 - 20000 = 40000 -> /q2 -> 200.00
    expect(lines[1].sku).toBe("B");
    expect(lines[1].unitPrice).toBe(200.0);
    expect(sumLines(lines)).toBe(600.0);
  });

  it("4. single component qty1: 999.99 across A(500,q1) → unitPrice 999.99, Σ exact", () => {
    const lines = explodeCombo(
      {
        comboKey: "c4",
        name: "Combo 4",
        comboPrice: 999.99,
        components: [comp("A", 1, 0)],
      },
      priceMap({ A: 500 }),
    );

    expect(lines).toHaveLength(1);
    expect(lines[0].sku).toBe("A");
    expect(lines[0].unitPrice).toBe(999.99);
    expect(sumLines(lines)).toBe(999.99);
  });

  it("5. irreducible edge: single component qty3, 100.00 → Σ within 0.02 of 100.00 (documented non-exact edge)", () => {
    const lines = explodeCombo(
      {
        comboKey: "c5",
        name: "Combo 5",
        comboPrice: 100.0,
        components: [comp("A", 3, 0)],
      },
      priceMap({ A: 500 }),
    );

    expect(lines).toHaveLength(1);
    // 10000 cents / 3 units -> round(3333.33) = 3333 -> 33.33 * 3 = 99.99
    // accepted residual <= (qtyLast-1) cents = 2 cents
    expect(Math.abs(sumLines(lines) - 100.0)).toBeLessThanOrEqual(0.02);
  });

  it("6. comboKey + comboLabel stamped on every line; output order follows sortOrder", () => {
    const lines = explodeCombo(
      {
        comboKey: "stamp-key",
        name: "Stamp Label",
        comboPrice: 900,
        // intentionally out of order in input; sortOrder dictates output
        components: [comp("Z", 1, 2), comp("X", 1, 0), comp("Y", 1, 1)],
      },
      priceMap({ X: 100, Y: 100, Z: 100 }),
    );

    expect(lines.map((l) => l.sku)).toEqual(["X", "Y", "Z"]);
    for (const l of lines) {
      expect(l.comboKey).toBe("stamp-key");
      expect(l.comboLabel).toBe("Stamp Label");
    }
  });

  it("7. proportionality: higher-catalog component gets a higher line total", () => {
    const lines = explodeCombo(
      {
        comboKey: "c7",
        name: "Combo 7",
        comboPrice: 3000,
        components: [comp("HI", 1, 0), comp("LO", 1, 1)],
      },
      priceMap({ HI: 2000, LO: 500 }),
    );

    const totalHi = lines[0].unitPrice * lines[0].qty;
    const totalLo = lines[1].unitPrice * lines[1].qty;
    expect(lines[0].sku).toBe("HI");
    expect(lines[1].sku).toBe("LO");
    expect(totalHi).toBeGreaterThan(totalLo);
    expect(sumLines(lines)).toBe(3000.0);
  });

  it("empty components → []", () => {
    const lines = explodeCombo(
      { comboKey: "empty", name: "Empty", comboPrice: 100, components: [] },
      priceMap({}),
    );
    expect(lines).toEqual([]);
  });
});

import { describe, it, expect } from "vitest";
import { skuMargin } from "./margin";

describe("skuMargin", () => {
  it("returns null when cost is null (cost not set)", () => {
    expect(skuMargin(1000, null)).toBeNull();
  });

  it("computes amount + pct when both price and cost are provided", () => {
    const m = skuMargin(1000, 600);
    expect(m).not.toBeNull();
    expect(m!.amount).toBeCloseTo(400, 2);
    expect(m!.pct).toBeCloseTo(0.4, 6);
  });

  it("returns pct=0 (not NaN) when price === 0 to avoid divide-by-zero", () => {
    const m = skuMargin(0, 0);
    expect(m).not.toBeNull();
    expect(m!.amount).toBe(0);
    expect(m!.pct).toBe(0);
  });

  it("handles negative margin (cost > price) — surface it rather than clamp", () => {
    const m = skuMargin(500, 600);
    expect(m).not.toBeNull();
    expect(m!.amount).toBeCloseTo(-100, 2);
    expect(m!.pct).toBeCloseTo(-0.2, 6);
  });

  it("returns null when cost is null even if price is non-zero", () => {
    expect(skuMargin(2990, null)).toBeNull();
  });
});

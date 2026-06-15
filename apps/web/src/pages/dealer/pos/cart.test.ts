import { describe, it, expect } from "vitest";
import type { DraftLine } from "../new-order/draft";
import {
  attrsKey,
  cartItemCount,
  cartLineSubtotal,
  cartTotalExStair,
  mergeLine,
  sameLine,
} from "./cart";

function line(over: Partial<DraftLine> = {}): DraftLine {
  return {
    localId: "L1",
    sku: "MA-CLOUD-QUEEN",
    qty: 1,
    attrs: null,
    unitPrice: 2890,
    label: "Carres Cloud · Queen",
    ...over,
  };
}

describe("attrsKey", () => {
  it("treats null and {} as distinct", () => {
    expect(attrsKey(null)).toBe("null");
    expect(attrsKey({})).toBe("{}");
  });
  it("is order-independent", () => {
    expect(attrsKey({ color: "Walnut", gap: "10mm" })).toBe(
      attrsKey({ gap: "10mm", color: "Walnut" }),
    );
  });
});

describe("sameLine", () => {
  it("matches same sku + same attrs", () => {
    expect(sameLine(line({ attrs: { color: "Walnut" } }), line({ localId: "L2", attrs: { color: "Walnut" } }))).toBe(true);
  });
  it("differs on attrs", () => {
    expect(sameLine(line({ attrs: { color: "Walnut" } }), line({ attrs: { color: "Oak" } }))).toBe(false);
  });
  it("differs on sku", () => {
    expect(sameLine(line(), line({ sku: "OTHER" }))).toBe(false);
  });
});

describe("mergeLine", () => {
  it("appends to an empty cart", () => {
    const out = mergeLine([], line());
    expect(out).toHaveLength(1);
  });

  it("bumps qty when sku + attrs match, never appends", () => {
    const existing = line({ localId: "L1", qty: 2 });
    const out = mergeLine([existing], line({ localId: "L2", qty: 3 }));
    expect(out).toHaveLength(1);
    expect(out[0].qty).toBe(5);
    // localId of the existing row is preserved (only qty changed).
    expect(out[0].localId).toBe("L1");
  });

  it("appends a separate row when attrs differ (e.g. different fabric)", () => {
    const a = line({ localId: "A", sku: "SF-1", attrs: { mode: "preset", fabric_id: "f1" } });
    const b = line({ localId: "B", sku: "SF-1", attrs: { mode: "preset", fabric_id: "f2" } });
    expect(mergeLine([a], b)).toHaveLength(2);
  });

  it("preserves the DraftLine shape (submit payload unaffected)", () => {
    const out = mergeLine([], line({ attrs: { color: "Walnut", gap: "10mm" }, unitPrice: 1500 }));
    const l = out[0];
    expect(Object.keys(l).sort()).toEqual(
      ["attrs", "label", "localId", "qty", "sku", "unitPrice"].sort(),
    );
    expect(l.unitPrice).toBe(1500);
    expect(l.attrs).toEqual({ color: "Walnut", gap: "10mm" });
  });
});

describe("cart math", () => {
  const lines = [line({ qty: 2, unitPrice: 1000 }), line({ localId: "L2", sku: "X", qty: 1, unitPrice: 500 })];
  it("line subtotal sums unitPrice × qty", () => {
    expect(cartLineSubtotal(lines)).toBe(2500);
  });
  it("item count sums qty", () => {
    expect(cartItemCount(lines)).toBe(3);
  });
  it("total excludes stair (lines + addons only)", () => {
    expect(cartTotalExStair(lines, [{ key: "a", qty: 2, unitPrice: 50, name: "Install" }])).toBe(2600);
  });
});

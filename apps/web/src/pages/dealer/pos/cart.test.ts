import { describe, it, expect } from "vitest";
import type { CatalogResponse } from "@carres/shared";
import type { DraftLine } from "../new-order/draft";
import {
  attrsKey,
  cartItemCount,
  cartLineSubtotal,
  cartTotalExStair,
  lineEditTarget,
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
  it("a PWP reward line never merges (server enforces reward qty = 1)", () => {
    const pwp = { pwp: { ruleId: "rule-1" } };
    // Even attrs-identical code-less claims stay separate lines…
    expect(sameLine(line({ attrs: pwp }), line({ localId: "L2", attrs: pwp }))).toBe(false);
    // …and a PWP line never merges into a plain line either.
    expect(sameLine(line({ attrs: pwp }), line({ localId: "L2" }))).toBe(false);
    expect(sameLine(line(), line({ localId: "L2", attrs: pwp }))).toBe(false);
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

// ── cart-line EDIT routing (the ✎ pencil, Loo 2026-07-12) ────────────────────

const EDIT_CATALOG = {
  models: [
    { id: "m-sofa", category: "sofa", name: "Booqit" },
    { id: "m-matt", category: "mattress", name: "Lumi" },
    { id: "m-bed", category: "bedframe", name: "Kayu" },
    { id: "m-acc", category: "accessory", name: "Protector" },
  ],
  skus: [
    { sku: "BOOQIT-P", modelId: "m-sofa" },
    { sku: "LUMI-Q", modelId: "m-matt" },
    { sku: "KAYU-K", modelId: "m-bed" },
    { sku: "PROT-1", modelId: "m-acc" },
  ],
} as unknown as CatalogResponse;

describe("lineEditTarget", () => {
  it("routes a sofa BUILD line (attrs.sofa_build) to the sofa page", () => {
    const l = line({ sku: "BOOQIT-P", attrs: { sofa_build: { cells: [], height: "24" } } });
    expect(lineEditTarget(l, EDIT_CATALOG)).toBe("sofa_build");
  });
  it("routes mattress + bedframe lines to the configure page", () => {
    expect(lineEditTarget(line({ sku: "LUMI-Q" }), EDIT_CATALOG)).toBe("bed_mattress");
    expect(lineEditTarget(line({ sku: "KAYU-K", attrs: { gap: "KIV" } }), EDIT_CATALOG)).toBe(
      "bed_mattress",
    );
  });
  it("routes a rental line to the RENTAL page — a rented mattress is not a bought one", () => {
    // The shape `rentalAttrs` really builds. Asserting with `{ rental: true }`
    // would pass for a reason production never produces.
    const attrs = { rental: { planId: "plan-1", termMonths: 84, monthlyFee: 69 } };
    expect(lineEditTarget(line({ sku: "LUMI-Q", attrs }), EDIT_CATALOG)).toBe("rental");
  });
  it("accessory / unknown-sku / preset-sofa lines are not editable", () => {
    expect(lineEditTarget(line({ sku: "PROT-1" }), EDIT_CATALOG)).toBeNull();
    expect(lineEditTarget(line({ sku: "GONE-1" }), EDIT_CATALOG)).toBeNull();
    // A sofa line WITHOUT a stored build (preset dropdown) has no canvas to reopen.
    expect(lineEditTarget(line({ sku: "BOOQIT-P", attrs: null }), EDIT_CATALOG)).toBeNull();
  });
});

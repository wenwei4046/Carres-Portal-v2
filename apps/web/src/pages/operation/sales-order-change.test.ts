import { describe, expect, it } from "vitest";
import { configWords, diffRows, qtyWords, servicesWords, resizeService, sizeServiceUnit, type EditAddon, type EditLine } from "./sales-order-change";

const line = (o: Partial<EditLine> & { sku: string }): EditLine => ({ key: o.sku, qty: 1, unit_price: 0, ...o });
const addon = (o: Partial<EditAddon> & { addon_key: string }): EditAddon => ({ key: o.addon_key, qty: 1, unit_price: 0, ...o });
const CATEGORY: Record<string, string | null> = { "TRION-Q": "bedframe", "M1401F-K": "mattress", "MEMORY-FOAM-PILLOW-asd": "accessory", "M1201F-K": null };
const categoryOf = (sku: string) => CATEGORY[sku] ?? null;
const nameOfSku = (sku: string) => `Name ${sku}`;
const nameOfAddon = (key: string) => (key === "DELIVERY" ? "Delivery fee" : key === "dispose-mattress" ? "Dispose old mattress" : key);

describe("qtyWords — the Register's own ladder, on the object page", () => {
  it("counts goods by category, in the ladder's order", () => {
    expect(
      qtyWords([line({ sku: "TRION-Q", qty: 2 }), line({ sku: "M1401F-K" }), line({ sku: "MEMORY-FOAM-PILLOW-asd", qty: 4 })], categoryOf),
    ).toBe("Mattress 1 · Bedframe 2 · Pillow 4");
  });
  it("a line with no catalogue row KEEPS its quantity, apart, and is never folded in", () => {
    const words = qtyWords([line({ sku: "M1401F-K" }), line({ sku: "M1201F-K" })], categoryOf);
    expect(words).toContain("Not in catalog 1");
    expect(words).not.toContain("Other goods");
    expect(words).toBe("Mattress 1 · Not in catalog 1");
  });
  it("a removed row leaves the count", () => {
    expect(qtyWords([line({ sku: "M1401F-K" }), line({ sku: "TRION-Q", removed: true })], categoryOf)).toBe("Mattress 1");
  });
});

describe("servicesWords — lines and quantity are different counts", () => {
  it("names each service and states a quantity above 1", () => {
    expect(servicesWords([addon({ addon_key: "dispose-mattress", qty: 2 }), addon({ addon_key: "DELIVERY" })], nameOfAddon))
      .toBe("Dispose old mattress ×2 · Delivery fee");
  });
  it("says None when every service is removed", () => {
    expect(servicesWords([addon({ addon_key: "DELIVERY", removed: true })], nameOfAddon)).toBe("None");
  });
});

describe("configWords", () => {
  it("prints size, fabric, specials and the mattress gap, and translates KIV", () => {
    expect(configWords({ size: "Queen", options: [{ kind: "fabric", label: "BF-10" }], specials: [{ soDescription: "Front Drawer ( 2 Drawers )" }], gap: "KIV" }))
      .toBe("Queen · Fabric BF-10 · Front Drawer ( 2 Drawers ) · Mattress gap: Confirm later");
  });
});

describe("diffRows — Before / After", () => {
  const before = {
    lines: [line({ key: "a", id: "l1", sku: "M1401F-K", qty: 2, unit_price: 1890 }), line({ key: "b", id: "l2", sku: "MEMORY-FOAM-PILLOW-asd", qty: 1, unit_price: 220 })],
    addons: [addon({ key: "x", id: "a1", addon_key: "DELIVERY", qty: 1, unit_price: 250 })],
  };
  const args = { header: [], nameOfSku, nameOfAddon, categoryOf };

  it("states a quantity change, the new category counts and the new total — and nothing else", () => {
    const after = { lines: [{ ...before.lines[0]!, qty: 1 }, before.lines[1]!], addons: before.addons };
    const rows = diffRows({ ...args, before, after });
    expect(rows.map((r) => r.what)).toEqual(["Name M1401F-K (M1401F-K)", "Qty", "Total payable"]);
    expect(rows[0]!.before).toBe("2 × RM 1,890.00");
    expect(rows[0]!.after).toBe("1 × RM 1,890.00");
    expect(rows[2]!.before).toBe("RM 4,250.00");
    expect(rows[2]!.after).toBe("RM 2,360.00");
  });

  it("a removed line reads Cancelled and leaves the totals", () => {
    const after = { lines: [{ ...before.lines[0]!, removed: true }, before.lines[1]!], addons: before.addons };
    const rows = diffRows({ ...args, before, after });
    expect(rows[0]!.after).toBe("Cancelled");
    expect(rows.find((r) => r.what === "Qty")!.after).toBe("Pillow 1");
  });

  it("a service that nobody touched does not read as changed, even without a row id", () => {
    const beforeNoIds = { lines: before.lines, addons: [addon({ key: "x", addon_key: "DELIVERY", qty: 1, unit_price: 250 })] };
    const after = { lines: before.lines, addons: [addon({ key: "y", addon_key: "DELIVERY", qty: 1, unit_price: 250 })] };
    const rows = diffRows({ ...args, before: beforeNoIds, after });
    expect(rows.map((r) => r.what)).toEqual(["Qty", "Total payable"]);
  });

  it("a per-piece service quantity change is stated on its own row and in Services", () => {
    const after = {
      lines: before.lines,
      addons: [...before.addons, addon({ key: "n", addon_key: "dispose-mattress", qty: 2, unit_price: 80, added: true })],
    };
    const rows = diffRows({ ...args, before, after });
    expect(rows[0]!.what).toBe("Dispose old mattress");
    expect(rows[0]!.before).toBe("—");
    expect(rows.find((r) => r.what === "Services")!.after).toBe("Delivery fee · Dispose old mattress ×2");
  });
});


describe("service configuration — POS parity without losing saved attrs", () => {
  it("growing quantity preserves the chosen size and leaves the new unit unpicked", () => {
    const row = addon({ addon_key: "dispose-mattress", attrs: { size: "Single", note: "Keep" } });
    const grown = { ...row, ...resizeService(row, 2) };
    expect(grown.attrs).toEqual({ size: "Single", sizes: ["Single", ""], note: "Keep" });
    const sized = { ...grown, ...sizeServiceUnit(grown, 1, "Queen") };
    expect(sized.attrs).toEqual({ size: "Single + Queen", sizes: ["Single", "Queen"], note: "Keep" });
    expect(servicesWords([sized], nameOfAddon)).toBe("Dispose old mattress · Single + Queen ×2");
    expect(resizeService(sized, 1).attrs).toEqual({ size: "Single", sizes: ["Single"], note: "Keep" });
  });
  it("uses catalog size configuration for services outside the legacy mattress family", () => {
    const row = addon({ addon_key: "custom-disposal", qty: 1, attrs: { size: "3 seater" } });
    expect(resizeService(row, 2, ["2 seater", "3 seater"]).attrs).toEqual({ size: "3 seater", sizes: ["3 seater", ""] });
    expect(resizeService(row, 2)).toEqual({ qty: 2 });
  });
});

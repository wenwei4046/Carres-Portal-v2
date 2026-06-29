import { describe, it, expect } from "vitest";
import type { OrderLine } from "@carres/shared";
import { lineSofaBuildKey, groupSofaBuildLines } from "./sofa-build-display";

function line(over: Partial<OrderLine> = {}): OrderLine {
  return {
    id: `l-${Math.random().toString(36).slice(2)}`,
    orderId: "o-1",
    sku: "FLAT-SKU",
    qty: 1,
    attrs: null,
    unitPrice: 100,
    ...over,
  };
}

describe("lineSofaBuildKey", () => {
  it("reads a string sofa_build_key", () => {
    expect(lineSofaBuildKey({ sofa_build_key: "bk-1" })).toBe("bk-1");
  });
  it("null for keyless / non-string / empty / nullish attrs", () => {
    expect(lineSofaBuildKey(null)).toBeNull();
    expect(lineSofaBuildKey({})).toBeNull();
    expect(lineSofaBuildKey({ sofa_build_key: 5 })).toBeNull();
    expect(lineSofaBuildKey({ sofa_build_key: "" })).toBeNull();
  });
});

describe("groupSofaBuildLines", () => {
  it("a keyless order is a strict no-op — one standalone row per line, in order", () => {
    const a = line({ sku: "A", id: "a" });
    const b = line({ sku: "B", id: "b" });
    const rows = groupSofaBuildLines([a, b]);
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.kind === "line")).toBe(true);
    expect(rows.map((r) => (r.kind === "line" ? r.line.id : ""))).toEqual(["a", "b"]);
  });

  it("collapses lines sharing a sofa_build_key into one sofa row with summed total + summary", () => {
    const c1 = line({ sku: "OHANA-2A", unitPrice: 1000, attrs: { sofa_build_key: "bk", module_code: "2A" } });
    const c2 = line({ sku: "OHANA-1A", unitPrice: 600, attrs: { sofa_build_key: "bk", module_code: "1A" } });
    const rows = groupSofaBuildLines([c1, c2]);
    expect(rows).toHaveLength(1);
    const g = rows[0];
    expect(g.kind).toBe("sofa_build");
    if (g.kind !== "sofa_build") throw new Error("expected group");
    expect(g.buildKey).toBe("bk");
    expect(g.lines).toHaveLength(2);
    expect(g.qty).toBe(1);
    expect(g.totalPrice).toBe(1600);
    expect(g.summary).toBe("2A + 1A");
  });

  it("the group lands at its first line's position; standalone lines keep order", () => {
    const flatA = line({ sku: "A", id: "a" });
    const c1 = line({ sku: "OHANA-2A", id: "c1", attrs: { sofa_build_key: "bk", module_code: "2A" } });
    const flatB = line({ sku: "B", id: "b" });
    const c2 = line({ sku: "OHANA-1A", id: "c2", attrs: { sofa_build_key: "bk", module_code: "1A" } });
    const rows = groupSofaBuildLines([flatA, c1, flatB, c2]);
    // a (line) · sofa group [c1,c2] at c1's slot · b (line)
    expect(rows.map((r) => r.kind)).toEqual(["line", "sofa_build", "line"]);
    expect(rows[1].kind === "sofa_build" && rows[1].lines.map((l) => l.id)).toEqual(["c1", "c2"]);
  });

  it("two distinct builds → two groups", () => {
    const a1 = line({ attrs: { sofa_build_key: "bkA", module_code: "2A" } });
    const a2 = line({ attrs: { sofa_build_key: "bkA", module_code: "1A" } });
    const b1 = line({ attrs: { sofa_build_key: "bkB", module_code: "3A" } });
    const rows = groupSofaBuildLines([a1, a2, b1]);
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.kind === "sofa_build")).toBe(true);
  });

  it("falls back to the sku when module_code is absent", () => {
    const c1 = line({ sku: "OHANA-2A", attrs: { sofa_build_key: "bk" } });
    const rows = groupSofaBuildLines([c1]);
    expect(rows[0].kind === "sofa_build" && rows[0].summary).toBe("OHANA-2A");
  });

  it("empty input → empty output", () => {
    expect(groupSofaBuildLines([])).toEqual([]);
  });
});

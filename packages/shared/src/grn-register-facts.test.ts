import { describe, expect, it } from "vitest";
import {
  grnDateOf,
  grnExceptionFacts,
  grnExceptionSummary,
  grnLineName,
  warehouseReceiptStatusLabel,
} from "./warehouse-receipt";

/**
 * THE GRN REGISTER'S OWN FACTS (owner instruction 2026-09-13) — one copy each,
 * so the Register row, its expansion, the GRN object, the paper and the search
 * cannot spell a name, an exception or a date two ways.
 */

describe("grnLineName — the goods' full name ladder", () => {
  it("prefers the receipt's own snapshot, then the current catalog, then the SKU — and says which", () => {
    expect(grnLineName({ sku: "JAGER-SS", item_label: "Jager · Super Single", catalogLabel: "Jager · Super Single (renamed)" })).toEqual({
      name: "Jager · Super Single",
      source: "snapshot",
    });
    expect(grnLineName({ sku: "JAGER-SS", item_label: null, catalogLabel: "Jager · Super Single" })).toEqual({
      name: "Jager · Super Single",
      source: "catalog",
    });
    expect(grnLineName({ sku: "JAGER-SS" })).toEqual({ name: "JAGER-SS", source: "sku" });
    // Blank snapshots do not count as names.
    expect(grnLineName({ sku: "X", item_label: "   ", catalogLabel: "" })).toEqual({ name: "X", source: "sku" });
  });
});

describe("grnExceptionFacts / grnExceptionSummary", () => {
  const lines = [
    { id: "l1", sku: "A", received_now: 1, damaged_qty: 1, wrong_item_qty: 0, wrong_item_claim_type: null },
    { id: "l2", sku: "B", received_now: 0, damaged_qty: 0, wrong_item_qty: 2, wrong_item_claim_type: "wrong_spec" },
    { id: "l3", sku: "C", received_now: 3, damaged_qty: 0, wrong_item_qty: 0, wrong_item_claim_type: null },
  ];

  it("lists only POSITIVE exceptions, damaged → wrong item → extra, each with its stable line key", () => {
    const facts = grnExceptionFacts(lines, [
      { id: "x1", sku: "P", qty: 1 },
      { sku: "OLD", qty: 2 },
    ]);
    expect(facts).toEqual([
      { type: "damaged", lineKey: "l1", sku: "A", qty: 1 },
      { type: "wrong_item", lineKey: "l2", sku: "B", qty: 2 },
      { type: "extra", lineKey: "x1", sku: "P", qty: 1 },
      // A pre-0493 extra line has no identity — listed with an EMPTY key so
      // the caller offers it no evidence door.
      { type: "extra", lineKey: "", sku: "OLD", qty: 2 },
    ]);
  });

  it("summarises the receipt's exceptions in words, and says nothing for a clean receipt", () => {
    expect(grnExceptionSummary(grnExceptionFacts(lines, [{ id: "x1", sku: "P", qty: 1 }]))).toBe("1 damaged · 2 wrong item · 1 extra");
    expect(grnExceptionSummary(grnExceptionFacts([lines[2]!], []))).toBe("");
    expect(grnExceptionSummary(grnExceptionFacts(null, null))).toBe("");
  });
});

describe("grnDateOf — the GRN document's date", () => {
  it("is the posting's stamp read in MYT, never the number", () => {
    // 2026-09-04T17:30Z is already 5 Sep in Kuala Lumpur.
    expect(grnDateOf("2026-09-04T17:30:00Z")).toBe("2026-09-05");
    expect(grnDateOf("2026-08-05 08:20:04.657265+00")).toBe("2026-08-05");
    expect(grnDateOf(null)).toBeNull();
    expect(grnDateOf("")).toBeNull();
    expect(grnDateOf("not a date")).toBeNull();
  });
});

describe("GRN Status words", () => {
  it("maps the EXISTING internal states onto Confirmed / Cancelled — no new state", () => {
    expect(warehouseReceiptStatusLabel("posted")).toBe("Confirmed");
    expect(warehouseReceiptStatusLabel("voided")).toBe("Cancelled");
    expect(warehouseReceiptStatusLabel("submitted")).toBe("Waiting Carres check");
  });
});

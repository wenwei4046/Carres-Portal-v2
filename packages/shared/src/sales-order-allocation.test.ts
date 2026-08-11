import { describe, expect, it } from "vitest";
import {
  resolveUnitAllocation,
  type AllocationUnit,
} from "./sales-order-allocation";

const unit = (over: Partial<AllocationUnit>): AllocationUnit => ({
  id: over.id ?? "u-" + Math.random().toString(36).slice(2, 8),
  unitCode: over.unitCode ?? "id-abc123456",
  sku: over.sku ?? "MS01-M1401F-K",
  status: over.status ?? "reserved",
  condition: over.condition ?? "new",
  warehouseId: over.warehouseId ?? "wh-1",
  poNo: over.poNo ?? "PO-2040",
  qty: over.qty ?? 1,
  dateIn: over.dateIn ?? "2026-08-01",
  soldAt: over.soldAt ?? null,
});

describe("resolveUnitAllocation — Card 2's one arithmetic", () => {
  it("CASE 1 · attaches reserved and sold units to their committed line and derives outstanding", () => {
    const a = resolveUnitAllocation({
      orderId: "o-1",
      soRef: "SO-1318",
      commitmentLines: [
        { sku: "MS01-M1401F-K", qty: 2 },
        { sku: "BF04-1013Jager/Fab3-Q", qty: 1 },
      ],
      units: [
        unit({ id: "r1", sku: "MS01-M1401F-K", status: "reserved" }),
        unit({ id: "s1", sku: "MS01-M1401F-K", status: "sold", soldAt: "2026-08-10" }),
      ],
    });
    expect(a.lines).toHaveLength(2);
    const [ms, bf] = a.lines;
    expect(ms.reservedQty).toBe(1);
    expect(ms.soldQty).toBe(1);
    expect(ms.outstandingQty).toBe(0);
    expect(bf.reservedQty).toBe(0);
    expect(bf.outstandingQty).toBe(1);
    expect(a.totals).toEqual({
      committedQty: 3,
      reservedQty: 1,
      soldQty: 1,
      outstandingQty: 1,
    });
    expect(a.unmatchedUnits).toHaveLength(0);
  });

  it("CASE 2 · matches under normalizeSkuKey — cosmetic sku drift still attaches", () => {
    const a = resolveUnitAllocation({
      orderId: "o-1",
      soRef: "SO-1318",
      commitmentLines: [{ sku: "Jager Bed Frame  (Queen)", qty: 1 }],
      units: [unit({ sku: "JAGER BED FRAME (QUEEN)", status: "reserved" })],
    });
    expect(a.lines[0].reservedQty).toBe(1);
    expect(a.lines[0].outstandingQty).toBe(0);
  });

  it("CASE 3 · a bulk register row counts its qty, never 1", () => {
    const a = resolveUnitAllocation({
      orderId: "o-1",
      soRef: "SO-1318",
      commitmentLines: [{ sku: "PILLOW-STD", qty: 4 }],
      units: [unit({ sku: "PILLOW-STD", status: "reserved", qty: 3 })],
    });
    expect(a.lines[0].reservedQty).toBe(3);
    expect(a.lines[0].outstandingQty).toBe(1);
  });

  it("CASE 4 · a unit matching no committed line is surfaced, never hidden — and still counts in totals", () => {
    const a = resolveUnitAllocation({
      orderId: "o-1",
      soRef: "SO-1318",
      commitmentLines: [{ sku: "MS01-M1401F-K", qty: 1 }],
      units: [unit({ id: "stray", sku: "SOFA-XL", status: "reserved" })],
    });
    expect(a.unmatchedUnits.map((u) => u.id)).toEqual(["stray"]);
    expect(a.totals.reservedQty).toBe(1);
    expect(a.lines[0].outstandingQty).toBe(1);
  });

  it("CASE 5 · duplicate committed lines combine; outstanding never goes negative", () => {
    const a = resolveUnitAllocation({
      orderId: "o-1",
      soRef: "SO-1318",
      commitmentLines: [
        { sku: "MS01-M1401F-K", qty: 1 },
        { sku: "MS01-M1401F-K", qty: 1 },
      ],
      units: [
        unit({ sku: "MS01-M1401F-K", status: "reserved" }),
        unit({ sku: "MS01-M1401F-K", status: "reserved" }),
        unit({ sku: "MS01-M1401F-K", status: "reserved" }),
      ],
    });
    expect(a.lines).toHaveLength(1);
    expect(a.lines[0].committedQty).toBe(2);
    expect(a.lines[0].reservedQty).toBe(3);
    expect(a.lines[0].outstandingQty).toBe(0);
  });

  it("CASE 6 · negative control — the input types carry no stage, status word or booking; an empty register answers all-outstanding", () => {
    const a = resolveUnitAllocation({
      orderId: "o-1",
      soRef: "SO-1318",
      commitmentLines: [{ sku: "MS01-M1401F-K", qty: 2 }],
      units: [],
    });
    expect(a.totals.outstandingQty).toBe(2);
    expect(a.totals.reservedQty).toBe(0);
    expect(a.totals.soldQty).toBe(0);
  });
});

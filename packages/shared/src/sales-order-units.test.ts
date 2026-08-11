import { describe, expect, it } from "vitest";
import { resolveSalesOrderUnits, type SalesOrderUnitBundle } from "./sales-order-units";

const unit = (patch: Partial<SalesOrderUnitBundle["units"][number]> = {}) => ({
  id: crypto.randomUUID(), unit_code: "id-abc123456", sku: "Cloud King",
  status: "free", condition: "new", reserved_ref: null, warehouse_id: crypto.randomUUID(),
  po_no: "PO-2100", needs_repair: false, ...patch,
});

describe("Sales Order Unit truth", () => {
  it("offers compatible free Units but never allocates them", () => {
    const free = unit();
    const result = resolveSalesOrderUnits({ so: 42, lines: [{ sku: "cloud-king", qty: 1 }], units: [free], events: [] });
    expect(result.offered).toEqual([free]);
    expect(result.allocated).toEqual([]);
  });

  it("reads allocation only from the Unit register and excludes held stock", () => {
    const mine = unit({ status: "reserved", reserved_ref: "SO-42" });
    const held = unit({ status: "on_hold" });
    const other = unit({ status: "reserved", reserved_ref: "SO-99" });
    const result = resolveSalesOrderUnits({ so: 42, lines: [{ sku: "Cloud King", qty: 1 }], units: [mine, held, other], events: [] });
    expect(result.allocated).toEqual([mine]);
    expect(result.offered).toEqual([]);
  });
});

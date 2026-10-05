import { describe, expect, it } from "vitest";
import { warehouseConfirmationReportFromWire, warehouseConfirmationReportToWire } from "./adapters";

describe("preserved Warehouse physical report", () => {
  it("round-trips unknown counts, exact Unit evidence and non-PO references without manufacturing facts", () => {
    const raw = {
      po_id: null, arrival_source_id: "11111111-1111-4111-8111-111111111111",
      do_number: "DO-1", goods_received_time: null,
      lines: [{ id: "line1", received_now: null, damaged_qty: 0,
        damaged_photos: [{ path: "source/proof.jpg", unit_code: "U1-000-001" }],
        units: [{ unit_code: "U1-000-001", outcome: "not_received", note: "Not on this truck" }],
      }],
    };
    const decoded = warehouseConfirmationReportFromWire(raw);
    expect(decoded).not.toBeNull();
    expect(JSON.parse(JSON.stringify(warehouseConfirmationReportToWire(decoded!)))).toEqual(raw);
  });
  it.each([null, "bad", [], { lines: "bad" }, { lines: [{ received_now: "unknown" }] }])("refuses malformed saved input without silently replacing it with an empty report", (raw) => {
    expect(warehouseConfirmationReportFromWire(raw)).toBeNull();
  });
});

import { describe, expect, it } from "vitest";
import {
  warehouseOperationsReadyBy,
  warehouseScheduleRowsForWeek,
  warehouseWeekDays,
  type WarehouseScheduleRow,
} from "./warehouse-schedule";

function row(over: Partial<WarehouseScheduleRow> = {}): WarehouseScheduleRow {
  return {
    id: "po:PO-1",
    date: "2026-09-05",
    event: "Supplier promise",
    unitCodes: ["U1-000-001"],
    units: 1,
    from: "Ohana",
    to: "Carres Klang Warehouse",
    company: "Ohana",
    source: "PO-1",
    sourcePath: "/operation/procurement?po=PO-1",
    timing: "Expected",
    operationsReadyBy: "2026-09-04",
    evidence: "PO promise",
    ...over,
  };
}

describe("Warehouse Schedule calendars", () => {
  it("keeps a Saturday physical event on Saturday and makes Office ready on Friday", () => {
    expect(warehouseOperationsReadyBy("2026-09-05")).toBe("2026-09-04");
  });

  it("makes a Monday event ready on the prior Office Friday", () => {
    expect(warehouseOperationsReadyBy("2026-09-07")).toBe("2026-09-04");
  });

  it("skips a governed Office holiday as well as Saturday and Sunday", () => {
    expect(warehouseOperationsReadyBy("2026-09-07", new Set(["2026-09-04"])))
      .toBe("2026-09-03");
  });

  it("draws the Warehouse week Monday through Saturday, never Sunday", () => {
    expect(warehouseWeekDays("2026-09-03")).toEqual([
      "2026-08-31",
      "2026-09-01",
      "2026-09-02",
      "2026-09-03",
      "2026-09-04",
      "2026-09-05",
    ]);
  });

  it("keeps governed events and prints an honest blank row for every empty day", () => {
    const rows = warehouseScheduleRowsForWeek([row()], "2026-09-03");
    expect(rows).toHaveLength(6);
    expect(rows.find((item) => item.date === "2026-09-05")?.event).toBe("Supplier promise");
    expect(rows.find((item) => item.date === "2026-09-01")).toMatchObject({
      event: "No warehouse event planned",
      placeholder: true,
      units: 0,
    });
  });
});

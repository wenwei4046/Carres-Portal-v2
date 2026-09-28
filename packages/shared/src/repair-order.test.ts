import { describe, expect, it } from "vitest";
import {
  REPAIR_ORDER_COLUMN_LABEL,
  REPAIR_ORDER_COLUMN_ORDER,
  REPAIR_ORDER_UNIT_COLUMN_LABEL,
  REPAIR_ORDER_UNIT_COLUMN_ORDER,
  REPAIR_PROBLEM_CHOICES,
  klDate,
  repairOrderCategory,
  repairOrderConditions,
  repairOrderFooter,
  repairOrderGrnCell,
  repairOrderRequirementCell,
  repairOrderReturnTarget,
  repairOrderStage,
  type RepairOrderListRow,
  type RepairOrderUnitRow,
} from "./repair-order";
import { unitProblemChoices } from "./unit-problem";

const unit = (over: Partial<RepairOrderUnitRow> = {}): RepairOrderUnitRow => ({
  stock_item_id: "si1", unit_id: "U1-000-001", po_no: "PO1", sku: "S", category: null, item: null, item_spec: null,
  ownership: "carres_owned", display: false, problem: "damaged", problem_note: "x", repair_requirement: "Fix arm",
  evidence: [], collected_by: null, actual_pickup_date: null, goods_received_date: null, grn_no: null,
  pickup_proof: null, return_proof: null, inspected: false, ...over,
});
const row = (over: Partial<RepairOrderListRow> = {}): RepairOrderListRow => ({
  id: "r", ro_no: "RO-1", ro_doc_date: "2026-09-28", version: 1, supplier_id: "s", supplier_name: "Hooka",
  claim_id: null, claim_no: null, cost_responsibility: "not_decided", price: null, pickup_site_id: "w",
  pickup_site_name: "Carres Klang", return_site_id: "w", return_site_name: "Carres Klang", issued: false,
  supplier_received_at: null, return_target_date: null, cancelled_at: null, latest_reply: null, units: [unit()], ...over,
});

describe("Repair Orders vocabulary (§9.7)", () => {
  it("the 17 register columns and the 11 expansion columns, in the approved order", () => {
    expect(REPAIR_ORDER_COLUMN_ORDER.map((k) => REPAIR_ORDER_COLUMN_LABEL[k])).toEqual([
      "RO Doc Date", "RO No", "Supplier", "Supplier Claim No", "Category", "PO No / Unit ID", "Items", "Qty",
      "Repair Requirement", "Cost Responsibility", "Supplier Pickup Location", "Actual Pickup Date",
      "Supplier Return Location", "Expected Return Date", "Returned Qty", "Goods Received Date", "GRN No",
    ]);
    expect(REPAIR_ORDER_UNIT_COLUMN_ORDER.map((k) => REPAIR_ORDER_UNIT_COLUMN_LABEL[k])).toEqual([
      "Category", "PO No / Unit ID", "Items", "Qty", "Problem", "Evidence", "Supplier Pickup Location",
      "Collected By", "Actual Pickup Date", "Supplier Return Location", "Goods Received Date",
    ]);
  });

  it("the problem choices are Report a problem's own values — no second vocabulary", () => {
    for (const c of REPAIR_PROBLEM_CHOICES) {
      expect(unitProblemChoices.find((u) => u.value === c.value)?.label).toBe(c.label);
    }
  });
});

describe("the Carres return target", () => {
  it("is 14 OFFICE working days (Mon–Fri, public holidays off) from the KL date of Supplier receipt", () => {
    // Mon 28 Sep 2026 KL → 14 Office working days, no holiday in between.
    expect(repairOrderReturnTarget("2026-09-28T02:00:00Z", 14, new Set())).toBe("2026-10-16");
    // 23:30 UTC on the 27th is already the 28th in Kuala Lumpur.
    expect(klDate("2026-09-27T23:30:00Z")).toBe("2026-09-28");
    // A public holiday inside the window pushes the target one Office day.
    expect(repairOrderReturnTarget("2026-09-28T02:00:00Z", 14, new Set(["2026-10-05"]))).toBe("2026-10-19");
  });
});

describe("derived facts", () => {
  it("Category prints dictionary words in dictionary order", () => {
    expect(repairOrderCategory(row({ units: [unit({ category: "Sofa" }), unit({ stock_item_id: "b", category: "Mattress" })] }))).toBe("Mattress · Sofa");
    expect(repairOrderCategory(row())).toBeNull();
  });

  it("stage walks the route from facts only", () => {
    expect(repairOrderStage(row())).toBe("not_issued");
    expect(repairOrderStage(row({ issued: true }))).toBe("awaiting_receipt");
    expect(repairOrderStage(row({ issued: true, supplier_received_at: "x" }))).toBe("waiting_pickup");
    expect(repairOrderStage(row({ issued: true, supplier_received_at: "x", units: [unit({ actual_pickup_date: "d" })] }))).toBe("out_for_repair");
    expect(repairOrderStage(row({ issued: true, supplier_received_at: "x", units: [unit({ actual_pickup_date: "d", goods_received_date: "g" })] }))).toBe("returned_not_inspected");
    expect(repairOrderStage(row({ issued: true, supplier_received_at: "x", units: [unit({ actual_pickup_date: "d", goods_received_date: "g", inspected: true })] }))).toBe("complete");
    expect(repairOrderStage(row({ cancelled_at: "c" }))).toBe("cancelled");
  });

  it("rail conditions are factual; missing sending evidence is `Sending not confirmed`", () => {
    const two = [unit(), unit({ stock_item_id: "si2", actual_pickup_date: "d", pickup_proof: false })];
    expect(repairOrderConditions(row({ units: two }))).toEqual(["Sending not confirmed", "Partly picked up", "Not returned", "Pickup proof missing"]);
  });

  it("GRN No: one prints itself, several read {n} GRNs, none is blank", () => {
    expect(repairOrderGrnCell(row())).toBe("");
    expect(repairOrderGrnCell(row({ units: [unit({ grn_no: "GRN-1" })] }))).toBe("GRN-1");
    expect(repairOrderGrnCell(row({ units: [unit({ grn_no: "GRN-1" }), unit({ stock_item_id: "b", grn_no: "GRN-2" })] }))).toBe("2 GRNs");
  });

  it("Repair Requirement: several read {first} + {n} more; footer counts documents", () => {
    expect(repairOrderRequirementCell(row({ units: [unit(), unit({ stock_item_id: "b", repair_requirement: "Supply leg" })] }))).toBe("Fix arm + 1 more");
    expect(repairOrderFooter(1, 1)).toBe("1 Repair Order");
    expect(repairOrderFooter(3, 3)).toBe("3 Repair Orders");
    expect(repairOrderFooter(2, 5)).toBe("2 of 5 Repair Orders");
  });
});

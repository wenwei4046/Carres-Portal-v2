import { describe, expect, it } from "vitest";
import {
  PURCHASE_RETURN_ABSENT,
  PURCHASE_RETURN_COLUMN_LABEL,
  PURCHASE_RETURN_COLUMN_ORDER,
  PURCHASE_RETURN_CONDITIONS,
  PURCHASE_RETURN_CONDITION_SECTION,
  PURCHASE_RETURN_EVIDENCE_PURPOSES,
  PURCHASE_RETURN_RAIL_SECTIONS,
  PURCHASE_RETURN_UNIT_COLUMN_ORDER,
  PURCHASE_RETURN_UNIT_QTY,
  purchaseReturnActualPickupDate,
  purchaseReturnCollectedBy,
  purchaseReturnCollectedQty,
  purchaseReturnConditionCounts,
  purchaseReturnConditions,
  purchaseReturnItemSpec,
  purchaseReturnNo,
  purchaseReturnPhotoAction,
  purchaseReturnPickupProofMissing,
  purchaseReturnQty,
  purchaseReturnReturnTo,
  purchaseReturnSupplierCounts,
  purchaseReturnSupplierReceivedDate,
  purchaseReturnUnitCell,
  purchaseReturnVideoAction,
  type PurchaseReturnListRow,
  type PurchaseReturnUnitRow,
} from "./purchase-return";

const unit = (over: Partial<PurchaseReturnUnitRow> = {}): PurchaseReturnUnitRow => ({
  unit_id: "U-20260904-0142",
  po_id: "PO-20260901-0251",
  category: "Sofa",
  item: "Sofa Lyra",
  item_spec: "Left arm · Grey",
  pickup_location: "AL Sungai Buloh",
  return_to: "Hookka Factory, Muar",
  collected_by: null,
  actual_pickup_date: null,
  supplier_received_date: null,
  evidence: [{ purpose: "problem", photos: 2, videos: 0 }],
  ...over,
});

const doc = (over: Partial<PurchaseReturnListRow> = {}): PurchaseReturnListRow => ({
  id: "pr-1",
  pr_no: "1042",
  pr_doc_date: "2026-09-15T02:00:00Z",
  supplier_id: "supplier-1",
  supplier_name: "Hookka",
  claim_no: "SC-1038",
  grn_no: "GRN-20260904-1064",
  document_sent_at: null,
  confirmed_pickup_date: null,
  units: [unit()],
  ...over,
});

describe("the confirmed §9.6 column order", () => {
  it("puts Category immediately before the combined PO No / Unit ID cell", () => {
    const order = [...PURCHASE_RETURN_COLUMN_ORDER];
    expect(order[order.indexOf("po_unit") - 1]).toBe("category");
  });

  it("leads with PR Doc Date then PR No, the §6.7 date/identity pair", () => {
    expect(PURCHASE_RETURN_COLUMN_ORDER[0]).toBe("pr_doc_date");
    expect(PURCHASE_RETURN_COLUMN_ORDER[1]).toBe("pr_no");
  });

  it("keeps PO No and Unit ID in ONE cell, never two columns", () => {
    expect(PURCHASE_RETURN_COLUMN_ORDER).not.toContain("unit_id");
    expect(PURCHASE_RETURN_COLUMN_ORDER.filter((k) => k === "po_unit")).toHaveLength(1);
  });

  it("carries no Finance, Credit Consequence or Work column", () => {
    for (const banned of ["finance", "credit", "credit_consequence", "work"]) {
      expect(PURCHASE_RETURN_COLUMN_ORDER).not.toContain(banned);
    }
    const labels = Object.values(PURCHASE_RETURN_COLUMN_LABEL).join(" ");
    expect(labels).not.toMatch(/Finance|Credit|Work/);
  });

  it("keeps the three pickup/receipt dates as separate facts", () => {
    expect(PURCHASE_RETURN_COLUMN_ORDER).toContain("confirmed_pickup_date");
    expect(PURCHASE_RETURN_COLUMN_ORDER).toContain("actual_pickup_date");
    expect(PURCHASE_RETURN_COLUMN_ORDER).toContain("supplier_received_date");
  });

  it("re-leads the expansion on Category, still ahead of PO No / Unit ID", () => {
    expect(PURCHASE_RETURN_UNIT_COLUMN_ORDER[0]).toBe("category");
    expect(PURCHASE_RETURN_UNIT_COLUMN_ORDER[1]).toBe("po_unit");
    expect(PURCHASE_RETURN_UNIT_COLUMN_ORDER.at(-1)).toBe("evidence");
  });
});

describe("the visible PR- reference", () => {
  it("prefixes a bare stored sequence", () => {
    expect(purchaseReturnNo("1042")).toBe("PR-1042");
  });

  it("leaves an already-prefixed reference untouched", () => {
    expect(purchaseReturnNo("PR-20260915-1042")).toBe("PR-20260915-1042");
  });

  it("re-presents the retired PRTN- prefix without migrating the record", () => {
    expect(purchaseReturnNo("PRTN-1042")).toBe("PR-1042");
  });

  it("says so when no number has been issued", () => {
    expect(purchaseReturnNo(null)).toBe("Not issued");
    expect(purchaseReturnNo("   ")).toBe("Not issued");
  });
});

describe("one tracked Unit per expanded row", () => {
  it("fixes the expanded quantity at 1", () => {
    expect(PURCHASE_RETURN_UNIT_QTY).toBe(1);
  });

  it("counts the document's Qty as one per Unit", () => {
    expect(purchaseReturnQty(doc({ units: [unit(), unit({ unit_id: "U-2" })] }))).toBe(2);
  });
});

describe("collected quantities and collectors", () => {
  it("counts only Units that actually left", () => {
    const row = doc({
      units: [
        unit({ actual_pickup_date: "2026-09-16T02:00:00Z", collected_by: "Faizal" }),
        unit({ unit_id: "U-2" }),
      ],
    });
    expect(purchaseReturnCollectedQty(row)).toBe(1);
    expect(purchaseReturnCollectedBy(row)).toBe("Faizal");
  });

  it("refuses to name one collector when two collected", () => {
    const row = doc({
      units: [
        unit({ collected_by: "Faizal", actual_pickup_date: "2026-09-16T02:00:00Z" }),
        unit({ unit_id: "U-2", collected_by: "Rahim", actual_pickup_date: "2026-09-17T02:00:00Z" }),
      ],
    });
    expect(purchaseReturnCollectedBy(row)).toBe("2 collectors");
  });

  it("records no collector when nobody has collected", () => {
    expect(purchaseReturnCollectedBy(doc())).toBeNull();
  });
});

describe("a parent date is printed only when every Unit agrees", () => {
  it("withholds the pickup date while one Unit is outstanding", () => {
    const row = doc({
      units: [unit({ actual_pickup_date: "2026-09-16T02:00:00Z" }), unit({ unit_id: "U-2" })],
    });
    expect(purchaseReturnActualPickupDate(row)).toBeNull();
  });

  it("prints the latest date once all Units carry one", () => {
    const row = doc({
      units: [
        unit({ actual_pickup_date: "2026-09-16T02:00:00Z" }),
        unit({ unit_id: "U-2", actual_pickup_date: "2026-09-18T02:00:00Z" }),
      ],
    });
    expect(purchaseReturnActualPickupDate(row)).toBe("2026-09-18T02:00:00Z");
  });

  it("keeps supplier receipt separate from pickup", () => {
    const row = doc({ units: [unit({ actual_pickup_date: "2026-09-16T02:00:00Z" })] });
    expect(purchaseReturnActualPickupDate(row)).toBe("2026-09-16T02:00:00Z");
    expect(purchaseReturnSupplierReceivedDate(row)).toBeNull();
  });
});

describe("the combined identity cell", () => {
  it("prints the Unit ID for a single-Unit return", () => {
    expect(purchaseReturnUnitCell(doc())).toBe("U-20260904-0142");
  });

  it("exposes the count as the expansion entry when there are several", () => {
    expect(purchaseReturnUnitCell(doc({ units: [unit(), unit({ unit_id: "U-2" })] }))).toBe("2 Units");
  });

  it("records nothing rather than inventing a Unit", () => {
    expect(purchaseReturnUnitCell(doc({ units: [] }))).toBe(PURCHASE_RETURN_ABSENT);
  });
});

describe("Return To is never assumed", () => {
  it("prints the recorded supplier-designated destination", () => {
    expect(purchaseReturnReturnTo(doc())).toBe("Hookka Factory, Muar");
  });

  it("stays null when no destination was recorded", () => {
    expect(purchaseReturnReturnTo(doc({ units: [unit({ return_to: null })] }))).toBeNull();
  });

  it("counts rather than picks one of two destinations", () => {
    const row = doc({
      units: [unit(), unit({ unit_id: "U-2", return_to: "Hookka Warehouse, Klang" })],
    });
    expect(purchaseReturnReturnTo(row)).toBe("2 destinations");
  });
});

describe("Items shows the model with its specification beneath", () => {
  it("prints the specification for a single model", () => {
    expect(purchaseReturnItemSpec(doc())).toBe("Left arm · Grey");
  });

  it("withholds it when the return carries two models", () => {
    const row = doc({ units: [unit(), unit({ unit_id: "U-2", item: "Bedframe Nora" })] });
    expect(purchaseReturnItemSpec(row)).toBeNull();
  });
});

describe("the rail is exactly the confirmed preview", () => {
  it("has four sections, in order", () => {
    expect(PURCHASE_RETURN_RAIL_SECTIONS.map((s) => s.key)).toEqual([
      "supplier",
      "document",
      "pickup",
      "evidence",
    ]);
  });

  it("does not grow a date-range or pickup-location section", () => {
    const keys = PURCHASE_RETURN_RAIL_SECTIONS.map((s) => s.key) as string[];
    expect(keys).not.toContain("date");
    expect(keys).not.toContain("pickup_location");
    expect(keys).toHaveLength(4);
  });

  it("gives every condition exactly one home", () => {
    for (const condition of Object.values(PURCHASE_RETURN_CONDITIONS)) {
      expect(PURCHASE_RETURN_CONDITION_SECTION[condition]).toBeTruthy();
    }
  });
});

describe("the rail conditions are facts, and they overlap", () => {
  it("marks an unsent, unconfirmed, uncollected return under all three", () => {
    expect(purchaseReturnConditions(doc())).toEqual([
      "Return document not sent",
      "Pickup date not confirmed",
      "Not picked up",
    ]);
  });

  it("separates partly from fully picked up", () => {
    const partly = doc({
      document_sent_at: "2026-09-15T05:00:00Z",
      confirmed_pickup_date: "2026-09-16T02:00:00Z",
      units: [
        unit({
          actual_pickup_date: "2026-09-16T02:00:00Z",
          evidence: [{ purpose: "pickup", photos: 1, videos: 0 }],
        }),
        unit({ unit_id: "U-2" }),
      ],
    });
    expect(purchaseReturnConditions(partly)).toEqual(["Partly picked up"]);

    const fully = doc({
      document_sent_at: "2026-09-15T05:00:00Z",
      confirmed_pickup_date: "2026-09-16T02:00:00Z",
      units: [
        unit({
          actual_pickup_date: "2026-09-16T02:00:00Z",
          evidence: [{ purpose: "pickup", photos: 1, videos: 0 }],
        }),
      ],
    });
    expect(purchaseReturnConditions(fully)).toEqual(["Fully picked up"]);
  });

  it("does not claim supplier receipt from a fully picked-up return", () => {
    const row = doc({
      document_sent_at: "2026-09-15T05:00:00Z",
      confirmed_pickup_date: "2026-09-16T02:00:00Z",
      units: [
        unit({
          actual_pickup_date: "2026-09-16T02:00:00Z",
          evidence: [{ purpose: "pickup", photos: 1, videos: 0 }],
        }),
      ],
    });
    expect(purchaseReturnConditions(row)).toContain("Fully picked up");
    expect(purchaseReturnSupplierReceivedDate(row)).toBeNull();
  });

  it("treats a return with no Units as not picked up, never fully", () => {
    expect(purchaseReturnConditions(doc({ units: [] }))).toContain("Not picked up");
    expect(purchaseReturnConditions(doc({ units: [] }))).not.toContain("Fully picked up");
  });
});

describe("Pickup proof missing accuses only a Unit that left", () => {
  it("ignores a Unit nobody has collected", () => {
    expect(purchaseReturnPickupProofMissing(doc())).toBe(false);
  });

  it("flags a collected Unit with no pickup photo or video", () => {
    const row = doc({
      units: [unit({ actual_pickup_date: "2026-09-16T02:00:00Z" })],
    });
    expect(purchaseReturnPickupProofMissing(row)).toBe(true);
  });

  it("is satisfied by a pickup video alone", () => {
    const row = doc({
      units: [
        unit({
          actual_pickup_date: "2026-09-16T02:00:00Z",
          evidence: [{ purpose: "pickup", photos: 0, videos: 1 }],
        }),
      ],
    });
    expect(purchaseReturnPickupProofMissing(row)).toBe(false);
  });

  it("is NOT satisfied by problem evidence — a damage photo is not pickup proof", () => {
    const row = doc({
      units: [
        unit({
          actual_pickup_date: "2026-09-16T02:00:00Z",
          evidence: [{ purpose: "problem", photos: 4, videos: 1 }],
        }),
      ],
    });
    expect(purchaseReturnPickupProofMissing(row)).toBe(true);
  });
});

describe("rail counts count documents, not Units", () => {
  const rows = [
    doc({ id: "a", supplier_name: "Hookka", units: [unit(), unit({ unit_id: "U-2" })] }),
    doc({ id: "b", supplier_name: "Hookka" }),
    doc({ id: "c", supplier_name: "Ohana" }),
  ];

  it("counts two Hookka documents, not three Hookka Units", () => {
    expect(purchaseReturnSupplierCounts(rows)).toEqual([
      { supplier: "Hookka", count: 2 },
      { supplier: "Ohana", count: 1 },
    ]);
  });

  it("respects the active condition when counting suppliers", () => {
    const mixed = [
      doc({ id: "a", supplier_name: "Hookka", document_sent_at: "2026-09-15T05:00:00Z" }),
      doc({ id: "b", supplier_name: "Ohana" }),
    ];
    expect(
      purchaseReturnSupplierCounts(mixed, { condition: "Return document not sent" }),
    ).toEqual([{ supplier: "Ohana", count: 1 }]);
  });

  it("respects the active supplier when counting conditions", () => {
    const counts = purchaseReturnConditionCounts(rows, { supplier: "Ohana" });
    expect(counts).toEqual([
      { condition: "Return document not sent", count: 1 },
      { condition: "Pickup date not confirmed", count: 1 },
      { condition: "Not picked up", count: 1 },
    ]);
  });

  it("names an unrecorded supplier rather than dropping its documents", () => {
    expect(purchaseReturnSupplierCounts([doc({ supplier_name: null })])).toEqual([
      { supplier: PURCHASE_RETURN_ABSENT, count: 1 },
    ]);
  });
});

describe("evidence entries", () => {
  it("keeps the three purposes distinct and separately labelled", () => {
    expect(PURCHASE_RETURN_EVIDENCE_PURPOSES.map((p) => p.label)).toEqual([
      "Problem evidence",
      "Pickup proof",
      "Supplier receipt proof",
    ]);
  });

  it("reads problem evidence from the claim, not from this register", () => {
    const problem = PURCHASE_RETURN_EVIDENCE_PURPOSES.find((p) => p.key === "problem");
    expect(problem?.source).toBe("claim");
  });

  it("offers no action where there is no file — an absence is not a zero", () => {
    expect(purchaseReturnPhotoAction(0)).toBeNull();
    expect(purchaseReturnVideoAction(0)).toBeNull();
    expect(purchaseReturnPhotoAction(3)).toBe("Photos 3");
    expect(purchaseReturnVideoAction(1)).toBe("Video 1");
  });
});

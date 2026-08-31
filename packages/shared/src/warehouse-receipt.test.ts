import { describe, it, expect } from "vitest";
import {
  formalGrnNumber,
  historicalReceivingRecordNo,
  historicalReceivingLineInput,
  receivingQuantities,
  receivingProblemCopy,
  receivingSessionIdentityProblems,
  receivingUnitIdProblems,
  receivingUnitOutcomes,
  countedOnLine,
  warehouseReceiptProblems,
  warehouseReceiptProblemText,
  warehouseReceiptStatusLabel,
  warehouseReceiptSummary,
  warehouseReceiptTotals,
  warehouseReceiptOpensClaims,
  WAREHOUSE_RECEIPT_STATUS_LABEL,
  type WarehouseReceiptDraft,
  type WarehouseReceiptLineDraft,
} from "./warehouse-receipt";
import { receivingSessionInputSchema } from "./schemas/warehouse";

/**
 * R6 — the gate the warehouse's Send button asks, and the ops queue's words.
 *
 * The point of this suite is that ONE function answers "may this count be
 * sent", and that it answers with R2's own evidence rules rather than a second
 * copy of them.
 */

function line(
  over: Partial<WarehouseReceiptLineDraft> = {},
): WarehouseReceiptLineDraft {
  return {
    id: "11111111-1111-1111-1111-111111111111",
    sku: "MS01-K",
    pendingDelivery: 10,
    receivedNow: 0,
    damagedQty: 0,
    damagedPhotos: [],
    wrongItemQty: 0,
    wrongItemClaimType: null,
    wrongItemPhotos: [],
    category: "mattress",
    ...over,
  };
}

function draft(over: Partial<WarehouseReceiptDraft> = {}): WarehouseReceiptDraft {
  return {
    doNumber: "DO-5512",
    doFilePath: "PO-1/abc-do.jpg",
    lines: [line({ receivedNow: 4 })],
    ...over,
  };
}

describe("warehouseReceiptProblems", () => {
  it("is empty for a clean, complete count", () => {
    expect(warehouseReceiptProblems(draft())).toEqual([]);
  });

  it("asks for a DO number of at least 3 characters", () => {
    expect(warehouseReceiptProblems(draft({ doNumber: "DO" }))).toContain(
      "do_number_required",
    );
    expect(warehouseReceiptProblems(draft({ doNumber: "  " }))).toContain(
      "do_number_required",
    );
  });

  it("asks for the signed DO photo", () => {
    expect(warehouseReceiptProblems(draft({ doFilePath: null }))).toContain(
      "do_file_required",
    );
    expect(warehouseReceiptProblems(draft({ doFilePath: "   " }))).toContain(
      "do_file_required",
    );
  });

  it("refuses a count of nothing", () => {
    expect(warehouseReceiptProblems(draft({ lines: [line()] }))).toContain(
      "nothing_counted",
    );
  });

  it("counts a damaged-only delivery as counted — it is still a delivery", () => {
    const d = draft({
      lines: [line({ damagedQty: 2, damagedPhotos: ["p1.jpg"] })],
    });
    expect(warehouseReceiptProblems(d)).toEqual([]);
  });

  it("refuses more units than the line still owes", () => {
    const d = draft({ lines: [line({ pendingDelivery: 3, receivedNow: 4 })] });
    expect(warehouseReceiptProblems(d)).toContain("line_over_reported");
  });

  it("counts the three numbers against ONE budget", () => {
    const ok = draft({
      lines: [
        line({
          pendingDelivery: 3,
          receivedNow: 1,
          damagedQty: 1,
          damagedPhotos: ["p.jpg"],
          wrongItemQty: 1,
          wrongItemClaimType: "wrong_sku",
          wrongItemPhotos: ["q.jpg"],
        }),
      ],
    });
    expect(warehouseReceiptProblems(ok)).toEqual([]);

    const over = draft({
      lines: [
        line({
          pendingDelivery: 2,
          receivedNow: 1,
          damagedQty: 1,
          damagedPhotos: ["p.jpg"],
          wrongItemQty: 1,
          wrongItemClaimType: "wrong_sku",
          wrongItemPhotos: ["q.jpg"],
        }),
      ],
    });
    expect(warehouseReceiptProblems(over)).toContain("line_over_reported");
  });

  // The evidence law is R2's, not a second copy — these assert it reaches
  // the warehouse door unchanged.
  it("carries R2's evidence law: damage needs a photo", () => {
    const d = draft({ lines: [line({ damagedQty: 1 })] });
    expect(warehouseReceiptProblems(d)).toContain("damaged_photo_required");
  });

  it("carries R2's evidence law: a wrong item needs its kind AND a photo", () => {
    const d = draft({ lines: [line({ wrongItemQty: 1 })] });
    const problems = warehouseReceiptProblems(d);
    expect(problems).toContain("wrong_item_type_required");
    expect(problems).toContain("wrong_item_photo_required");
  });

  it("carries R2's narrowing: a mattress has no parts to be missing", () => {
    const d = draft({
      lines: [
        line({
          category: "mattress",
          wrongItemQty: 1,
          wrongItemClaimType: "missing_parts",
          wrongItemPhotos: ["q.jpg"],
        }),
      ],
    });
    expect(warehouseReceiptProblems(d)).toContain("wrong_item_type_invalid");

    const frame = draft({
      lines: [
        line({
          category: "bedframe",
          wrongItemQty: 1,
          wrongItemClaimType: "missing_parts",
          wrongItemPhotos: ["q.jpg"],
        }),
      ],
    });
    expect(warehouseReceiptProblems(frame)).toEqual([]);
  });

  it("reports the same problem once even across several lines", () => {
    const d = draft({
      lines: [
        line({ id: "a", damagedQty: 1 }),
        line({ id: "b", damagedQty: 2 }),
      ],
    });
    const problems = warehouseReceiptProblems(d);
    expect(problems.filter((p) => p === "damaged_photo_required")).toHaveLength(1);
  });

  it("gives every problem it can raise a sentence a clerk can act on", () => {
    const d = draft({
      doNumber: "",
      doFilePath: null,
      lines: [line({ pendingDelivery: 0, damagedQty: 1, wrongItemQty: 1 })],
    });
    for (const p of warehouseReceiptProblems(d)) {
      const text = warehouseReceiptProblemText(p);
      expect(text).not.toBe(p);
      expect(text.length).toBeGreaterThan(0);
    }
  });
});

describe("countedOnLine", () => {
  it("adds good, damaged and wrong together and floors at zero", () => {
    expect(countedOnLine({ receivedNow: 2, damagedQty: 1, wrongItemQty: 3 })).toBe(6);
    expect(countedOnLine({ receivedNow: -5, damagedQty: 0, wrongItemQty: 0 })).toBe(0);
  });
});

describe("warehouseReceiptTotals / summary", () => {
  const lines = [
    {
      id: "a",
      sku: "MS01-K",
      received_now: 4,
      damaged_qty: 1,
      wrong_item_qty: 0,
      wrong_item_claim_type: null,
    },
    {
      id: "b",
      sku: "BF02-Q",
      received_now: 2,
      damaged_qty: 0,
      wrong_item_qty: 2,
      wrong_item_claim_type: "wrong_colour",
    },
  ];

  it("sums what the receipt claims", () => {
    expect(warehouseReceiptTotals(lines)).toEqual({
      received: 6,
      damaged: 1,
      wrongItem: 2,
      issue: 3,
      lines: 2,
    });
  });

  it("degrades to zeroes rather than NaN on a missing payload", () => {
    expect(warehouseReceiptTotals(null).received).toBe(0);
    expect(warehouseReceiptTotals(undefined).issue).toBe(0);
  });

  it("says what arrived, and never mentions pending delivery", () => {
    expect(warehouseReceiptSummary(lines)).toBe("6 good · 1 damaged · 2 wrong items");
    expect(warehouseReceiptSummary(lines)).not.toContain("pending");
  });

  it("singularises one wrong item", () => {
    expect(
      warehouseReceiptSummary([
        {
          id: "a",
          sku: "X",
          received_now: 0,
          damaged_qty: 0,
          wrong_item_qty: 1,
          wrong_item_claim_type: "wrong_sku",
        },
      ]),
    ).toBe("0 good · 1 wrong item");
  });

  it("warns the reviewer when a check-in will open claims", () => {
    expect(warehouseReceiptOpensClaims(lines)).toBe(true);
    expect(
      warehouseReceiptOpensClaims([
        {
          id: "a",
          sku: "X",
          received_now: 3,
          damaged_qty: 0,
          wrong_item_qty: 0,
          wrong_item_claim_type: null,
        },
      ]),
    ).toBe(false);
  });
});

describe("status words", () => {
  it("names WHO a submitted receipt is waiting for", () => {
    expect(WAREHOUSE_RECEIPT_STATUS_LABEL.submitted).toBe("Waiting Carres check");
    // C2 (2026-08-03): the status word is `posted`. `checked_in` was renamed by
    // 0314 — it named the ACT (`Check in`) while a status has to name the
    // STATE — and this file was the last place still asserting the old word.
    expect(warehouseReceiptStatusLabel("posted")).toBe("Checked in by Carres");
    expect(warehouseReceiptStatusLabel("returned")).toBe("Sent back to recount");
    expect(warehouseReceiptStatusLabel("voided")).toBe("Reversed");
    // An unknown key echoes rather than inventing a word.
    expect(warehouseReceiptStatusLabel("checked_in")).toBe("checked_in");
    expect(warehouseReceiptStatusLabel("returned")).toBe("Sent back to recount");
  });

  it("never says Missing or Pending delivery about a receipt", () => {
    for (const label of Object.values(WAREHOUSE_RECEIPT_STATUS_LABEL)) {
      expect(label.toLowerCase()).not.toContain("missing");
      expect(label.toLowerCase()).not.toContain("pending");
    }
  });

  it("falls back to the raw value rather than a blank", () => {
    expect(warehouseReceiptStatusLabel(null)).toBe("—");
    expect(warehouseReceiptStatusLabel("something_new")).toBe("something_new");
  });
});

describe("formal GRN identity", () => {
  const R = { id: "5b34f513-58c3-4913-9198-d513f17a6ceb", goods_received_at: "2026-08-02" };

  it("keeps draft and submitted sessions unnumbered", () => {
    expect(receivingSessionIdentityProblems({ status: "draft", grnNumber: null })).toEqual([]);
    expect(receivingSessionIdentityProblems({ status: "submitted", grnNumber: null })).toEqual([]);
  });

  it("requires a stored number after posting", () => {
    expect(receivingSessionIdentityProblems({ status: "posted", grnNumber: null })).toEqual([
      "grn_number_required",
    ]);
    expect(
      receivingSessionIdentityProblems({
        status: "posted",
        grnNumber: "GRN-20260831-0042",
      }),
    ).toEqual([]);
    expect(
      receivingSessionIdentityProblems({
        status: "amended",
        grnNumber: "GRN-20260831-0042",
      }),
    ).toEqual([]);
  });

  it("accepts only a real GRN-YYYYMMDD-RRRR document number", () => {
    expect(formalGrnNumber("GRN-20260831-0042")).toBe("GRN-20260831-0042");
    expect(formalGrnNumber("grn-20260831-0042")).toBeNull();
    expect(formalGrnNumber("GRN-310826-0042")).toBeNull();
    expect(formalGrnNumber("GRN-20260230-0042")).toBeNull();
    expect(formalGrnNumber("GRN-20260831-42")).toBeNull();
  });

  it("labels the old derived number as historical fallback only", () => {
    expect(historicalReceivingRecordNo({ id: R.id, submitted_at: "2026-07-31T10:00:00Z" })).toMatch(
      /^GRN-310726-\d{4}$/,
    );
    expect(historicalReceivingRecordNo({ id: R.id })).toBe("—");
  });
});

describe("Receiving quantities", () => {
  it.each([
    {
      name: "full",
      input: { orderQty: 5, receivedQty: 5, damagedQty: 0, wrongItemQty: 0, extraQty: 0 },
      pending: 0,
    },
    {
      name: "partial",
      input: { orderQty: 5, receivedQty: 2, damagedQty: 0, wrongItemQty: 0, extraQty: 0 },
      pending: 3,
    },
    {
      name: "damaged does not reduce pending",
      input: { orderQty: 5, receivedQty: 2, damagedQty: 3, wrongItemQty: 0, extraQty: 0 },
      pending: 3,
    },
    {
      name: "wrong item does not reduce pending",
      input: { orderQty: 5, receivedQty: 2, damagedQty: 0, wrongItemQty: 3, extraQty: 0 },
      pending: 3,
    },
    {
      name: "extra does not reduce pending",
      input: { orderQty: 5, receivedQty: 2, damagedQty: 0, wrongItemQty: 0, extraQty: 4 },
      pending: 3,
    },
    {
      name: "zero count",
      input: { orderQty: 5, receivedQty: 0, damagedQty: 0, wrongItemQty: 0, extraQty: 0 },
      pending: 5,
    },
  ])("keeps the source balance honest for $name", ({ input, pending }) => {
    expect(receivingQuantities(input)).toEqual({ ...input, pendingDeliveryQty: pending });
  });
});

describe("Receiving Unit IDs", () => {
  const base = {
    receivedQty: 2,
    damagedQty: 0,
    wrongItemQty: 0,
    extraQty: 0,
    unitIds: ["PO-1-001", "PO-1-002"],
  } as const;

  it("accepts the exact governed source Units", () => {
    expect(
      receivingUnitIdProblems(base, {
        expectedUnitIds: ["PO-1-001", "PO-1-002"],
        wrongSourceUnitIds: [],
      }),
    ).toEqual([]);
  });

  it("names duplicate, missing, wrong-source and unexpected IDs separately", () => {
    expect(
      receivingUnitIdProblems({ ...base, unitIds: ["PO-1-001", "PO-1-001"] }, {
        expectedUnitIds: ["PO-1-001", "PO-1-002"],
        wrongSourceUnitIds: [],
      }),
    ).toContain("duplicate_unit_id");
    expect(
      receivingUnitIdProblems({ ...base, unitIds: ["PO-1-001"] }, {
        expectedUnitIds: ["PO-1-001", "PO-1-002"],
        wrongSourceUnitIds: [],
      }),
    ).toContain("unit_id_missing");
    expect(
      receivingUnitIdProblems({ ...base, unitIds: ["PO-1-001", "PO-2-001"] }, {
        expectedUnitIds: ["PO-1-001", "PO-1-002"],
        wrongSourceUnitIds: ["PO-2-001"],
      }),
    ).toContain("unit_id_wrong_source");
    expect(
      receivingUnitIdProblems({ ...base, unitIds: ["PO-1-001", "UNKNOWN"] }, {
        expectedUnitIds: ["PO-1-001", "PO-1-002"],
        wrongSourceUnitIds: [],
      }),
    ).toContain("unit_id_unexpected");
  });

  it("binds each scanned ID to one explicit quantity outcome", () => {
    expect(
      receivingUnitOutcomes({
        receivedQty: 1,
        damagedQty: 1,
        wrongItemQty: 1,
        extraQty: 1,
        unitIds: ["GOOD-1", "DAMAGED-1", "WRONG-1", "EXTRA-1"],
      }),
    ).toEqual([
      { unitId: "GOOD-1", outcome: "received" },
      { unitId: "DAMAGED-1", outcome: "damaged" },
      { unitId: "WRONG-1", outcome: "wrong_item" },
      { unitId: "EXTRA-1", outcome: "extra" },
    ]);
  });

  it("keeps an extra supplier label as evidence without pretending it is a PO Unit", () => {
    expect(receivingUnitIdProblems({
      receivedQty: 1,
      damagedQty: 0,
      wrongItemQty: 0,
      extraQty: 1,
      unitIds: ["PO-1-001", "SUPPLIER-LABEL-X"],
    }, {
      expectedUnitIds: ["PO-1-001"],
      wrongSourceUnitIds: [],
    })).toEqual([]);
  });
});

describe("Receiving problem copy", () => {
  it("keeps the fact and next action as separate fields", () => {
    expect(receivingProblemCopy("supplier_do_missing")).toEqual({
      fact: "Supplier DO is missing",
      action: "Add the Supplier DO before you finish receiving",
    });
    expect(receivingProblemCopy("signed_do_missing")).toEqual({
      fact: "Signed DO photo is missing",
      action: "Upload the signed DO photo",
    });
  });

  it("names the exact item when a Unit ID is missing", () => {
    expect(receivingProblemCopy("unit_id_missing", { item: "MS01 King" })).toEqual({
      fact: "Unit ID is missing for MS01 King",
      action: "Scan the Unit ID shown on the Purchase Order",
    });
  });
});

describe("Receiving session wire contract", () => {
  const input = {
    sourceKind: "purchase_order",
    sourceId: "PO-2053",
    expectedVersion: 2,
    supplierDoNo: "DO-8891",
    signedDoPath: "PO-2053/do.jpg",
    goodsReceivedAt: "2026-08-31T02:15:00.000Z",
    note: null,
    lines: [
      {
        poLineId: "11111111-1111-1111-1111-111111111111",
        sku: "MS01-K",
        receivedQty: 1,
        damagedQty: 0,
        wrongItemQty: 0,
        extraQty: 0,
        unitIds: ["PO-2053-001"],
        damagedPhotos: [],
        wrongItemPhotos: [],
        extraEvidence: [],
        wrongItemReason: null,
      },
    ],
  } as const;

  it("accepts the governed save/submit shape", () => {
    expect(receivingSessionInputSchema.parse(input)).toEqual(input);
  });

  it("accepts an incomplete persistent Draft before evidence is collected", () => {
    const draft = {
      ...input,
      supplierDoNo: "",
      signedDoPath: "",
      goodsReceivedAt: "",
      lines: input.lines.map((line) => ({
        ...line,
        receivedQty: 0,
        unitIds: [],
      })),
    };
    expect(receivingSessionInputSchema.parse(draft)).toEqual(draft);
  });

  it("refuses the historical receivedNow spelling at the new door", () => {
    expect(
      receivingSessionInputSchema.safeParse({
        ...input,
        lines: [{ ...input.lines[0], receivedQty: undefined, receivedNow: 1 }],
      }).success,
    ).toBe(false);
  });

  it("maps a historical stored line read-only without allocating Unit IDs", () => {
    expect(
      historicalReceivingLineInput({
        id: "11111111-1111-1111-1111-111111111111",
        sku: "MS01-K",
        received_now: 2,
        damaged_qty: 1,
        wrong_item_qty: 0,
        wrong_item_claim_type: null,
      }),
    ).toEqual({
      poLineId: "11111111-1111-1111-1111-111111111111",
      sku: "MS01-K",
      receivedQty: 2,
      damagedQty: 1,
      wrongItemQty: 0,
      extraQty: 0,
      unitIds: [],
      damagedPhotos: [],
      wrongItemPhotos: [],
      extraEvidence: [],
      wrongItemReason: null,
    });
  });
});

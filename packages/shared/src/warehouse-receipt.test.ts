import { describe, it, expect } from "vitest";
import {
  receivingRecordNo,
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

describe("receivingRecordNo — the Receiving Record's document number", () => {
  const R = { id: "5b34f513-58c3-4913-9198-d513f17a6ceb", goods_received_at: "2026-08-02" };

  it("prints PREFIX-DDMMYY-NNNN off the BUSINESS date", () => {
    expect(receivingRecordNo(R)).toMatch(/^GRN-020826-\d{4}$/);
  });

  it("is stable — a reprint matches the original", () => {
    expect(receivingRecordNo(R)).toBe(receivingRecordNo(R));
  });

  it("carries no counter — two records on one day differ by their own id", () => {
    const other = { ...R, id: "11111111-1111-4111-8111-111111111111" };
    expect(receivingRecordNo(other)).not.toBe(receivingRecordNo(R));
    // Same day, so the date half is shared and only the hashed tail moves:
    // volume stays private (a counter would tell a supplier how many
    // deliveries we take in a month).
    expect(receivingRecordNo(other).slice(0, 11)).toBe(receivingRecordNo(R).slice(0, 11));
  });

  it("falls back to the submitted stamp, and says nothing when it has no date", () => {
    expect(receivingRecordNo({ id: R.id, submitted_at: "2026-07-31T10:00:00Z" })).toMatch(
      /^GRN-310726-\d{4}$/,
    );
    expect(receivingRecordNo({ id: R.id })).toBe("—");
  });
});

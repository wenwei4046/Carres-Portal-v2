import { describe, it, expect } from "vitest";
import { newGoodsReceiptBody, type NewGrnDraft } from "./NewGoodsReceiptModal";

const KEY = "00000000-0000-4000-8000-000000000001";
const draft: NewGrnDraft = {
  supplierId: "00000000-0000-4000-8000-000000000002", destinationId: "00000000-0000-4000-8000-000000000003",
  receivedAt: null, doNumber: "DO-1", doFilePath: "NO-PO/a.jpg", note: "", lines: [{ key: 1, sku: "S1", qty: "2", price: "" }],
};

describe("New Goods Receipt body (0728, Houzs grns.ts:1408)", () => {
  it("needs supplier, items, a DO number and its photo", () => {
    expect(newGoodsReceiptBody(draft, KEY)).toMatchObject({ doNumber: "DO-1", saveKey: KEY, lines: [{ sku: "S1", qty: 2, price: null }] });
    expect(newGoodsReceiptBody({ ...draft, doFilePath: null }, KEY)).toBeNull();
    expect(newGoodsReceiptBody({ ...draft, supplierId: "" }, KEY)).toBeNull();
    expect(newGoodsReceiptBody({ ...draft, lines: [] }, KEY)).toBeNull();
  });
});

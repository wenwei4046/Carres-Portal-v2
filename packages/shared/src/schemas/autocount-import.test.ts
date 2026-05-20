import { describe, it, expect } from "vitest";
import {
  autocountImportRowSchema,
  autocountImportInput,
  autocountImportResponseSchema,
} from "./autocount-import";

const validRow = {
  ref: "CR0418",
  itemGroup: "Mattress",
  qty: 1,
  detailDescription: "Breeze FirmCare-B1201F-K",
  debtorName: "Felix Koh",
};

describe("autocountImportRowSchema", () => {
  it("accepts a minimal valid row", () => {
    expect(autocountImportRowSchema.safeParse(validRow).success).toBe(true);
  });
  it("accepts nullish optionals", () => {
    expect(
      autocountImportRowSchema.safeParse({
        ...validRow,
        poDocNo: null,
        phone: undefined,
        addr1: null,
        balance: null,
      }).success,
    ).toBe(true);
  });
  it("rejects qty <= 0", () => {
    expect(autocountImportRowSchema.safeParse({ ...validRow, qty: 0 }).success).toBe(false);
  });
  it("rejects empty ref", () => {
    expect(autocountImportRowSchema.safeParse({ ...validRow, ref: "  " }).success).toBe(false);
  });
  it("rejects missing detailDescription", () => {
    const { detailDescription, ...rest } = validRow;
    void detailDescription;
    expect(autocountImportRowSchema.safeParse(rest).success).toBe(false);
  });
});

describe("autocountImportInput", () => {
  it("defaults sourceSystem to autocount", () => {
    const p = autocountImportInput.safeParse({
      dealerId: "00000000-0000-0000-0000-0000000000d1",
      rows: [validRow],
    });
    expect(p.success).toBe(true);
    if (p.success) expect(p.data.sourceSystem).toBe("autocount");
  });
  it("rejects non-uuid dealerId", () => {
    expect(
      autocountImportInput.safeParse({ dealerId: "house", rows: [validRow] }).success,
    ).toBe(false);
  });
  it("rejects empty rows", () => {
    expect(
      autocountImportInput.safeParse({
        dealerId: "00000000-0000-0000-0000-0000000000d1",
        rows: [],
      }).success,
    ).toBe(false);
  });
});

describe("autocountImportResponseSchema", () => {
  it("accepts a well-formed report", () => {
    expect(
      autocountImportResponseSchema.safeParse({
        ordersTotal: 1,
        created: 1,
        updated: 0,
        skippedLocked: 0,
        errored: 0,
        results: [
          {
            sourceRef: ["CR1009", "TCF0282"],
            result: "created",
            orderId: "00000000-0000-0000-0000-0000000000a1",
            so: 1251,
            unmatchedDescriptions: [],
            error: null,
          },
        ],
      }).success,
    ).toBe(true);
  });
  it("rejects an unknown result enum", () => {
    expect(
      autocountImportResponseSchema.safeParse({
        ordersTotal: 0,
        created: 0,
        updated: 0,
        skippedLocked: 0,
        errored: 0,
        results: [
          {
            sourceRef: [],
            result: "partial",
            orderId: null,
            so: null,
            unmatchedDescriptions: [],
            error: null,
          },
        ],
      }).success,
    ).toBe(false);
  });

  // 0135 — portal-wins-AutoCount guard.
  it("accepts 'updated_items_locked' as a valid result", () => {
    expect(
      autocountImportResponseSchema.safeParse({
        ordersTotal: 1,
        created: 0,
        updated: 1,
        skippedLocked: 0,
        errored: 0,
        results: [
          {
            sourceRef: ["CR0418"],
            result: "updated_items_locked",
            orderId: "00000000-0000-0000-0000-0000000000a1",
            so: 1252,
            unmatchedDescriptions: [],
            error: null,
          },
        ],
      }).success,
    ).toBe(true);
  });
});

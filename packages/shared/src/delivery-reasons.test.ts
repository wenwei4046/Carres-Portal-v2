import { describe, it, expect } from "vitest";
import {
  DELIVERY_REASONS,
  DELIVERY_REASON_KEYS,
  DELIVERY_REASON_CATEGORY_LABEL,
  deliveryReasonByKey,
  deliveryReasonLabel,
} from "./delivery-reasons";

describe("DELIVERY_REASONS (T4 Reason Library v1)", () => {
  it("carries v1's 12 + Card 5's two at-the-door reasons + the DO blueprint's four, unique keys", () => {
    // v1's 12 (T4) + `customer_rejected_goods` + `delivery_failed`
    // (SO V2 Card 5, 0344 — the delivery-attempt exception reads this library)
    // + the Delivery Order blueprint card's four (owner-approved 2026-08-16):
    // goods_damaged · wrong_goods · photo_missing · loan_not_collected.
    expect(DELIVERY_REASONS).toHaveLength(18);
    expect(new Set(DELIVERY_REASONS.map((r) => r.key)).size).toBe(18);
    expect(DELIVERY_REASON_KEYS).toHaveLength(18);
    expect(DELIVERY_REASON_KEYS).toContain("customer_rejected_goods");
    expect(DELIVERY_REASON_KEYS).toContain("delivery_failed");
    expect(DELIVERY_REASON_KEYS).toContain("goods_damaged");
    expect(DELIVERY_REASON_KEYS).toContain("wrong_goods");
    expect(DELIVERY_REASON_KEYS).toContain("photo_missing");
    expect(DELIVERY_REASON_KEYS).toContain("loan_not_collected");
  });

  it("responsibility follows the category by law", () => {
    const law: Record<string, string> = {
      customer: "customer",
      payment: "customer", // waiting for the customer's money starts the storage clock
      stock: "carres",
      logistic: "carres",
      site: "external",
    };
    for (const r of DELIVERY_REASONS) {
      expect(r.responsibility).toBe(law[r.category]);
    }
  });

  it("every category is represented and labelled", () => {
    const cats = new Set(DELIVERY_REASONS.map((r) => r.category));
    expect([...cats].sort()).toEqual(["customer", "logistic", "payment", "site", "stock"]);
    for (const c of cats) {
      expect(DELIVERY_REASON_CATEGORY_LABEL[c]).toBeTruthy();
    }
  });

  it("labels never leak the hidden responsibility word", () => {
    for (const r of DELIVERY_REASONS) {
      expect(r.label.toLowerCase()).not.toContain("carres side");
      expect(r.label.toLowerCase()).not.toContain("responsibility");
    }
  });

  it("deliveryReasonByKey resolves keys and rejects non-keys", () => {
    expect(deliveryReasonByKey("customer_renovation")?.label).toBe("Customer renovation");
    expect(deliveryReasonByKey("Renovation")).toBeNull();
    expect(deliveryReasonByKey(null)).toBeNull();
  });

  it("deliveryReasonLabel maps keys to labels and passes legacy text through", () => {
    expect(deliveryReasonLabel("stock_not_ready")).toBe("Stock not ready");
    // legacy 0196 rows stored the old dropdown words — display as-is
    expect(deliveryReasonLabel("Renovation")).toBe("Renovation");
    expect(deliveryReasonLabel("Others")).toBe("Others");
    expect(deliveryReasonLabel(null)).toBe("—");
    expect(deliveryReasonLabel("")).toBe("—");
  });
});

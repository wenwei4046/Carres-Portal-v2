import { describe, it, expect } from "vitest";
import {
  DELIVERY_REASONS,
  DELIVERY_REASON_KEYS,
  DELIVERY_REASON_CATEGORY_LABEL,
  deliveryReasonByKey,
  deliveryReasonLabel,
} from "./delivery-reasons";

describe("DELIVERY_REASONS (T4 Reason Library v1)", () => {
  it("carries the 12 ratified v1 reasons + Card 5's two at-the-door reasons, unique keys", () => {
    // v1's 12 (T4) + `customer_rejected_goods` + `delivery_failed`
    // (SO V2 Card 5, 0344 — the delivery-attempt exception reads this library).
    expect(DELIVERY_REASONS).toHaveLength(14);
    expect(new Set(DELIVERY_REASONS.map((r) => r.key)).size).toBe(14);
    expect(DELIVERY_REASON_KEYS).toHaveLength(14);
    expect(DELIVERY_REASON_KEYS).toContain("customer_rejected_goods");
    expect(DELIVERY_REASON_KEYS).toContain("delivery_failed");
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

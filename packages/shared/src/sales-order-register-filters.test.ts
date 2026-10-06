import { describe, expect, it } from "vitest";
import { registerDeliveryConditionOf } from "./sales-order-register-filters";

const bed = { sku: "mattress:M1401F-K", qty: 2 };
const pillow = { sku: "PIL-STD", qty: 4 };
const disposal = { sku: "DISPOSAL", qty: 1 };

describe("the Order list's delivery filter reads the one goods arithmetic", () => {
  it("nothing sold is Not delivered; a reserved unit is not delivered", () => {
    expect(registerDeliveryConditionOf([bed], [])).toBe("not_delivered");
    expect(registerDeliveryConditionOf([bed], [{ sku: bed.sku, status: "reserved", qty: 1 }])).toBe("not_delivered");
  });

  it("some sold is Partially delivered; every committed unit sold is Fully delivered", () => {
    expect(registerDeliveryConditionOf([bed], [{ sku: bed.sku, status: "sold", qty: 1 }])).toBe("partially_delivered");
    expect(registerDeliveryConditionOf([bed], [
      { sku: bed.sku, status: "sold", qty: 1 },
      { sku: bed.sku, status: "sold", qty: 1 },
    ])).toBe("fully_delivered");
  });

  it("an extra sold unit on one line does not deliver another line", () => {
    expect(registerDeliveryConditionOf([bed, pillow], [
      { sku: bed.sku, status: "sold", qty: 5 },
    ])).toBe("partially_delivered");
  });

  it("an order with no physical goods is not classified", () => {
    expect(registerDeliveryConditionOf([disposal], [])).toBeNull();
    expect(registerDeliveryConditionOf([], [])).toBeNull();
  });
});

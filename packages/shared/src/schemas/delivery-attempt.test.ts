import { describe, it, expect } from "vitest";
import { deliveryAttemptRecordInputSchema } from "./delivery-attempt";

describe("delivery attempt input — a Journey leg records its own result (0491)", () => {
  const failed = {
    result: "failed" as const,
    reasonKey: "customer_unreachable",
    whereGoods: "returned_to_warehouse" as const,
    note: "Nobody home",
  };

  it("a whole-order attempt still needs its reason and where the goods are, leg defaults to 0", () => {
    const ok = deliveryAttemptRecordInputSchema.safeParse(failed);
    expect(ok.success && ok.data.leg).toBe(0);
    expect(deliveryAttemptRecordInputSchema.safeParse({ ...failed, reasonKey: undefined }).success).toBe(false);
    expect(deliveryAttemptRecordInputSchema.safeParse({ ...failed, whereGoods: undefined }).success).toBe(false);
  });

  it("a leg's failed attempt carries its leg", () => {
    const ok = deliveryAttemptRecordInputSchema.safeParse({ ...failed, leg: 2 });
    expect(ok.success && ok.data.leg).toBe(2);
    expect(deliveryAttemptRecordInputSchema.safeParse({ ...failed, leg: 21 }).success).toBe(false);
  });

  it("`delivered` is an INTERMEDIATE leg's arrival — never the whole order's, and it moves no Unit", () => {
    expect(deliveryAttemptRecordInputSchema.safeParse({ result: "delivered", leg: 1 }).success).toBe(true);
    expect(deliveryAttemptRecordInputSchema.safeParse({ result: "delivered", leg: 0 }).success).toBe(false);
    expect(
      deliveryAttemptRecordInputSchema.safeParse({
        result: "delivered",
        leg: 1,
        deliveredItemIds: ["00000000-0000-0000-0000-0000000f0001"],
      }).success,
    ).toBe(false);
  });
});

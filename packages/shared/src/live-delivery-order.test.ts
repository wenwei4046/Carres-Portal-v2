import { describe, expect, it } from "vitest";
import { canMarkDelivered, liveDeliveryOrderNumber } from "./live-delivery-order";

const live = { do_number: "DO2610-4075", voided_at: null };
describe("live delivery order rule", () => {
  it("SO-1372 shape: empty orders.do_number + live DO row shows Mark delivered", () => {
    expect(canMarkDelivered({ status: "proceed_order", do_number: null, ops_delivery_orders: [live] })).toBe(true);
  });
  it("hides for a voided DO", () => {
    expect(canMarkDelivered({ status: "proceed_order", ops_delivery_orders: [{ ...live, voided_at: "2026-10-28" }] })).toBe(false);
  });
  it("hides for an already delivered or cancelled order", () => {
    expect(canMarkDelivered({ status: "delivered", ops_delivery_orders: [live] })).toBe(false);
    expect(canMarkDelivered({ status: "cancelled", ops_delivery_orders: [live] })).toBe(false);
  });
  it("hides with no DO at all", () => {
    expect(canMarkDelivered({ status: "proceed_order", ops_delivery_orders: [] })).toBe(false);
  });
  it("picks the newest live one, skipping a voided newer one", () => {
    expect(liveDeliveryOrderNumber([
      { do_number: "B", issued_at: "2026-10-03", voided_at: "x" },
      { do_number: "A", issued_at: "2026-10-02" },
      { do_number: "OLD", issued_at: "2026-10-01" },
    ])).toBe("A");
  });
});

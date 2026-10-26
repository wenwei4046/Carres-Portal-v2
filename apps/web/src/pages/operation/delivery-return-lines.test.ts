import { describe, expect, it } from "vitest";
import { deliveryReturnLinesOf, type DeliveryReturnRow } from "./delivery-return-lines";

const nameOf = (sku: string) => (sku === "CODY-Q" ? "Cody" : undefined);
const ret = (r: Partial<DeliveryReturnRow>) => ({
  id: "r1", return_no: "DR-2610-001", created_at: "2026-10-20T02:00:00Z", received_at: "2026-10-20T02:00:00Z",
  reason: "Damaged", refund_status: "pending", refund_status_at: null, warehouses: { name: "Klang" },
  ops_delivery_orders: { do_number: "DO-2610-009" }, orders: { so: 101, customer_name: "tan ah kow" },
  delivery_return_units: [], delivery_return_lines: [], ...r,
}) as DeliveryReturnRow;
const unit = (code: string, price: string, condition: "NEW" | "DAMAGED" = "NEW") =>
  ({ unit_price: price, refund: price, condition, ops_stock_items: { unit_code: code, sku: "CODY-Q" } });

// Follows Houzs DeliveryReturnDetailListing.tsx:32-137 and reports.ts:647-666.
describe("deliveryReturnLinesOf — one row per Delivery Return line (Houzs DR detail listing)", () => {
  it("folds Units of one SKU, price and condition into a line; Line refund sums them", () => {
    const rows = deliveryReturnLinesOf([ret({ delivery_return_units: [unit("U-2", "99.50"), unit("U-1", "99.50"), unit("U-3", "99.50", "DAMAGED")] })], nameOf);
    expect(rows.map((r) => [r.item, r.condition, r.qty, r.unitPrice, r.lineRefund, r.units])).toEqual([
      ["Cody", "NEW", 2, 99.5, 199, ["U-1", "U-2"]],
      ["Cody", "DAMAGED", 1, 99.5, 99.5, ["U-3"]],
    ]);
    expect(rows[0]).toMatchObject({ customer: "Tan Ah Kow", doNo: "DO-2610-009", site: "Klang", receivedAt: "2026-10-20T02:00:00Z" });
  });

  it("repeats the return's whole refund as Pending refund on each line while Pending, as Houzs does", () => {
    const rows = deliveryReturnLinesOf([ret({
      delivery_return_units: [unit("U-1", "100")],
      delivery_return_lines: [{ qty_returned: 2, unit_price: "50", refund: "100", condition: "OPENED", order_lines: { sku: "SOFA-X" } }],
    })], nameOf);
    expect(rows.map((r) => [r.item, r.qty, r.lineRefund, r.pendingRefund])).toEqual([["Cody", 1, 100, 200], ["SOFA-X", 2, 100, 200]]);
  });

  it("a Refunded return has no Pending refund and shows its Refunded date", () => {
    const [row] = deliveryReturnLinesOf([ret({ refund_status: "refunded", refund_status_at: "2026-10-22T03:00:00Z", delivery_return_units: [unit("U-1", "10")] })], nameOf);
    expect(row).toMatchObject({ pendingRefund: 0, refundedAt: "2026-10-22T03:00:00Z" });
    const [nr] = deliveryReturnLinesOf([ret({ refund_status: "not_refunded", refund_status_at: "2026-10-22T03:00:00Z", delivery_return_units: [unit("U-1", "10")] })], nameOf);
    expect(nr).toMatchObject({ pendingRefund: 0, refundedAt: null });
  });
});

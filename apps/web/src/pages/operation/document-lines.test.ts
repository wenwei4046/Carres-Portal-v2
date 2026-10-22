import { describe, expect, it } from "vitest";
import type { InvoiceRegisterRow } from "@carres/shared/payment-invoice-register";
import type { DeliveryOrderRow, operationOrderListRow } from "@/lib/queries";
import { deliveryOrderLinesOf, salesInvoiceLinesOf, salesOrderLinesOf } from "./document-lines";

const nameOf = (sku: string) => (sku === "CODY-Q" ? "Cody" : undefined);

describe("salesOrderLinesOf — one row per Sales Order line", () => {
  const order = (o: Partial<operationOrderListRow>) => ({
    id: "o1", so: 101, customer_name: "tan ah kow", proceeded_at: "2026-10-01T02:00:00Z",
    source_system: null, order_lines: [], ...o,
  }) as unknown as operationOrderListRow;

  it("repeats the order on every line, names the item and prices the line", () => {
    const rows = salesOrderLinesOf([order({
      order_lines: [
        { sku: "CODY-Q", qty: 2, unit_price: "1500.50" },
        { sku: "FREE TEXT", qty: 1, unit_price: null, label: "Old sofa" },
      ],
    })], nameOf);
    expect(rows).toEqual([
      { key: "o1:0", date: "2026-10-01T02:00:00Z", docNo: "SO-101", orderId: "o1", so: 101, customer: "Tan Ah Kow", item: "Cody", qty: 2, unitPrice: 1500.5, amount: 3001 },
      { key: "o1:1", date: "2026-10-01T02:00:00Z", docNo: "SO-101", orderId: "o1", so: 101, customer: "Tan Ah Kow", item: "Old sofa", qty: 1, unitPrice: null, amount: null },
    ]);
  });

  it("leaves rentals out, as the Sales Orders Register does", () => {
    expect(salesOrderLinesOf([order({ source_system: "rental", order_lines: [{ sku: "X", qty: 1 }] })], nameOf)).toEqual([]);
  });
});

describe("deliveryOrderLinesOf — one row per line on THIS trip", () => {
  const doc = (d: Partial<DeliveryOrderRow>) => ({
    id: "d1", do_number: "DO-1", issued_at: "2026-10-02T03:00:00Z", trip_groups: null, delivery_date: null,
    time_slot: null, logistics_partner: null, voided_at: null, void_reason: null,
    orders: { id: "o1", so: 101, customer_name: "Tan", order_lines: [{ sku: "CODY-Q", qty: 1 }, { sku: "SVC-X", qty: 1 }] },
    ...d,
  }) as DeliveryOrderRow;

  it("lists the document's goods with no price", () => {
    const rows = deliveryOrderLinesOf([doc({})], nameOf);
    expect(rows.map((r) => [r.docNo, r.so, r.item, r.qty, r.amount])).toEqual([
      ["DO-1", 101, "Cody", 1, null],
      ["DO-1", 101, "SVC-X", 1, null],
    ]);
    expect(rows[0]!.date).toBe("2026-10-02T03:00:00Z");
  });

  it("leaves cancelled documents out", () => {
    expect(deliveryOrderLinesOf([doc({ voided_at: "2026-10-03" })], nameOf)).toEqual([]);
  });
});

describe("salesInvoiceLinesOf — the issued Sales Invoice's order lines", () => {
  const inv = (i: Partial<InvoiceRegisterRow>) => ({
    id: "i1", invoice_no: "INV-1", status: "issued", kind: "sales", issued_at: "2026-10-05", voided_at: null,
    order_id: "o1", orders: { id: "o1", so: 101, customer_name: "Tan", order_lines: [{ sku: "CODY-Q", qty: 3, unit_price: 100 }] },
    ...i,
  }) as unknown as InvoiceRegisterRow;

  it("one row per order line of an issued Sales Invoice", () => {
    expect(salesInvoiceLinesOf([inv({})], nameOf)).toEqual([
      { key: "i1:0", date: "2026-10-05", docNo: "INV-1", orderId: "o1", so: 101, customer: "Tan", item: "Cody", qty: 3, unitPrice: 100, amount: 300 },
    ]);
  });

  it("leaves drafts, voided invoices and storage invoices out", () => {
    expect(salesInvoiceLinesOf([
      inv({ status: "draft" }),
      inv({ status: "voided", voided_at: "2026-10-06" }),
      inv({ kind: "storage" }),
    ], nameOf)).toEqual([]);
  });
});

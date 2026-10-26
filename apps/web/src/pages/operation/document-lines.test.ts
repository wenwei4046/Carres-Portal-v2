import { describe, expect, it } from "vitest";
import type { InvoiceRegisterRow } from "@carres/shared/payment-invoice-register";
import type { DeliveryOrderRow, operationOrderListRow } from "@/lib/queries";
import { deliveryOrderLinesOf, salesInvoiceLinesOf, salesOrderLinesOf } from "./document-lines";

const nameOf = (sku: string) => (sku === "CODY-Q" ? "Cody" : undefined);
const addonName = (key: string) => (key === "disposal" ? "Disposal" : undefined);

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
    })], nameOf, addonName);
    expect(rows).toEqual([
      { key: "o1:0", date: "2026-10-01T02:00:00Z", docNo: "SO-101", orderId: "o1", so: 101, customer: "Tan Ah Kow", item: "Cody", qty: 2, unitPrice: 1500.5, amount: 3001 },
      { key: "o1:1", date: "2026-10-01T02:00:00Z", docNo: "SO-101", orderId: "o1", so: 101, customer: "Tan Ah Kow", item: "Old sofa", qty: 1, unitPrice: null, amount: null },
    ]);
  });

  it("lists each add-on as its own priced line, so Amount totals the order", () => {
    const rows = salesOrderLinesOf([order({
      order_lines: [{ sku: "CODY-Q", qty: 1, unit_price: 1000 }],
      order_addons: [{ addon_key: "disposal", qty: 2, unit_price: "25.00" }],
    })], nameOf, addonName);
    expect(rows.map((r) => [r.key, r.item, r.qty, r.unitPrice, r.amount])).toEqual([
      ["o1:0", "Cody", 1, 1000, 1000],
      ["o1:1", "Disposal", 2, 25, 50],
    ]);
  });

  it("leaves rentals out, as the Sales Orders Register does", () => {
    expect(salesOrderLinesOf([order({ source_system: "rental", order_lines: [{ sku: "X", qty: 1 }] })], nameOf, addonName)).toEqual([]);
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

describe("salesInvoiceLinesOf — the issued Sales Invoice's own lines", () => {
  const inv = (i: Partial<InvoiceRegisterRow>) => ({
    id: "i1", invoice_no: "INV-1", status: "issued", kind: "sales", issued_at: "2026-10-05", voided_at: null,
    order_id: "o1", orders: { id: "o1", so: 101, customer_name: "Tan", order_lines: [{ sku: "CODY-Q", qty: 3, unit_price: 100 }] },
    ...i,
  }) as unknown as InvoiceRegisterRow;

  it("with no snapshot lines, falls back to the order's live lines and marks them", () => {
    expect(salesInvoiceLinesOf([inv({})], nameOf, addonName)).toEqual([
      { key: "i1:0", date: "2026-10-05", docNo: "INV-1", orderId: "o1", so: 101, customer: "Tan", item: "Cody", qty: 3, unitPrice: 100, amount: 300, linesFrom: "order" },
    ]);
    expect(salesInvoiceLinesOf([inv({ snapshot_lines: null })], nameOf, addonName)[0]!.linesFrom).toBe("order");
  });

  it("reads the invoice's frozen snapshot lines, not the order as it is today", () => {
    // The order changed after issue (qty 3 @ 100); the invoice froze 2 @ 90.
    const rows = salesInvoiceLinesOf([inv({ snapshot_lines: [{ sku: "CODY-Q", qty: 2, unit_price: 90 }] })], nameOf, addonName);
    expect(rows.map((r) => [r.item, r.qty, r.unitPrice, r.amount, r.linesFrom])).toEqual([["Cody", 2, 90, 180, "invoice"]]);
  });

  it("a whole-order snapshot froze goods only: its add-ons come live from the order, marked", () => {
    const rows = salesInvoiceLinesOf([inv({
      snapshot_lines: [{ sku: "CODY-Q", qty: 1, unit_price: 1000 }],
      orders: { id: "o1", so: 101, customer_name: "Tan", order_lines: [],
        order_addons: [{ addon_key: "disposal", qty: 1, unit_price: 50 }] } as unknown as InvoiceRegisterRow["orders"],
    })], nameOf, addonName);
    expect(rows.map((r) => [r.item, r.amount, r.linesFrom])).toEqual([["Cody", 1000, "invoice"], ["Disposal", 50, "order"]]);
  });

  it("an office part invoice (0712) bills only its own picked lines and add-ons", () => {
    const orders = { id: "o1", so: 101, customer_name: "Tan",
      order_lines: [{ sku: "CODY-Q", qty: 5, unit_price: 100 }],
      order_addons: [{ addon_key: "disposal", qty: 1, unit_price: 50 }] } as unknown as InvoiceRegisterRow["orders"];
    const rows = salesInvoiceLinesOf([
      inv({ id: "i1", snapshot_from: "office", snapshot_lines: [{ order_line_id: "l1", sku: "CODY-Q", qty: "2", unit_price: "100" }],
        snapshot_addons: [{ addon_key: "disposal", qty: 1, unit_price: 50 }], orders }),
      inv({ id: "i2", invoice_no: "INV-2", snapshot_from: "office", snapshot_lines: [{ order_line_id: "l1", sku: "CODY-Q", qty: 3, unit_price: 100 }],
        snapshot_addons: [], orders }),
    ], nameOf, addonName);
    expect(rows.map((r) => [r.docNo, r.item, r.qty, r.amount, r.linesFrom])).toEqual([
      ["INV-1", "Cody", 2, 200, "invoice"],
      ["INV-1", "Disposal", 1, 50, "invoice"],
      ["INV-2", "Cody", 3, 300, "invoice"],
    ]);
  });

  it("an office snapshot with no addons key still never borrows the order's add-ons", () => {
    const rows = salesInvoiceLinesOf([inv({ snapshot_from: "office", snapshot_lines: [{ sku: "CODY-Q", qty: 1, unit_price: 100 }],
      orders: { id: "o1", so: 101, customer_name: "Tan", order_lines: [],
        order_addons: [{ addon_key: "disposal", qty: 1, unit_price: 50 }] } as unknown as InvoiceRegisterRow["orders"] })], nameOf, addonName);
    expect(rows.map((r) => r.item)).toEqual(["Cody"]);
  });

  it("adds the order's add-ons, so the lines total the invoice amount", () => {
    const rows = salesInvoiceLinesOf([inv({ amount: 1050, orders: {
      id: "o1", so: 101, customer_name: "Tan", order_lines: [{ sku: "CODY-Q", qty: 1, unit_price: 1000 }],
      order_addons: [{ addon_key: "delivery", qty: 1, unit_price: 50 }],
    } as unknown as InvoiceRegisterRow["orders"] })], nameOf, addonName);
    expect(rows.map((r) => [r.item, r.amount, r.linesFrom])).toEqual([["Cody", 1000, "order"], ["delivery", 50, "order"]]);
    expect(rows.reduce((t, r) => t + (r.amount ?? 0), 0)).toBe(1050);
  });

  it("leaves drafts, voided invoices and storage invoices out", () => {
    expect(salesInvoiceLinesOf([
      inv({ status: "draft" }),
      inv({ status: "voided", voided_at: "2026-10-06" }),
      inv({ kind: "storage" }),
    ], nameOf, addonName)).toEqual([]);
  });
});

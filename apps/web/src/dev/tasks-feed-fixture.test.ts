import { describe, expect, it } from "vitest";
import { testTaskSalesOrderDocument, testTaskPo, testTaskPoDocument, testTaskSuppliers } from "./tasks-feed-fixture";

describe("known TEST Purchase Order document reads", () => {
  it.each(["PO-261001-9001", "PO-260925-9002", "PO-261006-9003", "PO-261008-9008"])("keeps %s identity, version, supplier and ordered quantities", (id) => {
    const po = testTaskPo(id).pos[0]!;
    const document = testTaskPoDocument(id)!;
    expect(document.po_id).toBe(po.id);
    expect(document.po_number).toBe(id);
    expect(document.version).toBe(po.version);
    expect(document.supplier.name).toBe(testTaskSuppliers().suppliers.find((item) => item.id === po.supplier_id)!.name);
    expect(document.lines.map(({ sku, qty }) => ({ sku, qty }))).toEqual(po.purchase_order_lines.map(({ sku, qty }) => ({ sku, qty })));
    expect(document.lines[0]!.qty).toBe(6); // Ordered quantity, not remaining 4.
    expect(document.so_refs).toEqual([9101, 9102]);
    expect(document.eta_date).toBe(po.eta_date);
    expect(document).not.toHaveProperty("total");
  });
  it.each(["PO-UNKNOWN", "SO-9101", "", "PO-261001-9001/print-data"])("does not invent facts for %s", (id) => {
    expect(testTaskPo(id).pos).toEqual([]);
    expect(testTaskPoDocument(id)).toBeNull();
  });
});

describe("linked TEST Sales Order documents", () => {
  it("accounts for all PO goods once across its two source orders", () => {
    const po = testTaskPo("PO-261001-9001").pos[0]!;
    const documents = po.sources.map((source) => testTaskSalesOrderDocument(source.order_id)!);
    expect(documents.map((doc) => doc.so_number)).toEqual(po.sources.map((source) => source.reference));
    expect(documents.map((doc) => doc.customer.name)).toEqual(["TEST Customer 9101", "TEST Customer 9102"]);
    for (const line of po.purchase_order_lines) {
      expect(documents.flatMap((doc) => doc.lines).filter((item) => item.sku === line.sku).reduce((sum, item) => sum + item.qty, 0)).toBe(line.qty);
    }
    for (const doc of documents) {
      expect(doc.total).toBe(doc.lines.reduce((sum, line) => sum + line.qty * line.unit_price, 0));
      expect(doc.balance_due).toBe(doc.total - doc.paid);
      expect(doc.order_id).not.toBe("11111111-1111-1111-1111-111111111111");
    }
  });
  it("does not substitute root or other unseeded orders", () => {
    expect(testTaskSalesOrderDocument("11111111-1111-1111-1111-111111111111")).toBeNull();
    expect(testTaskSalesOrderDocument("00000000-0000-4000-8000-000000009103")).toBeNull();
  });
});

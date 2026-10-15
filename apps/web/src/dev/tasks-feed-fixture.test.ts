import { describe, expect, it } from "vitest";
import { testTaskPo, testTaskPoDocument, testTaskSuppliers } from "./tasks-feed-fixture";

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

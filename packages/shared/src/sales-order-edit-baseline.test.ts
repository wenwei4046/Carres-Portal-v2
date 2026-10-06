import { describe, expect, it } from "vitest";
import {
  SALES_ORDER_EDIT_HEADER_KEYS,
  salesOrderChangedSinceOpened,
  salesOrderEditBaseline,
  sameSalesOrderEditBaseline,
} from "./sales-order-change";

/* Concurrent editing (orders/MASTER §0.0, owner-approved 2026-10-01): the
   baseline the editor opened is what the commit carries. These pin its shape,
   because the database builds the same object and a shape drift would refuse
   every save as "changed". */
const ORDER = {
  id: "o1",
  status: "proceed_order",
  customer_name: "Customer",
  customer_phone: "0100000000",
  customer_birthday: "1990-01-02",
  entry_data: { fields: { building_type: "Landed" }, wizard: { step: 3 } },
  delivery_floor: 2,
  delivery_has_lift: false,
  installment_months: 12,
  so: 1234, // not an edit fact
};
/* PostgREST answers numeric as a number; the mocks in this repo answer it as a
   string. Both must give the same baseline. */
const LINES = [
  { id: "b-line", sku: "PILLOW", qty: 2, unit_price: "220.00", attrs: null, source_po: "PO-1", label: "Pillow" },
  { id: "a-line", sku: "TRION-Q", qty: 1, unit_price: 2749, attrs: { gap: "KIV" } },
];
const ADDONS = [{ id: "z1", addon_key: "DELIVERY", qty: 1, unit_price: "250", attrs: [] }];

describe("salesOrderEditBaseline — the order exactly as the editor opened it", () => {
  const b = salesOrderEditBaseline(ORDER, LINES, ADDONS);

  it("carries every edit header key, absent ones as null, and nothing else", () => {
    expect(Object.keys(b.header).sort()).toEqual([...SALES_ORDER_EDIT_HEADER_KEYS].sort());
    expect(b.header.customer_email).toBeNull();
    expect(b.header.entry_fields).toEqual({ building_type: "Landed" });
    expect(b.header).not.toHaveProperty("so");
  });

  it("orders lines and services by id in byte order and keeps only the five facts", () => {
    expect(b.lines.map((l) => l.id)).toEqual(["a-line", "b-line"]);
    expect(b.lines[1]).toEqual({ id: "b-line", sku: "PILLOW", qty: 2, unit_price: 220, attrs: null });
    expect(b.addons[0]).toEqual({ id: "z1", addon_key: "DELIVERY", qty: 1, unit_price: 250, attrs: null });
    expect(b.status).toBe("proceed_order");
    expect(b.installment_months).toBe(12);
  });

  it("a non-object entry_data or fields reads as no fields, as the database reads it", () => {
    expect(salesOrderEditBaseline({ ...ORDER, entry_data: null }, [], []).header.entry_fields).toEqual({});
    expect(salesOrderEditBaseline({ ...ORDER, entry_data: { fields: null } }, [], []).header.entry_fields).toEqual({});
  });

  it("survives the trip to the browser and back unchanged", () => {
    expect(sameSalesOrderEditBaseline(JSON.parse(JSON.stringify(b)), b)).toBe(true);
  });
});

describe("salesOrderChangedSinceOpened — what a colleague changed", () => {
  const opened = salesOrderEditBaseline(ORDER, LINES, ADDONS);

  it("nothing moved → nothing listed", () => {
    expect(salesOrderChangedSinceOpened(opened, salesOrderEditBaseline(ORDER, LINES, ADDONS))).toEqual([]);
  });

  it("names the header facts, the goods, the plan and the status that moved", () => {
    const now = salesOrderEditBaseline(
      { ...ORDER, customer_phone: "0199999999", status: "delivered", installment_months: null },
      [{ ...LINES[1]!, qty: 2 }, LINES[0]!],
      ADDONS,
    );
    expect(salesOrderChangedSinceOpened(opened, now)).toEqual(["customer_phone", "lines", "installment_months", "status"]);
  });

  it("key order inside a configuration is not a change", () => {
    const a = salesOrderEditBaseline(ORDER, [{ ...LINES[1]!, attrs: { gap: "KIV", color: "Grey" } }], []);
    const c = salesOrderEditBaseline(ORDER, [{ ...LINES[1]!, attrs: { color: "Grey", gap: "KIV" } }], []);
    expect(sameSalesOrderEditBaseline(a, c)).toBe(true);
    expect(salesOrderChangedSinceOpened(a, c)).toEqual([]);
  });
});

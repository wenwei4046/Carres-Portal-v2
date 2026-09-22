import { describe, expect, it } from "vitest";
import { classifySalesOrderChange, salesOrderCommitWord, type SalesOrderChangeSide } from "./sales-order-change";

const base: SalesOrderChangeSide = {
  header: {
    customer_name: "Customer",
    customer_phone: "0100000000",
    proceed_date: "2026-09-17",
    delivery_date: "2026-10-26",
    delivery_date_tbd: false,
    delivery_floor: 1,
    delivery_has_lift: false,
    delivery_stair_items: null,
  },
  lines: [
    { id: "l1", sku: "TRION-Q", qty: 1, unit_price: 2749, attrs: { gap: "KIV" } },
    { id: "l2", sku: "MEMORY-FOAM-PILLOW-asd", qty: 2, unit_price: 220, attrs: null },
  ],
  addons: [{ id: "a1", addon_key: "DELIVERY", qty: 1, unit_price: 250, attrs: { kind: "base" } }],
  installment_months: null,
};
const open = { proceeded: false, proceedRecorded: true };
const clone = (): SalesOrderChangeSide => JSON.parse(JSON.stringify(base));

describe("classifySalesOrderChange — the system chooses the commit", () => {
  it("nothing changed → none", () => {
    expect(classifySalesOrderChange(base, clone(), open).action).toBe("none");
  });
  it("a phone correction is a Save", () => {
    const d = clone();
    d.header.customer_phone = "0199999999";
    const r = classifySalesOrderChange(base, d, open);
    expect(r.action).toBe("save");
    expect(r.header).toEqual(["customer_phone"]);
    expect(salesOrderCommitWord(r.action)).toBe("Save");
  });
  it("a blank vs empty string is not a change", () => {
    const d = clone();
    d.header.delivery_stair_items = undefined;
    expect(classifySalesOrderChange(base, d, open).action).toBe("none");
  });
  it("a quantity change is an amendment request, PO or not", () => {
    const d = clone();
    d.lines[1]!.qty = 1;
    const r = classifySalesOrderChange(base, d, open);
    expect(r.action).toBe("submit");
    expect(r.linesChanged).toBe(true);
    expect(salesOrderCommitWord(r.action)).toBe("Submit amendment request");
  });
  it("a configuration change (attrs) is an amendment request", () => {
    const d = clone();
    d.lines[0]!.attrs = { gap: '6"' };
    expect(classifySalesOrderChange(base, d, open).action).toBe("submit");
  });
  it("removing a line or a service is an amendment request", () => {
    const d = clone();
    d.lines = d.lines.slice(0, 1);
    expect(classifySalesOrderChange(base, d, open).action).toBe("submit");
    const e = clone();
    e.addons = [];
    expect(classifySalesOrderChange(base, e, open).addonsChanged).toBe(true);
  });
  it("the delivery promise is always commercial", () => {
    const d = clone();
    d.header.delivery_date = "2026-11-02";
    const r = classifySalesOrderChange(base, d, open);
    expect(r.action).toBe("submit");
    expect(r.commercialHeader).toEqual(["delivery_date"]);
  });
  it("a recorded proceed date moves only by amendment; a blank one is filled as a correction", () => {
    const d = clone();
    d.header.proceed_date = "2026-09-20";
    expect(classifySalesOrderChange(base, d, open).action).toBe("submit");
    const blank = clone();
    blank.header.proceed_date = null;
    const fill = clone();
    fill.header.proceed_date = "2026-09-20";
    expect(classifySalesOrderChange(blank, fill, { proceeded: false, proceedRecorded: false }).action).toBe("save");
  });
  it("delivery access is a correction before Proceed and an amendment after it", () => {
    const d = clone();
    d.header.delivery_floor = 3;
    expect(classifySalesOrderChange(base, d, open).action).toBe("save");
    expect(classifySalesOrderChange(base, d, { proceeded: true, proceedRecorded: true }).action).toBe("submit");
  });
  it("a mixed change goes to review whole", () => {
    const d = clone();
    d.header.customer_phone = "0199999999";
    d.installment_months = 12;
    const r = classifySalesOrderChange(base, d, open);
    expect(r.action).toBe("submit");
    expect(r.header).toEqual(["customer_phone"]);
    expect(r.installmentChanged).toBe(true);
  });
});

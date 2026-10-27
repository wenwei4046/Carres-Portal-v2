import { describe, expect, it } from "vitest";
import { officeInvoicePicks, officeInvoicePrefill, officeInvoiceTotalSen, type OfficeInvoiceLine } from "./office-sales-invoice";

// Weisiang's decision (Mr Lim, WhatsApp 2026-10-22): office New Sales Invoice, part invoices allowed.
const line = (id: string, sku: string, qty: number, price: number, invoiced = 0): OfficeInvoiceLine =>
  ({ order_line_id: id, sku, qty, unit_price: price, invoiced, left: qty - invoiced });
const LINES = [
  line("bed", "MS12 Firmcare 10inch Queen", 2, 1000.1, 1),
  line("sofa", "SF03 Muro 2 Seater", 1, 500),
  line("pillow", "Memory Pillow", 2, 30),
  line("done", "BF07 Hilton Divan King", 1, 800, 1),
];

describe("office New Sales Invoice", () => {
  it("found by a Sales Order, ticks every line with something left, at what is left", () => {
    expect(officeInvoicePrefill(LINES)).toEqual({
      bed: { picked: true, qty: 1 }, sofa: { picked: true, qty: 1 },
      pillow: { picked: true, qty: 2 }, done: { picked: false, qty: 0 },
    });
  });

  it("found by a Delivery Order, ticks only the goods that DO carries; a whole-order DO carries all", () => {
    const bedTrip = officeInvoicePrefill(LINES, ["bed"]);
    expect([bedTrip.bed!.picked, bedTrip.sofa!.picked, bedTrip.pillow!.picked]).toEqual([true, false, false]);
    expect(officeInvoicePrefill(LINES, null).sofa!.picked).toBe(true);
  });

  it("adds up to the sen, add-ons only on the order's first office invoice", () => {
    const picks = officeInvoicePrefill(LINES, ["bed"]);
    const addons = [{ addon_key: "DELIVERY", qty: 1, unit_price: 100 }];
    expect(officeInvoiceTotalSen(LINES, picks, addons, true)).toBe(110010);
    expect(officeInvoiceTotalSen(LINES, picks, addons, false)).toBe(100010);
  });

  it("sends only ticked lines, and refuses a quantity above what is left or below 1", () => {
    const picks = officeInvoicePrefill(LINES, ["bed"]);
    expect(officeInvoicePicks(LINES, picks)).toEqual([{ orderLineId: "bed", qty: 1 }]);
    expect(officeInvoicePicks(LINES, { ...picks, bed: { picked: true, qty: 2 } })).toBeNull();
    expect(officeInvoicePicks(LINES, { ...picks, bed: { picked: true, qty: 0 } })).toBeNull();
    expect(officeInvoicePicks(LINES, { bed: { picked: false, qty: 1 } })).toBeNull();
  });
});

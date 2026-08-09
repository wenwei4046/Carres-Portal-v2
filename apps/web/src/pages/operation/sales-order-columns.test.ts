import { describe, it, expect } from "vitest";
import type { operationOrderListRow } from "@/lib/queries";
import {
  buildRegisterRow,
  DEFAULT_COLUMNS,
  fieldByKey,
  FIELD_GROUPS,
  passesColumnFilters,
  REGISTER_FIELDS,
  toCsv,
} from "./sales-order-columns";

/**
 * THE FIELD CATALOG — SO-3.
 *
 * The card's boundary is what these tests hold: *"the chooser exposes ALL real
 * order-owned flat fields"* and *"DO NOT build … any cross-module computed
 * column"*. Both are properties of this list, so both are testable without a
 * DOM — which is the only way they stay true after the next card.
 */

function row(over: Partial<operationOrderListRow> = {}): operationOrderListRow {
  return {
    id: "o-1",
    so: 1257,
    status: "proceed_order",
    operation_stage: "confirmed",
    warehouse_id: null,
    customer_name: "MyHouse Management PLT",
    customer_phone: "012-345 6789",
    placed_at: "2026-07-10T02:00:00Z",
    delivery_date: "2026-07-22",
    delivery_date_tbd: false,
    order_lines: [{ sku: "M1401F-K", qty: 2, unit_price: 1500, label: "M1401F · King" }],
    paid: 1500,
    delivery_partner_id: null,
    request_for_delivery_at: null,
    partner_accepted_at: null,
    partner_rejected_at: null,
    partner_rejected_reason: null,
    delivery_partners: null,
    do_number: null,
    dispatched_at: null,
    delivered_at: null,
    outlet_id: null,
    dealer_id: "d-1",
    dealers: null,
    order_supplier_threads: [],
    order_annotations: [],
    ...over,
  } as operationOrderListRow;
}

describe("the catalog is the chooser", () => {
  it("offers ~28 hidden facts on top of the card's six defaults", () => {
    expect(DEFAULT_COLUMNS).toEqual([
      "so",
      "customer",
      "items",
      "value",
      "promised",
      "ordered",
    ]);
    expect(REGISTER_FIELDS.length - DEFAULT_COLUMNS.length).toBe(28);
  });

  it("names the flat facts the card lists by name", () => {
    for (const key of [
      "phone", "email", "salesperson", "outlet", "channel", "source_ref",
      "address", "address_line1", "city", "state", "postcode",
      "floor", "lift", "do_number", "invoice_no", "invoiced", "delivered", "paid",
    ]) {
      expect(fieldByKey(key), key).toBeDefined();
    }
  });

  it("carries NO cross-module or computed column — the card's own red line", () => {
    /* Stock, delivery bookings, the action ladder and the queue all live in
       another module (`ERP-ARCHITECTURE.md` Law A/B). A chooser is the easiest
       door back in, so the door is nailed shut here rather than in a comment. */
    for (const banned of [
      "stock", "ready_stock", "on_po", "eta", "next_action", "action", "pic",
      "status", "operation_stage", "booking", "journey", "health", "queue",
    ]) {
      expect(fieldByKey(banned), banned).toBeUndefined();
    }
  });

  it("puts every field in one of the five groups", () => {
    for (const f of REGISTER_FIELDS) expect(FIELD_GROUPS).toContain(f.group);
  });

  it("gives every field a width in px — a column is never a share of the window", () => {
    for (const f of REGISTER_FIELDS) expect(f.width, f.key).toMatch(/^\d+px$/);
  });
});

describe("one string: printed, filtered, sorted, exported", () => {
  it("prints the dictionary's absence words, never a dash", () => {
    const r = buildRegisterRow(row({ customer_phone: null, salespersons: null }));
    expect(fieldByKey("phone")!.text(r)).toBe("Not given");
    expect(fieldByKey("salesperson")!.text(r)).toBe("Not recorded");
    for (const f of REGISTER_FIELDS) expect(f.text(r), f.key).not.toBe("—");
  });

  it("says `No date yet` for a promise with no day on it", () => {
    const r = buildRegisterRow(row({ delivery_date_tbd: true }));
    expect(fieldByKey("promised")!.text(r)).toBe("No date yet");
  });

  it("stacks the phone into the Customer column's own string, so search finds it", () => {
    const r = buildRegisterRow(row());
    expect(fieldByKey("customer")!.text(r)).toContain("MyHouse Management PLT");
    expect(fieldByKey("customer")!.text(r)).toContain("012-345 6789");
  });

  it("filters case-insensitively on the printed string", () => {
    const r = buildRegisterRow(row());
    expect(passesColumnFilters(r, new Map([["customer", "MYHOUSE"]]))).toBe(true);
    expect(passesColumnFilters(r, new Map([["customer", "tan ah kow"]]))).toBe(false);
    /* Every filter must pass — they narrow, they never widen. */
    expect(
      passesColumnFilters(r, new Map([["customer", "myhouse"], ["items", "sofa"]])),
    ).toBe(false);
    /* An empty box is not a filter. */
    expect(passesColumnFilters(r, new Map([["customer", "  "]]))).toBe(true);
  });

  it("exports the columns on screen, quoted, header first", () => {
    const csv = toCsv(["so", "customer"], [buildRegisterRow(row())]);
    expect(csv.split("\r\n")[0]).toBe('"SO No","Customer"');
    expect(csv.split("\r\n")[1]).toBe('"SO-1257","MyHouse Management PLT · 012-345 6789"');
  });

  it("escapes a quote rather than breaking the file", () => {
    const csv = toCsv(["customer"], [buildRegisterRow(row({ customer_name: 'The "Big" Shop' }))]);
    expect(csv).toContain('"The ""Big"" Shop');
  });
});

describe("the money states reach the columns", () => {
  it("prints the three sentences and never an empty string", () => {
    const priced = buildRegisterRow(row());
    expect(fieldByKey("outstanding")!.text(priced)).toBe("1500");
    expect(fieldByKey("value")!.text(priced)).toBe("3000");

    const settled = buildRegisterRow(row({ paid: 3000 }));
    expect(fieldByKey("outstanding")!.text(settled)).toBe("Paid in full");

    const unpriced = buildRegisterRow(
      row({ order_lines: [{ sku: "X", qty: 1, unit_price: null }], paid: null }),
    );
    expect(fieldByKey("value")!.text(unpriced)).toBe("No price yet");
    expect(fieldByKey("outstanding")!.text(unpriced)).toBe("No price yet");
  });
});

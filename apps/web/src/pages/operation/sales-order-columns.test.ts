import { describe, it, expect } from "vitest";
import type { operationOrderListRow } from "@/lib/queries";
import {
  buildRegisterRow,
  DEFAULT_COLUMNS,
  REGISTER_FIELDS,
  type RegisterField,
} from "./sales-order-columns";

/**
 * THE FIELD CATALOG — SO-3, trimmed by RG-2.
 *
 * The card's boundary is what these tests hold: *"the chooser exposes ALL real
 * order-owned flat fields"* and *"DO NOT build … any cross-module computed
 * column"*. Both are properties of this list, so both are testable without a
 * DOM — which is the only way they stay true after the next card.
 *
 * The ▼ filter model, the URL params and the CSV writer that used to live in
 * this module (and this suite) are GONE — the Register Engine owns filtering
 * and Export Excel now (`components/register/DataGrid`), and its behaviour is
 * held by `SalesOrdersRegister.test.tsx` through the rendered page.
 */

const fieldByKey = (key: string): RegisterField | undefined =>
  REGISTER_FIELDS.find((f) => f.key === key);

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
  it("offers every hidden fact on top of the five defaults — Value is chooser-only", () => {
    expect(DEFAULT_COLUMNS).toEqual(["so", "customer", "items", "promised", "ordered"]);
    expect(REGISTER_FIELDS.length - DEFAULT_COLUMNS.length).toBe(29);
    /* SO-5 moved `Value` off the register; it stays a real chooser column. */
    expect(fieldByKey("value")).toBeDefined();
    expect(fieldByKey("value")!.on).toBeUndefined();
  });

  it("names the promise by WHAT was promised — SO-5's dictionary", () => {
    expect(fieldByKey("promised")!.label).toBe("Promised Delivery");
    expect(fieldByKey("ordered")!.label).toBe("Ordered");
    expect(fieldByKey("delivered")!.label).toBe("Delivered");
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

  it("puts every field in one of the four groups — Order · Customer · Money · Dates", () => {
    for (const f of REGISTER_FIELDS) {
      expect(["Order", "Customer", "Money", "Dates"]).toContain(f.group);
    }
    /* Every date stamp lives under Dates, whatever act produced it. */
    for (const key of ["ordered", "promised", "proceed_date", "dispatched", "delivered", "invoiced"]) {
      expect(fieldByKey(key)!.group, key).toBe("Dates");
    }
  });

  it("gives every field a width in px — a column is never a share of the window", () => {
    for (const f of REGISTER_FIELDS) expect(f.width, f.key).toMatch(/^\d+px$/);
  });

  it("gives every date column its raw ISO and every number column its raw figure", () => {
    /* The engine's date ▼ reads `dateValue`, its number ▼ reads `numberValue`
       — a `kind` without the raw accessor would filter on the printed string,
       which is exactly the bug the raw accessors exist to prevent. */
    for (const f of REGISTER_FIELDS) {
      if (f.kind === "date") expect(f.iso, f.key).toBeDefined();
      if (f.kind === "number") expect(f.num, f.key).toBeDefined();
    }
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

  it("the Customer STRING is the name alone — RG-2 rides the phone as page markup", () => {
    /* The ▼ filter, the sort and the grouped value all read this string, so
       it stays the NAME; the page's cell renders `name · phone` on top of it
       and exports the pair explicitly. */
    const r = buildRegisterRow(row());
    expect(fieldByKey("customer")!.text(r)).toBe("MyHouse Management PLT");
    expect(fieldByKey("phone")!.text(r)).toBe("012-345 6789");
    expect(r.phoneDigits).toBe("0123456789");
  });

  it("the Paid cell prints the figure, RM 0 included — never `Paid in full` (SO-4 fix)", () => {
    const untouched = buildRegisterRow(row({ paid: 0 }));
    expect(untouched.paid).toEqual({ kind: "amount", value: 0 });
    expect(fieldByKey("paid")!.text(untouched)).toBe("0");
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

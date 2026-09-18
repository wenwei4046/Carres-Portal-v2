import { describe, expect, it } from "vitest";
import {
  ageBucket,
  arAging,
  customerOwingRows,
  inAgeScope,
  invoiceAgeDays,
  malaysiaDay,
  outstandingTotal,
  rowsInAgeScope,
  type CustomerOwingRow,
} from "./money-owed";
import type { InvoiceRegisterRow } from "@carres/shared/payment-invoice-register";

/* The buckets finance_ar_aging used (0062/0125), aged from the day the sales
   invoice was issued (owner ruling 18 Sep 2026): today − issue day, buckets 0-30 · 31-60 · 61-90 · 90+ with each upper edge inclusive, Overdue
   = older than 30 days. Here both days are Malaysia days. */

const TODAY = "2026-10-14";
// Midnight in Malaysia is 16:00 UTC the day before.
const mytMidnight = (day: string) => {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return `${d.toISOString().slice(0, 10)}T16:00:00Z`;
};
const justBefore = (day: string) => mytMidnight(day).replace("16:00:00Z", "15:59:59Z");

const row = (issuedAt: string | null, outstanding: number) => ({ issuedAt, outstanding }) as unknown as CustomerOwingRow;

/** One register row: an order owing 1000 on a sales invoice issued on `issuedAt`, or still a draft. */
const invoice = (orderId: string, issuedAt: string | null): InvoiceRegisterRow => ({
  id: `i-${orderId}`, invoice_no: issuedAt ? `INV-${orderId}` : null, status: issuedAt ? "issued" : "draft",
  kind: "sales", amount: 1000, tax_amount: 0, issued_at: issuedAt, voided_at: null, void_reason: null,
  replaces_invoice_id: null, created_at: "2026-06-01T02:00:00Z", order_id: orderId,
  orders: {
    id: orderId, so: 5100, customer_name: "Aria Tenggara", status: "proceed_order", paid: 0,
    delivery_date: null, delivery_date_tbd: false, delivered_at: null,
    // Placed long ago: the age must not come from here.
    placed_at: "2026-06-01T02:00:00Z",
    order_lines: [{ qty: 1, unit_price: 1000 }], order_addons: [],
    ops_order_control: [{ balance: null, confirmed_date: null, line_etas: null, line_stock_status: null }],
  },
});

describe("A/R aging", () => {
  it("reads a timestamp as its Malaysia day", () => {
    expect(malaysiaDay("2026-09-13T16:00:00Z")).toBe("2026-09-14");
    expect(malaysiaDay("2026-09-13T15:59:59Z")).toBe("2026-09-13");
    expect(malaysiaDay("2026-09-13")).toBe("2026-09-13");
    expect(malaysiaDay(null)).toBeNull();
    expect(malaysiaDay("not a date")).toBeNull();
  });

  it.each([
    ["2026-09-14", 30, "0-30"],
    ["2026-09-13", 31, "31-60"],
    ["2026-08-15", 60, "31-60"],
    ["2026-08-14", 61, "61-90"],
    ["2026-07-16", 90, "61-90"],
    ["2026-07-15", 91, "90+"],
  ] as const)("invoice issued %s (Malaysia) is %i days old → %s", (day, days, bucket) => {
    // Issued at the first second of that Malaysia day …
    expect(invoiceAgeDays(mytMidnight(day), TODAY)).toBe(days);
    // … and one second earlier is the day before: one day older.
    expect(invoiceAgeDays(justBefore(day), TODAY)).toBe(days + 1);
    // A bare issue date reads as that day.
    expect(invoiceAgeDays(day, TODAY)).toBe(days);
    expect(ageBucket(days)).toBe(bucket);
  });

  it("Overdue is older than 30 days: 30 is not overdue, 31 is", () => {
    expect(inAgeScope(30, "over-30")).toBe(false);
    expect(inAgeScope(31, "over-30")).toBe(true);
    expect(inAgeScope(91, "over-30")).toBe(true);
  });

  it("an invoice issued today, or dated after today, is 0 days old", () => {
    expect(invoiceAgeDays(mytMidnight(TODAY), TODAY)).toBe(0);
    expect(invoiceAgeDays("2026-10-20T02:00:00Z", TODAY)).toBe(0);
  });

  it("an invoice issued early morning in Kuala Lumpur is aged from that Malaysia day", () => {
    // 06:30 on 14 Sep in KL is 22:30 on 13 Sep in UTC: 30 days (0-30), not 31.
    const issued = "2026-09-13T22:30:00Z";
    expect(invoiceAgeDays(issued, TODAY)).toBe(30);
    expect(rowsInAgeScope([row(issued, 100)], "over-30", TODAY)).toEqual([]);
  });

  it("an order invoiced 31 days ago is 31-60 and Overdue, however long ago it was placed", () => {
    const owing = customerOwingRows([invoice("o1", "2026-09-13")]);
    expect(invoiceAgeDays(owing[0].issuedAt, TODAY)).toBe(31);
    const aging = arAging(owing, TODAY)!;
    expect(aging.buckets["31-60"]).toEqual({ orders: 1, total: 1000 });
    expect(aging.buckets["90+"]).toEqual({ orders: 0, total: 0 });
    expect(aging.overdue).toEqual({ orders: 1, total: 1000 });
  });

  it("an order whose invoice is a draft still owes, but has no age: no bucket, never Overdue", () => {
    const owing = customerOwingRows([invoice("o1", "2026-09-13"), invoice("o2", null)]);
    expect(outstandingTotal(owing)).toEqual({ orders: 2, total: 2000 });
    const draft = owing.find((r) => r.orderId === "o2")!;
    expect(draft.issuedAt).toBeNull();
    expect(invoiceAgeDays(draft.issuedAt, TODAY)).toBeNull();
    const aging = arAging(owing, TODAY)!;
    const inBuckets = Object.values(aging.buckets).reduce((s, b) => s + b.orders, 0);
    expect(inBuckets).toBe(1);
    expect(aging.overdue).toEqual({ orders: 1, total: 1000 });
    for (const scope of ["0-30", "31-60", "61-90", "90+", "over-30"] as const) {
      expect(rowsInAgeScope(owing, scope, TODAY).map((r) => r.orderId)).not.toContain("o2");
    }
  });

  it("the buckets add up to Outstanding, and Overdue is the three older buckets", () => {
    const rows = [
      row(mytMidnight("2026-09-14"), 100), // 30 days
      row(justBefore("2026-09-14"), 200), // 31 days
      row(mytMidnight("2026-08-14"), 300), // 61 days
      row(mytMidnight("2026-07-15"), 400.5), // 91 days
    ];
    const aging = arAging(rows, TODAY)!;
    expect(aging.buckets).toEqual({
      "0-30": { orders: 1, total: 100 },
      "31-60": { orders: 1, total: 200 },
      "61-90": { orders: 1, total: 300 },
      "90+": { orders: 1, total: 400.5 },
    });
    expect(aging.overdue).toEqual({ orders: 3, total: 900.5 });
    const sum = Object.values(aging.buckets).reduce((s, b) => s + b.total, 0);
    expect(sum).toBe(outstandingTotal(rows).total);
    expect(rowsInAgeScope(rows, "over-30", TODAY)).toHaveLength(3);
  });

  it("an issued invoice whose date cannot be read makes the aging unreadable, never 0-30", () => {
    expect(invoiceAgeDays(null, TODAY)).toBeNull();
    expect(arAging([row(mytMidnight("2026-10-01"), 50), row("not a date", 70)], TODAY)).toBeNull();
    expect(rowsInAgeScope([row("not a date", 70)], "0-30", TODAY)).toEqual([]);
  });
});

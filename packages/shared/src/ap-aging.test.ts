import { describe, expect, it } from "vitest";
import { agingColumn, apAgingQuery, apAgingReport, type ApAgingAnswer } from "./ap-aging";

const ANSWER: ApAgingAnswer = {
  as_at: "2026-09-30",
  go_live_on: "2026-06-01",
  controls: [{ account_code: "2110", name: "Trade payables", balance: "7500.00" }],
  suppliers: [
    {
      supplier_id: "s-1", name: "Lumen Sofa Works", kind: "factory_pickup", balance: "6000.00",
      bills: [
        { bill_id: "b-1", bill_no: "BILL-2609-0001", supplier_invoice_no: "LS-77", bill_date: "2026-09-02", due_date: "2026-10-02", total: "4000.00", open: "4000.00" },
        { bill_id: "b-2", bill_no: "BILL-2607-0004", supplier_invoice_no: "LS-31", bill_date: "2026-07-15", due_date: null, total: "3000.00", open: "2500.00" },
      ],
    },
    // Paid an advance the bill has not arrived for: money against no bill.
    { supplier_id: "s-2", name: "Bayview Properties", kind: "other_creditor", balance: "-500.00", bills: [] },
    // An opening balance with no bill behind it.
    { supplier_id: "s-3", name: "Old Supplier", kind: "factory_pickup", balance: "2000.00", bills: [] },
  ],
};

describe("aging columns (0640)", () => {
  it("by month: whole calendar months between the date's month and the day's", () => {
    expect(agingColumn("2026-09-01", "2026-09-30", "month")).toBe(0);
    expect(agingColumn("2026-08-31", "2026-09-30", "month")).toBe(1);
    expect(agingColumn("2026-08-01", "2026-09-30", "month")).toBe(1);
    expect(agingColumn("2026-06-15", "2026-09-30", "month")).toBe(3);
    expect(agingColumn("2025-12-31", "2026-09-30", "month")).toBe(4);
    expect(agingColumn("2026-10-15", "2026-09-30", "month")).toBe(0);
  });

  it("by days: 0 to 30, 31 to 60, 61 to 90, 91 to 120, over 120", () => {
    expect(agingColumn("2026-08-31", "2026-09-30", "day")).toBe(0);
    expect(agingColumn("2026-08-30", "2026-09-30", "day")).toBe(1);
    expect(agingColumn("2026-07-02", "2026-09-30", "day")).toBe(2); // 90 days
    expect(agingColumn("2026-07-01", "2026-09-30", "day")).toBe(3); // 91 days
    expect(agingColumn("2026-06-02", "2026-09-30", "day")).toBe(3);
    expect(agingColumn("2026-06-01", "2026-09-30", "day")).toBe(4);
    expect(agingColumn("2026-10-30", "2026-09-30", "day")).toBe(0);
  });
});

describe("AP aging (0640, Chew 2026-10-03)", () => {
  it("files each open bill in its column; the rest of the balance is not tied to a bill", () => {
    const r = apAgingReport(ANSWER, "bill", "month");
    const lumen = r.rows[0]!;
    expect(lumen.cells).toEqual([4000, 0, 2500, 0, 0]);
    expect(lumen.notTied).toBe(-500); // 6,000 owed in the books, 6,500 open on bills
    expect(r.rows[1]!.notTied).toBe(-500);
    expect(r.rows[2]!.notTied).toBe(2000);
  });

  it("ages by the due date when asked, and by the bill date when there is none", () => {
    const r = apAgingReport(ANSWER, "due", "month");
    expect(r.rows[0]!.bills.map((b) => b.column)).toEqual([0, 2]); // due 2 Oct is after the day: first column
  });

  it("totals the rows and ties them to the control accounts", () => {
    const r = apAgingReport(ANSWER, "bill", "month");
    expect(r.totals).toEqual({ balance: 7500, cells: [4000, 0, 2500, 0, 0], notTied: 1000 });
    expect(r.controlsTotal).toBe(7500);
    expect(r.difference).toBe(0);
  });

  it("says when the suppliers do not add up to the books", () => {
    const r = apAgingReport({ ...ANSWER, controls: [{ account_code: "2110", name: "Trade payables", balance: "7600.00" }] }, "bill", "month");
    expect(r.difference).toBe(-100);
  });

  it("refuses a figure it cannot read", () => {
    const broken = structuredClone(ANSWER);
    broken.suppliers[0]!.bills[0]!.open = "four thousand";
    expect(() => apAgingReport(broken, "bill", "month")).toThrow();
  });

  it("asks for a day, or none for today", () => {
    expect(apAgingQuery.safeParse({}).success).toBe(true);
    expect(apAgingQuery.safeParse({ asAt: "2026-09-30" }).success).toBe(true);
    expect(apAgingQuery.safeParse({ asAt: "30/09/2026" }).success).toBe(false);
    expect(apAgingQuery.safeParse({ asAt: "2026-09-30", supplier: "x" }).success).toBe(false);
  });
});

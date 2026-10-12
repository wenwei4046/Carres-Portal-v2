import { describe, expect, it } from "vitest";
import { arAgingQuery, arAgingReport, type ArAgingAnswer, type ArAgingInvoice } from "./ar-aging";

const inv = (over: Partial<ArAgingInvoice>): ArAgingInvoice => ({
  invoice_id: "i-1", invoice_no: "INV-1", kind: "sales", order_id: "o-1", so: 1001,
  invoice_date: "2026-09-20", due_date: null, total: "1000.00", open: "1000.00",
  department_type: "SHOWROOM", department_id: "out-1", ...over,
});

const ANSWER: ArAgingAnswer = {
  as_at: "2026-10-12",
  go_live_on: "2026-09-10",
  controls: [
    { account_code: "300-1000", name: "SHOWROOM DEBTORS", balance: "1314.00" },
    { account_code: "300-2001", name: "TEST DEALER", balance: "-200.00" },
    { account_code: "305-0000", name: "OTHER DEBTOR", balance: "300.00" },
  ],
  debtors: [
    // An invoice of 2,629 on an order with a deposit of 1,315: the deposit fills it first.
    { party_type: "CUSTOMER", party_id: "c-1", name: "Test Customer A", kind: "customer", balance: "1314.00",
      invoices: [inv({ invoice_no: "INV-121026-1", invoice_date: "2026-10-12", total: "2629.00", open: "1314.00" })] },
    // A deposit on an order not invoiced yet: money paid ahead, no invoice.
    { party_type: "CUSTOMER", party_id: "c-2", name: "Test Customer B", kind: "customer", balance: "-200.00", invoices: [] },
    // An other debtor: an invoice of 500 with 200 received, due on the 5th.
    { party_type: "OTHER", party_id: "p-1", name: "Test Company", kind: "company", balance: "300.00",
      invoices: [inv({ invoice_id: "i-9", invoice_no: "ARI-1", kind: "other", order_id: null, so: null,
        invoice_date: "2026-08-25", due_date: "2026-10-05", total: "500.00", open: "300.00",
        department_type: null, department_id: null })] },
  ],
  before_go_live: { count: 1, amount: "2499.00" },
};

describe("AR aging (0686)", () => {
  it("adds each debtor's open invoices into the age columns and keeps the rest of the balance apart", () => {
    const r = arAgingReport(ANSWER, "invoice", "month");
    const a = r.rows[0]!;
    expect(a.key).toBe("CUSTOMER:c-1");
    expect(a.cells).toEqual([1314, 0, 0, 0, 0]);
    expect(a.notTied).toBe(0);
    const b = r.rows[1]!;
    expect(b.cells).toEqual([0, 0, 0, 0, 0]);
    expect(b.notTied).toBe(-200);
    const p = r.rows[2]!;
    expect(p.key).toBe("OTHER:p-1");
    expect(p.cells).toEqual([0, 0, 300, 0, 0]); // dated in August, two months back
    expect(p.notTied).toBe(0);
  });

  it("ages by the due date when asked, and by the invoice date when there is none", () => {
    const r = arAgingReport(ANSWER, "due", "month");
    expect(r.rows[2]!.cells).toEqual([300, 0, 0, 0, 0]); // due on 5 October
    expect(r.rows[0]!.cells).toEqual([1314, 0, 0, 0, 0]); // a customer invoice has no due date
  });

  it("ties the rows to the debtor accounts in the books", () => {
    const r = arAgingReport(ANSWER, "invoice", "day");
    expect(r.totals.balance).toBe(1414);
    expect(r.controlsTotal).toBe(1414);
    expect(r.difference).toBe(0);
    expect(r.totals.notTied).toBe(-200);
    expect(r.totals.cells.reduce((t, c) => t + c, 0) + r.totals.notTied).toBe(r.totals.balance);
  });

  it("says when the rows and the books differ", () => {
    const broken = { ...ANSWER, controls: [{ account_code: "300-1000", name: "SHOWROOM DEBTORS", balance: "1000.00" }] };
    expect(arAgingReport(broken, "invoice", "month").difference).toBe(414);
  });

  it("names the one channel a row's invoices share, or several", () => {
    const r = arAgingReport(ANSWER, "invoice", "month");
    expect(r.rows[0]!.channel).toEqual({ type: "SHOWROOM", id: "out-1" });
    expect(r.rows[1]!.channel).toBeNull();
    expect(r.rows[2]!.channel).toBeNull();
    const two = arAgingReport({ ...ANSWER, debtors: [{ ...ANSWER.debtors[0]!, invoices: [
      inv({}), inv({ invoice_id: "i-2", invoice_no: "INV-2", department_type: "DEALER", department_id: "d-1" }),
    ] }] }, "invoice", "month");
    expect(two.rows[0]!.channel).toBe("several");
  });

  it("carries the invoices issued before the ledger started", () => {
    expect(arAgingReport(ANSWER, "invoice", "month").beforeGoLive).toEqual({ count: 1, amount: 2499 });
  });

  it("refuses a figure it cannot read", () => {
    const bad = { ...ANSWER, debtors: [{ ...ANSWER.debtors[0]!, balance: "abc" }] };
    expect(() => arAgingReport(bad, "invoice", "month")).toThrow();
  });

  it("takes a day, or none for today", () => {
    expect(arAgingQuery.safeParse({}).success).toBe(true);
    expect(arAgingQuery.safeParse({ asAt: "2026-10-12" }).success).toBe(true);
    expect(arAgingQuery.safeParse({ asAt: "12/10/2026" }).success).toBe(false);
    expect(arAgingQuery.safeParse({ asAt: "2026-10-12", x: "1" }).success).toBe(false);
  });
});

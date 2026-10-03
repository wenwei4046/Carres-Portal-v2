import { describe, expect, it } from "vitest";
import { awaitsFinance, paymentRequestAnswerInput, paymentRequestInput, paymentRequestStage } from "./payment-requests";

const base = { status: "answered" as const, voucher: null, bill: null };

describe("where a payment request stands", () => {
  it("is read from the voucher that answers it", () => {
    const v = (status: string) => ({ ...base, voucher: { id: "v", voucher_no: "PV-1", status, voucher_date: "2026-10-03" } });
    expect(paymentRequestStage(v("draft"))).toBe("preparing");
    expect(paymentRequestStage(v("prepared"))).toBe("waiting_approval");
    expect(paymentRequestStage(v("checked"))).toBe("waiting_approval");
    expect(paymentRequestStage(v("approved"))).toBe("paid");
    expect(paymentRequestStage(v("cancelled"))).toBe("answer_cancelled");
  });

  it("is read from the bill that answers it, and what is paid on it", () => {
    const b = (status: string, paid: string) => ({ ...base, bill: { id: "b", bill_no: "BILL-1", status, total: "500.00", paid } });
    expect(paymentRequestStage(b("draft", "0"))).toBe("bill_draft");
    expect(paymentRequestStage(b("confirmed", "0.00"))).toBe("bill_entered");
    expect(paymentRequestStage(b("confirmed", "200.00"))).toBe("partly_paid");
    expect(paymentRequestStage(b("confirmed", "500.00"))).toBe("paid");
    expect(paymentRequestStage(b("cancelled", "0"))).toBe("answer_cancelled");
  });

  it("waits for Finance until answered, and a cancelled answer goes back to Finance", () => {
    expect(paymentRequestStage({ status: "submitted", voucher: null, bill: null })).toBe("with_finance");
    expect(paymentRequestStage({ status: "returned", voucher: null, bill: null })).toBe("returned");
    expect(paymentRequestStage({ status: "withdrawn", voucher: null, bill: null })).toBe("withdrawn");
    expect(awaitsFinance("with_finance")).toBe(true);
    expect(awaitsFinance("answer_cancelled")).toBe(true);
    expect(awaitsFinance("paid")).toBe(false);
  });
});

describe("what the requester types", () => {
  const good = { payeeName: "Bayview Properties", amount: 3500, purpose: "October rent, PJ showroom" };
  it("needs who, how much and what for; blanks are empty", () => {
    expect(paymentRequestInput.parse({ ...good, note: "  ", bankName: "" })).toMatchObject({ note: null, bankName: null });
    expect(paymentRequestInput.safeParse({ ...good, payeeName: " " }).error?.issues[0]?.message).toBe("Say who is to be paid");
    expect(paymentRequestInput.safeParse({ ...good, amount: 0 }).error?.issues[0]?.message).toBe("The amount must be more than RM 0.00");
    expect(paymentRequestInput.safeParse({ ...good, amount: 10.005 }).error?.issues[0]?.message).toBe("Type the amount in ringgit and sen");
    expect(paymentRequestInput.safeParse({ ...good, bankAccountNo: "51401-ABC" }).error?.issues[0]?.message).toBe("An account number is digits only");
  });

  it("is answered by one voucher or one bill", () => {
    const id = "11111111-1111-4111-8111-111111111111";
    expect(paymentRequestAnswerInput.safeParse({ voucherId: id }).success).toBe(true);
    expect(paymentRequestAnswerInput.safeParse({ voucherId: id, billId: id }).success).toBe(false);
    expect(paymentRequestAnswerInput.safeParse({}).success).toBe(false);
  });
});

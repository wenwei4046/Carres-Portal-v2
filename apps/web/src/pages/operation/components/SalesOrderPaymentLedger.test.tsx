import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";

/**
 * THE SALES ORDER'S PAYMENT LEDGER — the states an operator actually meets.
 *
 * The `.ui-contract` suite reads source text, which cannot see an empty result
 * render as `No payment has been recorded` or a 403 render as something OTHER
 * than a zero. Those two are the whole point of this file: **absence is not
 * zero**, and a ledger the reader may not see is not an empty ledger.
 */
vi.mock("@/lib/supabase", () => ({
  supabase: { storage: { from: () => ({ createSignedUrl: async () => ({ data: null, error: null }) }) } },
}));

const useOrderPayments = vi.fn();
vi.mock("@/lib/queries", () => ({ useOrderPayments: (...a: unknown[]) => useOrderPayments(...a) }));

const { default: PaymentLedger } = await import("./SalesOrderPaymentLedger");

/** One live goods payment, one deposit, one VOIDED row — the shape a real
 *  order carries once somebody has had to reverse a mis-key. */
const ROWS = [
  {
    id: "p1", order_id: "o1", amount: 2499.5, paid_on: "2026-09-02", method: "bank",
    kind: "payment", reference: "TXN-77120", receipt_no: "RC-020926-0031",
    receipt_url: "https://receipts.example/p1", note: null,
    recorded_by: "u1", recorded_by_name: "Shasha", created_at: "2026-09-02T02:00:00Z",
    counted_in_paid: true, voided_at: null,
  },
  {
    id: "p2", order_id: "o1", amount: 500, paid_on: "2026-08-21", method: "duitnow_qr",
    kind: "deposit", reference: null, receipt_no: null, receipt_url: null, note: null,
    recorded_by: null, recorded_by_name: null, created_at: "2026-08-21T02:00:00Z",
    counted_in_paid: false, voided_at: null,
  },
  {
    id: "p3", order_id: "o1", amount: 1200, paid_on: "2026-08-20", method: "cash",
    kind: "payment", reference: "WRONG", receipt_no: "RC-200826-0007", receipt_url: null,
    note: null, recorded_by: "u2", recorded_by_name: "Li Ching",
    created_at: "2026-08-20T02:00:00Z", counted_in_paid: true,
    voided_at: "2026-08-20T06:00:00Z", void_reason: "Keyed on the wrong order",
  },
];

beforeEach(() => useOrderPayments.mockReset());

describe("the Sales Order payment ledger", () => {
  it("prints every recorded transaction, to the cent", () => {
    useOrderPayments.mockReturnValue({ data: { payments: ROWS }, isLoading: false, isError: false });
    render(<PaymentLedger orderId="o1" />);

    /* ⭐ TO THE CENT. `RM 2,499.50` must not round to `RM 2,500` — the receipt
       would then disagree with the screen (money-format.ts, Loo 2026-07-28). */
    expect(screen.getByText("RM 2,499.50")).toBeTruthy();
    expect(screen.queryByText("RM 2,500")).toBeNull();
    expect(screen.getByText("RM 500.00")).toBeTruthy();

    /* The method WORD, not the database value. */
    expect(screen.getByText("Bank transfer")).toBeTruthy();
    expect(screen.getByText("DuitNow QR")).toBeTruthy();

    /* A deposit and a storage collection are different debts and say so. */
    expect(screen.getByText("Deposit")).toBeTruthy();

    expect(screen.getByText("TXN-77120")).toBeTruthy();
    expect(screen.getByText("RC-020926-0031")).toBeTruthy();
    expect(screen.getByText("Shasha")).toBeTruthy();
    expect(screen.getByText("View slip")).toBeTruthy();
  });

  it("keeps a VOIDED row in the history, stamped, and never silently drops it", () => {
    useOrderPayments.mockReturnValue({ data: { payments: ROWS }, isLoading: false, isError: false });
    render(<PaymentLedger orderId="o1" />);

    /* 0343 — a void is a STAMP, never a delete. The row survives so that
       "but I paid" has an answer; it is marked so it is not read as money. */
    const voided = screen.getByTestId("so-payment-row-voided");
    expect(within(voided).getByText(/Voided/)).toBeTruthy();
    expect(within(voided).getByText(/Keyed on the wrong order/)).toBeTruthy();
    expect(screen.getAllByTestId("so-payment-row")).toHaveLength(2);
  });

  it("names an absent reference, receipt, slip and recorder rather than leaving a blank", () => {
    useOrderPayments.mockReturnValue({ data: { payments: [ROWS[1]] }, isLoading: false, isError: false });
    render(<PaymentLedger orderId="o1" />);
    /* A BLANK MAY NEVER CARRY TWO MEANINGS — four empty cells on this row. */
    expect(screen.getAllByText("Not recorded")).toHaveLength(4);
  });

  it("says nothing has been recorded when the ledger is genuinely empty", () => {
    useOrderPayments.mockReturnValue({ data: { payments: [] }, isLoading: false, isError: false });
    render(<PaymentLedger orderId="o1" />);
    expect(screen.getByTestId("so-payments-empty")).toBeTruthy();
    expect(screen.queryByTestId("so-payments")).toBeNull();
  });

  it("⭐ does NOT read an unreadable ledger as a zero", () => {
    /* The route answers 403 to anyone who is not operation/principal. Printing
       "No payment has been recorded" there would state, as a fact, that the
       customer has paid nothing — the exact defect `absence is not zero` names. */
    useOrderPayments.mockReturnValue({
      data: undefined, isLoading: false, isError: true, error: { status: 403 },
    });
    render(<PaymentLedger orderId="o1" />);
    const note = screen.getByTestId("so-payments-unreadable");
    expect(note.textContent).toContain("not available to your role");
    expect(screen.queryByTestId("so-payments-empty")).toBeNull();
    expect(screen.queryByText(/No payment has been recorded/)).toBeNull();
  });

  it("distinguishes a failed read from a forbidden one", () => {
    useOrderPayments.mockReturnValue({
      data: undefined, isLoading: false, isError: true, error: { status: 500 },
    });
    render(<PaymentLedger orderId="o1" />);
    expect(screen.getByTestId("so-payments-unreadable").textContent).toContain("could not be opened");
  });

  it("shows a loading state, and renders nothing at all for an unsaved order", () => {
    useOrderPayments.mockReturnValue({ data: undefined, isLoading: true, isError: false });
    const { container, rerender } = render(<PaymentLedger orderId="o1" />);
    expect(container.textContent).toContain("Opening the payments");

    useOrderPayments.mockReturnValue({ data: undefined, isLoading: false, isError: false });
    rerender(<PaymentLedger orderId={null} />);
    expect(screen.queryByTestId("so-payments")).toBeNull();
  });
});

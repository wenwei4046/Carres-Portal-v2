import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within, fireEvent } from "@testing-library/react";
import RentalCollectionsPanel from "./RentalCollectionsPanel";

/**
 * 0295 — the panel's job in one sentence: finance must be able to tell "the
 * card was refused" from "we have not billed this month yet". Before this the
 * two rendered identically, and they need opposite actions.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let collectionsState: any = { data: undefined, isPending: false, error: null };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let quoteState: any = { data: undefined, isPending: false, error: null };
const chargeMutate = vi.fn();

vi.mock("@/lib/queries", () => ({
  useRentalCollections: () => collectionsState,
  useRecordRentalPayment: () => ({ mutate: vi.fn(), isPending: false }),
  useChargeRentalInterest: () => ({ mutate: chargeMutate, isPending: false }),
  useRentalSettlementQuote: () => quoteState,
  useSettleRentalAgreement: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

function row(seq: number, over: Record<string, unknown> = {}) {
  return {
    id: `b-${seq}`,
    seq,
    dueDate: `2026-0${seq}-07`,
    amountDue: 69,
    status: "due",
    paidAt: null,
    paidAmount: null,
    method: null,
    reference: null,
    supplierShare: null,
    commissionShare: null,
    stripeInvoiceId: null,
    lateInterest: null,
    late: false,
    lastDecline: null,
    declineCount: 0,
    ...over,
  };
}

function collections(billings: unknown[], totals: Record<string, unknown> = {}) {
  return {
    data: {
      agreement: {
        id: "ag-1",
        agreementNo: "RA-1001",
        sku: "CLOUD-K",
        termMonths: 84,
        monthlyFee: 69,
        startDate: "2026-07-26",
        status: "active",
        supplierRatePct: 49,
        commissionBasePct: 20,
      },
      totals: {
        contractValue: 5796,
        collected: 0,
        outstanding: 5796,
        paidCount: 0,
        lateCount: 0,
        supplierShare: 0,
        commissionShare: 0,
        declinedCount: 0,
        unattachedDeclines: 0,
        ...totals,
      },
      billings,
      events: [],
    },
    isPending: false,
    error: null,
  };
}

beforeEach(() => {
  collectionsState = { data: undefined, isPending: false, error: null };
  quoteState = { data: undefined, isPending: false, error: null };
  chargeMutate.mockReset();
});

describe("RentalCollectionsPanel — refused cards", () => {
  it("says Card declined instead of Due, with the date and the bank's reason", () => {
    collectionsState = collections(
      [
        row(2, {
          lastDecline: { at: "2026-09-07T03:00:00Z", reason: "Your card has insufficient funds." },
          declineCount: 1,
        }),
      ],
      { declinedCount: 1 },
    );
    render(<RentalCollectionsPanel agreementId="ag-1" onClose={() => {}} />);

    const cell = screen.getByTestId("declined-2");
    expect(within(cell).getByText("Card declined")).toBeInTheDocument();
    expect(within(cell).getByText("2026-09-07")).toBeInTheDocument();
    // The reason is what decides the phone call: new card, or top up and retry.
    expect(
      within(cell).getByText("Your card has insufficient funds."),
    ).toBeInTheDocument();
    expect(screen.getByTestId("declined-count")).toHaveTextContent("1 card declined");
  });

  it("shows the attempt count only once there is more than one", () => {
    collectionsState = collections([
      row(2, { lastDecline: { at: "2026-09-07T03:00:00Z", reason: null }, declineCount: 3 }),
    ]);
    render(<RentalCollectionsPanel agreementId="ag-1" onClose={() => {}} />);
    expect(screen.getByTestId("declined-2")).toHaveTextContent("3 tries");
  });

  it("outranks Past due — refused is the more specific fact and the actionable one", () => {
    collectionsState = collections(
      [row(2, { late: true, lastDecline: { at: "2026-09-07T03:00:00Z", reason: null } })],
      { lateCount: 1, declinedCount: 1 },
    );
    render(<RentalCollectionsPanel agreementId="ag-1" onClose={() => {}} />);
    const cell = screen.getByTestId("declined-2");
    expect(within(cell).getByText("Card declined")).toBeInTheDocument();
    expect(within(cell).queryByText("Past due")).toBeNull();
    // The header still counts both, because they are different questions.
    expect(screen.getByText("1 past due")).toBeInTheDocument();
    expect(screen.getByTestId("declined-count")).toBeInTheDocument();
  });

  it("a paid month never shows a decline — collecting the money IS the clear", () => {
    collectionsState = collections([
      row(2, { status: "paid", paidAmount: 69, lastDecline: null, declineCount: 0 }),
    ]);
    render(<RentalCollectionsPanel agreementId="ag-1" onClose={() => {}} />);
    expect(screen.queryByTestId("declined-2")).toBeNull();
    expect(screen.getByText("Paid")).toBeInTheDocument();
  });

  it("surfaces a refusal that matched no month at all", () => {
    // Every instalment collected but the card still failed: nobody would think
    // to look for this, so it gets said out loud rather than dropped.
    collectionsState = collections([row(2, { status: "paid" })], { unattachedDeclines: 1 });
    render(<RentalCollectionsPanel agreementId="ag-1" onClose={() => {}} />);
    expect(screen.getByText("1 declined with no month to match")).toBeInTheDocument();
  });

  it("degrades quietly against a Worker that does not send the new fields", () => {
    // A browser on this build talking to a pre-0295 API: no lastDecline, no
    // declinedCount. It must render the old way, not crash.
    const legacy = row(2);
    delete (legacy as Record<string, unknown>).lastDecline;
    delete (legacy as Record<string, unknown>).declineCount;
    collectionsState = collections([legacy], {});
    delete (collectionsState.data.totals as Record<string, unknown>).declinedCount;
    delete (collectionsState.data.totals as Record<string, unknown>).unattachedDeclines;

    render(<RentalCollectionsPanel agreementId="ag-1" onClose={() => {}} />);
    // Scoped to the row — "Due" is also a column header.
    const cell = within(screen.getByTestId("collection-row-2"));
    expect(cell.getByText("Due")).toBeInTheDocument();
    expect(screen.queryByTestId("declined-2")).toBeNull();
    expect(screen.queryByTestId("declined-count")).toBeNull();
  });
});

/**
 * 0300 — late interest and settling early.
 *
 * The distinction these lock down is the one the whole design rests on:
 * ACCRUED is what the clock says, CHARGED is what a person put on the
 * customer's account. Showing them as one number is how a penalty nobody
 * authorised ends up being collected.
 */
describe("RentalCollectionsPanel — late interest", () => {
  it("shows accrued interest greyed, as NOT charged yet", () => {
    collectionsState = collections([row(2, { late: true, accruedInterest: 5.52 })]);
    render(<RentalCollectionsPanel agreementId="ag-1" onClose={() => {}} />);
    expect(screen.getByTestId("interest-accrued-2")).toHaveTextContent("not charged yet");
    expect(screen.queryByTestId("interest-charged-2")).toBeNull();
  });

  it("once charged, shows the charged figure and the day it was charged", () => {
    collectionsState = collections([
      row(2, { late: true, accruedInterest: 6.9, lateInterest: 5.52, interestChargedAt: "2026-08-21T02:00:00Z" }),
    ]);
    render(<RentalCollectionsPanel agreementId="ag-1" onClose={() => {}} />);
    const cell = within(screen.getByTestId("interest-charged-2"));
    expect(cell.getByText(/5\.52/)).toBeInTheDocument();
    expect(cell.getByText(/charged 2026-08-21/)).toBeInTheDocument();
    // The charged figure wins the display; accrued is not shown alongside it.
    expect(screen.queryByTestId("interest-accrued-2")).toBeNull();
  });

  it("offers the charge only where it is legal, and calls with no amount", () => {
    collectionsState = collections([row(2, { late: true, accruedInterest: 5.52 })]);
    render(<RentalCollectionsPanel agreementId="ag-1" onClose={() => {}} />);
    fireEvent.click(screen.getByTestId("charge-interest-2"));
    expect(chargeMutate).toHaveBeenCalledTimes(1);
    // seq only — the penalty is the server's to work out.
    expect(chargeMutate.mock.calls[0][0]).toEqual({ seq: 2 });
  });

  it("offers nothing on a month that has not grown a penalty", () => {
    collectionsState = collections([row(2, { accruedInterest: 0 })]);
    render(<RentalCollectionsPanel agreementId="ag-1" onClose={() => {}} />);
    expect(screen.queryByTestId("charge-interest-2")).toBeNull();
  });

  it("offers nothing on a collected month, however late it once was", () => {
    collectionsState = collections([
      row(2, { status: "paid", paidAmount: 69, accruedInterest: 0, lateInterest: 5.52 }),
    ]);
    render(<RentalCollectionsPanel agreementId="ag-1" onClose={() => {}} />);
    expect(screen.queryByTestId("charge-interest-2")).toBeNull();
  });

  it("degrades against a Worker that does not send the new fields", () => {
    const legacy = row(2, { late: true });
    delete (legacy as Record<string, unknown>).accruedInterest;
    collectionsState = collections([legacy]);
    render(<RentalCollectionsPanel agreementId="ag-1" onClose={() => {}} />);
    expect(screen.queryByTestId("interest-accrued-2")).toBeNull();
    expect(screen.queryByTestId("charge-interest-2")).toBeNull();
    expect(screen.getByText("Past due")).toBeInTheDocument();
  });
});

describe("RentalCollectionsPanel — settling early", () => {
  it("is offered on a live contract and hidden on a closed one", () => {
    collectionsState = collections([row(2)]);
    const { unmount } = render(<RentalCollectionsPanel agreementId="ag-1" onClose={() => {}} />);
    expect(screen.getByTestId("open-settle")).toBeInTheDocument();
    unmount();

    collectionsState = collections([row(2)]);
    collectionsState.data.agreement.status = "completed";
    render(<RentalCollectionsPanel agreementId="ag-1" onClose={() => {}} />);
    expect(screen.queryByTestId("open-settle")).toBeNull();
  });

  it("shows the SERVER's figure, and will not settle without the signed document", () => {
    collectionsState = collections([row(2)]);
    quoteState = {
      data: { quote: { agreementNo: "RA-1001", status: "active", monthsLeft: 83, rentRemaining: 5727, interestCharged: 5.52, total: 5732.52 } },
      isPending: false,
      error: null,
    };
    render(<RentalCollectionsPanel agreementId="ag-1" onClose={() => {}} />);
    fireEvent.click(screen.getByTestId("open-settle"));

    expect(screen.getByTestId("settle-total")).toHaveTextContent("5,732.52");
    expect(screen.getByText("83 months of rent")).toBeInTheDocument();
    expect(screen.getByText("Late interest charged")).toBeInTheDocument();
    // No document picked yet — the rule is "the customer signs it first".
    expect(screen.getByTestId("settle-confirm")).toBeDisabled();
  });

  it("does not print an interest line when none was ever charged", () => {
    collectionsState = collections([row(2)]);
    quoteState = {
      data: { quote: { agreementNo: "RA-1001", status: "active", monthsLeft: 83, rentRemaining: 5727, interestCharged: 0, total: 5727 } },
      isPending: false,
      error: null,
    };
    render(<RentalCollectionsPanel agreementId="ag-1" onClose={() => {}} />);
    fireEvent.click(screen.getByTestId("open-settle"));
    expect(screen.queryByText("Late interest charged")).toBeNull();
    expect(screen.getByTestId("settle-total")).toHaveTextContent("5,727.00");
  });
});

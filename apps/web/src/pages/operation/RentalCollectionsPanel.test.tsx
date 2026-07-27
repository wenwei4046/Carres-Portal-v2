import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import RentalCollectionsPanel from "./RentalCollectionsPanel";

/**
 * 0295 — the panel's job in one sentence: finance must be able to tell "the
 * card was refused" from "we have not billed this month yet". Before this the
 * two rendered identically, and they need opposite actions.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let collectionsState: any = { data: undefined, isPending: false, error: null };

vi.mock("@/lib/queries", () => ({
  useRentalCollections: () => collectionsState,
  useRecordRentalPayment: () => ({ mutate: vi.fn(), isPending: false }),
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

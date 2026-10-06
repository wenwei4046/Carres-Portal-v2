/**
 * THE LOAN OFFER BLOCK (0492, Delivery MASTER §14.2, Card 15) — Carres
 * Operation offers the loan and records the customer's answer on the Sales
 * Order; the record is append-only and the latest one is the state.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import LoanPanel from "./LoanPanel";

const recordOffer = vi.fn();
let offers: Array<{ id: string; seq: number; order_id: string; event: "offered" | "accepted" | "declined"; item_id: string | null; label: string | null; reason: string | null; recorded_by: string | null; recorded_at: string; unit_id: string | null }> = [];

vi.mock("@/lib/queries", async () => {
  const actual = await vi.importActual<typeof import("@/lib/queries")>("@/lib/queries");
  return {
    ...actual,
    useLoanOffers: () => ({ data: { offers }, isLoading: false }),
    useRecordLoanOffer: () => ({ mutate: recordOffer, isPending: false }),
    useBorrowLoan: () => ({ mutate: vi.fn(), isPending: false }),
    useUpdateLoan: () => ({ mutate: vi.fn(), isPending: false }),
    useReturnLoan: () => ({ mutate: vi.fn(), isPending: false }),
    useReturnLoanSupplier: () => ({ mutate: vi.fn(), isPending: false }),
  };
});

function mount() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <LoanPanel orderId="order-a" loans={[]} suppliers={[]} />
    </QueryClientProvider>,
  );
}

const offer = (over: Partial<(typeof offers)[number]>): (typeof offers)[number] => ({
  id: "o1",
  seq: 1,
  order_id: "order-a",
  event: "offered",
  item_id: null,
  label: "Display sofa · HK55-3S",
  reason: null,
  recorded_by: null,
  recorded_at: "2026-09-13T01:00:00Z",
  unit_id: null,
  ...over,
});

beforeEach(() => {
  recordOffer.mockReset();
  offers = [];
});

describe("LoanPanel — the loan offer block", () => {
  it("with nothing offered it says so and offers the ONE door; the offer must say what is offered", () => {
    mount();
    expect(screen.getByTestId("loan-offer-state")).toHaveTextContent("No loan offered");
    fireEvent.click(screen.getByTestId("loan-offer-open"));
    expect(screen.getByTestId("loan-offer-save")).toBeDisabled();
    fireEvent.change(screen.getByLabelText("What is offered"), { target: { value: "Display sofa · HK55-3S" } });
    fireEvent.change(screen.getByLabelText("Why it is offered"), { target: { value: "Supplier date misses the customer commitment" } });
    fireEvent.click(screen.getByTestId("loan-offer-save"));
    expect(recordOffer).toHaveBeenCalledWith({ event: "offered", label: "Display sofa · HK55-3S", reason: "Supplier date misses the customer commitment" });
  });

  it("an open offer shows the two answers; the decline must say why", () => {
    offers = [offer({})];
    mount();
    expect(screen.getByTestId("loan-offer-state")).toHaveTextContent("Loan offered · Display sofa · HK55-3S");
    expect(screen.queryByTestId("loan-offer-open")).toBeNull();
    fireEvent.click(screen.getByTestId("loan-offer-accept"));
    expect(recordOffer).toHaveBeenCalledWith({ event: "accepted" });
    fireEvent.click(screen.getByTestId("loan-offer-decline"));
    expect(screen.getByTestId("loan-decline-save")).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Why the customer declined"), { target: { value: "Will wait" } });
    fireEvent.click(screen.getByTestId("loan-decline-save"));
    expect(recordOffer).toHaveBeenLastCalledWith({ event: "declined", reason: "Will wait" });
  });

  it("the history stays beneath the current state, in the governed words", () => {
    offers = [
      offer({ id: "o2", seq: 2, event: "declined", reason: "Will wait", recorded_at: "2026-09-13T02:00:00Z" }),
      offer({}),
    ];
    mount();
    expect(screen.getByTestId("loan-offer-state")).toHaveTextContent("Customer declined the loan · Display sofa · HK55-3S");
    expect(screen.getByTestId("loan-offer-history")).toHaveTextContent("Loan offered · Display sofa · HK55-3S");
    /* A declined conversation may be reopened with a new offer. */
    expect(screen.getByTestId("loan-offer-open")).toBeTruthy();
  });
});

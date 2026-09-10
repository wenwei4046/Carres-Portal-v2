/**
 * The governed cancellation door, held as tests.
 *
 * FOUR properties, and each one is a rule that would otherwise be re-derived
 * weaker by the next chat:
 *
 *   1 · A cancellation SAYS WHY. The act is unreachable until a reason is
 *       typed — the database refuses a blank one, and an operator should never
 *       meet that refusal as an error.
 *   2 · A REFUSED order shows the refusal and offers no destructive action at
 *       all. A proceeded order fails safe; the screen must fail safe with it.
 *   3 · The consequences are SHOWN and never acted on. Cancelling the
 *       customer's order does not cancel a PO, release a unit or refund money.
 *   4 · Money already collected is stated plainly, because a cancelled goods
 *       obligation can become a money obligation — and giving it back is the
 *       principal's separate decision (0345), never this button's.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { SalesOrderCancelImpact } from "@/lib/queries";
import CancelSalesOrderDialog from "./CancelSalesOrderDialog";

const cancelMutate = vi.fn();
let impactState: { data: SalesOrderCancelImpact | undefined; isLoading: boolean; isError: boolean };

vi.mock("@/lib/queries", async () => {
  const actual = await vi.importActual<typeof import("@/lib/queries")>("@/lib/queries");
  return {
    ...actual,
    useSalesOrderCancelImpact: () => impactState,
    useCancelOrder: () => ({ mutate: cancelMutate, isPending: false }),
  };
});

const impact = (over: Partial<SalesOrderCancelImpact> = {}): SalesOrderCancelImpact => ({
  order_id: "o-1",
  so: 1303,
  status: "place",
  cancellable: true,
  refusal: null,
  goods_total: 2499,
  paid: 0,
  findings: [
    { owner: "Purchasing", kind: "purchase_order", count: 0, blocks: false, href: "/operation?tab=purchase" },
    { owner: "Receiving", kind: "receipt", count: 0, blocks: false, href: "/operation?tab=receiving" },
    { owner: "Stock", kind: "unit", count: 0, blocks: false, href: "/operation?tab=stock-onhand" },
    { owner: "Delivery", kind: "attempt", count: 0, blocks: false, href: "/operation?tab=delivery" },
    { owner: "Money", kind: "paid", count: 0, amount: 0, blocks: false, href: "/finance/payments" },
    { owner: "Loan", kind: "loan", count: 0, blocks: false, href: "/operation?tab=loans" },
    { owner: "Other Commitments", kind: "work", count: 0, blocks: false, href: "/operation?tab=work" },
  ],
  ...over,
});

function mount() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <CancelSalesOrderDialog orderId="o-1" so={1303} open onOpenChange={() => {}} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  cancelMutate.mockClear();
  impactState = { data: impact(), isLoading: false, isError: false };
});

describe("a cancellation says why", () => {
  it("refuses to act while the reason is blank", () => {
    mount();
    expect(screen.getByTestId("cancel-so-confirm")).toBeDisabled();
    fireEvent.click(screen.getByTestId("cancel-so-confirm"));
    expect(cancelMutate).not.toHaveBeenCalled();
  });

  it("sends the trimmed reason once one is typed", () => {
    mount();
    fireEvent.change(screen.getByTestId("cancel-so-reason"), {
      target: { value: "  Customer cancelled the order  " },
    });
    fireEvent.click(screen.getByTestId("cancel-so-confirm"));
    expect(cancelMutate).toHaveBeenCalledWith({ reason: "Customer cancelled the order" });
  });
});

describe("a refused order fails safe on screen too", () => {
  it("shows the refusal and offers no destructive action", () => {
    impactState = {
      data: impact({
        status: "proceed_order",
        cancellable: false,
        refusal: "Only an order still at Placed can be cancelled here.",
      }),
      isLoading: false,
      isError: false,
    };
    mount();
    expect(screen.getByTestId("cancel-so-refusal")).toHaveTextContent(
      "Only an order still at Placed can be cancelled here.",
    );
    expect(screen.queryByTestId("cancel-so-confirm")).toBeNull();
    expect(screen.queryByTestId("cancel-so-reason")).toBeNull();
  });

  it("offers no destructive action while the consequences could not be read", () => {
    impactState = { data: undefined, isLoading: false, isError: true };
    mount();
    expect(screen.getByTestId("cancel-so-impact-error")).toBeInTheDocument();
    expect(screen.queryByTestId("cancel-so-confirm")).toBeNull();
  });
});

describe("the consequences are shown, never acted on", () => {
  it("names only the owners actually holding something open", () => {
    impactState = {
      data: impact({
        findings: impact().findings.map((f) =>
          f.owner === "Purchasing" ? { ...f, count: 2 } : f,
        ),
      }),
      isLoading: false,
      isError: false,
    };
    mount();
    const panel = screen.getByTestId("cancel-so-impact");
    expect(panel).toHaveTextContent("Purchasing · 2");
    /* A row of zeroes is noise; an empty consequence list is a real answer. */
    expect(panel).not.toHaveTextContent("Receiving");
  });

  it("says nothing about consequences when nothing is held open", () => {
    mount();
    expect(screen.queryByTestId("cancel-so-impact")).toBeNull();
  });
});

describe("money already collected is stated, never spent", () => {
  it("names the exposure and still leaves the refund to its own owner", () => {
    impactState = { data: impact({ paid: 1250 }), isLoading: false, isError: false };
    mount();
    expect(screen.getByTestId("cancel-so-money")).toHaveTextContent(
      "The customer has paid RM 1,250 on this order",
    );
    fireEvent.change(screen.getByTestId("cancel-so-reason"), {
      target: { value: "Customer cancelled" },
    });
    fireEvent.click(screen.getByTestId("cancel-so-confirm"));
    /* ONE call, and it carries a reason and nothing else — no refund, no
     * release, no PO cancellation rides along on this button. */
    expect(cancelMutate).toHaveBeenCalledTimes(1);
    expect(cancelMutate).toHaveBeenCalledWith({ reason: "Customer cancelled" });
  });
});

import { act, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import FinanceSubscriptionMonth from "./FinanceSubscriptionMonth";

vi.mock("@/lib/api", () => ({ apiFetch: vi.fn() }));
vi.mock("@/pages/operation/components/GlobalTopBar", () => ({ TopBarIcons: () => null }));
import { apiFetch } from "@/lib/api";

const VIEW = {
  month: "2026-10", due: 118, collected: 59, outstanding: 59,
  unpaid: [{
    billingId: "b1", agreementId: "a1", agreementNo: "RA-1001", seq: 2, dueDate: "2026-10-01", amountDue: 59,
    status: "due", paidAmount: null, customerName: "Tan Mei Ling", customerPhone: null, orderId: null, orderSo: null,
    salespersonName: null, daysLate: 3,
  }],
};

function show() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={qc}><MemoryRouter><FinanceSubscriptionMonth /></MemoryRouter></QueryClientProvider>);
  return qc;
}

describe("Subscriptions month states", () => {
  it("a failed read shows Try again and keeps the month picker", async () => {
    vi.mocked(apiFetch).mockRejectedValue(new Error("down"));
    show();
    expect(await screen.findByRole("alert")).toHaveTextContent("The subscription months could not be loaded. Try again.");
    expect(screen.getByTestId("subscription-month-picker")).toBeInTheDocument();
  });

  it("a failed background refetch keeps the rows and figures already read", async () => {
    vi.mocked(apiFetch).mockResolvedValue(VIEW);
    const qc = show();
    await screen.findByText("Tan Mei Ling");
    vi.mocked(apiFetch).mockRejectedValue(new Error("down"));
    await act(() => qc.refetchQueries());
    expect(screen.getByText("Tan Mei Ling")).toBeInTheDocument();
    expect(screen.getByText("RM 118.00")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});

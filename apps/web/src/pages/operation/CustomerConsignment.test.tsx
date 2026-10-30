/**
 * Customer Consignment payments: removing a payment asks first (review item 4),
 * and an amount above the balance is refused in the form (item 12). The server
 * does not cap an overpayment (0719, like Houzs), so the form is the only guard.
 */
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Payments } from "./CustomerConsignment";

const apiFetch = vi.fn();
vi.mock("@/lib/api", () => ({ apiFetch: (...a: unknown[]) => apiFetch(...a) }));
vi.mock("@/lib/payment-methods", () => ({
  useManualMethods: () => ({ methods: [{ value: "cash", label: "Cash" }], label: (v: string) => v }),
}));

const payment = { id: "p1", paid_at: "2026-10-20", method: "cash", amount: 300, reference: null, note: null };

function show(balance = 500) {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <Payments path="/orders/o1" money={{ total: 800, paid: 300, balance }} payments={[payment]} onSaved={() => {}} />
    </QueryClientProvider>,
  );
}

describe("Payments", () => {
  it("does not delete on the first click of Remove", () => {
    apiFetch.mockClear();
    show();
    fireEvent.click(screen.getByRole("button", { name: "Remove" }));
    expect(apiFetch).not.toHaveBeenCalled();
    expect(screen.getByText("Remove this payment?")).toBeTruthy();
  });

  it("refuses an amount above the balance and says why", () => {
    show(500);
    fireEvent.change(screen.getByLabelText(/Amount \(RM\)/), { target: { value: "500.01" } });
    expect(screen.getByText("The balance is RM 500.00. Enter that or less.")).toBeTruthy();
    expect((screen.getByRole("button", { name: "Add Payment" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("accepts an amount equal to the balance", () => {
    show(500);
    fireEvent.change(screen.getByLabelText(/Amount \(RM\)/), { target: { value: "500.00" } });
    expect(screen.queryByText(/Enter that or less/)).toBeNull();
  });
});

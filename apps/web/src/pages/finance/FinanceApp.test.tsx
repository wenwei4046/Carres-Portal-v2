import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import FinanceApp from "./FinanceApp";

vi.mock("@/pages/portal/PortalSidebar", () => ({ default: () => null }));
vi.mock("@/pages/operation/components/GlobalTopBar", () => ({ TopBarIcons: () => null }));
vi.mock("@/lib/queries", () => ({
  usePaymentRegister: () => ({ data: [], isLoading: false, isError: false, refetch: vi.fn(), error: null }),
  useInvoiceRegister: () => ({ data: [], isLoading: false, isError: false, refetch: vi.fn(), error: null }),
}));

function show(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/finance/*" element={<FinanceApp />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("Finance routing", () => {
  it("opens the canonical Payments Register at /finance/payments", () => {
    show("/finance/payments");
    expect(screen.getByTestId("payments-destination-header")).toBeInTheDocument();
    // The retired bucket preamble may not return: a Register has no KPI cards.
    expect(screen.queryByText("Fully paid")).not.toBeInTheDocument();
  });
  it("opens the canonical Invoices Register at /finance/invoices", () => {
    show("/finance/invoices");
    expect(screen.getByTestId("invoices-destination-header")).toBeInTheDocument();
  });
});

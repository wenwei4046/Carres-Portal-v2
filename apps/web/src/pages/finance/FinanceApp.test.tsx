import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import FinanceApp from "./FinanceApp";

vi.mock("@/pages/portal/PortalSidebar", () => ({ default: () => null }));
vi.mock("@/pages/operation/components/GlobalTopBar", () => ({ TopBarIcons: () => null }));
vi.mock("@/lib/queries", () => ({
  usePaymentRegister: () => ({ data: [], isLoading: false, isError: false, refetch: vi.fn(), error: null }),
  useInvoiceRegister: () => ({ data: [], isLoading: false, isError: false, refetch: vi.fn(), error: null }),
  // The Payments object offers `Correct allocation` only to the Payment
  // Approver, so the register asks who holds that duty (0450).
  useWorkspaceDuties: () => ({ data: { duties: [] } }),
  qk: { finance: {
    paymentRegister: () => ["finance", "payment-register"],
    invoiceRegister: () => ["finance", "invoice-register"],
  } },
}));
// The Finance Ledger pages read through their own hooks file; an unanswered
// read is enough to prove which destination a route opens.
vi.mock("./ledger/ledger-queries", () => {
  const waiting = { data: undefined, isLoading: true, isSuccess: false, isError: false,
    isFetching: false, error: null, refetch: vi.fn() };
  return {
    JOURNAL_PAGE_SIZE: 1000, JOURNAL_MAX_PAGES: 10,
    useLedgerEntries: () => waiting, useLedgerEntry: () => waiting, useLedgerChart: () => waiting,
    useTrialBalance: () => waiting, useLedgerSelfCheck: () => waiting,
  };
});
const auth = vi.hoisted(() => ({ role: "finance" as string }));
vi.mock("@/lib/auth", () => ({
  useAuth: (selector: (s: { role: string; user: { id: string } | null }) => unknown) =>
    selector({ role: auth.role, user: null }),
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
  it("operation staff reach Payments — collection is their daily work (§12)", () => {
    auth.role = "operation";
    show("/finance/payments");
    expect(screen.getByTestId("payments-destination-header")).toBeInTheDocument();
    auth.role = "finance";
  });
  it("operation staff bounce off the finance-only pages to Payments", () => {
    auth.role = "operation";
    show("/finance/recon");
    expect(screen.getByTestId("payments-destination-header")).toBeInTheDocument();
    auth.role = "finance";
  });
  it("opens the three Finance Ledger destinations, each on its own route", () => {
    show("/finance/ledger");
    expect(screen.getByTestId("journal-destination-header")).toBeInTheDocument();
    cleanup();
    show("/finance/ledger/trial-balance");
    expect(screen.getByTestId("trial-balance-destination-header")).toBeInTheDocument();
    cleanup();
    show("/finance/ledger/self-check");
    expect(screen.getByTestId("self-check-destination-header")).toBeInTheDocument();
  });
  it("a pasted entry number opens that entry, not the list", () => {
    show("/finance/ledger?entry=JE-202609-0003");
    expect(screen.getByTestId("object-identity")).toHaveTextContent("JE-202609-0003");
    expect(screen.queryByTestId("journal-destination-header")).not.toBeInTheDocument();
  });
  it("operation staff never reach the ledger", () => {
    auth.role = "operation";
    show("/finance/ledger/trial-balance");
    expect(screen.getByTestId("payments-destination-header")).toBeInTheDocument();
    expect(screen.queryByTestId("trial-balance-destination-header")).not.toBeInTheDocument();
    auth.role = "finance";
  });
});

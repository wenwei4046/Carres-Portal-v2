import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import FinanceApp from "./FinanceApp";

vi.mock("@/pages/portal/PortalSidebar", () => ({ default: () => null }));
vi.mock("@/pages/operation/components/GlobalTopBar", () => ({ TopBarIcons: () => null }));
vi.mock("@/lib/queries", () => {
  const answered = { data: [], isLoading: false, isError: false, isSuccess: true, refetch: vi.fn(), error: null };
  return {
    usePaymentRegister: () => answered,
    useInvoiceRegister: () => answered,
    // The Monitor's other source reads (2026-09-12).
    usePaymentStorageCases: () => ({ ...answered, data: { cases: [] } }),
    useLaterDeliveryRequests: () => ({ ...answered, data: { requests: [] } }),
    usePaymentSettings: () => ({ ...answered, data: { collection_timing: [], bank_accounts: [] } }),
    useOperationWork: () => ({ data: undefined }),
    useCatalog: () => ({ data: undefined }),
    useVoidPayment: () => ({ mutate: vi.fn(), isPending: false }),
    // The Payments object offers `Correct allocation` only to the Payment
    // Approver, so the register asks who holds that duty (0450).
    useWorkspaceDuties: () => ({ data: { duties: [] } }),
    qk: { finance: {
      paymentRegister: () => ["finance", "payment-register"],
      invoiceRegister: () => ["finance", "invoice-register"],
      storageCases: () => ["finance", "storage-cases", "all"],
      laterDeliveryRequests: () => ["finance", "later-delivery-requests", "all"],
      paymentSettings: () => ["finance", "payment-settings"],
    } },
  };
});
vi.mock("@/lib/payment-methods", () => ({
  usePaymentMethodRegistry: () => ({ data: undefined }),
  PAYMENT_METHODS_QUERY_KEY: ["finance", "payment-methods"],
  manualMethodSpec: () => ({ evidence: "" }),
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
    // The Dashboard's cash, Activity and month-end pack reads (2026-09-14).
    useLatestLedgerEntries: () => waiting,
    ledgerKeys: { all: () => ["finance", "ledger"] },
    trialBalanceQuery: (asOf: string) => ({ queryKey: ["finance", "ledger", "trial-balance", asOf], queryFn: vi.fn() }),
  };
});
vi.mock("./settings/api", () => ({
  useMoneyAccounts: () => ({ data: undefined, isLoading: true, isSuccess: false, isError: false, refetch: vi.fn() }),
  useSaveMoneyAccount: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock("@/lib/payables-queries", async (importOriginal) => {
  const waiting = { data: undefined, isLoading: true, isSuccess: false, isError: false,
    isFetching: false, error: null, refetch: vi.fn() };
  return {
    ...(await importOriginal<object>()),
    useApOutstanding: () => waiting,
    useApBillOutstanding: () => waiting,
  };
});
const auth = vi.hoisted(() => ({ role: "finance" as string }));
vi.mock("@/lib/auth", () => ({
  useAuth: (selector: (s: { role: string; user: { id: string } | null }) => unknown) =>
    selector({ role: auth.role, user: null }),
}));

// The Dashboard's cash read and month-end pack need a query client; every other read here is mocked.
function show(path: string) {
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/finance/*" element={<FinanceApp />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("Finance routing", () => {
  it("opens Payment Records at /finance/payments", () => {
    show("/finance/payments");
    expect(screen.getByTestId("payment-records-destination-header")).toBeInTheDocument();
    // The retired bucket preamble may not return: a Register has no KPI cards.
    expect(screen.queryByText("Fully paid")).not.toBeInTheDocument();
  });
  it("opens the Payment Monitor at /finance/monitor", () => {
    show("/finance/monitor");
    expect(screen.getByTestId("payment-monitor-destination-header")).toBeInTheDocument();
  });
  /* ⭐ NO DUPLICATE EMPLOYEE DOORS (owner ruling 2026-09-12): the standalone
     Invoices Register, Refunds & Credits and Reconciliation are retired as
     pages — old links land on the authoritative destination, keeping their
     deep-link parameters. */
  it("/finance/invoices forwards to the Monitor and keeps its parameters", () => {
    show("/finance/invoices?order=1300");
    expect(screen.getByTestId("payment-monitor")).toBeInTheDocument();
    expect(screen.queryByTestId("invoices-destination-header")).not.toBeInTheDocument();
    expect(screen.getByTestId("payment-monitor-order-scope")).toHaveTextContent("SO-1300 only");
  });
  it("/finance/refunds and /finance/recon land on Payment Records — no routine Refund or Bank Matching surface", () => {
    show("/finance/refunds");
    expect(screen.getByTestId("payment-records-destination-header")).toBeInTheDocument();
    cleanup();
    show("/finance/recon");
    expect(screen.getByTestId("payment-records-destination-header")).toBeInTheDocument();
  });
  it("operation staff reach both Payments destinations — collection is their daily work (§12)", () => {
    auth.role = "operation";
    show("/finance/payments");
    expect(screen.getByTestId("payment-records-destination-header")).toBeInTheDocument();
    cleanup();
    show("/finance/monitor");
    expect(screen.getByTestId("payment-monitor-destination-header")).toBeInTheDocument();
    auth.role = "finance";
  });
  it("operation staff entering Finance land on the Monitor", () => {
    auth.role = "operation";
    show("/finance");
    expect(screen.getByTestId("payment-monitor-destination-header")).toBeInTheDocument();
    auth.role = "finance";
  });
  it("operation staff bounce off the finance-only pages to the Monitor", () => {
    auth.role = "operation";
    show("/finance/ar");
    expect(screen.getByTestId("payment-monitor-destination-header")).toBeInTheDocument();
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
  it("an old /finance/ap link lands on Unpaid by Supplier — the aging page is no longer routed", () => {
    show("/finance/ap");
    expect(screen.getByTestId("ap-outstanding-destination-header")).toBeInTheDocument();
  });
  it("opens the Dashboard and AR · Receivables on the canonical reads", () => {
    show("/finance/dashboard");
    expect(screen.getByTestId("finance-dashboard-destination-header")).toBeInTheDocument();
    cleanup();
    show("/finance/ar");
    expect(screen.getByTestId("ar-destination-header")).toBeInTheDocument();
  });
  it("opens Finance Settings, the money-account list, for Finance only (0512)", () => {
    show("/finance/settings");
    expect(screen.getByTestId("finance-settings-destination-header")).toHaveTextContent("Finance Settings");
    cleanup();
    auth.role = "operation";
    show("/finance/settings");
    expect(screen.queryByTestId("finance-settings-destination-header")).not.toBeInTheDocument();
    auth.role = "finance";
  });
  it("operation staff never reach the ledger", () => {
    auth.role = "operation";
    show("/finance/ledger/trial-balance");
    expect(screen.getByTestId("payment-monitor-destination-header")).toBeInTheDocument();
    expect(screen.queryByTestId("trial-balance-destination-header")).not.toBeInTheDocument();
    auth.role = "finance";
  });
});

import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { itSaysNoBannedWord } from "@/test/banned-words";
import LedgerTrialBalance from "./LedgerTrialBalance";

const api = vi.hoisted(() => ({ fetch: vi.fn() }));
vi.mock("@/lib/api", () => ({ apiFetch: api.fetch }));
vi.mock("@/pages/operation/components/GlobalTopBar", () => ({ TopBarIcons: () => null }));
vi.mock("xlsx", () => ({ utils: { json_to_sheet: () => ({}), book_new: () => ({}), book_append_sheet: vi.fn() }, writeFile: vi.fn() }));

const acc = (code: string, name: string, kind: string, dr: number, cr: number) => ({
  account_code: code, account_name: name, kind, is_control: false, is_active: true,
  total_debit: dr, total_credit: cr, natural_balance: 0,
});
const REPORT = {
  status: "ok", go_live_on: "2026-09-10", as_of: "2026-09-11",
  accounts: [
    acc("1120", "Bank", "ASSET", 40, 0),
    acc("1210", "Trade receivables", "ASSET", 150, 40),
    acc("1300", "Stock", "ASSET", 0, 0),
    acc("2110", "Trade payables", "LIABILITY", 70, 100),
    acc("4100", "Sales", "INCOME", 0, 150),
    acc("5100", "Purchases", "EXPENSE", 100, 70),
  ],
  total_debit: 360, total_credit: 360, difference: 0, balances: true,
};

function show(at = "/finance/ledger/trial-balance?asOf=2026-09-11") {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>
    <MemoryRouter initialEntries={[at]}><LedgerTrialBalance /></MemoryRouter>
  </QueryClientProvider>);
}

beforeEach(() => {
  api.fetch.mockReset();
  api.fetch.mockResolvedValue(REPORT);
  localStorage.clear();
});

describe("Trial Balance", () => {
  it("groups the accounts by kind, debits beside credits, and totals both", async () => {
    show();
    expect(screen.getByTestId("trial-balance-destination-header")).toBeInTheDocument();
    expect(await screen.findByText("1210 Trade receivables")).toBeInTheDocument();
    expect(api.fetch).toHaveBeenCalledWith("/api/finance/ledger/trial-balance?asOf=2026-09-11");
    expect(screen.getByText(/Kind: Asset/)).toBeInTheDocument();
    expect(screen.getByText(/Kind: Liability/)).toBeInTheDocument();
    expect(screen.getByText(/Kind: Income/)).toBeInTheDocument();
    // An account nothing was posted to has nothing to try.
    expect(screen.queryByText("1300 Stock")).not.toBeInTheDocument();
    // 1210: 150 debit less 40 credit sits on the debit side; 2110 on the credit side.
    expect(screen.getByText("RM 110.00")).toBeInTheDocument();
    expect(screen.getAllByText("RM 30.00").length).toBe(2);
    // The footer row: RM 40 + 110 + 30 debit = RM 30 + 150 credit.
    expect(screen.getAllByText("RM 180.00").length).toBe(2);
    expect(screen.getByTestId("trial-balance-summary")).toHaveTextContent("5 accounts · Difference RM 0.00");
    expect(screen.queryByTestId("trial-balance-differs")).not.toBeInTheDocument();
  });

  it("says the figures are movement since the ledger started, with no opening balances", async () => {
    show();
    expect(await screen.findByTestId("trial-balance-go-live")).toHaveTextContent("No opening balances");
    expect(screen.getByLabelText("As of")).toBeInTheDocument();
  });

  it("opens an account's own entries in the Journal, over the same period", async () => {
    show();
    const link = await screen.findByRole("link", { name: "1210 Trade receivables" });
    expect(link).toHaveAttribute("href", "/finance/ledger?account=1210&from=2026-09-10&to=2026-09-11");
  });

  it("raises the band only while debits and credits differ", async () => {
    api.fetch.mockResolvedValue({ ...REPORT, total_credit: 355, difference: 5, balances: false });
    show();
    const band = await screen.findByTestId("trial-balance-differs");
    expect(band).toHaveTextContent("Debits and credits differ by RM 5.00.");
    expect(within(band).getByRole("link", { name: "Open Self-check" })).toHaveAttribute("href", "/finance/ledger/self-check");
    expect(screen.getByTestId("trial-balance-summary")).toHaveTextContent("Difference RM 5.00");
  });

  it("a day before the ledger started names the first day instead of totalling nothing", async () => {
    api.fetch.mockResolvedValue({ status: "before_go_live", go_live_on: "2026-09-10", as_of: "2026-09-01",
      accounts: [], total_debit: null, total_credit: null, difference: null, balances: null });
    show("/finance/ledger/trial-balance?asOf=2026-09-01");
    expect(await screen.findByText(/The ledger started on .*Pick a day from then on\./)).toBeInTheDocument();
    expect(screen.getByTestId("trial-balance-summary")).toHaveTextContent("Difference not checked");
  });

  it("a failed read shows the fix and never a zero", async () => {
    api.fetch.mockRejectedValue(new Error("boom"));
    show();
    expect(await screen.findByRole("alert")).toHaveTextContent("The trial balance could not be loaded. Try again.");
    expect(screen.queryByText(/RM 0\.00/)).not.toBeInTheDocument();
  });

  it("a ledger with no start date says so", async () => {
    api.fetch.mockRejectedValue(Object.assign(new Error("The ledger has no start date yet."), { status: 409 }));
    show();
    expect(await screen.findByRole("alert")).toHaveTextContent("The ledger has no start date yet.");
  });
});

describe("Trial Balance words", () => {
  itSaysNoBannedWord(join(dirname(fileURLToPath(import.meta.url)), "LedgerTrialBalance.tsx"),
    { minStrings: 8, expectString: "No opening balances" });
});

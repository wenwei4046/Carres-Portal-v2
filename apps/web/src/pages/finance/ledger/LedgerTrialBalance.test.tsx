import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { itSaysNoBannedWord } from "@/test/banned-words";
import LedgerTrialBalance, { trialBalanceLines } from "./LedgerTrialBalance";
import { trialBalanceSheet } from "../month-end-pack";

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

// As the API serves it since headings carry subtotals: Assets > Current assets
// > Bank, three deep; 1300 holds only an account nothing was posted to, and
// 1400 holds nothing at all (a heading whose last account moved out, 0580).
const head = (code: string, name: string, kind: string, depth: number, parent: string | null, debit: number, credit: number) =>
  ({ code, name, kind, depth, parent_code: parent, debit, credit });
const under = (hdr: string, a: ReturnType<typeof acc>) => ({ ...a, header_code: hdr });
const NESTED = {
  status: "ok", go_live_on: "2026-09-10", as_of: "2026-09-11",
  accounts: [
    under("1120", acc("1121", "Maybank", "ASSET", 700, 200)),
    under("1120", acc("1122", "Public Bank", "ASSET", 10, 40)),
    under("1100", acc("1110", "Cash in hand", "ASSET", 20, 0)),
    under("1300", acc("1310", "Finished goods", "ASSET", 0, 0)),
    under("2000", acc("2110", "Trade payables", "LIABILITY", 0, 100)),
    under("4000", acc("4100", "Sales", "INCOME", 0, 440)),
    under("5000", acc("5100", "Purchases", "EXPENSE", 50, 0)),
  ],
  headings: [
    head("1000", "Assets", "ASSET", 1, null, 520, 30),
    head("1100", "Current assets", "ASSET", 2, "1000", 520, 30),
    head("1120", "Bank", "ASSET", 3, "1100", 500, 30),
    head("1300", "Stock", "ASSET", 2, "1000", 0, 0),
    head("1400", "Deposits paid", "ASSET", 2, "1000", 0, 0),
    head("2000", "Liabilities", "LIABILITY", 1, null, 0, 100),
    head("4000", "Income", "INCOME", 1, null, 0, 440),
    head("5000", "Cost of sales", "EXPENSE", 1, null, 50, 0),
  ],
  total_debit: 780, total_credit: 780, difference: 0, balances: true,
};

describe("Trial Balance headings", () => {
  it("prints each heading with its own subtotal, nested, in the chart's order; an empty heading adds no line", () => {
    const printed = trialBalanceLines(NESTED as never).map((r) =>
      `${r.heading ? "H" : "A"}${r.depth} ${r.heading ? r.name : r.code} ${r.debit}/${r.credit}`);
    expect(printed).toEqual([
      "H1 Assets 520/30",
      "H2 Current assets 520/30",
      // A heading's own accounts first, then the headings inside it, as statementRows prints.
      "A3 1110 20/0",
      "H3 Bank 500/30",
      "A4 1121 500/0",
      "A4 1122 0/30",
      // One heading holds the whole kind and nothing nests: no heading line,
      // as on the Balance Sheet and the Profit and Loss.
      "A1 2110 0/100",
      "A1 4100 0/440",
      "A1 5100 50/0",
    ]);
    // The accounts alone still balance: 500 + 20 + 50 = 30 + 100 + 440.
    const accounts = trialBalanceLines(NESTED as never).filter((r) => !r.heading);
    expect(accounts.reduce((t, r) => t + r.debit, 0)).toBe(570);
    expect(accounts.reduce((t, r) => t + r.credit, 0)).toBe(570);
  });

  it("indents the headings on screen, and the footer counts each account once", async () => {
    api.fetch.mockResolvedValue(NESTED);
    show();
    const bank = await screen.findByText("Bank");
    expect(bank).toHaveClass("font-semibold", "pl-8");
    expect(screen.getByText("Current assets")).toHaveClass("pl-4");
    expect(screen.getByRole("link", { name: "1121 Maybank" }).parentElement).toHaveClass("pl-12");
    expect(screen.queryByText("Stock")).not.toBeInTheDocument();
    expect(screen.queryByText("Deposits paid")).not.toBeInTheDocument();
    expect(screen.queryByText("1310 Finished goods")).not.toBeInTheDocument();
    // Assets and Current assets both carry RM 520.00; the footer is RM 570.00 on each side.
    expect(screen.getAllByText("RM 520.00").length).toBe(2);
    expect(screen.getAllByText("RM 570.00").length).toBe(2);
    expect(screen.getByTestId("trial-balance-summary")).toHaveTextContent("6 accounts · Difference RM 0.00");
  });

  it("asks for the department it was given", async () => {
    api.fetch.mockResolvedValue(NESTED);
    show("/finance/ledger/trial-balance?asOf=2026-09-11&dept=SHOWROOM");
    await screen.findByText("Bank");
    expect(api.fetch).toHaveBeenCalledWith("/api/finance/ledger/trial-balance?asOf=2026-09-11&departmentType=SHOWROOM");
  });

  it("the month-end pack prints the same rows, indented, with the total counting each account once", () => {
    const rows = trialBalanceSheet(NESTED as never).rows.slice(3);
    expect(rows).toEqual([
      ["Account", "Kind", "Debit", "Credit"],
      ["Assets", "Asset", 520, 30],
      ["  Current assets", "Asset", 520, 30],
      ["    1110 Cash in hand", "Asset", 20, 0],
      ["    Bank", "Asset", 500, 30],
      ["      1121 Maybank", "Asset", 500, 0],
      ["      1122 Public Bank", "Asset", 0, 30],
      ["2110 Trade payables", "Liability", 0, 100],
      ["4100 Sales", "Income", 0, 440],
      ["5100 Purchases", "Expense", 50, 0],
      ["Total", "", 570, 570],
    ]);
  });
});

describe("Trial Balance words", () => {
  itSaysNoBannedWord(join(dirname(fileURLToPath(import.meta.url)), "LedgerTrialBalance.tsx"),
    { minStrings: 8, expectString: "No opening balances" });
});

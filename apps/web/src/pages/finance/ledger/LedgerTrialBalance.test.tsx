import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { itSaysNoBannedWord } from "@/test/banned-words";
import LedgerTrialBalance, { trialBalanceLines } from "./LedgerTrialBalance";
import { trialBalanceSheet } from "../month-end-pack";

const api = vi.hoisted(() => ({ fetch: vi.fn(), sheet: vi.fn(() => ({})) }));
vi.mock("@/lib/api", () => ({ apiFetch: api.fetch }));
vi.mock("@/pages/operation/components/GlobalTopBar", () => ({ TopBarIcons: () => null }));
vi.mock("xlsx", () => ({ utils: { json_to_sheet: api.sheet, book_new: () => ({}), book_append_sheet: vi.fn() }, writeFile: vi.fn() }));

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
  api.sheet.mockClear();
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

/// As the API serves it since headings carry subtotals. The codes are made up;
// what matters is the chart's order (`chart_position`), which is not the
// codes' order: Finance dragged Bank above Cash in hand, so under Current
// assets the sub-heading Bank prints before the account Cash in hand. Stock
// holds only an account nothing was posted to, and Deposits paid holds nothing.
// The accounts come in the ledger's own order, as they always have.
const head = (code: string, name: string, kind: string, depth: number, parent: string | null, pos: number, debit: number, credit: number) =>
  ({ code, name, kind, depth, parent_code: parent, chart_position: pos, debit, credit });
const under = (hdr: string, pos: number, a: ReturnType<typeof acc>) => ({ ...a, header_code: hdr, chart_position: pos });
const NESTED = {
  status: "ok", go_live_on: "2026-09-10", as_of: "2026-09-11",
  accounts: [
    under("CA", 6, acc("CA-C", "Cash in hand", "ASSET", 20, 0)),
    under("CA-B", 4, acc("CA-B1", "Maybank", "ASSET", 700, 200)),
    under("CA-B", 5, acc("CA-B2", "Public Bank", "ASSET", 10, 40)),
    under("ST", 8, acc("ST-F", "Finished goods", "ASSET", 0, 0)),
    under("EX", 15, acc("EX-P", "Purchases", "EXPENSE", 50, 0)),
    under("IN", 13, acc("IN-S", "Sales", "INCOME", 0, 440)),
    under("LI", 11, acc("LI-T", "Trade payables", "LIABILITY", 0, 100)),
  ],
  headings: [
    head("AS", "Assets", "ASSET", 1, null, 1, 520, 30),
    head("CA", "Current assets", "ASSET", 2, "AS", 2, 520, 30),
    head("CA-B", "Bank", "ASSET", 3, "CA", 3, 500, 30),
    head("ST", "Stock", "ASSET", 2, "AS", 7, 0, 0),
    head("DP", "Deposits paid", "ASSET", 2, "AS", 9, 0, 0),
    head("LI", "Liabilities", "LIABILITY", 1, null, 10, 0, 100),
    head("IN", "Income", "INCOME", 1, null, 12, 0, 440),
    head("EX", "Cost of sales", "EXPENSE", 1, null, 14, 50, 0),
  ],
  total_debit: 780, total_credit: 780, difference: 0, balances: true,
};

/** The account links on screen, top to bottom. */
const printedAccounts = () => screen.getAllByRole("link").map((l) => l.textContent).filter((t) => /^[A-Z]{2}-/.test(t ?? ""));
/** Click a column's sort; each column header repeats per group, so take the first. */
const sortBy = (label: string) => fireEvent.click(screen.getAllByRole("button", { name: new RegExp(`^${label}`) })[0]!);

describe("Trial Balance headings", () => {
  it("prints accounts and sub-headings mixed in the chart's order, each heading with its subtotal; an empty heading adds no line", () => {
    const printed = trialBalanceLines(NESTED as never).map((r) =>
      `${r.heading ? "H" : "A"}${r.depth} ${r.heading ? r.name : r.code} ${r.debit}/${r.credit}`);
    expect(printed).toEqual([
      "H1 Assets 520/30",
      "H2 Current assets 520/30",
      // Bank sits above Cash in hand in the chart, so it prints first.
      "H3 Bank 500/30",
      "A4 CA-B1 500/0",
      "A4 CA-B2 0/30",
      "A3 CA-C 20/0",
      // One heading holds the whole kind and nothing nests: no heading line,
      // as on the Balance Sheet and the Profit and Loss.
      "A1 LI-T 0/100",
      "A1 IN-S 0/440",
      "A1 EX-P 50/0",
    ]);
  });

  it("indents the headings on screen, and the totals count each account once, never a subtotal", async () => {
    api.fetch.mockResolvedValue(NESTED);
    show();
    const bank = await screen.findByText("Bank");
    expect(bank).toHaveClass("font-semibold", "pl-8");
    expect(screen.getByText("Current assets")).toHaveClass("pl-4");
    expect(screen.getByRole("link", { name: "CA-B1 Maybank" }).parentElement).toHaveClass("pl-12");
    expect(screen.queryByText("Stock")).not.toBeInTheDocument();
    expect(screen.queryByText("Deposits paid")).not.toBeInTheDocument();
    expect(screen.queryByText("ST-F Finished goods")).not.toBeInTheDocument();
    // Assets and Current assets both carry RM 520.00. The footer is the
    // accounts alone, RM 570.00 on each side (500 + 20 + 50 = 30 + 100 + 440),
    // with no subtotal added in a second time.
    expect(screen.getAllByText("RM 520.00").length).toBe(2);
    expect(screen.getAllByText("RM 570.00").length).toBe(2);
  });

  it("counts accounts, never heading lines, in the kind's count and the status line", async () => {
    api.fetch.mockResolvedValue(NESTED);
    show();
    await screen.findByText("Bank");
    // Maybank, Public Bank, Cash in hand: three accounts under three heading lines.
    expect(screen.getByText(/Kind: Asset/).closest("tr")).toHaveTextContent("(3)");
    expect(screen.getByTestId("trial-balance-summary")).toHaveTextContent("6 accounts · Difference RM 0.00");
  });

  it("a sorted column prints the accounts alone, sorted as before headings; clearing the sort brings the headings back", async () => {
    api.fetch.mockResolvedValue(NESTED);
    show();
    await screen.findByText("Bank");
    sortBy("Account");
    sortBy("Account");
    // Descending by account, grouped by kind in the order the kinds first appear.
    expect(printedAccounts()).toEqual(["LI-T Trade payables", "IN-S Sales", "EX-P Purchases", "CA-C Cash in hand", "CA-B2 Public Bank", "CA-B1 Maybank"]);
    expect(screen.queryByText("Current assets")).not.toBeInTheDocument();
    expect(screen.queryByText("Bank")).not.toBeInTheDocument();
    expect(screen.getByText("CA-B1 Maybank")).not.toHaveClass("pl-12");
    expect(screen.getAllByText("RM 570.00").length).toBe(2);
    expect(screen.getByTestId("trial-balance-summary")).toHaveTextContent("6 accounts");
    sortBy("Account");
    expect(screen.getByText("Current assets")).toBeInTheDocument();
    expect(printedAccounts()).toEqual(["CA-B1 Maybank", "CA-B2 Public Bank", "CA-C Cash in hand", "LI-T Trade payables", "IN-S Sales", "EX-P Purchases"]);
  });

  it("Export Excel leaves the heading lines' Debit and Credit empty, so a column sum counts each account once", async () => {
    api.fetch.mockResolvedValue(NESTED);
    show();
    await screen.findByText("Bank");
    fireEvent.click(screen.getByRole("button", { name: "Export" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Excel" }));
    await waitFor(() => expect(api.sheet).toHaveBeenCalled());
    const sheet = (api.sheet.mock.calls[0] as unknown[])[0] as Record<string, string>[];
    expect(sheet.map((r) => `${r.Account}|${r.Debit}|${r.Credit}`)).toEqual([
      "Assets||", "  Current assets||", "    Bank||",
      "      CA-B1 Maybank|500|0", "      CA-B2 Public Bank|0|30", "    CA-C Cash in hand|20|0",
      "LI-T Trade payables|0|100", "IN-S Sales|0|440", "EX-P Purchases|50|0",
    ]);
    const total = (side: string) => sheet.reduce((s, r) => s + Number(r[side] || 0), 0);
    expect([total("Debit"), total("Credit")]).toEqual([570, 570]);
  });

  it("a search looks through the accounts alone and prints them flat, so the footer adds up what is on screen", async () => {
    api.fetch.mockResolvedValue(NESTED);
    show();
    await screen.findByText("Bank");
    fireEvent.click(screen.getByRole("button", { name: "Search" }));
    fireEvent.change(screen.getByRole("searchbox", { name: "Search" }), { target: { value: "Current assets" } });
    // A heading's name finds nothing: no bold heading line with a subtotal beside an RM 0.00 footer.
    await waitFor(() => expect(screen.queryByText("Current assets")).not.toBeInTheDocument());
    fireEvent.change(screen.getByRole("searchbox", { name: "Search" }), { target: { value: "Maybank" } });
    const link = await screen.findByRole("link", { name: "CA-B1 Maybank" });
    // Flat, as while a column is sorted: not indented under a heading that is not there.
    await waitFor(() => expect(link.parentElement).not.toHaveClass("pl-12"));
    expect(screen.queryByText("Bank")).not.toBeInTheDocument();
    expect(screen.getAllByText("RM 500.00").length).toBe(2);
    expect(screen.getByTestId("trial-balance-summary")).toHaveTextContent("1 account ·");
    fireEvent.change(screen.getByRole("searchbox", { name: "Search" }), { target: { value: "" } });
    expect(await screen.findByText("Current assets")).toBeInTheDocument();
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
      ["    Bank", "Asset", 500, 30],
      ["      CA-B1 Maybank", "Asset", 500, 0],
      ["      CA-B2 Public Bank", "Asset", 0, 30],
      ["    CA-C Cash in hand", "Asset", 20, 0],
      ["LI-T Trade payables", "Liability", 0, 100],
      ["IN-S Sales", "Income", 0, 440],
      ["EX-P Purchases", "Expense", 50, 0],
      ["Total", "", 570, 570],
    ]);
  });
});

describe("Trial Balance words", () => {
  itSaysNoBannedWord(join(dirname(fileURLToPath(import.meta.url)), "LedgerTrialBalance.tsx"),
    { minStrings: 8, expectString: "No opening balances" });
});

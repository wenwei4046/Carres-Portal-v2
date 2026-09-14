import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { itSaysNoBannedWord } from "@/test/banned-words";
import { appTodayIso, fmtDate, fmtMonth } from "@/lib/fmt-date";
import FinanceReports from "./FinanceReports";

const api = vi.hoisted(() => ({ fetch: vi.fn() }));
vi.mock("@/lib/api", () => ({ apiFetch: api.fetch }));
vi.mock("@/pages/operation/components/GlobalTopBar", () => ({ TopBarIcons: () => null }));

// ── dates, from the same business clock the page reads ─────────────────────

const TODAY = appTodayIso();
const YM = TODAY.slice(0, 7);
function shiftMonth(ym: string, by: number): string {
  const [y, m] = ym.split("-").map(Number) as [number, number];
  return new Date(Date.UTC(y, m - 1 + by, 1)).toISOString().slice(0, 7);
}
function lastDay(ym: string): string {
  const [y, m] = ym.split("-").map(Number) as [number, number];
  return `${ym}-${String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, "0")}`;
}
const FROM = `${YM}-01`;
const TO = lastDay(YM);
const PREV = shiftMonth(YM, -1);
const GO_LIVE = `${shiftMonth(YM, -2)}-10`;

// ── the rows gl_profit_and_loss / gl_balance_sheet return (0469) ────────────

type Row = Record<string, unknown>;
const BLANK = { section: null, row_kind: null, header_code: null, header_name: null, account_code: null, account_name: null, amount: null };
const account = (section: string, hdr: string, hdrName: string, code: string, name: string, amount: number): Row =>
  ({ section, row_kind: "ACCOUNT", header_code: hdr, header_name: hdrName, account_code: code, account_name: name, amount });
const subtotal = (section: string, hdr: string, hdrName: string, amount: number): Row =>
  ({ section, row_kind: "HEADER_SUBTOTAL", header_code: hdr, header_name: hdrName, amount });
const total = (section: string, amount: number): Row =>
  ({ section, row_kind: "SECTION_TOTAL", header_name: `Total ${section.toLowerCase()}`, amount });

const PL_BODY: Row[] = [
  account("INCOME", "4000", "Income", "4000", "Income", 0),
  account("INCOME", "4000", "Income", "4100", "Furniture sales", 12500),
  account("INCOME", "4000", "Income", "4300", "Delivery income", 350),
  subtotal("INCOME", "4000", "Income", 12850),
  total("INCOME", 12850),
  account("EXPENSE", "5000", "Cost of sales", "5000", "Cost of sales", 0),
  account("EXPENSE", "5000", "Cost of sales", "5100", "Cost of goods sold", 7000),
  subtotal("EXPENSE", "5000", "Cost of sales", 7000),
  account("EXPENSE", "6000", "Operating expenses", "6000", "Operating expenses", 0),
  account("EXPENSE", "6000", "Operating expenses", "6200", "Rent and utilities", 1800),
  account("EXPENSE", "6000", "Operating expenses", "6500", "Bank and payment charges", 0),
  subtotal("EXPENSE", "6000", "Operating expenses", 1800),
  total("EXPENSE", 8800),
  { section: "NET", row_kind: "NET", header_name: "Net result for the period", amount: 4050 },
];

const bsBody = (difference: number): Row[] => [
  account("ASSET", "1000", "Assets", "1000", "Assets", 0),
  account("ASSET", "1000", "Assets", "1100", "Cash and bank", 0),
  account("ASSET", "1000", "Assets", "1200", "Receivables", 0),
  subtotal("ASSET", "1000", "Assets", 0),
  account("ASSET", "1100", "Cash and bank", "1120", "Bank — current account", 5200),
  subtotal("ASSET", "1100", "Cash and bank", 5200),
  account("ASSET", "1200", "Receivables", "1210", "Trade receivables — customers", 1650),
  subtotal("ASSET", "1200", "Receivables", 1650),
  total("ASSET", 6850),
  account("LIABILITY", "2000", "Liabilities", "2000", "Liabilities", 0),
  subtotal("LIABILITY", "2000", "Liabilities", 0),
  account("LIABILITY", "2100", "Payables", "2110", "Trade payables — suppliers", 2800),
  subtotal("LIABILITY", "2100", "Payables", 2800),
  total("LIABILITY", 2800),
  account("EQUITY", "3000", "Equity", "3000", "Equity", 0),
  account("EQUITY", "3000", "Equity", "3100", "Share capital", 0),
  subtotal("EQUITY", "3000", "Equity", 0),
  { section: "EQUITY", row_kind: "DERIVED", header_name: "Result not yet closed to equity",
    account_name: "Derived from income and expense accounts up to the as-of date", amount: 4050 },
  total("EQUITY", 4050),
  { section: "CHECK", row_kind: "EQUATION", header_name: "Assets minus (liabilities + equity + unclosed result)", amount: difference },
];

const pl = (from: string, to: string, body: Row[]) => ({
  rows: body.map((r, i) => ({ report_status: "OK", go_live_on: GO_LIVE, period_from: from, period_to: to, ordinal: i + 1, ...BLANK, ...r })),
});
const bs = (asOf: string, body: Row[], check = { balances: true, difference: 0 }) => ({
  rows: body.map((r, i) => ({ report_status: "OK", go_live_on: GO_LIVE, as_of: asOf, ordinal: i + 1, ...BLANK,
    equation_balances: check.balances, equation_difference: check.difference, ...r })),
});
const zero = (body: Row[]) => body.map((r) => ({ ...r, amount: 0 }));

/** Answers each statement for the dates it was asked, as the API does. */
function serve(over: { pl?: (from: string, to: string) => unknown; bs?: (asOf: string) => unknown } = {}) {
  api.fetch.mockImplementation(async (url: string) => {
    const u = new URL(url, "http://portal.test");
    if (u.pathname === "/api/finance/ledger/profit-and-loss") {
      const from = u.searchParams.get("from")!;
      const to = u.searchParams.get("to")!;
      return over.pl ? over.pl(from, to) : pl(from, to, PL_BODY);
    }
    if (u.pathname === "/api/finance/ledger/balance-sheet") {
      const asOf = u.searchParams.get("asOf")!;
      return over.bs ? over.bs(asOf) : bs(asOf, bsBody(0));
    }
    throw new Error(`unexpected fetch ${url}`);
  });
}

function show(at = "/finance/reports") {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>
    <MemoryRouter initialEntries={[at]}><FinanceReports /><Address /></MemoryRouter>
  </QueryClientProvider>);
}

/** The address bar's query, for tests that check what the page wrote there. */
function Address() {
  return <output data-testid="address">{useLocation().search}</output>;
}

/** Each band, line and bottom strip of one statement, cells joined by ` | `. */
function lines(table: HTMLElement): string[] {
  return Array.from(table.querySelectorAll('tr[data-kit="data-group"], tr[data-kit="data-row"], tr[data-kit="data-totals"]'))
    .map((tr) => Array.from(tr.children).map((td) => (td.textContent ?? "").trim()).join(" | ").trim());
}

const failure = (status: number, message = "boom") => Object.assign(new Error(message), { status });

beforeEach(() => {
  api.fetch.mockReset();
  serve();
});

describe("Reports — the statements read the ledger", () => {
  it("reads this month's Profit and Loss and today's Balance Sheet, and names the ledger's first day", async () => {
    show();
    expect(screen.getByTestId("reports-destination-header")).toBeInTheDocument();
    expect(await screen.findByTestId("reports-go-live")).toHaveTextContent(`Since ${fmtDate(GO_LIVE)} · No opening balances`);
    expect(api.fetch).toHaveBeenCalledWith(`/api/finance/ledger/profit-and-loss?from=${FROM}&to=${TO}`);
    expect(api.fetch).toHaveBeenCalledWith(`/api/finance/ledger/balance-sheet?asOf=${TODAY}`);
    expect(screen.getByRole("combobox", { name: "Month" })).toHaveTextContent(fmtMonth(YM));
  });

  it("prints the Profit and Loss as served: section totals, header subtotals, the accounts that moved and the net result", async () => {
    show();
    const table = screen.getByTestId("profit-and-loss");
    await within(table).findByRole("link", { name: "4100 Furniture sales" });
    expect(lines(table)).toEqual([
      "Income | RM 12,850.00",
      "4100 Furniture sales | RM 12,500.00",
      "4300 Delivery income | RM 350.00",
      "Expense | RM 8,800.00",
      "Cost of sales | RM 7,000.00",
      "5100 Cost of goods sold | RM 7,000.00",
      "Operating expenses | RM 1,800.00",
      "6200 Rent and utilities | RM 1,800.00",
      "Net result | RM 4,050.00",
    ]);
  });

  it("prints the total the ledger served, never a sum of its own", async () => {
    serve({ pl: (f, t) => pl(f, t, PL_BODY.map((r) =>
      r.row_kind === "SECTION_TOTAL" && r.section === "INCOME" ? { ...r, amount: 99.99 } : r)) });
    show();
    const table = screen.getByTestId("profit-and-loss");
    await within(table).findByRole("link", { name: "4100 Furniture sales" });
    expect(lines(table)[0]).toBe("Income | RM 99.99");
    expect(within(table).queryByText("RM 12,850.00")).not.toBeInTheDocument();
  });

  it("prints the Balance Sheet as served, with the result not yet closed inside equity", async () => {
    show();
    const table = screen.getByTestId("balance-sheet");
    await within(table).findByRole("link", { name: "1120 Bank — current account" });
    expect(lines(table)).toEqual([
      "Asset | RM 6,850.00",
      "Cash and bank | RM 5,200.00",
      "1120 Bank — current account | RM 5,200.00",
      "Receivables | RM 1,650.00",
      "1210 Trade receivables — customers | RM 1,650.00",
      "Liability | RM 2,800.00",
      "2110 Trade payables — suppliers | RM 2,800.00",
      "Equity | RM 4,050.00",
      "Net result not yet closed | RM 4,050.00",
    ]);
    expect(within(table).queryByText("Difference")).not.toBeInTheDocument();
    expect(screen.queryByTestId("balance-sheet-differs")).not.toBeInTheDocument();
    // Rows without 0506's `reclassified` column print as before, with no note.
    expect(within(table).queryByText(/paid before their invoice/)).not.toBeInTheDocument();
  });

  // 0506: customer A paid RM 5,000 before a RM 2,185 invoice (balance -2,815);
  // customer B owes RM 2,000. The database moves A's RM 2,815 onto 2210.
  const reclassedBody = (): Row[] => [
    account("ASSET", "1100", "Cash and bank", "1120", "Bank — current account", 6000),
    subtotal("ASSET", "1100", "Cash and bank", 6000),
    { ...account("ASSET", "1200", "Receivables", "1210", "Trade receivables — customers", 2000), reclassified: -2815 },
    subtotal("ASSET", "1200", "Receivables", 2000),
    total("ASSET", 8000),
    account("LIABILITY", "2100", "Payables", "2110", "Trade payables — suppliers", 0),
    subtotal("LIABILITY", "2100", "Payables", 0),
    { ...account("LIABILITY", "2200", "Customer money held", "2210", "Customer deposits held", 2815), reclassified: 2815 },
    subtotal("LIABILITY", "2200", "Customer money held", 2815),
    total("LIABILITY", 2815),
    account("EQUITY", "3000", "Equity", "3100", "Share capital", 0),
    subtotal("EQUITY", "3000", "Equity", 0),
    { section: "EQUITY", row_kind: "DERIVED", header_name: "Result not yet closed to equity", amount: 5185 },
    total("EQUITY", 5185),
    { section: "CHECK", row_kind: "EQUATION", amount: 0 },
  ];

  it("shows customers who paid before their invoice under Customer deposits held, as the ledger served it", async () => {
    serve({ bs: (a) => bs(a, reclassedBody()) });
    show();
    const table = screen.getByTestId("balance-sheet");
    await within(table).findByRole("link", { name: "2210 Customer deposits held" });
    expect(lines(table)).toEqual([
      "Asset | RM 8,000.00",
      "Cash and bank | RM 6,000.00",
      "1120 Bank — current account | RM 6,000.00",
      "Receivables | RM 2,000.00",
      "1210 Trade receivables — customersLeaves out RM 2,815.00 that customers paid before their invoice. | RM 2,000.00",
      "Liability | RM 2,815.00",
      "2210 Customer deposits heldIncludes RM 2,815.00 from customers who paid before their invoice. | RM 2,815.00",
      "Equity | RM 5,185.00",
      "Net result not yet closed | RM 5,185.00",
    ]);
    expect(screen.queryByTestId("balance-sheet-differs")).not.toBeInTheDocument();
  });

  it("a reclassified amount that is not a number is refused as a whole", async () => {
    serve({ bs: (a) => bs(a, reclassedBody().map((r) => r.account_code === "2210" ? { ...r, reclassified: "lots" } : r)) });
    show();
    expect(await screen.findByTestId("balance-sheet-failed"))
      .toHaveTextContent("The balance sheet could not be loaded. Try again.");
  });

  it("opens each account in the Journal, narrowed to that account and the statement's dates", async () => {
    show();
    const plLink = await within(screen.getByTestId("profit-and-loss")).findByRole("link", { name: "4100 Furniture sales" });
    expect(plLink).toHaveAttribute("href", `/finance/ledger?account=4100&from=${FROM}&to=${TO}`);
    const bsTable = screen.getByTestId("balance-sheet");
    const bsLink = await within(bsTable).findByRole("link", { name: "1120 Bank — current account" });
    expect(bsLink).toHaveAttribute("href", `/finance/ledger?account=1120&from=${GO_LIVE}&to=${TODAY}`);
    // A header line is a subtotal, not an account: it opens nothing.
    expect(within(bsTable).queryByRole("link", { name: /Cash and bank/ })).not.toBeInTheDocument();
  });

  it("a chosen month reads the Profit and Loss for that whole month", async () => {
    show();
    await screen.findByTestId("reports-go-live");
    fireEvent.keyDown(screen.getByRole("combobox", { name: "Month" }), { key: "Enter" });
    fireEvent.click(await screen.findByRole("option", { name: fmtMonth(PREV) }));
    await waitFor(() => expect(api.fetch)
      .toHaveBeenCalledWith(`/api/finance/ledger/profit-and-loss?from=${PREV}-01&to=${lastDay(PREV)}`));
    const link = await within(screen.getByTestId("profit-and-loss")).findByRole("link", { name: "4100 Furniture sales" });
    expect(link).toHaveAttribute("href", `/finance/ledger?account=4100&from=${PREV}-01&to=${lastDay(PREV)}`);
  });

  it("a custom From reads the Profit and Loss from that day, and the month says so", async () => {
    show();
    await screen.findByTestId("reports-go-live");
    fireEvent.click(screen.getByRole("button", { name: "From" }));
    const day = screen.getAllByRole("gridcell").find((c) => c.textContent?.trim() === "15");
    fireEvent.click(day!.querySelector("button") ?? day!);
    await waitFor(() => expect(api.fetch)
      .toHaveBeenCalledWith(`/api/finance/ledger/profit-and-loss?from=${YM}-15&to=${TO}`));
    expect(screen.getByRole("combobox", { name: "Month" })).toHaveTextContent("Custom Date Range");
  });

  it("picking only Up to writes both dates into the address", async () => {
    show();
    await screen.findByTestId("reports-go-live");
    fireEvent.click(screen.getByRole("button", { name: "Up to" }));
    const day = screen.getAllByRole("gridcell").find((c) => c.textContent?.trim() === "15");
    fireEvent.click(day!.querySelector("button") ?? day!);
    await waitFor(() => expect(api.fetch)
      .toHaveBeenCalledWith(`/api/finance/ledger/profit-and-loss?from=${FROM}&to=${YM}-15`));
    const address = new URLSearchParams(screen.getByTestId("address").textContent ?? "");
    expect(address.get("from")).toBe(FROM);
    expect(address.get("to")).toBe(`${YM}-15`);
  });

  it("an Up to before From is read as From", async () => {
    show(`/finance/reports?from=${YM}-20&to=${YM}-05`);
    await waitFor(() => expect(api.fetch)
      .toHaveBeenCalledWith(`/api/finance/ledger/profit-and-loss?from=${YM}-20&to=${YM}-20`));
  });

  it("keeps the door to Reports → Payment", async () => {
    show();
    await screen.findByTestId("reports-go-live");
    expect(screen.getByTestId("reports-payment-door")).toHaveAttribute("href", "/finance/reports/payment");
  });

  it("prints none of the old invented figures and asks for none of the old reads", async () => {
    show();
    await within(screen.getByTestId("profit-and-loss")).findByRole("link", { name: "4100 Furniture sales" });
    const text = document.body.textContent ?? "";
    expect(text).not.toMatch(/55\s?%/);
    expect(text).not.toMatch(/42,?000/);
    for (const gone of [/Top SKUs/, /Net profit/, /Revenue trend/, /COGS/, /Opex/]) {
      expect(screen.queryByText(gone)).not.toBeInTheDocument();
    }
    const urls = api.fetch.mock.calls.map(([url]) => String(url));
    expect(urls.filter((u) => /monthly-pl|top-skus/.test(u))).toEqual([]);
  });
});

describe("Reports — when there is nothing, or no answer", () => {
  it("a period before the ledger started names the first day instead of totalling nothing", async () => {
    const early = `${shiftMonth(YM, -2)}-09`;
    const notice = { ordinal: 1, ...BLANK, row_kind: "NOTICE", report_status: "BEFORE_GO_LIVE", go_live_on: GO_LIVE };
    serve({
      pl: (from, to) => ({ rows: [{ ...notice, period_from: from, period_to: to }] }),
      bs: (asOf) => ({ rows: [{ ...notice, as_of: asOf, equation_balances: null, equation_difference: null }] }),
    });
    show(`/finance/reports?from=${shiftMonth(YM, -2)}-01&to=${early}&asOf=${early}`);
    const sentence = `The ledger started on ${fmtDate(GO_LIVE)}. Pick a day from then on.`;
    expect(await within(screen.getByTestId("profit-and-loss")).findByText(sentence)).toBeInTheDocument();
    expect(await within(screen.getByTestId("balance-sheet")).findByText(sentence)).toBeInTheDocument();
    expect(screen.queryByText(/RM /)).not.toBeInTheDocument();
  });

  it("a section with every account at RM 0.00 names what it has none of, and keeps the served totals", async () => {
    serve({ pl: (f, t) => pl(f, t, zero(PL_BODY)), bs: (a) => bs(a, zero(bsBody(0))) });
    show();
    const plTable = screen.getByTestId("profit-and-loss");
    await within(plTable).findByText("No income in this period.");
    expect(lines(plTable)).toEqual([
      "Income | RM 0.00",
      "No income in this period. |",
      "Expense | RM 0.00",
      "No expenses in this period. |",
      "Net result | RM 0.00",
    ]);
    const bsTable = screen.getByTestId("balance-sheet");
    await within(bsTable).findByText("No assets on this day.");
    expect(lines(bsTable)).toEqual([
      "Asset | RM 0.00",
      "No assets on this day. |",
      "Liability | RM 0.00",
      "No liabilities on this day. |",
      "Equity | RM 0.00",
      "No equity on this day. |",
    ]);
    expect(screen.queryByText(/Every account is at/)).not.toBeInTheDocument();
    expect(screen.queryByText(/No entries/)).not.toBeInTheDocument();
  });

  it("a section with nothing in it says so under its band", async () => {
    serve({ pl: (f, t) => pl(f, t, PL_BODY.map((r) => r.section === "EXPENSE" ? { ...r, amount: 0 }
      : r.row_kind === "NET" ? { ...r, amount: 12850 } : r)) });
    show();
    const table = screen.getByTestId("profit-and-loss");
    await within(table).findByRole("link", { name: "4100 Furniture sales" });
    expect(lines(table).slice(3)).toEqual([
      "Expense | RM 0.00",
      "No expenses in this period. |",
      "Net result | RM 12,850.00",
    ]);
  });

  it("raises the band only while the Balance Sheet does not balance", async () => {
    serve({ bs: (a) => bs(a, bsBody(25.5), { balances: false, difference: 25.5 }) });
    show();
    const band = await screen.findByTestId("balance-sheet-differs");
    expect(band).toHaveTextContent("Assets differ from liabilities plus equity by RM 25.50.");
    expect(within(band).getByRole("link", { name: "Open Self-check" })).toHaveAttribute("href", "/finance/ledger/self-check");
    // The band is the one place the difference prints: no second strip under the table.
    expect(within(screen.getByTestId("balance-sheet")).queryByText("Difference")).not.toBeInTheDocument();
  });

  it("a ledger with no start date says so once and prints no statement", async () => {
    const notStarted = () => { throw failure(409, "The ledger has no start date yet."); };
    serve({ pl: notStarted, bs: notStarted });
    show();
    expect(await screen.findByRole("alert")).toHaveTextContent("The ledger has no start date yet. Nothing can be totalled.");
    expect(screen.queryByText("Profit and Loss")).not.toBeInTheDocument();
    expect(screen.queryByText("Balance Sheet")).not.toBeInTheDocument();
    expect(screen.queryByText(/RM /)).not.toBeInTheDocument();
    expect(screen.getByTestId("reports-payment-door")).toBeInTheDocument();
  });

  it("a failed read says so with Try again and never a zero, and Try again reads again", async () => {
    let down = true;
    serve({ pl: (f, t) => { if (down) throw failure(500); return pl(f, t, PL_BODY); } });
    show();
    // One quiet retry first, then the sentence.
    const alert = await screen.findByTestId("profit-and-loss-failed");
    expect(alert).toHaveTextContent("The profit and loss could not be loaded. Try again.");
    expect(within(alert.closest("section")!).queryByText(/RM /)).not.toBeInTheDocument();
    expect(screen.queryByText("Net result")).not.toBeInTheDocument();
    // The Balance Sheet reads on its own.
    expect(await within(screen.getByTestId("balance-sheet")).findByRole("link", { name: "1120 Bank — current account" }))
      .toBeInTheDocument();
    down = false;
    fireEvent.click(within(alert).getByRole("button", { name: "Try again" }));
    const table = await screen.findByTestId("profit-and-loss");
    expect(await within(table).findByRole("link", { name: "4100 Furniture sales" })).toBeInTheDocument();
  });

  it.each<[string, (rows: Row[]) => Row[]]>([
    ["a section without its total", (rows) => rows.filter((r) => !(r.row_kind === "SECTION_TOTAL" && r.section === "EXPENSE"))],
    ["an account whose amount did not arrive", (rows) => rows.map((r) => r.account_code === "4100" ? { ...r, amount: null } : r)],
    ["a period other than the one asked for", (rows) => rows.map((r) => ({ ...r, period_to: "2020-01-31" }))],
    ["a second net result", (rows) => [...rows, { ...rows[rows.length - 1]!, ordinal: 99 }]],
    ["a row kind nobody knows", (rows) => [...rows, { ...rows[0]!, row_kind: "MYSTERY", ordinal: 99 }]],
  ])("%s is refused as a whole, not printed", async (_, spoil) => {
    serve({ pl: (f, t) => ({ rows: spoil(pl(f, t, PL_BODY).rows) }) });
    show();
    expect(await screen.findByTestId("profit-and-loss-failed"))
      .toHaveTextContent("The profit and loss could not be loaded. Try again.");
    expect(screen.queryByText("RM 12,500.00")).not.toBeInTheDocument();
    expect(screen.queryByText("Net result")).not.toBeInTheDocument();
  });

  it("a balance sheet whose check did not arrive is refused as a whole", async () => {
    serve({ bs: (a) => ({ rows: bs(a, bsBody(0)).rows.filter((r) => r.row_kind !== "EQUATION") }) });
    show();
    expect(await screen.findByTestId("balance-sheet-failed"))
      .toHaveTextContent("The balance sheet could not be loaded. Try again.");
    expect(screen.queryByText("RM 6,850.00")).not.toBeInTheDocument();
  });
});

describe("Reports words", () => {
  const here = dirname(fileURLToPath(import.meta.url));
  itSaysNoBannedWord(join(here, "FinanceReports.tsx"), { minStrings: 12, expectString: "No opening balances" });
  itSaysNoBannedWord(join(here, "reports", "StatementTable.tsx"), { minStrings: 3, expectString: "Net result not yet closed" });
});

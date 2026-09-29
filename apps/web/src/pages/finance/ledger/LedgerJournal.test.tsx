import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { itSaysNoBannedWord, visibleStrings } from "@/test/banned-words";
import LedgerJournal, { balanceWords } from "./LedgerJournal";
import { parseAccountBalances, readJournal } from "./ledger-queries";

const api = vi.hoisted(() => ({ fetch: vi.fn() }));
vi.mock("@/lib/api", () => ({ apiFetch: api.fetch }));
vi.mock("@/pages/operation/components/GlobalTopBar", () => ({ TopBarIcons: () => null }));
vi.mock("xlsx", () => ({ utils: { json_to_sheet: () => ({}), book_new: () => ({}), book_append_sheet: vi.fn() }, writeFile: vi.fn() }));

const base = {
  narration: null, reversed: false, reverses: null, reverses_entry_no: null,
  reversed_by: null, reversed_by_entry_no: null, created_at: "2026-09-10T02:00:00Z",
};
const E1 = { ...base, id: "e1", entry_no: "JE-202609-0003", entry_date: "2026-09-10", source_type: "SALES_INVOICE",
  source_doc_no: "INV-TEST-1", narration: "Invoice to a test customer", total_debit: 150, total_credit: 150 };
const E2 = { ...base, id: "e2", entry_no: "JE-202609-0004", entry_date: "2026-09-10", source_type: "SUPPLIER_BILL",
  source_doc_no: "SB-TEST-1", total_debit: 70, total_credit: 70, reversed: true, reversed_by: "e3",
  reversed_by_entry_no: "JE-202609-0005" };
const E3 = { ...base, id: "e3", entry_no: "JE-202609-0005", entry_date: "2026-09-11", source_type: "SUPPLIER_BILL_REVERSAL",
  source_doc_no: "SB-TEST-1", total_debit: 70, total_credit: 70, reverses: "e2", reverses_entry_no: "JE-202609-0004" };
const E4 = { ...base, id: "e4", entry_no: "JE-202609-0006", entry_date: "2026-09-11", source_type: "CUSTOMER_PAYMENT",
  source_doc_no: "0f3a9c2e-1111-4222-8333-444455556666", total_debit: 40, total_credit: 40 };
const E5 = { ...base, id: "e5", entry_no: "JE-202609-0007", entry_date: "2026-09-11", source_type: "SOMETHING_NEW",
  source_doc_no: "NEW-1", total_debit: 10, total_credit: 10 };
const ENTRIES = [E5, E4, E3, E2, E1];

const DETAIL = {
  entry: E1,
  lines: [
    { line_no: 1, account_code: "1210", account_name: "Trade receivables", debit: 150, credit: 0,
      party_type: "CUSTOMER", party_id: "c1", party_name: "Test Customer One", memo: null },
    { line_no: 2, account_code: "4100", account_name: "Sales", debit: 0, credit: 150,
      party_type: null, party_id: null, party_name: null, memo: "Sale of goods" },
  ],
  related: [],
};
const DETAIL_E3 = { entry: E3, lines: DETAIL.lines, related: [{ id: "e2", entry_no: "JE-202609-0004",
  entry_date: "2026-09-10", source_type: "SUPPLIER_BILL", reversed: true }] };

const CHART = { go_live_on: "2026-09-10", accounts: [
  { code: "1210", name: "Trade receivables", kind: "ASSET", parent_code: null, is_control: true,
    control_for: "CUSTOMER", is_active: true, is_header: false },
] };

function answer(url: string) {
  if (url.startsWith("/api/finance/ledger/entries?")) return Promise.resolve({ rows: ENTRIES, total: ENTRIES.length });
  if (url === "/api/finance/ledger/accounts") return Promise.resolve(CHART);
  if (url.endsWith("/entries/e1") || url.endsWith("/entries/JE-202609-0003")) return Promise.resolve(DETAIL);
  if (url.endsWith("/entries/JE-202609-0005")) return Promise.resolve(DETAIL_E3);
  return Promise.reject(Object.assign(new Error("No entry has that number."), { status: 404 }));
}

function Where() {
  const loc = useLocation();
  return <span data-testid="where">{loc.pathname}{loc.search}</span>;
}

function show(at = "/finance/ledger") {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>
    <MemoryRouter initialEntries={[at]}><LedgerJournal /><Where /></MemoryRouter>
  </QueryClientProvider>);
}

beforeEach(() => {
  api.fetch.mockReset();
  api.fetch.mockImplementation(answer);
  localStorage.clear();
});

describe("Journal", () => {
  it("lists every entry with its source in words, and says how many", async () => {
    show();
    expect(screen.getByTestId("journal-destination-header")).toBeInTheDocument();
    expect(await screen.findByText("JE-202609-0003")).toBeInTheDocument();
    const table = screen.getByRole("table");
    for (const label of ["Entry No", "Date", "Source", "Document", "Narration", "Amount", "Reversal"]) {
      expect(within(table).getAllByText(label).length).toBeGreaterThan(0);
    }
    expect(screen.getByText("Sales invoice")).toBeInTheDocument();
    expect(screen.getByText("Supplier bill reversal")).toBeInTheDocument();
    // A key the words do not know yet, and a payment posted under its row id.
    expect(screen.getByText("Other entry")).toBeInTheDocument();
    expect(screen.getByText("No document number")).toBeInTheDocument();
    expect(screen.queryByText(/SALES_INVOICE|SOMETHING_NEW|0f3a9c2e/)).not.toBeInTheDocument();
    expect(screen.queryByText(/\bPosted\b/)).not.toBeInTheDocument();
    expect(screen.getByTestId("journal-summary")).toHaveTextContent("5 entries");
  });

  it("links each half of a reversed pair to the other", async () => {
    show();
    await screen.findByText("JE-202609-0003");
    expect(screen.getByText("Reversed by")).toBeInTheDocument();
    expect(screen.getByText("Reverses")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("link", { name: "JE-202609-0005" }));
    expect(screen.getByTestId("where")).toHaveTextContent("/finance/ledger?entry=JE-202609-0005");
    expect(await screen.findByTestId("ledger-entry-reversal")).toHaveTextContent("Reverses JE-202609-0004");
    expect(screen.getByTestId("ledger-entry-related")).toHaveTextContent("JE-202609-0004");
  });

  it("expands a row to its lines, and opens the entry on its own page", async () => {
    show();
    await screen.findByText("JE-202609-0003");
    const rowCount = screen.getAllByTitle("Show lines").length;
    fireEvent.click(screen.getAllByTitle("Show lines")[rowCount - 1]);
    const lines = await screen.findByTestId("ledger-entry-lines");
    expect(within(lines).getByText("1210 Trade receivables")).toBeInTheDocument();
    expect(within(lines).getByText("Customer · Test Customer One")).toBeInTheDocument();
    expect(within(lines).getByText("No party")).toBeInTheDocument();
    expect(within(lines).getByText("Sale of goods")).toBeInTheDocument();
    expect(within(lines).getAllByText("RM 150.00").length).toBeGreaterThanOrEqual(2);
    expect(api.fetch).toHaveBeenCalledWith("/api/finance/ledger/entries/e1");
    fireEvent.click(screen.getByText("Open entry"));
    expect(screen.getByTestId("where")).toHaveTextContent("?entry=JE-202609-0003");
    expect(await screen.findByTestId("ledger-entry-scroll")).toBeInTheDocument();
    for (const title of ["Entry", "Lines"]) expect(screen.getByRole("heading", { name: title })).toBeInTheDocument();
  });

  it("opens straight from a pasted entry number", async () => {
    show("/finance/ledger?entry=JE-202609-0003");
    expect(await screen.findByTestId("ledger-entry-facts")).toHaveTextContent("Sales invoice · INV-TEST-1");
    expect(screen.getByTestId("object-identity")).toHaveTextContent("JE-202609-0003");
    expect(api.fetch).toHaveBeenCalledWith("/api/finance/ledger/entries/JE-202609-0003");
    // The register itself is not read to open one entry.
    expect(api.fetch.mock.calls.some(([u]) => String(u).startsWith("/api/finance/ledger/entries?"))).toBe(false);
    fireEvent.click(screen.getByRole("link", { name: "Journal" }));
    expect(screen.getByTestId("where")).toHaveTextContent(/^\/finance\/ledger$/);
  });

  it("says plainly when nobody has that entry number", async () => {
    show("/finance/ledger?entry=JE-209901-0001");
    expect(await screen.findByText("No entry has that number. Check it and try again.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Back to Journal" })).toBeInTheDocument();
  });

  it("narrows to one account over a period, and one control shows everything again", async () => {
    show("/finance/ledger?account=1210&from=2026-09-10&to=2026-09-11");
    await screen.findByText("JE-202609-0003");
    const asked = String(api.fetch.mock.calls.find(([u]) => String(u).startsWith("/api/finance/ledger/entries?"))?.[0]);
    expect(asked).toContain("account=1210");
    expect(asked).toContain("from=2026-09-10");
    expect(asked).toContain("to=2026-09-11");
    const scope = await screen.findByTestId("journal-scope");
    expect(scope).toHaveTextContent("1210 Trade receivables only");
    fireEvent.click(within(scope).getByRole("button", { name: "Show all entries" }));
    expect(screen.getByTestId("where")).toHaveTextContent(/^\/finance\/ledger$/);
  });

  it("a failed read says so and never shows an empty Journal", async () => {
    api.fetch.mockImplementation((url: string) => url.startsWith("/api/finance/ledger/entries?")
      ? Promise.reject(new Error("boom")) : answer(url));
    show();
    expect(await screen.findByRole("alert")).toHaveTextContent("The Journal could not be loaded. Try again.");
    expect(screen.queryByText(/No entries yet/)).not.toBeInTheDocument();
  });
});

describe("one account's running balance", () => {
  const line = (entry_no: string, entry_date: string, debit: number, credit: number, running_balance: number) =>
    ({ row_kind: "LINE", entry_no, entry_date, debit, credit, running_balance });
  // 1210 opens at RM 500.00 (everything before the read's first day), then
  // each line moves it. JE-0006 has two lines on 1210: its balance is after both.
  const LEDGER = {
    status: "OK", go_live_on: "2026-09-10", account_code: "1210", account_name: "Trade receivables", kind: "ASSET",
    rows: [
      { row_kind: "OPENING", running_balance: 500 },
      line("JE-202609-0003", "2026-09-10", 150, 0, 650),
      line("JE-202609-0004", "2026-09-10", 0, 70, 580),
      line("JE-202609-0005", "2026-09-11", 70, 0, 650),
      line("JE-202609-0006", "2026-09-11", 0, 600, 50),
      line("JE-202609-0006", "2026-09-11", 0, 100, -50),
      line("JE-202609-0007", "2026-09-11", 10, 0, -40),
      { row_kind: "CLOSING", debit: 230, credit: 770, running_balance: -40 },
    ],
  };
  // The server lists the Journal by date and then by when each entry was
  // made; the ledger counts by date and then entry number. Here the two differ.
  const withLedger = (url: string, ledger: object = LEDGER) => url.startsWith("/api/finance/ledger/account-ledger?")
    ? Promise.resolve(ledger)
    : url.startsWith("/api/finance/ledger/entries?") ? Promise.resolve({ rows: [E4, E5, E3, E1, E2], total: 5 })
    : answer(url);
  const ledgerAsked = () => api.fetch.mock.calls.map(([u]) => String(u))
    .filter((u) => u.startsWith("/api/finance/ledger/account-ledger?"));
  const balanceByEntry = () => Object.fromEntries(screen.getAllByRole("row")
    .map((r) => r.textContent ?? "")
    .map((t) => [t.match(/JE-\d{6}-\d{4}/)?.[0], t.match(/RM [\d,.]+ (Debit|Credit)|RM 0\.00$/)?.[0]])
    .filter(([no]) => no));

  it("shows the balance after every entry, counted from the opening balance, newest first", async () => {
    api.fetch.mockImplementation((u: string) => withLedger(u));
    show("/finance/ledger?account=1210");
    await screen.findByText("JE-202609-0003");
    expect(await screen.findByRole("columnheader", { name: "Running balance" })).toBeInTheDocument();
    // No dates picked: from the oldest entry shown to the newest. The opening
    // balance carries everything before the oldest.
    const asked = new URL(ledgerAsked()[0]!, "http://t").searchParams;
    expect(Object.fromEntries(asked)).toEqual({ account: "1210", from: "2026-09-10", to: "2026-09-11" });
    expect(balanceByEntry()).toEqual({
      "JE-202609-0007": "RM 40.00 Credit",
      "JE-202609-0006": "RM 50.00 Credit",
      "JE-202609-0005": "RM 650.00 Debit",
      "JE-202609-0004": "RM 580.00 Debit",
      "JE-202609-0003": "RM 650.00 Debit",
    });
    // Rows run in the ledger's order, so the figures follow on down the page.
    const order = screen.getAllByRole("row").map((r) => r.textContent?.match(/JE-\d{6}-\d{4}/)?.[0]).filter(Boolean);
    expect(order).toEqual(["JE-202609-0007", "JE-202609-0006", "JE-202609-0005", "JE-202609-0004", "JE-202609-0003"]);
  });

  it("puts a credit account's balance on the credit side, and the debit side when it turns", async () => {
    api.fetch.mockImplementation((u: string) => withLedger(u, { ...LEDGER, account_code: "2110", kind: "LIABILITY" }));
    show("/finance/ledger?account=2110");
    await screen.findByRole("columnheader", { name: "Running balance" });
    expect(balanceByEntry()).toEqual({
      "JE-202609-0007": "RM 40.00 Debit",
      "JE-202609-0006": "RM 50.00 Debit",
      "JE-202609-0005": "RM 650.00 Credit",
      "JE-202609-0004": "RM 580.00 Credit",
      "JE-202609-0003": "RM 650.00 Credit",
    });
  });

  it("reads the opening balance from the day picked, not from the page", async () => {
    api.fetch.mockImplementation((u: string) => withLedger(u));
    show("/finance/ledger?account=1210&from=2026-09-11&to=2026-09-30&dept=SHOWROOM");
    await screen.findByRole("columnheader", { name: "Running balance" });
    const asked = new URL(ledgerAsked()[0]!, "http://t").searchParams;
    expect(asked.get("from")).toBe("2026-09-11");
    expect(asked.get("to")).toBe("2026-09-30");
    expect(asked.get("departmentType")).toBe("SHOWROOM");
  });

  it("has no balance with every account in the list", async () => {
    api.fetch.mockImplementation((u: string) => withLedger(u));
    show();
    await screen.findByText("JE-202609-0003");
    expect(screen.queryByRole("columnheader", { name: "Running balance" })).not.toBeInTheDocument();
    expect(ledgerAsked()).toEqual([]);
  });

  it("hides the balance while another column sorts the rows", async () => {
    api.fetch.mockImplementation((u: string) => withLedger(u));
    show("/finance/ledger?account=1210");
    await screen.findByRole("columnheader", { name: "Running balance" });
    const amount = screen.getByRole("columnheader", { name: /Amount/ });
    fireEvent.click(within(amount).getByRole("button", { name: "Amount" }));
    await waitFor(() => expect(screen.queryByRole("columnheader", { name: "Running balance" })).not.toBeInTheDocument());
  });

  it("says so when the balances cannot be read, and shows no figure", async () => {
    api.fetch.mockImplementation((url: string) => url.startsWith("/api/finance/ledger/account-ledger?")
      ? Promise.reject(new Error("boom")) : answer(url));
    show("/finance/ledger?account=1210");
    expect(await screen.findByTestId("journal-balances-failed")).toHaveTextContent("The running balances could not be loaded. Try again.");
    expect(screen.queryByRole("columnheader", { name: "Running balance" })).not.toBeInTheDocument();
  });

  it("refuses an answer whose last line is not its closing balance", () => {
    const short = { ...LEDGER, rows: LEDGER.rows.filter((r) => r.running_balance !== -40 || r.row_kind === "CLOSING") };
    expect(() => parseAccountBalances(short, "1210")).toThrow("The running balances could not be loaded. Try again.");
    expect(() => parseAccountBalances({ ...LEDGER, account_code: "2110" }, "1210")).toThrow();
    expect(parseAccountBalances(LEDGER, "1210").after.get("JE-202609-0006")).toBe(-50);
  });

  it("puts a balance on the account's own side, and the other side when it turns", () => {
    expect(balanceWords("ASSET", 650)).toBe("RM 650.00 Debit");
    expect(balanceWords("EXPENSE", -5)).toBe("RM 5.00 Credit");
    expect(balanceWords("LIABILITY", 1200)).toBe("RM 1,200.00 Credit");
    expect(balanceWords("INCOME", 300)).toBe("RM 300.00 Credit");
    expect(balanceWords("EQUITY", -20)).toBe("RM 20.00 Debit");
    expect(balanceWords("LIABILITY", 0)).toBe("RM 0.00");
  });
});

describe("reading the whole Journal", () => {
  const rowsFor = (offset: number, n: number) => Array.from({ length: n }, (_, i) => ({ ...E1, id: `r${offset + i}` }));

  it("reads page after page until the server's count", async () => {
    api.fetch.mockImplementation((url: string) => {
      const offset = Number(new URL(url, "http://t").searchParams.get("offset"));
      return Promise.resolve({ rows: rowsFor(offset, Math.min(1000, 1500 - offset)), total: 1500 });
    });
    const read = await readJournal({ account: null, from: null, to: null });
    expect(read.rows).toHaveLength(1500);
    expect(read.capped).toBe(false);
    expect(api.fetch.mock.calls.map(([u]) => new URL(String(u), "http://t").searchParams.get("offset"))).toEqual(["0", "1000"]);
  });

  it("stops at ten pages and says the list is not whole", async () => {
    api.fetch.mockImplementation((url: string) => {
      const offset = Number(new URL(url, "http://t").searchParams.get("offset"));
      return Promise.resolve({ rows: rowsFor(offset, 1000), total: 12000 });
    });
    const read = await readJournal({ account: null, from: null, to: null });
    expect(read.rows).toHaveLength(10000);
    expect(read.capped).toBe(true);
  });

  it("fails closed when the Journal changes under the read", async () => {
    let call = 0;
    api.fetch.mockImplementation(() => {
      call += 1;
      return Promise.resolve({ rows: rowsFor(call * 1000, 1000), total: call === 1 ? 1500 : 1501 });
    });
    await expect(readJournal({ account: null, from: null, to: null })).rejects.toThrow("The Journal changed while it loaded. Try again.");
  });

  it("the capped band appears only while the list is not whole", async () => {
    api.fetch.mockImplementation((url: string) => url.startsWith("/api/finance/ledger/entries?")
      ? Promise.resolve({ rows: ENTRIES, total: ENTRIES.length }) : answer(url));
    show();
    await screen.findByText("JE-202609-0003");
    await waitFor(() => expect(screen.queryByTestId("journal-capped")).not.toBeInTheDocument());
  });
});

describe("Journal words", () => {
  const here = dirname(fileURLToPath(import.meta.url));
  const files = ["LedgerJournal.tsx", "LedgerEntryParts.tsx"].map((f) => join(here, f));
  itSaysNoBannedWord(files[0], { minStrings: 10, expectString: "Show all entries" });
  itSaysNoBannedWord(files[1], { minStrings: 5, expectString: "No party" });
  it("never prints the database's own state words", () => {
    for (const f of files) {
      expect(visibleStrings(readFileSync(f, "utf8")).filter((s) => /\b(Posted|Voided|POSTED|VOIDED)\b/.test(s))).toEqual([]);
    }
  });
});

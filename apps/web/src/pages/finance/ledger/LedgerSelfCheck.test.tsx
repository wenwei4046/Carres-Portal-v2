import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { itSaysNoBannedWord } from "@/test/banned-words";
import LedgerSelfCheck from "./LedgerSelfCheck";

const api = vi.hoisted(() => ({ fetch: vi.fn() }));
vi.mock("@/lib/api", () => ({ apiFetch: api.fetch }));
vi.mock("@/pages/operation/components/GlobalTopBar", () => ({ TopBarIcons: () => null }));

const control = (code: string, name: string, kind: string, controlFor: string, extra: object = {}) => ({
  account_code: code, account_name: name, kind, control_for: controlFor, is_active: true,
  total_debit: 0, total_credit: 0, natural_balance: 0, line_count: 0, party_count: 0,
  open_parties: [], open_party_count: 0, findings: [], ...extra,
});

const CLEAN = {
  checked_at: "2026-09-11T02:00:00Z",
  go_live_on: "2026-09-10",
  books: { ok: true, total_debit: 315, total_credit: 315, difference: 0, entry_count: 6, line_count: 10,
    header_mismatch_count: 0, balanced: true },
  controls: { ok: true, accounts: [
    control("1210", "Trade receivables", "ASSET", "CUSTOMER",
      { total_debit: 100, total_credit: 40, natural_balance: 60, line_count: 2, party_count: 1 }),
    // An account another build adds later arrives as data, not code.
    control("1240", "Other debtors", "ASSET", "OTHER"),
  ] },
  receivables: { ok: true, account_code: "1210", comparable: true, ledger_started: true, ledger_total: 60,
    documents_total: 60, difference: 0, unposted_invoice_count: 0, unposted_invoice_amount: 0,
    storage_uncollected: 0, pre_go_live_open_count: 0, pre_go_live_open_amount: 0 },
  payables: { ok: true, account_codes: ["2110"], ledger_total: 30, bills_total: 30, difference: 0,
    suppliers: [], supplier_difference_count: 0 },
  rentals: { ok: true, months: [], month_count: 0, amount: 0 },
  health: { ok: true, rows: [
    { ordinal: 1, check_key: "overall", check_label: "Overall", status: "PASS", count_value: 0, amount_value: null, date_value: null },
    { ordinal: 2, check_key: "debits_equal_credits", check_label: "x", status: "OK", count_value: 0, amount_value: 0, date_value: null },
    { ordinal: 8, check_key: "go_live_on", check_label: "x", status: "INFO", count_value: null, amount_value: null, date_value: "2026-09-10" },
    { ordinal: 12, check_key: "a_check_from_later", check_label: "Some database label", status: "OK", count_value: 0, amount_value: null, date_value: null },
  ] },
};

function show() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>
    <MemoryRouter initialEntries={["/finance/ledger/self-check"]}><LedgerSelfCheck /></MemoryRouter>
  </QueryClientProvider>);
}

beforeEach(() => {
  api.fetch.mockReset();
  api.fetch.mockResolvedValue(CLEAN);
});

describe("Self-check", () => {
  it("grades every section, one card per control account", async () => {
    show();
    expect(screen.getByTestId("self-check-destination-header")).toBeInTheDocument();
    const books = await screen.findByTestId("self-check-books");
    expect(books).toHaveTextContent("Clean");
    expect(books).toHaveTextContent("Debits equal credits: RM 315.00 on each side.");
    expect(screen.getByTestId("self-check-control-1210")).toHaveTextContent(
      "Every line names who it belongs to. Customers owe Carres RM 60.00.");
    expect(screen.getByTestId("self-check-control-1240")).toHaveTextContent("This account has no entries yet.");
    expect(screen.getByTestId("self-check-receivables")).toHaveTextContent("customers owe RM 60.00");
    expect(screen.getByTestId("self-check-payables")).toHaveTextContent("Carres owes suppliers RM 30.00");
    expect(screen.getByTestId("self-check-rentals")).toHaveTextContent("Every rental month collected since the ledger started has its entry.");
    expect(screen.getByTestId("health-go_live_on")).toHaveTextContent("It holds no opening balances.");
    // A check the words do not know prints a plain title, never the database's label.
    expect(screen.getByTestId("health-a_check_from_later")).toHaveTextContent("Other ledger check");
    expect(screen.queryByText("Some database label")).not.toBeInTheDocument();
    expect(screen.queryByText(/findings?$/)).not.toBeInTheDocument();
    expect(screen.getByTestId("self-check-checked-at")).toHaveTextContent("Checked");
  });

  it("names each finding and links its entries to the Journal", async () => {
    api.fetch.mockResolvedValue({ ...CLEAN, controls: { ok: true, accounts: [
      control("2110", "Trade payables", "LIABILITY", "SUPPLIER", {
        total_debit: 70, total_credit: 105, natural_balance: 35, line_count: 4, party_count: 1,
        findings: [{ kind: "no_party", party_type: null, party_name: null, total_debit: 0, total_credit: 5,
          line_count: 1, entry_nos: ["JE-202609-0009"] }],
      }),
    ] }, rentals: { ok: true, month_count: 1, amount: 120.5,
      months: [{ agreement_no: "RA-9001", seq: 3, paid_on: "2026-09-10", paid_amount: 120.5, doc_no: "RA-9001-M03" }] } });
    show();
    const card = await screen.findByTestId("self-check-control-2110");
    expect(within(card).getByText("1 finding")).toBeInTheDocument();
    expect(card).toHaveTextContent("1 line for RM 5.00 names nobody.");
    expect(within(card).getByRole("link", { name: "JE-202609-0009" })).toHaveAttribute("href", "/finance/ledger?entry=JE-202609-0009");
    const rentals = screen.getByTestId("self-check-rentals");
    expect(rentals).toHaveTextContent("1 rental month was collected with no ledger entry: RM 120.50.");
    expect(rentals).toHaveTextContent("RA-9001-M03");
  });

  it("a section that could not be read says Not checked, never a zero", async () => {
    api.fetch.mockResolvedValue({ ...CLEAN,
      payables: { ok: false, message: "Supplier payables could not be checked. Try again." },
      rentals: { ok: false, message: "Rental months are not checked on this server yet." } });
    show();
    const payables = await screen.findByTestId("self-check-payables");
    expect(within(payables).getByText("Not checked")).toBeInTheDocument();
    expect(payables).toHaveTextContent("Supplier payables could not be checked. Try again.");
    expect(payables).not.toHaveTextContent("RM 0.00");
    expect(screen.getByTestId("self-check-rentals")).toHaveTextContent("Rental months are not checked on this server yet.");
  });

  it("a failed read says so, and Check again asks again", async () => {
    api.fetch.mockRejectedValueOnce(new Error("boom"));
    show();
    expect(await screen.findByRole("alert")).toHaveTextContent("The Self-check could not be loaded. Try again.");
    fireEvent.click(screen.getByRole("button", { name: "Check again" }));
    expect(await screen.findByTestId("self-check-books")).toBeInTheDocument();
    await waitFor(() => expect(api.fetch).toHaveBeenCalledTimes(2));
    expect(api.fetch).toHaveBeenCalledWith("/api/finance/ledger/self-check");
  });
});

describe("Self-check words", () => {
  itSaysNoBannedWord(join(dirname(fileURLToPath(import.meta.url)), "LedgerSelfCheck.tsx"),
    { minStrings: 10, expectString: "Check again" });
});

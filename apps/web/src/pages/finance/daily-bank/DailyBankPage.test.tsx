import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { itSaysNoBannedWord } from "@/test/banned-words";
import DailyBankPage, { dailyBankDetails } from "./DailyBankPage";

/* Finance → Bank & Cards → Daily Bank (0637; Chew 2026-10-03). The one read is
   answered by URL; names and figures are invented. */
const api = vi.hoisted(() => ({
  days: {} as Record<string, unknown>,
  calls: [] as string[],
  fail: null as null | { status: number },
}));
vi.mock("@/lib/api", () => ({
  apiFetch: vi.fn(async (url: string) => {
    api.calls.push(url);
    if (api.fail) throw Object.assign(new Error("boom"), { status: api.fail.status, body: {} });
    const day = new URL(url, "http://t").searchParams.get("day") ?? "";
    if (!(day in api.days)) throw new Error(`unexpected read ${url}`);
    return api.days[day];
  }),
  ApiError: class ApiError extends Error {},
}));
vi.mock("@/pages/operation/components/GlobalTopBar", () => ({ TopBarIcons: () => null }));
vi.mock("@/lib/fmt-date", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/fmt-date")>()),
  appTodayIso: () => "2026-10-03",
}));

const SOFA = "11111111-1111-4111-8111-111111111111";
const VOUCHER = "22222222-2222-4222-8222-222222222222";

const account = (over: Record<string, unknown>) => ({
  account_code: "1122", name: "Maybank", money_kind: "BANK", is_active: true,
  brought_forward: "0.00", received: "0.00", paid: "0.00", pending: "0.00",
  pending_vouchers: [], lines: [], ...over,
});

const DAY = {
  day: "2026-10-03",
  go_live_on: "2026-09-01",
  accounts: [
    account({ account_code: "1110", name: "Cash in hand", money_kind: "CASH", brought_forward: "500.00", received: "120.00",
      lines: [{ entry_no: "JE-202610-0004", source_type: "CUSTOMER_PAYMENT", source_doc_no: "OR-2610-001",
        description: "Deposit", party_type: "CUSTOMER", party_name: "Tan Mei Ling", received: "120.00", paid: "0.00" }] }),
    account({ brought_forward: "10000.00", paid: "1200.00", pending: "800.00",
      pending_vouchers: [{ voucher_id: VOUCHER, voucher_no: "PV-2610-0007", supplier_id: SOFA, payee_name: "Lumen Sofa Works",
        voucher_date: "2026-10-02", purpose: "SUPPLIER_BILLS", narration: null, amount: "800.00" }],
      lines: [{ entry_no: "JE-202610-0005", source_type: "PAYMENT_VOUCHER", source_doc_no: "PV-2610-0006",
        description: null, party_type: "SUPPLIER", party_name: "Lumen Sofa Works", received: "0.00", paid: "1200.00" }] }),
    account({ account_code: "1131", name: "GHL", money_kind: "HOLDING", brought_forward: "640.00", received: "360.00" }),
    // Retired and empty: it leaves the board.
    account({ account_code: "1124", name: "RHB", is_active: false }),
  ],
};

beforeEach(() => {
  api.days = { "2026-10-03": DAY, "2026-10-02": { ...DAY, day: "2026-10-02" }, "2026-10-04": { ...DAY, day: "2026-10-04" } };
  api.calls = [];
  api.fail = null;
  localStorage.clear();
});

function Where() {
  const l = useLocation();
  return <span data-testid="where">{l.pathname}{l.search}</span>;
}

function show(at = "/finance/daily-bank") {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[at]}>
        <Routes>
          <Route path="/finance/daily-bank" element={<><DailyBankPage /><Where /></>} />
          <Route path="*" element={<Where />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const row = (code: string) => screen.getByTestId(`daily-bank-row-${code}`);

describe("Daily Bank (0637)", () => {
  it("reads today in Malaysia when no day is asked", async () => {
    show();
    await screen.findByTestId("daily-bank-row-1122");
    expect(api.calls[0]).toBe("/api/finance/ledger/daily-bank?day=2026-10-03");
  });

  it("prints each account's day: brought forward, money in and out, balance, waiting and what is left to pay", async () => {
    show();
    await screen.findByTestId("daily-bank-row-1122");
    const bank = row("1122");
    expect(bank).toHaveTextContent("1122 Maybank");
    expect(bank).toHaveTextContent("RM 10,000.00"); // brought forward
    expect(bank).toHaveTextContent("RM 1,200.00"); // out
    expect(bank).toHaveTextContent("RM 8,800.00"); // balance
    expect(bank).toHaveTextContent("RM 800.00"); // waiting
    expect(bank).toHaveTextContent("RM 8,000.00"); // available to pay
    expect(row("1110")).toHaveTextContent("RM 620.00");
  });

  it("card and online money waits for its payout: never available to pay, never waiting for approval", async () => {
    show();
    await screen.findByTestId("daily-bank-row-1131");
    const ghl = row("1131");
    // Balance and waiting for card payout are the same RM 1,000.00; available to pay is empty.
    expect(within(ghl).getAllByText("RM 1,000.00")).toHaveLength(2);
  });

  it("a retired account with nothing in it leaves the board", async () => {
    show();
    await screen.findByTestId("daily-bank-row-1122");
    expect(screen.queryByTestId("daily-bank-row-1124")).not.toBeInTheDocument();
    expect(screen.getByTestId("daily-bank-summary")).toHaveTextContent("3 accounts");
  });

  it("the totals are the grid's footer: what can pay, what waits for approval, what waits for a card payout", async () => {
    show();
    await screen.findByTestId("daily-bank-row-1122");
    // Available to pay: 620 + 8,000. Waiting for approval: 800. Waiting for card payout: 1,000.
    expect(screen.getAllByText("RM 8,620.00").length).toBeGreaterThan(0);
    expect(screen.getAllByText("RM 800.00").length).toBeGreaterThan(1);
  });

  it("says the figures count from the ledger's start", async () => {
    show();
    expect(await screen.findByTestId("daily-bank-go-live")).toHaveTextContent("Since Tue, 1 Sep · No opening balances");
    expect(screen.queryByTestId("daily-bank-waiting-now")).not.toBeInTheDocument();
  });

  it("steps a day back and forward, and Today comes home", async () => {
    show();
    await screen.findByTestId("daily-bank-row-1122");
    expect(screen.getByRole("button", { name: "Today" })).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "Previous day" }));
    await waitFor(() => expect(screen.getByTestId("where")).toHaveTextContent("/finance/daily-bank?day=2026-10-02"));
    await waitFor(() => expect(api.calls).toContain("/api/finance/ledger/daily-bank?day=2026-10-02"));
    expect(await screen.findByTestId("daily-bank-waiting-now")).toHaveTextContent(
      "Waiting for approval shows the vouchers still waiting now.",
    );

    fireEvent.click(screen.getByRole("button", { name: "Today" }));
    await waitFor(() => expect(screen.getByTestId("where")).toHaveTextContent(/^\/finance\/daily-bank$/));

    fireEvent.click(screen.getByRole("button", { name: "Next day" }));
    await waitFor(() => expect(api.calls).toContain("/api/finance/ledger/daily-bank?day=2026-10-04"));
  });

  it("a day before the ledger started says so instead of printing zeros", async () => {
    api.days["2026-08-31"] = { ...DAY, day: "2026-08-31" };
    show("/finance/daily-bank?day=2026-08-31");
    expect(await screen.findByText("The ledger started on Tue, 1 Sep. Pick a day from then on.")).toBeInTheDocument();
    expect(screen.queryByTestId("daily-bank-row-1122")).not.toBeInTheDocument();
  });

  it("a failed read shows the fix and never a zero", async () => {
    api.fail = { status: 500 };
    show();
    expect(await screen.findByRole("alert")).toHaveTextContent("Daily Bank could not be loaded. Try again.");
    expect(screen.queryByText(/RM 0\.00/)).not.toBeInTheDocument();
  });

  it("a ledger with no start date says so", async () => {
    api.fail = { status: 409 };
    show();
    expect(await screen.findByRole("alert")).toHaveTextContent("The ledger has no start date yet. Nothing can be totalled.");
  });

  it("a figure it cannot read refuses the whole board instead of printing part of it", async () => {
    api.days["2026-10-03"] = { ...DAY, accounts: [account({ received: "abc" })] };
    show();
    expect(await screen.findByRole("alert")).toHaveTextContent("Daily Bank could not be loaded. Try again.");
  });

  it("opening an account lists the day's entries and the vouchers waiting, totalled", async () => {
    show();
    await screen.findByTestId("daily-bank-row-1122");
    fireEvent.click(within(row("1122")).getByRole("button", { name: "Expand row" }));
    const open = await screen.findByTestId("daily-bank-expansion-1122");
    expect(open).toHaveTextContent("JE-202610-0005");
    expect(open).toHaveTextContent("Supplier · Lumen Sofa Works");
    expect(open).toHaveTextContent("PV-2610-0007");
    expect(open).toHaveTextContent("Pay supplier bills");
    expect(within(open).getByRole("link", { name: "PV-2610-0007" })).toHaveAttribute("href", `/finance/payment-vouchers/${VOUCHER}`);
    expect(within(open).getByRole("link", { name: "JE-202610-0005" })).toHaveAttribute("href", "/finance/ledger?entry=JE-202610-0005");
  });

  it("an account name opens the Journal on that account and that day", async () => {
    show();
    await screen.findByTestId("daily-bank-row-1122");
    expect(within(row("1122")).getByRole("link", { name: "1122 Maybank" })).toHaveAttribute(
      "href", "/finance/ledger?account=1122&from=2026-10-03&to=2026-10-03",
    );
  });
});

describe("the documents behind one account's figures", () => {
  it("a holding account never lists a voucher, even if one arrives", () => {
    const d = dailyBankDetails(account({ money_kind: "HOLDING", pending_vouchers: [{ voucher_id: VOUCHER, voucher_no: null,
      supplier_id: null, payee_name: "Nobody", voucher_date: "2026-10-03", purpose: "DIRECT", narration: null, amount: "1.00" }] }) as never);
    expect(d).toEqual([]);
  });

  it("names a party in words and a voucher's purpose when it has no note", () => {
    const [entry, waiting] = dailyBankDetails(DAY.accounts[1] as never);
    expect(entry).toMatchObject({ source: "Payment voucher", party: "Supplier · Lumen Sofa Works", description: "No memo", outflow: 1200 });
    expect(waiting).toMatchObject({ entryNo: null, party: "Supplier · Lumen Sofa Works", description: "Pay supplier bills", waiting: 800 });
  });
});

describe("no banned word reaches the screen", () => {
  itSaysNoBannedWord(join(dirname(fileURLToPath(import.meta.url)), "DailyBankPage.tsx"), { minStrings: 20, expectString: "Daily Bank could not be loaded. Try again." });
});

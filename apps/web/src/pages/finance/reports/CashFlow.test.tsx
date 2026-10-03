import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { cashFlowReport, type CashFlowAnswer } from "@carres/shared/cash-flow";
import { itSaysNoBannedWord } from "@/test/banned-words";
import CashFlow, { cashFlowLineWord, cashFlowSheet } from "./CashFlow";

/* Finance → Reports → Cash Flow (0638; Chew 2026-10-03). The one read is
   answered by URL; names and figures are invented. */
const api = vi.hoisted(() => ({
  answer: null as unknown,
  calls: [] as string[],
  fail: null as null | { status: number },
}));
vi.mock("@/lib/api", () => ({
  apiFetch: vi.fn(async (url: string) => {
    api.calls.push(url);
    if (api.fail) throw Object.assign(new Error("boom"), { status: api.fail.status, body: {} });
    if (!url.startsWith("/api/finance/ledger/cash-flow?")) throw new Error(`unexpected read ${url}`);
    const q = new URL(url, "http://t").searchParams;
    return { ...(api.answer as object), from: q.get("from"), to: q.get("to") };
  }),
  ApiError: class ApiError extends Error {},
}));
vi.mock("@/pages/operation/components/GlobalTopBar", () => ({ TopBarIcons: () => null }));
vi.mock("@/lib/fmt-date", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/fmt-date")>()),
  appTodayIso: () => "2026-10-03",
}));

const ANSWER: CashFlowAnswer = {
  from: "2026-10-01",
  to: "2026-10-31",
  go_live_on: "2026-09-01",
  accounts: [
    { account_code: "1110", name: "Cash in hand", money_kind: "CASH", is_active: true, opening: "500.00", receipts: "300.00", payments: "400.00" },
    { account_code: "1121", name: "Public Bank", money_kind: "BANK", is_active: true, opening: "10000.00", receipts: "6497.50", payments: "1300.00" },
  ],
  rows: [
    { side: "IN", account_code: "1210", name: "Trade receivables", kind: "ASSET", money_kind: null, amount: "6000.00" },
    { side: "IN", account_code: "1131", name: "GHL", kind: "ASSET", money_kind: "HOLDING", amount: "397.50" },
    { side: "IN", account_code: "1110", name: "Cash in hand", kind: "ASSET", money_kind: "CASH", amount: "400.00" },
    { side: "OUT", account_code: "2110", name: "Trade payables", kind: "LIABILITY", money_kind: null, amount: "1200.00" },
    { side: "OUT", account_code: "1121", name: "Public Bank", kind: "ASSET", money_kind: "BANK", amount: "400.00" },
    { side: "OUT", account_code: "6800", name: "Electricity", kind: "EXPENSE", money_kind: null, amount: "100.00" },
  ],
  card: { taken: "2150.00", waiting: "1752.50" },
};

beforeEach(() => {
  api.answer = ANSWER;
  api.calls = [];
  api.fail = null;
});

function Where() {
  const l = useLocation();
  return <span data-testid="where">{l.search}</span>;
}

function show(at = "/finance/reports/cash-flow") {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[at]}>
        <Routes>
          <Route path="/finance/reports/cash-flow" element={<><CashFlow /><Where /></>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("Cash Flow (0638)", () => {
  it("reads this month when no period is asked", async () => {
    show();
    await screen.findByTestId("cash-flow");
    expect(api.calls[0]).toBe("/api/finance/ledger/cash-flow?from=2026-10-01&to=2026-10-31");
  });

  it("files the money under what it was for, with transfers and card payouts named", async () => {
    show();
    const table = await screen.findByTestId("cash-flow");
    expect(table).toHaveTextContent("1210 Trade receivables");
    expect(table).toHaveTextContent("Card payout from 1131 GHL");
    expect(table).toHaveTextContent("Transfer from 1110 Cash in hand");
    expect(table).toHaveTextContent("Transfer to 1121 Public Bank");
    expect(table).toHaveTextContent("Inflow");
    expect(table).toHaveTextContent("RM 6,797.50");
    expect(table).toHaveTextContent("Outflow");
    expect(table).toHaveTextContent("RM 1,700.00");
    expect(table).toHaveTextContent("Net cash flow");
    expect(table).toHaveTextContent("RM 5,097.50");
  });

  it("each line opens the Journal on that account for the period", async () => {
    show("/finance/reports/cash-flow?from=2026-10-01&to=2026-10-15");
    const table = await screen.findByTestId("cash-flow");
    expect(within(table).getByRole("link", { name: "1210 Trade receivables" })).toHaveAttribute(
      "href", "/finance/ledger?account=1210&from=2026-10-01&to=2026-10-15",
    );
  });

  it("carries the balances forward, and says what card money is paid and still waiting", async () => {
    show();
    const block = await screen.findByLabelText("Cash and bank balances");
    expect(block).toHaveTextContent("Brought forwardRM 10,500.00");
    expect(block).toHaveTextContent("Carried forwardRM 15,597.50");
    expect(block).toHaveTextContent("Card and online payments in this periodRM 2,150.00");
    expect(block).toHaveTextContent("Waiting for card payout at the endRM 1,752.50");
  });

  it("lists each cash and bank account with its own figures and their total", async () => {
    show();
    const accounts = await screen.findByTestId("cash-flow-accounts");
    expect(accounts).toHaveTextContent("1121 Public Bank");
    expect(accounts).toHaveTextContent("RM 15,197.50");
    expect(accounts).toHaveTextContent("Total");
    expect(accounts).toHaveTextContent("RM 15,597.50");
  });

  it("an empty side says so in words", async () => {
    api.answer = { ...ANSWER, accounts: [{ ...ANSWER.accounts[0], receipts: 0, payments: 0 }], rows: [] };
    show();
    expect(await screen.findByText("No money came into the cash and bank accounts in this period.")).toBeInTheDocument();
    expect(screen.getByText("No money went out of the cash and bank accounts in this period.")).toBeInTheDocument();
  });

  it("picks a whole month, and keeps the period in the address", async () => {
    show();
    await screen.findByTestId("cash-flow");
    expect(screen.getByTestId("cash-flow-go-live")).toHaveTextContent("Since Tue, 1 Sep · No opening balances");
    fireEvent.keyDown(screen.getByRole("combobox", { name: "Month" }), { key: "Enter" });
    fireEvent.click(await screen.findByRole("option", { name: "Sep 2026" }));
    await waitFor(() => expect(screen.getByTestId("where")).toHaveTextContent("from=2026-09-01&to=2026-09-30"));
    await waitFor(() => expect(api.calls).toContain("/api/finance/ledger/cash-flow?from=2026-09-01&to=2026-09-30"));
  });

  it("a period before the ledger started says so instead of printing zeros", async () => {
    show("/finance/reports/cash-flow?from=2026-08-01&to=2026-08-31");
    expect(await screen.findByTestId("cash-flow-before-start")).toHaveTextContent("The ledger started on Tue, 1 Sep. Pick a day from then on.");
    expect(screen.queryByTestId("cash-flow")).not.toBeInTheDocument();
  });

  it("a failed read, and an answer that does not add up, show the fix and never a zero", async () => {
    api.fail = { status: 500 };
    const { unmount } = show();
    expect(await screen.findByRole("alert")).toHaveTextContent("Cash Flow could not be loaded. Try again.");
    unmount();
    api.fail = null;
    api.answer = { ...ANSWER, rows: ANSWER.rows.slice(1) };
    show();
    expect(await screen.findByRole("alert")).toHaveTextContent("Cash Flow could not be loaded. Try again.");
    expect(screen.queryByText(/RM 0\.00/)).not.toBeInTheDocument();
  });

  it("a ledger with no start date says so", async () => {
    api.answer = { ...ANSWER, go_live_on: null };
    show();
    expect(await screen.findByRole("alert")).toHaveTextContent("The ledger has no start date yet. Nothing can be totalled.");
  });
});

describe("the Cash Flow sheet", () => {
  it("writes the statement the page shows, in the Profit and Loss's export shape", () => {
    const { sheet, stem } = cashFlowSheet(cashFlowReport(ANSWER), "2026-10-01", "2026-10-31", "2026-09-01");
    expect(stem).toBe("Cash Flow Oct 2026");
    expect(sheet.name).toBe("Cash Flow");
    expect(sheet.rows.slice(0, 4)).toEqual([
      ["Cash Flow", "Thu, 1 Oct 26 to Sat, 31 Oct 26"], ["Since Tue, 1 Sep 26 · No opening balances"], [], ["Account", "Amount"],
    ]);
    expect(sheet.rows).toContainEqual(["Inflow", 6797.5]);
    expect(sheet.rows).toContainEqual(["Card payout from 1131 GHL", 397.5]);
    expect(sheet.rows).toContainEqual(["Carried forward", 15597.5]);
  });

  it("names a line in words", () => {
    const base = { key: "k", code: "1121", name: "Public Bank", amount: 1, transfer: false, holding: false } as const;
    expect(cashFlowLineWord({ ...base, side: "IN" })).toBe("1121 Public Bank");
    expect(cashFlowLineWord({ ...base, side: "OUT", transfer: true })).toBe("Transfer to 1121 Public Bank");
    expect(cashFlowLineWord({ ...base, side: "IN", holding: true, code: "1131", name: "GHL" })).toBe("Card payout from 1131 GHL");
  });
});

describe("no banned word reaches the screen", () => {
  itSaysNoBannedWord(join(dirname(fileURLToPath(import.meta.url)), "CashFlow.tsx"), { minStrings: 20, expectString: "Net cash flow" });
});

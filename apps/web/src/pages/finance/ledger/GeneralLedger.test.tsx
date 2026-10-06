import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { generalLedgerBlocks, type GeneralLedgerAnswer, type GeneralLedgerWireRow } from "@carres/shared/general-ledger";
import { itSaysNoBannedWord } from "@/test/banned-words";
import GeneralLedger, { generalLedgerSheet } from "./GeneralLedger";

/* Finance → Ledger → General Ledger (0639; Chew 2026-10-03). The reads are
   answered by URL; names and figures are invented. */
const api = vi.hoisted(() => ({
  answer: null as unknown,
  calls: [] as string[],
  fail: null as null | { status: number },
}));
vi.mock("@/lib/api", () => ({
  apiFetch: vi.fn(async (url: string) => {
    api.calls.push(url);
    if (url.startsWith("/api/finance/ledger/departments")) return [];
    if (api.fail) throw Object.assign(new Error("boom"), { status: api.fail.status, body: {} });
    if (!url.startsWith("/api/finance/ledger/general-ledger?")) throw new Error(`unexpected read ${url}`);
    return api.answer;
  }),
  ApiError: class ApiError extends Error {},
}));
vi.mock("@/pages/operation/components/GlobalTopBar", () => ({ TopBarIcons: () => null }));
vi.mock("@/lib/fmt-date", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/fmt-date")>()),
  appTodayIso: () => "2026-10-03",
}));

const row = (over: Partial<GeneralLedgerWireRow>): GeneralLedgerWireRow => ({
  row_kind: "LINE", account_code: "1121", account_name: "Public Bank", kind: "ASSET",
  entry_date: "2026-10-02", entry_no: "JE-202610-0001", source_type: "CUSTOMER_PAYMENT", source_doc_no: "OR-2610-0001",
  narration: "Deposit", memo: null, debit: 0, credit: 0, running_balance: 0, ...over,
});
const edge = (kind: "OPENING" | "CLOSING", over: Partial<GeneralLedgerWireRow>) =>
  row({ row_kind: kind, entry_date: null, entry_no: null, source_type: null, source_doc_no: null, debit: null, credit: null, ...over });

const ANSWER: GeneralLedgerAnswer = {
  status: "OK", go_live_on: "2026-09-01", from: "2026-10-01", to: "2026-10-31",
  accounts: [
    { account_code: "1121", rows: [
      edge("OPENING", { running_balance: 1000 }),
      row({ debit: 250.5, running_balance: 1250.5 }),
      row({ entry_no: "JE-202610-0002", source_type: "PAYMENT_VOUCHER", source_doc_no: "PV-2610-0003", memo: "Lumen sofa bills", credit: 1500, running_balance: -249.5 }),
      edge("CLOSING", { running_balance: -249.5 }),
    ] },
    { account_code: "2110", rows: [
      edge("OPENING", { account_code: "2110", account_name: "Trade payables", kind: "LIABILITY", running_balance: 1500 }),
      row({ account_code: "2110", account_name: "Trade payables", kind: "LIABILITY", entry_no: "JE-202610-0002",
        source_type: "PAYMENT_VOUCHER", source_doc_no: "PV-2610-0003", debit: 1500, running_balance: 0 }),
      edge("CLOSING", { account_code: "2110", account_name: "Trade payables", kind: "LIABILITY", running_balance: 0 }),
    ] },
  ],
};

beforeEach(() => {
  api.answer = ANSWER;
  api.calls = [];
  api.fail = null;
});

function show(at = "/finance/ledger/general-ledger") {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[at]}>
        <Routes><Route path="/finance/ledger/general-ledger" element={<GeneralLedger />} /></Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("General Ledger (0639)", () => {
  it("reads this month for every account", async () => {
    show();
    await screen.findByTestId("general-ledger");
    expect(api.calls).toContain("/api/finance/ledger/general-ledger?from=2026-10-01&to=2026-10-31");
  });

  it("prints a block per account: brought forward, each line with its balance, the totals", async () => {
    show();
    const table = await screen.findByTestId("general-ledger");
    expect(table).toHaveTextContent("1121 Public Bank · Asset");
    expect(table).toHaveTextContent("Brought forward");
    expect(table).toHaveTextContent("RM 1,000.00 Debit");
    expect(table).toHaveTextContent("RM 1,250.50 Debit");
    // The bank went over: the balance turns to the other side, never a minus.
    expect(table).toHaveTextContent("RM 249.50 Credit");
    expect(table).toHaveTextContent("Lumen sofa bills");
    expect(table).toHaveTextContent("2110 Trade payables · Liability");
    expect(table).toHaveTextContent("RM 1,500.00 Credit");
    expect(screen.getByTestId("general-ledger-summary")).toHaveTextContent("2 accounts");
  });

  it("an entry number opens the entry on the Journal", async () => {
    show();
    const table = await screen.findByTestId("general-ledger");
    expect(within(table).getAllByRole("link", { name: "JE-202610-0002" })[0]).toHaveAttribute("href", "/finance/ledger?entry=JE-202610-0002");
  });

  it("a search narrows the accounts, never the lines", async () => {
    show();
    await screen.findByTestId("general-ledger");
    fireEvent.change(screen.getByRole("searchbox", { name: "Search accounts" }), { target: { value: "payables" } });
    await waitFor(() => expect(screen.getByTestId("general-ledger")).not.toHaveTextContent("1121 Public Bank"));
    expect(screen.getByTestId("general-ledger")).toHaveTextContent("2110 Trade payables");
    expect(screen.getByTestId("general-ledger-summary")).toHaveTextContent("1 account of 2");
  });

  it("a period before the ledger started says so", async () => {
    api.answer = { ...ANSWER, status: "BEFORE_GO_LIVE", accounts: [] };
    show("/finance/ledger/general-ledger?from=2026-08-01&to=2026-08-31");
    expect(await screen.findByTestId("general-ledger-before-start")).toHaveTextContent("The ledger started on Tue, 1 Sep. Pick a day from then on.");
  });

  it("a failed read, and a block that does not hold together, show the fix and never a zero", async () => {
    api.fail = { status: 500 };
    const { unmount } = show();
    expect(await screen.findByRole("alert")).toHaveTextContent("The General Ledger could not be loaded. Try again.");
    unmount();
    api.fail = null;
    const broken = structuredClone(ANSWER);
    broken.accounts[0]!.rows[1]!.running_balance = 1250.49;
    api.answer = broken;
    show();
    expect(await screen.findByRole("alert")).toHaveTextContent("The General Ledger could not be loaded. Try again.");
  });

  it("a ledger with no start date says so", async () => {
    api.fail = { status: 409 };
    show();
    expect(await screen.findByRole("alert")).toHaveTextContent("The ledger has no start date yet. Nothing can be totalled.");
  });
});

describe("the General Ledger sheet", () => {
  it("writes every line under its account, with the screen's balance words", () => {
    const { sheet, stem } = generalLedgerSheet(generalLedgerBlocks(ANSWER), "2026-10-01", "2026-10-31", "2026-09-01", null);
    expect(stem).toBe("General Ledger Oct 2026");
    expect(sheet.rows[3]).toEqual(["Account", "Date", "Entry No", "Source", "Document", "Description", "Debit", "Credit", "Balance"]);
    expect(sheet.rows).toContainEqual(["1121 Public Bank", "", "", "", "", "Brought forward", "", "", "RM 1,000.00 Debit"]);
    expect(sheet.rows).toContainEqual(["1121 Public Bank", "", "", "", "", "Total", 250.5, 1500, "RM 249.50 Credit"]);
  });
});

describe("no banned word reaches the screen", () => {
  itSaysNoBannedWord(join(dirname(fileURLToPath(import.meta.url)), "GeneralLedger.tsx"), { minStrings: 15, expectString: "Brought forward" });
});

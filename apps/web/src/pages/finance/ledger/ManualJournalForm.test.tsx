import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { itSaysNoBannedWord, visibleStrings } from "@/test/banned-words";
import { ApiError } from "@/lib/api";
import LedgerJournal from "./LedgerJournal";

const api = vi.hoisted(() => ({ fetch: vi.fn() }));
const auth = vi.hoisted(() => ({ role: "principal" as string | null }));
const toasts = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  apiFetch: api.fetch,
}));
vi.mock("@/lib/auth", () => ({
  useAuth: (selector: (s: { role: string | null }) => unknown) => selector({ role: auth.role }),
}));
vi.mock("sonner", () => ({ toast: toasts }));
vi.mock("@/lib/fmt-date", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/fmt-date")>()),
  appTodayIso: () => "2026-09-15",
}));
vi.mock("@/pages/operation/components/GlobalTopBar", () => ({ TopBarIcons: () => null }));
vi.mock("xlsx", () => ({ utils: { json_to_sheet: () => ({}), book_new: () => ({}), book_append_sheet: vi.fn() }, writeFile: vi.fn() }));

const account = (code: string, name: string, extra: Record<string, unknown> = {}) => ({
  code, name, kind: "ASSET", parent_code: null, is_control: false, control_for: null,
  is_active: true, is_header: false, ...extra,
});
const CHART = { go_live_on: "2026-09-10", accounts: [
  account("1100", "Cash and bank", { is_header: true }),
  account("1120", "Bank — current account", { parent_code: "1100" }),
  account("1210", "Trade receivables — customers", { is_control: true, control_for: "CUSTOMER" }),
  account("1230", "Advances to suppliers"),
  account("2310", "SST payable", { kind: "LIABILITY", is_active: false }),
  account("3300", "Opening balance equity", { kind: "EQUITY" }),
  account("6100", "Rent", { kind: "EXPENSE" }),
] };

const ROW = {
  id: "e1", entry_no: "JE-202609-0003", entry_date: "2026-09-10", source_type: "SALES_INVOICE",
  source_doc_no: "INV-TEST-1", narration: "Invoice to a test customer", total_debit: 150, total_credit: 150,
  reversed: false, reverses: null, reverses_entry_no: null, reversed_by: null, reversed_by_entry_no: null,
  created_at: "2026-09-10T02:00:00Z",
};
const RECORDED_ROW = {
  ...ROW, id: "e9", entry_no: "JE-202609-0009", entry_date: "2026-09-15", source_type: "MANUAL",
  source_doc_no: "MJ-202609-0001", narration: "Opening bank balance", total_debit: 12500.5, total_credit: 12500.5,
};
const RECORDED_DETAIL = { entry: RECORDED_ROW, related: [], lines: [
  { line_no: 1, account_code: "1120", account_name: "Bank — current account", debit: 12500.5, credit: 0,
    party_type: null, party_id: null, party_name: null, memo: "Test bank statement" },
  { line_no: 2, account_code: "3300", account_name: "Opening balance equity", debit: 0, credit: 12500.5,
    party_type: null, party_id: null, party_name: null, memo: null },
] };

let recordAnswer: () => Promise<unknown>;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

function answer(url: string, init?: RequestInit) {
  if (url === "/api/finance/manual-journals" && init?.method === "POST") return recordAnswer();
  if (url.startsWith("/api/finance/ledger/entries?")) return Promise.resolve({ rows: [ROW], total: 1 });
  if (url === "/api/finance/ledger/accounts") return Promise.resolve(CHART);
  if (url.endsWith("/entries/JE-202609-0009")) return Promise.resolve(RECORDED_DETAIL);
  return Promise.reject(Object.assign(new Error("No entry has that number."), { status: 404 }));
}

function Where() {
  const loc = useLocation();
  return <span data-testid="where">{loc.pathname}{loc.search}</span>;
}

function show(at = "/finance/ledger") {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const invalidate = vi.spyOn(qc, "invalidateQueries");
  render(<QueryClientProvider client={qc}>
    <MemoryRouter initialEntries={[at]}><LedgerJournal /><Where /></MemoryRouter>
  </QueryClientProvider>);
  return { invalidate };
}

const line = (n: number) => screen.getByTestId(`journal-line-${n}`);

/** The kit Select opens from the keyboard in jsdom (no PointerEvent). */
async function pick(n: number, option: string) {
  fireEvent.keyDown(within(line(n)).getByLabelText("Account"), { key: "Enter" });
  fireEvent.keyDown(await screen.findByRole("option", { name: option }), { key: "Enter" });
  await waitFor(() => expect(screen.queryByRole("listbox")).not.toBeInTheDocument());
}

function type(n: number, field: "Debit" | "Credit" | "Memo", value: string) {
  fireEvent.change(within(line(n)).getByLabelText(field), { target: { value } });
}

function narrate(text: string) {
  fireEvent.change(screen.getByLabelText(/^Narration/), { target: { value: text } });
}

/** Dr 1120 Bank / Cr 3300 Opening balance equity — how an opening bank balance goes in. */
async function fillOpeningBalance(credit = "12500.50") {
  await screen.findByTestId("manual-journal-form");
  await pick(1, "1120 Bank — current account");
  type(1, "Debit", "12,500.50");
  type(1, "Memo", "Test bank statement");
  await pick(2, "3300 Opening balance equity");
  type(2, "Credit", credit);
  narrate("Opening bank balance");
}

beforeEach(() => {
  api.fetch.mockReset();
  api.fetch.mockImplementation(answer);
  recordAnswer = () => Promise.resolve({ id: "e9", entry_no: "JE-202609-0009", doc_no: "MJ-202609-0001" });
  auth.role = "principal";
  toasts.success.mockReset();
  localStorage.clear();
});

describe("the New journal entry door", () => {
  it("shows on the Journal for the principal and opens the form", async () => {
    show();
    await screen.findByText("JE-202609-0003");
    fireEvent.click(screen.getByRole("button", { name: "New journal entry" }));
    expect(screen.getByTestId("where")).toHaveTextContent("/finance/ledger?entry=new");
    expect(await screen.findByTestId("manual-journal-form")).toBeInTheDocument();
    expect(screen.getByTestId("object-identity")).toHaveTextContent("New journal entry");
    expect(screen.getByTestId("journal-line-1")).toBeInTheDocument();
    expect(screen.getByTestId("journal-line-2")).toBeInTheDocument();
  });

  it.each(["finance", "operation"])("is not there for %s", async (role) => {
    auth.role = role;
    show();
    await screen.findByText("JE-202609-0003");
    expect(screen.queryByRole("button", { name: "New journal entry" })).not.toBeInTheDocument();
  });

  it("sends anyone but the principal who types ?entry=new to the missing-entry page", async () => {
    auth.role = "finance";
    show("/finance/ledger?entry=new");
    expect(await screen.findByText("No entry has that number. Check it and try again.")).toBeInTheDocument();
    expect(screen.queryByTestId("manual-journal-form")).not.toBeInTheDocument();
    expect(api.fetch.mock.calls.some(([u]) => u === "/api/finance/manual-journals")).toBe(false);
  });

  it("goes back to the Journal without recording anything", async () => {
    show("/finance/ledger?entry=new");
    await screen.findByTestId("manual-journal-form");
    fireEvent.click(screen.getByRole("button", { name: "Back to Journal" }));
    expect(screen.getByTestId("where")).toHaveTextContent(/^\/finance\/ledger$/);
  });
});

describe("the form", () => {
  it("offers only accounts a journal may use — no heading, retired or customer/supplier account", async () => {
    show("/finance/ledger?entry=new");
    await screen.findByTestId("manual-journal-form");
    fireEvent.keyDown(within(line(1)).getByLabelText("Account"), { key: "Enter" });
    const options = (await screen.findAllByRole("option")).map((o) => o.textContent);
    expect(options).toEqual(["1120 Bank — current account", "3300 Opening balance equity", "6100 Rent"]);
  });

  it("keeps Record journal entry disabled, naming the gap, until debits equal credits", async () => {
    show("/finance/ledger?entry=new");
    await screen.findByTestId("manual-journal-form");
    expect(screen.getByRole("button", { name: "Record journal entry — type the narration" })).toBeDisabled();

    await fillOpeningBalance("12500.49");
    expect(screen.getByTestId("journal-totals")).toHaveTextContent("Total · Debit RM 12,500.50 · Credit RM 12,500.49");
    expect(screen.getByTestId("journal-difference")).toHaveTextContent("Difference RM 0.01");
    expect(screen.getByRole("button", { name: "Record journal entry — make debits equal credits" })).toBeDisabled();

    type(2, "Credit", "12500.50");
    expect(screen.getByTestId("journal-difference")).toHaveTextContent("Difference RM 0.00");
    expect(screen.getByRole("button", { name: "Record journal entry" })).toBeEnabled();
  });

  it("refuses a line with both sides, and an amount it cannot read, where they were typed", async () => {
    show("/finance/ledger?entry=new");
    await fillOpeningBalance();
    type(1, "Credit", "5");
    expect(within(line(1)).getByText("A line takes a debit or a credit, not both.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Record journal entry — check line 1" })).toBeDisabled();
    type(1, "Credit", "");
    type(2, "Credit", "12x");
    expect(within(line(2)).getByText("Type the amount in numbers, like 1500.00.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Record journal entry — check line 2" })).toBeDisabled();
  });

  it("names a line with no account, and a line with no amount", async () => {
    show("/finance/ledger?entry=new");
    await screen.findByTestId("manual-journal-form");
    narrate("Correction of a test entry");
    type(1, "Debit", "10");
    expect(screen.getByRole("button", { name: "Record journal entry — choose an account on line 1" })).toBeDisabled();
    await pick(1, "6100 Rent");
    expect(screen.getByRole("button", { name: "Record journal entry — add a second line" })).toBeDisabled();
    await pick(2, "1120 Bank — current account");
    expect(screen.getByRole("button", { name: "Record journal entry — type a debit or a credit on line 2" })).toBeDisabled();
  });

  it("adds and removes lines, and never goes below two", async () => {
    show("/finance/ledger?entry=new");
    await screen.findByTestId("manual-journal-form");
    expect(screen.getByRole("button", { name: "Remove, line 1" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Add line" }));
    expect(screen.getByTestId("journal-line-3")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Remove, line 3" }));
    expect(screen.queryByTestId("journal-line-3")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Remove, line 2" })).toBeDisabled();
  });
});

describe("recording", () => {
  it("asks first, records the entry, refreshes the ledger and opens the new entry", async () => {
    const { invalidate } = show("/finance/ledger?entry=new");
    await fillOpeningBalance();
    fireEvent.click(screen.getByRole("button", { name: "Record journal entry" }));

    const dialog = await screen.findByRole("dialog", { name: "Record this journal entry?" });
    expect(dialog).toHaveTextContent("To correct it, record another entry.");
    expect(api.fetch.mock.calls.some(([u]) => u === "/api/finance/manual-journals")).toBe(false);
    fireEvent.click(within(dialog).getByRole("button", { name: "Record journal entry" }));

    await waitFor(() => expect(screen.getByTestId("where")).toHaveTextContent("/finance/ledger?entry=JE-202609-0009"));
    const post = api.fetch.mock.calls.filter(([u]) => u === "/api/finance/manual-journals");
    expect(post).toHaveLength(1);
    expect(post[0]?.[1]).toMatchObject({ method: "POST" });
    expect(JSON.parse(String((post[0]?.[1] as RequestInit).body))).toEqual({
      entry_date: "2026-09-15",
      narration: "Opening bank balance",
      lines: [
        { account_code: "1120", debit: 12500.5, credit: null, memo: "Test bank statement" },
        { account_code: "3300", debit: null, credit: 12500.5, memo: null },
      ],
      requestKey: expect.stringMatching(UUID),
    });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["finance", "ledger"] });
    expect(toasts.success).toHaveBeenCalledWith("Journal entry recorded.");
    expect(await screen.findByTestId("ledger-entry-scroll")).toBeInTheDocument();
    expect(screen.getByTestId("object-identity")).toHaveTextContent("JE-202609-0009");
  });

  it("opens the entry by its id when the numbers could not be read back", async () => {
    recordAnswer = () => Promise.resolve({ id: "e9", entry_no: null, doc_no: null });
    show("/finance/ledger?entry=new");
    await fillOpeningBalance();
    fireEvent.click(screen.getByRole("button", { name: "Record journal entry" }));
    fireEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Record journal entry" }));
    await waitFor(() => expect(screen.getByTestId("where")).toHaveTextContent("/finance/ledger?entry=e9"));
  });

  it("keeps the form and says why when the ledger refuses", async () => {
    const why = "Line 1 uses a customer, supplier or other party account. Those accounts move only through their own documents.";
    recordAnswer = () => Promise.reject(new ApiError(422, why, { error: "rule_violation", message: why }));
    show("/finance/ledger?entry=new");
    await fillOpeningBalance();
    fireEvent.click(screen.getByRole("button", { name: "Record journal entry" }));
    fireEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Record journal entry" }));
    expect(await screen.findByTestId("journal-refusal")).toHaveTextContent(why);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByTestId("where")).toHaveTextContent("/finance/ledger?entry=new");
    expect(screen.getByLabelText(/^Narration/)).toHaveValue("Opening bank balance");
  });

  it("sends the principal to the Journal first when no answer came back", async () => {
    recordAnswer = () => Promise.reject(new TypeError("Failed to fetch"));
    show("/finance/ledger?entry=new");
    await fillOpeningBalance();
    fireEvent.click(screen.getByRole("button", { name: "Record journal entry" }));
    fireEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Record journal entry" }));
    const refusal = await screen.findByTestId("journal-refusal");
    expect(refusal).toHaveTextContent("The connection dropped. Check the Journal for this entry before you record it again.");
    expect(refusal).not.toHaveTextContent("Failed to fetch");
    expect(screen.getByTestId("where")).toHaveTextContent("/finance/ledger?entry=new");
  });

  it("treats a gateway error as an unknown outcome, never as a refusal", async () => {
    recordAnswer = () => Promise.reject(new ApiError(502, "Bad Gateway", "<html>502 Bad Gateway</html>"));
    show("/finance/ledger?entry=new");
    await fillOpeningBalance();
    fireEvent.click(screen.getByRole("button", { name: "Record journal entry" }));
    fireEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Record journal entry" }));
    const refusal = await screen.findByTestId("journal-refusal");
    expect(refusal).toHaveTextContent("The connection dropped. Check the Journal for this entry before you record it again.");
    expect(refusal).not.toHaveTextContent("Bad Gateway");
  });

  it("drops a blank row before recording, so the ledger's line number points at the right row", async () => {
    show("/finance/ledger?entry=new");
    await screen.findByTestId("manual-journal-form");
    fireEvent.click(screen.getByRole("button", { name: "Add line" }));
    await pick(1, "1120 Bank — current account");
    type(1, "Debit", "100");
    await pick(3, "6100 Rent");
    type(3, "Credit", "100");
    narrate("Correction of a test entry");
    const why = "Line 2 names an account that is no longer in use.";
    recordAnswer = () => Promise.reject(new ApiError(422, why, { error: "rule_violation", message: why }));

    fireEvent.click(screen.getByRole("button", { name: "Record journal entry" }));
    const dialog = await screen.findByRole("dialog");
    expect(screen.queryByTestId("journal-line-3")).not.toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: "Record journal entry" }));

    expect(await screen.findByTestId("journal-refusal")).toHaveTextContent(why);
    const post = api.fetch.mock.calls.find(([u]) => u === "/api/finance/manual-journals");
    const sent = JSON.parse(String((post?.[1] as RequestInit).body)) as { lines: { account_code: string }[] };
    expect(sent.lines.map((l) => l.account_code)).toEqual(["1120", "6100"]);
    expect(within(line(2)).getByLabelText("Credit")).toHaveValue("100");
    expect(screen.queryByTestId("journal-line-3")).not.toBeInTheDocument();
  });
});

describe("the request key", () => {
  const sentKeys = () => api.fetch.mock.calls
    .filter(([u]) => u === "/api/finance/manual-journals")
    .map(([, init]) => (JSON.parse(String((init as RequestInit).body)) as { requestKey?: string }).requestKey);

  async function press() {
    fireEvent.click(screen.getByRole("button", { name: "Record journal entry" }));
    fireEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Record journal entry" }));
  }

  it("sends the same key on a retry after an unknown outcome, and after a refusal", async () => {
    const why = "The ledger has no start date yet.";
    const answers = [
      () => Promise.reject(new TypeError("Failed to fetch")),
      () => Promise.reject(new ApiError(409, why, { error: "rule_violation", message: why })),
      () => Promise.resolve({ id: "e9", entry_no: "JE-202609-0009", doc_no: "MJ-202609-0001" }),
    ];
    recordAnswer = () => answers.shift()!();
    show("/finance/ledger?entry=new");
    await fillOpeningBalance();

    await press();
    await screen.findByText("The connection dropped. Check the Journal for this entry before you record it again.");
    await press();
    await screen.findByText(why);
    type(1, "Memo", "Test bank statement, checked");
    await press();
    await waitFor(() => expect(screen.getByTestId("where")).toHaveTextContent("/finance/ledger?entry=JE-202609-0009"));

    const keys = sentKeys();
    expect(keys).toHaveLength(3);
    expect(keys[0]).toMatch(UUID);
    expect(new Set(keys).size).toBe(1);
  });

  it("draws a new key for a new entry", async () => {
    show("/finance/ledger?entry=new");
    await fillOpeningBalance();
    await press();
    await waitFor(() => expect(screen.getByTestId("where")).toHaveTextContent("/finance/ledger?entry=JE-202609-0009"));
    cleanup();
    show("/finance/ledger?entry=new");
    await fillOpeningBalance();
    await press();
    await waitFor(() => expect(sentKeys()).toHaveLength(2));
    const [a, b] = sentKeys();
    expect(a).toMatch(UUID);
    expect(b).toMatch(UUID);
    expect(a).not.toBe(b);
  });

  it("says a second press is safe only when the API says the key is honoured", async () => {
    const safe = "The answer did not come back. Press Record journal entry again. This entry is never recorded twice.";
    recordAnswer = () => Promise.reject(new ApiError(503, safe,
      { error: "outcome_unknown", code: "outcome_unknown", message: safe, retry_safe: true }));
    show("/finance/ledger?entry=new");
    await fillOpeningBalance();
    await press();
    expect(await screen.findByTestId("journal-refusal")).toHaveTextContent(safe);
  });

  it("keeps \"check the Journal first\" when the API cannot vouch for the key", async () => {
    const careful = "The answer did not come back. Check the Journal for this entry before you record it again.";
    recordAnswer = () => Promise.reject(new ApiError(503, careful,
      { error: "outcome_unknown", code: "outcome_unknown", message: careful, retry_safe: false }));
    show("/finance/ledger?entry=new");
    await fillOpeningBalance();
    await press();
    expect(await screen.findByTestId("journal-refusal"))
      .toHaveTextContent("The connection dropped. Check the Journal for this entry before you record it again.");
  });
});

describe("New journal entry words", () => {
  const here = dirname(fileURLToPath(import.meta.url));
  const file = join(here, "ManualJournalForm.tsx");
  itSaysNoBannedWord(file, { minStrings: 10, expectString: "Record this journal entry?" });
  it("never prints the database's own state words", () => {
    expect(visibleStrings(readFileSync(file, "utf8")).filter((s) => /\b(Posted|Voided|POSTED|VOIDED)\b/i.test(s))).toEqual([]);
  });
});

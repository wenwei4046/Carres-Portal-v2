/**
 * Journal and General Ledger: row menu and preview (Chew 2026-10-21, Finance
 * MASTER §4.2, COPY "Row menu and preview"). A journal entry's lines are its
 * General Ledger entry, so its preview has facts and the entry, no Lines.
 */
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { GeneralLedgerAnswer } from "@carres/shared/general-ledger";
import LedgerJournal from "./LedgerJournal";
import GeneralLedger from "./GeneralLedger";

const api = vi.hoisted(() => ({ fetch: vi.fn() }));
vi.mock("@/lib/api", () => ({ apiFetch: api.fetch }));
vi.mock("@/pages/operation/components/GlobalTopBar", () => ({ TopBarIcons: () => null }));
vi.mock("@/lib/fmt-date", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/fmt-date")>()),
  appTodayIso: () => "2026-10-03",
}));

const E1 = { id: "e1", entry_no: "JE-202610-0001", entry_date: "2026-10-02", source_type: "PAYMENT_VOUCHER",
  source_doc_no: "PV-2610-0003", narration: "Lumen sofa bills", total_debit: 1500, total_credit: 1500, reversed: false,
  reverses: null, reverses_entry_no: null, reversed_by: null, reversed_by_entry_no: null, created_at: "2026-10-02T02:00:00Z" };
const DETAIL = {
  entry: E1,
  lines: [
    { line_no: 1, account_code: "2110", account_name: "Trade payables", debit: 1500, credit: 0,
      party_type: null, party_id: null, party_name: null, memo: null },
    { line_no: 2, account_code: "1121", account_name: "Public Bank", debit: 0, credit: 1500,
      party_type: null, party_id: null, party_name: null, memo: "Transfer" },
  ],
  related: [],
};
const row = (over: Record<string, unknown>) => ({
  row_kind: "LINE", account_code: "1121", account_name: "Public Bank", kind: "ASSET",
  entry_date: "2026-10-02", entry_no: "JE-202610-0001", source_type: "PAYMENT_VOUCHER", source_doc_no: "PV-2610-0003",
  narration: "Lumen sofa bills", memo: null, debit: 0, credit: 1500, running_balance: -500, ...over,
});
const GL: GeneralLedgerAnswer = {
  status: "OK", go_live_on: "2026-09-01", from: "2026-10-01", to: "2026-10-31",
  accounts: [{ account_code: "1121", rows: [
    row({ row_kind: "OPENING", entry_date: null, entry_no: null, source_type: null, source_doc_no: null, debit: null, credit: null, running_balance: 1000 }),
    row({}),
    row({ row_kind: "CLOSING", entry_date: null, entry_no: null, source_type: null, source_doc_no: null, debit: null, credit: null, running_balance: -500 }),
  ] }],
} as GeneralLedgerAnswer;

function answer(url: string) {
  if (url.startsWith("/api/operation/register-layouts")) return Promise.resolve({ layouts: [], limit: 10 });
  if (url.startsWith("/api/finance/ledger/departments")) return Promise.resolve([]);
  if (url.startsWith("/api/finance/ledger/entries?")) return Promise.resolve({ rows: [E1], total: 1 });
  if (url === "/api/finance/ledger/accounts") return Promise.resolve({ go_live_on: "2026-09-01", accounts: [] });
  if (url.startsWith("/api/finance/ledger/general-ledger?")) return Promise.resolve(GL);
  if (url.endsWith("/entries/JE-202610-0001")) return Promise.resolve(DETAIL);
  return Promise.reject(Object.assign(new Error(`unexpected read ${url}`), { status: 404 }));
}

function Where() {
  const loc = useLocation();
  return <span data-testid="where">{loc.pathname}{loc.search}</span>;
}
function show(page: JSX.Element, at: string) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>
    <MemoryRouter initialEntries={[at]}>{page}<Where /></MemoryRouter>
  </QueryClientProvider>);
}
async function menuOf(el: HTMLElement): Promise<string[]> {
  fireEvent.contextMenu(el);
  const menu = await screen.findByRole("menu", { name: "Row actions" });
  return Array.from(menu.children).map((c) => (c.getAttribute("role") === "separator" ? "─" : c.textContent ?? ""));
}

beforeEach(() => {
  api.fetch.mockReset();
  api.fetch.mockImplementation(answer);
  localStorage.clear();
});

describe("Journal", () => {
  it("the row menu is View, which opens the entry's page", async () => {
    show(<LedgerJournal />, "/finance/ledger");
    expect(await menuOf((await screen.findAllByText("JE-202610-0001"))[0]!)).toEqual(["View"]);
    fireEvent.click(screen.getByRole("menuitem", { name: "View" }));
    await waitFor(() => expect(screen.getByTestId("where")).toHaveTextContent("?entry=JE-202610-0001"));
  });

  it("a double-click previews the entry: its facts and its lines, debit and credit totalled", async () => {
    show(<LedgerJournal />, "/finance/ledger");
    fireEvent.doubleClick((await screen.findAllByText("JE-202610-0001"))[0]!);
    const dialog = await screen.findByRole("dialog", { name: "JE-202610-0001" });
    expect(await within(dialog).findByTestId("preview-facts")).toHaveTextContent("NarrationLumen sofa bills");
    expect(within(dialog).queryByTestId("preview-lines")).not.toBeInTheDocument();
    const lines = await within(dialog).findByTestId("preview-entry-JE-202610-0001");
    await waitFor(() => expect(lines).toHaveTextContent("2110 Trade payables"));
    expect(lines).toHaveTextContent("Transfer");
    expect(lines).toHaveTextContent("No memo");
    expect(screen.getByTestId("where")).toHaveTextContent("/finance/ledger");
    expect(screen.getByTestId("where")).not.toHaveTextContent("entry=");
    fireEvent.keyDown(dialog, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });
});

describe("General Ledger (kit DataTable)", () => {
  it("a line's row menu is View, to its entry on the Journal; Brought forward and Total have none", async () => {
    show(<GeneralLedger />, "/finance/ledger/general-ledger?from=2026-10-01&to=2026-10-31");
    const rows = await screen.findAllByTestId("general-ledger-row");
    const line = rows.find((r) => r.textContent?.includes("JE-202610-0001"))!;
    expect(await menuOf(line)).toEqual(["View"]);
    fireEvent.click(screen.getByRole("menuitem", { name: "View" }));
    await waitFor(() => expect(screen.getByTestId("where")).toHaveTextContent("/finance/ledger?entry=JE-202610-0001"));
  });

  it("a right-click on Brought forward keeps the browser's own menu", async () => {
    show(<GeneralLedger />, "/finance/ledger/general-ledger?from=2026-10-01&to=2026-10-31");
    const opening = (await screen.findAllByTestId("general-ledger-row")).find((r) => r.textContent?.includes("Brought forward"))!;
    fireEvent.contextMenu(opening);
    expect(screen.queryByRole("menu", { name: "Row actions" })).not.toBeInTheDocument();
  });

  it("a double-click on a line previews its entry; View opens it", async () => {
    show(<GeneralLedger />, "/finance/ledger/general-ledger?from=2026-10-01&to=2026-10-31");
    const line = (await screen.findAllByTestId("general-ledger-row")).find((r) => r.textContent?.includes("JE-202610-0001"))!;
    fireEvent.doubleClick(line);
    const dialog = await screen.findByRole("dialog", { name: "JE-202610-0001" });
    await waitFor(() => expect(within(dialog).getByTestId("preview-entry-JE-202610-0001")).toHaveTextContent("1121 Public Bank"));
    fireEvent.click(within(dialog).getByRole("button", { name: "View" }));
    await waitFor(() => expect(screen.getByTestId("where")).toHaveTextContent("/finance/ledger?entry=JE-202610-0001"));
  });
});

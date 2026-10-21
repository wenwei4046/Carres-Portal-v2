/**
 * Other debtors and Other receipts: row menu and preview (Chew 2026-10-21,
 * Finance MASTER §4.2, COPY "Row menu and preview").
 */
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import OtherDebtorsPage from "./OtherDebtorsPage";
import OtherReceiptsPage from "./OtherReceiptsPage";
import { invoiceReceiptDoor } from "./parts";
import {
  ACCOUNTS, DEPARTMENTS, DRAFT_DETAIL, I_DRAFT, I_OPEN, INVOICES, MONEY_ACCOUNTS, OPEN_DETAIL, P1,
  PARTIES, R1, RECEIPT_DETAIL, RECEIPTS,
} from "./fixtures.test-data";

const net = vi.hoisted(() => ({ routes: {} as Record<string, unknown> }));
vi.mock("@/lib/api", () => ({
  apiFetch: vi.fn(async (path: string, init?: RequestInit) => {
    const key = `${init?.method ?? "GET"} ${path.replace("/api/finance/other-money-in", "")}`;
    if (key in net.routes) return net.routes[key];
    throw new Error(`unmocked ${key}`);
  }),
}));
vi.mock("@/pages/operation/components/GlobalTopBar", () => ({ TopBarIcons: () => null }));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
const pdf = vi.hoisted(() => ({
  invoice: vi.fn(async () => new Blob(["%PDF"])),
  receipt: vi.fn(async () => new Blob(["%PDF"])),
}));
vi.mock("@/lib/pdf/render", () => ({ renderOtherDebtorInvoicePdf: pdf.invoice, renderReceiptPdf: pdf.receipt }));

const entry = (no: string) => ({
  entry: { id: `e-${no}`, entry_no: no, entry_date: "2026-09-15", source_type: "OTHER_DEBTOR_INVOICE", source_doc_no: "ARI-20260915-4821",
    narration: null, total_debit: 1500, total_credit: 1500, reversed: false, reverses: null, reverses_entry_no: null,
    reversed_by: null, reversed_by_entry_no: null, created_at: "2026-09-15T02:00:00Z" },
  lines: [
    { line_no: 1, account_code: "1240", account_name: "Other debtors", debit: 1500, credit: 0, party_type: null, party_id: null, party_name: null, memo: null },
    { line_no: 2, account_code: "6200", account_name: "Rent", debit: 0, credit: 1400, party_type: null, party_id: null, party_name: null, memo: "Office rent September" },
    { line_no: 3, account_code: "4900", account_name: "Other income", debit: 0, credit: 100, party_type: null, party_id: null, party_name: null, memo: null },
  ],
  related: [],
});

beforeEach(() => {
  net.routes = {
    "GET /invoices": INVOICES,
    "GET /parties": PARTIES,
    "GET /accounts": ACCOUNTS,
    "GET /receipts": RECEIPTS,
    "GET /me": { mayCancel: false },
    "GET /api/finance/ledger/departments": DEPARTMENTS,
    "GET /api/finance/ledger/money-accounts": MONEY_ACCOUNTS,
    [`GET /invoices/${I_DRAFT}`]: DRAFT_DETAIL,
    [`GET /invoices/${I_OPEN}`]: OPEN_DETAIL,
    [`GET /receipts/${R1}`]: RECEIPT_DETAIL,
    "GET /api/finance/ledger/entries/JE-202609-0001": entry("JE-202609-0001"),
    "GET /api/finance/ledger/entries/JE-202609-0002": entry("JE-202609-0002"),
  };
  localStorage.clear();
});

function Where() {
  const loc = useLocation();
  return <p data-testid="where">{loc.pathname + loc.search}</p>;
}
function show(at: string) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[at]}>
        <Routes>
          <Route path="/finance/other-debtors" element={<><OtherDebtorsPage /><Where /></>} />
          <Route path="/finance/other-receipts" element={<><OtherReceiptsPage /><Where /></>} />
          <Route path="*" element={<Where />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}
async function menuOf(text: string): Promise<string[]> {
  fireEvent.contextMenu((await screen.findAllByText(text))[0]!);
  const menu = await screen.findByRole("menu", { name: "Row actions" });
  return Array.from(menu.children).map((el) => (el.getAttribute("role") === "separator" ? "─" : el.textContent ?? ""));
}
const choose = (word: string) => fireEvent.click(within(screen.getByRole("menu", { name: "Row actions" })).getByRole("menuitem", { name: word }));

describe("Other debtors invoices: row menu", () => {
  it("an issued invoice still owed: View, Print, then Record receipt to the invoice page's own door", async () => {
    show("/finance/other-debtors");
    expect(await menuOf("ARI-20260915-4821")).toEqual(["View", "Print", "─", "Record receipt"]);
    choose("Record receipt");
    expect(await screen.findByTestId("where")).toHaveTextContent(`/finance/other-receipts?receipt=new&party=${P1}&invoice=${I_OPEN}`);
  });

  it("paid in full or cancelled: View and Print; a draft: View only", async () => {
    show("/finance/other-debtors");
    expect(await menuOf("ARI-20260912-1377")).toEqual(["View", "Print"]);
    fireEvent.keyDown(screen.getByRole("menu"), { key: "Escape" });
    expect(await menuOf("ARI-20260911-9056")).toEqual(["View", "Print"]);
    fireEvent.keyDown(screen.getByRole("menu"), { key: "Escape" });
    expect(await menuOf("Draft, no number yet")).toEqual(["View"]);
  });

  it("Record receipt follows the invoice page's condition", () => {
    for (const r of INVOICES) {
      // Only the issued invoice with money still owed (not paid, cancelled or draft).
      expect(invoiceReceiptDoor(r) !== null, r.invoice_id).toBe(r.invoice_id === I_OPEN);
    }
  });

  it("Print runs the invoice's own PDF", async () => {
    const open = vi.spyOn(window, "open").mockReturnValue(null);
    URL.createObjectURL = vi.fn(() => "blob:inv");
    show("/finance/other-debtors");
    await menuOf("ARI-20260915-4821");
    choose("Print");
    await waitFor(() => expect(pdf.invoice).toHaveBeenCalled());
    expect(open).toHaveBeenCalledWith("blob:inv", "_blank", "noopener");
    open.mockRestore();
  });
});

describe("Other debtors invoices: double-click preview", () => {
  it("shows the invoice's facts, lines and ledger entry; View opens the invoice", async () => {
    show("/finance/other-debtors");
    fireEvent.doubleClick((await screen.findAllByText("ARI-20260915-4821"))[0]!);
    const dialog = await screen.findByRole("dialog");
    expect(await within(dialog).findByTestId("preview-facts")).toHaveTextContent("OutstandingRM 900.00");
    expect(within(dialog).getByTestId("preview-lines")).toHaveTextContent("Office rent September");
    expect(within(dialog).getByTestId("preview-lines")).toHaveTextContent("6200 Rent");
    await waitFor(() => expect(within(dialog).getByTestId("preview-entry-JE-202609-0001")).toHaveTextContent("1240 Other debtors"));
    fireEvent.click(within(dialog).getByRole("button", { name: "View" }));
    expect(await screen.findByTestId("other-debtor-invoice-object")).toBeInTheDocument();
  });

  it("a draft has posted nothing yet", async () => {
    show("/finance/other-debtors");
    fireEvent.doubleClick((await screen.findAllByText("Draft, no number yet"))[0]!);
    expect(await screen.findByTestId("preview-ledger")).toHaveTextContent("Nothing was entered in the ledger yet.");
  });
});

describe("Other receipts", () => {
  it("the menu is View and Print; the preview shows what it paid and its entry", async () => {
    show("/finance/other-receipts");
    expect(await menuOf("RV-20260916-3390")).toEqual(["View", "Print"]);
    fireEvent.keyDown(screen.getByRole("menu"), { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("menu")).not.toBeInTheDocument());
    fireEvent.doubleClick((await screen.findAllByText("RV-20260916-3390"))[0]!);
    const dialog = await screen.findByRole("dialog");
    expect(await within(dialog).findByTestId("preview-lines")).toHaveTextContent("ARI-20260915-4821 · Invoice of");
    await waitFor(() => expect(within(dialog).getByTestId("preview-entry-JE-202609-0002")).toHaveTextContent("Ledger entry JE-202609-0002"));
    fireEvent.click(within(dialog).getByRole("button", { name: "View" }));
    expect(await screen.findByTestId("other-receipt-object")).toBeInTheDocument();
  });
});

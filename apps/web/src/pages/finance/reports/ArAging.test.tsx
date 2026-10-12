import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ArAgingAnswer } from "@carres/shared/ar-aging";
import { itSaysNoBannedWord } from "@/test/banned-words";
import ArAging from "./ArAging";

/* Finance → Reports → AR Aging (0686; Chew 2026-10-12). The reads are
   answered by URL; names and figures are invented. */
const api = vi.hoisted(() => ({
  answer: null as unknown,
  calls: [] as string[],
  fail: null as null | { status: number },
}));
const OUTLET = "44444444-4444-4444-8444-444444444444";
vi.mock("@/lib/api", () => ({
  apiFetch: vi.fn(async (url: string) => {
    if (url === "/api/finance/ledger/departments") {
      return { rows: [{ department_type: "SHOWROOM", department_id: OUTLET, name: "Test Showroom" }] };
    }
    api.calls.push(url);
    if (api.fail) throw Object.assign(new Error("boom"), { status: api.fail.status, body: {} });
    if (!url.startsWith("/api/finance/ledger/ar-aging?")) throw new Error(`unexpected read ${url}`);
    return api.answer;
  }),
  ApiError: class ApiError extends Error {},
}));
vi.mock("@/pages/operation/components/GlobalTopBar", () => ({ TopBarIcons: () => null }));
vi.mock("@/lib/fmt-date", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/fmt-date")>()),
  appTodayIso: () => "2026-10-12",
}));

const CUSTOMER = "11111111-1111-4111-8111-111111111111";
const AHEAD = "22222222-2222-4222-8222-222222222222";
const COMPANY = "33333333-3333-4333-8333-333333333333";
const OTHER_INVOICE = "55555555-5555-4555-8555-555555555555";

const ANSWER: ArAgingAnswer = {
  as_at: "2026-10-12",
  go_live_on: "2026-09-10",
  controls: [
    { account_code: "300-1000", name: "SHOWROOM DEBTORS", balance: 1114 },
    { account_code: "305-0000", name: "OTHER DEBTOR", balance: 300 },
  ],
  debtors: [
    { party_type: "CUSTOMER", party_id: CUSTOMER, name: "Test Customer", kind: "customer", balance: 1314, invoices: [
      { invoice_id: "i-1", invoice_no: "INV-121026-0001", kind: "sales", order_id: "o-1", so: 1371, invoice_date: "2026-10-12",
        due_date: null, total: 2629, open: 1314, department_type: "SHOWROOM", department_id: OUTLET },
    ] },
    // A deposit on an order not invoiced yet: paid ahead of an invoice.
    { party_type: "CUSTOMER", party_id: AHEAD, name: "Paid Ahead Customer", kind: "customer", balance: -200, invoices: [] },
    { party_type: "OTHER", party_id: COMPANY, name: "Test Company", kind: "company", balance: 300, invoices: [
      { invoice_id: OTHER_INVOICE, invoice_no: "ARI-20260825-0001", kind: "other", order_id: null, so: null, invoice_date: "2026-08-25",
        due_date: "2026-10-05", total: 500, open: 300, department_type: null, department_id: null },
    ] },
  ],
  before_go_live: { count: 1, amount: 2499 },
};

beforeEach(() => {
  api.answer = ANSWER;
  api.calls = [];
  api.fail = null;
  localStorage.clear();
});

function Where() {
  const l = useLocation();
  return <span data-testid="where">{l.search}</span>;
}

function show(at = "/finance/reports/ar-aging") {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[at]}>
        <Routes><Route path="/finance/reports/ar-aging" element={<><ArAging /><Where /></>} /></Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const row = (key: string) => screen.getByTestId(`ar-aging-row-${key}`);

describe("AR Aging (0686)", () => {
  it("reads today in Malaysia", async () => {
    show();
    await screen.findByTestId(`ar-aging-row-CUSTOMER:${CUSTOMER}`);
    expect(api.calls[0]).toBe("/api/finance/ledger/ar-aging?asAt=2026-10-12");
  });

  it("files each open invoice by its month, and a deposit paid ahead as not tied to an invoice", async () => {
    show();
    await screen.findByTestId(`ar-aging-row-CUSTOMER:${CUSTOMER}`);
    const customer = row(`CUSTOMER:${CUSTOMER}`);
    expect(customer).toHaveTextContent("RM 1,314.00");
    await waitFor(() => expect(row(`CUSTOMER:${CUSTOMER}`)).toHaveTextContent("Test Showroom"));
    expect(row(`CUSTOMER:${AHEAD}`)).toHaveTextContent("RM -200.00");
    expect(row(`OTHER:${COMPANY}`)).toHaveTextContent("RM 300.00");
  });

  it("keeps Debtor Type out of sight at first, as AP Aging keeps Creditor Type", async () => {
    show();
    await screen.findByTestId(`ar-aging-row-CUSTOMER:${CUSTOMER}`);
    const headers = screen.getAllByRole("columnheader").map((h) => h.textContent ?? "");
    expect(headers.some((h) => h.includes("Debtor Type"))).toBe(false);
    expect(headers.some((h) => h.includes("Channel"))).toBe(true);
    expect(headers.some((h) => h.includes("Not tied to"))).toBe(true);
  });

  it("ties the debtors to the books in the footer, and names what the books never held", async () => {
    show();
    await screen.findByTestId(`ar-aging-row-CUSTOMER:${CUSTOMER}`);
    expect(screen.getByTestId("ar-aging-summary")).toHaveTextContent(
      "3 debtors · In the books (300-1000 + 305-0000) on Mon, 12 Oct: RM 1,414.00 · Difference RM 0.00",
    );
    expect(screen.queryByTestId("ar-aging-differs")).not.toBeInTheDocument();
    expect(screen.getByTestId("ar-aging-before-go-live")).toHaveTextContent(
      "1 invoice worth RM 2,499.00 was issued before the books started. The books do not hold it, so it is not aged here.",
    );
  });

  it("says so when the debtors differ from the books", async () => {
    api.answer = { ...ANSWER, controls: [{ account_code: "300-1000", name: "SHOWROOM DEBTORS", balance: 1000 }] };
    show();
    expect(await screen.findByTestId("ar-aging-differs")).toHaveTextContent("The debtors differ from the books by RM 414.00.");
  });

  it("opening a row lists the open invoices; an other debtor's opens its invoice", async () => {
    show();
    await screen.findByTestId(`ar-aging-row-OTHER:${COMPANY}`);
    fireEvent.click(within(row(`OTHER:${COMPANY}`)).getByRole("button", { name: "Expand row" }));
    const invoices = await screen.findByTestId(`ar-aging-invoices-OTHER:${COMPANY}`);
    expect(within(invoices).getByRole("link", { name: "ARI-20260825-0001" }))
      .toHaveAttribute("href", `/finance/other-debtors?invoice=${OTHER_INVOICE}`);
    expect(invoices).toHaveTextContent("Other debtor invoice");
    expect(invoices).toHaveTextContent("2 months");
    fireEvent.click(within(row(`CUSTOMER:${CUSTOMER}`)).getByRole("button", { name: "Expand row" }));
    const sales = await screen.findByTestId(`ar-aging-invoices-CUSTOMER:${CUSTOMER}`);
    expect(sales).toHaveTextContent("Sales Invoice");
    expect(sales).toHaveTextContent("SO-1371");
    expect(sales).toHaveTextContent("This month");
  });

  it("switches to days, and to the due date, keeping both in the address", async () => {
    show("/finance/reports/ar-aging?columns=day&by=due");
    await screen.findByTestId(`ar-aging-row-OTHER:${COMPANY}`);
    expect(screen.getAllByRole("columnheader").map((h) => h.textContent).join(" ")).toContain("Over 120");
    expect(screen.getByRole("combobox", { name: "Age by" })).toHaveTextContent("Due date");
    fireEvent.keyDown(screen.getByRole("combobox", { name: "Columns" }), { key: "Enter" });
    fireEvent.click(await screen.findByRole("option", { name: "By month" }));
    await waitFor(() => expect(screen.getByTestId("where")).toHaveTextContent("?by=due"));
  });

  it("a failed read shows the fix; a ledger with no start date says so", async () => {
    api.fail = { status: 500 };
    const { unmount } = show();
    expect(await screen.findByRole("alert")).toHaveTextContent("AR aging could not be loaded. Try again.");
    unmount();
    api.fail = { status: 409 };
    show();
    expect(await screen.findByRole("alert")).toHaveTextContent("The ledger has no start date yet. Nothing can be totalled.");
  });
});

describe("no banned word reaches the screen", () => {
  itSaysNoBannedWord(join(dirname(fileURLToPath(import.meta.url)), "ArAging.tsx"), { minStrings: 20, expectString: "Not tied to an invoice" });
});

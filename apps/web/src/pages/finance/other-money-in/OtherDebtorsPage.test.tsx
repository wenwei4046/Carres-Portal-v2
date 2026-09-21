import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import OtherDebtorsPage from "./OtherDebtorsPage";
import { ACCOUNTS, DEPARTMENTS, DRAFT_DETAIL, I_DRAFT, I_OPEN, INVOICES, OPEN_DETAIL, P1, PARTIES } from "./fixtures.test-data";

const net = vi.hoisted(() => ({
  routes: {} as Record<string, unknown>,
  fail: new Set<string>(),
  calls: [] as Array<{ key: string; body: unknown }>,
}));
vi.mock("@/lib/api", () => ({
  apiFetch: vi.fn(async (path: string, init?: RequestInit) => {
    const key = `${init?.method ?? "GET"} ${path.replace("/api/finance/other-money-in", "")}`;
    net.calls.push({ key, body: init?.body ? JSON.parse(String(init.body)) : undefined });
    if (net.fail.has(key)) throw new Error("The server refused.");
    if (key in net.routes) return net.routes[key];
    throw new Error(`unmocked ${key}`);
  }),
}));
vi.mock("@/pages/operation/components/GlobalTopBar", () => ({ TopBarIcons: () => null }));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

beforeEach(() => {
  net.routes = {
    "GET /invoices": INVOICES,
    "GET /parties": PARTIES,
    "GET /accounts": ACCOUNTS,
    "GET /api/finance/ledger/departments": DEPARTMENTS,
    "GET /me": { mayCancel: false },
    [`GET /invoices/${I_DRAFT}`]: DRAFT_DETAIL,
    [`GET /invoices/${I_OPEN}`]: OPEN_DETAIL,
  };
  net.fail = new Set();
  net.calls = [];
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
          <Route path="/finance/other-debtors" element={<OtherDebtorsPage />} />
          <Route path="*" element={<Where />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const sent = (key: string) => net.calls.filter((c) => c.key === key);

describe("Other debtors — the invoice Register", () => {
  it("prints every state as words and sums only what issued invoices still owe", async () => {
    show("/finance/other-debtors");
    await screen.findByText("ARI-20260915-4821");
    expect(screen.getByTestId("other-debtors-destination-header")).toHaveTextContent("Other debtors");
    const table = screen.getByRole("table");
    for (const label of ["Invoice No", "Invoice Date", "Party", "What for", "Total", "Outstanding", "Due Date", "Status"]) {
      expect(within(table).getAllByText(label).length).toBeGreaterThan(0);
    }
    expect(screen.getByText("Draft — no number yet")).toBeInTheDocument();
    expect(screen.getByText("Not issued yet")).toBeInTheDocument();
    expect(screen.getByText("RM 900.00")).toBeInTheDocument();
    expect(screen.getByText("Paid in full")).toBeInTheDocument();
    expect(screen.getAllByText("Office rent September and 1 more").length).toBe(4);
    expect(screen.getByTestId("other-debtor-invoices-summary")).toHaveTextContent("4 invoices · RM 900.00 outstanding");
    expect(document.body.textContent).not.toMatch(/Balance|Posted|Voided/);
    for (const raw of ["draft", "issued", "cancelled"]) expect(screen.queryByText(raw)).not.toBeInTheDocument();
  });

  it("says a failed read failed, and never prints RM 0.00 in its place", async () => {
    net.fail.add("GET /invoices");
    show("/finance/other-debtors");
    expect(await screen.findByRole("alert")).toHaveTextContent("Other debtor invoices could not be loaded.");
    expect(screen.queryByTestId("other-debtor-invoices-summary")).not.toBeInTheDocument();
    expect(document.body.textContent).not.toContain("RM 0.00");
    net.fail.clear();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await screen.findByText("ARI-20260915-4821");
  });

  it("New invoice opens the form with Issue invoice and Save draft, and nothing to cancel", async () => {
    show("/finance/other-debtors");
    fireEvent.click(await screen.findByRole("button", { name: "New invoice" }));
    expect(await screen.findByTestId("other-debtor-invoice-form")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Issue invoice" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save draft" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Cancel invoice" })).not.toBeInTheDocument();
  });

  it("refuses an empty new invoice before any round trip", async () => {
    show("/finance/other-debtors?invoice=new");
    fireEvent.click(await screen.findByRole("button", { name: "Save draft" }));
    expect(await screen.findByText("Choose who the invoice is for.")).toBeInTheDocument();
    expect(screen.getByText("An invoice needs at least one line.")).toBeInTheDocument();
    expect(sent("POST /invoices")).toHaveLength(0);
  });
});

describe("Other debtors — one invoice", () => {
  it("a draft saves its lines as typed", async () => {
    net.routes[`PUT /invoices/${I_DRAFT}`] = { id: I_DRAFT };
    show(`/finance/other-debtors?invoice=${I_DRAFT}`);
    await screen.findByTestId("other-debtor-invoice-form");
    await waitFor(() => expect(screen.getByTestId("invoice-total")).toHaveTextContent("Total RM 1,500.00"));
    fireEvent.click(screen.getByRole("button", { name: "Save draft" }));
    await waitFor(() => expect(sent(`PUT /invoices/${I_DRAFT}`)).toHaveLength(1));
    expect(sent(`PUT /invoices/${I_DRAFT}`)[0].body).toMatchObject({
      party_id: P1,
      invoice_date: "2026-09-20",
      issue: false,
      lines: [
        { account_code: "6200", description: "Office rent September", amount: 1400, department_type: "OFFICE", department_id: null },
        { account_code: "4900", description: "Service charge", amount: 100, department_type: "SUBSCRIPTION", department_id: null },
      ],
    });
  });

  it("Issue invoice asks first, names the amount and the party, then issues", async () => {
    net.routes[`PUT /invoices/${I_DRAFT}`] = { id: I_DRAFT };
    show(`/finance/other-debtors?invoice=${I_DRAFT}`);
    await screen.findByTestId("other-debtor-invoice-form");
    await screen.findByText("Example Sister Sdn Bhd");
    fireEvent.click(screen.getByRole("button", { name: "Issue invoice" }));
    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent("Issue this invoice?");
    expect(dialog).toHaveTextContent("RM 1,500.00 to Example Sister Sdn Bhd");
    expect(sent(`PUT /invoices/${I_DRAFT}`)).toHaveLength(0);
    fireEvent.click(within(dialog).getByRole("button", { name: "Issue invoice" }));
    await waitFor(() => expect(sent(`PUT /invoices/${I_DRAFT}`)).toHaveLength(1));
    expect(sent(`PUT /invoices/${I_DRAFT}`)[0].body).toMatchObject({ issue: true });
  });

  it("an issued invoice that still owes offers Record receipt, prefilled from the invoice", async () => {
    show(`/finance/other-debtors?invoice=${I_OPEN}`);
    expect(await screen.findByTestId("invoice-outstanding")).toHaveTextContent("RM 900.00");
    expect(screen.getByText("Issued")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Cancel invoice" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Record receipt" }));
    expect(await screen.findByTestId("where")).toHaveTextContent(
      `/finance/other-receipts?receipt=new&party=${P1}&invoice=${I_OPEN}`,
    );
  });

  it("only the finance approver sees Cancel invoice, and it will not go without a reason", async () => {
    net.routes["GET /me"] = { mayCancel: true };
    net.routes[`POST /invoices/${I_OPEN}/cancel`] = { id: I_OPEN };
    show(`/finance/other-debtors?invoice=${I_OPEN}`);
    fireEvent.click(await screen.findByRole("button", { name: "Cancel invoice" }));
    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent("Money has been received against it. Cancel those receipts first.");
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel invoice" }));
    expect(await within(dialog).findByText("Type the reason.")).toBeInTheDocument();
    expect(sent(`POST /invoices/${I_OPEN}/cancel`)).toHaveLength(0);
    fireEvent.change(within(dialog).getByLabelText(/Reason/), { target: { value: "Billed the wrong month" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel invoice" }));
    await waitFor(() => expect(sent(`POST /invoices/${I_OPEN}/cancel`)).toHaveLength(1));
    expect(sent(`POST /invoices/${I_OPEN}/cancel`)[0].body).toEqual({ reason: "Billed the wrong month" });
  });
});

describe("Other debtors — the party Register", () => {
  it("lists every party with what it owes, and New party adds one", async () => {
    net.routes["POST /parties"] = { id: "33333333-3333-4333-8333-333333333333" };
    show("/finance/other-debtors?view=parties");
    await screen.findByText("Example Director");
    expect(screen.getByText("Example Sister Sdn Bhd")).toBeInTheDocument();
    expect(screen.getByText("No number on file")).toBeInTheDocument();
    expect(screen.getByTestId("other-debtor-parties-summary")).toHaveTextContent("2 parties · RM 900.00 outstanding");
    fireEvent.click(screen.getByRole("button", { name: "New party" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText(/Name/), { target: { value: "Example Landlord Sdn Bhd" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save party" }));
    await waitFor(() => expect(sent("POST /parties")).toHaveLength(1));
    expect(sent("POST /parties")[0].body).toMatchObject({ name: "Example Landlord Sdn Bhd", kind: "company" });
  });
});

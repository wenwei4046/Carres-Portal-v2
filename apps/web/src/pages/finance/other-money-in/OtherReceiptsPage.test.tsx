import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import OtherReceiptsPage from "./OtherReceiptsPage";
import { ACCOUNTS, DEPARTMENTS, I_OPEN, MONEY_ACCOUNTS, INVOICES, P1, PARTIES, R1, RECEIPT_DETAIL, RECEIPTS } from "./fixtures.test-data";

const net = vi.hoisted(() => ({
  routes: {} as Record<string, unknown>,
  failOnce: new Map<string, string>(),
  fail: new Set<string>(),
  calls: [] as Array<{ key: string; body: unknown }>,
}));
vi.mock("@/lib/api", () => ({
  apiFetch: vi.fn(async (path: string, init?: RequestInit) => {
    const key = `${init?.method ?? "GET"} ${path.replace("/api/finance/other-money-in", "")}`;
    net.calls.push({ key, body: init?.body ? JSON.parse(String(init.body)) : undefined });
    const once = net.failOnce.get(key);
    if (once) {
      net.failOnce.delete(key);
      throw new Error(once);
    }
    if (net.fail.has(key)) throw new Error("The server refused.");
    if (key in net.routes) return net.routes[key];
    throw new Error(`unmocked ${key}`);
  }),
}));
vi.mock("@/pages/operation/components/GlobalTopBar", () => ({ TopBarIcons: () => null }));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

const NEW_ID = "cccccccc-0000-4000-8000-000000000001";

beforeEach(() => {
  net.routes = {
    "GET /receipts": RECEIPTS,
    "GET /invoices": INVOICES,
    "GET /parties": PARTIES,
    "GET /accounts": ACCOUNTS,
    "GET /api/finance/ledger/departments": DEPARTMENTS,
    "GET /api/finance/ledger/money-accounts": MONEY_ACCOUNTS,
    "GET /me": { mayCancel: false },
    [`GET /receipts/${R1}`]: RECEIPT_DETAIL,
    "POST /receipts": { id: NEW_ID },
    [`GET /receipts/${NEW_ID}`]: RECEIPT_DETAIL,
  };
  net.fail = new Set();
  net.failOnce = new Map();
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
          <Route path="/finance/other-receipts" element={<><OtherReceiptsPage /><Where /></>} />
          <Route path="*" element={<Where />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const sent = (key: string) => net.calls.filter((c) => c.key === key);

async function choose(label: RegExp, option: string) {
  fireEvent.keyDown(screen.getByRole("combobox", { name: label }), { key: "Enter" });
  fireEvent.click(await screen.findByRole("option", { name: option }));
}

describe("Other receipts — the Register", () => {
  it("shows receipts in words and leaves cancelled money out of the received total", async () => {
    show("/finance/other-receipts");
    await screen.findByText("RV-20260916-3390");
    expect(screen.getByTestId("other-receipts-destination-header")).toHaveTextContent("Other receipts");
    expect(screen.getAllByText("Recorded").length).toBe(2);
    expect(screen.getByText("Cancelled")).toBeInTheDocument();
    expect(screen.getAllByText("1120 · Bank — current account").length).toBe(3);
    expect(screen.getByTestId("other-receipts-summary")).toHaveTextContent("3 receipts · RM 10,600.00 received");
    expect(document.body.textContent).not.toMatch(/Balance|Posted|Voided/);
    for (const raw of ["posted", "voided"]) expect(screen.queryByText(raw)).not.toBeInTheDocument();
  });

  it("says a failed read failed, and never prints RM 0.00 in its place", async () => {
    net.fail.add("GET /receipts");
    show("/finance/other-receipts");
    expect(await screen.findByRole("alert")).toHaveTextContent("Other receipts could not be loaded.");
    expect(document.body.textContent).not.toContain("RM 0.00");
  });

  it("New receipt opens the form", async () => {
    show("/finance/other-receipts");
    fireEvent.click(await screen.findByRole("button", { name: "New receipt" }));
    expect(await screen.findByTestId("other-receipt-form")).toBeInTheDocument();
    expect(screen.getByTestId("where")).toHaveTextContent("/finance/other-receipts?receipt=new");
  });
});

describe("Other receipts — the form", () => {
  it("Received into offers cash, banks and holding accounts in use, from the one list (0512)", async () => {
    show("/finance/other-receipts?receipt=new");
    await screen.findByTestId("other-receipt-form");
    await waitFor(() => expect(sent("GET /api/finance/ledger/money-accounts")).toHaveLength(1));
    fireEvent.keyDown(screen.getByRole("combobox", { name: /Received into/ }), { key: "Enter" });
    const offered = (await screen.findAllByRole("option")).map((o) => o.textContent);
    expect(offered).toEqual(["1110 · Cash on hand", "1120 · Bank — current account", "1131 · GHL"]);
  });

  it("from an invoice: fills what it owes, asks first, then records against it", async () => {
    show(`/finance/other-receipts?receipt=new&party=${P1}&invoice=${I_OPEN}`);
    const amount = await screen.findByLabelText("Received for ARI-20260915-4821 (RM)");
    await waitFor(() => expect(amount).toHaveValue("900.00"));
    expect(screen.getByTestId("receipt-total")).toHaveTextContent("Total received RM 900.00");
    await choose(/Received into/, "1120 · Bank — current account");
    fireEvent.click(screen.getByRole("button", { name: "Record receipt" }));
    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent("RM 900.00 received into 1120 · Bank — current account");
    expect(sent("POST /receipts")).toHaveLength(0);
    fireEvent.click(within(dialog).getByRole("button", { name: "Record receipt" }));
    await waitFor(() => expect(sent("POST /receipts")).toHaveLength(1));
    expect(sent("POST /receipts")[0].body).toMatchObject({
      party_id: P1,
      money_account_code: "1120",
      allocations: [{ invoice_id: I_OPEN, amount: 900 }],
      lines: [],
    });
    expect(await screen.findByTestId("where")).toHaveTextContent(`?receipt=${NEW_ID}`);
  });

  it("refuses more than the invoice still owes before any round trip", async () => {
    show(`/finance/other-receipts?receipt=new&party=${P1}&invoice=${I_OPEN}`);
    const amount = await screen.findByLabelText("Received for ARI-20260915-4821 (RM)");
    await waitFor(() => expect(amount).toHaveValue("900.00"));
    fireEvent.change(amount, { target: { value: "900.01" } });
    await choose(/Received into/, "1120 · Bank — current account");
    fireEvent.click(screen.getByRole("button", { name: "Record receipt" }));
    expect(await screen.findByText("More than the RM 900.00 outstanding on this invoice.")).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("a loan in with no invoice: needs who paid, then records one line", async () => {
    show("/finance/other-receipts?receipt=new");
    await screen.findByTestId("other-receipt-form");
    await waitFor(() => expect(sent("GET /accounts")).toHaveLength(1));
    await choose(/Received into/, "1120 · Bank — current account");
    await choose(/^Account/, "2360 · Loans received");
    fireEvent.change(screen.getByLabelText("Amount (RM)"), { target: { value: "10,000" } });
    await choose(/^Department/, "Office");
    fireEvent.click(screen.getByRole("button", { name: "Record receipt" }));
    expect(await screen.findByText("Type who paid, or choose a party.")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/Payer name/), { target: { value: "Example Lender Bhd" } });
    fireEvent.click(screen.getByRole("button", { name: "Record receipt" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Record receipt" }));
    await waitFor(() => expect(sent("POST /receipts")).toHaveLength(1));
    expect(sent("POST /receipts")[0].body).toMatchObject({
      party_id: null,
      payer_name: "Example Lender Bhd",
      money_account_code: "1120",
      lines: [{ account_code: "2360", amount: 10000, description: null, department_type: "OFFICE", department_id: null }],
      allocations: [],
    });
  });

  it("a refused press keeps its idempotency key, so a second press can only find the first receipt", async () => {
    net.failOnce.set("POST /receipts", "The receipt date is before the ledger go-live.");
    show(`/finance/other-receipts?receipt=new&party=${P1}&invoice=${I_OPEN}`);
    const amount = await screen.findByLabelText("Received for ARI-20260915-4821 (RM)");
    await waitFor(() => expect(amount).toHaveValue("900.00"));
    await choose(/Received into/, "1120 · Bank — current account");
    fireEvent.click(screen.getByRole("button", { name: "Record receipt" }));
    fireEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Record receipt" }));
    expect(await screen.findByTestId("receipt-refusal")).toHaveTextContent("The receipt date is before the ledger go-live.");
    fireEvent.click(screen.getByRole("button", { name: "Record receipt" }));
    fireEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Record receipt" }));
    await waitFor(() => expect(sent("POST /receipts")).toHaveLength(2));
    const [first, second] = sent("POST /receipts").map((c) => (c.body as { idempotency_key: string }).idempotency_key);
    expect(first).toMatch(/^[0-9a-f-]{36}$/);
    expect(second).toBe(first);
  });
});

describe("Other receipts — one receipt", () => {
  it("shows what the money was for; only the approver may cancel it, with a reason", async () => {
    show(`/finance/other-receipts?receipt=${R1}`);
    expect(await screen.findByTestId("receipt-facts")).toHaveTextContent("Example Sister Sdn Bhd");
    expect(screen.getByTestId("receipt-what")).toHaveTextContent("ARI-20260915-4821");
    expect(screen.getByText("Recorded")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Cancel receipt" })).not.toBeInTheDocument();
  });

  it("the approver cancels a receipt with a reason", async () => {
    net.routes["GET /me"] = { mayCancel: true };
    net.routes[`POST /receipts/${R1}/void`] = { id: R1 };
    show(`/finance/other-receipts?receipt=${R1}`);
    fireEvent.click(await screen.findByRole("button", { name: "Cancel receipt" }));
    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent("the invoices it paid owe that money again");
    fireEvent.change(within(dialog).getByLabelText(/Reason/), { target: { value: "Bank returned the transfer" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel receipt" }));
    await waitFor(() => expect(sent(`POST /receipts/${R1}/void`)).toHaveLength(1));
    expect(sent(`POST /receipts/${R1}/void`)[0].body).toEqual({ reason: "Bank returned the transfer" });
  });
});
